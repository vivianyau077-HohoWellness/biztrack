import { fetchLarkRecords } from './lark'
import type { MonthMetrics } from './dd-sales-analysis'

// 2025 historical data lives in separate tables with a slightly different shape.
//  - Daily sales 2025 (order-level): channel / N-R / VIP / per-page / WhatsApp split
//  - Sales report 2025 Jan–Jun (H1) + Jul–Dec (H2): ads / leads / New-Repeat orders & sales
const APP = 'S8XXb8PT2a82ouslzQWjBaYap2g'
const T_DAILY_2025 = 'tblEy6fdbsuXhS6L'
const T_REPORT_H1 = 'tblrG424jTYEzlzv' // Jan–Jun 2025
const T_REPORT_H2 = 'tblHQwpk6vx5nOy8' // Jul–Dec 2025

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
// Lark dates are stored at Malaysia-time (UTC+8) midnight; shift +8h before bucketing.
const monthOf = (ms: number) => (ms ? new Date(ms + 28800000).toISOString().slice(0, 7) : '')

// N/R may arrive as option-id, or as a name with mixed case ("New"/"repeat"/"no").
const NR_ID: Record<string, string> = {
  optoZvAXSz: 'New', opt0hxGauT: 'Repeat', opt0SAyUSX: 'Repeat', optixYy5Wj: 'No', optquP2oVQ: 'No',
  optjM3sSTm: 'New', opt5RJTkyU: 'Repeat', opt1A1ejf7: 'No',
}
function nrOf(v: unknown): 'New' | 'Repeat' | 'No' {
  let s = fstr(v)
  if (NR_ID[s]) s = NR_ID[s]
  const l = s.toLowerCase()
  if (l === 'new') return 'New'
  if (l === 'repeat') return 'Repeat'
  return 'No'
}
// VIP formula → "Active VIP" / "Inactive VIP" (option-id via list API).
const VIP_ID: Record<string, string> = { optEZu1PrE: 'Active VIP', optMweUGfE: 'Inactive VIP' }
function isActiveVip(v: unknown): boolean {
  let s = fstr(v)
  if (VIP_ID[s]) s = VIP_ID[s]
  return s === 'Active VIP'
}

const BEAUTY_CH = ['【焕肤】FB ', '【焕肤】FB', '焕肤 ENG']
const REPAIR_CH = ['【伤口】FB', '伤口 ENG']
const WA_ALL = ['WhatsApp', 'WhatsApp 伤口', 'WhatsApp Eng', 'WhatsApp API']
const SHOPEE_ALL = ['Shopee', 'Shopee SG']
const inSet = (c: string, s: string[]) => s.includes(c)

type Bucket = {
  sales: number; orders: number
  ch: Map<string, number>
  newFb: number; newWa: number; repFb: number; repWa: number
  vipOrder: number; vipSales: number
  newVipOrder: number; newVipSales: number; repVipOrder: number; repVipSales: number
  ordBeauty: number; ordRepair: number
  bNewOrd: number; bNewSales: number; bRepOrd: number; bRepSales: number
  rNewOrd: number; rNewSales: number; rRepOrd: number; rRepSales: number
}
type Rep = {
  ad: number; lead: number; newOrder: number; repeatOrder: number; newSales: number; repeatSales: number
  adBeauty: number; adRepair: number; leadBeauty: number; leadRepair: number
}

export async function computeDd2025Months(): Promise<MonthMetrics[]> {
  const [dailyRecs, h1Recs, h2Recs] = await Promise.all([
    fetchLarkRecords(T_DAILY_2025, APP),
    fetchLarkRecords(T_REPORT_H1, APP),
    fetchLarkRecords(T_REPORT_H2, APP),
  ])

  // ── Order-level daily table ────────────────────────────────
  const ob = new Map<string, Bucket>()
  const getB = (m: string) => {
    let x = ob.get(m)
    if (!x) {
      x = { sales: 0, orders: 0, ch: new Map(), newFb: 0, newWa: 0, repFb: 0, repWa: 0, vipOrder: 0, vipSales: 0, newVipOrder: 0, newVipSales: 0, repVipOrder: 0, repVipSales: 0, ordBeauty: 0, ordRepair: 0, bNewOrd: 0, bNewSales: 0, bRepOrd: 0, bRepSales: 0, rNewOrd: 0, rNewSales: 0, rRepOrd: 0, rRepSales: 0 }
      ob.set(m, x)
    }
    return x
  }
  for (const r of dailyRecs) {
    const f = r.fields as Record<string, unknown>
    const m = monthOf(fdateMs(f['Date']))
    if (!m || m.slice(0, 4) !== '2025') continue
    const channel = fstr(f['Channel'])
    if (channel === 'Return') continue
    const price = fnum(f['Total Price'])
    const nr = nrOf(f['AUTO N/R'])
    const x = getB(m)
    x.sales += price; x.orders++
    x.ch.set(channel || '(unknown)', (x.ch.get(channel || '(unknown)') ?? 0) + price)
    const isFb = inSet(channel, BEAUTY_CH) || inSet(channel, REPAIR_CH)
    const isWa = inSet(channel, WA_ALL)
    if (nr === 'New') { if (isFb) x.newFb += price; if (isWa) x.newWa += price }
    else if (nr === 'Repeat') { if (isFb) x.repFb += price; if (isWa) x.repWa += price }
    if (isActiveVip(f['AUTO VIP'])) {
      x.vipOrder++; x.vipSales += price
      if (nr === 'New') { x.newVipOrder++; x.newVipSales += price }
      else if (nr === 'Repeat') { x.repVipOrder++; x.repVipSales += price }
    }
    if (inSet(channel, BEAUTY_CH)) { x.ordBeauty++; if (nr === 'New') { x.bNewOrd++; x.bNewSales += price } else if (nr === 'Repeat') { x.bRepOrd++; x.bRepSales += price } }
    if (inSet(channel, REPAIR_CH)) { x.ordRepair++; if (nr === 'New') { x.rNewOrd++; x.rNewSales += price } else if (nr === 'Repeat') { x.rRepOrd++; x.rRepSales += price } }
  }

  // ── Report tables (H1 + H2) ────────────────────────────────
  const rb = new Map<string, Rep>()
  const getR = (m: string) => {
    let y = rb.get(m)
    if (!y) { y = { ad: 0, lead: 0, newOrder: 0, repeatOrder: 0, newSales: 0, repeatSales: 0, adBeauty: 0, adRepair: 0, leadBeauty: 0, leadRepair: 0 }; rb.set(m, y) }
    return y
  }
  const eatReport = (recs: Array<{ fields: Record<string, unknown> }>) => {
    for (const r of recs) {
      const f = r.fields as Record<string, unknown>
      const m = monthOf(fdateMs(f['Date']))
      if (!m || m.slice(0, 4) !== '2025') continue
      const y = getR(m)
      const adTot = fnum(f['Total Ads Cost Spent']) || fnum(f['Total Ad Spend (RM)'])
      const adB = fnum(f['FB Ad Cost After SST (焕肤王) (RM)'])
      const adR = fnum(f['FB Ad Cost After SST (钻石露) (RM)'])
      y.ad += adTot || (adB + adR)
      y.adBeauty += adB
      y.adRepair += adR
      const leadPage = fnum(f['PMed (焕肤王)']) + fnum(f['PMed (钻石露)'])
      y.lead += leadPage || fnum(f['PMed'])
      y.leadBeauty += fnum(f['PMed (焕肤王)'])
      y.leadRepair += fnum(f['PMed (钻石露)'])
      y.newOrder += fnum(f['New Order'])
      y.repeatOrder += fnum(f['Repeat Order'])
      y.newSales += fnum(f['Total New Sales Amount'])
      y.repeatSales += fnum(f['Total Repeat Sales'])
    }
  }
  eatReport(h1Recs as Array<{ fields: Record<string, unknown> }>)
  eatReport(h2Recs as Array<{ fields: Record<string, unknown> }>)

  // ── Assemble months ────────────────────────────────────────
  const monthSet = new Set<string>()
  for (const k of Array.from(ob.keys())) monthSet.add(k)
  for (const k of Array.from(rb.keys())) monthSet.add(k)
  const months = Array.from(monthSet).filter(Boolean).sort()

  const R = (n: number) => Math.round(n)
  const div = (a: number, b: number) => (b ? a / b : 0)
  const chSum = (x: Bucket, names: string[]) => names.reduce((s, n) => s + (x.ch.get(n) ?? 0), 0)
  const emptyB = getB
  const emptyR = getR

  return months.map(m => {
    const x = ob.get(m) ?? emptyB(m)
    const rep = rb.get(m) ?? emptyR(m)
    const fbBeauty = chSum(x, BEAUTY_CH)
    const fbRepair = chSum(x, REPAIR_CH)
    const whatsapp = chSum(x, WA_ALL)
    const shopee = chSum(x, SHOPEE_ALL)
    const lazada = chSum(x, ['Lazada'])
    const website = chSum(x, ['Website'])
    return {
      month: m,
      totalSales: R(x.sales),
      totalOrder: x.orders,
      fbBeauty: R(fbBeauty), fbRepair: R(fbRepair), fbSG: 0,
      whatsapp: R(whatsapp), shopee: R(shopee), website: R(website), lazada: R(lazada),
      others: R(x.sales - fbBeauty - fbRepair - whatsapp - shopee - website - lazada),
      roas: Math.round(div(x.sales, rep.ad) * 100) / 100, adSpend: R(rep.ad), adFB: R(rep.ad), adWA: 0,
      totalLead: R(rep.lead), cpl: R(div(rep.ad, rep.lead)),
      cplBeauty: R(div(rep.adBeauty, rep.leadBeauty)), cplRepair: R(div(rep.adRepair, rep.leadRepair)), cplSG: 0,
      cplWaB: 0, cplWaR: 0, cplWaSG: 0,
      newOrder: rep.newOrder, newFbSales: R(x.newFb), newWaSales: R(x.newWa),
      repeatOrder: rep.repeatOrder, repeatFbSales: R(x.repFb), repeatWaSales: R(x.repWa),
      newConv: Math.round(div(rep.newOrder, rep.lead) * 1000) / 10,
      repeatConv: Math.round(div(rep.repeatOrder, rep.lead) * 1000) / 10,
      overallConv: Math.round(div(x.orders, rep.lead) * 1000) / 10,
      vipOrder: x.vipOrder, vipSales: R(x.vipSales),
      newVipOrder: x.newVipOrder, newVipSales: R(x.newVipSales), repVipOrder: x.repVipOrder, repVipSales: R(x.repVipSales),
      newVipAov: R(div(x.newVipSales, x.newVipOrder)), repVipAov: R(div(x.repVipSales, x.repVipOrder)),
      newOtherSales: 0, totalNewSales: R(rep.newSales),
      repOtherSales: 0, totalRepeatSales: R(rep.repeatSales),
      newAov: R(div(rep.newSales, rep.newOrder)), repeatAov: R(div(rep.repeatSales, rep.repeatOrder)),
      vipAov: R(div(x.vipSales, x.vipOrder)), overallAov: R(div(x.sales, x.orders)),
      cpna: R(div(rep.ad, rep.newOrder)),
      goal: 0,
      adBeauty: R(rep.adBeauty), adRepair: R(rep.adRepair), adSGspend: 0,
      leadBeauty: R(rep.leadBeauty), leadRepair: R(rep.leadRepair), leadSGn: 0,
      leadFbB: R(rep.leadBeauty), leadFbR: R(rep.leadRepair), leadFbSG: 0, leadWaB: 0, leadWaR: 0, leadWaSG: 0,
      ordBeauty: x.ordBeauty, ordRepair: x.ordRepair,
      bNewOrd: x.bNewOrd, bNewSales: R(x.bNewSales), bRepOrd: x.bRepOrd, bRepSales: R(x.bRepSales),
      rNewOrd: x.rNewOrd, rNewSales: R(x.rNewSales), rRepOrd: x.rRepOrd, rRepSales: R(x.rRepSales),
      sgNewSales: 0, sgRepSales: 0,
    }
  })
}
