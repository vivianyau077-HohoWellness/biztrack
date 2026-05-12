'use client'

import { useState, useEffect, useRef } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { updateOrder } from '@/app/actions/data'
import { setCustomerReceiptUrl, removeCustomerReceipt } from '@/app/actions/customers'
import { createClient } from '@/lib/supabase/client'
import { useProjects, type Package } from '@/lib/hooks/useProjects'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { toast } from 'sonner'
import { cn } from '@/lib/utils'
import type { Order } from '@/lib/types'

const MALAYSIA_STATES = [
  'Johor', 'Kedah', 'Kelantan', 'Melaka', 'Negeri Sembilan', 'Pahang',
  'Penang', 'Perak', 'Perlis', 'Sabah', 'Sarawak', 'Selangor', 'Terengganu',
  'Kuala Lumpur', 'Labuan', 'Putrajaya',
]

const STATUSES = ['pending', 'processing', 'shipped', 'delivered', 'cancelled']
const PAYMENT_STATUSES = ['Settled', 'Pending', 'Refunded']
const DELIVERY_STATUSES = ['Pending', 'Delivered', 'Returned']
const CHANNELS = ['Facebook', 'TikTok', 'Shopee', 'Lazada', 'Xiaohongshu', 'WhatsApp', 'Website', 'Other']
const RECEIPT_BRANDS = ['NE', 'DD', 'Juji']

interface Props { order: Order | null; onClose: () => void }

export default function EditOrderModal({ order, onClose }: Props) {
  const queryClient = useQueryClient()
  const [loading, setLoading] = useState(false)
  const { projects } = useProjects()

  const [date, setDate]             = useState('')
  const [tracking, setTracking]     = useState('')
  const [projectId, setProjectId]   = useState('')
  const [packageId, setPackageId]   = useState('')
  const [packageName, setPackageName] = useState('')
  const [price, setPrice]           = useState('')
  const [channel, setChannel]       = useState('')
  const [state, setState]           = useState('')
  const [isCod, setIsCod]           = useState(false)
  const [paymentStatus, setPaymentStatus] = useState('Settled')
  const [status, setStatus]         = useState('pending')
  const [deliveryStatus, setDeliveryStatus] = useState('Pending')
  const [notes, setNotes]           = useState('')
  const [isNewCustomer, setIsNewCustomer] = useState<boolean | null>(null)
  const [customState, setCustomState] = useState(false)
  const [customChannel, setCustomChannel] = useState(false)

  // Receipt state
  const [originalReceiptUrl, setOriginalReceiptUrl] = useState<string | null>(null)
  const [receiptUrl, setReceiptUrl] = useState<string | null>(null)
  const [receiptFilePath, setReceiptFilePath] = useState<string | null>(null) // path of newly uploaded file
  const [receiptRemoved, setReceiptRemoved] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [uploadError, setUploadError] = useState('')
  const fileInputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (!order) return
    setDate(order.order_date ?? '')
    setTracking(order.tracking_number ?? '')
    setProjectId(order.project_id ?? '')
    setPackageId(order.package_id ?? '')
    setPackageName(order.package_name ?? order.package_snapshot?.name ?? '')
    setPrice(String(order.total_price ?? ''))
    const orderChannel = order.channel ?? ''
    setChannel(orderChannel)
    setCustomChannel(!!orderChannel && !CHANNELS.includes(orderChannel))
    const orderState = order.state ?? ''
    setState(orderState)
    setCustomState(!!orderState && !MALAYSIA_STATES.includes(orderState))
    setIsCod(order.is_cod ?? false)
    setPaymentStatus(order.payment_status ?? 'Settled')
    setStatus(order.status ?? 'pending')
    setDeliveryStatus(order.delivery_status ?? 'Pending')
    setNotes(order.purchase_reason ?? '')
    setIsNewCustomer(order.is_new_customer ?? null)
    // Load existing receipt
    const existing = (order.customers as any)?.receipt_url ?? null
    setOriginalReceiptUrl(existing)
    setReceiptUrl(existing)
    setReceiptFilePath(null)
    setReceiptRemoved(false)
    setUploading(false)
    setUploadError('')
  }, [order])

  const projectPackages: Package[] = projects.find(p => p.id === projectId)?.packages ?? []
  const selectedProject = projects.find(p => p.id === projectId)
  const isReceiptBrand = RECEIPT_BRANDS.includes(selectedProject?.name ?? '')

  async function handleFileSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    if (fileInputRef.current) fileInputRef.current.value = ''

    const ALLOWED = ['image/jpeg', 'image/png', 'image/webp']
    if (!ALLOWED.includes(file.type)) {
      setUploadError('Only JPG, PNG, WEBP images are allowed')
      return
    }
    if (file.size > 5 * 1024 * 1024) {
      setUploadError('File must be under 5MB')
      return
    }

    setUploading(true)
    setUploadError('')

    // Remove previously uploaded (not-yet-saved) file if any
    if (receiptFilePath) {
      createClient().storage.from('receipts').remove([receiptFilePath]).catch(() => {})
      setReceiptFilePath(null)
    }

    const timestamp = Date.now()
    const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_')
    const path = `orders/${timestamp}_${safeName}`

    try {
      const supabase = createClient()
      const { error } = await supabase.storage.from('receipts').upload(path, file, {
        contentType: file.type,
        upsert: true,
      })
      if (error) throw error
      const { data: { publicUrl } } = supabase.storage.from('receipts').getPublicUrl(path)
      setReceiptUrl(publicUrl)
      setReceiptFilePath(path)
      setReceiptRemoved(false)
    } catch {
      setUploadError('Upload failed, try again')
    } finally {
      setUploading(false)
    }
  }

  function handleRemoveReceipt() {
    // If there's a newly uploaded file, delete it from storage immediately
    if (receiptFilePath) {
      createClient().storage.from('receipts').remove([receiptFilePath]).catch(() => {})
      setReceiptFilePath(null)
    }
    setReceiptUrl(null)
    setReceiptRemoved(true)
    setUploadError('')
  }

  function handleCancelClose() {
    // If a new file was uploaded but we're cancelling, delete it
    if (receiptFilePath) {
      createClient().storage.from('receipts').remove([receiptFilePath]).catch(() => {})
    }
    onClose()
  }

  function handlePackageSelect(pkgId: string) {
    if (pkgId === 'none') { setPackageId(''); setPackageName(''); return }
    const pkg = projectPackages.find(p => p.id === pkgId)
    if (!pkg) return
    setPackageId(pkg.id)
    setPackageName(pkg.name)
    setPrice(String(pkg.price))
  }

  async function handleSave() {
    if (!order) return
    setLoading(true)
    try {
      await updateOrder(order.id, {
        order_date: date,
        tracking_number: tracking || null,
        project_id: projectId || undefined,
        package_id: packageId || null,
        package_name: packageName || null,
        total_price: parseFloat(price) || 0,
        channel,
        state: state || null,
        is_cod: isCod,
        payment_status: paymentStatus,
        status,
        delivery_status: deliveryStatus || null,
        purchase_reason: notes || null,
        is_new_customer: isNewCustomer,
      })

      const customerId = order.customer_id
      if (customerId && isReceiptBrand) {
        if (receiptUrl && receiptUrl !== originalReceiptUrl) {
          // New image uploaded — save URL
          try { await setCustomerReceiptUrl(customerId, receiptUrl) } catch { /* best-effort */ }
          setReceiptFilePath(null) // committed — don't delete on close
        } else if (receiptRemoved && originalReceiptUrl) {
          // User removed existing receipt — clear it
          try { await removeCustomerReceipt(customerId, '') } catch { /* best-effort */ }
        }
      }

      toast.success('Order updated')
      queryClient.invalidateQueries({ queryKey: ['orders'] })
      queryClient.invalidateQueries({ queryKey: ['dashboard'] })
      onClose()
    } catch (e: any) {
      toast.error(e.message ?? 'Failed to update order')
    } finally {
      setLoading(false)
    }
  }

  return (
    <Dialog open={!!order} onOpenChange={() => handleCancelClose()}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader><DialogTitle>Edit Order</DialogTitle></DialogHeader>
        <div className="space-y-3">
          {/* Date + Tracking */}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label className="text-xs">Order Date</Label>
              <Input type="date" value={date} onChange={e => setDate(e.target.value)} />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Tracking Number</Label>
              <Input value={tracking} onChange={e => setTracking(e.target.value)} placeholder="Tracking #" />
            </div>
          </div>

          {/* Project + Channel */}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label className="text-xs">Brand</Label>
              <Select value={projectId} onValueChange={v => { setProjectId(v); setPackageId(''); setPackageName('') }}>
                <SelectTrigger><SelectValue placeholder="Select brand" /></SelectTrigger>
                <SelectContent>
                  {projects.map(p => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Channel</Label>
              <Select
                value={CHANNELS.includes(channel) ? channel : channel ? 'custom' : ''}
                onValueChange={v => {
                  if (v === 'custom') { setCustomChannel(true); setChannel('') }
                  else { setCustomChannel(false); setChannel(v) }
                }}
              >
                <SelectTrigger><SelectValue placeholder="Select channel" /></SelectTrigger>
                <SelectContent>
                  {CHANNELS.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                  <SelectItem value="custom">Custom…</SelectItem>
                </SelectContent>
              </Select>
              {(customChannel || (channel && !CHANNELS.includes(channel))) && (
                <Input className="mt-1.5" value={channel} onChange={e => setChannel(e.target.value)} placeholder="Enter channel name" />
              )}
            </div>
          </div>

          {/* Package */}
          <div className="space-y-1">
            <Label className="text-xs">Package</Label>
            <Select value={packageId || 'none'} onValueChange={handlePackageSelect} disabled={!projectId}>
              <SelectTrigger><SelectValue placeholder={projectId ? 'Select package' : 'Pick brand first'} /></SelectTrigger>
              <SelectContent>
                <SelectItem value="none">— None / Manual —</SelectItem>
                {projectPackages.map(p => (
                  <SelectItem key={p.id} value={p.id}>[{p.code}] {p.name} — RM {p.price.toFixed(2)}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            {!packageId && (
              <Input className="mt-1.5" value={packageName} onChange={e => setPackageName(e.target.value)} placeholder="Package / product name" />
            )}
          </div>

          {/* Price + Status */}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label className="text-xs">Total Price (RM)</Label>
              <Input type="number" step="0.01" value={price} onChange={e => setPrice(e.target.value)} />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Delivery Status</Label>
              <Select value={status} onValueChange={setStatus}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {STATUSES.map(s => <SelectItem key={s} value={s} className="capitalize">{s}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* State */}
          <div className="space-y-1">
            <Label className="text-xs">State</Label>
            <Select
              value={MALAYSIA_STATES.includes(state) ? state : state ? 'custom' : ''}
              onValueChange={v => {
                if (v === 'custom') { setCustomState(true); setState('') }
                else { setCustomState(false); setState(v) }
              }}
            >
              <SelectTrigger><SelectValue placeholder="Select state" /></SelectTrigger>
              <SelectContent>
                {MALAYSIA_STATES.map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}
                <SelectItem value="custom">Other (International)</SelectItem>
              </SelectContent>
            </Select>
            {(customState || (state && !MALAYSIA_STATES.includes(state))) && (
              <Input value={state} onChange={e => setState(e.target.value)} placeholder="Enter state / country" />
            )}
          </div>

          {/* COD + Payment Status */}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label className="text-xs">Payment Method</Label>
              <Select value={isCod ? 'cod' : 'prepaid'} onValueChange={v => setIsCod(v === 'cod')}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="prepaid">Prepaid</SelectItem>
                  <SelectItem value="cod">COD</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Payment Status</Label>
              <Select value={paymentStatus} onValueChange={setPaymentStatus}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {PAYMENT_STATUSES.map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Delivery Status */}
          <div className="space-y-1">
            <Label className="text-xs">Delivery Status</Label>
            <Select value={deliveryStatus} onValueChange={setDeliveryStatus}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {DELIVERY_STATUSES.map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>

          {/* Notes / Purchase Reason */}
          <div className="space-y-1">
            <Label className="text-xs">Notes / Purchase Reason</Label>
            <Input value={notes} onChange={e => setNotes(e.target.value)} placeholder="e.g. Weight loss" />
          </div>

          {/* New / Repeat */}
          <div className="space-y-1">
            <Label className="text-xs">New / Repeat</Label>
            <Select
              value={isNewCustomer === null ? '' : isNewCustomer ? 'new' : 'repeat'}
              onValueChange={v => setIsNewCustomer(v === 'new')}
            >
              <SelectTrigger><SelectValue placeholder="— Not set —" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="new">New</SelectItem>
                <SelectItem value="repeat">Repeat</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Receipt Image (NE / DD / Juji only) */}
          {isReceiptBrand && (
            <div className="space-y-1">
              <Label className="text-xs">Receipt Image</Label>
              {receiptUrl ? (
                <div className="space-y-2">
                  <img src={receiptUrl} alt="Receipt" className="h-20 rounded border object-cover" />
                  <div className="flex gap-2">
                    <label className={cn('cursor-pointer text-xs text-muted-foreground underline', uploading && 'opacity-50 pointer-events-none')}>
                      {uploading ? 'Uploading…' : 'Replace'}
                      <input
                        ref={fileInputRef}
                        type="file"
                        accept="image/jpeg,image/png,image/webp"
                        className="sr-only"
                        onChange={handleFileSelect}
                      />
                    </label>
                    <button type="button" onClick={handleRemoveReceipt} className="text-xs text-destructive underline">Remove</button>
                  </div>
                </div>
              ) : (
                <label
                  className={cn(
                    'flex flex-col items-center justify-center gap-1 border border-dashed rounded-md p-3 cursor-pointer',
                    'text-xs text-muted-foreground hover:border-primary/50 transition-colors',
                    uploading && 'opacity-60 pointer-events-none',
                  )}
                >
                  {uploading ? (
                    <span className="flex items-center gap-1.5">
                      <svg className="animate-spin h-3 w-3" viewBox="0 0 24 24" fill="none">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
                      </svg>
                      Uploading…
                    </span>
                  ) : (
                    <>
                      <span>Click to upload receipt</span>
                      <span className="text-[10px]">JPG, PNG, WEBP · max 5MB</span>
                    </>
                  )}
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="image/jpeg,image/png,image/webp"
                    className="sr-only"
                    onChange={handleFileSelect}
                  />
                </label>
              )}
              {uploadError && <p className="text-xs text-destructive">{uploadError}</p>}
              {receiptRemoved && !receiptUrl && (
                <p className="text-xs text-muted-foreground">Receipt will be removed on save. <button type="button" className="underline" onClick={() => { setReceiptUrl(originalReceiptUrl); setReceiptRemoved(false) }}>Undo</button></p>
              )}
            </div>
          )}

          <div className="flex justify-end gap-2 pt-2">
            <Button variant="outline" onClick={handleCancelClose}>Cancel</Button>
            <Button onClick={handleSave} disabled={loading}>{loading ? 'Saving…' : 'Save Changes'}</Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
