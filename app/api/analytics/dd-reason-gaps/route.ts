import { NextResponse } from 'next/server'
import { computeDdReasonGaps } from '@/lib/dd-reason-gaps'

export const maxDuration = 60
export const dynamic = 'force-dynamic'

export async function GET() {
  try {
    const data = await computeDdReasonGaps()
    return NextResponse.json(data)
  } catch (e) {
    console.error('[dd-reason-gaps] error:', e)
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Failed' }, { status: 500 })
  }
}
