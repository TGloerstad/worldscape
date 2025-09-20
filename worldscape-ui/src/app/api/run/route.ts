import { NextRequest, NextResponse } from 'next/server'

const R_API_URL = process.env.R_API_URL || 'http://127.0.0.1:8000'
const R_API_TOKEN = process.env.R_API_TOKEN || ''

export async function POST(req: NextRequest) {
  try {
    const contentType = req.headers.get('content-type') || ''
    
    // Handle inline table via JSON
    if (contentType.includes('application/json')) {
      const body = await req.json().catch(() => ({} as any)) as any
      const table = Array.isArray(body?.table) ? body.table : []
      if (!Array.isArray(table) || table.length === 0) {
        return NextResponse.json({ error: 'table must be a non-empty array' }, { status: 400 })
      }
      const url = new URL('/run', R_API_URL)
      url.searchParams.set('clear_output', 'true')
      url.searchParams.set('table_json', JSON.stringify(table))
      const res = await fetch(url, {
        method: 'POST',
        headers: {
          ...(R_API_TOKEN ? { Authorization: `Bearer ${R_API_TOKEN}` } : {}),
        },
        body: ''
      })
      const data = await res.json()
      if (!res.ok) {
        return NextResponse.json({ error: data?.error || 'R API error' }, { status: res.status })
      }
      return NextResponse.json({ ok: true, r: data })
    }

    // Handle file upload case (now just run mapping, upload was done separately)
    if (contentType.includes('multipart/form-data')) {
      const url = new URL('/run?clear_output=true', R_API_URL)
      const res = await fetch(url, {
        method: 'POST',
        headers: {
          ...(R_API_TOKEN ? { Authorization: `Bearer ${R_API_TOKEN}` } : {}),
        },
        body: ''
      })
      const data = await res.json()
      if (!res.ok) {
        return NextResponse.json({ error: data?.error || 'R API error' }, { status: res.status })
      }
      return NextResponse.json({ ok: true, r: data })
    }

    return NextResponse.json({ error: 'Expected multipart/form-data or application/json' }, { status: 400 })
  } catch (err: any) {
    return NextResponse.json({ error: err?.message || 'Unknown error' }, { status: 500 })
  }
}
