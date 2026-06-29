'use client'

import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Card, CardContent } from '@/components/ui/card'
import { ThumbsUp, ThumbsDown, MessageSquare } from 'lucide-react'
import { cn } from '@/lib/utils'

interface Props {
  selectedBrand?: string
}

type Attachment = { token: string; name: string }
type GoodItem = { brand: string; comment: string; date: number | null; who: string; duration: string; tags: string; contact: string; attachments: Attachment[] }
type BadItem = { brand: string; comment: string; date: number | null; who: string; duration: string; issue: string; contact: string; attachments: Attachment[] }

function fmtDate(ms: number | null): string {
  if (!ms) return '—'
  return new Date(ms).toLocaleDateString('en-MY', { day: '2-digit', month: 'short', year: 'numeric' })
}

export default function FeedbackTab({ selectedBrand }: Props) {
  const [view, setView] = useState<'good' | 'bad' | 'keyword'>('good')

  const { data, isLoading, error } = useQuery({
    queryKey: ['feedback'],
    queryFn: async () => {
      const res = await fetch('/api/feedback')
      if (!res.ok) throw new Error('Failed to load feedback')
      return res.json() as Promise<{ good: GoodItem[]; bad: BadItem[]; keyword: GoodItem[] }>
    },
  })

  const matchBrand = (b: string) =>
    !selectedBrand || (b ?? '').toLowerCase() === selectedBrand.toLowerCase()

  const good = (data?.good ?? []).filter(x => matchBrand(x.brand))
  const bad = (data?.bad ?? []).filter(x => matchBrand(x.brand))
  const keyword = (data?.keyword ?? []).filter(x => matchBrand(x.brand))
  const list: (GoodItem | BadItem)[] = view === 'good' ? good : view === 'bad' ? bad : keyword

  // Per-brand good vs bad % (across all brands; excludes 字眼 keywords)
  const summary = (() => {
    const m = new Map<string, { good: number; bad: number }>()
    for (const x of data?.good ?? []) { const b = x.brand || '—'; const e = m.get(b) ?? { good: 0, bad: 0 }; e.good++; m.set(b, e) }
    for (const x of data?.bad ?? []) { const b = x.brand || '—'; const e = m.get(b) ?? { good: 0, bad: 0 }; e.bad++; m.set(b, e) }
    return Array.from(m.entries())
      .map(([brand, v]) => {
        const total = v.good + v.bad
        return {
          brand,
          good: v.good,
          bad: v.bad,
          goodPct: total ? Math.round((v.good / total) * 1000) / 10 : 0,
          badPct: total ? Math.round((v.bad / total) * 1000) / 10 : 0,
        }
      })
      .sort((a, b) => b.good + b.bad - (a.good + a.bad))
  })()

  return (
    <div className="space-y-4">
      {summary.length > 0 && (
        <Card>
          <CardContent className="p-4">
            <h3 className="text-sm font-semibold mb-3">Good vs Bad Review by Brand</h3>
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b text-muted-foreground">
                    <th className="px-2 py-1.5 text-left font-medium">Brand</th>
                    <th className="px-2 py-1.5 text-right font-medium">Good</th>
                    <th className="px-2 py-1.5 text-right font-medium">Bad</th>
                    <th className="px-2 py-1.5 text-right font-medium">Good %</th>
                    <th className="px-2 py-1.5 text-right font-medium">Bad %</th>
                  </tr>
                </thead>
                <tbody>
                  {summary.map(s => (
                    <tr key={s.brand} className="border-b last:border-0">
                      <td className="px-2 py-1.5 font-medium">{s.brand}</td>
                      <td className="px-2 py-1.5 text-right">{s.good}</td>
                      <td className="px-2 py-1.5 text-right">{s.bad}</td>
                      <td className="px-2 py-1.5 text-right font-semibold text-green-600">{s.goodPct}%</td>
                      <td className="px-2 py-1.5 text-right font-semibold text-red-600">{s.badPct}%</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="text-[11px] text-muted-foreground mt-2">% = each brand&apos;s share of good vs bad reviews (excludes 字眼 keywords).</p>
          </CardContent>
        </Card>
      )}

      {/* Good / Bad toggle */}
      <div className="flex gap-2">
        <button
          onClick={() => setView('good')}
          className={cn(
            'flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium border transition-colors',
            view === 'good' ? 'bg-green-600 text-white border-green-600' : 'border-border hover:bg-muted',
          )}
        >
          <ThumbsUp className="h-4 w-4" />
          Good Review ({good.length})
        </button>
        <button
          onClick={() => setView('bad')}
          className={cn(
            'flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium border transition-colors',
            view === 'bad' ? 'bg-red-600 text-white border-red-600' : 'border-border hover:bg-muted',
          )}
        >
          <ThumbsDown className="h-4 w-4" />
          Bad Review ({bad.length})
        </button>
        <button
          onClick={() => setView('keyword')}
          className={cn(
            'flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium border transition-colors',
            view === 'keyword' ? 'bg-amber-500 text-white border-amber-500' : 'border-border hover:bg-muted',
          )}
        >
          <MessageSquare className="h-4 w-4" />
          字眼 Keywords ({keyword.length})
        </button>
      </div>

      {error ? (
        <p className="text-sm text-red-600">Failed to load feedback.</p>
      ) : isLoading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {[...Array(4)].map((_, i) => (
            <Card key={i}><CardContent className="p-4"><div className="h-16 bg-muted/50 rounded animate-pulse" /></CardContent></Card>
          ))}
        </div>
      ) : list.length === 0 ? (
        <div className="rounded-lg border border-dashed p-12 text-center text-sm text-muted-foreground">
          No {view === 'good' ? 'good reviews' : view === 'bad' ? 'bad reviews' : 'keywords'}{selectedBrand ? ` for ${selectedBrand}` : ''}.
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {list.map((item, i) => (
            <Card key={i} className={view === 'good' ? 'border-green-200' : 'border-red-200'}>
              <CardContent className="p-4 space-y-2">
                <div className="flex items-center justify-between gap-2">
                  <span className="inline-flex items-center rounded px-2 py-0.5 text-xs font-semibold bg-primary/10 text-primary">
                    {item.brand || '—'}
                  </span>
                  <span className="text-xs text-muted-foreground shrink-0">{fmtDate(item.date)}</span>
                </div>
                <p className="text-sm text-foreground whitespace-pre-wrap">{item.comment || '—'}</p>
                {item.contact && view !== 'keyword' && (
                  <p className="text-xs text-muted-foreground">📞 {item.contact}</p>
                )}
                <div className="flex flex-wrap gap-3 text-xs text-muted-foreground pt-1">
                  {view === 'bad' && (item as BadItem).issue && (
                    <span className="text-red-600 font-medium">⚠ {(item as BadItem).issue}</span>
                  )}
                  {item.duration && <span>⏱ {item.duration}</span>}
                  {item.who && <span>CS: {item.who}</span>}
                </div>
                {item.attachments && item.attachments.length > 0 && (
                  <div className="flex flex-wrap gap-2 pt-1">
                    {item.attachments.map((a, j) => (
                      <a key={j} href={`/api/feedback/media?token=${encodeURIComponent(a.token)}`} target="_blank" rel="noreferrer">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img
                          src={`/api/feedback/media?token=${encodeURIComponent(a.token)}`}
                          alt={a.name}
                          className="h-16 w-16 object-cover rounded border"
                          loading="lazy"
                        />
                      </a>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  )
}
