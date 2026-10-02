import { fetchLarkRecords } from './lark'

// Hierarchical customer segmentation for DD, for pricing decisions.
// Tier 1 = relationship stage (New / Repeat non-VIP / Malaysia VIP / Singapore VIP).
// Tier 2 = RFM within each (New uses R×M since Frequency=1). Each split by product line.
const APP = 'S8XXb8PT2a82ouslzQWjBaYap2g'
const T_ORDER_26 = 'tblpMwKyxbddnXNG'
const T_DAILY_25 = 'tblEy6fdbsuXhS6L'
const SLIM = ['Channel', 'Date', 'Total Price', 'Price Domain', 'Name', 'Package', 'Phone Number', 'AUTO VIP']

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
  if (Array.isArray(v)) return v.map(x => (typeof x === 'string' ? x : ((x as { text?: string })?.text ?? ''))).join('').trim()
  const o = v as { value?: unknown; text?: string }
  if (Array.isArray(o.value)) return o.value.map(x => (typeof x === 'string' ? x : ((x as { text?: string })?.text ?? ''))).join('').trim()
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
function normPhone(raw: string, sg = false): string {
  let d = (raw || '').replace(/[^0-9]/g, '')
  if (!d) return ''
  if (d.startsWith('60') || d.startsWith('65')) return d
  if (sg) return '65' + d
  if (d.startsWith('0')) d = '6' + d
  else d = '60' + d
  return d
}
const VIP_ID: Record<string, string> = { optqKyjYh5: 'Malaysia VIP', optm49F7wB: 'Singapore VIP', optlAbV6WH: 'Inactive VIP' }
function vipCountry(v: unknown): 'MY' | 'SG' | null {
  let s = fstr(v); if (VIP_ID[s]) s = VIP_ID[s]
  if (s === 'Malaysia VIP') return 'MY'
  if (s === 'Singapore VIP') return 'SG'
  return null
}
const BEAUTY_CH = ['【焕肤】FB ', '【焕肤】FB', '焕肤 ENG']
const REPAIR_CH = ['【伤口】FB', '伤口 ENG', '新【钻石露】FB']
function lineOf(channel: string, pkg: string): 'B' | 'R' | null {
  const c = channel + ' ' + pkg
  if (BEAUTY_CH.indexOf(channel) >= 0 || c.indexOf('焕肤') >= 0 || c.indexOf('美') >= 0) return 'B'
  if (REPAIR_CH.indexOf(channel) >= 0 || c.indexOf('伤口') >= 0 || c.indexOf('钻石露') >= 0) return 'R'
  return null
}

export type RfmLine = { count: number; spend: number; avg: number }
export type RfmSub = { key: string; label: string; desc: string; action: string; tone: 'up' | 'hold' | 'winback'; total: RfmLine; beauty: RfmLine; repair: RfmLine; mixed: RfmLine }
export type RfmTier = { key: string; label: string; total: RfmLine; subs: RfmSub[] }
export type DdRfm = { totalCustomers: number; tiers: RfmTier[] }

// sub-segment definitions per tier
type SubDef = { key: string; label: string; desc: string; action: string; tone: 'up' | 'hold' | 'winback' }
const NEW_SUBS: SubDef[] = [
  { key: 'fresh_hi', label: 'Fresh · high-value', desc: 'First order ≤180d · ≥RM700', action: 'Future VIP seed — don\'t discount; guide to membership / bigger pack.', tone: 'up' },
  { key: 'fresh_std', label: 'Fresh · standard', desc: 'First order ≤180d · <RM700', action: 'Push the 2nd purchase with a bundle; keep entry price low-friction.', tone: 'hold' },
  { key: 'lapsing', label: 'Cooling', desc: 'First order 180–365d · no 2nd', action: 'Urgent 2nd-order offer before they are lost.', tone: 'hold' },
  { key: 'lost', label: 'Gone cold', desc: 'First order >1yr · still 1 order', action: 'Low-barrier win-back bundle — not list price.', tone: 'winback' },
]
const REPEAT_SUBS: SubDef[] = [
  { key: 'active', label: 'Active repeat', desc: 'Repeat · ordered ≤180d', action: 'Pricing power — bundle upsell, gentle increase OK.', tone: 'up' },
  { key: 'atrisk', label: 'At-risk', desc: 'Repeat · 180–365d quiet', action: 'Retention price — hold, pull back before lost.', tone: 'hold' },
  { key: 'dormant', label: 'Dormant', desc: 'Repeat · >1yr quiet', action: 'Strong win-back (they repurchased before).', tone: 'winback' },
]
const vipSubs = (country: string): SubDef[] => [
  { key: 'active', label: `Active ${country} VIP`, desc: 'VIP · ordered ≤180d', action: 'Highest pricing power — premium/exclusive bundles, bigger packs, raise OK.', tone: 'up' },
  { key: 'atrisk', label: `Lapsing ${country} VIP`, desc: 'VIP · 180–365d quiet', action: 'VIP rescue — exclusive retention, do not lose.', tone: 'hold' },
  { key: 'dormant', label: `Dormant ${country} VIP`, desc: 'VIP · >1yr quiet', action: 'Top win-back priority — was a whale.', tone: 'winback' },
]

export async function computeDdRfm(): Promise<DdRfm> {
  const [ord26, daily25] = await Promise.all([
    fetchLarkRecords(T_ORDER_26, APP, undefined, SLIM),
    fetchLarkRecords(T_DAILY_25, APP, undefined, SLIM),
  ])
  type C = { orders: number; spend: number; lastMs: number; b: number; r: number; vip: 'MY' | 'SG' | null }
  const map = new Map<string, C>()
  const eat = (recs: Array<{ fields: Record<string, unknown> }>) => {
    for (const rec of recs) {
      const f = rec.fields
      const channel = fstr(f['Channel'])
      if (channel === 'Return') continue
      const price = fnum(f['Total Price']) || fnum(f['Price Domain'])
      if (!price) continue
      const ms = fdateMs(f['Date'])
      const nm = fstr(f['Name'])
      const chL = channel.toLowerCase()
      const isSg = chL.indexOf('sg') >= 0
      let key = normPhone(fstr(f['Phone Number']), isSg)
      if (!key) {
        const mkt = chL.indexOf('shopee') >= 0 || chL.indexOf('lazada') >= 0 || (!chL.includes('fb') && !chL.includes('whatsapp') && !chL.includes('eng'))
        if (mkt && nm) key = 'name:' + nm.toLowerCase()
        else continue
      }
      let c = map.get(key)
      if (!c) { c = { orders: 0, spend: 0, lastMs: 0, b: 0, r: 0, vip: null }; map.set(key, c) }
      c.orders++; c.spend += price
      if (ms > c.lastMs) c.lastMs = ms
      const vc = vipCountry(f['AUTO VIP'])
      if (vc === 'MY') c.vip = 'MY'
      else if (vc === 'SG' && c.vip !== 'MY') c.vip = 'SG'
      const ln = lineOf(channel, fstr(f['Package']))
      if (ln === 'B') c.b += price
      else if (ln === 'R') c.r += price
    }
  }
  eat(ord26 as Array<{ fields: Record<string, unknown> }>)
  eat(daily25 as Array<{ fields: Record<string, unknown> }>)

  const now = Date.now(), DAY = 86400000
  // accumulator: tier -> sub -> line -> {count, spend}
  const A: Record<string, Record<string, { b: [number, number]; r: [number, number]; m: [number, number] }>> = {}
  const ensure = (tier: string, sub: string) => {
    if (!A[tier]) A[tier] = {}
    if (!A[tier][sub]) A[tier][sub] = { b: [0, 0], r: [0, 0], m: [0, 0] }
    return A[tier][sub]
  }
  for (const c of Array.from(map.values())) {
    const rec = c.lastMs ? (now - c.lastMs) / DAY : 99999
    let tier: string, sub: string
    if (c.vip === 'MY') tier = 'myvip'
    else if (c.vip === 'SG') tier = 'sgvip'
    else if (c.orders >= 2) tier = 'repeat'
    else tier = 'new'
    if (tier === 'new') {
      if (rec <= 180 && c.spend >= 700) sub = 'fresh_hi'
      else if (rec <= 180) sub = 'fresh_std'
      else if (rec <= 365) sub = 'lapsing'
      else sub = 'lost'
    } else {
      sub = rec <= 180 ? 'active' : (rec <= 365 ? 'atrisk' : 'dormant')
    }
    const line = c.b > c.r ? 'b' : (c.r > c.b ? 'r' : 'm')
    const cell = ensure(tier, sub)[line]
    cell[0]++; cell[1] += c.spend
  }

  const mkLine = (p: [number, number]): RfmLine => ({ count: p[0], spend: Math.round(p[1]), avg: p[0] ? Math.round(p[1] / p[0]) : 0 })
  const buildTier = (tierKey: string, label: string, subs: SubDef[]): RfmTier => {
    const outSubs: RfmSub[] = subs.map(sd => {
      const cell = A[tierKey]?.[sd.key] ?? { b: [0, 0] as [number, number], r: [0, 0] as [number, number], m: [0, 0] as [number, number] }
      const total: RfmLine = { count: cell.b[0] + cell.r[0] + cell.m[0], spend: Math.round(cell.b[1] + cell.r[1] + cell.m[1]), avg: 0 }
      total.avg = total.count ? Math.round(total.spend / total.count) : 0
      return { ...sd, total, beauty: mkLine(cell.b), repair: mkLine(cell.r), mixed: mkLine(cell.m) }
    })
    const tTotal: RfmLine = { count: outSubs.reduce((s, x) => s + x.total.count, 0), spend: outSubs.reduce((s, x) => s + x.total.spend, 0), avg: 0 }
    tTotal.avg = tTotal.count ? Math.round(tTotal.spend / tTotal.count) : 0
    return { key: tierKey, label, total: tTotal, subs: outSubs }
  }

  const tiers: RfmTier[] = [
    buildTier('new', 'New customers', NEW_SUBS),
    buildTier('repeat', 'Repeat (non-VIP)', REPEAT_SUBS),
    buildTier('myvip', 'Malaysia VIP', vipSubs('MY')),
    buildTier('sgvip', 'Singapore VIP', vipSubs('SG')),
  ]
  return { totalCustomers: map.size, tiers }
}
