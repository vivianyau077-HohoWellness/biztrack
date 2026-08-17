import { fetchLarkRecords } from './lark'

// Live-from-Lark VIP metrics for Diamond Drink (all-time, phone-deduped).
// Source of truth = AUTO VIP single-select field (Malaysia VIP / Singapore VIP),
// already computed by Lark from the RM700 + 1-year rules. Replaces the stale Supabase path.
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
const isoDay = (ms: number) => (ms ? new Date(ms + 28800000).toISOString().slice(0, 10) : null)

const VIP_ID: Record<string, string> = { optqKyjYh5: 'Malaysia VIP', optm49F7wB: 'Singapore VIP', optlAbV6WH: 'Inactive VIP' }
function vipCountry(v: unknown): 'MY' | 'SG' | null {
  let s = fstr(v)
  if (VIP_ID[s]) s = VIP_ID[s]
  if (s === 'Malaysia VIP') return 'MY'
  if (s === 'Singapore VIP') return 'SG'
  return null
}

function normPhone(raw: string, sg = false): string {
  let d = (raw || '').replace(/[^0-9]/g, '')
  if (!d) return ''
  if (d.startsWith('60') || d.startsWith('65')) return d
  if (sg) return '65' + d
  if (d.startsWith('0')) d = '6' + d
  else d = '60' + d
  return d
}

export interface VIPStats {
  totalVIPs: number
  newVIPsThisMonth: number
  newVIPsLastMonth: number
  newCustomersThisMonth: number
  registrationRate: number | null
}
export interface LarkVIPRecord {
  id: string
  customerName: string | null
  phone: string | null
  orderDate: string | null
  totalPrice: number
  brand: string | null
  vipMemberNumber: string | null
}
export interface VIPEligibleRecord {
  customerName: string | null
  phone: string | null
  totalPrice: number
  orderDate: string | null
  orderNumber: string | null
}
export interface VipRegistration {
  year: number
  newVipTotal: number
  newVipMY: number
  newVipSG: number
  totalVipMY: number
  totalVipSG: number
  newCustomers: number
  registrationRate: number | null
  malaysiaVipAov: number
  singaporeVipAov: number
}
export interface DdVip {
  stats: VIPStats
  vips: LarkVIPRecord[]
  eligible: VIPEligibleRecord[]
  registration: VipRegistration
}

type C = {
  name: string; phone: string
  vip: 'MY' | 'SG' | null
  firstMs: number            // first order of any kind
  firstVipMs: number         // first VIP-tagged order
  lastVipMs: number          // latest VIP-tagged order
  vipMaxAmount: number       // biggest VIP-tagged order
  maxAmount: number          // biggest order (any) — for eligibility
  maxAmountMs: number
  isNewThisYear: boolean
}

export async function computeDdVip(): Promise<DdVip> {
  // Identical to dd-customer-insights SLIM_FIELDS so both share the same cached Lark read.
  const SLIM_FIELDS = ['Channel', 'Date', 'Total Price', 'Price Domain', 'Name', 'Package', 'Phone Number', 'AUTO VIP', 'AUTO N/R']
  const [ord26, daily25] = await Promise.all([
    fetchLarkRecords(T_ORDER_26, APP, undefined, SLIM_FIELDS),
    fetchLarkRecords(T_DAILY_25, APP, undefined, SLIM_FIELDS),
  ])
  const year = new Date().getFullYear()
  const nowMonth = monthKey(Date.now())
  const lastMonth = monthKey(new Date(new Date().getFullYear(), new Date().getMonth() - 1, 15).getTime())
  const oneYearAgo = Date.now() - 365 * 86400000

  const map = new Map<string, C>()
  // VIP AOV (repeat customers only, per order) split by country
  let myVipSpend = 0, myVipOrders = 0, sgVipSpend = 0, sgVipOrders = 0

  const eat = (recs: Array<{ fields: Record<string, unknown> }>) => {
    for (const r of recs) {
      const f = r.fields
      const channel = fstr(f['Channel'])
      if (channel === 'Return') continue
      const ms = fdateMs(f['Date'])
      const price = fnum(f['Total Price']) || fnum(f['Price Domain'])
      const nm = fstr(f['Name'])
      const chL = channel.toLowerCase()
      const isSg = chL.indexOf('sg') >= 0
      let key = normPhone(fstr(f['Phone Number']), isSg)
      if (!key) {
        const marketplace = chL.indexOf('shopee') >= 0 || chL.indexOf('lazada') >= 0
        if (marketplace && nm) key = 'name:' + nm.toLowerCase()
        else continue
      }
      const vc = vipCountry(f['AUTO VIP'])
      const nr = fstr(f['AUTO N/R'])

      let c = map.get(key)
      if (!c) { c = { name: '', phone: '', vip: null, firstMs: Number.MAX_SAFE_INTEGER, firstVipMs: Number.MAX_SAFE_INTEGER, lastVipMs: 0, vipMaxAmount: 0, maxAmount: 0, maxAmountMs: 0, isNewThisYear: false }; map.set(key, c) }
      if (nm && !c.name) c.name = nm
      if (!c.phone) { const ph = fstr(f['Phone Number']); if (ph) c.phone = ph }
      if (ms && ms < c.firstMs) c.firstMs = ms
      if (price > c.maxAmount) { c.maxAmount = price; c.maxAmountMs = ms }
      if (nr === 'New' && monthKey(ms).slice(0, 4) === String(year)) c.isNewThisYear = true
      if (vc) {
        c.vip = vc
        if (ms && ms < c.firstVipMs) c.firstVipMs = ms
        if (ms > c.lastVipMs) c.lastVipMs = ms
        if (price > c.vipMaxAmount) c.vipMaxAmount = price
        // VIP AOV: repeat-customer VIP orders only
        if (nr === 'Repeat') {
          if (vc === 'MY') { myVipSpend += price; myVipOrders++ }
          else { sgVipSpend += price; sgVipOrders++ }
        }
      }
    }
  }
  eat(ord26 as Array<{ fields: Record<string, unknown> }>)
  eat(daily25 as Array<{ fields: Record<string, unknown> }>)

  const custs = Array.from(map.values())

  // ── Top-card stats ──
  let totalVIPs = 0, newVIPsThisMonth = 0, newVIPsLastMonth = 0, newCustomersThisMonth = 0
  // ── This-year registration ──
  let totalVipMY = 0, totalVipSG = 0, newVipMY = 0, newVipSG = 0, newCustomersYear = 0
  const vips: LarkVIPRecord[] = []
  const eligible: VIPEligibleRecord[] = []

  for (const c of custs) {
    const firstVipMonth = c.firstVipMs !== Number.MAX_SAFE_INTEGER ? monthKey(c.firstVipMs) : ''
    if (c.vip) {
      totalVIPs++
      if (firstVipMonth === nowMonth) newVIPsThisMonth++
      else if (firstVipMonth === lastMonth) newVIPsLastMonth++
      vips.push({
        id: (c.phone || c.name || String(vips.length)),
        customerName: c.name || null,
        phone: c.phone || null,
        orderDate: isoDay(c.lastVipMs),
        totalPrice: c.vipMaxAmount,
        brand: 'DD',
        vipMemberNumber: null,
      })
      if (c.vip === 'MY') { totalVipMY++; if (c.isNewThisYear) newVipMY++ }
      else { totalVipSG++; if (c.isNewThisYear) newVipSG++ }
    } else {
      // Eligible: not VIP, but has an order ≥ RM700 within the past 365 days
      if (c.maxAmount >= 700 && c.maxAmountMs && c.maxAmountMs >= oneYearAgo) {
        eligible.push({
          customerName: c.name || null,
          phone: c.phone || null,
          totalPrice: c.maxAmount,
          orderDate: isoDay(c.maxAmountMs),
          orderNumber: null,
        })
      }
    }
    if (monthKey(c.firstMs) === nowMonth) newCustomersThisMonth++
    if (c.isNewThisYear) newCustomersYear++
  }

  vips.sort((a, b) => (b.orderDate ?? '').localeCompare(a.orderDate ?? ''))
  eligible.sort((a, b) => b.totalPrice - a.totalPrice)

  const registrationRate = newCustomersThisMonth === 0 ? null : Math.round((newVIPsThisMonth / newCustomersThisMonth) * 100)
  const newVipTotal = newVipMY + newVipSG
  const yearRate = newCustomersYear > 0 ? Math.round((newVipTotal / newCustomersYear) * 1000) / 10 : null
  const malaysiaVipAov = myVipOrders > 0 ? Math.round((myVipSpend / myVipOrders) * 100) / 100 : 0
  const singaporeVipAov = sgVipOrders > 0 ? Math.round((sgVipSpend / sgVipOrders) * 100) / 100 : 0

  return {
    stats: { totalVIPs, newVIPsThisMonth, newVIPsLastMonth, newCustomersThisMonth, registrationRate },
    vips,
    eligible,
    registration: { year, newVipTotal, newVipMY, newVipSG, totalVipMY, totalVipSG, newCustomers: newCustomersYear, registrationRate: yearRate, malaysiaVipAov, singaporeVipAov },
  }
}
