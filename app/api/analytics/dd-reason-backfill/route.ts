import { NextResponse } from 'next/server'

// Disabled. The purchase-reason backfill was done once directly; the dashboard app
// has no write permission to the DD base, so this endpoint is intentionally a no-op.
export const dynamic = 'force-dynamic'

export async function POST() {
  return NextResponse.json({ error: 'Backfill is disabled.' }, { status: 410 })
}
