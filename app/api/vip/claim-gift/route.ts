import { NextRequest, NextResponse } from 'next/server'
import { markBirthdayGiftClaimed } from '@/app/actions/vip'

export const dynamic = 'force-dynamic'

function normalizePhone(raw: string): string {
  let digits = raw.replace(/\D/g, '')
  if (digits.startsWith('0')) digits = digits.slice(1)
  if (!digits.startsWith('60')) digits = '60' + digits
  return digits
}

export async function POST(req: NextRequest) {
  let body: { phone?: string }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 })
  }

  if (!body.phone) {
    return NextResponse.json({ error: 'Phone number is required' }, { status: 400 })
  }

  const phone = normalizePhone(body.phone)
  const result = await markBirthdayGiftClaimed(phone)

  if (!result.success) {
    return NextResponse.json({ error: result.error }, { status: 500 })
  }

  return NextResponse.json({ success: true })
}
