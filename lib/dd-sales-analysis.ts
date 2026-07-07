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
  if (Array.isArray(o.value)) return o.value.map(x => (typeof x === 'string' ? x : ((x as { text?: string })?.text ?? ''))).join('').trim()
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

const BEAUTY_CH = ['【焕肤】FB ', '【焕肤】FB', '焕肤 ENG']
const REPAIR_CH = ['【伤口】FB', '伤口 ENG']
const SG_CH = ['FB SG', 'FB SG MY', 'Shopee SG', 'WhatsApp SG', 'WhatsApp SG ENG', 'FB SG ENG']

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
  for (const r of reportRecs) {
    const f = r.fields as Record<string, unknown>
    if (monthOf(fdateMs(f['Date'])) !== month) continue
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
    pages: [
      page('Beauty (焕肤王)', adB, ldB, channelSales(BEAUTY_CH)),
      page('Repair (钻石露)', adR, ldR, channelSales(REPAIR_CH)),
      page('SG', adSG, ldSG, channelSales(SG_CH)),
    ],
  }
}
