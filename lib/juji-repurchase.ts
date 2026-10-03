import { fetchLarkRecords } from './lark'

// Jujigrainz first-order → next-order price ladder (single product line).
const JUJI_APP = 'GXamw6ldPipdXFkkNY1j8RKzpzg'
const T_ORDER = 'tblIb0g8xEeRGsbe'
const T_PKG = 'tblSFCm5N8hAYXxv'
const SLIM = ['Date', 'Channel', 'Name', 'Phone Number', 'Total Price', 'Price Domain', 'List of package', 'Package']

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

export const BANDS = ['<300', '300-499', '500-699', '700-999', '1000+'] as const
function band(p: number): string {
  if (p < 300) return '<300'
  if (p < 500) return '300-499'
  if (p < 700) return '500-699'
  if (p < 1000) return '700-999'
  return '1000+'
}
export type BandRow = { band: string; firstCount: number; repeatCount: number; repeatRate: number; firstAvg: number; nextAvg: number; avgDays: number; topPkgs: { pkg: string; count: number }[]; topNext: { pkg: string; count: number }[]; mig: Record<string, number> }
export type LineRepurchase = { key: string; label: string; totalFirst: number; totalRepeat: number; overallRate: number; nextAvg: number; firstAvg: number; bands: BandRow[] }
export type JujiRepurchase = { lines: LineRepurchase[]; byPackage: [] }

export async function computeJujiRepurchase(): Promise<JujiRepurchase> {
  const [orders, pkgRecs] = await Promise.all([
    fetchLarkRecords(T_ORDER, JUJI_APP, undefined, SLIM),
    fetchLarkRecords(T_PKG, JUJI_APP, undefined, ['SKUs', 'Price', 'Status']),
  ])
  const cleanPkg = (s: string) => s.replace(/[\uD800-\uDBFF][\uDC00-\uDFFF]/g, '').replace(/[←-➿⬀-⯿✅✔️]/g, '').replace(/\s+/g, ' ').trim()
  // Resolve a package name two ways: by link record_id, and by price (robust fallback —
  // Total Price always comes through even if the link field doesn't on the GET endpoint).
  const pkgName = new Map<string, string>()          // record_id -> clean SKU
  const pkgByPrice = new Map<number, string>()        // price -> canonical clean SKU
  const priceScore = new Map<number, number>()        // price -> score of current best
  for (const r of pkgRecs as Array<{ record_id: string; fields: Record<string, unknown> }>) {
    const raw = fstr(r.fields['SKUs'])
    const n = cleanPkg(raw)
    if (!n) continue
    if (r.record_id) pkgName.set(r.record_id, n)
    const price = fnum(r.fields['Price'])
    if (price <= 0) continue
    // Prefer canonical packages: penalise Shopee / SP / promo / copy / crossed-out variants.
    let score = 0
    if (fstr(r.fields['Status']).indexOf('Current') >= 0) score += 4
    if (!/shopee|SP |（Shopee|copy|1\.0|❌|🟠/i.test(raw)) score += 2
    if (!/promo|【/i.test(raw)) score += 1
    if (!priceScore.has(price) || score > (priceScore.get(price) || 0)) {
      priceScore.set(price, score); pkgByPrice.set(price, n)
    }
  }

  type O = { ms: number; price: number; pkg: string }
  const map = new Map<string, O[]>()
  for (const rec of orders) {
    const f = rec.fields
    const channel = fstr(f['Channel'])
    if (channel === 'Return') continue
    const price = fnum(f['Total Price']) || fnum(f['Price Domain'])
    if (price <= 0) continue
    const ms = fdateMs(f['Date'])
    if (!ms) continue
    const phone = fstr(f['Phone Number'])
    const nm = fstr(f['Name'])
    const key = phone || (nm ? 'name:' + nm.toLowerCase() : '')
    if (!key) continue
    // Name priority: link SKU → price→SKU map → free-text (mislabels Tins as 盒) → RM amount.
    // Never trust `List of package` first; it is hand-typed and wrong for most Tin packages.
    const ids = linkIds(f['Package'])
    let pkg = ids.map(id => pkgName.get(id) || '').filter(Boolean).join(', ')
    if (!pkg) pkg = pkgByPrice.get(price) || ''
    if (!pkg) pkg = cleanPkg(fstr(f['List of package']))
    if (!pkg) pkg = `RM${price}`
    let arr = map.get(key); if (!arr) { arr = []; map.set(key, arr) }
    arr.push({ ms, price, pkg })
  }

  const DAY = 86400000
  type Acc = { firstCount: number; repeatCount: number; firstSum: number; nextSum: number; daysSum: number; pkgs: Map<string, number>; nextPkgs: Map<string, number>; mig: Record<string, number> }
  const byBand: Record<string, Acc> = {}
  const ens = (b: string): Acc => { if (!byBand[b]) byBand[b] = { firstCount: 0, repeatCount: 0, firstSum: 0, nextSum: 0, daysSum: 0, pkgs: new Map(), nextPkgs: new Map(), mig: {} }; return byBand[b] }
  for (const o of Array.from(map.values())) {
    o.sort((a, b) => a.ms - b.ms)
    const first = o[0]; const fb = band(first.price); const second = o.length >= 2 ? o[1] : null
    const a = ens(fb)
    a.firstCount++; a.firstSum += first.price; a.pkgs.set(first.pkg, (a.pkgs.get(first.pkg) || 0) + 1)
    if (second) {
      a.repeatCount++; a.nextSum += second.price; a.daysSum += (second.ms - first.ms) / DAY
      const sb = band(second.price); a.mig[sb] = (a.mig[sb] || 0) + 1
      a.nextPkgs.set(second.pkg, (a.nextPkgs.get(second.pkg) || 0) + 1)
    }
  }
  const top3 = (m?: Map<string, number>) => m ? Array.from(m.entries()).map(([pkg, count]) => ({ pkg, count })).sort((x, y) => y.count - x.count).slice(0, 3) : []
  const bands: BandRow[] = BANDS.map(b => {
    const a = byBand[b]
    const mig: Record<string, number> = {}
    for (const sb of BANDS) mig[sb] = a && a.repeatCount ? Math.round((a.mig[sb] || 0) / a.repeatCount * 1000) / 10 : 0
    return {
      band: b, firstCount: a?.firstCount ?? 0, repeatCount: a?.repeatCount ?? 0,
      repeatRate: a?.firstCount ? Math.round(a.repeatCount / a.firstCount * 1000) / 10 : 0,
      firstAvg: a?.firstCount ? Math.round(a.firstSum / a.firstCount) : 0,
      nextAvg: a?.repeatCount ? Math.round(a.nextSum / a.repeatCount) : 0,
      avgDays: a?.repeatCount ? Math.round(a.daysSum / a.repeatCount) : 0,
      topPkgs: top3(a?.pkgs), topNext: top3(a?.nextPkgs), mig,
    }
  })
  const tf = bands.reduce((s, x) => s + x.firstCount, 0)
  const tr = bands.reduce((s, x) => s + x.repeatCount, 0)
  const fs = BANDS.reduce((s, b) => s + (byBand[b]?.firstSum || 0), 0)
  const ns = BANDS.reduce((s, b) => s + (byBand[b]?.nextSum || 0), 0)
  const line: LineRepurchase = { key: 'all', label: 'All', totalFirst: tf, totalRepeat: tr, overallRate: tf ? Math.round(tr / tf * 1000) / 10 : 0, firstAvg: tf ? Math.round(fs / tf) : 0, nextAvg: tr ? Math.round(ns / tr) : 0, bands }
  return { lines: [line], byPackage: [] }
}
