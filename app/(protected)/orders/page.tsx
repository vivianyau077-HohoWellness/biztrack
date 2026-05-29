'use client'

import { useState, useMemo, Fragment, useEffect, Suspense } from 'react'
import { useSearchParams, useRouter, usePathname } from 'next/navigation'
import { useOrders } from '@/lib/hooks/useOrders'
import { useProjects } from '@/lib/hooks/useProjects'
import PageHeader from '@/components/shared/PageHeader'
import StatCard from '@/components/shared/StatCard'
import LoadingState from '@/components/shared/LoadingState'
import EmptyState from '@/components/shared/EmptyState'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { formatCurrency, formatDate } from '@/lib/utils'
import { Plus, ShoppingCart, Download, History, ChevronLeft, ChevronRight, ChevronDown, ChevronUp, Receipt, User, FileText } from 'lucide-react'
import DateRangePicker from '@/components/shared/DateRangePicker'
import type { OrderFilters, Order } from '@/lib/types'
import { exportOrders } from '@/lib/export-utils'
import { fetchPackageComponents } from '@/app/actions/catalog'
import { useCleanupDialogArtifacts } from '@/lib/hooks/use-cleanup-dialog-artifacts'
import AddOrderModal from '@/components/modules/orders/AddOrderModal'
import OrderActions from '@/components/modules/orders/OrderActions'
import SyncLarkButton from '@/components/modules/orders/SyncLarkButton'
import { BRAND_COLORS, BRANDS } from '@/lib/constants'
import Link from 'next/link'
import { cn } from '@/lib/utils'

type ViewMode = 'day' | 'week' | 'month'
const PAGE_SIZE = 50
const RECEIPT_BRANDS = ['DD', 'NE', 'Juji']

function isOrderIncomplete(order: Order, projectName: string | null): boolean {
  const needsReceipt = projectName !== null && RECEIPT_BRANDS.includes(projectName)
  const missingReceipt = needsReceipt && !(order.customers as any)?.receipt_url
  const missingNewRepeat = (order.is_new_customer as unknown) == null
  const missingReason = !order.purchase_reason || order.purchase_reason.trim() === ''
  return !!(missingReceipt || missingNewRepeat || missingReason)
}

function toDateStr(d: Date) {
  return d.toISOString().split('T')[0]
}

function getToday() {
  return toDateStr(new Date())
}

function getThisWeek() {
  const now = new Date()
  const dow = now.getDay()
  const diff = dow === 0 ? -6 : 1 - dow
  const mon = new Date(now)
  mon.setDate(now.getDate() + diff)
  const sun = new Date(mon)
  sun.setDate(mon.getDate() + 6)
  return { from: toDateStr(mon), to: toDateStr(sun) }
}

function getLastWeek() {
  const { from } = getThisWeek()
  const mon = new Date(from)
  mon.setDate(mon.getDate() - 7)
  const sun = new Date(mon)
  sun.setDate(mon.getDate() + 6)
  return { from: toDateStr(mon), to: toDateStr(sun) }
}

function getThisMonth() {
  const now = new Date()
  return {
    from: toDateStr(new Date(now.getFullYear(), now.getMonth(), 1)),
    to: toDateStr(new Date(now.getFullYear(), now.getMonth() + 1, 0)),
  }
}

function getLastMonth() {
  const now = new Date()
  return {
    from: toDateStr(new Date(now.getFullYear(), now.getMonth() - 1, 1)),
    to: toDateStr(new Date(now.getFullYear(), now.getMonth(), 0)),
  }
}

function fmtRangeHeader(from: string, to: string) {
  const f = new Date(from + 'T00:00:00')
  const t = new Date(to + 'T00:00:00')
  if (from === to) return f.toLocaleDateString('en-MY', { day: 'numeric', month: 'short', year: 'numeric' })
  return `${f.toLocaleDateString('en-MY', { day: 'numeric', month: 'short' })} – ${t.toLocaleDateString('en-MY', { day: 'numeric', month: 'short', year: 'numeric' })}`
}

function fmtDayHeading(dateStr: string) {
  return new Date(dateStr + 'T00:00:00').toLocaleDateString('en-MY', {
    weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
  })
}

const PRESETS = [
  ['Today', 'today'], ['Yesterday', 'yesterday'],
  ['This Week', 'this-week'], ['Last Week', 'last-week'],
  ['This Month', 'this-month'], ['Last Month', 'last-month'],
] as const

function TableHeaders({ showDate = false }: { showDate?: boolean }) {
  return (
    <TableRow>
      {showDate && <TableHead>Date</TableHead>}
      <TableHead>Time</TableHead>
      <TableHead>Tracking #</TableHead>
      <TableHead>Customer</TableHead>
      <TableHead>Brand</TableHead>
      <TableHead>Package</TableHead>
      <TableHead className="text-right">Amount</TableHead>
      <TableHead>Platform</TableHead>
      <TableHead>Method</TableHead>
      <TableHead>Payment</TableHead>
      <TableHead>State</TableHead>
      <TableHead>COD Payout</TableHead>
      <TableHead className="w-28" />
    </TableRow>
  )
}

const YEAR_OPTIONS = ['2026', '2025', 'All Years'] as const
type YearOption = typeof YEAR_OPTIONS[number]

function getYearBounds(year: YearOption): { yearFrom?: string; yearTo?: string } {
  if (year === '2026') return { yearFrom: '2026-01-01', yearTo: '2026-12-31' }
  if (year === '2025') return { yearFrom: '2025-01-01', yearTo: '2025-12-31' }
  return {}
}

function OrdersPageInner() {
  useCleanupDialogArtifacts()
  const searchParams = useSearchParams()
  const router = useRouter()
  const pathname = usePathname()
  const today = getToday()
  const thisWeek = getThisWeek()

  const selectedYear = (searchParams.get('year') ?? '2026') as YearOption

  const [dateFrom, setDateFrom] = useState(thisWeek.from)
  const [dateTo, setDateTo] = useState(thisWeek.to)
  const [viewMode, setViewMode] = useState<ViewMode>('week')
  const [selectedBrand, setSelectedBrand] = useState('All')
  const [search, setSearch] = useState('')
  const [page, setPage] = useState(1)
  const [showAddModal, setShowAddModal] = useState(false)
  const [expandedDays, setExpandedDays] = useState<Set<string>>(new Set())
  const [expandedOrders, setExpandedOrders] = useState<Set<string>>(new Set())
  const [incompleteFilter, setIncompleteFilter] = useState(false)

  // When ?batch=<id> is in the URL (e.g. from "View imported orders" link),
  // activate batch filter so orders are shown regardless of date range.
  const batchId = searchParams.get('batch') ?? undefined
  // Clear batch filter state when URL param is removed
  useEffect(() => { setPage(1) }, [batchId])

  const { projects } = useProjects()

  const brandProjectId = useMemo(() => {
    const map: Record<string, string> = {}
    for (const p of projects) map[p.name] = p.id
    return map
  }, [projects])

  const yearBounds = useMemo(() => getYearBounds(selectedYear), [selectedYear])

  // All orders for the range — for stats, tabs, week/month views
  const { data: allData } = useOrders(
    useMemo(() => {
      const f: OrderFilters = { pageSize: 9999, page: 1, ...yearBounds }
      if (batchId) { f.batchId = batchId } else { f.dateFrom = dateFrom; f.dateTo = dateTo }
      return f
    }, [dateFrom, dateTo, batchId, yearBounds])
  )

  // Paginated orders — for day view table (not used when incompleteFilter is on)
  const { data, isLoading, error } = useOrders(
    useMemo(() => {
      const f: OrderFilters = { page, pageSize: PAGE_SIZE, ...yearBounds }
      if (batchId) {
        f.batchId = batchId
      } else {
        f.dateFrom = dateFrom
        f.dateTo = dateTo
      }
      if (selectedBrand !== 'All' && selectedBrand !== 'Unassigned' && brandProjectId[selectedBrand])
        f.projectId = brandProjectId[selectedBrand]
      if (search.trim()) f.search = search.trim()
      return f
    }, [dateFrom, dateTo, batchId, selectedBrand, brandProjectId, page, search, yearBounds])
  )

  // Brand tab stats (count + revenue)
  const brandStats = useMemo(() => {
    const all = allData?.data ?? []
    const result: Record<string, { count: number; revenue: number }> = {
      All: { count: all.length, revenue: all.reduce((s, o) => s + Number(o.total_price), 0) },
      Unassigned: {
        count: all.filter(o => !o.project_id).length,
        revenue: all.filter(o => !o.project_id).reduce((s, o) => s + Number(o.total_price), 0),
      },
    }
    for (const brand of BRANDS) {
      const pid = brandProjectId[brand]
      const branded = pid ? all.filter(o => o.project_id === pid) : []
      result[brand] = { count: branded.length, revenue: branded.reduce((s, o) => s + Number(o.total_price), 0) }
    }
    return result
  }, [allData, brandProjectId])

  // Filtered + searched orders for stats and week/month group views
  const filteredOrders = useMemo(() => {
    const all = allData?.data ?? []
    let base = selectedBrand === 'All' ? all
      : selectedBrand === 'Unassigned' ? all.filter(o => !o.project_id)
      : all.filter(o => o.project_id === brandProjectId[selectedBrand])
    if (search.trim()) {
      const q = search.toLowerCase()
      base = base.filter(o =>
        (o.tracking_number ?? '').toLowerCase().includes(q) ||
        ((o.customers as any)?.name ?? '').toLowerCase().includes(q) ||
        ((o.customers as any)?.phone ?? '').toLowerCase().includes(q)
      )
    }
    return base
  }, [allData, selectedBrand, brandProjectId, search])

  const incompleteCount = useMemo(() =>
    filteredOrders.filter(o => isOrderIncomplete(o, (o.projects as any)?.name ?? null)).length,
    [filteredOrders]
  )

  const displayFilteredOrders = useMemo(() =>
    incompleteFilter
      ? filteredOrders.filter(o => isOrderIncomplete(o, (o.projects as any)?.name ?? null))
      : filteredOrders,
    [filteredOrders, incompleteFilter]
  )

  const stats = useMemo(() => {
    const total = filteredOrders.length
    const revenue = filteredOrders.reduce((s, o) => s + Number(o.total_price), 0)
    const settled = filteredOrders.filter(o => o.payment_status === 'Settled').reduce((s, o) => s + Number(o.total_price), 0)
    const newC = filteredOrders.filter(o => o.is_new_customer).length
    return { total, revenue, settled, unsettled: revenue - settled, avg: total ? revenue / total : 0, newC, repeatC: total - newC }
  }, [filteredOrders])

  const ordersByDay = useMemo(() => {
    const groups: Record<string, Order[]> = {}
    for (const o of displayFilteredOrders) {
      if (!groups[o.order_date]) groups[o.order_date] = []
      groups[o.order_date].push(o)
    }
    return groups
  }, [displayFilteredOrders])

  const sortedDays = useMemo(() => Object.keys(ordersByDay).sort((a, b) => b.localeCompare(a)), [ordersByDay])

  const calendarDays = useMemo(() => {
    if (viewMode !== 'month') return []
    const start = new Date(dateFrom + 'T00:00:00')
    const year = start.getFullYear()
    const month = start.getMonth()
    const firstDow = new Date(year, month, 1).getDay()
    const pad = firstDow === 0 ? 6 : firstDow - 1
    const lastDay = new Date(year, month + 1, 0).getDate()
    const days: (string | null)[] = Array(pad).fill(null)
    for (let d = 1; d <= lastDay; d++) days.push(toDateStr(new Date(year, month, d)))
    while (days.length % 7 !== 0) days.push(null)
    return days
  }, [viewMode, dateFrom])

  function applyPreset(key: string) {
    setPage(1)
    if (key === 'today') { setDateFrom(today); setDateTo(today); setViewMode('day') }
    else if (key === 'yesterday') {
      const y = new Date(); y.setDate(y.getDate() - 1); const s = toDateStr(y)
      setDateFrom(s); setDateTo(s); setViewMode('day')
    } else if (key === 'this-week') { const r = getThisWeek(); setDateFrom(r.from); setDateTo(r.to); setViewMode('week') }
    else if (key === 'last-week') { const r = getLastWeek(); setDateFrom(r.from); setDateTo(r.to); setViewMode('week') }
    else if (key === 'this-month') { const r = getThisMonth(); setDateFrom(r.from); setDateTo(r.to); setViewMode('month') }
    else if (key === 'last-month') { const r = getLastMonth(); setDateFrom(r.from); setDateTo(r.to); setViewMode('month') }
  }

  function navigateDay(dir: -1 | 1) {
    const d = new Date(dateFrom + 'T00:00:00')
    d.setDate(d.getDate() + dir)
    const s = toDateStr(d)
    setDateFrom(s); setDateTo(s); setPage(1)
  }

  function toggleDay(day: string) {
    setExpandedDays(prev => { const n = new Set(prev); n.has(day) ? n.delete(day) : n.add(day); return n })
  }

  function toggleOrder(id: string) {
    setExpandedOrders(prev => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n })
  }

  function setYear(year: YearOption) {
    const params = new URLSearchParams(searchParams.toString())
    if (year === '2026') params.delete('year')
    else params.set('year', year)
    router.replace(`${pathname}?${params.toString()}`)
    setPage(1)
  }

  async function handleExport() {
    let componentMap: Record<string, Record<string, number>> | undefined
    if (selectedBrand === 'DD' || selectedBrand === 'NE') {
      try { componentMap = await fetchPackageComponents(selectedBrand) } catch { /* best-effort */ }
    }
    exportOrders(filteredOrders, selectedBrand, undefined, componentMap)
  }

  // Render order rows (main + expandable detail) — returns array for flatMap
  function renderOrderRows(order: Order, showDate: boolean) {
    const projectName = (order.projects as any)?.name ?? null
    const bc = projectName ? BRAND_COLORS[projectName] : null
    const pkgName = order.package_snapshot?.name ?? order.package_name ?? '—'
    const isSettled = order.payment_status === 'Settled'
    const isExp = expandedOrders.has(order.id)
    const colSpan = showDate ? 13 : 12

    const needsReceipt = projectName !== null && RECEIPT_BRANDS.includes(projectName)
    const missingReceipt = needsReceipt && !(order.customers as any)?.receipt_url
    const missingNewRepeat = (order.is_new_customer as unknown) == null
    const missingReason = !order.purchase_reason || order.purchase_reason.trim() === ''

    const mainRow = (
      <TableRow
        key={order.id}
        className="cursor-pointer hover:bg-muted/40"
        onClick={() => toggleOrder(order.id)}
      >
        {showDate && (
          <TableCell className="text-xs text-muted-foreground whitespace-nowrap">{formatDate(order.order_date)}</TableCell>
        )}
        <TableCell className="text-sm whitespace-nowrap text-muted-foreground">
          {order.created_at ? new Date(order.created_at).toLocaleTimeString('en-MY', { hour: '2-digit', minute: '2-digit' }) : '—'}
        </TableCell>
        <TableCell className="text-xs font-mono text-muted-foreground">{order.tracking_number ?? '—'}</TableCell>
        <TableCell className="font-medium">
          {(order.customers as any)?.name ?? '—'}
          {(order.customers as any)?.phone && (
            <div className="text-xs text-muted-foreground">{(order.customers as any).phone}</div>
          )}
          {(missingReceipt || missingNewRepeat || missingReason) && (
            <div className="flex gap-1 mt-0.5">
              {missingReceipt && (
                <span title="No receipt image">
                  <Receipt className="h-3 w-3 text-red-500" />
                </span>
              )}
              {missingNewRepeat && (
                <span title="New/Repeat not set">
                  <User className="h-3 w-3 text-amber-500" />
                </span>
              )}
              {missingReason && (
                <span title="No purchase reason">
                  <FileText className="h-3 w-3 text-gray-400" />
                </span>
              )}
            </div>
          )}
        </TableCell>
        <TableCell>
          {bc && projectName ? (
            <span className={cn('inline-flex items-center rounded-full px-2 py-0.5 text-xs font-semibold border', bc.bg, bc.text, bc.border)}>
              {projectName}
            </span>
          ) : projectName ? (
            <Badge variant="outline">{projectName}</Badge>
          ) : <span className="text-muted-foreground text-xs">—</span>}
        </TableCell>
        <TableCell className="text-sm max-w-[130px] truncate">{pkgName}</TableCell>
        <TableCell className="text-right font-medium whitespace-nowrap">{formatCurrency(Number(order.total_price))}</TableCell>
        <TableCell className="text-sm text-muted-foreground">{order.channel ?? '—'}</TableCell>
        <TableCell className="text-sm text-muted-foreground">{order.is_cod ? 'COD' : 'Prepaid'}</TableCell>
        <TableCell>
          {isSettled ? <Badge variant="success">Settled</Badge> : <Badge variant="warning">Pending</Badge>}
        </TableCell>
        <TableCell className="text-xs text-muted-foreground whitespace-nowrap">
          {order.state ?? '—'}
        </TableCell>
        <TableCell className="text-sm text-muted-foreground">
          {(order as any).cod_payout ? formatCurrency((order as any).cod_payout) : '—'}
        </TableCell>
        <TableCell onClick={e => e.stopPropagation()}>
          <OrderActions order={order} />
        </TableCell>
      </TableRow>
    )

    if (!isExp) return [mainRow]

    const detailRow = (
      <TableRow key={`${order.id}-detail`} className="bg-muted/20 hover:bg-muted/20">
        <TableCell colSpan={colSpan} className="py-3 px-6">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
            <div><span className="text-muted-foreground font-medium">Address: </span>{(order.customers as any)?.address ?? '—'}</div>
            <div><span className="text-muted-foreground font-medium">Courier: </span>{(order as any).courier ?? '—'}</div>
            <div><span className="text-muted-foreground font-medium">Source ID: </span>{(order as any).source_id ?? '—'}</div>
            <div><span className="text-muted-foreground font-medium">Remark: </span>{(order as any).remark ?? order.purchase_reason ?? '—'}</div>
          </div>
        </TableCell>
      </TableRow>
    )

    return [mainRow, detailRow]
  }

  const brandTabs = ['All', ...BRANDS, 'Unassigned']
  const totalPages = data ? Math.ceil(data.count / PAGE_SIZE) : 0

  return (
    <div>
      <PageHeader title="Orders" description={`Orders: ${fmtRangeHeader(dateFrom, dateTo)}`}>
        <SyncLarkButton />
        <Button variant="outline" size="sm" onClick={handleExport}>
          <Download className="h-4 w-4 mr-1" />Export CSV
        </Button>
        <Button variant="outline" size="sm" asChild>
          <Link href="/orders/import-history"><History className="h-4 w-4 mr-1" />History</Link>
        </Button>
        <Button size="sm" onClick={() => setShowAddModal(true)}>
          <Plus className="h-4 w-4 mr-1" />Add Order
        </Button>
      </PageHeader>

      {/* Batch import mode banner */}
      {batchId && (
        <div className="mb-4 flex items-center gap-3 rounded-md border border-blue-200 bg-blue-50 px-4 py-2 text-sm text-blue-800">
          <span className="font-medium">Showing imported batch</span>
          <span className="text-blue-500 text-xs font-mono">{batchId.slice(0, 8)}…</span>
          <Link href="/orders" className="ml-auto text-xs text-blue-600 underline underline-offset-2">
            Clear filter → all orders
          </Link>
        </div>
      )}

      {/* Quick presets + custom date range */}
      <div className={cn('flex flex-wrap items-center gap-2 mb-4', batchId && 'opacity-50 pointer-events-none')}>
        {PRESETS.map(([label, key]) => (
          <Button key={key} variant="outline" size="sm" className="h-8 text-xs" onClick={() => applyPreset(key)}>
            {label}
          </Button>
        ))}
        <DateRangePicker
          dateFrom={dateFrom}
          dateTo={dateTo}
          onChange={(f, t) => { setDateFrom(f); setDateTo(t); setPage(1) }}
        />
      </div>

      {/* View mode toggle + day navigation + search */}
      <div className="flex flex-wrap items-center gap-3 mb-4">
        <div className="flex rounded-md border overflow-hidden">
          {(['day', 'week', 'month'] as ViewMode[]).map(m => (
            <button
              key={m} onClick={() => setViewMode(m)}
              className={cn(
                'px-3 py-1.5 text-sm font-medium capitalize transition-colors',
                viewMode === m ? 'bg-primary text-primary-foreground' : 'bg-background text-muted-foreground hover:bg-muted'
              )}
            >
              {m}
            </button>
          ))}
        </div>
        {viewMode === 'day' && (
          <div className="flex items-center gap-1">
            <Button variant="outline" size="icon" className="h-8 w-8" onClick={() => navigateDay(-1)}>
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <span className="text-sm font-medium px-2 min-w-[200px] text-center">
              {new Date(dateFrom + 'T00:00:00').toLocaleDateString('en-MY', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' })}
            </span>
            <Button variant="outline" size="icon" className="h-8 w-8" onClick={() => navigateDay(1)}>
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        )}
        <button
          onClick={() => { setIncompleteFilter(f => !f); setPage(1) }}
          className={cn(
            'inline-flex items-center gap-1.5 h-8 px-3 rounded-md border text-xs font-medium transition-colors',
            incompleteFilter
              ? 'bg-amber-500 border-amber-500 text-white hover:bg-amber-600'
              : 'bg-background border-border text-muted-foreground hover:border-amber-400 hover:text-amber-600'
          )}
        >
          ⚠ Incomplete
          {incompleteCount > 0 && (
            <span className={cn(
              'rounded-full px-1.5 py-0.5 text-[10px] font-bold',
              incompleteFilter ? 'bg-white/20 text-white' : 'bg-amber-100 text-amber-700'
            )}>
              {incompleteCount}
            </span>
          )}
        </button>
        <Input
          placeholder="Search tracking #, customer, phone…"
          value={search}
          onChange={e => { setSearch(e.target.value); setPage(1) }}
          className="h-8 w-64 text-sm ml-auto"
        />
      </div>

      {/* Year + Brand filters row */}
      <div className="flex flex-wrap items-center gap-3 mb-3">
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium text-muted-foreground">Year</span>
          <div className="flex rounded-md border overflow-hidden">
            {YEAR_OPTIONS.map(y => (
              <button
                key={y}
                onClick={() => setYear(y)}
                className={cn(
                  'px-3 py-1.5 text-sm font-medium transition-colors',
                  selectedYear === y
                    ? 'bg-primary text-primary-foreground'
                    : 'bg-background text-muted-foreground hover:bg-muted'
                )}
              >
                {y}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Brand tabs */}
      <div className="flex flex-wrap gap-2 mb-4">
        {brandTabs.map(brand => {
          const bc = brand !== 'All' && brand !== 'Unassigned' ? BRAND_COLORS[brand] : null
          const isActive = selectedBrand === brand
          const s = brandStats[brand] ?? { count: 0, revenue: 0 }
          return (
            <button
              key={brand}
              onClick={() => { setSelectedBrand(brand); setPage(1) }}
              className={cn(
                'inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm font-medium border transition-colors',
                isActive
                  ? bc
                    ? `${bc.bg} ${bc.text} ${bc.border}`
                    : brand === 'Unassigned'
                      ? 'bg-gray-100 text-gray-700 border-gray-300'
                      : 'bg-primary text-primary-foreground border-primary'
                  : 'bg-background text-muted-foreground border-border hover:border-foreground/30'
              )}
            >
              {brand}
              <span className={cn(
                'text-xs rounded-full px-1.5 py-0.5 font-bold',
                isActive
                  ? bc ? `${bc.bg} ${bc.text}` : 'bg-primary/20 text-primary-foreground'
                  : 'bg-muted text-muted-foreground'
              )}>
                {s.count}
              </span>
              {s.revenue > 0 && <span className="text-xs opacity-60">{formatCurrency(s.revenue)}</span>}
            </button>
          )
        })}
      </div>

      {/* Summary stats */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3 mb-6">
        <StatCard title="Total Orders" value={stats.total} icon={ShoppingCart} />
        <StatCard title="Total Revenue" value={stats.revenue} isCurrency />
        <StatCard title="Settled" value={formatCurrency(stats.settled)} className="border-green-200 bg-green-50" />
        <StatCard title="Unsettled" value={formatCurrency(stats.unsettled)} className="border-yellow-200 bg-yellow-50" />
        <StatCard title="Avg Order" value={formatCurrency(stats.avg)} />
        <StatCard title="New / Repeat" value={`${stats.newC} / ${stats.repeatC}`} />
      </div>

      {/* MONTH VIEW — calendar grid */}
      {viewMode === 'month' && (
        <div className="rounded-lg border overflow-hidden mb-6">
          <div className="grid grid-cols-7">
            {['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map(d => (
              <div key={d} className="bg-muted/50 text-center text-xs font-semibold py-2 text-muted-foreground border-b">{d}</div>
            ))}
            {calendarDays.map((day, i) => {
              if (!day) return <div key={i} className="bg-muted/10 min-h-[90px] border-r border-b last:border-r-0" />
              const dayOrders = ordersByDay[day] ?? []
              const rev = dayOrders.reduce((s, o) => s + Number(o.total_price), 0)
              const isExp = expandedDays.has(day)
              const isToday = day === today
              return (
                <div
                  key={day}
                  className="min-h-[90px] p-2 border-r border-b last:border-r-0 bg-background hover:bg-muted/20 transition-colors cursor-pointer"
                  onClick={() => toggleDay(day)}
                >
                  <div className={cn(
                    'text-sm font-semibold mb-1 w-6 h-6 flex items-center justify-center rounded-full',
                    isToday ? 'bg-primary text-primary-foreground' : 'text-foreground'
                  )}>
                    {new Date(day + 'T00:00:00').getDate()}
                  </div>
                  {dayOrders.length > 0 && (
                    <>
                      <div className="text-xs font-medium">{dayOrders.length} orders</div>
                      <div className="text-xs text-muted-foreground">{formatCurrency(rev)}</div>
                    </>
                  )}
                  {isExp && dayOrders.length > 0 && (
                    <div className="mt-1.5 space-y-1 max-h-28 overflow-y-auto">
                      {dayOrders.map(o => (
                        <div key={o.id} className="text-xs bg-muted/60 rounded px-1.5 py-0.5 truncate" title={(o.customers as any)?.name}>
                          {(o.customers as any)?.name ?? o.tracking_number ?? 'Order'}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* WEEK VIEW — collapsible day sections with subtotal headers */}
      {viewMode === 'week' && (
        <div className="space-y-2 mb-6">
          {sortedDays.length === 0 ? (
            <EmptyState
              icon={ShoppingCart} title="No orders"
              description="No orders in this period."
              action={{ label: 'Add Order', onClick: () => setShowAddModal(true) }}
            />
          ) : sortedDays.map(day => {
            const orders = ordersByDay[day]
            const rev = orders.reduce((s, o) => s + Number(o.total_price), 0)
            const settled = orders.filter(o => o.payment_status === 'Settled').length
            const pending = orders.length - settled
            const isExp = expandedDays.has(day)
            return (
              <div key={day} className="rounded-lg border bg-white overflow-hidden">
                <button
                  className="w-full flex items-center justify-between px-4 py-3 hover:bg-muted/30 transition-colors text-left"
                  onClick={() => toggleDay(day)}
                >
                  <div className="flex items-center gap-2">
                    {isExp
                      ? <ChevronUp className="h-4 w-4 text-muted-foreground shrink-0" />
                      : <ChevronDown className="h-4 w-4 text-muted-foreground shrink-0" />}
                    <span className="font-semibold text-sm">{fmtDayHeading(day)}</span>
                  </div>
                  <div className="flex items-center gap-4 text-sm text-muted-foreground shrink-0">
                    <span>{orders.length} orders</span>
                    <span className="font-semibold text-foreground">{formatCurrency(rev)}</span>
                    <span className="text-green-600 text-xs">{settled} settled</span>
                    {pending > 0 && <span className="text-yellow-600 text-xs">{pending} pending</span>}
                  </div>
                </button>
                {isExp && (
                  <div className="border-t overflow-x-auto">
                    <Table>
                      <TableHeader><TableHeaders showDate={false} /></TableHeader>
                      <TableBody>
                        {orders.flatMap(order => renderOrderRows(order, false))}
                      </TableBody>
                    </Table>
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}

      {/* DAY VIEW — paginated flat table (client-side when incomplete filter is on) */}
      {viewMode === 'day' && (
        incompleteFilter ? (
          !displayFilteredOrders.length ? (
            <EmptyState
              icon={ShoppingCart} title="No incomplete orders"
              description="All orders for this day have complete Stage 2 data."
              action={{ label: 'Add Order', onClick: () => setShowAddModal(true) }}
            />
          ) : (
            <div className="rounded-lg border bg-white overflow-hidden">
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader><TableHeaders showDate={false} /></TableHeader>
                  <TableBody>
                    {displayFilteredOrders.flatMap(order => renderOrderRows(order, false))}
                  </TableBody>
                </Table>
              </div>
            </div>
          )
        ) : (
          isLoading ? <LoadingState /> :
          error ? <p className="text-destructive text-sm">Failed to load orders.</p> :
          !data?.data.length ? (
            <EmptyState
              icon={ShoppingCart} title="No orders found"
              description={search ? 'Try a different search term.' : 'No orders for this date/filter.'}
              action={{ label: 'Add Order', onClick: () => setShowAddModal(true) }}
            />
          ) : (
            <>
              <div className="rounded-lg border bg-white overflow-hidden">
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader><TableHeaders showDate={false} /></TableHeader>
                    <TableBody>
                      {data.data.flatMap(order => renderOrderRows(order, false))}
                    </TableBody>
                  </Table>
                </div>
              </div>
              {totalPages > 1 && (
                <div className="flex items-center justify-between mt-4 text-sm text-muted-foreground">
                  <span>Page {page} of {totalPages}</span>
                  <div className="flex gap-2">
                    <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage(p => p - 1)}>Previous</Button>
                    <Button variant="outline" size="sm" disabled={page >= totalPages} onClick={() => setPage(p => p + 1)}>Next</Button>
                  </div>
                </div>
              )}
            </>
          )
        )
      )}

      <AddOrderModal open={showAddModal} onClose={() => setShowAddModal(false)} />
    </div>
  )
}

export default function OrdersPage() {
  return (
    <Suspense fallback={null}>
      <OrdersPageInner />
    </Suspense>
  )
}
