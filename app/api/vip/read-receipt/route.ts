import { NextResponse } from 'next/server'
import { larkFetch, getTenantAccessToken } from '@/lib/lark'

const LARK_APP_TOKEN = 'S8XXb8PT2a82ouslzQWjBaYap2g'
const LARK_TABLE_ID = 'tblYU2qhtVqzMnEF'

const ipMap = new Map<string, { count: number; reset: number }>()
function checkRateLimit(ip: string, max: number): boolean {
  const now = Date.now()
  const entry = ipMap.get(ip)
  if (!entry || now > entry.reset) {
    ipMap.set(ip, { count: 1, reset: now + 3600000 })
    return true
  }
  if (entry.count >= max) return false
  entry.count++
  return true
}

function extractReceiptNumber(text: string): string | null {
  const patterns = [
    // Specific format like 1656-01-1028218 (NNNN-NN-NNNNNNN)
    /\b(\d{4}-\d{2}-\d{6,})\b/,
    // Receipt/Invoice labels
    /(?:receipt\s*no\.?|invoice\s*no\.?|OR\s*no\.?)[:\s#]*([A-Z0-9\-\/]+)/i,
    /\b(INV[-\/]?\d{4,})\b/i,
    /\b(REC[-\/]?\d{4,})\b/i,
  ]
  for (const pattern of patterns) {
    const match = text.match(pattern)
    if (match) return match[1].trim()
  }
  return null
}

function extractDate(text: string): string | null {
  // Look for date near "Date" label first
  const dateLabel = text.match(/Date\s*[:\s]*([\d\/\-:]+\s*(?:AM|PM)?)/i)
  if (dateLabel) {
    const raw = dateLabel[1].trim()
    // Format: 29/05/2026
    const m1 = raw.match(/(\d{1,2})[\/](\d{1,2})[\/](\d{4})/)
    if (m1) return `${m1[3]}-${m1[2].padStart(2,'0')}-${m1[1].padStart(2,'0')}`
  }
  // Fallback: find any DD/MM/YYYY
  const m2 = text.match(/(\d{1,2})[\/](\d{1,2})[\/](\d{4})/)
  if (m2) return `${m2[3]}-${m2[2].padStart(2,'0')}-${m2[1].padStart(2,'0')}`
  // YYYY-MM-DD
  const m3 = text.match(/(\d{4})-(\d{2})-(\d{2})/)
  if (m3) return `${m3[1]}-${m3[2]}-${m3[3]}`
  return null
}

function extractAmount(text: string): number | null {
  // Look for Nett Total first (most reliable)
  const nett = text.match(/Nett\s*Total[\s\S]{0,20}?(\d+\.\d{2})/i)
  if (nett) {
    const num = parseFloat(nett[1])
    if (!isNaN(num) && num > 0) return num
  }
  // Gross Total
  const gross = text.match(/Gross\s*Total[\s\S]{0,20}?(\d+\.\d{2})/i)
  if (gross) {
    const num = parseFloat(gross[1])
    if (!isNaN(num) && num > 0) return num
  }
  // Total Amount
  const total = text.match(/Total\s*Amount[:\s]*(\d+\.\d{2})/i)
  if (total) {
    const num = parseFloat(total[1])
    if (!isNaN(num) && num > 0) return num
  }
  return null
}

function extractSupplier(text: string): string | null {
  const lines = text.split('\n').map(l => l.trim()).filter(l => l.length > 3)
  for (const line of lines.slice(0, 5)) {
    if (/^[A-Z]/.test(line) && !/^(date|time|cashier|receipt|invoice|total|tax)/i.test(line)) {
      return line
    }
  }
  return null
}

export async function POST(req: Request) {
  const ip = req.headers.get('x-forwarded-for') ?? 'unknown'
  if (!checkRateLimit(ip, 10)) {
    return NextResponse.json({ error: 'Rate limit exceeded' }, { status: 429 })
  }

  if (!process.env.OCR_SPACE_API_KEY) {
    return NextResponse.json({ error: 'OCR_SPACE_API_KEY not configured' }, { status: 500 })
  }

  try {
    const formData = await req.formData()
    const file = formData.get('image') as File | null
    if (!file) {
      return NextResponse.json({ error: 'No image provided' }, { status: 400 })
    }

    const arrayBuffer = await file.arrayBuffer()
    const base64 = Buffer.from(arrayBuffer).toString('base64')
    const mimeType = file.type || 'image/jpeg'

    // Call OCR.space API
    const ocrForm = new FormData()
    ocrForm.append('base64Image', `data:${mimeType};base64,${base64}`)
    ocrForm.append('language', 'eng')
    ocrForm.append('isOverlayRequired', 'false')
    ocrForm.append('detectOrientation', 'true')
    ocrForm.append('scale', 'true')
    ocrForm.append('OCREngine', '2')

    const ocrRes = await fetch('https://api.ocr.space/parse/image', {
      method: 'POST',
      headers: { 'apikey': process.env.OCR_SPACE_API_KEY! },
      body: ocrForm,
    })

    const ocrData = await ocrRes.json()
    console.log('[read-receipt] OCR response:', JSON.stringify(ocrData, null, 2))

    const parsedText = ocrData?.ParsedResults?.[0]?.ParsedText ?? ''
    console.log('[read-receipt] Extracted text:', parsedText)

    if (!parsedText) {
      return NextResponse.json({
        receipt_number: null, receipt_date: null,
        receipt_amount: null, supplier_name: null,
        confidence: 0, duplicate: false, ai_failed: true,
      })
    }

    const receiptNumber = extractReceiptNumber(parsedText)
    const receiptDate = extractDate(parsedText)
    const receiptAmount = extractAmount(parsedText)
    const supplierName = extractSupplier(parsedText)

    const fieldsFound = [receiptNumber, receiptDate, receiptAmount].filter(Boolean).length
    const confidence = fieldsFound >= 3 ? 0.9 : fieldsFound >= 2 ? 0.6 : 0.3

    let duplicate = false
    if (receiptNumber) {
      try {
        await getTenantAccessToken()
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
                  value: [receiptNumber]
                }]
              }
            })
          }
        )
        duplicate = (searchResult.data?.total ?? 0) > 0
      } catch (e) {
        console.error('[read-receipt] Lark duplicate check error:', e)
      }
    }

    return NextResponse.json({
      receipt_number: receiptNumber,
      receipt_date: receiptDate,
      receipt_amount: receiptAmount,
      supplier_name: supplierName,
      confidence,
      duplicate,
      ai_failed: false,
    })

  } catch (e: any) {
    console.error('[read-receipt] Error:', e)
    return NextResponse.json({
      receipt_number: null, receipt_date: null,
      receipt_amount: null, supplier_name: null,
      confidence: 0, duplicate: false, ai_failed: true,
    })
  }
}
