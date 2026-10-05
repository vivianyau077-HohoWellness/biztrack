import { NextResponse } from 'next/server'
import { computeNeSalesReport } from '@/lib/ne-sales-report'

export const maxDuration = 60
export const dynamic = 'force-dynamic'

export async function GET() {
  try {
    const data = await computeNeSalesReport()
    return NextResponse.json(data)
  } catch (e) {
    console.error('[ne-sales-report] error:', e)
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Failed' }, { status: 500 })
  }
}
