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

// ── Helpers ───────────────────────────────────────────────────────────────────

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

  // Fetch all orders for this phone (any amount) — needed for inactive detection
  const { data: orders, error } = await supabase
    .from('orders')
    .select('total_price, order_date, brand, customer_name')
    .eq('phone', phone)
    .order('order_date', { ascending: false })
    .limit(500)

  if (error) {
    return NextResponse.json({ error: 'Database error' }, { status: 500 })
  }

  const allOrders = orders ?? []

  if (allOrders.length === 0) {
    // Check if the customer exists without orders
    const { data: customer } = await supabase
      .from('customers')
      .select('name, date_of_birth')
      .eq('phone', phone)
      .maybeSingle()

    return NextResponse.json({
      phone,
      found: !!customer,
      status: 'not_vip',
      customerName: customer?.name ?? null,
    })
  }

  // Most recent order of any amount — for inactive detection
  const lastOrder = allOrders[0]  // already sorted desc
  const lastOrderDate = lastOrder.order_date as string
  const isInactive = lastOrderDate < cutoff365

  // Qualifying orders: ≥RM700, ordered desc (most recent first for rolling expiry)
  const qualifyingOrders = allOrders
    .filter(o => (o.total_price as number) >= 700)
    .sort((a, b) => new Date(b.order_date as string).getTime() - new Date(a.order_date as string).getTime())

  // Latest qualifying order determines rolling expiry anchor
  const latestQualifying = qualifyingOrders[0] ?? null
  const latestQualifyingWithin365 = qualifyingOrders.find(
    o => (o.order_date as string) >= cutoff365
  ) ?? null

  // Fetch customer record for birthday gift data + name
  const { data: customer } = await supabase
    .from('customers')
    .select('name, date_of_birth, birthday_gift_claimed_at, birthday_gift_claim_year')
    .eq('phone', phone)
    .maybeSingle()

  const customerName = customer?.name ?? (allOrders.find(o => o.customer_name)?.customer_name as string | null) ?? null
  const currentYear = now.getFullYear()
  const dateOfBirth = customer?.date_of_birth ?? null
  const giftClaimedAt = customer?.birthday_gift_claimed_at ?? null
  const giftClaimYear = customer?.birthday_gift_claim_year ?? null
  const giftAvailable = !!dateOfBirth && giftClaimYear !== currentYear

  if (!latestQualifying) {
    // Has orders but none qualify for VIP
    return NextResponse.json({
      phone,
      found: true,
      status: isInactive ? 'inactive' : 'not_vip',
      customerName,
      lastOrderDate,
      dateOfBirth,
      giftClaimedAt,
      giftClaimYear,
      giftAvailable,
    })
  }

  // Determine VIP status based on most recent qualifying order (rolling expiry)
  const vipSince = latestQualifyingWithin365
    ? (latestQualifyingWithin365.order_date as string)
    : (latestQualifying.order_date as string)

  const expiry = addDays(vipSince, 365)
  const expiryDate = toISODate(expiry)
  const daysUntilExpiry = Math.ceil((expiry.getTime() - now.getTime()) / (1000 * 60 * 60 * 24))

  let status: string
  if (isInactive) {
    status = 'inactive'
  } else if (daysUntilExpiry < 0) {
    status = 'expired'
  } else if (daysUntilExpiry < 30) {
    status = 'expiring'
  } else {
    status = 'active'
  }

  const brand = (latestQualifyingWithin365 ?? latestQualifying).brand

  return NextResponse.json({
    phone,
    found: true,
    status,
    customerName,
    brand,
    vipSince,
    expiryDate,
    daysUntilExpiry,
    lastOrderDate,
    dateOfBirth,
    giftClaimedAt,
    giftClaimYear,
    giftAvailable,
  })
}
