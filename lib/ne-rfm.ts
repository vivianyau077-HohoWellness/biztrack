import { loadNeOrders } from './ne-data'

// Nutrieye customer segmentation (RFM) — 2025 + 2026 combined, single product line, no VIP.
// New = 1 lifetime order, Repeat = 2+ orders.
export type RfmLine = { count: number; spend: number; avg: number }
export type RfmSub = { key: string; label: string; desc: string; action: string; tone: 'up' | 'hold' | 'winback'; total: RfmLine; beauty: RfmLine; repair: RfmLine; mixed: RfmLine }
export type RfmTier = { key: string; label: string; total: RfmLine; subs: RfmSub[] }
export type NeRfm = { totalCustomers: number; productLine: boolean; tiers: RfmTier[] }

type SubDef = { key: string; label: string; desc: string; action: string; tone: 'up' | 'hold' | 'winback' }
const NEW_SUBS: SubDef[] = [
  { key: 'fresh_hi', label: 'Fresh · high-value', desc: 'First order ≤180d · ≥RM538', action: 'Big first basket — guide to 回购 5盒 on the 2nd order, don\'t discount.', tone: 'up' },
  { key: 'fresh_std', label: 'Fresh · standard', desc: 'First order ≤180d · <RM538', action: 'Push the 2nd purchase; keep entry (1盒/2盒) low-friction.', tone: 'hold' },
  { key: 'lapsing', label: 'Lapsing', desc: 'First order 180–365d · no 2nd', action: 'Urgent 2nd-order offer before lost.', tone: 'hold' },
  { key: 'lost', label: 'Lost', desc: 'First order >1yr · still 1 order', action: 'Low-barrier win-back bundle.', tone: 'winback' },
]
const REPEAT_SUBS: SubDef[] = [
  { key: 'active', label: 'Active repeat', desc: 'Repeat · ordered ≤180d', action: 'Pricing power — upsell to 回购 5盒 / 10盒.', tone: 'up' },
  { key: 'atrisk', label: 'At-risk', desc: 'Repeat · 180–365d quiet', action: 'Retention price — hold, pull back before lost.', tone: 'hold' },
  { key: 'dormant', label: 'Dormant', desc: 'Repeat · >1yr quiet', action: 'Strong win-back.', tone: 'winback' },
]

export async function computeNeRfm(): Promise<NeRfm> {
  const orders = await loadNeOrders()
  type C = { orders: number; spend: number; lastMs: number }
  const map = new Map<string, C>()
  for (const o of orders) {
    let c = map.get(o.key)
    if (!c) { c = { orders: 0, spend: 0, lastMs: 0 }; map.set(o.key, c) }
    c.orders++; c.spend += o.price
    if (o.ms > c.lastMs) c.lastMs = o.ms
  }

  const now = Date.now(), DAY = 86400000
  const A: Record<string, Record<string, [number, number]>> = {}
  const ens = (t: string, s: string): [number, number] => { if (!A[t]) A[t] = {}; if (!A[t][s]) A[t][s] = [0, 0]; return A[t][s] }
  for (const c of Array.from(map.values())) {
    const rec = c.lastMs ? (now - c.lastMs) / DAY : 99999
    const tier = c.orders >= 2 ? 'repeat' : 'new'
    let sub: string
    if (tier === 'new') sub = rec <= 180 && c.spend >= 538 ? 'fresh_hi' : rec <= 180 ? 'fresh_std' : rec <= 365 ? 'lapsing' : 'lost'
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
