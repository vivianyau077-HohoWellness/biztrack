import { fetchLarkRecords } from './lark'
import { fnum, fstr } from './ne-data'

// DD — Purchase Reason analysis: per reason, how many customers, how many keep
// repurchasing 2025→2026, and their average LTV (lifetime spend). Deduped by phone
// (name fallback for marketplace orders with no phone). Reasons read immediately
// (GET), split into atomic reasons so combo options count toward each.
const APP = 'S8XXb8PT2a82ouslzQWjBaYap2g'
const T_2026 = 'tblpMwKyxbddnXNG'
const T_2025 = 'tblEy6fdbsuXhS6L'
const F = ['Date', 'Phone Number', 'Channel', 'Name', 'Purchase reason', 'Total Price']

function reasonsOf(v: unknown): string[] {
  let a: unknown = v
  if (a && !Array.isArray(a) && (a as { value?: unknown }).value !== undefined) a = (a as { value?: unknown }).value
  const arr = Array.isArray(a) ? a : (a == null ? [] : [a])
  return arr.flatMap(x => {
    const s = typeof x === 'string' ? x : ((x as { text?: string; name?: string })?.text ?? (x as { name?: string })?.name ?? '')
    return String(s).split(/,\s*/)
  }).map(s => s.trim()).filter(Boolean)
}
function yearOf(v: unknown): number { const ms = fnum(v); return ms ? new Date(ms + 28800000).getUTCFullYear() : 0 }

// Campaign / channel markers — not real purchase reasons; excluded from the analysis.
const EXCLUDE = new Set(['Community', 'Community RM10', 'Shopee PIN'])

export type ReasonRow = { reason: string; customers: number; continuing: number; repeat2026: number; retentionPct: number; avgLTV: number; totalLTV: number }
export type DdReasonAnalysis = { totalCustomers: number; continuing: number; repeat2026: number; rows: ReasonRow[] }

export async function computeDdReasonAnalysis(): Promise<DdReasonAnalysis> {
  const [a, b] = await Promise.all([
    fetchLarkRecords(T_2026, APP, undefined, F),
    fetchLarkRecords(T_2025, APP, undefined, F),
  ])
  type C = { spend: number; years: Set<number>; orders2026: number; reasons: Set<string> }
  const cust = new Map<string, C>()
  for (const rec of [...a, ...b]) {
    const f = rec.fields
    const ch = fstr(f['Channel'])
    if (ch === 'Return') continue
    const phone = fstr(f['Phone Number']).replace(/\D/g, '')
    const name = fstr(f['Name']).toLowerCase().trim()
    const key = phone.length >= 9 ? 'p:' + phone : (name ? 'n:' + name : '')
    if (!key) continue
    let c = cust.get(key)
    if (!c) { c = { spend: 0, years: new Set(), orders2026: 0, reasons: new Set() }; cust.set(key, c) }
    const price = fnum(f['Total Price'])
    if (price > 0) c.spend += price
    const y = yearOf(f['Date']); if (y) c.years.add(y)
    if (y === 2026) c.orders2026 += 1
    for (const r of reasonsOf(f['Purchase reason'])) if (!EXCLUDE.has(r)) c.reasons.add(r)
  }

  let continuing = 0, repeat2026Total = 0
  const sum = new Map<string, number>(), all = new Map<string, number>(), cont = new Map<string, number>(), rep26 = new Map<string, number>()
  for (const c of Array.from(cust.values())) {
    const isCont = c.years.has(2025) && c.years.has(2026)   // bought in both years
    const isRep26 = c.orders2026 >= 2                        // repurchased within 2026
    if (isCont) continuing++
    if (isRep26) repeat2026Total++
    for (const r of Array.from(c.reasons)) {
      all.set(r, (all.get(r) || 0) + 1)
      sum.set(r, (sum.get(r) || 0) + c.spend)
      if (isCont) cont.set(r, (cont.get(r) || 0) + 1)
      if (isRep26) rep26.set(r, (rep26.get(r) || 0) + 1)
    }
  }
  const rows: ReasonRow[] = Array.from(all.entries()).map(([reason, customers]) => {
    const continuingN = cont.get(reason) || 0
    return {
      reason, customers, continuing: continuingN, repeat2026: rep26.get(reason) || 0,
      retentionPct: customers ? Math.round((continuingN / customers) * 1000) / 10 : 0,
      avgLTV: customers ? Math.round((sum.get(reason) || 0) / customers) : 0,
      totalLTV: Math.round(sum.get(reason) || 0),
    }
  }).sort((x, y) => y.customers - x.customers)

  return { totalCustomers: cust.size, continuing, repeat2026: repeat2026Total, rows }
}
