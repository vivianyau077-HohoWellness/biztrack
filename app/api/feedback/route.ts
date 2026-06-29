import { NextResponse } from 'next/server'
import { fetchLarkRecords } from '@/lib/lark'

// Feedback base (wiki-wrapped). Two tables: good reviews + bad reviews.
export const maxDuration = 60
export const dynamic = 'force-dynamic'

const BASE = 'M4GwbezLYahYIjsoYMCjaQO8pMb'
const GOOD_TABLE = 'tbl941bieDXtc4c3' // 👍 01 字眼 好评
const BAD_TABLE = 'tblbUh9xdzaAO8Mq' // 👎 02 产品效果 问题

function toStr(v: unknown): string {
  if (v == null) return ''
  if (typeof v === 'string') return v.trim()
  if (typeof v === 'number') return String(v)
  if (Array.isArray(v)) {
    return v
      .map(i => (typeof i === 'string' ? i : ((i as { text?: string; name?: string })?.text ?? (i as { name?: string })?.name ?? '')))
      .filter(Boolean)
      .join(', ')
      .trim()
  }
  if (typeof v === 'object') {
    const o = v as { text?: string; name?: string; value?: unknown }
    if (o.text) return String(o.text).trim()
    if (o.name) return String(o.name).trim()
    if (Array.isArray(o.value)) return o.value.map(x => (typeof x === 'string' ? x : ((x as { text?: string })?.text ?? ''))).join(', ').trim()
  }
  return ''
}

// Extract attachment file tokens (for the image proxy).
function attachments(v: unknown): { token: string; name: string }[] {
  if (!Array.isArray(v)) return []
  return v
    .map(a => {
      const o = a as { file_token?: string; name?: string }
      return { token: o.file_token ?? '', name: o.name ?? '' }
    })
    .filter(x => x.token)
}

export async function GET() {
  try {
    const [goodRecs, badRecs] = await Promise.all([
      fetchLarkRecords(GOOD_TABLE, BASE),
      fetchLarkRecords(BAD_TABLE, BASE),
    ])

    const good = goodRecs
      .map(r => {
        const f = r.fields as Record<string, unknown>
        return {
          brand: toStr(f['产品']),
          comment: toStr(f['Customer Feedback']),
          date: typeof f['Date'] === 'number' ? (f['Date'] as number) : null,
          who: toStr(f['Who']),
          duration: toStr(f['吃了多久']),
          tags: toStr(f['字眼/好评']),
          contact: toStr(f['顾客联系资料']),
          attachments: attachments(f['Attachment']),
        }
      })
      // Only genuine good reviews (好评), exclude the 字眼 (keyword) category
      .filter(x => x.tags.includes('好评') && (x.comment || x.brand))

    const bad = badRecs
      .map(r => {
        const f = r.fields as Record<string, unknown>
        return {
          brand: toStr(f['产品']),
          comment: toStr(f['顾客写的']),
          date: typeof f['Date'] === 'number' ? (f['Date'] as number) : null,
          who: toStr(f['Who']),
          duration: toStr(f['喝了多久']),
          issue: toStr(f['问题']),
          contact: toStr(f['顾客联系资料']),
          attachments: attachments(f['Attachment']),
        }
      })
      .filter(x => x.comment || x.brand)

    good.sort((a, b) => (b.date ?? 0) - (a.date ?? 0))
    bad.sort((a, b) => (b.date ?? 0) - (a.date ?? 0))

    return NextResponse.json({ good, bad })
  } catch (e) {
    console.error('[feedback] error:', e)
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Failed to load feedback' }, { status: 500 })
  }
}
