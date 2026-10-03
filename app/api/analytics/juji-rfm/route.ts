import { NextResponse } from 'next/server'
import { computeJujiRfm } from '@/lib/juji-rfm'

export const maxDuration = 60
export const dynamic = 'force-dynamic'

export async function GET() {
  try {
    const data = await computeJujiRfm()
    return NextResponse.json(data)
  } catch (e) {
    console.error('[juji-rfm] error:', e)
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Failed' }, { status: 500 })
  }
}
