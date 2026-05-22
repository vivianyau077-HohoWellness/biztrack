import { NextRequest, NextResponse } from 'next/server'
import { runLarkSync } from '@/lib/lark-sync'

export const dynamic = 'force-dynamic'

export async function POST(req: NextRequest) {
  const cronSecret = process.env.CRON_SECRET
  if (cronSecret) {
    const auth = req.headers.get('authorization')
    if (auth !== `Bearer ${cronSecret}`) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
  }

  try {
    const result = await runLarkSync()
    console.log('[sync/lark]', result)
    return NextResponse.json(result)
  } catch (e: any) {
    console.error('[sync/lark]', e.message)
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
