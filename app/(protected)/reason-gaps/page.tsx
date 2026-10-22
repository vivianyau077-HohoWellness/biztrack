'use client'

import { useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import PageHeader from '@/components/shared/PageHeader'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Download, Wand2 } from 'lucide-react'
import { toast } from 'sonner'

type Row = { name: string; phone: string; reason: string; date: string; channel: string; nr: string; price: number }
type Data = { customers: number; rows: Row[] }

function csvCell(v: string | number) { const s = String(v ?? ''); return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s }

export default function ReasonGapsPage() {
  const qc = useQueryClient()
  const [filling, setFilling] = useState(false)
  const { data, isLoading, error } = useQuery({
    queryKey: ['dd-reason-gaps'],
    queryFn: async () => {
      const res = await fetch('/api/analytics/dd-reason-gaps')
      if (!res.ok) { const b = await res.json().catch(() => null); throw new Error(b?.error || ('HTTP ' + res.status)) }
      return res.json() as Promise<Data>
    },
    retry: false,
  })

  const backfill = async () => {
    if (!data || !data.rows.length) return
    if (!window.confirm(`Fill the Purchase reason on ${data.rows.length} blank 2026 orders, each with that customer's first-purchase reason? This writes to Lark and only fills blanks (never overwrites an existing reason).`)) return
    setFilling(true)
    try {
      const res = await fetch('/api/analytics/dd-reason-backfill', { method: 'POST' })
      const body = await res.json().catch(() => null)
      if (!res.ok) throw new Error(body?.error || ('HTTP ' + res.status))
      toast.success(`Backfilled ${body.updated} orders${body.failed ? ` · ${body.failed} failed` : ''}`)
      await qc.invalidateQueries({ queryKey: ['dd-reason-gaps'] })
    } catch (e) {
      toast.error('Backfill failed — ' + (e as Error).message)
    } finally {
      setFilling(false)
    }
  }

  const download = () => {
    if (!data) return
    const header = ['Name', 'Phone', 'Stated reason', 'Blank order date', 'Channel', 'New/Repeat', 'Price (RM)']
    const lines = [header, ...data.rows.map(r => [r.name, r.phone, r.reason, r.date, r.channel, r.nr, r.price])]
    const csv = lines.map(l => l.map(csvCell).join(',')).join('\n')
    const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url; a.download = `dd-purchase-reason-gaps-${new Date().toISOString().slice(0, 10)}.csv`; a.click()
    URL.revokeObjectURL(url)
  }

  return (
    <div>
      <PageHeader title="Purchase Reason Gaps — DD" description="2026 orders with a blank Purchase reason, whose customer's first purchase (2025 or 2026) did state a reason — tracked by phone" />

      {error ? (
        <p className="text-sm text-red-600 mt-6">Failed to load — {(error as Error).message}</p>
      ) : isLoading || !data ? (
        <div className="h-40 bg-muted/30 rounded-lg animate-pulse mt-6" />
      ) : (
        <div className="mt-6 space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="text-sm text-muted-foreground">
              <span className="font-semibold text-foreground">{data.customers.toLocaleString()}</span> customers · <span className="font-semibold text-foreground">{data.rows.length.toLocaleString()}</span> blank orders that can take a carried-forward reason.
            </p>
            <div className="flex items-center gap-2">
              <Button onClick={download} size="sm" variant="outline" disabled={!data.rows.length}><Download className="h-4 w-4 mr-1" /> Download CSV</Button>
              <Button onClick={backfill} size="sm" disabled={!data.rows.length || filling}><Wand2 className="h-4 w-4 mr-1" /> {filling ? 'Backfilling…' : 'Backfill into Lark'}</Button>
            </div>
          </div>

          <Card>
            <CardContent className="p-0">
              <div className="overflow-x-auto max-h-[70vh]">
                <table className="w-full text-xs">
                  <thead className="bg-muted/50 sticky top-0">
                    <tr className="border-b">
                      <th className="px-3 py-2 text-left font-medium text-muted-foreground">Name</th>
                      <th className="px-3 py-2 text-left font-medium text-muted-foreground">Phone</th>
                      <th className="px-3 py-2 text-left font-medium text-muted-foreground">Stated reason</th>
                      <th className="px-3 py-2 text-left font-medium text-muted-foreground">Blank order date</th>
                      <th className="px-3 py-2 text-left font-medium text-muted-foreground">Channel</th>
                      <th className="px-3 py-2 text-center font-medium text-muted-foreground">N/R</th>
                      <th className="px-3 py-2 text-right font-medium text-muted-foreground">Price</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.rows.map((r, i) => (
                      <tr key={i} className="border-b hover:bg-muted/30">
                        <td className="px-3 py-1.5">{r.name}</td>
                        <td className="px-3 py-1.5 font-mono text-muted-foreground">{r.phone}</td>
                        <td className="px-3 py-1.5 font-medium text-emerald-600">{r.reason}</td>
                        <td className="px-3 py-1.5">{r.date}</td>
                        <td className="px-3 py-1.5 text-muted-foreground">{r.channel}</td>
                        <td className="px-3 py-1.5 text-center">{r.nr}</td>
                        <td className="px-3 py-1.5 text-right">RM {r.price.toLocaleString()}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  )
}
