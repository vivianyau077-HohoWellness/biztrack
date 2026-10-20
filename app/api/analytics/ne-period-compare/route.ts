import { NextResponse } from 'next/server'
import { computeNePeriodCompare } from '@/lib/ne-range'

export const maxDuration = 60
export const dynamic = 'force-dynamic'

export async function GET(req: Request) {
  try {
    const u = new URL(req.url)
    const aFrom = u.searchParams.get('aFrom') || ''
    const aTo = u.searchParams.get('aTo') || ''
    const bFrom = u.searchParams.get('bFrom') || ''
    const bTo = u.searchParams.get('bTo') || ''
    if (!aFrom || !aTo || !bFrom || !bTo) return NextResponse.json({ error: 'Missing date range' }, { status: 400 })
    const data = await computeNePeriodCompare(aFrom, aTo, bFrom, bTo)
    return NextResponse.json(data)
  } catch (e) {
    console.error('[ne-period-compare] error:', e)
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Failed' }, { status: 500 })
  }
}
