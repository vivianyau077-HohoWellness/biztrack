import { fetchLarkRecords } from './lark'

// First-order → second-order price-ladder analysis for DD, split by product line.
// Answers: by first-order price band, what % come back, and what do they buy next.
const APP = 'S8XXb8PT2a82ouslzQWjBaYap2g'
const T_ORDER_26 = 'tblpMwKyxbddnXNG'
const T_DAILY_25 = 'tblEy6fdbsuXhS6L'
const SLIM = ['Channel', 'Date', 'Total Price', 'Price Domain', 'Name', 'Package', 'Phone Number']

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
const BEAUTY_CH = ['【焕肤】FB ', '【焕肤】FB', '焕肤 ENG']
const REPAIR_CH = ['【伤口】FB', '伤口 ENG', '新【钻石露】FB']
function lineOf(channel: string, pkg: string): 'B' | 'R' | 'M' {
  const c = channel + ' ' + pkg
  if (BEAUTY_CH.indexOf(channel) >= 0 || c.indexOf('焕肤') >= 0 || c.indexOf('美') >= 0) return 'B'
  if (REPAIR_CH.indexOf(channel) >= 0 || c.indexOf('伤口') >= 0 || c.indexOf('钻石露') >= 0) return 'R'
  return 'M'
}
export const BANDS = ['<300', '300-499', '500-699', '700-999', '1000+'] as const
function band(p: number): string {
  if (p < 300) return '<300'
  if (p < 500) return '300-499'
  if (p < 700) return '500-699'
  if (p < 1000) return '700-999'
  return '1000+'
}

export type BandRow = {
  band: string; firstCount: number; repeatCount: number; repeatRate: number
  firstAvg: number; nextAvg: number; mig: Record<string, number> // second-band -> % of repeaters
}
export type LineRepurchase = { key: string; label: string; totalFirst: number; totalRepeat: number; overallRate: number; nextAvg: number; firstAvg: number; bands: BandRow[] }
export type DdRepurchase = { lines: LineRepurchase[] }

export async function computeDdRepurchase(): Promise<DdRepurchase> {
  const [ord26, daily25] = await Promise.all([
    fetchLarkRecords(T_ORDER_26, APP, undefined, SLIM),
    fetchLarkRecords(T_DAILY_25, APP, undefined, SLIM),
  ])
  type O = { ms: number; price: number; line: 'B' | 'R' | 'M' }
  const map = new Map<string, O[]>()
  const eat = (recs: Array<{ fields: Record<string, unknown> }>) => {
    for (const rec of recs) {
      const f = rec.fields
      const channel = fstr(f['Channel'])
      if (channel === 'Return') continue
      const price = fnum(f['Total Price']) || fnum(f['Price Domain'])
      if (price <= 0) continue
      const ms = fdateMs(f['Date'])
      if (!ms) continue
      const nm = fstr(f['Name'])
      const chL = channel.toLowerCase()
      const isSg = chL.indexOf('sg') >= 0
      let key = normPhone(fstr(f['Phone Number']), isSg)
      if (!key) {
        const mkt = chL.indexOf('shopee') >= 0 || chL.indexOf('lazada') >= 0 || (!chL.includes('fb') && !chL.includes('whatsapp') && !chL.includes('eng'))
        if (mkt && nm) key = 'name:' + nm.toLowerCase()
        else continue
      }
      let arr = map.get(key)
      if (!arr) { arr = []; map.set(key, arr) }
      arr.push({ ms, price, line: lineOf(channel, fstr(f['Package'])) })
    }
  }
  eat(ord26 as Array<{ fields: Record<string, unknown> }>)
  eat(daily25 as Array<{ fields: Record<string, unknown> }>)

  // accumulators per line group ('all','B','R') per first-band
  type Acc = { firstCount: number; repeatCount: number; firstSum: number; nextSum: number; mig: Record<string, number> }
  const groups: Record<string, Record<string, Acc>> = { all: {}, B: {}, R: {} }
  const ensure = (g: string, b: string): Acc => {
    if (!groups[g][b]) groups[g][b] = { firstCount: 0, repeatCount: 0, firstSum: 0, nextSum: 0, mig: {} }
    return groups[g][b]
  }
  for (const orders of Array.from(map.values())) {
    orders.sort((a, b) => a.ms - b.ms)
    const first = orders[0]
    const fb = band(first.price)
    const second = orders.length >= 2 ? orders[1] : null
    const addTo = (g: string) => {
      const a = ensure(g, fb)
      a.firstCount++; a.firstSum += first.price
      if (second) { a.repeatCount++; a.nextSum += second.price; const sb = band(second.price); a.mig[sb] = (a.mig[sb] || 0) + 1 }
    }
    addTo('all')
    if (first.line === 'B') addTo('B')
    else if (first.line === 'R') addTo('R')
  }

  const buildLine = (g: string, key: string, label: string): LineRepurchase => {
    const bands: BandRow[] = BANDS.map(b => {
      const a = groups[g][b] ?? { firstCount: 0, repeatCount: 0, firstSum: 0, nextSum: 0, mig: {} }
      const mig: Record<string, number> = {}
      for (const sb of BANDS) mig[sb] = a.repeatCount ? Math.round((a.mig[sb] || 0) / a.repeatCount * 1000) / 10 : 0
      return {
        band: b, firstCount: a.firstCount, repeatCount: a.repeatCount,
        repeatRate: a.firstCount ? Math.round(a.repeatCount / a.firstCount * 1000) / 10 : 0,
        firstAvg: a.firstCount ? Math.round(a.firstSum / a.firstCount) : 0,
        nextAvg: a.repeatCount ? Math.round(a.nextSum / a.repeatCount) : 0,
        mig,
      }
    })
    const tf = bands.reduce((s, x) => s + x.firstCount, 0)
    const tr = bands.reduce((s, x) => s + x.repeatCount, 0)
    const fs = BANDS.reduce((s, b) => s + (groups[g][b]?.firstSum || 0), 0)
    const ns = BANDS.reduce((s, b) => s + (groups[g][b]?.nextSum || 0), 0)
    return { key, label, totalFirst: tf, totalRepeat: tr, overallRate: tf ? Math.round(tr / tf * 1000) / 10 : 0, firstAvg: tf ? Math.round(fs / tf) : 0, nextAvg: tr ? Math.round(ns / tr) : 0, bands }
  }

  return { lines: [buildLine('all', 'all', 'All'), buildLine('B', 'B', 'Beauty 焕肤王'), buildLine('R', 'R', 'Repair 钻石露')] }
}
