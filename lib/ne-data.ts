import { fetchLarkRecords } from './lark'

// Nutrieye shared loader — merges the 2025 (old schema) and 2026 (new schema) order tables
// into one normalised order stream used by both segmentation and the repurchase ladder.
// NE has no VIP concept (no AUTO VIP field), so tiers are New / Repeat only.
export const NE_APP = 'GaBUwog1Niooyyk10fhjkUg6p9c'
export const T_2026 = 'tblCgCKSZ3zALx6t'
export const T_2025 = 'tbl7fjGsvklEaCh6'
export const T_PKG = 'tblE5pZHPeZiWR8o'

const SLIM_2026 = ['Date', 'Channel', 'Name', 'Phone Number', 'Phone no', 'Total Price', 'Price Domain', 'List of package', 'Package']
const SLIM_2025 = ['Date', 'Channel', 'FB Name', 'Phone number', 'Price 1+2', 'Package 1', 'Package 2']

export function fnum(v: unknown): number {
  if (v == null) return 0
  if (typeof v === 'number') return v
  if (typeof v === 'string') { const n = Number(v.replace(/[^0-9.\-]/g, '')); return isNaN(n) ? 0 : n }
  if (Array.isArray(v)) { for (const x of v) { const n = fnum(x); if (n) return n } return 0 }
  const o = v as { value?: unknown }
  if (o && o.value !== undefined) return fnum(o.value)
  return 0
}
export function fstr(v: unknown): string {
  if (v == null) return ''
  if (typeof v === 'string') return v.trim()
  if (typeof v === 'number') return String(v)
  if (Array.isArray(v)) return v.map(x => (typeof x === 'string' ? x : ((x as { text?: string; name?: string })?.text ?? (x as { name?: string })?.name ?? ''))).join(', ').trim()
  const o = v as { value?: unknown; text?: string }
  if (Array.isArray(o.value)) return o.value.map(x => (typeof x === 'string' ? x : ((x as { text?: string; name?: string })?.text ?? (x as { name?: string })?.name ?? ''))).join(', ').trim()
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
function linkIds(v: unknown): string[] {
  if (!v) return []
  const o = v as { link_record_ids?: string[]; record_ids?: string[] }
  if (Array.isArray(o.link_record_ids)) return o.link_record_ids
  if (Array.isArray(o.record_ids)) return o.record_ids
  if (Array.isArray(v)) return (v as unknown[]).map(x => (typeof x === 'string' ? x : ((x as { record_id?: string; id?: string })?.record_id ?? (x as { id?: string })?.id ?? ''))).filter(Boolean)
  return []
}
export const cleanPkg = (s: string) => s.replace(/[\uD800-\uDBFF][\uDC00-\uDFFF]/g, '').replace(/[←-➿⬀-⯿✅✔️]/g, '').replace(/\s+/g, ' ').trim()

// Phone key: digits only; a leading 0 → Malaysia 60. SG (Shopee SG / FB SG) → 65.
function phoneKey(raw: string, channel: string): string {
  let d = raw.replace(/\D/g, '')
  if (!d) return ''
  const sg = /sg/i.test(channel)
  if (d.charAt(0) === '0') d = (sg ? '65' : '60') + d.slice(1)
  return d
}

export type NeOrder = { key: string; ms: number; price: number; pkg: string }

async function buildPkgMaps() {
  const pkgRecs = await fetchLarkRecords(T_PKG, NE_APP, undefined, ['SKUs', 'Price', 'Status', 'what'])
  const byId = new Map<string, string>()
  const byPrice = new Map<number, string>()
  const score = new Map<number, number>()
  for (const r of pkgRecs as Array<{ record_id: string; fields: Record<string, unknown> }>) {
    const raw = fstr(r.fields['SKUs'])
    const name = cleanPkg(raw)
    if (!name || /^❌+$/.test(name)) continue
    if (r.record_id) byId.set(r.record_id, name)
    const price = fnum(r.fields['Price'])
    if (price <= 0) continue
    let sc = 0
    if (fstr(r.fields['Status']).indexOf('Current') >= 0) sc += 8
    if (!/copy|shopee|\(shopee\)|❌|🟠|双11|cny|promo|【|staff/i.test(raw)) sc += 4
    if (/新人|回购/.test(fstr(r.fields['what']))) sc += 2
    if (!score.has(price) || sc > (score.get(price) || 0)) { score.set(price, sc); byPrice.set(price, name) }
  }
  return { byId, byPrice }
}

export async function loadNeOrders(): Promise<NeOrder[]> {
  const [recs26, recs25, maps] = await Promise.all([
    fetchLarkRecords(T_2026, NE_APP, undefined, SLIM_2026),
    fetchLarkRecords(T_2025, NE_APP, undefined, SLIM_2025),
    buildPkgMaps(),
  ])
  const out: NeOrder[] = []

  // 2026 — Package link + currency price + normalised Phone Number formula.
  for (const rec of recs26) {
    const f = rec.fields
    const channel = fstr(f['Channel'])
    if (channel === 'Return') continue
    const price = fnum(f['Total Price']) || fnum(f['Price Domain'])
    if (price <= 0) continue
    const ms = fdateMs(f['Date'])
    if (!ms) continue
    const phoneRaw = fstr(f['Phone Number']) || fstr(f['Phone no'])
    const nm = fstr(f['Name'])
    const key = phoneKey(phoneRaw, channel) || (nm ? 'name:' + nm.toLowerCase() : '')
    if (!key) continue
    let pkg = maps.byPrice.get(price) || ''
    if (!pkg) { const ids = linkIds(f['Package']); pkg = ids.map(id => maps.byId.get(id) || '').filter(Boolean).join(', ') }
    if (!pkg) pkg = cleanPkg(fstr(f['List of package']))
    if (!pkg) pkg = `RM${price}`
    out.push({ key, ms, price, pkg })
  }

  // 2025 — text price (e.g. "RM538.00") + text Package 1/2; name = FB Name.
  for (const rec of recs25) {
    const f = rec.fields
    const channel = fstr(f['Channel'])
    if (channel === 'Return') continue
    const price = fnum(fstr(f['Price 1+2']))
    if (price <= 0) continue
    const ms = fdateMs(f['Date'])
    if (!ms) continue
    const phoneRaw = fstr(f['Phone number'])
    const nm = fstr(f['FB Name'])
    const key = phoneKey(phoneRaw, channel) || (nm ? 'name:' + nm.toLowerCase() : '')
    if (!key) continue
    let pkg = maps.byPrice.get(price) || ''
    if (!pkg) { const p1 = cleanPkg(fstr(f['Package 1'])); const p2 = cleanPkg(fstr(f['Package 2'])); pkg = [p1, p2].filter(Boolean).join(', ') }
    if (!pkg) pkg = `RM${price}`
    out.push({ key, ms, price, pkg })
  }

  return out
}
