import { NextRequest, NextResponse } from 'next/server'

const R_API_URL = process.env.R_API_URL || 'http://127.0.0.1:8000'
const R_API_TOKEN = process.env.R_API_TOKEN || ''

function headers() {
  return { ...(R_API_TOKEN ? { Authorization: `Bearer ${R_API_TOKEN}` } : {}) }
}

export async function GET() {
  // Default GET returns metadata about sources instead of just files
  const url = new URL('/isoscape/metadata', R_API_URL)
  const res = await fetch(url, { headers: headers() })
  const data = await res.json()
  return NextResponse.json(data, { status: res.status })
}

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({})) as any
  const action = (body?.action || '').toString()
  const crop = (body?.crop || 'COTT').toString()
  if (action === 'fetch') {
    const url = new URL('/isoscape/fetch', R_API_URL)
    url.searchParams.set('crop', crop)
    const sources = Array.isArray(body?.sources) ? body.sources.join(',') : (body?.sources || '')
    const timeout = body?.timeout ? String(body.timeout) : ''
    if (sources) url.searchParams.set('sources', sources)
    if (timeout) url.searchParams.set('timeout', timeout)
    const res = await fetch(url, { method: 'POST', headers: headers() })
    const data = await res.json()
    return NextResponse.json(data, { status: res.status })
  }
  if (action === 'model') {
    const url = new URL('/isoscape/model', R_API_URL)
    url.searchParams.set('crop', crop)
    const res = await fetch(url, { method: 'POST', headers: headers() })
    const data = await res.json()
    return NextResponse.json(data, { status: res.status })
  }
  return NextResponse.json({ error: 'unknown action' }, { status: 400 })
}
