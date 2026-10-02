'use client'

import { useQuery } from '@tanstack/react-query'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'

type RfmLine = { count: number; spend: number; avg: number }
type RfmSub = { key: string; label: string; desc: string; action: string; tone: 'up' | 'hold' | 'winback'; total: RfmLine; beauty: RfmLine; repair: RfmLine; mixed: RfmLine }
type RfmTier = { key: string; label: string; total: RfmLine; subs: RfmSub[] }
type DdRfm = { totalCustomers: number; tiers: RfmTier[] }

const rm = (n: number) => `RM ${Math.round(n).toLocaleString()}`
const TONE: Record<string, { badge: string; label: string; bar: string }> = {
  up: { badge: 'bg-emerald-500/15 text-emerald-500', label: '↑ Raise / premium', bar: 'bg-emerald-500' },
  hold: { badge: 'bg-blue-500/15 text-blue-400', label: '= Hold / convert', bar: 'bg-blue-500' },
  winback: { badge: 'bg-orange-500/15 text-orange-400', label: '↓ Win-back', bar: 'bg-orange-500' },
}
const TIER_COLOR: Record<string, string> = { new: '#378add', repeat: '#1baf7a', myvip: '#a855f7', sgvip: '#eb6834' }

export default function SegmentationTab({ selectedBrand }: { selectedBrand?: string }) {
  const { data, isLoading, error } = useQuery({
    queryKey: ['dd-rfm'],
    enabled: selectedBrand === 'DD',
    queryFn: async () => {
      const res = await fetch('/api/analytics/dd-rfm')
      if (!res.ok) { const b = await res.json().catch(() => null); throw new Error(b?.error || `HTTP ${res.status}`) }
      return res.json() as Promise<DdRfm>
    },
    retry: false,
  })

  if (selectedBrand !== 'DD') return <p className="text-sm text-muted-foreground">Select the DD brand to see customer segmentation.</p>
  if (error) return <p className="text-sm text-red-600">Failed to load segmentation — {(error as Error).message}</p>
  if (isLoading || !data) return <div className="h-60 bg-muted/30 rounded-lg animate-pulse" />

  const tot = data.totalCustomers || 1
  const pctOf = (n: number, base: number) => `${Math.round((n / (base || 1)) * 1000) / 10}%`

  const lineCell = (name: string, color: string, l: RfmLine) => (
    <div className="rounded-md border p-2">
      <div className="text-[11px] font-medium" style={{ color }}>{name}</div>
      <div className="text-sm font-bold">{l.count.toLocaleString()} <span className="text-[11px] font-normal text-muted-foreground">ppl</span></div>
      <div className="text-[11px] text-muted-foreground">avg {rm(l.avg)}</div>
    </div>
  )

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-semibold">Customer Segmentation · pricing lens</h2>
        <p className="text-xs text-muted-foreground">Tier 1 = New / Repeat / Malaysia VIP / Singapore VIP · Tier 2 = RFM (New uses recency×value) · split by product line (Beauty 焕肤王 / Repair 钻石露). Phone-deduped, live from Lark · {data.totalCustomers.toLocaleString()} customers.</p>
      </div>

      {data.tiers.map(tier => {
        const color = TIER_COLOR[tier.key] ?? '#888780'
        return (
          <div key={tier.key} className="space-y-3">
            <div className="flex items-center justify-between border-b pb-2">
              <h3 className="text-base font-semibold" style={{ color }}>{tier.label}</h3>
              <div className="text-right">
                <span className="text-sm font-bold">{tier.total.count.toLocaleString()}</span>
                <span className="text-xs text-muted-foreground"> ppl · {pctOf(tier.total.count, tot)} · {rm(tier.total.spend)}</span>
              </div>
            </div>
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
              {tier.subs.map(s => {
                const t = TONE[s.tone]
                return (
                  <Card key={s.key}>
                    <CardHeader className="pb-2">
                      <div className="flex items-center justify-between gap-2">
                        <div>
                          <CardTitle className="text-sm">{s.label}</CardTitle>
                          <p className="text-[11px] text-muted-foreground">{s.desc}</p>
                        </div>
                        <span className={`text-[11px] font-medium px-2 py-1 rounded-md whitespace-nowrap ${t.badge}`}>{t.label}</span>
                      </div>
                    </CardHeader>
                    <CardContent className="space-y-3">
                      <div className="flex items-end gap-4">
                        <div>
                          <div className="text-xl font-bold">{s.total.count.toLocaleString()}</div>
                          <div className="text-[11px] text-muted-foreground">{pctOf(s.total.count, tier.total.count)} of tier</div>
                        </div>
                        <div className="ml-auto text-right">
                          <div className="text-sm font-semibold">{rm(s.total.spend)}</div>
                          <div className="text-[11px] text-muted-foreground">total · avg {rm(s.total.avg)}</div>
                        </div>
                      </div>
                      <div className="grid grid-cols-3 gap-2">
                        {lineCell('Beauty 焕肤王', '#22a06b', s.beauty)}
                        {lineCell('Repair 钻石露', '#c0392b', s.repair)}
                        {lineCell('Mixed', '#888780', s.mixed)}
                      </div>
                      <p className="text-xs leading-relaxed"><span className="font-medium">Pricing:</span> {s.action}</p>
                    </CardContent>
                  </Card>
                )
              })}
            </div>
          </div>
        )
      })}
    </div>
  )
}
