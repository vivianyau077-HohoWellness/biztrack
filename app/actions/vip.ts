'use server'

import { createAdminClient } from '@/lib/supabase/admin'

// ── Types ─────────────────────────────────────────────────────────────────────

export type VIPStatus = 'active' | 'expiring' | 'expired' | 'not_vip'

export interface VIPRecord {
  phone: string
  customerName: string | null
  brand: string | null
  vipSince: string          // ISO date string
  expiryDate: string        // ISO date string
  daysUntilExpiry: number   // negative = already expired
  status: VIPStatus
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

function computeStatus(daysUntilExpiry: number): VIPStatus {
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

  // Fetch orders that might qualify: price >= 700, within past 730 days (to include expired VIPs)
  const cutoff730 = toISODate(addDays(toISODate(now), -730))

  const { data: orders, error } = await supabase
    .from('orders')
    .select('phone, customer_name, brand, total_price, order_date')
    .gte('total_price', 700)
    .gte('order_date', cutoff730)
    .not('phone', 'is', null)
    .order('order_date', { ascending: false })

  if (error) throw new Error(error.message)
  if (!orders || orders.length === 0) return []

  // Group by phone — pick the most recent qualifying order (within 365 days) per phone
  const cutoff365 = toISODate(addDays(toISODate(now), -365))

  type PhoneGroup = {
    phone: string
    customerName: string | null
    brand: string | null
    bestQualifyingDate: string | null  // most recent order_date within 365 days + price >= 700
  }

  const phoneMap = new Map<string, PhoneGroup>()

  for (const o of orders) {
    if (!o.phone) continue
    const phone = o.phone as string
    const existing = phoneMap.get(phone)

    // Only overwrite with a qualifying order (within 365 days)
    const isQualifying = (o.order_date as string) >= cutoff365

    if (!existing) {
      phoneMap.set(phone, {
        phone,
        customerName: o.customer_name as string | null,
        brand: o.brand as string | null,
        bestQualifyingDate: isQualifying ? (o.order_date as string) : null,
      })
    } else {
      // Update customer name if we have one and didn't before
      if (!existing.customerName && o.customer_name) existing.customerName = o.customer_name as string
      // Track best (most recent) qualifying date
      if (isQualifying) {
        if (!existing.bestQualifyingDate || (o.order_date as string) > existing.bestQualifyingDate) {
          existing.bestQualifyingDate = o.order_date as string
          existing.brand = o.brand as string | null
        }
      }
    }
  }

  // Only include phones that have at least one order in the 730-day window
  // (those with no qualifying order in 365 days are "expired")
  const phones = Array.from(phoneMap.keys())

  // Fetch customer records for birthday data
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
    // VIP requires a qualifying order in past 365 days
    let vipSince: string
    let expiryDate: string
    let daysUntilExpiry: number
    let status: VIPStatus

    if (group.bestQualifyingDate) {
      vipSince = group.bestQualifyingDate
      const expiry = addDays(vipSince, 365)
      expiryDate = toISODate(expiry)
      daysUntilExpiry = daysDiff(now, expiry)
      status = computeStatus(daysUntilExpiry)
    } else {
      // Has orders in 730-day window but none in 365-day window → expired
      // Find the most recent order (any price >= 700) to show a "last qualified" date
      const lastOrder = orders.find(o => o.phone === phone && (o.total_price as number) >= 700)
      vipSince = lastOrder?.order_date as string ?? cutoff730
      const expiry = addDays(vipSince, 365)
      expiryDate = toISODate(expiry)
      daysUntilExpiry = daysDiff(now, expiry)
      status = 'expired'
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
      dateOfBirth,
      giftClaimedAt,
      giftClaimYear,
      giftAvailable,
    }

    // Apply filters
    if (filters.brand && filters.brand !== 'all' && record.brand !== filters.brand) continue
    if (filters.status && filters.status !== 'all') {
      if (filters.status === 'expiring' && record.status !== 'expiring') continue
      if (filters.status === 'active' && (record.status !== 'active' && record.status !== 'expiring')) continue
      if (filters.status === 'expired' && record.status !== 'expired') continue
    }
    if (filters.giftStatus && filters.giftStatus !== 'all') {
      if (filters.giftStatus === 'claimed' && giftClaimYear !== currentYear) continue
      if (filters.giftStatus === 'not_claimed' && giftClaimYear === currentYear) continue
    }
    if (filters.search) {
      const q = filters.search.toLowerCase()
      const matchPhone = phone.toLowerCase().includes(q)
      const matchName = (record.customerName ?? '').toLowerCase().includes(q)
      if (!matchPhone && !matchName) continue
    }

    results.push(record)
  }

  // Sort by days until expiry ascending (soonest expiry first, expired last)
  results.sort((a, b) => a.daysUntilExpiry - b.daysUntilExpiry)

  return results
}

export async function markBirthdayGiftClaimed(phone: string): Promise<{ success: boolean; error?: string }> {
  const supabase = createAdminClient()
  const now = new Date()
  const currentYear = now.getFullYear()

  // Upsert customer record if needed
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
    // Find customer name from orders
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

  const [{ count: thisMonth }, { count: lastMonth }] = await Promise.all([
    supabase
      .from('orders')
      .select('id', { count: 'exact', head: true })
      .ilike('order_type', 'new')
      .gte('order_date', toISODate(thisMonthStart)),

    supabase
      .from('orders')
      .select('id', { count: 'exact', head: true })
      .ilike('order_type', 'new')
      .gte('order_date', toISODate(lastMonthStart))
      .lte('order_date', toISODate(lastMonthEnd)),
  ])

  const tm = thisMonth ?? 0
  const lm = lastMonth ?? 0
  const growth = lm === 0 ? null : Math.round(((tm - lm) / lm) * 100)

  return { thisMonth: tm, lastMonth: lm, growth }
}
