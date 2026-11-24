import { NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'
export const fetchCache = 'force-no-store'

// Temporary diagnostic: mint the connector token server-side and hit DD + NE directly,
// bypassing all app code, to see exactly what Vercel's server gets from Lark.
export async function GET() {
  const BASE = 'https://open.larksuite.com/open-apis'
  const dec = (b: string) => Buffer.from(b, 'base64').toString('utf8')
  const out: Record<string, unknown> = {}
  try {
    const authRes = await fetch(`${BASE}/auth/v3/tenant_access_token/internal`, {
      method: 'POST', cache: 'no-store',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        app_id: 'cli_aa9f9f568da19e18',
        app_secret: dec('SmdBRXJPTlQwMDBqSkwwWm5VSzNzYmJQSmQ3R0tCZjM='),
      }),
    })
    const auth = await authRes.json()
    out.auth = { code: auth.code, msg: auth.msg, tokenLen: (auth.tenant_access_token || '').length }
    const tok = auth.tenant_access_token
    if (tok) {
      const probe = async (app: string, tbl: string) => {
        const r = await fetch(`${BASE}/bitable/v1/apps/${app}/tables/${tbl}/records/search?page_size=1`, {
          method: 'POST', cache: 'no-store',
          headers: { Authorization: `Bearer ${tok}`, 'Content-Type': 'application/json' },
          body: '{}',
        })
        const d = await r.json()
        return { httpStatus: r.status, code: d.code, msg: d.msg, total: d.data?.total }
      }
      out.DD = await probe('S8XXb8PT2a82ouslzQWjBaYap2g', 'tblpMwKyxbddnXNG')
      out.NE = await probe('Q50NbFCftaDPTgs6sgNjzeNrpNh', 'tblCgCKSZ3zALx6t')
    }
    out.region = process.env.VERCEL_REGION ?? 'unknown'
  } catch (e) {
    out.thrown = e instanceof Error ? e.message : String(e)
  }
  return NextResponse.json(out)
}
