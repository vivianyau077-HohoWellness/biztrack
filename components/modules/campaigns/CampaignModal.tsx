'use client'

import { useState, useEffect } from 'react'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { createClient } from '@/lib/supabase/client'
import { toast } from 'sonner'

const BRANDS     = ['NE', 'DD', 'Juji']
const PLATFORMS  = ['Facebook', 'TikTok', 'Shopee Ads', 'Lazada Ads', 'Google', 'Instagram', 'Other']
const STATUSES   = ['Draft', 'Active', 'Paused', 'Completed']
const OBJECTIVES = ['Sales', 'Brand Awareness', 'Lead Generation', 'Traffic']

interface Props {
  open: boolean
  onClose: () => void
  onSaved: () => void
  campaign?: any | null
}

const today = () => new Date().toISOString().slice(0, 10)

const EMPTY = {
  name: '', platform: '', brand: '', budget: '', spent: '0',
  start_date: today(), end_date: '', status: 'Draft',
  objective: 'Sales', target_product_id: '__none__', notes: '',
}

export default function CampaignModal({ open, onClose, onSaved, campaign }: Props) {
  const [form, setForm]       = useState(EMPTY)
  const [products, setProducts] = useState<any[]>([])
  const [saving, setSaving]   = useState(false)

  useEffect(() => {
    if (open) {
      loadProducts()
      setForm(campaign ? {
        name:              campaign.name ?? '',
        platform:          campaign.platform ?? '',
        brand:             campaign.brand ?? '',
        budget:            campaign.budget?.toString() ?? '',
        spent:             campaign.spent?.toString() ?? '0',
        start_date:        campaign.start_date ?? today(),
        end_date:          campaign.end_date ?? '',
        status:            campaign.status ?? 'Draft',
        objective:         campaign.objective ?? 'Sales',
        target_product_id: campaign.target_product_id ?? '__none__',
        notes:             campaign.notes ?? '',
      } : { ...EMPTY, start_date: today() })
    }
  }, [open, campaign])

  async function loadProducts() {
    const { data } = await createClient()
      .from('products')
      .select('id, sku, name')
      .order('name', { ascending: true })
    setProducts(data ?? [])
  }

  function set(key: string, val: string) {
    setForm(f => ({ ...f, [key]: val }))
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!form.name.trim() || !form.platform || !form.brand || !form.budget || !form.start_date) {
      toast.error('Name, Platform, Brand, Budget and Start Date are required')
      return
    }
    setSaving(true)
    try {
      const supabase = createClient()
      const payload: Record<string, any> = {
        name:              form.name.trim(),
        platform:          form.platform,
        brand:             form.brand,
        budget:            Number(form.budget),
        spent:             Number(form.spent) || 0,
        start_date:        form.start_date,
        end_date:          form.end_date || null,
        status:            form.status,
        objective:         form.objective,
        target_product_id: form.target_product_id !== '__none__' ? form.target_product_id : null,
        notes:             form.notes.trim() || null,
      }
      if (campaign) {
        const { error } = await supabase.from('campaigns').update(payload).eq('id', campaign.id)
        if (error) throw error
        toast.success('Campaign updated')
      } else {
        const { error } = await supabase.from('campaigns').insert(payload)
        if (error) throw error
        toast.success('Campaign created')
      }
      onSaved()
      onClose()
    } catch (err: any) {
      toast.error(err?.message ?? 'Failed to save campaign')
    } finally {
      setSaving(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={v => !v && onClose()}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{campaign ? 'Edit Campaign' : 'Add Campaign'}</DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-1.5">
            <Label>Campaign Name *</Label>
            <Input value={form.name} onChange={e => set('name', e.target.value)} placeholder="e.g. FIOR Raya Sale" />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Brand *</Label>
              <Select value={form.brand} onValueChange={v => set('brand', v)}>
                <SelectTrigger><SelectValue placeholder="Select brand" /></SelectTrigger>
                <SelectContent>
                  {BRANDS.map(b => <SelectItem key={b} value={b}>{b}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Platform *</Label>
              <Select value={form.platform} onValueChange={v => set('platform', v)}>
                <SelectTrigger><SelectValue placeholder="Select platform" /></SelectTrigger>
                <SelectContent>
                  {PLATFORMS.map(p => <SelectItem key={p} value={p}>{p}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Objective</Label>
              <Select value={form.objective} onValueChange={v => set('objective', v)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {OBJECTIVES.map(o => <SelectItem key={o} value={o}>{o}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Status</Label>
              <Select value={form.status} onValueChange={v => set('status', v)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {STATUSES.map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Budget (RM) *</Label>
              <Input type="number" step="0.01" min="0" value={form.budget}
                onChange={e => set('budget', e.target.value)} placeholder="0.00" />
            </div>
            <div className="space-y-1.5">
              <Label>Spent (RM)</Label>
              <Input type="number" step="0.01" min="0" value={form.spent}
                onChange={e => set('spent', e.target.value)} placeholder="0.00" />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Start Date *</Label>
              <Input type="date" value={form.start_date} onChange={e => set('start_date', e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label>End Date</Label>
              <Input type="date" value={form.end_date} onChange={e => set('end_date', e.target.value)} />
            </div>
          </div>

          {products.length > 0 && (
            <div className="space-y-1.5">
              <Label>Target Product (optional)</Label>
              <Select value={form.target_product_id} onValueChange={v => set('target_product_id', v)}>
                <SelectTrigger><SelectValue placeholder="No specific product" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none__">No specific product</SelectItem>
                  {products.map(p => (
                    <SelectItem key={p.id} value={p.id}>{p.sku} — {p.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          <div className="space-y-1.5">
            <Label>Notes</Label>
            <textarea
              value={form.notes}
              onChange={e => set('notes', e.target.value)}
              placeholder="Campaign notes, targeting details..."
              rows={2}
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2"
            />
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose}>Cancel</Button>
            <Button type="submit" disabled={saving}>{saving ? 'Saving...' : 'Save Campaign'}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
