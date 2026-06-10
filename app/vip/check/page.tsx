'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import {
  Leaf, Crown, UserPlus, Pencil, CheckCircle2, X, Gift,
  FileText, ChevronDown, ChevronUp, Upload, Loader2, TriangleAlert, ScanLine,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
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
  vipSince?: string | null
  expiryDate?: string | null
  daysUntilExpiry?: number | null
  lastOrderDate?: string | null
  date_of_birth: string | null
  address: string | null
  giftClaimedAt: string | null
  giftClaimYear: number | null
  giftAvailable: boolean
  current_membership_year: number | null
  gift_claimed_this_year: boolean
  next_claim_date: string | null
  vip_member_number: string | null
}

interface ProductMatch {
  extracted_name: string
  extracted_sku: string | null
  matched_product_name: string | null
  matched_sku: string | null
  matched_price: number | null
  matched_brand: string | null
  match_type: 'sku' | 'name' | null
}

interface ReceiptData {
  receipt_number: string | null
  receipt_date: string | null
  receipt_amount: number | null
  supplier_name: string | null
  confidence: number
  duplicate: boolean
  ai_failed?: boolean
  products?: ProductMatch[]
  brand_detected: string | null
}

interface QuickSubmitResult {
  success: boolean
  is_vip_eligible: boolean
  is_new_vip: boolean
  member_number: string | null
  customer_name: string
  duplicate: boolean
  message: string
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

const STATUS_CONFIG: Record<VIPStatusCode, { icon: string; label: string; badgeClass: string }> = {
  active:   { icon: '🟢', label: 'Active VIP Member',           badgeClass: 'bg-green-100 text-green-800 border-green-300' },
  expiring: { icon: '🟡', label: 'Expiring Soon',               badgeClass: 'bg-yellow-100 text-yellow-800 border-yellow-300' },
  expired:  { icon: '🔴', label: 'VIP Membership Expired',      badgeClass: 'bg-red-100 text-red-800 border-red-300' },
  inactive: { icon: '⚫', label: 'Inactive — no recent orders', badgeClass: 'bg-gray-100 text-gray-700 border-gray-300' },
  not_vip:  { icon: '⚪', label: 'Not a VIP Member',            badgeClass: 'bg-gray-100 text-gray-600 border-gray-300' },
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

// ── Birthday Gift Section ─────────────────────────────────────────────────────

interface BirthdaySectionProps {
  result: LookupResult
  onClaimSuccess: (claimedAt: string, membershipYear: number, nextClaimDate: string) => void
}

function BirthdaySection({ result, onClaimSuccess }: BirthdaySectionProps) {
  const [showConfirm, setShowConfirm] = useState(false)
  const [claimedBy, setClaimedBy]     = useState('')
  const [claiming, setClaiming]       = useState(false)

  const isVip = ['active', 'expiring', 'expired'].includes(result.status)

  async function handleConfirmClaim() {
    setClaiming(true)
    try {
      const res = await fetch('/api/vip/claim-birthday', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone: result.phone, claimed_by: claimedBy.trim() || undefined }),
      })
      if (res.status === 429) { toast.error('Too many requests. Please wait.'); return }
      const data = await res.json()
      if (!res.ok) { toast.error(data.error ?? 'Failed to claim gift'); return }
      toast.success(`Birthday gift claimed — Year ${data.membershipYear}!`)
      setShowConfirm(false)
      setClaimedBy('')
      onClaimSuccess(data.claimedAt, data.membershipYear, data.nextClaimDate)
    } catch {
      toast.error('Network error. Please try again.')
    } finally {
      setClaiming(false)
    }
  }

  if (!isVip) {
    return (
      <div className="border-t pt-3">
        <GiftLabel />
        <p className="text-sm text-gray-400">— Not eligible (not a VIP member)</p>
      </div>
    )
  }

  const yr = result.current_membership_year

  if (result.gift_claimed_this_year) {
    return (
      <div className="border-t pt-3 space-y-2">
        <GiftLabel membershipYear={yr} />
        <div className="flex items-center gap-2 text-sm text-green-700">
          <CheckCircle2 className="h-4 w-4 shrink-0" />
          <span>Claimed on {formatDate(result.giftClaimedAt)}</span>
        </div>
        {result.next_claim_date && (
          <p className="text-xs text-gray-400">Next claim available: {formatDate(result.next_claim_date)}</p>
        )}
      </div>
    )
  }

  if (!showConfirm) {
    return (
      <div className="border-t pt-3 space-y-2">
        <GiftLabel membershipYear={yr} />
        <p className="text-sm text-gray-600">🎂 Available to claim</p>
        <Button
          size="sm" variant="outline"
          onClick={() => setShowConfirm(true)}
          className="w-full h-10 border-green-600 text-green-700 hover:bg-green-50 gap-2"
        >
          <Gift className="h-3.5 w-3.5" />
          Claim Birthday Gift
        </Button>
      </div>
    )
  }

  return (
    <div className="border-t pt-3 space-y-3">
      <GiftLabel membershipYear={yr} />
      <div className="bg-green-50 border border-green-200 rounded-lg px-4 py-3 space-y-3">
        <p className="text-sm font-semibold text-green-900 flex items-center gap-2">
          <Gift className="h-4 w-4" />Confirm Gift Claim
        </p>
        <div className="text-sm text-gray-700 space-y-1">
          <div className="flex justify-between">
            <span className="text-gray-500">Customer</span>
            <span className="font-medium">{result.customerName ?? result.phone}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-gray-500">Phone</span>
            <span className="font-mono">{result.phone}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-gray-500">Membership Year</span>
            <span className="font-medium">Year {yr}</span>
          </div>
        </div>
        <div className="space-y-1">
          <Label htmlFor="claimed-by" className="text-xs text-gray-600">
            Claimed By <span className="text-gray-400">(optional — defaults to "CS")</span>
          </Label>
          <Input id="claimed-by" placeholder="Your name" value={claimedBy}
            onChange={e => setClaimedBy(e.target.value)} className="h-9 text-sm" autoComplete="off" />
        </div>
        <div className="flex gap-2">
          <Button type="button" variant="outline" size="sm" className="flex-1 h-9"
            onClick={() => { setShowConfirm(false); setClaimedBy('') }} disabled={claiming}>
            Cancel
          </Button>
          <Button type="button" size="sm" className="flex-1 h-9 bg-green-700 hover:bg-green-800"
            onClick={handleConfirmClaim} disabled={claiming}>
            {claiming ? 'Confirming...' : 'Confirm Claim'}
          </Button>
        </div>
      </div>
    </div>
  )
}

function GiftLabel({ membershipYear }: { membershipYear?: number | null }) {
  return (
    <div className="flex items-center justify-between mb-2">
      <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide">Birthday Gift</p>
      {membershipYear != null && (
        <span className="text-xs text-gray-400 bg-gray-100 rounded px-1.5 py-0.5">Year {membershipYear}</span>
      )}
    </div>
  )
}

// ── Receipt Section ───────────────────────────────────────────────────────────

type ReceiptState = 'collapsed' | 'upload' | 'processing' | 'review' | 'success'

interface ReceiptSectionProps {
  phone: string
  customerName: string | null
}

function ReceiptSection({ phone, customerName }: ReceiptSectionProps) {
  const [state, setState]           = useState<ReceiptState>('collapsed')
  const [file, setFile]             = useState<File | null>(null)
  const [extracted, setExtracted]   = useState<ReceiptData | null>(null)
  const [aiFailed, setAiFailed]     = useState(false)
  const fileInputRef                = useRef<HTMLInputElement>(null)

  // Editable review fields
  const [recNum,  setRecNum]   = useState('')
  const [recDate, setRecDate]  = useState('')
  const [recAmt,  setRecAmt]   = useState('')
  const [recType, setRecType]  = useState('Offline Purchase - DD')
  const [claimedBy, setClaimedBy] = useState('')
  const [saving, setSaving]    = useState(false)
  const [copied, setCopied]    = useState(false)
  const [isDragging, setIsDragging] = useState(false)
  const [previewUrl, setPreviewUrl] = useState<string | null>(null)

  // Saved receipt summary for success state
  const [savedReceipt, setSavedReceipt] = useState<{ number: string; date: string; amount: string } | null>(null)

  function handleFileChange(f: File | null) {
    setFile(f)
    if (f) setPreviewUrl(URL.createObjectURL(f))
  }

  function handleCopyToClipboard() {
    const lines = [
      `Receipt No: ${recNum}`,
      `Date: ${recDate}`,
      `Amount: RM ${recAmt}`,
      `Type: ${recType}`,
      `Customer: ${customerName ?? phone}`,
      `Phone: ${phone}`,
    ]
    if (claimedBy.trim()) lines.push(`Claimed By: ${claimedBy.trim()}`)
    const text = lines.join('\n') + productMatchesToCopyText(extracted?.products ?? [])
    navigator.clipboard.writeText(text)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  function resetUpload() {
    setFile(null)
    setExtracted(null)
    setAiFailed(false)
    setState('upload')
    setPreviewUrl(null)
    if (fileInputRef.current) fileInputRef.current.value = ''
  }

  async function handleReadReceipt() {
    if (!file) return
    setState('processing')

    const fd = new FormData()
    fd.append('image', file)

    try {
      const res = await fetch('/api/vip/read-receipt', { method: 'POST', body: fd })
      if (res.status === 429) { toast.error('Too many requests. Please wait.'); setState('upload'); return }
      const data: ReceiptData & { ai_failed?: boolean } = await res.json()
      if (!res.ok) { toast.error((data as any).error ?? 'Failed to read receipt'); setState('upload'); return }

      setExtracted(data)
      setAiFailed(!!data.ai_failed)
      // Pre-fill review fields
      setRecNum(data.receipt_number ?? '')
      setRecDate(data.receipt_date ?? '')
      setRecAmt(data.receipt_amount != null ? String(data.receipt_amount) : '')
      setState('review')
    } catch {
      toast.error('Network error. Please try again.')
      setState('upload')
    }
  }

  const handleAutoScan = useCallback(async (f: File) => {
    if (f.size > 5 * 1024 * 1024) { toast.error('File too large (max 5 MB)'); return }
    setFile(f)
    setPreviewUrl(URL.createObjectURL(f))
    setState('processing')
    const fd = new FormData()
    fd.append('image', f)
    try {
      const res = await fetch('/api/vip/read-receipt', { method: 'POST', body: fd })
      if (res.status === 429) { toast.error('Too many requests. Please wait.'); setState('upload'); return }
      const data: ReceiptData & { ai_failed?: boolean } = await res.json()
      if (!res.ok) { toast.error((data as any).error ?? 'Failed to read receipt'); setState('upload'); return }
      setExtracted(data)
      setAiFailed(!!data.ai_failed)
      setRecNum(data.receipt_number ?? '')
      setRecDate(data.receipt_date ?? '')
      setRecAmt(data.receipt_amount != null ? String(data.receipt_amount) : '')
      setState('review')
    } catch {
      toast.error('Network error. Please try again.')
      setState('upload')
    }
  }, [])

  useEffect(() => {
    const handlePaste = (e: ClipboardEvent) => {
      const items = e.clipboardData?.items
      if (!items) return
      for (const item of Array.from(items)) {
        if (item.type.startsWith('image/')) {
          const f = item.getAsFile()
          if (f) {
            e.stopImmediatePropagation()
            handleAutoScan(f)
          }
          break
        }
      }
    }
    document.addEventListener('paste', handlePaste, { capture: true })
    return () => document.removeEventListener('paste', handlePaste, { capture: true })
  }, [handleAutoScan])

  function handleDrop(e: React.DragEvent) {
    e.preventDefault()
    e.stopPropagation()
    setIsDragging(false)
    const f = e.dataTransfer.files?.[0]
    if (f && f.type.startsWith('image/')) { handleAutoScan(f); return }
    const imageUrl = e.dataTransfer.getData('text/uri-list') || e.dataTransfer.getData('text/plain')
    if (imageUrl && imageUrl.startsWith('http')) {
      fetch(imageUrl)
        .then(r => r.blob())
        .then(blob => handleAutoScan(new File([blob], 'receipt.jpg', { type: blob.type || 'image/jpeg' })))
        .catch(() => console.warn('Could not fetch dragged image'))
    }
  }

  function handleDragOver(e: React.DragEvent) { e.preventDefault(); e.stopPropagation(); setIsDragging(true) }
  function handleDragLeave(e: React.DragEvent) { e.preventDefault(); setIsDragging(false) }

  async function handleSave() {
    if (!recNum.trim()) { toast.error('Receipt number is required'); return }
    setSaving(true)
    try {
      const res = await fetch('/api/vip/save-receipt', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          phone,
          customer_name:  customerName ?? '',
          receipt_number: recNum.trim(),
          receipt_date:   recDate || undefined,
          receipt_amount: recAmt ? Number(recAmt) : undefined,
          receipt_type:   recType.trim() || 'Offline Purchase - DD',
          claimed_by:     claimedBy.trim() || undefined,
        }),
      })
      const data = await res.json()
      if (res.status === 409) { toast.error('Receipt number already recorded.'); return }
      if (!res.ok) { toast.error(data.error ?? 'Failed to save receipt'); return }

      setSavedReceipt({
        number: recNum.trim(),
        date:   recDate,
        amount: recAmt ? `RM ${Number(recAmt).toLocaleString('en-MY')}` : '—',
      })
      toast.success('Receipt recorded in Lark!')
      setState('success')
    } catch {
      toast.error('Network error. Please try again.')
    } finally {
      setSaving(false)
    }
  }

  const confidenceLabel = extracted && !aiFailed
    ? extracted.confidence >= 0.8
      ? { text: '🟢 High confidence', cls: 'text-green-700' }
      : extracted.confidence >= 0.5
        ? { text: '🟡 Medium — please verify', cls: 'text-yellow-700' }
        : { text: '🔴 Low — please check carefully', cls: 'text-red-600' }
    : null

  // ── Collapsed header ────────────────────────────────────────────────────────
  if (state === 'collapsed') {
    return (
      <div className="border-t pt-3">
        <button
          onClick={() => setState('upload')}
          className="flex items-center justify-between w-full text-left"
        >
          <span className="flex items-center gap-2 text-xs font-semibold text-gray-400 uppercase tracking-wide">
            <FileText className="h-3.5 w-3.5" />
            Upload Receipt (Offline Purchase)
          </span>
          <ChevronDown className="h-4 w-4 text-gray-400" />
        </button>
      </div>
    )
  }

  // ── Upload ──────────────────────────────────────────────────────────────────
  if (state === 'upload') {
    return (
      <div className="border-t pt-3 space-y-3">
        <button
          onClick={() => setState('collapsed')}
          className="flex items-center justify-between w-full text-left"
        >
          <span className="flex items-center gap-2 text-xs font-semibold text-gray-400 uppercase tracking-wide">
            <FileText className="h-3.5 w-3.5" />
            Upload Receipt (Offline Purchase)
          </span>
          <ChevronUp className="h-4 w-4 text-gray-400" />
        </button>

        <div
          className={`border-2 border-dashed rounded-lg px-4 py-6 text-center cursor-pointer transition-colors ${isDragging ? 'border-green-500 bg-green-50/50' : 'border-gray-200 hover:border-green-400 hover:bg-green-50/30'}`}
          onClick={() => fileInputRef.current?.click()}
          onDrop={handleDrop}
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
        >
          {previewUrl
            ? <img src={previewUrl} className="w-24 h-24 object-cover rounded mx-auto mb-2" alt="Receipt preview" />
            : <Upload className="h-6 w-6 text-gray-300 mx-auto mb-2" />
          }
          <p className="text-sm text-gray-500">
            {file ? file.name : 'Drag receipt here, or tap to select'}
          </p>
          <p className="text-xs text-gray-400 mt-1">JPG, PNG, WEBP, HEIC · Max 5 MB</p>
          <p className="text-xs text-gray-400 mt-0.5">Also supports: paste (Cmd+V) · drag from WhatsApp · drag from Photos</p>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            capture="environment"
            className="hidden"
            onChange={e => handleFileChange(e.target.files?.[0] ?? null)}
          />
        </div>

        <Button
          className="w-full h-10 bg-green-700 hover:bg-green-800 gap-2"
          disabled={!file}
          onClick={handleReadReceipt}
        >
          <FileText className="h-4 w-4" />
          Read Receipt
        </Button>
      </div>
    )
  }

  // ── Processing ──────────────────────────────────────────────────────────────
  if (state === 'processing') {
    return (
      <div className="border-t pt-3 space-y-3">
        <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide flex items-center gap-2">
          <FileText className="h-3.5 w-3.5" />Upload Receipt (Offline Purchase)
        </p>
        {previewUrl && (
          <img src={previewUrl} className="w-24 h-24 object-cover rounded mx-auto" alt="Receipt preview" />
        )}
        <div className="flex items-center justify-center gap-3 py-4 text-gray-500">
          <Loader2 className="h-5 w-5 animate-spin text-green-600" />
          <span className="text-sm">Reading receipt with AI...</span>
        </div>
      </div>
    )
  }

  // ── Review ──────────────────────────────────────────────────────────────────
  if (state === 'review') {
    return (
      <div className="border-t pt-3 space-y-3">
        <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide flex items-center gap-2">
          <FileText className="h-3.5 w-3.5" />Upload Receipt (Offline Purchase)
        </p>

        {/* AI failed banner */}
        {aiFailed && (
          <div className="flex items-start gap-2 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
            <TriangleAlert className="h-4 w-4 text-amber-600 mt-0.5 shrink-0" />
            <p className="text-xs text-amber-800">AI couldn't read this receipt — please fill in manually</p>
          </div>
        )}

        {/* Confidence indicator */}
        {confidenceLabel && (
          <p className={`text-xs font-medium ${confidenceLabel.cls}`}>{confidenceLabel.text}</p>
        )}

        {/* Duplicate warning */}
        {extracted?.duplicate && (
          <div className="flex items-start gap-2 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
            <TriangleAlert className="h-4 w-4 text-red-600 mt-0.5 shrink-0" />
            <p className="text-xs text-red-800 font-medium">⚠️ Receipt number already recorded. Cannot save duplicate.</p>
          </div>
        )}

        <div className="space-y-2.5">
          <div className="space-y-1">
            <Label className="text-xs">Receipt Number <span className="text-red-500">*</span></Label>
            <Input value={recNum} onChange={e => setRecNum(e.target.value)} className="h-10 text-sm" placeholder="e.g. INV-00123" />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Receipt Date</Label>
            <Input type="date" value={recDate} onChange={e => setRecDate(e.target.value)} className="h-10 text-sm" />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Amount (RM)</Label>
            <Input type="number" step="0.01" value={recAmt} onChange={e => setRecAmt(e.target.value)} className="h-10 text-sm" placeholder="0.00" />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Receipt Type</Label>
            <Input value={recType} onChange={e => setRecType(e.target.value)} className="h-10 text-sm" />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Claimed By <span className="text-gray-400">(optional)</span></Label>
            <Input value={claimedBy} onChange={e => setClaimedBy(e.target.value)} className="h-10 text-sm" placeholder="Your name" autoComplete="off" />
          </div>
        </div>

        {extracted?.brand_detected === 'Juji' && (
          <div className="flex items-center gap-2 bg-green-50 border border-green-200 rounded-lg px-3 py-2 text-green-700 text-sm font-medium">
            ✅ Jujigrainz product confirmed
          </div>
        )}

        {extracted?.products && extracted.products.length > 0 && (
          <ProductMatchList products={extracted.products} />
        )}

        <div className="flex gap-2">
          <Button type="button" variant="outline" size="sm" className="flex-1 h-10"
            onClick={resetUpload} disabled={saving}>
            Re-upload
          </Button>
          <Button
            type="button" variant="outline" size="sm" className="flex-1 h-10"
            disabled={!recNum.trim()}
            onClick={handleCopyToClipboard}
          >
            {copied ? '✅ Copied!' : 'Copy to Clipboard'}
          </Button>
        </div>
        <Button
          type="button" size="sm"
          className="w-full h-10 bg-green-700 hover:bg-green-800"
          disabled={saving || !recNum.trim() || !!extracted?.duplicate}
          onClick={handleSave}
        >
          {saving ? <><Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />Saving...</> : 'Confirm & Save to Lark'}
        </Button>
      </div>
    )
  }

  // ── Success ─────────────────────────────────────────────────────────────────
  return (
    <div className="border-t pt-3 space-y-3">
      <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide flex items-center gap-2">
        <FileText className="h-3.5 w-3.5" />Upload Receipt (Offline Purchase)
      </p>
      <div className="bg-green-50 border border-green-200 rounded-lg px-4 py-3 space-y-2">
        <div className="flex items-center gap-2 text-green-700">
          <CheckCircle2 className="h-4 w-4 shrink-0" />
          <span className="text-sm font-semibold">Receipt recorded</span>
        </div>
        {savedReceipt && (
          <div className="text-sm text-gray-700 space-y-0.5">
            <div className="flex justify-between">
              <span className="text-gray-500">Receipt No</span>
              <span className="font-mono font-medium">{savedReceipt.number}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-500">Date</span>
              <span>{formatDate(savedReceipt.date)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-500">Amount</span>
              <span className="font-medium">{savedReceipt.amount}</span>
            </div>
          </div>
        )}
      </div>
      <Button type="button" variant="outline" size="sm" className="w-full h-10"
        onClick={resetUpload}>
        Upload Another Receipt
      </Button>
    </div>
  )
}

// ── Product Match List ────────────────────────────────────────────────────────

function isNoiseLine(name: string): boolean {
  return (
    /\d{5,}/.test(name) ||
    /jalan|bandar|selangor|puchong|kuala/i.test(name) ||
    /credit\s*card|gredit/i.test(name) ||
    /purchase\s*in|original\s*condition/i.test(name) ||
    /no\s*exchange|not\s*refundable/i.test(name) ||
    /terms\s*and\s*conditions/i.test(name) ||
    /service\s*provider|compression/i.test(name) ||
    /erve\s*portal/i.test(name) ||
    name.length < 5
  )
}

function ProductMatchList({ products }: { products: ProductMatch[] }) {
  const visible = products.filter(p => !isNoiseLine(p.extracted_name))
  if (visible.length === 0) return null
  return (
    <div className="space-y-1.5">
      <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide">
        📦 Products Detected
      </p>
      <div className="border border-gray-200 rounded-lg divide-y divide-gray-100 overflow-hidden">
        {visible.map((p, i) => (
          p.match_type ? (
            <div key={i} className="px-3 py-2 text-xs bg-white">
              <div className="flex items-start gap-2">
                <span className="mt-0.5 shrink-0">✅</span>
                <div className="flex-1 min-w-0">
                  <p className="font-medium text-gray-900 truncate">{p.matched_product_name}</p>
                  <p className="text-gray-400 truncate">
                    {p.matched_sku && <span className="font-mono mr-2">{p.matched_sku}</span>}
                    {p.matched_price != null && <span className="text-green-700 font-medium">RM {Number(p.matched_price).toLocaleString('en-MY', { minimumFractionDigits: 2 })}</span>}
                    {p.matched_brand && <span className="ml-2">[{p.matched_brand}]</span>}
                    {p.match_type === 'name' && <span className="ml-2 italic">(name match)</span>}
                  </p>
                </div>
              </div>
            </div>
          ) : (
            <div key={i} className="px-3 py-2 text-xs bg-white">
              <div className="flex items-center gap-2 text-gray-500">
                <span className="shrink-0">📦</span>
                <span className="truncate">{p.extracted_name}</span>
              </div>
            </div>
          )
        ))}
      </div>
    </div>
  )
}

function productMatchesToCopyText(products: ProductMatch[]): string {
  if (products.length === 0) return ''
  const lines = products.map(p =>
    p.match_type
      ? `${p.matched_product_name}${p.matched_sku ? ` (SKU: ${p.matched_sku})` : ''}${p.matched_price != null ? ` RM ${p.matched_price}` : ''}`
      : p.extracted_name
  )
  return `\n📦 Products:\n${lines.join('\n')}`
}

// ── Quick Receipt Scan ────────────────────────────────────────────────────────

type QuickScanState = 'collapsed' | 'upload' | 'processing' | 'details' | 'submitted'

function QuickReceiptScan() {
  const [state, setState]           = useState<QuickScanState>('collapsed')
  const [file, setFile]             = useState<File | null>(null)
  const [extracted, setExtracted]   = useState<ReceiptData | null>(null)
  const [aiFailed, setAiFailed]     = useState(false)
  const [copied, setCopied]         = useState(false)
  const [isDragging, setIsDragging] = useState(false)
  const [previewUrl, setPreviewUrl] = useState<string | null>(null)
  const [detailsName, setDetailsName]           = useState('')
  const [detailsPhone, setDetailsPhone]         = useState('')
  const [detailsAddress, setDetailsAddress]     = useState('')
  const [detailsClaimedBy, setDetailsClaimedBy] = useState('')
  const [submitting, setSubmitting]             = useState(false)
  const [submitResult, setSubmitResult]         = useState<QuickSubmitResult | null>(null)
  const fileInputRef                = useRef<HTMLInputElement>(null)

  function reset() {
    setFile(null)
    setExtracted(null)
    setAiFailed(false)
    setState('upload')
    setPreviewUrl(null)
    setDetailsName('')
    setDetailsPhone('')
    setDetailsAddress('')
    setDetailsClaimedBy('')
    setSubmitResult(null)
    if (fileInputRef.current) fileInputRef.current.value = ''
  }

  async function handleScan() {
    if (!file) return
    setState('processing')
    const fd = new FormData()
    fd.append('image', file)
    try {
      const res = await fetch('/api/vip/read-receipt', { method: 'POST', body: fd })
      if (res.status === 429) { toast.error('Too many requests. Please wait.'); setState('upload'); return }
      const data: ReceiptData & { ai_failed?: boolean } = await res.json()
      if (!res.ok) { toast.error((data as any).error ?? 'Failed to read receipt'); setState('upload'); return }
      setExtracted(data)
      setAiFailed(!!data.ai_failed)
      setState('details')
    } catch {
      toast.error('Network error. Please try again.')
      setState('upload')
    }
  }

  const handleAutoScan = useCallback(async (f: File) => {
    if (f.size > 5 * 1024 * 1024) { toast.error('File too large (max 5 MB)'); return }
    setFile(f)
    setPreviewUrl(URL.createObjectURL(f))
    setState('processing')
    const fd = new FormData()
    fd.append('image', f)
    try {
      const res = await fetch('/api/vip/read-receipt', { method: 'POST', body: fd })
      if (res.status === 429) { toast.error('Too many requests. Please wait.'); setState('upload'); return }
      const data: ReceiptData & { ai_failed?: boolean } = await res.json()
      if (!res.ok) { toast.error((data as any).error ?? 'Failed to read receipt'); setState('upload'); return }
      setExtracted(data)
      setAiFailed(!!data.ai_failed)
      setState('details')
    } catch {
      toast.error('Network error. Please try again.')
      setState('upload')
    }
  }, [])

  useEffect(() => {
    const handlePaste = (e: ClipboardEvent) => {
      const items = e.clipboardData?.items
      if (!items) return
      for (const item of Array.from(items)) {
        if (item.type.startsWith('image/')) {
          const f = item.getAsFile()
          if (f) {
            setState(s => s === 'collapsed' ? 'upload' : s)
            handleAutoScan(f)
          }
          break
        }
      }
    }
    document.addEventListener('paste', handlePaste)
    return () => document.removeEventListener('paste', handlePaste)
  }, [handleAutoScan])

  function handleDrop(e: React.DragEvent) {
    e.preventDefault()
    e.stopPropagation()
    setIsDragging(false)
    const f = e.dataTransfer.files?.[0]
    if (f && f.type.startsWith('image/')) { handleAutoScan(f); return }
    const imageUrl = e.dataTransfer.getData('text/uri-list') || e.dataTransfer.getData('text/plain')
    if (imageUrl && imageUrl.startsWith('http')) {
      fetch(imageUrl)
        .then(r => r.blob())
        .then(blob => handleAutoScan(new File([blob], 'receipt.jpg', { type: blob.type || 'image/jpeg' })))
        .catch(() => console.warn('Could not fetch dragged image'))
    }
  }

  function handleDragOver(e: React.DragEvent) { e.preventDefault(); e.stopPropagation(); setIsDragging(true) }
  function handleDragLeave(e: React.DragEvent) { e.preventDefault(); setIsDragging(false) }

  function handleCopy() {
    if (!submitResult || !extracted) return
    const phone = normalizePhone('60' + detailsPhone)
    const lines = [
      '📋 Receipt Record',
      '──────────────────────',
      `Customer: ${submitResult.customer_name}`,
      `Phone: +${phone}`,
      `Member No: ${submitResult.member_number ?? 'N/A'}`,
      '──────────────────────',
      `Receipt No: ${extracted.receipt_number ?? 'N/A'}`,
      `Date: ${formatDate(extracted.receipt_date)}`,
      `Amount: RM ${extracted.receipt_amount != null ? Number(extracted.receipt_amount).toLocaleString('en-MY', { minimumFractionDigits: 2 }) : 'N/A'}`,
      `Store: ${extracted.supplier_name ?? 'N/A'}`,
      `VIP Status: ${submitResult.is_vip_eligible ? 'Eligible ✅' : 'Not eligible ❌'}`,
      `Recorded by: ${detailsClaimedBy.trim() || 'CS'}`,
    ]
    navigator.clipboard.writeText(lines.join('\n'))
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  async function handleSubmitDetails() {
    if (!detailsName.trim() || !detailsPhone.trim()) return
    setSubmitting(true)
    const phone = '60' + detailsPhone.replace(/\D/g, '')
    try {
      const res = await fetch('/api/vip/save-quick-receipt', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          phone,
          customer_name: detailsName.trim(),
          receipt_number: extracted?.receipt_number ?? null,
          receipt_date: extracted?.receipt_date ?? null,
          receipt_amount: extracted?.receipt_amount ?? null,
          supplier_name: extracted?.supplier_name ?? null,
          products: extracted?.products
            ?.map(p => p.matched_product_name ?? p.extracted_name)
            .join(', ') || null,
          address: detailsAddress.trim() || null,
          claimed_by: detailsClaimedBy.trim() || undefined,
        }),
      })
      if (res.status === 429) { toast.error('Too many requests. Please wait.'); return }
      const data: QuickSubmitResult = await res.json()
      if (!res.ok) { toast.error((data as any).error ?? 'Failed to save receipt'); return }
      setSubmitResult(data)
      setState('submitted')
    } catch {
      toast.error('Network error. Please try again.')
    } finally {
      setSubmitting(false)
    }
  }

  const headerButton = (expanded: boolean) => (
    <button
      onClick={() => setState(expanded ? 'collapsed' : 'upload')}
      className="flex items-center justify-between w-full text-left"
    >
      <span className="flex items-center gap-2 text-sm font-semibold text-gray-700">
        <ScanLine className="h-4 w-4 text-blue-500" />
        Quick Receipt Scan
        <span className="text-xs font-normal text-gray-400">· Any brand</span>
      </span>
      {expanded
        ? <ChevronUp className="h-4 w-4 text-gray-400" />
        : <ChevronDown className="h-4 w-4 text-gray-400" />}
    </button>
  )

  // ── Collapsed ───────────────────────────────────────────────────────────────
  if (state === 'collapsed') {
    return (
      <Card className="w-full max-w-md shadow-sm">
        <CardContent className="px-5 py-4">
          {headerButton(false)}
        </CardContent>
      </Card>
    )
  }

  // ── Upload ──────────────────────────────────────────────────────────────────
  if (state === 'upload') {
    return (
      <Card className="w-full max-w-md shadow-sm">
        <CardContent className="px-5 pt-4 pb-5 space-y-3">
          {headerButton(true)}
          <p className="text-xs text-gray-400">Scan any receipt to extract info — no customer lookup needed.</p>
          <div
            className={`border-2 border-dashed rounded-lg px-4 py-6 text-center cursor-pointer transition-colors ${isDragging ? 'border-blue-500 bg-blue-50/50' : 'border-gray-200 hover:border-blue-400 hover:bg-blue-50/30'}`}
            onClick={() => fileInputRef.current?.click()}
            onDrop={handleDrop}
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
          >
            {previewUrl
              ? <img src={previewUrl} className="w-24 h-24 object-cover rounded mx-auto mb-2" alt="Receipt preview" />
              : <Upload className="h-6 w-6 text-gray-300 mx-auto mb-2" />
            }
            <p className="text-sm text-gray-500">
              {file ? file.name : 'Drag receipt here, or tap to select'}
            </p>
            <p className="text-xs text-gray-400 mt-1">JPG, PNG, WEBP, HEIC · Max 5 MB</p>
            <p className="text-xs text-gray-400 mt-0.5">Also supports: paste (Cmd+V) · drag from WhatsApp · drag from Photos</p>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              capture="environment"
              className="hidden"
              onChange={e => {
                const f = e.target.files?.[0] ?? null
                setFile(f)
                if (f) setPreviewUrl(URL.createObjectURL(f))
              }}
            />
          </div>
          <Button
            className="w-full h-10 bg-blue-600 hover:bg-blue-700 gap-2"
            disabled={!file}
            onClick={handleScan}
          >
            <ScanLine className="h-4 w-4" />
            Scan Receipt
          </Button>
        </CardContent>
      </Card>
    )
  }

  // ── Processing ──────────────────────────────────────────────────────────────
  if (state === 'processing') {
    return (
      <Card className="w-full max-w-md shadow-sm">
        <CardContent className="px-5 py-4 space-y-3">
          <div className="flex items-center gap-2 text-sm font-semibold text-gray-700">
            <ScanLine className="h-4 w-4 text-blue-500" />
            Quick Receipt Scan
          </div>
          {previewUrl && (
            <img src={previewUrl} className="w-24 h-24 object-cover rounded mx-auto" alt="Receipt preview" />
          )}
          <div className="flex items-center justify-center gap-3 py-4 text-gray-500">
            <Loader2 className="h-5 w-5 animate-spin text-blue-500" />
            <span className="text-sm">Reading receipt with AI...</span>
          </div>
        </CardContent>
      </Card>
    )
  }

  // ── Details ──────────────────────────────────────────────────────────────────
  if (state === 'details') {
    const canSubmit = detailsName.trim() && detailsPhone.trim()
    return (
      <Card className="w-full max-w-md shadow-sm">
        <CardContent className="px-5 pt-4 pb-5 space-y-3">
          <div className="flex items-center gap-2 text-sm font-semibold text-gray-700">
            <ScanLine className="h-4 w-4 text-blue-500" />
            Quick Receipt Scan
          </div>

          {extracted && (
            <div className="bg-gray-50 rounded-lg px-4 py-3 space-y-0.5">
              <p className="text-xs font-medium text-gray-400 uppercase tracking-wide mb-1">Receipt Info</p>
              {extracted.supplier_name && <DetailRow label="Store"      value={extracted.supplier_name} />}
              <DetailRow label="Receipt No" value={extracted.receipt_number ?? '—'} />
              <DetailRow label="Date"       value={formatDate(extracted.receipt_date)} />
              <DetailRow label="Amount"     value={
                extracted.receipt_amount != null
                  ? `RM ${Number(extracted.receipt_amount).toLocaleString('en-MY', { minimumFractionDigits: 2 })}`
                  : '—'
              } />
            </div>
          )}

          {extracted?.brand_detected === 'Juji' && (
            <div className="flex items-center gap-2 bg-green-50 border border-green-200 rounded-lg px-3 py-2 text-green-700 text-sm font-medium">
              ✅ Jujigrainz product confirmed
            </div>
          )}

          {aiFailed && (
            <div className="flex items-start gap-2 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
              <TriangleAlert className="h-4 w-4 text-amber-600 mt-0.5 shrink-0" />
              <p className="text-xs text-amber-800">AI couldn&apos;t read this receipt clearly — please verify the info above</p>
            </div>
          )}

          {extracted?.duplicate && (
            <div className="flex items-start gap-2 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
              <TriangleAlert className="h-4 w-4 text-amber-600 mt-0.5 shrink-0" />
              <p className="text-xs text-amber-800">This receipt may already be recorded</p>
            </div>
          )}

          <div className="space-y-3">
            <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">Customer Details</p>
            <div>
              <Label className="text-xs text-gray-500 mb-1 block">
                Name <span className="text-red-500">*</span>
              </Label>
              <Input
                value={detailsName}
                onChange={e => setDetailsName(e.target.value)}
                placeholder="Customer name"
                className="h-9 text-sm"
              />
            </div>
            <div>
              <Label className="text-xs text-gray-500 mb-1 block">
                Phone <span className="text-red-500">*</span>
              </Label>
              <div className="flex">
                <span className="flex items-center px-3 bg-gray-100 border border-r-0 border-input rounded-l-md text-sm text-gray-600 shrink-0">
                  +60
                </span>
                <Input
                  value={detailsPhone}
                  onChange={e => setDetailsPhone(e.target.value)}
                  placeholder="112345678"
                  type="tel"
                  className="h-9 text-sm rounded-l-none"
                />
              </div>
            </div>
            <div>
              <Label className="text-xs text-gray-500 mb-1 block">Address (optional)</Label>
              <Input
                value={detailsAddress}
                onChange={e => setDetailsAddress(e.target.value)}
                placeholder="Customer delivery address"
                className="h-9 text-sm"
              />
            </div>
            <div>
              <Label className="text-xs text-gray-500 mb-1 block">Claimed By</Label>
              <Input
                value={detailsClaimedBy}
                onChange={e => setDetailsClaimedBy(e.target.value)}
                placeholder="CS name (optional)"
                className="h-9 text-sm"
              />
            </div>
          </div>

          <div className="flex gap-2 pt-1">
            <Button type="button" variant="outline" size="sm" className="flex-1 h-10"
              onClick={reset}>
              Cancel
            </Button>
            <Button
              type="button" size="sm"
              className="flex-1 h-10 bg-blue-600 hover:bg-blue-700"
              disabled={!canSubmit || submitting}
              onClick={handleSubmitDetails}
            >
              {submitting
                ? <><Loader2 className="h-4 w-4 animate-spin mr-2" />Saving...</>
                : 'Check & Submit'}
            </Button>
          </div>
        </CardContent>
      </Card>
    )
  }

  // ── Submitted ─────────────────────────────────────────────────────────────────
  if (!submitResult) return null

  if (submitResult.duplicate) {
    return (
      <Card className="w-full max-w-md shadow-sm border-amber-200">
        <CardContent className="px-5 pt-4 pb-5 space-y-3">
          <div className="flex items-center gap-2 text-sm font-semibold text-gray-700">
            <ScanLine className="h-4 w-4 text-blue-500" />
            Quick Receipt Scan
          </div>
          <div className="bg-amber-50 border border-amber-200 rounded-lg px-4 py-4 space-y-1">
            <p className="font-semibold text-amber-800">⚠️ Duplicate Receipt</p>
            <p className="text-sm text-amber-700">This receipt number has already been recorded.</p>
          </div>
          <Button type="button" variant="outline" size="sm" className="w-full h-10"
            onClick={reset}>
            Scan Another
          </Button>
        </CardContent>
      </Card>
    )
  }

  return (
    <Card className={`w-full max-w-md shadow-sm ${submitResult.is_vip_eligible ? 'border-green-200' : 'border-gray-200'}`}>
      <CardContent className="px-5 pt-4 pb-5 space-y-3">
        <div className="flex items-center gap-2 text-sm font-semibold text-gray-700">
          <ScanLine className="h-4 w-4 text-blue-500" />
          Quick Receipt Scan
        </div>

        <div className={`rounded-lg px-4 py-3 space-y-2 ${submitResult.is_vip_eligible ? 'bg-green-50 border border-green-200' : 'bg-gray-50'}`}>
          <p className="font-semibold text-sm text-gray-900">
            {submitResult.is_vip_eligible ? '✅ Receipt Recorded — VIP Eligible!' : '✅ Receipt Recorded'}
          </p>
          <div className="space-y-0.5">
            <DetailRow label="Customer" value={submitResult.customer_name} />
            <DetailRow label="Phone"    value={`+${normalizePhone('60' + detailsPhone)}`} />
            {submitResult.is_vip_eligible && (
              <DetailRow
                label="Member No"
                value={submitResult.member_number ?? 'Pending — sync required'}
                highlight
              />
            )}
            <DetailRow
              label="Receipt"
              value={[
                extracted?.receipt_number,
                extracted?.receipt_amount != null
                  ? `RM ${Number(extracted.receipt_amount).toLocaleString('en-MY', { minimumFractionDigits: 2 })}`
                  : null,
                formatDate(extracted?.receipt_date),
              ].filter(Boolean).join(' · ')}
            />
            {extracted?.supplier_name && (
              <DetailRow label="Store" value={extracted.supplier_name} />
            )}
          </div>
          {!submitResult.is_vip_eligible && (
            <p className="text-xs text-gray-500">Amount below VIP threshold (RM 700)</p>
          )}
        </div>

        <div className="flex gap-2">
          <Button type="button" variant="outline" size="sm" className="flex-1 h-10"
            onClick={reset}>
            Scan Another
          </Button>
          <Button
            type="button" variant="outline" size="sm"
            className="flex-1 h-10 border-blue-400 text-blue-700 hover:bg-blue-50"
            onClick={handleCopy}
          >
            {copied ? '✅ Copied!' : 'Copy Summary'}
          </Button>
        </div>
      </CardContent>
    </Card>
  )
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function VIPCheckPage() {
  const [phoneInput, setPhoneInput] = useState('')
  const [loading, setLoading]       = useState(false)
  const [result, setResult]         = useState<LookupResult | null>(null)
  const [pageIsDragTarget, setPageIsDragTarget] = useState(false)

  const [showRegister, setShowRegister] = useState(false)
  const [regName, setRegName]           = useState('')
  const [regDob, setRegDob]             = useState('')
  const [regAddress, setRegAddress]     = useState('')
  const [registering, setRegistering]   = useState(false)

  const [editingProfile, setEditingProfile] = useState(false)
  const [editDob, setEditDob]               = useState('')
  const [editAddress, setEditAddress]       = useState('')
  const [savingProfile, setSavingProfile]   = useState(false)

  useEffect(() => {
    const onDragEnter = () => setPageIsDragTarget(true)
    const onDragLeave = (e: DragEvent) => { if (e.relatedTarget === null) setPageIsDragTarget(false) }
    const onDrop = () => setPageIsDragTarget(false)
    document.addEventListener('dragenter', onDragEnter)
    document.addEventListener('dragleave', onDragLeave)
    document.addEventListener('drop', onDrop)
    return () => {
      document.removeEventListener('dragenter', onDragEnter)
      document.removeEventListener('dragleave', onDragLeave)
      document.removeEventListener('drop', onDrop)
    }
  }, [])

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
    } catch { toast.error('Network error. Please try again.') }
    finally { setLoading(false) }
  }

  async function refreshLookup(phone: string) {
    const res = await fetch('/api/vip/lookup', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ phone }),
    })
    if (res.ok) setResult(await res.json())
  }

  async function handleRegister(e: React.FormEvent) {
    e.preventDefault()
    if (!regName.trim() || !result) return
    setRegistering(true)
    try {
      const res = await fetch('/api/vip/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          phone: result.phone, name: regName.trim(),
          dob: regDob || undefined, address: regAddress.trim() || undefined,
        }),
      })
      if (res.status === 429) { toast.error('Too many requests. Please wait.'); return }
      const data = await res.json()
      if (!res.ok) { toast.error(data.error ?? 'Registration failed'); return }
      toast.success('Customer registered!')
      setShowRegister(false)
      setRegName(''); setRegDob(''); setRegAddress('')
      await refreshLookup(result.phone)
    } catch { toast.error('Network error. Please try again.') }
    finally { setRegistering(false) }
  }

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
          phone: result.phone,
          date_of_birth: editDob || undefined,
          address: editAddress.trim() || undefined,
        }),
      })
      if (res.status === 429) { toast.error('Too many requests. Please wait.'); return }
      const data = await res.json()
      if (!res.ok) { toast.error(data.error ?? 'Failed to update profile'); return }
      toast.success('Profile updated!')
      setResult(prev => prev
        ? { ...prev, date_of_birth: editDob || null, address: editAddress.trim() || null }
        : null)
      setEditingProfile(false)
    } catch { toast.error('Network error. Please try again.') }
    finally { setSavingProfile(false) }
  }

  function handleClaimSuccess(claimedAt: string, membershipYear: number, nextClaimDate: string) {
    setResult(prev => prev
      ? { ...prev, giftClaimedAt: claimedAt, giftClaimYear: membershipYear,
          giftAvailable: false, gift_claimed_this_year: true, next_claim_date: nextClaimDate }
      : null)
  }

  const isVIPStatus       = result && ['active', 'expiring', 'expired'].includes(result.status)
  const profileIncomplete = result?.found && (!result.date_of_birth || !result.address)

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col items-center py-10 px-4">
      {pageIsDragTarget && (
        <div className="fixed inset-0 z-50 bg-green-500/20 border-4 border-dashed border-green-500 flex items-center justify-center pointer-events-none">
          <p className="text-green-700 text-2xl font-bold">Drop receipt here</p>
        </div>
      )}
      {/* ── Branding ──────────────────────────────────────────────────────── */}
      <div className="flex flex-col items-center gap-2 mb-8">
        <div className="bg-green-700 rounded-xl p-3 shadow-sm">
          <Leaf className="h-7 w-7 text-white" />
        </div>
        <h1 className="text-2xl font-bold text-gray-900">Hoho Wellness</h1>
        <p className="text-green-700 text-sm font-medium">CS — VIP Registration & Lookup</p>
      </div>

      {/* ── Quick Receipt Scan ───────────────────────────────────────────── */}
      <QuickReceiptScan />

      {/* ── Phone Lookup Form ─────────────────────────────────────────────── */}
      <Card className="w-full max-w-md shadow-sm mt-4">
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
                  id="phone" type="tel" inputMode="numeric" placeholder="112345678"
                  value={phoneInput} onChange={e => setPhoneInput(e.target.value)}
                  className="flex-1 text-base h-11" autoComplete="off" autoFocus
                />
              </div>
              <p className="text-xs text-gray-400">With or without country code — e.g. 0112345678 or 60112345678</p>
            </div>
            <Button type="submit" className="w-full h-11 bg-green-700 hover:bg-green-800 text-base"
              disabled={loading || !phoneInput.trim()}>
              {loading ? 'Checking...' : 'Check Customer'}
            </Button>
          </form>
        </CardContent>
      </Card>

      {/* ── Result: Customer Found ────────────────────────────────────────── */}
      {result?.found && (
        <div className="w-full max-w-md mt-4 space-y-3">
          <Card className="shadow-sm">
            <CardContent className="px-5 pt-5 pb-4 space-y-4">
              {/* Name + edit button */}
              <div className="flex flex-col gap-2">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <p className="text-lg font-bold text-gray-900">{result.customerName ?? result.phone}</p>
                    <p className="text-sm text-gray-400 font-mono">{result.phone}</p>
                  </div>
                  <Button size="sm" variant="ghost"
                    className="h-8 px-2 text-gray-400 hover:text-gray-700 shrink-0 mt-0.5"
                    onClick={openEditProfile} title="Edit profile">
                    <Pencil className="h-3.5 w-3.5" />
                  </Button>
                </div>
                <StatusBadge status={result.status} />
                {result.vip_member_number && (
                  <p className="text-xs font-mono text-yellow-700 bg-yellow-50 border border-yellow-200 rounded px-2 py-1 w-fit">
                    👑 {result.vip_member_number}
                  </p>
                )}
              </div>

              {/* VIP details */}
              {isVIPStatus && (
                <div className="bg-gray-50 rounded-lg px-4 py-3 space-y-0.5">
                  {result.brand && <DetailRow label="Brand" value={result.brand} />}
                  <DetailRow label="VIP Since"     value={formatDate(result.vipSince)} />
                  <DetailRow label="Valid Until"    value={formatDate(result.expiryDate)}
                    highlight={result.status === 'expiring'} />
                  {result.daysUntilExpiry != null && result.daysUntilExpiry >= 0 && (
                    <DetailRow label="Days Remaining" value={`${result.daysUntilExpiry}d`}
                      highlight={result.status === 'expiring'} />
                  )}
                  {result.lastOrderDate && (
                    <DetailRow label="Last Order" value={formatDate(result.lastOrderDate)} />
                  )}
                </div>
              )}

              {!isVIPStatus && result.lastOrderDate && (
                <div className="bg-gray-50 rounded-lg px-4 py-3">
                  <DetailRow label="Last Order" value={formatDate(result.lastOrderDate)} />
                </div>
              )}

              {result.status === 'inactive' && (
                <p className="text-xs text-gray-500 bg-gray-100 rounded px-3 py-2">
                  No orders in past 365 days.
                </p>
              )}

              <BirthdaySection result={result} onClaimSuccess={handleClaimSuccess} />

              <ReceiptSection phone={result.phone} customerName={result.customerName} />
            </CardContent>
          </Card>

          {/* Incomplete profile banner */}
          {profileIncomplete && !editingProfile && (
            <div className="flex items-center justify-between bg-amber-50 border border-amber-200 rounded-lg px-4 py-3">
              <p className="text-sm text-amber-800">
                {!result.date_of_birth ? 'Add DOB to enable birthday gift tracking' : 'Profile missing address'}
              </p>
              <Button size="sm" variant="ghost"
                className="h-8 text-xs text-amber-700 hover:bg-amber-100 shrink-0 ml-2"
                onClick={openEditProfile}>
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
                    <Input id="edit-dob" type="date" value={editDob}
                      onChange={e => setEditDob(e.target.value)} className="h-11" />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="edit-address">Address</Label>
                    <Input id="edit-address" placeholder="e.g. Jalan ABC, Kuala Lumpur"
                      value={editAddress} onChange={e => setEditAddress(e.target.value)} className="h-11" />
                  </div>
                  <Button type="submit" className="w-full h-11 bg-green-700 hover:bg-green-800"
                    disabled={savingProfile}>
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
              <p className="text-gray-500">
                No customer found for{' '}
                <span className="font-mono font-medium text-gray-700">{normalizePhone(phoneInput)}</span>
              </p>
              {!showRegister && (
                <Button variant="outline" className="w-full h-11 border-green-600 text-green-700 hover:bg-green-50 gap-2"
                  onClick={() => setShowRegister(true)}>
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
                    <UserPlus className="h-4 w-4 text-green-600" />Register New Customer
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
                    <Label htmlFor="reg-name">Full Name <span className="text-red-500">*</span></Label>
                    <Input id="reg-name" placeholder="Customer full name" value={regName}
                      onChange={e => setRegName(e.target.value)} className="h-11" autoComplete="off" />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="reg-dob">Date of Birth <span className="text-xs text-gray-400">(optional)</span></Label>
                    <Input id="reg-dob" type="date" value={regDob}
                      onChange={e => setRegDob(e.target.value)} className="h-11" />
                    <p className="text-xs text-gray-400">Used for birthday gift eligibility</p>
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="reg-address">Address <span className="text-xs text-gray-400">(optional)</span></Label>
                    <Input id="reg-address" placeholder="e.g. Jalan ABC, Kuala Lumpur"
                      value={regAddress} onChange={e => setRegAddress(e.target.value)} className="h-11" />
                  </div>
                  <div className="flex gap-2 pt-1">
                    <Button type="button" variant="outline" className="flex-1 h-11"
                      onClick={() => setShowRegister(false)} disabled={registering}>
                      Cancel
                    </Button>
                    <Button type="submit" className="flex-1 h-11 bg-green-700 hover:bg-green-800"
                      disabled={registering || !regName.trim()}>
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
        VIP status is set by CS in Lark. Birthday gift can be claimed once per membership year.
      </p>
    </div>
  )
}
