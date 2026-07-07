'use client'

import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Card, CardContent } from '@/components/ui/card'

type M = {
  month: string; totalSales: number; totalOrder: number
  fbBeauty: number; fbRepair: number; fbSG: number; whatsapp: number; shopee: number; website: number; lazada: number; others: number
  adBeauty: number; adRepair: number
  leadBeauty: number; leadRepair: number
  ordBeauty: number; ordRepair: number
  newOrder: number; repeatOrder: number; newAov: number; repeatAov: number
}
type Data = { months: string[]; metrics: M[] }

const MLABEL: Record<string, string> = {
  '2026-01': "Jan'26", '2026-02': "Feb'26", '2026-03': "Mar'26", '2026-04': "Apr'26",
  '2026-05': "May'26", '2026-06': "Jun'26", '2026-07': "Jul'26",
}
const mlabel = (m: string) => MLABEL[m] ?? m
const rm = (n: number) => (isFinite(n) ? 'RM ' + Math.round(n).toLocaleString() : '—')
const num = (n: number) => (isFinite(n) ? Math.round(n).toLocaleString() : '—')

function NumIn({ v, set, w = 'w-28' }: { v: number; set: (n: number) => void; w?: string }) {
  return <input type="number" value={Math.round(v)} onChange={e => set(parseFloat(e.target.value) || 0)} className={w + ' h-7 rounded-md border border-input bg-background px-2 text-right text-xs'} />
}

const CH = ['FB (焕肤王)', 'FB (修复)', 'FB SG', 'Whatsapp', 'Shopee', 'Website', 'Lazada', 'Others'] as const

export default function AdLeadPlanner() {
  const [month, setMonth] = useState('')
  const [days, setDays] = useState(30)
  const [target, setTarget] = useState(0)
  const [chTgt, setChTgt] = useState<Record<string, number>>({})
  const [ov, setOv] = useState<Record<string, number>>({}) // page/order overrides

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
  const grow = m.totalSales ? tgt / m.totalSales : 1
  const chHist: Record<string, number> = {
    'FB (焕肤王)': m.fbBeauty, 'FB (修复)': m.fbRepair, 'FB SG': m.fbSG, 'Whatsapp': m.whatsapp,
    'Shopee': m.shopee, 'Website': m.website, 'Lazada': m.lazada, 'Others': m.others,
  }
  const chTarget = (c: string) => (c in chTgt ? chTgt[c] : Math.round((m.totalSales ? chHist[c] / m.totalSales : 0) * tgt))
  const chSum = CH.reduce((s, c) => s + chTarget(c), 0)

  // Page plans (editable AOV & leads; defaults from history scaled by growth)
  const mkPage = (name: string, chKey: string, sales: number, orders: number, ad: number, leads: number, color: string) => {
    const histAov = orders ? sales / orders : 0
    const histCpl = leads ? ad / leads : 0
    const tSales = chTarget(chKey)
    const aov = ov[name + '_aov'] ?? Math.round(histAov)
    const dLeads = Math.round(leads * grow)
    const nLeads = ov[name + '_leads'] ?? dLeads
    const ordr = aov ? tSales / aov : 0
    const conv = nLeads ? ordr / nLeads : 0
    const adSpend = nLeads * histCpl
    return { name, color, chKey, histAov, histCpl, tSales, aov, nLeads, ordr, conv, adSpend, histLeads: leads, histAd: ad, histSales: sales }
  }
  const pages = [
    mkPage('Beauty (焕肤王)', 'FB (焕肤王)', m.fbBeauty, m.ordBeauty, m.adBeauty, m.leadBeauty, '#22a06b'),
    mkPage('Repair (钻石露)', 'FB (修复)', m.fbRepair, m.ordRepair, m.adRepair, m.leadRepair, '#c0392b'),
  ]

  // Order & AOV plan
  const newAov = ov['newAov'] ?? m.newAov
  const repAov = ov['repAov'] ?? m.repeatAov
  const newOrd = ov['newOrd'] ?? Math.round(m.newOrder * grow)
  const repOrd = ov['repOrd'] ?? Math.round(m.repeatOrder * grow)
  const newSales = newOrd * newAov
  const repSales = repOrd * repAov
  const totOrd = newOrd + repOrd
  const ovAov = totOrd ? (newSales + repSales) / totOrd : 0

  // Recommendations
  const recs: string[] = []
  if (tgt > m.totalSales) recs.push(`目标 ${rm(tgt)} 比 ${mlabel(ref)}(${rm(m.totalSales)})要增长 ${Math.round((grow - 1) * 100)}% —— 主要靠占比大的渠道(Whatsapp/Shopee/FB)拉。`)
  pages.forEach(p => {
    recs.push(`${p.name}:每天要 ${days ? num(p.nLeads / days) : '—'} 个 lead(${mlabel(ref)} 是 ${days ? num(p.histLeads / days) : '—'}/天),广告约 ${days ? rm(p.adSpend / days) : '—'}/天(照历史 CPL ${rm(p.histCpl)})。`)
    if (p.conv > 0 && p.conv < 0.04) recs.push(`⚠ ${p.name} 转化率只有 ${(p.conv * 100).toFixed(1)}% —— 必须加强跟进/话术或过滤劣质 lead,否则广告白烧。`)
  })
  recs.push('必须做:维持 online ROAS ≥ 3(广告 ≤ 营收 1/3),否则净利被广告吃掉;每天对 lead 与成交进度。')

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

        {/* Channel allocation — editable */}
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
              <tr className="bg-muted/30 font-semibold"><td className="px-3 py-1.5" colSpan={3}>Sum of channel targets</td>
                <td className={'px-3 py-1.5 text-right ' + (Math.abs(chSum - tgt) > 1 ? 'text-orange-600' : 'text-green-600')}>{rm(chSum)}</td></tr>
            </tbody>
          </table>
        </div>

        {/* Per-page lead / ad plan — editable AOV & leads */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {pages.map(p => (
            <div key={p.name} className="rounded-lg border p-3" style={{ borderColor: p.color + '55' }}>
              <p className="text-sm font-semibold mb-2" style={{ color: p.color }}>{p.name}</p>
              <div className="space-y-1 text-xs">
                <div className="flex items-center justify-between"><span className="text-muted-foreground">Target sales (from channel)</span><span className="font-medium">{rm(p.tSales)}</span></div>
                <div className="flex items-center justify-between"><span className="text-muted-foreground">AOV (可改)</span><span className="flex items-center gap-1"><NumIn v={p.aov} set={v => setOv(o => ({ ...o, [p.name + '_aov']: v }))} w="w-20" />RM</span></div>
                <div className="flex items-center justify-between"><span className="text-muted-foreground">Leads / month (可改)</span><NumIn v={p.nLeads} set={v => setOv(o => ({ ...o, [p.name + '_leads']: v }))} w="w-24" /></div>
                <div className="mt-2 rounded-md p-2 space-y-0.5" style={{ background: p.color + '10' }}>
                  <div className="flex justify-between"><span className="text-muted-foreground">Orders (= sales ÷ AOV)</span><span className="font-medium">{num(p.ordr)}</span></div>
                  <div className="flex justify-between"><span className="text-muted-foreground">Conversion (orders ÷ leads)</span><span className="font-medium">{(p.conv * 100).toFixed(1)}%</span></div>
                  <div className="flex justify-between"><span className="font-semibold" style={{ color: p.color }}>Leads / day</span><span className="font-bold" style={{ color: p.color }}>{days ? num(p.nLeads / days) : '—'}</span></div>
                  <div className="flex justify-between"><span className="font-semibold" style={{ color: p.color }}>Ad / day (@CPL {rm(p.histCpl)})</span><span className="font-bold" style={{ color: p.color }}>{days ? rm(p.adSpend / days) : '—'}</span></div>
                </div>
              </div>
            </div>
          ))}
        </div>

        {/* Order & AOV plan — editable */}
        <div className="rounded-lg border p-3">
          <p className="text-xs font-semibold mb-2">Order & AOV plan (可改,预填 {mlabel(ref)})</p>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-xs">
            <label><span className="block text-muted-foreground mb-1">New Order</span><NumIn v={newOrd} set={v => setOv(o => ({ ...o, newOrd: v }))} w="w-24" /></label>
            <label><span className="block text-muted-foreground mb-1">New Order AOV</span><NumIn v={newAov} set={v => setOv(o => ({ ...o, newAov: v }))} w="w-24" /></label>
            <label><span className="block text-muted-foreground mb-1">Repeat Order</span><NumIn v={repOrd} set={v => setOv(o => ({ ...o, repOrd: v }))} w="w-24" /></label>
            <label><span className="block text-muted-foreground mb-1">Repeat Order AOV</span><NumIn v={repAov} set={v => setOv(o => ({ ...o, repAov: v }))} w="w-24" /></label>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-xs mt-2 pt-2 border-t">
            <div><span className="block text-muted-foreground">New Sales</span><span className="font-semibold">{rm(newSales)}</span></div>
            <div><span className="block text-muted-foreground">Repeat Sales</span><span className="font-semibold">{rm(repSales)}</span></div>
            <div><span className="block text-muted-foreground">Total Orders</span><span className="font-semibold">{num(totOrd)}</span></div>
            <div><span className="block text-muted-foreground">Overall AOV</span><span className="font-semibold">{rm(ovAov)}</span></div>
          </div>
        </div>

        {/* Recommendations */}
        <div className="rounded-lg p-3" style={{ background: '#0e2a3312' }}>
          <p className="text-xs font-semibold mb-1">建议 · 该做 / 必须做</p>
          <ul className="space-y-1 text-xs text-foreground">
            {recs.map((r, i) => <li key={i} className="flex gap-1.5"><span className="text-muted-foreground">•</span><span>{r}</span></li>)}
          </ul>
        </div>

        <p className="text-[11px] text-muted-foreground">默认值 = {mlabel(ref)} 历史(渠道占比、AOV、CPL、转化率)。每格都可以改成你自己的目标。Live from Lark.</p>
      </CardContent>
    </Card>
  )
}
