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

    // phone -> { name, last order date }
    const map = new Map<string, { name: string; last: string }>()
    const PAGE = 1000
    let offset = 0
    while (true) {
      let q = sb
        .from('orders')
        .select('phone, customer_name, order_date')
        .not('phone', 'is', null)
        .not('order_date', 'is', null)
      if (projectId) q = q.eq('project_id', projectId)
      const { data, error } = await q.range(offset, offset + PAGE - 1)
      if (error) throw new Error(error.message)
      if (!data || data.length === 0) break
      for (const r of data as { phone: string | null; customer_name: string | null; order_date: string | null }[]) {
        const p = (r.phone ?? '').toString().trim()
        if (!p || p === '0' || !r.order_date) continue
        const existing = map.get(p)
        if (!existing) {
          map.set(p, { name: r.customer_name ?? '', last: r.order_date })
        } else {
          if (r.order_date > existing.last) existing.last = r.order_date
          if (!existing.name && r.customer_name) existing.name = r.customer_name
        }
      }
      if (data.length < PAGE) break
      offset += PAGE
    }

    const list: { phone: string; name: string; lastOrderDate: string; daysSince: number }[] = []
    for (const [phone, v] of Array.from(map.entries())) {
      if (v.last < cutoffStr) {
        const daysSince = Math.floor((now.getTime() - new Date(v.last).getTime()) / 86400000)
        list.push({ phone, name: v.name || '(no name)', lastOrderDate: v.last, daysSince })
      }
    }
    list.sort((a, b) => b.daysSince - a.daysSince)

    return NextResponse.json({
      count: list.length,
      days,
      customers: list.slice(0, 1000),
    })
  } catch (e) {
    console.error('[inactive] error:', e)
    return NextResponse.json(
      { error: e instanceof Error ? e.message : 'Failed to compute inactive customers' },
      { status: 500 },
    )
  }
}
