import { NextResponse } from 'next/server'
import { fetchLarkRecords } from '@/lib/lark'
import { createAdminClient } from '@/lib/supabase/admin'

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

function attachments(v: unknown): { token: string; name: string }[] {
  if (!Array.isArray(v)) return []
  return v
    .map(a => {
      const o = a as { file_token?: string; name?: string }
      return { token: o.file_token ?? '', name: o.name ?? '' }
    })
    .filter(x => x.token)
}

// Normalize a Malaysian/Singapore phone to 60.../65... form.
function normPh(raw: string): string {
  const d = (raw ?? '').toString().replace(/\D/g, '')
  if (!d) return ''
  if (d.startsWith('60') || d.startsWith('65')) return d
  if (d.startsWith('0')) return '6' + d
  return d
}

// Pull the most likely phone number out of a free-text contact field.
function extractPhone(contact: string): string {
  const runs = (contact ?? '').match(/\d[\d\s\-]{6,}\d/g)
  if (!runs) return ''
  let best = ''
  for (const r of runs) { const d = r.replace(/\D/g, ''); if (d.length >= 8 && d.length > best.length) best = d }
  return normPh(best)
}

export async function GET() {
  try {
    const [goodRecs, badRecs] = await Promise.all([
      fetchLarkRecords(GOOD_TABLE, BASE),
      fetchLarkRecords(BAD_TABLE, BASE),
    ])

    const allGood = goodRecs.map(r => {
      const f = r.fields as Record<string, unknown>
      const contact = toStr(f['顾客联系资料'])
      return {
        brand: toStr(f['产品']),
        comment: toStr(f['Customer Feedback']),
        date: typeof f['Date'] === 'number' ? (f['Date'] as number) : null,
        who: toStr(f['Who']),
        duration: toStr(f['吃了多久']),
        tags: toStr(f['字眼/好评']),
        contact,
        phone: extractPhone(contact),
        packages: '',
        attachments: attachments(f['Attachment']),
      }
    })
    const good = allGood.filter(x => x.tags.includes('好评') && (x.comment || x.brand))
    const keyword = allGood.filter(x => x.tags.includes('字眼') && (x.comment || x.brand))

    const bad = badRecs
      .map(r => {
        const f = r.fields as Record<string, unknown>
        const contact = toStr(f['顾客联系资料'])
        return {
          brand: toStr(f['产品']),
          comment: toStr(f['顾客写的']),
          date: typeof f['Date'] === 'number' ? (f['Date'] as number) : null,
          who: toStr(f['Who']),
          duration: toStr(f['喝了多久']),
          issue: toStr(f['问题']),
          contact,
          phone: extractPhone(contact),
          packages: '',
          attachments: attachments(f['Attachment']),
        }
      })
      .filter(x => x.comment || x.brand)

    // Enrich each review with packages that phone has ordered (from Supabase orders).
    const all = [...good, ...keyword, ...bad]
    const variants = new Set<string>()
    for (const it of all) {
      if (!it.phone) continue
      variants.add(it.phone)
      if (it.phone.startsWith('60') || it.phone.startsWith('65')) variants.add('0' + it.phone.slice(2))
    }
    if (variants.size) {
      const sb = createAdminClient()
      const pkgMap = new Map<string, Set<string>>()
      const list = Array.from(variants)
      for (let i = 0; i < list.length; i += 300) {
        const batch = list.slice(i, i + 300)
        const { data } = await sb.from('orders').select('phone, package_name').in('phone', batch)
        for (const r of (data ?? []) as { phone: string | null; package_name: string | null }[]) {
          const k = normPh((r.phone ?? '').toString())
          if (!k || !r.package_name) continue
          if (!pkgMap.has(k)) pkgMap.set(k, new Set())
          pkgMap.get(k)!.add(r.package_name)
        }
      }
      for (const it of all) {
        const s = it.phone ? pkgMap.get(it.phone) : undefined
        it.packages = s ? Array.from(s).slice(0, 5).join(', ') : ''
      }
    }

    good.sort((a, b) => (b.date ?? 0) - (a.date ?? 0))
    bad.sort((a, b) => (b.date ?? 0) - (a.date ?? 0))
    keyword.sort((a, b) => (b.date ?? 0) - (a.date ?? 0))

    return NextResponse.json({ good, bad, keyword })
  } catch (e) {
    console.error('[feedback] error:', e)
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Failed to load feedback' }, { status: 500 })
  }
}
