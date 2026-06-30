'use client'

import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Sparkles, Repeat2, Crown, AlertTriangle, Download } from 'lucide-react'
import { cn } from '@/lib/utils'

interface Props {
  projectId: string
  selectedBrand?: string
}

type SegKey = 'new' | 'active' | 'loyal' | 'churn'
type Segment = {
  key: SegKey
  label: string
  count: number
  pct: number
  byChannel: { channel: string; count: number; pct: number }[]
  byPackage: { name: string; count: number; pct: number; price: number }[]
  customers: { name: string; phone: string; orders: number; spent: number; lastOrderDate: string; isNew90: boolean }[]
  truncated: boolean
}

const META: Record<SegKey, { label: string; icon: typeof Sparkles; color: string; bar: string; ring: string; desc: string }> = {
  new:    { label: 'New customer onboarding',    icon: Sparkles,      color: '#22c55e', bar: 'bg-green-500',  ring: 'ring-green-500',  desc: '只下过 1 单且仍活跃 · onboarding' },
  active: { label: 'Active customer recurring',  icon: Repeat2,       color: '#3b82f6', bar: 'bg-blue-500',   ring: 'ring-blue-500',   desc: '2–3 单且仍活跃 · recurring' },
  loyal:  { label: 'Loyal customer advocacy',    icon: Crown,         color: '#a855f7', bar: 'bg-purple-500', ring: 'ring-purple-500', desc: '4+ 单且仍活跃 · advocacy' },
  churn:  { label: 'Churn customer reactivation', icon: AlertTriangle, color: '#ef4444', bar: 'bg-red-500',    ring: 'ring-red-500',    desc: '超过 1 年没回来 · reactivation' },
}

function fmtRM(n: number) { return `RM ${Math.round(n).toLocaleString()}` }
function csvCell(v: string | number) {
  const s = String(v ?? '')
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
}

export default function LifecycleTab({ projectId, selectedBrand }: Props) {
  const [openSeg, setOpenSeg] = useState<SegKey | null>(null)

  const { data, isLoading, error } = useQuery({
    queryKey: ['lifecycle', projectId],
    queryFn: async () => {
      const res = await fetch(`/api/analytics/lifecycle?projectId=${encodeURIComponent(projectId)}`)
      if (!res.ok) throw new Error('Failed to load lifecycle')
      return res.json() as Promise<{ total: number; segments: Segment[] }>
    },
  })

  const segments = data?.segments ?? []
  const total = data?.total ?? 0
  const active = openSeg ? segments.find(s => s.key === openSeg) : null

  function exportSeg(seg: Segment) {
    const header = ['Name', 'Phone', 'Orders', 'Total Spent (RM)', 'Last Order', 'New (<=90d)']
    const rows = seg.customers.map(c => [c.name, c.phone, c.orders, c.spent, c.lastOrderDate, c.isNew90 ? 'Yes' : ''])
    const csv = [header, ...rows].map(r => r.map(csvCell).join(',')).join('\n')
    const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `lifecycle_${seg.key}_${selectedBrand || 'all'}_${new Date().toISOString().split('T')[0]}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  if (error) return <p className="text-sm text-red-600">Failed to load lifecycle data.</p>

  return (
    <div className="space-y-4">
      <p className="text-xs text-muted-foreground">
        以电话号码去重{selectedBrand ? ` · ${selectedBrand}` : ' · 全部品牌'} · 每个客户只归一段 · 共 {total.toLocaleString()} 位客户
      </p>

      {/* 4 segment cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {(['new', 'active', 'loyal', 'churn'] as SegKey[]).map(key => {
          const seg = segments.find(s => s.key === key)
          const m = META[key]
          const Icon = m.icon
          const isOpen = openSeg === key
          return (
            <button
              key={key}
              onClick={() => setOpenSeg(isOpen ? null : key)}
              className={cn(
                'text-left rounded-xl border p-4 transition-all hover:shadow-sm',
                isOpen ? `ring-2 ${m.ring} border-transparent` : 'border-border',
              )}
            >
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs font-medium text-muted-foreground">{m.label}</span>
                <Icon className="h-4 w-4 shrink-0" style={{ color: m.color }} />
              </div>
              <div className="text-2xl font-bold" style={{ color: m.color }}>
                {isLoading ? '…' : (seg?.count ?? 0).toLocaleString()}
              </div>
              <div className="mt-1 flex items-center gap-2">
                <div className="flex-1 bg-muted rounded h-1.5 overflow-hidden">
                  <div className={m.bar + ' h-1.5'} style={{ width: `${seg?.pct ?? 0}%` }} />
                </div>
                <span className="text-xs font-medium text-muted-foreground">{seg?.pct ?? 0}%</span>
              </div>
              <p className="text-[11px] text-muted-foreground mt-2 leading-tight">{m.desc}</p>
            </button>
          )
        })}
      </div>

      {!openSeg && !isLoading && (
        <p className="text-xs text-muted-foreground text-center py-2">点任意一段查看渠道、配套与客户名单 ↑</p>
      )}

      {/* Selected segment detail */}
      {active && (
        <div className="space-y-4">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <Card>
              <CardHeader className="pb-2"><CardTitle className="text-sm font-medium">在哪个 Channel 下过单</CardTitle></CardHeader>
              <CardContent className="space-y-1.5">
                {active.byChannel.length === 0 ? <p className="text-xs text-muted-foreground">No data</p> : active.byChannel.map(c => (
                  <div key={c.channel} className="flex items-center gap-2 text-xs">
                    <span className="w-28 truncate" title={c.channel}>{c.channel}</span>
                    <div className="flex-1 bg-muted rounded h-2 overflow-hidden">
                      <div className="h-2" style={{ width: `${c.pct}%`, background: META[active.key].color }} />
                    </div>
                    <span className="w-20 text-right font-medium shrink-0">{c.pct}% ({c.count})</span>
                  </div>
                ))}
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2"><CardTitle className="text-sm font-medium">买过什么配套</CardTitle></CardHeader>
              <CardContent>
                <table className="w-full text-xs">
                  <thead>
                    <tr className="border-b text-muted-foreground">
                      <th className="py-1 pr-2 text-left font-medium">配套</th>
                      <th className="py-1 px-2 text-right font-medium whitespace-nowrap">价钱</th>
                      <th className="py-1 pl-2 text-right font-medium whitespace-nowrap">人数 (%)</th>
                    </tr>
                  </thead>
                  <tbody>
                    {active.byPackage.map(p => (
                      <tr key={p.name} className="border-b last:border-0">
                        <td className="py-1.5 pr-2">{p.name}</td>
                        <td className="py-1.5 px-2 text-right whitespace-nowrap text-muted-foreground">{p.price > 0 ? fmtRM(p.price) : '—'}</td>
                        <td className="py-1.5 pl-2 text-right font-medium whitespace-nowrap">{p.pct}% ({p.count})</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </CardContent>
            </Card>
          </div>

          {/* Customer list + export */}
          <Card>
            <CardHeader className="pb-2 flex flex-row items-center justify-between space-y-0">
              <CardTitle className="text-sm font-medium">
                客户名单 <span className="text-muted-foreground font-normal">({active.customers.length.toLocaleString()}{active.truncated ? ' shown' : ''})</span>
              </CardTitle>
              <button
                onClick={() => exportSeg(active)}
                disabled={active.customers.length === 0}
                className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg border hover:bg-muted disabled:opacity-40"
              >
                <Download className="h-3.5 w-3.5" /> Export CSV
              </button>
            </CardHeader>
            <CardContent className="p-0">
              <div className="max-h-[480px] overflow-auto">
                <table className="w-full text-xs">
                  <thead className="sticky top-0 bg-background">
                    <tr className="border-b bg-muted/50">
                      <th className="px-3 py-2 text-left font-medium text-muted-foreground">Name</th>
                      <th className="px-3 py-2 text-left font-medium text-muted-foreground">Phone</th>
                      <th className="px-3 py-2 text-right font-medium text-muted-foreground">Orders</th>
                      <th className="px-3 py-2 text-right font-medium text-muted-foreground">Spent</th>
                      <th className="px-3 py-2 text-left font-medium text-muted-foreground">Last Order</th>
                    </tr>
                  </thead>
                  <tbody>
                    {active.customers.length === 0 ? (
                      <tr><td colSpan={5} className="px-3 py-6 text-center text-muted-foreground">No customers</td></tr>
                    ) : active.customers.map((c, i) => (
                      <tr key={c.phone + i} className="border-b last:border-0 hover:bg-muted/30">
                        <td className="px-3 py-2">
                          {c.name}
                          {c.isNew90 && active.key === 'new' && <span className="ml-1.5 text-[10px] px-1 py-0.5 rounded bg-green-100 text-green-700">真新客</span>}
                        </td>
                        <td className="px-3 py-2 font-mono text-muted-foreground">{c.phone}</td>
                        <td className="px-3 py-2 text-right font-medium">{c.orders}</td>
                        <td className="px-3 py-2 text-right">{fmtRM(c.spent)}</td>
                        <td className="px-3 py-2 text-muted-foreground">{c.lastOrderDate}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {isLoading && <div className="h-40 bg-muted/30 rounded-xl animate-pulse" />}
    </div>
  )
}
