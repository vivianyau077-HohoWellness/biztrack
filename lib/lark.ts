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
      app_id:     process.env.LARK_APP_ID,
      app_secret: process.env.LARK_APP_SECRET,
    }),
  })
  const data = await res.json()
  if (data.code !== 0) throw new Error(`Lark auth error: ${data.msg}`)

  cachedToken  = data.tenant_access_token
  // expire 60 s early to avoid using a nearly-expired token
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

// ── Bitable / Base helpers ────────────────────────────────────────────────────

const LARK_BASE_APP_TOKEN = 'S8XXb8PT2a82ouslzQWjBaYap2g'

export interface LarkRecord {
  record_id: string
  fields: Record<string, unknown>
}

/**
 * Fetch ALL records from a Lark Base table, handling pagination automatically.
 * Uses page_size=500 and follows has_more / page_token until exhausted.
 */
export async function fetchLarkRecords(tableId: string): Promise<LarkRecord[]> {
  const all: LarkRecord[] = []
  let pageToken: string | undefined

  do {
    const params = new URLSearchParams({ page_size: '500' })
    if (pageToken) params.set('page_token', pageToken)

    const data = await larkFetch(
      `/bitable/v1/apps/${LARK_BASE_APP_TOKEN}/tables/${tableId}/records?${params}`,
    )

    if (data.code !== 0) {
      throw new Error(`Lark fetchLarkRecords error (${data.code}): ${data.msg}`)
    }

    const items: LarkRecord[] = data.data?.items ?? []
    all.push(...items)

    pageToken = data.data?.has_more ? (data.data.page_token as string) : undefined
  } while (pageToken)

  return all
}

// ── Wiki helpers ──────────────────────────────────────────────────────────────

export interface WikiNode {
  node_token: string
  title:      string
  obj_token:  string   // underlying document/sheet token
  space_id:   string
}

/** List wiki nodes from the configured space. */
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

/** Resolve a node_token → obj_token (document id). */
export async function resolveNodeToDocId(nodeToken: string): Promise<string> {
  const data = await larkFetch(`/wiki/v2/spaces/nodes?token=${nodeToken}`)
  const node = data.data?.node
  if (!node) throw new Error(`Wiki node not found: ${nodeToken}`)
  return node.obj_token as string
}

/** Fetch raw text content of a Lark document by its document id. */
export async function getDocumentContent(documentId: string): Promise<string> {
  const data = await larkFetch(
    `/docx/v1/documents/${documentId}/raw_content?lang=0`,
  )
  return (data.data?.content ?? '') as string
}

/** Replace all paragraph content in a document with new plain text.
 *  Strategy: batch-delete every child block of the root, then insert
 *  one paragraph block per line of the new content.
 */
export async function replaceDocumentContent(
  documentId: string,
  newContent: string,
): Promise<void> {
  // 1. Get the root block's current children so we know how many to delete
  const blockData = await larkFetch(
    `/docx/v1/documents/${documentId}/blocks/${documentId}?document_revision_id=-1`,
  )
  const children: string[] = blockData.data?.block?.children ?? []

  const requests: any[] = []

  // 2. Delete all existing children (if any)
  if (children.length > 0) {
    requests.push({
      delete_block: {
        start_index: 0,
        end_index:   children.length,
      },
    })
  }

  // 3. Insert one paragraph block per non-empty line
  const lines = newContent.split('\n')
  lines.forEach((line, idx) => {
    requests.push({
      insert_block_children: {
        parent_block_id: documentId,
        start_index:     idx,
        children: [
          {
            block_type: 2, // paragraph
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
