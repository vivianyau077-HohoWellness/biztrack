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
function normPhone(raw: string, sg = false): string {
  let d = (raw || '').replace(/[^0-9]/g, '')
  if (!d) return ''
  if (d.startsWith('60') || d.startsWith('65')) return d  // already country-coded
  if (sg) return '65' + d                     // Singapore → 65…
  if (d.startsWith('0')) d = '6' + d          // 0123 → 60123 (MY)
  else d = '60' + d                           // 123 → 60123 (MY)
  return d
}

type Cust = {
  orders: number; spend: number; firstMs: number; lastMs: number; has26: boolean; vip: boolean; name: string; phone: string; lastPkg: string
  bO: number; bMax: number; bLast: number; bVip: boolean; rO: number; rMax: number; rLast: number; rVip: boolean
  // Period-overlap retention flags (bought in prior window / next window), overall + per page
  p60: boolean; n60: boolean; p90: boolean; n90: boolean; p120: boolean; n120: boolean
  bp90: boolean; bn90: boolean; bp120: boolean; bn120: boolean
  rp90: boolean; rn90: boolean; rp120: boolean; rn120: boolean
}
const MAXMS = Number.MAX_SAFE_INTEGER
export type RetBucket = { num: number; denom: number; rate: number }
// Retention = of customers who bought in the prior X-day window, the % who bought
// again in the next X-day window (your "period overlap" definition). d365 = 2025→2026.
export type RetentionMetrics = {
  d60: RetBucket; d90: RetBucket; d120: RetBucket; d365: RetBucket
  beauty: { d90: RetBucket; d120: RetBucket }
  repair: { d90: RetBucket; d120: RetBucket }
}
export type InactiveCustomer = { phone: string; name: string; package: string; spend: number; lastMs: number }

export type DdCustomerInsights = {
  totalCustomers: number
  newThisMonth: number
  retentionCount: number
  vipCount: number
  customerLtv: number
  unique2025: number
  unique2026: number
  churnCount: number
  inactive90: number
  inactiveCustomers: InactiveCustomer[]
  yearlyRetention: { retained: number; base: number; rate: number }
  retentionMetrics: RetentionMetrics
  lifecycle: { beauty: PageLifecycle; repair: PageLifecycle }
  asOf: string
}

const SLIM_FIELDS = ['Channel', 'Date', 'Total Price', 'Price Domain', 'Name', 'Package', 'Phone Number', 'AUTO VIP', 'AUTO N/R']

export async function computeDdCustomerInsights(): Promise<DdCustomerInsights> {
  const [ord26, daily25] = await Promise.all([
    fetchLarkRecords(T_ORDER_26, APP, undefined, SLIM_FIELDS),
    fetchLarkRecords(T_DAILY_25, APP, undefined, SLIM_FIELDS),
  ])

  const map = new Map<string, Cust>()
  const y2025 = new Set<string>()
  const y2026 = new Set<string>()
  const nowMonth = monthKey(Date.now())

  // Period-overlap retention windows: prior window [now-2X, now-X), next window [now-X, now].
  const DAY = 86400000, NOW = Date.now()
  const win = (X: number) => ({ pS: NOW - 2 * X * DAY, pE: NOW - X * DAY, nE: NOW })

  const W = { d60: win(60), d90: win(90), d120: win(120) }

  const eat = (recs: Array<{ fields: Record<string, unknown> }>, phoneField: string) => {
    for (const r of recs) {
      const f = r.fields
      const channel = fstr(f['Channel'])
      if (channel === 'Return') continue
      const ms = fdateMs(f['Date'])
      const price = fnum(f['Total Price']) || fnum(f['Price Domain'])
      const nm = fstr(f['Name'])
      const pkg = fstr(f['Package'])
      const phoneRaw = fstr(f[phoneField])
      const chL = channel.toLowerCase()
      const isSg = chL.indexOf('sg') >= 0            // Singapore → 65…, else Malaysia → 60…
      let key = normPhone(phoneRaw, isSg)
      if (!key) {
        // Standard: name fallback ONLY for Shopee/Lazada orders with no phone.
        // Non-marketplace no-phone orders (FB/WhatsApp/blank) are NOT counted (avoid misjudgment).
        const marketplace = chL.indexOf('shopee') >= 0 || chL.indexOf('lazada') >= 0
        if (marketplace && nm) key = 'name:' + nm.toLowerCase()
        else continue
      }
      let c = map.get(key)
      if (!c) { c = { orders: 0, spend: 0, firstMs: MAXMS, lastMs: 0, has26: false, vip: false, name: '', phone: '', lastPkg: '', bO: 0, bMax: 0, bLast: 0, bVip: false, rO: 0, rMax: 0, rLast: 0, rVip: false, p60: false, n60: false, p90: false, n90: false, p120: false, n120: false, bp90: false, bn90: false, bp120: false, bn120: false, rp90: false, rn90: false, rp120: false, rn120: false }; map.set(key, c) }
      c.orders++
      c.spend += price
      if (nm && !c.name) c.name = nm
      if (phoneRaw && !c.phone) c.phone = phoneRaw
      if (ms && ms < c.firstMs) c.firstMs = ms
      if (ms >= c.lastMs) { c.lastMs = ms; if (pkg) c.lastPkg = pkg }
      // period-overlap flags (overall)
      if (ms) {
        if (ms >= W.d60.pS && ms < W.d60.pE) c.p60 = true; if (ms >= W.d60.pE && ms <= W.d60.nE) c.n60 = true
        if (ms >= W.d90.pS && ms < W.d90.pE) c.p90 = true; if (ms >= W.d90.pE && ms <= W.d90.nE) c.n90 = true
        if (ms >= W.d120.pS && ms < W.d120.pE) c.p120 = true; if (ms >= W.d120.pE && ms <= W.d120.nE) c.n120 = true
      }
      const vipFlag = isActiveVip(f['AUTO VIP'])
      if (vipFlag) c.vip = true
      if (BEAUTY_CH.indexOf(channel) >= 0) {
        c.bO++; if (price > c.bMax) c.bMax = price; if (ms > c.bLast) c.bLast = ms; if (vipFlag) c.bVip = true
        if (ms) { if (ms >= W.d90.pS && ms < W.d90.pE) c.bp90 = true; if (ms >= W.d90.pE && ms <= W.d90.nE) c.bn90 = true; if (ms >= W.d120.pS && ms < W.d120.pE) c.bp120 = true; if (ms >= W.d120.pE && ms <= W.d120.nE) c.bn120 = true }
      } else if (REPAIR_CH.indexOf(channel) >= 0) {
        c.rO++; if (price > c.rMax) c.rMax = price; if (ms > c.rLast) c.rLast = ms; if (vipFlag) c.rVip = true
        if (ms) { if (ms >= W.d90.pS && ms < W.d90.pE) c.rp90 = true; if (ms >= W.d90.pE && ms <= W.d90.nE) c.rn90 = true; if (ms >= W.d120.pS && ms < W.d120.pE) c.rp120 = true; if (ms >= W.d120.pE && ms <= W.d120.nE) c.rn120 = true }
      }
      const yk = monthKey(ms).slice(0, 4)
      if (yk === '2025') y2025.add(key)
      else if (yk === '2026') { y2026.add(key); c.has26 = true }
    }
  }
  eat(ord26 as Array<{ fields: Record<string, unknown> }>, 'Phone Number')
  eat(daily25 as Array<{ fields: Record<string, unknown> }>, 'Phone Number')

  const oneYearAgo = Date.now() - 365 * 86400000
  const ninetyAgo = Date.now() - 90 * 86400000
  let total = 0, newM = 0, retention = 0, vip = 0, spendSum = 0, churnCount = 0, inactive90 = 0
  const inactiveList: InactiveCustomer[] = []
  const bl: PageLifecycle = { onboarding: 0, recurring: 0, loyal: 0, churn: 0, total: 0 }
  const rl: PageLifecycle = { onboarding: 0, recurring: 0, loyal: 0, churn: 0, total: 0 }
  for (const c of Array.from(map.values())) {
    total++
    spendSum += c.spend
    if (c.orders >= 2) retention++
    if (c.vip) vip++
    if (c.firstMs !== Number.MAX_SAFE_INTEGER && monthKey(c.firstMs) === nowMonth) newM++
    if (c.lastMs && c.lastMs < oneYearAgo) churnCount++
    if (c.has26 && c.lastMs && c.lastMs < ninetyAgo) {
      inactive90++
      inactiveList.push({ phone: c.phone || '(no phone)', name: c.name || '(no name)', package: c.lastPkg || '—', spend: Math.round(c.spend), lastMs: c.lastMs })
    }
    if (c.bO > 0) {
      bl.total++
      if (c.bLast && c.bLast < oneYearAgo) bl.churn++
      else if (c.bO <= 1) bl.onboarding++
      else if (c.bMax >= 700 || c.bVip) bl.loyal++
      else bl.recurring++
    }
    if (c.rO > 0) {
      rl.total++
      if (c.rLast && c.rLast < oneYearAgo) rl.churn++
      else if (c.rO <= 1) rl.onboarding++
      else if (c.rMax >= 700 || c.rVip) rl.loyal++
      else rl.recurring++
    }
  }

  // ── Retention analysis (period-overlap: bought in prior window AND next window) ──
  const custArr = Array.from(map.values())
  const overlapRB = (pKey: keyof Cust, nKey: keyof Cust): RetBucket => {
    let num = 0, denom = 0
    for (const c of custArr) { if (c[pKey]) { denom++; if (c[nKey]) num++ } }
    return { num, denom, rate: denom ? Math.round((num / denom) * 1000) / 10 : 0 }
  }
  // Yearly retention (your formula): bought in 2025 AND 2026 ÷ 2025 buyers.
  let bothYears = 0
  for (const k of Array.from(y2025)) if (y2026.has(k)) bothYears++
  const yearlyRetention = { retained: bothYears, base: y2025.size, rate: y2025.size ? Math.round((bothYears / y2025.size) * 1000) / 10 : 0 }
  const retentionMetrics: RetentionMetrics = {
    d60:  overlapRB('p60', 'n60'),
    d90:  overlapRB('p90', 'n90'),
    d120: overlapRB('p120', 'n120'),
    d365: { num: bothYears, denom: y2025.size, rate: yearlyRetention.rate },
    beauty: { d90: overlapRB('bp90', 'bn90'), d120: overlapRB('bp120', 'bn120') },
    repair: { d90: overlapRB('rp90', 'rn90'), d120: overlapRB('rp120', 'rn120') },
  }

  return {
    totalCustomers: total,
    newThisMonth: newM,
    retentionCount: retention,
    yearlyRetention,
    retentionMetrics,
    vipCount: vip,
    customerLtv: total ? Math.round(spendSum / total) : 0,
    unique2025: y2025.size,
    unique2026: y2026.size,
    churnCount,
    inactive90,
    inactiveCustomers: inactiveList.sort((a, b) => b.spend - a.spend),
    lifecycle: { beauty: bl, repair: rl },
    asOf: new Date().toISOString(),
  }
}

// ── Per-FB-page customer lifecycle (Beauty 焕肤王 vs Repair 钻石露) ──────────────
const BEAUTY_CH = ['【焕肤】FB ', '【焕肤】FB', '焕肤 ENG']
const REPAIR_CH = ['【伤口】FB', '伤口 ENG', '新【钻石露】FB']

export type PageLifecycle = { onboarding: number; recurring: number; loyal: number; churn: number; total: number }

type PC = { orders: number; maxOrder: number; lastMs: number; vip: boolean }

async function lifecycleForChannels(
  recAll: Array<Array<{ fields: Record<string, unknown> }>>,
  channels: string[],
): Promise<PageLifecycle> {
  const oneYearAgo = Date.now() - 365 * 86400000
  const map = new Map<string, PC>()
  for (const set of recAll) {
    for (const r of set) {
      const f = r.fields
      const channel = fstr(f['Channel'])
      if (!channels.includes(channel)) continue
      const ms = fdateMs(f['Date'])
      const price = fnum(f['Total Price']) || fnum(f['Price Domain'])
      let key = normPhone(fstr(f['Phone Number']))
      if (!key) { const nm = fstr(f['Name']); if (nm) key = 'name:' + nm.toLowerCase(); else continue }
      let c = map.get(key)
      if (!c) { c = { orders: 0, maxOrder: 0, lastMs: 0, vip: false }; map.set(key, c) }
      c.orders++
      if (price > c.maxOrder) c.maxOrder = price
      if (ms > c.lastMs) c.lastMs = ms
      if (isActiveVip(f['AUTO VIP'])) c.vip = true
    }
  }
  let onboarding = 0, recurring = 0, loyal = 0, churn = 0
  for (const c of Array.from(map.values())) {
    if (c.lastMs && c.lastMs < oneYearAgo) { churn++; continue }
    if (c.orders <= 1) { onboarding++; continue }
    if (c.maxOrder >= 700 || c.vip) loyal++
    else recurring++
  }
  return { onboarding, recurring, loyal, churn, total: map.size }
}

export async function computeDdLifecycleByPage(): Promise<{ beauty: PageLifecycle; repair: PageLifecycle }> {
  const [ord26, daily25] = await Promise.all([
    fetchLarkRecords(T_ORDER_26, APP),
    fetchLarkRecords(T_DAILY_25, APP),
  ])
  const sets = [ord26 as Array<{ fields: Record<string, unknown> }>, daily25 as Array<{ fields: Record<string, unknown> }>]
  const [beauty, repair] = await Promise.all([
    lifecycleForChannels(sets, BEAUTY_CH),
    lifecycleForChannels(sets, REPAIR_CH),
  ])
  return { beauty, repair }
}
