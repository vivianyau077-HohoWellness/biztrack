import { NextResponse } from 'next/server'
import { computeDdSgMonthly } from '@/lib/dd-sg-monthly'

export const maxDuration = 60
export const dynamic = 'force-dynamic'

export async function GET() {
  try {
    const data = await computeDdSgMonthly(2026)
    return NextResponse.json(data)
  } catch (e) {
    console.error('[dd-sg-monthly] error:', e)
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Failed' }, { status: 500 })
  }
}
