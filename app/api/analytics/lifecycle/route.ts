import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { getDdPackagePrice } from '@/lib/dd-package-prices'
import { computeDdLifecycleFromLark } from '@/lib/lark-lifecycle-dd'

// DD reads live from Lark (matches the DD dashboard); other brands use the
// synced Supabase data.
const DD_PROJECT_ID = '369ca28c-12a2-4dcd-856d-582b9b230766'

// Customer lifecycle segmentation (deduped by normalized phone, scoped by
// project_id / brand). The time window FOLLOWS the date range picker [from, to].
// Population = customers whose first order is on or before `to` (they existed by
// the end of the period). Each is assigned to exactly ONE segment:
//   1. churn  — existed before the period but NO order within it → reactivation
//   2. new    — first-EVER order falls within the period (never ordered before) →
//               onboarding. Takes priority over VIP (a big first order = "New VIP").
//   3. loyal  — repeat customer (ordered before) + spent >= RM700 in period → VIP
//   4. active — repeat customer + spent < RM700 in period → recurring
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
const VIP_MIN = 700 // MY / SG VIP spend threshold (within the selected period)
const LIST_CAP = 5000

export async function GET(req: NextRequest) {
  try {
    const projectId = req.nextUrl.searchParams.get('projectId') || ''
    const sb = createAdminClient()

    // Selected period (follows the date picker). Defaults to the last 365 days.
    const todayStr = new Date().toISOString().split('T')[0]
    const def = new Date(); def.setDate(def.getDate() - 365)
    const from = req.nextUrl.searchParams.get('from') || def.toISOString().split('T')[0]
    const to = req.nextUrl.searchParams.get('to') || todayStr

    // DD: read live from Lark so it matches the DD dashboard (sync-independent).
    if (projectId === DD_PROJECT_ID) {
      const payload = await computeDdLifecycleFromLark()
      return NextResponse.json(payload)
    }

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
      ordersRange: number  // orders within [from, to]
      spentRange: number   // spend within [from, to]
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
        const inRange = r.order_date >= from && r.order_date <= to
        if (pk && price > 0) {
          const pe = pkgPrice.get(pk) ?? { sum: 0, n: 0 }
          pe.sum += price; pe.n += 1
          pkgPrice.set(pk, pe)
        }
        let e = map.get(p)
        if (!e) {
          e = { name: nm, rawPhone: raw, first: r.order_date, last: r.order_date, ordersAll: 0, spentAll: 0, ordersRange: 0, spentRange: 0, channels: new Set<string>(), pkgs: new Set<string>() }
          map.set(p, e)
        }
        e.ordersAll++
        e.spentAll += price
        if (inRange) { e.ordersRange++; e.spentRange += price }
        if (nm && (!e.name || e.name === 'Lark Customer')) e.name = nm
        if (r.order_date < e.first) e.first = r.order_date
        if (r.order_date > e.last) e.last = r.order_date
        if (ch) e.channels.add(ch)
        if (pk) e.pkgs.add(pk)
      }
      if (data.length < PAGE) break
      offset += PAGE
    }

    // null = excluded (customer's first order is after the period — didn't exist yet)
    const segOf = (c: Cust): SegKey | null => {
      if (c.first > to) return null
      if (c.ordersRange === 0) return 'churn'        // existed before, no order in period
      if (c.first >= from) return 'new'              // first-EVER order in period = brand new (incl New VIP)
      if (c.spentRange >= VIP_MIN) return 'loyal'    // repeat customer, RM700+ in period = VIP
      return 'active'                                // repeat customer, < RM700 in period
    }

    type Acc = {
      count: number
      chan: Map<string, number>
      pkg: Map<string, number>
      list: { name: string; phone: string; rawPhone: string; orders: number; spent: number; last: string; flagVip: boolean }[]
    }
    const acc: Record<SegKey, Acc> = {
      new: { count: 0, chan: new Map(), pkg: new Map(), list: [] },
      active: { count: 0, chan: new Map(), pkg: new Map(), list: [] },
      loyal: { count: 0, chan: new Map(), pkg: new Map(), list: [] },
      churn: { count: 0, chan: new Map(), pkg: new Map(), list: [] },
    }

    let total = 0
    for (const [phoneKey, c] of Array.from(map.entries())) {
      const seg = segOf(c)
      if (!seg) continue
      total++
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
          flagVip: c.spentRange >= VIP_MIN, // spent RM700+ in period → "New VIP" when in the New segment
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
        .map(r => ({ name: r.name || '(no name)', phone: r.phone, orders: r.orders, spent: r.spent, lastOrderDate: r.last, isNew: r.flagVip }))
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

    return NextResponse.json({ total, from, to, segments })
  } catch (e) {
    console.error('[lifecycle] error:', e)
    return NextResponse.json(
      { error: e instanceof Error ? e.message : 'Failed to compute lifecycle' },
      { status: 500 },
    )
  }
}
