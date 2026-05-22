/**
 * Core Lark → Supabase one-way sync logic.
 *
 * Lark is the source of truth. Supabase orders table is the destination.
 * Only records with source = 'lark_sync' are ever created/updated here.
 * Manually added BizOS orders (no lark_record_id) are never touched.
 */

import { fetchLarkRecords } from './lark'
import { createAdminClient } from './supabase/admin'
import {
  extractText,
  extractNumber,
  extractPhone,
  extractSingleSelect,
  extractMultiSelect,
  extractDateTime,
  extractFormula,
  extractLinkedRecord,
} from './lark-field-extract'

// DD 2026 daily order table
const DD_TABLE_ID = 'tblpMwKyxbddnXNG'

// Lark field IDs (from spec)
const FIELD = {
  date:           'fldS85O2fR',
  name:           'fldfVdX3Rv',
  phone:          'fldGS46T1h',
  channel:        'fldlP02pbw',
  priceDomain:    'fldBhlMQsD',
  totalPrice:     'fldZvUbnpA',
  manualNR:       'fldaHoBteg',
  autoNR:         'fldm7BbNwn',
  remark:         'fldsawEYFf',
  paymentMethod:  'fldo8igxMK',
  postcode:       'fldbAVKxpo',
  orderNoCopy:    'fldKzQUoBh',
  purchaseReason: 'fldheEoial',
  package:        'fldGbvjmB2',
} as const

export interface SyncResult {
  synced: number
  skipped: number
  errors: string[]
}

export async function runLarkSync(): Promise<SyncResult> {
  const records = await fetchLarkRecords(DD_TABLE_ID)
  const supabase = createAdminClient()

  let synced = 0
  let skipped = 0
  const errors: string[] = []

  for (const record of records) {
    try {
      const f = record.fields

      // Skip records with no date — cannot insert without order_date (NOT NULL)
      const orderDate = extractDateTime(f[FIELD.date])
      if (!orderDate) {
        skipped++
        continue
      }

      // total_price: prefer Price Domain (direct entry), fallback to Total Price formula
      const priceDomain   = extractNumber(f[FIELD.priceDomain])
      const priceFormula  = extractFormula(f[FIELD.totalPrice], 'number')
      const totalPrice    = priceDomain ?? (typeof priceFormula === 'number' ? priceFormula : 0)

      // order_type: prefer Manual N/R (single select), fallback to AUTO N/R formula
      const manualNR  = extractSingleSelect(f[FIELD.manualNR])
      const autoNR    = extractFormula(f[FIELD.autoNR], 'text')
      const orderType = manualNR ?? (typeof autoNR === 'string' ? autoNR : null)

      // package_name comes from linked record
      const packageName = extractLinkedRecord(f[FIELD.package])

      // order_number from formula field
      const rawOrderNo  = extractFormula(f[FIELD.orderNoCopy], 'text')
      const orderNumber = typeof rawOrderNo === 'string' ? rawOrderNo : null

      const row = {
        lark_record_id:   record.record_id,
        source:           'lark_sync',
        brand:            'DD',
        order_date:       orderDate,
        customer_name:    extractText(f[FIELD.name]),
        phone:            extractPhone(f[FIELD.phone]),
        channel:          extractSingleSelect(f[FIELD.channel]),
        total_price:      totalPrice,
        order_type:       orderType,
        remark:           extractText(f[FIELD.remark]),
        payment_method_1: extractSingleSelect(f[FIELD.paymentMethod]),
        postcode:         extractText(f[FIELD.postcode]),
        order_number:     orderNumber,
        purchase_reason:  extractMultiSelect(f[FIELD.purchaseReason]),
        package_name:     packageName,
        // product_name is NOT NULL in schema; use package_name as meaningful fallback
        product_name:     packageName ?? 'DD Order',
      }

      const { error } = await supabase
        .from('orders')
        .upsert(row, { onConflict: 'lark_record_id' })

      if (error) {
        errors.push(`[${record.record_id}] ${error.message}`)
      } else {
        synced++
      }
    } catch (e: any) {
      errors.push(`[${record.record_id}] ${e?.message ?? String(e)}`)
    }
  }

  return { synced, skipped, errors }
}
