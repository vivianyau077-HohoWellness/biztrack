import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { larkFetch } from '@/lib/lark'

export const dynamic = 'force-dynamic'

const LARK_APP_TOKEN = 'S8XXb8PT2a82ouslzQWjBaYap2g'
const LARK_TABLE_ID  = 'tblYU2qhtVqzMnEF'
const DD_PROJECT_ID  = '369ca28c-12a2-4dcd-856d-582b9b230766'

// ── Rate limiter ──────────────────────────────────────────────────────────────

const rlMap = new Map<string, number[]>()
const RL_WINDOW_MS = 60 * 60 * 1000
const RL_LIMIT = 20

function isRateLimited(ip: string): boolean {
  const now = Date.now()
  const timestamps = rlMap.get(ip) ?? []
  const recent = timestamps.filter(t => now - t < RL_WINDOW_MS)
  if (recent.length >= RL_LIMIT) return true
  recent.push(now)
  rlMap.set(ip, recent)
  return false
}

function normalizePhone(raw: string): string {
  let digits = raw.replace(/\D/g, '')
  if (digits.startsWith('0')) digits = digits.slice(1)
  if (!digits.startsWith('60')) digits = '60' + digits
  return digits
}

// ── Handler ───────────────────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  const ip =
    req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ??
    req.headers.get('x-real-ip') ??
    'unknown'

  if (isRateLimited(ip)) {
    return NextResponse.json({ error: 'Too many requests. Please try again later.' }, { status: 429 })
  }

  let body: {
    phone?: string
    customer_name?: string
    receipt_number?: string
    receipt_date?: string
    receipt_amount?: number
    receipt_type?: string
    claimed_by?: string
  }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 })
  }

  const { phone: rawPhone, customer_name, receipt_number, receipt_date, receipt_amount, receipt_type, claimed_by } = body

  if (!rawPhone || !receipt_number?.trim()) {
    return NextResponse.json({ error: 'phone and receipt_number are required' }, { status: 400 })
  }

  const phone = normalizePhone(rawPhone)
  if (phone.length < 10) {
    return NextResponse.json({ error: 'Invalid phone number' }, { status: 400 })
  }

  const claimedBy    = claimed_by?.trim() || 'CS'
  const receiptType  = receipt_type?.trim() || 'Offline Purchase - DD'

  // ── Final duplicate check ───────────────────────────────────────────────────

  try {
    const searchResult = await larkFetch(
      `/bitable/v1/apps/${LARK_APP_TOKEN}/tables/${LARK_TABLE_ID}/records/search`,
      {
        method: 'POST',
        body: JSON.stringify({
          filter: {
            conjunction: 'and',
            conditions: [{
              field_name: 'Receipt Number',
              operator: 'is',
              value: [receipt_number.trim()],
            }],
          },
        }),
      },
    )
    if ((searchResult.data?.total ?? 0) > 0) {
      return NextResponse.json({ error: 'Receipt number already recorded' }, { status: 409 })
    }
  } catch (e) {
    console.error('[save-receipt] Lark duplicate check error:', e)
    // Proceed — best effort
  }

  // ── Fetch customer and VIP data from Supabase ───────────────────────────────

  const supabase = createAdminClient()

  const [{ data: customer }, { data: vipOrderRows }] = await Promise.all([
    supabase
      .from('customers')
      .select('name, date_of_birth, vip_member_number')
      .eq('phone', phone)
      .maybeSingle(),

    supabase
      .from('orders')
      .select('order_date')
      .eq('phone', phone)
      .eq('is_vip', true)
      .eq('project_id', DD_PROJECT_ID)
      .order('order_date', { ascending: true })
      .limit(1),
  ])

  const customerName = customer_name?.trim() || customer?.name || phone
  const dob          = customer?.date_of_birth as string | null | undefined
  const memberNumber = customer?.vip_member_number as string | null | undefined
  const vipSince     = vipOrderRows?.[0]?.order_date as string | undefined

  // ── Write to Lark ───────────────────────────────────────────────────────────

  try {
    const larkRes = await larkFetch(
      `/bitable/v1/apps/${LARK_APP_TOKEN}/tables/${LARK_TABLE_ID}/records`,
      {
        method: 'POST',
        body: JSON.stringify({
          fields: {
            fldrQfUga3: customerName,
            fldH0Q0uEH: phone,
            fldAEH3NbB: dob ? new Date(dob).getTime() : null,
            fldiqoVAtA: null,  // Gift Claimed Date — null for receipts
            fld5XXINtY: null,  // Membership Year — null for receipts
            fldJqQFoHw: claimedBy,
            fldOCJ0Eb4: vipSince ? new Date(vipSince).getTime() : null,
            fldBHOanbe: memberNumber ?? '',
            fldygBOw4y: receipt_number.trim(),
            fldAzuUeQt: receipt_date ? new Date(receipt_date).getTime() : null,
            fldIQ8hHi1: receipt_amount ?? null,
            fldwWRfYZb: receiptType,
          },
        }),
      },
    )
    if (larkRes.code !== 0) {
      console.error('[save-receipt] Lark write error:', larkRes.code, larkRes.msg)
    }
  } catch (e) {
    console.error('[save-receipt] Lark write failed:', e)
    // Non-blocking — log and continue
  }

  return NextResponse.json({ success: true })
}
