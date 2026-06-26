import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'

// Customers (deduped by phone) whose most recent order is more than `days` ago.
// Computed over all orders (all-time), scoped by project_id (brand) when given.
export const maxDuration = 60
export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  try {
    const projectId = req.nextUrl.searchParams.get('projectId') || ''
    const days = Number(req.nextUrl.searchParams.get('days') || '90') || 90
    const sb = createAdminClient()

    const now = new Date()
    const cutoff = new Date(now)
    cutoff.setDate(cutoff.getDate() - days)
    const cutoffStr = cutoff.toISOString().split('T')[0]
    // Only customers whose LAST order is in 2026 (ordered in 2026, then no repurchase in `days` days).
    const since = req.nextUrl.searchParams.get('since') || '2026-01-01'

    // Normalize phone for display: strip dashes/spaces, leading 0 -> 60 (MY), keep 60/65.
    const normPhone = (raw: string): string => {
      const d = (raw ?? '').toString().replace(/\D/g, '')
      if (!d) return ''
      if (d.startsWith('60') || d.startsWith('65')) return d
      if (d.startsWith('0')) return '6' + d
      return d
    }

    // phone (raw) -> { name, last order date, package, price }
    const map = new Map<string, { name: string; last: string; pkg: string; price: number }>()
    const PAGE = 1000
    let offset = 0
    while (true) {
      let q = sb
        .from('orders')
        .select('phone, customer_name, order_date, package_name, total_price')
        .not('phone', 'is', null)
        .not('order_date', 'is', null)
      if (projectId) q = q.eq('project_id', projectId)
      const { data, error } = await q.range(offset, offset + PAGE - 1)
      if (error) throw new Error(error.message)
      if (!data || data.length === 0) break
      for (const r of data as { phone: string | null; customer_name: string | null; order_date: string | null; package_name: string | null; total_price: number | null }[]) {
        const p = (r.phone ?? '').toString().trim()
        if (!p || p === '0' || !r.order_date) continue
        const existing = map.get(p)
        if (!existing) {
          map.set(p, { name: r.customer_name ?? '', last: r.order_date, pkg: r.package_name ?? '', price: Number(r.total_price) || 0 })
        } else {
          if (r.order_date > existing.last) {
            existing.last = r.order_date
            existing.pkg = r.package_name ?? ''
            existing.price = Number(r.total_price) || 0
            if (r.customer_name) existing.name = r.customer_name
          }
          if (!existing.name && r.customer_name) existing.name = r.customer_name
        }
      }
      if (data.length < PAGE) break
      offset += PAGE
    }

    const list: { phone: string; name: string; package: string; totalPrice: number; lastOrderDate: string; daysSince: number }[] = []
    for (const [phone, v] of Array.from(map.entries())) {
      if (v.last >= since && v.last < cutoffStr) {
        const daysSince = Math.floor((now.getTime() - new Date(v.last).getTime()) / 86400000)
        list.push({ phone, name: v.name || '', package: v.pkg || '—', totalPrice: v.price, lastOrderDate: v.last, daysSince })
      }
    }
    list.sort((a, b) => b.daysSince - a.daysSince)
    const top = list.slice(0, 1000)

    // Attach follow-up status (reuses customers.follow_up_date / follow_up_note), batched by phone
    const followMap = new Map<string, { date: string | null; note: string | null; name: string | null }>()
    // Look up customers by BOTH the raw phone and the normalized phone (some
    // customer records were created with a normalized phone, e.g. from VIP scan).
    const lookupSet = new Set<string>()
    for (const t of top) {
      if (t.phone) lookupSet.add(t.phone)
      const n = normPhone(t.phone)
      if (n) lookupSet.add(n)
    }
    const lookupPhones = Array.from(lookupSet)
    const FB = 150
    for (let i = 0; i < lookupPhones.length; i += FB) {
      const chunk = lookupPhones.slice(i, i + FB)
      const { data: cust } = await sb
        .from('customers')
        .select('phone, name, follow_up_date, follow_up_note')
        .in('phone', chunk)
      for (const c of (cust ?? []) as { phone: string | number; name: string | null; follow_up_date: string | null; follow_up_note: string | null }[]) {
        followMap.set(String(c.phone), { date: c.follow_up_date, note: c.follow_up_note, name: c.name })
      }
    }

    const customers = top.map(t => {
      const f = followMap.get(t.phone) ?? followMap.get(normPhone(t.phone))
      const orderName = (t.name ?? '').trim()
      const custName = (f?.name ?? '').trim()
      const name = orderName || (custName && custName !== 'Lark Customer' ? custName : '') || '(no name)'
      return {
        ...t,
        name,
        phoneDisplay: normPhone(t.phone) || t.phone,
        followedUp: !!(f && f.date),
        followUpDate: f?.date ?? null,
        followUpNote: f?.note ?? null,
      }
    })

    return NextResponse.json({ count: list.length, days, customers })
  } catch (e) {
    console.error('[inactive] error:', e)
    return NextResponse.json(
      { error: e instanceof Error ? e.message : 'Failed to compute inactive customers' },
      { status: 500 },
    )
  }
}
