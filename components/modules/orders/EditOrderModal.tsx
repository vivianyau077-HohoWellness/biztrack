'use client'

import { useState, useEffect, useRef } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { updateOrder } from '@/app/actions/data'
import {
  setCustomerReceiptUrl, removeCustomerReceipt, updateCustomerName,
  updateCustomerPhone, updateCustomerAddress,
} from '@/app/actions/customers'
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

const CHANNELS = ['Facebook', 'TikTok', 'Shopee', 'Lazada', 'Xiaohongshu', 'WhatsApp', 'Website', 'Other']
const RECEIPT_BRANDS = ['NE', 'DD', 'Juji']

const PAYMENT_METHODS = [
  'None', 'Cash', 'CIMB (MYR)', 'KIPLEPAY SDN BHD', 'DHL ECOMMERCE - COD',
  'TOUCH N GO E WALLET', 'ATOME', 'LAZADA', 'SHOPEE', 'UOB BANK (SGD)',
  'NINJA VAN - COD', 'SINGAPORE - COD', 'PAYNOW - SINGAPORE', 'BILLPLZ', 'SINGAPORE JNT',
]
const COD_METHODS = new Set(['DHL ECOMMERCE - COD', 'NINJA VAN - COD', 'SINGAPORE - COD'])
const COD_REMARK = 'COD, call or Whatsapp customer 30 mins before arriving'

const PURCHASE_REASONS: Record<string, string[]> = {
  DD: [
    '眼袋/黑眼圈', '斑斑', '美白提亮', '毛孔', '只想保养', '皮肤敏感/痒',
    '糖尿伤口', '开刀伤口', '伤口', '牛皮癣', '湿疹', '三高', '其他',
    '紧致', '疤痕', '富贵手', '皮肤问题 风膜',
  ],
  Juji: [
    '备孕', '姨妈问题（量少）', 'PCOS多囊', '贫血/气血不足', '更年期',
    '保养身体', '量少', '迟到', '燥热 盗汗',
  ],
  FIOR: [
    '洗头/梳头掉多', '头顶发缝宽/发际线后移', '产前产后脱发', '头皮出油/扁塌',
    '保养、想养厚发量', '全都有', 'Alopecia', '头皮出油导致脱发',
    '1级', '2级', '3级', '4级', '5级', '6级',
  ],
}

interface Props { order: Order | null; onClose: () => void }

export default function EditOrderModal({ order, onClose }: Props) {
  const queryClient = useQueryClient()
  const [loading, setLoading] = useState(false)
  const { projects } = useProjects()

  const [customerName, setCustomerName] = useState('')
  const [customerPhone, setCustomerPhone] = useState('')
  const [customerAddress, setCustomerAddress] = useState('')
  const [date, setDate]             = useState('')
  const [projectId, setProjectId]   = useState('')
  const [packageId, setPackageId]   = useState('')
  const [packageName, setPackageName] = useState('')
  const [price, setPrice]           = useState('')
  const [channel, setChannel]       = useState('')
  const [isNewCustomer, setIsNewCustomer] = useState<boolean | null>(null)
  const [purchaseReason, setPurchaseReason] = useState('')
  const [remark, setRemark]         = useState('')
  const [paymentMethod1, setPaymentMethod1] = useState('')
  const [paymentMethod2, setPaymentMethod2] = useState('')
  const [customChannel, setCustomChannel] = useState(false)

  // Receipt state
  const [originalReceiptUrl, setOriginalReceiptUrl] = useState<string | null>(null)
  const [receiptUrl, setReceiptUrl] = useState<string | null>(null)
  const [receiptFilePath, setReceiptFilePath] = useState<string | null>(null)
  const [receiptRemoved, setReceiptRemoved] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [uploadError, setUploadError] = useState('')
  const fileInputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (!order) return
    setCustomerName((order.customers as any)?.name ?? '')
    setCustomerPhone((order.customers as any)?.phone ?? '')
    setCustomerAddress((order.customers as any)?.address ?? '')
    setDate(order.order_date ?? '')
    setProjectId(order.project_id ?? '')
    setPackageId(order.package_id ?? '')
    setPackageName(order.package_name ?? order.package_snapshot?.name ?? '')
    setPrice(String(order.total_price ?? ''))
    const orderChannel = order.channel ?? ''
    setChannel(orderChannel)
    setCustomChannel(!!orderChannel && !CHANNELS.includes(orderChannel))
    setIsNewCustomer(order.is_new_customer ?? null)
    setPurchaseReason(order.purchase_reason ?? '')
    setRemark((order as any).remark ?? '')
    setPaymentMethod1((order as any).payment_method_1 ?? '')
    setPaymentMethod2((order as any).payment_method_2 ?? '')
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
  const brandReasons = selectedProject ? PURCHASE_REASONS[selectedProject.name] : undefined

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
    } catch (err: any) {
      console.error('[EditOrderModal] receipt upload error:', err)
      setUploadError(err?.message ?? 'Upload failed, try again')
    } finally {
      setUploading(false)
    }
  }

  function handleRemoveReceipt() {
    if (receiptFilePath) {
      createClient().storage.from('receipts').remove([receiptFilePath]).catch(() => {})
      setReceiptFilePath(null)
    }
    setReceiptUrl(null)
    setReceiptRemoved(true)
    setUploadError('')
  }

  function handleCancelClose() {
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
        project_id: projectId || undefined,
        package_id: packageId || null,
        package_name: packageName || null,
        total_price: parseFloat(price) || 0,
        channel,
        purchase_reason: purchaseReason || null,
        remark: remark || null,
        payment_method_1: paymentMethod1 || null,
        payment_method_2: paymentMethod2 || null,
        is_new_customer: isNewCustomer,
      })

      const customerId = order.customer_id
      if (customerId) {
        const origName = (order.customers as any)?.name ?? ''
        if (customerName.trim() && customerName.trim() !== origName) {
          await updateCustomerName(customerId, customerName.trim())
        }

        const origPhone = (order.customers as any)?.phone ?? ''
        if (customerPhone !== origPhone) {
          await updateCustomerPhone(customerId, customerPhone.trim())
        }

        const origAddress = (order.customers as any)?.address ?? ''
        if (customerAddress !== origAddress) {
          await updateCustomerAddress(customerId, customerAddress.trim())
        }

        if (isReceiptBrand) {
          if (receiptUrl && receiptUrl !== originalReceiptUrl) {
            try { await setCustomerReceiptUrl(customerId, receiptUrl) } catch { /* best-effort */ }
            setReceiptFilePath(null)
          } else if (receiptRemoved && originalReceiptUrl) {
            try { await removeCustomerReceipt(customerId, '') } catch { /* best-effort */ }
          }
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
          {/* Customer Name */}
          <div className="space-y-1">
            <Label className="text-xs">Customer Name</Label>
            <Input
              value={customerName}
              onChange={e => setCustomerName(e.target.value)}
              placeholder="Customer name"
            />
          </div>

          {/* Phone Number */}
          <div className="space-y-1">
            <Label className="text-xs">Phone Number</Label>
            <Input
              value={customerPhone}
              onChange={e => setCustomerPhone(e.target.value)}
              placeholder="601xxxxxxxx"
            />
          </div>

          {/* Address */}
          <div className="space-y-1">
            <Label className="text-xs">Address 地址</Label>
            <textarea
              value={customerAddress}
              onChange={e => setCustomerAddress(e.target.value)}
              rows={2}
              placeholder="Delivery address…"
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm resize-none focus:outline-none focus:ring-1 focus:ring-ring"
            />
          </div>

          {/* Date */}
          <div className="space-y-1">
            <Label className="text-xs">Order Date</Label>
            <Input type="date" value={date} onChange={e => setDate(e.target.value)} />
          </div>

          {/* Channel */}
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

          {/* Brand + Package */}
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
            <Label className="text-xs">Package</Label>
            <Select value={packageId || 'none'} onValueChange={handlePackageSelect} disabled={!projectId}>
              <SelectTrigger><SelectValue placeholder={projectId ? 'Select package' : 'Pick brand first'} /></SelectTrigger>
              <SelectContent>
                <SelectItem value="none">— None / Manual —</SelectItem>
                {projectPackages.map(p => (
                  <SelectItem key={p.id} value={p.id}>[{p.code}] {p.name} — RM {p.price?.toFixed(2)}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            {!packageId && (
              <Input className="mt-1.5" value={packageName} onChange={e => setPackageName(e.target.value)} placeholder="Package / product name" />
            )}
          </div>

          {/* Total Price */}
          <div className="space-y-1">
            <Label className="text-xs">Total Price (RM)</Label>
            <Input type="number" step="0.01" value={price} onChange={e => setPrice(e.target.value)} />
          </div>

          {/* Payment Methods */}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label className="text-xs">Payment Method 1</Label>
              <select
                value={paymentMethod1}
                onChange={e => {
                  const v = e.target.value
                  setPaymentMethod1(v)
                  if (COD_METHODS.has(v) && !remark) setRemark(COD_REMARK)
                }}
                className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-ring h-9"
              >
                {PAYMENT_METHODS.map(m => <option key={m} value={m === 'None' ? '' : m}>{m}</option>)}
              </select>
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Payment Method 2</Label>
              <select
                value={paymentMethod2}
                onChange={e => {
                  const v = e.target.value
                  setPaymentMethod2(v)
                  if (COD_METHODS.has(v) && !remark) setRemark(COD_REMARK)
                }}
                className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-ring h-9"
              >
                {PAYMENT_METHODS.map(m => <option key={m} value={m === 'None' ? '' : m}>{m}</option>)}
              </select>
            </div>
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

          {/* Purchase Reason */}
          <div className="space-y-1">
            <Label className="text-xs">Purchase Reason 购买原因</Label>
            {brandReasons ? (
              <select
                value={purchaseReason}
                onChange={e => setPurchaseReason(e.target.value)}
                className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-ring h-9"
              >
                <option value="">Select reason...</option>
                {brandReasons.map(r => <option key={r} value={r}>{r}</option>)}
              </select>
            ) : (
              <textarea
                value={purchaseReason}
                onChange={e => setPurchaseReason(e.target.value)}
                rows={2}
                placeholder="e.g. Weight loss"
                className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm resize-none focus:outline-none focus:ring-1 focus:ring-ring"
              />
            )}
          </div>

          {/* Notes / Remark */}
          <div className="space-y-1">
            <Label className="text-xs">Notes / Remark 备注</Label>
            <textarea
              value={remark}
              onChange={e => setRemark(e.target.value)}
              rows={2}
              placeholder="Optional notes…"
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm resize-none focus:outline-none focus:ring-1 focus:ring-ring"
            />
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
