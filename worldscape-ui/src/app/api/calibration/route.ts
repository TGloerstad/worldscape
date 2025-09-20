import { NextRequest, NextResponse } from 'next/server'
import fs from 'node:fs/promises'
import path from 'node:path'

function getCalibrationCsv() {
  // ../../IsoscapeBuild/data_raw/calibration/cotton_calibration_enhanced.csv
  return path.resolve(process.cwd(), '..', 'IsoscapeBuild', 'data_raw', 'calibration', 'cotton_calibration_enhanced.csv')
}

export async function GET(req: NextRequest) {
  try {
    const csvPath = getCalibrationCsv()
    const data = await fs.readFile(csvPath, 'utf8')
    const lines = data.split(/\r?\n/).filter(Boolean)
    if (lines.length <= 1) return NextResponse.json({ ok: true, points: [] })
    const header = lines[0].split(',')
    const idx = (name: string) => header.findIndex(h => h.trim().toLowerCase() === name)
    const iLat = idx('lat')
    const iLon = idx('lon')
    const iD18 = idx('d18o_cellulose')
    const iId  = idx('sample_id')
    const pts = lines.slice(1).map(row => {
      const cols = row.split(',')
      const lat = parseFloat(cols[iLat])
      const lon = parseFloat(cols[iLon])
      const d18 = iD18 >= 0 ? parseFloat(cols[iD18]) : undefined
      const id  = iId >= 0 ? cols[iId] : undefined
      if (!Number.isFinite(lat) || !Number.isFinite(lon)) return null
      return { id, lat, lon, d18O: d18 }
    }).filter(Boolean)
    return NextResponse.json({ ok: true, points: pts })
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message || 'failed' }, { status: 404 })
  }
}


