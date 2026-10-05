import { fetchLarkRecordsSearch } from './lark'
import { fnum, fstr } from './ne-data'

// Jujigrainz monthly sales distribution (New vs Repeat) from the official daily
// Race Report. Juji launched in 2026, so there is only a 2026 report table.
const JUJI_APP = 'GXamw6ldPipdXFkkNY1j8RKzpzg'
const T_REPORT = 'tbliqUdaDADNXKAd'
const F = { date: 'Date', newSales: 'Total New Sales', repSales: 'Total Repeat Sales', total: 'Total Sales', newOrd: 'New Order', repOrd: 'Repeat Order', ad: 'Total Ad Spent' }

function dateMs(v: unknown): number {
  if (typeof v === 'number') return v
  if (Array.isArray(v) && typeof v[0] === 'number') return v[0] as number
  const o = v as { value?: unknown }
  if (o && Array.isArray(o.value) && typeof o.value[0] === 'number') return o.value[0] as number
  if (o && typeof o.value === 'number') return o.value
  const s = fstr(v); const t = Date.parse(s); return isNaN(t) ? 0 : t
}
const monthKey = (ms: number) => { const d = new Date(ms + 28800000); return d.getUTCFullYear() + '-' + String(d.getUTCMonth() + 1).padStart(2, '0') }

export type SalesMonth = { month: string; total: number; newSales: number; repeatSales: number; newOrders: number; repeatOrders: number; ad: number }
export type SalesReport = { months: string[]; metrics: SalesMonth[] }

export async function computeJujiSalesReport(): Promise<SalesReport> {
  const recs = await fetchLarkRecordsSearch(T_REPORT, JUJI_APP, [F.date, F.newSales, F.repSales, F.total, F.newOrd, F.repOrd, F.ad])
  const byMonth = new Map<string, SalesMonth>()
  for (const rec of recs) {
    const fd = rec.fields
    const ms = dateMs(fd[F.date]); if (!ms) continue
    const mk = monthKey(ms)
    let m = byMonth.get(mk)
    if (!m) { m = { month: mk, total: 0, newSales: 0, repeatSales: 0, newOrders: 0, repeatOrders: 0, ad: 0 }; byMonth.set(mk, m) }
    m.newSales += fnum(fd[F.newSales])
    m.repeatSales += fnum(fd[F.repSales])
    m.total += fnum(fd[F.total])
    m.newOrders += fnum(fd[F.newOrd])
    m.repeatOrders += fnum(fd[F.repOrd])
    m.ad += fnum(fd[F.ad])
  }
  const months = Array.from(byMonth.keys()).sort()
  return { months, metrics: months.map(k => byMonth.get(k)!) }
}
