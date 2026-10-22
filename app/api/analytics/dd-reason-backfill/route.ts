import { NextResponse } from 'next/server'
import { runDdReasonBackfill } from '@/lib/dd-reason-backfill'

export const maxDuration = 300
export const dynamic = 'force-dynamic'

// Writes to Lark. Only triggered by the explicit button on the Reason Gaps page.
export async function POST() {
  try {
    const result = await runDdReasonBackfill()
    return NextResponse.json(result)
  } catch (e) {
    console.error('[dd-reason-backfill] error:', e)
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Failed' }, { status: 500 })
  }
}
