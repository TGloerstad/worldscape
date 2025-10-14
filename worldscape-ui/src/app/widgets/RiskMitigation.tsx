'use client'

import { useState } from 'react'

interface RiskMitigationModalProps {
  riskResult: any
  assessmentId?: string
  onClose: () => void
  onSave?: (mitigationPlan: any) => void
}

export function RiskMitigationModal({ riskResult, assessmentId, onClose, onSave }: RiskMitigationModalProps) {
  const [step, setStep] = useState<number>(1)
  
  // Determine risk-based sampling level
  const getRiskTier = () => {
    if (!riskResult) return 'medium'
    return riskResult.tier || 'medium'
  }
  
  const getDefaultSamplingLevel = (): 'low' | 'medium' | 'high' => {
    const tier = getRiskTier()
    if (tier === 'low') return 'low'
    if (tier === 'medium') return 'medium'
    return 'high' // for 'high' or 'critical'
  }
  
  const [formData, setFormData] = useState({
    volumeUnits: 0,
    testLocation: 'garment' as 'garment' | 'fabric',
    traceability: 'batch' as 'batch' | 'sku',
    samplingLevel: getDefaultSamplingLevel(),
    colors: 1,
    sizes: 1
  })
  const [testPlan, setTestPlan] = useState<any>(null)

  const calculateAQLSamples = (lotSize: number, aql: number = 1.0): { sampleSize: number, acceptNumber: number, rejectNumber: number } => {
    const aqlTable: Record<string, { n: number, ac: number, re: number }> = {
      '2-8': { n: 2, ac: 0, re: 1 },
      '9-15': { n: 3, ac: 0, re: 1 },
      '16-25': { n: 5, ac: 0, re: 1 },
      '26-50': { n: 8, ac: 0, re: 1 },
      '51-90': { n: 13, ac: 0, re: 1 },
      '91-150': { n: 20, ac: 0, re: 1 },
      '151-280': { n: 32, ac: 1, re: 2 },
      '281-500': { n: 50, ac: 1, re: 2 },
      '501-1200': { n: 80, ac: 2, re: 3 },
      '1201-3200': { n: 125, ac: 3, re: 4 },
      '3201-10000': { n: 200, ac: 5, re: 6 },
      '10001-35000': { n: 315, ac: 7, re: 8 },
      '35001+': { n: 500, ac: 10, re: 11 }
    }

    for (const [range, values] of Object.entries(aqlTable)) {
      if (range.includes('-')) {
        const [min, max] = range.split('-').map(Number)
        if (lotSize >= min && lotSize <= max) return { sampleSize: values.n, acceptNumber: values.ac, rejectNumber: values.re }
      } else if (range === '35001+' && lotSize >= 35001) {
        return { sampleSize: values.n, acceptNumber: values.ac, rejectNumber: values.re }
      }
    }
    return { sampleSize: 2, acceptNumber: 0, rejectNumber: 1 }
  }

  const calculatePoolingStrategy = (sampleSize: number, colors: number, expectedDefectRate: number = 0.05): { pools: number, testsRequired: number, savingsPercent: number } => {
    const samplesPerColor = Math.ceil(sampleSize / colors)
    const optimalPoolSize = Math.min(Math.floor(Math.sqrt(1 / expectedDefectRate)), samplesPerColor)
    const poolsPerColor = Math.ceil(samplesPerColor / optimalPoolSize)
    const totalPools = poolsPerColor * colors
    const expectedIndividualTests = totalPools * optimalPoolSize * expectedDefectRate
    const totalExpectedTests = Math.ceil(totalPools + expectedIndividualTests)
    const savingsPercent = Math.round(((sampleSize - totalExpectedTests) / sampleSize) * 100)
    return { pools: totalPools, testsRequired: totalExpectedTests, savingsPercent }
  }

  const calculateStatisticalPower = (sampleSize: number, lotSize: number, defectRate: number = 0.05): number => {
    const k = Math.floor(lotSize * defectRate)
    const n = sampleSize
    const N = lotSize
    let pDetect = 0
    for (let x = 1; x <= Math.min(n, k); x++) {
      const numerator = combination(k, x) * combination(N - k, n - x)
      const denominator = combination(N, n)
      pDetect += numerator / denominator
    }
    return Math.min(Math.round(pDetect * 100), 99)
  }

  const combination = (n: number, r: number): number => {
    if (r > n) return 0
    if (r === 0 || r === n) return 1
    let result = 1
    for (let i = 1; i <= r; i++) {
      result *= (n - i + 1) / i
    }
    return result
  }

  const generateTestPlan = () => {
    const { volumeUnits, testLocation, traceability, samplingLevel, colors, sizes } = formData
    if (volumeUnits <= 0) {
      alert('Please enter valid volume')
      return
    }
    if (colors <= 0 || sizes <= 0) {
      alert('Please enter valid number of colors and sizes')
      return
    }
    
    const riskTier = getRiskTier()
    
    // Risk-based confidence levels (NEW: based on risk tier)
    let confidenceLevel: number
    if (riskTier === 'low') {
      confidenceLevel = 1   // Low risk: 1% confidence
    } else if (riskTier === 'medium') {
      confidenceLevel = 2   // Medium risk: 2% confidence
    } else {
      confidenceLevel = 4   // High/Critical risk: 4% confidence
    }
    
    // Risk-based AQL and sample multipliers (existing logic)
    let aql: number
    let sampleMultiplier: number
    
    if (samplingLevel === 'low') {
      aql = 4.0          // Very relaxed
      sampleMultiplier = 0.3  // Reduce samples by 70%
    } else if (samplingLevel === 'medium') {
      aql = 2.5          // Relaxed
      sampleMultiplier = 0.6  // Reduce samples by 40%
    } else {
      aql = 1.0          // Standard/Strict
      sampleMultiplier = 1.0  // Full samples
    }
    
    // Protocol 1: AQL-based (existing)
    const aqlResult = calculateAQLSamples(volumeUnits, aql)
    const adjustedSampleSize = Math.max(2, Math.ceil(aqlResult.sampleSize * sampleMultiplier))
    const totalSamples = adjustedSampleSize * colors
    const pooling = calculatePoolingStrategy(totalSamples, colors, 0.05)
    const costPerTest = 300
    const unpooledCost = totalSamples * costPerTest
    const pooledCost = pooling.testsRequired * costPerTest
    const power = calculateStatisticalPower(adjustedSampleSize, volumeUnits, 0.05)
    
    // Protocol 2: Color × Size based (NEW)
    let colorSizeSamples: number
    let colorSizeDescription: string
    
    if (riskTier === 'low') {
      // Low risk: Test one sample per color, using only 2 different sizes across all colors
      colorSizeSamples = colors
      const sizesUsed = Math.min(2, sizes)
      colorSizeDescription = `Test every color (${colors}) using ${sizesUsed} different sizes = ${colorSizeSamples} samples`
    } else if (riskTier === 'medium') {
      // Medium risk: Test every color × all sizes
      colorSizeSamples = colors * sizes
      colorSizeDescription = `Test every color (${colors}) × all sizes (${sizes}) = ${colorSizeSamples} samples`
    } else {
      // High/Critical risk: Test all colors × all sizes
      colorSizeSamples = colors * sizes
      colorSizeDescription = `Test all colors (${colors}) × all sizes (${sizes}) = ${colorSizeSamples} samples`
    }
    
    const colorSizePooling = calculatePoolingStrategy(colorSizeSamples, colors, 0.05)
    const colorSizeUnpooledCost = colorSizeSamples * costPerTest
    const colorSizePooledCost = colorSizePooling.testsRequired * costPerTest
    
    const plan = {
      lotSize: volumeUnits,
      colors,
      sizes,
      aql,
      samplesPerColor: adjustedSampleSize,
      totalSamples,
      acceptNumber: aqlResult.acceptNumber,
      rejectNumber: aqlResult.rejectNumber,
      pooling,
      unpooledCost,
      pooledCost,
      power,
      confidenceLevel,
      testLocation,
      traceability,
      riskTier,
      samplingLevel,
      // Protocol 2: Color × Size
      colorSizeSamples,
      colorSizeDescription,
      colorSizePooling,
      colorSizeUnpooledCost,
      colorSizePooledCost
    }
    
    setTestPlan(plan)
    
    // Save mitigation plan to assessment if callback provided
    if (onSave) {
      onSave({
        generated: true,
        timestamp: Date.now(),
        lotSize: volumeUnits,
        colors,
        sizes,
        samplingLevel,
        totalSamples,
        samplesPerColor: adjustedSampleSize,
        estimatedCost: pooledCost,
        confidenceLevel,
        aql,
        testLocation,
        colorSizeSamples,
        colorSizePooledCost
      })
    }
    
    setStep(2)
  }

  return (
    <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.8)', zIndex: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}>
      <div style={{ background: '#0a0a0a', border: '2px solid #6c9', borderRadius: 12, padding: 32, maxWidth: 900, width: '100%', maxHeight: '90vh', overflow: 'auto' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
          <h2 style={{ margin: 0, color: '#fff' }}>Isotopic Testing Protocol</h2>
          <button onClick={onClose} style={{ background: 'transparent', border: '2px solid #6c9', color: '#6c9', padding: '8px 16px', borderRadius: 6, cursor: 'pointer', fontSize: 16, fontWeight: 600 }}>
            Close
          </button>
        </div>
        {step === 1 && (
          <div>
            {riskResult && (
              <div style={{ 
                background: getRiskTier() === 'low' ? '#1a3a2a' : getRiskTier() === 'medium' ? '#3a3a1a' : '#3a1a1a',
                border: `2px solid ${getRiskTier() === 'low' ? '#66cc99' : getRiskTier() === 'medium' ? '#ffcc33' : '#ff3333'}`,
                borderRadius: 8,
                padding: 16,
                marginBottom: 20
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 8 }}>
                  <span style={{ fontSize: 24 }}>
                    {getRiskTier() === 'low' ? '🟢' : getRiskTier() === 'medium' ? '🟡' : '🔴'}
                  </span>
                  <div>
                    <div style={{ fontSize: 16, fontWeight: 700, color: '#fff' }}>
                      {getRiskTier().charAt(0).toUpperCase() + getRiskTier().slice(1)} Risk Assessment
                    </div>
                    <div style={{ fontSize: 13, color: '#ddd' }}>
                      Overall Risk Score: {riskResult.total} pts
                    </div>
                  </div>
                </div>
                <div style={{ fontSize: 13, color: '#ddd' }}>
                  Recommended Testing: <strong style={{ color: '#fff' }}>
                    {getRiskTier() === 'low' ? '20% confidence (minimal)' : 
                     getRiskTier() === 'medium' ? '50% confidence (moderate)' : 
                     '90% confidence (rigorous)'}
                  </strong>
                </div>
              </div>
            )}
            <p style={{ color: '#ddd', marginBottom: 24, fontSize: 15 }}>
              Generate a statistically rigorous δ18O cellulose testing protocol based on ANSI/ASQ Z1.4 (AQL sampling) with Dorfman pooling optimization.
            </p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
              <div>
                <label style={{ display: 'block', color: '#fff', marginBottom: 8, fontSize: 15, fontWeight: 600 }}>
                  1. How many units are in this shipment? *
                </label>
                <input
                  type="number"
                  min="1"
                  value={formData.volumeUnits || ''}
                  onChange={(e) => setFormData({ ...formData, volumeUnits: parseInt(e.target.value) || 0 })}
                  style={{ width: '100%', padding: 10, background: '#1a1a1a', border: '1px solid #444', borderRadius: 6, color: '#fff', fontSize: 15 }}
                  placeholder="e.g., 5000"
                />
                <p style={{ margin: '4px 0 0 0', fontSize: 13, color: '#888' }}>Total number of garments (shirts, t-shirts, shorts, etc.) in the shipment</p>
              </div>
              <div>
                <label style={{ display: 'block', color: '#fff', marginBottom: 8, fontSize: 15, fontWeight: 600 }}>
                  2. What will be tested? *
                </label>
                <select
                  value={formData.testLocation}
                  onChange={(e) => setFormData({ ...formData, testLocation: e.target.value as 'garment' | 'fabric' })}
                  style={{ width: '100%', padding: 10, background: '#1a1a1a', border: '1px solid #444', borderRadius: 6, color: '#fff', fontSize: 15 }}
                >
                  <option value="garment">Finished Garments (imported products)</option>
                  <option value="fabric">Fabric Rolls (overseas, pre-production)</option>
                </select>
                <p style={{ margin: '4px 0 0 0', fontSize: 13, color: '#888' }}>
                  {formData.testLocation === 'garment' 
                    ? 'Test imported finished products. FloraTrace will extract cellulose from garment samples.' 
                    : 'Test fabric rolls before cutting. Requires SKU-level tracking for roll-to-garment traceability.'}
                </p>
              </div>
              {formData.testLocation === 'fabric' && (
                <div>
                  <label style={{ display: 'block', color: '#fff', marginBottom: 8, fontSize: 15, fontWeight: 600 }}>
                    3. Traceability Level *
                  </label>
                  <select
                    value={formData.traceability}
                    onChange={(e) => setFormData({ ...formData, traceability: e.target.value as 'batch' | 'sku' })}
                    style={{ width: '100%', padding: 10, background: '#1a1a1a', border: '1px solid #444', borderRadius: 6, color: '#fff', fontSize: 15 }}
                  >
                    <option value="sku">SKU-level (roll-to-garment tracking)</option>
                    <option value="batch">Batch-level (supplier/shipment tracking)</option>
                  </select>
                  <p style={{ margin: '4px 0 0 0', fontSize: 13, color: '#888' }}>
                    SKU-level required for fabric roll testing. Batch-level sufficient for finished garments.
                  </p>
                </div>
              )}
              <div>
                <label style={{ display: 'block', color: '#fff', marginBottom: 8, fontSize: 15, fontWeight: 600 }}>
                  {formData.testLocation === 'fabric' ? '4' : '3'}. How many distinct colors? *
                </label>
                <input
                  type="number"
                  min="1"
                  value={formData.colors || ''}
                  onChange={(e) => {
                    const val = e.target.value
                    setFormData({ ...formData, colors: val === '' ? 0 : parseInt(val) || 0 })
                  }}
                  style={{ width: '100%', padding: 10, background: '#1a1a1a', border: '1px solid #444', borderRadius: 6, color: '#fff', fontSize: 15 }}
                  placeholder="e.g., 3"
                />
                <p style={{ margin: '4px 0 0 0', fontSize: 13, color: '#888' }}>
                  Different colors may use different fabric rolls/sources, requiring separate sampling per color.
                </p>
              </div>
              <div>
                <label style={{ display: 'block', color: '#fff', marginBottom: 8, fontSize: 15, fontWeight: 600 }}>
                  {formData.testLocation === 'fabric' ? '5' : '4'}. How many sizes/SKUs? *
                </label>
                <input
                  type="number"
                  min="1"
                  value={formData.sizes || ''}
                  onChange={(e) => {
                    const val = e.target.value
                    setFormData({ ...formData, sizes: val === '' ? 0 : parseInt(val) || 0 })
                  }}
                  style={{ width: '100%', padding: 10, background: '#1a1a1a', border: '1px solid #444', borderRadius: 6, color: '#fff', fontSize: 15 }}
                  placeholder="e.g., 5"
                />
                <p style={{ margin: '4px 0 0 0', fontSize: 13, color: '#888' }}>
                  Different sizes (S, M, L, XL, etc.) require separate sampling for comprehensive coverage.
                </p>
              </div>
              <div>
                <label style={{ display: 'block', color: '#fff', marginBottom: 8, fontSize: 15, fontWeight: 600 }}>
                  {formData.testLocation === 'fabric' ? '6' : '5'}. Sampling Rigor *
                </label>
                <select
                  value={formData.samplingLevel}
                  onChange={(e) => setFormData({ ...formData, samplingLevel: e.target.value as 'low' | 'medium' | 'high' })}
                  style={{ width: '100%', padding: 10, background: '#1a1a1a', border: '1px solid #444', borderRadius: 6, color: '#fff', fontSize: 15 }}
                >
                  <option value="low">Low (AQL 4.0) - 70% fewer samples</option>
                  <option value="medium">Medium (AQL 2.5) - 40% fewer samples</option>
                  <option value="high">High (AQL 1.0) - Full sampling</option>
                </select>
                <p style={{ margin: '8px 0 0 0', fontSize: 13, color: '#6c9', fontStyle: 'italic' }}>
                  Note: Confidence levels are now risk-based: Low={getRiskTier() === 'low' ? '1%' : '—'}, Medium={getRiskTier() === 'medium' ? '2%' : '—'}, High/Critical={getRiskTier() === 'high' || getRiskTier() === 'critical' ? '4%' : '—'}
                </p>
                <p style={{ margin: '4px 0 0 0', fontSize: 13, color: '#888' }}>
                  {riskResult ? (
                    <>
                      <strong style={{ color: '#6c9' }}>Recommended:</strong> {' '}
                      {getRiskTier() === 'low' ? 'Low rigor for low-risk assessments' : 
                       getRiskTier() === 'medium' ? 'Medium rigor for moderate-risk assessments' : 
                       'High rigor required for high/critical risk assessments'}
                    </>
                  ) : (
                    'High rigor recommended for UFLPA compliance. Lower rigor acceptable for verified low-risk suppliers.'
                  )}
                </p>
              </div>
            </div>
            <button
              onClick={generateTestPlan}
              style={{ marginTop: 32, background: '#6c9', color: '#000', padding: '12px 32px', border: 'none', borderRadius: 6, cursor: 'pointer', fontSize: 16, fontWeight: 700, width: '100%' }}
            >
              Generate Testing Protocol
            </button>
          </div>
        )}
        {step === 2 && testPlan && (
          <div>
            {riskResult && (
              <div style={{ 
                background: testPlan.riskTier === 'low' ? '#1a3a2a' : testPlan.riskTier === 'medium' ? '#3a3a1a' : '#3a1a1a',
                border: `2px solid ${testPlan.riskTier === 'low' ? '#66cc99' : testPlan.riskTier === 'medium' ? '#ffcc33' : '#ff3333'}`,
                borderRadius: 8,
                padding: 16,
                marginBottom: 20
              }}>
                <div style={{ fontSize: 14, fontWeight: 600, color: '#fff', marginBottom: 4 }}>
                  Risk-Based Testing Protocol
                </div>
                <div style={{ fontSize: 13, color: '#ddd' }}>
                  This protocol is calibrated for <strong>{testPlan.riskTier}</strong> risk products 
                  using <strong>{testPlan.confidenceLevel}% confidence</strong> level.
                  {testPlan.samplingLevel !== 'high' && (
                    <span style={{ display: 'block', marginTop: 8, color: '#6c9' }}>
                      💰 Cost savings from risk-based sampling: reduces testing by {testPlan.samplingLevel === 'low' ? '70%' : '40%'} 
                      compared to standard protocols.
                    </span>
                  )}
                </div>
              </div>
            )}
            <div style={{ background: '#1a1a1a', border: '2px solid #6c9', borderRadius: 8, padding: 20, marginBottom: 24 }}>
              <h3 style={{ margin: '0 0 16px 0', color: '#6c9', fontSize: 18 }}>📋 Protocol 1: AQL-Based Sampling</h3>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, color: '#ddd', fontSize: 14 }}>
                <div><strong style={{ color: '#fff' }}>Lot Size:</strong> {testPlan.lotSize.toLocaleString()} units</div>
                <div><strong style={{ color: '#fff' }}>AQL Standard:</strong> {testPlan.aql} (ANSI/ASQ Z1.4)</div>
                <div><strong style={{ color: '#fff' }}>Colors:</strong> {testPlan.colors}</div>
                <div><strong style={{ color: '#fff' }}>Sizes:</strong> {testPlan.sizes}</div>
                <div><strong style={{ color: '#fff' }}>Confidence Level:</strong> {testPlan.confidenceLevel}% (risk-based)</div>
                <div><strong style={{ color: '#fff' }}>Samples per Color:</strong> {testPlan.samplesPerColor}</div>
                <div><strong style={{ color: '#fff' }}>Total Samples:</strong> {testPlan.totalSamples}</div>
              </div>
            </div>
            <div style={{ background: '#1a1a1a', border: '2px solid #6c9', borderRadius: 8, padding: 20, marginBottom: 24 }}>
              <h3 style={{ margin: '0 0 16px 0', color: '#6c9', fontSize: 18 }}>🧪 Dorfman Pooling Strategy</h3>
              <p style={{ color: '#ddd', fontSize: 14, marginBottom: 16 }}>
                Pooling combines samples for initial testing, then individually tests positive pools. This reduces costs while maintaining statistical power.
              </p>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 16, color: '#ddd', fontSize: 14 }}>
                <div><strong style={{ color: '#fff' }}>Pools Created:</strong> {testPlan.pooling.pools}</div>
                <div><strong style={{ color: '#fff' }}>Expected Tests:</strong> {testPlan.pooling.testsRequired}</div>
                <div><strong style={{ color: '#6c9' }}>Cost Reduction:</strong> {testPlan.pooling.savingsPercent}%</div>
              </div>
            </div>
            <div style={{ background: '#1a1a1a', border: '2px solid #f93', borderRadius: 8, padding: 20, marginBottom: 24 }}>
              <h3 style={{ margin: '0 0 16px 0', color: '#f93', fontSize: 18 }}>💰 Cost Estimate</h3>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                <div>
                  <p style={{ margin: 0, color: '#ddd', fontSize: 14 }}>Without Pooling:</p>
                  <p style={{ margin: '4px 0 0 0', color: '#888', fontSize: 13 }}>{testPlan.totalSamples} tests × $300</p>
                </div>
                <p style={{ margin: 0, color: '#fff', fontSize: 18, fontWeight: 700, textDecoration: 'line-through' }}>
                  ${testPlan.unpooledCost.toLocaleString()}
                </p>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', paddingTop: 12, borderTop: '1px solid #333' }}>
                <div>
                  <p style={{ margin: 0, color: '#fff', fontSize: 15, fontWeight: 600 }}>With Pooling:</p>
                  <p style={{ margin: '4px 0 0 0', color: '#888', fontSize: 13 }}>{testPlan.pooling.testsRequired} tests × $300</p>
                </div>
                <p style={{ margin: 0, color: '#6c9', fontSize: 22, fontWeight: 700 }}>${testPlan.pooledCost.toLocaleString()}</p>
              </div>
            </div>
            <div style={{ background: '#1a1a1a', border: '2px solid #c9c', borderRadius: 8, padding: 20, marginBottom: 24 }}>
              <h3 style={{ margin: '0 0 16px 0', color: '#c9c', fontSize: 18 }}>📊 Statistical Power Analysis</h3>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, color: '#ddd', fontSize: 14 }}>
                <div><strong style={{ color: '#fff' }}>Detection Power:</strong> {testPlan.power}%</div>
                <div><strong style={{ color: '#fff' }}>Accept/Reject:</strong> ≤{testPlan.acceptNumber} accept / ≥{testPlan.rejectNumber} reject</div>
              </div>
              <p style={{ margin: '12px 0 0 0', fontSize: 13, color: '#888' }}>
                Power represents the probability of detecting contamination if 5% of the lot is non-compliant. If ≥{testPlan.rejectNumber} samples fail isotopic verification, reject the entire lot.
              </p>
            </div>
            <div style={{ background: '#1a1a1a', border: '2px solid #6c9', borderRadius: 8, padding: 20, marginBottom: 24 }}>
              <h3 style={{ margin: '0 0 16px 0', color: '#6c9', fontSize: 18 }}>🎯 Testing Instructions</h3>
              <ol style={{ margin: 0, paddingLeft: 20, color: '#ddd', fontSize: 14, lineHeight: 1.8 }}>
                <li><strong style={{ color: '#fff' }}>Sample Selection:</strong> FloraTrace will randomly select {testPlan.totalSamples} garments ({testPlan.samplesPerColor} per color) from your shipment using systematic random sampling.</li>
                <li><strong style={{ color: '#fff' }}>Sample Shipping:</strong> Ship entire garments to FloraTrace (do not cut). We will extract cellulose from fabric samples in-house.</li>
                <li><strong style={{ color: '#fff' }}>Pooling:</strong> Samples will be combined into {testPlan.pooling.pools} pools for initial δ18O analysis. Pools testing positive will undergo individual retesting.</li>
                <li><strong style={{ color: '#fff' }}>Pass/Fail Criteria:</strong> If isotopic signatures of ≥{testPlan.rejectNumber} samples fall outside the declared region's expected range (considering {testPlan.confidenceLevel}% CI), the lot fails.</li>
                <li>
                  <strong style={{ color: '#fff' }}>Decision Tree:</strong>
                  <ul style={{ marginTop: 8 }}>
                    <li style={{ color: '#6c9' }}>✓ <strong>Pass:</strong> All samples consistent with declared origin → Release shipment</li>
                    <li style={{ color: '#f93' }}>⚠ <strong>Marginal:</strong> {testPlan.acceptNumber + 1} samples fail → Request supplier documentation, consider enhanced testing</li>
                    <li style={{ color: '#f33' }}>✗ <strong>Fail:</strong> ≥{testPlan.rejectNumber} samples fail → Quarantine shipment, initiate supplier audit, report to CBP if UFLPA-relevant</li>
                  </ul>
                </li>
              </ol>
            </div>

            {/* PROTOCOL 2: Color × Size Based Testing */}
            <div style={{ background: '#1a2a1a', border: '2px solid #5a7', borderRadius: 8, padding: 20, marginBottom: 24, marginTop: 32 }}>
              <h3 style={{ margin: '0 0 16px 0', color: '#5a7', fontSize: 18 }}>🎨 Alternative: Color × Size Testing Protocol</h3>
              <p style={{ color: '#ddd', fontSize: 14, marginBottom: 16 }}>
                Simplified protocol based on testing combinations of colors and sizes (no AQL calculations). Risk-based sampling strategy.
              </p>
              
              <div style={{ background: '#222', padding: 16, borderRadius: 8, marginBottom: 16 }}>
                <h4 style={{ margin: '0 0 12px 0', color: '#5a7', fontSize: 16 }}>Sampling Strategy ({testPlan.riskTier} risk):</h4>
                <div style={{ color: '#fff', fontSize: 15, marginBottom: 8 }}>
                  {testPlan.colorSizeDescription}
                </div>
                <div style={{ fontSize: 13, color: '#aaa' }}>
                  {testPlan.riskTier === 'low' && (
                    <>✓ Low risk: Minimal testing (one sample per color, distributed across 2 different sizes)</>
                  )}
                  {testPlan.riskTier === 'medium' && (
                    <>⚠ Medium risk: Comprehensive testing (every color × every size combination)</>
                  )}
                  {(testPlan.riskTier === 'high' || testPlan.riskTier === 'critical') && (
                    <>🔴 High/Critical risk: Maximum testing (every color × every size combination)</>
                  )}
                </div>
              </div>

              <div style={{ background: '#1a1a1a', border: '1px solid #5a7', borderRadius: 8, padding: 16, marginBottom: 16 }}>
                <h4 style={{ margin: '0 0 12px 0', color: '#5a7', fontSize: 16 }}>Sample Breakdown:</h4>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, color: '#ddd', fontSize: 14 }}>
                  <div><strong style={{ color: '#fff' }}>Colors:</strong> {testPlan.colors}</div>
                  <div><strong style={{ color: '#fff' }}>Sizes:</strong> {testPlan.riskTier === 'low' ? '2 (random selection)' : `${testPlan.sizes} (all)`}</div>
                  <div><strong style={{ color: '#fff' }}>Total Samples:</strong> {testPlan.colorSizeSamples}</div>
                  <div><strong style={{ color: '#fff' }}>Pooling:</strong> {testPlan.colorSizePooling.pools} pools</div>
                </div>
              </div>

              <div style={{ background: '#1a1a1a', border: '1px solid #f93', borderRadius: 8, padding: 16 }}>
                <h4 style={{ margin: '0 0 12px 0', color: '#f93', fontSize: 16 }}>Cost Estimate:</h4>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                  <div>
                    <p style={{ margin: 0, color: '#ddd', fontSize: 14 }}>Without Pooling:</p>
                    <p style={{ margin: '4px 0 0 0', color: '#888', fontSize: 13 }}>{testPlan.colorSizeSamples} tests × $300</p>
                  </div>
                  <p style={{ margin: 0, color: '#fff', fontSize: 18, fontWeight: 700, textDecoration: 'line-through' }}>
                    ${testPlan.colorSizeUnpooledCost.toLocaleString()}
                  </p>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', paddingTop: 12, borderTop: '1px solid #333' }}>
                  <div>
                    <p style={{ margin: 0, color: '#fff', fontSize: 15, fontWeight: 600 }}>With Pooling:</p>
                    <p style={{ margin: '4px 0 0 0', color: '#888', fontSize: 13 }}>{testPlan.colorSizePooling.testsRequired} tests × $300</p>
                  </div>
                  <p style={{ margin: 0, color: '#5a7', fontSize: 22, fontWeight: 700 }}>${testPlan.colorSizePooledCost.toLocaleString()}</p>
                </div>
                <div style={{ marginTop: 12, fontSize: 13, color: '#6c9' }}>
                  💰 Savings: {testPlan.colorSizePooling.savingsPercent}% via Dorfman pooling
                </div>
              </div>
            </div>

            <div style={{ display: 'flex', gap: 16 }}>
              <button
                onClick={() => setStep(1)}
                style={{ flex: 1, background: 'transparent', border: '2px solid #6c9', color: '#6c9', padding: '12px 32px', borderRadius: 6, cursor: 'pointer', fontSize: 16, fontWeight: 600 }}
              >
                ← Modify Parameters
              </button>
              <button
                onClick={() => {
                  const planText = `ISOTOPIC TESTING PROTOCOL 1 (AQL-Based)\n\nLot: ${testPlan.lotSize} units | AQL ${testPlan.aql} | ${testPlan.confidenceLevel}% Confidence\nSamples: ${testPlan.totalSamples} (${testPlan.samplesPerColor}/color × ${testPlan.colors} colors)\nPooling: ${testPlan.pooling.pools} pools → ${testPlan.pooling.testsRequired} expected tests\nCost: $${testPlan.pooledCost.toLocaleString()} (${testPlan.pooling.savingsPercent}% savings)\nPower: ${testPlan.power}%\nDecision: ≤${testPlan.acceptNumber} accept / ≥${testPlan.rejectNumber} reject\n\n---\n\nPROTOCOL 2 (Color × Size Based)\n\n${testPlan.colorSizeDescription}\nTotal Samples: ${testPlan.colorSizeSamples}\nPooling: ${testPlan.colorSizePooling.pools} pools → ${testPlan.colorSizePooling.testsRequired} tests\nCost: $${testPlan.colorSizePooledCost.toLocaleString()} (${testPlan.colorSizePooling.savingsPercent}% savings)`
                  navigator.clipboard.writeText(planText)
                  alert('Both testing protocols copied to clipboard!')
                }}
                style={{ flex: 1, background: '#6c9', color: '#000', padding: '12px 32px', border: 'none', borderRadius: 6, cursor: 'pointer', fontSize: 16, fontWeight: 700 }}
              >
                📋 Copy Both Protocols
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
