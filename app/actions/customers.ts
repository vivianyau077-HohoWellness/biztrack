'use server'

import { createAdminClient } from '@/lib/supabase/admin'

// ─── Phone Lookup ─────────────────────────────────────────────────────────────

export type PhoneLookupResult =
  | { found: false }
  | {
      found: true
      id: string
      name: string
      phone: string
      address: string | null
      customerTag: string | null
      totalOrders: number
      totalSpent: number
      firstOrderDate: string | null
      lastOrderDate: string | null
      byBrand: { brand: string; orders: number; spent: number }[]
    }

function normalizePhone(raw: string): string {
  let s = raw.replace(/[\s\-\(\)\+]/g, '')
  // Fix scientific notation from Excel
  if (/^\d+\.?\d*[eE][+\-]?\d+$/.test(s)) {
    s = Math.round(parseFloat(s)).toString()
  }
  if (s.startsWith('60')) return s
  if (s.startsWith('0'))  return '6' + s
  if (s.startsWith('1') && s.length === 9) return '60' + s
  return s
}

export async function lookupCustomerByPhone(rawPhone: string): Promise<PhoneLookupResult> {
  const phone = normalizePhone(rawPhone.trim())
  if (phone.length < 8) return { found: false }

  const sb = createAdminClient()

  const { data: customer } = await sb
    .from('customers')
    .select('id, name, phone, address, customer_tag, total_orders, total_spent, first_order_date, last_order_date')
    .eq('phone', phone)
    .maybeSingle()

  if (!customer) return { found: false }

  // Fetch all orders with project info to group by brand
  const { data: orders } = await sb
    .from('orders')
    .select('total_price, projects(name, code)')
    .eq('customer_id', customer.id)
    .neq('status', 'cancelled')

  const byBrandMap: Record<string, { orders: number; spent: number }> = {}
  for (const o of orders ?? []) {
    const brand = (o.projects as { name?: string; code?: string } | null)?.code ?? 'Other'
    if (!byBrandMap[brand]) byBrandMap[brand] = { orders: 0, spent: 0 }
    byBrandMap[brand].orders++
    byBrandMap[brand].spent += Number(o.total_price ?? 0)
  }

  return {
    found:         true,
    id:            customer.id,
    name:          customer.name,
    phone:         customer.phone,
    address:       (customer as any).address ?? null,
    customerTag:   customer.customer_tag,
    totalOrders:   Number(customer.total_orders ?? 0),
    totalSpent:    Number(customer.total_spent  ?? 0),
    firstOrderDate: customer.first_order_date,
    lastOrderDate:  customer.last_order_date,
    byBrand: Object.entries(byBrandMap)
      .sort((a, b) => b[1].spent - a[1].spent)
      .map(([brand, v]) => ({ brand, ...v })),
  }
}

// ─── Upload customer receipt ──────────────────────────────────────────────────

export async function uploadCustomerReceipt(
  customerId: string,
  formData: FormData,
): Promise<string> {
  const supabase = createAdminClient()
  const file = formData.get('file') as File | null
  if (!file) throw new Error('No file provided')

  // Ensure bucket exists
  const { data: buckets } = await supabase.storage.listBuckets()
  const bucketExists = buckets?.some(b => b.name === 'receipts')
  if (!bucketExists) {
    const { error: bucketErr } = await supabase.storage.createBucket('receipts', { public: true })
    if (bucketErr) throw new Error('Failed to create receipts bucket: ' + bucketErr.message)
  }

  // Upload file
  const timestamp = Date.now()
  const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_')
  const path = `${customerId}/${timestamp}_${safeName}`
  const buffer = new Uint8Array(await file.arrayBuffer())

  const { error: uploadErr } = await supabase.storage
    .from('receipts')
    .upload(path, buffer, { contentType: file.type, upsert: true })

  if (uploadErr) throw new Error('Upload failed: ' + uploadErr.message)

  // Get public URL
  const { data: { publicUrl } } = supabase.storage.from('receipts').getPublicUrl(path)

  // Update customer record
  const { error: updateErr } = await supabase
    .from('customers')
    .update({ receipt_url: publicUrl, receipt_uploaded_at: new Date().toISOString() })
    .eq('id', customerId)

  if (updateErr) throw new Error('Failed to update customer: ' + updateErr.message)

  return publicUrl
}

// ─── Set customer receipt URL (from pasted link) ─────────────────────────────

export async function setCustomerReceiptUrl(
  customerId: string,
  url: string,
): Promise<void> {
  const supabase = createAdminClient()
  const { error } = await supabase
    .from('customers')
    .update({ receipt_url: url, receipt_uploaded_at: new Date().toISOString() })
    .eq('id', customerId)
  if (error) throw new Error('Failed to update customer: ' + error.message)
}

// ─── Update customer name ─────────────────────────────────────────────────────

export async function updateCustomerName(
  customerId: string,
  name: string,
): Promise<void> {
  const supabase = createAdminClient()
  const { error } = await supabase
    .from('customers')
    .update({ name })
    .eq('id', customerId)
  if (error) throw new Error('Failed to update customer name: ' + error.message)
}

// ─── Update customer phone ────────────────────────────────────────────────────

export async function updateCustomerPhone(
  customerId: string,
  phone: string,
): Promise<void> {
  const supabase = createAdminClient()
  const { error } = await supabase
    .from('customers')
    .update({ phone: phone || null })
    .eq('id', customerId)
  if (error) throw new Error('Failed to update customer phone: ' + error.message)
}

// ─── Update customer address ──────────────────────────────────────────────────

export async function updateCustomerAddress(
  customerId: string,
  address: string,
): Promise<void> {
  const supabase = createAdminClient()
  const { error } = await supabase
    .from('customers')
    .update({ address: address || null })
    .eq('id', customerId)
  if (error) throw new Error('Failed to update customer address: ' + error.message)
}

// ─── Remove customer receipt ──────────────────────────────────────────────────

export async function removeCustomerReceipt(
  customerId: string,
  filePath: string,
): Promise<void> {
  const supabase = createAdminClient()

  // Delete from storage (best-effort — don't fail if file is already gone)
  if (filePath) {
    await supabase.storage.from('receipts').remove([filePath])
  }

  // Clear the customer record
  const { error } = await supabase
    .from('customers')
    .update({ receipt_url: null, receipt_uploaded_at: null })
    .eq('id', customerId)

  if (error) throw new Error('Failed to update customer: ' + error.message)
}
