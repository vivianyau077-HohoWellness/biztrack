const LARK_BASE = 'https://open.larksuite.com/open-apis'

// In-memory token cache
let cachedToken: string | null = null
let tokenExpiry = 0

export async function getTenantAccessToken(): Promise<string> {
  if (cachedToken && Date.now() < tokenExpiry) return cachedToken

  const res = await fetch(`${LARK_BASE}/auth/v3/tenant_access_token/internal`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      // App ID is non-secret; hardcode it so it can never mismatch the secret env var
      // (a wrong/missing LARK_APP_ID was causing 99991663 invalid-token errors).
      app_id:     'cli_aa9f9f568da19e18',
      app_secret: process.env.LARK_APP_SECRET,
    }),
  })
  const data = await res.json()
  if (data.code !== 0) throw new Error(`Lark auth error: ${data.msg}`)

  cachedToken  = data.tenant_access_token
  tokenExpiry  = Date.now() + (data.expire - 60) * 1000
  return cachedToken!
}

export async function larkFetch(path: string, options: RequestInit = {}): Promise<any> {
  const token = await getTenantAccessToken()
  const res = await fetch(`${LARK_BASE}${path}`, {
    ...options,
    headers: {
      Authorization:  `Bearer ${token}`,
      'Content-Type': 'application/json',
      ...(options.headers ?? {}),
    },
  })
  return res.json()
}

export interface LarkRecord {
  record_id: string
  fields: Record<string, unknown>
}

/**
 * Fetch records from a Lark Base table, handling pagination automatically.
 * @param tableId - The table ID to fetch from
 * @param appToken - The base app token (defaults to DD base for backward compatibility)
 * @param modifiedAfter - Unix timestamp in milliseconds; if provided, only fetch records modified after this time
 */
// Short-lived cache + in-flight de-dupe so multiple endpoints reading the same
// big table (order/daily/report) within a request burst only hit Lark once.
// Avoids rate-limits / timeouts when several dashboards load at the same time.
const _recCache = new Map<string, { at: number; data: LarkRecord[] }>()
const _recInflight = new Map<string, Promise<LarkRecord[]>>()
const REC_TTL_MS = 120_000

export async function fetchLarkRecords(
  tableId: string,
  appToken: string = 'S8XXb8PT2a82ouslzQWjBaYap2g',
  modifiedAfter?: number,
  fieldNames?: string[],
): Promise<LarkRecord[]> {
  const cacheable = modifiedAfter == null
  // Include the requested field set in the cache key so a slim read (few fields)
  // and a full read of the same table don't collide.
  const fkey = fieldNames && fieldNames.length ? ':f=' + fieldNames.join(',') : ''
  const cacheKey = appToken + ':' + tableId + fkey
  if (cacheable) {
    const hit = _recCache.get(cacheKey)
    if (hit && Date.now() - hit.at < REC_TTL_MS) return hit.data
    const inflight = _recInflight.get(cacheKey)
    if (inflight) return inflight
  }

  const run = fetchLarkRecordsUncached(tableId, appToken, modifiedAfter, fieldNames)
  if (!cacheable) return run

  _recInflight.set(cacheKey, run)
  try {
    const data = await run
    _recCache.set(cacheKey, { at: Date.now(), data })
    return data
  } finally {
    _recInflight.delete(cacheKey)
  }
}

async function fetchLarkRecordsUncached(
  tableId: string,
  appToken: string,
  modifiedAfter?: number,
  fieldNames?: string[],
): Promise<LarkRecord[]> {
  const all: LarkRecord[] = []
  let pageToken: string | undefined
  // Only request the fields we need — cuts payload ~5x on wide tables, avoiding
  // Vercel function timeouts. If field_names is ever rejected, fall back to a full read.
  let useFields = !!(fieldNames && fieldNames.length)

  for (;;) {
    const params = new URLSearchParams({ page_size: '500' })
    if (pageToken) params.set('page_token', pageToken)
    if (modifiedAfter != null) {
      params.set('filter', `CurrentValue.[ModifyTime]>${modifiedAfter}`)
    }
    if (useFields) params.set('field_names', JSON.stringify(fieldNames))

    const data = await larkFetch(
      `/bitable/v1/apps/${appToken}/tables/${tableId}/records?${params}`,
    )

    if (data.code !== 0) {
      // Field-projection not accepted → restart the whole fetch without it (safe fallback).
      if (useFields) {
        useFields = false
        all.length = 0
        pageToken = undefined
        continue
      }
      throw new Error(`Lark fetchLarkRecords error (${data.code}): ${data.msg}`)
    }

    const items: LarkRecord[] = data.data?.items ?? []
    all.push(...items)

    if (data.data?.has_more) { pageToken = data.data.page_token as string; continue }
    break
  }

  return all
}

// ── Wiki helpers ──────────────────────────────────────────────────────────────

export interface WikiNode {
  node_token: string
  title:      string
  obj_token:  string
  space_id:   string
}

export async function listWikiNodes(): Promise<WikiNode[]> {
  const spaceId = process.env.LARK_WIKI_SPACE_ID
  if (!spaceId) throw new Error('LARK_WIKI_SPACE_ID env var is not set')

  const data = await larkFetch(`/wiki/v2/spaces/${spaceId}/nodes?page_size=50`)
  const items: any[] = data.data?.items ?? []

  return items.map(n => ({
    node_token: n.node_token,
    title:      n.title ?? '(untitled)',
    obj_token:  n.obj_token ?? '',
    space_id:   spaceId,
  }))
}

export async function resolveNodeToDocId(nodeToken: string): Promise<string> {
  const data = await larkFetch(`/wiki/v2/spaces/nodes?token=${nodeToken}`)
  const node = data.data?.node
  if (!node) throw new Error(`Wiki node not found: ${nodeToken}`)
  return node.obj_token as string
}

export async function getDocumentContent(documentId: string): Promise<string> {
  const data = await larkFetch(
    `/docx/v1/documents/${documentId}/raw_content?lang=0`,
  )
  return (data.data?.content ?? '') as string
}

export async function replaceDocumentContent(
  documentId: string,
  newContent: string,
): Promise<void> {
  const blockData = await larkFetch(
    `/docx/v1/documents/${documentId}/blocks/${documentId}?document_revision_id=-1`,
  )
  const children: string[] = blockData.data?.block?.children ?? []

  const requests: any[] = []

  if (children.length > 0) {
    requests.push({
      delete_block: {
        start_index: 0,
        end_index:   children.length,
      },
    })
  }

  const lines = newContent.split('\n')
  lines.forEach((line, idx) => {
    requests.push({
      insert_block_children: {
        parent_block_id: documentId,
        start_index:     idx,
        children: [
          {
            block_type: 2,
            paragraph: {
              elements: [
                { text_run: { content: line || ' ' } },
              ],
            },
          },
        ],
      },
    })
  })

  if (requests.length === 0) return

  await larkFetch(`/docx/v1/documents/${documentId}/blocks/batch_update`, {
    method: 'PATCH',
    body: JSON.stringify({ requests, document_revision_id: -1 }),
  })
}
