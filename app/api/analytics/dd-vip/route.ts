import { NextResponse } from 'next/server'
import { computeDdVip } from '@/lib/dd-vip'

export const maxDuration = 60
export const dynamic = 'force-dynamic'

export async function GET() {
  try {
    const data = await computeDdVip()
    return NextResponse.json(data)
  } catch (e) {
    console.error('[dd-vip] error:', e)
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Failed' }, { status: 500 })
  }
}
