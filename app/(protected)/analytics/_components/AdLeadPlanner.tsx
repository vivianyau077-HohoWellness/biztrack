'use client'

import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Card, CardContent } from '@/components/ui/card'

type M = {
  month: string; totalSales: number
  fbBeauty: number; fbRepair: number; fbSG: number; whatsapp: number; shopee: number; website: number; lazada: number; others: number
  adBeauty: number; adRepair: number; adSGspend: number
  leadBeauty: number; leadRepair: number; leadSGn: number
  ordBeauty: number; ordRepair: number
}
type Data = { months: string[]; metrics: M[] }

const MLABEL: Record<string, string> = {
  '2026-01': "Jan'26", '2026-02': "Feb'26", '2026-03': "Mar'26", '2026-04': "Apr'26",
  '2026-05': "May'26", '2026-06': "Jun'26", '2026-07': "Jul'26",
}
const mlabel = (m: string) => MLABEL[m] ?? m
const rm = (n: number) => (isFinite(n) ? 'RM ' + Math.round(n).toLocaleString() : '—')
const num = (n: number) => (isFinite(n) ? Math.round(n).toLocaleString() : '—')

export default function AdLeadPlanner() {
  const [month, setMonth] = useState('')
  const [target, setTarget] = useState(0)
  const [days, setDays] = useState(30)
  const [pageTargets, setPageTargets] = useState<Record<string, number>>({})

  const { data, isLoading, error } = useQuery({
    queryKey: ['sales-matrix'],
    queryFn: async () => {
      const res = await fetch('/api/analytics/sales-analysis')
      if (!res.ok) throw new Error('Failed to load')
      return res.json() as Promise<Data>
    },
  })

  if (error) return <p className="text-sm text-red-600">Failed to load.</p>
  if (isLoading || !data) return <div className="h-40 bg-muted/30 rounded-lg animate-pulse" />

  const months = data.months
  const ref = month || months[months.length - 1] || ''
  const m = data.metrics.find(x => x.month === ref)
  if (!m) return <p className="text-sm text-muted-foreground">No data.</p>

  const tgt = target || m.totalSales
  const share = (v: number) => (m.totalSales ? v / m.totalSales : 0)

  const channels = [
    { label: 'FB (焕肤王)', sales: m.fbBeauty },
    { label: 'FB (修复)', sales: m.fbRepair },
    { label: 'FB SG', sales: m.fbSG },
    { label: 'Whatsapp', sales: m.whatsapp },
    { label: 'Shopee', sales: m.shopee },
    { label: 'Website', sales: m.website },
    { label: 'Lazada', sales: m.lazada },
    { label: 'Others', sales: m.others },
  ]

  const pages = [
    { name: 'Beauty (焕肤王)', color: '#22a06b', sales: m.fbBeauty, orders: m.ordBeauty, ad: m.adBeauty, leads: m.leadBeauty },
    { name: 'Repair (钻石露)', color: '#c0392b', sales: m.fbRepair, orders: m.ordRepair, ad: m.adRepair, leads: m.leadRepair },
  ]

  return (
    <Card>
      <CardContent className="p-4 space-y-4">
        <div className="flex flex-wrap items-end gap-4">
          <label className="text-xs">
            <span className="block text-muted-foreground mb-1">Reference month (history)</span>
            <select value={ref} onChange={e => setMonth(e.target.value)} className="h-8 rounded-md border border-input bg-background px-2 text-sm">
              {months.map(mm => <option key={mm} value={mm}>{mlabel(mm)}</option>)}
            </select>
          </label>
          <label className="text-xs">
            <span className="block text-muted-foreground mb-1">Target total online sales</span>
            <span className="flex items-center gap-1">
              <input type="number" value={tgt} onChange={e => setTarget(parseFloat(e.target.value) || 0)} className="w-32 h-8 rounded-md border border-input bg-background px-2 text-right text-sm" />
              <span className="text-muted-foreground">RM</span>
            </span>
          </label>
          <label className="text-xs">
            <span className="block text-muted-foreground mb-1">Days / month</span>
            <input type="number" value={days} onChange={e => setDays(parseFloat(e.target.value) || 30)} className="w-16 h-8 rounded-md border border-input bg-background px-2 text-right text-sm" />
          </label>
        </div>

        {/* Channel mix (history → projected at target) */}
        <div className="rounded-lg border overflow-hidden">
          <div className="px-3 py-2 bg-muted/50 text-xs font-semibold">Channel mix — {mlabel(ref)} history → projected at target</div>
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b text-muted-foreground">
                <th className="px-3 py-1.5 text-left font-medium">Channel</th>
                <th className="px-3 py-1.5 text-right font-medium">{mlabel(ref)} sales</th>
                <th className="px-3 py-1.5 text-right font-medium">Share %</th>
                <th className="px-3 py-1.5 text-right font-medium">Projected sales</th>
              </tr>
            </thead>
            <tbody>
              {channels.map(c => (
                <tr key={c.label} className="border-b last:border-0">
                  <td className="px-3 py-1.5">{c.label}</td>
                  <td className="px-3 py-1.5 text-right">{rm(c.sales)}</td>
                  <td className="px-3 py-1.5 text-right">{(share(c.sales) * 100).toFixed(1)}%</td>
                  <td className="px-3 py-1.5 text-right font-medium">{rm(share(c.sales) * tgt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Per-page lead / ad plan (from real conversion & CPL) */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {pages.map(p => {
            const aov = p.orders ? p.sales / p.orders : 0
            const conv = p.leads ? p.orders / p.leads : 0
            const roas = p.ad ? p.sales / p.ad : 0
            const cpl = p.leads ? p.ad / p.leads : 0
            const defProj = share(p.sales) * tgt
            const projSales = p.name in pageTargets ? pageTargets[p.name] : defProj
            const projOrders = aov ? projSales / aov : 0
            const projLeads = conv ? projOrders / conv : 0
            const projAd = roas ? projSales / roas : 0
            return (
              <div key={p.name} className="rounded-lg border p-3" style={{ borderColor: p.color + '55' }}>
                <p className="text-sm font-semibold mb-2" style={{ color: p.color }}>{p.name}</p>
                <div className="grid grid-cols-2 gap-x-4 gap-y-0.5 text-xs">
                  <div className="text-muted-foreground col-span-2 font-medium mt-1">Actual ({mlabel(ref)})</div>
                  <div className="flex justify-between"><span className="text-muted-foreground">AOV</span><span>{rm(aov)}</span></div>
                  <div className="flex justify-between"><span className="text-muted-foreground">Conversion</span><span>{(conv * 100).toFixed(1)}%</span></div>
                  <div className="flex justify-between"><span className="text-muted-foreground">CPL</span><span>{rm(cpl)}</span></div>
                  <div className="flex justify-between"><span className="text-muted-foreground">ROAS</span><span>{roas.toFixed(2)}</span></div>
                  <div className="text-muted-foreground col-span-2 font-medium mt-2">Target for this page (editable)</div>
                  <div className="flex justify-between items-center col-span-2">
                    <span className="text-muted-foreground">Target sales</span>
                    <span className="flex items-center gap-1">
                      <input type="number" value={Math.round(projSales)} onChange={e => setPageTargets(t => ({ ...t, [p.name]: parseFloat(e.target.value) || 0 }))} className="w-28 h-7 rounded-md border border-input bg-background px-2 text-right text-xs" />
                      <span className="text-muted-foreground">RM</span>
                    </span>
                  </div>
                  <div className="flex justify-between"><span className="text-muted-foreground">Orders needed</span><span className="font-medium">{num(projOrders)}</span></div>
                  <div className="flex justify-between"><span className="font-semibold" style={{ color: p.color }}>Leads / day</span><span className="font-bold" style={{ color: p.color }}>{days ? num(projLeads / days) : '—'}</span></div>
                  <div className="flex justify-between"><span className="font-semibold" style={{ color: p.color }}>Ad / day</span><span className="font-bold" style={{ color: p.color }}>{days ? rm(projAd / days) : '—'}</span></div>
                </div>
              </div>
            )
          })}
        </div>

        <p className="text-[11px] text-muted-foreground">
          Prediction uses {mlabel(ref)}&apos;s real channel mix, AOV, conversion &amp; CPL per page. Change the reference month or target to re-plan. Live from Lark.
        </p>
      </CardContent>
    </Card>
  )
}
