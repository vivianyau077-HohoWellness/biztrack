'use client'

import { useState } from 'react'
import { Card, CardContent } from '@/components/ui/card'
import { cn } from '@/lib/utils'

function rm(n: number) { if (!isFinite(n)) return '—'; return 'RM ' + Math.round(n).toLocaleString() }
function num(n: number) { if (!isFinite(n)) return '—'; return Math.round(n).toLocaleString() }

type Page = { name: string; note: string; color: string; share: number; aov: number; conv: number }

function NumInput({ val, set, w = 'w-24' }: { val: number; set: (n: number) => void; w?: string }) {
  return (
    <input type="number" value={val} onChange={e => set(parseFloat(e.target.value) || 0)}
      className={cn(w, 'h-7 rounded-md border border-input bg-background px-2 text-right text-sm')} />
  )
}

export default function AdLeadPlanner() {
  const [target, setTarget] = useState(693000) // online sales target / month
  const [roas, setRoas] = useState(3)
  const [days, setDays] = useState(30)
  const [pages, setPages] = useState<Page[]>([
    { name: 'Beauty Page', note: 'Big audience · low AOV · push lead volume + lower CPL', color: '#22a06b', share: 60, aov: 550, conv: 4 },
    { name: 'Repair Page', note: 'Niche · high AOV · strong intent, higher conversion', color: '#c0392b', share: 40, aov: 900, conv: 8 },
  ])

  const upd = (i: number, k: keyof Page, v: number) =>
    setPages(ps => ps.map((p, j) => j === i ? { ...p, [k]: v } : p))

  const rows = pages.map(p => {
    const sales = target * p.share / 100
    const orders = p.aov > 0 ? sales / p.aov : 0
    const leads = p.conv > 0 ? orders / (p.conv / 100) : 0
    const ad = roas > 0 ? sales / roas : 0
    const cpl = leads > 0 ? ad / leads : 0
    const cpa = orders > 0 ? ad / orders : 0
    return { ...p, sales, orders, leads, ad, cpl, cpa }
  })
  const tot = rows.reduce((a, r) => ({
    sales: a.sales + r.sales, orders: a.orders + r.orders, leads: a.leads + r.leads, ad: a.ad + r.ad,
  }), { sales: 0, orders: 0, leads: 0, ad: 0 })
  const totalShare = pages.reduce((s, p) => s + p.share, 0)

  return (
    <Card>
      <CardContent className="p-4 space-y-4">
        {/* Top controls */}
        <div className="flex flex-wrap items-end gap-4">
          <label className="text-xs">
            <span className="block text-muted-foreground mb-1">Online sales target / month</span>
            <span className="flex items-center gap-1"><NumInput w="w-32" val={target} set={setTarget} /><span className="text-muted-foreground">RM</span></span>
          </label>
          <label className="text-xs">
            <span className="block text-muted-foreground mb-1">ROAS floor</span>
            <NumInput w="w-16" val={roas} set={setRoas} />
          </label>
          <label className="text-xs">
            <span className="block text-muted-foreground mb-1">Days / month</span>
            <NumInput w="w-16" val={days} set={setDays} />
          </label>
          {totalShare !== 100 && <span className="text-xs text-orange-600 self-center">Page shares total {totalShare}% (should be 100%)</span>}
        </div>

        {/* Two page cards */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {rows.map((r, i) => (
            <div key={r.name} className="rounded-lg border p-3" style={{ borderColor: r.color + '55' }}>
              <div className="flex items-center gap-2 mb-1">
                <span className="h-2.5 w-2.5 rounded-full" style={{ background: r.color }} />
                <span className="font-semibold text-sm">{r.name}</span>
              </div>
              <p className="text-[11px] text-muted-foreground mb-2">{r.note}</p>

              <div className="space-y-1">
                <div className="flex items-center justify-between text-xs"><span className="text-muted-foreground">Sales share</span><span className="flex items-center gap-1"><NumInput w="w-16" val={r.share} set={v => upd(i, 'share', v)} />%</span></div>
                <div className="flex items-center justify-between text-xs"><span className="text-muted-foreground">AOV</span><span className="flex items-center gap-1"><NumInput w="w-20" val={r.aov} set={v => upd(i, 'aov', v)} />RM</span></div>
                <div className="flex items-center justify-between text-xs"><span className="text-muted-foreground">Conversion (lead→order)</span><span className="flex items-center gap-1"><NumInput w="w-16" val={r.conv} set={v => upd(i, 'conv', v)} />%</span></div>
              </div>

              <div className="mt-3 rounded-md p-2 space-y-0.5 text-xs" style={{ background: r.color + '12' }}>
                <div className="flex justify-between"><span className="text-muted-foreground">Sales</span><span className="font-semibold">{rm(r.sales)}</span></div>
                <div className="flex justify-between"><span className="text-muted-foreground">Orders / month</span><span className="font-medium">{num(r.orders)} (≈ {days ? num(r.orders / days) : 0}/day)</span></div>
                <div className="flex justify-between"><span className="text-muted-foreground">Leads needed / month</span><span className="font-medium">{num(r.leads)}</span></div>
                <div className="flex justify-between"><span className="font-semibold" style={{ color: r.color }}>Leads / day</span><span className="font-bold" style={{ color: r.color }}>{days ? num(r.leads / days) : 0}</span></div>
                <div className="flex justify-between"><span className="text-muted-foreground">CPL (cost per lead)</span><span className="font-medium">{rm(r.cpl)}</span></div>
                <div className="flex justify-between"><span className="text-muted-foreground">CPA (cost per order)</span><span className="font-medium">{rm(r.cpa)}</span></div>
                <div className="flex justify-between"><span className="text-muted-foreground">Ad spend / month</span><span className="font-medium">{rm(r.ad)}</span></div>
                <div className="flex justify-between"><span className="font-semibold" style={{ color: r.color }}>Ad spend / day</span><span className="font-bold" style={{ color: r.color }}>{days ? rm(r.ad / days) : '—'}</span></div>
              </div>
            </div>
          ))}
        </div>

        {/* Online total */}
        <div className="rounded-lg p-3 bg-muted/40 text-xs">
          <p className="font-semibold text-sm mb-1">Online total</p>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
            <div><span className="text-muted-foreground">Sales</span><div className="font-semibold">{rm(tot.sales)}</div></div>
            <div><span className="text-muted-foreground">Orders / month</span><div className="font-semibold">{num(tot.orders)}</div></div>
            <div><span className="text-muted-foreground">Leads / day</span><div className="font-semibold">{days ? num(tot.leads / days) : 0}</div></div>
            <div><span className="text-muted-foreground">Ad / day</span><div className="font-semibold">{days ? rm(tot.ad / days) : '—'}</div></div>
          </div>
        </div>

        <p className="text-[11px] text-muted-foreground">
          First use Profit Target to find the Online sales needed for your profit goal, enter it as “Online sales target” here, then split by each page’s share / AOV / conversion. Defaults are a starting point — replace with your real CPL / conversion.
        </p>
      </CardContent>
    </Card>
  )
}
