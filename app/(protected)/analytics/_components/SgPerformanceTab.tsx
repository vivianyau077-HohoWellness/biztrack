'use client'

import { useQuery } from '@tanstack/react-query'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import {
  ComposedChart, Bar, Line, XAxis, YAxis, Tooltip, CartesianGrid, ResponsiveContainer,
} from 'recharts'

interface SgMonth {
  month: string; label: string
  pmFb: number; pmWa: number; pm: number
  sales: number; ad: number; cpm: number; roas: number
  newOrder: number; newSales: number; newAov: number
  repeatOrder: number; repeatSales: number; repeatAov: number
}

const rm = (n: number) => `RM ${Math.round(n).toLocaleString()}`

export default function SgPerformanceTab({ selectedBrand }: { selectedBrand?: string }) {
  const { data, isLoading, error } = useQuery({
    queryKey: ['dd-sg-monthly'],
    enabled: selectedBrand === 'DD',
    queryFn: async () => {
      const res = await fetch('/api/analytics/dd-sg-monthly')
      if (!res.ok) { const b = await res.json().catch(() => null); throw new Error(b?.error || `HTTP ${res.status}`) }
      return res.json() as Promise<{ months: SgMonth[] }>
    },
    retry: false,
  })

  if (selectedBrand !== 'DD') return <p className="text-sm text-muted-foreground">Select the DD brand to see Singapore performance.</p>
  if (error) return <p className="text-sm text-red-600">Failed to load SG data — {(error as Error).message}</p>
  const months = data?.months ?? []
  const totals = months.reduce((a, m) => ({ pm: a.pm + m.pm, sales: a.sales + m.sales, ad: a.ad + m.ad }), { pm: 0, sales: 0, ad: 0 })
  const totCpm = totals.pm ? Math.round((totals.ad / totals.pm) * 100) / 100 : 0
  const totRoas = totals.ad ? Math.round((totals.sales / totals.ad) * 100) / 100 : 0

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-lg font-semibold">Singapore Performance · 2026</h2>
        <p className="text-xs text-muted-foreground">PM (messages) · Sales · Ad Spend · CPM (cost/message) · ROAS · live from Lark Race Report.</p>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
        {[
          { l: 'Total PM', v: totals.pm.toLocaleString(), c: 'text-foreground' },
          { l: 'SG Sales', v: rm(totals.sales), c: 'text-emerald-600' },
          { l: 'Ad Spend', v: rm(totals.ad), c: 'text-orange-600' },
          { l: 'Avg CPM', v: `RM ${totCpm}`, c: 'text-foreground' },
          { l: 'ROAS', v: `${totRoas}x`, c: 'text-blue-600' },
        ].map(k => (
          <div key={k.l} className="rounded-lg bg-muted/40 p-3">
            <div className="text-xs text-muted-foreground">{k.l}</div>
            <div className={`text-xl font-bold ${k.c}`}>{isLoading ? '…' : k.v}</div>
          </div>
        ))}
      </div>

      {/* Chart: Sales vs Ad Spend (bars) + ROAS (line) */}
      <Card>
        <CardHeader className="pb-2"><CardTitle className="text-sm">Sales vs Ad Spend + ROAS by month</CardTitle></CardHeader>
        <CardContent>
          <div className="h-[320px] w-full">
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart data={months} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#2c2c2a" vertical={false} />
                <XAxis dataKey="label" tick={{ fontSize: 11, fill: '#898781' }} />
                <YAxis yAxisId="l" tick={{ fontSize: 11, fill: '#898781' }} tickFormatter={(v: number) => `RM${Math.round(v / 1000)}k`} />
                <YAxis yAxisId="r" orientation="right" domain={[0, 6]} tick={{ fontSize: 11, fill: '#378add' }} tickFormatter={(v: number) => `${v}x`} />
                <Tooltip formatter={(v: number, n: string) => n === 'ROAS' ? `${v}x` : rm(v)} contentStyle={{ fontSize: 12 }} />
                <Bar yAxisId="l" dataKey="sales" name="SG Sales" fill="#1baf7a" radius={[3, 3, 0, 0]} />
                <Bar yAxisId="l" dataKey="ad" name="Ad Spend" fill="#eb6834" radius={[3, 3, 0, 0]} />
                <Line yAxisId="r" dataKey="roas" name="ROAS" stroke="#378add" strokeWidth={2} strokeDasharray="5 4" dot={{ r: 3 }} />
              </ComposedChart>
            </ResponsiveContainer>
          </div>
          <div className="mt-1 flex flex-wrap gap-4 text-xs text-muted-foreground">
            <span className="flex items-center gap-1.5"><span className="inline-block h-2.5 w-2.5 rounded-sm" style={{ background: '#1baf7a' }} />SG Sales</span>
            <span className="flex items-center gap-1.5"><span className="inline-block h-2.5 w-2.5 rounded-sm" style={{ background: '#eb6834' }} />Ad Spend</span>
            <span className="flex items-center gap-1.5"><span className="inline-block h-0 w-4 border-t-2 border-dashed" style={{ borderColor: '#378add' }} />ROAS (right)</span>
          </div>
        </CardContent>
      </Card>

      {/* Table */}
      <Card>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead className="bg-muted/50">
                <tr className="border-b">
                  <th className="px-3 py-2 text-left font-medium text-muted-foreground">Month</th>
                  <th className="px-3 py-2 text-right font-medium text-muted-foreground">FB PM</th>
                  <th className="px-3 py-2 text-right font-medium text-muted-foreground">WA PM</th>
                  <th className="px-3 py-2 text-right font-medium text-muted-foreground">Total PM</th>
                  <th className="px-3 py-2 text-right font-medium text-muted-foreground">Sales</th>
                  <th className="px-3 py-2 text-right font-medium text-muted-foreground">Ad Spend</th>
                  <th className="px-3 py-2 text-right font-medium text-muted-foreground">CPM</th>
                  <th className="px-3 py-2 text-right font-medium text-muted-foreground">ROAS</th>
                </tr>
              </thead>
              <tbody>
                {months.map(m => (
                  <tr key={m.month} className="border-b hover:bg-muted/30">
                    <td className="px-3 py-2 font-medium">{m.label}</td>
                    <td className="px-3 py-2 text-right">{m.pmFb.toLocaleString()}</td>
                    <td className="px-3 py-2 text-right">{m.pmWa.toLocaleString()}</td>
                    <td className="px-3 py-2 text-right">{m.pm.toLocaleString()}</td>
                    <td className="px-3 py-2 text-right">{rm(m.sales)}</td>
                    <td className="px-3 py-2 text-right">{rm(m.ad)}</td>
                    <td className="px-3 py-2 text-right">RM {m.cpm}</td>
                    <td className={`px-3 py-2 text-right font-semibold ${m.roas >= 3 ? 'text-emerald-600' : m.roas >= 2 ? 'text-amber-600' : 'text-red-600'}`}>{m.roas}x</td>
                  </tr>
                ))}
                {months.length > 0 && (
                  <tr className="border-t-2 font-semibold bg-muted/30">
                    <td className="px-3 py-2">Total</td>
                    <td className="px-3 py-2 text-right">{months.reduce((s, m) => s + m.pmFb, 0).toLocaleString()}</td>
                    <td className="px-3 py-2 text-right">{months.reduce((s, m) => s + m.pmWa, 0).toLocaleString()}</td>
                    <td className="px-3 py-2 text-right">{totals.pm.toLocaleString()}</td>
                    <td className="px-3 py-2 text-right">{rm(totals.sales)}</td>
                    <td className="px-3 py-2 text-right">{rm(totals.ad)}</td>
                    <td className="px-3 py-2 text-right">RM {totCpm}</td>
                    <td className="px-3 py-2 text-right">{totRoas}x</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      {/* New vs Repeat (SG) */}
      <Card>
        <CardHeader className="pb-2"><CardTitle className="text-sm">New vs Repeat (SG) · quantity, sales &amp; AOV</CardTitle></CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead className="bg-muted/50">
                <tr className="border-b">
                  <th className="px-3 py-2 text-left font-medium text-muted-foreground">Month</th>
                  <th className="px-3 py-2 text-right font-medium text-emerald-600">New Order</th>
                  <th className="px-3 py-2 text-right font-medium text-emerald-600">New Sales</th>
                  <th className="px-3 py-2 text-right font-medium text-emerald-600">New AOV</th>
                  <th className="px-3 py-2 text-right font-medium text-blue-600">Repeat Order</th>
                  <th className="px-3 py-2 text-right font-medium text-blue-600">Repeat Sales</th>
                  <th className="px-3 py-2 text-right font-medium text-blue-600">Repeat AOV</th>
                </tr>
              </thead>
              <tbody>
                {months.map(m => (
                  <tr key={m.month} className="border-b hover:bg-muted/30">
                    <td className="px-3 py-2 font-medium">{m.label}</td>
                    <td className="px-3 py-2 text-right">{m.newOrder.toLocaleString()}</td>
                    <td className="px-3 py-2 text-right">{rm(m.newSales)}</td>
                    <td className="px-3 py-2 text-right">{rm(m.newAov)}</td>
                    <td className="px-3 py-2 text-right">{m.repeatOrder.toLocaleString()}</td>
                    <td className="px-3 py-2 text-right">{rm(m.repeatSales)}</td>
                    <td className="px-3 py-2 text-right">{rm(m.repeatAov)}</td>
                  </tr>
                ))}
                {months.length > 0 && (() => {
                  const nO = months.reduce((s, m) => s + m.newOrder, 0)
                  const nS = months.reduce((s, m) => s + m.newSales, 0)
                  const rO = months.reduce((s, m) => s + m.repeatOrder, 0)
                  const rS = months.reduce((s, m) => s + m.repeatSales, 0)
                  return (
                    <tr className="border-t-2 font-semibold bg-muted/30">
                      <td className="px-3 py-2">Total</td>
                      <td className="px-3 py-2 text-right">{nO.toLocaleString()}</td>
                      <td className="px-3 py-2 text-right">{rm(nS)}</td>
                      <td className="px-3 py-2 text-right">{rm(nO ? nS / nO : 0)}</td>
                      <td className="px-3 py-2 text-right">{rO.toLocaleString()}</td>
                      <td className="px-3 py-2 text-right">{rm(rS)}</td>
                      <td className="px-3 py-2 text-right">{rm(rO ? rS / rO : 0)}</td>
                    </tr>
                  )
                })()}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
