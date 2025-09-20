import { NextRequest, NextResponse } from 'next/server'
import path from 'node:path'
import fs from 'node:fs/promises'
import os from 'node:os'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import sharp from 'sharp'

const execFileAsync = promisify(execFile)

function getLegacyBase() {
  return path.resolve(process.cwd(), '..', 'FTMapping', 'shapefilesEtc')
}

export async function GET(req: NextRequest) {
  try {
    const p = req.nextUrl.searchParams.get('path') || 'Model1.tif'
    const widthParam = req.nextUrl.searchParams.get('w')
    const fmtParam = (req.nextUrl.searchParams.get('format') || 'webp').toLowerCase()
    const width = Math.min(Math.max(parseInt(widthParam || '800', 10) || 800, 64), 4000)

    const base = getLegacyBase()
    const abs = path.normalize(path.join(base, p))
    if (!abs.startsWith(base)) {
      return NextResponse.json({ error: 'invalid path' }, { status: 400 })
    }
    const stat = await fs.stat(abs)
    if (stat.isDirectory()) return NextResponse.json({ error: 'path is a directory' }, { status: 400 })

    // Prefer GDAL scaling for Model1.tif quicklook
    const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'legacy-'))
    const tmpPng = path.join(tmpDir, 'out.png')
    const gdal = process.env.GDAL_TRANSLATE_BIN || '/opt/homebrew/bin/gdal_translate'
    try {
      const minq = req.nextUrl.searchParams.get('min')
      const maxq = req.nextUrl.searchParams.get('max')
      const args = ['-of','PNG','-ot','Byte','-b','1']
      if (minq && maxq) {
        args.push('-scale', String(parseFloat(minq)), String(parseFloat(maxq)), '0', '255')
      } else {
        args.push('-scale')
      }
      args.push('-outsize', String(width), '0', abs, tmpPng)
      await execFileAsync(gdal, args)
      const png = await fs.readFile(tmpPng)
      const invert = (req.nextUrl.searchParams.get('invert') || '0') !== '0'
      let buf = invert ? await sharp(png).negate().toBuffer() : png
      const tint = req.nextUrl.searchParams.get('tint') || ''
      if (tint) {
        const hex = tint.replace('#','')
        if (/^[0-9a-fA-F]{6}$/.test(hex)) {
          const r = parseInt(hex.slice(0,2), 16)
          const g = parseInt(hex.slice(2,4), 16)
          const b = parseInt(hex.slice(4,6), 16)
          const meta = await sharp(buf).metadata()
          const W = meta.width || width
          const H = meta.height || Math.round(width/2)
          const color = await sharp({ create: { width: W, height: H, channels: 3, background: { r, g, b } } }).png().toBuffer()
          buf = await sharp(color).joinChannel(buf).png().toBuffer()
        }
      }
      if (fmtParam === 'png') return new NextResponse(buf, { headers: { 'Content-Type': 'image/png' } })
      const webp = await sharp(buf).webp({ quality: 80 }).toBuffer()
      return new NextResponse(webp, { headers: { 'Content-Type': 'image/webp' } })
    } finally {
      try { await fs.rm(tmpDir, { recursive: true, force: true }) } catch {}
    }
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || 'legacy preview failed' }, { status: 500 })
  }
}


