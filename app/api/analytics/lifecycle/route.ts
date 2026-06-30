import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { getDdPackagePrice } from '@/lib/dd-package-prices'

// Customer lifecycle segmentation (deduped by normalized phone, scoped by
// project_id / brand). The "1 year" window is the 2026 calendar year (YTD).
// Each customer is assigned to exactly ONE segment via a priority waterfall:
//   1. churn  — NO order in 2026 (didn't come back this year) → reactivation
//   2. loyal  — spent >= RM700 in 2026 (MY / SG VIP) → advocacy
//   3. active — 2+ orders in 2026 (repurchased), spent < 700 → recurring
//   4. new    — exactly 1 order in 2026, spent < 700 → onboarding
export const maxDuration = 60
export const dynamic = 'force-dynamic'

type SegKey = 'new' | 'active' | 'loyal' | 'churn'
const SEG_ORDER: SegKey[] = ['new', 'active', 'loyal', 'churn']
const SEG_LABEL: Record<SegKey, string> = {
  new: 'New customer onboarding',
  active: 'Active customer recurring',
  loyal: 'Loyal customer advocacy',
  churn: 'Churn customer reactivation',
}
const VIP_MIN = 700        // MY / SG VIP spend threshold (within 2026)
const YEAR_PREFIX = '2026' // the "1 year" basis
const LIST_CAP = 5000

export async function GET(req: NextRequest) {
  try {
    const projectId = req.nextUrl.searchParams.get('projectId') || ''
    const sb = createAdminClient()

    const normPhone = (raw: string): string => {
      const d = (raw ?? '').toString().replace(/\D/g, '')
      if (!d) return ''
      if (d.startsWith('60') || d.startsWith('65')) return d
      if (d.startsWith('0')) return '6' + d
      return d
    }

    type Cust = {
      name: string
      rawPhone: string
      first: string
      last: string
      ordersAll: number
      spentAll: number
      orders2026: number
      spent2026: number
      channels: Set<string>
      pkgs: Set<string>
    }
    const map = new Map<string, Cust>()
    const pkgPrice = new Map<string, { sum: number; n: number }>()

    const PAGE = 1000
    let offset = 0
    while (true) {
      let q = sb
        .from('orders')
        .select('phone, customer_name, order_date, channel, package_name, total_price')
        .not('phone', 'is', null)
        .not('order_date', 'is', null)
      if (projectId) q = q.eq('project_id', projectId)
      const { data, error } = await q.range(offset, offset + PAGE - 1)
      if (error) throw new Error(error.message)
      if (!data || data.length === 0) break
      for (const r of data as { phone: string | null; customer_name: string | null; order_date: string | null; channel: string | null; package_name: string | null; total_price: number | null }[]) {
        const raw = (r.phone ?? '').toString().trim()
        const p = normPhone(raw)
        if (!p || p === '0' || !r.order_date) continue
        const ch = (r.channel ?? '').trim()
        const pk = (r.package_name ?? '').trim()
        const price = Number(r.total_price) || 0
        const nm = (r.customer_name ?? '').trim()
        const is2026 = r.order_date.startsWith(YEAR_PREFIX)
        if (pk && price > 0) {
          const pe = pkgPrice.get(pk) ?? { sum: 0, n: 0 }
          pe.sum += price; pe.n += 1
          pkgPrice.set(pk, pe)
        }
        let e = map.get(p)
        if (!e) {
          e = { name: nm, rawPhone: raw, first: r.order_date, last: r.order_date, ordersAll: 0, spentAll: 0, orders2026: 0, spent2026: 0, channels: new Set<string>(), pkgs: new Set<string>() }
          map.set(p, e)
        }
        e.ordersAll++
        e.spentAll += price
        if (is2026) { e.orders2026++; e.spent2026 += price }
        if (nm && (!e.name || e.name === 'Lark Customer')) e.name = nm
        if (r.order_date < e.first) e.first = r.order_date
        if (r.order_date > e.last) e.last = r.order_date
        if (ch) e.channels.add(ch)
        if (pk) e.pkgs.add(pk)
      }
      if (data.length < PAGE) break
      offset += PAGE
    }

    const segOf = (c: Cust): SegKey => {
      if (c.orders2026 === 0) return 'churn'
      if (c.spent2026 >= VIP_MIN) return 'loyal'
      if (c.orders2026 >= 2) return 'active'
      return 'new'
    }

    type Acc = {
      count: number
      chan: Map<string, number>
      pkg: Map<string, number>
      list: { name: string; phone: string; rawPhone: string; orders: number; spent: number; last: string; isFirstEver: boolean }[]
    }
    const acc: Record<SegKey, Acc> = {
      new: { count: 0, chan: new Map(), pkg: new Map(), list: [] },
      active: { count: 0, chan: new Map(), pkg: new Map(), list: [] },
      loyal: { count: 0, chan: new Map(), pkg: new Map(), list: [] },
      churn: { count: 0, chan: new Map(), pkg: new Map(), list: [] },
    }

    for (const [phoneKey, c] of Array.from(map.entries())) {
      const seg = segOf(c)
      const a = acc[seg]
      a.count++
      const chans = c.channels.size ? Array.from(c.channels) : ['(unknown)']
      for (const ch of chans) a.chan.set(ch, (a.chan.get(ch) ?? 0) + 1)
      const pks = c.pkgs.size ? Array.from(c.pkgs) : ['(none)']
      for (const pk of pks) a.pkg.set(pk, (a.pkg.get(pk) ?? 0) + 1)
      if (a.list.length < LIST_CAP) {
        a.list.push({
          name: c.name || '',
          phone: phoneKey,
          rawPhone: c.rawPhone,
          orders: c.ordersAll,
          spent: Math.round(c.spentAll),
          last: c.last,
          isFirstEver: c.first >= YEAR_PREFIX + '-01-01',
        })
      }
    }

    // Name fallback from customers table for rows still missing a name.
    const missing = new Set<string>()
    for (const seg of SEG_ORDER) for (const r of acc[seg].list) {
      if (!r.name || r.name === 'Lark Customer') { missing.add(r.phone); if (r.rawPhone) missing.add(r.rawPhone) }
    }
    if (missing.size) {
      const phones = Array.from(missing)
      const nameMap = new Map<string, string>()
      for (let i = 0; i < phones.length; i += 300) {
        const batch = phones.slice(i, i + 300)
        const { data } = await sb.from('customers').select('name, phone').in('phone', batch)
        for (const row of (data ?? []) as { name: string | null; phone: string | null }[]) {
          const nm = (row.name ?? '').trim()
          if (nm && nm !== 'Lark Customer' && row.phone) {
            nameMap.set(row.phone, nm)
            nameMap.set(normPhone(row.phone), nm)
          }
        }
      }
      for (const seg of SEG_ORDER) for (const r of acc[seg].list) {
        if (!r.name || r.name === 'Lark Customer') {
          r.name = nameMap.get(r.phone) || nameMap.get(r.rawPhone) || ''
        }
      }
    }

    const total = map.size
    // Prefer the listed DD price; fall back to the averaged order total.
    const priceOf = (pk: string) => {
      const listed = getDdPackagePrice(pk)
      if (listed > 0) return listed
      const pe = pkgPrice.get(pk)
      return pe && pe.n ? Math.round(pe.sum / pe.n) : 0
    }
    const pct = (n: number, base: number) => (base ? Math.round((n / base) * 1000) / 10 : 0)

    const segments = SEG_ORDER.map(key => {
      const a = acc[key]
      const byChannel = Array.from(a.chan.entries())
        .map(([channel, count]) => ({ channel, count, pct: pct(count, a.count) }))
        .sort((x, y) => y.count - x.count)
      const byPackage = Array.from(a.pkg.entries())
        .map(([name, count]) => ({ name, count, pct: pct(count, a.count), price: priceOf(name) }))
        .sort((x, y) => y.count - x.count)
        .slice(0, 12)
      const customers = a.list
        .sort((x, y) => y.spent - x.spent)
        .map(r => ({ name: r.name || '(no name)', phone: r.phone, orders: r.orders, spent: r.spent, lastOrderDate: r.last, isNew: r.isFirstEver }))
      return {
        key,
        label: SEG_LABEL[key],
        count: a.count,
        pct: pct(a.count, total),
        byChannel,
        byPackage,
        customers,
        truncated: a.count > customers.length,
      }
    })

    return NextResponse.json({ total, segments })
  } catch (e) {
    console.error('[lifecycle] error:', e)
    return NextResponse.json(
      { error: e instanceof Error ? e.message : 'Failed to compute lifecycle' },
      { status: 500 },
    )
  }
}
