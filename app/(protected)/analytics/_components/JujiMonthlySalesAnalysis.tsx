'use client'

import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Card, CardContent } from '@/components/ui/card'
import { cn } from '@/lib/utils'

type JujiMonth = {
  month: string
  totalSales: number; totalOrder: number
  fb: number; fbEng: number; wa: number; shopee: number; shopeeSg: number; lazada: number; offline: number; others: number
  newOrder: number; newSales: number; repeatOrder: number; repeatSales: number; vipOrder: number; vipSales: number
  newAov: number; repeatAov: number; vipAov: number; overallAov: number
  adSpend: number; roas: number; messages: number; costPerMsg: number; goal: number
}
type Data = { months: string[]; metrics: JujiMonth[] }

const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
const mlabel = (m: string) => { if (!m || m.length < 7) return m; const mo = parseInt(m.slice(5, 7), 10); return (MON[mo - 1] ?? m) + "'" + m.slice(2, 4) }
const MONTH_OPTS: Array<[string, string]> = MON.map((l, i) => [(i < 9 ? '0' : '') + (i + 1), l])
const rm = (n: number) => 'RM ' + Math.round(n).toLocaleString()
const n0 = (n: number) => Math.round(n).toLocaleString()
const x2 = (n: number) => n.toFixed(2)

type Fmt = 'rm' | 'num' | 'x'
type Row = { label: string; key?: keyof JujiMonth; fmt?: Fmt; bold?: boolean; spacer?: boolean }
const ROWS: Row[] = [
  { label: 'Total Online Sales', key: 'totalSales', fmt: 'rm', bold: true },
  { label: 'Total Online Order', key: 'totalOrder', fmt: 'num', bold: true },
  { label: 'FB (JUJI)', key: 'fb', fmt: 'rm' },
  { label: 'FB ENG', key: 'fbEng', fmt: 'rm' },
  { label: 'WhatsApp', key: 'wa', fmt: 'rm' },
  { label: 'Shopee', key: 'shopee', fmt: 'rm' },
  { label: 'Shopee SG', key: 'shopeeSg', fmt: 'rm' },
  { label: 'Lazada', key: 'lazada', fmt: 'rm' },
  { label: 'Offline', key: 'offline', fmt: 'rm' },
  { label: 'Others (Staff/Big Caring)', key: 'others', fmt: 'rm' },
  { label: 'ROAS', key: 'roas', fmt: 'x' },
  { label: 'FB Ads Spend (SST)', key: 'adSpend', fmt: 'rm', bold: true },
  { label: 'No. of Messages', key: 'messages', fmt: 'num' },
  { label: 'Cost / Message', key: 'costPerMsg', fmt: 'rm' },
  { label: '', spacer: true },
  { label: 'New Order', key: 'newOrder', fmt: 'num', bold: true },
  { label: 'New Sales', key: 'newSales', fmt: 'rm' },
  { label: 'New AOV', key: 'newAov', fmt: 'rm' },
  { label: '', spacer: true },
  { label: 'Repeat Order', key: 'repeatOrder', fmt: 'num', bold: true },
  { label: 'Repeat Sales', key: 'repeatSales', fmt: 'rm' },
  { label: 'Repeat AOV', key: 'repeatAov', fmt: 'rm' },
  { label: '', spacer: true },
  { label: 'Goal Sales', key: 'goal', fmt: 'rm', bold: true },
]

function fmtVal(v: number, fmt?: Fmt) {
  if (fmt === 'rm') return rm(v)
  if (fmt === 'x') return x2(v)
  return n0(v)
}

export default function JujiMonthlySalesAnalysis() {
  const [selYear, setSelYear] = useState('')
  const [selMonth, setSelMonth] = useState('')

  const { data, isLoading, error } = useQuery({
    queryKey: ['juji-monthly'],
    queryFn: async () => {
      const res = await fetch('/api/analytics/juji-monthly')
      if (!res.ok) { const b = await res.json().catch(() => null); throw new Error(b?.error || ('HTTP ' + res.status)) }
      return res.json() as Promise<Data>
    },
    retry: false,
  })

  if (error) return <p className="text-sm text-red-600">Failed to load — {(error as Error).message}</p>
  if (isLoading || !data) return <div className="h-40 bg-muted/30 rounded-lg animate-pulse" />

  const months = data.months
  const curMonth = months[months.length - 1] || ''
  const defaultSel = months[months.length - 2] || curMonth
  const yr = selYear || defaultSel.slice(0, 4)
  const mo = selMonth || defaultSel.slice(5, 7)
  const sel = yr + '-' + mo
  const years = Array.from(new Set(months.map(mm => mm.slice(0, 4)))).sort()
  const selMet = data.metrics.find(m => m.month === sel)
  const curMet = data.metrics.find(m => m.month === curMonth)

  return (
    <Card>
      <CardContent className="p-4">
        <div className="flex flex-wrap items-center gap-2 mb-3">
          <span className="text-sm text-muted-foreground">Compare month</span>
          <select value={mo} onChange={e => setSelMonth(e.target.value)} className="h-9 rounded-md border border-input bg-background px-3 text-sm">
            {MONTH_OPTS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
          </select>
          <select value={yr} onChange={e => setSelYear(e.target.value)} className="h-9 rounded-md border border-input bg-background px-3 text-sm">
            {years.map(y => <option key={y} value={y}>{y}</option>)}
          </select>
          <span className="text-xs text-muted-foreground">Deviance = Current ({mlabel(curMonth)}) − {mlabel(sel)}</span>
        </div>

        {!selMet || !curMet ? (
          <p className="text-sm text-muted-foreground py-8 text-center">No data.</p>
        ) : (
          <table className="w-full text-sm border-collapse table-fixed">
            <thead>
              <tr>
                <th className="px-4 py-2.5 text-left font-semibold sticky top-0 z-10 bg-muted" style={{ width: '34%' }}>Metric</th>
                <th className="px-4 py-2.5 text-right font-semibold sticky top-0 z-10 bg-muted" style={{ width: '22%' }}>{mlabel(sel)}</th>
                <th className="px-4 py-2.5 text-right font-semibold sticky top-0 z-10 bg-muted" style={{ width: '22%' }}>Current ({mlabel(curMonth)})</th>
                <th className="px-4 py-2.5 text-right font-semibold sticky top-0 z-10 bg-muted" style={{ width: '22%' }}>Deviance</th>
              </tr>
            </thead>
            <tbody>
              {ROWS.map((row, i) => {
                if (row.spacer) return <tr key={i}><td colSpan={4} className="h-2" /></tr>
                const key = row.key as keyof JujiMonth
                const selV = selMet[key] as number
                const curV = curMet[key] as number
                const dev = curV - selV
                return (
                  <tr key={i} className="border-b last:border-0 hover:bg-muted/20">
                    <td className={'px-4 py-2 text-left ' + (row.bold ? 'font-semibold text-base' : 'text-muted-foreground')}>{row.label}</td>
                    <td className={'px-4 py-2 text-right whitespace-nowrap ' + (row.bold ? 'font-semibold text-base' : '')}>{fmtVal(selV, row.fmt)}</td>
                    <td className={'px-4 py-2 text-right whitespace-nowrap ' + (row.bold ? 'font-semibold text-base' : '')}>{fmtVal(curV, row.fmt)}</td>
                    <td className={cn('px-4 py-2 text-right whitespace-nowrap font-medium', dev < 0 ? 'text-orange-600' : dev > 0 ? 'text-green-600' : 'text-muted-foreground')}>
                      {(dev > 0 ? '+' : '') + fmtVal(dev, row.fmt)}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        )}
        <p className="text-[11px] text-muted-foreground mt-2">By channel · New / Repeat / VIP · ROAS &amp; messages. Deviance = current − selected month. Live from Lark.</p>
      </CardContent>
    </Card>
  )
}
