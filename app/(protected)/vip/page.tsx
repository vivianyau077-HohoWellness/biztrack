'use client'

import { useState, useEffect, useCallback } from 'react'
import { Crown, ExternalLink, TrendingUp, TrendingDown, Minus } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table'
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select'
import PageHeader from '@/components/shared/PageHeader'
import { toast } from 'sonner'
import {
  getExternalVIPs,
  getRegistrationRate,
  markBirthdayGiftClaimed,
  type VIPRecord,
  type RegistrationRate,
} from '@/app/actions/vip'

// ── Constants ─────────────────────────────────────────────────────────────────

const BRANDS = ['all', 'DD', 'FIOR', 'Juji', 'KHH', 'NE'] as const
const PAGE_SIZE = 50

// ── Helpers ───────────────────────────────────────────────────────────────────

function formatDate(iso: string | null | undefined): string {
  if (!iso) return '—'
  return new Date(iso).toLocaleDateString('en-MY', { day: '2-digit', month: 'short', year: 'numeric' })
}

function VIPBadge({ status }: { status: VIPRecord['status'] }) {
  if (status === 'active')   return <Badge variant="success">Active</Badge>
  if (status === 'expiring') return <Badge variant="warning">Expiring</Badge>
  if (status === 'expired')  return <Badge variant="destructive">Expired</Badge>
  if (status === 'inactive') return <Badge variant="secondary">Inactive</Badge>
  return <Badge variant="secondary">—</Badge>
}

function GiftBadge({ record }: { record: VIPRecord }) {
  const currentYear = new Date().getFullYear()
  if (!record.dateOfBirth) return <span className="text-muted-foreground text-xs">No DOB</span>
  if (record.giftClaimYear === currentYear) return <Badge variant="success">Claimed</Badge>
  return <Badge variant="outline">Available</Badge>
}

function RateArrow({ delta }: { delta: number | null }) {
  if (delta == null) return <Minus className="h-4 w-4 text-muted-foreground inline" />
  if (delta > 0) return <TrendingUp className="h-4 w-4 text-green-600 inline" />
  if (delta < 0) return <TrendingDown className="h-4 w-4 text-red-500 inline" />
  return <Minus className="h-4 w-4 text-muted-foreground inline" />
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function VIPManagementPage() {
  const [vips, setVips] = useState<VIPRecord[]>([])
  const [rate, setRate] = useState<RegistrationRate | null>(null)
  const [loading, setLoading] = useState(true)

  // Filters
  const [brand, setBrand]           = useState('all')
  const [status, setStatus]         = useState('all')
  const [giftStatus, setGiftStatus] = useState('all')
  const [search, setSearch]         = useState('')
  const [page, setPage]             = useState(1)

  const [claimingPhone, setClaimingPhone] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const [vipData, rateData] = await Promise.all([
        getExternalVIPs({ brand, status, giftStatus, search }),
        getRegistrationRate(),
      ])
      setVips(vipData)
      setRate(rateData)
      setPage(1)
    } catch (e: any) {
      toast.error(e.message ?? 'Failed to load VIP data')
    } finally {
      setLoading(false)
    }
  }, [brand, status, giftStatus, search])

  useEffect(() => { load() }, [load])

  async function handleClaimGift(phone: string) {
    setClaimingPhone(phone)
    try {
      const result = await markBirthdayGiftClaimed(phone)
      if (!result.success) {
        toast.error(result.error ?? 'Failed to mark gift as claimed')
        return
      }
      toast.success('Birthday gift marked as claimed')
      setVips(prev => prev.map(v =>
        v.phone === phone
          ? { ...v, giftClaimedAt: new Date().toISOString(), giftClaimYear: new Date().getFullYear(), giftAvailable: false }
          : v,
      ))
    } catch (e: any) {
      toast.error(e.message ?? 'Error')
    } finally {
      setClaimingPhone(null)
    }
  }

  const totalPages   = Math.max(1, Math.ceil(vips.length / PAGE_SIZE))
  const paginated    = vips.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE)
  const activeCount  = vips.filter(v => v.status === 'active' || v.status === 'expiring').length
  const expiringCount = vips.filter(v => v.status === 'expiring').length
  const inactiveCount = vips.filter(v => v.status === 'inactive').length

  const growthText = rate?.growth == null ? '—' : rate.growth >= 0 ? `+${rate.growth}%` : `${rate.growth}%`

  const rateDelta = rate?.thisMonthRate != null && rate?.lastMonthRate != null
    ? rate.thisMonthRate - rate.lastMonthRate
    : null

  return (
    <div className="space-y-6">
      <PageHeader
        title="External VIP Management"
        description="Customers with at least one order ≥ RM700. Expiry rolls from latest qualifying order."
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

      {/* ── Member Registration Rate Analysis ─────────────────────────── */}
      <Card>
        <CardHeader className="pb-2 pt-4 px-4">
          <CardTitle className="text-sm font-semibold flex items-center gap-2">
            <Crown className="h-4 w-4 text-yellow-500" />
            Member Registration Rate
          </CardTitle>
          <CardDescription className="text-xs">
            New VIP registrations (order ≥ RM700) as % of total new customer orders
          </CardDescription>
        </CardHeader>
        <CardContent className="px-4 pb-4">
          <div className="grid grid-cols-3 gap-4">
            {/* This Month */}
            <div className="space-y-1">
              <p className="text-xs text-muted-foreground font-medium uppercase tracking-wide">This Month</p>
              <p className="text-3xl font-bold">
                {rate == null ? '—' : rate.thisMonthRate == null ? '0%' : `${rate.thisMonthRate}%`}
              </p>
              <p className="text-xs text-muted-foreground">
                {rate == null ? '—' : `${rate.thisMonthVip} / ${rate.thisMonth} new`}
              </p>
            </div>
            {/* Last Month */}
            <div className="space-y-1">
              <p className="text-xs text-muted-foreground font-medium uppercase tracking-wide">Last Month</p>
              <p className="text-3xl font-bold text-muted-foreground">
                {rate == null ? '—' : rate.lastMonthRate == null ? '0%' : `${rate.lastMonthRate}%`}
              </p>
              <p className="text-xs text-muted-foreground">
                {rate == null ? '—' : `${rate.lastMonthVip} / ${rate.lastMonth} new`}
              </p>
            </div>
            {/* This Year */}
            <div className="space-y-1">
              <p className="text-xs text-muted-foreground font-medium uppercase tracking-wide">This Year</p>
              <p className="text-3xl font-bold text-muted-foreground">
                {rate == null ? '—' : rate.thisYearRate == null ? '0%' : `${rate.thisYearRate}%`}
              </p>
              <p className="text-xs text-muted-foreground">
                {rate == null ? '—' : `${rate.thisYearVip} / ${rate.thisYearNew} new`}
              </p>
            </div>
          </div>
          {/* Rate change indicator */}
          {rateDelta != null && (
            <div className={`mt-3 flex items-center gap-1.5 text-sm font-medium ${
              rateDelta > 0 ? 'text-green-600' : rateDelta < 0 ? 'text-red-500' : 'text-muted-foreground'
            }`}>
              <RateArrow delta={rateDelta} />
              {rateDelta > 0 ? `+${rateDelta}pp` : rateDelta < 0 ? `${rateDelta}pp` : 'No change'}
              <span className="text-muted-foreground font-normal">vs last month</span>
            </div>
          )}
        </CardContent>
      </Card>

      {/* ── Stats row ───────────────────────────────────────────────────── */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card>
          <CardHeader className="pb-1 pt-4 px-4">
            <CardDescription className="text-xs">Active VIPs</CardDescription>
          </CardHeader>
          <CardContent className="px-4 pb-4">
            <p className="text-2xl font-bold">{loading ? '—' : activeCount}</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-1 pt-4 px-4">
            <CardDescription className="text-xs">Expiring &lt;30d</CardDescription>
          </CardHeader>
          <CardContent className="px-4 pb-4">
            <p className={`text-2xl font-bold ${expiringCount > 0 ? 'text-yellow-600' : ''}`}>
              {loading ? '—' : expiringCount}
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-1 pt-4 px-4">
            <CardDescription className="text-xs">Inactive (365d+)</CardDescription>
          </CardHeader>
          <CardContent className="px-4 pb-4">
            <p className={`text-2xl font-bold ${inactiveCount > 0 ? 'text-gray-500' : ''}`}>
              {loading ? '—' : inactiveCount}
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-1 pt-4 px-4">
            <CardDescription className="text-xs">VIP Registration Rate</CardDescription>
          </CardHeader>
          <CardContent className="px-4 pb-4">
            <p className="text-2xl font-bold">
              {rate == null ? '—' : rate.thisMonthRate == null ? '0%' : `${rate.thisMonthRate}%`}
            </p>
            <p className="text-xs text-muted-foreground mt-0.5">
              {rate == null ? '' : `${rate.thisMonthVip} VIP / ${rate.thisMonth} new`}
            </p>
          </CardContent>
        </Card>
      </div>

      {/* ── Filters ─────────────────────────────────────────────────────── */}
      <div className="flex flex-wrap gap-2 items-center">
        <Select value={brand} onValueChange={v => { setBrand(v); setPage(1) }}>
          <SelectTrigger className="h-9 w-36">
            <SelectValue placeholder="Brand" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Brands</SelectItem>
            {BRANDS.filter(b => b !== 'all').map(b => (
              <SelectItem key={b} value={b}>{b}</SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select value={status} onValueChange={v => { setStatus(v); setPage(1) }}>
          <SelectTrigger className="h-9 w-40">
            <SelectValue placeholder="Status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Statuses</SelectItem>
            <SelectItem value="active">Active</SelectItem>
            <SelectItem value="expiring">Expiring &lt;30d</SelectItem>
            <SelectItem value="expired">Expired</SelectItem>
            <SelectItem value="inactive">Inactive</SelectItem>
          </SelectContent>
        </Select>

        <Select value={giftStatus} onValueChange={v => { setGiftStatus(v); setPage(1) }}>
          <SelectTrigger className="h-9 w-44">
            <SelectValue placeholder="Gift Status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Gift Status</SelectItem>
            <SelectItem value="claimed">Gift Claimed</SelectItem>
            <SelectItem value="not_claimed">Gift Not Claimed</SelectItem>
          </SelectContent>
        </Select>

        <Input
          placeholder="Search name or phone..."
          value={search}
          onChange={e => { setSearch(e.target.value); setPage(1) }}
          className="h-9 w-56"
        />

        <div className="flex-1" />
        <span className="text-sm text-muted-foreground">
          {loading ? 'Loading...' : `${vips.length} records`}
        </span>
      </div>

      {/* ── Table ───────────────────────────────────────────────────────── */}
      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Customer</TableHead>
                <TableHead>Phone</TableHead>
                <TableHead>Brand</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>VIP Since</TableHead>
                <TableHead>Expires</TableHead>
                <TableHead>Last Order</TableHead>
                <TableHead>Gift</TableHead>
                <TableHead className="w-36">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                <TableRow>
                  <TableCell colSpan={9} className="h-32 text-center text-muted-foreground">
                    Loading…
                  </TableCell>
                </TableRow>
              ) : paginated.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={9} className="h-32 text-center text-muted-foreground">
                    No VIP records found.
                  </TableCell>
                </TableRow>
              ) : (
                paginated.map(v => (
                  <TableRow key={v.phone} className={v.status === 'inactive' ? 'opacity-60' : ''}>
                    <TableCell className="font-medium max-w-[160px] truncate">
                      {v.customerName ?? '—'}
                    </TableCell>
                    <TableCell className="font-mono text-sm">{v.phone}</TableCell>
                    <TableCell>
                      {v.brand ? (
                        <span className="inline-flex items-center rounded px-1.5 py-0.5 text-xs font-medium bg-primary/10 text-primary">
                          {v.brand}
                        </span>
                      ) : '—'}
                    </TableCell>
                    <TableCell><VIPBadge status={v.status} /></TableCell>
                    <TableCell className="text-sm">{formatDate(v.vipSince)}</TableCell>
                    <TableCell className="text-sm">
                      <span className={
                        v.daysUntilExpiry < 0 ? 'text-red-600' :
                        v.daysUntilExpiry < 30 ? 'text-yellow-600' : ''
                      }>
                        {formatDate(v.expiryDate)}
                      </span>
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {formatDate(v.lastOrderDate)}
                    </TableCell>
                    <TableCell><GiftBadge record={v} /></TableCell>
                    <TableCell>
                      <div className="flex items-center gap-1.5">
                        {v.giftAvailable && (
                          <Button
                            size="sm"
                            variant="outline"
                            className="h-7 text-xs px-2"
                            disabled={claimingPhone === v.phone}
                            onClick={() => handleClaimGift(v.phone)}
                          >
                            {claimingPhone === v.phone ? '…' : 'Claim Gift'}
                          </Button>
                        )}
                        <Button
                          size="sm"
                          variant="ghost"
                          className="h-7 text-xs px-2 text-green-700"
                          onClick={() => window.open(`https://wa.me/${v.phone}`, '_blank')}
                        >
                          WA
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between">
          <p className="text-sm text-muted-foreground">
            Page {page} of {totalPages} ({vips.length} records)
          </p>
          <div className="flex gap-2">
            <Button size="sm" variant="outline" disabled={page <= 1} onClick={() => setPage(p => p - 1)}>
              Previous
            </Button>
            <Button size="sm" variant="outline" disabled={page >= totalPages} onClick={() => setPage(p => p + 1)}>
              Next
            </Button>
          </div>
        </div>
      )}
    </div>
  )
}
