// redeploy trigger: pick up updated Lark credentials
import { NextResponse } from 'next/server'
import { computeDdSalesMatrix } from '@/lib/dd-sales-analysis'

export const maxDuration = 60
export const dynamic = 'force-dynamic'

export async function GET() {
  try {
    const data = await computeDdSalesMatrix()
    return NextResponse.json(data)
  } catch (e) {
    console.error('[sales-analysis] error:', e)
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Failed to compute sales analysis' }, { status: 500 })
  }
}
