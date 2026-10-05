import { fetchLarkRecords, fetchLarkRecordsSearch } from './lark'
import { fnum, fstr } from './ne-data'

// Top 10 customers by spend, per brand, from each brand's Lark order table(s).
// Dedup phone-first (name fallback). Tag: VIP (DD only) / Repeat (2+ orders) / New.
export type TopCustomer = { name: string; phone: string; tag: string; total_orders: number; total_spent: number }

function normPhone(raw: string, sg = false): string {
  let d = raw.replace(/\D/g, '')
  if (!d) return ''
  if (d.charAt(0) === '0') d = (sg ? '65' : '60') + d.slice(1)
  return d
}

type Row = { name: string; phone: string; price: number; vip: boolean; channel: string }

function aggregate(rows: Row[]): TopCustomer[] {
  type C = { name: string; phone: string; spend: number; orders: number; vip: boolean }
  const map = new Map<string, C>()
  for (const r of rows) {
    if (r.price <= 0) continue
    const sg = r.channel.toLowerCase().indexOf('sg') >= 0
    const ph = normPhone(r.phone, sg)
    const key = ph || (r.name ? 'name:' + r.name.toLowerCase().trim() : '')
    if (!key) continue
    let c = map.get(key)
    if (!c) { c = { name: r.name || ph, phone: ph, spend: 0, orders: 0, vip: false }; map.set(key, c) }
    c.spend += r.price; c.orders += 1
    if (r.vip) c.vip = true
    if ((!c.name || c.name === c.phone) && r.name) c.name = r.name
  }
  return Array.from(map.values())
    .sort((a, b) => b.spend - a.spend)
    .slice(0, 10)
    .map(c => ({ name: c.name || '(no name)', phone: c.phone, tag: c.vip ? 'VIP' : c.orders >= 2 ? 'Repeat' : 'New', total_orders: c.orders, total_spent: Math.round(c.spend) }))
}

const isVip = (v: unknown) => fstr(v).indexOf('VIP') >= 0

async function ddRows(): Promise<Row[]> {
  const APP = 'S8XXb8PT2a82ouslzQWjBaYap2g'
  const F = ['Channel', 'Total Price', 'Price Domain', 'Name', 'Phone Number', 'AUTO VIP']
  const [a, b] = await Promise.all([
    fetchLarkRecords('tblpMwKyxbddnXNG', APP, undefined, F),
    fetchLarkRecords('tblEy6fdbsuXhS6L', APP, undefined, F),
  ])
  const out: Row[] = []
  for (const rec of [...a, ...b]) {
    const f = rec.fields
    const channel = fstr(f['Channel']); if (channel === 'Return') continue
    out.push({ name: fstr(f['Name']), phone: fstr(f['Phone Number']), price: fnum(f['Total Price']) || fnum(f['Price Domain']), vip: isVip(f['AUTO VIP']), channel })
  }
  return out
}

async function jujiRows(): Promise<Row[]> {
  const recs = await fetchLarkRecords('tblIb0g8xEeRGsbe', 'GXamw6ldPipdXFkkNY1j8RKzpzg', undefined, ['Channel', 'Total Price', 'Price Domain', 'Name', 'Phone Number', 'Phone no'])
  const out: Row[] = []
  for (const rec of recs) {
    const f = rec.fields
    const channel = fstr(f['Channel']); if (channel === 'Return') continue
    out.push({ name: fstr(f['Name']), phone: fstr(f['Phone Number']) || fstr(f['Phone no']), price: fnum(f['Total Price']) || fnum(f['Price Domain']), vip: false, channel })
  }
  return out
}

async function neRows(): Promise<Row[]> {
  const APP = 'GaBUwog1Niooyyk10fhjkUg6p9c'
  const [r26, r25] = await Promise.all([
    fetchLarkRecordsSearch('tblCgCKSZ3zALx6t', APP, ['Channel', 'Name', 'Phone Number', 'Phone no', 'Total Price', 'Price Domain']),
    fetchLarkRecordsSearch('tbl7fjGsvklEaCh6', APP, ['Channel', 'FB Name', 'Phone number', 'Price 1+2']),
  ])
  const out: Row[] = []
  for (const rec of r26) {
    const f = rec.fields
    const channel = fstr(f['Channel']); if (channel === 'Return') continue
    out.push({ name: fstr(f['Name']), phone: fstr(f['Phone Number']) || fstr(f['Phone no']), price: fnum(f['Total Price']) || fnum(f['Price Domain']), vip: false, channel })
  }
  for (const rec of r25) {
    const f = rec.fields
    const channel = fstr(f['Channel']); if (channel === 'Return') continue
    out.push({ name: fstr(f['FB Name']), phone: fstr(f['Phone number']), price: fnum(fstr(f['Price 1+2'])), vip: false, channel })
  }
  return out
}

export async function computeBrandTopCustomers(brand: string): Promise<TopCustomer[]> {
  if (brand === 'DD') return aggregate(await ddRows())
  if (brand === 'Juji') return aggregate(await jujiRows())
  if (brand === 'NE') return aggregate(await neRows())
  return []
}
