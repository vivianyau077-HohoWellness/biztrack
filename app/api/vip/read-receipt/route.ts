import { NextRequest, NextResponse } from 'next/server'
import { larkFetch } from '@/lib/lark'

export const dynamic = 'force-dynamic'

const LARK_APP_TOKEN = 'S8XXb8PT2a82ouslzQWjBaYap2g'
const LARK_TABLE_ID  = 'tblYU2qhtVqzMnEF'
const MAX_BYTES      = 5 * 1024 * 1024  // 5 MB

// ── Rate limiter ──────────────────────────────────────────────────────────────

const rlMap = new Map<string, number[]>()
const RL_WINDOW_MS = 60 * 60 * 1000
const RL_LIMIT = 10

function isRateLimited(ip: string): boolean {
  const now = Date.now()
  const timestamps = rlMap.get(ip) ?? []
  const recent = timestamps.filter(t => now - t < RL_WINDOW_MS)
  if (recent.length >= RL_LIMIT) return true
  recent.push(now)
  rlMap.set(ip, recent)
  return false
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

  let formData: FormData
  try {
    formData = await req.formData()
  } catch {
    return NextResponse.json({ error: 'Invalid form data' }, { status: 400 })
  }

  const file = formData.get('image') as File | null
  if (!file) {
    return NextResponse.json({ error: 'No image provided' }, { status: 400 })
  }

  const allowed = ['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif']
  if (!allowed.includes(file.type) && !file.name.match(/\.(jpg|jpeg|png|webp|heic|heif)$/i)) {
    return NextResponse.json({ error: 'Unsupported file type. Use JPG, PNG, WEBP, or HEIC.' }, { status: 400 })
  }

  const buffer = Buffer.from(await file.arrayBuffer())
  if (buffer.byteLength > MAX_BYTES) {
    return NextResponse.json({ error: 'File too large. Maximum 5 MB.' }, { status: 400 })
  }

  // ── Call Mindee v2 ──────────────────────────────────────────────────────────

  const mindeeForm = new FormData()
  const blob = new Blob([buffer], { type: file.type || 'image/jpeg' })
  mindeeForm.append('document', blob, file.name || 'receipt.jpg')

  let mindeeData: any = null
  try {
    const mindeeRes = await fetch(
      `https://api-v2.mindee.net/v2/predict/${process.env.MINDEE_MODEL_ID}`,
      {
        method: 'POST',
        headers: { Authorization: `Token ${process.env.MINDEE_API_KEY}` },
        body: mindeeForm,
      },
    )
    mindeeData = await mindeeRes.json()
  } catch (e) {
    console.error('[read-receipt] Mindee fetch error:', e)
    // Return empty extraction — UI falls back to manual entry
    return NextResponse.json({
      receipt_number: null, receipt_date: null, receipt_amount: null,
      supplier_name: null, confidence: 0, duplicate: false, raw: null,
      ai_failed: true,
    })
  }

  // ── Parse Mindee response ───────────────────────────────────────────────────

  const fields =
    mindeeData?.result?.fields ??
    mindeeData?.document?.inference?.prediction ??
    {}

  const receiptNumber = fields?.receipt_number?.value ??
                        fields?.invoice_number?.value ?? null
  const receiptDate   = fields?.date?.value ??
                        fields?.receipt_date?.value ?? null
  const receiptAmount = fields?.total_amount?.value ??
                        fields?.total?.value ??
                        fields?.amount?.value ?? null
  const supplierName  = fields?.supplier_name?.value ??
                        fields?.merchant_name?.value ?? null
  const confidence    = mindeeData?.result?.confidence ??
                        mindeeData?.document?.inference?.confidence ?? 0

  // ── Duplicate check in Lark ─────────────────────────────────────────────────

  let duplicate = false
  if (receiptNumber) {
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
                value: [receiptNumber],
              }],
            },
          }),
        },
      )
      duplicate = (searchResult.data?.total ?? 0) > 0
    } catch (e) {
      console.error('[read-receipt] Lark duplicate check error:', e)
    }
  }

  return NextResponse.json({
    receipt_number: receiptNumber,
    receipt_date:   receiptDate,
    receipt_amount: receiptAmount != null ? Number(receiptAmount) : null,
    supplier_name:  supplierName,
    confidence:     typeof confidence === 'number' ? confidence : 0,
    duplicate,
    raw:            mindeeData,
  })
}
