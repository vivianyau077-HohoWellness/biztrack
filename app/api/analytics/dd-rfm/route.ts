import { NextResponse } from 'next/server'
import { computeDdRfm } from '@/lib/dd-rfm'

export const maxDuration = 60
export const dynamic = 'force-dynamic'

export async function GET() {
  try {
    const data = await computeDdRfm()
    return NextResponse.json(data)
  } catch (e) {
    console.error('[dd-rfm] error:', e)
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Failed' }, { status: 500 })
  }
}
