import { loadNeOrders } from './ne-data'

// Nutrieye first-order → next-order price ladder (2025 + 2026 combined, single line).
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
export type NeRepurchase = { lines: LineRepurchase[]; byPackage: [] }

export async function computeNeRepurchase(): Promise<NeRepurchase> {
  const orders = await loadNeOrders()
  type O = { ms: number; price: number; pkg: string }
  const map = new Map<string, O[]>()
  for (const o of orders) {
    let arr = map.get(o.key); if (!arr) { arr = []; map.set(o.key, arr) }
    arr.push({ ms: o.ms, price: o.price, pkg: o.pkg })
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
