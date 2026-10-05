import { NextResponse } from 'next/server'
import { computeBrandTopCustomers } from '@/lib/brand-top-customers'

export const maxDuration = 60
export const dynamic = 'force-dynamic'

export async function GET(req: Request) {
  try {
    const brand = new URL(req.url).searchParams.get('brand') || ''
    const top10 = await computeBrandTopCustomers(brand)
    return NextResponse.json({ top10 })
  } catch (e) {
    console.error('[brand-top-customers] error:', e)
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Failed' }, { status: 500 })
  }
}
