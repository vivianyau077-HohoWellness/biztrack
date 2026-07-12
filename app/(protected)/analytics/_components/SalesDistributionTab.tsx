'use client'

import { useState, Fragment } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Card, CardContent } from '@/components/ui/card'
import { BarChart, Bar, XAxis, YAxis, Tooltip, Legend, ResponsiveContainer, CartesianGrid, Cell } from 'recharts'

type M = {
  month: string
  whatsapp: number
  newWaSales: number
  repeatWaSales: number
}
type Data = { months: string[]; metrics: M[] }

const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
const mlabel = (m: string) => {
  if (!m || m.length < 7) return m
  const mo = parseInt(m.slice(5, 7), 10)
  return (MON[mo - 1] ?? m) + "'" + m.slice(2, 4)
}
const MONTH_OPTS: Array<[string, string]> = MON.map((l, i) => [(i < 9 ? '0' : '') + (i + 1), l])
const rm = (n: number) => 'RM ' + Math.round(n).toLocaleString()
const NEW_C = '#22a06b'
const REP_C = '#1C7293'

type Row = { raw: string; month: string; newWa: number; repWa: number; waTotal: number; newPct: number; repPct: number }

export default function SalesDistributionTab({ dateFrom }: { dateFrom?: string; dateTo?: string }) {
  const [selYear, setSelYear] = useState('')
  const [selMonth, setSelMonth] = useState('')

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

  const months = data.months
  const years = Array.from(new Set(months.map(mm => mm.slice(0, 4)))).sort()
  const latest = months[months.length - 1] || ''
  const fromYear = dateFrom && dateFrom.length >= 4 ? dateFrom.slice(0, 4) : ''
  const yr = selYear || fromYear || latest.slice(0, 4)
  const mo = selMonth || latest.slice(5, 7)
  const sel = yr + '-' + mo

  const rows: Row[] = data.metrics.map(m => {
    const nw = m.newWaSales || 0
    const rw = m.repeatWaSales || 0
    const base = nw + rw
    return {
      raw: m.month,
      month: mlabel(m.month),
      newWa: nw,
      repWa: rw,
      waTotal: m.whatsapp || 0,
      newPct: base ? (nw / base) * 100 : 0,
      repPct: base ? (rw / base) * 100 : 0,
    }
  })

  const byRaw: Record<string, Row> = {}
  rows.forEach(r => { byRaw[r.raw] = r })
  const yearRows = rows.filter(r => r.raw.slice(0, 4) === yr)
  const selRow = byRaw[sel]

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold text-gray-900">WhatsApp — New vs Repeat Sales Distribution</h2>
          <p className="text-sm text-muted-foreground">
            Where WhatsApp customers&apos; sales land — New vs Repeat, classified by phone number &amp; AUTO N/R. Live from Lark.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-sm text-muted-foreground">Year</span>
          <select value={yr} onChange={e => setSelYear(e.target.value)} className="h-9 rounded-md border border-input bg-background px-3 text-sm font-medium">
            {years.map(y => <option key={y} value={y}>{y}</option>)}
          </select>
          <span className="text-sm text-muted-foreground ml-1">Month</span>
          <select value={mo} onChange={e => setSelMonth(e.target.value)} className="h-9 rounded-md border border-input bg-background px-3 text-sm">
            {MONTH_OPTS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
          </select>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <Card><CardContent className="p-4">
          <p className="text-xs text-muted-foreground">WhatsApp Sales · {mlabel(sel)}</p>
          <p className="text-2xl font-bold">{selRow ? rm(selRow.newWa + selRow.repWa) : '—'}</p>
          {selRow && <p className="text-[11px] text-muted-foreground">Total incl. untagged: {rm(selRow.waTotal)}</p>}
        </CardContent></Card>
        <Card><CardContent className="p-4">
          <p className="text-xs text-muted-foreground">New · {mlabel(sel)}</p>
          <p className="text-2xl font-bold" style={{ color: NEW_C }}>{selRow ? selRow.newPct.toFixed(1) + '%' : '—'}</p>
          {selRow && <p className="text-[11px] text-muted-foreground">{rm(selRow.newWa)}</p>}
        </CardContent></Card>
        <Card><CardContent className="p-4">
          <p className="text-xs text-muted-foreground">Repeat · {mlabel(sel)}</p>
          <p className="text-2xl font-bold" style={{ color: REP_C }}>{selRow ? selRow.repPct.toFixed(1) + '%' : '—'}</p>
          {selRow && <p className="text-[11px] text-muted-foreground">{rm(selRow.repWa)}</p>}
        </CardContent></Card>
      </div>

      <Card><CardContent className="p-4">
        <p className="text-sm font-semibold mb-3">Monthly WhatsApp sales — New + Repeat · {yr} (selected month highlighted)</p>
        <div className="h-72">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={yearRows} margin={{ top: 8, right: 8, left: 8, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e5e7eb" />
              <XAxis dataKey="month" tick={{ fontSize: 12 }} />
              <YAxis tick={{ fontSize: 12 }} tickFormatter={(v: number) => 'RM' + (v / 1000) + 'k'} />
              <Tooltip formatter={(v: number, name: string) => [rm(v), name]} />
              <Legend />
              <Bar dataKey="newWa" stackId="wa" name="New" fill={NEW_C}>
                {yearRows.map(r => <Cell key={r.raw} fillOpacity={r.raw === sel ? 1 : 0.5} />)}
              </Bar>
              <Bar dataKey="repWa" stackId="wa" name="Repeat" fill={REP_C} radius={[4, 4, 0, 0]}>
                {yearRows.map(r => <Cell key={r.raw} fillOpacity={r.raw === sel ? 1 : 0.5} />)}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      </CardContent></Card>

      <Card><CardContent className="p-4">
        <p className="text-sm font-semibold mb-1">Same month, across years — New vs Repeat</p>
        <p className="text-[11px] text-muted-foreground mb-3">Read across a row to compare the same month year-over-year. % = share of classified WhatsApp sales; RM under.</p>
        <div className="overflow-x-auto">
          <table className="w-full text-sm border-collapse">
            <thead>
              <tr className="bg-muted/50">
                <th className="px-3 py-2 text-left font-semibold border-r" rowSpan={2}>Month</th>
                {years.map(y => <th key={y} className="px-3 py-2 text-center font-semibold border-r" colSpan={2}>{y}</th>)}
              </tr>
              <tr className="bg-muted/50">
                {years.map(y => (
                  <Fragment key={y}>
                    <th className="px-3 py-1.5 text-right font-medium" style={{ color: NEW_C }}>New</th>
                    <th className="px-3 py-1.5 text-right font-medium border-r" style={{ color: REP_C }}>Repeat</th>
                  </Fragment>
                ))}
              </tr>
            </thead>
            <tbody>
              {MONTH_OPTS.map(([mm, label]) => (
                <tr key={mm} className={'border-b last:border-0 ' + (mm === mo ? 'bg-primary/10 font-medium' : 'hover:bg-muted/20')}>
                  <td className="px-3 py-1.5 text-left font-medium border-r">{label}</td>
                  {years.map(y => {
                    const r = byRaw[y + '-' + mm]
                    return (
                      <Fragment key={y}>
                        <td className="px-3 py-1.5 text-right">
                          {r ? <><span style={{ color: NEW_C }} className="text-base font-semibold">{rm(r.newWa)}</span><br /><span className="text-xs text-muted-foreground">{r.newPct.toFixed(1)}%</span></> : <span className="text-muted-foreground">—</span>}
                        </td>
                        <td className="px-3 py-1.5 text-right border-r">
                          {r ? <><span style={{ color: REP_C }} className="text-base font-semibold">{rm(r.repWa)}</span><br /><span className="text-xs text-muted-foreground">{r.repPct.toFixed(1)}%</span></> : <span className="text-muted-foreground">—</span>}
                        </td>
                      </Fragment>
                    )
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="text-[11px] text-muted-foreground mt-2">&quot;—&quot; = no WhatsApp data that month. New % / Repeat % are shares of classified WhatsApp sales (New + Repeat).</p>
      </CardContent></Card>
    </div>
  )
}
