'use client'

import { useState } from 'react'
import { Card, CardContent } from '@/components/ui/card'
import { DD_FEEDBACK } from '@/lib/dd-feedback-data'
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

// Topic keyword buckets — PER BRAND, since each product targets a different concern.
// In good reviews these read as "improved in ___"; in bad reviews as "still ___".
type Topic = { label: string; kws: string[] }

const COMMON_TOPICS: Topic[] = [
  { label: '味道/口感', kws: ['味道', '好喝', '难喝', '口感', '太甜', '很甜', '难吃'] },
  { label: '没效果/太慢', kws: ['没效', '没有效果', '没用', '没变化', '没改善', '没什么', '一样', '更严重', '没感觉', '没看到', '没进展', '没帮助'] },
  { label: '品质/疑似假货', kws: ['变薄', '很水', '很稀', '很假', '品质', '浓缩', '没泡沫'] },
  { label: '副作用/不适', kws: ['血糖', '头痛', '头晕', '口干', '过敏'] },
  { label: '包装/送货', kws: ['包装', '破损', '送货', '邮寄', '破裂', '收到'] },
  { label: '价钱', kws: ['贵', '价钱', '价格'] },
]

const BRAND_TOPICS: Record<string, Topic[]> = {
  DD: [
    { label: '皮肤屏障 (癣/富贵手/湿疹)', kws: ['牛皮癣', '银屑', '干癣', '富贵手', '湿疹', '荨麻疹', '皮肤病', '红斑', '狼疮', '鸡皮', '脱皮', '龟裂', '毛囊', '癣'] },
    { label: '痒/敏感', kws: ['痒', '敏感'] },
    { label: '斑/色斑', kws: ['色斑', '黑斑', '雀斑', '黑点', '斑'] },
    { label: '眼袋/黑眼圈', kws: ['眼袋', '黑眼圈'] },
    { label: '提亮/美白/肤质', kws: ['提亮', '变亮', '亮了', '美白', '白了', '透亮', '光滑', '滑嫩', '气色', '细致', '皮肤好', '皮肤变好'] },
    { label: '痘痘/暗疮', kws: ['痘', '青春豆', '暗疮', '粉刺'] },
    { label: '睡眠/精神', kws: ['睡', '失眠', '精神'] },
    { label: '伤口/开刀/糖尿', kws: ['伤口', '开刀', '疤', '糖尿'] },
    { label: '肠胃/排便', kws: ['排便', '便秘', '宿便', '胃胀'] },
  ],
  NE: [
    { label: '眼睛干涩/疲劳', kws: ['眼睛干', '眼干', '干涩', '没那么干', '不干了', '眼睛累', '疲劳', '眼睛酸', '怕光', '眼睛舒服'] },
    { label: '飞蚊症', kws: ['飞蚊', '蚊症', '蚊子', '蚯蚓'] },
    { label: '看清楚/视力', kws: ['看清', '清楚', '清亮', '模糊', '矇', '朦', '重影', '双影', 'double vision', 'night vision', '明亮', '看东西', '看得'] },
    { label: '黄斑/视网膜', kws: ['黄斑', '视网膜', '眼底'] },
    { label: '白内障/手术', kws: ['白内障', 'cataract', '手术', '镭射', '眼角膜', '移植'] },
    { label: '老花/度数', kws: ['老花', '度数', '眼镜'] },
    { label: '眼压/青光眼', kws: ['眼压', '青光眼'] },
    { label: '眼睛出血/血丝', kws: ['血丝', '眼睛红', '眼睛有血', '流血', '血管爆', '出血'] },
  ],
  JUJI: [
    { label: '月经/经期', kws: ['月经', '经期', '例假', '来经', 'period', '鲜红', '褐色', '来了'] },
    { label: '痛经', kws: ['痛经', '经痛', '经期痛', '下腹', '腰酸', '不能起来'] },
    { label: '经血量/血块', kws: ['经血', '血块', '量多', '量少', '经量', '黑色'] },
    { label: '调理/规律', kws: ['调理', '失调', '规律', '准来', '很准', '不规律', '乱'] },
    { label: '备孕/怀孕', kws: ['怀孕', '排卵', '备孕', 'pregnant', '受孕'] },
    { label: '更年期/荷尔蒙', kws: ['更年期', '荷尔蒙', 'FSH', '卵巢', '收经'] },
    { label: '子宫问题', kws: ['子宫', '腺肌', '内膜', '肌瘤'] },
    { label: '贫血/头晕', kws: ['贫血', '头晕', '气色'] },
  ],
  FIOR: [
    { label: '掉发/脱发', kws: ['掉发', '掉头发', '脱发', '掉髮', '脱髮', '头发掉', 'hair fall', 'hairfall', '掉头髮'] },
    { label: '新生发量', kws: ['baby hair', '新头发', '长头发', '长出', '发量', '生了', 'baby'] },
    { label: '秃头/斑秃', kws: ['秃头', '斑秃', 'alopecia', '秃頭', '秃'] },
    { label: '头皮/出油', kws: ['头皮', '出油', '油'] },
    { label: '发质 (幼/细软)', kws: ['很幼', '幼', '细软', '幼细'] },
  ],
  KHH: [
    { label: '关节/膝盖', kws: ['关节', '膝盖', '脚可以弯', '弯'] },
    { label: '风湿', kws: ['风湿'] },
    { label: '神经/麻痹', kws: ['神经', '麻', '痹'] },
    { label: '行动/走路', kws: ['走路', '能走', '站久', '站着', '行动', '起来'] },
    { label: '疼痛/酸痛', kws: ['酸痛', '疼痛', '脚痛', '关节痛'] },
  ],
}

function topicsForBrand(brand?: string): Topic[] {
  const key = (brand ?? '').toUpperCase()
  if (key && BRAND_TOPICS[key]) return [...BRAND_TOPICS[key], ...COMMON_TOPICS]
  // All Brands: combine every brand's buckets (dedup by label) + common.
  const seen = new Set<string>()
  const out: Topic[] = []
  for (const arr of Object.values(BRAND_TOPICS)) for (const t of arr) { if (!seen.has(t.label)) { seen.add(t.label); out.push(t) } }
  return [...out, ...COMMON_TOPICS]
}

function topTopics(items: { comment: string }[], topics: Topic[], n = 8) {
  const total = items.length
  return topics
    .map(t => {
      const count = items.filter(it => t.kws.some(k => (it.comment ?? '').includes(k))).length
      return { label: t.label, count, pct: total ? Math.round((count / total) * 100) : 0 }
    })
    .filter(x => x.count > 0)
    .sort((a, b) => b.count - a.count)
    .slice(0, n)
}

function matchTopic(comment: string, label: string | null, topics: Topic[]): boolean {
  if (!label) return true
  const t = topics.find(x => x.label === label)
  if (!t) return true
  return t.kws.some(k => (comment ?? '').includes(k))
}

export default function FeedbackTab({ selectedBrand, dateFrom, dateTo }: Props) {
  const [view, setView] = useState<'good' | 'bad' | 'keyword'>('good')
  const [topicFilter, setTopicFilter] = useState<string | null>(null)

  // Data now comes from the uploaded feedback export (bundled), not live Lark.
  const parseD = (s: string): number | null => {
    const mm = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(s || '')
    return mm ? new Date(+mm[3], +mm[2] - 1, +mm[1]).getTime() : null
  }
  const toItem = (r: { text: string; date: string; product: string; who: string; duration: string; effect: string }): GoodItem => ({
    brand: r.product, comment: r.text, date: parseD(r.date), who: r.who, duration: r.duration, tags: r.effect, contact: '', attachments: [],
  })
  const data = {
    good: DD_FEEDBACK.filter(r => r.type.includes('好评')).map(toItem),
    bad: [] as BadItem[],
    keyword: DD_FEEDBACK.filter(r => r.type.includes('字眼')).map(toItem),
  }
  const isLoading = false
  const error: Error | null = null

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
  const activeTopics = topicsForBrand(selectedBrand)
  const listAll: (GoodItem | BadItem)[] = view === 'good' ? good : view === 'bad' ? bad : keyword
  const list = listAll.filter(x => matchTopic(x.comment, topicFilter, activeTopics))

  // Good vs Bad chart for the current brand selection (excludes 字眼 keywords)
  const totalGB = good.length + bad.length
  const goodPct = totalGB ? Math.round((good.length / totalGB) * 100) : 0
  const badPct = totalGB ? 100 - goodPct : 0
  const chartData = [
    { name: 'Good Review', value: good.length, color: '#22c55e' },
    { name: 'Bad Review', value: bad.length, color: '#ef4444' },
  ]
  const goodTopics = topTopics(good, activeTopics)
  const badTopics = topTopics(bad, activeTopics)

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
