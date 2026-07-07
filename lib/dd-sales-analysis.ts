import { fetchLarkRecords } from './lark'

// Monthly sales analysis for DD.
//  - Ads (after SST) + leads (PMed) + New/Repeat orders & sales come from the
//    daily "Race Report" table (already recorded per page).
//  - VIP + per-platform channel breakdown come from the daily order table.
const APP = 'S8XXb8PT2a82ouslzQWjBaYap2g'
const T_ORDER = 'tblpMwKyxbddnXNG'
const T_REPORT = 'tbl68wmsOooWD2zJ'

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
const monthOf = (ms: number) => (ms ? new Date(ms).toISOString().slice(0, 7) : '')

// The LIST API returns formula single-select as option IDs — map them to names.
const NR_MAP: Record<string, string> = { optjM3sSTm: 'New', opt5RJTkyU: 'Repeat', opt1A1ejf7: 'No' }
const VIP_MAP: Record<string, string> = { optqKyjYh5: 'Malaysia VIP', optm49F7wB: 'Singapore VIP', optlAbV6WH: 'Inactive VIP' }
const nrVal = (v: unknown) => { const s = fstr(v); return NR_MAP[s] ?? s }
const vipVal = (v: unknown) => { const s = fstr(v); return VIP_MAP[s] ?? s }

const BEAUTY_CH = ['【焕肤】FB ', '【焕肤】FB', '焕肤 ENG']
const REPAIR_CH = ['【伤口】FB', '伤口 ENG']
const SG_CH = ['FB SG', 'FB SG MY', 'Shopee SG', 'WhatsApp SG', 'WhatsApp SG ENG', 'FB SG ENG']
const FB_ALL = [...BEAUTY_CH, ...REPAIR_CH, 'FB SG', 'FB SG MY', 'FB SG ENG']
const WA_ALL = ['WhatsApp', 'WhatsApp Eng', 'WhatsApp API', 'WhatsApp SG', 'WhatsApp SG ENG']
const SHOPEE_ALL = ['Shopee', 'Shopee SG']
const FBSG_CH = ['FB SG', 'FB SG MY', 'FB SG ENG']
const inSet = (c: string, s: string[]) => s.includes(c)

export type MonthMetrics = {
  month: string
  totalSales: number
  totalOrder: number
  fbBeauty: number; fbRepair: number; fbSG: number; whatsapp: number; shopee: number; website: number; lazada: number; others: number
  roas: number; adSpend: number
  totalLead: number; cpl: number
  newOrder: number; newFbSales: number; newWaSales: number
  repeatOrder: number; repeatFbSales: number; repeatWaSales: number
  newConv: number; repeatConv: number; overallConv: number
  vipOrder: number; vipSales: number
  newAov: number; repeatAov: number; vipAov: number; overallAov: number
  goal: number
  adBeauty: number; adRepair: number; adSGspend: number
  leadBeauty: number; leadRepair: number; leadSGn: number
  ordBeauty: number; ordRepair: number
}

// Metrics-as-rows × months-as-columns matrix (all months at once).
export async function computeDdSalesMatrix() {
  const [orderRecs, reportRecs] = await Promise.all([
    fetchLarkRecords(T_ORDER, APP),
    fetchLarkRecords(T_REPORT, APP),
  ])

  type OB = {
    sales: number; orders: number
    ch: Map<string, number>
    newOrder: number; newSales: number; repeatOrder: number; repeatSales: number
    newFb: number; newWa: number; repFb: number; repWa: number
    vipOrder: number; vipSales: number
    ordBeauty: number; ordRepair: number
  }
  const ob = new Map<string, OB>()
  const getOB = (m: string) => {
    let x = ob.get(m)
    if (!x) { x = { sales: 0, orders: 0, ch: new Map(), newOrder: 0, newSales: 0, repeatOrder: 0, repeatSales: 0, newFb: 0, newWa: 0, repFb: 0, repWa: 0, vipOrder: 0, vipSales: 0, ordBeauty: 0, ordRepair: 0 }; ob.set(m, x) }
    return x
  }

  for (const r of orderRecs) {
    const f = r.fields as Record<string, unknown>
    const m = monthOf(fdateMs(f['Date']))
    if (!m) continue
    const channel = fstr(f['Channel'])
    if (channel === 'Return') continue
    const price = fnum(f['Total Price']) || fnum(f['Price Domain'])
    const nr = nrVal(f['AUTO N/R'])
    const vip = vipVal(f['AUTO VIP'])
    const x = getOB(m)
    x.sales += price; x.orders++
    x.ch.set(channel || '(unknown)', (x.ch.get(channel || '(unknown)') ?? 0) + price)
    const isFb = inSet(channel, FB_ALL), isWa = inSet(channel, WA_ALL)
    if (nr === 'New') { x.newOrder++; x.newSales += price; if (isFb) x.newFb += price; if (isWa) x.newWa += price }
    else if (nr === 'Repeat') { x.repeatOrder++; x.repeatSales += price; if (isFb) x.repFb += price; if (isWa) x.repWa += price }
    if (vip === 'Malaysia VIP' || vip === 'Singapore VIP') { x.vipOrder++; x.vipSales += price }
    if (inSet(channel, BEAUTY_CH)) x.ordBeauty++
    if (inSet(channel, REPAIR_CH)) x.ordRepair++
  }

  type RB = { adB: number; adR: number; adSG: number; ldB: number; ldR: number; ldSG: number; goal: number; newOrder: number; repeatOrder: number; newSales: number; repeatSales: number }
  const emptyRB = (): RB => ({ adB: 0, adR: 0, adSG: 0, ldB: 0, ldR: 0, ldSG: 0, goal: 0, newOrder: 0, repeatOrder: 0, newSales: 0, repeatSales: 0 })
  const rb = new Map<string, RB>()
  for (const r of reportRecs) {
    const f = r.fields as Record<string, unknown>
    const m = monthOf(fdateMs(f['Date']))
    if (!m) continue
    const y = rb.get(m) ?? emptyRB()
    y.adB += fnum(f['FB Ad Cost After SST (焕肤王) (RM)']) + fnum(f['WA Ads Spend (焕肤王) (SST)'])
    y.adR += fnum(f['FB Ad Cost After SST (钻石露) (RM)']) + fnum(f['WA Ads Spend (钻石露) (SST)'])
    y.adSG += fnum(f['Total Ad Spent SG']) + fnum(f['WA Ads Spend (SG) (SST)'])
    y.ldB += fnum(f['PMed (焕肤王)']) + fnum(f['WA PMed (焕肤王)'])
    y.ldR += fnum(f['PMed (钻石露)']) + fnum(f['WA PMed (钻石露)'])
    y.ldSG += fnum(f['SG Total Pm']) + fnum(f['WA Pmed (SG)'])
    y.newOrder += fnum(f['New Order'])
    y.repeatOrder += fnum(f['Repeat Order'])
    y.newSales += fnum(f['Total New Sales'])
    y.repeatSales += fnum(f['Total Repeat Sales'])
    const g = fnum(f['Goal Sales'])
    if (g > y.goal) y.goal = g // same per month; take the value
    rb.set(m, y)
  }

  const monthSet = new Set<string>()
  for (const k of Array.from(ob.keys())) monthSet.add(k)
  for (const k of Array.from(rb.keys())) monthSet.add(k)
  const months = Array.from(monthSet).filter(Boolean).sort()
  const R = (n: number) => Math.round(n)
  const div = (a: number, b: number) => (b ? a / b : 0)
  const chSum = (x: OB, names: string[]) => names.reduce((s, n) => s + (x.ch.get(n) ?? 0), 0)

  const metrics: MonthMetrics[] = months.map(m => {
    const x = ob.get(m) ?? getOB(m)
    const rep = rb.get(m) ?? emptyRB()
    const totAd = rep.adB + rep.adR + rep.adSG
    const totLd = rep.ldB + rep.ldR + rep.ldSG
    return {
      month: m,
      totalSales: R(x.sales),
      totalOrder: x.orders,
      fbBeauty: R(chSum(x, BEAUTY_CH)), fbRepair: R(chSum(x, REPAIR_CH)), fbSG: R(chSum(x, FBSG_CH)),
      whatsapp: R(chSum(x, WA_ALL)), shopee: R(chSum(x, SHOPEE_ALL)),
      website: R(chSum(x, ['Website'])), lazada: R(chSum(x, ['Lazada'])),
      others: R(x.sales - chSum(x, BEAUTY_CH) - chSum(x, REPAIR_CH) - chSum(x, FBSG_CH) - chSum(x, WA_ALL) - chSum(x, SHOPEE_ALL) - chSum(x, ['Website']) - chSum(x, ['Lazada'])),
      roas: Math.round(div(x.sales, totAd) * 100) / 100, adSpend: R(totAd),
      totalLead: R(totLd), cpl: R(div(totAd, totLd)),
      newOrder: rep.newOrder, newFbSales: R(x.newFb), newWaSales: R(x.newWa),
      repeatOrder: rep.repeatOrder, repeatFbSales: R(x.repFb), repeatWaSales: R(x.repWa),
      newConv: Math.round(div(rep.newOrder, totLd) * 1000) / 10,
      repeatConv: Math.round(div(rep.repeatOrder, totLd) * 1000) / 10,
      overallConv: Math.round(div(x.orders, totLd) * 1000) / 10,
      vipOrder: x.vipOrder, vipSales: R(x.vipSales),
      newAov: R(div(rep.newSales, rep.newOrder)), repeatAov: R(div(rep.repeatSales, rep.repeatOrder)),
      vipAov: R(div(x.vipSales, x.vipOrder)), overallAov: R(div(x.sales, x.orders)),
      goal: R(rep.goal),
      adBeauty: R(rep.adB), adRepair: R(rep.adR), adSGspend: R(rep.adSG),
      leadBeauty: R(rep.ldB), leadRepair: R(rep.ldR), leadSGn: R(rep.ldSG),
      ordBeauty: x.ordBeauty, ordRepair: x.ordRepair,
    }
  })

  return { months, metrics }
}

export async function computeDdSalesAnalysis(month: string) {
  const [orderRecs, reportRecs] = await Promise.all([
    fetchLarkRecords(T_ORDER, APP),
    fetchLarkRecords(T_REPORT, APP),
  ])

  // ── From daily order table: channel breakdown + VIP ────────────────────────
  const byChannel = new Map<string, { orders: number; sales: number }>()
  let vipOrders = 0, vipSales = 0
  for (const r of orderRecs) {
    const f = r.fields as Record<string, unknown>
    if (monthOf(fdateMs(f['Date'])) !== month) continue
    const channel = fstr(f['Channel']) || '(unknown)'
    if (channel === 'Return') continue
    const price = fnum(f['Total Price']) || fnum(f['Price Domain'])
    const c = byChannel.get(channel) ?? { orders: 0, sales: 0 }
    c.orders++; c.sales += price
    byChannel.set(channel, c)
    const vip = fstr(f['AUTO VIP'])
    if (vip === 'Malaysia VIP' || vip === 'Singapore VIP') { vipOrders++; vipSales += price }
  }
  const channelSales = (names: string[]) => names.reduce((s, n) => s + (byChannel.get(n)?.sales ?? 0), 0)

  // ── From Race Report (daily): sum for the month ────────────────────────────
  let totalSales = 0, newOrders = 0, newSales = 0, repeatOrders = 0, repeatSales = 0
  let adB = 0, adR = 0, adSG = 0, ldB = 0, ldR = 0, ldSG = 0
  let maxMs = 0, fcActual = 0, fcEst = 0, fcGoal = 0
  for (const r of reportRecs) {
    const f = r.fields as Record<string, unknown>
    const ms = fdateMs(f['Date'])
    if (monthOf(ms) !== month) continue
    if (ms > maxMs) {
      maxMs = ms
      fcActual = fnum(f['Accumulated Sales Amount'])
      fcEst = fnum(f['Estimated Sales of the Month'])
      fcGoal = fnum(f['Goal Sales'])
    }
    totalSales += fnum(f['Total Sales'])
    newOrders += fnum(f['New Order'])
    repeatOrders += fnum(f['Repeat Order'])
    newSales += fnum(f['Total New Sales'])
    repeatSales += fnum(f['Total Repeat Sales'])
    adB += fnum(f['FB Ad Cost After SST (焕肤王) (RM)']) + fnum(f['WA Ads Spend (焕肤王) (SST)'])
    adR += fnum(f['FB Ad Cost After SST (钻石露) (RM)']) + fnum(f['WA Ads Spend (钻石露) (SST)'])
    adSG += fnum(f['Total Ad Spent SG']) + fnum(f['WA Ads Spend (SG) (SST)'])
    ldB += fnum(f['PMed (焕肤王)']) + fnum(f['WA PMed (焕肤王)'])
    ldR += fnum(f['PMed (钻石露)']) + fnum(f['WA PMed (钻石露)'])
    ldSG += fnum(f['SG Total Pm']) + fnum(f['WA Pmed (SG)'])
  }
  const totalAd = adB + adR + adSG
  const totalLeads = ldB + ldR + ldSG
  const totalOrders = newOrders + repeatOrders
  const round = (n: number) => Math.round(n)
  const aov = (s: number, o: number) => (o ? round(s / o) : 0)
  const roasOf = (s: number, a: number) => (a ? Math.round((s / a) * 100) / 100 : 0)
  const cplOf = (a: number, l: number) => (l ? Math.round(a / l) : 0)

  const channels = Array.from(byChannel.entries())
    .map(([channel, a]) => ({ channel, orders: a.orders, sales: round(a.sales), pct: totalSales ? Math.round((a.sales / totalSales) * 1000) / 10 : 0 }))
    .sort((x, y) => y.sales - x.sales)

  const page = (name: string, ad: number, leads: number, sales: number) => ({
    name, ad: round(ad), leads: round(leads), sales: round(sales), cpl: cplOf(ad, leads), roas: roasOf(sales, ad),
  })

  return {
    month,
    total: { orders: totalOrders, sales: round(totalSales), aov: aov(totalSales, totalOrders) },
    new: { orders: newOrders, sales: round(newSales), aov: aov(newSales, newOrders) },
    repeat: { orders: repeatOrders, sales: round(repeatSales), aov: aov(repeatSales, repeatOrders) },
    vip: { orders: vipOrders, sales: round(vipSales), aov: aov(vipSales, vipOrders) },
    channels,
    ads: { beauty: round(adB), repair: round(adR), sg: round(adSG), total: round(totalAd) },
    leads: { beauty: round(ldB), repair: round(ldR), sg: round(ldSG), total: round(totalLeads) },
    roas: roasOf(totalSales, totalAd),
    forecast: {
      actual: round(fcActual || totalSales),
      estimated: round(fcEst || totalSales),
      goal: round(fcGoal),
      toGoalPct: fcGoal ? Math.round(((fcActual || totalSales) / fcGoal) * 100) : 0,
    },
    pages: [
      page('Beauty (焕肤王)', adB, ldB, channelSales(BEAUTY_CH)),
      page('Repair (钻石露)', adR, ldR, channelSales(REPAIR_CH)),
      page('SG', adSG, ldSG, channelSales(SG_CH)),
    ],
  }
}
