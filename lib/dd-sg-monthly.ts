import { fetchLarkRecords } from './lark'

// Live SG (Singapore) monthly performance.
// PM (messages) + ad spend come from the Race Report; sales + New/Repeat breakdown
// come from the ORDER table (the report's "Repeat Sales SG" field is largely unfilled).
const APP = 'S8XXb8PT2a82ouslzQWjBaYap2g'
const T_REPORT = 'tbl68wmsOooWD2zJ'
const T_ORDER_26 = 'tblpMwKyxbddnXNG'

function fstr(v: unknown): string {
  if (v == null) return ''
  if (typeof v === 'string') return v.trim()
  if (typeof v === 'number') return String(v)
  if (Array.isArray(v)) return v.map(x => (typeof x === 'string' ? x : ((x as { text?: string })?.text ?? ''))).join('').trim()
  const o = v as { value?: unknown; text?: string }
  if (Array.isArray(o.value)) return o.value.map(x => (typeof x === 'string' ? x : ((x as { text?: string })?.text ?? ''))).join('').trim()
  if (o.text) return String(o.text).trim()
  return ''
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
const monthKey = (ms: number) => (ms ? new Date(ms + 28800000).toISOString().slice(0, 7) : '')

export interface SgMonth {
  month: string        // e.g. '2026-02'
  label: string        // e.g. 'Feb'
  pmFb: number         // FB SG messages
  pmWa: number         // WhatsApp SG messages
  pm: number           // total SG messages
  sales: number        // SG sales
  ad: number           // SG ad spend
  cpm: number          // cost per message = ad / pm
  roas: number         // sales / ad
  newOrder: number; newSales: number; newAov: number
  repeatOrder: number; repeatSales: number; repeatAov: number
}

// SG channels — must match the Race Report "sales SG" formula exactly (New+Repeat then tally).
const SG_CHANNELS = ['FB SG', 'Shopee SG', 'FB SG MY', 'WhatsApp SG', 'FB SG ENG']

// The GET records endpoint returns AUTO N/R as an option ID — map it to New/Repeat.
const NR_MAP: Record<string, string> = { optjM3sSTm: 'New', opt5RJTkyU: 'Repeat', opt1A1ejf7: 'No' }
const nrVal = (v: unknown) => { const s = fstr(v); return NR_MAP[s] ?? s }

const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

export interface SgChannel {
  channel: string
  newOrders: number; newSales: number
  repeatOrders: number; repeatSales: number
  total: number
}
export interface SgResult { months: SgMonth[]; byChannel: SgChannel[] }

export async function computeDdSgMonthly(year = 2026): Promise<SgResult> {
  const [report, orders] = await Promise.all([
    fetchLarkRecords(T_REPORT, APP, undefined, ['Date', 'SG Total Pm', 'WA Pmed (SG)', 'Total Ad Spent SG', 'Total Sales SG']),
    fetchLarkRecords(T_ORDER_26, APP, undefined, ['Date', 'Channel', 'AUTO N/R', 'Total Price', 'Price Domain']),
  ])

  const map = new Map<string, { pmFb: number; pmWa: number; sales: number; ad: number; no: number; ro: number; ns: number; rs: number }>()
  const get = (m: string) => { let x = map.get(m); if (!x) { x = { pmFb: 0, pmWa: 0, sales: 0, ad: 0, no: 0, ro: 0, ns: 0, rs: 0 }; map.set(m, x) } return x }
  // Per-channel New/Repeat sales distribution (across the year)
  const chMap = new Map<string, { newOrders: number; newSales: number; repeatOrders: number; repeatSales: number }>()
  const getCh = (c: string) => { let x = chMap.get(c); if (!x) { x = { newOrders: 0, newSales: 0, repeatOrders: 0, repeatSales: 0 }; chMap.set(c, x) } return x }

  // PM + ad spend from the Race Report
  for (const r of report) {
    const f = r.fields
    const m = monthKey(fdateMs(f['Date']))
    if (!m || m.slice(0, 4) !== String(year)) continue
    const x = get(m)
    x.pmFb += fnum(f['SG Total Pm'])
    x.pmWa += fnum(f['WA Pmed (SG)'])
    x.ad += fnum(f['Total Ad Spent SG'])
    x.sales += fnum(f['Total Sales SG'])   // Total Sales SG follows the Race Report formula (incl Shopee)
  }
  // Sales + New/Repeat from the ORDER table (SG channels only)
  for (const r of orders) {
    const f = r.fields
    const channel = fstr(f['Channel'])
    // Exactly the 5 channels the Race Report uses (incl Shopee SG) — so New+Repeat tally.
    if (SG_CHANNELS.indexOf(channel) < 0) continue
    const price = fnum(f['Total Price']) || fnum(f['Price Domain'])
    if (!price) continue
    const m = monthKey(fdateMs(f['Date']))
    if (!m || m.slice(0, 4) !== String(year)) continue
    const nr = nrVal(f['AUTO N/R'])
    const x = get(m)
    const ch = getCh(channel)
    // Sales total follows the report (above); order table drives New/Repeat + per-channel detail.
    if (nr === 'New') { x.no++; x.ns += price; ch.newOrders++; ch.newSales += price }
    else if (nr === 'Repeat') { x.ro++; x.rs += price; ch.repeatOrders++; ch.repeatSales += price }
  }

  const out: SgMonth[] = []
  for (const m of Array.from(map.keys()).sort()) {
    const x = map.get(m)!
    const pm = x.pmFb + x.pmWa
    out.push({
      month: m,
      label: MON[parseInt(m.slice(5, 7), 10) - 1] ?? m,
      pmFb: Math.round(x.pmFb), pmWa: Math.round(x.pmWa), pm: Math.round(pm),
      sales: Math.round(x.sales), ad: Math.round(x.ad),
      cpm: pm ? Math.round((x.ad / pm) * 100) / 100 : 0,
      roas: x.ad ? Math.round((x.sales / x.ad) * 100) / 100 : 0,
      newOrder: Math.round(x.no), newSales: Math.round(x.ns), newAov: x.no ? Math.round(x.ns / x.no) : 0,
      repeatOrder: Math.round(x.ro), repeatSales: Math.round(x.rs), repeatAov: x.ro ? Math.round(x.rs / x.ro) : 0,
    })
  }
  const byChannel: SgChannel[] = Array.from(chMap.entries()).map(([channel, c]) => ({
    channel,
    newOrders: c.newOrders, newSales: Math.round(c.newSales),
    repeatOrders: c.repeatOrders, repeatSales: Math.round(c.repeatSales),
    total: Math.round(c.newSales + c.repeatSales),
  })).sort((a, b) => b.total - a.total)

  return { months: out, byChannel }
}
