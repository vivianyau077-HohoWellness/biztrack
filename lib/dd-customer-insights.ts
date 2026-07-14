import { fetchLarkRecords } from './lark'

// Live-from-Lark customer metrics for Diamond Drink (all-time, phone-deduped),
// so the Customer Insights cards don't depend on the (stale) Supabase sync.
const APP = 'S8XXb8PT2a82ouslzQWjBaYap2g'
const T_ORDER_26 = 'tblpMwKyxbddnXNG'
const T_DAILY_25 = 'tblEy6fdbsuXhS6L'

function fnum(v: unknown): number {
  if (v == null) return 0
  if (typeof v === 'number') return v
  if (typeof v === 'string') { const n = Number(v.replace(/[^0-9.\-]/g, '')); return isNaN(n) ? 0 : n }
  if (Array.isArray(v)) { for (const x of v) { const n = fnum(x); if (n) return n } return 0 }
  const o = v as { value?: unknown }
  if (o && o.value !== undefined) return fnum(o.value)
  return 0
}
function fstr(v: unknown): string {
  if (v == null) return ''
  if (typeof v === 'string') return v.trim()
  if (typeof v === 'number') return String(v)
  if (Array.isArray(v)) return v.map(x => (typeof x === 'string' ? x : ((x as { text?: string; name?: string })?.text ?? (x as { name?: string })?.name ?? ''))).join('').trim()
  const o = v as { value?: unknown; text?: string; name?: string }
  if (Array.isArray(o.value)) return o.value.map(x => (typeof x === 'string' ? x : ((x as { text?: string; name?: string })?.text ?? (x as { name?: string })?.name ?? ''))).join('').trim()
  if (o.text) return String(o.text).trim()
  if (o.name) return String(o.name).trim()
  return ''
}
function fdateMs(v: unknown): number {
  if (typeof v === 'number') return v
  if (Array.isArray(v) && typeof v[0] === 'number') return v[0] as number
  const o = v as { value?: unknown }
  if (o && Array.isArray(o.value) && typeof o.value[0] === 'number') return o.value[0] as number
  if (o && typeof o.value === 'number') return o.value
  return 0
}
// Lark stores dates at Malaysia-time (UTC+8) midnight.
const monthKey = (ms: number) => (ms ? new Date(ms + 28800000).toISOString().slice(0, 7) : '')

const VIP_ID: Record<string, string> = { optqKyjYh5: 'Malaysia VIP', optm49F7wB: 'Singapore VIP', optlAbV6WH: 'Inactive VIP' }
function isActiveVip(v: unknown): boolean {
  let s = fstr(v)
  if (VIP_ID[s]) s = VIP_ID[s]
  return s === 'Malaysia VIP' || s === 'Singapore VIP'
}

// Canonicalise a phone for dedup: digits only, MY/SG friendly.
function normPhone(raw: string): string {
  let d = (raw || '').replace(/[^0-9]/g, '')
  if (!d) return ''
  if (d.startsWith('0')) d = '6' + d          // 0123 → 60123 (MY)
  else if (!d.startsWith('6')) d = '60' + d   // 123 → 60123
  return d
}

type Cust = { orders: number; spend: number; firstMs: number; vip: boolean }

export type DdCustomerInsights = {
  totalCustomers: number
  newThisMonth: number
  retentionCount: number
  vipCount: number
  customerLtv: number
  unique2025: number
  unique2026: number
  asOf: string
}

export async function computeDdCustomerInsights(): Promise<DdCustomerInsights> {
  const [ord26, daily25] = await Promise.all([
    fetchLarkRecords(T_ORDER_26, APP),
    fetchLarkRecords(T_DAILY_25, APP),
  ])

  const map = new Map<string, Cust>()
  const y2025 = new Set<string>()
  const y2026 = new Set<string>()
  const nowMonth = monthKey(Date.now())

  const eat = (recs: Array<{ fields: Record<string, unknown> }>, phoneField: string) => {
    for (const r of recs) {
      const f = r.fields
      const channel = fstr(f['Channel'])
      if (channel === 'Return') continue
      const ms = fdateMs(f['Date'])
      const price = fnum(f['Total Price']) || fnum(f['Price Domain'])
      let key = normPhone(fstr(f[phoneField]))
      if (!key) { const nm = fstr(f['Name']); if (nm) key = 'name:' + nm.toLowerCase(); else continue }
      let c = map.get(key)
      if (!c) { c = { orders: 0, spend: 0, firstMs: ms || Number.MAX_SAFE_INTEGER, vip: false }; map.set(key, c) }
      c.orders++
      c.spend += price
      if (ms && ms < c.firstMs) c.firstMs = ms
      if (isActiveVip(f['AUTO VIP'])) c.vip = true
      const yk = monthKey(ms).slice(0, 4)
      if (yk === '2025') y2025.add(key)
      else if (yk === '2026') y2026.add(key)
    }
  }
  eat(ord26 as Array<{ fields: Record<string, unknown> }>, 'Phone Number')
  eat(daily25 as Array<{ fields: Record<string, unknown> }>, 'Phone Number')

  let total = 0, newM = 0, retention = 0, vip = 0, spendSum = 0
  for (const c of Array.from(map.values())) {
    total++
    spendSum += c.spend
    if (c.orders >= 2) retention++
    if (c.vip) vip++
    if (c.firstMs !== Number.MAX_SAFE_INTEGER && monthKey(c.firstMs) === nowMonth) newM++
  }

  return {
    totalCustomers: total,
    newThisMonth: newM,
    retentionCount: retention,
    vipCount: vip,
    customerLtv: total ? Math.round(spendSum / total) : 0,
    unique2025: y2025.size,
    unique2026: y2026.size,
    asOf: new Date().toISOString(),
  }
}
