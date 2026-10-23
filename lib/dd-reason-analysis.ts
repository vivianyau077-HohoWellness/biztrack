import { fetchLarkRecords } from './lark'
import { fnum, fstr } from './ne-data'

// DD — Purchase Reason analysis, split into two clean cohorts:
//   Table A (2025 → 2026): customers who ordered in 2025, and whether they came back in 2026.
//   Table B (2026 new → 2026 repeat): customers whose FIRST order was in 2026, and whether
//            they bought again within 2026.
// Deduped by phone (name fallback for marketplace orders with no phone). Reasons read
// immediately (GET), split into atomic reasons so combo options count toward each.
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
function dayOf(v: unknown): number { const ms = fnum(v); return ms ? ms + 28800000 : 0 }
function yearOf(v: unknown): number { const d = dayOf(v); return d ? new Date(d).getUTCFullYear() : 0 }

// Campaign / channel markers — not real purchase reasons; excluded from the analysis.
const EXCLUDE = new Set(['Community', 'Community RM10', 'Shopee PIN'])

// One row = one purchase reason. `customers` is the cohort size (the denominator),
// `returned` the number who repurchased, `retentionPct` = returned/customers,
// `avgLTV` = average lifetime spend of the customers who DID repurchase.
export type CohortRow = { reason: string; customers: number; returned: number; retentionPct: number; avgLTV: number }
export type Cohort = { totalCustomers: number; returned: number; rows: CohortRow[] }
export type DdReasonAnalysis = {
  window: string
  cross: Cohort    // Table A: 2025 → 2026
  within: Cohort   // Table B: 2026 new → 2026 repeat
}

export async function computeDdReasonAnalysis(): Promise<DdReasonAnalysis> {
  const [a, b] = await Promise.all([
    fetchLarkRecords(T_2026, APP, undefined, F),
    fetchLarkRecords(T_2025, APP, undefined, F),
  ])
  type C = { spend: number; firstDay: number; has2025: boolean; has2026: boolean; orders2026: number; reasons: Set<string> }
  const cust = new Map<string, C>()
  let minDay = Infinity, maxDay = 0
  for (const rec of [...a, ...b]) {
    const f = rec.fields
    const ch = fstr(f['Channel'])
    if (ch === 'Return') continue
    const phone = fstr(f['Phone Number']).replace(/\D/g, '')
    const name = fstr(f['Name']).toLowerCase().trim()
    const key = phone.length >= 9 ? 'p:' + phone : (name ? 'n:' + name : '')
    if (!key) continue
    let c = cust.get(key)
    if (!c) { c = { spend: 0, firstDay: Infinity, has2025: false, has2026: false, orders2026: 0, reasons: new Set() }; cust.set(key, c) }
    const price = fnum(f['Total Price'])
    if (price > 0) c.spend += price
    const d = dayOf(f['Date']); const y = d ? new Date(d).getUTCFullYear() : 0
    if (d) { if (d < c.firstDay) c.firstDay = d; if (d < minDay) minDay = d; if (d > maxDay) maxDay = d }
    if (y === 2025) c.has2025 = true
    if (y === 2026) { c.has2026 = true; c.orders2026 += 1 }
    for (const r of reasonsOf(f['Purchase reason'])) if (!EXCLUDE.has(r)) c.reasons.add(r)
  }

  // Table A — 2025 buyers, returned in 2026
  const aDen = new Map<string, number>(), aRet = new Map<string, number>(), aSum = new Map<string, number>()
  // Table B — customers whose first order is in 2026, repeated within 2026
  const bDen = new Map<string, number>(), bRet = new Map<string, number>(), bSum = new Map<string, number>()
  let aTot = 0, aRetTot = 0, bTot = 0, bRetTot = 0
  for (const c of Array.from(cust.values())) {
    const inA = c.has2025
    const aReturned = c.has2025 && c.has2026
    const firstYear = c.firstDay !== Infinity ? new Date(c.firstDay).getUTCFullYear() : 0
    const inB = firstYear === 2026
    const bRepeated = inB && c.orders2026 >= 2
    if (inA) aTot++
    if (aReturned) aRetTot++
    if (inB) bTot++
    if (bRepeated) bRetTot++
    for (const r of Array.from(c.reasons)) {
      if (inA) {
        aDen.set(r, (aDen.get(r) || 0) + 1)
        if (aReturned) { aRet.set(r, (aRet.get(r) || 0) + 1); aSum.set(r, (aSum.get(r) || 0) + c.spend) }
      }
      if (inB) {
        bDen.set(r, (bDen.get(r) || 0) + 1)
        if (bRepeated) { bRet.set(r, (bRet.get(r) || 0) + 1); bSum.set(r, (bSum.get(r) || 0) + c.spend) }
      }
    }
  }

  const build = (den: Map<string, number>, ret: Map<string, number>, sum: Map<string, number>): CohortRow[] =>
    Array.from(den.entries()).map(([reason, customers]) => {
      const returned = ret.get(reason) || 0
      return {
        reason, customers, returned,
        retentionPct: customers ? Math.round((returned / customers) * 1000) / 10 : 0,
        avgLTV: returned ? Math.round((sum.get(reason) || 0) / returned) : 0,
      }
    }).sort((x, y) => y.customers - x.customers)

  const fmt = (ms: number) => new Date(ms).toISOString().slice(0, 10)
  const window = minDay !== Infinity ? `${fmt(minDay)} → ${fmt(maxDay)}` : 'n/a'

  return {
    window,
    cross: { totalCustomers: aTot, returned: aRetTot, rows: build(aDen, aRet, aSum) },
    within: { totalCustomers: bTot, returned: bRetTot, rows: build(bDen, bRet, bSum) },
  }
}
