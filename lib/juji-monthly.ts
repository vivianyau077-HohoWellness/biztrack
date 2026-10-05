import { fetchLarkRecordsSearch } from './lark'
import { fnum, fstr } from './ne-data'

// Jujigrainz monthly business analysis — by channel + New/Repeat/VIP, with ad / ROAS /
// messages / goal from the Race Report. Mirrors the DD "Monthly Sales Analysis" but on
// Juji's own channels (no 焕肤王/修复 product split).
const JUJI_APP = 'GXamw6ldPipdXFkkNY1j8RKzpzg'
const T_ORDER = 'tblIb0g8xEeRGsbe'
const T_REPORT = 'tbliqUdaDADNXKAd'

const O = ['Date', 'Channel', 'Total Price', 'Price Domain', 'AUTO N/R', 'AUTO VIP']
const R = ['Date', 'Total Ad Spent', 'Total ROAS', 'No. of Total Messages', 'Goal sales']

function dateMs(v: unknown): number {
  if (typeof v === 'number') return v
  if (Array.isArray(v) && typeof v[0] === 'number') return v[0] as number
  const o = v as { value?: unknown }
  if (o && Array.isArray(o.value) && typeof o.value[0] === 'number') return o.value[0] as number
  if (o && typeof o.value === 'number') return o.value
  const s = fstr(v); const t = Date.parse(s); return isNaN(t) ? 0 : t
}
const monthKey = (ms: number) => { const d = new Date(ms + 28800000); return d.getUTCFullYear() + '-' + String(d.getUTCMonth() + 1).padStart(2, '0') }

function channelKey(c: string): string {
  if (c === 'JUJI FB') return 'fb'
  if (c === 'FB ENG') return 'fbEng'
  if (c.indexOf('WhatsApp') >= 0 || c.indexOf('Whatsapp') >= 0) return 'wa'
  if (c === 'Shopee SG') return 'shopeeSg'
  if (c === 'Shopee') return 'shopee'
  if (c === 'Lazada') return 'lazada'
  if (c === 'Offline') return 'offline'
  return 'others' // Staff, Big Caring, etc.
}

export type JujiMonth = {
  month: string
  totalSales: number; totalOrder: number
  fb: number; fbEng: number; wa: number; shopee: number; shopeeSg: number; lazada: number; offline: number; others: number
  newOrder: number; newSales: number; repeatOrder: number; repeatSales: number; vipOrder: number; vipSales: number
  newAov: number; repeatAov: number; vipAov: number; overallAov: number
  adSpend: number; roas: number; messages: number; costPerMsg: number; goal: number
}
export type JujiMonthly = { months: string[]; metrics: JujiMonth[] }

export async function computeJujiMonthly(): Promise<JujiMonthly> {
  const [orders, reports] = await Promise.all([
    fetchLarkRecordsSearch(T_ORDER, JUJI_APP, O),
    fetchLarkRecordsSearch(T_REPORT, JUJI_APP, R),
  ])

  const byMonth = new Map<string, JujiMonth>()
  const ens = (mk: string): JujiMonth => {
    let m = byMonth.get(mk)
    if (!m) {
      m = { month: mk, totalSales: 0, totalOrder: 0, fb: 0, fbEng: 0, wa: 0, shopee: 0, shopeeSg: 0, lazada: 0, offline: 0, others: 0,
        newOrder: 0, newSales: 0, repeatOrder: 0, repeatSales: 0, vipOrder: 0, vipSales: 0,
        newAov: 0, repeatAov: 0, vipAov: 0, overallAov: 0, adSpend: 0, roas: 0, messages: 0, costPerMsg: 0, goal: 0 }
      byMonth.set(mk, m)
    }
    return m
  }

  for (const rec of orders) {
    const f = rec.fields
    const ch = fstr(f['Channel'])
    if (ch === 'Return') continue
    const price = fnum(f['Total Price']) || fnum(f['Price Domain'])
    if (price <= 0) continue
    const ms = dateMs(f['Date']); if (!ms) continue
    const m = ens(monthKey(ms))
    m.totalSales += price; m.totalOrder += 1
    ;(m as unknown as Record<string, number>)[channelKey(ch)] += price
    const nr = fstr(f['AUTO N/R'])
    const vip = fstr(f['AUTO VIP'])
    if (vip === 'Active VIP' || vip === 'Inactive VIP') { m.vipOrder += 1; m.vipSales += price }
    if (nr === 'New') { m.newOrder += 1; m.newSales += price }
    else if (nr === 'Repeat') { m.repeatOrder += 1; m.repeatSales += price }
  }

  // Race Report monthly: ad spend / messages / goal summed, ROAS recomputed from totals.
  const rep = new Map<string, { ad: number; msg: number; goal: number }>()
  for (const rec of reports) {
    const f = rec.fields
    const ms = dateMs(f['Date']); if (!ms) continue
    const mk = monthKey(ms)
    let r = rep.get(mk); if (!r) { r = { ad: 0, msg: 0, goal: 0 }; rep.set(mk, r) }
    r.ad += fnum(f['Total Ad Spent'])
    r.msg += fnum(f['No. of Total Messages'])
    const g = fnum(f['Goal sales']); if (g > r.goal) r.goal = g // goal is per-month constant repeated daily
  }

  for (const m of Array.from(byMonth.values())) {
    const r = rep.get(m.month)
    if (r) { m.adSpend = r.ad; m.messages = r.msg; m.goal = r.goal }
    m.roas = m.adSpend ? m.totalSales / m.adSpend : 0
    m.costPerMsg = m.messages ? m.adSpend / m.messages : 0
    m.newAov = m.newOrder ? m.newSales / m.newOrder : 0
    m.repeatAov = m.repeatOrder ? m.repeatSales / m.repeatOrder : 0
    m.vipAov = m.vipOrder ? m.vipSales / m.vipOrder : 0
    m.overallAov = m.totalOrder ? m.totalSales / m.totalOrder : 0
  }
  // include report-only months (e.g. a month with ad spend but no captured orders)
  for (const [mk, r] of Array.from(rep.entries())) {
    if (!byMonth.has(mk)) { const m = ens(mk); m.adSpend = r.ad; m.messages = r.msg; m.goal = r.goal; m.costPerMsg = r.msg ? r.ad / r.msg : 0 }
  }

  const months = Array.from(byMonth.keys()).sort()
  return { months, metrics: months.map(k => byMonth.get(k)!) }
}
