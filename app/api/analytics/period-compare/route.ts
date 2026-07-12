import { NextRequest, NextResponse } from 'next/server'
import { computeDdRange } from '@/lib/dd-range'

export const maxDuration = 60
export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  try {
    const p = req.nextUrl.searchParams
    const aFrom = p.get('aFrom'), aTo = p.get('aTo'), bFrom = p.get('bFrom'), bTo = p.get('bTo')
    if (!aFrom || !aTo || !bFrom || !bTo) {
      return NextResponse.json({ error: 'Missing date range params' }, { status: 400 })
    }
    const [a, b] = await Promise.all([
      computeDdRange(aFrom, aTo),
      computeDdRange(bFrom, bTo),
    ])
    return NextResponse.json({ a, b })
  } catch (e) {
    console.error('[period-compare] error:', e)
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Failed to compute comparison' }, { status: 500 })
  }
}
