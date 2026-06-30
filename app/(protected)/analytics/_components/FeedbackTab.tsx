'use client'

import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Card, CardContent } from '@/components/ui/card'
import { ThumbsUp, ThumbsDown, MessageSquare } from 'lucide-react'
import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer } from 'recharts'
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

// Topic keyword buckets — what reviews are mostly talking about.
const TOPICS: { label: string; kws: string[] }[] = [
  { label: '效果/改善', kws: ['改善', '变好', '好转', '有效', '效果', '见效', '有帮助', '帮助'] },
  { label: '睡眠', kws: ['睡眠', '睡', '失眠'] },
  { label: '皮肤/肤质', kws: ['皮肤', '肤质', '脸', '气色'] },
  { label: '痒/敏感', kws: ['痒', '敏感'] },
  { label: '提亮/美白', kws: ['提亮', '变亮', '亮了', '美白', '白了', '透亮'] },
  { label: '痘痘/暗疮', kws: ['痘', '青春豆', '暗疮', '粉刺'] },
  { label: '斑/色斑', kws: ['色斑', '斑'] },
  { label: '味道/口感', kws: ['味道', '口感', '好喝', '难喝'] },
  { label: '伤口', kws: ['伤口', '开刀', '糖尿'] },
  { label: '肠胃/排便', kws: ['排便', '便秘', '宿便', '肠', '胃'] },
  { label: '没效果/慢', kws: ['没效果', '没有效果', '没用', '没变化', '看不到', '没改善', '没什么'] },
  { label: '价钱', kws: ['贵', '价钱', '价格'] },
]

function topTopics(items: { comment: string }[], n = 5) {
  return TOPICS
    .map(t => ({ label: t.label, count: items.filter(it => t.kws.some(k => (it.comment ?? '').includes(k))).length }))
    .filter(x => x.count > 0)
    .sort((a, b) => b.count - a.count)
    .slice(0, n)
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

  // Good vs Bad chart for the current brand selection (excludes 字眼 keywords)
  const totalGB = good.length + bad.length
  const goodPct = totalGB ? Math.round((good.length / totalGB) * 100) : 0
  const badPct = totalGB ? 100 - goodPct : 0
  const chartData = [
    { name: 'Good Review', value: good.length, color: '#22c55e' },
    { name: 'Bad Review', value: bad.length, color: '#ef4444' },
  ]
  const goodTopics = topTopics(good)
  const badTopics = topTopics(bad)

  return (
    <div className="space-y-4">
      {totalGB > 0 && (
        <Card>
          <CardContent className="p-4">
            <h3 className="text-sm font-semibold mb-1">
              Good vs Bad — {selectedBrand || 'All Brands'}
            </h3>
            <p className="text-xs text-muted-foreground mb-2">{totalGB} reviews (excludes 字眼 keywords)</p>
            <div className="flex items-center gap-6 flex-wrap">
              <ResponsiveContainer width={200} height={190}>
                <PieChart>
                  <Pie
                    data={chartData}
                    dataKey="value"
                    nameKey="name"
                    cx="50%"
                    cy="50%"
                    innerRadius={48}
                    outerRadius={82}
                    label={({ value }) => `${totalGB ? Math.round((value / totalGB) * 100) : 0}%`}
                    labelLine={false}
                  >
                    {chartData.map((d, i) => <Cell key={i} fill={d.color} />)}
                  </Pie>
                  <Tooltip formatter={(v: number) => [`${v} reviews`, '']} />
                </PieChart>
              </ResponsiveContainer>
              <div className="space-y-2 text-sm">
                <div className="flex items-center gap-2">
                  <span className="h-3 w-3 rounded-full bg-green-500 inline-block shrink-0" />
                  Good Review: <span className="font-semibold text-green-600">{goodPct}%</span>
                  <span className="text-muted-foreground">({good.length})</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="h-3 w-3 rounded-full bg-red-500 inline-block shrink-0" />
                  Bad Review: <span className="font-semibold text-red-600">{badPct}%</span>
                  <span className="text-muted-foreground">({bad.length})</span>
                </div>
              </div>

              {/* What reviews are mostly about */}
              <div className="flex gap-8 flex-1 min-w-[300px]">
                <div className="flex-1">
                  <p className="text-xs font-semibold text-green-700 mb-1.5">好评大部分在讲</p>
                  {goodTopics.length === 0 ? (
                    <p className="text-xs text-muted-foreground">—</p>
                  ) : goodTopics.map(t => (
                    <div key={t.label} className="flex items-center justify-between gap-2 text-xs py-0.5">
                      <span className="truncate">{t.label}</span>
                      <span className="font-medium text-green-700 shrink-0">{good.length ? Math.round((t.count / good.length) * 100) : 0}% ({t.count})</span>
                    </div>
                  ))}
                </div>
                <div className="flex-1">
                  <p className="text-xs font-semibold text-red-700 mb-1.5">差评大部分在讲</p>
                  {badTopics.length === 0 ? (
                    <p className="text-xs text-muted-foreground">—</p>
                  ) : badTopics.map(t => (
                    <div key={t.label} className="flex items-center justify-between gap-2 text-xs py-0.5">
                      <span className="truncate">{t.label}</span>
                      <span className="font-medium text-red-700 shrink-0">{bad.length ? Math.round((t.count / bad.length) * 100) : 0}% ({t.count})</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
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
