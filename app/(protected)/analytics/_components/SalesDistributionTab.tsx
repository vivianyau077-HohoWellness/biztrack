'use client'

import { useQuery } from '@tanstack/react-query'
import { Card, CardContent } from '@/components/ui/card'
import { BarChart, Bar, XAxis, YAxis, Tooltip, Legend, ResponsiveContainer, CartesianGrid } from 'recharts'

type M = {
  month: string
  whatsapp: number
  newWaSales: number
  repeatWaSales: number
}
type Data = { months: string[]; metrics: M[] }

const MLABEL: Record<string, string> = {
  '2026-01': "Jan'26", '2026-02': "Feb'26", '2026-03': "Mar'26", '2026-04': "Apr'26",
  '2026-05': "May'26", '2026-06': "Jun'26", '2026-07': "Jul'26", '2026-08': "Aug'26",
  '2026-09': "Sep'26", '2026-10': "Oct'26", '2026-11': "Nov'26", '2026-12': "Dec'26",
}
const mlabel = (m: string) => MLABEL[m] ?? m
const rm = (n: number) => 'RM ' + Math.round(n).toLocaleString()
const NEW_C = '#22a06b'
const REP_C = '#1C7293'

export default function SalesDistributionTab() {
  const { data, isLoading, error } = useQuery({
    queryKey: ['sales-matrix'],
    queryFn: async () => {
      const res = await fetch('/api/analytics/sales-analysis')
      if (!res.ok) throw new Error('Failed to load')
      return res.json() as Promise<Data>
    },
  })

  if (error) return <p className="text-sm text-red-600">Failed to load sales distribution.</p>
  if (isLoading || !data) return <div className="h-64 bg-muted/30 rounded-lg animate-pulse" />

  const rows = data.metrics.map(m => {
    const nw = m.newWaSales || 0
    const rw = m.repeatWaSales || 0
    const base = nw + rw
    return {
      month: mlabel(m.month),
      newWa: nw,
      repWa: rw,
      waTotal: m.whatsapp || 0,
      newPct: base ? (nw / base) * 100 : 0,
      repPct: base ? (rw / base) * 100 : 0,
    }
  })

  // Averages / insight
  const totNew = rows.reduce((s, r) => s + r.newWa, 0)
  const totRep = rows.reduce((s, r) => s + r.repWa, 0)
  const totBase = totNew + totRep
  const avgNewPct = totBase ? (totNew / totBase) * 100 : 0
  const avgRepPct = totBase ? (totRep / totBase) * 100 : 0
  const first = rows[0], last = rows[rows.length - 1]
  const repTrend = first && last ? last.repPct - first.repPct : 0

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-lg font-semibold text-gray-900">WhatsApp — New vs Repeat Sales Distribution</h2>
        <p className="text-sm text-muted-foreground">
          Where WhatsApp customers&apos; sales land each month — New vs Repeat, classified by phone number &amp; AUTO N/R. Live from Lark.
        </p>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <Card><CardContent className="p-4">
          <p className="text-xs text-muted-foreground">Total WhatsApp Sales (classified)</p>
          <p className="text-2xl font-bold">{rm(totBase)}</p>
        </CardContent></Card>
        <Card><CardContent className="p-4">
          <p className="text-xs text-muted-foreground">New share (avg)</p>
          <p className="text-2xl font-bold" style={{ color: NEW_C }}>{avgNewPct.toFixed(1)}%</p>
          <p className="text-[11px] text-muted-foreground">{rm(totNew)}</p>
        </CardContent></Card>
        <Card><CardContent className="p-4">
          <p className="text-xs text-muted-foreground">Repeat share (avg)</p>
          <p className="text-2xl font-bold" style={{ color: REP_C }}>{avgRepPct.toFixed(1)}%</p>
          <p className="text-[11px] text-muted-foreground">{rm(totRep)}</p>
        </CardContent></Card>
      </div>

      {/* Stacked bar chart */}
      <Card><CardContent className="p-4">
        <p className="text-sm font-semibold mb-3">Monthly WhatsApp sales — New + Repeat</p>
        <div className="h-72">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={rows} margin={{ top: 8, right: 8, left: 8, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e5e7eb" />
              <XAxis dataKey="month" tick={{ fontSize: 12 }} />
              <YAxis tick={{ fontSize: 12 }} tickFormatter={(v: number) => 'RM' + (v / 1000) + 'k'} />
              <Tooltip formatter={(v: number, name: string) => [rm(v), name]} />
              <Legend />
              <Bar dataKey="newWa" stackId="wa" name="New" fill={NEW_C} radius={[0, 0, 0, 0]} />
              <Bar dataKey="repWa" stackId="wa" name="Repeat" fill={REP_C} radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </CardContent></Card>

      {/* Table */}
      <Card><CardContent className="p-4">
        <div className="overflow-x-auto">
          <table className="w-full text-sm border-collapse">
            <thead>
              <tr className="bg-muted/50 text-xs">
                <th className="px-3 py-2 text-left font-semibold">Month</th>
                <th className="px-3 py-2 text-right font-semibold">WhatsApp Total</th>
                <th className="px-3 py-2 text-right font-semibold" style={{ color: NEW_C }}>New Sales</th>
                <th className="px-3 py-2 text-right font-semibold" style={{ color: NEW_C }}>New %</th>
                <th className="px-3 py-2 text-right font-semibold" style={{ color: REP_C }}>Repeat Sales</th>
                <th className="px-3 py-2 text-right font-semibold" style={{ color: REP_C }}>Repeat %</th>
              </tr>
            </thead>
            <tbody>
              {rows.map(r => (
                <tr key={r.month} className="border-b last:border-0 hover:bg-muted/20">
                  <td className="px-3 py-1.5 text-left font-medium">{r.month}</td>
                  <td className="px-3 py-1.5 text-right">{rm(r.waTotal)}</td>
                  <td className="px-3 py-1.5 text-right">{rm(r.newWa)}</td>
                  <td className="px-3 py-1.5 text-right font-medium" style={{ color: NEW_C }}>{r.newPct.toFixed(1)}%</td>
                  <td className="px-3 py-1.5 text-right">{rm(r.repWa)}</td>
                  <td className="px-3 py-1.5 text-right font-medium" style={{ color: REP_C }}>{r.repPct.toFixed(1)}%</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="text-[11px] text-muted-foreground mt-2">New % / Repeat % are shares of classified WhatsApp sales (New + Repeat). &quot;WhatsApp Total&quot; may exceed New + Repeat when some orders are not yet tagged.</p>
      </CardContent></Card>

      {/* Insight */}
      <Card><CardContent className="p-4">
        <p className="text-xs font-semibold mb-1">Read-out</p>
        <ul className="space-y-1 text-xs text-foreground">
          <li className="flex gap-1.5"><span className="text-muted-foreground">•</span><span>On average, {avgRepPct.toFixed(0)}% of WhatsApp sales are repeat customers and {avgNewPct.toFixed(0)}% are new.</span></li>
          {Math.abs(repTrend) >= 1 && (
            <li className="flex gap-1.5"><span className="text-muted-foreground">•</span><span>Repeat share has {repTrend > 0 ? 'risen' : 'fallen'} {Math.abs(repTrend).toFixed(1)} pts from {first.month} to {last.month} — {repTrend > 0 ? 'retention is strengthening (cheaper, no ad cost).' : 'watch retention; leaning more on new (ad-funded) customers.'}</span></li>
          )}
          <li className="flex gap-1.5"><span className="text-muted-foreground">•</span><span>Repeat sales carry no ad cost, so a higher repeat share directly lifts net margin. Grow it via CRM / re-purchase reminders on WhatsApp.</span></li>
        </ul>
      </CardContent></Card>
    </div>
  )
}
