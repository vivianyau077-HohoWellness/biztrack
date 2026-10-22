import { NextResponse } from 'next/server'

// Disabled — the Purchase Reason Gaps tool has been removed (DD backfill completed).
export const dynamic = 'force-dynamic'

export async function GET() {
  return NextResponse.json({ customers: 0, rows: [] })
}
