'use client'

import { useState } from 'react'
import { Leaf, Crown, UserPlus, Pencil, CheckCircle2, X } from 'lucide-react'
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
  customer_id: string | null
  status: VIPStatusCode
  customerName: string | null
  brand: string | null
  vipSince?: string
  expiryDate?: string
  daysUntilExpiry?: number
  lastOrderDate?: string | null
  date_of_birth: string | null
  address: string | null
  giftClaimedAt: string | null
  giftClaimYear: number | null
  giftAvailable: boolean
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function formatDate(iso: string | undefined | null): string {
  if (!iso) return '—'
  return new Date(iso).toLocaleDateString('en-MY', { day: '2-digit', month: 'short', year: 'numeric' })
}

function normalizePhone(raw: string): string {
  let digits = raw.replace(/\D/g, '')
  if (digits.startsWith('0')) digits = digits.slice(1)
  if (!digits.startsWith('60')) digits = '60' + digits
  return digits
}

const STATUS_CONFIG: Record<VIPStatusCode, { icon: string; label: string; badgeClass: string; textClass: string }> = {
  active:   { icon: '🟢', label: 'Active VIP Member',          badgeClass: 'bg-green-100 text-green-800 border-green-300',  textClass: 'text-green-700' },
  expiring: { icon: '🟡', label: 'Expiring Soon',              badgeClass: 'bg-yellow-100 text-yellow-800 border-yellow-300', textClass: 'text-yellow-700' },
  expired:  { icon: '🔴', label: 'VIP Membership Expired',     badgeClass: 'bg-red-100 text-red-800 border-red-300',         textClass: 'text-red-600' },
  inactive: { icon: '⚫', label: 'Inactive — no recent orders', badgeClass: 'bg-gray-100 text-gray-700 border-gray-300',      textClass: 'text-gray-500' },
  not_vip:  { icon: '⚪', label: 'Not a VIP Member',           badgeClass: 'bg-gray-100 text-gray-600 border-gray-300',      textClass: 'text-gray-500' },
}

// ── Sub-components ────────────────────────────────────────────────────────────

function StatusBadge({ status }: { status: VIPStatusCode }) {
  const cfg = STATUS_CONFIG[status]
  return (
    <span className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-sm font-medium border ${cfg.badgeClass}`}>
      {cfg.icon} {cfg.label}
    </span>
  )
}

function DetailRow({ label, value, highlight }: { label: string; value: React.ReactNode; highlight?: boolean }) {
  return (
    <div className="flex justify-between items-center py-1.5 border-b border-gray-100 last:border-0">
      <span className="text-sm text-gray-500">{label}</span>
      <span className={`text-sm font-medium ${highlight ? 'text-yellow-700' : 'text-gray-900'}`}>{value}</span>
    </div>
  )
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function VIPCheckPage() {
  const [phoneInput, setPhoneInput] = useState('')
  const [loading, setLoading]       = useState(false)
  const [result, setResult]         = useState<LookupResult | null>(null)

  // Registration form
  const [showRegister, setShowRegister] = useState(false)
  const [regName, setRegName]           = useState('')
  const [regDob, setRegDob]             = useState('')
  const [regAddress, setRegAddress]     = useState('')
  const [registering, setRegistering]   = useState(false)

  // Inline profile edit
  const [editingProfile, setEditingProfile] = useState(false)
  const [editDob, setEditDob]               = useState('')
  const [editAddress, setEditAddress]       = useState('')
  const [savingProfile, setSavingProfile]   = useState(false)

  // Gift claim
  const [claiming, setClaiming] = useState(false)

  // ── Lookup ──────────────────────────────────────────────────────────────────

  async function handleLookup(e: React.FormEvent) {
    e.preventDefault()
    const raw = phoneInput.trim()
    if (!raw) return

    setLoading(true)
    setResult(null)
    setShowRegister(false)
    setEditingProfile(false)

    try {
      const res = await fetch('/api/vip/lookup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone: raw }),
      })

      if (res.status === 429) { toast.error('Too many lookups. Please wait before trying again.'); return }

      const data = await res.json()
      if (!res.ok) { toast.error(data.error ?? 'Lookup failed'); return }

      setResult(data)
    } catch {
      toast.error('Network error. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  // ── Register ────────────────────────────────────────────────────────────────

  async function handleRegister(e: React.FormEvent) {
    e.preventDefault()
    if (!regName.trim() || !result) return

    setRegistering(true)
    try {
      const res = await fetch('/api/vip/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          phone:   result.phone,
          name:    regName.trim(),
          dob:     regDob   || undefined,
          address: regAddress.trim() || undefined,
        }),
      })

      if (res.status === 429) { toast.error('Too many requests. Please wait.'); return }

      const data = await res.json()
      if (!res.ok) { toast.error(data.error ?? 'Registration failed'); return }

      toast.success('Customer registered!')
      setShowRegister(false)
      setRegName(''); setRegDob(''); setRegAddress('')

      // Re-lookup to show updated record
      const lookupRes = await fetch('/api/vip/lookup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone: result.phone }),
      })
      if (lookupRes.ok) setResult(await lookupRes.json())
    } catch {
      toast.error('Network error. Please try again.')
    } finally {
      setRegistering(false)
    }
  }

  // ── Profile update ──────────────────────────────────────────────────────────

  function openEditProfile() {
    setEditDob(result?.date_of_birth ?? '')
    setEditAddress(result?.address ?? '')
    setEditingProfile(true)
  }

  async function handleSaveProfile(e: React.FormEvent) {
    e.preventDefault()
    if (!result) return

    setSavingProfile(true)
    try {
      const res = await fetch('/api/vip/update-profile', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          phone:         result.phone,
          date_of_birth: editDob     || undefined,
          address:       editAddress.trim() || undefined,
        }),
      })

      if (res.status === 429) { toast.error('Too many requests. Please wait.'); return }

      const data = await res.json()
      if (!res.ok) { toast.error(data.error ?? 'Failed to update profile'); return }

      toast.success('Profile updated!')
      setResult(prev => prev
        ? { ...prev, date_of_birth: editDob || null, address: editAddress.trim() || null }
        : null,
      )
      setEditingProfile(false)
    } catch {
      toast.error('Network error. Please try again.')
    } finally {
      setSavingProfile(false)
    }
  }

  // ── Gift claim ──────────────────────────────────────────────────────────────

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
      if (!res.ok) { toast.error(data.error ?? 'Failed to mark gift as claimed'); return }
      toast.success('Birthday gift marked as claimed!')
      setResult(prev => prev
        ? { ...prev, giftClaimedAt: new Date().toISOString(), giftClaimYear: new Date().getFullYear(), giftAvailable: false }
        : null,
      )
    } catch {
      toast.error('Network error. Please try again.')
    } finally {
      setClaiming(false)
    }
  }

  // ── Derived state ───────────────────────────────────────────────────────────

  const isVIPStatus = result && ['active', 'expiring', 'expired'].includes(result.status)
  const profileIncomplete = result?.found && (!result.date_of_birth || !result.address)
  const currentYear = new Date().getFullYear()

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col items-center py-10 px-4">
      {/* ── Branding ──────────────────────────────────────────────────────── */}
      <div className="flex flex-col items-center gap-2 mb-8">
        <div className="bg-green-700 rounded-xl p-3 shadow-sm">
          <Leaf className="h-7 w-7 text-white" />
        </div>
        <h1 className="text-2xl font-bold text-gray-900">Hoho Wellness</h1>
        <p className="text-green-700 text-sm font-medium">CS — VIP Registration & Lookup</p>
      </div>

      {/* ── Phone Lookup Form ─────────────────────────────────────────────── */}
      <Card className="w-full max-w-md shadow-sm">
        <CardHeader className="pb-3 pt-5 px-5">
          <CardTitle className="flex items-center gap-2 text-base">
            <Crown className="h-4 w-4 text-yellow-500" />
            Customer Lookup
          </CardTitle>
        </CardHeader>
        <CardContent className="px-5 pb-5">
          <form onSubmit={handleLookup} className="space-y-3">
            <div className="space-y-1.5">
              <Label htmlFor="phone">Phone Number</Label>
              <div className="flex gap-2">
                <span className="flex items-center px-3 py-2.5 bg-gray-100 border border-input rounded-md text-sm text-gray-500 shrink-0 font-mono">
                  +60
                </span>
                <Input
                  id="phone"
                  type="tel"
                  inputMode="numeric"
                  placeholder="112345678"
                  value={phoneInput}
                  onChange={e => setPhoneInput(e.target.value)}
                  className="flex-1 text-base h-11"
                  autoComplete="off"
                  autoFocus
                />
              </div>
              <p className="text-xs text-gray-400">With or without country code — e.g. 0112345678 or 60112345678</p>
            </div>
            <Button
              type="submit"
              className="w-full h-11 bg-green-700 hover:bg-green-800 text-base"
              disabled={loading || !phoneInput.trim()}
            >
              {loading ? 'Checking...' : 'Check Customer'}
            </Button>
          </form>
        </CardContent>
      </Card>

      {/* ── Result: Customer Found ────────────────────────────────────────── */}
      {result?.found && (
        <div className="w-full max-w-md mt-4 space-y-3">
          {/* Status Card */}
          <Card className="shadow-sm">
            <CardContent className="px-5 pt-5 pb-4 space-y-4">
              {/* Name + status */}
              <div className="flex flex-col gap-2">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <p className="text-lg font-bold text-gray-900">{result.customerName ?? result.phone}</p>
                    <p className="text-sm text-gray-400 font-mono">{result.phone}</p>
                  </div>
                  <Button
                    size="sm"
                    variant="ghost"
                    className="h-8 px-2 text-gray-400 hover:text-gray-700 shrink-0 mt-0.5"
                    onClick={openEditProfile}
                    title="Edit profile"
                  >
                    <Pencil className="h-3.5 w-3.5" />
                  </Button>
                </div>
                <StatusBadge status={result.status} />
              </div>

              {/* VIP details */}
              {isVIPStatus && (
                <div className="bg-gray-50 rounded-lg px-4 py-3 space-y-0.5">
                  {result.brand && <DetailRow label="Brand" value={result.brand} />}
                  <DetailRow label="VIP Since"    value={formatDate(result.vipSince)} />
                  <DetailRow label="Valid Until"   value={formatDate(result.expiryDate)}
                    highlight={result.status === 'expiring'} />
                  {result.daysUntilExpiry != null && result.daysUntilExpiry >= 0 && (
                    <DetailRow label="Days Remaining"
                      value={`${result.daysUntilExpiry}d`}
                      highlight={result.status === 'expiring'} />
                  )}
                  {result.lastOrderDate && (
                    <DetailRow label="Last Order" value={formatDate(result.lastOrderDate)} />
                  )}
                </div>
              )}

              {/* Non-VIP last order */}
              {!isVIPStatus && result.lastOrderDate && (
                <div className="bg-gray-50 rounded-lg px-4 py-3">
                  <DetailRow label="Last Order" value={formatDate(result.lastOrderDate)} />
                </div>
              )}

              {/* Inactive note */}
              {result.status === 'inactive' && (
                <p className="text-xs text-gray-500 bg-gray-100 rounded px-3 py-2">
                  No orders in past 365 days.
                </p>
              )}

              {/* Birthday Gift */}
              <div className="border-t pt-3">
                <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2">Birthday Gift</p>
                {!result.date_of_birth ? (
                  <p className="text-sm text-gray-400">— No date of birth on file</p>
                ) : result.giftClaimYear === currentYear ? (
                  <div className="flex items-center gap-2 text-sm text-green-700">
                    <CheckCircle2 className="h-4 w-4" />
                    <span>Claimed on {formatDate(result.giftClaimedAt)}</span>
                  </div>
                ) : (
                  <div className="space-y-2">
                    <p className="text-sm text-gray-600">🎂 Not yet claimed this year</p>
                    {result.giftAvailable && (
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={handleClaimGift}
                        disabled={claiming}
                        className="w-full h-10 border-green-600 text-green-700 hover:bg-green-50"
                      >
                        {claiming ? 'Marking...' : 'Mark Birthday Gift as Claimed'}
                      </Button>
                    )}
                  </div>
                )}
              </div>
            </CardContent>
          </Card>

          {/* Incomplete profile banner */}
          {profileIncomplete && !editingProfile && (
            <div className="flex items-center justify-between bg-amber-50 border border-amber-200 rounded-lg px-4 py-3">
              <p className="text-sm text-amber-800">
                {!result.date_of_birth
                  ? 'Add DOB to enable birthday gift tracking'
                  : 'Profile missing address'}
              </p>
              <Button
                size="sm"
                variant="ghost"
                className="h-8 text-xs text-amber-700 hover:bg-amber-100 shrink-0 ml-2"
                onClick={openEditProfile}
              >
                Update
              </Button>
            </div>
          )}

          {/* Inline profile edit */}
          {editingProfile && (
            <Card className="shadow-sm border-green-200">
              <CardHeader className="pb-2 pt-4 px-5">
                <CardTitle className="text-sm font-semibold flex items-center justify-between">
                  Update Profile
                  <button onClick={() => setEditingProfile(false)} className="text-gray-400 hover:text-gray-600">
                    <X className="h-4 w-4" />
                  </button>
                </CardTitle>
              </CardHeader>
              <CardContent className="px-5 pb-5">
                <form onSubmit={handleSaveProfile} className="space-y-3">
                  <div className="space-y-1.5">
                    <Label htmlFor="edit-dob">Date of Birth</Label>
                    <Input
                      id="edit-dob"
                      type="date"
                      value={editDob}
                      onChange={e => setEditDob(e.target.value)}
                      className="h-11"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="edit-address">Address</Label>
                    <Input
                      id="edit-address"
                      placeholder="e.g. Jalan ABC, Kuala Lumpur"
                      value={editAddress}
                      onChange={e => setEditAddress(e.target.value)}
                      className="h-11"
                    />
                  </div>
                  <Button
                    type="submit"
                    className="w-full h-11 bg-green-700 hover:bg-green-800"
                    disabled={savingProfile}
                  >
                    {savingProfile ? 'Saving...' : 'Save Profile'}
                  </Button>
                </form>
              </CardContent>
            </Card>
          )}
        </div>
      )}

      {/* ── Result: Customer Not Found ────────────────────────────────────── */}
      {result && !result.found && (
        <div className="w-full max-w-md mt-4 space-y-3">
          <Card className="shadow-sm border-dashed">
            <CardContent className="px-5 py-5 text-center space-y-4">
              <p className="text-gray-500">No customer found for <span className="font-mono font-medium text-gray-700">{normalizePhone(phoneInput)}</span></p>
              {!showRegister && (
                <Button
                  variant="outline"
                  className="w-full h-11 border-green-600 text-green-700 hover:bg-green-50 gap-2"
                  onClick={() => setShowRegister(true)}
                >
                  <UserPlus className="h-4 w-4" />
                  Register New Customer
                </Button>
              )}
            </CardContent>
          </Card>

          {showRegister && (
            <Card className="shadow-sm border-green-200">
              <CardHeader className="pb-2 pt-4 px-5">
                <CardTitle className="text-sm font-semibold flex items-center justify-between">
                  <span className="flex items-center gap-2">
                    <UserPlus className="h-4 w-4 text-green-600" />
                    Register New Customer
                  </span>
                  <button onClick={() => setShowRegister(false)} className="text-gray-400 hover:text-gray-600">
                    <X className="h-4 w-4" />
                  </button>
                </CardTitle>
              </CardHeader>
              <CardContent className="px-5 pb-5">
                <form onSubmit={handleRegister} className="space-y-3">
                  <div className="space-y-1.5">
                    <Label>Phone</Label>
                    <Input value={normalizePhone(phoneInput)} disabled className="bg-gray-50 font-mono h-11" />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="reg-name">
                      Full Name <span className="text-red-500">*</span>
                    </Label>
                    <Input
                      id="reg-name"
                      placeholder="Customer full name"
                      value={regName}
                      onChange={e => setRegName(e.target.value)}
                      className="h-11"
                      autoComplete="off"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="reg-dob">
                      Date of Birth <span className="text-xs text-gray-400">(optional)</span>
                    </Label>
                    <Input
                      id="reg-dob"
                      type="date"
                      value={regDob}
                      onChange={e => setRegDob(e.target.value)}
                      className="h-11"
                    />
                    <p className="text-xs text-gray-400">Used for birthday gift eligibility</p>
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="reg-address">
                      Address <span className="text-xs text-gray-400">(optional)</span>
                    </Label>
                    <Input
                      id="reg-address"
                      placeholder="e.g. Jalan ABC, Kuala Lumpur"
                      value={regAddress}
                      onChange={e => setRegAddress(e.target.value)}
                      className="h-11"
                    />
                  </div>
                  <div className="flex gap-2 pt-1">
                    <Button
                      type="button"
                      variant="outline"
                      className="flex-1 h-11"
                      onClick={() => setShowRegister(false)}
                      disabled={registering}
                    >
                      Cancel
                    </Button>
                    <Button
                      type="submit"
                      className="flex-1 h-11 bg-green-700 hover:bg-green-800"
                      disabled={registering || !regName.trim()}
                    >
                      {registering ? 'Registering...' : 'Register'}
                    </Button>
                  </div>
                </form>
              </CardContent>
            </Card>
          )}
        </div>
      )}

      <p className="mt-10 text-xs text-gray-400 text-center">
        VIP status requires at least one order ≥ RM700. Valid for 1 year from latest qualifying order.
      </p>
    </div>
  )
}
