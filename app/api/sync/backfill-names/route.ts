import { NextRequest, NextResponse } from 'next/server'
import { backfillNames } from '@/lib/lark-sync'

// Targeted, fast backfill of customer names from Lark into orders.customer_name.
export const maxDuration = 60
export const dynamic = 'force-dynamic'

export async function POST(req: NextRequest) {
  try {
    const brand = req.nextUrl.searchParams.get('brand') || ''
    if (!brand) return NextResponse.json({ error: 'brand required' }, { status: 400 })
    const result = await backfillNames(brand)
    console.log('[sync/backfill-names]', brand, result)
    return NextResponse.json(result)
  } catch (e) {
    console.error('[sync/backfill-names] error:', e)
    return NextResponse.json(
      { error: e instanceof Error ? e.message : 'Backfill failed' },
      { status: 500 },
    )
  }
}
