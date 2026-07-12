'use client'

import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Card, CardContent } from '@/components/ui/card'
import { cn } from '@/lib/utils'

type Metrics = {
  totalSales: number; totalOrder: number
  fbBeauty: number; fbRepair: number; fbSG: number; whatsapp: number; shopee: number; website: number; lazada: number; others: number
  roas: number; adSpend: number
  totalLead: number; cpl: number
  newOrder: number; newFbSales: number; newWaSales: number
  repeatOrder: number; repeatFbSales: number; repeatWaSales: number
  newConv: number; repeatConv: number; overallConv: number
  vipOrder: number; vipSales: number
  newAov: number; repeatAov: number; vipAov: number; overallAov: number
  goal: number
  [k: string]: number
}
type Resp = { a: Metrics; b: Metrics }

function rm(n: number) { return 'RM ' + Math.round(n).toLocaleString() }
function n0(n: number) { return Math.round(n).toLocaleString() }
function pc(n: number) { return n.toFixed(1) + '%' }
function x2(n: number) { return n.toFixed(2) }

type Fmt = 'rm' | 'num' | 'pct' | 'x'
type Row = { label: string; key?: keyof Metrics; fmt?: Fmt; bold?: boolean; spacer?: boolean }

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

function iso(d: Date) {
  const y = d.getFullYear(), m = d.getMonth() + 1, day = d.getDate()
  return y + '-' + (m < 10 ? '0' : '') + m + '-' + (day < 10 ? '0' : '') + day
}

export default function PeriodCompare() {
  const today = new Date()
  const dayNo = today.getDate()
  const aFromD = new Date(today.getFullYear(), today.getMonth(), 1)
  const bFromD = new Date(today.getFullYear(), today.getMonth() - 1, 1)
  const bToD = new Date(today.getFullYear(), today.getMonth() - 1, dayNo) // same day-of-month, prev month

  const [aFrom, setAFrom] = useState(iso(aFromD))
  const [aTo, setATo] = useState(iso(today))
  const [bFrom, setBFrom] = useState(iso(bFromD))
  const [bTo, setBTo] = useState(iso(bToD))

  const { data, isLoading, error, isFetching } = useQuery({
    queryKey: ['period-compare', aFrom, aTo, bFrom, bTo],
    queryFn: async () => {
      const qs = new URLSearchParams({ aFrom, aTo, bFrom, bTo }).toString()
      const res = await fetch('/api/analytics/period-compare?' + qs)
      if (!res.ok) throw new Error('Failed to load')
      return res.json() as Promise<Resp>
    },
  })

  const dateInput = (v: string, set: (s: string) => void) => (
    <input type="date" value={v} onChange={e => set(e.target.value)}
      className="h-9 rounded-md border border-input bg-background px-2 text-sm" />
  )

  return (
    <Card>
      <CardContent className="p-4">
        <div className="flex flex-wrap items-end gap-4 mb-4">
          <div>
            <p className="text-xs font-semibold mb-1" style={{ color: '#1C7293' }}>Period A</p>
            <div className="flex items-center gap-1.5 text-sm">{dateInput(aFrom, setAFrom)}<span className="text-muted-foreground">→</span>{dateInput(aTo, setATo)}</div>
          </div>
          <div>
            <p className="text-xs font-semibold mb-1" style={{ color: '#7E57C2' }}>Period B</p>
            <div className="flex items-center gap-1.5 text-sm">{dateInput(bFrom, setBFrom)}<span className="text-muted-foreground">→</span>{dateInput(bTo, setBTo)}</div>
          </div>
          <span className="text-xs text-muted-foreground pb-2">Deviance = A − B {isFetching && '· loading…'}</span>
        </div>

        {error ? (
          <p className="text-sm text-red-600">Failed to load comparison.</p>
        ) : isLoading || !data ? (
          <div className="h-40 bg-muted/30 rounded-lg animate-pulse" />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm border-collapse table-fixed">
              <thead>
                <tr className="bg-muted/50">
                  <th className="px-4 py-2.5 text-left font-semibold" style={{ width: '34%' }}>Metric</th>
                  <th className="px-4 py-2.5 text-right font-semibold" style={{ color: '#1C7293', width: '22%' }}>A · {aFrom} → {aTo}</th>
                  <th className="px-4 py-2.5 text-right font-semibold" style={{ color: '#7E57C2', width: '22%' }}>B · {bFrom} → {bTo}</th>
                  <th className="px-4 py-2.5 text-right font-semibold" style={{ width: '22%' }}>Deviance</th>
                </tr>
              </thead>
              <tbody>
                {ROWS.map((row, i) => {
                  if (row.spacer) return <tr key={i}><td colSpan={4} className="h-2" /></tr>
                  const key = row.key as keyof Metrics
                  const aV = data.a[key] as number
                  const bV = data.b[key] as number
                  const dev = aV - bV
                  return (
                    <tr key={i} className="border-b last:border-0 hover:bg-muted/20">
                      <td className={'px-4 py-2 text-left ' + (row.bold ? 'font-semibold text-base' : 'text-muted-foreground')}>{row.label}</td>
                      <td className={'px-4 py-2 text-right whitespace-nowrap ' + (row.bold ? 'font-semibold text-base' : '')}>{fmtVal(aV, row.fmt)}</td>
                      <td className={'px-4 py-2 text-right whitespace-nowrap ' + (row.bold ? 'font-semibold text-base' : '')}>{fmtVal(bV, row.fmt)}</td>
                      <td className={cn('px-4 py-2 text-right whitespace-nowrap font-medium', dev > 0 ? 'text-green-600' : dev < 0 ? 'text-orange-600' : 'text-muted-foreground')}>
                        {(dev > 0 ? '+' : '') + fmtVal(dev, row.fmt)}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
        <p className="text-[11px] text-muted-foreground mt-2">Pick any two date ranges (e.g. 1–7 of this month vs 1–7 of another month). Deviance = A − B. Live from Lark.</p>
      </CardContent>
    </Card>
  )
}
