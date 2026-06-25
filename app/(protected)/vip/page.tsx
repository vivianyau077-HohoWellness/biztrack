'use client'

import { useState, useEffect, useCallback } from 'react'
import { Crown, ExternalLink, ChevronDown, ChevronUp, Copy, Bell } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table'
import PageHeader from '@/components/shared/PageHeader'
import { toast } from 'sonner'
import {
  getVIPStats,
  getLarkVIPs,
  getVIPEligible,
  type VIPStats,
  type LarkVIPRecord,
  type VIPEligibleRecord,
} from '@/app/actions/vip'

// ── Helpers ───────────────────────────────────────────────────────────────────

function formatDate(iso: string | null | undefined): string {
  if (!iso) return '—'
  return new Date(iso).toLocaleDateString('en-MY', { day: '2-digit', month: 'short', year: 'numeric' })
}

function formatCurrency(amount: number): string {
  return `RM ${amount.toLocaleString('en-MY', { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`
}

function buildNotifyMessage(r: VIPEligibleRecord): string {
  const name   = r.customerName ?? 'Unknown'
  const phone  = r.phone        ?? '—'
  const amount = formatCurrency(r.totalPrice)
  const date   = formatDate(r.orderDate)
  const ref    = r.orderNumber  ? ` | Ref: ${r.orderNumber}` : ''
  return `${name} | ${phone} | ${amount} | ${date}${ref}`
}

async function copyText(text: string, label: string) {
  try {
    await navigator.clipboard.writeText(text)
    toast.success(`${label} copied`)
  } catch {
    toast.error('Copy failed — check clipboard permissions')
  }
}

type VipRegData = {
  year: number
  newVipTotal: number
  newVipMY: number
  newVipSG: number
  totalVipMY: number
  totalVipSG: number
  newCustomers: number
  registrationRate: number | null
  malaysiaVipAov: number
  singaporeVipAov: number
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function VIPManagementPage() {
  const [stats,    setStats]    = useState<VIPStats | null>(null)
  const [vips,     setVips]     = useState<LarkVIPRecord[]>([])
  const [eligible, setEligible] = useState<VIPEligibleRecord[]>([])
  const [loading,  setLoading]  = useState(true)
  const [search,   setSearch]   = useState('')
  const [eligibleOpen, setEligibleOpen] = useState(false)
  const [vipReg, setVipReg] = useState<VipRegData | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const [statsData, vipData, eligibleData, vipRegRes] = await Promise.all([
        getVIPStats(),
        getLarkVIPs(),
        getVIPEligible(),
        fetch('/api/analytics/vip-registration').then(r => (r.ok ? r.json() : null)).catch(() => null),
      ])
      setStats(statsData)
      setVips(vipData)
      setEligible(eligibleData)
      setVipReg(vipRegRes)
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

  function handleCopyAll() {
    if (eligible.length === 0) return
    const today = new Date().toLocaleDateString('en-MY', { day: '2-digit', month: 'short', year: 'numeric' })
    const lines = eligible.map((r, i) => `${i + 1}. ${buildNotifyMessage(r)}`).join('\n')
    copyText(`VIP Eligible Customers (${today}):\n${lines}`, 'All eligible customers')
  }

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
      <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
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

        {/* Pending VIP — orange */}
        <Card className="border-orange-200 bg-orange-50/40">
          <CardHeader className="pb-1 pt-4 px-4">
            <CardDescription className="text-xs text-orange-700">Pending VIP</CardDescription>
          </CardHeader>
          <CardContent className="px-4 pb-4">
            <p className="text-2xl font-bold text-orange-600">
              {loading ? '—' : eligible.length}
            </p>
            <p className="text-xs text-orange-600/70 mt-0.5">eligible, not ticked</p>
          </CardContent>
        </Card>
      </div>

      {/* ── VIP Registration · This Year (Malaysia / Singapore — from Lark AUTO VIP) ── */}
      <div>
        <h2 className="text-base font-semibold mb-3 flex items-center gap-2">
          <Crown className="h-4 w-4 text-purple-600" />
          VIP Registration · {vipReg?.year ?? new Date().getFullYear()} (This Year)
        </h2>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <Card>
            <CardHeader className="pb-1 pt-4 px-4"><CardDescription className="text-xs">New VIP</CardDescription></CardHeader>
            <CardContent className="px-4 pb-4">
              <p className="text-2xl font-bold text-purple-600">{loading ? '—' : (vipReg?.newVipTotal ?? 0)}</p>
              <p className="text-xs text-muted-foreground mt-0.5">New customers only (excl. repeat)</p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-1 pt-4 px-4"><CardDescription className="text-xs">New VIP Registration Rate</CardDescription></CardHeader>
            <CardContent className="px-4 pb-4">
              <p className="text-2xl font-bold text-green-600">{loading ? '—' : vipReg?.registrationRate != null ? `${vipReg.registrationRate}%` : '—'}</p>
              <p className="text-xs text-muted-foreground mt-0.5">{vipReg ? `${vipReg.newVipTotal} new VIP / ${vipReg.newCustomers} new` : 'New VIP ÷ new customers'}</p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-1 pt-4 px-4"><CardDescription className="text-xs">🇲🇾 Malaysia New VIP</CardDescription></CardHeader>
            <CardContent className="px-4 pb-4">
              <p className="text-2xl font-bold">{loading ? '—' : (vipReg?.newVipMY ?? 0)}</p>
              <p className="text-xs text-muted-foreground mt-0.5">New customers only</p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-1 pt-4 px-4"><CardDescription className="text-xs">🇸🇬 Singapore New VIP</CardDescription></CardHeader>
            <CardContent className="px-4 pb-4">
              <p className="text-2xl font-bold">{loading ? '—' : (vipReg?.newVipSG ?? 0)}</p>
              <p className="text-xs text-muted-foreground mt-0.5">New customers only</p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-1 pt-4 px-4"><CardDescription className="text-xs">🇲🇾 Malaysia Total VIP</CardDescription></CardHeader>
            <CardContent className="px-4 pb-4">
              <p className="text-2xl font-bold text-purple-600">{loading ? '—' : (vipReg?.totalVipMY ?? 0)}</p>
              <p className="text-xs text-muted-foreground mt-0.5">New + repeat tagged VIP</p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-1 pt-4 px-4"><CardDescription className="text-xs">🇸🇬 Singapore Total VIP</CardDescription></CardHeader>
            <CardContent className="px-4 pb-4">
              <p className="text-2xl font-bold text-purple-600">{loading ? '—' : (vipReg?.totalVipSG ?? 0)}</p>
              <p className="text-xs text-muted-foreground mt-0.5">New + repeat tagged VIP</p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-1 pt-4 px-4"><CardDescription className="text-xs">🇲🇾 Malaysia VIP AOV</CardDescription></CardHeader>
            <CardContent className="px-4 pb-4">
              <p className="text-2xl font-bold text-purple-600">{loading ? '—' : formatCurrency(vipReg?.malaysiaVipAov ?? 0)}</p>
              <p className="text-xs text-muted-foreground mt-0.5">Repeat + Malaysia VIP</p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-1 pt-4 px-4"><CardDescription className="text-xs">🇸🇬 Singapore VIP AOV</CardDescription></CardHeader>
            <CardContent className="px-4 pb-4">
              <p className="text-2xl font-bold text-purple-600">{loading ? '—' : formatCurrency(vipReg?.singaporeVipAov ?? 0)}</p>
              <p className="text-xs text-muted-foreground mt-0.5">Repeat + Singapore VIP</p>
            </CardContent>
          </Card>
        </div>
      </div>

      {/* ── Search + VIP table ──────────────────────────────────────────── */}
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

      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Member No</TableHead>
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
                  <TableCell colSpan={6} className="h-32 text-center text-muted-foreground">
                    Loading…
                  </TableCell>
                </TableRow>
              ) : filtered.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={6} className="h-32 text-center text-muted-foreground">
                    No VIP records found.
                  </TableCell>
                </TableRow>
              ) : (
                filtered.map(v => (
                  <TableRow key={v.id}>
                    <TableCell className="font-mono text-xs text-yellow-700">
                      {v.vipMemberNumber ?? '—'}
                    </TableCell>
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

      {/* ── VIP Eligible — Pending Action ───────────────────────────────── */}
      <Card className="border-orange-200">
        {/* Header — always visible */}
        <div
          className="flex items-center justify-between px-4 py-3 cursor-pointer select-none"
          onClick={() => setEligibleOpen(o => !o)}
        >
          <div className="flex items-center gap-2">
            <Bell className="h-4 w-4 text-orange-500" />
            <CardTitle className="text-sm font-semibold">VIP Eligible — Pending Action</CardTitle>
            {!loading && eligible.length > 0 && (
              <Badge className="bg-orange-100 text-orange-700 border-orange-300 text-xs font-semibold">
                {eligible.length}
              </Badge>
            )}
          </div>
          <div className="flex items-center gap-2" onClick={e => e.stopPropagation()}>
            {eligibleOpen && eligible.length > 0 && (
              <Button
                size="sm"
                variant="outline"
                className="h-7 text-xs px-2 border-orange-300 text-orange-700 hover:bg-orange-50"
                onClick={handleCopyAll}
              >
                <Copy className="h-3 w-3 mr-1" />
                Copy All
              </Button>
            )}
            <button className="text-muted-foreground hover:text-foreground">
              {eligibleOpen
                ? <ChevronUp className="h-4 w-4" />
                : <ChevronDown className="h-4 w-4" />
              }
            </button>
          </div>
        </div>

        {/* Collapsible body */}
        {eligibleOpen && (
          <CardContent className="p-0 border-t border-orange-100">
            {loading ? (
              <p className="h-20 flex items-center justify-center text-sm text-muted-foreground">
                Loading…
              </p>
            ) : eligible.length === 0 ? (
              <p className="h-20 flex items-center justify-center text-sm text-muted-foreground">
                No eligible customers pending VIP.
              </p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Customer Name</TableHead>
                    <TableHead>Phone</TableHead>
                    <TableHead>Order Date</TableHead>
                    <TableHead>Amount</TableHead>
                    <TableHead>Order Ref</TableHead>
                    <TableHead className="w-28" />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {eligible.map((r, i) => (
                    <TableRow key={r.phone ?? r.customerName ?? i}>
                      <TableCell className="font-medium max-w-[140px] truncate">
                        {r.customerName ?? '—'}
                      </TableCell>
                      <TableCell className="font-mono text-sm">{r.phone ?? '—'}</TableCell>
                      <TableCell className="text-sm">{formatDate(r.orderDate)}</TableCell>
                      <TableCell className="text-sm font-medium text-orange-700">
                        {formatCurrency(r.totalPrice)}
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground">
                        {r.orderNumber ?? '—'}
                      </TableCell>
                      <TableCell>
                        <Button
                          size="sm"
                          variant="outline"
                          className="h-7 text-xs px-2 border-orange-300 text-orange-700 hover:bg-orange-50"
                          onClick={() => copyText(buildNotifyMessage(r), 'Customer info')}
                        >
                          <Copy className="h-3 w-3 mr-1" />
                          Notify CS
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        )}
      </Card>
    </div>
  )
}
