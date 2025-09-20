import { NextRequest, NextResponse } from 'next/server'

const R_API_URL = process.env.R_API_URL || 'http://127.0.0.1:8000'
const R_API_TOKEN = process.env.R_API_TOKEN || ''

export async function GET(req: NextRequest) {
  const u = new URL(req.url)
  const path = u.searchParams.get('path') || ''
  const upstream = `${R_API_URL}${path}`
  const res = await fetch(upstream, { cache: 'no-store' })
  const data = await res.text()
  return new NextResponse(data, { status: res.status, headers: { 'Content-Type': res.headers.get('content-type') || 'application/json' } })
}

export async function POST(req: NextRequest) {
  try {
    const contentType = req.headers.get('content-type') || ''
    if (!contentType.includes('application/json')) {
      return NextResponse.json({ error: 'Expected application/json' }, { status: 400 })
    }
    const body = await req.json().catch(() => ({} as any)) as any
    const table = Array.isArray(body?.table) ? body.table : []
    if (!Array.isArray(table) || table.length === 0) {
      return NextResponse.json({ error: 'table must be a non-empty array' }, { status: 400 })
    }
    const sigma_meas = typeof body?.sigma_meas === 'number' ? String(body.sigma_meas) : '0.3'
    const prior = (body?.prior || 'both').toString()

    const url = new URL('/worldmapping/run', R_API_URL)
    url.searchParams.set('table_json', JSON.stringify(table))
    url.searchParams.set('sigma_meas', sigma_meas)
    url.searchParams.set('prior', prior)

    const res = await fetch(url, {
      method: 'POST',
      headers: {
        ...(R_API_TOKEN ? { Authorization: `Bearer ${R_API_TOKEN}` } : {}),
      },
      body: ''
    })
    const data = await res.json()
    if (!res.ok) return NextResponse.json({ error: data?.error || 'R API error' }, { status: res.status })
    return NextResponse.json({ ok: true, r: data })
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || 'Unknown error' }, { status: 500 })
  }
}



