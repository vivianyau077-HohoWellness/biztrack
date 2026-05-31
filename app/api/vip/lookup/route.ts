import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'

export const dynamic = 'force-dynamic'

const MS_PER_YEAR = 365 * 24 * 60 * 60 * 1000

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

// ── Helpers ───────────────────────────────────────────────────────────────────

function normalizePhone(raw: string): string {
  let digits = raw.replace(/\D/g, '')
  if (digits.startsWith('0')) digits = digits.slice(1)
  if (!digits.startsWith('60')) digits = '60' + digits
  return digits
}

function membershipYearFields(vipSince: string, claimedAt: string | null | undefined, now: Date) {
  const sinceMs  = new Date(vipSince).getTime()
  const elapsed  = Math.floor((now.getTime() - sinceMs) / MS_PER_YEAR)
  const yearNum  = elapsed + 1
  const yearStartMs = sinceMs + elapsed * MS_PER_YEAR
  const yearEndMs   = yearStartMs + MS_PER_YEAR

  let giftClaimedThisYear = false
  if (claimedAt) {
    const claimedMs = new Date(claimedAt).getTime()
    giftClaimedThisYear = claimedMs >= yearStartMs && claimedMs < yearEndMs
  }

  const nextClaimDate = new Date(yearEndMs).toISOString().split('T')[0]

  return { currentMembershipYear: yearNum, giftClaimedThisYear, nextClaimDate }
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

  // Fetch all orders for this phone — need is_vip, order_date, brand
  const { data: orders, error } = await supabase
    .from('orders')
    .select('order_date, total_price, is_vip, brand, customer_name')
    .eq('phone', phone)
    .order('order_date', { ascending: false })
    .limit(500)

  if (error) {
    return NextResponse.json({ error: 'Database error' }, { status: 500 })
  }

  const allOrders = orders ?? []

  // Fetch customer record
  const { data: customer } = await supabase
    .from('customers')
    .select('id, name, date_of_birth, address, birthday_gift_claimed_at, birthday_gift_claim_year')
    .eq('phone', phone)
    .maybeSingle()

  const customerName =
    customer?.name ??
    (allOrders.find(o => o.customer_name)?.customer_name as string | null) ??
    null

  const dateOfBirth   = customer?.date_of_birth   ?? null
  const address       = customer?.address          ?? null
  const giftClaimedAt = customer?.birthday_gift_claimed_at ?? null
  const giftClaimYear = customer?.birthday_gift_claim_year ?? null

  if (allOrders.length === 0) {
    return NextResponse.json({
      phone,
      found:           !!customer,
      customer_id:     customer?.id ?? null,
      status:          'not_vip',
      customerName,
      date_of_birth:   dateOfBirth,
      address,
      giftClaimedAt,
      giftClaimYear,
      giftAvailable:           false,  // no orders → not VIP → not eligible
      lastOrderDate:           null,
      current_membership_year: null,
      gift_claimed_this_year:  false,
      next_claim_date:         null,
    })
  }

  // Most recent order date (orders already sorted desc)
  const lastOrderDate = allOrders[0].order_date as string

  // Inactive = no order of any amount in past 365 days
  const daysSinceLastOrder = Math.floor(
    (now.getTime() - new Date(lastOrderDate).getTime()) / (1000 * 60 * 60 * 24),
  )
  const isInactive = daysSinceLastOrder > 365

  // VIP status comes ONLY from is_vip = true orders
  const vipOrders = allOrders.filter(o => o.is_vip === true)
  const isVip     = vipOrders.length > 0

  const vipOrdersAsc  = [...vipOrders].sort((a, b) =>
    new Date(a.order_date as string).getTime() - new Date(b.order_date as string).getTime(),
  )
  const vipOrdersDesc = [...vipOrders].sort((a, b) =>
    new Date(b.order_date as string).getTime() - new Date(a.order_date as string).getTime(),
  )

  const vipSince      = isVip ? (vipOrdersAsc[0].order_date  as string) : null
  const latestVipDate = isVip ? (vipOrdersDesc[0].order_date as string) : null
  const brand         = isVip ? (vipOrdersDesc[0].brand      as string | null) : null

  const expiryMs        = latestVipDate ? new Date(latestVipDate).getTime() + MS_PER_YEAR : null
  const expiryDate      = expiryMs ? new Date(expiryMs).toISOString().split('T')[0] : null
  const daysUntilExpiry = expiryMs
    ? Math.floor((expiryMs - now.getTime()) / (1000 * 60 * 60 * 24))
    : null

  let status: 'active' | 'expiring' | 'expired' | 'inactive' | 'not_vip'
  if (isInactive) {
    status = 'inactive'
  } else if (!isVip) {
    status = 'not_vip'
  } else if (daysUntilExpiry !== null && daysUntilExpiry < 0) {
    status = 'expired'
  } else if (daysUntilExpiry !== null && daysUntilExpiry < 30) {
    status = 'expiring'
  } else {
    status = 'active'
  }

  // Membership year fields — only meaningful when VIP
  const memberYear = vipSince
    ? membershipYearFields(vipSince, giftClaimedAt, now)
    : { currentMembershipYear: null, giftClaimedThisYear: false, nextClaimDate: null }

  const giftAvailable = isVip && !memberYear.giftClaimedThisYear

  return NextResponse.json({
    phone,
    found:           true,
    customer_id:     customer?.id ?? null,
    status,
    customerName,
    brand,
    vipSince,
    expiryDate,
    daysUntilExpiry,
    lastOrderDate,
    date_of_birth:   dateOfBirth,
    address,
    giftClaimedAt,
    giftClaimYear,
    giftAvailable,
    // Membership year fields
    current_membership_year: memberYear.currentMembershipYear,
    gift_claimed_this_year:  memberYear.giftClaimedThisYear,
    next_claim_date:         memberYear.nextClaimDate,
  })
}
