'use client'

import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Card, CardContent } from '@/components/ui/card'
import { cn } from '@/lib/utils'

type Metrics = {
  totalSales: number; totalOrder: number
  fbBeauty: number; fbRepair: number; fbSG: number; whatsapp: number; shopee: number; website: number; lazada: number; others: number
  roas: number; adSpend: number; adFB: number; adWA: number
  totalLead: number; cpl: number; cplBeauty: number; cplRepair: number; cplSG: number; cplWaB: number; cplWaR: number; cplWaSG: number
  leadBeauty: number; leadRepair: number; leadSGn: number
  leadFbB: number; leadFbR: number; leadFbSG: number; leadWaB: number; leadWaR: number; leadWaSG: number
  newOrder: number; newFbSales: number; newWaSales: number
  repeatOrder: number; repeatFbSales: number; repeatWaSales: number
  bNewSales: number; rNewSales: number; sgNewSales: number; bRepSales: number; rRepSales: number; sgRepSales: number
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
  { label: 'FB Ads Spend (SST)', key: 'adFB', fmt: 'rm' },
  { label: 'WhatsApp Ads Spend (SST)', key: 'adWA', fmt: 'rm' },
  { label: 'Total Ad Spend (SST)', key: 'adSpend', fmt: 'rm', bold: true },
  { label: '', spacer: true },
  { label: 'Total Lead', key: 'totalLead', fmt: 'num', bold: true },
  { label: 'FB PM (焕肤王)', key: 'leadFbB', fmt: 'num' },
  { label: 'FB PM (修复)', key: 'leadFbR', fmt: 'num' },
  { label: 'FB PM SG', key: 'leadFbSG', fmt: 'num' },
  { label: 'WA PM (焕肤王)', key: 'leadWaB', fmt: 'num' },
  { label: 'WA PM (修复)', key: 'leadWaR', fmt: 'num' },
  { label: 'WA PM SG', key: 'leadWaSG', fmt: 'num' },
  { label: '', spacer: true },
  { label: 'FB CPL (焕肤王)', key: 'cplBeauty', fmt: 'rm' },
  { label: 'FB CPL (修复)', key: 'cplRepair', fmt: 'rm' },
  { label: 'FB CPL SG', key: 'cplSG', fmt: 'rm' },
  { label: 'WA CPL (焕肤王)', key: 'cplWaB', fmt: 'rm' },
  { label: 'WA CPL (修复)', key: 'cplWaR', fmt: 'rm' },
  { label: 'WA CPL SG', key: 'cplWaSG', fmt: 'rm' },
  { label: '', spacer: true },
  { label: 'New Order', key: 'newOrder', fmt: 'num', bold: true },
  { label: 'New FB Sales (焕肤王)', key: 'bNewSales', fmt: 'rm' },
  { label: 'New FB Sales (修复)', key: 'rNewSales', fmt: 'rm' },
  { label: 'New FB Sales (SG)', key: 'sgNewSales', fmt: 'rm' },
  { label: 'New Whatsapp Sales', key: 'newWaSales', fmt: 'rm' },
  { label: 'New Other Sales (Shopee/Lazada/Web)', key: 'newOtherSales', fmt: 'rm' },
  { label: 'New VIP Sales', key: 'newVipSales', fmt: 'rm' },
  { label: 'Total New Sales (all channels + VIP)', key: 'totalNewSales', fmt: 'rm', bold: true },
  { label: '', spacer: true },
  { label: 'Repeat Order', key: 'repeatOrder', fmt: 'num', bold: true },
  { label: 'Repeat FB Sales (焕肤王)', key: 'bRepSales', fmt: 'rm' },
  { label: 'Repeat FB Sales (修复)', key: 'rRepSales', fmt: 'rm' },
  { label: 'Repeat FB Sales (SG)', key: 'sgRepSales', fmt: 'rm' },
  { label: 'Repeat Whatsapp Sales', key: 'repeatWaSales', fmt: 'rm' },
  { label: 'Repeat Other Sales (Shopee/Lazada/Web)', key: 'repOtherSales', fmt: 'rm' },
  { label: 'Repeat VIP Sales', key: 'repVipSales', fmt: 'rm' },
  { label: 'Total Repeat Sales (all channels + VIP)', key: 'totalRepeatSales', fmt: 'rm', bold: true },
  { label: 'New Order Conversion Rate %', key: 'newConv', fmt: 'pct' },
  { label: 'Repeat Order Conversion Rate %', key: 'repeatConv', fmt: 'pct' },
  { label: '', spacer: true },
  { label: 'Overall Conversion Rate %', key: 'overallConv', fmt: 'pct' },
  { label: '', spacer: true },
  { label: 'VIP Order', key: 'vipOrder', fmt: 'num', bold: true },
  { label: '— New VIP Order', key: 'newVipOrder', fmt: 'num' },
  { label: '— Repeat VIP Order', key: 'repVipOrder', fmt: 'num' },
  { label: 'VIP Sales', key: 'vipSales', fmt: 'rm' },
  { label: '— New VIP Sales', key: 'newVipSales', fmt: 'rm' },
  { label: '— Repeat VIP Sales', key: 'repVipSales', fmt: 'rm' },
  { label: '', spacer: true },
  { label: 'New Order AOV', key: 'newAov', fmt: 'rm' },
  { label: 'Repeat Order AOV', key: 'repeatAov', fmt: 'rm' },
  { label: 'VIP AOV', key: 'vipAov', fmt: 'rm' },
  { label: '— New VIP AOV', key: 'newVipAov', fmt: 'rm' },
  { label: '— Repeat VIP AOV', key: 'repVipAov', fmt: 'rm' },
  { label: '', spacer: true },
  { label: 'CPNA (ad spend ÷ new orders)', key: 'cpna', fmt: 'rm', bold: true },
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

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']
const MON_SHORT = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
const pad2 = (n: number) => (n < 10 ? '0' : '') + n

export default function PeriodCompare() {
  const today = new Date()
  const prevMonth = today.getMonth() - 1 < 0 ? 11 : today.getMonth() - 1
  const prevYear = today.getMonth() - 1 < 0 ? today.getFullYear() - 1 : today.getFullYear()

  // Pick month by NAME + a shared day range (e.g. Sep 1–10 vs Aug 1–10).
  const [monthA, setMonthA] = useState(today.getMonth())
  const [yearA, setYearA] = useState(today.getFullYear())
  const [monthB, setMonthB] = useState(prevMonth)
  const [yearB, setYearB] = useState(prevYear)
  const [dayFrom, setDayFrom] = useState(1)
  const [dayTo, setDayTo] = useState(today.getDate())

  const aFrom = `${yearA}-${pad2(monthA + 1)}-${pad2(dayFrom)}`
  const aTo = `${yearA}-${pad2(monthA + 1)}-${pad2(dayTo)}`
  const bFrom = `${yearB}-${pad2(monthB + 1)}-${pad2(dayFrom)}`
  const bTo = `${yearB}-${pad2(monthB + 1)}-${pad2(dayTo)}`

  const { data, isLoading, error, isFetching } = useQuery({
    queryKey: ['period-compare', aFrom, aTo, bFrom, bTo],
    queryFn: async () => {
      const qs = new URLSearchParams({ aFrom, aTo, bFrom, bTo }).toString()
      const res = await fetch('/api/analytics/period-compare?' + qs)
      if (!res.ok) {
        const body = await res.json().catch(() => null)
        throw new Error(body?.error || ('HTTP ' + res.status))
      }
      return res.json() as Promise<Resp>
    },
    retry: false,
  })

  const niceDay = (iso: string) => { const p = iso.split('-'); return p.length === 3 ? `${MON_SHORT[+p[1] - 1]} ${+p[2]}` : iso }
  const niceRange = (f: string, t: string) => `${niceDay(f)} → ${niceDay(t)}, ${f.slice(0, 4)}`
  const selClass = 'h-9 rounded-md border border-input bg-background px-2 text-sm'
  const YEARS = [today.getFullYear() - 1, today.getFullYear()]
  const monthSelect = (m: number, setM: (n: number) => void, y: number, setY: (n: number) => void) => (
    <div className="flex items-center gap-1.5">
      <select value={m} onChange={e => setM(+e.target.value)} className={selClass}>
        {MONTHS.map((name, i) => <option key={i} value={i}>{name}</option>)}
      </select>
      <select value={y} onChange={e => setY(+e.target.value)} className={selClass}>
        {YEARS.map(yr => <option key={yr} value={yr}>{yr}</option>)}
      </select>
    </div>
  )

  return (
    <Card>
      <CardContent className="p-4">
        <div className="flex flex-wrap items-end gap-4 mb-4">
          <div>
            <p className="text-xs font-semibold mb-1" style={{ color: '#1C7293' }}>Period A · month</p>
            {monthSelect(monthA, setMonthA, yearA, setYearA)}
            <p className="text-xs mt-1 font-medium" style={{ color: '#1C7293' }}>{niceRange(aFrom, aTo)}</p>
          </div>
          <div>
            <p className="text-xs font-semibold mb-1" style={{ color: '#7E57C2' }}>Period B · month</p>
            {monthSelect(monthB, setMonthB, yearB, setYearB)}
            <p className="text-xs mt-1 font-medium" style={{ color: '#7E57C2' }}>{niceRange(bFrom, bTo)}</p>
          </div>
          <div>
            <p className="text-xs font-semibold mb-1 text-muted-foreground">Days (both months)</p>
            <div className="flex items-center gap-1.5">
              <select value={dayFrom} onChange={e => setDayFrom(+e.target.value)} className={selClass}>
                {Array.from({ length: 31 }, (_, i) => i + 1).map(d => <option key={d} value={d}>{d}</option>)}
              </select>
              <span className="text-muted-foreground">→</span>
              <select value={dayTo} onChange={e => setDayTo(+e.target.value)} className={selClass}>
                {Array.from({ length: 31 }, (_, i) => i + 1).map(d => <option key={d} value={d}>{d}</option>)}
              </select>
            </div>
          </div>
          <span className="text-xs text-muted-foreground pb-2">Deviance = A − B {isFetching && '· loading…'}</span>
        </div>

        {error ? (
          <p className="text-sm text-red-600">Failed to load comparison — {(error as Error).message}</p>
        ) : isLoading || !data ? (
          <div className="h-40 bg-muted/30 rounded-lg animate-pulse" />
        ) : (
          <div>
            <table className="w-full text-sm border-collapse table-fixed">
              <thead>
                <tr>
                  <th className="px-4 py-2.5 text-left font-semibold sticky top-0 z-10 bg-muted" style={{ width: '34%' }}>Metric</th>
                  <th className="px-4 py-2.5 text-right font-semibold sticky top-0 z-10 bg-muted" style={{ color: '#1C7293', width: '22%' }}>A · {niceRange(aFrom, aTo)}</th>
                  <th className="px-4 py-2.5 text-right font-semibold sticky top-0 z-10 bg-muted" style={{ color: '#7E57C2', width: '22%' }}>B · {niceRange(bFrom, bTo)}</th>
                  <th className="px-4 py-2.5 text-right font-semibold sticky top-0 z-10 bg-muted" style={{ width: '22%' }}>Deviance</th>
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
