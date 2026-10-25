import { NextRequest, NextResponse } from 'next/server'
import { computeReasonAnalysis } from '@/lib/dd-reason-analysis'

export const maxDuration = 120
export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  const brand = req.nextUrl.searchParams.get('brand') || 'DD'
  try {
    const data = await computeReasonAnalysis(brand)
    return NextResponse.json(data)
  } catch (e) {
    console.error('[reason-analysis] error:', e)
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Failed' }, { status: 500 })
  }
}
