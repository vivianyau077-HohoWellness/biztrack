'use client'

import { useState, useRef, useEffect } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { createClient } from '@/lib/supabase/client'
import { fetchCustomerInsights } from '@/app/actions/analytics'
import { fetchBrandSettings, saveBrandSetting } from '@/app/actions/brand-settings'
import { fetchProjects } from '@/app/actions/projects'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { formatCurrency, formatDate } from '@/lib/utils'
import { Users, UserPlus, Star, Clock, Repeat2, X, Settings, ChevronDown, ChevronUp, Download } from 'lucide-react'
import { exportCustomerInsights, exportSingleCustomer, type CustomerRow, type SingleCustomerData, type SingleCustomerOrder } from '@/lib/export-utils'
import { toast } from 'sonner'
import {
  PieChart, Pie, Cell, BarChart, Bar, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer, Legend, LineChart, Line,
} from 'recharts'
import { startOfMonth, format, differenceInDays } from 'date-fns'
import Link from 'next/link'

interface Props {
  projectId: string
  dateFrom: string
  dateTo: string
  selectedBrand?: string
}

const TAG_COLORS: Record<string, string> = {
  New: '#22c55e', Repeat: '#3b82f6', VIP: '#a855f7',
  Dormant: '#f97316', Lost: '#ef4444', Unknown: '#94a3b8',
}

const TAG_BADGE: Record<string, string> = {
  New:     'bg-green-100 text-green-700 border-green-200',
  Repeat:  'bg-blue-100 text-blue-700 border-blue-200',
  VIP:     'bg-purple-100 text-purple-700 border-purple-200',
  Dormant: 'bg-orange-100 text-orange-700 border-orange-200',
  Lost:    'bg-red-100 text-red-700 border-red-200',
  Unknown: 'bg-gray-100 text-gray-700 border-gray-200',
}

type DrillFilter = 'all' | 'new_month' | 'repeat' | 'vip' | 'dormant_lost'

interface SettingRow {
  project_id: string
  name: string
  vip_spend_threshold: string
  vip_order_threshold: string
  retention_days: string
  saving: boolean
}

export default function CustomerInsightsTab({ projectId, dateFrom, dateTo, selectedBrand }: Props) {
  const [drillFilter,   setDrillFilter]   = useState<DrillFilter>('all')
  const [isExporting,   setIsExporting]   = useState(false)
  const [exportingId,   setExportingId]   = useState<string | null>(null)
  const [phoneOnly, setPhoneOnly] = useState(false)
  const drillRef = useRef<HTMLDivElement>(null)
  const queryClient = useQueryClient()

  // VIP/Retention settings panel
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [settingRows, setSettingRows] = useState<SettingRow[]>([])
  const [settingsLoading, setSettingsLoading] = useState(false)
  const [settingsError, setSettingsError] = useState(false)

  useEffect(() => {
    if (!settingsOpen) return
    setSettingsLoading(true)
    setSettingsError(false)
    Promise.all([fetchProjects(), fetchBrandSettings()])
      .then(([projects, settings]) => {
        const rows: SettingRow[] = projects.map((p: { id: string; name: string }) => {
          const bs = settings.find(s => s.project_id === p.id)
          return {
            project_id: p.id,
            name: p.name,
            vip_spend_threshold: String(bs?.vip_spend_threshold ?? 2000),
            vip_order_threshold: String(bs?.vip_order_threshold ?? 6),
            retention_days: String(bs?.retention_days ?? 365),
            saving: false,
          }
        })
        setSettingRows(rows)
      })
      .catch((err) => {
        console.error('[CustomerInsights] failed to load settings:', err)
        setSettingsError(true)
      })
      .finally(() => setSettingsLoading(false))
  }, [settingsOpen])

  function updateRow(projectId: string, field: 'vip_spend_threshold' | 'vip_order_threshold' | 'retention_days', value: string) {
    setSettingRows(prev => prev.map(r => r.project_id === projectId ? { ...r, [field]: value } : r))
  }

  async function saveRow(row: SettingRow) {
    setSettingRows(prev => prev.map(r => r.project_id === row.project_id ? { ...r, saving: true } : r))
    try {
      await saveBrandSetting(row.project_id, {
        vip_spend_threshold: parseFloat(row.vip_spend_threshold) || 2000,
        vip_order_threshold: parseInt(row.vip_order_threshold) || 6,
        retention_days: parseInt(row.retention_days) || 365,
        inactive_days: 365,
      })
      toast.success(`${row.name} settings saved`)
      queryClient.invalidateQueries({ queryKey: ['customer-insights'] })
    } catch (e: any) {
      toast.error(e.message ?? 'Failed to save')
    } finally {
      setSettingRows(prev => prev.map(r => r.project_id === row.project_id ? { ...r, saving: false } : r))
    }
  }

  const { data, isLoading } = useQuery({
    queryKey: ['customer-insights', projectId, dateFrom, dateTo, phoneOnly],
    queryFn: () => fetchCustomerInsights(projectId, dateFrom, dateTo, phoneOnly),
  })

  // VIP registration (this year) — read from Lark "2026 daily order" AUTO VIP field.
  // Country split (Malaysia / Singapore) lives only in Lark, so this is independent
  // of the brand toggle and date range above.
  const { data: vip, isLoading: vipLoading, error: vipError } = useQuery({
    queryKey: ['vip-registration'],
    retry: 1,
    queryFn: async () => {
      const res = await fetch('/api/analytics/vip-registration')
      if (!res.ok) {
        let msg = `HTTP ${res.status}`
        try { const j = await res.json(); if (j?.error) msg = j.error } catch {}
        throw new Error(msg)
      }
      return res.json() as Promise<{
        year: number
        newVipTotal: number
        newVipMY: number
        newVipSG: number
        totalVipMY: number
        totalVipSG: number
        newCustomers: number
        registrationRate: number | null
      }>
    },
  })

  // Drill-down customers query — fires when a KPI card is clicked
  const { data: drillCustomers = [], isLoading: drillLoading } = useQuery({
    queryKey: ['customer-drill', drillFilter, selectedBrand, phoneOnly],
    enabled: drillFilter !== 'all',
    queryFn: async () => {
      const sb = createClient()
      let q = sb.from('customers')
        .select('id, name, phone, customer_tag, total_spent, total_orders, last_order_date, first_order_date, preferred_brand, preferred_platform')

      if (selectedBrand) q = q.eq('preferred_brand', selectedBrand)
      if (phoneOnly) q = q.not('phone', 'is', null).neq('phone', '').neq('phone', '0')

      if (drillFilter === 'new_month') {
        const monthStart = format(startOfMonth(new Date()), 'yyyy-MM-dd')
        q = q.gte('first_order_date', monthStart)
      } else if (drillFilter === 'repeat') {
        q = q.eq('customer_tag', 'Repeat')
      } else if (drillFilter === 'vip') {
        q = q.eq('customer_tag', 'VIP')
      } else if (drillFilter === 'dormant_lost') {
        q = q.in('customer_tag', ['Dormant', 'Lost'])
      }

      q = q.order('total_spent', { ascending: false }).limit(50)
      const { data: rows } = await q
      return rows ?? []
    },
  })

  // Phone stats — always runs so we can show count badge + missing warning
  const { data: phoneRows = [] } = useQuery({
    queryKey: ['customer-phone-stats', selectedBrand],
    queryFn: async () => {
      const sb = createClient()
      let q = sb.from('customers')
        .select('id, name, phone, total_orders, total_spent, last_order_date')
        .order('total_spent', { ascending: false })
      if (selectedBrand) q = q.eq('preferred_brand', selectedBrand)
      const { data } = await q
      return data ?? []
    },
  })

  const missingPhoneCount = phoneRows.filter(c => !c.phone || c.phone === '' || c.phone === '0').length

  function handleCardClick(filter: DrillFilter) {
    const next = drillFilter === filter ? 'all' : filter
    setDrillFilter(next)
    if (next !== 'all') {
      setTimeout(() => drillRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 100)
    }
  }

  async function handleExportCustomers() {
    setIsExporting(true)
    try {
      const sb = createClient()
      let q = sb
        .from('customers')
        .select('id, name, phone, preferred_brand, customer_tag, total_orders, total_spent, last_order_date, first_order_date')
        .order('total_spent', { ascending: false })

      if (selectedBrand) q = (q as any).eq('preferred_brand', selectedBrand)

      const { data: rows, error } = await q
      if (error) throw error
      exportCustomerInsights((rows ?? []) as CustomerRow[], selectedBrand ?? 'all')
    } catch (e: any) {
      toast.error(e.message ?? 'Export failed')
    } finally {
      setIsExporting(false)
    }
  }

  async function handleExportSingleCustomer(customer: SingleCustomerData) {
    setExportingId(customer.id)
    try {
      const sb = createClient()
      const { data: orders, error } = await sb
        .from('orders')
        .select('id, tracking_number, order_date, package_snapshot, package_name, channel, total_price, payment_status, is_cod, delivery_status, status, state, purchase_reason')
        .eq('customer_id', customer.id)
        .order('order_date', { ascending: false })
      if (error) throw error
      exportSingleCustomer(customer, (orders ?? []) as SingleCustomerOrder[])
    } catch (e: any) {
      toast.error(e.message ?? 'Export failed')
    } finally {
      setExportingId(null)
    }
  }

  if (isLoading) {
    return (
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
        {[...Array(5)].map((_, i) => (
          <Card key={i}><CardContent className="p-6"><div className="h-12 bg-muted/50 rounded animate-pulse" /></CardContent></Card>
        ))}
      </div>
    )
  }

  if (!data) {
    return (
      <div className="rounded-lg border border-dashed p-12 text-center text-sm text-muted-foreground">
        No customer data available.
      </div>
    )
  }

  const interval = Math.max(1, Math.floor(data.newVsRepeatByDay.length / 7))

  const DRILL_LABEL: Record<DrillFilter, string> = {
    all:          'All Customers',
    new_month:    'New This Month',
    repeat:       'Repeat Customers',
    vip:          'VIP Customers',
    dormant_lost: 'Dormant / Lost',
  }

  return (
    <div className="space-y-6">
      {/* VIP & Retention Settings Panel + Export button */}
      <div className="rounded-lg border bg-card">
        <div className="flex items-center">
          <button
            onClick={() => setSettingsOpen(v => !v)}
            className="flex flex-1 items-center justify-between px-4 py-3 text-sm font-medium hover:bg-muted/50 transition-colors rounded-l-lg"
          >
            <span className="flex items-center gap-2 text-muted-foreground">
              <Settings className="h-4 w-4" />
              Configure VIP &amp; Retention Settings
            </span>
            {settingsOpen ? <ChevronUp className="h-4 w-4 text-muted-foreground" /> : <ChevronDown className="h-4 w-4 text-muted-foreground" />}
          </button>
          <div className="px-3 border-l flex items-center gap-2 flex-wrap">
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={handleExportCustomers}
              disabled={isExporting}
              className="h-8 gap-1.5"
            >
              <Download className={`h-3.5 w-3.5 ${isExporting ? 'animate-pulse' : ''}`} />
              {isExporting ? 'Exporting…' : 'Export Customers'}
            </Button>
            <Button
              type="button"
              size="sm"
              variant={phoneOnly ? 'default' : 'outline'}
              onClick={() => setPhoneOnly(v => !v)}
              className="h-8 gap-1.5"
            >
              📱 Phone Only
            </Button>
            {missingPhoneCount > 0 && (
              <span className="text-xs text-amber-600 font-medium whitespace-nowrap">
                ⚠️ {missingPhoneCount} excluded (no phone)
              </span>
            )}
          </div>
        </div>
        {settingsOpen && (
          <div className="border-t px-4 py-3">
            {settingsError ? (
              <p className="text-xs text-red-500 py-2">Failed to load settings — check console for details.</p>
            ) : settingsLoading || settingRows.length === 0 ? (
              <p className="text-xs text-muted-foreground py-2">Loading brands…</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="border-b">
                      <th className="pb-2 text-left font-medium text-muted-foreground">Brand</th>
                      <th className="pb-2 text-right font-medium text-muted-foreground">VIP Spend (RM)</th>
                      <th className="pb-2 text-right font-medium text-muted-foreground">VIP Orders</th>
                      <th className="pb-2 text-right font-medium text-muted-foreground">Retention Days</th>
                      <th className="pb-2 text-right font-medium text-muted-foreground"></th>
                    </tr>
                  </thead>
                  <tbody>
                    {settingRows.map(row => (
                      <tr key={row.project_id} className="border-b last:border-0">
                        <td className="py-2 font-medium">{row.name}</td>
                        <td className="py-2 pl-4">
                          <Input
                            type="number"
                            className="h-7 w-28 text-xs text-right ml-auto"
                            value={row.vip_spend_threshold}
                            onChange={e => updateRow(row.project_id, 'vip_spend_threshold', e.target.value)}
                          />
                        </td>
                        <td className="py-2 pl-4">
                          <Input
                            type="number"
                            className="h-7 w-20 text-xs text-right ml-auto"
                            value={row.vip_order_threshold}
                            onChange={e => updateRow(row.project_id, 'vip_order_threshold', e.target.value)}
                          />
                        </td>
                        <td className="py-2 pl-4">
                          <Input
                            type="number"
                            className="h-7 w-24 text-xs text-right ml-auto"
                            value={row.retention_days}
                            onChange={e => updateRow(row.project_id, 'retention_days', e.target.value)}
                          />
                        </td>
                        <td className="py-2 pl-3">
                          <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => saveRow(row)} disabled={row.saving}>
                            {row.saving ? 'Saving…' : 'Save'}
                          </Button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}
      </div>

      {/* KPI Cards — clickable */}
      {(() => {
        const pct = (n: number) => data.total > 0 ? ((n / data.total) * 100).toFixed(1) : '0.0'
        const cards = [
          { filter: 'all' as DrillFilter,          label: 'Total Customers',  value: data.total.toLocaleString(),         color: 'text-foreground',  icon: Users,    accent: '',                       subtitle: '' },
          { filter: 'new_month' as DrillFilter,    label: 'New This Month',   value: String(data.newThisMonth),           color: 'text-green-600',   icon: UserPlus, accent: 'hover:ring-green-200',   subtitle: `${pct(data.newThisMonth)}% of total` },
          { filter: 'repeat' as DrillFilter,       label: 'Retention Customers', value: String(data.retentionCount),      color: 'text-blue-600',    icon: Repeat2,  accent: 'hover:ring-blue-200',    subtitle: `${pct(data.retentionCount)}% returning` },
          { filter: 'vip' as DrillFilter,          label: 'VIP Customers',    value: String(data.vipCount),               color: 'text-purple-600',  icon: Star,     accent: 'hover:ring-purple-200',  subtitle: `${pct(data.vipCount)}% of total` },
          { filter: 'dormant_lost' as DrillFilter, label: 'Dormant / Lost',   value: String(data.dormantCount),           color: 'text-orange-600',  icon: Clock,    accent: 'hover:ring-orange-200',  subtitle: `${pct(data.dormantCount)}% of total` },
        ]
        return (
          <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
            {cards.map(({ filter, label, value, color, icon: Icon, accent, subtitle }) => (
              <Card
                key={filter}
                onClick={() => handleCardClick(filter)}
                className={`cursor-pointer transition-all hover:shadow-md hover:scale-[1.02] hover:ring-2 ${accent} ${drillFilter === filter ? 'ring-2 ring-primary shadow-md' : ''}`}
              >
                <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0">
                  <CardTitle className="text-xs font-medium text-muted-foreground">{label}</CardTitle>
                  <Icon className={`h-3.5 w-3.5 ${color}`} />
                </CardHeader>
                <CardContent>
                  <div className={`text-2xl font-bold ${color}`}>{value}</div>
                  {drillFilter === filter
                    ? <p className="text-xs text-primary mt-1">Showing below ↓</p>
                    : subtitle ? <p className="text-xs text-muted-foreground mt-1">{subtitle}</p> : null
                  }
                </CardContent>
              </Card>
            ))}
          </div>
        )
      })()}

      {/* VIP Registration · This Year (from Lark AUTO VIP) */}
      <div>
        <h3 className="text-sm font-semibold mb-3 flex items-center gap-2">
          <Star className="h-4 w-4 text-purple-600" />
          VIP Registration · {vip?.year ?? new Date().getFullYear()} (This Year)
        </h3>
        {vipError && (
          <p className="text-xs text-red-600 mb-2">⚠️ Failed to load VIP data: {(vipError as Error).message}</p>
        )}
        <div className="grid grid-cols-2 lg:grid-cols-3 gap-4">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0">
              <CardTitle className="text-xs font-medium text-muted-foreground">New VIP</CardTitle>
              <Star className="h-3.5 w-3.5 text-purple-600" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-purple-600">{vipLoading ? '…' : (vip?.newVipTotal ?? 0)}</div>
              <p className="text-xs text-muted-foreground mt-1">New customers only (excl. repeat)</p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0">
              <CardTitle className="text-xs font-medium text-muted-foreground">🇲🇾 Malaysia New VIP</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-foreground">{vipLoading ? '…' : (vip?.newVipMY ?? 0)}</div>
              <p className="text-xs text-muted-foreground mt-1">New customers only</p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0">
              <CardTitle className="text-xs font-medium text-muted-foreground">🇸🇬 Singapore New VIP</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-foreground">{vipLoading ? '…' : (vip?.newVipSG ?? 0)}</div>
              <p className="text-xs text-muted-foreground mt-1">New customers only</p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0">
              <CardTitle className="text-xs font-medium text-muted-foreground">New VIP Registration Rate</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-green-600">
                {vipLoading ? '…' : vip?.registrationRate != null ? `${vip.registrationRate}%` : '—'}
              </div>
              <p className="text-xs text-muted-foreground mt-1">
                {vip ? `${vip.newVipTotal} new VIP ÷ ${vip.newCustomers} new customers` : 'New VIP ÷ new customers'}
              </p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0">
              <CardTitle className="text-xs font-medium text-muted-foreground">🇲🇾 Malaysia Total VIP</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-purple-600">{vipLoading ? '…' : (vip?.totalVipMY ?? 0)}</div>
              <p className="text-xs text-muted-foreground mt-1">New + repeat tagged VIP</p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0">
              <CardTitle className="text-xs font-medium text-muted-foreground">🇸🇬 Singapore Total VIP</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-purple-600">{vipLoading ? '…' : (vip?.totalVipSG ?? 0)}</div>
              <p className="text-xs text-muted-foreground mt-1">New + repeat tagged VIP</p>
            </CardContent>
          </Card>
        </div>
      </div>

      {/* AOV / LTV / Retention KPI Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0">
            <CardTitle className="text-xs font-medium text-muted-foreground">New Customer AOV</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-xl font-bold text-green-600">{formatCurrency(data.newCustomerAov)}</div>
            <p className="text-xs text-muted-foreground mt-0.5">Avg first order value</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0">
            <CardTitle className="text-xs font-medium text-muted-foreground">Repeat Customer AOV</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-xl font-bold text-blue-600">{formatCurrency(data.repeatCustomerAov)}</div>
            <p className="text-xs text-muted-foreground mt-0.5">Avg per order (2+ orders)</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0">
            <CardTitle className="text-xs font-medium text-muted-foreground">Customer LTV</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-xl font-bold text-purple-600">{formatCurrency(data.customerLtv)}</div>
            <p className="text-xs text-muted-foreground mt-0.5">Avg lifetime value</p>
          </CardContent>
        </Card>
      </div>

      {/* Monthly AOV & Retention Trend */}
      {data.monthlyTrend.length > 0 && (
        <Card>
          <CardHeader><CardTitle className="text-sm font-medium">Monthly AOV & Retention Trend (Last 6 Months)</CardTitle></CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={220}>
              <LineChart data={data.monthlyTrend}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                <XAxis dataKey="month" tick={{ fontSize: 10 }} />
                <YAxis yAxisId="left" tick={{ fontSize: 10 }} tickFormatter={v => `RM${v}`} />
                <YAxis yAxisId="right" orientation="right" tick={{ fontSize: 10 }} tickFormatter={v => `${v.toFixed(0)}%`} />
                <Tooltip formatter={(v: number, name: string) => {
                  if (name === 'Retention %') return [`${v.toFixed(1)}%`, name]
                  return [formatCurrency(v), name]
                }} />
                <Legend />
                <Line yAxisId="left" type="monotone" dataKey="newAov" name="New AOV" stroke="#22c55e" strokeWidth={2} dot={false} />
                <Line yAxisId="left" type="monotone" dataKey="repeatAov" name="Repeat AOV" stroke="#3b82f6" strokeWidth={2} dot={false} />
                <Line yAxisId="right" type="monotone" dataKey="retentionRate" name="Retention %" stroke="#f97316" strokeWidth={2} dot={false} strokeDasharray="4 2" />
              </LineChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      )}

      {/* Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card>
          <CardHeader><CardTitle className="text-sm font-medium">Customer Tags</CardTitle></CardHeader>
          <CardContent>
            {data.byTag.length === 0 ? (
              <p className="text-sm text-muted-foreground py-8 text-center">No customer tag data</p>
            ) : (
              <div className="flex items-center gap-4">
                <ResponsiveContainer width="60%" height={180}>
                  <PieChart>
                    <Pie data={data.byTag} dataKey="count" nameKey="tag" cx="50%" cy="50%" outerRadius={70}
                      label={({ tag, percent }) => `${tag} ${(percent * 100).toFixed(0)}%`} labelLine={false}>
                      {data.byTag.map(entry => (
                        <Cell key={entry.tag} fill={TAG_COLORS[entry.tag] ?? '#94a3b8'} />
                      ))}
                    </Pie>
                    <Tooltip />
                  </PieChart>
                </ResponsiveContainer>
                <div className="space-y-1.5">
                  {data.byTag.map(t => (
                    <div key={t.tag} className="flex items-center gap-2">
                      <div className="h-2.5 w-2.5 rounded-full shrink-0" style={{ backgroundColor: TAG_COLORS[t.tag] ?? '#94a3b8' }} />
                      <span className="text-xs">{t.tag}</span>
                      <span className="text-xs font-medium ml-auto pl-4">{t.count}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle className="text-sm font-medium">New vs Repeat Orders Trend</CardTitle></CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={180}>
              <BarChart data={data.newVsRepeatByDay}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                <XAxis dataKey="date" tick={{ fontSize: 9 }} interval={interval} />
                <YAxis tick={{ fontSize: 10 }} allowDecimals={false} />
                <Tooltip />
                <Legend />
                <Bar dataKey="new"    name="New"    fill="#22c55e" stackId="a" />
                <Bar dataKey="repeat" name="Repeat" fill="#3b82f6" stackId="a" />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      </div>

      {/* Top 10 + Follow-ups */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card>
          <CardHeader><CardTitle className="text-sm font-medium">Top 10 Customers by Spend</CardTitle></CardHeader>
          <CardContent className="p-0">
            {data.top10.length === 0 ? (
              <p className="text-sm text-muted-foreground p-6 text-center">No customer data</p>
            ) : (
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b bg-muted/50">
                    <th className="px-3 py-2 text-left font-medium text-muted-foreground">#</th>
                    <th className="px-3 py-2 text-left font-medium text-muted-foreground">Name</th>
                    <th className="px-3 py-2 text-center font-medium text-muted-foreground">Tag</th>
                    <th className="px-3 py-2 text-right font-medium text-muted-foreground">Orders</th>
                    <th className="px-3 py-2 text-right font-medium text-muted-foreground">Spent</th>
                  </tr>
                </thead>
                <tbody>
                  {data.top10.map((c, i) => (
                    <tr key={i} className="border-b hover:bg-muted/30">
                      <td className="px-3 py-2 font-mono text-muted-foreground">{i + 1}</td>
                      <td className="px-3 py-2">
                        <Link href={`/customers/${c.id}`} className="font-medium hover:text-green-600 hover:underline">{c.name}</Link>
                        <div className="text-muted-foreground">{c.phone}</div>
                      </td>
                      <td className="px-3 py-2 text-center">
                        <span className={`text-xs px-1.5 py-0.5 rounded-full border font-medium ${TAG_BADGE[c.tag] ?? TAG_BADGE.Unknown}`}>{c.tag}</span>
                      </td>
                      <td className="px-3 py-2 text-right">{c.total_orders}</td>
                      <td className="px-3 py-2 text-right font-medium">{formatCurrency(c.total_spent)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle className="text-sm font-medium">Follow-up Reminders Due</CardTitle></CardHeader>
          <CardContent>
            {data.followUps.length === 0 ? (
              <div className="py-8 text-center">
                <p className="text-sm text-muted-foreground">No follow-ups due today.</p>
              </div>
            ) : (
              <div className="space-y-2">
                {data.followUps.map(f => (
                  <div key={f.id} className="rounded-lg border p-3">
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <Link href={`/customers/${f.id}`} className="text-sm font-medium hover:text-green-600 hover:underline">{f.name}</Link>
                        <p className="text-xs text-muted-foreground">{f.phone}</p>
                        {f.follow_up_note && <p className="text-xs text-muted-foreground mt-1 italic">"{f.follow_up_note}"</p>}
                      </div>
                      <span className="text-xs text-amber-600 font-medium shrink-0">{f.follow_up_date}</span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Drill-down customer table */}
      {drillFilter !== 'all' && (
        <div ref={drillRef}>
          <Card>
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <CardTitle className="text-sm font-medium">
                  Showing: {DRILL_LABEL[drillFilter]}
                  {!drillLoading && (
                    <span className="ml-2 text-xs font-normal text-muted-foreground">({drillCustomers.length} customers)</span>
                  )}
                </CardTitle>
                <button onClick={() => setDrillFilter('all')} className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground">
                  <X className="h-3.5 w-3.5" /> Clear filter
                </button>
              </div>
            </CardHeader>
            <CardContent className="p-0">
              {drillLoading ? (
                <div className="h-24 bg-muted/20 animate-pulse mx-4 mb-4 rounded" />
              ) : drillCustomers.length === 0 ? (
                <p className="text-sm text-muted-foreground p-6 text-center">No customers found</p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="border-b bg-muted/50">
                        <th className="px-3 py-2 text-left font-medium text-muted-foreground">Name</th>
                        <th className="px-3 py-2 text-left font-medium text-muted-foreground">Phone</th>
                        <th className="px-3 py-2 text-center font-medium text-muted-foreground">Tag</th>
                        <th className="px-3 py-2 text-right font-medium text-muted-foreground">Orders</th>
                        <th className="px-3 py-2 text-right font-medium text-muted-foreground">Spent</th>
                        <th className="px-3 py-2 text-left font-medium text-muted-foreground">Last Order</th>
                        <th className="px-3 py-2 text-center font-medium text-muted-foreground">Days Ago</th>
                        <th className="px-3 py-2 w-8" />
                      </tr>
                    </thead>
                    <tbody>
                      {drillCustomers.map((c: SingleCustomerData & { customer_tag: string }) => {
                        const days = c.last_order_date
                          ? differenceInDays(new Date(), new Date(c.last_order_date + 'T12:00:00'))
                          : null
                        const daysColor = days == null ? '' : days > 90 ? 'text-red-600 font-bold' : days > 60 ? 'text-orange-600 font-medium' : days > 30 ? 'text-yellow-600' : 'text-green-600'
                        return (
                          <tr key={c.id} className="border-b hover:bg-muted/30">
                            <td className="px-3 py-2">
                              <Link href={`/customers/${c.id}`} className="font-medium hover:text-green-600 hover:underline">{c.name}</Link>
                            </td>
                            <td className="px-3 py-2 text-muted-foreground font-mono">{c.phone}</td>
                            <td className="px-3 py-2 text-center">
                              <span className={`px-1.5 py-0.5 rounded-full border font-medium ${TAG_BADGE[c.customer_tag] ?? TAG_BADGE.Unknown}`}>{c.customer_tag}</span>
                            </td>
                            <td className="px-3 py-2 text-right font-semibold">{c.total_orders}</td>
                            <td className="px-3 py-2 text-right">{formatCurrency(Number(c.total_spent))}</td>
                            <td className="px-3 py-2 text-muted-foreground">{c.last_order_date ? formatDate(c.last_order_date) : '—'}</td>
                            <td className={`px-3 py-2 text-center ${daysColor}`}>{days ?? '—'}</td>
                            <td className="px-3 py-2">
                              <button
                                title="Export customer"
                                onClick={() => handleExportSingleCustomer(c)}
                                disabled={exportingId === c.id}
                                className="p-1 rounded text-muted-foreground hover:text-foreground hover:bg-muted/60 transition-colors disabled:opacity-40"
                              >
                                <Download className={`h-3.5 w-3.5 ${exportingId === c.id ? 'animate-pulse' : ''}`} />
                              </button>
                            </td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  )
}
