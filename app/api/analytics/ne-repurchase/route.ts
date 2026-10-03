import { NextResponse } from 'next/server'
import { computeNeRepurchase } from '@/lib/ne-repurchase'

export const maxDuration = 60
export const dynamic = 'force-dynamic'

export async function GET() {
  try {
    const data = await computeNeRepurchase()
    return NextResponse.json(data)
  } catch (e) {
    console.error('[ne-repurchase] error:', e)
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Failed' }, { status: 500 })
  }
}
