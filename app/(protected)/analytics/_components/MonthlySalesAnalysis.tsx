'use client'

import { useQuery } from '@tanstack/react-query'
import { Card, CardContent } from '@/components/ui/card'

type MonthMetrics = {
  month: string
  totalSales: number
  fbBeauty: number; fbRepair: number; whatsapp: number; shopee: number; website: number; lazada: number
  roas: number; adSpend: number
  totalLead: number; cpl: number
  newOrder: number; newFbSales: number; newWaSales: number
  repeatOrder: number; repeatFbSales: number; repeatWaSales: number
  newConv: number; repeatConv: number; overallConv: number
  vipOrder: number; vipSales: number
  newAov: number; repeatAov: number; vipAov: number; overallAov: number
}
type Data = { months: string[]; metrics: MonthMetrics[] }

const MLABEL: Record<string, string> = {
  '2026-01': "Jan'26", '2026-02': "Feb'26", '2026-03': "Mar'26", '2026-04': "Apr'26",
  '2026-05': "May'26", '2026-06': "Jun'26", '2026-07': "Jul'26", '2026-08': "Aug'26",
  '2026-09': "Sep'26", '2026-10': "Oct'26", '2026-11': "Nov'26", '2026-12': "Dec'26",
}
const mlabel = (m: string) => MLABEL[m] ?? m

function rm(n: number) { return 'RM ' + Math.round(n).toLocaleString() }
function n0(n: number) { return Math.round(n).toLocaleString() }
function pc(n: number) { return n.toFixed(1) + '%' }
function x2(n: number) { return n.toFixed(2) }

type Fmt = 'rm' | 'num' | 'pct' | 'x'
type Row = { label: string; key?: keyof MonthMetrics; fmt?: Fmt; bold?: boolean; spacer?: boolean }

const ROWS: Row[] = [
  { label: 'Total Online Sales', key: 'totalSales', fmt: 'rm', bold: true },
  { label: 'FB (焕肤王)', key: 'fbBeauty', fmt: 'rm' },
  { label: 'FB (修复)', key: 'fbRepair', fmt: 'rm' },
  { label: 'Whatsapp', key: 'whatsapp', fmt: 'rm' },
  { label: 'Shopee', key: 'shopee', fmt: 'rm' },
  { label: 'Website', key: 'website', fmt: 'rm' },
  { label: 'Lazada', key: 'lazada', fmt: 'rm' },
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

  const byMonth = new Map(data.metrics.map(m => [m.month, m]))

  return (
    <Card>
      <CardContent className="p-0">
        <div className="overflow-x-auto">
          <table className="text-xs border-collapse">
            <thead>
              <tr className="bg-muted/50">
                <th className="sticky left-0 z-10 bg-muted/50 px-3 py-2 text-left font-semibold min-w-[220px]">Metric</th>
                {data.months.map(m => (
                  <th key={m} className="px-3 py-2 text-right font-semibold min-w-[110px] whitespace-nowrap">{mlabel(m)}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {ROWS.map((row, i) => {
                if (row.spacer) return <tr key={i}><td colSpan={data.months.length + 1} className="h-2" /></tr>
                return (
                  <tr key={i} className="border-b last:border-0 hover:bg-muted/20">
                    <td className={'sticky left-0 z-10 bg-white px-3 py-1.5 text-left ' + (row.bold ? 'font-semibold' : 'text-muted-foreground')}>{row.label}</td>
                    {data.months.map(m => {
                      const met = byMonth.get(m)
                      const v = met && row.key ? (met[row.key] as number) : 0
                      return <td key={m} className={'px-3 py-1.5 text-right whitespace-nowrap ' + (row.bold ? 'font-semibold' : '')}>{fmtVal(v, row.fmt)}</td>
                    })}
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
        <p className="text-[11px] text-muted-foreground p-3">Live from Lark. Sales / orders / New-Repeat / VIP / AOV from the order table; Ads (after SST), Leads (PMed), ROAS &amp; CPL from the Race Report. Leads not split New/Repeat in source.</p>
      </CardContent>
    </Card>
  )
}
