'use server'

import { createAdminClient } from '@/lib/supabase/admin'
import { createClient } from '@/lib/supabase/server'
import type {
  OrderFilters, PaginatedResult, Order,
  CustomerWithStats, DashboardKPIs, CustomerStatus,
  PackageAttributeSchema, ProjectPnL, AttributeType,
} from '@/lib/types'

// ─────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────

function getCustomerStatus(count: number, last: string | null): CustomerStatus {
  if (!last || count === 0) return 'Churned'
  const days = Math.floor((Date.now() - new Date(last).getTime()) / 86400000)
  if (count >= 2 && days <= 90) return 'Active'
  if (count === 1 && days <= 90) return 'New'
  if (days <= 180) return 'At Risk'
  if (days <= 365) return 'Lapsed'
  return 'Churned'
}

function plain<T>(v: T): T {
  return JSON.parse(JSON.stringify(v))
}

// ─────────────────────────────────────────────
// READ — Projects
// ─────────────────────────────────────────────

export async function fetchProjects() {
  const sb = createAdminClient()
  const { data, error } = await sb.from('projects').select('*').order('name')
  if (error) throw new Error(error.message)
  return plain(data ?? [])
}

export async function fetchProject(id: string) {
  const sb = createAdminClient()
  const { data, error } = await sb.from('projects').select('*').eq('id', id).single()
  if (error) throw new Error(error.message)
  return plain(data)
}

export async function fetchProjectSales(): Promise<Record<string, number>> {
  const sb = createAdminClient()
  const { data, error } = await sb
    .from('orders').select('project_id, total_price').neq('status', 'cancelled')
  if (error) { console.error(error.message); return {} }
  const map: Record<string, number> = {}
  ;(plain(data ?? []) as { project_id: string | null; total_price: string }[])
    .forEach(o => {
      if (o.project_id) map[o.project_id] = (map[o.project_id] ?? 0) + Number(o.total_price)
    })
  return map
}

// ─────────────────────────────────────────────
// WRITE — Payment confirmation
// ─────────────────────────────────────────────

export async function confirmPayment(orderId: string) {
  const sb = createAdminClient()
  const { error } = await sb
    .from('orders')
    .update({ payment_status: 'Settled', settled_at: new Date().toISOString() })
    .eq('id', orderId)
  if (error) throw new Error(error.message)
}

// ─────────────────────────────────────────────
// READ — Products & Packages
// ─────────────────────────────────────────────

export async function fetchProducts(projectId: string) {
  const sb = createAdminClient()
  const { data, error } = await sb
    .from('products').select('*').eq('project_id', projectId).order('name')
  if (error) throw new Error(error.message)
  return plain(data ?? [])
}

export async function fetchPackages(projectId: string) {
  const sb = createAdminClient()
  const { data, error } = await sb
    .from('packages').select('*').eq('project_id', projectId).eq('is_active', true).order('sort_order').order('name')
  if (error) throw new Error(error.message)
  return plain(data ?? [])
}

// ─────────────────────────────────────────────
// READ / WRITE — Package Attribute Schema
// ─────────────────────────────────────────────

export async function fetchAttributeSchema(projectId: string): Promise<PackageAttributeSchema[]> {
  const sb = createAdminClient()
  const { data, error } = await sb
    .from('package_attributes_schema')
    .select('*')
    .eq('project_id', projectId)
    .order('sort_order')
    .order('created_at')
  if (error) throw new Error(error.message)
  return plain(data ?? [])
}

export async function createAttributeSchema(payload: {
  project_id: string
  attribute_key: string
  attribute_label: string
  attribute_type: AttributeType
  options: string[]
  is_required: boolean
  sort_order?: number
}): Promise<string> {
  const sb = createAdminClient()
  const { data, error } = await sb.from('package_attributes_schema').insert({
    project_id: payload.project_id,
    attribute_key: payload.attribute_key.toLowerCase().replace(/\s+/g, '_'),
    attribute_label: payload.attribute_label,
    attribute_type: payload.attribute_type,
    options: payload.options,
    is_required: payload.is_required,
    sort_order: payload.sort_order ?? 0,
  }).select('id').single()
  if (error) throw new Error(error.message)
  return data.id as string
}

export async function updateAttributeSchema(id: string, payload: {
  attribute_label?: string
  attribute_type?: AttributeType
  options?: string[]
  is_required?: boolean
  sort_order?: number
}) {
  const sb = createAdminClient()
  const { error } = await sb.from('package_attributes_schema').update(payload).eq('id', id)
  if (error) throw new Error(error.message)
}

export async function deleteAttributeSchema(id: string) {
  const sb = createAdminClient()
  const { error } = await sb.from('package_attributes_schema').delete().eq('id', id)
  if (error) throw new Error(error.message)
}

// ─────────────────────────────────────────────
// READ — Orders (paginated + filtered)
// ─────────────────────────────────────────────

export async function fetchOrders(filters: OrderFilters = {}): Promise<PaginatedResult<Order>> {
  const sb = createAdminClient()
  const { status, projectId, dateFrom, dateTo, search, batchId, incomplete, page = 1, pageSize = 50 } = filters

  let q = sb
    .from('orders')
    .select('*, customers(id, name, phone, address, receipt_url), projects(id, name, code), packages(id, name, code)', { count: 'exact' })
    .order('order_date', { ascending: false })
    .order('created_at', { ascending: false })

  if (status)    q = q.eq('status', status)
  if (projectId) q = q.eq('project_id', projectId)
  // When filtering by batch, skip date range so all orders in the batch are visible
  if (batchId) {
    q = q.eq('import_batch_id', batchId)
  } else {
    if (dateFrom) q = q.gte('order_date', dateFrom)
    if (dateTo)   q = q.lte('order_date', dateTo)
  }
  if (search)    q = q.or(`tracking_number.ilike.%${search}%,customers.name.ilike.%${search}%,customers.phone.ilike.%${search}%`)
  if (incomplete) q = q.or('purchase_reason.is.null,purchase_reason.eq.,is_new_customer.is.null,customers.receipt_url.is.null')

  const from = (page - 1) * pageSize
  q = q.range(from, from + pageSize - 1)

  const { data, error, count } = await q
  if (error) throw new Error(error.message)
  return { data: plain(data ?? []) as Order[], count: count ?? 0, page, pageSize }
}

// ─────────────────────────────────────────────
// READ — Customers (with computed stats)
// ─────────────────────────────────────────────

export async function fetchCustomers(): Promise<CustomerWithStats[]> {
  const sb = createAdminClient()
  const { data, error } = await sb
    .from('customers')
    .select('*, orders(total_price, order_date, status, project_id)')
    .order('created_at', { ascending: false })
  if (error) throw new Error(error.message)

  return (plain(data ?? []) as any[]).map((c: any) => {
    const valid = (c.orders ?? []).filter((o: any) => o.status !== 'cancelled')
    const totalSpend = valid.reduce((s: number, o: any) => s + Number(o.total_price), 0)
    const sorted = [...valid].sort(
      (a: any, b: any) => new Date(a.order_date).getTime() - new Date(b.order_date).getTime()
    )
    const first = sorted[0]?.order_date ?? null
    const last  = sorted[sorted.length - 1]?.order_date ?? null
    return {
      ...c,
      order_count: valid.length,
      total_spend: totalSpend,
      avg_order_value: valid.length > 0 ? totalSpend / valid.length : 0,
      first_order_date: first,
      last_order_date: last,
      project_ids: Array.from(new Set(valid.map((o: any) => o.project_id).filter(Boolean))),
      status: getCustomerStatus(valid.length, last),
    }
  })
}

// ─────────────────────────────────────────────
// READ — Dashboard KPIs
// ─────────────────────────────────────────────

export async function fetchDashboardKPIs(): Promise<DashboardKPIs> {
  const sb = createAdminClient()
  const now = new Date()
  const from = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().split('T')[0]
  const to   = new Date(now.getFullYear(), now.getMonth() + 1, 0).toISOString().split('T')[0]

  const [{ data: orders }, { count: newCust }] = await Promise.all([
    sb.from('orders').select('total_price, is_new_customer')
      .gte('order_date', from).lte('order_date', to).neq('status', 'cancelled'),
    sb.from('customers').select('id', { count: 'exact', head: true })
      .gte('created_at', from + 'T00:00:00').lte('created_at', to + 'T23:59:59'),
  ])

  const safeOrders = plain(orders ?? []) as { total_price: string; is_new_customer: boolean }[]
  const totalRevenue  = safeOrders.reduce((s, o) => s + Number(o.total_price), 0)
  const totalOrders   = safeOrders.length
  const repeatOrders  = safeOrders.filter(o => o.is_new_customer === false).length
  const avgOrderValue = totalOrders > 0 ? totalRevenue / totalOrders : 0
  const netProfit     = totalRevenue * 0.92

  return { totalRevenue, totalOrders, newCustomers: newCust ?? 0, netProfit, repeatOrders, avgOrderValue }
}

// ─────────────────────────────────────────────
// READ — Customer by phone
// ─────────────────────────────────────────────

export async function fetchCustomerByPhone(phone: string) {
  const sb = createAdminClient()
  const { data } = await sb.from('customers').select('*').eq('phone', phone).maybeSingle()
  return data ? plain(data) : null
}

// ─────────────────────────────────────────────
// CALCULATION ENGINE — Project PnL
// ─────────────────────────────────────────────

export async function calculateProjectPnL(
  projectId: string,
  dateFrom: string,
  dateTo: string
): Promise<ProjectPnL> {
  const sb = createAdminClient()

  // Fetch orders with package info
  const { data: rawOrders, error: ordersErr } = await sb
    .from('orders')
    .select('id, total_price, package_id, packages(id, name, code)')
    .eq('project_id', projectId)
    .gte('order_date', dateFrom)
    .lte('order_date', dateTo)
    .neq('status', 'cancelled')

  if (ordersErr) throw new Error(ordersErr.message)
  const orders = plain(rawOrders ?? []) as unknown as {
    id: string
    total_price: string
    package_id: string | null
    packages: { id: string; name: string; code: string | null } | null
  }[]

  const total_revenue = orders.reduce((s, o) => s + Number(o.total_price), 0)
  const total_orders = orders.length
  const avg_order_value = total_orders > 0 ? total_revenue / total_orders : 0

  // Package breakdown grouped by package_id
  const pkgMap: Record<string, { package_name: string; code: string | null; units_sold: number; revenue: number }> = {}
  for (const o of orders) {
    const key = o.package_id ?? '__none__'
    if (!pkgMap[key]) {
      pkgMap[key] = {
        package_name: o.packages?.name ?? 'No Package',
        code: o.packages?.code ?? null,
        units_sold: 0,
        revenue: 0,
      }
    }
    pkgMap[key].units_sold++
    pkgMap[key].revenue += Number(o.total_price)
  }
  const package_breakdown = Object.values(pkgMap).sort((a, b) => b.revenue - a.revenue)

  // Product cost: sum (product.cost × quantity) per package, then per order
  const packageIds = Array.from(new Set(orders.map(o => o.package_id).filter(Boolean))) as string[]
  let product_cost = 0
  if (packageIds.length > 0) {
    const { data: rawItems } = await sb
      .from('package_items')
      .select('package_id, quantity, products(cost)')
      .in('package_id', packageIds)

    const items = plain(rawItems ?? []) as unknown as {
      package_id: string
      quantity: number
      products: { cost: string } | null
    }[]

    const costPerPackage: Record<string, number> = {}
    for (const item of items) {
      const c = Number(item.products?.cost ?? 0) * Number(item.quantity)
      costPerPackage[item.package_id] = (costPerPackage[item.package_id] ?? 0) + c
    }
    for (const o of orders) {
      if (o.package_id) product_cost += costPerPackage[o.package_id] ?? 0
    }
  }

  const shipping     = total_revenue * 0.05
  const platform_fee = total_revenue * 0.03
  const cost_estimate = {
    shipping,
    platform_fee,
    product_cost,
    total: shipping + platform_fee + product_cost,
  }
  const gross_profit  = total_revenue - cost_estimate.total
  const profit_margin = total_revenue > 0 ? (gross_profit / total_revenue) * 100 : 0

  return plain({ total_revenue, total_orders, avg_order_value, package_breakdown, cost_estimate, gross_profit, profit_margin })
}

// ─────────────────────────────────────────────
// WRITE — Customers
// ─────────────────────────────────────────────

export async function upsertCustomer(name: string, phone: string, address?: string | null) {
  const sb = createAdminClient()
  const { data, error } = await sb
    .from('customers')
    .upsert({ name, phone, address: address ?? null }, { onConflict: 'phone' })
    .select('id')
    .single()
  if (error) throw new Error(error.message)
  return data.id as string
}

export async function upsertCustomerByNameOnly(name: string): Promise<string> {
  const sb = createAdminClient()
  const { data: existing } = await sb
    .from('customers')
    .select('id')
    .ilike('name', name)
    .is('phone', null)
    .limit(1)
    .maybeSingle()
  if (existing) return existing.id as string

  const { data, error } = await sb
    .from('customers')
    .insert({ name, phone: null })
    .select('id')
    .single()
  if (error) throw new Error(error.message)
  return data.id as string
}

export async function bulkUpsertCustomers(rows: { name: string; phone: string; address?: string | null }[]): Promise<Record<string, string>> {
  const sb = createAdminClient()
  const map: Record<string, string> = {}

  // Separate rows with and without phone
  const withPhone    = rows.filter(r => r.phone && r.phone.trim() !== '')
  const withoutPhone = rows.filter(r => !r.phone || r.phone.trim() === '')

  // ── Customers with phone: deduplicate by phone then upsert ────────────────
  if (withPhone.length > 0) {
    const deduped = Object.values(
      Object.fromEntries(withPhone.map(r => [r.phone, r]))
    )
    const { error } = await sb
      .from('customers')
      .upsert(
        deduped.map(r => ({ name: r.name, phone: r.phone, address: r.address ?? null })),
        { onConflict: 'phone' }
      )
    if (error) throw new Error(error.message)

    // Fetch IDs in a separate SELECT — upsert with a partial unique index can
    // return incomplete data (rows that hit the conflict path may be omitted).
    const phones = deduped.map(r => r.phone)
    const { data: fetched } = await sb
      .from('customers')
      .select('id, phone')
      .in('phone', phones)
    fetched?.forEach(c => { if (c.phone) map[c.phone] = c.id })
  }

  // ── Customers without phone: find by name, else insert ───────────────────
  // Use a placeholder key so the import can still get a customer_id
  for (const r of withoutPhone) {
    const nameKey = `__noPhone__${r.name}`
    if (map[nameKey]) continue // already processed this name in this batch

    // Try to find existing customer by name (case-insensitive)
    const { data: existing } = await sb
      .from('customers')
      .select('id')
      .ilike('name', r.name)
      .is('phone', null)
      .limit(1)
      .maybeSingle()

    if (existing) {
      map[nameKey] = existing.id
    } else {
      // Insert new customer without phone
      const { data: inserted, error: insErr } = await sb
        .from('customers')
        .insert({ name: r.name, phone: null, address: r.address ?? null })
        .select('id')
        .single()
      if (!insErr && inserted) map[nameKey] = inserted.id
    }
  }

  return map
}

// ─────────────────────────────────────────────
// INVENTORY — Auto-deduct components from order
// ─────────────────────────────────────────────

export async function deductInventoryForOrder(
  packageId: string,
  orderQuantity: number = 1
): Promise<void> {
  const sb = createAdminClient()

  // Fetch package custom_attributes and project brand name
  const { data: pkg } = await sb
    .from('packages')
    .select('custom_attributes, projects(name)')
    .eq('id', packageId)
    .single()

  if (!pkg) return

  const brand = (pkg.projects as any)?.name as string | undefined
  if (!brand) return

  const attrs = (pkg.custom_attributes ?? {}) as Record<string, string>

  // Get valid component keys for this brand
  const { data: components } = await sb
    .from('component_registry')
    .select('json_key')
    .eq('brand', brand)

  if (!components?.length) return

  const validKeys = new Set(components.map((c: any) => c.json_key))
  const today = new Date().toISOString().slice(0, 10)

  const deductions = Object.entries(attrs)
    .filter(([key, val]) => validKeys.has(key) && Number(val) > 0)
    .map(([key, val]) => ({
      brand,
      component_key: key,
      type:          'Stock Out',
      quantity:      Number(val) * orderQuantity,
      date:          today,
      notes:         'Auto-deducted from order',
    }))

  if (deductions.length > 0) {
    // Best-effort — silently ignore errors so the order is never blocked
    await sb.from('inventory').insert(deductions)
  }
}

// ─────────────────────────────────────────────
// WRITE — Orders
// ─────────────────────────────────────────────

export async function createOrder(payload: {
  customer_id: string | null
  project_id: string
  package_id?: string | null
  product_name: string
  package_name?: string | null
  total_price: number
  status: string
  order_date: string
  fb_name?: string | null
  channel: string
  purchase_reason: string | null
  is_new_customer: boolean
  tracking_number?: string | null
  state?: string | null
  address?: string | null
}) {
  const sb = createAdminClient()
  const { data: inserted, error } = await sb
    .from('orders')
    .insert(payload)
    .select('id')
    .single()
  if (error) throw new Error(error.message)

  // Run processOrder to set snapshot, profit, and deduct inventory
  if (inserted?.id) {
    try {
      const { processOrder } = await import('./order-processing')
      await processOrder(inserted.id)
    } catch {
      // processOrder is best-effort — never fail the order creation
    }
  }
}

export async function bulkCreateOrders(rows: object[]) {
  const sb = createAdminClient()
  let success = 0, fail = 0
  for (let i = 0; i < rows.length; i += 100) {
    const { data, error } = await sb.from('orders').insert(rows.slice(i, i + 100)).select('id')
    if (error) fail += rows.slice(i, i + 100).length
    else success += data?.length ?? 0
  }
  return { success, fail }
}

export async function fetchExistingTrackingNumbers(trackingNumbers: string[]): Promise<string[]> {
  if (trackingNumbers.length === 0) return []
  const sb = createAdminClient()
  const { data } = await sb
    .from('orders')
    .select('tracking_number')
    .in('tracking_number', trackingNumbers)
  return (data ?? [])
    .map((o: { tracking_number: string | null }) => o.tracking_number)
    .filter((t): t is string => t !== null)
}

export async function bulkInsertOrders(
  rows: object[],
  projectId?: string | null
): Promise<{ ids: string[]; errors: string[] }> {
  const sb = createAdminClient()
  const ids: string[] = []
  const errors: string[] = []

  // Pre-fetch tracking numbers that already exist for this project so short/
  // numeric codes (e.g. DD "3120") don't collide with other brands.
  const allTracking = (rows as Array<{ tracking_number?: string | null }>)
    .map(r => r.tracking_number)
    .filter((t): t is string => !!t)

  let existingSet = new Set<string>()
  if (allTracking.length > 0) {
    let q = sb.from('orders').select('tracking_number, customer_id').in('tracking_number', allTracking)
    if (projectId) q = q.eq('project_id', projectId)
    const { data: existing } = await q
    existingSet = new Set(
      (existing ?? [])
        .map((r: { tracking_number: string; customer_id: string | null }) => r.tracking_number)
    )

    // Backfill customer_id on existing orders that are missing it.
    // This fixes orders inserted before the bulkUpsertCustomers partial-index fix.
    const nullCustomerSet = new Set(
      (existing ?? [])
        .filter((r: { tracking_number: string; customer_id: string | null }) => r.customer_id === null)
        .map((r: { tracking_number: string; customer_id: string | null }) => r.tracking_number)
    )
    if (nullCustomerSet.size > 0) {
      // Group incoming rows by customer_id so we can batch each group in one UPDATE
      const byCustomer = new Map<string, string[]>()
      for (const r of rows as Array<{ tracking_number?: string | null; customer_id?: string | null }>) {
        if (r.tracking_number && r.customer_id && nullCustomerSet.has(r.tracking_number)) {
          if (!byCustomer.has(r.customer_id)) byCustomer.set(r.customer_id, [])
          byCustomer.get(r.customer_id)!.push(r.tracking_number)
        }
      }
      for (const [cid, trackings] of Array.from(byCustomer.entries())) {
        for (let i = 0; i < trackings.length; i += 100) {
          await sb.from('orders')
            .update({ customer_id: cid })
            .in('tracking_number', trackings.slice(i, i + 100))
            .is('customer_id', null)
        }
      }
    }
  }

  const newRows = rows.filter(
    (r: any) => !r.tracking_number || !existingSet.has(r.tracking_number)
  )

  if (newRows.length === 0) return { ids: [], errors: [] }

  for (let i = 0; i < newRows.length; i += 50) {
    const batch = newRows.slice(i, i + 50)
    const { data, error } = await sb.from('orders').insert(batch).select('id')
    if (error) {
      errors.push(`Batch ${Math.floor(i / 50) + 1}: ${error.message}`)
    } else {
      data?.forEach((o: { id: string }) => ids.push(o.id))
    }
  }

  return { ids, errors }
}

// ─────────────────────────────────────────────
// Import Batch Tracking
// ─────────────────────────────────────────────

export interface ImportBatch {
  id: string
  project_id: string | null
  file_name: string | null
  total_rows: number
  success_count: number
  skipped_count: number
  error_count: number
  status: string
  imported_at: string
  completed_at: string | null
  notes: string | null
  projects?: { name: string } | null
}

export async function createImportBatch(
  projectId: string | null,
  fileName: string,
  totalRows: number
): Promise<string> {
  const sb = createAdminClient()
  const { data, error } = await sb
    .from('import_batches')
    .insert({ project_id: projectId, file_name: fileName, total_rows: totalRows, status: 'processing' })
    .select('id')
    .single()
  if (error) throw new Error(error.message)
  return data.id as string
}

export async function updateImportBatch(
  batchId: string,
  counts: { success_count: number; skipped_count: number; error_count: number },
  status: 'completed' | 'failed'
): Promise<void> {
  const sb = createAdminClient()
  const { error } = await sb
    .from('import_batches')
    .update({ ...counts, status, completed_at: new Date().toISOString() })
    .eq('id', batchId)
  if (error) throw new Error(error.message)
}

export async function fetchImportBatches(filters?: {
  projectId?: string
  dateFrom?: string
  dateTo?: string
}): Promise<ImportBatch[]> {
  const sb = createAdminClient()
  let q = sb
    .from('import_batches')
    .select('*, projects(name)')
    .order('imported_at', { ascending: false })

  if (filters?.projectId) q = q.eq('project_id', filters.projectId)
  if (filters?.dateFrom)  q = q.gte('imported_at', filters.dateFrom)
  if (filters?.dateTo)    q = q.lte('imported_at', filters.dateTo + 'T23:59:59')

  const { data, error } = await q
  if (error) throw new Error(error.message)
  return plain(data ?? []) as ImportBatch[]
}

export async function fetchBatchOrders(batchId: string): Promise<Order[]> {
  const sb = createAdminClient()
  const { data, error } = await sb
    .from('orders')
    .select('*, customers(id, name, phone, address), projects(id, name, code), packages(id, name, code)')
    .eq('import_batch_id', batchId)
    .order('created_at', { ascending: true })
  if (error) throw new Error(error.message)
  return plain(data ?? []) as Order[]
}

export async function reprocessBatchErrors(batchId: string): Promise<{
  reprocessed: number
  failed: number
}> {
  const sb = createAdminClient()
  // Fetch orders with import_status='error' in this batch
  const { data: errorOrders, error } = await sb
    .from('orders')
    .select('id')
    .eq('import_batch_id', batchId)
    .eq('import_status', 'error')
  if (error) throw new Error(error.message)

  const ids = (errorOrders ?? []).map((o: { id: string }) => o.id)
  if (ids.length === 0) return { reprocessed: 0, failed: 0 }

  const { processOrdersBatch } = await import('./order-processing')
  const result = await processOrdersBatch(ids)

  // Update orders that succeeded to import_status='success'
  if (result.processed > 0) {
    const succeededIds = ids.filter(
      (id: string) => !result.errors.some(e => e.orderId === id)
    )
    if (succeededIds.length > 0) {
      await sb
        .from('orders')
        .update({ import_status: 'success', import_error: null })
        .in('id', succeededIds)
    }
  }

  // Recalculate batch counts
  const { data: batchOrders } = await sb
    .from('orders')
    .select('import_status')
    .eq('import_batch_id', batchId)

  if (batchOrders) {
    const successCount = batchOrders.filter((o: { import_status: string | null }) => o.import_status === 'success').length
    const errorCount   = batchOrders.filter((o: { import_status: string | null }) => o.import_status === 'error').length
    const skippedCount = batchOrders.filter((o: { import_status: string | null }) => o.import_status === 'skipped').length
    await sb
      .from('import_batches')
      .update({ success_count: successCount, error_count: errorCount, skipped_count: skippedCount })
      .eq('id', batchId)
  }

  return { reprocessed: result.processed, failed: result.failed }
}

export async function fetchActivePackages(): Promise<
  Array<{ id: string; project_id: string; name: string; code: string | null }>
> {
  const sb = createAdminClient()
  const { data, error } = await sb
    .from('packages')
    .select('id, project_id, name, code')
    .eq('is_active', true)
  if (error) throw new Error(error.message)
  return plain(data ?? []) as Array<{ id: string; project_id: string; name: string; code: string | null }>
}

// ─────────────────────────────────────────────
// Import Mappings
// ─────────────────────────────────────────────

export async function fetchImportMappings(): Promise<
  Array<{ id: string; name: string; mapping: Record<string, string> }>
> {
  const sb = createAdminClient()
  const { data, error } = await sb
    .from('import_mappings')
    .select('id, name, mapping')
    .order('created_at', { ascending: false })
  if (error) throw new Error(error.message)
  return plain(data ?? []) as Array<{ id: string; name: string; mapping: Record<string, string> }>
}

export async function saveImportMapping(
  name: string,
  mapping: Record<string, string>
): Promise<void> {
  const sb = createAdminClient()
  const { error } = await sb
    .from('import_mappings')
    .insert({ name, mapping })
  if (error) throw new Error(error.message)
}

export async function updateOrderStatus(id: string, status: string) {
  const sb = createAdminClient()
  const { error } = await sb.from('orders').update({ status }).eq('id', id)
  if (error) throw new Error(error.message)
}

// ─────────────────────────────────────────────
// Auto-generate Order ID (all brands: DD, Juji, NE, FIOR, KHH)
// ─────────────────────────────────────────────

export async function generateOrderId(projectId: string): Promise<string> {
  const sb = createAdminClient()
  const { data, error } = await sb.rpc('generate_order_id', { p_project_id: projectId })
  if (error) throw new Error(`Failed to generate order ID: ${error.message}`)
  return data as string
}

export async function deleteOrder(id: string) {
  const sb = createAdminClient()
  const { error } = await sb.from('orders').delete().eq('id', id)
  if (error) throw new Error(error.message)
}

export async function updateOrder(id: string, payload: {
  order_date?: string
  tracking_number?: string | null
  project_id?: string
  package_id?: string | null
  package_name?: string | null
  total_price?: number
  channel?: string
  state?: string | null
  is_cod?: boolean
  payment_status?: string
  status?: string
  delivery_status?: string | null
  purchase_reason?: string | null
  is_new_customer?: boolean | null
}) {
  const sb = createAdminClient()
  const updates: Record<string, unknown> = { ...payload }

  // When package changes, refresh snapshot + cost_price
  if (payload.package_id) {
    const { data: pkg } = await sb
      .from('packages')
      .select('id, name, price, cost, code, custom_attributes')
      .eq('id', payload.package_id)
      .single()
    if (pkg) {
      updates.package_snapshot = { name: pkg.name, price: pkg.price, code: pkg.code, custom_attributes: pkg.custom_attributes }
      updates.cost_price = typeof pkg.cost === 'number' ? pkg.cost : 0
    }
  } else if (payload.package_id === null) {
    updates.package_snapshot = null
    updates.cost_price = 0
  }

  // Recalculate profit whenever price or package changes
  if (payload.total_price !== undefined || payload.package_id !== undefined) {
    const { data: cur } = await sb
      .from('orders')
      .select('total_price, cost_price, shipping_fee, handling_fee')
      .eq('id', id)
      .single()
    if (cur) {
      const totalPrice  = payload.total_price ?? cur.total_price ?? 0
      const costPrice   = (updates.cost_price as number | undefined) ?? cur.cost_price ?? 0
      const shippingFee = cur.shipping_fee  ?? 0
      const handlingFee = cur.handling_fee  ?? 0
      updates.profit = Number(totalPrice) - Number(costPrice) - Number(shippingFee) - Number(handlingFee)
    }
  }

  const { error } = await sb.from('orders').update(updates).eq('id', id)
  if (error) throw new Error(error.message)
}

// ─────────────────────────────────────────────
// WRITE — Products
// ─────────────────────────────────────────────

export async function createProduct(payload: {
  project_id: string; sku: string; name: string; cost: number
}) {
  const sb = createAdminClient()
  const { error } = await sb.from('products').insert(payload)
  if (error) throw new Error(error.message)
}

export async function deleteProduct(id: string) {
  const sb = createAdminClient()
  const { error } = await sb.from('products').delete().eq('id', id)
  if (error) throw new Error(error.message)
}

// ─────────────────────────────────────────────
// WRITE — Packages
// ─────────────────────────────────────────────

export async function createPackage(
  payload: {
    project_id: string
    name: string
    code?: string | null
    price: number | null
    custom_attributes?: Record<string, unknown>
  },
  items: { product_id: string; quantity: number }[]
) {
  const sb = createAdminClient()
  const { data: pkg, error } = await sb
    .from('packages')
    .insert({
      project_id: payload.project_id,
      name: payload.name,
      code: payload.code || null,
      price: payload.price,
      custom_attributes: payload.custom_attributes ?? {},
    })
    .select('id')
    .single()
  if (error) throw new Error(error.message)

  if (items.length > 0) {
    const { error: ie } = await sb.from('package_items').insert(
      items.map(i => ({ package_id: pkg.id, product_id: i.product_id, quantity: i.quantity }))
    )
    if (ie) console.error('package_items insert:', ie.message)
  }
  return pkg.id
}

export async function deletePackage(id: string) {
  const sb = createAdminClient()
  const { error } = await sb.from('packages').delete().eq('id', id)
  if (error) throw new Error(error.message)
}

export async function bulkCreatePackages(
  projectId: string,
  rows: { name: string; price: number; product1: string; product2: string; product3: string; amount: number }[],
  productMap: Record<string, string>
) {
  const sb = createAdminClient()
  let success = 0, fail = 0

  for (const row of rows) {
    const { data: pkg, error } = await sb
      .from('packages').insert({ project_id: projectId, name: row.name, price: row.price }).select('id').single()
    if (error || !pkg) { fail++; continue }

    const items = [row.product1, row.product2, row.product3]
      .filter(Boolean)
      .map(n => ({ package_id: pkg.id, product_id: productMap[n.toLowerCase()], quantity: row.amount }))
      .filter(i => i.product_id)

    if (items.length > 0) await sb.from('package_items').insert(items)
    success++
  }
  return { success, fail }
}

// ─────────────────────────────────────────────
// WRITE — Projects
// ─────────────────────────────────────────────

export async function createProject(name: string, code: string) {
  const sb = await createClient()
  const { error } = await sb.from('projects').insert({ name, code: code.toUpperCase() })
  if (error) throw new Error(error.message)
}

// ─────────────────────────────────────────────
// Projects + Packages — hook-compatible actions
// These return data shaped to match useProjects hook types
// ─────────────────────────────────────────────

const SEED_PROJECTS = [
  { name: 'FIOR', code: 'FIOR' },
  { name: 'NE',   code: 'NE' },
  { name: 'DD',   code: 'DD' },
  { name: 'KHH',  code: 'KHH' },
  { name: 'Juji', code: 'JUJI' },
]

function mapDbPackage(pkg: any) {
  const attrs = (pkg.custom_attributes ?? {}) as Record<string, unknown>
  const { notes, ...rest } = attrs
  const customValues: Record<string, string> = {}
  Object.entries(rest).forEach(([k, v]) => { customValues[k] = String(v ?? '') })
  return plain({
    id:           pkg.id,
    projectId:    pkg.project_id,
    name:         pkg.name,
    code:         pkg.code ?? '',
    price:        Number(pkg.price ?? 0),
    notes:        (notes as string) ?? '',
    product_id:   pkg.product_id ?? null,
    customValues,
    createdAt:    pkg.created_at ?? new Date().toISOString(),
  })
}

function mapDbProject(p: any) {
  return plain({
    id:        p.id,
    name:      p.name,
    code:      p.code,
    createdAt: p.created_at,
    packages:  ((p.packages ?? []) as any[])
      .filter((pkg: any) => pkg.is_active !== false)
      .sort((a: any, b: any) => a.sort_order - b.sort_order || a.name.localeCompare(b.name))
      .map(mapDbPackage),
  })
}

export async function fetchProjectsWithPackages() {
  const sb = await createClient()

  // Seed if empty
  const { count, error: countErr } = await sb
    .from('projects')
    .select('*', { count: 'exact', head: true })

  if (countErr) throw new Error(countErr.message)

  if ((count ?? 0) === 0) {
    await sb.from('projects').insert(SEED_PROJECTS)
  }

  const { data, error } = await sb
    .from('projects')
    .select('*, packages(*)')
    .order('name')

  if (error) throw new Error(error.message)

  return (data ?? []).map(mapDbProject)
}

export async function createProjectAction(name: string, code: string) {
  const sb = createAdminClient()
  const { data, error } = await sb
    .from('projects')
    .insert({ name, code: code.toUpperCase() })
    .select()
    .single()
  if (error) throw new Error(error.message)
  return plain({ id: data.id, name: data.name, code: data.code, createdAt: data.created_at, packages: [] })
}

export async function updateProjectAction(id: string, name: string, code: string) {
  const sb = createAdminClient()
  const { error } = await sb
    .from('projects')
    .update({ name, code: code.toUpperCase() })
    .eq('id', id)
  if (error) throw new Error(error.message)
}

export async function deleteProjectAction(id: string) {
  const sb = createAdminClient()
  const { error } = await sb.from('projects').delete().eq('id', id)
  if (error) throw new Error(error.message)
}

// Returns true when a Supabase error is caused by a column that doesn't exist
// (PostgreSQL error code 42703 = undefined_column).
function isColumnError(err: { code?: string; message?: string }): boolean {
  return (
    err.code === '42703' ||
    /column .+ (of relation|does not exist)/i.test(err.message ?? '') ||
    /does not exist/i.test(err.message ?? '')
  )
}

export async function createPackageAction(
  projectId: string,
  name: string,
  code: string,
  price: number,
  notes?: string,
  customValues?: Record<string, string>,
  product_id?: string,
) {
  // Admin client bypasses the packages_insert RLS policy (which requires
  // is_admin() on the user JWT — not available in all session contexts).
  const sb = createAdminClient()

  const customAttrs = { notes: notes ?? '', ...(customValues ?? {}) }
  const fullPayload = {
    project_id:        projectId,
    name,
    code:              code || null,
    price,
    custom_attributes: customAttrs,
    is_active:         true,
    sort_order:        0,
    product_id:        product_id ?? null,
  }

  // ── Attempt 1: upsert on (project_id, code) ───────────────────────────────
  // NOTE: Supabase cannot use partial indexes as upsert conflict targets
  // (the migration 006 index has WHERE code IS NOT NULL). This attempt may
  // therefore still throw a unique-constraint error for codes that already
  // exist. Attempts 2 and 3 handle that.
  console.log('[createPackageAction] attempt 1 — upsert on project_id,code:', JSON.stringify(fullPayload))

  const { data: d1, error: e1 } = await sb
    .from('packages')
    .upsert(fullPayload, { onConflict: 'project_id,code' })
    .select()
    .single()

  if (!e1) return mapDbPackage(d1)

  console.error('[createPackageAction] attempt 1 failed:', {
    message: e1.message, code: (e1 as any).code,
    details: (e1 as any).details, hint: (e1 as any).hint,
  })

  // ── Attempt 2: manual upsert by name ─────────────────────────────────────
  // Handles: partial-index upsert failures, special characters in code,
  // duplicate name conflicts. Find the row by (project_id, name); if it
  // exists update it, otherwise insert without the code field.
  if (!isColumnError(e1)) {
    console.warn('[createPackageAction] attempt 2 — find by name, then update or insert without code')

    const { data: existing } = await sb
      .from('packages')
      .select('id')
      .eq('project_id', projectId)
      .eq('name', name)
      .maybeSingle()

    if (existing) {
      // Row found — update in place
      const { data: d2u, error: e2u } = await sb
        .from('packages')
        .update({ code: code || null, price, custom_attributes: customAttrs, is_active: true })
        .eq('id', existing.id)
        .select()
        .single()

      if (!e2u) {
        console.log('[createPackageAction] attempt 2 — updated existing row by name, id:', existing.id)
        return mapDbPackage(d2u)
      }

      console.error('[createPackageAction] attempt 2 update failed:', {
        message: e2u.message, code: (e2u as any).code,
        details: (e2u as any).details, hint: (e2u as any).hint,
      })

      // Column error on update → fall back to updating only price
      if (isColumnError(e2u)) {
        const { data: d2m, error: e2m } = await sb
          .from('packages').update({ price }).eq('id', existing.id).select().single()
        if (!e2m) return mapDbPackage(d2m)
        console.error('[createPackageAction] attempt 2 minimal update failed:', e2m)
        throw new Error(e2m.message)
      }

      throw new Error(e2u.message)
    }

    // Row not found — insert without code to avoid the problematic column
    const payloadNoCode = { project_id: projectId, name, price, custom_attributes: customAttrs, is_active: true, sort_order: 0 }
    console.log('[createPackageAction] attempt 2 — insert without code:', JSON.stringify(payloadNoCode))

    const { data: d2i, error: e2i } = await sb
      .from('packages').insert(payloadNoCode).select().single()

    if (!e2i) return mapDbPackage(d2i)

    console.error('[createPackageAction] attempt 2 insert failed:', {
      message: e2i.message, code: (e2i as any).code,
      details: (e2i as any).details, hint: (e2i as any).hint,
    })

    // If this is also a column error, fall through to attempt 3
    if (!isColumnError(e2i)) throw new Error(e2i.message)
  }

  // ── Attempt 3: base schema only (migration 006 not applied) ───────────────
  // Only columns that exist in 001_initial_schema: project_id, name, price.
  console.warn('[createPackageAction] attempt 3 — base schema only (migration 006 not applied?)')

  const { data: existingBase } = await sb
    .from('packages').select('id').eq('project_id', projectId).eq('name', name).maybeSingle()

  if (existingBase) {
    const { data: d3u, error: e3u } = await sb
      .from('packages').update({ price }).eq('id', existingBase.id).select().single()
    if (!e3u) {
      console.warn('[createPackageAction] attempt 3 — updated existing row (base schema)')
      return mapDbPackage(d3u)
    }
    console.error('[createPackageAction] attempt 3 update failed:', e3u)
    throw new Error(e3u.message)
  }

  const basePayload = { project_id: projectId, name, price }
  console.log('[createPackageAction] attempt 3 — inserting base payload:', JSON.stringify(basePayload))

  const { data: d3, error: e3 } = await sb
    .from('packages').insert(basePayload).select().single()

  if (!e3) {
    console.warn('[createPackageAction] saved with base schema — run supabase/migrations/006_flexible_packages.sql for full functionality')
    return mapDbPackage(d3)
  }

  console.error('[createPackageAction] all 3 attempts failed:', e3)
  throw new Error(
    `Package save failed after 3 attempts. ` +
    `Attempt 1: "${(e1 as any).message}" | Attempt 3: "${e3.message}". ` +
    `Run supabase/migrations/006_flexible_packages.sql on your database.`
  )
}

export async function updatePackageAction(
  id: string,
  name: string,
  code: string,
  price: number,
  notes?: string,
  customValues?: Record<string, string>,
  product_id?: string,
) {
  const sb = createAdminClient()

  const fullPayload = {
    name,
    code:              code || null,
    price,
    custom_attributes: { notes: notes ?? '', ...(customValues ?? {}) },
    product_id:        product_id ?? null,
  }

  console.log('[updatePackageAction] updating id=%s payload:', id, JSON.stringify(fullPayload))

  const { error } = await sb.from('packages').update(fullPayload).eq('id', id)

  if (!error) return

  console.error('[updatePackageAction] full error:', {
    message: error.message,
    code:    (error as any).code,
    details: (error as any).details,
    hint:    (error as any).hint,
  })

  if (isColumnError(error)) {
    console.warn('[updatePackageAction] column error — retrying with base schema only')
    const basePayload = { name, price }
    const { error: fallbackError } = await sb.from('packages').update(basePayload).eq('id', id)
    if (fallbackError) {
      console.error('[updatePackageAction] fallback failed:', fallbackError)
      throw new Error(fallbackError.message)
    }
    return
  }

  throw new Error(error.message)
}

export async function deletePackageAction(id: string) {
  const sb = createAdminClient()
  const { error } = await sb.from('packages').delete().eq('id', id)
  if (error) throw new Error(error.message)
}

// ─────────────────────────────────────────────
// Book Sales vs Settle Sales Metrics
// ─────────────────────────────────────────────

export interface SalesMetrics {
  bookSales: number
  settleSales: number
  pendingSales: number
  orderCount: number
}

export async function fetchSalesMetrics(
  startDate: string,
  endDate: string,
  projectId?: string
): Promise<SalesMetrics> {
  const sb = createAdminClient()

  let q = sb
    .from('orders')
    .select('total_price, payment_status')
    .gte('order_date', startDate)
    .lte('order_date', endDate)
    .neq('status', 'cancelled')

  if (projectId) q = q.eq('project_id', projectId)

  const { data, error } = await q
  if (error) throw new Error(error.message)

  const rows = plain(data ?? []) as { total_price: string | number; payment_status: string | null }[]
  const bookSales    = rows.reduce((s, o) => s + Number(o.total_price ?? 0), 0)
  const settleSales  = rows.filter(o => o.payment_status === 'Settled').reduce((s, o) => s + Number(o.total_price ?? 0), 0)
  const pendingSales = rows.filter(o => o.payment_status === 'Pending').reduce((s, o) => s + Number(o.total_price ?? 0), 0)

  return { bookSales, settleSales, pendingSales, orderCount: rows.length }
}

// ─────────────────────────────────────────────
// PnL Settings — DB-backed per project
// ─────────────────────────────────────────────

export interface PnlSettingsMap {
  product_cost_pct: number
  shipping_cost_pct: number
  marketing_cost_pct: number
  platform_fee_pct: number
  staff_cost_monthly: number
  [key: string]: number
}

export async function getPnlSettings(projectId: string): Promise<PnlSettingsMap> {
  const sb = createAdminClient()
  const { data, error } = await sb
    .from('pnl_settings')
    .select('key, value')
    .eq('project_id', projectId)

  const defaults: PnlSettingsMap = {
    product_cost_pct: 30,
    shipping_cost_pct: 5,
    marketing_cost_pct: 10,
    platform_fee_pct: 3,
    staff_cost_monthly: 0,
  }

  if (error || !data || data.length === 0) return defaults

  const result = { ...defaults }
  for (const row of plain(data) as { key: string; value: number }[]) {
    // DB stores decimals (0.30) but UI works in percentages (30)
    const isPercent = row.key.endsWith('_pct')
    result[row.key] = isPercent ? Number(row.value) * 100 : Number(row.value)
  }
  return result
}

export async function savePnlSettings(projectId: string, settings: Partial<PnlSettingsMap>): Promise<void> {
  const sb = createAdminClient()
  const rows = Object.entries(settings).map(([key, value]) => {
    // Convert percentages back to decimals for storage
    const isPercent = key.endsWith('_pct')
    return {
      project_id: projectId,
      key,
      value: isPercent ? (value as number) / 100 : value,
      updated_at: new Date().toISOString(),
    }
  })

  if (rows.length === 0) return

  const { error } = await sb
    .from('pnl_settings')
    .upsert(rows, { onConflict: 'project_id,key' })
  if (error) throw new Error(error.message)
}

// ─────────────────────────────────────────────
// COD Delivery Status
// ─────────────────────────────────────────────

export type DeliveryStatus = 'pending_delivery' | 'out_for_delivery' | 'delivered' | 'returned' | 'failed'

export async function updateCODDeliveryStatus(
  orderId: string,
  deliveryStatus: DeliveryStatus
): Promise<{ success: boolean; error?: string }> {
  const sb = createAdminClient()

  const updates: Record<string, unknown> = { delivery_status: deliveryStatus }

  if (deliveryStatus === 'delivered') {
    updates.payment_status = 'Settled'
    updates.settled_at = new Date().toISOString()
  } else if (deliveryStatus === 'returned' || deliveryStatus === 'failed') {
    updates.payment_status = 'Failed'
  }

  const { error } = await sb.from('orders').update(updates).eq('id', orderId)
  if (error) return { success: false, error: error.message }
  return { success: true }
}
