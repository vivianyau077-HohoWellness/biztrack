import { fetchLarkRecords } from '@/lib/lark'

// "2026 daily order" table in the DD Lark base. The AUTO VIP single-select field
// is Lark's source of truth for VIP status + country (Malaysia VIP / Singapore VIP),
// already computed from the RM700 + 1-year-repurchase rules on the Lark side.
const DAILY_ORDER_TABLE = 'tblo8XMsLvQgj9IC'

export interface VipRegistration {
  year: number
  newVipTotal: number   // new-customer VIPs (MY + SG), excludes repeat
  newVipMY: number      // Malaysia VIP, new customers only
  newVipSG: number      // Singapore VIP, new customers only
  totalVipMY: number    // Malaysia VIP, all (new + repeat)
  totalVipSG: number    // Singapore VIP, all (new + repeat)
  newCustomers: number
  registrationRate: number | null // percentage = newVipTotal / newCustomers
}

// Lark fields come back in several shapes: plain string, number, array of strings
// (single-select), or array of { text } objects (text fields). Normalize to a string.
function larkStr(v: unknown): string {
  if (v == null) return ''
  if (typeof v === 'string') return v.trim()
  if (typeof v === 'number') return String(v)
  if (Array.isArray(v)) {
    return v
      .map(item => (typeof item === 'string' ? item : ((item as { text?: string })?.text ?? '')))
      .join('')
      .trim()
  }
  if (typeof v === 'object' && 'text' in (v as Record<string, unknown>)) {
    return String((v as { text: unknown }).text).trim()
  }
  return ''
}

export async function computeVipRegistration(): Promise<VipRegistration> {
  const year = new Date().getFullYear()
  const records = await fetchLarkRecords(DAILY_ORDER_TABLE)

  // Aggregate per customer (deduped by phone, else name) — count people, not orders.
  // vip = which country VIP tag they carry; isNew = whether they're a new customer this year.
  const customers = new Map<string, { vip: 'MY' | 'SG' | null; isNew: boolean }>()

  for (const r of records) {
    const f = r.fields as Record<string, unknown>

    const dateMs = typeof f['Date'] === 'number' ? (f['Date'] as number) : null
    if (!dateMs || new Date(dateMs).getFullYear() !== year) continue

    const phoneNum = typeof f['Phone no'] === 'number' ? String(f['Phone no']) : ''
    const phoneText = larkStr(f['Phone Number'])
    const name = larkStr(f['Name'])
    const key = (phoneNum || phoneText || name).toLowerCase()
    if (!key) continue

    const entry = customers.get(key) ?? { vip: null as 'MY' | 'SG' | null, isNew: false }

    const autoVip = larkStr(f['AUTO VIP'])
    if (autoVip.startsWith('Malaysia')) entry.vip = 'MY'
    else if (autoVip.startsWith('Singapore')) entry.vip = 'SG'

    const track = larkStr(f['Track 2026']) || larkStr(f['AUTO N/R'])
    if (track === 'New') entry.isNew = true

    customers.set(key, entry)
  }

  let totalVipMY = 0, totalVipSG = 0, newVipMY = 0, newVipSG = 0, newCustomers = 0
  for (const c of Array.from(customers.values())) {
    if (c.isNew) newCustomers++
    if (c.vip === 'MY') { totalVipMY++; if (c.isNew) newVipMY++ }
    else if (c.vip === 'SG') { totalVipSG++; if (c.isNew) newVipSG++ }
  }

  const newVipTotal = newVipMY + newVipSG
  const registrationRate = newCustomers > 0 ? Math.round((newVipTotal / newCustomers) * 1000) / 10 : null

  return { year, newVipTotal, newVipMY, newVipSG, totalVipMY, totalVipSG, newCustomers, registrationRate }
}
