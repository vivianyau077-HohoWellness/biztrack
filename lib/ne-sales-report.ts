import { fetchLarkRecordsSearch } from './lark'
import { NE_APP, fnum, fstr } from './ne-data'

// Nutrieye monthly sales distribution (New vs Repeat) from the official daily
// Race Report tables — 2025 + 2026, all channels. Used by the NE Sales Distribution tab.
const T_2026 = 'tblyv0SrWCTdbeU1'
const T_2025 = 'tblvMm3ccVMBeMJ5'

// 2026 Race Report (formula fields) vs 2025 Race Report (synced number fields) use
// different field names for the same concept.
const F26 = { date: 'Date', newSales: 'Total New Sales', repSales: 'Total Repeat Sales', total: 'Total Sales', newOrd: 'New Order', repOrd: 'Repeat Order', ad: 'Total Ad Spent' }
const F25 = { date: 'Date', newSales: 'Total New Sales Amount', repSales: 'Total Repeat Sales', total: 'Total Sales', newOrd: 'New Order', repOrd: 'Repeat Order', ad: 'Total Ad Spend (RM)' }

function dateMs(v: unknown): number {
  if (typeof v === 'number') return v
  if (Array.isArray(v) && typeof v[0] === 'number') return v[0] as number
  const o = v as { value?: unknown }
  if (o && Array.isArray(o.value) && typeof o.value[0] === 'number') return o.value[0] as number
  if (o && typeof o.value === 'number') return o.value
  const s = fstr(v); const t = Date.parse(s); return isNaN(t) ? 0 : t
}
const monthKey = (ms: number) => { const d = new Date(ms + 28800000); return d.getUTCFullYear() + '-' + String(d.getUTCMonth() + 1).padStart(2, '0') }

export type NeSalesMonth = { month: string; total: number; newSales: number; repeatSales: number; newOrders: number; repeatOrders: number; ad: number }
export type NeSalesReport = { months: string[]; metrics: NeSalesMonth[] }

async function readYear(tableId: string, f: typeof F26): Promise<Map<string, NeSalesMonth>> {
  const recs = await fetchLarkRecordsSearch(tableId, NE_APP, [f.date, f.newSales, f.repSales, f.total, f.newOrd, f.repOrd, f.ad])
  const byMonth = new Map<string, NeSalesMonth>()
  for (const rec of recs) {
    const fd = rec.fields
    const ms = dateMs(fd[f.date]); if (!ms) continue
    const mk = monthKey(ms)
    let m = byMonth.get(mk)
    if (!m) { m = { month: mk, total: 0, newSales: 0, repeatSales: 0, newOrders: 0, repeatOrders: 0, ad: 0 }; byMonth.set(mk, m) }
    m.newSales += fnum(fd[f.newSales])
    m.repeatSales += fnum(fd[f.repSales])
    m.total += fnum(fd[f.total])
    m.newOrders += fnum(fd[f.newOrd])
    m.repeatOrders += fnum(fd[f.repOrd])
    m.ad += fnum(fd[f.ad])
  }
  return byMonth
}

export async function computeNeSalesReport(): Promise<NeSalesReport> {
  const [m25, m26] = await Promise.all([
    readYear(T_2025, F25),
    readYear(T_2026, F26),
  ])
  const all = new Map<string, NeSalesMonth>()
  for (const m of [m25, m26]) for (const [k, v] of Array.from(m.entries())) all.set(k, v)
  const months = Array.from(all.keys()).sort()
  const metrics = months.map(k => all.get(k)!)
  return { months, metrics }
}
