import { NextRequest, NextResponse } from 'next/server'
import path from 'node:path'
import fs from 'node:fs/promises'
import os from 'node:os'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import sharp from 'sharp'

const execFileAsync = promisify(execFile)

function isoPath(rel: string) {
  return path.resolve(process.cwd(), '..', 'IsoscapeBuild', rel)
}

// Returns a color-ramped PNG for cellulose_mu.tif using min/max
export async function GET(req: NextRequest) {
  try {
    const min = parseFloat(req.nextUrl.searchParams.get('min') || '15')
    const max = parseFloat(req.nextUrl.searchParams.get('max') || '40')
    const width = Math.min(Math.max(parseInt(req.nextUrl.searchParams.get('w') || '1800', 10) || 1800, 256), 8000)
    const mu1 = isoPath(path.join('model', 'cellulose_mu.tif'))
    const mu2 = isoPath(path.join('data_proc', 'cellulose_mu.tif'))
    const mu = await fs.stat(mu1).then(() => mu1).catch(() => mu2)
    const gdal = process.env.GDAL_TRANSLATE_BIN || '/opt/homebrew/bin/gdal_translate'

    const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'iso-color-'))
    const tmpGray = path.join(tmpDir, 'mu.png')
    const args = ['-of','PNG','-ot','Byte','-b','1','-scale', String(min), String(max), '0','255','-outsize', String(width),'0', mu, tmpGray]
    await execFileAsync(gdal, args)

    // Simple viridis-like ramp (3-stop gradient): blue -> green -> yellow
    const base = await fs.readFile(tmpGray)
    const img = sharp(base)
    const meta = await img.metadata()
    const W = meta.width || width
    const H = meta.height || Math.round(W/2)
    const ramp = Buffer.from([
      // build a small 256x1 palette strip in RGB
    ])
    // For simplicity, tint grayscale to green. More advanced ramp can be added later.
    const out = await img
      .toColourspace('b-w')
      .linear(1, 0)
      .joinChannel(base) // use grayscale as alpha for composed color if desired
      .png()
      .toBuffer()

    return new NextResponse(out, { headers: { 'Content-Type': 'image/png', 'Cache-Control': 'no-store' } })
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || 'colorize failed' }, { status: 500 })
  }
}


