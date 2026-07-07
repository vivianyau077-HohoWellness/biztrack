'use client'

import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Card, CardContent } from '@/components/ui/card'

type Agg = { orders: number; sales: number; aov: number }
type PageRow = { name: string; ad: number; leads: number; sales: number; cpl: number; roas: number }
type Data = {
  month: string
  total: Agg; new: Agg; repeat: Agg; vip: Agg
  channels: { channel: string; orders: number; sales: number; pct: number }[]
  ads: { beauty: number; repair: number; sg: number; total: number }
  leads: { beauty: number; repair: number; sg: number; total: number }
  roas: number
  forecast: { actual: number; estimated: number; goal: number; toGoalPct: number }
  pages: PageRow[]
}

const MONTHS = ['2026-01', '2026-02', '2026-03', '2026-04', '2026-05', '2026-06', '2026-07']
const MLABEL: Record<string, string> = { '2026-01': "Jan'26", '2026-02': "Feb'26", '2026-03': "Mar'26", '2026-04': "Apr'26", '2026-05': "May'26", '2026-06': "Jun'26", '2026-07': "Jul'26" }

function rm(n: number) { if (!isFinite(n)) return '—'; return 'RM ' + Math.round(n).toLocaleString() }

function StatCard({ title, a, color }: { title: string; a: Agg; color: string }) {
  return (
    <div className="rounded-lg border p-3">
      <p className="text-xs font-semibold mb-1" style={{ color }}>{title}</p>
      <div className="text-xl font-bold">{rm(a.sales)}</div>
      <div className="text-xs text-muted-foreground mt-0.5">{a.orders.toLocaleString()} orders · AOV {rm(a.aov)}</div>
    </div>
  )
}

export default function MonthlySalesAnalysis() {
  const [month, setMonth] = useState('2026-05')
  const { data, isLoading, error } = useQuery({
    queryKey: ['sales-analysis', month],
    queryFn: async () => {
      const res = await fetch(`/api/analytics/sales-analysis?month=${month}`)
      if (!res.ok) throw new Error('Failed to load')
      return res.json() as Promise<Data>
    },
  })

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <span className="text-sm text-muted-foreground">Month</span>
        <select value={month} onChange={e => setMonth(e.target.value)} className="h-9 rounded-md border border-input bg-background px-3 text-sm">
          {MONTHS.map(m => <option key={m} value={m}>{MLABEL[m]}</option>)}
        </select>
      </div>

      {error ? (
        <p className="text-sm text-red-600">Failed to load sales analysis.</p>
      ) : isLoading || !data ? (
        <div className="h-40 bg-muted/30 rounded-lg animate-pulse" />
      ) : (
        <Card><CardContent className="p-4 space-y-4">
          {/* Forecast vs actual */}
          <div className="rounded-lg p-3 bg-muted/40">
            <p className="text-xs font-semibold mb-2">Month forecast vs actual</p>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-xs">
              <div><span className="block text-muted-foreground mb-0.5">Actual so far</span><div className="font-bold text-base">{rm(data.forecast.actual)}</div></div>
              <div><span className="block text-muted-foreground mb-0.5">Forecast (full month)</span><div className="font-bold text-base">{rm(data.forecast.estimated)}</div></div>
              <div><span className="block text-muted-foreground mb-0.5">Goal / target</span><div className="font-bold text-base">{data.forecast.goal ? rm(data.forecast.goal) : '—'}</div></div>
              <div><span className="block text-muted-foreground mb-0.5">Actual vs goal</span><div className={'font-bold text-base ' + (data.forecast.toGoalPct >= 100 ? 'text-green-600' : 'text-orange-600')}>{data.forecast.goal ? data.forecast.toGoalPct + '%' : '—'}</div></div>
            </div>
          </div>

          {/* New / Repeat / VIP / Overall */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            <StatCard title="New Sales" a={data.new} color="#22a06b" />
            <StatCard title="Repeat Sales" a={data.repeat} color="#2f77c9" />
            <StatCard title="VIP Sales" a={data.vip} color="#7e57c2" />
            <StatCard title="Overall" a={data.total} color="#0e2a33" />
          </div>

          {/* Ads & efficiency (auto from report) */}
          <div className="rounded-lg border p-3">
            <p className="text-xs font-semibold mb-2">Ads &amp; Efficiency (from Race Report, after SST)</p>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-xs">
              <div><span className="block text-muted-foreground mb-0.5">Total ad spend</span><div className="font-bold text-base">{rm(data.ads.total)}</div></div>
              <div><span className="block text-muted-foreground mb-0.5">Total leads (PMed)</span><div className="font-bold text-base">{data.leads.total.toLocaleString()}</div></div>
              <div><span className="block text-muted-foreground mb-0.5">ROAS (Sales ÷ Ads)</span><div className="font-bold text-base">{data.roas.toFixed(2)}</div></div>
              <div><span className="block text-muted-foreground mb-0.5">CPL (Ads ÷ Leads)</span><div className="font-bold text-base">{rm(data.leads.total ? data.ads.total / data.leads.total : 0)}</div></div>
            </div>
          </div>

          {/* Per-page */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            {data.pages.map(p => (
              <div key={p.name} className="rounded-lg border p-3">
                <p className="text-sm font-semibold mb-2">{p.name}</p>
                <div className="space-y-0.5 text-xs">
                  <div className="flex justify-between"><span className="text-muted-foreground">Ad spend</span><span className="font-medium">{rm(p.ad)}</span></div>
                  <div className="flex justify-between"><span className="text-muted-foreground">Leads (PMed)</span><span className="font-medium">{p.leads.toLocaleString()}</span></div>
                  <div className="flex justify-between"><span className="text-muted-foreground">CPL</span><span className="font-bold">{rm(p.cpl)}</span></div>
                  <div className="flex justify-between"><span className="text-muted-foreground">Sales (FB channel)</span><span className="font-medium">{rm(p.sales)}</span></div>
                  <div className="flex justify-between"><span className="text-muted-foreground">ROAS</span><span className="font-bold">{p.roas.toFixed(2)}</span></div>
                </div>
              </div>
            ))}
          </div>

          {/* Sales by platform */}
          <div className="rounded-lg border overflow-hidden">
            <div className="px-3 py-2 bg-muted/50 text-xs font-semibold">Sales by platform / channel</div>
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b text-muted-foreground">
                  <th className="px-3 py-1.5 text-left font-medium">Channel</th>
                  <th className="px-3 py-1.5 text-right font-medium">Orders</th>
                  <th className="px-3 py-1.5 text-right font-medium">Sales</th>
                  <th className="px-3 py-1.5 text-right font-medium">% of sales</th>
                </tr>
              </thead>
              <tbody>
                {data.channels.length === 0 ? (
                  <tr><td colSpan={4} className="px-3 py-6 text-center text-muted-foreground">No orders this month.</td></tr>
                ) : data.channels.map(c => (
                  <tr key={c.channel} className="border-b last:border-0">
                    <td className="px-3 py-1.5">{c.channel}</td>
                    <td className="px-3 py-1.5 text-right">{c.orders.toLocaleString()}</td>
                    <td className="px-3 py-1.5 text-right">{rm(c.sales)}</td>
                    <td className="px-3 py-1.5 text-right">{c.pct}%</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <p className="text-[11px] text-muted-foreground">
            Ads (after SST) &amp; leads (PMed) per page and New/Repeat come from the Race Report; VIP &amp; channel breakdown from the order table. All live from Lark.
          </p>
        </CardContent></Card>
      )}
    </div>
  )
}
