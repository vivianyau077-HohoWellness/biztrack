import { NextResponse } from 'next/server'
import { computeNeRfm } from '@/lib/ne-rfm'

export const maxDuration = 60
export const dynamic = 'force-dynamic'

export async function GET() {
  try {
    const data = await computeNeRfm()
    return NextResponse.json(data)
  } catch (e) {
    console.error('[ne-rfm] error:', e)
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Failed' }, { status: 500 })
  }
}
