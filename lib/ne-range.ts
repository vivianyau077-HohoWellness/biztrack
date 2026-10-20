import { fetchLarkRecordsSearch } from './lark'
import { NE_APP, fnum, fstr } from './ne-data'

// Nutrieye metrics over an arbitrary date range — powers NE Period Comparison. No VIP.
const T_ORDER = 'tblCgCKSZ3zALx6t'
const T_REPORT = 'tblyv0SrWCTdbeU1'
const O = ['Date', 'Channel', 'Total Price', 'Price Domain', 'AUTO N/R']
const R = ['Date', 'Total Ad Spent', 'No. of Total Messages']

function dateMs(v: unknown): number {
  if (typeof v === 'number') return v
  if (Array.isArray(v) && typeof v[0] === 'number') return v[0] as number
  const o = v as { value?: unknown }
  if (o && Array.isArray(o.value) && typeof o.value[0] === 'number') return o.value[0] as number
  if (o && typeof o.value === 'number') return o.value
  const s = fstr(v); const t = Date.parse(s); return isNaN(t) ? 0 : t
}
const dayKey = (ms: number) => { const d = new Date(ms + 28800000); return d.getUTCFullYear() + '-' + String(d.getUTCMonth() + 1).padStart(2, '0') + '-' + String(d.getUTCDate()).padStart(2, '0') }
function channelKey(c: string): string {
  if (c === 'Nutrieye FB') return 'fb'
  if (c === 'FB ENG') return 'fbEng'
  if (c.indexOf('WhatsApp') >= 0 || c.indexOf('Whatsapp') >= 0) return 'wa'
  if (c === 'Shopee SG') return 'shopeeSg'
  if (c === 'Shopee') return 'shopee'
  if (c === 'Lazada') return 'lazada'
  if (c === 'Offline NE') return 'offline'
  return 'others'
}

export type NeRange = {
  totalSales: number; totalOrder: number
  fb: number; fbEng: number; wa: number; shopee: number; shopeeSg: number; lazada: number; offline: number; others: number
  newOrder: number; newSales: number; repeatOrder: number; repeatSales: number; vipOrder: number; vipSales: number
  newAov: number; repeatAov: number; vipAov: number; overallAov: number
  adSpend: number; roas: number; messages: number; costPerMsg: number; cpna: number
  [k: string]: number
}
export type NePeriodResp = { a: NeRange; b: NeRange }

function blank(): NeRange {
  return { totalSales: 0, totalOrder: 0, fb: 0, fbEng: 0, wa: 0, shopee: 0, shopeeSg: 0, lazada: 0, offline: 0, others: 0,
    newOrder: 0, newSales: 0, repeatOrder: 0, repeatSales: 0, vipOrder: 0, vipSales: 0,
    newAov: 0, repeatAov: 0, vipAov: 0, overallAov: 0, adSpend: 0, roas: 0, messages: 0, costPerMsg: 0, cpna: 0 }
}

type Rec = { fields: Record<string, unknown> }
function rangeMetrics(orders: Rec[], reports: Rec[], from: string, to: string): NeRange {
  const m = blank()
  for (const rec of orders) {
    const f = rec.fields
    const ch = fstr(f['Channel']); if (ch === 'Return') continue
    const price = fnum(f['Total Price']) || fnum(f['Price Domain']); if (price <= 0) continue
    const ms = dateMs(f['Date']); if (!ms) continue
    const dk = dayKey(ms); if (dk < from || dk > to) continue
    m.totalSales += price; m.totalOrder += 1
    ;(m as Record<string, number>)[channelKey(ch)] += price
    const nr = fstr(f['AUTO N/R'])
    if (nr === 'New') { m.newOrder += 1; m.newSales += price }
    else if (nr === 'Repeat') { m.repeatOrder += 1; m.repeatSales += price }
  }
  for (const rec of reports) {
    const f = rec.fields
    const ms = dateMs(f['Date']); if (!ms) continue
    const dk = dayKey(ms); if (dk < from || dk > to) continue
    m.adSpend += fnum(f['Total Ad Spent'])
    m.messages += fnum(f['No. of Total Messages'])
  }
  m.roas = m.adSpend ? m.totalSales / m.adSpend : 0
  m.costPerMsg = m.messages ? m.adSpend / m.messages : 0
  m.cpna = m.newOrder ? m.adSpend / m.newOrder : 0
  m.newAov = m.newOrder ? m.newSales / m.newOrder : 0
  m.repeatAov = m.repeatOrder ? m.repeatSales / m.repeatOrder : 0
  m.overallAov = m.totalOrder ? m.totalSales / m.totalOrder : 0
  return m
}

export async function computeNePeriodCompare(aFrom: string, aTo: string, bFrom: string, bTo: string): Promise<NePeriodResp> {
  const [orders, reports] = await Promise.all([
    fetchLarkRecordsSearch(T_ORDER, NE_APP, O),
    fetchLarkRecordsSearch(T_REPORT, NE_APP, R),
  ])
  return { a: rangeMetrics(orders, reports, aFrom, aTo), b: rangeMetrics(orders, reports, bFrom, bTo) }
}
