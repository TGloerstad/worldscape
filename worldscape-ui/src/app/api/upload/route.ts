import { NextRequest, NextResponse } from 'next/server'
import fs from 'node:fs/promises'
import path from 'node:path'

const ABS_INPUT_DIR = process.env.FT_INPUT_DIR || '/Users/navseeker/Desktop/Projects/worldscape/FTMapping/input'

export async function POST(req: NextRequest) {
  try {
    const form = await req.formData()
    const file = form.get('file') as File
    if (!file) {
      return NextResponse.json({ error: 'No file provided' }, { status: 400 })
    }

    console.log('Next.js upload (local FS): size =', file.size, 'name =', file.name)
    const buf = Buffer.from(await file.arrayBuffer())

    await fs.mkdir(ABS_INPUT_DIR, { recursive: true })
    // Clear existing xlsx files to avoid ambiguity
    try {
      const entries = await fs.readdir(ABS_INPUT_DIR)
      await Promise.all(entries.filter(e => e.toLowerCase().endsWith('.xlsx')).map(e => fs.unlink(path.join(ABS_INPUT_DIR, e)).catch(()=>{})))
    } catch {}

    const dest = path.join(ABS_INPUT_DIR, file.name || 'uploaded.xlsx')
    await fs.writeFile(dest, buf)
    const stat = await fs.stat(dest)
    return NextResponse.json({ ok: true, filename: path.basename(dest), size: stat.size, saved_to: dest })
  } catch (err: any) {
    console.error('Next.js upload error:', err)
    return NextResponse.json({ error: err?.message || 'Upload error' }, { status: 500 })
  }
}
