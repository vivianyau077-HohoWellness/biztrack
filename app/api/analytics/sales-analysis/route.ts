import { NextRequest, NextResponse } from 'next/server'
import { computeDdSalesAnalysis } from '@/lib/dd-sales-analysis'

export const maxDuration = 60
export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  try {
    const month = req.nextUrl.searchParams.get('month') || new Date().toISOString().slice(0, 7)
    const data = await computeDdSalesAnalysis(month)
    return NextResponse.json(data)
  } catch (e) {
    console.error('[sales-analysis] error:', e)
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Failed to compute sales analysis' }, { status: 500 })
  }
}
