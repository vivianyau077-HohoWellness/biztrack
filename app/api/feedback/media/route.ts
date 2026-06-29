import { NextRequest } from 'next/server'
import { getTenantAccessToken } from '@/lib/lark'

// Proxies a Lark attachment (by file_token) so it can be shown as an <img>.
export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  const token = req.nextUrl.searchParams.get('token')
  if (!token) return new Response('missing token', { status: 400 })
  try {
    const at = await getTenantAccessToken()
    const r = await fetch(
      `https://open.larksuite.com/open-apis/drive/v1/medias/${encodeURIComponent(token)}/download`,
      { headers: { Authorization: `Bearer ${at}` } },
    )
    if (!r.ok) return new Response('not found', { status: 404 })
    const buf = await r.arrayBuffer()
    const ct = r.headers.get('content-type') ?? 'image/jpeg'
    return new Response(buf, {
      headers: { 'Content-Type': ct, 'Cache-Control': 'private, max-age=3600' },
    })
  } catch {
    return new Response('error', { status: 500 })
  }
}
