import { NextRequest, NextResponse } from 'next/server'
import fs from 'node:fs/promises'
import path from 'node:path'

function getCalibrationCsv(crop: string = 'COTT') {
  // Map crop codes to calibration file names
  const cropFiles: Record<string, string> = {
    'COTT': 'cotton_calibration_enhanced.csv',
    'COFF': 'coffee_calibration.csv',
    'ONIO': 'onion_calibration.csv',
    'GARL': 'garlic_calibration.csv',
    'CHIL': 'chillies_calibration.csv'
  }
  
  const filename = cropFiles[crop.toUpperCase()] || cropFiles['COTT']
  return path.resolve(process.cwd(), '..', 'IsoscapeBuild', 'data_raw', 'calibration', filename)
}

export async function GET(req: NextRequest) {
  try {
    const u = new URL(req.url)
    const crop = u.searchParams.get('crop') || 'COTT'
    const csvPath = getCalibrationCsv(crop)
    const data = await fs.readFile(csvPath, 'utf8')
    const lines = data.split(/\r?\n/).filter(Boolean)
    if (lines.length <= 1) return NextResponse.json({ ok: true, points: [] })
    
    // Parse CSV handling quoted fields
    const parseCsvLine = (line: string): string[] => {
      const result: string[] = []
      let current = ''
      let inQuotes = false
      
      for (let i = 0; i < line.length; i++) {
        const char = line[i]
        if (char === '"') {
          inQuotes = !inQuotes
        } else if (char === ',' && !inQuotes) {
          result.push(current.trim())
          current = ''
        } else {
          current += char
        }
      }
      result.push(current.trim())
      return result
    }
    
    const header = parseCsvLine(lines[0])
    const idx = (name: string) => header.findIndex(h => h.trim().toLowerCase().replace(/"/g, '') === name)
    const iLat = idx('lat')
    const iLon = idx('lon')
    const iD18 = idx('d18o_cellulose')
    const iId  = idx('sample_id')
    
    const pts = lines.slice(1).map(row => {
      const cols = parseCsvLine(row)
      const lat = parseFloat(cols[iLat]?.replace(/"/g, '') || '')
      const lon = parseFloat(cols[iLon]?.replace(/"/g, '') || '')
      const d18 = iD18 >= 0 ? parseFloat(cols[iD18]?.replace(/"/g, '') || '') : undefined
      const id  = iId >= 0 ? cols[iId]?.replace(/"/g, '').trim() : undefined
      if (!Number.isFinite(lat) || !Number.isFinite(lon)) return null
      return { id, lat, lon, d18O: d18 }
    }).filter(Boolean)
    return NextResponse.json({ ok: true, points: pts })
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message || 'failed' }, { status: 404 })
  }
}


