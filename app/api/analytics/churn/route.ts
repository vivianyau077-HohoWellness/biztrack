import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'

// Churn = customers (deduped by normalized phone) who have ordered before but
// NOT in the last 365 days. Computed over ALL orders (all-time), independent of
// the page's date range. Scoped by project_id (brand) when provided.
// Reads many order rows, so it needs more than the default 10s.
export const maxDuration = 60
export const dynamic = 'force-dynamic'

type Seg = 'repeat' | 'oneTime'

export async function GET(req: NextRequest) {
  try {
    const projectId = req.nextUrl.searchParams.get('projectId') || ''
    const sb = createAdminClient()

    const cutoff = new Date()
    cutoff.setDate(cutoff.getDate() - 365)
    const cutoffStr = cutoff.toISOString().split('T')[0]

    // Normalize phone so the same customer written as 012..., 60..., 012-... is
    // counted once (matches the Inactive route). Without this, churn double-counts
    // and can falsely flag/clear a customer.
    const normPhone = (raw: string): string => {
      const d = (raw ?? '').toString().replace(/\D/g, '')
      if (!d) return ''
      if (d.startsWith('60') || d.startsWith('65')) return d
      if (d.startsWith('0')) return '6' + d
      return d
    }

    // Aggregate per customer (normalized phone): last order date, ALL channels &
    // ALL packages ever ordered (not just the last — "买过的"/"下过单的"),
    // order count, and which years they ordered in.
    const map = new Map<string, {
      last: string
      channels: Set<string>
      pkgs: Set<string>
      orders: number
      in2025: boolean
      in2026: boolean
    }>()
    // Average price per package (computed across all orders, so it's stable).
    const pkgPrice = new Map<string, { sum: number; n: number }>()
    const PAGE = 1000
    let offset = 0
    while (true) {
      let q = sb
        .from('orders')
        .select('phone, order_date, channel, package_name, total_price')
        .not('phone', 'is', null)
        .not('order_date', 'is', null)
      if (projectId) q = q.eq('project_id', projectId)
      const { data, error } = await q.range(offset, offset + PAGE - 1)
      if (error) throw new Error(error.message)
      if (!data || data.length === 0) break
      for (const r of data as { phone: string | null; order_date: string | null; channel: string | null; package_name: string | null; total_price: number | null }[]) {
        const p = normPhone((r.phone ?? '').toString().trim())
        if (!p || p === '0' || !r.order_date) continue
        const y2025 = r.order_date.startsWith('2025')
        const y2026 = r.order_date.startsWith('2026')
        const ch = (r.channel ?? '').trim()
        const pk = (r.package_name ?? '').trim()
        const price = Number(r.total_price) || 0
        if (pk && price > 0) {
          const pe = pkgPrice.get(pk) ?? { sum: 0, n: 0 }
          pe.sum += price; pe.n += 1
          pkgPrice.set(pk, pe)
        }
        let e = map.get(p)
        if (!e) {
          e = { last: r.order_date, channels: new Set<string>(), pkgs: new Set<string>(), orders: 0, in2025: false, in2026: false }
          map.set(p, e)
        }
        e.orders++
        if (r.order_date > e.last) e.last = r.order_date
        if (ch) e.channels.add(ch)
        if (pk) e.pkgs.add(pk)
        if (y2025) e.in2025 = true
        if (y2026) e.in2026 = true
      }
      if (data.length < PAGE) break
      offset += PAGE
    }

    let total = 0
    let churn = 0
    let active = 0
    let unique2025 = 0
    let unique2026 = 0
    // Per-segment counters & breakdown maps (each customer counted once per
    // distinct channel / package they ever used).
    const segCount: Record<Seg, number> = { repeat: 0, oneTime: 0 }
    const chanMap: Record<Seg, Map<string, number>> = { repeat: new Map(), oneTime: new Map() }
    const pkgMap: Record<Seg, Map<string, number>> = { repeat: new Map(), oneTime: new Map() }

    for (const c of Array.from(map.values())) {
      total++
      if (c.in2025) unique2025++
      if (c.in2026) unique2026++
      if (c.last < cutoffStr) {
        churn++
        const seg: Seg = c.orders >= 2 ? 'repeat' : 'oneTime'
        segCount[seg]++
        const chans = c.channels.size ? Array.from(c.channels) : ['(unknown)']
        for (const ch of chans) chanMap[seg].set(ch, (chanMap[seg].get(ch) ?? 0) + 1)
        const pks = c.pkgs.size ? Array.from(c.pkgs) : ['(none)']
        for (const pk of pks) pkgMap[seg].set(pk, (pkgMap[seg].get(pk) ?? 0) + 1)
      } else {
        active++
      }
    }

    const churnRate = total ? Math.round((churn / total) * 1000) / 10 : 0
    const pct = (count: number, base: number) => (base ? Math.round((count / base) * 1000) / 10 : 0)

    const priceOf = (pk: string) => {
      const pe = pkgPrice.get(pk)
      return pe && pe.n ? Math.round(pe.sum / pe.n) : 0
    }
    const buildSeg = (seg: Seg) => {
      const base = segCount[seg]
      const byChannel = Array.from(chanMap[seg].entries())
        .map(([channel, count]) => ({ channel, count, pct: pct(count, base) }))
        .sort((a, b) => b.count - a.count)
      const byPackage = Array.from(pkgMap[seg].entries())
        .map(([name, count]) => ({ name, count, pct: pct(count, base), price: priceOf(name) }))
        .sort((a, b) => b.count - a.count)
        .slice(0, 12)
      return { count: base, byChannel, byPackage }
    }

    return NextResponse.json({
      churnCount: churn,
      totalCustomers: total,
      activeCustomers: active,
      churnRepeat: segCount.repeat,
      churnOneTime: segCount.oneTime,
      unique2025,
      unique2026,
      churnRate,
      repeat: buildSeg('repeat'),
      oneTime: buildSeg('oneTime'),
    })
  } catch (e) {
    console.error('[churn] error:', e)
    return NextResponse.json(
      { error: e instanceof Error ? e.message : 'Failed to compute churn' },
      { status: 500 },
    )
  }
}
