'use client'

import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Card, CardContent } from '@/components/ui/card'
import { ThumbsUp, ThumbsDown, MessageSquare, X, Package } from 'lucide-react'
import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer } from 'recharts'
import { cn } from '@/lib/utils'

interface Props {
  selectedBrand?: string
  dateFrom?: string
  dateTo?: string
}

type Attachment = { token: string; name: string }
type GoodItem = { brand: string; comment: string; date: number | null; who: string; duration: string; tags: string; contact: string; phone?: string; packages?: string; attachments: Attachment[] }
type BadItem = { brand: string; comment: string; date: number | null; who: string; duration: string; issue: string; contact: string; phone?: string; packages?: string; attachments: Attachment[] }

function fmtDate(ms: number | null): string {
  if (!ms) return '—'
  return new Date(ms).toLocaleDateString('en-MY', { day: '2-digit', month: 'short', year: 'numeric' })
}

// Topic keyword buckets — grouped into meaningful skin/health categories.
// In good reviews these read as "improved in ___"; in bad reviews as "still ___".
const TOPICS: { label: string; kws: string[] }[] = [
  { label: '皮肤屏障 (癣/富贵手/湿疹)', kws: ['牛皮癣', '银屑', '干癣', '富贵手', '湿疹', '荨麻疹', '皮肤病', '红斑', '狼疮', '鸡皮', '脱皮', '龟裂', '毛囊', '癣'] },
  { label: '痒/敏感/过敏', kws: ['痒', '敏感', '过敏'] },
  { label: '斑/色斑', kws: ['色斑', '黑斑', '雀斑', '黑点', '斑'] },
  { label: '眼袋/黑眼圈', kws: ['眼袋', '黑眼圈'] },
  { label: '提亮/美白/肤质', kws: ['提亮', '变亮', '亮了', '美白', '白了', '透亮', '光滑', '滑嫩', '气色', '细致', '皮肤好'] },
  { label: '痘痘/暗疮', kws: ['痘', '青春豆', '暗疮', '粉刺'] },
  { label: '睡眠/精神', kws: ['睡', '失眠', '精神'] },
  { label: '伤口/开刀/糖尿', kws: ['伤口', '开刀', '疤', '糖尿'] },
  { label: '肠胃/排便', kws: ['排便', '便秘', '宿便', '肠', '胃胀', '胃'] },
  { label: '味道/口感', kws: ['味道', '好喝', '难喝', '口感', '太甜', '很甜'] },
  { label: '没效果/太慢', kws: ['没效', '没有效果', '没用', '没变化', '没改善', '没什么', '一样', '更严重', '没感觉', '没看到'] },
  { label: '品质/疑似假货', kws: ['变薄', '很水', '很稀', '很假', '品质', '浓缩', '没泡沫'] },
  { label: '副作用/不适', kws: ['肿', '血糖', '头痛', '关节', '口干', '累'] },
  { label: '包装/送货', kws: ['包装', '破损', '送货', '邮寄', '破裂'] },
  { label: '价钱', kws: ['贵', '价钱', '价格'] },
]

function topTopics(items: { comment: string }[], n = 8) {
  const total = items.length
  return TOPICS
    .map(t => {
      const count = items.filter(it => t.kws.some(k => (it.comment ?? '').includes(k))).length
      return { label: t.label, count, pct: total ? Math.round((count / total) * 100) : 0 }
    })
    .filter(x => x.count > 0)
    .sort((a, b) => b.count - a.count)
    .slice(0, n)
}

function matchTopic(comment: string, label: string | null): boolean {
  if (!label) return true
  const t = TOPICS.find(x => x.label === label)
  if (!t) return true
  return t.kws.some(k => (comment ?? '').includes(k))
}

export default function FeedbackTab({ selectedBrand, dateFrom, dateTo }: Props) {
  const [view, setView] = useState<'good' | 'bad' | 'keyword'>('good')
  const [topicFilter, setTopicFilter] = useState<string | null>(null)

  const { data, isLoading, error } = useQuery({
    queryKey: ['feedback'],
    queryFn: async () => {
      const res = await fetch('/api/feedback')
      if (!res.ok) {
        let msg = `Failed to load feedback (HTTP ${res.status})`
        try { const j = await res.json(); if (j?.error) msg = j.error } catch { /* ignore */ }
        throw new Error(msg)
      }
      return res.json() as Promise<{ good: GoodItem[]; bad: BadItem[]; keyword: GoodItem[] }>
    },
    retry: 1,
  })

  const matchBrand = (b: string) =>
    !selectedBrand || (b ?? '').toLowerCase() === selectedBrand.toLowerCase()

  // Date-range filter (follows the date picker). Reviews with no date are kept.
  const fromMs = dateFrom ? new Date(dateFrom + 'T00:00:00').getTime() : null
  const toMs = dateTo ? new Date(dateTo + 'T23:59:59').getTime() : null
  const inRange = (d: number | null) => {
    if (d == null) return true
    if (fromMs != null && d < fromMs) return false
    if (toMs != null && d > toMs) return false
    return true
  }
  const baseFilter = (x: { brand: string; date: number | null }) => matchBrand(x.brand) && inRange(x.date)

  const good = (data?.good ?? []).filter(baseFilter)
  const bad = (data?.bad ?? []).filter(baseFilter)
  const keyword = (data?.keyword ?? []).filter(baseFilter)
  const listAll: (GoodItem | BadItem)[] = view === 'good' ? good : view === 'bad' ? bad : keyword
  const list = listAll.filter(x => matchTopic(x.comment, topicFilter))

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
                  <p className="text-xs font-semibold text-green-700 mb-1.5">好评 · 哪方面有好转 (点击筛选)</p>
                  {goodTopics.length === 0 ? (
                    <p className="text-xs text-muted-foreground">—</p>
                  ) : goodTopics.map(t => {
                    const active = view === 'good' && topicFilter === t.label
                    return (
                      <button
                        key={t.label}
                        onClick={() => { setView('good'); setTopicFilter(active ? null : t.label) }}
                        className={cn('w-full flex items-center justify-between gap-2 text-xs py-0.5 px-1 rounded transition-colors', active ? 'bg-green-100' : 'hover:bg-muted')}
                      >
                        <span className="truncate text-left" title={t.label}>{t.label}</span>
                        <span className="font-medium text-green-700 shrink-0">{t.pct}% ({t.count})</span>
                      </button>
                    )
                  })}
                </div>
                <div className="flex-1">
                  <p className="text-xs font-semibold text-red-700 mb-1.5">差评 · 哪方面没好转/投诉 (点击筛选)</p>
                  {badTopics.length === 0 ? (
                    <p className="text-xs text-muted-foreground">—</p>
                  ) : badTopics.map(t => {
                    const active = view === 'bad' && topicFilter === t.label
                    return (
                      <button
                        key={t.label}
                        onClick={() => { setView('bad'); setTopicFilter(active ? null : t.label) }}
                        className={cn('w-full flex items-center justify-between gap-2 text-xs py-0.5 px-1 rounded transition-colors', active ? 'bg-red-100' : 'hover:bg-muted')}
                      >
                        <span className="truncate text-left" title={t.label}>{t.label}</span>
                        <span className="font-medium text-red-700 shrink-0">{t.pct}% ({t.count})</span>
                      </button>
                    )
                  })}
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Good / Bad toggle */}
      <div className="flex gap-2">
        <button
          onClick={() => { setView('good'); setTopicFilter(null) }}
          className={cn(
            'flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium border transition-colors',
            view === 'good' ? 'bg-green-600 text-white border-green-600' : 'border-border hover:bg-muted',
          )}
        >
          <ThumbsUp className="h-4 w-4" />
          Good Review ({good.length})
        </button>
        <button
          onClick={() => { setView('bad'); setTopicFilter(null) }}
          className={cn(
            'flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium border transition-colors',
            view === 'bad' ? 'bg-red-600 text-white border-red-600' : 'border-border hover:bg-muted',
          )}
        >
          <ThumbsDown className="h-4 w-4" />
          Bad Review ({bad.length})
        </button>
        <button
          onClick={() => { setView('keyword'); setTopicFilter(null) }}
          className={cn(
            'flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium border transition-colors',
            view === 'keyword' ? 'bg-amber-500 text-white border-amber-500' : 'border-border hover:bg-muted',
          )}
        >
          <MessageSquare className="h-4 w-4" />
          字眼 Keywords ({keyword.length})
        </button>
      </div>

      {topicFilter && (
        <div className="flex items-center gap-2 text-sm">
          <span className="text-muted-foreground">筛选主题:</span>
          <span className="inline-flex items-center gap-1.5 rounded-full bg-primary/10 text-primary px-3 py-1 text-xs font-medium">
            {topicFilter}
            <button onClick={() => setTopicFilter(null)} className="hover:text-foreground"><X className="h-3 w-3" /></button>
          </span>
          <span className="text-xs text-muted-foreground">{list.length} 条</span>
        </div>
      )}

      {error ? (
        <p className="text-sm text-red-600">Failed to load feedback: {(error as Error)?.message || 'unknown error'}. Try Sync / refresh — if it persists the Lark feedback fetch timed out.</p>
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
                {item.packages && (
                  <p className="text-xs text-muted-foreground flex items-start gap-1">
                    <Package className="h-3.5 w-3.5 shrink-0 mt-0.5 text-primary" />
                    <span>买过配套: {item.packages}</span>
                  </p>
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
