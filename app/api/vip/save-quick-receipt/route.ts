import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { larkFetch } from '@/lib/lark'

export const dynamic = 'force-dynamic'

const LARK_APP_TOKEN = 'QV2vbeAyIaDiu2skeFojbNhspnh'
const LARK_TABLE_ID  = 'tbl8OxfB9FMYFCnB'
const VIP_THRESHOLD  = 700

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
    receipt_number?: string | null
    receipt_date?: string | null
    receipt_amount?: number | null
    supplier_name?: string | null
    products?: string | null
    address?: string | null
    claimed_by?: string
  }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 })
  }

  const { phone: rawPhone, customer_name, receipt_number, receipt_date, receipt_amount, supplier_name, products, address, claimed_by } = body

  if (!rawPhone?.trim() || !customer_name?.trim()) {
    return NextResponse.json({ error: 'phone and customer_name are required' }, { status: 400 })
  }

  const phone = normalizePhone(rawPhone)
  if (phone.length < 10) {
    return NextResponse.json({ error: 'Invalid phone number' }, { status: 400 })
  }

  const customerName = customer_name.trim()
  const claimedBy    = claimed_by?.trim() || 'CS'
  const receiptNo    = receipt_number?.trim() || null

  // ── Duplicate check (only if receipt_number is not null) ───────────────────

  if (receiptNo) {
    try {
      const searchResult = await larkFetch(
        `/bitable/v1/apps/${LARK_APP_TOKEN}/tables/${LARK_TABLE_ID}/records/search`,
        {
          method: 'POST',
          body: JSON.stringify({
            filter: {
              conjunction: 'and',
              conditions: [{
                field_name: 'Receipt NO',
                operator: 'is',
                value: [receiptNo],
              }],
            },
          }),
        },
      )
      if ((searchResult.data?.total ?? 0) > 0) {
        return NextResponse.json({
          success: false,
          duplicate: true,
          is_vip_eligible: false,
          is_new_vip: false,
          member_number: null,
          customer_name: customerName,
          message: 'Receipt number already recorded',
        })
      }
    } catch (e) {
      console.error('[save-quick-receipt] Lark duplicate check error:', e)
      // Best effort — proceed
    }
  }

  // ── Find or create customer ─────────────────────────────────────────────────

  const supabase = createAdminClient()

  const { data: existingCustomer } = await supabase
    .from('customers')
    .select('id, name, vip_member_number')
    .eq('phone', phone)
    .maybeSingle()

  if (!existingCustomer) {
    await supabase.from('customers').upsert(
      { phone, name: customerName },
      { onConflict: 'phone' },
    )
  } else if (!existingCustomer.name || existingCustomer.name === phone) {
    await supabase.from('customers').update({ name: customerName }).eq('phone', phone)
  }

  // ── VIP eligibility check ───────────────────────────────────────────────────

  const isVipEligible = (receipt_amount ?? 0) >= VIP_THRESHOLD

  // ── Member number: check current value, generate if VIP eligible and missing ─

  const { data: freshCustomer } = await supabase
    .from('customers')
    .select('vip_member_number')
    .eq('phone', phone)
    .maybeSingle()

  let memberNumber = freshCustomer?.vip_member_number ?? null
  let isNewVip = false

  if (isVipEligible && !memberNumber) {
    try {
      const { data: seqData } = await supabase.rpc('next_vip_member_number')
      if (seqData != null) {
        const padded = String(seqData).padStart(4, '0')
        memberNumber = `DD-VIP-${padded}`
        await supabase
          .from('customers')
          .update({ vip_member_number: memberNumber })
          .eq('phone', phone)
        isNewVip = true
      }
    } catch (e) {
      console.error('[save-quick-receipt] Member number generation error:', e)
    }
  }

  // ── Write to Lark (non-blocking on failure) ─────────────────────────────────

  let larkSynced = false
  let larkError: string | null = null
  try {
    const larkRes = await larkFetch(
      `/bitable/v1/apps/${LARK_APP_TOKEN}/tables/${LARK_TABLE_ID}/records`,
      {
        method: 'POST',
        body: JSON.stringify({
          fields: {
            'INFO': `${customerName} - ${receiptNo ?? 'No Receipt No'}`,
            'Supplier': supplier_name ?? '',
            'Receipt NO': receiptNo ?? '',
            'Date of Purchased': receipt_date ? new Date(receipt_date).getTime() : null,
            'Amount': receipt_amount != null ? String(receipt_amount) : '',
            'Products': products ?? '',
            'Name': customerName,
            'Contact Number': phone ? Number(phone) : null,
            'Address': address ?? '',
            'Approved': false,
            'AS Offline': false,
          },
        }),
      },
    )
    if (larkRes.code !== 0) {
      console.error('[save-quick-receipt] Lark write error:', larkRes.code, larkRes.msg)
      larkError = `${larkRes.code}: ${larkRes.msg}`
    } else {
      larkSynced = true
    }
  } catch (e) {
    console.error('[save-quick-receipt] Lark write failed:', e)
    larkError = e instanceof Error ? e.message : 'Network error writing to Lark'
    // Non-blocking — log and continue
  }

  return NextResponse.json({
    success: true,
    duplicate: false,
    is_vip_eligible: isVipEligible,
    is_new_vip: isNewVip,
    member_number: memberNumber,
    customer_name: customerName,
    lark_synced: larkSynced,
    lark_error: larkError,
    message: isVipEligible
      ? 'Receipt recorded — customer is VIP eligible!'
      : 'Receipt recorded — amount below VIP threshold (RM 700)',
  })
}
