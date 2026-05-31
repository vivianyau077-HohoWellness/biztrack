import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'

export const dynamic = 'force-dynamic'

// ── Rate limiter ──────────────────────────────────────────────────────────────

const rlMap = new Map<string, number[]>()
const RL_WINDOW_MS = 60 * 60 * 1000
const RL_LIMIT = 30

function isRateLimited(ip: string): boolean {
  const now = Date.now()
  const timestamps = rlMap.get(ip) ?? []
  const recent = timestamps.filter(t => now - t < RL_WINDOW_MS)
  if (recent.length >= RL_LIMIT) return true
  recent.push(now)
  rlMap.set(ip, recent)
  return false
}

function normalizePhone(raw: string): string {
  let digits = raw.replace(/\D/g, '')
  if (digits.startsWith('0')) digits = digits.slice(1)
  if (!digits.startsWith('60')) digits = '60' + digits
  return digits
}

export async function POST(req: NextRequest) {
  const ip =
    req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ??
    req.headers.get('x-real-ip') ??
    'unknown'

  if (isRateLimited(ip)) {
    return NextResponse.json({ error: 'Too many requests. Please try again later.' }, { status: 429 })
  }

  let body: { phone?: string; date_of_birth?: string; address?: string }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 })
  }

  if (!body.phone) {
    return NextResponse.json({ error: 'Phone is required' }, { status: 400 })
  }

  const phone = normalizePhone(body.phone)
  if (phone.length < 10) {
    return NextResponse.json({ error: 'Invalid phone number' }, { status: 400 })
  }

  const updates: Record<string, string | null> = {}
  if (body.date_of_birth !== undefined) updates.date_of_birth = body.date_of_birth?.trim() || null
  if (body.address !== undefined)       updates.address = body.address?.trim() || null

  if (Object.keys(updates).length === 0) {
    return NextResponse.json({ error: 'No fields to update' }, { status: 400 })
  }

  const supabase = createAdminClient()

  // Upsert — create customer if not exists
  const { error } = await supabase
    .from('customers')
    .upsert({ phone, name: phone, ...updates }, { onConflict: 'phone', ignoreDuplicates: false })

  if (error) {
    return NextResponse.json({ error: 'Failed to update profile' }, { status: 500 })
  }

  return NextResponse.json({ success: true })
}
