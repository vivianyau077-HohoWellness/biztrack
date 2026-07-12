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
  const [cogsPct, setCogsPct] = useState(27)
  const [otherPct, setOtherPct] = useState(12)
  const [mktPct, setMktPct] = useState(3)
  const [fixed, setFixed] = useState(4000)
  const [adOverride, setAdOverride] = useState<number | null>(null)

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
    return { name, color, chKey, cpl, tSales, repOrd, repAov, repSales, newAov, newConv, newSales, newOrders, newLeads, adSpend, histLeads: leads, histNewAov, histRepAov, histNewConv: Math.round(histNewConv * 1000) / 10, histRepOrd: repOrdH, histNewOrd: newOrdH }
  }
  const pages = [
    mkPage('Beauty (焕肤王)', 'FB (焕肤王)', '#22a06b', m.leadBeauty, m.adBeauty, m.bNewOrd, m.bNewSales, m.bRepOrd, m.bRepSales),
    mkPage('Repair (钻石露)', 'FB (修复)', '#c0392b', m.leadRepair, m.adRepair, m.rNewOrd, m.rNewSales, m.rRepOrd, m.rRepSales),
  ]

  // ── Net profit bridge ─────────────────────────────────────────
  const funnelAd = pages.reduce((s, p) => s + (isFinite(p.adSpend) ? p.adSpend : 0), 0)
  const totalAd = adOverride != null ? adOverride : funnelAd
  const cogs = tgt * cogsPct / 100
  const otherOp = tgt * otherPct / 100
  const mktFee = tgt * mktPct / 100
  const totalCost = cogs + totalAd + otherOp + mktFee + fixed
  const net = tgt - totalCost
  const netPct = tgt ? (net / tgt) * 100 : 0
  const blendedRoas = totalAd > 0 ? tgt / totalAd : 0

  const recs: string[] = []
  if (tgt > m.totalSales) recs.push(`Target ${rm(tgt)} is ${Math.round((tgt / m.totalSales - 1) * 100)}% above ${mlabel(ref)} (${rm(m.totalSales)}).`)
  recs.push(`Projected net profit ${rm(net)} (${netPct.toFixed(1)}% margin) at blended ROAS ${blendedRoas.toFixed(2)}. Ads = ${rm(totalAd)}, the biggest swing factor.`)
  if (blendedRoas > 0 && blendedRoas < 3) recs.push(`⚠ Blended ROAS ${blendedRoas.toFixed(2)} is below 3 — profit is thin. Lift repeat orders (no ad cost) or improve ad efficiency to protect margin.`)
  pages.forEach(p => {
    recs.push(`${p.name}: needs ${num(p.newOrders)} new orders → ${days ? num(p.newLeads / days) : '—'} new leads/day, ~${days ? rm(p.adSpend / days) : '—'}/day (CPL ${rm(p.cpl)}, conversion ${p.newConv}%).`)
    if (p.newConv > 0 && p.newConv < 4) recs.push(`⚠ ${p.name}: new-customer conversion is only ${p.newConv}% — improve the sales script / filter leads, otherwise ad cost stays high.`)
  })
  recs.push('Must do: drive repeat customers via CRM / re-purchase reminders (no ad spend); acquire new customers via ads while keeping ROAS ≥ 3; track new leads & closes daily.')

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

        {/* Per-page historical actuals by month */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {[
            { name: 'Beauty (焕肤王)', color: '#22a06b', no: 'bNewOrd', ns: 'bNewSales', ro: 'bRepOrd', rs: 'bRepSales' },
            { name: 'Repair (钻石露)', color: '#c0392b', no: 'rNewOrd', ns: 'rNewSales', ro: 'rRepOrd', rs: 'rRepSales' },
          ].map(pg => (
            <div key={pg.name} className="rounded-lg border overflow-hidden">
              <div className="px-3 py-2 text-sm font-semibold" style={{ background: pg.color + '15', color: pg.color }}>{pg.name} — actual history by month</div>
              <table className="w-full text-sm">
                <thead><tr className="border-b text-muted-foreground">
                  <th className="px-3 py-2 text-left font-medium">Month</th>
                  <th className="px-3 py-2 text-right font-medium">New ord</th>
                  <th className="px-3 py-2 text-right font-medium">New AOV</th>
                  <th className="px-3 py-2 text-right font-medium">Repeat ord</th>
                  <th className="px-3 py-2 text-right font-medium">Repeat AOV</th>
                </tr></thead>
                <tbody>
                  {data.metrics.map(mm => {
                    const no = mm[pg.no as keyof M] as number
                    const ns = mm[pg.ns as keyof M] as number
                    const ro = mm[pg.ro as keyof M] as number
                    const rs = mm[pg.rs as keyof M] as number
                    return (
                      <tr key={mm.month} className={'border-b last:border-0 ' + (mm.month === ref ? 'bg-muted/40 font-medium' : '')}>
                        <td className="px-3 py-2 text-left">{mlabel(mm.month)}</td>
                        <td className="px-3 py-2 text-right">{num(no)}</td>
                        <td className="px-3 py-2 text-right">{no ? rm(ns / no) : '—'}</td>
                        <td className="px-3 py-2 text-right">{num(ro)}</td>
                        <td className="px-3 py-2 text-right">{ro ? rm(rs / ro) : '—'}</td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          ))}
        </div>

        {/* Channel allocation */}
        <div className="rounded-lg border overflow-hidden">
          <div className="px-3 py-2 bg-muted/50 text-sm font-semibold">Channel target (default = historical share × target, editable)</div>
          <table className="w-full text-sm">
            <thead><tr className="border-b text-muted-foreground">
              <th className="px-3 py-2 text-left font-medium">Channel</th>
              <th className="px-3 py-2 text-right font-medium">{mlabel(ref)} sales</th>
              <th className="px-3 py-2 text-right font-medium">Share %</th>
              <th className="px-3 py-2 text-right font-medium">Your target</th>
            </tr></thead>
            <tbody>
              {CH.map(c => (
                <tr key={c} className="border-b last:border-0">
                  <td className="px-3 py-2">{c}</td>
                  <td className="px-3 py-2 text-right">{rm(chHist[c])}</td>
                  <td className="px-3 py-2 text-right">{(m.totalSales ? chHist[c] / m.totalSales * 100 : 0).toFixed(1)}%</td>
                  <td className="px-3 py-1.5 text-right"><NumIn v={chTarget(c)} set={v => setChTgt(t => ({ ...t, [c]: v }))} /></td>
                </tr>
              ))}
              <tr className="bg-muted/30 font-semibold"><td className="px-3 py-2" colSpan={3}>Sum</td>
                <td className={'px-3 py-2 text-right ' + (Math.abs(chSum - tgt) > 1 ? 'text-orange-600' : 'text-green-600')}>{rm(chSum)}</td></tr>
            </tbody>
          </table>
        </div>

        {/* Per-page new-customer funnel */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {pages.map(p => (
            <div key={p.name} className="rounded-lg border p-3" style={{ borderColor: p.color + '55' }}>
              <p className="text-sm font-semibold mb-1" style={{ color: p.color }}>{p.name}</p>
              <div className="flex justify-between text-xs mb-2"><span className="text-muted-foreground">Page target sales</span><span className="font-semibold">{rm(p.tSales)}</span></div>

              <p className="text-[11px] font-semibold text-muted-foreground">① Repeat customers (no ads)</p>
              <div className="space-y-1 text-xs mb-2">
                <div className="flex items-center justify-between"><span className="text-muted-foreground">Repeat orders <span className="text-[10px]">(hist {num(p.histRepOrd)})</span></span><NumIn v={p.repOrd} set={v => setOv(o => ({ ...o, [p.name + '_repOrd']: v }))} w="w-20" /></div>
                <div className="flex items-center justify-between"><span className="text-muted-foreground">Repeat AOV <span className="text-[10px]">(hist {rm(p.histRepAov)})</span></span><span className="flex items-center gap-1"><NumIn v={p.repAov} set={v => setOv(o => ({ ...o, [p.name + '_repAov']: v }))} w="w-20" />RM</span></div>
                <div className="flex justify-between"><span className="text-muted-foreground">= Repeat sales</span><span className="font-medium">{rm(p.repSales)}</span></div>
              </div>

              <p className="text-[11px] font-semibold text-muted-foreground">② New customers (ad-driven)</p>
              <div className="space-y-1 text-xs">
                <div className="flex justify-between"><span className="text-muted-foreground">New sales needed (target − repeat)</span><span className="font-medium">{rm(p.newSales)}</span></div>
                <div className="flex items-center justify-between"><span className="text-muted-foreground">New AOV <span className="text-[10px]">(hist {rm(p.histNewAov)})</span></span><span className="flex items-center gap-1"><NumIn v={p.newAov} set={v => setOv(o => ({ ...o, [p.name + '_newAov']: v }))} w="w-20" />RM</span></div>
                <div className="flex items-center justify-between"><span className="text-muted-foreground">New conversion % <span className="text-[10px]">(hist {p.histNewConv}%)</span></span><NumIn v={p.newConv} set={v => setOv(o => ({ ...o, [p.name + '_newConv']: v }))} w="w-16" /></div>
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

        {/* Net profit projection */}
        <div className="rounded-lg border overflow-hidden">
          <div className="px-3 py-2 bg-muted/50 text-xs font-semibold">Net profit projection (from your target + planned ads) — % editable, defaults = your online P&L history</div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-0">
            {/* inputs */}
            <div className="border-b md:border-b-0 md:border-r divide-y px-3">
              <div className="flex items-center justify-between py-1.5 text-xs"><span className="text-muted-foreground">Total online sales (target)</span><span className="font-semibold">{rm(tgt)}</span></div>
              <div className="flex items-center justify-between gap-2 py-1.5 text-xs">
                <span className="text-muted-foreground">Ad spend {adOverride == null ? '(from funnel)' : '(manual)'}</span>
                <span className="flex items-center gap-1"><NumIn v={totalAd} set={setAdOverride} w="w-24" /><span className="text-muted-foreground w-3">RM</span></span>
              </div>
              <div className="flex items-center justify-between gap-2 py-1.5 text-xs"><span className="text-muted-foreground">COGS %</span><NumIn v={cogsPct} set={setCogsPct} w="w-16" /></div>
              <div className="flex items-center justify-between gap-2 py-1.5 text-xs"><span className="text-muted-foreground">Other operating % (shipping/commission/packaging/SST)</span><NumIn v={otherPct} set={setOtherPct} w="w-16" /></div>
              <div className="flex items-center justify-between gap-2 py-1.5 text-xs"><span className="text-muted-foreground">Marketer fee %</span><NumIn v={mktPct} set={setMktPct} w="w-16" /></div>
              <div className="flex items-center justify-between gap-2 py-1.5 text-xs"><span className="text-muted-foreground">Fixed cost / month</span><span className="flex items-center gap-1"><NumIn v={fixed} set={setFixed} w="w-24" /><span className="text-muted-foreground w-3">RM</span></span></div>
            </div>
            {/* result */}
            <div className="p-3" style={{ background: (net >= 0 ? '#22a06b' : '#c0392b') + '12' }}>
              <p className="text-xs text-muted-foreground">Projected Net Profit</p>
              <p className="text-2xl font-bold" style={{ color: net >= 0 ? '#22a06b' : '#c0392b' }}>{rm(net)} <span className="text-base">· {netPct.toFixed(1)}%</span></p>
              <p className="text-[11px] text-muted-foreground mb-2">Blended ROAS {blendedRoas.toFixed(2)}</p>
              <div className="space-y-0.5 text-xs text-muted-foreground">
                <div className="flex justify-between"><span>Total sales</span><span className="font-medium text-foreground">{rm(tgt)}</span></div>
                <div className="flex justify-between"><span>(−) COGS ({cogsPct}%)</span><span className="font-medium text-foreground">{rm(cogs)}</span></div>
                <div className="flex justify-between"><span>(−) Ads</span><span className="font-medium text-foreground">{rm(totalAd)} ({tgt ? Math.round(totalAd / tgt * 100) : 0}%)</span></div>
                <div className="flex justify-between"><span>(−) Other operating ({otherPct}%)</span><span className="font-medium text-foreground">{rm(otherOp)}</span></div>
                <div className="flex justify-between"><span>(−) Marketer fee ({mktPct}%)</span><span className="font-medium text-foreground">{rm(mktFee)}</span></div>
                <div className="flex justify-between"><span>(−) Fixed cost</span><span className="font-medium text-foreground">{rm(fixed)}</span></div>
                <div className="flex justify-between border-t pt-1 mt-1"><span>= Total cost</span><span className="font-medium text-foreground">{rm(totalCost)} ({tgt ? Math.round(totalCost / tgt * 100) : 0}%)</span></div>
              </div>
            </div>
          </div>
        </div>

        {/* Recommendations */}
        <div className="rounded-lg p-3" style={{ background: '#0e2a3312' }}>
          <p className="text-xs font-semibold mb-1">Recommendations · Should do / Must do</p>
          <ul className="space-y-1 text-xs text-foreground">
            {recs.map((r, i) => <li key={i} className="flex gap-1.5"><span className="text-muted-foreground">•</span><span>{r}</span></li>)}
          </ul>
        </div>

        <p className="text-[11px] text-muted-foreground">Each page splits into Repeat (existing customers, no ads) + New (new customers, ad-driven). Defaults = {mlabel(ref)} historical, every field editable. Live from Lark.</p>
      </CardContent>
    </Card>
  )
}
