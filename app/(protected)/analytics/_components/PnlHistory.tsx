'use client'

import { useState } from 'react'
import { Card, CardContent } from '@/components/ui/card'
import { cn } from '@/lib/utils'

// Actual monthly P&L, transcribed from the uploaded statements (2026).
// To add a new month: append a row here (or send me the P&L and I'll add it).
type Row = { m: string; rev: number; cogs: number; mkt: number; other: number; net: number; ads: number }

const ONLINE: Row[] = [
  { m: "Jan'26", rev: 590502, cogs: 159372, mkt: 184647, other: 60033, net: 186450, ads: 167673 },
  { m: "Feb'26", rev: 624164, cogs: 165145, mkt: 216225, other: 77332, net: 165462, ads: 198900 },
  { m: "Mar'26", rev: 763233, cogs: 212263, mkt: 293454, other: 101987, net: 155530, ads: 260938 },
  { m: "Apr'26", rev: 537675, cogs: 144878, mkt: 203957, other: 73735, net: 115105, ads: 184818 },
  { m: "May'26", rev: 611192, cogs: 170571, mkt: 250249, other: 74453, net: 115919, ads: 230694 },
]
const OFFLINE: Row[] = [
  { m: "Feb'26", rev: 125663, cogs: 47196, mkt: 0, other: 10323, net: 68143, ads: 0 },
]

function rm(n: number) { return 'RM ' + Math.round(n).toLocaleString() }
function pct(a: number, b: number) { return b ? Math.round((a / b) * 100) : 0 }

export default function PnlHistory() {
  const [ch, setCh] = useState<'online' | 'offline'>('online')
  const rows = ch === 'online' ? ONLINE : OFFLINE

  const tot = rows.reduce((a, r) => ({
    rev: a.rev + r.rev, cogs: a.cogs + r.cogs, mkt: a.mkt + r.mkt, other: a.other + r.other, net: a.net + r.net, ads: a.ads + r.ads,
  }), { rev: 0, cogs: 0, mkt: 0, other: 0, net: 0, ads: 0 })

  return (
    <Card>
      <CardContent className="p-4">
        <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
          <h3 className="text-sm font-semibold">Monthly P&L — 历史实际 (2026)</h3>
          <div className="flex gap-1.5">
            <button onClick={() => setCh('online')} className={cn('text-xs px-3 py-1.5 rounded-md border font-medium', ch === 'online' ? 'bg-[#1C7293] text-white border-[#1C7293]' : 'hover:bg-muted')}>Online</button>
            <button onClick={() => setCh('offline')} className={cn('text-xs px-3 py-1.5 rounded-md border font-medium', ch === 'offline' ? 'bg-[#0F766E] text-white border-[#0F766E]' : 'hover:bg-muted')}>Offline</button>
          </div>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b bg-muted/50 text-muted-foreground">
                <th className="px-3 py-2 text-left font-medium">Month</th>
                <th className="px-3 py-2 text-right font-medium">Revenue</th>
                <th className="px-3 py-2 text-right font-medium">COGS</th>
                <th className="px-3 py-2 text-right font-medium">Marketing</th>
                <th className="px-3 py-2 text-right font-medium">Ad %</th>
                <th className="px-3 py-2 text-right font-medium">Other</th>
                <th className="px-3 py-2 text-right font-medium">Net Profit</th>
                <th className="px-3 py-2 text-right font-medium">Net %</th>
              </tr>
            </thead>
            <tbody>
              {rows.map(r => (
                <tr key={r.m} className="border-b last:border-0 hover:bg-muted/30">
                  <td className="px-3 py-2 font-medium">{r.m}</td>
                  <td className="px-3 py-2 text-right">{rm(r.rev)}</td>
                  <td className="px-3 py-2 text-right text-muted-foreground">{rm(r.cogs)}</td>
                  <td className="px-3 py-2 text-right text-muted-foreground">{rm(r.mkt)}</td>
                  <td className="px-3 py-2 text-right text-muted-foreground">{r.ads ? pct(r.ads, r.rev) + '%' : '—'}</td>
                  <td className="px-3 py-2 text-right text-muted-foreground">{rm(r.other)}</td>
                  <td className="px-3 py-2 text-right font-semibold text-foreground">{rm(r.net)}</td>
                  <td className={cn('px-3 py-2 text-right font-semibold', pct(r.net, r.rev) >= 25 ? 'text-green-600' : pct(r.net, r.rev) >= 20 ? 'text-orange-600' : 'text-red-600')}>{pct(r.net, r.rev)}%</td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="border-t-2 bg-muted/30 font-semibold">
                <td className="px-3 py-2">Total / Avg</td>
                <td className="px-3 py-2 text-right">{rm(tot.rev)}</td>
                <td className="px-3 py-2 text-right">{rm(tot.cogs)}</td>
                <td className="px-3 py-2 text-right">{rm(tot.mkt)}</td>
                <td className="px-3 py-2 text-right">{tot.ads ? pct(tot.ads, tot.rev) + '%' : '—'}</td>
                <td className="px-3 py-2 text-right">{rm(tot.other)}</td>
                <td className="px-3 py-2 text-right">{rm(tot.net)}</td>
                <td className="px-3 py-2 text-right">{pct(tot.net, tot.rev)}%</td>
              </tr>
            </tfoot>
          </table>
        </div>
        <p className="text-[11px] text-muted-foreground mt-2">数据来自你上传的 P&L 报表。要加新月份,把该月 P&L 发给我即可。</p>
      </CardContent>
    </Card>
  )
}
