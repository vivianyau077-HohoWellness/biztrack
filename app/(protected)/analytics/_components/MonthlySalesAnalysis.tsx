'use client'

import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Card, CardContent } from '@/components/ui/card'
import { cn } from '@/lib/utils'

type MonthMetrics = {
  month: string
  totalSales: number
  totalOrder: number
  fbBeauty: number; fbRepair: number; fbSG: number; whatsapp: number; shopee: number; website: number; lazada: number; others: number
  roas: number; adSpend: number
  totalLead: number; cpl: number
  newOrder: number; newFbSales: number; newWaSales: number
  repeatOrder: number; repeatFbSales: number; repeatWaSales: number
  newConv: number; repeatConv: number; overallConv: number
  vipOrder: number; vipSales: number
  newAov: number; repeatAov: number; vipAov: number; overallAov: number
  goal: number
}
type Data = { months: string[]; metrics: MonthMetrics[] }

const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
const mlabel = (m: string) => {
  if (!m || m.length < 7) return m
  const mo = parseInt(m.slice(5, 7), 10)
  return (MON[mo - 1] ?? m) + "'" + m.slice(2, 4)
}
const MONTH_OPTS: Array<[string, string]> = MON.map((l, i) => [(i < 9 ? '0' : '') + (i + 1), l])

function rm(n: number) { return 'RM ' + Math.round(n).toLocaleString() }
function n0(n: number) { return Math.round(n).toLocaleString() }
function pc(n: number) { return n.toFixed(1) + '%' }
function x2(n: number) { return n.toFixed(2) }

type Fmt = 'rm' | 'num' | 'pct' | 'x'
type Row = { label: string; key?: keyof MonthMetrics; fmt?: Fmt; bold?: boolean; spacer?: boolean }

const ROWS: Row[] = [
  { label: 'Total Online Sales', key: 'totalSales', fmt: 'rm', bold: true },
  { label: 'Total Online Order', key: 'totalOrder', fmt: 'num', bold: true },
  { label: 'FB (焕肤王)', key: 'fbBeauty', fmt: 'rm' },
  { label: 'FB (修复)', key: 'fbRepair', fmt: 'rm' },
  { label: 'FB SG', key: 'fbSG', fmt: 'rm' },
  { label: 'Whatsapp', key: 'whatsapp', fmt: 'rm' },
  { label: 'Shopee', key: 'shopee', fmt: 'rm' },
  { label: 'Website', key: 'website', fmt: 'rm' },
  { label: 'Lazada', key: 'lazada', fmt: 'rm' },
  { label: 'Others (Staff/Change/etc.)', key: 'others', fmt: 'rm' },
  { label: 'ROAS', key: 'roas', fmt: 'x' },
  { label: 'Ads Spend', key: 'adSpend', fmt: 'rm' },
  { label: '', spacer: true },
  { label: 'Total Lead', key: 'totalLead', fmt: 'num' },
  { label: 'CPL', key: 'cpl', fmt: 'rm' },
  { label: '', spacer: true },
  { label: 'New Order', key: 'newOrder', fmt: 'num', bold: true },
  { label: 'New FB Sales', key: 'newFbSales', fmt: 'rm' },
  { label: 'New Whatsapp Sales', key: 'newWaSales', fmt: 'rm' },
  { label: '', spacer: true },
  { label: 'Repeat Order', key: 'repeatOrder', fmt: 'num', bold: true },
  { label: 'Repeat FB Sales', key: 'repeatFbSales', fmt: 'rm' },
  { label: 'Repeat Whatsapp Sales', key: 'repeatWaSales', fmt: 'rm' },
  { label: 'New Order Conversion Rate %', key: 'newConv', fmt: 'pct' },
  { label: 'Repeat Order Conversion Rate %', key: 'repeatConv', fmt: 'pct' },
  { label: '', spacer: true },
  { label: 'Overall Conversion Rate %', key: 'overallConv', fmt: 'pct' },
  { label: '', spacer: true },
  { label: 'VIP Order', key: 'vipOrder', fmt: 'num', bold: true },
  { label: 'VIP Sales', key: 'vipSales', fmt: 'rm' },
  { label: '', spacer: true },
  { label: 'New Order AOV', key: 'newAov', fmt: 'rm' },
  { label: 'Repeat Order AOV', key: 'repeatAov', fmt: 'rm' },
  { label: 'VIP AOV', key: 'vipAov', fmt: 'rm' },
  { label: 'Overall AOV', key: 'overallAov', fmt: 'rm', bold: true },
]

function fmtVal(v: number, fmt?: Fmt) {
  if (fmt === 'rm') return rm(v)
  if (fmt === 'pct') return pc(v)
  if (fmt === 'x') return x2(v)
  return n0(v)
}

export default function MonthlySalesAnalysis() {
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

  if (error) return <p className="text-sm text-red-600">Failed to load sales analysis.</p>
  if (isLoading || !data) return <div className="h-40 bg-muted/30 rounded-lg animate-pulse" />

  const months = data.months
  const curMonth = months[months.length - 1] || ''            // current (latest) month
  const defaultSel = months[months.length - 2] || curMonth
  const yr = selYear || defaultSel.slice(0, 4)
  const mo = selMonth || defaultSel.slice(5, 7)
  const sel = yr + '-' + mo                                    // month to compare
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
          <div className="overflow-x-auto">
            <table className="w-full text-xs border-collapse">
              <thead>
                <tr className="bg-muted/50">
                  <th className="px-3 py-2 text-left font-semibold min-w-[220px]">Metric</th>
                  <th className="px-3 py-2 text-right font-semibold w-32">{mlabel(sel)}</th>
                  <th className="px-3 py-2 text-right font-semibold w-32">Current ({mlabel(curMonth)})</th>
                  <th className="px-3 py-2 text-right font-semibold w-32">Deviance</th>
                </tr>
              </thead>
              <tbody>
                {ROWS.map((row, i) => {
                  if (row.spacer) return <tr key={i}><td colSpan={4} className="h-2" /></tr>
                  const key = row.key as keyof MonthMetrics
                  const selV = selMet[key] as number
                  const curV = curMet[key] as number
                  const dev = curV - selV // current − selected: negative = current behind
                  return (
                    <tr key={i} className="border-b last:border-0 hover:bg-muted/20">
                      <td className={'px-3 py-1.5 text-left ' + (row.bold ? 'font-semibold' : 'text-muted-foreground')}>{row.label}</td>
                      <td className={'px-3 py-1.5 text-right whitespace-nowrap ' + (row.bold ? 'font-semibold' : '')}>{fmtVal(selV, row.fmt)}</td>
                      <td className={'px-3 py-1.5 text-right whitespace-nowrap ' + (row.bold ? 'font-semibold' : '')}>{fmtVal(curV, row.fmt)}</td>
                      <td className={cn('px-3 py-1.5 text-right whitespace-nowrap font-medium', dev < 0 ? 'text-orange-600' : dev > 0 ? 'text-green-600' : 'text-muted-foreground')}>
                        {(dev > 0 ? '+' : '') + fmtVal(dev, row.fmt)}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
        <p className="text-[11px] text-muted-foreground mt-2">Deviance = selected month − current month. Live from Lark.</p>
      </CardContent>
    </Card>
  )
}
