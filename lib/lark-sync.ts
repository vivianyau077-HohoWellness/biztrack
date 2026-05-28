import { fetchLarkRecords } from './lark'
import { createAdminClient } from './supabase/admin'

const TABLES = {
  DD:   { appToken: 'S8XXb8PT2a82ouslzQWjBaYap2g', tableId: 'tblpMwKyxbddnXNG', projectId: '369ca28c-12a2-4dcd-856d-582b9b230766' },
  FIOR: { appToken: 'P5UtbJgkvaZJ73sRVm8ju1S8p6e', tableId: 'tbl0P5GOFGSbdpkZ', projectId: 'bf582bd7-5e8c-4425-9d90-cc7fb7f862c3' },
  Juji: { appToken: 'QV2vbeAyIaDiu2skeFojbNhspnh', tableId: 'tblIb0g8xEeRGsbe', projectId: 'a4787a40-65fc-4e57-81d3-7f604239def9' },
  KHH:  { appToken: 'Aj8PbXTthaPPbHszkkhjSvvwpf6', tableId: 'tbllQYz92DPQ4nBU', projectId: 'dfc62089-eb3f-4c95-b270-cdf9b3247130' },
  NE:   { appToken: 'Q50NbFCftaDPTgs6sgNjzeNrpNh', tableId: 'tblCgCKSZ3zALx6t', projectId: 'cf90720d-1fc4-4015-ae2b-416d624757c6' },
} as const

export interface SyncResult {
  synced: number
  skipped: number
  errors: string[]
}

function getText(val: unknown): string | null {
  if (!val) return null
  if (typeof val === 'string') return val
  if (Array.isArray(val)) {
    return val.map((v: any) => v?.text ?? v?.value ?? String(v)).join('') || null
  }
  return null
}

function getNumber(val: unknown): number | null {
  if (val == null) return null
  const n = Number(val)
  return isNaN(n) ? null : n
}

function getDate(val: unknown): string | null {
  if (val == null) return null
  const ms = typeof val === 'number' ? val : Number(val)
  if (isNaN(ms)) return null
  return new Date(ms).toISOString().split('T')[0]
}

function getSingleSelect(val: unknown): string | null {
  if (!val) return null
  if (typeof val === 'string') return val
  if (Array.isArray(val) && val.length > 0) {
    const first = val[0]
    if (typeof first === 'string') return first
    if (first?.value) return first.value
    if (first?.text) return first.text
  }
  return null
}

function getMultiSelect(val: unknown): string | null {
  if (!val) return null
  if (Array.isArray(val)) {
    return val.map((v: any) => v?.value ?? v?.text ?? v).filter(Boolean).join(', ') || null
  }
  return null
}

function getLinkedText(val: unknown): string | null {
  if (!val) return null
  if (Array.isArray(val) && val.length > 0) {
    const first = val[0]
    if (first?.text) return first.text
    if (first?.text_arr?.[0]) return first.text_arr[0]
  }
  return null
}

function getFormulaText(val: unknown): string | null {
  if (!val) return null
  if (typeof val === 'string') return val
  if (Array.isArray(val) && val.length > 0) {
    const first = val[0]
    if (first?.text) return first.text
  }
  return null
}

async function findOrCreateCustomer(
  supabase: ReturnType<typeof createAdminClient>,
  phone: string | null,
  name: string | null
): Promise<string | null> {
  if (!phone) return null

  const { data: existing } = await supabase
    .from('customers')
    .select('id')
    .eq('phone', phone)
    .single()

  if (existing) return existing.id

  const { data: newCustomer, error } = await supabase
    .from('customers')
    .insert({ phone, name: name || 'Lark Customer' })
    .select('id')
    .single()

  if (error) {
    console.error('[lark-sync] Failed to create customer:', error)
    return null
  }

  return newCustomer.id
}

async function syncBrand(brand: keyof typeof TABLES): Promise<SyncResult> {
  const { appToken, tableId, projectId } = TABLES[brand]
  const supabase = createAdminClient()
  const stateKey = `lark_${brand}`

  // Read last sync time
  const { data: state } = await supabase
    .from('sync_state')
    .select('last_synced_at')
    .eq('id', stateKey)
    .single()

  const lastSyncedAt = state?.last_synced_at ? new Date(state.last_synced_at).getTime() : undefined
  const syncStartedAt = new Date().toISOString()

  const records = await fetchLarkRecords(tableId, appToken, lastSyncedAt)
  console.log(`[lark-sync] ${brand}: fetched ${records.length} records${lastSyncedAt ? ' (incremental)' : ' (full)'}`)

  let synced = 0
  let skipped = 0
  const errors: string[] = []

  for (const record of records) {
    try {
      const f = record.fields as Record<string, unknown>

      const orderDate = getDate(f['Date'])
      if (!orderDate) {
        skipped++
        continue
      }

      const phone = typeof f['Phone no'] === 'string'
        ? f['Phone no'] as string
        : getNumber(f['Phone no'])?.toString() ?? null

      const customerName = getText(f['Name'])
      const customerId = await findOrCreateCustomer(supabase, phone, customerName)

      const priceDomain = getNumber(f['Price Domain'])
      const totalPriceRaw = getNumber(f['Total Price'])
      const totalPrice = priceDomain ?? totalPriceRaw ?? 0

      const manualNR = typeof f['Manual N/R'] === 'string' ? f['Manual N/R'] as string : null
      const autoNR = getSingleSelect(f['AUTO N/R'])
      const orderType = manualNR ?? autoNR

      const packageName = getLinkedText(f['Package'])
      const orderNumber = getFormulaText(f['Order No Copy'])

      const row = {
        lark_record_id:   record.record_id,
        source:           'lark_sync',
        project_id:       projectId,
        customer_id:      customerId,
        order_date:       orderDate,
        customer_name:    customerName,
        phone:            phone,
        channel:          typeof f['Channel'] === 'string' ? f['Channel'] as string : getSingleSelect(f['Channel']),
        total_price:      totalPrice,
        order_type:       orderType,
        remark:           getText(f['Remark']),
        payment_method_1: getSingleSelect(f['Payment method']),
        postcode:         getText(f['Postcode']),
        order_number:     orderNumber,
        purchase_reason:  getMultiSelect(f['Purchase reason']),
        package_name:     packageName,
        product_name:     packageName ?? `${brand} Order`,
      }

      const { error } = await supabase
        .from('orders')
        .upsert(row, { onConflict: 'lark_record_id' })

      if (error) {
        errors.push(`[${brand}:${record.record_id}] ${error.message}`)
      } else {
        synced++
      }
    } catch (e: any) {
      errors.push(`[${brand}:${record.record_id}] ${e?.message ?? String(e)}`)
    }
  }

  // Update sync state with the timestamp captured before fetching
  await supabase
    .from('sync_state')
    .update({ last_synced_at: syncStartedAt, last_sync_count: synced, updated_at: new Date().toISOString() })
    .eq('id', stateKey)

  return { synced, skipped, errors }
}

export async function runLarkSync(): Promise<SyncResult> {
  const results = await Promise.all([
    syncBrand('DD'),
    syncBrand('FIOR'),
    syncBrand('Juji'),
    syncBrand('KHH'),
    syncBrand('NE'),
  ])

  return results.reduce(
    (total, r) => ({
      synced: total.synced + r.synced,
      skipped: total.skipped + r.skipped,
      errors: [...total.errors, ...r.errors],
    }),
    { synced: 0, skipped: 0, errors: [] }
  )
}
