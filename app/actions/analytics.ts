'use server'

import { createAdminClient } from '@/lib/supabase/admin'
import {
  eachDayOfInterval, parseISO, format, startOfMonth, endOfMonth,
  differenceInDays, getDaysInMonth, getDate, subDays, subMonths,
} from 'date-fns'

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

function safeDivide(n: number, d: number): number {
  return d === 0 ? 0 : n / d
}

function plain<T>(v: T): T {
  return JSON.parse(JSON.stringify(v))
}

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

export interface DailyAdSpendInput {
  project_id: string
  date: string
  fb_ad_cost_acc1?: number
  fb_ad_cost_acc2?: number
  fb_ad_cost_acc3?: number
  tiktok_ad_cost?: number
  shopee_ad_cost?: number
  fb_messages?: number
  goal_sales?: number
  notes?: string
  source?: 'manual' | 'csv_import' | 'api_meta' | 'api_tiktok' | 'api_shopee'
}

export interface RaceReportRow {
  date: string
  // Raw costs (before SST)
  fb_raw_cost: number
  tiktok_raw_cost: number
  shopee_raw_cost: number
  fb_messages: number
  goal_sales: number
  // After SST (×1.08)
  fb_cost: number
  tiktok_cost: number
  shopee_cost: number
  total_ad_spend: number
  // Facebook
  fb_new_orders: number
  fb_repeat_orders: number
  fb_new_sales: number
  fb_repeat_sales: number
  fb_total_sales: number
  // TikTok
  tiktok_new_orders: number
  tiktok_repeat_orders: number
  tiktok_new_sales: number
  tiktok_repeat_sales: number
  tiktok_total_sales: number
  // Shopee
  shopee_new_orders: number
  shopee_repeat_orders: number
  shopee_new_sales: number
  shopee_repeat_sales: number
  shopee_total_sales: number
  // Totals
  total_new_orders: number
  total_repeat_orders: number
  total_new_sales: number
  total_repeat_sales: number
  total_sales: number
  total_orders: number
  // Calculated metrics
  fb_roas: number
  tiktok_roas: number
  shopee_roas: number
  total_roas: number
  cost_per_message: number
  cost_per_purchase: number
  new_order_rate: number
  aov: number
  new_aov: number
  repeat_aov: number
}

export interface SalesOverviewData {
  bookSales: number
  settleSales: number
  totalProfit: number
  aov: number
  totalOrders: number
  prevBookSales: number
  prevSettleSales: number
  prevProfit: number
  prevAov: number
  prevOrders: number
  byDay: { date: string; revenue: number; orders: number }[]
  byBrand: { name: string; code: string; revenue: number; orders: number }[]
  byPlatform: { platform: string; revenue: number; orders: number }[]
  topPackages: { name: string; revenue: number; orders: number }[]
}

export interface CustomerInsightsData {
  total: number
  newThisMonth: number
  repeatRate: number
  vipCount: number
  dormantCount: number
  byTag: { tag: string; count: number }[]
  newVsRepeatByDay: { date: string; new: number; repeat: number }[]
  top10: { id: string; name: string; phone: string; total_orders: number; total_spent: number; tag: string }[]
  followUps: { id: string; name: string; phone: string; follow_up_date: string; follow_up_note: string | null }[]
  newCustomerAov: number
  repeatCustomerAov: number
  customerLtv: number
  retentionRate: number
  retentionDays: number
  newCount: number
  retentionCount: number
  monthlyTrend: { month: string; newAov: number; repeatAov: number; retentionRate: number }[]
}

export interface GoalTrackingData {
  totalGoal: number
  accumulated: number
  daysInMonth: number
  currentDay: number
  /** goalLine is the linear trajectory from 0 → totalGoal over the month */
  byDay: { day: number; actual: number; accumulated: number; goalLine: number }[]
  byBrand: {
    brand: string
    projectId: string
    goal: number
    accumulated: number
    progress: number
    notes: string | null
    /** per-brand running accumulated by day (0 after currentDay) */
    byDay: { day: number; accumulated: number }[]
  }[]
}

export interface MonthlyGoal {
  id: string
  project_id: string
  year: number
  month: number
  revenue_target: number
  notes: string | null
}

// ─────────────────────────────────────────────────────────────────────────────
// Ad Spend CRUD
// ─────────────────────────────────────────────────────────────────────────────

export async function saveAdSpend(data: DailyAdSpendInput): Promise<void> {
  const sb = createAdminClient()
  const { error } = await sb
    .from('daily_ad_spend')
    .upsert(
      { ...data, source: data.source ?? 'manual', updated_at: new Date().toISOString() },
      { onConflict: 'project_id,date' },
    )
  if (error) throw new Error(error.message)
}

export async function batchImportAdSpend(
  rows: DailyAdSpendInput[],
): Promise<{ inserted: number; errors: string[] }> {
  const sb = createAdminClient()
  const errors: string[] = []
  let inserted = 0
  for (const row of rows) {
    const { error } = await sb
      .from('daily_ad_spend')
      .upsert(
        { ...row, source: 'csv_import', updated_at: new Date().toISOString() },
        { onConflict: 'project_id,date' },
      )
    if (error) errors.push(`${row.date}: ${error.message}`)
    else inserted++
  }
  return { inserted, errors }
}

export async function fetchRawAdSpend(
  projectId: string,
  dateFrom: string,
  dateTo: string,
): Promise<DailyAdSpendInput[]> {
  const sb = createAdminClient()
  let q = sb
    .from('daily_ad_spend')
    .select('*')
    .gte('date', dateFrom)
    .lte('date', dateTo)
    .order('date', { ascending: true })
  if (projectId) q = q.eq('project_id', projectId)
  const { data, error } = await q
  if (error) throw new Error(error.message)
  return plain(data ?? [])
}

// ─────────────────────────────────────────────────────────────────────────────
// Race Report (live computation from daily_ad_spend + orders)
// ─────────────────────────────────────────────────────────────────────────────

export async function computeRaceReport(
  projectId: string,
  dateFrom: string,
  dateTo: string,
): Promise<RaceReportRow[]> {
  const sb = createAdminClient()

  // Fetch ad spend rows
  let adQ = sb
    .from('daily_ad_spend')
    .select('*')
    .gte('date', dateFrom)
    .lte('date', dateTo)
    .order('date', { ascending: true })
  if (projectId) adQ = adQ.eq('project_id', projectId)
  const { data: adRows, error: adErr } = await adQ
  if (adErr) throw new Error(adErr.message)

  // Fetch orders (non-cancelled)
  let ordQ = sb
    .from('orders')
    .select('order_date, total_price, channel, is_new_customer')
    .gte('order_date', dateFrom)
    .lte('order_date', dateTo)
    .neq('status', 'cancelled')
  if (projectId) ordQ = ordQ.eq('project_id', projectId)
  const { data: orders, error: ordErr } = await ordQ
  if (ordErr) throw new Error(ordErr.message)

  type OrderRow = { order_date: string; total_price: number; channel: string | null; is_new_customer: boolean | null }

  // Group ad spend by date (aggregate if multiple projects for All Brands)
  const adByDate: Record<string, {
    fb1: number; fb2: number; fb3: number
    tiktok: number; shopee: number; messages: number; goal: number
  }> = {}
  for (const row of adRows ?? []) {
    const d = row.date
    if (!adByDate[d]) adByDate[d] = { fb1: 0, fb2: 0, fb3: 0, tiktok: 0, shopee: 0, messages: 0, goal: 0 }
    adByDate[d].fb1 += Number(row.fb_ad_cost_acc1 ?? 0)
    adByDate[d].fb2 += Number(row.fb_ad_cost_acc2 ?? 0)
    adByDate[d].fb3 += Number(row.fb_ad_cost_acc3 ?? 0)
    adByDate[d].tiktok += Number(row.tiktok_ad_cost ?? 0)
    adByDate[d].shopee += Number(row.shopee_ad_cost ?? 0)
    adByDate[d].messages += Number(row.fb_messages ?? 0)
    adByDate[d].goal += Number(row.goal_sales ?? 0)
  }

  // Group orders by date
  const ordByDate: Record<string, OrderRow[]> = {}
  for (const o of orders ?? []) {
    if (!ordByDate[o.order_date]) ordByDate[o.order_date] = []
    ordByDate[o.order_date].push(o as OrderRow)
  }

  const FB_CHANNELS = ['Facebook']
  const TT_CHANNELS = ['TikTok', 'Xiaohongshu']
  const SHOP_CHANNELS = ['Shopee', 'Lazada']

  const result: RaceReportRow[] = Object.entries(adByDate).map(([date, spend]) => {
    const dayOrders = ordByDate[date] ?? []

    const fbOrds = dayOrders.filter(o => FB_CHANNELS.includes(o.channel ?? ''))
    const ttOrds = dayOrders.filter(o => TT_CHANNELS.includes(o.channel ?? ''))
    const shopOrds = dayOrders.filter(o => SHOP_CHANNELS.includes(o.channel ?? ''))

    const sum = (arr: OrderRow[]) => arr.reduce((s, o) => s + Number(o.total_price), 0)
    const newOf = (arr: OrderRow[]) => arr.filter(o => o.is_new_customer)
    const repOf = (arr: OrderRow[]) => arr.filter(o => !o.is_new_customer)

    const fbNew = newOf(fbOrds); const fbRep = repOf(fbOrds)
    const ttNew = newOf(ttOrds); const ttRep = repOf(ttOrds)
    const shNew = newOf(shopOrds); const shRep = repOf(shopOrds)
    const allNew = newOf(dayOrders); const allRep = repOf(dayOrders)

    const fb_new_sales = sum(fbNew); const fb_repeat_sales = sum(fbRep)
    const tiktok_new_sales = sum(ttNew); const tiktok_repeat_sales = sum(ttRep)
    const shopee_new_sales = sum(shNew); const shopee_repeat_sales = sum(shRep)
    const total_new_sales = sum(allNew); const total_repeat_sales = sum(allRep)

    const fb_total_sales = fb_new_sales + fb_repeat_sales
    const tiktok_total_sales = tiktok_new_sales + tiktok_repeat_sales
    const shopee_total_sales = shopee_new_sales + shopee_repeat_sales
    const total_sales = total_new_sales + total_repeat_sales
    const total_orders = dayOrders.length

    const fb_raw_cost = spend.fb1 + spend.fb2 + spend.fb3
    const fb_cost = fb_raw_cost * 1.08
    const tiktok_cost = spend.tiktok * 1.08
    const shopee_cost = spend.shopee * 1.08
    const total_ad_spend = fb_cost + tiktok_cost + shopee_cost

    return {
      date,
      fb_raw_cost, tiktok_raw_cost: spend.tiktok, shopee_raw_cost: spend.shopee,
      fb_messages: spend.messages, goal_sales: spend.goal,
      fb_cost, tiktok_cost, shopee_cost, total_ad_spend,
      fb_new_orders: fbNew.length, fb_repeat_orders: fbRep.length, fb_new_sales, fb_repeat_sales, fb_total_sales,
      tiktok_new_orders: ttNew.length, tiktok_repeat_orders: ttRep.length, tiktok_new_sales, tiktok_repeat_sales, tiktok_total_sales,
      shopee_new_orders: shNew.length, shopee_repeat_orders: shRep.length, shopee_new_sales, shopee_repeat_sales, shopee_total_sales,
      total_new_orders: allNew.length, total_repeat_orders: allRep.length,
      total_new_sales, total_repeat_sales, total_sales, total_orders,
      fb_roas: safeDivide(fb_total_sales, fb_cost),
      tiktok_roas: safeDivide(tiktok_total_sales, tiktok_cost),
      shopee_roas: safeDivide(shopee_total_sales, shopee_cost),
      total_roas: safeDivide(total_sales, total_ad_spend),
      cost_per_message: safeDivide(fb_cost, spend.messages),
      cost_per_purchase: safeDivide(total_ad_spend, total_orders),
      new_order_rate: safeDivide(allNew.length, total_orders),
      aov: safeDivide(total_sales, total_orders),
      new_aov: safeDivide(total_new_sales, allNew.length),
      repeat_aov: safeDivide(total_repeat_sales, allRep.length),
    }
  })

  result.sort((a, b) => a.date.localeCompare(b.date))
  return plain(result)
}

// ─────────────────────────────────────────────────────────────────────────────
// Sales Overview
// ─────────────────────────────────────────────────────────────────────────────

export async function fetchSalesOverview(
  projectId: string,
  dateFrom: string,
  dateTo: string,
): Promise<SalesOverviewData> {
  const sb = createAdminClient()

  // Compute previous period (same length, directly before)
  const from = parseISO(dateFrom)
  const to = parseISO(dateTo)
  const span = differenceInDays(to, from) + 1
  const prevFrom = format(subDays(from, span), 'yyyy-MM-dd')
  const prevTo = format(subDays(from, 1), 'yyyy-MM-dd')

  async function fetchOrders(dFrom: string, dTo: string) {
    let q = sb
      .from('orders')
      .select('order_date, total_price, profit, payment_status, status, delivery_status, channel, is_new_customer, package_name, projects(name, code)')
      .gte('order_date', dFrom)
      .lte('order_date', dTo)
      .neq('status', 'cancelled')
    if (projectId) q = q.eq('project_id', projectId)
    const { data } = await q
    return data ?? []
  }

  const [current, prev] = await Promise.all([
    fetchOrders(dateFrom, dateTo),
    fetchOrders(prevFrom, prevTo),
  ])

  const calcMetrics = (rows: typeof current) => {
    const bookSales = rows.reduce((s, o) => s + Number(o.total_price), 0)
    const settleSales = rows
      .filter(o => o.payment_status === 'Settled' || o.delivery_status === 'delivered' || o.status === 'delivered')
      .reduce((s, o) => s + Number(o.total_price), 0)
    const totalProfit = rows.reduce((s, o) => s + Number(o.profit ?? 0), 0)
    const totalOrders = rows.length
    return { bookSales, settleSales, totalProfit, aov: safeDivide(bookSales, totalOrders), totalOrders }
  }

  const curr = calcMetrics(current)
  const p = calcMetrics(prev)

  // Daily trend
  const days = eachDayOfInterval({ start: from, end: to })
  const byDay = days.map(d => {
    const key = format(d, 'yyyy-MM-dd')
    const dayOrds = current.filter(o => o.order_date === key)
    return {
      date: format(d, 'dd MMM'),
      revenue: dayOrds.reduce((s, o) => s + Number(o.total_price), 0),
      orders: dayOrds.length,
    }
  })

  // By brand
  const brandMap: Record<string, { name: string; code: string; revenue: number; orders: number }> = {}
  for (const o of current) {
    const proj = o.projects as unknown as { name: string; code: string } | null
    const code = proj?.code ?? 'Unknown'
    const name = proj?.name ?? 'Unknown'
    if (!brandMap[code]) brandMap[code] = { name, code, revenue: 0, orders: 0 }
    brandMap[code].revenue += Number(o.total_price)
    brandMap[code].orders++
  }

  // By platform
  const platMap: Record<string, { revenue: number; orders: number }> = {}
  for (const o of current) {
    const ch = o.channel ?? 'Other'
    if (!platMap[ch]) platMap[ch] = { revenue: 0, orders: 0 }
    platMap[ch].revenue += Number(o.total_price)
    platMap[ch].orders++
  }

  // Top packages
  const pkgMap: Record<string, { revenue: number; orders: number }> = {}
  for (const o of current) {
    const name = o.package_name ?? 'Unknown'
    if (!pkgMap[name]) pkgMap[name] = { revenue: 0, orders: 0 }
    pkgMap[name].revenue += Number(o.total_price)
    pkgMap[name].orders++
  }
  const topPackages = Object.entries(pkgMap)
    .map(([name, v]) => ({ name, ...v }))
    .sort((a, b) => b.revenue - a.revenue)
    .slice(0, 10)

  return plain({
    ...curr,
    prevBookSales: p.bookSales,
    prevSettleSales: p.settleSales,
    prevProfit: p.totalProfit,
    prevAov: p.aov,
    prevOrders: p.totalOrders,
    byDay,
    byBrand: Object.values(brandMap).sort((a, b) => b.revenue - a.revenue),
    byPlatform: Object.entries(platMap)
      .map(([platform, v]) => ({ platform, ...v }))
      .sort((a, b) => b.revenue - a.revenue),
    topPackages,
  })
}

// ─────────────────────────────────────────────────────────────────────────────
// Customer Insights
// ─────────────────────────────────────────────────────────────────────────────

export async function fetchCustomerInsights(
  projectId: string,
  dateFrom: string,
  dateTo: string,
  phoneOnly = false,
): Promise<CustomerInsightsData> {
  const sb = createAdminClient()

  const today = new Date()
  const monthStart = format(startOfMonth(today), 'yyyy-MM-dd')
  const monthEnd = format(endOfMonth(today), 'yyyy-MM-dd')

  // ── When a brand is selected, customers must be scoped to those who have
  //    ordered from that project. The customers table has no project_id column,
  //    so we derive the set from the orders table. ──────────────────────────────
  //
  //    We also capture each customer's FIRST order date for THIS brand so that
  //    "New This Month" means "first order with this brand was this month",
  //    not "first order ever was this month".

  // ── Fetch retention/VIP thresholds from brand_settings ──────────────────────
  let retentionDays = 365
  let vipSpendThreshold = 2000
  let vipOrderThreshold = 6
  if (projectId) {
    const { data: bSettings, error: bSettingsErr } = await sb
      .from('brand_settings')
      .select('retention_days, vip_spend_threshold, vip_order_threshold')
      .eq('project_id', projectId)
      .single()
    if (bSettingsErr) {
      console.warn(`[fetchCustomerInsights] brand_settings not found for project ${projectId}:`, bSettingsErr.message, '— using defaults')
    }
    if (bSettings) {
      retentionDays = Number(bSettings.retention_days ?? 365)
      vipSpendThreshold = Number(bSettings.vip_spend_threshold ?? 2000)
      vipOrderThreshold = Number(bSettings.vip_order_threshold ?? 6)
    }
  }

  // ── CustRow type shared by both paths ────────────────────────────────────────
  type CustRow = {
    id: string; name: string; phone: string;
    customer_tag: string | null; total_orders: number | null; total_spent: number | null;
    first_order_date: string | null; last_order_date: string | null;
    follow_up_date: string | null; follow_up_note: string | null
  }

  // ── Brand-scoped: use get_brand_customers RPC ─────────────────────────────
  // The RPC does a server-side JOIN so it bypasses PostgREST max_rows entirely
  // and returns ALL matching customers in one round-trip.
  //
  // It returns:
  //   • brand_first_order_date – customer's first-EVER order for this brand
  //     (used to determine "new" status — unaffected by the selected date range)
  //   • range_spend / range_orders / range_last_order_date – within-range stats
  //     (for VIP/dormant calculations scoped to the selected period)
  //
  // Bug fixed: "New This Range" was previously > Total Customers because it
  // used brandFirstOrderDate built from date-filtered projOrders, which only
  // recorded the first order WITHIN the range — almost every customer appeared
  // "new". Now brand_first_order_date is the all-time first order, so only
  // genuinely new customers are counted.

  type BrandCustRow = CustRow & {
    brand_first_order_date: string | null
    range_spend: number
    range_orders: number
    range_last_order_date: string | null
  }

  let brandCustomerIds: string[] | null = null
  const customerProjectData: Record<string, { spend: number; orders: number; lastOrderDate: string }> = {}
  let firstOrderMap = new Map<string, string>()
  let brandRpcRows: CustRow[] = []

  if (projectId) {
    console.log('[CI] projectId received:', projectId)
    console.log('[CI] dateFrom:', dateFrom, 'dateTo:', dateTo)

    // Fetch all orders for this brand+date range in 500-row pages so
    // PostgREST max_rows never truncates a page.  Derive unique customer
    // IDs and per-customer range metrics directly from the order rows.
    type RangeOrder = {
      customer_id: string; order_date: string
      total_price: number; payment_status: string | null
    }
    const rangeOrdersForBrand: RangeOrder[] = []
    let roidOffset = 0
    const ROID_PAGE = 500
    while (true) {
      const { data, error } = await sb
        .from('orders')
        .select('customer_id, order_date, total_price, payment_status')
        .eq('project_id', projectId)
        .gte('order_date', dateFrom)
        .lte('order_date', dateTo)
        .neq('status', 'cancelled')
        .not('customer_id', 'is', null)
        .range(roidOffset, roidOffset + ROID_PAGE - 1)
      if (error || !data || data.length === 0) break
      rangeOrdersForBrand.push(...(data as RangeOrder[]))
      console.log(`[CI] order page offset ${roidOffset}: ${data.length} orders`)
      if (data.length < ROID_PAGE) break
      roidOffset += ROID_PAGE
    }

    // Unique customer IDs + per-customer range metrics from order rows
    const customerIdSet = new Set<string>()
    for (const o of rangeOrdersForBrand) {
      const cid = o.customer_id
      customerIdSet.add(cid)
      if (!customerProjectData[cid]) customerProjectData[cid] = { spend: 0, orders: 0, lastOrderDate: '' }
      customerProjectData[cid].orders++
      if (o.payment_status === 'Settled') customerProjectData[cid].spend += Number(o.total_price ?? 0)
      if (!customerProjectData[cid].lastOrderDate || o.order_date > customerProjectData[cid].lastOrderDate) {
        customerProjectData[cid].lastOrderDate = o.order_date
      }
    }
    brandCustomerIds = Array.from(customerIdSet)
    console.log(`[CI] unique customers in range: ${brandCustomerIds.length}`)

    if (brandCustomerIds.length === 0) {
      const emptyDays = eachDayOfInterval({ start: parseISO(dateFrom), end: parseISO(dateTo) })
      return plain({
        total: 0, newThisMonth: 0, repeatRate: 0, vipCount: 0, dormantCount: 0,
        byTag: [],
        newVsRepeatByDay: emptyDays.map(d => ({ date: format(d, 'dd MMM'), new: 0, repeat: 0 })),
        top10: [],
        followUps: [],
        newCustomerAov: 0,
        repeatCustomerAov: 0,
        customerLtv: 0,
        retentionRate: 0,
        retentionDays,
        newCount: 0,
        retentionCount: 0,
        monthlyTrend: [],
      })
    }

    // All-time first order date per customer for this brand — built directly from
    // the orders table so it's always current. Batched by customer ID (500 per
    // chunk) with inner pagination (1000 rows per page) to handle large datasets.
    const FOD_CID_BATCH = 500
    const FOD_PAGE = 1000
    for (let i = 0; i < brandCustomerIds.length; i += FOD_CID_BATCH) {
      const chunk = brandCustomerIds.slice(i, i + FOD_CID_BATCH)
      let pageOffset = 0
      while (true) {
        const { data: fodPage } = await sb
          .from('orders')
          .select('customer_id, order_date')
          .eq('project_id', projectId)
          .in('customer_id', chunk)
          .not('order_date', 'is', null)
          .range(pageOffset, pageOffset + FOD_PAGE - 1)
        if (!fodPage || fodPage.length === 0) break
        for (const r of fodPage as Array<{ customer_id: string; order_date: string }>) {
          const existing = firstOrderMap.get(r.customer_id)
          if (!existing || r.order_date < existing) firstOrderMap.set(r.customer_id, r.order_date)
        }
        if (fodPage.length < FOD_PAGE) break
        pageOffset += FOD_PAGE
      }
    }
    console.log('[CI] firstOrderMap size:', firstOrderMap.size)

    // Fetch customer profiles in batches of 100 to avoid URL length limits
    const CUST_BATCH = 100
    const BRAND_CUST_SELECT = 'id, name, phone, customer_tag, total_orders, total_spent, first_order_date, last_order_date, follow_up_date, follow_up_note'
    for (let i = 0; i < brandCustomerIds.length; i += CUST_BATCH) {
      const batch = brandCustomerIds.slice(i, i + CUST_BATCH)
      const { data, error } = await sb
        .from('customers')
        .select(BRAND_CUST_SELECT)
        .in('id', batch)
      if (error) { console.error('[CI] customer batch error:', error.message); continue }
      if (data) brandRpcRows.push(...(data as CustRow[]))
    }
    console.log('[CI] brand customers fetched:', brandRpcRows.length)
  }

  // ── Customers list: brand-scoped uses RPC rows; all-brands paginates ─────────
  const CUST_SELECT = 'id, name, phone, customer_tag, total_orders, total_spent, first_order_date, last_order_date, follow_up_date, follow_up_note'
  const CUST_PAGE = 1000
  let customers: CustRow[] = []

  if (brandCustomerIds !== null) {
    // Brand-scoped: customers were fetched in batches above
    customers = brandRpcRows as CustRow[]
  } else {
    // All-brands: first collect customer IDs from orders in the date range,
    // then batch-fetch profiles — same pattern as brand-scoped but without
    // project_id filter.
    type AllBrandsOrder = { customer_id: string }
    const allBrandsOrders: AllBrandsOrder[] = []
    let abOffset = 0
    while (true) {
      const { data, error } = await sb
        .from('orders')
        .select('customer_id')
        .gte('order_date', dateFrom)
        .lte('order_date', dateTo)
        .neq('status', 'cancelled')
        .not('customer_id', 'is', null)
        .range(abOffset, abOffset + CUST_PAGE - 1)
      if (error || !data || data.length === 0) break
      allBrandsOrders.push(...(data as AllBrandsOrder[]))
      if (data.length < CUST_PAGE) break
      abOffset += CUST_PAGE
    }

    const allBrandsIds = Array.from(new Set(allBrandsOrders.map(r => r.customer_id)))
    console.log(`[CI] all-brands unique customers in range: ${allBrandsIds.length}`)

    // Build firstOrderMap from orders table (no project filter — all-time across all brands).
    const AB_FOD_BATCH = 200
    const AB_FOD_PAGE = 1000
    for (let i = 0; i < allBrandsIds.length; i += AB_FOD_BATCH) {
      const chunk = allBrandsIds.slice(i, i + AB_FOD_BATCH)
      let pageOffset = 0
      while (true) {
        const { data: fodPage } = await sb
          .from('orders')
          .select('customer_id, order_date')
          .in('customer_id', chunk)
          .not('order_date', 'is', null)
          .range(pageOffset, pageOffset + AB_FOD_PAGE - 1)
        if (!fodPage || fodPage.length === 0) break
        for (const r of fodPage as Array<{ customer_id: string; order_date: string }>) {
          const existing = firstOrderMap.get(r.customer_id)
          if (!existing || r.order_date < existing) firstOrderMap.set(r.customer_id, r.order_date)
        }
        if (fodPage.length < AB_FOD_PAGE) break
        pageOffset += AB_FOD_PAGE
      }
    }
    console.log('[CI] all-brands firstOrderMap size:', firstOrderMap.size)

    const AB_BATCH = 100
    for (let i = 0; i < allBrandsIds.length; i += AB_BATCH) {
      const batch = allBrandsIds.slice(i, i + AB_BATCH)
      const { data, error } = await sb
        .from('customers')
        .select(CUST_SELECT)
        .in('id', batch)
      if (error) { console.error('[CI] all-brands customer batch error:', error.message); continue }
      if (data) customers.push(...(data as CustRow[]))
    }
    console.log('[CI] all-brands customers fetched:', customers.length)
  }

  console.log('[CI] customers fetched:', customers.length)

  // ── Phone-only filter: narrow to customers with a valid phone number ─────────
  if (phoneOnly) {
    customers = customers.filter(c => c.phone && c.phone !== '' && c.phone !== '0')
    // Also narrow brandCustomerIds so the VIP/dormant brand-scoped branch
    // uses the correct reduced set.
    if (brandCustomerIds) {
      const phoneSet = new Set(customers.map(c => c.id))
      brandCustomerIds = brandCustomerIds.filter(id => phoneSet.has(id))
    }
    console.log('[CI] after phone filter:', customers.length)
  }

  // ── Orders in date range for new-vs-repeat trend — paginated ───────────────
  const ORD_PAGE = 100
  const orders: Array<{ order_date: string; is_new_customer: boolean | null }> = []
  let ordPage = 0
  while (true) {
    let q = sb
      .from('orders')
      .select('order_date, is_new_customer')
      .gte('order_date', dateFrom)
      .lte('order_date', dateTo)
      .neq('status', 'cancelled')
      .range(ordPage * ORD_PAGE, (ordPage + 1) * ORD_PAGE - 1)
    if (projectId) q = q.eq('project_id', projectId)
    const { data: pageData } = await q
    if (!pageData || pageData.length === 0) break
    orders.push(...(pageData as typeof orders))
    if (pageData.length < ORD_PAGE) break
    ordPage++
  }

  console.log('[CI] date-range orders fetched:', orders.length)
  console.log('[CI] sample order:', orders[0])

  const from = parseISO(dateFrom)
  const to = parseISO(dateTo)
  const days = eachDayOfInterval({ start: from, end: to })
  const newVsRepeatByDay = days.map(d => {
    const key = format(d, 'yyyy-MM-dd')
    const dayOrds = orders?.filter(o => o.order_date === key) ?? []
    return {
      date: format(d, 'dd MMM'),
      new: dayOrds.filter(o => o.is_new_customer).length,
      repeat: dayOrds.filter(o => !o.is_new_customer).length,
    }
  })

  const all = customers ?? []
  const total = all.length

  // ── VIP & Dormant: compute dynamically from brand_settings thresholds ────────
  // When project-scoped, use per-brand settled spend/orders and last order date.
  // VIP = settled spend >= vip_spend_threshold OR settled order count >= vip_order_threshold
  // Dormant/Lost = last order for this brand was more than retentionDays ago
  let vipCount: number
  let dormantCount: number
  if (projectId && brandCustomerIds && brandCustomerIds.length > 0) {
    const retentionCutoffStr = format(subDays(today, retentionDays), 'yyyy-MM-dd')
    vipCount = brandCustomerIds.filter(cid => {
      const d = customerProjectData[cid]
      if (!d) return false
      return d.spend >= vipSpendThreshold || d.orders >= vipOrderThreshold
    }).length
    dormantCount = brandCustomerIds.filter(cid => {
      const d = customerProjectData[cid]
      if (!d) return true
      return d.lastOrderDate < retentionCutoffStr
    }).length
  } else {
    vipCount = all.filter(c => c.customer_tag === 'VIP').length
    dormantCount = all.filter(c => c.customer_tag === 'Dormant' || c.customer_tag === 'Lost').length
  }

  const repeatCount = all.filter(c => (c.total_orders ?? 0) >= 2).length

  // "New in Range": customers whose first-ever order for this brand falls within
  // the selected date range. Using brand_first_order_date (all-time first order
  // for this project) ensures the count is always ≤ Total Customers.
  // For all-brands view, falls back to global first_order_date vs current month.
  const newThisMonth = projectId
    ? brandRpcRows.filter(r => {
        const firstDate = firstOrderMap.get(r.id)
        return firstDate != null && firstDate >= dateFrom && firstDate <= dateTo
      }).length
    : all.filter(c => {
        const fod = c.first_order_date
        return fod && fod >= dateFrom && fod <= dateTo
      }).length

  // Tag breakdown
  const tagMap: Record<string, number> = {}
  for (const c of all) {
    const t = c.customer_tag ?? 'Unknown'
    tagMap[t] = (tagMap[t] ?? 0) + 1
  }
  const byTag = Object.entries(tagMap).map(([tag, count]) => ({ tag, count }))

  // Top 10 customers by spend
  const top10 = all
    .sort((a, b) => Number(b.total_spent ?? 0) - Number(a.total_spent ?? 0))
    .slice(0, 10)
    .map(c => ({
      id: c.id,
      name: c.name,
      phone: c.phone,
      total_orders: c.total_orders ?? 0,
      total_spent: Number(c.total_spent ?? 0),
      tag: c.customer_tag ?? 'Unknown',
    }))

  // Follow-up reminders due today or overdue
  const todayStr = format(today, 'yyyy-MM-dd')
  const followUps = all
    .filter(c => c.follow_up_date && c.follow_up_date <= todayStr)
    .map(c => ({
      id: c.id,
      name: c.name,
      phone: c.phone,
      follow_up_date: c.follow_up_date!,
      follow_up_note: c.follow_up_note,
    }))
    .slice(0, 20)

  // ── New Customer AOV: avg total_spent for single-order customers ─────────────
  const singleOrderCustomers = all.filter(c => (c.total_orders ?? 0) === 1)
  const newCustomerAov = singleOrderCustomers.length > 0
    ? singleOrderCustomers.reduce((s, c) => s + Number(c.total_spent ?? 0), 0) / singleOrderCustomers.length
    : 0

  // ── Repeat Customer AOV: avg (total_spent / total_orders) for 2+ orders ──────
  const repeatCustomers = all.filter(c => (c.total_orders ?? 0) >= 2)
  const repeatCustomerAov = repeatCustomers.length > 0
    ? repeatCustomers.reduce((s, c) => s + safeDivide(Number(c.total_spent ?? 0), c.total_orders ?? 1), 0) / repeatCustomers.length
    : 0

  // ── Customer LTV: average total_spent across all customers ───────────────────
  const customerLtv = total > 0
    ? all.reduce((s, c) => s + Number(c.total_spent ?? 0), 0) / total
    : 0

  // ── Retention Rate: returning customers (first order BEFORE period) ÷ total in period
  // New      = first-ever order for this brand falls within [dateFrom, dateTo]
  // Retention = ordered in period but first-ever order was before dateFrom
  // Customers with no resolvable first order date are excluded from both counts.
  const newCount = all.filter(c => {
    const firstDate = projectId ? firstOrderMap.get(c.id) : (c.first_order_date ?? undefined)
    return firstDate != null && firstDate >= dateFrom && firstDate <= dateTo
  }).length
  const retentionCount = all.filter(c => {
    const firstDate = projectId ? firstOrderMap.get(c.id) : (c.first_order_date ?? undefined)
    return firstDate != null && firstDate < dateFrom
  }).length
  const retentionRate = total > 0 ? (retentionCount / total) * 100 : 0

  // ── Monthly trend: last 6 months using is_new_customer on orders ─────────────
  const sixMonthsAgo = format(subMonths(today, 6), 'yyyy-MM-dd')
  // Paginate trendOrders the same way — 6 months can exceed max_rows
  const TREND_PAGE = 100
  const TREND_PARALLEL = 10

  let trendCountQ = sb
    .from('orders')
    .select('*', { count: 'exact', head: true })
    .gte('order_date', sixMonthsAgo)
    .neq('status', 'cancelled')
  if (projectId) trendCountQ = trendCountQ.eq('project_id', projectId)
  const { count: trendTotal } = await trendCountQ

  const trendNumPages = Math.ceil((trendTotal ?? 0) / TREND_PAGE)
  const trendOrders: Array<{ order_date: string; total_price: number; is_new_customer: boolean | null }> = []

  for (let b = 0; b < trendNumPages; b += TREND_PARALLEL) {
    const batch = Array.from(
      { length: Math.min(TREND_PARALLEL, trendNumPages - b) },
      (_, i) => b + i
    )
    const batchData = await Promise.all(
      batch.map(p => {
        let q = sb.from('orders')
          .select('order_date, total_price, is_new_customer')
          .gte('order_date', sixMonthsAgo)
          .neq('status', 'cancelled')
          .range(p * TREND_PAGE, (p + 1) * TREND_PAGE - 1)
        if (projectId) q = q.eq('project_id', projectId)
        return q.then(({ data }) => (data ?? []) as typeof trendOrders)
      })
    )
    for (const page of batchData) trendOrders.push(...page)
  }

  const monthMap: Record<string, { newOrders: number; newRevenue: number; repeatOrders: number; repeatRevenue: number; totalOrders: number }> = {}
  for (const o of trendOrders ?? []) {
    const month = (o.order_date as string).substring(0, 7)
    if (!monthMap[month]) monthMap[month] = { newOrders: 0, newRevenue: 0, repeatOrders: 0, repeatRevenue: 0, totalOrders: 0 }
    if (o.is_new_customer) {
      monthMap[month].newOrders++
      monthMap[month].newRevenue += Number(o.total_price ?? 0)
    } else {
      monthMap[month].repeatOrders++
      monthMap[month].repeatRevenue += Number(o.total_price ?? 0)
    }
    monthMap[month].totalOrders++
  }

  const monthlyTrend = Array.from({ length: 6 }, (_, i) => {
    const d = subMonths(today, 5 - i)
    const key = format(d, 'yyyy-MM')
    const m = monthMap[key] ?? { newOrders: 0, newRevenue: 0, repeatOrders: 0, repeatRevenue: 0, totalOrders: 0 }
    return {
      month: format(d, 'MMM yy'),
      newAov: m.newOrders > 0 ? m.newRevenue / m.newOrders : 0,
      repeatAov: m.repeatOrders > 0 ? m.repeatRevenue / m.repeatOrders : 0,
      retentionRate: m.totalOrders > 0 ? (m.repeatOrders / m.totalOrders) * 100 : 0,
    }
  })

  return plain({
    total,
    newThisMonth,
    repeatRate: safeDivide(repeatCount, total) * 100,
    vipCount,
    dormantCount,
    byTag,
    newVsRepeatByDay,
    top10,
    followUps,
    newCustomerAov,
    repeatCustomerAov,
    customerLtv,
    retentionRate,
    retentionDays,
    newCount,
    retentionCount,
    monthlyTrend,
  })
}

// ─────────────────────────────────────────────────────────────────────────────
// Monthly Goals CRUD
// ─────────────────────────────────────────────────────────────────────────────

export async function fetchMonthlyGoals(year: number, month: number): Promise<MonthlyGoal[]> {
  const sb = createAdminClient()
  const { data, error } = await sb
    .from('monthly_goals')
    .select('*')
    .eq('year', year)
    .eq('month', month)
  if (error) throw new Error(error.message)
  return plain(data ?? [])
}

export async function saveMonthlyGoal(
  projectId: string,
  year: number,
  month: number,
  revenueTarget: number,
  notes?: string,
): Promise<void> {
  const sb = createAdminClient()
  const { error } = await sb
    .from('monthly_goals')
    .upsert(
      {
        project_id: projectId,
        year,
        month,
        revenue_target: revenueTarget,
        notes: notes ?? null,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'project_id,year,month' },
    )
  if (error) throw new Error(error.message)
}

// ─────────────────────────────────────────────────────────────────────────────
// Goal Tracking
// ─────────────────────────────────────────────────────────────────────────────

export async function fetchGoalTracking(
  projectId: string,
  yearMonth: string, // 'yyyy-MM'
): Promise<GoalTrackingData> {
  const sb = createAdminClient()
  const [yearStr, monthStr] = yearMonth.split('-')
  const year = parseInt(yearStr, 10)
  const month = parseInt(monthStr, 10)
  const monthStart = `${yearMonth}-01`
  const daysInMon = getDaysInMonth(parseISO(monthStart))
  const monthEnd = `${yearMonth}-${String(daysInMon).padStart(2, '0')}`

  // Determine how far into the month we are
  const now = new Date()
  const isCurrentMonth = now.getFullYear() === year && (now.getMonth() + 1) === month
  const isFutureMonth =
    year > now.getFullYear() ||
    (year === now.getFullYear() && month > now.getMonth() + 1)
  const todayDay = isCurrentMonth ? getDate(now) : isFutureMonth ? 0 : daysInMon

  // ── Fetch goals from monthly_goals table (not daily_ad_spend) ───────────────
  let goalsQ = sb
    .from('monthly_goals')
    .select('project_id, revenue_target, notes')
    .eq('year', year)
    .eq('month', month)
  if (projectId) goalsQ = goalsQ.eq('project_id', projectId)
  const { data: goalRows } = await goalsQ

  // ── All projects (to show brands with zero goal set) ────────────────────────
  const { data: allProjects } = await sb
    .from('projects')
    .select('id, name, code')
    .order('name')

  // ── Orders for this month ───────────────────────────────────────────────────
  let ordQ = sb
    .from('orders')
    .select('order_date, total_price, project_id')
    .gte('order_date', monthStart)
    .lte('order_date', monthEnd)
    .neq('status', 'cancelled')
  if (projectId) ordQ = ordQ.eq('project_id', projectId)
  const { data: orders } = await ordQ

  // ── Build per-project map ───────────────────────────────────────────────────
  type BrandData = {
    brand: string
    projectId: string
    goal: number
    accumulated: number
    notes: string | null
    dailyRevenue: Record<number, number>
  }

  const projectsToShow = projectId
    ? (allProjects ?? []).filter(p => p.id === projectId)
    : (allProjects ?? [])

  const brandMap: Record<string, BrandData> = {}
  for (const p of projectsToShow) {
    brandMap[p.id] = {
      brand: p.code,
      projectId: p.id,
      goal: 0,
      accumulated: 0,
      notes: null,
      dailyRevenue: {},
    }
  }

  for (const g of goalRows ?? []) {
    if (brandMap[g.project_id]) {
      brandMap[g.project_id].goal = Number(g.revenue_target ?? 0)
      brandMap[g.project_id].notes = g.notes ?? null
    }
  }

  for (const o of orders ?? []) {
    const pid = o.project_id as string
    if (!pid || !brandMap[pid]) continue
    brandMap[pid].accumulated += Number(o.total_price)
    const day = parseInt((o.order_date as string).split('-')[2], 10)
    brandMap[pid].dailyRevenue[day] = (brandMap[pid].dailyRevenue[day] ?? 0) + Number(o.total_price)
  }

  const totalGoal = Object.values(brandMap).reduce((s, b) => s + b.goal, 0)
  const accumulated = Object.values(brandMap).reduce((s, b) => s + b.accumulated, 0)

  // ── Combined daily chart data ───────────────────────────────────────────────
  const byDay: { day: number; actual: number; accumulated: number; goalLine: number }[] = []
  let runningTotal = 0
  for (let d = 1; d <= daysInMon; d++) {
    const dayRevenue = Object.values(brandMap).reduce(
      (s, b) => s + (b.dailyRevenue[d] ?? 0), 0,
    )
    const actual = d <= todayDay ? dayRevenue : 0
    if (d <= todayDay) runningTotal += actual
    byDay.push({
      day: d,
      actual,
      accumulated: runningTotal,
      goalLine: totalGoal > 0 ? (totalGoal / daysInMon) * d : 0,
    })
  }

  // ── Per-brand breakdown with individual daily series ────────────────────────
  const byBrand = Object.values(brandMap).map(b => {
    const brandByDay: { day: number; accumulated: number }[] = []
    let running = 0
    for (let d = 1; d <= daysInMon; d++) {
      if (d <= todayDay) running += b.dailyRevenue[d] ?? 0
      brandByDay.push({ day: d, accumulated: d <= todayDay ? running : 0 })
    }
    return {
      brand: b.brand,
      projectId: b.projectId,
      goal: b.goal,
      accumulated: b.accumulated,
      progress: safeDivide(b.accumulated, b.goal) * 100,
      notes: b.notes,
      byDay: brandByDay,
    }
  })

  return plain({ totalGoal, accumulated, daysInMonth: daysInMon, currentDay: todayDay, byDay, byBrand })
}

// ─────────────────────────────────────────────────────────────────────────────
// Orders for payment confirmation table
// ─────────────────────────────────────────────────────────────────────────────

export interface OrderForPayment {
  id: string
  order_date: string
  customer_name: string | null
  package_name: string | null
  total_price: number
  channel: string | null
  payment_status: string | null
  is_cod: boolean | null
  delivery_status: string | null
  tracking_number: string | null
  project_code: string | null
}

export async function fetchOrdersForPayment(
  projectId: string,
  dateFrom: string,
  dateTo: string,
): Promise<OrderForPayment[]> {
  const sb = createAdminClient()
  let q = sb
    .from('orders')
    .select('id, order_date, total_price, channel, payment_status, is_cod, delivery_status, tracking_number, package_name, customers(name), projects(code)')
    .gte('order_date', dateFrom)
    .lte('order_date', dateTo)
    .neq('status', 'cancelled')
    .order('order_date', { ascending: false })
    .order('created_at', { ascending: false })
    .limit(200)
  if (projectId) q = q.eq('project_id', projectId)
  const { data, error } = await q
  if (error) throw new Error(error.message)
  return plain(
    (data ?? []).map(o => ({
      id: o.id,
      order_date: o.order_date,
      customer_name: (o.customers as unknown as { name: string } | null)?.name ?? null,
      package_name: o.package_name,
      total_price: Number(o.total_price),
      channel: o.channel,
      payment_status: o.payment_status,
      is_cod: o.is_cod,
      delivery_status: o.delivery_status,
      tracking_number: o.tracking_number,
      project_code: (o.projects as unknown as { code: string } | null)?.code ?? null,
    })),
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Sales by State
// ─────────────────────────────────────────────────────────────────────────────

export interface SalesByStateRow {
  state: string
  orders: number
  revenue: number
  avgOrderValue: number
  pct: number
}

export async function fetchSalesByState(
  projectId: string,
  dateFrom: string,
  dateTo: string,
): Promise<SalesByStateRow[]> {
  const sb = createAdminClient()
  let q = sb
    .from('orders')
    .select('state, total_price')
    .gte('order_date', dateFrom)
    .lte('order_date', dateTo)
    .neq('status', 'cancelled')
    .not('state', 'is', null)
  if (projectId) q = q.eq('project_id', projectId)
  const { data } = await q

  const stateMap: Record<string, { orders: number; revenue: number }> = {}
  for (const o of data ?? []) {
    const s = (o.state as string | null) || 'Unknown'
    if (!stateMap[s]) stateMap[s] = { orders: 0, revenue: 0 }
    stateMap[s].orders++
    stateMap[s].revenue += Number(o.total_price ?? 0)
  }

  const total = Object.values(stateMap).reduce((s, v) => s + v.revenue, 0)
  const rows = Object.entries(stateMap)
    .map(([state, v]) => ({
      state,
      orders: v.orders,
      revenue: v.revenue,
      avgOrderValue: v.orders > 0 ? v.revenue / v.orders : 0,
      pct: total > 0 ? (v.revenue / total) * 100 : 0,
    }))
    .sort((a, b) => b.revenue - a.revenue)

  return plain(rows)
}
