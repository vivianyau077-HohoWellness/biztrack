import { fetchLarkRecordsSearch } from './lark'
import { fnum, fstr } from './ne-data'

// DD — orders where Purchase reason is blank but the SAME customer (by phone) stated
// a reason on another order. The reason is typically only captured on the first/new
// order when volunteered, so repeat orders go blank. This lists those blanks with the
// customer's stated reason carried forward, so they can be reviewed / backfilled.
const APP = 'S8XXb8PT2a82ouslzQWjBaYap2g'
const T_2026 = 'tblpMwKyxbddnXNG'
const T_2025 = 'tblEy6fdbsuXhS6L'
const F = ['Date', 'Name', 'Phone Number', 'Channel', 'Purchase reason', 'AUTO N/R', 'Total Price']

function dateMs(v: unknown): number {
  if (typeof v === 'number') return v
  if (Array.isArray(v) && typeof v[0] === 'number') return v[0] as number
  const o = v as { value?: unknown }
  if (o && Array.isArray(o.value) && typeof o.value[0] === 'number') return o.value[0] as number
  if (o && typeof o.value === 'number') return o.value
  const s = fstr(v); const t = Date.parse(s); return isNaN(t) ? 0 : t
}
const ymd = (ms: number) => ms ? new Date(ms + 28800000).toISOString().slice(0, 10) : ''

export type ReasonGapRow = { name: string; phone: string; reason: string; date: string; channel: string; nr: string; price: number }
export type ReasonGaps = { customers: number; rows: ReasonGapRow[] }

type Ord = { ms: number; name: string; phone: string; channel: string; reason: string; nr: string; price: number }

export async function computeDdReasonGaps(): Promise<ReasonGaps> {
  const [a, b] = await Promise.all([
    fetchLarkRecordsSearch(T_2026, APP, F),
    fetchLarkRecordsSearch(T_2025, APP, F),
  ])
  const byPhone = new Map<string, Ord[]>()
  for (const rec of [...a, ...b]) {
    const f = rec.fields
    const phone = fstr(f['Phone Number'])
    if (!phone) continue // she wants it tracked by phone number
    const channel = fstr(f['Channel'])
    if (channel === 'Return') continue
    const o: Ord = {
      ms: dateMs(f['Date']),
      name: fstr(f['Name']),
      phone,
      channel,
      reason: fstr(f['Purchase reason']),
      nr: fstr(f['AUTO N/R']),
      price: fnum(f['Total Price']),
    }
    let arr = byPhone.get(phone); if (!arr) { arr = []; byPhone.set(phone, arr) }
    arr.push(o)
  }

  const rows: ReasonGapRow[] = []
  let customers = 0
  for (const arr of Array.from(byPhone.values())) {
    arr.sort((x, y) => x.ms - y.ms)
    const withReason = arr.filter(o => o.reason)
    if (withReason.length === 0) continue
    const firstReasonMs = withReason[0].ms
    const stated = withReason[0].reason // earliest stated reason
    // blanks on/after the reason was first captured — these are the carry-forward targets
    const blanks = arr.filter(o => !o.reason && o.ms >= firstReasonMs)
    if (blanks.length === 0) continue
    customers++
    const name = (arr.find(o => o.name && !o.name.includes('/')) || arr[0]).name || arr[0].name
    for (const o of blanks) {
      // only count blanks that occur on/after a reason was first captured (i.e. missing carry-forward)
      rows.push({ name, phone: o.phone, reason: stated, date: ymd(o.ms), channel: o.channel, nr: o.nr, price: Math.round(o.price) })
    }
  }
  rows.sort((x, y) => x.phone === y.phone ? x.date.localeCompare(y.date) : x.phone.localeCompare(y.phone))
  return { customers, rows }
}
