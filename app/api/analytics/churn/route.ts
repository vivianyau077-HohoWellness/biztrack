import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'

// Churn = customers (deduped by phone) who have ordered before but NOT in the
// last 365 days. Computed over ALL orders (all-time), independent of the page's
// date range. Scoped by project_id (brand) when provided.
// Reads many order rows, so it needs more than the default 10s.
export const maxDuration = 60
export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  try {
    const projectId = req.nextUrl.searchParams.get('projectId') || ''
    const sb = createAdminClient()

    const cutoff = new Date()
    cutoff.setDate(cutoff.getDate() - 365)
    const cutoffStr = cutoff.toISOString().split('T')[0]

    // Aggregate per customer (phone): most recent order's date, channel, package.
    const map = new Map<string, { last: string; channel: string; pkg: string; in2025: boolean; in2026: boolean }>()
    const PAGE = 1000
    let offset = 0
    while (true) {
      let q = sb
        .from('orders')
        .select('phone, order_date, channel, package_name')
        .not('phone', 'is', null)
        .not('order_date', 'is', null)
      if (projectId) q = q.eq('project_id', projectId)
      const { data, error } = await q.range(offset, offset + PAGE - 1)
      if (error) throw new Error(error.message)
      if (!data || data.length === 0) break
      for (const r of data as { phone: string | null; order_date: string | null; channel: string | null; package_name: string | null }[]) {
        const p = (r.phone ?? '').toString().trim()
        if (!p || p === '0' || !r.order_date) continue
        const y2025 = r.order_date.startsWith('2025')
        const y2026 = r.order_date.startsWith('2026')
        const e = map.get(p)
        if (!e) {
          map.set(p, { last: r.order_date, channel: r.channel ?? '', pkg: r.package_name ?? '', in2025: y2025, in2026: y2026 })
        } else {
          if (r.order_date > e.last) { e.last = r.order_date; e.channel = r.channel ?? ''; e.pkg = r.package_name ?? '' }
          if (y2025) e.in2025 = true
          if (y2026) e.in2026 = true
        }
      }
      if (data.length < PAGE) break
      offset += PAGE
    }

    let total = 0
    let churn = 0
    let active = 0
    let unique2025 = 0
    let unique2026 = 0
    const channelMap = new Map<string, number>()
    const pkgMap = new Map<string, number>()
    for (const c of Array.from(map.values())) {
      total++
      if (c.in2025) unique2025++
      if (c.in2026) unique2026++
      if (c.last < cutoffStr) {
        churn++
        const ch = c.channel || '(unknown)'
        channelMap.set(ch, (channelMap.get(ch) ?? 0) + 1)
        const pk = c.pkg || '(none)'
        pkgMap.set(pk, (pkgMap.get(pk) ?? 0) + 1)
      } else {
        active++
      }
    }

    const churnRate = total ? Math.round((churn / total) * 1000) / 10 : 0
    const byChannel = Array.from(channelMap.entries())
      .map(([channel, count]) => ({ channel, count, pct: churn ? Math.round((count / churn) * 1000) / 10 : 0 }))
      .sort((a, b) => b.count - a.count)
    const byPackage = Array.from(pkgMap.entries())
      .map(([name, count]) => ({ name, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 12)

    return NextResponse.json({
      churnCount: churn,
      totalCustomers: total,
      activeCustomers: active,
      unique2025,
      unique2026,
      churnRate,
      byChannel,
      byPackage,
    })
  } catch (e) {
    console.error('[churn] error:', e)
    return NextResponse.json(
      { error: e instanceof Error ? e.message : 'Failed to compute churn' },
      { status: 500 },
    )
  }
}
