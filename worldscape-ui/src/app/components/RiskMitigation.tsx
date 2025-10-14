'use client'
import { useState } from 'react'

export function RiskMitigationModal({ riskScore, declaredCountry, onClose }: { riskScore: number; declaredCountry: string; onClose: () => void }) {
  const [productCategory, setProductCategory] = useState<string>('garments')
  const [garmentQty, setGarmentQty] = useState<string>('')
  const [numSKUs, setNumSKUs] = useState<string>('')
  const [numRolls, setNumRolls] = useState<string>('')
  const [testingTier, setTestingTier] = useState<string>('standard')
  const [plan, setPlan] = useState<any>(null)

  function calculatePlan() {
    const qty = parseInt(garmentQty) || 0
    const skus = parseInt(numSKUs) || 1
    const rolls = parseInt(numRolls) || 0
    
    if (qty === 0) {
      alert('Please enter garment quantity')
      return
    }
    
    // ANSI/ASQ Z1.4-2018 AQL sampling table (General Inspection Level II)
    const aqlTable = [
      { max: 500, min: 3, std: 5, enh: 8 },
      { max: 1200, min: 5, std: 8, enh: 13 },
      { max: 3200, min: 8, std: 13, enh: 20 },
      { max: 10000, min: 13, std: 20, enh: 32 },
      { max: 35000, min: 20, std: 32, enh: 50 },
      { max: 150000, min: 32, std: 50, enh: 80 },
      { max: 500000, min: 50, std: 80, enh: 125 }
    ]
    
    const tier = aqlTable.find(t => qty <= t.max) || aqlTable[aqlTable.length - 1]
    const baseSamples = testingTier === 'minimum' ? tier.min : testingTier === 'standard' ? tier.std : tier.enh
    
    // Allocate proportionally across SKUs
    const samplesPerSKU = Math.max(1, Math.ceil(baseSamples / skus))
    const totalGarments = samplesPerSKU * skus
    
    // D