import { NextResponse } from 'next/server'
import { runLarkSync } from '@/lib/lark-sync'

// Manual "Sync" button endpoint — pulls the latest data from all Lark tables
// into the database (incremental: only records changed since last sync).
export const maxDuration = 60
export const dynamic = 'force-dynamic'

export async function POST() {
  try {
    const result = await runLarkSync()
    console.log('[sync/run]', result)
    return NextResponse.json(result)
  } catch (e) {
    console.error('[sync/run] error:', e)
    return NextResponse.json(
      { error: e instanceof Error ? e.message : 'Sync failed' },
      { status: 500 },
    )
  }
}
