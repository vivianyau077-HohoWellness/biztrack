import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'

export const dynamic = 'force-dynamic'

// ── Rate limiter (in-memory, resets on cold start) ────────────────────────────

const rlMap = new Map<string, number[]>()
const RL_WINDOW_MS = 60 * 60 * 1000 // 1 hour
const RL_LIMIT = 20

function isRateLimited(ip: string): boolean {
  const now = Date.now()
  const timestamps = rlMap.get(ip) ?? []
  const recent = timestamps.filter(t => now - t < RL_WINDOW_MS)
  if (recent.length >= RL_LIMIT) return true
  recent.push(now)
  rlMap.set(ip, recent)
  return false
}

// Periodically prune old entries to avoid memory leak
setInterval(() => {
  const now = Date.now()
  for (const [ip, ts] of Array.from(rlMap)) {
    const fresh = ts.filter(t => now - t < RL_WINDOW_MS)
    if (fresh.length === 0) rlMap.delete(ip)
    else rlMap.set(ip, fresh)
  }
}, 10 * 60 * 1000)

// ── Phone normalization ───────────────────────────────────────────────────────

function normalizePhone(raw: string): string {
  let digits = raw.replace(/\D/g, '')
  if (digits.startsWith('0')) digits = digits.slice(1)
  if (!digits.startsWith('60')) digits = '60' + digits
  return digits
}

// ── VIP status types (mirrored from actions/vip.ts for API use) ───────────────

function toISODate(d: Date): string {
  return d.toISOString().split('T')[0]
}

function addDays(dateStr: string, days: number): Date {
  const d = new Date(dateStr)
  d.setDate(d.getDate() + days)
  return d
}

// ── Handler ───────────────────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  // Rate limit by IP
  const ip =
    req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ??
    req.headers.get('x-real-ip') ??
    'unknown'

  if (isRateLimited(ip)) {
    return NextResponse.json(
      { error: 'Too many requests. Please try again later.' },
      { status: 429 },
    )
  }

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
  if (phone.length < 10) {
    return NextResponse.json({ error: 'Invalid phone number' }, { status: 400 })
  }

  const supabase = createAdminClient()
  const now = new Date()
  const cutoff365 = toISODate(addDays(toISODate(now), -365))

  // Fetch qualifying orders for this phone
  const { data: orders, error } = await supabase
    .from('orders')
    .select('total_price, order_date, brand, customer_name')
    .eq('phone', phone)
    .gte('total_price', 700)
    .order('order_date', { ascending: false })

  if (error) {
    return NextResponse.json({ error: 'Database error' }, { status: 500 })
  }

  // Check VIP eligibility
  const qualifyingOrders = (orders ?? []).filter(
    o => (o.order_date as string) >= cutoff365,
  )

  if (qualifyingOrders.length === 0) {
    return NextResponse.json({
      phone,
      found: orders && orders.length > 0,
      status: 'not_vip',
      customerName: orders?.[0]?.customer_name ?? null,
    })
  }

  // Most recent qualifying order
  const best = qualifyingOrders[0]
  const vipSince = best.order_date as string
  const expiry = addDays(vipSince, 365)
  const expiryDate = toISODate(expiry)
  const daysUntilExpiry = Math.ceil((expiry.getTime() - now.getTime()) / (1000 * 60 * 60 * 24))
  const vipStatus = daysUntilExpiry < 30 ? 'expiring' : 'active'

  // Fetch customer record for birthday gift data
  const { data: customer } = await supabase
    .from('customers')
    .select('name, date_of_birth, birthday_gift_claimed_at, birthday_gift_claim_year')
    .eq('phone', phone)
    .maybeSingle()

  const currentYear = now.getFullYear()
  const dateOfBirth = customer?.date_of_birth ?? null
  const giftClaimedAt = customer?.birthday_gift_claimed_at ?? null
  const giftClaimYear = customer?.birthday_gift_claim_year ?? null
  const giftAvailable = !!dateOfBirth && giftClaimYear !== currentYear

  return NextResponse.json({
    phone,
    found: true,
    status: vipStatus,
    customerName: (customer?.name ?? (best.customer_name as string | null)),
    brand: best.brand,
    vipSince,
    expiryDate,
    daysUntilExpiry,
    dateOfBirth,
    giftClaimedAt,
    giftClaimYear,
    giftAvailable,
  })
}
