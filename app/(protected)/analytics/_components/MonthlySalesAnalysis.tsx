'use client'

import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Card, CardContent } from '@/components/ui/card'
import { cn } from '@/lib/utils'

type Agg = { orders: number; sales: number; aov: number }
type Data = {
  month: string
  channels: { channel: string; orders: number; sales: number; pct: number }[]
  total: Agg; new: Agg; repeat: Agg; vip: Agg
}

const MONTHS = ['2026-01', '2026-02', '2026-03', '2026-04', '2026-05', '2026-06']
const MLABEL: Record<string, string> = { '2026-01': "Jan'26", '2026-02': "Feb'26", '2026-03': "Mar'26", '2026-04': "Apr'26", '2026-05': "May'26", '2026-06': "Jun'26" }
// Online Meta Ads spend from the P&L (prefill).
const ADS: Record<string, number> = { '2026-01': 167673, '2026-02': 198900, '2026-03': 260938, '2026-04': 184818, '2026-05': 230694 }
const BEAUTY = ['【焕肤】FB ', '【焕肤】FB', '焕肤 ENG']
const REPAIR = ['【伤口】FB', '伤口 ENG']

function rm(n: number) { if (!isFinite(n)) return '—'; return 'RM ' + Math.round(n).toLocaleString() }
function NumInput({ val, set, w = 'w-24' }: { val: number; set: (n: number) => void; w?: string }) {
  return <input type="number" value={val} onChange={e => set(parseFloat(e.target.value) || 0)} className={cn(w, 'h-7 rounded-md border border-input bg-background px-2 text-right text-sm')} />
}

function StatCard({ title, a, color }: { title: string; a: Agg; color: string }) {
  return (
    <div className="rounded-lg border p-3">
      <p className="text-xs font-semibold mb-1" style={{ color }}>{title}</p>
      <div className="text-xl font-bold">{rm(a.sales)}</div>
      <div className="text-xs text-muted-foreground mt-0.5">{a.orders.toLocaleString()} orders · AOV {rm(a.aov)}</div>
    </div>
  )
}

function groupSum(channels: Data['channels'], names: string[]) {
  let orders = 0, sales = 0
  for (const c of channels) if (names.includes(c.channel)) { orders += c.orders; sales += c.sales }
  return { orders, sales }
}

function Body({ data, adDefault }: { data: Data; adDefault: number }) {
  const [ad, setAd] = useState(adDefault)
  const [leads, setLeads] = useState(0)
  const [bAd, setBAd] = useState(0)
  const [bLeads, setBLeads] = useState(0)
  const [rAd, setRAd] = useState(0)
  const [rLeads, setRLeads] = useState(0)

  const roas = ad > 0 ? data.total.sales / ad : 0
  const cpl = leads > 0 ? ad / leads : 0
  const beauty = groupSum(data.channels, BEAUTY)
  const repair = groupSum(data.channels, REPAIR)

  return (
    <div className="space-y-4">
      {/* New / Repeat / VIP / Overall */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <StatCard title="New Sales" a={data.new} color="#22a06b" />
        <StatCard title="Repeat Sales" a={data.repeat} color="#2f77c9" />
        <StatCard title="VIP Sales" a={data.vip} color="#7e57c2" />
        <StatCard title="Overall" a={data.total} color="#0e2a33" />
      </div>

      {/* Ads efficiency */}
      <div className="rounded-lg border p-3">
        <p className="text-xs font-semibold mb-2">Ads &amp; Efficiency</p>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-xs">
          <label><span className="block text-muted-foreground mb-1">Ad spend (RM)</span><NumInput w="w-28" val={ad} set={setAd} /></label>
          <label><span className="block text-muted-foreground mb-1">Total leads</span><NumInput w="w-24" val={leads} set={setLeads} /></label>
          <div><span className="block text-muted-foreground mb-1">ROAS (Sales ÷ Ads)</span><div className="font-bold text-base">{roas.toFixed(2)}</div></div>
          <div><span className="block text-muted-foreground mb-1">CPL (Ads ÷ Leads)</span><div className="font-bold text-base">{rm(cpl)}</div></div>
        </div>
      </div>

      {/* Per-page CPL */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        {[
          { name: 'Beauty Page', g: beauty, ad: bAd, setAd: setBAd, leads: bLeads, setLeads: setBLeads, color: '#22a06b' },
          { name: 'Repair Page', g: repair, ad: rAd, setAd: setRAd, leads: rLeads, setLeads: setRLeads, color: '#c0392b' },
        ].map(p => {
          const pcpl = p.leads > 0 ? p.ad / p.leads : 0
          const proas = p.ad > 0 ? p.g.sales / p.ad : 0
          return (
            <div key={p.name} className="rounded-lg border p-3" style={{ borderColor: p.color + '55' }}>
              <p className="text-sm font-semibold mb-1" style={{ color: p.color }}>{p.name}</p>
              <div className="text-xs text-muted-foreground mb-2">Sales {rm(p.g.sales)} · {p.g.orders} orders (from FB channel)</div>
              <div className="grid grid-cols-2 gap-2 text-xs">
                <label><span className="block text-muted-foreground mb-1">Ad spend (RM)</span><NumInput w="w-24" val={p.ad} set={p.setAd} /></label>
                <label><span className="block text-muted-foreground mb-1">Leads</span><NumInput w="w-20" val={p.leads} set={p.setLeads} /></label>
                <div><span className="block text-muted-foreground mb-1">CPL</span><div className="font-bold">{rm(pcpl)}</div></div>
                <div><span className="block text-muted-foreground mb-1">ROAS</span><div className="font-bold">{proas.toFixed(2)}</div></div>
              </div>
            </div>
          )
        })}
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
            {data.channels.map(c => (
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
        Sales / orders / New-Repeat-VIP read live from the DD order table (AUTO N/R &amp; AUTO VIP). Ad spend prefilled from P&amp;L; enter leads to get ROAS &amp; CPL. Leads aren’t in the order data, so type them in.
      </p>
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
        <Card><CardContent className="p-4"><Body key={month} data={data} adDefault={ADS[month] ?? 0} /></CardContent></Card>
      )}
    </div>
  )
}
