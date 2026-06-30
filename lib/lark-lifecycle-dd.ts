import { fetchLarkRecords } from './lark'
import { getDdPackagePrice } from './dd-package-prices'

// Live DD customer-lifecycle computation, read straight from the Lark order
// tables (2025 + 2026) so it matches the DD dashboard — no dependency on the
// Supabase sync. "New" = first-EVER order falls within the period (same as the
// dashboard's AUTO N/R = New). VIP/Loyal = repeat customer who spent >= RM700
// in the period.
const APP = 'S8XXb8PT2a82ouslzQWjBaYap2g'
const T2026 = 'tblpMwKyxbddnXNG' // 2026【DD】Daily order
const T2025 = 'tblEy6fdbsuXhS6L' // 2025 DD orders
const VIP_MIN = 700
const LIST_CAP = 5000

type SegKey = 'new' | 'active' | 'loyal' | 'churn'
const SEG_ORDER: SegKey[] = ['new', 'active', 'loyal', 'churn']
const SEG_LABEL: Record<SegKey, string> = {
  new: 'New customer onboarding',
  active: 'Active customer recurring',
  loyal: 'Loyal customer advocacy',
  churn: 'Churn customer reactivation',
}

// ── tolerant Lark field extractors (LIST API shapes) ─────────────────────────
function fstr(v: unknown): string {
  if (v == null) return ''
  if (typeof v === 'string') return v.trim()
  if (typeof v === 'number') return String(v)
  if (Array.isArray(v)) {
    return v.map(x => (typeof x === 'string' ? x : ((x as { text?: string; name?: string })?.text ?? (x as { name?: string })?.name ?? ''))).join('').trim()
  }
  const o = v as { value?: unknown; text?: string; name?: string }
  if (Array.isArray(o.value)) return o.value.map(x => (typeof x === 'string' ? x : ((x as { text?: string })?.text ?? ''))).join('').trim()
  if (o.text) return String(o.text).trim()
  if (o.name) return String(o.name).trim()
  return ''
}
function flinked(v: unknown): string {
  if (!Array.isArray(v)) return fstr(v)
  return v.map(x => (typeof x === 'string' ? x : ((x as { text?: string; name?: string })?.text ?? (x as { name?: string })?.name ?? ''))).filter(Boolean).join(', ').trim()
}
function fnum(v: unknown): number {
  if (v == null) return 0
  if (typeof v === 'number') return v
  if (typeof v === 'string') { const n = Number(v.replace(/[^0-9.\-]/g, '')); return isNaN(n) ? 0 : n }
  if (Array.isArray(v)) { for (const x of v) { const n = fnum(x); if (n) return n } return 0 }
  const o = v as { value?: unknown }
  if (o && o.value !== undefined) return fnum(o.value)
  return 0
}
function fdateMs(v: unknown): number {
  if (typeof v === 'number') return v
  if (Array.isArray(v) && typeof v[0] === 'number') return v[0] as number
  const o = v as { value?: unknown }
  if (o && Array.isArray(o.value) && typeof o.value[0] === 'number') return o.value[0] as number
  if (o && typeof o.value === 'number') return o.value
  return 0
}
function toDateStr(ms: number): string {
  if (!ms) return ''
  return new Date(ms).toISOString().split('T')[0]
}

function normPhone(raw: string): string {
  const d = (raw ?? '').toString().replace(/\D/g, '')
  if (!d) return ''
  if (d.startsWith('60') || d.startsWith('65')) return d
  if (d.startsWith('0')) return '6' + d
  return d
}

type Cust = {
  name: string
  first: string
  last: string
  ordersAll: number
  spentAll: number
  ordersRange: number
  spentRange: number
  channels: Set<string>
  pkgs: Set<string>
}

export async function computeDdLifecycleFromLark(from: string, to: string) {
  const [recs2026, recs2025] = await Promise.all([
    fetchLarkRecords(T2026, APP),
    fetchLarkRecords(T2025, APP),
  ])

  const map = new Map<string, Cust>()

  const ingest = (
    records: { fields: Record<string, unknown> }[],
    phoneFields: string[],
    dateField: string,
    priceFields: string[],
    channelField: string,
    pkgField: string,
    nameField: string,
  ) => {
    for (const r of records) {
      const f = r.fields
      // phone: try each candidate field
      let phoneRaw = ''
      for (const pf of phoneFields) { const s = fstr(f[pf]); if (s) { phoneRaw = s; break } }
      const p = normPhone(phoneRaw)
      const dateStr = toDateStr(fdateMs(f[dateField]))
      if (!p || p === '0' || !dateStr) continue
      const channel = fstr(f[channelField])
      if (channel === 'Return') continue // not a sale
      let price = 0
      for (const prf of priceFields) { const n = fnum(f[prf]); if (n) { price = n; break } }
      const pkg = flinked(f[pkgField])
      const nm = fstr(f[nameField])
      const inRange = dateStr >= from && dateStr <= to

      let e = map.get(p)
      if (!e) {
        e = { name: nm, first: dateStr, last: dateStr, ordersAll: 0, spentAll: 0, ordersRange: 0, spentRange: 0, channels: new Set<string>(), pkgs: new Set<string>() }
        map.set(p, e)
      }
      e.ordersAll++
      e.spentAll += price
      if (inRange) { e.ordersRange++; e.spentRange += price }
      if (nm && (!e.name || e.name === 'Lark Customer')) e.name = nm
      if (dateStr < e.first) e.first = dateStr
      if (dateStr > e.last) e.last = dateStr
      if (channel) e.channels.add(channel)
      if (pkg) e.pkgs.add(pkg)
    }
  }

  ingest(recs2026, ['Phone Number', 'Phone no'], 'Date', ['Total Price', 'Price Domain', 'Price'], 'Channel', 'Package', 'Name')
  ingest(recs2025, ['Phone number', 'Phone no'], 'Date', ['Price'], 'Channel', 'Package', 'Name')

  const segOf = (c: Cust): SegKey | null => {
    if (c.first > to) return null
    if (c.ordersRange === 0) return 'churn'
    if (c.first >= from) return 'new'              // first-ever order in period = brand new (incl New VIP)
    if (c.spentRange >= VIP_MIN) return 'loyal'    // repeat + RM700+ in period = VIP
    return 'active'                                // repeat + < RM700
  }

  type Acc = {
    count: number
    chan: Map<string, number>
    pkg: Map<string, number>
    list: { name: string; phone: string; orders: number; spent: number; last: string; flagVip: boolean }[]
  }
  const acc: Record<SegKey, Acc> = {
    new: { count: 0, chan: new Map(), pkg: new Map(), list: [] },
    active: { count: 0, chan: new Map(), pkg: new Map(), list: [] },
    loyal: { count: 0, chan: new Map(), pkg: new Map(), list: [] },
    churn: { count: 0, chan: new Map(), pkg: new Map(), list: [] },
  }

  let total = 0
  for (const [phone, c] of Array.from(map.entries())) {
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
      a.list.push({ name: c.name || '(no name)', phone, orders: c.ordersAll, spent: Math.round(c.spentAll), last: c.last, flagVip: c.spentRange >= VIP_MIN })
    }
  }

  const priceOf = (pk: string) => getDdPackagePrice(pk)
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
      .map(r => ({ name: r.name, phone: r.phone, orders: r.orders, spent: r.spent, lastOrderDate: r.last, isNew: r.flagVip }))
    return { key, label: SEG_LABEL[key], count: a.count, pct: pct(a.count, total), byChannel, byPackage, customers, truncated: a.count > customers.length }
  })

  return { total, from, to, segments, source: 'lark' as const }
}
