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

    // phone -> { name, last order date }
    const map = new Map<string, { name: string; last: string; pkg: string }>()
    const PAGE = 1000
    let offset = 0
    while (true) {
      let q = sb
        .from('orders')
        .select('phone, customer_name, order_date, package_name')
        .not('phone', 'is', null)
        .not('order_date', 'is', null)
      if (projectId) q = q.eq('project_id', projectId)
      const { data, error } = await q.range(offset, offset + PAGE - 1)
      if (error) throw new Error(error.message)
      if (!data || data.length === 0) break
      for (const r of data as { phone: string | null; customer_name: string | null; order_date: string | null; package_name: string | null }[]) {
        const p = (r.phone ?? '').toString().trim()
        if (!p || p === '0' || !r.order_date) continue
        const existing = map.get(p)
        if (!existing) {
          map.set(p, { name: r.customer_name ?? '', last: r.order_date, pkg: r.package_name ?? '' })
        } else {
          if (r.order_date > existing.last) { existing.last = r.order_date; existing.pkg = r.package_name ?? '' }
          if (!existing.name && r.customer_name) existing.name = r.customer_name
        }
      }
      if (data.length < PAGE) break
      offset += PAGE
    }

    const list: { phone: string; name: string; package: string; lastOrderDate: string; daysSince: number }[] = []
    for (const [phone, v] of Array.from(map.entries())) {
      if (v.last >= since && v.last < cutoffStr) {
        const daysSince = Math.floor((now.getTime() - new Date(v.last).getTime()) / 86400000)
        list.push({ phone, name: v.name || '(no name)', package: v.pkg || '—', lastOrderDate: v.last, daysSince })
      }
    }
    list.sort((a, b) => b.daysSince - a.daysSince)
    const top = list.slice(0, 1000)

    // Attach follow-up status (reuses customers.follow_up_date / follow_up_note), batched by phone
    const followMap = new Map<string, { date: string | null; note: string | null }>()
    const phones = top.map(t => t.phone)
    const FB = 150
    for (let i = 0; i < phones.length; i += FB) {
      const chunk = phones.slice(i, i + FB)
      const { data: cust } = await sb
        .from('customers')
        .select('phone, follow_up_date, follow_up_note')
        .in('phone', chunk)
      for (const c of (cust ?? []) as { phone: string | number; follow_up_date: string | null; follow_up_note: string | null }[]) {
        followMap.set(String(c.phone), { date: c.follow_up_date, note: c.follow_up_note })
      }
    }

    const customers = top.map(t => {
      const f = followMap.get(t.phone)
      return {
        ...t,
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
