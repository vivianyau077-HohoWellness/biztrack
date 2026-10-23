'use client'

import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Download } from 'lucide-react'
import { cn } from '@/lib/utils'

type Row = { reason: string; customers: number; continuing: number; retentionPct: number; avgLTV: number; totalLTV: number }
type Data = { totalCustomers: number; continuing: number; rows: Row[] }

const rm = (n: number) => 'RM ' + Math.round(n).toLocaleString()
const csvCell = (v: string | number) => { const s = String(v ?? ''); return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s }
type SortKey = 'customers' | 'continuing' | 'retentionPct' | 'avgLTV'

export default function PurchaseReasonTab({ selectedBrand }: { selectedBrand?: string }) {
  const [sort, setSort] = useState<SortKey>('customers')
  const [minN, setMinN] = useState(10)

  const { data, isLoading, error } = useQuery({
    queryKey: ['dd-reason-analysis', selectedBrand],
    enabled: selectedBrand === 'DD',
    queryFn: async () => {
      const res = await fetch('/api/analytics/dd-reason-analysis')
      if (!res.ok) { const b = await res.json().catch(() => null); throw new Error(b?.error || ('HTTP ' + res.status)) }
      return res.json() as Promise<Data>
    },
    retry: false,
  })

  if (selectedBrand !== 'DD') return <p className="text-sm text-muted-foreground">Select DD to see purchase-reason analysis.</p>
  if (error) return <p className="text-sm text-red-600">Failed to load — {(error as Error).message}</p>
  if (isLoading || !data) return <div className="h-60 bg-muted/30 rounded-lg animate-pulse" />

  const rows = [...data.rows].filter(r => r.customers >= minN).sort((a, b) => (b[sort] as number) - (a[sort] as number))

  const download = () => {
    const header = ['Purchase reason', 'Customers', 'Continuing 25→26', 'Retention %', 'Avg LTV (RM)', 'Total LTV (RM)']
    const lines = [header, ...[...data.rows].sort((a, b) => b.customers - a.customers).map(r => [r.reason, r.customers, r.continuing, r.retentionPct, r.avgLTV, r.totalLTV])]
    const csv = lines.map(l => l.map(csvCell).join(',')).join('\n')
    const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob); const a = document.createElement('a')
    a.href = url; a.download = `dd-purchase-reason-analysis-${new Date().toISOString().slice(0, 10)}.csv`; a.click(); URL.revokeObjectURL(url)
  }

  const SortTh = ({ k, label, cls }: { k: SortKey; label: string; cls?: string }) => (
    <th className={cn('px-3 py-2 text-right font-medium cursor-pointer select-none hover:text-foreground', sort === k ? 'text-foreground' : 'text-muted-foreground', cls)} onClick={() => setSort(k)}>
      {label}{sort === k ? ' ↓' : ''}
    </th>
  )

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold">Purchase Reason · retention &amp; LTV</h2>
          <p className="text-xs text-muted-foreground">
            {data.totalCustomers.toLocaleString()} customers · <span className="font-medium text-foreground">{data.continuing.toLocaleString()}</span> kept repurchasing 2025→2026 · deduped by phone (name fallback). Click a column to sort.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-xs text-muted-foreground">Min customers</span>
          <select value={minN} onChange={e => setMinN(+e.target.value)} className="h-9 rounded-md border border-input bg-background px-2 text-sm">
            {[1, 5, 10, 20, 50].map(v => <option key={v} value={v}>{v}</option>)}
          </select>
          <Button onClick={download} size="sm" variant="outline"><Download className="h-4 w-4 mr-1" /> CSV</Button>
        </div>
      </div>

      <Card><CardContent className="p-0">
        <div className="overflow-x-auto max-h-[70vh]">
          <table className="w-full text-xs">
            <thead className="bg-muted/50 sticky top-0">
              <tr className="border-b">
                <th className="px-3 py-2 text-left font-medium text-muted-foreground">Purchase reason</th>
                <SortTh k="customers" label="Customers" />
                <SortTh k="continuing" label="Continuing 25→26" />
                <SortTh k="retentionPct" label="Retention %" />
                <SortTh k="avgLTV" label="Avg LTV" />
              </tr>
            </thead>
            <tbody>
              {rows.map(r => (
                <tr key={r.reason} className="border-b hover:bg-muted/30">
                  <td className="px-3 py-1.5 font-medium">{r.reason}</td>
                  <td className="px-3 py-1.5 text-right">{r.customers.toLocaleString()}</td>
                  <td className="px-3 py-1.5 text-right text-emerald-600">{r.continuing.toLocaleString()}</td>
                  <td className="px-3 py-1.5 text-right">{r.retentionPct}%</td>
                  <td className="px-3 py-1.5 text-right font-semibold">{rm(r.avgLTV)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </CardContent></Card>
      <p className="text-[11px] text-muted-foreground">Note: tags like “Shopee PIN”, “Community”, “Community RM10” are campaign/channel markers, not real health reasons — read them separately. Live from Lark.</p>
    </div>
  )
}
