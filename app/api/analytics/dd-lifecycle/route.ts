import { NextResponse } from 'next/server'
import { computeDdLifecycleByPage } from '@/lib/dd-customer-insights'

export const maxDuration = 60
export const dynamic = 'force-dynamic'

export async function GET() {
  try {
    const data = await computeDdLifecycleByPage()
    return NextResponse.json(data)
  } catch (e) {
    console.error('[dd-lifecycle] error:', e)
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Failed' }, { status: 500 })
  }
}
