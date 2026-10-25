import { fetchLarkRecordsSearch } from './lark'
import { fnum, fstr, cleanPkg } from './ne-data'

// Customer Lifecycle (New / Active / Loyal / Churn) for NE & Juji, from their order tables.
// Mirrors the DD lifecycle segmentation but on each brand's own orders. Deduped by phone (name fallback).
type SegKey = 'new' | 'active' | 'loyal' | 'churn'
type Segment = {
  key: SegKey; label: string; count: number; pct: number
  byChannel: { channel: string; count: number; pct: number }[]
  byPackage: { name: string; count: number; pct: number; price: number }[]
  customers: { name: string; phone: string; orders: number; spent: number; lastOrderDate: string; isNew: boolean }[]
  truncated: boolean
}
export type BrandLifecycle = { total: number; from: string; to: string; segments: Segment[] }

const LABEL: Record<SegKey, string> = { new: 'New customer onboarding', active: 'Active customer recurring', loyal: 'Loyal customer advocacy', churn: 'Churn customer reactivation' }
const DAY = 86400000

function linkIds(v: unknown): string[] {
  if (!v) return []
  const o = v as { link_record_ids?: string[]; record_ids?: string[] }
  if (Array.isArray(o.link_record_ids)) return o.link_record_ids
  if (Array.isArray(o.record_ids)) return o.record_ids
  if (Array.isArray(v)) return (v as unknown[]).map(x => (typeof x === 'string' ? x : ((x as { record_id?: string; id?: string })?.record_id ?? (x as { id?: string })?.id ?? ''))).filter(Boolean)
  return []
}
function dateMs(v: unknown): number {
  if (typeof v === 'number') return v
  if (Array.isArray(v) && typeof v[0] === 'number') return v[0] as number
  const o = v as { value?: unknown }
  if (o && Array.isArray(o.value) && typeof o.value[0] === 'number') return o.value[0] as number
  if (o && typeof o.value === 'number') return o.value
  const s = fstr(v); const t = Date.parse(s); return isNaN(t) ? 0 : t
}
function normPhone(raw: string, sg: boolean): string {
  let d = raw.replace(/\D/g, ''); if (!d) return ''
  if (d.charAt(0) === '0') d = (sg ? '65' : '60') + d.slice(1)
  return d
}

type Ord = { name: string; phone: string; channel: string; pkg: string; price: number; ms: number }

async function pkgMaps(app: string, table: string) {
  const recs = await fetchLarkRecordsSearch(table, app, ['SKUs', 'Price', 'Status', 'what'])
  const byId = new Map<string, string>(), byPrice = new Map<number, string>(), score = new Map<number, number>()
  for (const r of recs as Array<{ record_id: string; fields: Record<string, unknown> }>) {
    const raw = fstr(r.fields['SKUs']); const name = cleanPkg(raw)
    if (!name || /^❌+$/.test(name)) continue
    if (r.record_id) byId.set(r.record_id, name)
    const price = fnum(r.fields['Price']); if (price <= 0) continue
    let sc = 0
    if (fstr(r.fields['Status']).indexOf('Current') >= 0) sc += 8
    if (!/copy|shopee|\(shopee\)|❌|🟠|双11|cny|promo|【|staff/i.test(raw)) sc += 4
    if (/新人|回购/.test(fstr(r.fields['what']))) sc += 2
    if (!score.has(price) || sc > (score.get(price) || 0)) { score.set(price, sc); byPrice.set(price, name) }
  }
  return { byId, byPrice }
}

async function loadJuji(): Promise<Ord[]> {
  const APP = 'QV2vbeAyIaDiu2skeFojbNhspnh'
  const [orders, maps] = await Promise.all([
    fetchLarkRecordsSearch('tblIb0g8xEeRGsbe', APP, ['Date', 'Channel', 'Name', 'Phone Number', 'Phone no', 'Total Price', 'Price Domain', 'List of package', 'Package']),
    pkgMaps(APP, 'tblSFCm5N8hAYXxv'),
  ])
  const out: Ord[] = []
  for (const rec of orders) {
    const f = rec.fields
    const channel = fstr(f['Channel']); if (channel === 'Return') continue
    const price = fnum(f['Total Price']) || fnum(f['Price Domain']); if (price <= 0) continue
    const ms = dateMs(f['Date']); if (!ms) continue
    let pkg = maps.byPrice.get(price) || ''
    if (!pkg) { pkg = linkIds(f['Package']).map(id => maps.byId.get(id) || '').filter(Boolean).join(', ') }
    if (!pkg) pkg = cleanPkg(fstr(f['List of package'])) || `RM${price}`
    out.push({ name: fstr(f['Name']), phone: fstr(f['Phone Number']) || fstr(f['Phone no']), channel, pkg, price, ms })
  }
  return out
}

async function loadNe(): Promise<Ord[]> {
  const APP = 'GaBUwog1Niooyyk10fhjkUg6p9c'
  const [r26, r25, maps] = await Promise.all([
    fetchLarkRecordsSearch('tblCgCKSZ3zALx6t', APP, ['Date', 'Channel', 'Name', 'Phone Number', 'Phone no', 'Total Price', 'Price Domain', 'List of package', 'Package']),
    fetchLarkRecordsSearch('tbl7fjGsvklEaCh6', APP, ['Date', 'Channel', 'FB Name', 'Phone number', 'Price 1+2', 'Package 1', 'Package 2']),
    pkgMaps(APP, 'tblE5pZHPeZiWR8o'),
  ])
  const out: Ord[] = []
  for (const rec of r26) {
    const f = rec.fields
    const channel = fstr(f['Channel']); if (channel === 'Return') continue
    const price = fnum(f['Total Price']) || fnum(f['Price Domain']); if (price <= 0) continue
    const ms = dateMs(f['Date']); if (!ms) continue
    let pkg = maps.byPrice.get(price) || ''
    if (!pkg) { pkg = linkIds(f['Package']).map(id => maps.byId.get(id) || '').filter(Boolean).join(', ') }
    if (!pkg) pkg = cleanPkg(fstr(f['List of package'])) || `RM${price}`
    out.push({ name: fstr(f['Name']), phone: fstr(f['Phone Number']) || fstr(f['Phone no']), channel, pkg, price, ms })
  }
  for (const rec of r25) {
    const f = rec.fields
    const channel = fstr(f['Channel']); if (channel === 'Return') continue
    const price = fnum(fstr(f['Price 1+2'])); if (price <= 0) continue
    const ms = dateMs(f['Date']); if (!ms) continue
    let pkg = maps.byPrice.get(price) || ''
    if (!pkg) { const p1 = cleanPkg(fstr(f['Package 1'])); const p2 = cleanPkg(fstr(f['Package 2'])); pkg = [p1, p2].filter(Boolean).join(', ') }
    if (!pkg) pkg = `RM${price}`
    out.push({ name: fstr(f['FB Name']), phone: fstr(f['Phone number']), channel, pkg, price, ms })
  }
  return out
}

type Cust = { name: string; phone: string; orders: number; spent: number; lastMs: number; ch: Map<string, number>; pk: Map<string, number>; pkPrice: Map<string, number> }

export async function computeBrandLifecycle(brand: string): Promise<BrandLifecycle> {
  const orders = brand === 'Juji' ? await loadJuji() : brand === 'NE' ? await loadNe() : []
  const map = new Map<string, Cust>()
  for (const o of orders) {
    const sg = o.channel.toLowerCase().indexOf('sg') >= 0
    const key = normPhone(o.phone, sg) || (o.name ? 'name:' + o.name.toLowerCase().trim() : '')
    if (!key) continue
    let c = map.get(key)
    if (!c) { c = { name: o.name || normPhone(o.phone, sg), phone: normPhone(o.phone, sg), orders: 0, spent: 0, lastMs: 0, ch: new Map(), pk: new Map(), pkPrice: new Map() }; map.set(key, c) }
    c.orders++; c.spent += o.price; if (o.ms > c.lastMs) c.lastMs = o.ms
    if ((!c.name || c.name === c.phone) && o.name) c.name = o.name
    c.ch.set(o.channel, (c.ch.get(o.channel) || 0) + 1)
    c.pk.set(o.pkg, (c.pk.get(o.pkg) || 0) + 1)
    if (!c.pkPrice.has(o.pkg)) c.pkPrice.set(o.pkg, o.price)
  }

  const now = Date.now()
  const classify = (c: Cust): SegKey => {
    if (c.lastMs && (now - c.lastMs) / DAY > 365) return 'churn'
    if (c.orders >= 2 && c.spent >= 700) return 'loyal'
    if (c.orders >= 2) return 'active'
    return 'new'
  }
  const top = (m: Map<string, number>) => Array.from(m.entries()).sort((a, b) => b[1] - a[1])[0]?.[0] ?? ''

  const buckets: Record<SegKey, Cust[]> = { new: [], active: [], loyal: [], churn: [] }
  for (const c of Array.from(map.values())) buckets[classify(c)].push(c)

  const total = map.size
  const build = (key: SegKey): Segment => {
    const cs = buckets[key].sort((a, b) => b.spent - a.spent)
    const n = cs.length
    const chCount = new Map<string, number>(), pkCount = new Map<string, number>(), pkPr = new Map<string, number>()
    for (const c of cs) {
      const ch = top(c.ch); if (ch) chCount.set(ch, (chCount.get(ch) || 0) + 1)
      const pk = top(c.pk); if (pk) { pkCount.set(pk, (pkCount.get(pk) || 0) + 1); if (!pkPr.has(pk)) pkPr.set(pk, c.pkPrice.get(pk) || 0) }
    }
    const byChannel = Array.from(chCount.entries()).sort((a, b) => b[1] - a[1]).slice(0, 8).map(([channel, count]) => ({ channel, count, pct: n ? Math.round((count / n) * 100) : 0 }))
    const byPackage = Array.from(pkCount.entries()).sort((a, b) => b[1] - a[1]).slice(0, 8).map(([name, count]) => ({ name, count, pct: n ? Math.round((count / n) * 100) : 0, price: Math.round(pkPr.get(name) || 0) }))
    const LIMIT = 200
    const customers = cs.slice(0, LIMIT).map(c => ({ name: c.name || '(no name)', phone: c.phone, orders: c.orders, spent: Math.round(c.spent), lastOrderDate: c.lastMs ? new Date(c.lastMs + 28800000).toISOString().slice(0, 10) : '', isNew: c.orders === 1 }))
    return { key, label: LABEL[key], count: n, pct: total ? Math.round((n / total) * 100) : 0, byChannel, byPackage, customers, truncated: n > LIMIT }
  }

  return { total, from: '', to: '', segments: (['new', 'active', 'loyal', 'churn'] as SegKey[]).map(build) }
}
