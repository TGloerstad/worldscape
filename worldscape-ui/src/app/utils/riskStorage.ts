export interface RiskAssessment {
  id: string
  timestamp: number
  productId: string
  productType: string
  productDescription?: string
  
  // Input method selection
  inputMethod: 'country' | 'd18o'
  
  // Country-based input
  declaredCountry: string
  declaredRegion: string
  
  // Direct d18O input
  d18oMean?: number
  d18oMin?: number  
  d18oMax?: number
  d18oSd?: number
  
  declaredProfile: {
    mean: number
    min: number
    max: number
    sd: number
    median?: number
    q25?: number
    q75?: number
  } | null
  
  answers: Record<string, 'yes'|'no'|'unknown'>
  
  supplyChainScore: number
  geographicRisk: number
  isotopicOverlap: number
  overallRisk: number
  riskLevel: 'Low' | 'Medium' | 'High' | 'Critical'
  
  recommendations: string[]
  
  // Full overlap analysis data for detailed dashboard view
  overlapAnalysis?: {
    declaredProfile: {
      mean: number
      min: number
      max: number
      sd: number
    }
    overlapPercent: number
    closestHighRisk: string
    closestOverlapPercent: number
    distanceSD: number
    separable: boolean
    highRiskProfiles: Array<{
      name: string
      mean: number
      min: number
      max: number
    }>
  }
  
  mitigationPlan?: {
    generated: boolean
    timestamp?: number
    lotSize?: number
    colors?: number
    sizes?: number
    samplingLevel?: 'low' | 'medium' | 'high'
    totalSamples?: number
    samplesPerColor?: number
    estimatedCost?: number
    confidenceLevel?: number
    aql?: number
    testLocation?: 'garment' | 'fabric'
    // Protocol 2: Color × Size
    colorSizeSamples?: number
    colorSizePooledCost?: number
  }
}

const STORAGE_KEY = 'worldscape_risk_assessments'

export function saveAssessment(assessment: RiskAssessment): void {
  try {
    const existing = getAllAssessments()
    const updated = [...existing, assessment]
    localStorage.setItem(STORAGE_KEY, JSON.stringify(updated))
  } catch (error) {
    console.error('Failed to save assessment:', error)
    throw new Error('Storage limit exceeded. Please delete old assessments.')
  }
}

export function getAllAssessments(): RiskAssessment[] {
  try {
    const stored = localStorage.getItem(STORAGE_KEY)
    if (!stored) return []
    const parsed = JSON.parse(stored)
    return Array.isArray(parsed) ? parsed : []
  } catch (error) {
    console.error('Failed to load assessments:', error)
    return []
  }
}

export function getAssessmentById(id: string): RiskAssessment | null {
  const all = getAllAssessments()
  return all.find(a => a.id === id) || null
}

export function deleteAssessment(id: string): void {
  const all = getAllAssessments()
  const filtered = all.filter(a => a.id !== id)
  localStorage.setItem(STORAGE_KEY, JSON.stringify(filtered))
}

export function deleteMultipleAssessments(ids: string[]): void {
  const all = getAllAssessments()
  const filtered = all.filter(a => !ids.includes(a.id))
  localStorage.setItem(STORAGE_KEY, JSON.stringify(filtered))
}

export function updateAssessment(id: string, updates: Partial<RiskAssessment>): void {
  const all = getAllAssessments()
  const index = all.findIndex(a => a.id === id)
  if (index === -1) return
  
  all[index] = { ...all[index], ...updates }
  localStorage.setItem(STORAGE_KEY, JSON.stringify(all))
}

export function getSummaryStats() {
  const all = getAllAssessments()
  return {
    total: all.length,
    critical: all.filter(a => a.riskLevel === 'Critical').length,
    high: all.filter(a => a.riskLevel === 'High').length,
    medium: all.filter(a => a.riskLevel === 'Medium').length,
    low: all.filter(a => a.riskLevel === 'Low').length,
    dateRange: all.length > 0 
      ? {
          earliest: Math.min(...all.map(a => a.timestamp)),
          latest: Math.max(...all.map(a => a.timestamp))
        }
      : null
  }
}

export function searchAssessments(query: string): RiskAssessment[] {
  const all = getAllAssessments()
  const lowerQuery = query.toLowerCase()
  return all.filter(a => 
    a.productId.toLowerCase().includes(lowerQuery) ||
    a.productType.toLowerCase().includes(lowerQuery) ||
    a.declaredCountry.toLowerCase().includes(lowerQuery) ||
    a.declaredRegion.toLowerCase().includes(lowerQuery) ||
    (a.productDescription || '').toLowerCase().includes(lowerQuery)
  )
}

export function sortAssessments(
  assessments: RiskAssessment[],
  sortBy: 'date' | 'risk' | 'productId'
): RiskAssessment[] {
  const sorted = [...assessments]
  switch (sortBy) {
    case 'date':
      return sorted.sort((a, b) => b.timestamp - a.timestamp)
    case 'risk':
      return sorted.sort((a, b) => b.overallRisk - a.overallRisk)
    case 'productId':
      return sorted.sort((a, b) => a.productId.localeCompare(b.productId))
    default:
      return sorted
  }
}

export function filterByRiskLevel(
  assessments: RiskAssessment[],
  levels: Array<'Low' | 'Medium' | 'High' | 'Critical'>
): RiskAssessment[] {
  if (levels.length === 0) return assessments
  return assessments.filter(a => levels.includes(a.riskLevel))
}

