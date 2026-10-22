import { NextResponse } from 'next/server'
import { computeBrandLifecycle } from '@/lib/brand-lifecycle'

export const maxDuration = 60
export const dynamic = 'force-dynamic'

export async function GET(req: Request) {
  try {
    const brand = new URL(req.url).searchParams.get('brand') || ''
    const data = await computeBrandLifecycle(brand)
    return NextResponse.json(data)
  } catch (e) {
    console.error('[brand-lifecycle] error:', e)
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Failed' }, { status: 500 })
  }
}
