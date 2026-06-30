'use client'

import { useState, useRef, useEffect } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { createClient } from '@/lib/supabase/client'
import { fetchCustomerInsights } from '@/app/actions/analytics'
import { setInactiveFollowUp } from '@/app/actions/inactive-followup'
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

type ChurnSeg = {
  count: number
  byChannel: { channel: string; count: number; pct: number }[]
  byPackage: { name: string; count: number; pct: number; price: number }[]
}

// Renders one churned segment's channel + package breakdown.
function ChurnSegmentBreakdown({ title, color, seg }: { title: string; color: string; seg: ChurnSeg }) {
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-medium flex items-center gap-2">
          <span className="h-2.5 w-2.5 rounded-full" style={{ background: color }} />
          {title} <span className="text-muted-foreground font-normal">({seg.count.toLocaleString()})</span>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {seg.count === 0 ? (
          <p className="text-xs text-muted-foreground">No customers in this group.</p>
        ) : (
          <>
            <div>
              <p className="text-xs font-medium text-muted-foreground mb-1.5">在哪个 Channel 下过单</p>
              <div className="space-y-1.5">
                {seg.byChannel.map(c => (
                  <div key={c.channel} className="flex items-center gap-2 text-xs">
                    <span className="w-28 truncate" title={c.channel}>{c.channel}</span>
                    <div className="flex-1 bg-muted rounded h-2 overflow-hidden">
                      <div className="h-2" style={{ width: `${c.pct}%`, background: color }} />
                    </div>
                    <span className="w-20 text-right font-medium shrink-0">{c.pct}% ({c.count})</span>
                  </div>
                ))}
              </div>
            </div>
            <div>
              <p className="text-xs font-medium text-muted-foreground mb-1.5">买过什么配套</p>
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b text-muted-foreground">
                    <th className="py-1 pr-2 text-left font-medium">配套</th>
                    <th className="py-1 px-2 text-right font-medium whitespace-nowrap">价钱</th>
                    <th className="py-1 pl-2 text-right font-medium whitespace-nowrap">人数 (%)</th>
                  </tr>
                </thead>
                <tbody>
                  {seg.byPackage.map(p => (
                    <tr key={p.name} className="border-b last:border-0">
                      <td className="py-1.5 pr-2">{p.name}</td>
                      <td className="py-1.5 px-2 text-right whitespace-nowrap text-muted-foreground">{p.price > 0 ? `RM ${p.price.toLocaleString()}` : '—'}</td>
                      <td className="py-1.5 pl-2 text-right font-medium whitespace-nowrap">{p.pct}% ({p.count})</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  )
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
  const [showInactive, setShowInactive] = useState(false)
  const [showChurnBreakdown, setShowChurnBreakdown] = useState(false)
  const [followLocal, setFollowLocal] = useState<Record<string, { done: boolean; note: string }>>({})
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

  // Churn customers (all-time, deduped by phone) — independent of date range, scoped by brand
  const { data: churn } = useQuery({
    queryKey: ['churn', projectId],
    queryFn: async () => {
      const res = await fetch(`/api/analytics/churn?projectId=${encodeURIComponent(projectId)}`)
      if (!res.ok) throw new Error('Failed to load churn')
      return res.json() as Promise<{ churnCount: number; totalCustomers: number; activeCustomers: number; churnOneTime: number; churnRepeat: number; unique2025: number; unique2026: number; churnRate: number; repeat: ChurnSeg; oneTime: ChurnSeg }>
    },
  })

  // Customers inactive 90+ days (count + list), all-time by phone, scoped by brand
  const { data: inactive } = useQuery({
    queryKey: ['inactive90', projectId],
    queryFn: async () => {
      const res = await fetch(`/api/analytics/inactive?projectId=${encodeURIComponent(projectId)}&days=90`)
      if (!res.ok) throw new Error('Failed to load inactive customers')
      return res.json() as Promise<{
        count: number
        days: number
        customers: { phone: string; phoneDisplay: string; name: string; package: string; totalPrice: number; lastOrderDate: string; daysSince: number; followedUp: boolean; followUpDate: string | null; followUpNote: string | null }[]
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

  function effFollow(c: { phone: string; followedUp: boolean; followUpNote: string | null }) {
    return followLocal[c.phone] ?? { done: c.followedUp, note: c.followUpNote ?? '' }
  }

  async function toggleFollow(phone: string, done: boolean, note: string) {
    setFollowLocal(prev => ({ ...prev, [phone]: { done, note } }))
    const res = await setInactiveFollowUp(phone, done, note)
    if (!res.success) toast.error(res.error ?? 'Failed to save follow-up')
  }

  function exportInactive() {
    if (!inactive) return
    const header = ['#', 'Name', 'Phone', 'Package', 'Total Price', 'Last Order', 'Days Since', 'Followed Up', 'Remark']
    const rows = inactive.customers.map((c, i) => {
      const e = effFollow(c)
      return [i + 1, c.name, c.phoneDisplay, c.package, c.totalPrice, c.lastOrderDate, c.daysSince, e.done ? 'Yes' : 'No', e.note]
    })
    const csv = [header, ...rows]
      .map(r => r.map(v => `"${String(v ?? '').replace(/"/g, '""')}"`).join(','))
      .join('\n')
    const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `inactive-90-${selectedBrand || 'all'}-${new Date().toISOString().split('T')[0]}.csv`
    a.click()
    URL.revokeObjectURL(url)
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
        ]
        return (
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
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

      {/* Churn Customers — no order in over 1 year */}
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0">
            <CardTitle className="text-xs font-medium text-muted-foreground">Churn Customers</CardTitle>
            <Clock className="h-3.5 w-3.5 text-red-600" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-red-600">{churn ? churn.churnCount.toLocaleString() : '…'}</div>
            <p className="text-xs text-muted-foreground mt-1">
              No order in over 1 year{churn ? ` · ${churn.churnRate}% churn rate` : ''}
            </p>
            <button
              onClick={() => setShowChurnBreakdown(v => !v)}
              disabled={!churn || churn.churnCount === 0}
              className="mt-2 text-xs text-blue-600 hover:underline disabled:opacity-40"
            >
              {showChurnBreakdown ? 'Hide breakdown ↑' : 'Show breakdown ↓'}
            </button>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0">
            <CardTitle className="text-xs font-medium text-muted-foreground">2025 Unique Customers</CardTitle>
            <Users className="h-3.5 w-3.5 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-foreground">{churn ? churn.unique2025.toLocaleString() : '…'}</div>
            <p className="text-xs text-muted-foreground mt-1">Unique phones · ordered in 2025</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0">
            <CardTitle className="text-xs font-medium text-muted-foreground">2026 Unique Customers</CardTitle>
            <Users className="h-3.5 w-3.5 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-foreground">{churn ? churn.unique2026.toLocaleString() : '…'}</div>
            <p className="text-xs text-muted-foreground mt-1">Unique phones · 2026 YTD</p>
          </CardContent>
        </Card>
      </div>

      {/* Churn breakdown — channel % + packages (of churned customers) */}
      {showChurnBreakdown && churn && churn.churnCount > 0 && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <ChurnSegmentBreakdown
            title="Lapsed repeat customers · 曾复购后流失"
            color="#ef4444"
            seg={churn.repeat}
          />
          <ChurnSegmentBreakdown
            title="One-time buyers · 只买一次没回购"
            color="#f59e0b"
            seg={churn.oneTime}
          />
        </div>
      )}

      {/* Inactive 90 days — count + expandable list */}
      <div>
        <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0">
              <CardTitle className="text-xs font-medium text-muted-foreground">Inactive 90 Days</CardTitle>
              <Clock className="h-3.5 w-3.5 text-orange-600" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-orange-600">{inactive ? inactive.count.toLocaleString() : '…'}</div>
              <p className="text-xs text-muted-foreground mt-1">2026 buyer · no repurchase in 90+ days</p>
              <button
                onClick={() => setShowInactive(v => !v)}
                disabled={!inactive || inactive.count === 0}
                className="mt-2 text-xs text-blue-600 hover:underline disabled:opacity-40"
              >
                {showInactive ? 'Hide list ↑' : 'Show who ↓'}
              </button>
            </CardContent>
          </Card>
        </div>
        {showInactive && inactive && inactive.customers.length > 0 && (
          <Card className="mt-4">
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <CardTitle className="text-sm font-medium">
                  Inactive 90+ Days
                  <span className="ml-2 text-xs font-normal text-muted-foreground">
                    ({inactive.count} customers{inactive.count > inactive.customers.length ? `, showing first ${inactive.customers.length}` : ''})
                  </span>
                </CardTitle>
                <Button type="button" size="sm" variant="outline" className="h-8 gap-1.5" onClick={exportInactive}>
                  <Download className="h-3.5 w-3.5" /> Export CSV
                </Button>
              </div>
            </CardHeader>
            <CardContent className="p-0">
              <div className="overflow-x-auto max-h-[480px] overflow-y-auto">
                <table className="w-full text-xs">
                  <thead className="sticky top-0 bg-muted/50">
                    <tr className="border-b">
                      <th className="px-3 py-2 text-left font-medium text-muted-foreground">#</th>
                      <th className="px-3 py-2 text-left font-medium text-muted-foreground">Name</th>
                      <th className="px-3 py-2 text-left font-medium text-muted-foreground">Phone</th>
                      <th className="px-3 py-2 text-left font-medium text-muted-foreground">Package</th>
                      <th className="px-3 py-2 text-right font-medium text-muted-foreground">Total Price</th>
                      <th className="px-3 py-2 text-left font-medium text-muted-foreground">Last Order</th>
                      <th className="px-3 py-2 text-right font-medium text-muted-foreground">Days Since</th>
                      <th className="px-3 py-2 text-center font-medium text-muted-foreground">Followed Up</th>
                      <th className="px-3 py-2 text-left font-medium text-muted-foreground">Remark</th>
                    </tr>
                  </thead>
                  <tbody>
                    {inactive.customers.map((c, i) => (
                      <tr key={c.phone + i} className={`border-b hover:bg-muted/30 ${effFollow(c).done ? 'bg-green-50/60' : ''}`}>
                        <td className="px-3 py-2 font-mono text-muted-foreground">{i + 1}</td>
                        <td className="px-3 py-2">{c.name}</td>
                        <td className="px-3 py-2 font-mono text-muted-foreground">{c.phoneDisplay}</td>
                        <td className="px-3 py-2">{c.package}</td>
                        <td className="px-3 py-2 text-right">{formatCurrency(c.totalPrice)}</td>
                        <td className="px-3 py-2 text-muted-foreground">{formatDate(c.lastOrderDate)}</td>
                        <td className="px-3 py-2 text-right font-semibold text-orange-600">{c.daysSince}</td>
                        <td className="px-3 py-2 text-center">
                          <input
                            type="checkbox"
                            checked={effFollow(c).done}
                            onChange={e => toggleFollow(c.phone, e.target.checked, effFollow(c).note)}
                            className="h-4 w-4 cursor-pointer accent-green-600"
                          />
                        </td>
                        <td className="px-3 py-2">
                          <input
                            type="text"
                            value={effFollow(c).note}
                            placeholder="备注…"
                            onChange={e => setFollowLocal(prev => ({ ...prev, [c.phone]: { done: effFollow(c).done, note: e.target.value } }))}
                            onBlur={e => toggleFollow(c.phone, effFollow(c).done, e.target.value)}
                            className="w-36 rounded border px-2 py-1 text-xs"
                          />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
        )}
      </div>

      {/* Customer LTV */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
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
