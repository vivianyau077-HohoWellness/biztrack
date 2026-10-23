import { NextResponse } from 'next/server'
import { computeDdReasonAnalysis } from '@/lib/dd-reason-analysis'

export const maxDuration = 120
export const dynamic = 'force-dynamic'

export async function GET() {
  try {
    const data = await computeDdReasonAnalysis()
    return NextResponse.json(data)
  } catch (e) {
    console.error('[dd-reason-analysis] error:', e)
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Failed' }, { status: 500 })
  }
}
