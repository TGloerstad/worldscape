import { NextRequest, NextResponse } from 'next/server'
import path from 'node:path'
import fs from 'node:fs/promises'
import os from 'node:os'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import sharp from 'sharp'

const execFileAsync = promisify(execFile)

function getOutputBase() {
  return path.resolve(process.cwd(), '..', 'FTMapping', 'output')
}

export async function GET(req: NextRequest) {
  try {
    const p = req.nextUrl.searchParams.get('path') || ''
    const widthParam = req.nextUrl.searchParams.get('w')
    const fmtParam = (req.nextUrl.searchParams.get('format') || 'webp').toLowerCase()

    const width = Math.min(Math.max(parseInt(widthParam || '800', 10) || 800, 64), 4000)
    const base = getOutputBase()
    const abs = path.normalize(path.join(base, p))
    if (!abs.startsWith(base)) {
      return NextResponse.json({ error: 'invalid path' }, { status: 400 })
    }
    const stat = await fs.stat(abs)
    if (stat.isDirectory()) {
      return NextResponse.json({ error: 'path is a directory' }, { status: 400 })
    }

    const ext = path.extname(abs).toLowerCase()

    // If already a web image, just stream with cache headers
    if (ext === '.png' || ext === '.jpg' || ext === '.jpeg' || ext === '.webp') {
      const data = await fs.readFile(abs)
      const ct = ext === '.png' ? 'image/png' : ext === '.webp' ? 'image/webp' : 'image/jpeg'
      return new NextResponse(data, { headers: { 'Content-Type': ct, 'Cache-Control': 'public, max-age=3600' } })
    }

    // For GeoTIFFs, prefer GDAL so we can scale mask rasters (0/1 -> 0/255)
    if (ext === '.tif' || ext === '.tiff') {
      const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'preview-'))
      const tmpPng = path.join(tmpDir, 'out.png')
      const gdal = process.env.GDAL_TRANSLATE_BIN || '/opt/homebrew/bin/gdal_translate'
      const name = path.basename(abs).toLowerCase()
      const isMask = name.includes('world10') || name.includes('world95')
      const args = ['-of', 'PNG']
      if (isMask) args.push('-ot', 'Byte', '-scale', '0', '1', '0', '255')
      args.push('-outsize', String(width), '0', abs, tmpPng)
      try {
        await execFileAsync(gdal, args)
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

    // Fallback: non-tif via Sharp
    const img = sharp(abs)
    let piped = img.resize({ width, withoutEnlargement: true })
    if (fmtParam === 'png') {
      const buf = await piped.png({ compressionLevel: 9 }).toBuffer()
      return new NextResponse(buf, { headers: { 'Content-Type': 'image/png', 'Cache-Control': 'public, max-age=3600' } })
    } else {
      const buf = await piped.webp({ quality: 80 }).toBuffer()
      return new NextResponse(buf, { headers: { 'Content-Type': 'image/webp', 'Cache-Control': 'public, max-age=3600' } })
    }
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || 'preview failed' }, { status: 500 })
  }
}
