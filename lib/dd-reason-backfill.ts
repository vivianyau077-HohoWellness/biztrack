import { fetchLarkRecordsSearch, larkFetch } from './lark'
import { fstr } from './ne-data'

// Backfill DD blank Purchase reason using the SAME selection as the Reason Gaps page:
// a customer's first purchase (2025 or 2026) stated a reason; fill that reason onto their
// later 2026 orders that have no reason. Never overwrites an existing reason.
const APP = 'S8XXb8PT2a82ouslzQWjBaYap2g'
const T_2026 = 'tblpMwKyxbddnXNG'
const T_2025 = 'tblEy6fdbsuXhS6L'
const F = ['Date', 'Phone Number', 'Channel', 'Purchase reason']

function dateMs(v: unknown): number {
  if (typeof v === 'number') return v
  if (Array.isArray(v) && typeof v[0] === 'number') return v[0] as number
  const o = v as { value?: unknown }
  if (o && Array.isArray(o.value) && typeof o.value[0] === 'number') return o.value[0] as number
  if (o && typeof o.value === 'number') return o.value
  const s = fstr(v); const t = Date.parse(s); return isNaN(t) ? 0 : t
}
const yearOf = (ms: number) => ms ? new Date(ms + 28800000).getUTCFullYear() : 0
// Purchase reason is a multi-select → read the raw option names as an array (not joined).
function rawOptions(v: unknown): string[] {
  if (v == null) return []
  if (Array.isArray(v)) return v.map(x => (typeof x === 'string' ? x : ((x as { text?: string; name?: string })?.text ?? (x as { name?: string })?.name ?? ''))).map(s => s.trim()).filter(Boolean)
  const o = v as { value?: unknown }
  if (Array.isArray(o.value)) return rawOptions(o.value)
  const s = fstr(v); return s ? [s] : []
}

type Ord = { table: string; recordId: string; ms: number; phone: string; opts: string[] }
type Op = { table: string; recordId: string; opts: string[] }

async function buildOps(): Promise<Op[]> {
  const [a, b] = await Promise.all([
    fetchLarkRecordsSearch(T_2026, APP, F),
    fetchLarkRecordsSearch(T_2025, APP, F),
  ])
  const byPhone = new Map<string, Ord[]>()
  const eat = (recs: { record_id: string; fields: Record<string, unknown> }[], table: string) => {
    for (const rec of recs) {
      const f = rec.fields
      const phone = fstr(f['Phone Number']); if (!phone) continue
      if (fstr(f['Channel']) === 'Return') continue
      const o: Ord = { table, recordId: rec.record_id, ms: dateMs(f['Date']), phone, opts: rawOptions(f['Purchase reason']) }
      let arr = byPhone.get(phone); if (!arr) { arr = []; byPhone.set(phone, arr) }
      arr.push(o)
    }
  }
  eat(a as { record_id: string; fields: Record<string, unknown> }[], T_2026)
  eat(b as { record_id: string; fields: Record<string, unknown> }[], T_2025)

  const ops: Op[] = []
  for (const arr of Array.from(byPhone.values())) {
    arr.sort((x, y) => x.ms - y.ms)
    const first = arr[0]
    if (!first || first.opts.length === 0) continue
    for (const o of arr) {
      if (o.opts.length === 0 && o.ms > first.ms && yearOf(o.ms) === 2026 && o.recordId) {
        ops.push({ table: o.table, recordId: o.recordId, opts: first.opts })
      }
    }
  }
  return ops
}

export async function previewDdReasonBackfill(): Promise<{ count: number }> {
  return { count: (await buildOps()).length }
}

export async function runDdReasonBackfill(): Promise<{ updated: number; failed: number }> {
  const ops = await buildOps()
  let updated = 0, failed = 0
  // batch_update per table, 400 records per call
  const byTable = new Map<string, Op[]>()
  for (const op of ops) { let a = byTable.get(op.table); if (!a) { a = []; byTable.set(op.table, a) } a.push(op) }
  for (const [table, list] of Array.from(byTable.entries())) {
    for (let i = 0; i < list.length; i += 400) {
      const chunk = list.slice(i, i + 400)
      const body = { records: chunk.map(op => ({ record_id: op.recordId, fields: { 'Purchase reason': op.opts } })) }
      const res = await larkFetch(`/bitable/v1/apps/${APP}/tables/${table}/records/batch_update`, { method: 'POST', body: JSON.stringify(body) })
      if (res.code === 0) updated += chunk.length
      else { failed += chunk.length; console.error('[dd-reason-backfill] batch error', res.code, res.msg) }
    }
  }
  return { updated, failed }
}
