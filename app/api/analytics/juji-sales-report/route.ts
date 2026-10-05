import { NextResponse } from 'next/server'
import { computeJujiSalesReport } from '@/lib/juji-sales-report'

export const maxDuration = 60
export const dynamic = 'force-dynamic'

export async function GET() {
  try {
    const data = await computeJujiSalesReport()
    return NextResponse.json(data)
  } catch (e) {
    console.error('[juji-sales-report] error:', e)
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Failed' }, { status: 500 })
  }
}
