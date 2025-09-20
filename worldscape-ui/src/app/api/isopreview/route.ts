import { NextRequest, NextResponse } from 'next/server'
import path from 'node:path'
import fs from 'node:fs/promises'
import os from 'node:os'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import sharp from 'sharp'

const execFileAsync = promisify(execFile)

function getIsoBase(scope: string) {
  const root = path.resolve(process.cwd(), '..')
  if (scope === 'model') return path.join(root, 'IsoscapeBuild', 'model')
  return path.join(root, 'IsoscapeBuild', 'data_proc')
}

export async function GET(req: NextRequest) {
  try {
    const p = req.nextUrl.searchParams.get('path') || ''
    const widthParam = req.nextUrl.searchParams.get('w')
    const fmtParam = (req.nextUrl.searchParams.get('format') || 'webp').toLowerCase()
    const scope = (req.nextUrl.searchParams.get('scope') || 'data_proc').toLowerCase()

    const width = Math.min(Math.max(parseInt(widthParam || '800', 10) || 800, 64), 4000)
    const base = getIsoBase(scope)
    const abs = path.normalize(path.join(base, p))
    if (!abs.startsWith(base)) {
      return NextResponse.json({ error: 'invalid path' }, { status: 400 })
    }
    const stat = await fs.stat(abs)
    if (stat.isDirectory()) {
      return NextResponse.json({ error: 'path is a directory' }, { status: 400 })
    }

    const ext = path.extname(abs).toLowerCase()

    // If already a web image, stream directly (no processing); PNGs are styled maps
    if (ext === '.png' || ext === '.jpg' || ext === '.jpeg' || ext === '.webp') {
      const data = await fs.readFile(abs)
      const ct = ext === '.png' ? 'image/png' : ext === '.webp' ? 'image/webp' : 'image/jpeg'
      return new NextResponse(data, { headers: { 'Content-Type': ct, 'Cache-Control': 'public, max-age=3600' } })
    }

    // For GeoTIFF/IMG rasters, prefer GDAL with scaling for a visible quicklook
    if (ext === '.tif' || ext === '.tiff' || ext === '.img') {
      const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'isoprev-'))
      const tmpPng = path.join(tmpDir, 'out.png')
      const gdal = process.env.GDAL_TRANSLATE_BIN || '/opt/homebrew/bin/gdal_translate'
      try {
        // Use computed min/max stretch if provided via query, else auto-scale
        const minq = req.nextUrl.searchParams.get('min')
        const maxq = req.nextUrl.searchParams.get('max')
        const args = ['-of','PNG','-ot','Byte','-b','1']
        if (minq && maxq) {
          const invert = (req.nextUrl.searchParams.get('invert') || '0') !== '0'
          if (invert) {
            args.push('-scale', String(parseFloat(minq)), String(parseFloat(maxq)), '255', '0')
          } else {
            args.push('-scale', String(parseFloat(minq)), String(parseFloat(maxq)), '0', '255')
          }
        } else {
          const invert = (req.nextUrl.searchParams.get('invert') || '0') !== '0'
          if (invert) {
            // No direct invert with autoscale; do default scale and invert with sharp
            args.push('-scale')
          } else {
            args.push('-scale')
          }
        }
        args.push('-outsize', String(width), '0', abs, tmpPng)
        await execFileAsync(gdal, args)
        const png = await fs.readFile(tmpPng)
        const invert = (req.nextUrl.searchParams.get('invert') || '0') !== '0'
        let imgBuf = invert ? await sharp(png).negate().toBuffer() : png
        // Optional country boundaries overlay
        const overlay = (req.nextUrl.searchParams.get('overlay') || '')
        const overlayOpacity = Math.max(0, Math.min(1, parseFloat(req.nextUrl.searchParams.get('overlayOpacity') || '0.4')))
        if (overlay === 'countries') {
          const meta = await sharp(imgBuf).metadata()
          const W = meta.width || width
          const H = meta.height || Math.round(width/2)
          const shp = process.env.COUNTRY_SHAPEFILE || path.resolve(process.cwd(), '..', 'FTMapping', 'shapefilesEtc', 'worldXUAR.shp')
          try {
            const tmpDir2 = await fs.mkdtemp(path.join(os.tmpdir(), 'isoprev-ol-'))
            const countryFilled = path.join(tmpDir2, 'country_filled.tif')
            const countryFilledPng = path.join(tmpDir2, 'country_filled.png')
            const countryOutline = path.join(tmpDir2, 'country_outline.png')
            const gdalRasterize = process.env.GDAL_RASTERIZE_BIN || '/opt/homebrew/bin/gdal_rasterize'
            const layerName = path.basename(shp, path.extname(shp))
            // Create country boundaries at higher resolution for clean lines
            const W3 = W * 3
            const H3 = H * 3
            await execFileAsync(gdalRasterize, ['-a_nodata','0','-burn','255','-at','-ot','Byte','-ts', String(W3), String(H3), '-te','-180','-90','180','90', '-l', layerName, shp, countryFilled])
            await execFileAsync(gdal, ['-of','PNG', countryFilled, countryFilledPng])
            // Create outline using edge detection and resize down
            const filled = await fs.readFile(countryFilledPng)
            const outlineColor = req.nextUrl.searchParams.get('outlineColor') || 'aaaaaa'
            let outline = await sharp(filled)
              .convolve({
                width: 3,
                height: 3,
                kernel: [-1, -1, -1, -1, 8, -1, -1, -1, -1]
              })
              .threshold(30)
              .resize(W, H, { kernel: 'mitchell' })
              .png()
              .toBuffer()
            // Apply color tint to outline if specified (use grayscale as alpha)
            if (outlineColor) {
              const hex = outlineColor.replace('#','')
              if (/^[0-9a-fA-F]{6}$/.test(hex)) {
                const r = parseInt(hex.slice(0,2), 16)
                const g = parseInt(hex.slice(2,4), 16)
                const b = parseInt(hex.slice(4,6), 16)
                const meta2 = await sharp(outline).metadata()
                const Wc = meta2.width || W
                const Hc = meta2.height || H
                const colorBase = await sharp({ create: { width: Wc, height: Hc, channels: 3, background: { r, g, b } } }).png().toBuffer()
                // Use outline grayscale as alpha channel on top of solid color
                outline = await sharp(colorBase).joinChannel(outline).png().toBuffer()
              }
            }
            await fs.writeFile(countryOutline, outline)
            const olBuf = await fs.readFile(countryOutline)
            imgBuf = await sharp(imgBuf).composite([{ input: olBuf, blend: 'over', opacity: overlayOpacity }]).png().toBuffer()
            try { await fs.rm(tmpDir2, { recursive: true, force: true }) } catch {}
          } catch (e) {
            console.warn('Country overlay failed:', e)
          }
        }
        const tint = req.nextUrl.searchParams.get('tint') || ''
        if (tint) {
          // Apply a simple monochrome tint (e.g., ff0000)
          const hex = tint.replace('#','')
          if (/^[0-9a-fA-F]{6}$/.test(hex)) {
            const r = parseInt(hex.slice(0,2), 16)
            const g = parseInt(hex.slice(2,4), 16)
            const b = parseInt(hex.slice(4,6), 16)
            // Convert grayscale to alpha mask over tinted background
            const base = await sharp({ create: { width, height: Math.round(width/2), channels: 3, background: { r, g, b } } }).png().toBuffer()
            // Resize base to match source dimensions by reading png dims
            const meta = await sharp(imgBuf).metadata()
            const W = meta.width || width
            const H = meta.height || Math.round(width/2)
            const color = await sharp({ create: { width: W, height: H, channels: 3, background: { r, g, b } } }).png().toBuffer()
            // Use grayscale as alpha mask
            imgBuf = await sharp(color).joinChannel(imgBuf).png().toBuffer()
          }
        }
        if (fmtParam === 'png') {
          return new NextResponse(imgBuf, { headers: { 'Content-Type': 'image/png', 'Cache-Control': 'public, max-age=3600' } })
        } else {
          const webp = await sharp(imgBuf).webp({ quality: 80 }).toBuffer()
          return new NextResponse(webp, { headers: { 'Content-Type': 'image/webp', 'Cache-Control': 'public, max-age=3600' } })
        }
      } finally {
        try { await fs.rm(tmpDir, { recursive: true, force: true }) } catch {}
      }
    }

    // Try Sharp for other formats
    try {
      const img = sharp(abs)
      let piped = img.resize({ width, withoutEnlargement: true })
      if (fmtParam === 'png') {
        const buf = await piped.png({ compressionLevel: 9 }).toBuffer()
        return new NextResponse(buf, { headers: { 'Content-Type': 'image/png', 'Cache-Control': 'public, max-age=3600' } })
      } else {
        const buf = await piped.webp({ quality: 80 }).toBuffer()
        return new NextResponse(buf, { headers: { 'Content-Type': 'image/webp', 'Cache-Control': 'public, max-age=3600' } })
      }
    } catch (e) {
      // Fallback to GDAL -> PNG -> optional WebP
      const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'isoprev-'))
      const tmpPng = path.join(tmpDir, 'out.png')
      const gdal = process.env.GDAL_TRANSLATE_BIN || '/opt/homebrew/bin/gdal_translate'
      try {
        await execFileAsync(gdal, ['-of', 'PNG', '-outsize', String(width), '0', abs, tmpPng])
        const png = await fs.readFile(tmpPng)
        if (fmtParam === 'png') {
          return new NextResponse(png, { headers: { 'Content-Type': 'image/png', 'Cache-Control': 'public, max-age=3600' } })
        } else {
          const webp = await sharp(png).webp({ quality: 80 }).toBuffer()
          return new NextResponse(webp, { headers: { 'Content-Type': 'image/webp', 'Cache-Control': 'public, max-age=3600' } })
        }
      } finally {
        try { await fs.rm(tmpDir, { recursive: true, force: true }) } catch {}
      }
    }
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || 'iso preview failed' }, { status: 500 })
  }
}


