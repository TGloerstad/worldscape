import { NextRequest, NextResponse } from 'next/server'
import path from 'node:path'
import fs from 'node:fs/promises'
import os from 'node:os'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'

const execFileAsync = promisify(execFile)

function getOutputBase() {
  return path.resolve(process.cwd(), '..', 'FTMapping', 'output')
}

// We assume R API has written GeoTIFF masks or we convert posterior to mask via GDAL scale
export async function GET(req: NextRequest) {
  try {
    const sample = req.nextUrl.searchParams.get('sample') || ''
    const prior = (req.nextUrl.searchParams.get('prior') || 'weighted').toLowerCase()
    const mass = parseFloat(req.nextUrl.searchParams.get('mass') || '0.95')
    const asJson = (req.nextUrl.searchParams.get('json') || '0') !== '0'
    if (!sample) return NextResponse.json({ error: 'missing sample' }, { status: 400 })
    const base = getOutputBase()
    const dir = path.join(base, sample, `${sample}, ${prior === 'weighted' ? 'Weighted' : 'Unweighted'}`)
    // Use the raw posterior probability surface instead of styled maps
    const target = path.join(dir, `${sample} posterior.tiff`)
    const exists = await fs.stat(target).then(() => true).catch(() => false)
    if (!exists) return NextResponse.json({ error: 'posterior not found' }, { status: 404 })

    const gdal = process.env.GDAL_TRANSLATE_BIN || '/opt/homebrew/bin/gdal_translate'
    const gdalinfo = process.env.GDAL_INFO_BIN || '/opt/homebrew/bin/gdalinfo'
    const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'wm-mask-'))
    const grayPng = path.join(tmpDir, 'gray.png')
    const outPng = path.join(tmpDir, 'mask.png')
    
    // Convert posterior probability surface to grayscale PNG (0-255 range)
    await execFileAsync(gdal, ['-of','PNG','-ot','Byte','-b','1', target, grayPng])
    
    // Convert grayscale to green overlay with transparency using Sharp
    const sharp = require('sharp')
    const grayData = await fs.readFile(grayPng)
    
    // Create green overlay: grayscale value becomes alpha, green color where probability > 0
    const greenOverlay = await sharp(grayData)
      .ensureAlpha()
      .raw()
      .toBuffer({ resolveWithObject: true })
    
    const { data, info } = greenOverlay
    const pixels = new Uint8Array(info.width * info.height * 4) // RGBA
    
    for (let i = 0; i < info.width * info.height; i++) {
      const gray = data[i] // grayscale value (0-255)
      const alpha = gray // use probability as alpha
      pixels[i * 4] = 80      // R - green color (#50b691)
      pixels[i * 4 + 1] = 182 // G
      pixels[i * 4 + 2] = 145 // B  
      pixels[i * 4 + 3] = alpha // A - probability-based transparency
    }
    
    await sharp(pixels, { 
      raw: { width: info.width, height: info.height, channels: 4 }
    }).png().toFile(outPng)
    
    // Get bounds from GeoTIFF
    const gdalOutput = await execFileAsync(gdalinfo, ['-json', target])
    const json = JSON.parse(gdalOutput.stdout)
    const sizeX = json.size?.[0] || 0
    const sizeY = json.size?.[1] || 0
    const gt = json.geoTransform || []
    // GeoTransform: [originX, pixelWidth, rotation, originY, rotation, pixelHeight]
    const originX = gt[0]; const pixelW = gt[1]; const originY = gt[3]; const pixelH = gt[5]
    const minX = originX
    const maxY = originY
    const maxX = originX + pixelW * sizeX
    const minY = originY + pixelH * sizeY
    // Leaflet bounds order: [[south, west],[north, east]]
    const bounds: [[number, number],[number, number]] = [[minY, minX],[maxY, maxX]]

    try {
      if (asJson) {
        const buf = await fs.readFile(outPng)
        const dataUrl = `data:image/png;base64,${buf.toString('base64')}`
        return NextResponse.json({ ok: true, png: dataUrl, bounds })
      } else {
        const data = await fs.readFile(outPng)
        return new NextResponse(data, { headers: { 'Content-Type': 'image/png', 'Cache-Control': 'no-store', 'X-Bounds': JSON.stringify(bounds) } })
      }
    } finally {
      try { await fs.rm(tmpDir, { recursive: true, force: true }) } catch {}
    }
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || 'mask failed' }, { status: 500 })
  }
}


