'use client'

import { useState, useEffect, useCallback } from 'react'
import { Crown, ExternalLink } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table'
import PageHeader from '@/components/shared/PageHeader'
import { toast } from 'sonner'
import {
  getVIPStats,
  getLarkVIPs,
  type VIPStats,
  type LarkVIPRecord,
} from '@/app/actions/vip'

// ── Helpers ───────────────────────────────────────────────────────────────────

function formatDate(iso: string | null | undefined): string {
  if (!iso) return '—'
  return new Date(iso).toLocaleDateString('en-MY', { day: '2-digit', month: 'short', year: 'numeric' })
}

function formatCurrency(amount: number): string {
  return `RM ${amount.toLocaleString('en-MY', { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function VIPManagementPage() {
  const [stats, setStats]   = useState<VIPStats | null>(null)
  const [vips, setVips]     = useState<LarkVIPRecord[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const [statsData, vipData] = await Promise.all([getVIPStats(), getLarkVIPs()])
      setStats(statsData)
      setVips(vipData)
    } catch (e: any) {
      toast.error(e.message ?? 'Failed to load VIP data')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { load() }, [load])

  const filtered = search.trim()
    ? vips.filter(v => {
        const q = search.toLowerCase()
        return (
          (v.customerName ?? '').toLowerCase().includes(q) ||
          (v.phone ?? '').toLowerCase().includes(q)
        )
      })
    : vips

  return (
    <div className="space-y-6">
      <PageHeader
        title="VIP Management"
        description="DD VIPs ticked by CS in Lark. Source of truth: Lark DD 2026 VIP checkbox."
      >
        <Button
          variant="outline"
          size="sm"
          onClick={() => window.open('/vip/check', '_blank')}
          className="gap-1.5"
        >
          <ExternalLink className="h-3.5 w-3.5" />
          Public Lookup
        </Button>
      </PageHeader>

      {/* ── KPI Cards ───────────────────────────────────────────────────── */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card>
          <CardHeader className="pb-1 pt-4 px-4">
            <CardDescription className="text-xs flex items-center gap-1">
              <Crown className="h-3 w-3 text-yellow-500" />
              Total VIPs
            </CardDescription>
          </CardHeader>
          <CardContent className="px-4 pb-4">
            <p className="text-2xl font-bold">{loading ? '—' : stats?.totalVIPs ?? 0}</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-1 pt-4 px-4">
            <CardDescription className="text-xs">New VIPs This Month</CardDescription>
          </CardHeader>
          <CardContent className="px-4 pb-4">
            <p className="text-2xl font-bold">{loading ? '—' : stats?.newVIPsThisMonth ?? 0}</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-1 pt-4 px-4">
            <CardDescription className="text-xs">New VIPs Last Month</CardDescription>
          </CardHeader>
          <CardContent className="px-4 pb-4">
            <p className="text-2xl font-bold text-muted-foreground">
              {loading ? '—' : stats?.newVIPsLastMonth ?? 0}
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-1 pt-4 px-4">
            <CardDescription className="text-xs">Registration Rate</CardDescription>
          </CardHeader>
          <CardContent className="px-4 pb-4">
            <p className="text-2xl font-bold">
              {loading ? '—' : stats?.registrationRate == null ? '0%' : `${stats.registrationRate}%`}
            </p>
            <p className="text-xs text-muted-foreground mt-0.5">
              {loading || !stats ? '' : `${stats.newVIPsThisMonth} VIP / ${stats.newCustomersThisMonth} new`}
            </p>
          </CardContent>
        </Card>
      </div>

      {/* ── Search ──────────────────────────────────────────────────────── */}
      <div className="flex items-center gap-2">
        <Input
          placeholder="Search name or phone..."
          value={search}
          onChange={e => setSearch(e.target.value)}
          className="h-9 w-56"
        />
        <div className="flex-1" />
        <span className="text-sm text-muted-foreground">
          {loading ? 'Loading...' : `${filtered.length} records`}
        </span>
      </div>

      {/* ── Table ───────────────────────────────────────────────────────── */}
      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Customer Name</TableHead>
                <TableHead>Phone</TableHead>
                <TableHead>VIP Order Date</TableHead>
                <TableHead>Amount</TableHead>
                <TableHead>Brand</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                <TableRow>
                  <TableCell colSpan={5} className="h-32 text-center text-muted-foreground">
                    Loading…
                  </TableCell>
                </TableRow>
              ) : filtered.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={5} className="h-32 text-center text-muted-foreground">
                    No VIP records found.
                  </TableCell>
                </TableRow>
              ) : (
                filtered.map(v => (
                  <TableRow key={v.id}>
                    <TableCell className="font-medium max-w-[160px] truncate">
                      {v.customerName ?? '—'}
                    </TableCell>
                    <TableCell className="font-mono text-sm">{v.phone ?? '—'}</TableCell>
                    <TableCell className="text-sm">{formatDate(v.orderDate)}</TableCell>
                    <TableCell className="text-sm">{formatCurrency(v.totalPrice)}</TableCell>
                    <TableCell>
                      {v.brand ? (
                        <span className="inline-flex items-center rounded px-1.5 py-0.5 text-xs font-medium bg-primary/10 text-primary">
                          {v.brand}
                        </span>
                      ) : '—'}
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  )
}
