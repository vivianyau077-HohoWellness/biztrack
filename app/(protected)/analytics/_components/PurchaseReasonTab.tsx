'use client'

import { useState, type ReactNode } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Download } from 'lucide-react'
import { cn } from '@/lib/utils'

type CohortRow = { reason: string; customers: number; returned: number; retentionPct: number; avgLTV: number; r1?: number; r2?: number; r3plus?: number }
type Cohort = { totalCustomers: number; returned: number; rows: CohortRow[] }
type Data = { window: string; cross: Cohort; within: Cohort }

const rm = (n: number) => 'RM ' + Math.round(n).toLocaleString()
const csvCell = (v: string | number) => { const s = String(v ?? ''); return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s }
type SortKey = 'customers' | 'returned' | 'retentionPct' | 'avgLTV' | 'r1' | 'r2' | 'r3plus'

export default function PurchaseReasonTab({ selectedBrand }: { selectedBrand?: string }) {
  const [minN, setMinN] = useState(30)

  const supported = selectedBrand === 'DD' || selectedBrand === 'Juji' || selectedBrand === 'NE'
  const { data, isLoading, error } = useQuery({
    queryKey: ['reason-analysis', selectedBrand],
    enabled: supported,
    queryFn: async () => {
      const res = await fetch('/api/analytics/dd-reason-analysis?brand=' + encodeURIComponent(selectedBrand || ''))
      if (!res.ok) { const b = await res.json().catch(() => null); throw new Error(b?.error || ('HTTP ' + res.status)) }
      return res.json() as Promise<Data>
    },
    retry: false,
  })

  if (!supported) return <p className="text-sm text-muted-foreground">Select DD, Juji, or NE to see purchase-reason analysis.</p>
  if (error) return <p className="text-sm text-red-600">Failed to load — {(error as Error).message}</p>
  if (isLoading || !data) return <div className="h-60 bg-muted/30 rounded-lg animate-pulse" />

  return (
    <div className="space-y-8">
      <div>
        <h2 className="text-xl font-bold">Purchase Reason · retention &amp; LTV</h2>
        <p className="text-sm text-muted-foreground mt-1">
          Every customer counted once (deduped by phone, name fallback). Data window: <span className="font-medium text-foreground">{data.window}</span>. Campaign tags (Shopee PIN, Community) excluded.
        </p>
        <p className="text-xs text-muted-foreground mt-1">
          <b>Min sample</b> hides reasons with too few customers — a 30% retention on 13 people is noise, a 10% on 1,700 is real. Raise it to trust the percentages; lower it to see every reason.
        </p>
      </div>

      {data.cross.totalCustomers > 0 ? (
        <CohortTable
          title="Table A · 2025 → 2026 retention"
          subtitle="Customers who ordered in 2025 — did they come back in 2026?"
          colCustomers="2025 customers"
          colReturned="Returned in 2026"
          colRet="Retention %"
          colLtv="Avg LTV (returned)"
          ltvHint="Average lifetime spend of the customers who came back"
          cohort={data.cross}
          minN={minN} setMinN={setMinN}
          csvName={`${selectedBrand?.toLowerCase()}-reason-2025-to-2026`}
        />
      ) : (
        <p className="text-sm text-muted-foreground">Table A (2025 → 2026) isn&apos;t shown — {selectedBrand} has no 2025 order history, so there&apos;s no cross-year cohort yet.</p>
      )}

      <CohortTable
        title="Table B · 2026 new → 2026 repeat"
        subtitle="Customers whose first-ever order was in 2026 — did they buy again within 2026?"
        colCustomers="New 2026 customers"
        colReturned="Repeated in 2026"
        colRet="Repeat %"
        colLtv="Avg LTV (repeated)"
        ltvHint="Average lifetime spend of the customers who repeated"
        cohort={data.within}
        minN={minN} setMinN={setMinN}
        csvName={`${selectedBrand?.toLowerCase()}-reason-2026-to-2026`}
        ladder
      />

      <Insights cross={data.cross} within={data.within} />
    </div>
  )
}

function CohortTable({ title, subtitle, colCustomers, colReturned, colRet, colLtv, ltvHint, cohort, minN, setMinN, csvName, ladder }: {
  title: string; subtitle: string; colCustomers: string; colReturned: string; colRet: string; colLtv: string; ltvHint: string
  cohort: Cohort; minN: number; setMinN: (n: number) => void; csvName: string; ladder?: boolean
}) {
  const [sort, setSort] = useState<SortKey>('customers')
  const rows = [...cohort.rows].filter(r => r.customers >= minN).sort((a, b) => ((b[sort] as number) || 0) - ((a[sort] as number) || 0))

  const download = () => {
    const header = ladder
      ? ['Purchase reason', colCustomers, '1st repeat (2 orders)', '2nd repeat (3 orders)', '3rd+ repeat (4+ orders)', colReturned, colRet, colLtv]
      : ['Purchase reason', colCustomers, colReturned, colRet, colLtv]
    const lines = [header, ...[...cohort.rows].sort((a, b) => b.customers - a.customers).map(r => ladder
      ? [r.reason, r.customers, r.r1 ?? 0, r.r2 ?? 0, r.r3plus ?? 0, r.returned, r.retentionPct, r.avgLTV]
      : [r.reason, r.customers, r.returned, r.retentionPct, r.avgLTV])]
    const csv = lines.map(l => l.map(csvCell).join(',')).join('\n')
    const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob); const a = document.createElement('a')
    a.href = url; a.download = `${csvName}-${new Date().toISOString().slice(0, 10)}.csv`; a.click(); URL.revokeObjectURL(url)
  }

  const SortTh = ({ k, label, hint }: { k: SortKey; label: string; hint?: string }) => (
    <th title={hint} className={cn('px-3 py-2.5 text-right font-semibold cursor-pointer select-none hover:text-foreground bg-background', sort === k ? 'text-foreground' : 'text-muted-foreground')} onClick={() => setSort(k)}>
      {label}{sort === k ? ' ↓' : ''}
    </th>
  )

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h3 className="text-base font-semibold">{title}</h3>
          <p className="text-sm text-muted-foreground">
            {subtitle} — <span className="font-medium text-foreground">{cohort.totalCustomers.toLocaleString()}</span> in this cohort, <span className="font-medium text-foreground">{cohort.returned.toLocaleString()}</span> ({cohort.totalCustomers ? Math.round(cohort.returned / cohort.totalCustomers * 100) : 0}%) repurchased.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-sm text-muted-foreground" title="Hide reasons with fewer customers than this — small samples give unreliable %">Min sample size</span>
          <select value={minN} onChange={e => setMinN(+e.target.value)} className="h-9 rounded-md border border-input bg-background px-2 text-sm">
            {[1, 10, 30, 50, 100].map(v => <option key={v} value={v}>{v === 1 ? 'Show all' : `≥ ${v}`}</option>)}
          </select>
          <Button onClick={download} size="sm" variant="outline"><Download className="h-4 w-4 mr-1" /> CSV</Button>
        </div>
      </div>

      <Card><CardContent className="p-0">
        <div className="overflow-auto max-h-[65vh] rounded-md">
          <table className="w-full text-sm">
            <thead className="sticky top-0 z-10 bg-background shadow-[0_1px_0_0_hsl(var(--border))]">
              <tr className="border-b">
                <th className="px-3 py-2.5 text-left font-semibold text-muted-foreground bg-background">Purchase reason</th>
                <SortTh k="customers" label={colCustomers} />
                {ladder && <SortTh k="r1" label="1st repeat" hint="Bought exactly 1 more time (2 orders total)" />}
                {ladder && <SortTh k="r2" label="2nd repeat" hint="Bought 2 more times (3 orders total)" />}
                {ladder && <SortTh k="r3plus" label="3rd+ repeat" hint="Bought 3 or more times (4+ orders total)" />}
                <SortTh k="returned" label={colReturned} hint="Any repeat (1st + 2nd + 3rd+)" />
                <SortTh k="retentionPct" label={colRet} hint="Returned ÷ customers" />
                <SortTh k="avgLTV" label={colLtv} hint={ltvHint} />
              </tr>
            </thead>
            <tbody>
              {rows.map(r => (
                <tr key={r.reason} className="border-b hover:bg-muted/30">
                  <td className="px-3 py-2 font-medium">{r.reason}</td>
                  <td className="px-3 py-2 text-right">{r.customers.toLocaleString()}</td>
                  {ladder && <td className="px-3 py-2 text-right text-sky-600">{(r.r1 ?? 0).toLocaleString()}</td>}
                  {ladder && <td className="px-3 py-2 text-right text-indigo-600">{(r.r2 ?? 0).toLocaleString()}</td>}
                  {ladder && <td className="px-3 py-2 text-right text-violet-600 font-medium">{(r.r3plus ?? 0).toLocaleString()}</td>}
                  <td className="px-3 py-2 text-right text-emerald-600 font-medium">{r.returned.toLocaleString()}</td>
                  <td className="px-3 py-2 text-right">{r.retentionPct}%</td>
                  <td className="px-3 py-2 text-right font-semibold">{r.avgLTV ? rm(r.avgLTV) : '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </CardContent></Card>
    </div>
  )
}

function Insights({ cross, within }: { cross: Cohort; within: Cohort }) {
  const bigA = cross.rows.filter(r => r.customers >= 30)
  const bigB = within.rows.filter(r => r.customers >= 30)
  if (!bigA.length && !bigB.length) return null
  const topRet = [...bigA].filter(r => r.customers >= 50).sort((a, b) => b.retentionPct - a.retentionPct)[0]
  const topLtvA = [...bigA].filter(r => r.returned >= 10).sort((a, b) => b.avgLTV - a.avgLTV)[0]
  const topVol = [...bigA].sort((a, b) => b.customers - a.customers)[0]
  const topRepeatB = [...bigB].filter(r => r.customers >= 50).sort((a, b) => b.retentionPct - a.retentionPct)[0]

  const Item = ({ title, body }: { title: string; body: ReactNode }) => (
    <div className="rounded-lg border bg-muted/20 p-4">
      <p className="text-sm font-semibold mb-1">{title}</p>
      <p className="text-sm text-muted-foreground leading-relaxed">{body}</p>
    </div>
  )

  return (
    <div className="space-y-3">
      <h3 className="text-base font-semibold">What this tells us</h3>
      <div className="grid gap-3 md:grid-cols-2">
        {topRet && <Item title="Stickiest reason (2025 → 2026)"
          body={<>Of the big segments, <b>{topRet.reason}</b> retains best at <b>{topRet.retentionPct}%</b> ({topRet.returned} of {topRet.customers.toLocaleString()} 2025 buyers came back). Chronic/medical skin conditions hold customers; cosmetic reasons churn — guard this cohort with refill reminders.</>} />}
        {topLtvA && <Item title="Most valuable returning customers"
          body={<>Customers who repurchased 2025→2026 for <b>{topLtvA.reason}</b> are worth <b>{rm(topLtvA.avgLTV)}</b> each on average — your richest returning segment. Prioritise for upsell / VIP care.</>} />}
        {topVol && <Item title="Biggest base, biggest opportunity"
          body={<><b>{topVol.reason}</b> is your largest 2025 segment ({topVol.customers.toLocaleString()} customers) at {topVol.retentionPct}% retention. Volume is strong, loyalty is the gap — a structured 2nd-purchase flow here moves the most revenue.</>} />}
        {topRepeatB && <Item title="Fastest to a 2nd order (new in 2026)"
          body={<>Among new-2026 customers, <b>{topRepeatB.reason}</b> repeats within the year best at <b>{topRepeatB.retentionPct}%</b>. Good signal that this reason converts first-timers into repeat buyers quickly — lean your 2026 acquisition toward it.</>} />}
      </div>
      <p className="text-xs text-muted-foreground">Retention % = returned ÷ cohort. Avg LTV = average lifetime spend of the customers who repurchased. Live from Lark.</p>
    </div>
  )
}
