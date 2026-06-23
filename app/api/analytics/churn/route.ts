import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'

// Churn = customers (deduped by phone) who have ordered before but NOT in the
// last 365 days. Computed over ALL orders (all-time), independent of the page's
// date range. Scoped by project_id (brand) when provided.
// Reads many order rows, so it needs more than the default 10s.
export const maxDuration = 60
export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  try {
    const projectId = req.nextUrl.searchParams.get('projectId') || ''
    const sb = createAdminClient()

    const cutoff = new Date()
    cutoff.setDate(cutoff.getDate() - 365)
    const cutoffStr = cutoff.toISOString().split('T')[0]

    const collectPhones = async (from?: string, to?: string): Promise<Set<string>> => {
      const set = new Set<string>()
      const PAGE = 1000
      let offset = 0
      while (true) {
        let q = sb.from('orders').select('phone').not('phone', 'is', null)
        if (projectId) q = q.eq('project_id', projectId)
        if (from) q = q.gte('order_date', from)
        if (to) q = q.lte('order_date', to)
        const { data, error } = await q.range(offset, offset + PAGE - 1)
        if (error) throw new Error(error.message)
        if (!data || data.length === 0) break
        for (const r of data as { phone: string | null }[]) {
          const p = (r.phone ?? '').toString().trim()
          if (p && p !== '0') set.add(p)
        }
        if (data.length < PAGE) break
        offset += PAGE
      }
      return set
    }

    const today = new Date().toISOString().split('T')[0]
    const allPhones = await collectPhones()
    const activePhones = await collectPhones(cutoffStr)
    const unique2025 = await collectPhones('2025-01-01', '2025-12-31')
    const unique2026 = await collectPhones('2026-01-01', today)
    const churnCount = Math.max(0, allPhones.size - activePhones.size)

    return NextResponse.json({
      churnCount,
      totalCustomers: allPhones.size,
      activeCustomers: activePhones.size,
      unique2025: unique2025.size,
      unique2026: unique2026.size,
    })
  } catch (e) {
    console.error('[churn] error:', e)
    return NextResponse.json(
      { error: e instanceof Error ? e.message : 'Failed to compute churn' },
      { status: 500 },
    )
  }
}
