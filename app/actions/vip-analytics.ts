'use server'

import { fetchLarkRecords } from '@/lib/lark'

// "2026 daily order" table in the DD Lark base. The AUTO VIP single-select field
// is Lark's source of truth for VIP status + country (Malaysia VIP / Singapore VIP),
// already computed from the RM700 + 1-year-repurchase rules on the Lark side.
const DAILY_ORDER_TABLE = 'tblo8XMsLvQgj9IC'

export interface VipRegistration {
  year: number
  newVipTotal: number
  newVipMY: number
  newVipSG: number
  newCustomers: number
  registrationRate: number | null // percentage, e.g. 12.5 (newVipTotal / newCustomers)
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

export async function getVipRegistration(): Promise<VipRegistration> {
  const year = new Date().getFullYear()
  const records = await fetchLarkRecords(DAILY_ORDER_TABLE)

  // Dedupe by customer (phone preferred, else name) so we count people, not orders.
  const vipMY = new Set<string>()
  const vipSG = new Set<string>()
  const newCustomers = new Set<string>()

  for (const r of records) {
    const f = r.fields as Record<string, unknown>

    const dateMs = typeof f['Date'] === 'number' ? (f['Date'] as number) : null
    if (!dateMs || new Date(dateMs).getFullYear() !== year) continue

    const phoneNum = typeof f['Phone no'] === 'number' ? String(f['Phone no']) : ''
    const phoneText = larkStr(f['Phone Number'])
    const name = larkStr(f['Name'])
    const key = (phoneNum || phoneText || name).toLowerCase()
    if (!key) continue

    const autoVip = larkStr(f['AUTO VIP'])
    if (autoVip.startsWith('Malaysia')) vipMY.add(key)
    else if (autoVip.startsWith('Singapore')) vipSG.add(key)

    const track = larkStr(f['Track 2026']) || larkStr(f['AUTO N/R'])
    if (track === 'New') newCustomers.add(key)
  }

  const newVipMY = vipMY.size
  const newVipSG = vipSG.size
  const newVipTotal = newVipMY + newVipSG
  const nc = newCustomers.size
  const registrationRate = nc > 0 ? Math.round((newVipTotal / nc) * 1000) / 10 : null

  return { year, newVipTotal, newVipMY, newVipSG, newCustomers: nc, registrationRate }
}
