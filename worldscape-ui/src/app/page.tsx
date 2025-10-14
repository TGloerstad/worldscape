"use client";
import { useEffect, useMemo, useState } from "react";
import dynamic from 'next/dynamic'
import 'leaflet/dist/leaflet.css'
import { RiskMitigationModal } from './widgets/RiskMitigation'
import { RiskDashboard } from './widgets/RiskDashboard'
import { saveAssessment, type RiskAssessment } from './utils/riskStorage'

type OutputFile = { path: string; isdir: boolean; size: number | null; mtime: string }

enum Tab { FTMapping = 'FTMapping', Outputs = 'Outputs', IsoscapeBuild = 'IsoscapeBuild', WorldMapping = 'WorldMapping', Interactive = 'Interactive', Dashboard = 'Dashboard', RiskScore = 'RiskScore' }

function first<T>(v: any, fallback: T): T {
  if (Array.isArray(v)) return (v[0] ?? fallback) as T
  return (v ?? fallback) as T
}

function groupByTop(files: any[]): Record<string, OutputFile[]> {
  const groups: Record<string, OutputFile[]> = {}
  if (!Array.isArray(files)) return groups
  for (const f of files) {
    const pathStr = typeof f === 'string'
      ? f
      : (typeof f?.path === 'string' ? f.path : first<string>(f?.path, ''))
    if (!pathStr) continue
    const top = (pathStr.split('/')[0] as string) || ''
    if (!groups[top]) groups[top] = []
    groups[top].push({
      path: pathStr,
      isdir: Boolean(first<boolean>(f?.isdir, false)),
      size: typeof first<number | null>(f?.size, null) === 'number' ? first<number>(f?.size, 0) : null,
      mtime: String(first<string>(f?.mtime, ''))
    })
  }
  return groups
}

function isTiff(path: string) {
  return path.toLowerCase().endsWith('.tif') || path.toLowerCase().endsWith('.tiff')
}

function isPng(path: string) {
  return path.toLowerCase().endsWith('.png')
}

// Minimal IsoscapeBuild UI pieces
type IsoFile = { path: string; isdir: boolean; size: number | null; mtime: string }

function RiskScoreWizard() {
  const [step, setStep] = useState<number>(0)
  const [productId, setProductId] = useState<string>('')
  const [productType, setProductType] = useState<string>('')
  const [productDescription, setProductDescription] = useState<string>('')
  const [answers, setAnswers] = useState<Record<string, 'yes'|'no'|'unknown'>>({})
  const [declaredCountry, setDeclaredCountry] = useState<string>('')
  const [countrySearch, setCountrySearch] = useState<string>('')
  const [declaredRegion, setDeclaredRegion] = useState<string>('')
  const [regionSearch, setRegionSearch] = useState<string>('')
  const [calculating, setCalculating] = useState<boolean>(false)
  const [result, setResult] = useState<any>(null)
  const [allCountries, setAllCountries] = useState<string[]>([])
  const [allRegions, setAllRegions] = useState<string[]>([])
  const [declaredProfile, setDeclaredProfile] = useState<any>(null)
  const [loadingProfile, setLoadingProfile] = useState<boolean>(false)
  
  // d18O input option state
  const [inputMethod, setInputMethod] = useState<'country' | 'd18o'>('country')
  const [d18oMean, setD18oMean] = useState<string>('')
  const [d18oMin, setD18oMin] = useState<string>('')
  const [d18oMax, setD18oMax] = useState<string>('')
  const [d18oSd, setD18oSd] = useState<string>('')
  const [showMitigation, setShowMitigation] = useState<boolean>(false)
  const [currentAssessmentId, setCurrentAssessmentId] = useState<string | null>(null)
  
  // Fetch all countries on mount
  useEffect(() => {
    fetch('/api/worldmapping?path=' + encodeURIComponent('/worldmapping/list_countries'))
      .then(r => r.json())
      .then(d => { if (Array.isArray(d?.countries)) setAllCountries(d.countries) })
      .catch(() => {})
  }, [])
  
  // Fetch regions when country changes
  useEffect(() => {
    if (declaredCountry) {
      fetch('/api/worldmapping?path=' + encodeURIComponent(`/worldmapping/list_regions?country=${encodeURIComponent(declaredCountry)}`))
        .then(r => r.json())
        .then(d => { if (Array.isArray(d?.regions)) setAllRegions(d.regions) })
        .catch(() => {})
    } else {
      setAllRegions([])
      setDeclaredProfile(null)
    }
  }, [declaredCountry])
  
  // Fetch isotope profile when country/region changes
  useEffect(() => {
    if (inputMethod === 'country' && declaredCountry) {
      setLoadingProfile(true)
      const regionParam = declaredRegion ? `&region=${encodeURIComponent(declaredRegion)}` : ''
      fetch('/api/worldmapping?path=' + encodeURIComponent(`/risk/region_profile?country=${encodeURIComponent(declaredCountry)}${regionParam}`))
        .then(r => r.json())
        .then(d => {
          if (d.error) {
            setDeclaredProfile({ error: d.error })
          } else {
            setDeclaredProfile(d)
          }
        })
        .catch(() => setDeclaredProfile(null))
        .finally(() => setLoadingProfile(false))
    } else if (inputMethod === 'country' && !declaredCountry) {
      setDeclaredProfile(null)
    }
  }, [declaredCountry, declaredRegion, inputMethod])

  // Create d18O profile when using direct input
  useEffect(() => {
    if (inputMethod === 'd18o' && d18oMean && d18oMin && d18oMax) {
      const mean = parseFloat(d18oMean)
      const min = parseFloat(d18oMin)
      const max = parseFloat(d18oMax)
      const sd = d18oSd ? parseFloat(d18oSd) : (max - min) / 4 // Estimate SD if not provided
      
      if (!isNaN(mean) && !isNaN(min) && !isNaN(max) && min <= mean && mean <= max) {
        const profile = {
          mean: [mean],
          min: [min],
          max: [max],
          sd: [isNaN(sd) ? (max - min) / 4 : sd],
          median: [mean], // Use mean as median approximation
          q25: [mean - (isNaN(sd) ? (max - min) / 8 : sd/2)],
          q75: [mean + (isNaN(sd) ? (max - min) / 8 : sd/2)],
          n_pixels: [1], // Placeholder
          spam_filtered: [false]
        }
        setDeclaredProfile(profile)
      } else {
        setDeclaredProfile(null)
      }
    } else if (inputMethod === 'd18o') {
      setDeclaredProfile(null)
    }
  }, [inputMethod, d18oMean, d18oMin, d18oMax, d18oSd])

  const questions = [
    { id: 'q1', text: 'Do you source cotton DIRECTLY from the gin/farm (without intermediaries)?', points: { yes: -10, no: 15, unknown: 20 } },
    { id: 'q2', text: 'Do you have COMPLETE traceability documentation (farm records, gin receipts, transport/customs logs)?', points: { yes: -15, no: 25, unknown: 30 } },
    { id: 'q3', text: 'Has this cotton been certified by INDEPENDENT third-party auditors (BCI, Fairtrade, USDA Organic, GOTS)?', points: { yes: -20, no: 10, unknown: 15 } },
    { id: 'q4', text: 'Have you conducted isotope or DNA testing on PREVIOUS shipments from this supplier with consistent results?', points: { yes: -10, no: 5, unknown: 5 } }
  ]

  const geoRisk: Record<string, number> = {
    'China': 100, 'Uzbekistan': 60, 'Tajikistan': 60, 'Kyrgyzstan': 60,
    'Pakistan': 30, 'India': 30, 'Turkey': 20, 'Greece': 20,
    'USA': 0, 'Brazil': 0, 'Australia': 0, 'Argentina': 0
  }

  const topCountries = ['USA', 'China', 'India', 'Brazil', 'Pakistan', 'Uzbekistan', 'Turkey', 'Turkmenistan', 'Greece', 'Tajikistan', 'Australia', 'Kyrgyzstan', 'Argentina', 'Egypt', 'Mexico']
  
  const filteredCountries = (allCountries.length > 0 ? allCountries : topCountries).filter(c => 
    c.toLowerCase().includes(countrySearch.toLowerCase())
  ).slice(0, 50)
  
  const filteredRegions = allRegions.filter(r => 
    r.toLowerCase().includes(regionSearch.toLowerCase())
  ).slice(0, 50)

  async function calculateRisk() {
    setCalculating(true)
    try {
      // Calculate supply chain score
      let scScore = 0
      for (const q of questions) {
        const ans = answers[q.id] || 'unknown'
        scScore += q.points[ans]
      }

      // Geographic score
      const geoScore = geoRisk[declaredCountry] || 0

      // Fetch high-risk region profiles
      const highRiskRegions = [
        { name: 'Xinjiang', country: 'Xinjiang Uygur Autonomous Region', region: '' },
        { name: 'Uzbekistan', country: 'Uzbekistan', region: '' },
        { name: 'Tajikistan', country: 'Tajikistan', region: '' },
        { name: 'Kyrgyzstan', country: 'Kyrgyzstan', region: '' }
      ]
      
      const profilePromises = highRiskRegions.map(async hr => {
        const res = await fetch('/api/worldmapping?path=' + encodeURIComponent(`/risk/region_profile?country=${encodeURIComponent(hr.country)}`))
        const data = await res.json()
        return { ...hr, profile: data.error ? null : data }
      })
      
      const hrProfiles = await Promise.all(profilePromises)

      // Calculate isotope overlap risk
      let isoScore = 0
      let overlapAnalysis = null
      
      if (declaredProfile && !declaredProfile.error) {
        const declMean = declaredProfile.mean?.[0] || 0
        const declMin = declaredProfile.min?.[0] || 0
        const declMax = declaredProfile.max?.[0] || 0
        const declSd = declaredProfile.sd?.[0] || 1
        
        let maxOverlap = 0
        let minDistance = Infinity
        let closestRegion = ''
        let closestOverlap = 0
        
        for (const hr of hrProfiles) {
          if (!hr.profile) continue
          const hrMean = hr.profile.mean?.[0] || 0
          const hrMin = hr.profile.min?.[0] || 0
          const hrMax = hr.profile.max?.[0] || 0
          
          // Calculate range overlap as % of declared range
          const overlapStart = Math.max(declMin, hrMin)
          const overlapEnd = Math.min(declMax, hrMax)
          let overlapPct = 0
          if (overlapEnd > overlapStart) {
            const overlapRange = overlapEnd - overlapStart
            const declRange = declMax - declMin || 1
            overlapPct = (overlapRange / declRange) * 100
            maxOverlap = Math.max(maxOverlap, overlapPct)
          }
          
          // Calculate mean distance in standard deviations
          const distance = Math.abs(declMean - hrMean) / declSd
          if (distance < minDistance) {
            minDistance = distance
            closestRegion = hr.name
            closestOverlap = overlapPct
          }
        }
        
        // Risk scoring based on max overlap with any high-risk region
        if (maxOverlap > 80) isoScore += 60
        else if (maxOverlap > 50) isoScore += 30
        else if (maxOverlap > 20) isoScore += 15
        
        // Risk scoring based on distance
        if (minDistance < 0.5) isoScore += 40
        else if (minDistance < 1.0) isoScore += 20
        else if (minDistance > 2.0) isoScore -= 10
        
        overlapAnalysis = {
          declaredProfile: { mean: declMean, min: declMin, max: declMax, sd: declSd },
          overlapPercent: maxOverlap,
          closestHighRisk: closestRegion,
          closestOverlapPercent: closestOverlap,
          distanceSD: minDistance,
          separable: minDistance > 2.0,
          highRiskProfiles: hrProfiles.filter(hr => hr.profile).map(hr => ({
            name: hr.name,
            mean: hr.profile.mean?.[0],
            min: hr.profile.min?.[0],
            max: hr.profile.max?.[0]
          }))
        }
      }

      const total = scScore + geoScore + isoScore
      const tier = total <= 30 ? 'low' : total <= 60 ? 'medium' : total <= 100 ? 'high' : 'critical'

      const resultData = {
        total,
        tier,
        breakdown: { supplyChain: scScore, geographic: geoScore, isotope: isoScore },
        overlapAnalysis,
        declaredProfile: declaredProfile
      }

      setResult(resultData)

      // Auto-save assessment
      try {
        const assessmentId = crypto.randomUUID()
        const assessment: RiskAssessment = {
          id: assessmentId,
          timestamp: Date.now(),
          productId: productId.trim(),
          productType,
          productDescription: productDescription.trim() || undefined,
          inputMethod,
          declaredCountry: inputMethod === 'country' ? declaredCountry : '',
          declaredRegion: inputMethod === 'country' ? declaredRegion : '',
          d18oMean: inputMethod === 'd18o' ? parseFloat(d18oMean) || undefined : undefined,
          d18oMin: inputMethod === 'd18o' ? parseFloat(d18oMin) || undefined : undefined,
          d18oMax: inputMethod === 'd18o' ? parseFloat(d18oMax) || undefined : undefined,
          d18oSd: inputMethod === 'd18o' && d18oSd ? parseFloat(d18oSd) || undefined : undefined,
          declaredProfile,
          answers,
          supplyChainScore: scScore,
          geographicRisk: geoScore,
          isotopicOverlap: overlapAnalysis?.overlapPercent || 0,
          overallRisk: total,
          riskLevel: tier === 'low' ? 'Low' : tier === 'medium' ? 'Medium' : tier === 'high' ? 'High' : 'Critical',
          recommendations: [],
          overlapAnalysis: overlapAnalysis || undefined
        }
        saveAssessment(assessment)
        setCurrentAssessmentId(assessmentId)
        console.log('✓ Assessment saved to Dashboard')
      } catch (saveError) {
        console.error('Failed to save assessment:', saveError)
      }

    } catch (e) {
      console.error('Risk calculation error:', e)
    }
    setCalculating(false)
  }

  return (
    <div style={{ maxWidth: 900, margin: '0 auto' }}>
      <h2 style={{ marginBottom: 16 }}>UFLPA Compliance Risk Assessment</h2>
      
      {/* Progress indicator */}
      {step > 0 && (
        <div style={{ display: 'flex', gap: 8, marginBottom: 24, alignItems: 'center' }}>
          {[1, 2, 3].map(s => (
            <div key={s} style={{ flex: 1, height: 4, background: step >= s ? '#6c9' : '#333', borderRadius: 2, transition: 'background 0.3s' }} />
          ))}
          <span style={{ fontSize: 13, color: '#999', marginLeft: 8 }}>Step {step}/3</span>
        </div>
      )}

      {step === 0 && (
        <div style={{ background: '#1a1a1a', padding: 24, borderRadius: 8, border: '1px solid #333' }}>
          <h3 style={{ marginTop: 0, marginBottom: 20, color: '#fff' }}>Product Identification</h3>
          <p style={{ color: '#ddd', marginBottom: 24 }}>Provide details about the product being assessed. This helps track compliance across shipments.</p>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
            <div>
              <label style={{ display: 'block', color: '#fff', marginBottom: 8, fontWeight: 600 }}>
                Product ID *
              </label>
              <input
                type="text"
                value={productId}
                onChange={(e) => setProductId(e.target.value)}
                maxLength={50}
                placeholder="e.g., SKU-12345, PO-2025-001, Batch-A42"
                style={{ width: '100%', padding: 12, background: '#0a0a0a', border: '1px solid #444', borderRadius: 6, color: '#fff', fontSize: 15 }}
              />
              <p style={{ margin: '4px 0 0 0', fontSize: 13, color: '#888' }}>Unique identifier for this product/shipment</p>
            </div>

            <div>
              <label style={{ display: 'block', color: '#fff', marginBottom: 8, fontWeight: 600 }}>
                Product Type *
              </label>
              <select
                value={productType}
                onChange={(e) => setProductType(e.target.value)}
                style={{ width: '100%', padding: 12, background: '#0a0a0a', border: '1px solid #444', borderRadius: 6, color: productType ? '#fff' : '#888', fontSize: 15 }}
              >
                <option value="" disabled>Select product type...</option>
                <option value="T-Shirts">T-Shirts</option>
                <option value="Dress Shirts">Dress Shirts</option>
                <option value="Polo Shirts">Polo Shirts</option>
                <option value="Shorts">Shorts</option>
                <option value="Pants">Pants</option>
                <option value="Dresses">Dresses</option>
                <option value="Other Apparel">Other Apparel</option>
              </select>
            </div>

            <div>
              <label style={{ display: 'block', color: '#fff', marginBottom: 8, fontWeight: 600 }}>
                Product Description <span style={{ fontWeight: 400, color: '#888' }}>(Optional)</span>
              </label>
              <textarea
                value={productDescription}
                onChange={(e) => setProductDescription(e.target.value)}
                maxLength={200}
                placeholder="e.g., Men's organic cotton crew neck, Navy/White/Gray"
                rows={3}
                style={{ width: '100%', padding: 12, background: '#0a0a0a', border: '1px solid #444', borderRadius: 6, color: '#fff', fontSize: 15, resize: 'vertical' }}
              />
              <p style={{ margin: '4px 0 0 0', fontSize: 13, color: '#888' }}>
                Additional details about the product ({productDescription.length}/200 characters)
              </p>
            </div>
          </div>

          <button
            onClick={() => {
              if (!productId.trim()) {
                alert('Please enter a Product ID')
                return
              }
              if (!productType) {
                alert('Please select a Product Type')
                return
              }
              setStep(1)
            }}
            style={{ marginTop: 24, padding: '12px 32px', background: '#6c9', color: '#000', border: 'none', borderRadius: 6, cursor: 'pointer', fontWeight: 700, fontSize: 16, width: '100%' }}
          >
            Begin Assessment →
          </button>
        </div>
      )}

      {step === 1 && (
        <div style={{ background: '#1a1a1a', padding: 24, borderRadius: 8, border: '1px solid #333' }}>
          <h3 style={{ marginTop: 0, marginBottom: 20 }}>Supply Chain Transparency</h3>
          {questions.map((q, i) => (
            <div key={q.id} style={{ marginBottom: 20, padding: 16, background: '#222', borderRadius: 6 }}>
              <div style={{ marginBottom: 10, fontWeight: 500, color: '#fff' }}>{i + 1}. {q.text}</div>
              <div style={{ display: 'flex', gap: 12 }}>
                {(['yes', 'no', 'unknown'] as const).map(opt => (
                  <label key={opt} style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer', padding: '8px 16px', background: answers[q.id] === opt ? '#6c9' : '#333', color: answers[q.id] === opt ? '#000' : '#ddd', borderRadius: 4, fontWeight: answers[q.id] === opt ? 600 : 400, transition: 'all 0.2s' }}>
                    <input type="radio" name={q.id} checked={answers[q.id] === opt} onChange={() => setAnswers({...answers, [q.id]: opt})} style={{ accentColor: '#6c9' }} />
                    {opt.charAt(0).toUpperCase() + opt.slice(1)}
                  </label>
                ))}
              </div>
            </div>
          ))}
          <button onClick={() => setStep(2)} style={{ padding: '12px 24px', background: '#6c9', color: '#000', border: 'none', borderRadius: 6, cursor: 'pointer', fontWeight: 600, fontSize: 14 }}>Next →</button>
        </div>
      )}

      {step === 2 && (
        <div style={{ background: '#1a1a1a', padding: 24, borderRadius: 8, border: '1px solid #333' }}>
          <h3 style={{ marginTop: 0, marginBottom: 20 }}>Geographic Origin & Isotope Data</h3>
          
          {/* Input Method Selection */}
          <div style={{ marginBottom: 24 }}>
            <label style={{ display: 'block', marginBottom: 12, fontWeight: 500, color: '#fff' }}>Input Method <span style={{ color: '#f66' }}>*</span></label>
            <div style={{ display: 'flex', gap: 16 }}>
              <label style={{ display: 'flex', alignItems: 'center', cursor: 'pointer', padding: '12px 16px', background: inputMethod === 'country' ? '#2a3a2a' : '#222', border: `2px solid ${inputMethod === 'country' ? '#6c9' : '#444'}`, borderRadius: 8, flex: 1 }}>
                <input 
                  type="radio" 
                  value="country" 
                  checked={inputMethod === 'country'} 
                  onChange={(e) => setInputMethod(e.target.value as 'country' | 'd18o')}
                  style={{ marginRight: 8 }}
                />
                <div>
                  <div style={{ color: '#fff', fontWeight: 600, marginBottom: 4 }}>🌍 Country of Origin</div>
                  <div style={{ color: '#888', fontSize: 12 }}>Select from our geographic database</div>
                </div>
              </label>
              <label style={{ display: 'flex', alignItems: 'center', cursor: 'pointer', padding: '12px 16px', background: inputMethod === 'd18o' ? '#2a3a2a' : '#222', border: `2px solid ${inputMethod === 'd18o' ? '#6c9' : '#444'}`, borderRadius: 8, flex: 1 }}>
                <input 
                  type="radio" 
                  value="d18o" 
                  checked={inputMethod === 'd18o'} 
                  onChange={(e) => setInputMethod(e.target.value as 'country' | 'd18o')}
                  style={{ marginRight: 8 }}
                />
                <div>
                  <div style={{ color: '#fff', fontWeight: 600, marginBottom: 4 }}>🧪 Direct δ18O Values</div>
                  <div style={{ color: '#888', fontSize: 12 }}>Enter known isotope signature</div>
                </div>
              </label>
            </div>
          </div>

          {/* Country Input Method */}
          {inputMethod === 'country' && (
            <>
              <div style={{ marginBottom: 20 }}>
                <label style={{ display: 'block', marginBottom: 8, fontWeight: 500, color: '#fff' }}>Declared Country of Origin <span style={{ color: '#f66' }}>*</span></label>
                <input 
                  type="text" 
                  value={countrySearch || declaredCountry} 
                  onChange={e => { setCountrySearch(e.target.value); setDeclaredCountry('') }}
                  onFocus={() => setCountrySearch(declaredCountry)}
                  placeholder="Type to search countries..."
                  list="country-list"
                  style={{ width: '100%', padding: '10px 14px', borderRadius: 6, border: '1px solid #444', background: '#222', color: '#ddd', fontSize: 14 }}
                />
                <datalist id="country-list">
                  {filteredCountries.map(c => <option key={c} value={c} />)}
                </datalist>
                {countrySearch && !declaredCountry && filteredCountries.length > 0 && (
                  <div style={{ marginTop: 4, maxHeight: 200, overflow: 'auto', background: '#222', border: '1px solid #444', borderRadius: 6 }}>
                    {filteredCountries.map(c => (
                      <div 
                        key={c} 
                        onClick={() => { setDeclaredCountry(c); setCountrySearch('') }}
                        style={{ padding: '8px 12px', cursor: 'pointer', borderBottom: '1px solid #333', fontSize: 14, color: '#fff' }}
                        onMouseEnter={e => (e.target as HTMLDivElement).style.background = '#333'}
                        onMouseLeave={e => (e.target as HTMLDivElement).style.background = 'transparent'}
                      >
                        {c}
                      </div>
                    ))}
                  </div>
                )}
                {declaredCountry && <div style={{ marginTop: 6, fontSize: 13, color: '#6c9' }}>Selected: {declaredCountry}</div>}
              </div>

              <div style={{ marginBottom: 20 }}>
                <label style={{ display: 'block', marginBottom: 8, fontWeight: 500, color: '#fff' }}>Declared Sub-National Region (Optional)</label>
                <input 
                  type="text" 
                  value={regionSearch || declaredRegion} 
                  onChange={e => { setRegionSearch(e.target.value); setDeclaredRegion('') }}
                  onFocus={() => setRegionSearch(declaredRegion)}
                  placeholder={declaredCountry ? "Type to search regions..." : "Select a country first"}
                  disabled={!declaredCountry}
                  style={{ width: '100%', padding: '10px 14px', borderRadius: 6, border: '1px solid #444', background: declaredCountry ? '#222' : '#1a1a1a', color: declaredCountry ? '#ddd' : '#666', fontSize: 14, cursor: declaredCountry ? 'text' : 'not-allowed' }}
                />
                {regionSearch && !declaredRegion && filteredRegions.length > 0 && (
                  <div style={{ marginTop: 4, maxHeight: 200, overflow: 'auto', background: '#222', border: '1px solid #444', borderRadius: 6 }}>
                    {filteredRegions.map(r => (
                      <div 
                        key={r} 
                        onClick={() => { setDeclaredRegion(r); setRegionSearch('') }}
                        style={{ padding: '8px 12px', cursor: 'pointer', borderBottom: '1px solid #333', fontSize: 14, color: '#fff' }}
                        onMouseEnter={e => (e.target as HTMLDivElement).style.background = '#333'}
                        onMouseLeave={e => (e.target as HTMLDivElement).style.background = 'transparent'}
                      >
                        {r}
                      </div>
                    ))}
                  </div>
                )}
                {declaredRegion && <div style={{ marginTop: 6, fontSize: 13, color: '#6c9' }}>Selected: {declaredRegion}</div>}
                {declaredCountry && allRegions.length === 0 && <div style={{ marginTop: 6, fontSize: 12, color: '#888' }}>Loading regions for {declaredCountry}...</div>}
              </div>
            </>
          )}

          {/* d18O Direct Input Method */}
          {inputMethod === 'd18o' && (
            <div style={{ marginBottom: 20 }}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 16 }}>
                <div>
                  <label style={{ display: 'block', marginBottom: 8, fontWeight: 500, color: '#fff' }}>Mean δ18O (‰) <span style={{ color: '#f66' }}>*</span></label>
                  <input 
                    type="number" 
                    step="0.1"
                    value={d18oMean} 
                    onChange={e => setD18oMean(e.target.value)}
                    placeholder="e.g., 25.5"
                    style={{ width: '100%', padding: '10px 14px', borderRadius: 6, border: '1px solid #444', background: '#222', color: '#ddd', fontSize: 14 }}
                  />
                </div>
                <div>
                  <label style={{ display: 'block', marginBottom: 8, fontWeight: 500, color: '#fff' }}>Std Dev (‰) <span style={{ fontSize: 12, color: '#888' }}>(optional)</span></label>
                  <input 
                    type="number" 
                    step="0.1"
                    value={d18oSd} 
                    onChange={e => setD18oSd(e.target.value)}
                    placeholder="e.g., 2.0"
                    style={{ width: '100%', padding: '10px 14px', borderRadius: 6, border: '1px solid #444', background: '#222', color: '#ddd', fontSize: 14 }}
                  />
                </div>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 8 }}>
                <div>
                  <label style={{ display: 'block', marginBottom: 8, fontWeight: 500, color: '#fff' }}>Min δ18O (‰) <span style={{ color: '#f66' }}>*</span></label>
                  <input 
                    type="number" 
                    step="0.1"
                    value={d18oMin} 
                    onChange={e => setD18oMin(e.target.value)}
                    placeholder="e.g., 20.0"
                    style={{ width: '100%', padding: '10px 14px', borderRadius: 6, border: '1px solid #444', background: '#222', color: '#ddd', fontSize: 14 }}
                  />
                </div>
                <div>
                  <label style={{ display: 'block', marginBottom: 8, fontWeight: 500, color: '#fff' }}>Max δ18O (‰) <span style={{ color: '#f66' }}>*</span></label>
                  <input 
                    type="number" 
                    step="0.1"
                    value={d18oMax} 
                    onChange={e => setD18oMax(e.target.value)}
                    placeholder="e.g., 30.0"
                    style={{ width: '100%', padding: '10px 14px', borderRadius: 6, border: '1px solid #444', background: '#222', color: '#ddd', fontSize: 14 }}
                  />
                </div>
              </div>
              <div style={{ fontSize: 12, color: '#888', marginBottom: 16 }}>
                💡 If Standard Deviation is not provided, it will be estimated as (Max - Min) / 4
              </div>
            </div>
          )}

          {/* Profile Loading Display */}
          {loadingProfile && inputMethod === 'country' && declaredCountry && (
            <div style={{ padding: 16, background: '#222', borderRadius: 6, marginBottom: 20, borderLeft: '3px solid #6c9' }}>
              <div style={{ fontSize: 13, color: '#888' }}>Loading isotope profile for {declaredRegion || declaredCountry}...</div>
            </div>
          )}
          
          {/* Expected isotope profile display */}
          {declaredProfile && !declaredProfile.error && !loadingProfile && (
            <div style={{ padding: 16, background: '#222', borderRadius: 6, marginBottom: 20, borderLeft: '3px solid #6c9' }}>
              <div style={{ fontWeight: 600, marginBottom: 8, color: '#fff' }}>
                Expected δ18O Profile {inputMethod === 'country' ? `for ${declaredRegion || declaredCountry}` : '(Direct Input)'}
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, fontSize: 14 }}>
                <div>
                  <span style={{ color: '#888' }}>Mean:</span> <span style={{ color: '#6c9', fontWeight: 600 }}>{declaredProfile.mean?.[0]?.toFixed(1)} ‰</span>
                </div>
                <div>
                  <span style={{ color: '#888' }}>Std Dev:</span> <span style={{ color: '#ddd' }}>± {declaredProfile.sd?.[0]?.toFixed(1)} ‰</span>
                </div>
                <div>
                  <span style={{ color: '#888' }}>Range:</span> <span style={{ color: '#ddd' }}>{declaredProfile.min?.[0]?.toFixed(1)} - {declaredProfile.max?.[0]?.toFixed(1)} ‰</span>
                </div>
                <div>
                  <span style={{ color: '#888' }}>IQR:</span> <span style={{ color: '#ddd' }}>{declaredProfile.q25?.[0]?.toFixed(1)} - {declaredProfile.q75?.[0]?.toFixed(1)} ‰</span>
                </div>
              </div>
              {inputMethod === 'country' && (
                <div style={{ fontSize: 12, color: '#888', marginTop: 8 }}>Based on {declaredProfile.n_pixels?.[0]} pixels{declaredProfile.spam_filtered?.[0] ? ' in cotton-growing areas (SPAM weighted)' : ''}</div>
              )}
              {inputMethod === 'd18o' && (
                <div style={{ fontSize: 12, color: '#888', marginTop: 8 }}>User-specified isotope signature</div>
              )}
            </div>
          )}
          
          {declaredProfile?.error && !loadingProfile && (
            <div style={{ padding: 12, background: '#3a2a1a', border: '1px solid #f80', borderRadius: 6, marginBottom: 20, color: '#f80', fontSize: 13 }}>
              ⚠ {declaredProfile.error}
            </div>
          )}

          <div style={{ display: 'flex', gap: 12 }}>
            <button onClick={() => setStep(1)} style={{ padding: '12px 24px', background: '#555', color: '#ddd', border: 'none', borderRadius: 6, cursor: 'pointer', fontWeight: 600 }}>← Back</button>
            <button 
              onClick={() => { 
                const isValid = inputMethod === 'country' ? declaredCountry : (d18oMean && d18oMin && d18oMax);
                if (isValid) { 
                  calculateRisk(); 
                  setStep(3); 
                } else {
                  alert(inputMethod === 'country' ? 'Please select a country' : 'Please enter δ18O mean, min, and max values')
                }
              }} 
              disabled={inputMethod === 'country' ? !declaredCountry : !(d18oMean && d18oMin && d18oMax)}
              style={{ 
                padding: '12px 24px', 
                background: (inputMethod === 'country' ? declaredCountry : (d18oMean && d18oMin && d18oMax)) ? '#6c9' : '#444', 
                color: (inputMethod === 'country' ? declaredCountry : (d18oMean && d18oMin && d18oMax)) ? '#000' : '#999', 
                border: 'none', 
                borderRadius: 6, 
                cursor: (inputMethod === 'country' ? declaredCountry : (d18oMean && d18oMin && d18oMax)) ? 'pointer' : 'not-allowed', 
                fontWeight: 600 
              }}
            >
              Calculate Risk →
            </button>
          </div>
        </div>
      )}

      {step === 3 && result && (
        <div style={{ background: '#1a1a1a', padding: 24, borderRadius: 8, border: '1px solid #333' }}>
          <h3 style={{ marginTop: 0, marginBottom: 20, color: '#fff' }}>Risk Assessment Results</h3>
          
          {/* Risk score display */}
          <div style={{ padding: 24, background: result.tier === 'low' ? '#1a3a1a' : result.tier === 'medium' ? '#3a3a1a' : result.tier === 'high' ? '#3a2a1a' : '#3a1a1a', border: `2px solid ${result.tier === 'low' ? '#5a7' : result.tier === 'medium' ? '#da0' : result.tier === 'high' ? '#f80' : '#f33'}`, borderRadius: 8, marginBottom: 24 }}>
            <div style={{ fontSize: 48, fontWeight: 700, textAlign: 'center', color: result.tier === 'low' ? '#5a7' : result.tier === 'medium' ? '#da0' : result.tier === 'high' ? '#f80' : '#f33', marginBottom: 8 }}>{result.total}</div>
            <div style={{ fontSize: 20, fontWeight: 600, textAlign: 'center', textTransform: 'uppercase', letterSpacing: 2, color: '#fff' }}>
              {result.tier === 'low' ? '🟢 LOW RISK' : result.tier === 'medium' ? '🟡 MEDIUM RISK' : result.tier === 'high' ? '🟠 HIGH RISK' : '🔴 CRITICAL RISK'}
            </div>
          </div>

          {/* Breakdown */}
          <div style={{ marginBottom: 24 }}>
            <h4 style={{ marginBottom: 12, color: '#fff' }}>Score Breakdown</h4>
            <div style={{ display: 'grid', gap: 12 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', padding: 12, background: '#222', borderRadius: 6 }}>
                <span style={{ color: '#fff' }}>Supply Chain Transparency</span>
                <span style={{ fontWeight: 600, color: result.breakdown.supplyChain > 0 ? '#f80' : '#5a7' }}>{result.breakdown.supplyChain > 0 ? '+' : ''}{result.breakdown.supplyChain} pts</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', padding: 12, background: '#222', borderRadius: 6 }}>
                <span style={{ color: '#fff' }}>Geographic Claim ({declaredCountry})</span>
                <span style={{ fontWeight: 600, color: result.breakdown.geographic > 0 ? '#f80' : '#5a7' }}>{result.breakdown.geographic > 0 ? '+' : ''}{result.breakdown.geographic} pts</span>
              </div>
              {result.overlapAnalysis && (
                <div style={{ display: 'flex', justifyContent: 'space-between', padding: 12, background: '#222', borderRadius: 6 }}>
                  <span style={{ color: '#fff' }}>Isotopic Overlap Risk</span>
                  <span style={{ fontWeight: 600, color: result.breakdown.isotope > 0 ? '#f80' : '#5a7' }}>{result.breakdown.isotope > 0 ? '+' : ''}{result.breakdown.isotope} pts</span>
                </div>
              )}
            </div>
          </div>

          {/* Overlap analysis */}
          {result.overlapAnalysis && (
            <div style={{ marginBottom: 24, padding: 16, background: '#222', borderRadius: 8, borderLeft: '4px solid #6c9' }}>
              <h4 style={{ marginTop: 0, marginBottom: 12, color: '#fff' }}>Isotopic Overlap Analysis</h4>
              
              <div style={{ marginBottom: 16, padding: 12, background: '#1a1a1a', borderRadius: 6 }}>
                <div style={{ fontWeight: 600, marginBottom: 8, color: '#fff' }}>Declared Region: {declaredRegion || declaredCountry}</div>
                <div style={{ fontSize: 14, color: '#ddd' }}>Expected δ18O: {result.overlapAnalysis.declaredProfile.mean.toFixed(1)} ± {result.overlapAnalysis.declaredProfile.sd.toFixed(1)} ‰</div>
                <div style={{ fontSize: 14, color: '#ddd' }}>Range: {result.overlapAnalysis.declaredProfile.min.toFixed(1)} - {result.overlapAnalysis.declaredProfile.max.toFixed(1)} ‰</div>
              </div>
              
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, fontSize: 14, marginBottom: 16 }}>
                <div>
                  <div style={{ color: '#fff', marginBottom: 4 }}>Isotopic Overlap:</div>
                  <div style={{ fontSize: 24, fontWeight: 600, color: result.overlapAnalysis.overlapPercent > 80 ? '#f33' : result.overlapAnalysis.overlapPercent > 50 ? '#f80' : result.overlapAnalysis.overlapPercent > 20 ? '#da0' : '#5a7' }}>{result.overlapAnalysis.overlapPercent.toFixed(0)}%</div>
                </div>
                <div>
                  <div style={{ color: '#fff', marginBottom: 4 }}>Closest High-Risk:</div>
                  <div style={{ fontSize: 18, fontWeight: 600, color: '#f80' }}>{result.overlapAnalysis.closestHighRisk}</div>
                  <div style={{ fontSize: 12, color: '#fff' }}>{result.overlapAnalysis.distanceSD.toFixed(1)} SD apart</div>
                </div>
              </div>
              
              <div style={{ fontSize: 13 }}>
                <div style={{ fontWeight: 600, marginBottom: 6, color: '#fff' }}>High-Risk Region Profiles:</div>
                {result.overlapAnalysis.highRiskProfiles.map((hr: any) => (
                  <div key={hr.name} style={{ marginBottom: 4, paddingLeft: 12, color: '#fff' }}>
                    <span style={{ color: '#f80' }}>{hr.name}:</span> {hr.mean?.toFixed(1)} ‰ (range: {hr.min?.toFixed(1)}-{hr.max?.toFixed(1)})
                  </div>
                ))}
              </div>
              
              {result.overlapAnalysis.separable && (
                <div style={{ marginTop: 12, padding: 10, background: '#1a3a1a', border: '1px solid #5a7', borderRadius: 4, color: '#5a7', fontSize: 13 }}>
                  ✓ Isotopically distinguishable from high-risk regions ({result.overlapAnalysis.distanceSD.toFixed(1)} SD separation)
                </div>
              )}
              {!result.overlapAnalysis.separable && (
                <div style={{ marginTop: 12, padding: 10, background: '#3a2a1a', border: '1px solid #f80', borderRadius: 4, color: '#f80', fontSize: 13 }}>
                  ⚠ Isotopic overlap with {result.overlapAnalysis.closestHighRisk} - isotopes alone cannot rule out high-risk origin
                </div>
              )}
            </div>
          )}

          {/* Recommendations */}
          <div style={{ marginBottom: 24 }}>
            <h4 style={{ marginBottom: 12, color: '#fff' }}>Recommendations</h4>
            <div style={{ padding: 16, background: '#222', borderRadius: 6, fontSize: 14, lineHeight: 1.6 }}>
              {result.tier === 'critical' && (
                <>
                  <div style={{ color: '#f33', fontWeight: 600, marginBottom: 8 }}>⛔ CRITICAL RISK - Likely UFLPA Violation</div>
                  <ul style={{ marginLeft: 20, color: '#fff' }}>
                    <li>Recommend rejecting shipment or intensive verification</li>
                    <li>Isotope data suggests Xinjiang or Central Asia origin</li>
                    <li>High probability of CBP detention and forced labor concerns</li>
                  </ul>
                </>
              )}
              {result.tier === 'high' && (
                <>
                  <div style={{ color: '#f80', fontWeight: 600, marginBottom: 8 }}>⚠ HIGH RISK - Enhanced Due Diligence Required</div>
                  <ul style={{ marginLeft: 20, color: '#fff' }}>
                    <li>Request additional supplier documentation</li>
                    <li>Consider independent supply chain audit</li>
                    <li>Prepare for potential CBP scrutiny</li>
                    {result.overlapAnalysis && result.overlapAnalysis.overlapPercent > 50 && <li>Significant isotopic overlap with {result.overlapAnalysis.closestHighRisk}</li>}
                  </ul>
                </>
              )}
              {result.tier === 'medium' && (
                <>
                  <div style={{ color: '#da0', fontWeight: 600, marginBottom: 8 }}>⚠ MEDIUM RISK - Some Documentation Gaps</div>
                  <ul style={{ marginLeft: 20, color: '#fff' }}>
                    <li>Strengthen traceability documentation</li>
                    <li>Consider third-party certification</li>
                    <li>Maintain detailed import records</li>
                  </ul>
                </>
              )}
              {result.tier === 'low' && (
                <>
                  <div style={{ color: '#5a7', fontWeight: 600, marginBottom: 8 }}>✓ LOW RISK - Good Compliance Posture</div>
                  <ul style={{ marginLeft: 20, color: '#fff' }}>
                    <li>Maintain current documentation standards</li>
                    <li>Continue periodic isotope testing</li>
                    <li>Keep supply chain transparent</li>
                  </ul>
                </>
              )}
            </div>
          </div>

          <div style={{ display: 'flex', gap: 12 }}>
            <button onClick={() => { setStep(0); setResult(null); setAnswers({}); setDeclaredCountry(''); setDeclaredRegion(''); setDeclaredProfile(null); setProductId(''); setProductType(''); setProductDescription('') }} style={{ padding: '12px 24px', background: '#555', color: '#ddd', border: 'none', borderRadius: 6, cursor: 'pointer', fontWeight: 600 }}>Start New Assessment</button>
            <button onClick={() => setShowMitigation(true)} style={{ padding: '12px 24px', background: '#6c9', color: '#000', border: 'none', borderRadius: 6, cursor: 'pointer', fontWeight: 600 }}>Risk Mitigation</button>
          </div>
        </div>
      )}

      {showMitigation && (
        <RiskMitigationModal
          riskResult={result}
          assessmentId={currentAssessmentId || undefined}
          onClose={() => setShowMitigation(false)}
          onSave={(plan) => {
            if (currentAssessmentId) {
              const { updateAssessment } = require('./utils/riskStorage')
              updateAssessment(currentAssessmentId, { mitigationPlan: plan })
              console.log('✓ Mitigation plan saved')
            }
          }}
        />
      )}
    </div>
  )
}

export default function Home() {
  const [file, setFile] = useState<File | null>(null);
  const [running, setRunning] = useState(false);
  const [result, setResult] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);
  const [files, setFiles] = useState<any[]>([]);
  const [tab, setTab] = useState<Tab>(Tab.FTMapping)
  const [lightboxPath, setLightboxPath] = useState<string | null>(null)
  const [zoom, setZoom] = useState<number>(1)
  const [loaded, setLoaded] = useState<boolean>(false)
  const [selectedFolder, setSelectedFolder] = useState<string | null>(null)
  const [csvPreview, setCsvPreview] = useState<{path: string, content: string} | null>(null)
  const [isoCrop, setIsoCrop] = useState<string>('COTT')
  const [isoFiles, setIsoFiles] = useState<IsoFile[]>([])
  const [isoParams, setIsoParams] = useState<any>(null)
  const [isoBusy, setIsoBusy] = useState<boolean>(false)
  const [isoMeta, setIsoMeta] = useState<any | null>(null)
  const [isoSelected, setIsoSelected] = useState<Record<string, boolean>>({})
  const [isoTimeout, setIsoTimeout] = useState<number>(1800)
  const [isoStatus, setIsoStatus] = useState<any | null>(null)
  const [isoLog, setIsoLog] = useState<string[]>([])
  const [showCompare, setShowCompare] = useState<boolean>(false)
  const [stretchMin, setStretchMin] = useState<number>(-20)
  const [stretchMax, setStretchMax] = useState<number>(-10)
  const [tintHex, setTintHex] = useState<string>("ffff00")
  const [outlineHex, setOutlineHex] = useState<string>("888888")
  const tintParam = useMemo(() => tintHex ? `&tint=${encodeURIComponent(tintHex)}` : '', [tintHex])
  const overlayParams = useMemo(() => `&overlay=countries&overlayOpacity=0.4&outlineColor=${encodeURIComponent(outlineHex)}&cb=${Date.now()}`, [outlineHex])

  const groups = useMemo(() => groupByTop(files), [files])

  useEffect(() => {
    refreshOutputs()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!lightboxPath) return
      if (e.key === 'Escape') setLightboxPath(null)
      if (e.key === '+' || e.key === '=') setZoom(z => Math.min(4, +(z + 0.2).toFixed(2)))
      if (e.key === '-' || e.key === '_') setZoom(z => Math.max(0.5, +(z - 0.2).toFixed(2)))
      if (e.key === '0') setZoom(1)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [lightboxPath])

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setResult(null);
    setTab(Tab.FTMapping)
    setRunning(true);
    try {
      if (file) {
        // Upload file first
        console.log('Uploading file:', file.name, file.size);
        const fd = new FormData();
        fd.append("file", file);
        const uploadRes = await fetch("/api/upload", { method: "POST", body: fd });
        const uploadData = await uploadRes.json();
        console.log('Upload response:', uploadData);
        if (!uploadRes.ok) throw new Error(uploadData?.error || "Upload failed");
      }
      
      // Then run mapping (send empty formdata to satisfy multipart check)
      console.log('Starting mapping run...');
      const emptyForm = new FormData();
      const res = await fetch("/api/run", { method: "POST", body: emptyForm });
      const data = await res.json();
      console.log('Run response:', data);
      if (!res.ok) throw new Error(data?.error || "R API error");
      setResult(data);
    } catch (err: any) {
      console.error('Error:', err);
      setError(err?.message || "Unknown error");
    } finally {
      setRunning(false);
    }
  };

  async function refreshOutputs() {
    try {
      setError(null)
      setTab(Tab.Outputs)
      const res = await fetch("/api/outputs", { cache: 'no-store' });
      if (!res.ok) {
        const msg = await res.text().catch(() => '')
        throw new Error(msg || `Failed to fetch outputs (HTTP ${res.status})`)
      }
      const data = await res.json()
      setFiles(Array.isArray(data?.files) ? data.files : [])
    } catch (e: any) {
      setFiles([])
      setError(e?.message || 'Failed to fetch outputs')
    } finally {
      setLoaded(true)
    }
  }

  const clearOutputs = async () => {
    try {
      setError(null)
      const res = await fetch("/api/outputs", { method: "DELETE" });
      if (!res.ok) {
        const msg = await res.text().catch(() => '')
        throw new Error(msg || `Failed to clear outputs (HTTP ${res.status})`)
      }
    } catch (e: any) {
      setError(e?.message || 'Failed to clear outputs')
    } finally {
      await refreshOutputs();
      setSelectedFolder(null)
    }
  }

  const openLightbox = (p: string) => { setLightboxPath(p); setZoom(1) }

  // helper to group second-level within selected folder
  const secondLevel = useMemo(() => {
    if (!selectedFolder) return {}
    const items = groups[selectedFolder] || []
    const by: Record<string, OutputFile[]> = {}
    for (const f of items) {
      const parts = f.path.split('/')
      const sec = parts[1] || '(root)'
      if (!by[sec]) by[sec] = []
      by[sec].push(f)
    }
    return by
  }, [groups, selectedFolder])

  async function isoRefresh() {
    const res = await fetch('/api/isoscape/files', { cache: 'no-store' })
    const data = await res.json()
    if (res.ok) {
      setIsoFiles(Array.isArray(data.files) ? data.files : [])
      setIsoParams(data.model_params || null)
    }
  }

  async function isoLoadMeta() {
    const res = await fetch('/api/isoscape', { cache: 'no-store' })
    const data = await res.json()
    if (res.ok) {
      setIsoMeta(data)
      const sel: Record<string, boolean> = {}
      for (const s of (data.sources || [])) sel[s.id] = false
      setIsoSelected(sel)
    }
  }

  async function isoFetch() {
    setIsoBusy(true)
    try {
      const selected = Object.entries(isoSelected).filter(([,v]) => v).map(([k]) => k)
      const res = await fetch('/api/isoscape', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'fetch', crop: isoCrop, sources: selected, timeout: isoTimeout }) })
      await res.json()
      await pollStatus(30)
      await isoRefresh()
    } finally { setIsoBusy(false) }
  }

  async function isoModel() {
    setIsoBusy(true)
    try {
      const res = await fetch('/api/isoscape', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'model', crop: isoCrop }) })
      const data = await res.json()
      if (res.ok) setIsoParams(data.model_params || null)
      await isoRefresh()
    } finally { setIsoBusy(false) }
  }

  useEffect(() => { isoRefresh() }, [])
  useEffect(() => { isoLoadMeta() }, [])

  async function pollStatus(seconds: number) {
    const end = Date.now() + seconds * 1000
    while (Date.now() < end) {
      const res = await fetch('/api/isoscape/status', { cache: 'no-store' }).catch(() => null as any)
      if (res && res.ok) {
        const data = await res.json()
        setIsoStatus(data?.status || null)
        setIsoLog(Array.isArray(data?.log_tail) ? data.log_tail : [])
      }
      await new Promise(r => setTimeout(r, 1000))
    }
  }

  return (
    <main style={{ padding: 24, maxWidth: 1920 }}>
      <h1 style={{ marginBottom: 16 }}>WorldScape Mapper (Local)</h1>

      {/* Modern tab navigation */}
      <div style={{ display: 'flex', gap: 4, marginBottom: 24, borderBottom: '2px solid #333' }}>
        {[
          { id: Tab.FTMapping, label: 'FTMapping' },
          { id: Tab.Outputs, label: 'Outputs' },
          { id: Tab.IsoscapeBuild, label: 'IsoscapeBuild' },
          { id: Tab.WorldMapping, label: 'WorldMapping' },
          { id: Tab.Interactive, label: 'Interactive' },
          { id: Tab.Dashboard, label: 'Dashboard' },
          { id: Tab.RiskScore, label: 'Risk Score' }
        ].map(t => (
          <button
            key={t.id}
            onClick={() => t.id === Tab.Outputs ? refreshOutputs() : setTab(t.id)}
            style={{
              padding: '12px 20px',
              background: tab === t.id ? '#1a1a1a' : 'transparent',
              color: tab === t.id ? '#fff' : '#999',
              border: 'none',
              borderBottom: tab === t.id ? '2px solid #6c9' : '2px solid transparent',
              cursor: 'pointer',
              fontWeight: tab === t.id ? 600 : 400,
              fontSize: 14,
              transition: 'all 0.2s',
              marginBottom: -2
            }}
            onMouseEnter={e => { if (tab !== t.id) (e.target as HTMLButtonElement).style.color = '#ddd' }}
            onMouseLeave={e => { if (tab !== t.id) (e.target as HTMLButtonElement).style.color = '#999' }}
          >
            {t.label}
          </button>
        ))}
        <button onClick={clearOutputs} style={{ marginLeft: 'auto', padding: '8px 16px', fontSize: 13, background: '#333', color: '#ddd', border: 'none', borderRadius: 4, cursor: 'pointer' }}>Clear outputs</button>
      </div>

      {tab===Tab.FTMapping && (
        <>
          <form onSubmit={onSubmit} style={{ display: "grid", gap: 12 }}>
            <input type="file" accept=".xlsx" onChange={(e) => setFile(e.target.files?.[0] || null)} />
            <button type="submit" disabled={running}>{running ? "Running..." : "Run mapping"}</button>
          </form>
          <InlineTableRunner />
          {error && <p style={{ color: "crimson" }}>{error}</p>}
          {result && (
            <div style={{ marginTop: 16 }}>
              <h3>Run result</h3>
              <pre style={{ whiteSpace: "pre-wrap" }}>{JSON.stringify(result, null, 2)}</pre>
            </div>
          )}
        </>
      )}

      {tab===Tab.Outputs && (
        <div style={{ marginTop: 16 }}>
          <h3>Output files</h3>
          {error && <p style={{ color: "crimson" }}>{error}</p>}
          {loaded && Object.keys(groups).length === 0 && !error && <p>No outputs yet.</p>}

          {!selectedFolder && (
            <ul style={{ listStyle: 'none', paddingLeft: 0 }}>
              {Object.entries(groups).map(([folder, items]) => (
                <li key={folder} style={{ marginBottom: 10 }}>
                  <button onClick={() => setSelectedFolder(folder)}>
                    {folder} ({items.filter(i => !i.isdir).length})
                  </button>
                </li>
              ))}
            </ul>
          )}

          {selectedFolder && (
            <div>
              <div style={{ marginBottom: 12, display: 'flex', alignItems: 'center', gap: 12 }}>
                <button onClick={() => setSelectedFolder(null)}>Back</button>
                <h4 style={{ margin: 0 }}>{selectedFolder}</h4>
              </div>
              {Object.entries(secondLevel).map(([sec, items]) => (
                <details key={sec} style={{ marginBottom: 10 }}>
                  <summary style={{ fontWeight: 600 }}>{sec}</summary>
                  <div style={{ display: 'grid', gridTemplateColumns: 'auto 1fr', gap: 16 }}>
                    <ul style={{ listStyle: 'none', paddingLeft: 0, minWidth: 280 }}>
                      {items.filter(f => !f.isdir).map(f => (
                        <li key={f.path} style={{ marginBottom: 8 }}>
                          {isPng(f.path) ? (
                            <img
                              onClick={() => openLightbox(f.path)}
                              src={`/api/file?path=${encodeURIComponent(f.path)}`}
                              alt={f.path}
                              width={220}
                              height={118}
                              style={{ objectFit: 'contain', background: '#111', border: '1px solid #222', cursor: 'zoom-in', imageRendering: 'auto' as any, display: 'block', marginBottom: 4 }}
                            />
                          ) : isTiff(f.path) ? (
                            <img
                              onClick={() => openLightbox(f.path)}
                              src={`/api/preview?path=${encodeURIComponent(f.path)}&w=220&format=webp`}
                              alt={f.path}
                              width={220}
                              height={118}
                              style={{ objectFit: 'contain', background: '#111', border: '1px solid #222', cursor: 'zoom-in', display: 'block', marginBottom: 4 }}
                            />
                          ) : null}
                          {f.path.endsWith('.csv') ? (
                            <button
                              onClick={async () => {
                                const res = await fetch(`/api/file?path=${encodeURIComponent(f.path)}`)
                                const text = await res.text()
                                setCsvPreview({ path: f.path, content: text })
                              }}
                              style={{ padding: '6px 12px', background: csvPreview?.path === f.path ? '#6c9' : '#333', color: csvPreview?.path === f.path ? '#000' : '#ddd', border: 'none', borderRadius: 4, cursor: 'pointer', fontSize: 13, fontWeight: csvPreview?.path === f.path ? 600 : 400 }}
                            >
                              {f.path.split('/').slice(2).join('/')}
                            </button>
                          ) : (
                            <a href={`/api/file?path=${encodeURIComponent(f.path)}`} target="_blank" rel="noreferrer" style={{ fontSize: 13 }}>
                              {f.path.split('/').slice(2).join('/')}
                            </a>
                          )}
                        </li>
                      ))}
                    </ul>
                    {csvPreview && (
                      <div style={{ background: '#1a1a1a', padding: 16, borderRadius: 6, border: '1px solid #333', maxHeight: 600, overflow: 'auto' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                          <h5 style={{ margin: 0, fontSize: 14 }}>{csvPreview.path.split('/').slice(2).join('/')}</h5>
                          <button onClick={() => setCsvPreview(null)} style={{ padding: '4px 10px', background: '#444', color: '#ddd', border: 'none', borderRadius: 4, cursor: 'pointer', fontSize: 12 }}>Close</button>
                        </div>
                        <CsvTable content={csvPreview.content} />
                      </div>
                    )}
                  </div>
                </details>
              ))}
            </div>
          )}
        </div>
      )}

      {tab===Tab.WorldMapping && (
        <WorldMappingRunner />
      )}

      {tab===Tab.IsoscapeBuild && (
        <>
          <h2 style={{ marginTop: 0, marginBottom: 16 }}>IsoscapeBuild</h2>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 16, flexWrap: 'wrap', padding: 16, background: '#1a1a1a', borderRadius: 8 }}>
            <label style={{ fontWeight: 600 }}>Crop:&nbsp;</label>
            <select value={isoCrop} onChange={e => setIsoCrop(e.target.value)} style={{ padding: '6px 12px', borderRadius: 4, border: '1px solid #444', background: '#222', color: '#ddd' }}>
              <option value="COTT">COTT (cotton) ✅ calibrated</option>
              <option value="COFF">COFF (coffee) ✅ calibrated</option>
              <option value="ONIO">ONIO (onion) ⚠️ theoretical</option>
              <option value="GARL">GARL (garlic) ⚠️ theoretical</option>
              <option value="CHIL">CHIL (chillies) ⚠️ theoretical</option>
            </select>
            <button onClick={isoFetch} disabled={isoBusy} style={{ padding: '8px 16px', background: isoBusy ? '#444' : '#6c9', color: '#000', border: 'none', borderRadius: 4, cursor: isoBusy ? 'not-allowed' : 'pointer', fontWeight: 600 }}>{isoBusy ? 'Running…' : 'Fetch inputs'}</button>
            <button onClick={isoModel} disabled={isoBusy} style={{ padding: '8px 16px', background: isoBusy ? '#444' : '#5a7', color: '#000', border: 'none', borderRadius: 4, cursor: isoBusy ? 'not-allowed' : 'pointer', fontWeight: 600 }}>{isoBusy ? 'Running…' : 'Build model'}</button>
            <button onClick={() => { isoRefresh(); isoLoadMeta(); }} style={{ padding: '8px 16px', background: '#555', color: '#ddd', border: 'none', borderRadius: 4, cursor: 'pointer' }}>Refresh</button>
            <button onClick={() => setShowCompare(v => !v)} style={{ marginLeft: 'auto', padding: '8px 16px', background: showCompare ? '#777' : '#444', color: '#ddd', border: 'none', borderRadius: 4, cursor: 'pointer' }}>{showCompare ? 'Hide compare' : 'Compare legacy vs new'}</button>
          </div>
          <div style={{ fontSize: 13, color: '#888', marginBottom: 16, padding: 12, background: '#1a1a1a', borderRadius: 6, borderLeft: '3px solid #6c9' }}>
            <strong>Note:</strong> Only COTT has SPAM source data. To add others, download from <a href="https://www.mapspam.info/data/" target="_blank" style={{ color: '#6c9', textDecoration: 'underline' }}>mapspam.info</a> and place in FTMapping/shapefilesEtc/ (see <a href="/FTMapping/shapefilesEtc/README_SPAM.md" target="_blank" style={{ color: '#6c9', textDecoration: 'underline' }}>README_SPAM.md</a>)
          </div>
          <SourceSelector meta={isoMeta} selected={isoSelected} setSelected={setIsoSelected} timeout={isoTimeout} setTimeout={setIsoTimeout} status={isoStatus} log={isoLog} />
          <div style={{ marginTop: 16 }}>
            <h4 style={{ marginBottom: 12 }}>Generic Crop Model Framework</h4>
            <div style={{ background: '#1a3a1a', border: '2px solid #6c9', borderRadius: 8, padding: 16, marginBottom: 16 }}>
              <div style={{ fontWeight: 700, marginBottom: 8, color: '#6c9', fontSize: 15 }}>Model Equation (Multi-Crop)</div>
              <div style={{ fontFamily: 'monospace', fontSize: 14, color: '#fff', marginBottom: 8 }}>
                δ18O<sub>tissue</sub> = a<sub>0</sub> + b×δ18O<sub>precip_gs</sub> + c×T<sub>gs</sub> + d×VPD<sub>gs</sub>
              </div>
              <div style={{ fontSize: 13, color: '#ddd' }}>
                Where: a<sub>0</sub> = tissue-specific fractionation; b,c,d = crop-specific coefficients; gs = growing-season weighted
              </div>
            </div>

            <div style={{ background: '#1a1a1a', border: '1px solid #444', borderRadius: 6, padding: 12, marginBottom: 16 }}>
              <div style={{ fontWeight: 700, marginBottom: 8, color: '#f93', fontSize: 14 }}>🔬 Model Improvements Applied</div>
              <ol style={{ margin: 0, paddingLeft: 20, color: '#ddd', fontSize: 13, lineHeight: 1.8 }}>
                <li><strong>Theoretical Fractionation Priors:</strong> Crop-specific baseline enrichment factors from published literature (Sternberg, Barbour, Cernusak et al.)</li>
                <li><strong>Elevation Lapse Rate Correction:</strong> Temperature adjusted for topography (-0.0065°C/m); improves montane predictions by 2-5‰</li>
                <li><strong>Irrigation Source-Water Mixing:</strong> Blends precipitation with irrigation water δ18O (+2‰ shift); derived from MIRCA irrigated fraction</li>
                <li><strong>GNIP Bias Correction:</strong> Optional station-based OIPC calibration (reduces regional bias by 1-3‰ where dense; requires manual GNIP data)</li>
              </ol>
            </div>

            <h4 style={{ marginBottom: 8 }}>Model Sources & Status (by crop)</h4>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              <div style={{ background: '#1a1a1a', border: '1px solid #6c9', borderRadius: 6, padding: 12 }}>
                <div style={{ fontWeight: 700, marginBottom: 6, color: '#6c9', fontSize: 14 }}>COTT (cotton) ✓ CALIBRATED</div>
                <div style={{ fontSize: 12, color: '#6c9', marginBottom: 8 }}>Model: Empirical fit (n=10 samples) | Range: 12.0–33.6‰</div>
                <ul style={{ margin: 0, paddingLeft: 18, color: '#ddd', fontSize: 13 }}>
                  <li>Source-water: OIPC → irrigation-mixed → growing-season weighted</li>
                  <li>Climate: WorldClim tmean (elevation-corrected) + VPD</li>
                  <li>Prior/mask: SPAM 2020 cotton production</li>
                  <li>Phenology: MIRCA calendars (uniform)</li>
                  <li>Improvements: ✓ Elevation ✓ Irrigation ✓ VPD ⏳ GNIP</li>
                </ul>
              </div>
              <div style={{ background: '#1a1a1a', border: '1px solid #f93', borderRadius: 6, padding: 12 }}>
                <div style={{ fontWeight: 700, marginBottom: 6, color: '#f93', fontSize: 14 }}>CHIL (chillies/peppers) ⚠️ THEORETICAL</div>
                <div style={{ fontSize: 12, color: '#f93', marginBottom: 8 }}>Model: Theoretical prior (awaiting calibration) | Range: -6.0–23.6‰</div>
                <ul style={{ margin: 0, paddingLeft: 18, color: '#ddd', fontSize: 13 }}>
                  <li>Source-water: OIPC → irrigation-mixed → growing-season weighted</li>
                  <li>Climate: WorldClim tmean (elevation-corrected) + VPD</li>
                  <li>Prior/mask: SPAM 2020 vegetables proxy (P_VEGE_A)</li>
                  <li>Phenology: MIRCA veg26 proxy (12-band, normalized)</li>
                  <li>Improvements: ✓ Elevation ✓ Irrigation ✓ VPD ⏳ GNIP</li>
                </ul>
              </div>
              <div style={{ background: '#1a1a1a', border: '1px solid #f93', borderRadius: 6, padding: 12 }}>
                <div style={{ fontWeight: 700, marginBottom: 6, color: '#f93', fontSize: 14 }}>ONIO (onion) ⚠️ THEORETICAL</div>
                <div style={{ fontSize: 12, color: '#f93', marginBottom: 8 }}>Model: Theoretical prior (awaiting calibration) | Range: -4.4–27.8‰</div>
                <ul style={{ margin: 0, paddingLeft: 18, color: '#ddd', fontSize: 13 }}>
                  <li>Source-water: OIPC → irrigation-mixed → growing-season weighted</li>
                  <li>Climate: WorldClim tmean (elevation-corrected) + VPD</li>
                  <li>Prior/mask: SPAM 2020 v2r0 onion (P_ONIO_A)</li>
                  <li>Phenology: MIRCA veg26 proxy (12-band, normalized)</li>
                  <li>Improvements: ✓ Elevation ✓ Irrigation ✓ VPD ⏳ GNIP</li>
                </ul>
              </div>
              <div style={{ background: '#1a1a1a', border: '1px solid #f93', borderRadius: 6, padding: 12 }}>
                <div style={{ fontWeight: 700, marginBottom: 6, color: '#f93', fontSize: 14 }}>GARL (garlic) ⚠️ THEORETICAL</div>
                <div style={{ fontSize: 12, color: '#f93', marginBottom: 8 }}>Model: Theoretical prior (awaiting calibration) | Range: -4.4–27.8‰</div>
                <ul style={{ margin: 0, paddingLeft: 18, color: '#ddd', fontSize: 13 }}>
                  <li>Source-water: OIPC → irrigation-mixed → growing-season weighted</li>
                  <li>Climate: WorldClim tmean (elevation-corrected) + VPD</li>
                  <li>Prior/mask: SPAM 2020 vegetables proxy (P_VEGE_A)</li>
                  <li>Phenology: MIRCA veg26 proxy (12-band, normalized)</li>
                  <li>Improvements: ✓ Elevation ✓ Irrigation ✓ VPD ✓ GNIP</li>
                </ul>
              </div>
              <div style={{ background: '#1a1a1a', border: '1px solid #6c9', borderRadius: 6, padding: 12 }}>
                <div style={{ fontWeight: 700, marginBottom: 6, color: '#6c9', fontSize: 14 }}>COFF (coffee) ✓ CALIBRATED</div>
                <div style={{ fontSize: 12, color: '#6c9', marginBottom: 8 }}>Model: Empirical fit (n=25 samples) | Range: 20.6–41.7‰ | RMSE: 1.88‰</div>
                <ul style={{ margin: 0, paddingLeft: 18, color: '#ddd', fontSize: 13 }}>
                  <li>Source-water: OIPC → irrigation-mixed → growing-season weighted</li>
                  <li>Climate: WorldClim tmean (elevation-corrected) + VPD</li>
                  <li>Prior/mask: SPAM 2020 v2r0 coffee (P_COFF_A)</li>
                  <li>Phenology: MIRCA crop 21 (12-band, coffee-specific)</li>
                  <li>Improvements: ✓ Elevation ✓ Irrigation ✓ VPD ✓ GNIP</li>
                  <li>Coverage: Brazil, Ethiopia, Colombia, Yemen, Vietnam, Kenya, Indonesia, Central America, USA (Hawaii)</li>
                  <li>Note: Temp coefficient negative (cooler highlands → higher δ18O); strong VPD effect</li>
                </ul>
              </div>
            </div>
            
            <div style={{ marginTop: 16, padding: 12, background: '#1a1a1a', border: '1px solid #666', borderRadius: 6, fontSize: 12, color: '#aaa' }}>
              <div style={{ fontWeight: 700, marginBottom: 6, color: '#ddd' }}>📚 Theoretical Priors (References)</div>
              <ul style={{ margin: 0, paddingLeft: 18 }}>
                <li>Cotton cellulose: Sternberg et al. (1986), West et al. (2006) — enrichment ~27‰</li>
                <li>Onion/Garlic bulb: Barbour et al. (2004) — enrichment ~18‰ (lower cellulose content)</li>
                <li>Chillies fruit: Cernusak et al. (2016) — enrichment ~15‰ (high transpiration)</li>
                <li>Coffee beans: Rodrigues et al. (2009), Ballentine et al. (2005) — enrichment ~25‰ (mixed tissue: cellulose + sugars + oils)</li>
              </ul>
            </div>
          </div>
          {showCompare && (
            <div style={{ marginTop: 16 }}>
              <h4 style={{ marginBottom: 12 }}>Model Comparison</h4>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
                <div>
                  <h5 style={{ margin: '4px 0 8px' }}>Legacy: Model1.tif</h5>
                  <img
                    src={`/api/legacy?path=${encodeURIComponent('Model1.tif')}&w=700&format=webp${tintParam}`}
                    alt="Legacy Model1.tif"
                    style={{ width: '100%', height: 'auto', background: '#111', border: '1px solid #333', borderRadius: 6, cursor: 'zoom-in' }}
                    onClick={() => setLightboxPath('LEGACY::Model1.tif')}
                  />
                </div>
                <div>
                  <h5 style={{ margin: '4px 0 8px' }}>New: cellulose_mu.tif</h5>
                  <img
                    src={`/api/isopreview?scope=data_proc&path=${encodeURIComponent('cellulose_mu.tif')}&w=700&format=webp&min=${stretchMin}&max=${stretchMax}${tintParam}${overlayParams}`}
                    alt="New cellulose_mu.tif"
                    style={{ width: '100%', height: 'auto', background: '#111', border: '1px solid #333', borderRadius: 6, cursor: 'zoom-in' }}
                    onClick={() => setLightboxPath('NEW::cellulose_mu.tif')}
                  />
                </div>
                <div style={{ gridColumn: '1 / span 2', display: 'flex', gap: 12, alignItems: 'center', padding: 12, background: '#1a1a1a', borderRadius: 6 }}>
                  <label>Min&nbsp;<input type="number" step="0.5" value={stretchMin} onChange={e => setStretchMin(parseFloat(e.target.value))} style={{ width: 80, padding: 4, borderRadius: 4, border: '1px solid #444', background: '#222', color: '#ddd' }} /></label>
                  <label>Max&nbsp;<input type="number" step="0.5" value={stretchMax} onChange={e => setStretchMax(parseFloat(e.target.value))} style={{ width: 80, padding: 4, borderRadius: 4, border: '1px solid #444', background: '#222', color: '#ddd' }} /></label>
                  <label>Tint&nbsp;<input type="color" value={`#${tintHex}`} onChange={e => setTintHex(e.target.value.replace('#',''))} /></label>
                  <label>Outline&nbsp;<input type="color" value={`#${outlineHex}`} onChange={e => setOutlineHex(e.target.value.replace('#',''))} /></label>
                </div>
              </div>
            </div>
          )}
          <div style={{ marginTop: 16 }}>
            <h4 style={{ marginBottom: 8 }}>Processed Files</h4>
            <ul style={{ padding: '12px 16px', background: '#1a1a1a', borderRadius: 6, maxHeight: 200, overflow: 'auto' }}>
              {isoFiles.filter(f => !f.isdir).map(f => (
                <li key={f.path} style={{ marginBottom: 4, fontSize: 13 }}>{f.path}</li>
              ))}
            </ul>
          </div>
        </>
      )}

      {tab===Tab.Interactive && (
        <InteractiveMap files={files} />
      )}

      {tab===Tab.Dashboard && (
        <RiskDashboard />
      )}

      {tab===Tab.RiskScore && (
        <RiskScoreWizard />
      )}

      {lightboxPath && (
        <div
          onClick={() => setLightboxPath(null)}
          style={{
            position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.85)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            zIndex: 1000
          }}
        >
          <div onClick={(e) => e.stopPropagation()} style={{ position: 'relative', maxWidth: '95vw', maxHeight: '95vh' }}>
            <div style={{ position: 'absolute', top: 8, right: 8, display: 'flex', gap: 8 }}>
              <button onClick={() => setLightboxPath(null)}>Close (Esc)</button>
              <button onClick={() => setZoom(z => Math.max(0.5, +(z - 0.2).toFixed(2)))}>-</button>
              <button onClick={() => setZoom(1)}>100%</button>
              <button onClick={() => setZoom(z => Math.min(4, +(z + 0.2).toFixed(2)))}>+</button>
            </div>
            {lightboxPath.startsWith('LEGACY::') ? (
              <img
                src={`/api/legacy?path=${encodeURIComponent(lightboxPath.replace('LEGACY::',''))}&w=${Math.round(1200*zoom)}&format=webp`}
                alt={lightboxPath}
                style={{ maxWidth: '95vw', maxHeight: '95vh', objectFit: 'contain', border: '1px solid #333', background: '#111', display: 'block' }}
              />
            ) : lightboxPath.startsWith('NEW::') ? (
              <img
                src={`/api/isopreview?scope=data_proc&path=${encodeURIComponent(lightboxPath.replace('NEW::',''))}&w=${Math.round(1200*zoom)}&format=webp&min=${stretchMin}&max=${stretchMax}${tintParam}${overlayParams}`}
                alt={lightboxPath}
                style={{ maxWidth: '95vw', maxHeight: '95vh', objectFit: 'contain', border: '1px solid #333', background: '#111', display: 'block' }}
              />
            ) : (
              <img
                src={`/api/preview?path=${encodeURIComponent(lightboxPath)}&w=${Math.round(1200*zoom)}&format=webp`}
                alt={lightboxPath}
                style={{ maxWidth: '95vw', maxHeight: '95vh', objectFit: 'contain', border: '1px solid #333', background: '#111', display: 'block' }}
              />
            )}
          </div>
        </div>
      )}
    </main>
  );
}

function InlineTableRunner() {
  const [rows, setRows] = useState<Array<{ samples: string; d18O: string }>>(
    Array.from({ length: 5 }, () => ({ samples: '', d18O: '' }))
  )
  const [busy, setBusy] = useState(false)
  const canRun = rows.some(r => r.samples.trim() && r.d18O.trim())

  const update = (i: number, key: 'samples'|'d18O', value: string) => {
    setRows(prev => prev.map((r, idx) => idx === i ? { ...r, [key]: value } : r))
  }

  const run = async () => {
    setBusy(true)
    try {
      const table = rows.filter(r => r.samples.trim() && r.d18O.trim()).map(r => ({ samples: r.samples.trim(), d18O: parseFloat(r.d18O) }))
      const res = await fetch('/api/run', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ table })
      })
      const data = await res.json()
      if (!res.ok) {
        alert(data?.error || 'Run failed')
        return
      }
      alert('Run started using inline table. Switch to Outputs to view results.')
    } finally { setBusy(false) }
  }

  return (
    <div style={{ marginTop: 16 }}>
      <h3>Inline samples (max 5)</h3>
      <div style={{ display: 'grid', gridTemplateColumns: '200px 120px', gap: 8, alignItems: 'center' }}>
        <div style={{ fontWeight: 600 }}>Sample name</div>
        <div style={{ fontWeight: 600 }}>d18O</div>
        {rows.map((r, i) => (
          <div key={i} style={{ display: 'contents' }}>
            <input value={r.samples} onChange={e => update(i, 'samples', e.target.value)} placeholder={`FT25${i+151}X`} />
            <input value={r.d18O} onChange={e => update(i, 'd18O', e.target.value)} placeholder="35.0" />
          </div>
        ))}
      </div>
      <div style={{ marginTop: 8 }}>
        <button onClick={run} disabled={!canRun || busy}>{busy ? 'Running…' : 'Run with table'}</button>
      </div>
    </div>
  )
}

function WorldMappingRunner() {
  const [rows, setRows] = useState<Array<{ samples: string; d18O: string }>>(
    Array.from({ length: 5 }, () => ({ samples: '', d18O: '' }))
  )
  const [busy, setBusy] = useState(false)
  const [sigma, setSigma] = useState<number>(0.3)
  const [prior, setPrior] = useState<'both'|'weighted'|'unweighted'>('both')

  const canRun = rows.some(r => r.samples.trim() && r.d18O.trim())
  const update = (i: number, key: 'samples'|'d18O', value: string) => {
    setRows(prev => prev.map((r, idx) => idx === i ? { ...r, [key]: value } : r))
  }
  const run = async () => {
    setBusy(true)
    try {
      const table = rows
        .filter(r => r.samples.trim() && r.d18O.trim())
        .map(r => ({ samples: r.samples.trim(), d18O: parseFloat(r.d18O) }))
      const res = await fetch('/api/worldmapping', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ table, sigma_meas: sigma, prior })
      })
      const data = await res.json()
      if (!res.ok) { alert(data?.error || 'Run failed'); return }
      alert('WorldMapping run completed. Check Outputs to view results.')
    } finally { setBusy(false) }
  }

  return (
    <div style={{ marginTop: 8, border: '1px solid #333', padding: 12 }}>
      <h3 style={{ marginTop: 0 }}>WorldMapping assignment</h3>
      <div style={{ display: 'grid', gridTemplateColumns: '200px 120px', gap: 8, alignItems: 'center' }}>
        <div style={{ fontWeight: 600 }}>Sample name</div>
        <div style={{ fontWeight: 600 }}>d18O</div>
        {rows.map((r, i) => (
          <div key={i} style={{ display: 'contents' }}>
            <input value={r.samples} onChange={e => update(i, 'samples', e.target.value)} placeholder={`FT25${i+151}X`} />
            <input value={r.d18O} onChange={e => update(i, 'd18O', e.target.value)} placeholder="35.0" />
          </div>
        ))}
      </div>
      <div style={{ display: 'flex', gap: 12, alignItems: 'center', marginTop: 8 }}>
        <label>σ_meas&nbsp;<input type="number" step="0.05" value={sigma} onChange={e => setSigma(parseFloat(e.target.value))} style={{ width: 90 }} /></label>
        <label>Prior&nbsp;
          <select value={prior} onChange={e => setPrior(e.target.value as any)}>
            <option value="both">both (write weighted + unweighted)</option>
            <option value="weighted">weighted</option>
            <option value="unweighted">unweighted</option>
          </select>
        </label>
        <button onClick={run} disabled={!canRun || busy}>{busy ? 'Running…' : 'Run WorldMapping'}</button>
      </div>
      <div style={{ marginTop: 6, opacity: 0.85 }}>
        Replicates are combined when the samples name matches (case-insensitive); σ_meas added in quadrature.
      </div>
    </div>
  )
}

const InteractiveMap = dynamic(() => import('./widgets/InteractiveMap').then(m => m.InteractiveMap), { ssr: false })

function SourceSelector({ meta, selected, setSelected, timeout, setTimeout, status, log }: { meta: any | null, selected: Record<string, boolean>, setSelected: (s: Record<string, boolean>) => void, timeout: number, setTimeout: (n: number) => void, status: any | null, log: string[] }) {
  if (!meta) return null
  const toggle = (id: string) => setSelected({ ...selected, [id]: !selected[id] })
  const lastFetchedById: Record<string, any> = (meta.summary?.sources || {}) as any
  return (
    <div style={{ marginTop: 8, marginBottom: 12, border: '1px solid #333', padding: 12 }}>
      <h3 style={{ marginTop: 0 }}>Sources</h3>
      <div style={{ display: 'grid', gap: 8 }}>
        {(meta.sources || []).map((s: any) => (
          <div key={s.id} style={{ border: '1px solid #444', padding: 8 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <input type="checkbox" checked={!!selected[s.id]} onChange={() => toggle(s.id)} />
              <div style={{ fontWeight: 600 }}>{s.name}</div>
              <div style={{ opacity: 0.8 }}>({s.id})</div>
            </div>
            {lastFetchedById[s.id] && (
              <div style={{ marginTop: 2, fontSize: 12, opacity: 0.85 }}>
                Version: {lastFetchedById[s.id].version || 'n/a'} | Last fetched: {lastFetchedById[s.id].last_fetched || 'n/a'}
              </div>
            )}
            <div style={{ marginTop: 4, opacity: 0.9 }}>
              {s.description}
              {s.id === 'spam' && (
                <span style={{ marginLeft: 8 }}>
                  <a href="/FTMapping/shapefilesEtc/README_SPAM.md" target="_blank" style={{ color: '#6c9', fontSize: 12 }}>
                    → Setup guide
                  </a>
                </span>
              )}
            </div>
            {Array.isArray(s.parts) && s.parts.length > 0 && (
              <ul style={{ margin: '6px 0 0 16px' }}>
                {s.parts.map((p: any) => (
                  <li key={p.id}>
                    <span style={{ fontWeight: 600 }}>{p.name}</span> — {p.purpose}
                    {p.meta && (
                      <span style={{ marginLeft: 8, opacity: 0.85 }}>
                        [{p.meta.present ? 'present' : 'missing'}, files: {p.meta.file_count ?? 0}, size: {formatBytes(p.meta.size_bytes ?? 0)}, updated: {p.meta.last_updated || 'n/a'}]
                      </span>
                    )}
                  </li>
                ))}
              </ul>
            )}
            {s.meta && (
              <div style={{ marginTop: 4, opacity: 0.85 }}>
                [{s.meta.present ? 'present' : 'missing'}, size: {formatBytes(s.meta.size_bytes ?? 0)}, updated: {s.meta.last_updated || 'n/a'}]
              </div>
            )}
          </div>
        ))}
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 8 }}>
        <label>Timeout (s): <input type="number" value={timeout} onChange={e => setTimeout(parseInt(e.target.value || '0') || 0)} style={{ width: 100 }} /></label>
        {status && (
          <div style={{ marginLeft: 'auto', opacity: 0.9 }}>
            Running: {String(status?.running)} | Step: {status?.current?.source || '-'}:{status?.current?.step || '-'}
          </div>
        )}
      </div>
      {Array.isArray(log) && log.length > 0 && (
        <pre style={{ marginTop: 8, background: '#111', color: '#ddd', maxHeight: 160, overflow: 'auto', padding: 8, border: '1px solid #333' }}>
          {log.join('\n')}
        </pre>
      )}
    </div>
  )
}

function formatBytes(n: number) {
  if (!n || n <= 0) return '0 B'
  const units = ['B','KB','MB','GB','TB']
  const i = Math.min(units.length - 1, Math.floor(Math.log(n) / Math.log(1024)))
  return `${(n / Math.pow(1024, i)).toFixed(1)} ${units[i]}`
}

function CsvTable({ content }: { content: string }) {
  const lines = content.split(/\r?\n/).filter(Boolean)
  if (lines.length === 0) return <div style={{ color: '#999', fontSize: 13 }}>Empty CSV</div>
  
  const headers = lines[0].split(',').map(h => h.replace(/^"|"$/g, '').trim())
  const rows = lines.slice(1).map(line => line.split(',').map(v => v.replace(/^"|"$/g, '').trim()))
  
  return (
    <div style={{ overflowX: 'auto' }}>
      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
        <thead>
          <tr style={{ background: '#222', borderBottom: '2px solid #444' }}>
            {headers.map((h, i) => (
              <th key={i} style={{ padding: '8px 12px', textAlign: 'left', fontWeight: 600, color: '#6c9' }}>{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, i) => (
            <tr key={i} style={{ borderBottom: '1px solid #333' }}>
              {row.map((cell, j) => (
                <td key={j} style={{ padding: '6px 12px', color: '#ddd' }}>{cell}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
