import { createAdminClient } from '@/lib/supabase/admin'
import { subDays, format, startOfMonth, subMonths } from 'date-fns'
import { formatCurrency } from '@/lib/utils'
import { BRAND_COLORS } from '@/lib/constants'
import Link from 'next/link'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import PageHeader from '@/components/shared/PageHeader'
import {
  TrendingUp, TrendingDown, ShoppingCart, DollarSign, Clock,
  AlertTriangle, CheckCircle2, Plus, Upload, Receipt, Warehouse,
  BarChart3, ArrowRight, Percent, Bell, Crown, Users,
} from 'lucide-react'
import RevenueTrendChart from '@/components/modules/dashboard/RevenueTrendChart'
import BrandRevenueChart from '@/components/modules/dashboard/BrandRevenueChart'
import type { TrendDataPoint } from '@/components/modules/dashboard/RevenueTrendChart'
import type { BrandDataPoint } from '@/components/modules/dashboard/BrandRevenueChart'

// ─── Helper UI components ─────────────────────────────────────────────────────

function BrandBadge({ brand }: { brand: string }) {
  const c = BRAND_COLORS[brand]
  if (!c) return (
    <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-600 border border-gray-200">
      {brand}
    </span>
  )
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium border ${c.bg} ${c.text} ${c.border}`}>
      {brand}
    </span>
  )
}

function StatusBadge({ status }: { status: string }) {
  const styles: Record<string, string> = {
    pending:    'bg-yellow-100 text-yellow-700 border-yellow-200',
    processing: 'bg-blue-100 text-blue-700 border-blue-200',
    shipped:    'bg-indigo-100 text-indigo-700 border-indigo-200',
    delivered:  'bg-green-100 text-green-700 border-green-200',
    cancelled:  'bg-gray-100 text-gray-500 border-gray-200',
  }
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium border capitalize ${styles[status] ?? 'bg-gray-100 text-gray-500 border-gray-200'}`}>
      {status}
    </span>
  )
}

function ChangeIndicator({
  current,
  previous,
  suffix = 'vs yesterday',
}: {
  current: number
  previous: number
  suffix?: string
}) {
  if (current === 0 && previous === 0) {
    return <p className="text-xs text-muted-foreground mt-1">{suffix}</p>
  }
  if (previous === 0) {
    return <p className="text-xs font-medium text-green-600 mt-1">New — {suffix}</p>
  }
  const pct = ((current - previous) / previous) * 100
  const isUp = pct >= 0
  return (
    <p className={`text-xs font-medium mt-1 flex items-center gap-0.5 ${isUp ? 'text-green-600' : 'text-red-600'}`}>
      {isUp
        ? <TrendingUp className="h-3 w-3 flex-shrink-0" />
        : <TrendingDown className="h-3 w-3 flex-shrink-0" />}
      {isUp ? '+' : ''}{pct.toFixed(1)}% {suffix}
    </p>
  )
}

// ─── Data fetching ─────────────────────────────────────────────────────────────

async function fetchDashboardData() {
  const sb = createAdminClient()

  const now = new Date()
  const today         = now.toISOString().split('T')[0]
  const yesterday     = subDays(now, 1).toISOString().split('T')[0]
  const thisMonthStart = startOfMonth(now).toISOString().split('T')[0]
  const lastMonthStart = startOfMonth(subMonths(now, 1)).toISOString().split('T')[0]
  const lastMonthEnd   = new Date(now.getFullYear(), now.getMonth(), 0).toISOString().split('T')[0]
  const thirtyDaysAgo  = subDays(now, 29).toISOString().split('T')[0]

  const [
    { data: todayRaw },
    { data: yesterdayRaw },
    { data: thisMonthRaw },
    { data: lastMonthRaw },
    { data: pendingCODRaw },
    { data: trendRaw },
    { data: lowStockRaw },
    { data: recentRaw },
    { data: followUpTodayRaw },
    { data: crmTagRaw },
  ] = await Promise.all([
    // Q1 – today's orders
    sb.from('orders')
      .select('total_price, profit')
      .eq('order_date', today)
      .neq('status', 'cancelled'),

    // Q2 – yesterday's orders
    sb.from('orders')
      .select('total_price, profit')
      .eq('order_date', yesterday)
      .neq('status', 'cancelled'),

    // Q3 – this month (rich: used for multiple KPIs, top packages, brand chart)
    sb.from('orders')
      .select('total_price, profit, payment_status, is_cod, delivery_status, package_name, package_snapshot, project_id, projects(id, code)')
      .gte('order_date', thisMonthStart)
      .neq('status', 'cancelled'),

    // Q4 – last month (totals only)
    sb.from('orders')
      .select('total_price, profit')
      .gte('order_date', lastMonthStart)
      .lte('order_date', lastMonthEnd)
      .neq('status', 'cancelled'),

    // Q5 – all unsettled COD (cross-month)
    sb.from('orders')
      .select('total_price')
      .eq('is_cod', true)
      .neq('status', 'cancelled')
      .is('settled_at', null),

    // Q6 – last 30 days for trend chart
    sb.from('orders')
      .select('order_date, total_price, profit')
      .gte('order_date', thirtyDaysAgo)
      .neq('status', 'cancelled')
      .order('order_date'),

    // Q7 – low stock alerts from inventory_summary view
    sb.from('inventory_summary')
      .select('brand, component_key, display_name, unit, current_stock')
      .lt('current_stock', 10)
      .order('current_stock'),

    // Q8 – 10 most recent orders for activity feed
    sb.from('orders')
      .select('id, created_at, order_date, tracking_number, fb_name, total_price, status, payment_status, is_cod, package_name, package_snapshot, projects(code), customers(name)')
      .order('created_at', { ascending: false })
      .limit(10),

    // Q9 – follow-ups due today
    sb.from('customers')
      .select('id, name, phone, customer_tag')
      .eq('follow_up_date', today)
      .limit(5),

    // Q10 – dormant + lost counts
    sb.from('customers')
      .select('customer_tag')
      .in('customer_tag', ['Dormant', 'Lost']),
  ])

  // ── Today's Snapshot ─────────────────────────────────────────────────────────
  const todayList      = todayRaw    ?? []
  const yesterdayList  = yesterdayRaw ?? []
  const todayOrders    = todayList.length
  const yesterdayOrders = yesterdayList.length
  const todayRevenue   = todayList.reduce((s, o) => s + Number(o.total_price  ?? 0), 0)
  const yesterdayRevenue = yesterdayList.reduce((s, o) => s + Number(o.total_price ?? 0), 0)
  const todayProfit    = todayList.reduce((s, o) => s + Number(o.profit ?? 0), 0)
  const pendingCOD     = (pendingCODRaw ?? []).reduce((s, o) => s + Number(o.total_price ?? 0), 0)

  // ── Monthly Overview ─────────────────────────────────────────────────────────
  const thisMonthList  = thisMonthRaw ?? []
  const lastMonthList  = lastMonthRaw ?? []

  const thisMonthRevenue  = thisMonthList.reduce((s, o) => s + Number(o.total_price ?? 0), 0)
  const thisMonthProfit   = thisMonthList.reduce((s, o) => s + Number(o.profit      ?? 0), 0)
  const thisMonthOrders   = thisMonthList.length
  const settledCount      = thisMonthList.filter(o => o.payment_status === 'Settled').length
  const settlementRate    = thisMonthOrders > 0 ? (settledCount / thisMonthOrders) * 100 : 0

  // Book Sales = all non-cancelled orders; Settle Sales = only Settled
  const thisMonthBookSales    = thisMonthRevenue
  const thisMonthSettleSales  = thisMonthList
    .filter(o => o.payment_status === 'Settled')
    .reduce((s, o) => s + Number(o.total_price ?? 0), 0)

  // COD performance this month
  const codOrders = thisMonthList.filter(o => o.is_cod === true)
  const codPendingDelivery = codOrders.filter(o => !o.delivery_status || o.delivery_status === 'pending_delivery' || o.delivery_status === 'out_for_delivery')
  const codDelivered       = codOrders.filter(o => (o.delivery_status as string | null) === 'delivered' || o.payment_status === 'Settled')
  const codReturned        = codOrders.filter(o => (o.delivery_status as string | null) === 'returned' || (o.delivery_status as string | null) === 'failed')
  const codPerformance = {
    pendingCount:   codPendingDelivery.length,
    pendingAmount:  codPendingDelivery.reduce((s, o) => s + Number(o.total_price ?? 0), 0),
    deliveredCount: codDelivered.length,
    deliveredAmount:codDelivered.reduce((s, o) => s + Number(o.total_price ?? 0), 0),
    returnedCount:  codReturned.length,
    returnedAmount: codReturned.reduce((s, o) => s + Number(o.total_price ?? 0), 0),
  }

  const lastMonthRevenue  = lastMonthList.reduce((s, o) => s + Number(o.total_price ?? 0), 0)
  const lastMonthProfit   = lastMonthList.reduce((s, o) => s + Number(o.profit      ?? 0), 0)
  const lastMonthOrders   = lastMonthList.length

  // ── Revenue Trend (30 days) ──────────────────────────────────────────────────
  const trendMap: Record<string, { revenue: number; profit: number; orders: number }> = {}
  for (let i = 29; i >= 0; i--) {
    const key = subDays(now, i).toISOString().split('T')[0]
    trendMap[key] = { revenue: 0, profit: 0, orders: 0 }
  }
  ;(trendRaw ?? []).forEach(o => {
    const k = o.order_date
    if (trendMap[k]) {
      trendMap[k].revenue += Number(o.total_price ?? 0)
      trendMap[k].profit  += Number(o.profit      ?? 0)
      trendMap[k].orders  += 1
    }
  })
  const trendChartData: TrendDataPoint[] = Object.entries(trendMap).map(([date, v]) => ({
    date: format(new Date(date + 'T12:00:00'), 'dd MMM'),
    ...v,
  }))

  // ── Revenue by Brand ─────────────────────────────────────────────────────────
  const brandMap: Record<string, number> = {}
  thisMonthList.forEach(o => {
    const code = (o.projects as any)?.code ?? 'Other'
    brandMap[code] = (brandMap[code] ?? 0) + Number(o.total_price ?? 0)
  })
  const brandChartData: BrandDataPoint[] = Object.entries(brandMap)
    .map(([brand, revenue]) => ({
      brand,
      revenue,
      pct: thisMonthRevenue > 0 ? (revenue / thisMonthRevenue) * 100 : 0,
    }))
    .sort((a, b) => b.revenue - a.revenue)

  // ── Top 5 Packages This Month ────────────────────────────────────────────────
  type PkgEntry = { name: string; brand: string; projectId: string | null; count: number; revenue: number; profit: number }
  const pkgMap: Record<string, PkgEntry> = {}
  thisMonthList.forEach(o => {
    const proj   = o.projects as any
    const brand  = proj?.code     ?? '?'
    const projId = o.project_id   ?? null
    const name   = o.package_name ?? (o.package_snapshot as any)?.name ?? 'Unknown Package'
    const key    = `${name}|${projId ?? 'x'}`
    if (!pkgMap[key]) pkgMap[key] = { name, brand, projectId: projId, count: 0, revenue: 0, profit: 0 }
    pkgMap[key].count   += 1
    pkgMap[key].revenue += Number(o.total_price ?? 0)
    pkgMap[key].profit  += Number(o.profit      ?? 0)
  })
  const topPackages = Object.values(pkgMap)
    .sort((a, b) => b.count - a.count)
    .slice(0, 5)

  // ── Low Stock ────────────────────────────────────────────────────────────────
  type StockAlert = { brand: string; displayName: string; unit: string; stock: number }
  const lowStock: StockAlert[] = (lowStockRaw ?? []).map((r: any) => ({
    brand:       r.brand        ?? '',
    displayName: r.display_name ?? r.component_key ?? '—',
    unit:        r.unit         ?? '',
    stock:       Number(r.current_stock ?? 0),
  }))

  // ── Recent Orders ─────────────────────────────────────────────────────────────
  type RecentOrder = {
    id: string; createdAt: string; tracking: string | null; customer: string
    brand: string; pkg: string; amount: number; status: string; paymentStatus: string | null; isCod: boolean
  }
  const recentOrders: RecentOrder[] = (recentRaw ?? []).map((o: any) => ({
    id:            o.id,
    createdAt:     o.created_at,
    tracking:      o.tracking_number ?? null,
    customer:      o.customers?.name ?? o.fb_name ?? '—',
    brand:         o.projects?.code  ?? '?',
    pkg:           o.package_name    ?? o.package_snapshot?.name ?? '—',
    amount:        Number(o.total_price ?? 0),
    status:        o.status,
    paymentStatus: o.payment_status ?? null,
    isCod:         Boolean(o.is_cod),
  }))

  // ── CRM Alerts ────────────────────────────────────────────────────────────────
  type FollowUpCustomer = { id: string; name: string; phone: string; customer_tag: string }
  const followUpToday: FollowUpCustomer[] = (followUpTodayRaw ?? []) as FollowUpCustomer[]
  const dormantCount = (crmTagRaw ?? []).filter((c: any) => c.customer_tag === 'Dormant').length
  const lostCount    = (crmTagRaw ?? []).filter((c: any) => c.customer_tag === 'Lost').length

  return {
    today:    { orders: todayOrders,   revenue: todayRevenue,   profit: todayProfit },
    yesterday:{ orders: yesterdayOrders, revenue: yesterdayRevenue },
    pendingCOD,
    thisMonth: { revenue: thisMonthRevenue, profit: thisMonthProfit, orders: thisMonthOrders, settlementRate, bookSales: thisMonthBookSales, settleSales: thisMonthSettleSales },
    lastMonth: { revenue: lastMonthRevenue, profit: lastMonthProfit, orders: lastMonthOrders },
    codPerformance,
    trendChartData,
    brandChartData,
    topPackages,
    lowStock,
    recentOrders,
    crmAlerts: { followUpToday, dormantCount, lostCount },
  }
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default async function DashboardPage() {
  const d = await fetchDashboardData()

  return (
    <div className="space-y-6 pb-10">
      <PageHeader
        title="Dashboard"
        description="Command Center — today's business at a glance"
      />

      {/* ── Row 1: Today's Snapshot ─────────────────────────────────────────── */}
      <section>
        <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-3">
          Today&apos;s Snapshot
        </h2>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {/* Today's Orders */}
          <Card className="shadow-sm hover:shadow-md transition-shadow">
            <CardContent className="pt-5">
              <div className="flex items-start justify-between">
                <div>
                  <p className="text-xs font-medium text-muted-foreground">Today&apos;s Orders</p>
                  <p className="text-3xl font-bold mt-1">{d.today.orders}</p>
                  <ChangeIndicator current={d.today.orders} previous={d.yesterday.orders} suffix="vs yesterday" />
                </div>
                <div className="p-2 bg-green-50 rounded-lg">
                  <ShoppingCart className="h-5 w-5 text-green-600" />
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Today's Revenue */}
          <Card className="shadow-sm hover:shadow-md transition-shadow">
            <CardContent className="pt-5">
              <div className="flex items-start justify-between">
                <div>
                  <p className="text-xs font-medium text-muted-foreground">Today&apos;s Revenue</p>
                  <p className="text-2xl font-bold mt-1">{formatCurrency(d.today.revenue)}</p>
                  <ChangeIndicator current={d.today.revenue} previous={d.yesterday.revenue} suffix="vs yesterday" />
                </div>
                <div className="p-2 bg-green-50 rounded-lg">
                  <DollarSign className="h-5 w-5 text-green-600" />
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Pending COD */}
          <Card className="shadow-sm hover:shadow-md transition-shadow">
            <CardContent className="pt-5">
              <div className="flex items-start justify-between">
                <div>
                  <p className="text-xs font-medium text-muted-foreground">Pending COD</p>
                  <p className="text-2xl font-bold mt-1">{formatCurrency(d.pendingCOD)}</p>
                  <p className="text-xs text-muted-foreground mt-1">waiting to collect</p>
                </div>
                <div className="p-2 bg-amber-50 rounded-lg">
                  <Clock className="h-5 w-5 text-amber-600" />
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Today's Profit */}
          <Card className="shadow-sm hover:shadow-md transition-shadow">
            <CardContent className="pt-5">
              <div className="flex items-start justify-between">
                <div>
                  <p className="text-xs font-medium text-muted-foreground">Today&apos;s Profit</p>
                  <p className="text-2xl font-bold mt-1">{formatCurrency(d.today.profit)}</p>
                  <p className="text-xs text-muted-foreground mt-1">revenue minus costs</p>
                </div>
                <div className="p-2 bg-blue-50 rounded-lg">
                  <TrendingUp className="h-5 w-5 text-blue-600" />
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      </section>

      {/* ── Row 2: Monthly Overview ────────────────────────────────────────────── */}
      <section>
        <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-3">
          Monthly Overview
        </h2>
        <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
          {/* Book Sales */}
          <Card className="shadow-sm hover:shadow-md transition-shadow border-l-4 border-l-blue-500">
            <CardContent className="pt-5">
              <div className="flex items-start justify-between">
                <div>
                  <p className="text-xs font-medium text-muted-foreground">Book Sales</p>
                  <p className="text-2xl font-bold mt-1">{formatCurrency(d.thisMonth.bookSales)}</p>
                  <p className="text-xs text-muted-foreground mt-1">All orders incl. pending COD</p>
                </div>
                <div className="p-2 bg-blue-50 rounded-lg">
                  <DollarSign className="h-5 w-5 text-blue-600" />
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Settle Sales */}
          <Card className="shadow-sm hover:shadow-md transition-shadow border-l-4 border-l-green-500">
            <CardContent className="pt-5">
              <div className="flex items-start justify-between">
                <div>
                  <p className="text-xs font-medium text-muted-foreground">Settle Sales</p>
                  <p className="text-2xl font-bold mt-1">{formatCurrency(d.thisMonth.settleSales)}</p>
                  <p className="text-xs text-muted-foreground mt-1">Confirmed payments only</p>
                </div>
                <div className="p-2 bg-green-50 rounded-lg">
                  <CheckCircle2 className="h-5 w-5 text-green-600" />
                </div>
              </div>
            </CardContent>
          </Card>

          {/* This Month Orders */}
          <Card className="shadow-sm hover:shadow-md transition-shadow">
            <CardContent className="pt-5">
              <div className="flex items-start justify-between">
                <div>
                  <p className="text-xs font-medium text-muted-foreground">This Month Orders</p>
                  <p className="text-3xl font-bold mt-1">{d.thisMonth.orders}</p>
                  <ChangeIndicator current={d.thisMonth.orders} previous={d.lastMonth.orders} suffix="vs last month" />
                </div>
                <div className="p-2 bg-green-50 rounded-lg">
                  <ShoppingCart className="h-5 w-5 text-green-600" />
                </div>
              </div>
            </CardContent>
          </Card>

          {/* This Month Profit */}
          <Card className="shadow-sm hover:shadow-md transition-shadow">
            <CardContent className="pt-5">
              <div className="flex items-start justify-between">
                <div>
                  <p className="text-xs font-medium text-muted-foreground">This Month Profit</p>
                  <p className="text-2xl font-bold mt-1">{formatCurrency(d.thisMonth.profit)}</p>
                  <ChangeIndicator current={d.thisMonth.profit} previous={d.lastMonth.profit} suffix="vs last month" />
                </div>
                <div className="p-2 bg-blue-50 rounded-lg">
                  <TrendingUp className="h-5 w-5 text-blue-600" />
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Settlement Rate */}
          <Card className="shadow-sm hover:shadow-md transition-shadow">
            <CardContent className="pt-5">
              <div className="flex items-start justify-between">
                <div>
                  <p className="text-xs font-medium text-muted-foreground">Settlement Rate</p>
                  <p className="text-3xl font-bold mt-1">{d.thisMonth.settlementRate.toFixed(0)}%</p>
                  <p className="text-xs text-muted-foreground mt-1">
                    settled this month
                  </p>
                </div>
                <div className="p-2 bg-purple-50 rounded-lg">
                  <Percent className="h-5 w-5 text-purple-600" />
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      </section>

      {/* ── Row 3: CRM Alerts ─────────────────────────────────────────────────── */}
      {(d.crmAlerts.followUpToday.length > 0 || d.crmAlerts.dormantCount > 0 || d.crmAlerts.lostCount > 0) && (
        <section>
          <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-3">
            CRM Alerts
          </h2>
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
            {/* Follow-ups due today */}
            <Card className="shadow-sm border-amber-200 bg-amber-50/40">
              <CardContent className="pt-4">
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2">
                    <Bell className="h-4 w-4 text-amber-600" />
                    <span className="text-sm font-semibold text-amber-800">Follow-ups Today</span>
                  </div>
                  <Link href="/customers?tag=followup"
                    className="text-xs text-amber-700 hover:underline flex items-center gap-1">
                    View all <ArrowRight className="h-3 w-3" />
                  </Link>
                </div>
                {d.crmAlerts.followUpToday.length === 0 ? (
                  <p className="text-sm text-muted-foreground">None due today</p>
                ) : (
                  <ul className="space-y-1.5">
                    {d.crmAlerts.followUpToday.map(c => (
                      <li key={c.id} className="flex items-center justify-between">
                        <Link href={`/customers/${c.id}`}
                          className="text-sm font-medium hover:text-amber-700 hover:underline">
                          {c.name}
                        </Link>
                        <span className="text-xs text-amber-700 font-medium">{c.customer_tag}</span>
                      </li>
                    ))}
                  </ul>
                )}
              </CardContent>
            </Card>

            {/* Dormant */}
            <Card className={`shadow-sm ${d.crmAlerts.dormantCount > 0 ? 'border-orange-200 bg-orange-50/40' : ''}`}>
              <CardContent className="pt-4">
                <div className="flex items-center gap-2 mb-2">
                  <Users className="h-4 w-4 text-orange-500" />
                  <span className="text-sm font-semibold text-orange-800">Dormant Customers</span>
                </div>
                <p className="text-3xl font-bold text-orange-700">{d.crmAlerts.dormantCount}</p>
                <p className="text-xs text-muted-foreground mt-1">no order in 31–90 days</p>
                <Link href="/customers" className="text-xs text-orange-600 hover:underline mt-2 inline-flex items-center gap-1">
                  View customers <ArrowRight className="h-3 w-3" />
                </Link>
              </CardContent>
            </Card>

            {/* Lost */}
            <Card className={`shadow-sm ${d.crmAlerts.lostCount > 0 ? 'border-red-200 bg-red-50/40' : ''}`}>
              <CardContent className="pt-4">
                <div className="flex items-center gap-2 mb-2">
                  <Crown className="h-4 w-4 text-red-500" />
                  <span className="text-sm font-semibold text-red-800">Lost Customers</span>
                </div>
                <p className="text-3xl font-bold text-red-700">{d.crmAlerts.lostCount}</p>
                <p className="text-xs text-muted-foreground mt-1">no order in 90+ days — win back</p>
                <Link href="/customers" className="text-xs text-red-600 hover:underline mt-2 inline-flex items-center gap-1">
                  View customers <ArrowRight className="h-3 w-3" />
                </Link>
              </CardContent>
            </Card>
          </div>
        </section>
      )}

      {/* ── COD Performance ───────────────────────────────────────────────────── */}
      <section>
        <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-3">
          COD Performance — This Month
        </h2>
        <div className="grid grid-cols-3 gap-4">
          <Card className="shadow-sm border-amber-200 bg-amber-50/30">
            <CardContent className="pt-4">
              <div className="flex items-center gap-2 mb-1">
                <Clock className="h-4 w-4 text-amber-600" />
                <span className="text-xs font-semibold text-amber-800">Pending Delivery</span>
              </div>
              <p className="text-2xl font-bold text-amber-700">{d.codPerformance.pendingCount}</p>
              <p className="text-xs text-muted-foreground mt-0.5">{formatCurrency(d.codPerformance.pendingAmount)}</p>
            </CardContent>
          </Card>
          <Card className="shadow-sm border-green-200 bg-green-50/30">
            <CardContent className="pt-4">
              <div className="flex items-center gap-2 mb-1">
                <CheckCircle2 className="h-4 w-4 text-green-600" />
                <span className="text-xs font-semibold text-green-800">Delivered</span>
              </div>
              <p className="text-2xl font-bold text-green-700">{d.codPerformance.deliveredCount}</p>
              <p className="text-xs text-muted-foreground mt-0.5">{formatCurrency(d.codPerformance.deliveredAmount)}</p>
            </CardContent>
          </Card>
          <Card className="shadow-sm border-red-200 bg-red-50/30">
            <CardContent className="pt-4">
              <div className="flex items-center gap-2 mb-1">
                <AlertTriangle className="h-4 w-4 text-red-500" />
                <span className="text-xs font-semibold text-red-800">Returned / Failed</span>
              </div>
              <p className="text-2xl font-bold text-red-700">{d.codPerformance.returnedCount}</p>
              <p className="text-xs text-muted-foreground mt-0.5">{formatCurrency(d.codPerformance.returnedAmount)}</p>
            </CardContent>
          </Card>
        </div>
      </section>

      {/* ── Row 4: Charts ──────────────────────────────────────────────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <RevenueTrendChart data={d.trendChartData} />
        <BrandRevenueChart data={d.brandChartData} />
      </div>

      {/* ── Row 4: Key Tables ──────────────────────────────────────────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Top 5 Packages */}
        <Card className="shadow-sm">
          <CardHeader className="pb-2">
            <CardTitle className="text-base font-semibold">Top Packages — This Month</CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            {d.topPackages.length === 0 ? (
              <div className="flex items-center justify-center h-32 text-muted-foreground text-sm">
                No orders yet this month
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow className="text-xs">
                    <TableHead className="w-8">#</TableHead>
                    <TableHead>Package</TableHead>
                    <TableHead className="text-center">Brand</TableHead>
                    <TableHead className="text-right">Orders</TableHead>
                    <TableHead className="text-right">Revenue</TableHead>
                    <TableHead className="text-right">Profit</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {d.topPackages.map((pkg, i) => (
                    <TableRow
                      key={`${pkg.name}-${pkg.projectId}`}
                      className="text-sm hover:bg-muted/40 transition-colors"
                    >
                      <TableCell className="font-medium text-muted-foreground">{i + 1}</TableCell>
                      <TableCell>
                        {pkg.projectId ? (
                          <Link
                            href={`/projects/${pkg.projectId}`}
                            className="hover:text-green-600 hover:underline transition-colors font-medium truncate max-w-[140px] block"
                          >
                            {pkg.name}
                          </Link>
                        ) : (
                          <span className="font-medium truncate max-w-[140px] block">{pkg.name}</span>
                        )}
                      </TableCell>
                      <TableCell className="text-center">
                        <BrandBadge brand={pkg.brand} />
                      </TableCell>
                      <TableCell className="text-right font-semibold">{pkg.count}</TableCell>
                      <TableCell className="text-right text-xs">{formatCurrency(pkg.revenue)}</TableCell>
                      <TableCell className={`text-right text-xs font-medium ${pkg.profit >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                        {formatCurrency(pkg.profit)}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>

        {/* Low Stock Alerts */}
        <Card className="shadow-sm">
          <CardHeader className="pb-2 flex flex-row items-center justify-between">
            <CardTitle className="text-base font-semibold">Low Stock Alerts</CardTitle>
            <Link
              href="/inventory"
              className="text-xs text-muted-foreground hover:text-green-600 flex items-center gap-1 transition-colors"
            >
              View all <ArrowRight className="h-3 w-3" />
            </Link>
          </CardHeader>
          <CardContent className="p-0">
            {d.lowStock.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-32 text-center gap-2">
                <CheckCircle2 className="h-8 w-8 text-green-500" />
                <p className="text-sm font-medium text-green-700">All stock levels healthy</p>
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow className="text-xs">
                    <TableHead className="text-center">Brand</TableHead>
                    <TableHead>Component</TableHead>
                    <TableHead className="text-center">Unit</TableHead>
                    <TableHead className="text-right">Stock</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {d.lowStock.map((item, i) => (
                    <TableRow key={i} className="text-sm hover:bg-muted/40 transition-colors">
                      <TableCell className="text-center">
                        <BrandBadge brand={item.brand} />
                      </TableCell>
                      <TableCell className="font-medium">{item.displayName}</TableCell>
                      <TableCell className="text-center text-xs text-muted-foreground">{item.unit}</TableCell>
                      <TableCell className="text-right">
                        <span className={`font-bold text-sm ${item.stock < 5 ? 'text-red-600' : 'text-amber-600'}`}>
                          {item.stock}
                          {item.stock < 5 && (
                            <AlertTriangle className="h-3 w-3 inline ml-1" />
                          )}
                        </span>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      </div>

      {/* ── Row 5: Recent Activity ─────────────────────────────────────────────── */}
      <Card className="shadow-sm">
        <CardHeader className="pb-2 flex flex-row items-center justify-between">
          <CardTitle className="text-base font-semibold">Recent Activity</CardTitle>
          <Link
            href="/orders"
            className="text-xs text-muted-foreground hover:text-green-600 flex items-center gap-1 transition-colors"
          >
            View all orders <ArrowRight className="h-3 w-3" />
          </Link>
        </CardHeader>
        <CardContent className="p-0">
          {d.recentOrders.length === 0 ? (
            <div className="flex items-center justify-center h-24 text-muted-foreground text-sm">
              No orders yet
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow className="text-xs">
                    <TableHead>Time</TableHead>
                    <TableHead>Tracking #</TableHead>
                    <TableHead>Customer</TableHead>
                    <TableHead className="text-center">Brand</TableHead>
                    <TableHead>Package</TableHead>
                    <TableHead className="text-right">Amount</TableHead>
                    <TableHead className="text-center">Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {d.recentOrders.map((o) => (
                    <TableRow key={o.id} className="text-sm hover:bg-muted/40 transition-colors">
                      <TableCell className="text-xs text-muted-foreground whitespace-nowrap">
                        {format(new Date(o.createdAt), 'dd MMM HH:mm')}
                      </TableCell>
                      <TableCell className="font-mono text-xs">
                        {o.tracking ?? <span className="text-muted-foreground">—</span>}
                      </TableCell>
                      <TableCell className="max-w-[130px] truncate">{o.customer}</TableCell>
                      <TableCell className="text-center">
                        <BrandBadge brand={o.brand} />
                      </TableCell>
                      <TableCell className="max-w-[150px] truncate text-xs">{o.pkg}</TableCell>
                      <TableCell className="text-right font-medium text-xs whitespace-nowrap">
                        {formatCurrency(o.amount)}
                        {o.isCod && (
                          <span className="ml-1 text-amber-600 text-xs">(COD)</span>
                        )}
                      </TableCell>
                      <TableCell className="text-center">
                        <div className="flex flex-col items-center gap-1">
                          <StatusBadge status={o.status} />
                          {o.paymentStatus && (
                            <span className={`text-xs ${o.paymentStatus === 'Settled' ? 'text-green-600' : 'text-amber-600'}`}>
                              {o.paymentStatus}
                            </span>
                          )}
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* ── Row 6: Quick Actions ───────────────────────────────────────────────── */}
      <Card className="shadow-sm">
        <CardHeader className="pb-2">
          <CardTitle className="text-base font-semibold">Quick Actions</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap gap-3">
            <Link
              href="/orders"
              className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-green-600 hover:bg-green-700 text-white text-sm font-medium transition-colors"
            >
              <Plus className="h-4 w-4" />
              Add Order
            </Link>
            <Link
              href="/orders/import"
              className="inline-flex items-center gap-2 px-4 py-2 rounded-lg border bg-white hover:bg-muted/50 text-sm font-medium transition-colors"
            >
              <Upload className="h-4 w-4" />
              Import CSV
            </Link>
            <Link
              href="/inventory"
              className="inline-flex items-center gap-2 px-4 py-2 rounded-lg border bg-white hover:bg-muted/50 text-sm font-medium transition-colors"
            >
              <Warehouse className="h-4 w-4" />
              Stock In
            </Link>
            <Link
              href="/sales-report"
              className="inline-flex items-center gap-2 px-4 py-2 rounded-lg border bg-white hover:bg-muted/50 text-sm font-medium transition-colors"
            >
              <BarChart3 className="h-4 w-4" />
              View Reports
            </Link>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
