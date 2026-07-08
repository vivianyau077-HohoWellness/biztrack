'use client'

import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Card, CardContent } from '@/components/ui/card'

type M = {
  month: string; totalSales: number
  fbBeauty: number; fbRepair: number; fbSG: number; whatsapp: number; shopee: number; website: number; lazada: number; others: number
  adBeauty: number; adRepair: number
  leadBeauty: number; leadRepair: number
  bNewOrd: number; bNewSales: number; bRepOrd: number; bRepSales: number
  rNewOrd: number; rNewSales: number; rRepOrd: number; rRepSales: number
}
type Data = { months: string[]; metrics: M[] }

const MLABEL: Record<string, string> = {
  '2026-01': "Jan'26", '2026-02': "Feb'26", '2026-03': "Mar'26", '2026-04': "Apr'26",
  '2026-05': "May'26", '2026-06': "Jun'26", '2026-07': "Jul'26",
}
const mlabel = (m: string) => MLABEL[m] ?? m
const rm = (n: number) => (isFinite(n) ? 'RM ' + Math.round(n).toLocaleString() : '—')
const num = (n: number) => (isFinite(n) ? Math.round(n).toLocaleString() : '—')

function NumIn({ v, set, w = 'w-24' }: { v: number; set: (n: number) => void; w?: string }) {
  return <input type="number" value={Math.round(v)} onChange={e => set(parseFloat(e.target.value) || 0)} className={w + ' h-7 rounded-md border border-input bg-background px-2 text-right text-xs'} />
}

const CH = ['FB (焕肤王)', 'FB (修复)', 'FB SG', 'Whatsapp', 'Shopee', 'Website', 'Lazada', 'Others'] as const

export default function AdLeadPlanner() {
  const [month, setMonth] = useState('')
  const [days, setDays] = useState(30)
  const [target, setTarget] = useState(0)
  const [chTgt, setChTgt] = useState<Record<string, number>>({})
  const [ov, setOv] = useState<Record<string, number>>({})

  const { data, isLoading, error } = useQuery({
    queryKey: ['sales-matrix'],
    queryFn: async () => {
      const res = await fetch('/api/analytics/sales-analysis')
      if (!res.ok) throw new Error('Failed to load')
      return res.json() as Promise<Data>
    },
  })
  if (error) return <p className="text-sm text-red-600">Failed to load.</p>
  if (isLoading || !data) return <div className="h-40 bg-muted/30 rounded-lg animate-pulse" />

  const months = data.months
  const ref = month || months[months.length - 1] || ''
  const m = data.metrics.find(x => x.month === ref)
  if (!m) return <p className="text-sm text-muted-foreground">No data.</p>

  const tgt = target || m.totalSales
  const chHist: Record<string, number> = {
    'FB (焕肤王)': m.fbBeauty, 'FB (修复)': m.fbRepair, 'FB SG': m.fbSG, 'Whatsapp': m.whatsapp,
    'Shopee': m.shopee, 'Website': m.website, 'Lazada': m.lazada, 'Others': m.others,
  }
  const chTarget = (c: string) => (c in chTgt ? chTgt[c] : Math.round((m.totalSales ? chHist[c] / m.totalSales : 0) * tgt))
  const chSum = CH.reduce((s, c) => s + chTarget(c), 0)

  // New-customer funnel per FB page
  const mkPage = (name: string, chKey: string, color: string, leads: number, ad: number, newOrdH: number, newSalesH: number, repOrdH: number, repSalesH: number) => {
    const histNewAov = newOrdH ? newSalesH / newOrdH : 0
    const histRepAov = repOrdH ? repSalesH / repOrdH : 0
    const histNewConv = leads ? newOrdH / leads : 0
    const cpl = leads ? ad / leads : 0
    const tSales = chTarget(chKey)
    const repOrd = ov[name + '_repOrd'] ?? repOrdH
    const repAov = ov[name + '_repAov'] ?? Math.round(histRepAov)
    const repSales = repOrd * repAov
    const newAov = ov[name + '_newAov'] ?? Math.round(histNewAov)
    const newConv = ov[name + '_newConv'] ?? Math.round(histNewConv * 1000) / 10 // %
    const newSales = Math.max(tSales - repSales, 0)
    const newOrders = newAov ? newSales / newAov : 0
    const newLeads = newConv > 0 ? newOrders / (newConv / 100) : 0
    const adSpend = newLeads * cpl
    return { name, color, chKey, cpl, tSales, repOrd, repAov, repSales, newAov, newConv, newSales, newOrders, newLeads, adSpend, histLeads: leads }
  }
  const pages = [
    mkPage('Beauty (焕肤王)', 'FB (焕肤王)', '#22a06b', m.leadBeauty, m.adBeauty, m.bNewOrd, m.bNewSales, m.bRepOrd, m.bRepSales),
    mkPage('Repair (钻石露)', 'FB (修复)', '#c0392b', m.leadRepair, m.adRepair, m.rNewOrd, m.rNewSales, m.rRepOrd, m.rRepSales),
  ]

  const recs: string[] = []
  if (tgt > m.totalSales) recs.push(`目标 ${rm(tgt)} 比 ${mlabel(ref)}(${rm(m.totalSales)})增长 ${Math.round((tgt / m.totalSales - 1) * 100)}%。`)
  pages.forEach(p => {
    recs.push(`${p.name}:新客要 ${num(p.newOrders)} 单 → 每天 ${days ? num(p.newLeads / days) : '—'} 个 new lead、广告约 ${days ? rm(p.adSpend / days) : '—'}/天(CPL ${rm(p.cpl)}、转化 ${p.newConv}%)。`)
    if (p.newConv > 0 && p.newConv < 4) recs.push(`⚠ ${p.name} 新客转化只有 ${p.newConv}% —— 提升话术/过滤 lead,否则广告成本高。`)
  })
  recs.push('必须做:回头客靠 CRM/复购提醒(不烧广告);新客靠广告,维持 ROAS ≥ 3;每天盯 new lead 与成交。')

  return (
    <Card>
      <CardContent className="p-4 space-y-4">
        <div className="flex flex-wrap items-end gap-4">
          <label className="text-xs"><span className="block text-muted-foreground mb-1">Reference month</span>
            <select value={ref} onChange={e => setMonth(e.target.value)} className="h-8 rounded-md border border-input bg-background px-2 text-sm">
              {months.map(mm => <option key={mm} value={mm}>{mlabel(mm)}</option>)}
            </select></label>
          <label className="text-xs"><span className="block text-muted-foreground mb-1">Target total online sales</span>
            <span className="flex items-center gap-1"><NumIn v={tgt} set={setTarget} w="w-32" /><span className="text-muted-foreground">RM</span></span></label>
          <label className="text-xs"><span className="block text-muted-foreground mb-1">Days / month</span><NumIn v={days} set={setDays} w="w-16" /></label>
        </div>

        {/* Channel allocation */}
        <div className="rounded-lg border overflow-hidden">
          <div className="px-3 py-2 bg-muted/50 text-xs font-semibold">Channel target (预填=历史占比×目标,可改)</div>
          <table className="w-full text-xs">
            <thead><tr className="border-b text-muted-foreground">
              <th className="px-3 py-1.5 text-left font-medium">Channel</th>
              <th className="px-3 py-1.5 text-right font-medium">{mlabel(ref)} sales</th>
              <th className="px-3 py-1.5 text-right font-medium">Share %</th>
              <th className="px-3 py-1.5 text-right font-medium">Your target</th>
            </tr></thead>
            <tbody>
              {CH.map(c => (
                <tr key={c} className="border-b last:border-0">
                  <td className="px-3 py-1.5">{c}</td>
                  <td className="px-3 py-1.5 text-right">{rm(chHist[c])}</td>
                  <td className="px-3 py-1.5 text-right">{(m.totalSales ? chHist[c] / m.totalSales * 100 : 0).toFixed(1)}%</td>
                  <td className="px-2 py-1 text-right"><NumIn v={chTarget(c)} set={v => setChTgt(t => ({ ...t, [c]: v }))} /></td>
                </tr>
              ))}
              <tr className="bg-muted/30 font-semibold"><td className="px-3 py-1.5" colSpan={3}>Sum</td>
                <td className={'px-3 py-1.5 text-right ' + (Math.abs(chSum - tgt) > 1 ? 'text-orange-600' : 'text-green-600')}>{rm(chSum)}</td></tr>
            </tbody>
          </table>
        </div>

        {/* Per-page new-customer funnel */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {pages.map(p => (
            <div key={p.name} className="rounded-lg border p-3" style={{ borderColor: p.color + '55' }}>
              <p className="text-sm font-semibold mb-1" style={{ color: p.color }}>{p.name}</p>
              <div className="flex justify-between text-xs mb-2"><span className="text-muted-foreground">Page target sales</span><span className="font-semibold">{rm(p.tSales)}</span></div>

              <p className="text-[11px] font-semibold text-muted-foreground">① Repeat 回头客(不靠广告)</p>
              <div className="space-y-1 text-xs mb-2">
                <div className="flex items-center justify-between"><span className="text-muted-foreground">Repeat orders (可改)</span><NumIn v={p.repOrd} set={v => setOv(o => ({ ...o, [p.name + '_repOrd']: v }))} w="w-20" /></div>
                <div className="flex items-center justify-between"><span className="text-muted-foreground">Repeat AOV (可改)</span><span className="flex items-center gap-1"><NumIn v={p.repAov} set={v => setOv(o => ({ ...o, [p.name + '_repAov']: v }))} w="w-20" />RM</span></div>
                <div className="flex justify-between"><span className="text-muted-foreground">= Repeat sales</span><span className="font-medium">{rm(p.repSales)}</span></div>
              </div>

              <p className="text-[11px] font-semibold text-muted-foreground">② New 新客(靠广告)</p>
              <div className="space-y-1 text-xs">
                <div className="flex justify-between"><span className="text-muted-foreground">New sales needed (target − repeat)</span><span className="font-medium">{rm(p.newSales)}</span></div>
                <div className="flex items-center justify-between"><span className="text-muted-foreground">New AOV (可改)</span><span className="flex items-center gap-1"><NumIn v={p.newAov} set={v => setOv(o => ({ ...o, [p.name + '_newAov']: v }))} w="w-20" />RM</span></div>
                <div className="flex items-center justify-between"><span className="text-muted-foreground">New conversion % (可改)</span><NumIn v={p.newConv} set={v => setOv(o => ({ ...o, [p.name + '_newConv']: v }))} w="w-16" /></div>
              </div>
              <div className="mt-2 rounded-md p-2 space-y-0.5 text-xs" style={{ background: p.color + '10' }}>
                <div className="flex justify-between"><span className="text-muted-foreground">New orders</span><span className="font-medium">{num(p.newOrders)}</span></div>
                <div className="flex justify-between"><span className="text-muted-foreground">New leads / month</span><span className="font-medium">{num(p.newLeads)}</span></div>
                <div className="flex justify-between"><span className="font-semibold" style={{ color: p.color }}>New leads / day</span><span className="font-bold" style={{ color: p.color }}>{days ? num(p.newLeads / days) : '—'}</span></div>
                <div className="flex justify-between"><span className="font-semibold" style={{ color: p.color }}>Ad / day (CPL {rm(p.cpl)})</span><span className="font-bold" style={{ color: p.color }}>{days ? rm(p.adSpend / days) : '—'}</span></div>
              </div>
            </div>
          ))}
        </div>

        {/* Recommendations */}
        <div className="rounded-lg p-3" style={{ background: '#0e2a3312' }}>
          <p className="text-xs font-semibold mb-1">建议 · 该做 / 必须做</p>
          <ul className="space-y-1 text-xs text-foreground">
            {recs.map((r, i) => <li key={i} className="flex gap-1.5"><span className="text-muted-foreground">•</span><span>{r}</span></li>)}
          </ul>
        </div>

        <p className="text-[11px] text-muted-foreground">每页拆 Repeat(回头客,不烧广告)+ New(新客,靠广告)。默认值 = {mlabel(ref)} 历史,每格可改。Live from Lark.</p>
      </CardContent>
    </Card>
  )
}
