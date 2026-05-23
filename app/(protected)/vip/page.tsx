'use client'

import { useState, useEffect, useCallback } from 'react'
import { Crown, ExternalLink } from 'lucide-react'
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
  return <Badge variant="secondary">—</Badge>
}

function GiftBadge({ record }: { record: VIPRecord }) {
  const currentYear = new Date().getFullYear()
  if (!record.dateOfBirth) return <span className="text-muted-foreground text-xs">No DOB</span>
  if (record.giftClaimYear === currentYear)
    return <Badge variant="success">Claimed</Badge>
  return <Badge variant="outline">Available</Badge>
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

  // Track which phone is having gift claimed
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
      // Optimistic update
      setVips(prev => prev.map(v =>
        v.phone === phone
          ? {
              ...v,
              giftClaimedAt: new Date().toISOString(),
              giftClaimYear: new Date().getFullYear(),
              giftAvailable: false,
            }
          : v,
      ))
    } catch (e: any) {
      toast.error(e.message ?? 'Error')
    } finally {
      setClaimingPhone(null)
    }
  }

  // Pagination
  const totalPages = Math.max(1, Math.ceil(vips.length / PAGE_SIZE))
  const paginated = vips.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE)

  const growthText = rate?.growth == null
    ? '—'
    : rate.growth >= 0
      ? `+${rate.growth}%`
      : `${rate.growth}%`

  const activeCount   = vips.filter(v => v.status === 'active' || v.status === 'expiring').length
  const expiringCount = vips.filter(v => v.status === 'expiring').length

  return (
    <div className="space-y-6">
      <PageHeader
        title="External VIP Management"
        description="Customers with at least one order ≥ RM700 in the past 365 days"
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

      {/* Stats row */}
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
            <CardDescription className="text-xs">New Customers This Month</CardDescription>
          </CardHeader>
          <CardContent className="px-4 pb-4">
            <p className="text-2xl font-bold">{rate == null ? '—' : rate.thisMonth}</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-1 pt-4 px-4">
            <CardDescription className="text-xs">vs Last Month</CardDescription>
          </CardHeader>
          <CardContent className="px-4 pb-4">
            <p className={`text-2xl font-bold ${
              rate?.growth == null ? '' :
              rate.growth > 0 ? 'text-green-600' :
              rate.growth < 0 ? 'text-red-600' : ''
            }`}>
              {rate == null ? '—' : growthText}
            </p>
            {rate && (
              <p className="text-xs text-muted-foreground mt-0.5">
                Last month: {rate.lastMonth}
              </p>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-2 items-center">
        {/* Brand */}
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

        {/* Status */}
        <Select value={status} onValueChange={v => { setStatus(v); setPage(1) }}>
          <SelectTrigger className="h-9 w-40">
            <SelectValue placeholder="Status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Statuses</SelectItem>
            <SelectItem value="active">Active</SelectItem>
            <SelectItem value="expiring">Expiring &lt;30d</SelectItem>
            <SelectItem value="expired">Expired</SelectItem>
          </SelectContent>
        </Select>

        {/* Gift Status */}
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

        {/* Search */}
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

      {/* Table */}
      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Customer</TableHead>
                <TableHead>Phone</TableHead>
                <TableHead>Brand</TableHead>
                <TableHead>VIP Since</TableHead>
                <TableHead>Expires</TableHead>
                <TableHead>Days Left</TableHead>
                <TableHead>Gift</TableHead>
                <TableHead className="w-36">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                <TableRow>
                  <TableCell colSpan={8} className="h-32 text-center text-muted-foreground">
                    Loading…
                  </TableCell>
                </TableRow>
              ) : paginated.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={8} className="h-32 text-center text-muted-foreground">
                    No VIP records found.
                  </TableCell>
                </TableRow>
              ) : (
                paginated.map(v => (
                  <TableRow key={v.phone}>
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
                    <TableCell className="text-sm">{formatDate(v.vipSince)}</TableCell>
                    <TableCell className="text-sm">{formatDate(v.expiryDate)}</TableCell>
                    <TableCell>
                      <span className={`text-sm font-medium ${
                        v.daysUntilExpiry < 0 ? 'text-red-600' :
                        v.daysUntilExpiry < 30 ? 'text-yellow-600' : ''
                      }`}>
                        {v.daysUntilExpiry < 0
                          ? `${Math.abs(v.daysUntilExpiry)}d ago`
                          : `${v.daysUntilExpiry}d`
                        }
                      </span>
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
                          onClick={() => {
                            const wa = `https://wa.me/${v.phone}`
                            window.open(wa, '_blank')
                          }}
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
            <Button
              size="sm"
              variant="outline"
              disabled={page <= 1}
              onClick={() => setPage(p => p - 1)}
            >
              Previous
            </Button>
            <Button
              size="sm"
              variant="outline"
              disabled={page >= totalPages}
              onClick={() => setPage(p => p + 1)}
            >
              Next
            </Button>
          </div>
        </div>
      )}
    </div>
  )
}
