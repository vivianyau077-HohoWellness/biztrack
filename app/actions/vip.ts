'use server'

import { createAdminClient } from '@/lib/supabase/admin'

// ── Types ─────────────────────────────────────────────────────────────────────

export type VIPStatus = 'active' | 'expiring' | 'expired' | 'not_vip' | 'inactive'

export interface VIPRecord {
  phone: string
  customerName: string | null
  brand: string | null
  vipSince: string          // ISO date string — latest qualifying order date
  expiryDate: string        // ISO date string
  daysUntilExpiry: number   // negative = already expired
  status: VIPStatus
  lastOrderDate: string | null  // most recent order of any amount
  // Birthday gift
  dateOfBirth: string | null
  giftClaimedAt: string | null
  giftClaimYear: number | null
  giftAvailable: boolean    // has DOB and not claimed this calendar year
}

export interface RegistrationRate {
  thisMonth: number
  lastMonth: number
  growth: number | null     // null if lastMonth = 0
  // VIP conversion
  thisMonthVip: number      // new orders ≥RM700 with order_type = 'New' this month
  lastMonthVip: number
  thisMonthRate: number | null  // thisMonthVip / thisMonth * 100
  lastMonthRate: number | null
  // Year-to-date
  thisYearNew: number
  thisYearVip: number
  thisYearRate: number | null
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

function daysDiff(from: Date, to: Date): number {
  return Math.ceil((to.getTime() - from.getTime()) / (1000 * 60 * 60 * 24))
}

function computeActiveStatus(daysUntilExpiry: number): VIPStatus {
  if (daysUntilExpiry < 0) return 'expired'
  if (daysUntilExpiry < 30) return 'expiring'
  return 'active'
}

// ── Main server actions ───────────────────────────────────────────────────────

export async function getExternalVIPs(filters: {
  brand?: string
  status?: string
  giftStatus?: string
  search?: string
}): Promise<VIPRecord[]> {
  const supabase = createAdminClient()
  const now = new Date()

  const cutoff730 = toISODate(addDays(toISODate(now), -730))
  const cutoff365 = toISODate(addDays(toISODate(now), -365))

  // 1. Fetch qualifying orders (≥700) in past 730 days — defines the VIP universe
  const { data: orders, error } = await supabase
    .from('orders')
    .select('phone, customer_name, brand, total_price, order_date')
    .gte('total_price', 700)
    .gte('order_date', cutoff730)
    .not('phone', 'is', null)
    .order('order_date', { ascending: false })

  if (error) throw new Error(error.message)
  if (!orders || orders.length === 0) return []

  // Group by phone — track most recent qualifying order within 365 days
  type PhoneGroup = {
    phone: string
    customerName: string | null
    brand: string | null
    latestQualifyingDate: string | null  // most recent ≥700 order within 365 days (rolling expiry anchor)
    lastKnownQualifyingDate: string      // most recent ≥700 order in full 730-day window (for expired display)
  }

  const phoneMap = new Map<string, PhoneGroup>()

  for (const o of orders) {
    if (!o.phone) continue
    const phone = o.phone as string
    const orderDate = o.order_date as string
    const isWithin365 = orderDate >= cutoff365
    const existing = phoneMap.get(phone)

    if (!existing) {
      phoneMap.set(phone, {
        phone,
        customerName: o.customer_name as string | null,
        brand: o.brand as string | null,
        latestQualifyingDate: isWithin365 ? orderDate : null,
        lastKnownQualifyingDate: orderDate,
      })
    } else {
      if (!existing.customerName && o.customer_name) existing.customerName = o.customer_name as string
      if (isWithin365 && !existing.latestQualifyingDate) {
        existing.latestQualifyingDate = orderDate
        existing.brand = o.brand as string | null
      }
      // lastKnownQualifyingDate: orders are desc so first seen is already the latest
    }
  }

  const phones = Array.from(phoneMap.keys())

  // 2. Fetch most recent order (any amount) per phone in 730-day window — for inactive detection
  const { data: allRecentOrders } = await supabase
    .from('orders')
    .select('phone, order_date')
    .in('phone', phones)
    .gte('order_date', cutoff730)
    .order('order_date', { ascending: false })

  const lastOrderMap = new Map<string, string>()
  for (const o of allRecentOrders ?? []) {
    if (o.phone && !lastOrderMap.has(o.phone as string)) {
      lastOrderMap.set(o.phone as string, o.order_date as string)
    }
  }

  // 3. Fetch customer records for birthday data
  const { data: customers } = await supabase
    .from('customers')
    .select('phone, date_of_birth, birthday_gift_claimed_at, birthday_gift_claim_year')
    .in('phone', phones)

  const customerMap = new Map<string, {
    dateOfBirth: string | null
    giftClaimedAt: string | null
    giftClaimYear: number | null
  }>()
  for (const c of customers ?? []) {
    customerMap.set(c.phone, {
      dateOfBirth: c.date_of_birth ?? null,
      giftClaimedAt: c.birthday_gift_claimed_at ?? null,
      giftClaimYear: c.birthday_gift_claim_year ?? null,
    })
  }

  const currentYear = now.getFullYear()
  const results: VIPRecord[] = []

  for (const [phone, group] of Array.from(phoneMap)) {
    const lastOrderDate = lastOrderMap.get(phone) ?? null
    // Inactive: no order of any amount in past 365 days
    const isInactive = !lastOrderDate || lastOrderDate < cutoff365

    let vipSince: string
    let expiryDate: string
    let daysUntilExpiry: number
    let status: VIPStatus

    if (group.latestQualifyingDate) {
      // Active or expiring VIP — expiry rolls from their latest qualifying order
      vipSince = group.latestQualifyingDate
      const expiry = addDays(vipSince, 365)
      expiryDate = toISODate(expiry)
      daysUntilExpiry = daysDiff(now, expiry)
      status = computeActiveStatus(daysUntilExpiry)  // 'active' or 'expiring'
    } else {
      // Qualifying order was in 365–730 day window → expired or inactive
      vipSince = group.lastKnownQualifyingDate
      const expiry = addDays(vipSince, 365)
      expiryDate = toISODate(expiry)
      daysUntilExpiry = daysDiff(now, expiry)
      status = isInactive ? 'inactive' : 'expired'
    }

    const cust = customerMap.get(phone)
    const giftClaimedAt = cust?.giftClaimedAt ?? null
    const giftClaimYear = cust?.giftClaimYear ?? null
    const dateOfBirth = cust?.dateOfBirth ?? null
    const giftAvailable = !!dateOfBirth && giftClaimYear !== currentYear

    const record: VIPRecord = {
      phone,
      customerName: group.customerName,
      brand: group.brand,
      vipSince,
      expiryDate,
      daysUntilExpiry,
      status,
      lastOrderDate,
      dateOfBirth,
      giftClaimedAt,
      giftClaimYear,
      giftAvailable,
    }

    // Apply filters
    if (filters.brand && filters.brand !== 'all' && record.brand !== filters.brand) continue
    if (filters.status && filters.status !== 'all') {
      if (filters.status === 'expiring' && record.status !== 'expiring') continue
      if (filters.status === 'active' && record.status !== 'active' && record.status !== 'expiring') continue
      if (filters.status === 'expired'  && record.status !== 'expired') continue
      if (filters.status === 'inactive' && record.status !== 'inactive') continue
    }
    if (filters.giftStatus && filters.giftStatus !== 'all') {
      if (filters.giftStatus === 'claimed'     && giftClaimYear !== currentYear) continue
      if (filters.giftStatus === 'not_claimed' && giftClaimYear === currentYear) continue
    }
    if (filters.search) {
      const q = filters.search.toLowerCase()
      if (!phone.toLowerCase().includes(q) && !(record.customerName ?? '').toLowerCase().includes(q)) continue
    }

    results.push(record)
  }

  // Sort: active/expiring first (by days until expiry asc), then expired/inactive
  results.sort((a, b) => {
    const order = { active: 0, expiring: 1, expired: 2, inactive: 3, not_vip: 4 }
    const ao = order[a.status] ?? 5
    const bo = order[b.status] ?? 5
    if (ao !== bo) return ao - bo
    return a.daysUntilExpiry - b.daysUntilExpiry
  })

  return results
}

// ── DD VIP checkbox (is_vip=true) stats ──────────────────────────────────────

const DD_PROJECT_ID = '369ca28c-12a2-4dcd-856d-582b9b230766'

export interface VIPStats {
  totalVIPs: number
  newVIPsThisMonth: number
  newVIPsLastMonth: number
  newCustomersThisMonth: number
  registrationRate: number | null  // %
}

export interface LarkVIPRecord {
  id: string
  customerName: string | null
  phone: string | null
  orderDate: string | null
  totalPrice: number
  brand: string | null
}

export async function getVIPStats(): Promise<VIPStats> {
  const supabase = createAdminClient()
  const now = new Date()

  const thisMonthStart = new Date(now.getFullYear(), now.getMonth(), 1)
  const lastMonthStart = new Date(now.getFullYear(), now.getMonth() - 1, 1)
  const lastMonthEnd   = new Date(now.getFullYear(), now.getMonth(), 0)

  const [
    { count: totalVIPs },
    { count: newVIPsThisMonth },
    { count: newVIPsLastMonth },
    { count: newCustomersThisMonth },
  ] = await Promise.all([
    supabase
      .from('orders')
      .select('id', { count: 'exact', head: true })
      .eq('is_vip', true)
      .eq('project_id', DD_PROJECT_ID),

    supabase
      .from('orders')
      .select('id', { count: 'exact', head: true })
      .eq('is_vip', true)
      .eq('project_id', DD_PROJECT_ID)
      .gte('order_date', toISODate(thisMonthStart)),

    supabase
      .from('orders')
      .select('id', { count: 'exact', head: true })
      .eq('is_vip', true)
      .eq('project_id', DD_PROJECT_ID)
      .gte('order_date', toISODate(lastMonthStart))
      .lte('order_date', toISODate(lastMonthEnd)),

    supabase
      .from('orders')
      .select('id', { count: 'exact', head: true })
      .ilike('order_type', 'new')
      .eq('project_id', DD_PROJECT_ID)
      .gte('order_date', toISODate(thisMonthStart)),
  ])

  const total      = totalVIPs           ?? 0
  const newThis    = newVIPsThisMonth    ?? 0
  const newLast    = newVIPsLastMonth    ?? 0
  const newCust    = newCustomersThisMonth ?? 0
  const registrationRate = newCust === 0 ? null : Math.round((newThis / newCust) * 100)

  return { totalVIPs: total, newVIPsThisMonth: newThis, newVIPsLastMonth: newLast, newCustomersThisMonth: newCust, registrationRate }
}

export async function getLarkVIPs(): Promise<LarkVIPRecord[]> {
  const supabase = createAdminClient()

  const { data, error } = await supabase
    .from('orders')
    .select('id, customer_name, phone, order_date, total_price, brand')
    .eq('is_vip', true)
    .eq('project_id', DD_PROJECT_ID)
    .order('order_date', { ascending: false })

  if (error) throw new Error(error.message)

  return (data ?? []).map(o => ({
    id:           o.id           as string,
    customerName: o.customer_name as string | null,
    phone:        o.phone        as string | null,
    orderDate:    o.order_date   as string | null,
    totalPrice:   (o.total_price as number) ?? 0,
    brand:        o.brand        as string | null,
  }))
}

export async function markBirthdayGiftClaimed(phone: string): Promise<{ success: boolean; error?: string }> {
  const supabase = createAdminClient()
  const now = new Date()
  const currentYear = now.getFullYear()

  const { data: existing } = await supabase
    .from('customers')
    .select('id, phone')
    .eq('phone', phone)
    .maybeSingle()

  if (existing) {
    const { error } = await supabase
      .from('customers')
      .update({
        birthday_gift_claimed_at: now.toISOString(),
        birthday_gift_claim_year: currentYear,
      })
      .eq('phone', phone)

    if (error) return { success: false, error: error.message }
  } else {
    const { data: order } = await supabase
      .from('orders')
      .select('customer_name')
      .eq('phone', phone)
      .not('customer_name', 'is', null)
      .limit(1)
      .maybeSingle()

    const { error } = await supabase
      .from('customers')
      .insert({
        phone,
        name: (order?.customer_name as string) ?? phone,
        birthday_gift_claimed_at: now.toISOString(),
        birthday_gift_claim_year: currentYear,
      })

    if (error) return { success: false, error: error.message }
  }

  return { success: true }
}

export async function getRegistrationRate(): Promise<RegistrationRate> {
  const supabase = createAdminClient()
  const now = new Date()

  const thisMonthStart = new Date(now.getFullYear(), now.getMonth(), 1)
  const lastMonthStart = new Date(now.getFullYear(), now.getMonth() - 1, 1)
  const lastMonthEnd   = new Date(now.getFullYear(), now.getMonth(), 0)
  const thisYearStart  = new Date(now.getFullYear(), 0, 1)

  const [
    { count: thisMonth },
    { count: lastMonth },
    { count: thisMonthVip },
    { count: lastMonthVip },
    { count: thisYearNew },
    { count: thisYearVip },
  ] = await Promise.all([
    // Total new customer orders this month
    supabase
      .from('orders')
      .select('id', { count: 'exact', head: true })
      .ilike('order_type', 'new')
      .gte('order_date', toISODate(thisMonthStart)),

    // Total new customer orders last month
    supabase
      .from('orders')
      .select('id', { count: 'exact', head: true })
      .ilike('order_type', 'new')
      .gte('order_date', toISODate(lastMonthStart))
      .lte('order_date', toISODate(lastMonthEnd)),

    // New VIP registrations this month (new orders ≥ RM700)
    supabase
      .from('orders')
      .select('id', { count: 'exact', head: true })
      .ilike('order_type', 'new')
      .gte('total_price', 700)
      .gte('order_date', toISODate(thisMonthStart)),

    // New VIP registrations last month
    supabase
      .from('orders')
      .select('id', { count: 'exact', head: true })
      .ilike('order_type', 'new')
      .gte('total_price', 700)
      .gte('order_date', toISODate(lastMonthStart))
      .lte('order_date', toISODate(lastMonthEnd)),

    // Total new customer orders YTD
    supabase
      .from('orders')
      .select('id', { count: 'exact', head: true })
      .ilike('order_type', 'new')
      .gte('order_date', toISODate(thisYearStart)),

    // New VIP registrations YTD
    supabase
      .from('orders')
      .select('id', { count: 'exact', head: true })
      .ilike('order_type', 'new')
      .gte('total_price', 700)
      .gte('order_date', toISODate(thisYearStart)),
  ])

  const tm  = thisMonth   ?? 0
  const lm  = lastMonth   ?? 0
  const tmv = thisMonthVip ?? 0
  const lmv = lastMonthVip ?? 0
  const tyn = thisYearNew  ?? 0
  const tyv = thisYearVip  ?? 0

  const growth        = lm  === 0 ? null : Math.round(((tm - lm) / lm) * 100)
  const thisMonthRate = tm  === 0 ? null : Math.round((tmv / tm) * 100)
  const lastMonthRate = lm  === 0 ? null : Math.round((lmv / lm) * 100)
  const thisYearRate  = tyn === 0 ? null : Math.round((tyv / tyn) * 100)

  return {
    thisMonth: tm, lastMonth: lm, growth,
    thisMonthVip: tmv, lastMonthVip: lmv,
    thisMonthRate, lastMonthRate,
    thisYearNew: tyn, thisYearVip: tyv, thisYearRate,
  }
}
