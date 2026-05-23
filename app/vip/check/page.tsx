'use client'

import { useState } from 'react'
import { Leaf, Crown } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { toast } from 'sonner'

// ── Types ─────────────────────────────────────────────────────────────────────

type VIPStatusCode = 'active' | 'expiring' | 'expired' | 'not_vip'

interface LookupResult {
  phone: string
  found: boolean
  status: VIPStatusCode
  customerName: string | null
  brand: string | null
  vipSince?: string
  expiryDate?: string
  daysUntilExpiry?: number
  dateOfBirth: string | null
  giftClaimedAt: string | null
  giftClaimYear: number | null
  giftAvailable: boolean
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function formatDate(iso: string | undefined | null): string {
  if (!iso) return '—'
  return new Date(iso).toLocaleDateString('en-MY', { day: '2-digit', month: 'short', year: 'numeric' })
}

function StatusBadge({ status }: { status: VIPStatusCode }) {
  if (status === 'active') return <Badge variant="success">Active VIP</Badge>
  if (status === 'expiring') return <Badge variant="warning">Expiring Soon</Badge>
  if (status === 'expired') return <Badge variant="destructive">Expired</Badge>
  return <Badge variant="secondary">Not VIP</Badge>
}

function StatusIcon({ status }: { status: VIPStatusCode }) {
  if (status === 'active') return <span className="text-green-600 text-xl">✅</span>
  if (status === 'expiring') return <span className="text-yellow-500 text-xl">⚠️</span>
  return <span className="text-red-500 text-xl">❌</span>
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function VIPCheckPage() {
  const [phone, setPhone] = useState('')
  const [loading, setLoading] = useState(false)
  const [result, setResult] = useState<LookupResult | null>(null)
  const [claiming, setClaiming] = useState(false)

  async function handleLookup(e: React.FormEvent) {
    e.preventDefault()
    if (!phone.trim()) return

    setLoading(true)
    setResult(null)

    try {
      const res = await fetch('/api/vip/lookup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone: phone.trim() }),
      })

      if (res.status === 429) {
        toast.error('Too many lookups. Please wait before trying again.')
        return
      }

      const data = await res.json()
      if (!res.ok) {
        toast.error(data.error ?? 'Lookup failed')
        return
      }

      setResult(data)
    } catch {
      toast.error('Network error. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  async function handleClaimGift() {
    if (!result) return
    setClaiming(true)
    try {
      const res = await fetch('/api/vip/claim-gift', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone: result.phone }),
      })
      const data = await res.json()
      if (!res.ok) {
        toast.error(data.error ?? 'Failed to mark gift as claimed')
        return
      }
      toast.success('Birthday gift marked as claimed!')
      // Update result in place
      setResult(prev => prev
        ? {
            ...prev,
            giftClaimedAt: new Date().toISOString(),
            giftClaimYear: new Date().getFullYear(),
            giftAvailable: false,
          }
        : null)
    } catch {
      toast.error('Network error. Please try again.')
    } finally {
      setClaiming(false)
    }
  }

  return (
    <div className="min-h-screen bg-green-50 flex flex-col items-center py-12 px-4">
      {/* Branding */}
      <div className="flex flex-col items-center gap-2 mb-8">
        <div className="bg-green-600 rounded-xl p-3">
          <Leaf className="h-7 w-7 text-white" />
        </div>
        <h1 className="text-2xl font-bold text-green-900">Hoho Wellness</h1>
        <p className="text-green-700 text-sm">VIP Status Checker</p>
      </div>

      {/* Lookup Form */}
      <Card className="w-full max-w-md shadow-sm">
        <CardHeader className="pb-4">
          <CardTitle className="flex items-center gap-2 text-lg">
            <Crown className="h-5 w-5 text-yellow-500" />
            Check VIP Status
          </CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleLookup} className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="phone">Phone Number</Label>
              <div className="flex gap-2">
                <span className="flex items-center px-3 py-2 bg-muted border border-input rounded-md text-sm text-muted-foreground shrink-0">
                  +60
                </span>
                <Input
                  id="phone"
                  type="tel"
                  placeholder="112345678"
                  value={phone}
                  onChange={e => setPhone(e.target.value)}
                  className="flex-1"
                  autoComplete="off"
                />
              </div>
              <p className="text-xs text-muted-foreground">
                Enter with or without country code (e.g. 0112345678 or 60112345678)
              </p>
            </div>
            <Button type="submit" className="w-full bg-green-700 hover:bg-green-800" disabled={loading || !phone.trim()}>
              {loading ? 'Checking...' : 'Check VIP Status'}
            </Button>
          </form>
        </CardContent>
      </Card>

      {/* Results */}
      {result && (
        <Card className="w-full max-w-md shadow-sm mt-4">
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <CardTitle className="text-base">
                {result.customerName ?? result.phone}
              </CardTitle>
              <StatusBadge status={result.status} />
            </div>
          </CardHeader>
          <CardContent className="space-y-3">
            {/* VIP Status Row */}
            <div className="flex items-center gap-2">
              <StatusIcon status={result.status} />
              <span className="text-sm font-medium">
                {result.status === 'active' && 'Active VIP Member'}
                {result.status === 'expiring' && `Expiring in ${result.daysUntilExpiry} days`}
                {result.status === 'expired' && 'VIP membership has expired'}
                {result.status === 'not_vip' && 'Not a VIP member'}
              </span>
            </div>

            {(result.status === 'active' || result.status === 'expiring' || result.status === 'expired') && (
              <div className="bg-muted/50 rounded-lg p-3 space-y-2 text-sm">
                {result.brand && (
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Brand</span>
                    <span className="font-medium">{result.brand}</span>
                  </div>
                )}
                <div className="flex justify-between">
                  <span className="text-muted-foreground">VIP Since</span>
                  <span className="font-medium">{formatDate(result.vipSince)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Valid Until</span>
                  <span className={`font-medium ${result.status === 'expiring' ? 'text-yellow-600' : result.status === 'expired' ? 'text-red-600' : ''}`}>
                    {formatDate(result.expiryDate)}
                  </span>
                </div>
              </div>
            )}

            {/* Birthday Gift Section */}
            <div className="border-t pt-3">
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">
                Birthday Gift
              </p>
              {!result.dateOfBirth ? (
                <p className="text-sm text-muted-foreground">— No birthday on file</p>
              ) : result.giftClaimYear === new Date().getFullYear() ? (
                <div className="flex items-center gap-2 text-sm">
                  <span className="text-green-600">✅</span>
                  <span>Claimed on {formatDate(result.giftClaimedAt)}</span>
                </div>
              ) : (
                <div className="space-y-2">
                  <div className="flex items-center gap-2 text-sm">
                    <span className="text-red-500">❌</span>
                    <span>Not yet claimed this year</span>
                  </div>
                  {result.giftAvailable && (
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={handleClaimGift}
                      disabled={claiming}
                      className="w-full border-green-600 text-green-700 hover:bg-green-50"
                    >
                      {claiming ? 'Marking...' : 'Mark Birthday Gift as Claimed'}
                    </Button>
                  )}
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      )}

      {result && result.status === 'not_vip' && !result.found && (
        <Card className="w-full max-w-md shadow-sm mt-4">
          <CardContent className="pt-6 pb-4">
            <p className="text-sm text-muted-foreground text-center">
              No orders found for this phone number.
            </p>
          </CardContent>
        </Card>
      )}

      <p className="mt-8 text-xs text-green-700/60">
        VIP status requires a single order ≥ RM700 within the past 365 days.
      </p>
    </div>
  )
}
