'use client'

import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { cn } from '@/lib/utils'

const BANDS = ['<300', '300-499', '500-699', '700-999', '1000+']

type Pk = { pkg: string; count: number }
type BandRow = { band: string; firstCount: number; repeatCount: number; repeatRate: number; firstAvg: number; nextAvg: number; avgDays: number; topPkgs: Pk[]; topNext: Pk[]; mig: Record<string, number> }
type LineRepurchase = { key: string; label: string; totalFirst: number; totalRepeat: number; overallRate: number; nextAvg: number; firstAvg: number; bands: BandRow[] }
type PkgJourney = { pkg: string; firstCount: number; repeatCount: number; repeatRate: number; avgDays: number; firstAvg: number; nextAvg: number; topNext: { pkg: string; count: number }[] }
type DdRepurchase = { lines: LineRepurchase[]; byPackage: PkgJourney[] }

const rm = (n: number) => `RM ${Math.round(n).toLocaleString()}`

const SUPPORTED = ['DD', 'Juji']

export default function RepurchaseTab({ selectedBrand }: { selectedBrand?: string }) {
  const [line, setLine] = useState('all')
  const api = selectedBrand === 'Juji' ? 'juji-repurchase' : 'dd-repurchase'
  const { data, isLoading, error } = useQuery({
    queryKey: ['repurchase', selectedBrand],
    enabled: SUPPORTED.indexOf(selectedBrand ?? '') >= 0,
    queryFn: async () => {
      const res = await fetch(`/api/analytics/${api}`)
      if (!res.ok) { const b = await res.json().catch(() => null); throw new Error(b?.error || `HTTP ${res.status}`) }
      return res.json() as Promise<DdRepurchase>
    },
    retry: false,
  })

  if (SUPPORTED.indexOf(selectedBrand ?? '') < 0) return <p className="text-sm text-muted-foreground">Select DD or Juji to see the repurchase ladder.</p>
  if (error) return <p className="text-sm text-red-600">Failed to load — {(error as Error).message}</p>
  if (isLoading || !data) return <div className="h-60 bg-muted/30 rounded-lg animate-pulse" />

  const lineData = data.lines.find(l => l.key === line) ?? data.lines[0]
  const heat = (v: number) => v >= 40 ? 'bg-emerald-500/30' : v >= 20 ? 'bg-emerald-500/15' : v >= 5 ? 'bg-muted/40' : ''

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-2">
        <div>
          <h2 className="text-lg font-semibold">Repurchase Ladder · first order → next order</h2>
        </div>
        <div className="flex gap-1">
          {data.lines.map(l => (
            <button key={l.key} onClick={() => setLine(l.key)}
              className={cn('px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors', line === l.key ? 'bg-primary text-primary-foreground border-primary' : 'border-border hover:bg-muted')}>
              {l.label}
            </button>
          ))}
        </div>
      </div>

      {/* Summary */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {[
          { l: 'First-time buyers', v: lineData.totalFirst.toLocaleString() },
          { l: 'Came back (2nd order)', v: `${lineData.totalRepeat.toLocaleString()} · ${lineData.overallRate}%` },
          { l: 'Avg 1st order', v: rm(lineData.firstAvg) },
          { l: 'Avg next order', v: rm(lineData.nextAvg) },
        ].map(k => (
          <div key={k.l} className="rounded-lg bg-muted/40 p-3">
            <div className="text-xs text-muted-foreground">{k.l}</div>
            <div className="text-lg font-bold">{k.v}</div>
          </div>
        ))}
      </div>

      {/* By price range: packages, repeat rate, return time, next */}
      <Card>
        <CardHeader className="pb-2"><CardTitle className="text-sm">By price range · 配套示例 · 多久回来 · 下一单买什么</CardTitle></CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead className="bg-muted/50"><tr className="border-b">
                <th className="px-3 py-2 text-left font-medium text-muted-foreground">Price range</th>
                <th className="px-3 py-2 text-left font-medium text-muted-foreground">配套示例 (first)</th>
                <th className="px-3 py-2 text-right font-medium text-muted-foreground">First buyers</th>
                <th className="px-3 py-2 text-right font-medium text-muted-foreground">Repeat rate</th>
                <th className="px-3 py-2 text-right font-medium text-blue-600">Avg days to return</th>
                <th className="px-3 py-2 text-right font-medium text-emerald-600">Avg next</th>
                <th className="px-3 py-2 text-left font-medium text-muted-foreground">下一单常买</th>
              </tr></thead>
              <tbody>
                {lineData.bands.filter(b => b.firstCount > 0).map(b => (
                  <tr key={b.band} className="border-b hover:bg-muted/30 align-top">
                    <td className="px-3 py-2 font-medium whitespace-nowrap">RM {b.band}</td>
                    <td className="px-3 py-2 text-muted-foreground">{b.topPkgs.map(p => p.pkg).join(' · ') || '—'}</td>
                    <td className="px-3 py-2 text-right">{b.firstCount.toLocaleString()}</td>
                    <td className="px-3 py-2 text-right font-semibold">{b.repeatRate}%</td>
                    <td className="px-3 py-2 text-right font-semibold text-blue-600">{b.avgDays} 天</td>
                    <td className="px-3 py-2 text-right text-emerald-600">{rm(b.nextAvg)}</td>
                    <td className="px-3 py-2 text-muted-foreground">{b.topNext.map(p => `${p.pkg} (${p.count})`).join(' · ') || '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      {/* Migration matrix */}
      <Card>
        <CardHeader className="pb-2"><CardTitle className="text-sm">First → Second price migration <span className="font-normal text-muted-foreground">· % of repeaters, by row</span></CardTitle></CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead className="bg-muted/50"><tr className="border-b">
                <th className="px-3 py-2 text-left font-medium text-muted-foreground">1st ↓ / 2nd →</th>
                {BANDS.map(b => <th key={b} className="px-3 py-2 text-right font-medium text-muted-foreground">{b}</th>)}
                <th className="px-3 py-2 text-right font-medium text-muted-foreground">repeaters</th>
              </tr></thead>
              <tbody>
                {lineData.bands.filter(b => b.repeatCount > 0).map(b => (
                  <tr key={b.band} className="border-b">
                    <td className="px-3 py-2 font-medium">RM {b.band}</td>
                    {BANDS.map(sb => (
                      <td key={sb} className={cn('px-3 py-2 text-right', heat(b.mig[sb] ?? 0))}>{(b.mig[sb] ?? 0) > 0 ? `${b.mig[sb]}%` : '·'}</td>
                    ))}
                    <td className="px-3 py-2 text-right text-muted-foreground">{b.repeatCount.toLocaleString()}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

    </div>
  )
}
