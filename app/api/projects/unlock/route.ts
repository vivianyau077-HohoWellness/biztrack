import { NextRequest, NextResponse } from 'next/server'

// Password gate for the Projects page (confidential).
// Set PROJECTS_PASSWORD in Vercel env to your own; falls back to the default below.
export const dynamic = 'force-dynamic'

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}))
  const password = (body?.password ?? '').toString()
  const expected = process.env.PROJECTS_PASSWORD || 'Hoho2026'
  if (password && password === expected) {
    return NextResponse.json({ ok: true })
  }
  return NextResponse.json({ ok: false }, { status: 401 })
}
