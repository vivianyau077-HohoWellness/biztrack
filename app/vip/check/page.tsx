'use client'

import { useState } from 'react'
import { Leaf, Crown, UserPlus } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { toast } from 'sonner'

// ── Types ─────────────────────────────────────────────────────────────────────

type VIPStatusCode = 'active' | 'expiring' | 'expired' | 'not_vip' | 'inactive'

interface LookupResult {
  phone: string
  found: boolean
  status: VIPStatusCode
  customerName: string | null
  brand: string | null
  vipSince?: string
  expiryDate?: string
  daysUntilExpiry?: number
  lastOrderDate?: string | null
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
  if (status === 'active')   return <Badge variant="success">Active VIP</Badge>
  if (status === 'expiring') return <Badge variant="warning">Expiring Soon</Badge>
  if (status === 'expired')  return <Badge variant="destructive">Expired</Badge>
  if (status === 'inactive') return <Badge variant="secondary">Inactive</Badge>
  return <Badge variant="secondary">Not VIP</Badge>
}

const STATUS_META: Record<VIPStatusCode, { icon: string; label: string; color: string }> = {
  active:   { icon: '🟢', label: 'Active VIP Member',           color: 'text-green-700' },
  expiring: { icon: '🟡', label: 'Expiring Soon',               color: 'text-yellow-600' },
  expired:  { icon: '🔴', label: 'VIP membership has expired',  color: 'text-red-600' },
  inactive: { icon: '⚫', label: 'Inactive — no recent orders', color: 'text-gray-500' },
  not_vip:  { icon: '⚪', label: 'Not a VIP member',            color: 'text-gray-500' },
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function VIPCheckPage() {
  const [phone, setPhone] = useState('')
  const [loading, setLoading] = useState(false)
  const [result, setResult] = useState<LookupResult | null>(null)
  const [claiming, setClaiming] = useState(false)

  // Registration state
  const [showRegister, setShowRegister] = useState(false)
  const [regName, setRegName] = useState('')
  const [regDob, setRegDob] = useState('')
  const [registering, setRegistering] = useState(false)

  async function handleLookup(e: React.FormEvent) {
    e.preventDefault()
    if (!phone.trim()) return

    setLoading(true)
    setResult(null)
    setShowRegister(false)

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

  async function handleRegister(e: React.FormEvent) {
    e.preventDefault()
    if (!regName.trim() || !result) return

    setRegistering(true)
    try {
      const res = await fetch('/api/vip/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone: result.phone, name: regName.trim(), dob: regDob || undefined }),
      })

      if (res.status === 429) {
        toast.error('Too many requests. Please wait before trying again.')
        return
      }

      const data = await res.json()
      if (!res.ok) {
        toast.error(data.error ?? 'Registration failed')
        return
      }

      toast.success('Registered successfully!')
      setShowRegister(false)

      // Re-run lookup to show updated status
      const lookupRes = await fetch('/api/vip/lookup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone: phone.trim() }),
      })
      if (lookupRes.ok) setResult(await lookupRes.json())
    } catch {
      toast.error('Network error. Please try again.')
    } finally {
      setRegistering(false)
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
      setResult(prev => prev
        ? { ...prev, giftClaimedAt: new Date().toISOString(), giftClaimYear: new Date().getFullYear(), giftAvailable: false }
        : null)
    } catch {
      toast.error('Network error. Please try again.')
    } finally {
      setClaiming(false)
    }
  }

  const isVIPStatus = result && (result.status === 'active' || result.status === 'expiring' || result.status === 'expired')

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

      {/* Status Result Card */}
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
            {/* Status Row */}
            {(() => {
              const meta = STATUS_META[result.status]
              return (
                <div className={`flex items-center gap-2 ${meta.color}`}>
                  <span className="text-lg">{meta.icon}</span>
                  <span className="text-sm font-medium">
                    {result.status === 'expiring'
                      ? `Expiring in ${result.daysUntilExpiry} days`
                      : meta.label}
                  </span>
                </div>
              )
            })()}

            {/* Inactive banner */}
            {result.status === 'inactive' && (
              <div className="bg-gray-100 border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-600">
                This customer has not ordered in over 365 days.
              </div>
            )}

            {/* VIP Details */}
            {isVIPStatus && (
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
                  <span className={`font-medium ${
                    result.status === 'expiring' ? 'text-yellow-600' :
                    result.status === 'expired'  ? 'text-red-600' : ''
                  }`}>
                    {formatDate(result.expiryDate)}
                  </span>
                </div>
                {result.daysUntilExpiry != null && result.daysUntilExpiry >= 0 && (
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Days Remaining</span>
                    <span className={`font-medium ${result.status === 'expiring' ? 'text-yellow-600' : ''}`}>
                      {result.daysUntilExpiry}d
                    </span>
                  </div>
                )}
                {result.lastOrderDate && (
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Last Order</span>
                    <span className="font-medium">{formatDate(result.lastOrderDate)}</span>
                  </div>
                )}
              </div>
            )}

            {/* Last order for inactive / not_vip */}
            {!isVIPStatus && result.lastOrderDate && (
              <div className="bg-muted/50 rounded-lg p-3 text-sm">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Last Order</span>
                  <span className="font-medium">{formatDate(result.lastOrderDate)}</span>
                </div>
              </div>
            )}

            {/* Birthday Gift */}
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

      {/* Not found → Registration option */}
      {result && !result.found && !showRegister && (
        <Card className="w-full max-w-md shadow-sm mt-4">
          <CardContent className="pt-6 pb-4 space-y-4">
            <p className="text-sm text-muted-foreground text-center">
              No records found for this phone number.
            </p>
            <Button
              variant="outline"
              className="w-full border-green-600 text-green-700 hover:bg-green-50 gap-2"
              onClick={() => setShowRegister(true)}
            >
              <UserPlus className="h-4 w-4" />
              Register as New Customer
            </Button>
          </CardContent>
        </Card>
      )}

      {/* Registration Form */}
      {result && !result.found && showRegister && (
        <Card className="w-full max-w-md shadow-sm mt-4">
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-base">
              <UserPlus className="h-5 w-5 text-green-600" />
              Register New Customer
            </CardTitle>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleRegister} className="space-y-4">
              <div className="space-y-1.5">
                <Label>Phone</Label>
                <Input value={result.phone} disabled className="bg-muted" />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="reg-name">Full Name <span className="text-red-500">*</span></Label>
                <Input
                  id="reg-name"
                  placeholder="Enter full name"
                  value={regName}
                  onChange={e => setRegName(e.target.value)}
                  autoComplete="off"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="reg-dob">Date of Birth <span className="text-muted-foreground text-xs">(optional)</span></Label>
                <Input
                  id="reg-dob"
                  type="date"
                  value={regDob}
                  onChange={e => setRegDob(e.target.value)}
                />
                <p className="text-xs text-muted-foreground">Used for birthday gift eligibility</p>
              </div>
              <div className="flex gap-2">
                <Button
                  type="button"
                  variant="outline"
                  className="flex-1"
                  onClick={() => setShowRegister(false)}
                  disabled={registering}
                >
                  Cancel
                </Button>
                <Button
                  type="submit"
                  className="flex-1 bg-green-700 hover:bg-green-800"
                  disabled={registering || !regName.trim()}
                >
                  {registering ? 'Registering...' : 'Register'}
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>
      )}

      <p className="mt-8 text-xs text-green-700/60">
        VIP status requires a single order ≥ RM700. Valid for 1 year from latest qualifying order.
      </p>
    </div>
  )
}
