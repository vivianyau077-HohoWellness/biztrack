import { fetchLarkRecords } from './lark'

// Live monthly sales analysis for DD, read straight from the 2026 Lark order
// table (matches the DD dashboard). Aggregates by channel, and by New / Repeat /
// VIP using the sheet's AUTO N/R and AUTO VIP formula fields.
const APP = 'S8XXb8PT2a82ouslzQWjBaYap2g'
const T2026 = 'tblpMwKyxbddnXNG'

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
function monthOf(ms: number): string {
  if (!ms) return ''
  return new Date(ms).toISOString().slice(0, 7) // YYYY-MM
}

type Agg = { orders: number; sales: number }
const empty = (): Agg => ({ orders: 0, sales: 0 })

export async function computeDdSalesAnalysis(month: string) {
  const recs = await fetchLarkRecords(T2026, APP)

  const byChannel = new Map<string, Agg>()
  let all = empty(), neu = empty(), rep = empty(), vip = empty()

  for (const r of recs) {
    const f = r.fields as Record<string, unknown>
    if (monthOf(fdateMs(f['Date'])) !== month) continue
    const channel = fstr(f['Channel']) || '(unknown)'
    if (channel === 'Return') continue
    const price = fnum(f['Total Price']) || fnum(f['Price Domain'])
    const nr = fstr(f['AUTO N/R'])
    const autoVip = fstr(f['AUTO VIP'])

    all.orders++; all.sales += price
    const c = byChannel.get(channel) ?? empty()
    c.orders++; c.sales += price
    byChannel.set(channel, c)

    if (nr === 'New') { neu.orders++; neu.sales += price }
    else if (nr === 'Repeat') { rep.orders++; rep.sales += price }

    if (autoVip === 'Malaysia VIP' || autoVip === 'Singapore VIP') { vip.orders++; vip.sales += price }
  }

  const aov = (a: Agg) => (a.orders ? Math.round(a.sales / a.orders) : 0)
  const channels = Array.from(byChannel.entries())
    .map(([channel, a]) => ({ channel, orders: a.orders, sales: Math.round(a.sales), pct: all.sales ? Math.round((a.sales / all.sales) * 1000) / 10 : 0 }))
    .sort((x, y) => y.sales - x.sales)

  const pack = (a: Agg) => ({ orders: a.orders, sales: Math.round(a.sales), aov: aov(a) })

  return {
    month,
    channels,
    total: pack(all),
    new: pack(neu),
    repeat: pack(rep),
    vip: pack(vip),
  }
}
