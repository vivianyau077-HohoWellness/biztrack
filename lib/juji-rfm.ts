import { fetchLarkRecords } from './lark'

// Jujigrainz customer segmentation (RFM) — single product line, no VIP concept.
// New = 1 order, Repeat = 2+ orders. Lives in a separate Lark base; read with the same tenant token.
const JUJI_APP = 'GXamw6ldPipdXFkkNY1j8RKzpzg'
const T_ORDER = 'tblIb0g8xEeRGsbe'
const SLIM = ['Date', 'Channel', 'Name', 'Phone Number', 'Total Price', 'Price Domain']

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
  const o = v as { value?: unknown; text?: string }
  if (Array.isArray(o.value)) return o.value.map(x => (typeof x === 'string' ? x : ((x as { text?: string; name?: string })?.text ?? (x as { name?: string })?.name ?? ''))).join('').trim()
  if (o.text) return String(o.text).trim()
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

export type RfmLine = { count: number; spend: number; avg: number }
export type RfmSub = { key: string; label: string; desc: string; action: string; tone: 'up' | 'hold' | 'winback'; total: RfmLine; beauty: RfmLine; repair: RfmLine; mixed: RfmLine }
export type RfmTier = { key: string; label: string; total: RfmLine; subs: RfmSub[] }
export type JujiRfm = { totalCustomers: number; productLine: boolean; tiers: RfmTier[] }

type SubDef = { key: string; label: string; desc: string; action: string; tone: 'up' | 'hold' | 'winback' }
const NEW_SUBS: SubDef[] = [
  { key: 'fresh_hi', label: 'Fresh · high-value', desc: 'First order ≤180d · ≥RM537', action: 'Big first basket — guide to a bigger tin bundle on the 2nd order, don\'t discount.', tone: 'up' },
  { key: 'fresh_std', label: 'Fresh · standard', desc: 'First order ≤180d · <RM537', action: 'Push the 2nd purchase; keep entry (1 Tin/Box) low-friction.', tone: 'hold' },
  { key: 'lapsing', label: 'Lapsing', desc: 'First order 180–365d · no 2nd', action: 'Urgent 2nd-order offer before lost.', tone: 'hold' },
  { key: 'lost', label: 'Lost', desc: 'First order >1yr · still 1 order', action: 'Low-barrier win-back bundle.', tone: 'winback' },
]
const REPEAT_SUBS: SubDef[] = [
  { key: 'active', label: 'Active repeat', desc: 'Repeat · ordered ≤180d', action: 'Pricing power — bundle upsell to the 回购 5盒/10盒 tiers.', tone: 'up' },
  { key: 'atrisk', label: 'At-risk', desc: 'Repeat · 180–365d quiet', action: 'Retention price — hold, pull back before lost.', tone: 'hold' },
  { key: 'dormant', label: 'Dormant', desc: 'Repeat · >1yr quiet', action: 'Strong win-back.', tone: 'winback' },
]

export async function computeJujiRfm(): Promise<JujiRfm> {
  const recs = await fetchLarkRecords(T_ORDER, JUJI_APP, undefined, SLIM)
  type C = { orders: number; spend: number; lastMs: number }
  const map = new Map<string, C>()
  for (const rec of recs) {
    const f = rec.fields
    const channel = fstr(f['Channel'])
    if (channel === 'Return') continue
    const price = fnum(f['Total Price']) || fnum(f['Price Domain'])
    if (price <= 0) continue
    const ms = fdateMs(f['Date'])
    const phone = fstr(f['Phone Number'])
    const nm = fstr(f['Name'])
    const key = phone || (nm ? 'name:' + nm.toLowerCase() : '')
    if (!key) continue
    let c = map.get(key)
    if (!c) { c = { orders: 0, spend: 0, lastMs: 0 }; map.set(key, c) }
    c.orders++; c.spend += price
    if (ms > c.lastMs) c.lastMs = ms
  }

  const now = Date.now(), DAY = 86400000
  const A: Record<string, Record<string, [number, number]>> = {}
  const ens = (t: string, s: string): [number, number] => { if (!A[t]) A[t] = {}; if (!A[t][s]) A[t][s] = [0, 0]; return A[t][s] }
  for (const c of Array.from(map.values())) {
    const rec = c.lastMs ? (now - c.lastMs) / DAY : 99999
    const tier = c.orders >= 2 ? 'repeat' : 'new'
    let sub: string
    if (tier === 'new') sub = rec <= 180 && c.spend >= 537 ? 'fresh_hi' : rec <= 180 ? 'fresh_std' : rec <= 365 ? 'lapsing' : 'lost'
    else sub = rec <= 180 ? 'active' : rec <= 365 ? 'atrisk' : 'dormant'
    const cell = ens(tier, sub); cell[0]++; cell[1] += c.spend
  }

  const z: RfmLine = { count: 0, spend: 0, avg: 0 }
  const buildTier = (tierKey: string, label: string, subs: SubDef[]): RfmTier => {
    const outSubs: RfmSub[] = subs.map(sd => {
      const cell = A[tierKey]?.[sd.key] ?? [0, 0]
      const total: RfmLine = { count: cell[0], spend: Math.round(cell[1]), avg: cell[0] ? Math.round(cell[1] / cell[0]) : 0 }
      return { ...sd, total, beauty: z, repair: z, mixed: total }
    })
    const tTotal: RfmLine = { count: outSubs.reduce((s, x) => s + x.total.count, 0), spend: outSubs.reduce((s, x) => s + x.total.spend, 0), avg: 0 }
    tTotal.avg = tTotal.count ? Math.round(tTotal.spend / tTotal.count) : 0
    return { key: tierKey, label, total: tTotal, subs: outSubs }
  }

  return {
    totalCustomers: map.size,
    productLine: false,
    tiers: [buildTier('new', 'New customers', NEW_SUBS), buildTier('repeat', 'Repeat customers', REPEAT_SUBS)],
  }
}
