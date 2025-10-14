'use client'

import { useState, useEffect } from 'react'
import { getAllAssessments, deleteAssessment, getSummaryStats, searchAssessments, sortAssessments, filterByRiskLevel, updateAssessment, type RiskAssessment } from '../utils/riskStorage'
import { RiskMitigationModal } from './RiskMitigation'

export function RiskDashboard() {
  const [assessments, setAssessments] = useState<RiskAssessment[]>([])
  const [filteredAssessments, setFilteredAssessments] = useState<RiskAssessment[]>([])
  const [selectedAssessment, setSelectedAssessment] = useState<RiskAssessment | null>(null)
  const [viewMode, setViewMode] = useState<'risk' | 'testing'>('risk')
  const [searchQuery, setSearchQuery] = useState<string>('')
  const [sortBy, setSortBy] = useState<'date' | 'risk' | 'productId'>('date')
  const [filterLevels, setFilterLevels] = useState<Array<'Low' | 'Medium' | 'High' | 'Critical'>>([])
  const [stats, setStats] = useState(getSummaryStats())
  const [showMitigation, setShowMitigation] = useState(false)
  const [mitigationAssessment, setMitigationAssessment] = useState<RiskAssessment | null>(null)

  useEffect(() => {
    loadAssessments()
  }, [])

  useEffect(() => {
    let results = searchQuery ? searchAssessments(searchQuery) : [...assessments]
    results = sortAssessments(results, sortBy)
    results = filterByRiskLevel(results, filterLevels)
    setFilteredAssessments(results)
  }, [assessments, searchQuery, sortBy, filterLevels])

  const loadAssessments = () => {
    const all = getAllAssessments()
    setAssessments(all)
    setStats(getSummaryStats())
  }

  const handleDelete = (id: string) => {
    if (confirm('Delete this assessment? This cannot be undone.')) {
      deleteAssessment(id)
      loadAssessments()
      if (selectedAssessment?.id === id) {
        setSelectedAssessment(null)
      }
    }
  }

  const handleSelectAssessment = (assessment: RiskAssessment, mode: 'risk' | 'testing' = 'risk') => {
    setSelectedAssessment(assessment)
    setViewMode(mode)
  }

  const handleOpenMitigation = (assessment: RiskAssessment) => {
    setMitigationAssessment(assessment)
    setShowMitigation(true)
  }

  const handleSaveMitigation = (assessmentId: string, mitigationPlan: any) => {
    updateAssessment(assessmentId, { mitigationPlan })
    loadAssessments()
    // Update selected assessment if it's the one being modified
    if (selectedAssessment?.id === assessmentId) {
      const updated = getAllAssessments().find(a => a.id === assessmentId)
      if (updated) setSelectedAssessment(updated)
    }
    setShowMitigation(false)
  }

  const getRiskColor = (level: string) => {
    switch (level) {
      case 'Low': return '#66cc99'
      case 'Medium': return '#ffcc33'
      case 'High': return '#ff9933'
      case 'Critical': return '#ff3333'
      default: return '#888'
    }
  }

  const getRiskIcon = (level: string) => {
    switch (level) {
      case 'Low': return '🟢'
      case 'Medium': return '🟡'
      case 'High': return '🟠'
      case 'Critical': return '🔴'
      default: return '⚪'
    }
  }

  const formatDate = (timestamp: number) => {
    const date = new Date(timestamp)
    const now = Date.now()
    const diff = now - timestamp
    const hours = Math.floor(diff / (1000 * 60 * 60))
    const days = Math.floor(hours / 24)

    if (hours < 1) return 'Just now'
    if (hours < 24) return `${hours}h ago`
    if (days < 7) return `${days}d ago`
    return date.toLocaleDateString()
  }

  const getCountryFlag = (country: string) => {
    const flags: Record<string, string> = {
      'China': '🇨🇳',
      'United States': '🇺🇸',
      'India': '🇮🇳',
      'Pakistan': '🇵🇰',
      'Uzbekistan': '🇺🇿',
      'Turkey': '🇹🇷',
      'Brazil': '🇧🇷',
      'Australia': '🇦🇺',
      'Tajikistan': '🇹🇯',
      'Kyrgyzstan': '🇰🇬'
    }
    return flags[country] || '🌍'
  }

  return (
    <div style={{ padding: '0 20px' }}>
      <h2 style={{ marginBottom: 16, color: '#fff' }}>Risk Assessment Dashboard</h2>

      {/* Summary Stats */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 16, marginBottom: 24 }}>
        <div style={{ background: '#1a1a1a', border: '1px solid #333', borderRadius: 8, padding: 16 }}>
          <div style={{ fontSize: 28, fontWeight: 700, color: '#6c9' }}>{stats.total}</div>
          <div style={{ fontSize: 13, color: '#888' }}>Total Assessments</div>
        </div>
        {stats.critical > 0 && (
          <div style={{ background: '#1a1a1a', border: '2px solid #ff3333', borderRadius: 8, padding: 16 }}>
            <div style={{ fontSize: 28, fontWeight: 700, color: '#ff3333' }}>{stats.critical}</div>
            <div style={{ fontSize: 13, color: '#888' }}>Critical Risk</div>
          </div>
        )}
        {stats.high > 0 && (
          <div style={{ background: '#1a1a1a', border: '1px solid #ff9933', borderRadius: 8, padding: 16 }}>
            <div style={{ fontSize: 28, fontWeight: 700, color: '#ff9933' }}>{stats.high}</div>
            <div style={{ fontSize: 13, color: '#888' }}>High Risk</div>
          </div>
        )}
        <div style={{ background: '#1a1a1a', border: '1px solid #333', borderRadius: 8, padding: 16 }}>
          <div style={{ fontSize: 28, fontWeight: 700, color: '#66cc99' }}>{stats.low + stats.medium}</div>
          <div style={{ fontSize: 13, color: '#888' }}>Low/Medium Risk</div>
        </div>
      </div>

      {assessments.length === 0 ? (
        <div style={{ textAlign: 'center', padding: 60, background: '#1a1a1a', borderRadius: 12, border: '1px solid #333' }}>
          <div style={{ fontSize: 48, marginBottom: 16 }}>📊</div>
          <h3 style={{ color: '#fff', marginBottom: 8 }}>No Assessments Yet</h3>
          <p style={{ color: '#888', marginBottom: 24 }}>Complete your first Risk Assessment to start tracking compliance.</p>
          <div style={{ fontSize: 14, color: '#6c9' }}>→ Navigate to the Risk Score tab to begin</div>
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: '400px 1fr', gap: 24 }}>
          {/* Left: Assessment List (Always Visible) */}
          <div>
            <div style={{ marginBottom: 16 }}>
              <input
                type="text"
                placeholder="Search by Product ID, Type, or Country..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                style={{ width: '100%', padding: 10, background: '#1a1a1a', border: '1px solid #444', borderRadius: 6, color: '#fff', fontSize: 14, marginBottom: 12 }}
              />
              <div style={{ display: 'flex', gap: 8, marginBottom: 8 }}>
                <select
                  value={sortBy}
                  onChange={(e) => setSortBy(e.target.value as any)}
                  style={{ flex: 1, padding: 8, background: '#1a1a1a', border: '1px solid #444', borderRadius: 6, color: '#fff', fontSize: 13 }}
                >
                  <option value="date">Newest First</option>
                  <option value="risk">Highest Risk</option>
                  <option value="productId">Product ID A-Z</option>
                </select>
              </div>
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                {(['Critical', 'High', 'Medium', 'Low'] as const).map(level => (
                  <button
                    key={level}
                    onClick={() => setFilterLevels(prev => 
                      prev.includes(level) ? prev.filter(l => l !== level) : [...prev, level]
                    )}
                    style={{
                      padding: '4px 10px',
                      fontSize: 12,
                      border: `1px solid ${getRiskColor(level)}`,
                      background: filterLevels.includes(level) ? getRiskColor(level) : 'transparent',
                      color: filterLevels.includes(level) ? '#000' : getRiskColor(level),
                      borderRadius: 4,
                      cursor: 'pointer',
                      fontWeight: 600
                    }}
                  >
                    {level}
                  </button>
                ))}
              </div>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 12, maxHeight: '70vh', overflowY: 'auto' }}>
              {filteredAssessments.map(assessment => (
                <div
                  key={assessment.id}
                  onClick={() => handleSelectAssessment(assessment, 'risk')}
                  style={{
                    background: selectedAssessment?.id === assessment.id ? '#2a2a2a' : '#1a1a1a',
                    border: `2px solid ${selectedAssessment?.id === assessment.id ? '#6c9' : '#333'}`,
                    borderRadius: 8,
                    padding: 14,
                    cursor: 'pointer',
                    transition: 'all 0.2s'
                  }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'start', marginBottom: 8 }}>
                    <div>
                      <div style={{ fontSize: 15, fontWeight: 700, color: '#fff', marginBottom: 2 }}>
                        {assessment.productId}
                      </div>
                      <div style={{ fontSize: 12, color: '#888' }}>{assessment.productType}</div>
                    </div>
                    <div style={{
                      padding: '3px 10px',
                      fontSize: 11,
                      fontWeight: 700,
                      background: getRiskColor(assessment.riskLevel),
                      color: '#000',
                      borderRadius: 12
                    }}>
                      {getRiskIcon(assessment.riskLevel)} {assessment.riskLevel}
                    </div>
                  </div>
                  <div style={{ fontSize: 12, color: '#aaa', marginBottom: 4 }}>
                    {assessment.inputMethod === 'country' ? (
                      <>
                        {getCountryFlag(assessment.declaredCountry)} {assessment.declaredCountry}
                        {assessment.declaredRegion && ` • ${assessment.declaredRegion}`}
                      </>
                    ) : (
                      <>🧪 δ18O: {assessment.d18oMean?.toFixed(1)}‰ ({assessment.d18oMin?.toFixed(1)}-{assessment.d18oMax?.toFixed(1)})</>
                    )}
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div style={{ fontSize: 11, color: '#666' }}>{formatDate(assessment.timestamp)}</div>
                    {assessment.mitigationPlan?.generated && (
                      <div 
                        onClick={(e) => {
                          e.stopPropagation()
                          handleSelectAssessment(assessment, 'testing')
                        }}
                        style={{ 
                          padding: '2px 8px', 
                          background: '#1a3a2a', 
                          border: '1px solid #6c9', 
                          borderRadius: 4, 
                          fontSize: 10, 
                          color: '#6c9',
                          fontWeight: 600,
                          cursor: 'pointer'
                        }}
                        onMouseEnter={(e) => (e.target as HTMLDivElement).style.background = '#2a4a3a'}
                        onMouseLeave={(e) => (e.target as HTMLDivElement).style.background = '#1a3a2a'}
                      >
                        🧪 Testing Plan
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Right: Detail View */}
          {selectedAssessment ? (
            <div>
              {viewMode === 'risk' ? (
                <RiskAssessmentDetailView 
                  assessment={selectedAssessment} 
                  onDelete={handleDelete} 
                  onClose={() => setSelectedAssessment(null)}
                  onOpenMitigation={handleOpenMitigation}
                  onViewTestingPlan={() => setViewMode('testing')}
                />
              ) : (
                <TestingProtocolDetailView
                  assessment={selectedAssessment}
                  onClose={() => setSelectedAssessment(null)}
                  onBackToRisk={() => setViewMode('risk')}
                  onOpenMitigation={handleOpenMitigation}
                />
              )}
            </div>
          ) : (
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '50vh', color: '#666', fontSize: 15 }}>
              ← Select an assessment to view details
            </div>
          )}
        </div>
      )}

      {showMitigation && mitigationAssessment && (
        <RiskMitigationModal
          riskResult={{
            total: mitigationAssessment.overallRisk,
            tier: mitigationAssessment.riskLevel.toLowerCase(),
            breakdown: {
              supplyChain: mitigationAssessment.supplyChainScore,
              geographic: mitigationAssessment.geographicRisk,
              isotope: mitigationAssessment.isotopicOverlap
            }
          }}
          assessmentId={mitigationAssessment.id}
          onClose={() => {
            setShowMitigation(false)
            setMitigationAssessment(null)
          }}
          onSave={(plan) => handleSaveMitigation(mitigationAssessment.id, plan)}
        />
      )}
    </div>
  )
}

function RiskAssessmentDetailView({ assessment, onDelete, onClose, onOpenMitigation, onViewTestingPlan }: { assessment: RiskAssessment; onDelete: (id: string) => void; onClose: () => void; onOpenMitigation: (assessment: RiskAssessment) => void; onViewTestingPlan: () => void }) {
  const getRiskColor = (level: string) => {
    switch (level) {
      case 'Low': return '#66cc99'
      case 'Medium': return '#ffcc33'
      case 'High': return '#ff9933'
      case 'Critical': return '#ff3333'
      default: return '#888'
    }
  }

  return (
    <div style={{ background: '#1a1a1a', border: '1px solid #333', borderRadius: 12, padding: 24 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 20 }}>
        <div>
          <h3 style={{ margin: 0, color: '#fff', fontSize: 20 }}>{assessment.productId}</h3>
          <p style={{ margin: '4px 0 0 0', color: '#888', fontSize: 14 }}>{assessment.productType}</p>
          {assessment.productDescription && (
            <p style={{ margin: '8px 0 0 0', color: '#aaa', fontSize: 13 }}>{assessment.productDescription}</p>
          )}
        </div>
        <button onClick={onClose} style={{ background: 'transparent', border: '1px solid #444', color: '#aaa', padding: '6px 12px', borderRadius: 4, cursor: 'pointer', height: 32 }}>
          ✕ Close
        </button>
      </div>

      <div style={{ display: 'inline-block', padding: '8px 20px', background: getRiskColor(assessment.riskLevel), color: '#000', borderRadius: 8, fontWeight: 700, fontSize: 18, marginBottom: 24 }}>
        {assessment.riskLevel} Risk
      </div>

      <div style={{ marginBottom: 24 }}>
        <h4 style={{ color: '#6c9', marginBottom: 12 }}>Risk Breakdown</h4>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
              <span style={{ color: '#ddd', fontSize: 13 }}>Supply Chain Transparency</span>
              <span style={{ color: '#fff', fontWeight: 600 }}>{assessment.supplyChainScore} pts</span>
            </div>
            <div style={{ height: 6, background: '#333', borderRadius: 3, overflow: 'hidden' }}>
              <div style={{ width: `${Math.min((assessment.supplyChainScore / 60) * 100, 100)}%`, height: '100%', background: '#6c9' }} />
            </div>
          </div>
          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
              <span style={{ color: '#ddd', fontSize: 13 }}>Geographic Risk</span>
              <span style={{ color: '#fff', fontWeight: 600 }}>{assessment.geographicRisk} pts</span>
            </div>
            <div style={{ height: 6, background: '#333', borderRadius: 3, overflow: 'hidden' }}>
              <div style={{ width: `${Math.min((assessment.geographicRisk / 50) * 100, 100)}%`, height: '100%', background: '#f93' }} />
            </div>
          </div>
          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
              <span style={{ color: '#ddd', fontSize: 13 }}>Isotopic Overlap</span>
              <span style={{ color: '#fff', fontWeight: 600 }}>{assessment.isotopicOverlap.toFixed(1)}%</span>
            </div>
            <div style={{ height: 6, background: '#333', borderRadius: 3, overflow: 'hidden' }}>
              <div style={{ width: `${Math.min(assessment.isotopicOverlap, 100)}%`, height: '100%', background: '#c9c' }} />
            </div>
          </div>
        </div>
      </div>

      <div style={{ marginBottom: 24 }}>
        <h4 style={{ color: '#6c9', marginBottom: 12 }}>Geographic Origin & Isotope Data</h4>
        <div style={{ background: '#222', padding: 16, borderRadius: 8 }}>
          {assessment.inputMethod === 'country' ? (
            <p style={{ margin: 0, color: '#fff', fontSize: 14, marginBottom: 8 }}>
              <strong>Declared Country:</strong> {assessment.declaredCountry}
              {assessment.declaredRegion && ` • ${assessment.declaredRegion}`}
            </p>
          ) : (
            <div style={{ marginBottom: 8 }}>
              <p style={{ margin: 0, color: '#fff', fontSize: 14, marginBottom: 4 }}>
                <strong>Direct δ18O Input:</strong>
              </p>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, fontSize: 13, color: '#aaa' }}>
                <div><strong style={{ color: '#ddd' }}>Mean:</strong> {assessment.d18oMean?.toFixed(1)}‰</div>
                <div><strong style={{ color: '#ddd' }}>Std Dev:</strong> {assessment.d18oSd?.toFixed(1) || 'estimated'}‰</div>
                <div><strong style={{ color: '#ddd' }}>Min:</strong> {assessment.d18oMin?.toFixed(1)}‰</div>
                <div><strong style={{ color: '#ddd' }}>Max:</strong> {assessment.d18oMax?.toFixed(1)}‰</div>
              </div>
            </div>
          )}
          {assessment.declaredProfile && !assessment.declaredProfile.error && (
            <div style={{ fontSize: 13, color: '#aaa', marginTop: 8, paddingTop: 8, borderTop: '1px solid #333' }}>
              <strong style={{ color: '#ddd' }}>Profile Summary:</strong>{' '}
              {assessment.declaredProfile.mean?.[0]?.toFixed(2) || 'N/A'}‰{' '}
              (range: {assessment.declaredProfile.min?.[0]?.toFixed(2)} – {assessment.declaredProfile.max?.[0]?.toFixed(2)}‰)
              {assessment.inputMethod === 'country' && (
                <span style={{ display: 'block', marginTop: 4, fontSize: 12, color: '#666' }}>
                  From geographic database
                </span>
              )}
            </div>
          )}
        </div>
      </div>

      {assessment.overlapAnalysis && (
        <div style={{ marginBottom: 24, padding: 16, background: '#222', borderRadius: 8, borderLeft: '4px solid #6c9' }}>
          <h4 style={{ marginTop: 0, marginBottom: 12, color: '#fff' }}>Isotopic Overlap Analysis</h4>
          
          <div style={{ marginBottom: 16, padding: 12, background: '#1a1a1a', borderRadius: 6 }}>
            <div style={{ fontWeight: 600, marginBottom: 8, color: '#fff' }}>Declared Region: {assessment.declaredRegion || assessment.declaredCountry}</div>
            <div style={{ fontSize: 14, color: '#ddd' }}>Expected δ18O: {assessment.overlapAnalysis.declaredProfile.mean.toFixed(1)} ± {assessment.overlapAnalysis.declaredProfile.sd.toFixed(1)} ‰</div>
            <div style={{ fontSize: 14, color: '#ddd' }}>Range: {assessment.overlapAnalysis.declaredProfile.min.toFixed(1)} - {assessment.overlapAnalysis.declaredProfile.max.toFixed(1)} ‰</div>
          </div>
          
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, fontSize: 14, marginBottom: 16 }}>
            <div>
              <div style={{ color: '#fff', marginBottom: 4 }}>Isotopic Overlap:</div>
              <div style={{ fontSize: 24, fontWeight: 600, color: assessment.overlapAnalysis.overlapPercent > 80 ? '#f33' : assessment.overlapAnalysis.overlapPercent > 50 ? '#f80' : assessment.overlapAnalysis.overlapPercent > 20 ? '#da0' : '#5a7' }}>{assessment.overlapAnalysis.overlapPercent.toFixed(0)}%</div>
            </div>
            <div>
              <div style={{ color: '#fff', marginBottom: 4 }}>Closest High-Risk:</div>
              <div style={{ fontSize: 18, fontWeight: 600, color: '#f80' }}>{assessment.overlapAnalysis.closestHighRisk}</div>
              <div style={{ fontSize: 12, color: '#fff' }}>{assessment.overlapAnalysis.distanceSD.toFixed(1)} SD apart</div>
            </div>
          </div>
          
          <div style={{ fontSize: 13 }}>
            <div style={{ fontWeight: 600, marginBottom: 6, color: '#fff' }}>High-Risk Region Profiles:</div>
            {assessment.overlapAnalysis.highRiskProfiles.map((hr: any) => (
              <div key={hr.name} style={{ marginBottom: 4, paddingLeft: 12, color: '#fff' }}>
                <span style={{ color: '#f80' }}>{hr.name}:</span> {hr.mean?.toFixed(1)} ‰ (range: {hr.min?.toFixed(1)}-{hr.max?.toFixed(1)})
              </div>
            ))}
          </div>
          
          {assessment.overlapAnalysis.separable && (
            <div style={{ marginTop: 12, padding: 10, background: '#1a3a1a', border: '1px solid #5a7', borderRadius: 4, color: '#5a7', fontSize: 13 }}>
              ✓ Isotopically distinguishable from high-risk regions ({assessment.overlapAnalysis.distanceSD.toFixed(1)} SD separation)
            </div>
          )}
          {!assessment.overlapAnalysis.separable && (
            <div style={{ marginTop: 12, padding: 10, background: '#3a2a1a', border: '1px solid #f80', borderRadius: 4, color: '#f80', fontSize: 13 }}>
              ⚠ Isotopic overlap with {assessment.overlapAnalysis.closestHighRisk} - isotopes alone cannot rule out high-risk origin
            </div>
          )}
        </div>
      )}

      <div style={{ marginBottom: 24 }}>
        <h4 style={{ color: '#6c9', marginBottom: 12 }}>Supply Chain Answers</h4>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {Object.entries(assessment.answers).map(([key, value]) => (
            <div key={key} style={{ display: 'flex', justifyContent: 'space-between', padding: 10, background: '#222', borderRadius: 6 }}>
              <span style={{ color: '#ddd', fontSize: 13 }}>{key.replace(/_/g, ' ')}</span>
              <span style={{
                padding: '2px 10px',
                fontSize: 12,
                fontWeight: 600,
                background: value === 'yes' ? '#5a7' : value === 'no' ? '#f80' : '#666',
                color: '#000',
                borderRadius: 4
              }}>
                {value.toUpperCase()}
              </span>
            </div>
          ))}
        </div>
      </div>

      <div style={{ marginBottom: 24 }}>
        <h4 style={{ color: '#6c9', marginBottom: 12 }}>Recommendations</h4>
        <div style={{ padding: 16, background: '#222', borderRadius: 6, fontSize: 14, lineHeight: 1.6 }}>
          {assessment.riskLevel === 'Critical' && (
            <>
              <div style={{ color: '#f33', fontWeight: 600, marginBottom: 8 }}>⛔ CRITICAL RISK - Likely UFLPA Violation</div>
              <ul style={{ marginLeft: 20, color: '#fff' }}>
                <li>Recommend rejecting shipment or intensive verification</li>
                <li>Isotope data suggests Xinjiang or Central Asia origin</li>
                <li>High probability of CBP detention and forced labor concerns</li>
              </ul>
            </>
          )}
          {assessment.riskLevel === 'High' && (
            <>
              <div style={{ color: '#f80', fontWeight: 600, marginBottom: 8 }}>⚠ HIGH RISK - Enhanced Due Diligence Required</div>
              <ul style={{ marginLeft: 20, color: '#fff' }}>
                <li>Request additional supplier documentation</li>
                <li>Consider independent supply chain audit</li>
                <li>Prepare for potential CBP scrutiny</li>
                {assessment.overlapAnalysis && assessment.overlapAnalysis.overlapPercent > 50 && <li>Significant isotopic overlap with {assessment.overlapAnalysis.closestHighRisk}</li>}
              </ul>
            </>
          )}
          {assessment.riskLevel === 'Medium' && (
            <>
              <div style={{ color: '#da0', fontWeight: 600, marginBottom: 8 }}>⚠ MEDIUM RISK - Some Documentation Gaps</div>
              <ul style={{ marginLeft: 20, color: '#fff' }}>
                <li>Strengthen traceability documentation</li>
                <li>Consider third-party certification</li>
                <li>Maintain detailed import records</li>
              </ul>
            </>
          )}
          {assessment.riskLevel === 'Low' && (
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
        {assessment.mitigationPlan?.generated && (
          <button
            onClick={onViewTestingPlan}
            style={{ flex: 1, padding: '10px 20px', background: '#6c9', color: '#000', border: 'none', borderRadius: 6, cursor: 'pointer', fontWeight: 600 }}
          >
            🧪 View Testing Plan
          </button>
        )}
        <button
          onClick={() => onOpenMitigation(assessment)}
          style={{ flex: 1, padding: '10px 20px', background: '#5a7', color: '#000', border: 'none', borderRadius: 6, cursor: 'pointer', fontWeight: 600 }}
        >
          {assessment.mitigationPlan?.generated ? '🔄 Update Testing Plan' : '🧪 Generate Testing Plan'}
        </button>
        <button
          onClick={() => onDelete(assessment.id)}
          style={{ padding: '10px 20px', background: '#d33', color: '#fff', border: 'none', borderRadius: 6, cursor: 'pointer', fontWeight: 600 }}
        >
          🗑️ Delete
        </button>
      </div>
    </div>
  )
}

function TestingProtocolDetailView({ assessment, onClose, onBackToRisk, onOpenMitigation }: { assessment: RiskAssessment; onClose: () => void; onBackToRisk: () => void; onOpenMitigation: (assessment: RiskAssessment) => void }) {
  if (!assessment.mitigationPlan?.generated) {
    return (
      <div style={{ background: '#1a1a1a', border: '1px solid #333', borderRadius: 12, padding: 24, textAlign: 'center' }}>
        <div style={{ fontSize: 48, marginBottom: 16 }}>🧪</div>
        <h3 style={{ color: '#fff', marginBottom: 8 }}>No Testing Plan</h3>
        <p style={{ color: '#888', marginBottom: 24 }}>Generate a testing protocol for this assessment.</p>
        <button
          onClick={() => onOpenMitigation(assessment)}
          style={{ padding: '12px 32px', background: '#6c9', color: '#000', border: 'none', borderRadius: 6, cursor: 'pointer', fontWeight: 700, fontSize: 16 }}
        >
          🧪 Generate Testing Plan
        </button>
      </div>
    )
  }

  const plan = assessment.mitigationPlan

  // Helper functions to calculate detailed protocol data
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
    const combination = (n: number, r: number): number => {
      if (r > n) return 0
      if (r === 0 || r === n) return 1
      let result = 1
      for (let i = 1; i <= r; i++) {
        result *= (n - i + 1) / i
      }
      return result
    }
    for (let x = 1; x <= Math.min(n, k); x++) {
      const numerator = combination(k, x) * combination(N - k, n - x)
      const denominator = combination(N, n)
      pDetect += numerator / denominator
    }
    return Math.min(Math.round(pDetect * 100), 99)
  }

  const calculateAQLAcceptReject = (lotSize: number, aql: number = 1.0): { acceptNumber: number, rejectNumber: number } => {
    const aqlTable: Record<string, { ac: number, re: number }> = {
      '2-8': { ac: 0, re: 1 },
      '9-15': { ac: 0, re: 1 },
      '16-25': { ac: 0, re: 1 },
      '26-50': { ac: 0, re: 1 },
      '51-90': { ac: 0, re: 1 },
      '91-150': { ac: 0, re: 1 },
      '151-280': { ac: 1, re: 2 },
      '281-500': { ac: 1, re: 2 },
      '501-1200': { ac: 2, re: 3 },
      '1201-3200': { ac: 3, re: 4 },
      '3201-10000': { ac: 5, re: 6 },
      '10001-35000': { ac: 7, re: 8 },
      '35001+': { ac: 10, re: 11 }
    }

    for (const [range, values] of Object.entries(aqlTable)) {
      if (range.includes('-')) {
        const [min, max] = range.split('-').map(Number)
        if (lotSize >= min && lotSize <= max) return { acceptNumber: values.ac, rejectNumber: values.re }
      } else if (range === '35001+' && lotSize >= 35001) {
        return { acceptNumber: values.ac, rejectNumber: values.re }
      }
    }
    return { acceptNumber: 0, rejectNumber: 1 }
  }

  // Calculate detailed protocol data
  const pooling = calculatePoolingStrategy(plan.totalSamples || 0, plan.colors || 1)
  const power = calculateStatisticalPower(plan.samplesPerColor || 1, plan.lotSize || 1)
  const costPerTest = 300
  const unpooledCost = (plan.totalSamples || 0) * costPerTest
  const { acceptNumber, rejectNumber } = calculateAQLAcceptReject(plan.lotSize || 1, plan.aql || 1.0)
  const riskTier = assessment.riskLevel?.toLowerCase() || 'medium'

  return (
    <div style={{ background: '#0a0a0a', border: '2px solid #6c9', borderRadius: 12, padding: 32, maxHeight: '90vh', overflow: 'auto' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
        <h2 style={{ margin: 0, color: '#fff' }}>Isotopic Testing Protocol</h2>
        <button onClick={onClose} style={{ background: 'transparent', border: '2px solid #6c9', color: '#6c9', padding: '8px 16px', borderRadius: 6, cursor: 'pointer', fontSize: 16, fontWeight: 600 }}>
          Close
        </button>
      </div>

      {/* Risk-Based Testing Protocol Banner */}
      <div style={{ 
        background: riskTier === 'low' ? '#1a3a2a' : riskTier === 'medium' ? '#3a3a1a' : '#3a1a1a',
        border: `2px solid ${riskTier === 'low' ? '#66cc99' : riskTier === 'medium' ? '#ffcc33' : '#ff3333'}`,
        borderRadius: 8,
        padding: 16,
        marginBottom: 20
      }}>
        <div style={{ fontSize: 14, fontWeight: 600, color: '#fff', marginBottom: 4 }}>
          Risk-Based Testing Protocol
        </div>
        <div style={{ fontSize: 13, color: '#ddd' }}>
          This protocol is calibrated for <strong>{riskTier}</strong> risk products 
          using <strong>{plan.confidenceLevel}% confidence</strong> level.
          {plan.samplingLevel !== 'high' && (
            <span style={{ display: 'block', marginTop: 8, color: '#6c9' }}>
              💰 Cost savings from risk-based sampling: reduces testing by {plan.samplingLevel === 'low' ? '70%' : '40%'} 
              compared to standard protocols.
            </span>
          )}
        </div>
      </div>

      {/* Sampling Protocol Summary */}
      <div style={{ background: '#1a1a1a', border: '2px solid #6c9', borderRadius: 8, padding: 20, marginBottom: 24 }}>
        <h3 style={{ margin: '0 0 16px 0', color: '#6c9', fontSize: 18 }}>📋 Protocol 1: AQL-Based Sampling</h3>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, color: '#ddd', fontSize: 14 }}>
          <div><strong style={{ color: '#fff' }}>Lot Size:</strong> {plan.lotSize?.toLocaleString()} units</div>
          <div><strong style={{ color: '#fff' }}>AQL Standard:</strong> {plan.aql} (ANSI/ASQ Z1.4)</div>
          <div><strong style={{ color: '#fff' }}>Colors:</strong> {plan.colors}</div>
          <div><strong style={{ color: '#fff' }}>Sizes:</strong> {plan.sizes || 'N/A'}</div>
          <div><strong style={{ color: '#fff' }}>Confidence Level:</strong> {plan.confidenceLevel}% (risk-based)</div>
          <div><strong style={{ color: '#fff' }}>Samples per Color:</strong> {plan.samplesPerColor}</div>
          <div><strong style={{ color: '#fff' }}>Total Samples:</strong> {plan.totalSamples}</div>
        </div>
      </div>

      {/* Dorfman Pooling Strategy */}
      <div style={{ background: '#1a1a1a', border: '2px solid #6c9', borderRadius: 8, padding: 20, marginBottom: 24 }}>
        <h3 style={{ margin: '0 0 16px 0', color: '#6c9', fontSize: 18 }}>🧪 Dorfman Pooling Strategy</h3>
        <p style={{ color: '#ddd', fontSize: 14, marginBottom: 16 }}>
          Pooling combines samples for initial testing, then individually tests positive pools. This reduces costs while maintaining statistical power.
        </p>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 16, color: '#ddd', fontSize: 14 }}>
          <div><strong style={{ color: '#fff' }}>Pools Created:</strong> {pooling.pools}</div>
          <div><strong style={{ color: '#fff' }}>Expected Tests:</strong> {pooling.testsRequired}</div>
          <div><strong style={{ color: '#6c9' }}>Cost Reduction:</strong> {pooling.savingsPercent}%</div>
        </div>
      </div>

      {/* Cost Estimate */}
      <div style={{ background: '#1a1a1a', border: '2px solid #f93', borderRadius: 8, padding: 20, marginBottom: 24 }}>
        <h3 style={{ margin: '0 0 16px 0', color: '#f93', fontSize: 18 }}>💰 Cost Estimate</h3>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
          <div>
            <p style={{ margin: 0, color: '#ddd', fontSize: 14 }}>Without Pooling:</p>
            <p style={{ margin: '4px 0 0 0', color: '#888', fontSize: 13 }}>{plan.totalSamples} tests × $200</p>
          </div>
          <p style={{ margin: 0, color: '#fff', fontSize: 18, fontWeight: 700, textDecoration: 'line-through' }}>
            ${unpooledCost.toLocaleString()}
          </p>
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', paddingTop: 12, borderTop: '1px solid #333' }}>
          <div>
            <p style={{ margin: 0, color: '#fff', fontSize: 15, fontWeight: 600 }}>With Pooling:</p>
            <p style={{ margin: '4px 0 0 0', color: '#888', fontSize: 13 }}>{pooling.testsRequired} tests × $200</p>
          </div>
          <p style={{ margin: 0, color: '#6c9', fontSize: 22, fontWeight: 700 }}>${plan.estimatedCost?.toLocaleString()}</p>
        </div>
      </div>

      {/* Statistical Power Analysis */}
      <div style={{ background: '#1a1a1a', border: '2px solid #c9c', borderRadius: 8, padding: 20, marginBottom: 24 }}>
        <h3 style={{ margin: '0 0 16px 0', color: '#c9c', fontSize: 18 }}>📊 Statistical Power Analysis</h3>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, color: '#ddd', fontSize: 14 }}>
          <div><strong style={{ color: '#fff' }}>Detection Power:</strong> {power}%</div>
          <div><strong style={{ color: '#fff' }}>Accept/Reject:</strong> ≤{acceptNumber} accept / ≥{rejectNumber} reject</div>
        </div>
        <p style={{ margin: '12px 0 0 0', fontSize: 13, color: '#888' }}>
          Power represents the probability of detecting contamination if 5% of the lot is non-compliant. If ≥{rejectNumber} samples fail isotopic verification, reject the entire lot.
        </p>
      </div>

      {/* Testing Instructions */}
      <div style={{ background: '#1a1a1a', border: '2px solid #6c9', borderRadius: 8, padding: 20, marginBottom: 24 }}>
        <h3 style={{ margin: '0 0 16px 0', color: '#6c9', fontSize: 18 }}>🎯 Testing Instructions</h3>
        <ol style={{ margin: 0, paddingLeft: 20, color: '#ddd', fontSize: 14, lineHeight: 1.8 }}>
          <li><strong style={{ color: '#fff' }}>Sample Selection:</strong> FloraTrace will randomly select {plan.totalSamples} garments ({plan.samplesPerColor} per color) from your shipment using systematic random sampling.</li>
          <li><strong style={{ color: '#fff' }}>Sample Shipping:</strong> Ship entire garments to FloraTrace (do not cut). We will extract cellulose from fabric samples in-house.</li>
          <li><strong style={{ color: '#fff' }}>Pooling:</strong> Samples will be combined into {pooling.pools} pools for initial δ18O analysis. Pools testing positive will undergo individual retesting.</li>
          <li><strong style={{ color: '#fff' }}>Pass/Fail Criteria:</strong> If isotopic signatures of ≥{rejectNumber} samples fall outside the declared region's expected range (considering {plan.confidenceLevel}% CI), the lot fails.</li>
          <li>
            <strong style={{ color: '#fff' }}>Decision Tree:</strong>
            <ul style={{ marginTop: 8 }}>
              <li style={{ color: '#6c9' }}>✓ <strong>Pass:</strong> All samples consistent with declared origin → Release shipment</li>
              <li style={{ color: '#f93' }}>⚠ <strong>Marginal:</strong> {acceptNumber + 1} samples fail → Request supplier documentation, consider enhanced testing</li>
              <li style={{ color: '#f33' }}>✗ <strong>Fail:</strong> ≥{rejectNumber} samples fail → Quarantine shipment, initiate supplier audit, report to CBP if UFLPA-relevant</li>
            </ul>
          </li>
        </ol>
      </div>

      {/* Protocol 2: Color × Size (if available) */}
      {plan.colorSizeSamples && (
        <div style={{ background: '#1a2a1a', border: '2px solid #5a7', borderRadius: 8, padding: 20, marginBottom: 24, marginTop: 32 }}>
          <h3 style={{ margin: '0 0 16px 0', color: '#5a7', fontSize: 18 }}>🎨 Protocol 2: Color × Size Testing</h3>
          <p style={{ color: '#ddd', fontSize: 14, marginBottom: 16 }}>
            Simplified protocol based on testing combinations of colors and sizes (no AQL calculations).
          </p>
          
          <div style={{ background: '#222', padding: 16, borderRadius: 8, marginBottom: 16 }}>
            <h4 style={{ margin: '0 0 12px 0', color: '#5a7', fontSize: 16 }}>Sampling Strategy:</h4>
            <div style={{ color: '#fff', fontSize: 15, marginBottom: 8 }}>
              Test {plan.colors} colors × {riskTier === 'low' ? '2 random sizes' : `${plan.sizes || 'all'} sizes`} = {plan.colorSizeSamples} samples
            </div>
          </div>

          <div style={{ background: '#1a1a1a', border: '1px solid #f93', borderRadius: 8, padding: 16 }}>
            <h4 style={{ margin: '0 0 12px 0', color: '#f93', fontSize: 16 }}>Cost Estimate:</h4>
            <div style={{ fontSize: 15, color: '#fff', marginBottom: 8 }}>
              <strong>Total Cost (with pooling):</strong> ${plan.colorSizePooledCost?.toLocaleString()}
            </div>
            <div style={{ fontSize: 13, color: '#aaa' }}>
              {plan.colorSizeSamples} samples → pooled testing → estimated {Math.ceil(plan.colorSizeSamples * 0.5)} tests
            </div>
          </div>
        </div>
      )}

      {/* Action Buttons */}
      <div style={{ display: 'flex', gap: 16 }}>
        <button
          onClick={onBackToRisk}
          style={{ flex: 1, background: 'transparent', border: '2px solid #6c9', color: '#6c9', padding: '12px 32px', borderRadius: 6, cursor: 'pointer', fontSize: 16, fontWeight: 600 }}
        >
          ← Back to Risk Assessment
        </button>
        <button
          onClick={() => onOpenMitigation(assessment)}
          style={{ flex: 1, background: '#5a7', color: '#000', padding: '12px 32px', border: 'none', borderRadius: 6, cursor: 'pointer', fontSize: 16, fontWeight: 700 }}
        >
          🔄 Update Plan
        </button>
        <button
          onClick={() => {
            const protocol1 = `PROTOCOL 1 (AQL-Based)\nLot: ${plan.lotSize} units | AQL ${plan.aql} | ${plan.confidenceLevel}% Confidence\nSamples: ${plan.totalSamples} (${plan.samplesPerColor}/color × ${plan.colors} colors)\nPooling: ${pooling.pools} pools → ${pooling.testsRequired} tests\nCost: $${plan.estimatedCost?.toLocaleString()} (${pooling.savingsPercent}% savings)\nPower: ${power}%\nDecision: ≤${acceptNumber} accept / ≥${rejectNumber} reject`
            const protocol2 = plan.colorSizeSamples ? `\n\n---\n\nPROTOCOL 2 (Color × Size)\nSamples: ${plan.colorSizeSamples} (${plan.colors} colors × ${riskTier === 'low' ? '2 random' : plan.sizes} sizes)\nCost: $${plan.colorSizePooledCost?.toLocaleString()}` : ''
            const planText = protocol1 + protocol2
            navigator.clipboard.writeText(planText)
            alert('Testing protocol(s) copied to clipboard!')
          }}
          style={{ flex: 1, background: '#6c9', color: '#000', padding: '12px 32px', border: 'none', borderRadius: 6, cursor: 'pointer', fontSize: 16, fontWeight: 700 }}
        >
          📋 Copy Protocol{plan.colorSizeSamples ? 's' : ''}
        </button>
      </div>

    </div>
  )
}
