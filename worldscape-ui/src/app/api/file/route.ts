import { NextRequest, NextResponse } from 'next/server'
import path from 'node:path'
import fs from 'node:fs/promises'

function getOutputBase() {
  // worldscape-ui is at .../worldscape/worldscape-ui
  // outputs live at .../worldscape/FTMapping/output
  return path.resolve(process.cwd(), '..', 'FTMapping', 'output')
}

function contentTypeFor(ext: string) {
  switch (ext.toLowerCase()) {
    case '.png':
      return 'image/png'
    case '.jpg':
    case '.jpeg':
      return 'image/jpeg'
    case '.webp':
      return 'image/webp'
    case '.csv':
      return 'text/csv; charset=utf-8'
    case '.tif':
    case '.tiff':
      return 'image/tiff'
    case '.txt':
      return 'text/plain; charset=utf-8'
    default:
      return 'application/octet-stream'
  }
}

export async function GET(req: NextRequest) {
  try {
    const p = req.nextUrl.searchParams.get('path') || ''
    const base = getOutputBase()
    const abs = path.normalize(path.join(base, p))
    if (!abs.startsWith(base)) {
      return NextResponse.json({ error: 'invalid path' }, { status: 400 })
    }
    const stat = await fs.stat(abs)
    if (stat.isDirectory()) {
      return NextResponse.json({ error: 'path is a directory' }, { status: 400 })
    }
    const data = await fs.readFile(abs)
    const ct = contentTypeFor(path.extname(abs))
    const headers = new Headers({
      'Content-Type': ct,
      'Content-Length': String(data.byteLength),
      'Content-Disposition': `inline; filename="${path.basename(abs)}"`
    })
    return new NextResponse(data, { headers })
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || 'read failed' }, { status: 404 })
  }
}
