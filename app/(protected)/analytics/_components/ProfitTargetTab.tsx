'use client'

import { useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Globe, Store } from 'lucide-react'
import { cn } from '@/lib/utils'

function rm(n: number): string {
  if (!isFinite(n)) return '—'
  return 'RM ' + Math.round(n).toLocaleString()
}

type Defaults = {
  cogs: number; ads: number; shipping: number; fees: number; marketer: number; fixed: number
  refRev: number; refLabel: string; adsLabel: string
}

function Field({ label, val, set, suffix }: { label: string; val: number; set: (n: number) => void; suffix: string }) {
  return (
    <label className="flex items-center justify-between gap-2 text-xs py-1">
      <span className="text-muted-foreground">{label}</span>
      <span className="flex items-center gap-1">
        <input
          type="number"
          value={val}
          onChange={e => set(parseFloat(e.target.value) || 0)}
          className="w-24 h-7 rounded-md border border-input bg-background px-2 text-right text-xs"
        />
        <span className="text-muted-foreground w-3 text-left">{suffix}</span>
      </span>
    </label>
  )
}

function ChannelPlanner({ title, accent, icon: Icon, d }: { title: string; accent: string; icon: typeof Globe; d: Defaults }) {
  const [cogs, setCogs] = useState(d.cogs)
  const [ads, setAds] = useState(d.ads)
  const [shipping, setShipping] = useState(d.shipping)
  const [fees, setFees] = useState(d.fees)
  const [marketer, setMarketer] = useState(d.marketer)
  const [fixed, setFixed] = useState(d.fixed)
  const [mode, setMode] = useState<'profit' | 'margin' | 'sales'>('sales')
  const [targetProfit, setTargetProfit] = useState(150000)
  const [targetMargin, setTargetMargin] = useState(30)
  const [targetSales, setTargetSales] = useState(Math.round(d.refRev))

  const variablePct = cogs + ads + shipping + fees + marketer
  const cm = 100 - variablePct
  const cmR = cm / 100
  const breakeven = cmR > 0 ? fixed / cmR : Infinity

  let requiredRev = Infinity
  let note = ''
  if (mode === 'sales') {
    requiredRev = targetSales
    if (cmR <= 0) note = '变动成本 ≥ 100%,贡献率为负,营收越大亏越多。请降低成本 %。'
  } else if (mode === 'profit') {
    requiredRev = cmR > 0 ? (fixed + targetProfit) / cmR : Infinity
    if (cmR <= 0) note = '变动成本 ≥ 100%,贡献率为负,无法盈利。请降低成本 %。'
  } else {
    if (cm <= targetMargin) {
      note = `贡献率只有 ${cm.toFixed(1)}%,低于目标利润率 ${targetMargin}% —— 单靠增加营收达不到,要降低广告/成本 % 或提价。`
    } else if (fixed <= 0) {
      note = `固定成本 ≈ 0,利润率 ≈ 贡献率 (${cm.toFixed(1)}%),不随营收变化。要更高利润率就得降低成本 %。`
    } else {
      requiredRev = (fixed * 100) / (cm - targetMargin)
    }
  }
  const impliedProfit = isFinite(requiredRev) ? cmR * requiredRev - fixed : NaN
  const impliedMargin = isFinite(requiredRev) && requiredRev > 0 ? (impliedProfit / requiredRev) * 100 : NaN
  const gap = isFinite(requiredRev) ? requiredRev - d.refRev : NaN
  const gapPct = d.refRev ? (gap / d.refRev) * 100 : NaN

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-base font-semibold flex items-center gap-2">
          <span className="h-7 w-7 rounded-lg flex items-center justify-center" style={{ background: accent }}>
            <Icon className="h-4 w-4 text-white" />
          </span>
          {title}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Cost assumptions */}
        <div>
          <p className="text-xs font-semibold text-muted-foreground mb-1">成本假设(可改)</p>
          <div className="rounded-lg border divide-y px-3">
            <Field label="产品成本 COGS" val={cogs} set={setCogs} suffix="%" />
            <Field label={d.adsLabel} val={ads} set={setAds} suffix="%" />
            <Field label="运费 Shipping" val={shipping} set={setShipping} suffix="%" />
            <Field label="平台佣金 + 包装 + 手续费" val={fees} set={setFees} suffix="%" />
            <Field label="Marketer 抽成" val={marketer} set={setMarketer} suffix="%" />
            <Field label="固定成本 / 月" val={fixed} set={setFixed} suffix="RM" />
          </div>
          <div className="flex items-center justify-between mt-2 text-xs">
            <span className="text-muted-foreground">变动成本合计 {variablePct.toFixed(1)}%</span>
            <span className="font-semibold" style={{ color: accent }}>贡献率(毛利率) {cm.toFixed(1)}%</span>
          </div>
        </div>

        {/* Target */}
        <div>
          <div className="flex gap-1.5 mb-2">
            <button onClick={() => setMode('sales')} className={cn('flex-1 text-xs py-1.5 rounded-md border font-medium', mode === 'sales' ? 'text-white' : 'hover:bg-muted')} style={mode === 'sales' ? { background: accent, borderColor: accent } : {}}>输入营收 → 净利</button>
            <button onClick={() => setMode('profit')} className={cn('flex-1 text-xs py-1.5 rounded-md border font-medium', mode === 'profit' ? 'text-white' : 'hover:bg-muted')} style={mode === 'profit' ? { background: accent, borderColor: accent } : {}}>目标净利</button>
            <button onClick={() => setMode('margin')} className={cn('flex-1 text-xs py-1.5 rounded-md border font-medium', mode === 'margin' ? 'text-white' : 'hover:bg-muted')} style={mode === 'margin' ? { background: accent, borderColor: accent } : {}}>目标利润率</button>
          </div>
          {mode === 'sales' ? (
            <Field label="输入月营收 Total Sales" val={targetSales} set={setTargetSales} suffix="RM" />
          ) : mode === 'profit' ? (
            <Field label="每月想赚的净利" val={targetProfit} set={setTargetProfit} suffix="RM" />
          ) : (
            <Field label="想达到的净利率" val={targetMargin} set={setTargetMargin} suffix="%" />
          )}
        </div>

        {/* Result */}
        <div className="rounded-lg p-3" style={{ background: accent + '14' }}>
          {mode === 'sales' ? (
            <>
              <p className="text-xs text-muted-foreground">预计净利 Net Profit</p>
              <p className="text-3xl font-bold" style={{ color: impliedProfit >= 0 ? accent : '#C0392B' }}>{rm(impliedProfit)}</p>
              {note ? (
                <p className="text-xs text-red-600 mt-1">{note}</p>
              ) : (
                <div className="mt-2 space-y-0.5 text-xs text-muted-foreground">
                  <div className="flex justify-between"><span>净利率 Net %</span><span className="font-medium text-foreground">{isFinite(impliedMargin) ? impliedMargin.toFixed(1) : '—'}%</span></div>
                  <div className="flex justify-between"><span>输入的营收</span><span className="font-medium text-foreground">{rm(targetSales)}</span></div>
                  <div className="flex justify-between"><span>毛利(贡献) = 营收 × {cm.toFixed(1)}%</span><span className="font-medium text-foreground">{rm(cmR * targetSales)}</span></div>
                  <div className="flex justify-between"><span>(-) 固定成本</span><span className="font-medium text-foreground">{rm(fixed)}</span></div>
                  <div className="flex justify-between"><span>保本营收 (break-even)</span><span className="font-medium text-foreground">{rm(breakeven)}</span></div>
                </div>
              )}
            </>
          ) : (
            <>
              <p className="text-xs text-muted-foreground">需要做到的月营收 Sales</p>
              <p className="text-3xl font-bold" style={{ color: accent }}>{rm(requiredRev)}</p>
              {note ? (
                <p className="text-xs text-red-600 mt-1">{note}</p>
              ) : (
                <div className="mt-2 space-y-0.5 text-xs text-muted-foreground">
                  <div className="flex justify-between"><span>预计净利</span><span className="font-medium text-foreground">{rm(impliedProfit)} ({isFinite(impliedMargin) ? impliedMargin.toFixed(1) : '—'}%)</span></div>
                  <div className="flex justify-between"><span>保本营收 (break-even)</span><span className="font-medium text-foreground">{rm(breakeven)}</span></div>
                  <div className="flex justify-between"><span>参考:{d.refLabel} 营收</span><span className="font-medium text-foreground">{rm(d.refRev)}</span></div>
                  <div className="flex justify-between"><span>vs 参考需增长</span><span className={cn('font-medium', gap > 0 ? 'text-orange-600' : 'text-green-600')}>{isFinite(gap) ? `${gap >= 0 ? '+' : ''}${rm(gap)} (${gapPct >= 0 ? '+' : ''}${isFinite(gapPct) ? gapPct.toFixed(0) : '—'}%)` : '—'}</span></div>
                </div>
              )}
            </>
          )}
        </div>
      </CardContent>
    </Card>
  )
}

export default function ProfitTargetTab() {
  return (
    <div className="space-y-4">
      <p className="text-xs text-muted-foreground">
        倒推工具:输入你想要的净利或利润率,算出需要做多少 Sales。公式:所需营收 = (固定成本 + 目标净利) ÷ 贡献率。默认值来自你 2026 Jan–May 的 P&L,均可修改。
      </p>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <ChannelPlanner
          title="Online (Diamond Drink)"
          accent="#1C7293"
          icon={Globe}
          d={{ cogs: 27, ads: 36, shipping: 4, fees: 5.5, marketer: 3, fixed: 5000, refRev: 625400, refLabel: 'Jan–May 均', adsLabel: '广告 Meta Ads' }}
        />
        <ChannelPlanner
          title="Offline (Diamond Drink)"
          accent="#0F766E"
          icon={Store}
          d={{ cogs: 38, ads: 0, shipping: 5, fees: 0.5, marketer: 3, fixed: 0, refRev: 125663, refLabel: 'Feb', adsLabel: '广告(线下通常 0)' }}
        />
      </div>
      <p className="text-xs text-muted-foreground">
        提示:线上净利率下滑主要是广告占比从 31% 升到 41%。想看「把广告控制在 30% 要做多少营收」,把上面「广告 Meta Ads」改成 30 即可,贡献率和所需营收会立即更新。
      </p>
    </div>
  )
}
