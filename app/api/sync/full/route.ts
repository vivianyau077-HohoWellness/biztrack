import { NextRequest, NextResponse } from 'next/server'
import { runFullSync } from '@/lib/lark-sync'

// Full re-sync for one brand (re-pulls ALL records, ignoring the incremental
// cutoff) — used to backfill names/phones on older records.
export const maxDuration = 60
export const dynamic = 'force-dynamic'

export async function POST(req: NextRequest) {
  try {
    const brand = req.nextUrl.searchParams.get('brand') || ''
    if (!brand) return NextResponse.json({ error: 'brand required' }, { status: 400 })
    const result = await runFullSync(brand)
    console.log('[sync/full]', brand, result)
    return NextResponse.json(result)
  } catch (e) {
    console.error('[sync/full] error:', e)
    return NextResponse.json(
      { error: e instanceof Error ? e.message : 'Full re-sync failed' },
      { status: 500 },
    )
  }
}
