'use client'

import { useState } from 'react'
import { Card, CardContent } from '@/components/ui/card'
import { cn } from '@/lib/utils'

// ── Product catalog (unit costs from the P&L) ────────────────────────────────
const CATALOG: { name: string; unit: number }[] = [
  { name: 'Dhealthy 330ml Cactus Gel', unit: 25.07 },
  { name: 'Diamond Drink 500ml', unit: 49.35 },
  { name: 'Diamond Drink 25gm', unit: 2.30 },
  { name: 'Diamond Drink 25ml×10 Box', unit: 26.78 },
  { name: 'Dhealthy 60ml Cactus Gel', unit: 5.50 },
  { name: 'Dhealthy 215ml Cactus Gel', unit: 15.30 },
]

type Plan = { sales: number; ads: number; other: number; fixed: number; marketerPct: number; qty: number[] }
// qty order matches CATALOG. other = all costs except COGS, Ads, Marketer(3%), Fixed.
const ONLINE: Record<string, Plan> = {
  "Jan'26": { sales: 590501.88, ads: 167673.36, other: 55291.15, fixed: 4000, marketerPct: 3, qty: [195, 2372, 6, 1397, 0, 0] },
  "Feb'26": { sales: 624164.00, ads: 198899.62, other: 71932.50, fixed: 4000, marketerPct: 3, qty: [132, 2539, 15, 1363, 0, 0] },
  "Mar'26": { sales: 763232.71, ads: 260938.29, other: 107604.85, fixed: 4000, marketerPct: 3, qty: [78, 3315, 25, 1685, 0, 100] },
  "Apr'26": { sales: 537674.90, ads: 184817.53, other: 72743.64, fixed: 4000, marketerPct: 3, qty: [0, 2351, 3, 991, 0, 151] },
  "May'26": { sales: 611191.50, ads: 230694.44, other: 71671.41, fixed: 4000, marketerPct: 3, qty: [2, 2978, 49, 804, 0, 125] },
}
const OFFLINE: Record<string, Plan> = {
  "Jan'26": { sales: 108499.20, ads: 0, other: 5858.37, fixed: 0, marketerPct: 3, qty: [40, 636, 251, 279, 0, 0] },
  "Feb'26": { sales: 125662.50, ads: 0, other: 6553.43, fixed: 0, marketerPct: 3, qty: [27, 736, 370, 349, 0, 0] },
  "Mar'26": { sales: 97428.50, ads: 0, other: 4603.99, fixed: 0, marketerPct: 3, qty: [4, 535, 240, 755, 0, 9] },
  "Apr'26": { sales: 98193.90, ads: 0, other: 4820.30, fixed: 0, marketerPct: 3, qty: [0, 563, 230, 305, 0, 14] },
  "May'26": { sales: 147365.75, ads: 0, other: 5594.70, fixed: 0, marketerPct: 3, qty: [0, 692, 152, 548, 0, 11] },
}
const MONTHS = ["Jan'26", "Feb'26", "Mar'26", "Apr'26", "May'26"]
const DAYS: Record<string, number> = { "Jan'26": 31, "Feb'26": 28, "Mar'26": 31, "Apr'26": 30, "May'26": 31 }

function emptyPlan(): Plan { return { sales: 0, ads: 0, other: 0, fixed: 0, marketerPct: 3, qty: [0, 0, 0, 0, 0, 0] } }
function mergePlans(a: Plan, b: Plan): Plan {
  return { sales: a.sales + b.sales, ads: a.ads + b.ads, other: a.other + b.other, fixed: a.fixed + b.fixed, marketerPct: 3, qty: a.qty.map((q, i) => q + b.qty[i]) }
}
function getPlan(channel: 'online' | 'offline' | 'overall', month: string): Plan {
  if (channel === 'online') return ONLINE[month] ?? emptyPlan()
  if (channel === 'offline') return OFFLINE[month] ?? emptyPlan()
  return mergePlans(ONLINE[month] ?? emptyPlan(), OFFLINE[month] ?? emptyPlan())
}

function rm(n: number) { return (n < 0 ? '-RM ' : 'RM ') + Math.abs(Math.round(n)).toLocaleString() }
function pct(a: number, b: number) { return b ? (a / b) * 100 : 0 }

function NumInput({ val, set, w = 'w-28' }: { val: number; set: (n: number) => void; w?: string }) {
  return (
    <input type="number" value={val} onChange={e => set(parseFloat(e.target.value) || 0)}
      className={cn(w, 'h-8 rounded-md border border-input bg-background px-2 text-right text-sm')} />
  )
}

function EditablePlan({ plan, days, accent }: { plan: Plan; days: number; accent: string }) {
  const [sales, setSales] = useState(plan.sales)
  const [qty, setQty] = useState<number[]>(plan.qty)
  const [units, setUnits] = useState<number[]>(CATALOG.map(c => c.unit))
  const [ads, setAds] = useState(plan.ads)
  const [other, setOther] = useState(plan.other)
  const [marketerPct, setMarketerPct] = useState(plan.marketerPct)
  const [fixed, setFixed] = useState(plan.fixed)
  const [roasInput, setRoasInput] = useState(3)
  const [aov, setAov] = useState(700)
  const [conv, setConv] = useState(5)

  const cogs = CATALOG.reduce((s, _c, i) => s + units[i] * qty[i], 0)
  const marketer = sales * marketerPct / 100
  const totalCost = cogs + ads + other + marketer + fixed
  const net = sales - totalCost
  const netPct = pct(net, sales)
  const dailyAds = days ? ads / days : 0

  // Lead & conversion funnel
  const roas = ads > 0 ? sales / ads : 0
  const orders = aov > 0 ? sales / aov : 0
  const leads = conv > 0 ? orders / (conv / 100) : 0
  const cpl = leads > 0 ? ads / leads : 0
  const cpo = orders > 0 ? ads / orders : 0

  return (
    <div className="space-y-4">
      {/* Total Sales on top */}
      <div className="rounded-lg p-3 flex items-center justify-between" style={{ background: accent + '14' }}>
        <div>
          <p className="text-xs text-muted-foreground">Total Sales (月营收)</p>
          <p className="text-[11px] text-muted-foreground">改这个数字试算</p>
        </div>
        <div className="flex items-center gap-1">
          <input type="number" value={sales} onChange={e => setSales(parseFloat(e.target.value) || 0)}
            className="w-40 h-10 rounded-md border border-input bg-background px-3 text-right text-lg font-bold" />
          <span className="text-muted-foreground text-sm">RM</span>
        </div>
      </div>

      {/* Product Related Costing — key in quantity */}
      <div>
        <p className="text-xs font-semibold text-muted-foreground mb-1">Product Related Costing — 输入数量</p>
        <div className="overflow-x-auto rounded-lg border">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b bg-muted/50 text-muted-foreground">
                <th className="px-3 py-1.5 text-left font-medium">产品</th>
                <th className="px-2 py-1.5 text-right font-medium">单位成本</th>
                <th className="px-2 py-1.5 text-right font-medium">数量 Qty</th>
                <th className="px-3 py-1.5 text-right font-medium">小计</th>
              </tr>
            </thead>
            <tbody>
              {CATALOG.map((c, i) => (
                <tr key={c.name} className="border-b last:border-0">
                  <td className="px-3 py-1.5">{c.name}</td>
                  <td className="px-2 py-1.5 text-right"><NumInput w="w-20" val={units[i]} set={v => setUnits(u => u.map((x, j) => j === i ? v : x))} /></td>
                  <td className="px-2 py-1.5 text-right"><NumInput w="w-24" val={qty[i]} set={v => setQty(q => q.map((x, j) => j === i ? v : x))} /></td>
                  <td className="px-3 py-1.5 text-right font-medium">{rm(units[i] * qty[i])}</td>
                </tr>
              ))}
              <tr className="bg-muted/30 font-semibold">
                <td className="px-3 py-1.5" colSpan={3}>COGS 小计 · {pct(cogs, sales).toFixed(1)}% of sales</td>
                <td className="px-3 py-1.5 text-right">{rm(cogs)}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      {/* Other cost inputs */}
      <div className="rounded-lg border divide-y px-3">
        <div className="flex items-center justify-between gap-2 py-1.5 text-xs">
          <span className="text-muted-foreground">广告 Ad Spend (输入 RM)</span>
          <span className="flex items-center gap-2">
            <span className="text-[11px] text-green-700">每日 ≈ {rm(dailyAds)} <span className="text-muted-foreground">(÷{days}天)</span></span>
            <NumInput val={ads} set={setAds} />
            <span className="text-muted-foreground w-3">RM</span>
          </span>
        </div>
        <div className="flex items-center justify-between gap-2 py-1.5 text-xs">
          <span className="text-muted-foreground">按 ROAS 反推广告 (广告 = 营收 ÷ ROAS)</span>
          <span className="flex items-center gap-2">
            <span className="text-[11px] text-muted-foreground">现在 ROAS ≈ {roas.toFixed(2)}</span>
            <NumInput w="w-16" val={roasInput} set={v => { setRoasInput(v); if (v > 0) setAds(sales / v) }} />
          </span>
        </div>
        <div className="flex items-center justify-between gap-2 py-1.5 text-xs">
          <span className="text-muted-foreground">其他运营费(运费+佣金+包装+税等)</span>
          <span className="flex items-center gap-1"><NumInput val={other} set={setOther} /><span className="text-muted-foreground w-3">RM</span></span>
        </div>
        <div className="flex items-center justify-between gap-2 py-1.5 text-xs">
          <span className="text-muted-foreground">Marketer 抽成 = {rm(marketer)}</span>
          <span className="flex items-center gap-1"><NumInput w="w-16" val={marketerPct} set={setMarketerPct} /><span className="text-muted-foreground w-3">%</span></span>
        </div>
        <div className="flex items-center justify-between gap-2 py-1.5 text-xs">
          <span className="text-muted-foreground">固定成本 / 月 (Overhead 等)</span>
          <span className="flex items-center gap-1"><NumInput val={fixed} set={setFixed} /><span className="text-muted-foreground w-3">RM</span></span>
        </div>
      </div>

      {/* Result */}
      <div className="rounded-lg p-3" style={{ background: (net >= 0 ? accent : '#C0392B') + '14' }}>
        <p className="text-xs text-muted-foreground">预计净利 Net Profit</p>
        <p className="text-3xl font-bold" style={{ color: net >= 0 ? accent : '#C0392B' }}>{rm(net)} <span className="text-lg">· {netPct.toFixed(1)}%</span></p>
        <div className="mt-2 space-y-0.5 text-xs text-muted-foreground">
          <div className="flex justify-between"><span>Total Sales</span><span className="font-medium text-foreground">{rm(sales)}</span></div>
          <div className="flex justify-between"><span>(-) COGS 产品成本</span><span className="font-medium text-foreground">{rm(cogs)} ({pct(cogs, sales).toFixed(0)}%)</span></div>
          <div className="flex justify-between"><span>(-) 广告 Ads</span><span className="font-medium text-foreground">{rm(ads)} ({pct(ads, sales).toFixed(0)}%)</span></div>
          <div className="flex justify-between"><span>(-) 其他运营费</span><span className="font-medium text-foreground">{rm(other)} ({pct(other, sales).toFixed(0)}%)</span></div>
          <div className="flex justify-between"><span>(-) Marketer 抽成</span><span className="font-medium text-foreground">{rm(marketer)}</span></div>
          <div className="flex justify-between"><span>(-) 固定成本</span><span className="font-medium text-foreground">{rm(fixed)}</span></div>
          <div className="flex justify-between border-t pt-1 mt-1"><span>= 总成本</span><span className="font-medium text-foreground">{rm(totalCost)} ({pct(totalCost, sales).toFixed(0)}%)</span></div>
        </div>
      </div>

      {/* Leads & conversion funnel */}
      <div className="rounded-lg border p-3">
        <p className="text-xs font-semibold mb-2">Leads & 转化(广告漏斗)</p>
        <Field label="平均客单价 AOV" val={aov} set={setAov} suffix="RM" />
        <Field label="转化率 Conversion (lead → 成交)" val={conv} set={setConv} suffix="%" />
        <div className="mt-2 space-y-0.5 text-xs text-muted-foreground">
          <div className="flex justify-between"><span>成交单数 / 月</span><span className="font-medium text-foreground">{Math.round(orders).toLocaleString()} 单 (每天 ≈ {days ? Math.round(orders / days) : 0})</span></div>
          <div className="flex justify-between"><span>需要 Leads / 月</span><span className="font-medium text-foreground">{Math.round(leads).toLocaleString()} (每天 ≈ {days ? Math.round(leads / days) : 0})</span></div>
          <div className="flex justify-between"><span>每个 Lead 成本 CPL</span><span className="font-medium text-foreground">{rm(cpl)}</span></div>
          <div className="flex justify-between"><span>每单广告成本 CPA</span><span className="font-medium text-foreground">{rm(cpo)}</span></div>
          <div className="flex justify-between"><span>广告 / 天</span><span className="font-medium text-foreground">{rm(dailyAds)}</span></div>
        </div>
      </div>
    </div>
  )
}

export default function ProfitTargetTab() {
  const [channel, setChannel] = useState<'online' | 'offline' | 'overall'>('online')
  const [month, setMonth] = useState("May'26")
  const accent = channel === 'offline' ? '#0F766E' : channel === 'overall' ? '#7E57C2' : '#1C7293'
  const plan = getPlan(channel, month)

  return (
    <div className="space-y-4">
      {/* Channel + month selectors */}
      <div className="flex items-center gap-3 flex-wrap">
        <div className="flex gap-1.5">
          {(['online', 'offline', 'overall'] as const).map(c => (
            <button key={c} onClick={() => setChannel(c)}
              className={cn('text-sm px-4 py-1.5 rounded-md border font-medium', channel === c ? 'text-white' : 'hover:bg-muted')}
              style={channel === c ? { background: accent, borderColor: accent } : {}}>
              {c === 'online' ? 'Online' : c === 'offline' ? 'Offline' : 'Overall (合并)'}
            </button>
          ))}
        </div>
        <select value={month} onChange={e => setMonth(e.target.value)} className="h-9 rounded-md border border-input bg-background px-3 text-sm">
          {MONTHS.map(m => <option key={m} value={m}>{m}</option>)}
        </select>
        {channel === 'offline' && !OFFLINE[month] && (
          <span className="text-xs text-orange-600">No offline P&L for this month — set to 0, you can fill it in.</span>
        )}
      </div>

      <Card>
        <CardContent className="p-4">
          <EditablePlan key={channel + month} plan={plan} days={DAYS[month] ?? 30} accent={accent} />
        </CardContent>
      </Card>

    </div>
  )
}
