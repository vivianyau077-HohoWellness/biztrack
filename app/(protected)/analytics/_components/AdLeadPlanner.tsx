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
    { name: '焕肤王 (Beauty)', note: '受众大 · AOV 低 · 冲 lead 量 + 压 CPL', color: '#22a06b', share: 60, aov: 550, conv: 4 },
    { name: '修复 (Wound)', note: '受众窄 · AOV 高 · 意向强转化高', color: '#c0392b', share: 40, aov: 900, conv: 8 },
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
            <span className="block text-muted-foreground mb-1">Online 目标营收 / 月</span>
            <span className="flex items-center gap-1"><NumInput w="w-32" val={target} set={setTarget} /><span className="text-muted-foreground">RM</span></span>
          </label>
          <label className="text-xs">
            <span className="block text-muted-foreground mb-1">ROAS 保底</span>
            <NumInput w="w-16" val={roas} set={setRoas} />
          </label>
          <label className="text-xs">
            <span className="block text-muted-foreground mb-1">天数 / 月</span>
            <NumInput w="w-16" val={days} set={setDays} />
          </label>
          {totalShare !== 100 && <span className="text-xs text-orange-600 self-center">两个 page 占比合计 {totalShare}%(建议 =100%)</span>}
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
                <div className="flex items-center justify-between text-xs"><span className="text-muted-foreground">营收占比</span><span className="flex items-center gap-1"><NumInput w="w-16" val={r.share} set={v => upd(i, 'share', v)} />%</span></div>
                <div className="flex items-center justify-between text-xs"><span className="text-muted-foreground">AOV 客单价</span><span className="flex items-center gap-1"><NumInput w="w-20" val={r.aov} set={v => upd(i, 'aov', v)} />RM</span></div>
                <div className="flex items-center justify-between text-xs"><span className="text-muted-foreground">转化率 (lead→单)</span><span className="flex items-center gap-1"><NumInput w="w-16" val={r.conv} set={v => upd(i, 'conv', v)} />%</span></div>
              </div>

              <div className="mt-3 rounded-md p-2 space-y-0.5 text-xs" style={{ background: r.color + '12' }}>
                <div className="flex justify-between"><span className="text-muted-foreground">营收</span><span className="font-semibold">{rm(r.sales)}</span></div>
                <div className="flex justify-between"><span className="text-muted-foreground">成交套数 / 月</span><span className="font-medium">{num(r.orders)} 套 (每天 ≈ {days ? num(r.orders / days) : 0})</span></div>
                <div className="flex justify-between"><span className="text-muted-foreground">需要 Leads / 月</span><span className="font-medium">{num(r.leads)}</span></div>
                <div className="flex justify-between"><span className="font-semibold" style={{ color: r.color }}>每天要多少 Lead</span><span className="font-bold" style={{ color: r.color }}>{days ? num(r.leads / days) : 0}</span></div>
                <div className="flex justify-between"><span className="text-muted-foreground">CPL 每个 lead 成本</span><span className="font-medium">{rm(r.cpl)}</span></div>
                <div className="flex justify-between"><span className="text-muted-foreground">CPA 每单广告成本</span><span className="font-medium">{rm(r.cpa)}</span></div>
                <div className="flex justify-between"><span className="text-muted-foreground">广告 / 月</span><span className="font-medium">{rm(r.ad)}</span></div>
                <div className="flex justify-between"><span className="font-semibold" style={{ color: r.color }}>广告 / 天</span><span className="font-bold" style={{ color: r.color }}>{days ? rm(r.ad / days) : '—'}</span></div>
              </div>
            </div>
          ))}
        </div>

        {/* Online total */}
        <div className="rounded-lg p-3 bg-muted/40 text-xs">
          <p className="font-semibold text-sm mb-1">Online 合计</p>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
            <div><span className="text-muted-foreground">营收</span><div className="font-semibold">{rm(tot.sales)}</div></div>
            <div><span className="text-muted-foreground">成交套数/月</span><div className="font-semibold">{num(tot.orders)} 套</div></div>
            <div><span className="text-muted-foreground">Leads/天</span><div className="font-semibold">{days ? num(tot.leads / days) : 0}</div></div>
            <div><span className="text-muted-foreground">广告/天</span><div className="font-semibold">{days ? rm(tot.ad / days) : '—'}</div></div>
          </div>
        </div>

        <p className="text-[11px] text-muted-foreground">
          先在上面 Profit Target 找出「要达到目标净利需要的 Online 营收」,填进这里的「Online 目标营收」,再按两个 page 的占比 / AOV / 转化率分配。默认值是我按你数据给的起点,请用你真实的 CPL / 转化率覆盖。
        </p>
      </CardContent>
    </Card>
  )
}
