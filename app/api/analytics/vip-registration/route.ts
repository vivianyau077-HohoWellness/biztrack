import { NextResponse } from 'next/server'
import { computeVipRegistration } from '@/app/actions/vip-analytics'

// Reads 5000+ rows from the Lark "2026 daily order" table, so it needs more than
// the default 10s. Hobby plan allows up to 60s.
export const maxDuration = 60
export const dynamic = 'force-dynamic'

export async function GET() {
  try {
    const data = await computeVipRegistration()
    return NextResponse.json(data)
  } catch (e) {
    console.error('[vip-registration] error:', e)
    return NextResponse.json(
      { error: e instanceof Error ? e.message : 'Failed to load VIP registration' },
      { status: 500 },
    )
  }
}
