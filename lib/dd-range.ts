import { fetchLarkRecords } from './lark'
import type { MonthMetrics } from './dd-sales-analysis'

// Aggregate DD metrics for an arbitrary date range [fromISO, toISO] (inclusive),
// reading live from Lark. Handles both the 2026 tables and the 2025 tables so a
// range in either year (or spanning both) works.
const APP = 'S8XXb8PT2a82ouslzQWjBaYap2g'
const T_ORDER_26 = 'tblpMwKyxbddnXNG'
const T_REPORT_26 = 'tbl68wmsOooWD2zJ'
const T_DAILY_25 = 'tblEy6fdbsuXhS6L'
const T_REPORT_25_H1 = 'tblrG424jTYEzlzv'
const T_REPORT_25_H2 = 'tblHQwpk6vx5nOy8'

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

// Unified N/R across 2025 + 2026 (option-id or mixed-case name).
const NR_ID: Record<string, string> = {
  optjM3sSTm: 'New', opt5RJTkyU: 'Repeat', opt1A1ejf7: 'No',
  optoZvAXSz: 'New', opt0hxGauT: 'Repeat', opt0SAyUSX: 'Repeat', optixYy5Wj: 'No', optquP2oVQ: 'No',
}
function nrOf(v: unknown): 'New' | 'Repeat' | 'No' {
  let s = fstr(v)
  if (NR_ID[s]) s = NR_ID[s]
  const l = s.toLowerCase()
  if (l === 'new') return 'New'
  if (l === 'repeat') return 'Repeat'
  return 'No'
}
// Unified VIP: Malaysia/Singapore VIP (2026) or Active VIP (2025) count as VIP.
const VIP_ID: Record<string, string> = {
  optqKyjYh5: 'Malaysia VIP', optm49F7wB: 'Singapore VIP', optlAbV6WH: 'Inactive VIP',
  optEZu1PrE: 'Active VIP', optMweUGfE: 'Inactive VIP',
}
function isVip(v: unknown): boolean {
  let s = fstr(v)
  if (VIP_ID[s]) s = VIP_ID[s]
  return s === 'Malaysia VIP' || s === 'Singapore VIP' || s === 'Active VIP'
}

const BEAUTY_CH = ['【焕肤】FB ', '【焕肤】FB', '焕肤 ENG']
const REPAIR_CH = ['【伤口】FB', '伤口 ENG']
const FBSG_CH = ['FB SG', 'FB SG MY', 'FB SG ENG']
const WA_ALL = ['WhatsApp', 'WhatsApp Eng', 'WhatsApp API', 'WhatsApp SG', 'WhatsApp SG ENG', 'WhatsApp 伤口']
const SHOPEE_ALL = ['Shopee', 'Shopee SG']
const FB_ALL = BEAUTY_CH.concat(REPAIR_CH).concat(['FB SG', 'FB SG MY', 'FB SG ENG'])
const inSet = (c: string, s: string[]) => s.includes(c)

type Rec = { fields: Record<string, unknown> }

export async function computeDdRange(fromISO: string, toISO: string): Promise<MonthMetrics> {
  // Lark stores dates at Malaysia-time (UTC+8) midnight, so use MYT day bounds.
  const fromMs = new Date(fromISO + 'T00:00:00+08:00').getTime()
  const toMs = new Date(toISO + 'T00:00:00+08:00').getTime() + 86399999
  const inRange = (ms: number) => ms >= fromMs && ms <= toMs
  const y0 = fromISO.slice(0, 4), y1 = toISO.slice(0, 4)
  const need25 = y0 <= '2025' || y1 <= '2025' || (y0 <= '2025' && y1 >= '2025')
  const need26 = y1 >= '2026' || y0 >= '2026'

  const orderTables: string[] = []
  const reportTables: string[] = []
  if (need26) { orderTables.push(T_ORDER_26); reportTables.push(T_REPORT_26) }
  if (need25) { orderTables.push(T_DAILY_25); reportTables.push(T_REPORT_25_H1, T_REPORT_25_H2) }

  const [orderSets, reportSets] = await Promise.all([
    Promise.all(orderTables.map(t => fetchLarkRecords(t, APP))),
    Promise.all(reportTables.map(t => fetchLarkRecords(t, APP))),
  ])

  // ── Order-level ────────────────────────────────
  let sales = 0, orders = 0
  const ch = new Map<string, number>()
  let newFb = 0, newWa = 0, repFb = 0, repWa = 0
  let ordNewOrder = 0, ordNewSales = 0, ordRepeatOrder = 0, ordRepeatSales = 0
  let vipOrder = 0, vipSales = 0
  let ordBeauty = 0, ordRepair = 0
  let bNewOrd = 0, bNewSales = 0, bRepOrd = 0, bRepSales = 0
  let rNewOrd = 0, rNewSales = 0, rRepOrd = 0, rRepSales = 0
  let sgNewSales = 0, sgRepSales = 0
  for (const set of orderSets) {
    for (const r of set as Rec[]) {
      const f = r.fields
      const ms = fdateMs(f['Date'])
      if (!inRange(ms)) continue
      const channel = fstr(f['Channel'])
      if (channel === 'Return') continue
      const price = fnum(f['Total Price']) || fnum(f['Price Domain'])
      const nr = nrOf(f['AUTO N/R'])
      sales += price; orders++
      ch.set(channel || '(unknown)', (ch.get(channel || '(unknown)') ?? 0) + price)
      const isFb = inSet(channel, FB_ALL), isWa = inSet(channel, WA_ALL)
      if (nr === 'New') { ordNewOrder++; ordNewSales += price; if (isFb) newFb += price; if (isWa) newWa += price }
      else if (nr === 'Repeat') { ordRepeatOrder++; ordRepeatSales += price; if (isFb) repFb += price; if (isWa) repWa += price }
      if (isVip(f['AUTO VIP'])) { vipOrder++; vipSales += price }
      if (inSet(channel, BEAUTY_CH)) { ordBeauty++; if (nr === 'New') { bNewOrd++; bNewSales += price } else if (nr === 'Repeat') { bRepOrd++; bRepSales += price } }
      if (inSet(channel, REPAIR_CH)) { ordRepair++; if (nr === 'New') { rNewOrd++; rNewSales += price } else if (nr === 'Repeat') { rRepOrd++; rRepSales += price } }
      if (inSet(channel, FBSG_CH)) { if (nr === 'New') sgNewSales += price; else if (nr === 'Repeat') sgRepSales += price }
    }
  }

  // ── Report-level ────────────────────────────────
  let adB = 0, adR = 0, adSG = 0, adWA = 0, ldB = 0, ldR = 0, ldSG = 0, pmB = 0, pmR = 0, pmSG = 0, wpmB = 0, wpmR = 0, wpmSG = 0
  let waAdB = 0, waAdR = 0, waAdSG = 0
  let repNewOrder = 0, repRepeatOrder = 0, repNewSales = 0, repRepeatSales = 0, goal = 0
  for (const set of reportSets) {
    for (const r of set as Rec[]) {
      const f = r.fields
      const ms = fdateMs(f['Date'])
      if (!inRange(ms)) continue
      // FB ad spend after SST only (excludes WhatsApp ad spend), matching the Lark dashboard.
      const pageAdB = fnum(f['FB Ad Cost After SST (焕肤王) (RM)'])
      const pageAdR = fnum(f['FB Ad Cost After SST (钻石露) (RM)'])
      const pageAdSG = fnum(f['Total Ad Spent SG'])
      const pageSum = pageAdB + pageAdR + pageAdSG
      if (pageSum > 0) { adB += pageAdB; adR += pageAdR; adSG += pageAdSG }
      else { adB += fnum(f['Total Ads Cost Spent']) || fnum(f['Total Ad Spend (RM)']) } // 2025: total only → put in adB bucket
      waAdB += fnum(f['WA Ads Spend (焕肤王) (SST)']); waAdR += fnum(f['WA Ads Spend (钻石露) (SST)']); waAdSG += fnum(f['WA Ads Spend (SG) (SST)'])
      adWA += fnum(f['WA Ads Spend (焕肤王) (SST)']) + fnum(f['WA Ads Spend (钻石露) (SST)']) + fnum(f['WA Ads Spend (SG) (SST)'])
      const pageLdB = fnum(f['PMed (焕肤王)']) + fnum(f['WA PMed (焕肤王)'])
      const pageLdR = fnum(f['PMed (钻石露)']) + fnum(f['WA PMed (钻石露)'])
      const pageLdSG = fnum(f['SG Total Pm']) + fnum(f['WA Pmed (SG)'])
      const ldSum = pageLdB + pageLdR + pageLdSG
      if (ldSum > 0) { ldB += pageLdB; ldR += pageLdR; ldSG += pageLdSG }
      else { ldB += fnum(f['PMed']) }
      pmB += fnum(f['PMed (焕肤王)']); pmR += fnum(f['PMed (钻石露)']); pmSG += fnum(f['SG Total Pm'])
      wpmB += fnum(f['WA PMed (焕肤王)']); wpmR += fnum(f['WA PMed (钻石露)']); wpmSG += fnum(f['WA Pmed (SG)'])
      repNewOrder += fnum(f['New Order'])
      repRepeatOrder += fnum(f['Repeat Order'])
      repNewSales += fnum(f['Total New Sales']) || fnum(f['Total New Sales Amount'])
      repRepeatSales += fnum(f['Total Repeat Sales'])
      const g = fnum(f['Goal Sales'])
      if (g > goal) goal = g
    }
  }

  // adFB here = Lark "Total Ad Spent" (FB Ad Cost After SST already includes WhatsApp ads).
  const adFB = adB + adR + adSG
  const totAd = adFB
  // Total Lead = FB PM (焕肤 + 修复 + SG) = Lark "No. of Total Messages" (already includes SG). WA PM excluded.
  const totLd = pmB + pmR + pmSG
  const R = (n: number) => Math.round(n)
  const div = (a: number, b: number) => (b ? a / b : 0)
  const chSum = (names: string[]) => names.reduce((s, n) => s + (ch.get(n) ?? 0), 0)

  return {
    month: fromISO + '~' + toISO,
    totalSales: R(sales),
    totalOrder: orders,
    fbBeauty: R(chSum(BEAUTY_CH)), fbRepair: R(chSum(REPAIR_CH)), fbSG: R(chSum(FBSG_CH)),
    whatsapp: R(chSum(WA_ALL)), shopee: R(chSum(SHOPEE_ALL)),
    website: R(chSum(['Website'])), lazada: R(chSum(['Lazada'])),
    others: R(sales - chSum(BEAUTY_CH) - chSum(REPAIR_CH) - chSum(FBSG_CH) - chSum(WA_ALL) - chSum(SHOPEE_ALL) - chSum(['Website']) - chSum(['Lazada'])),
    roas: Math.round(div(sales, totAd) * 100) / 100, adSpend: R(totAd), adFB: R(adFB - adWA), adWA: R(adWA),
    totalLead: R(totLd), cpl: R(div(totAd, totLd)),
    cplBeauty: R(div(adB - waAdB, pmB - wpmB)), cplRepair: R(div(adR - waAdR, pmR - wpmR)), cplSG: R(div(adSG - waAdSG, pmSG - wpmSG)),
    cplWaB: R(div(waAdB, wpmB)), cplWaR: R(div(waAdR, wpmR)), cplWaSG: R(div(waAdSG, wpmSG)),
    newOrder: ordNewOrder, newFbSales: R(newFb), newWaSales: R(newWa),
    repeatOrder: ordRepeatOrder, repeatFbSales: R(repFb), repeatWaSales: R(repWa),
    newConv: Math.round(div(ordNewOrder, totLd) * 1000) / 10,
    repeatConv: Math.round(div(ordRepeatOrder, totLd) * 1000) / 10,
    overallConv: Math.round(div(orders, totLd) * 1000) / 10,
    vipOrder, vipSales: R(vipSales),
    newAov: R(div(ordNewSales, ordNewOrder)), repeatAov: R(div(ordRepeatSales, ordRepeatOrder)),
    vipAov: R(div(vipSales, vipOrder)), overallAov: R(div(sales, orders)),
    goal: R(goal),
    adBeauty: R(adB - waAdB), adRepair: R(adR - waAdR), adSGspend: R(adSG - waAdSG),
    leadBeauty: R(ldB), leadRepair: R(ldR), leadSGn: R(ldSG),
    leadFbB: R(pmB - wpmB), leadFbR: R(pmR - wpmR), leadFbSG: R(pmSG - wpmSG), leadWaB: R(wpmB), leadWaR: R(wpmR), leadWaSG: R(wpmSG),
    ordBeauty, ordRepair,
    bNewOrd, bNewSales: R(bNewSales), bRepOrd, bRepSales: R(bRepSales),
    rNewOrd, rNewSales: R(rNewSales), rRepOrd, rRepSales: R(rRepSales),
    sgNewSales: R(sgNewSales), sgRepSales: R(sgRepSales),
  }
}
