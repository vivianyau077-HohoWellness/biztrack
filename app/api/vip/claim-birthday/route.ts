import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { larkFetch } from '@/lib/lark'

export const dynamic = 'force-dynamic'

const LARK_APP_TOKEN = 'S8XXb8PT2a82ouslzQWjBaYap2g'
const LARK_TABLE_ID  = 'tblYU2qhtVqzMnEF'
const DD_PROJECT_ID  = '369ca28c-12a2-4dcd-856d-582b9b230766'
const MS_PER_YEAR    = 365 * 24 * 60 * 60 * 1000

// ── Rate limiter ──────────────────────────────────────────────────────────────

const rlMap = new Map<string, number[]>()
const RL_WINDOW_MS = 60 * 60 * 1000
const RL_LIMIT = 5

function isRateLimited(ip: string): boolean {
  const now = Date.now()
  const timestamps = rlMap.get(ip) ?? []
  const recent = timestamps.filter(t => now - t < RL_WINDOW_MS)
  if (recent.length >= RL_LIMIT) return true
  recent.push(now)
  rlMap.set(ip, recent)
  return false
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function normalizePhone(raw: string): string {
  let digits = raw.replace(/\D/g, '')
  if (digits.startsWith('0')) digits = digits.slice(1)
  if (!digits.startsWith('60')) digits = '60' + digits
  return digits
}

function getMembershipYear(vipSince: string, now: Date): number {
  const since = new Date(vipSince)
  return Math.floor((now.getTime() - since.getTime()) / MS_PER_YEAR) + 1
}

function isInCurrentMembershipYear(vipSince: string, claimedAt: string, now: Date): boolean {
  const since       = new Date(vipSince)
  const claimed     = new Date(claimedAt)
  const elapsed     = Math.floor((now.getTime() - since.getTime()) / MS_PER_YEAR)
  const yearStart   = new Date(since.getTime() + elapsed * MS_PER_YEAR)
  const yearEnd     = new Date(yearStart.getTime() + MS_PER_YEAR)
  return claimed >= yearStart && claimed < yearEnd
}

function getNextClaimDate(vipSince: string, now: Date): string {
  const since    = new Date(vipSince)
  const elapsed  = Math.floor((now.getTime() - since.getTime()) / MS_PER_YEAR)
  const nextStart = new Date(since.getTime() + (elapsed + 1) * MS_PER_YEAR)
  return nextStart.toISOString().split('T')[0]
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

  let body: { phone?: string; claimed_by?: string }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 })
  }

  if (!body.phone) {
    return NextResponse.json({ error: 'Phone is required' }, { status: 400 })
  }

  const phone = normalizePhone(body.phone)
  if (phone.length < 10) {
    return NextResponse.json({ error: 'Invalid phone number' }, { status: 400 })
  }

  const claimedBy = body.claimed_by?.trim() || 'CS'
  const supabase  = createAdminClient()
  const now       = new Date()

  // Fetch customer
  const { data: customer } = await supabase
    .from('customers')
    .select('id, name, date_of_birth, birthday_gift_claimed_at, birthday_gift_claim_year, vip_member_number')
    .eq('phone', phone)
    .maybeSingle()

  // Fetch earliest is_vip order for DD — defines vipSince
  const { data: vipOrderRows } = await supabase
    .from('orders')
    .select('order_date')
    .eq('phone', phone)
    .eq('is_vip', true)
    .eq('project_id', DD_PROJECT_ID)
    .order('order_date', { ascending: true })
    .limit(1)

  const vipSince = vipOrderRows?.[0]?.order_date as string | undefined

  if (!vipSince) {
    return NextResponse.json({ error: 'Customer is not a VIP' }, { status: 400 })
  }

  const membershipYear = getMembershipYear(vipSince, now)
  const claimedAt      = customer?.birthday_gift_claimed_at as string | null | undefined

  // Block if already claimed in the current membership year
  if (claimedAt && isInCurrentMembershipYear(vipSince, claimedAt, now)) {
    return NextResponse.json(
      { error: `Already claimed for membership year ${membershipYear}`, alreadyClaimed: true, membershipYear },
      { status: 400 },
    )
  }

  const customerName   = customer?.name ?? phone
  const dob            = customer?.date_of_birth   as string | null | undefined
  const memberNumber   = customer?.vip_member_number as string | null | undefined
  const claimTimestamp = now.toISOString()

  // Update Supabase customers table
  const { error: updateError } = await supabase
    .from('customers')
    .upsert(
      { phone, name: customerName, birthday_gift_claimed_at: claimTimestamp, birthday_gift_claim_year: membershipYear },
      { onConflict: 'phone', ignoreDuplicates: false },
    )

  if (updateError) {
    return NextResponse.json({ error: 'Failed to record claim' }, { status: 500 })
  }

  // Write to Lark Base — non-blocking, log error but don't fail the response
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
            fldiqoVAtA: now.getTime(),
            fld5XXINtY: membershipYear,
            fldJqQFoHw: claimedBy,
            fldOCJ0Eb4: new Date(vipSince).getTime(),
            fldBHOanbe: memberNumber ?? '',
          },
        }),
      },
    )
    if (larkRes.code !== 0) {
      console.error('[claim-birthday] Lark write error:', larkRes.code, larkRes.msg)
    }
  } catch (e) {
    console.error('[claim-birthday] Lark write failed:', e)
  }

  return NextResponse.json({
    success:       true,
    claimedAt:     claimTimestamp,
    membershipYear,
    claimedBy,
    nextClaimDate: getNextClaimDate(vipSince, now),
  })
}
