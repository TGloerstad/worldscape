import { NextResponse } from 'next/server'

const R_API_URL = process.env.R_API_URL || 'http://127.0.0.1:8000'
const R_API_TOKEN = process.env.R_API_TOKEN || ''

export async function GET() {
  const url = new URL('/isoscape/files', R_API_URL)
  const res = await fetch(url, { headers: { ...(R_API_TOKEN ? { Authorization: `Bearer ${R_API_TOKEN}` } : {}) } })
  const data = await res.json()
  return NextResponse.json(data, { status: res.status })
}

export async function POST() {
  return NextResponse.json({ error: 'Not allowed' }, { status: 405 })
}
