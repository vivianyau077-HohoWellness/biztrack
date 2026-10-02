import { NextResponse } from 'next/server'
import { computeDdRepurchase } from '@/lib/dd-repurchase'

export const maxDuration = 60
export const dynamic = 'force-dynamic'

export async function GET() {
  try {
    const data = await computeDdRepurchase()
    return NextResponse.json(data)
  } catch (e) {
    console.error('[dd-repurchase] error:', e)
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Failed' }, { status: 500 })
  }
}
