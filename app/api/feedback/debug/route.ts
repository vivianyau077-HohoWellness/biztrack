import { NextResponse } from 'next/server'
import { larkFetch } from '@/lib/lark'

// Diagnostic: resolve the Feedback wiki node -> base, list tables + fields + a
// few sample rows, so we can see the structure and build the Feedback tab.
export const maxDuration = 60
export const dynamic = 'force-dynamic'

const FEEDBACK_WIKI_NODE = 'FfUPw6VKZiZ7UpkB8V2j5merple'

export async function GET() {
  try {
    // Correct Lark endpoint is get_node (not "nodes").
    const nodeRes = await larkFetch(`/wiki/v2/spaces/get_node?token=${encodeURIComponent(FEEDBACK_WIKI_NODE)}`)
    const appToken: string | undefined = nodeRes?.data?.node?.obj_token
    if (!appToken) {
      return NextResponse.json({
        step: 'resolve-node',
        code: nodeRes?.code,
        msg: nodeRes?.msg,
        node: nodeRes?.data?.node ?? null,
      })
    }

    const tablesRes = await larkFetch(`/bitable/v1/apps/${appToken}/tables?page_size=50`)
    const tables: { table_id: string; name: string }[] = (tablesRes.data?.items ?? []).map(
      (t: { table_id: string; name: string }) => ({ table_id: t.table_id, name: t.name }),
    )

    const out: Record<string, unknown> = { appToken, tables }

    // For each table, fetch field names + 2 sample records
    const detail: Record<string, unknown> = {}
    for (const t of tables) {
      const fieldsRes = await larkFetch(`/bitable/v1/apps/${appToken}/tables/${t.table_id}/fields?page_size=100`)
      const fields = (fieldsRes.data?.items ?? []).map(
        (f: { field_name: string; ui_type: string }) => ({ name: f.field_name, type: f.ui_type }),
      )
      const recRes = await larkFetch(`/bitable/v1/apps/${appToken}/tables/${t.table_id}/records?page_size=2`)
      detail[t.name] = { table_id: t.table_id, fields, sample: recRes.data?.items ?? [] }
    }
    out.detail = detail

    return NextResponse.json(out)
  } catch (e) {
    console.error('[feedback/debug]', e)
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Failed' }, { status: 500 })
  }
}
