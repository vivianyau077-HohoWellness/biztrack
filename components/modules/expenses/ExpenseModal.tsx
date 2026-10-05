'use client'

import { useState, useEffect } from 'react'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { createClient } from '@/lib/supabase/client'
import { toast } from 'sonner'

const CATEGORIES = [
  'Ad Spend', 'Shipping', 'Packaging', 'Staff Salary',
  'Platform Fees', 'SST', 'Rent', 'Utilities', 'Raw Materials', 'Other',
]
const BRANDS   = ['NE', 'DD', 'Juji']
const PAYMENTS = ['Cash', 'Bank Transfer', 'Credit Card', 'E-Wallet']

interface Props {
  open: boolean
  onClose: () => void
  onSaved: () => void
  expense?: any | null
}

const today = () => new Date().toISOString().slice(0, 10)

const EMPTY = {
  date: today(), category: '', brand: '__none__', amount: '',
  description: '', payment_method: 'Bank Transfer', recurring: false,
}

export default function ExpenseModal({ open, onClose, onSaved, expense }: Props) {
  const [form, setForm]     = useState(EMPTY)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (open) {
      setForm(expense ? {
        date:           expense.date ?? today(),
        category:       expense.category ?? expense.type ?? '',
        brand:          expense.brand ?? '__none__',
        amount:         expense.amount?.toString() ?? '',
        description:    expense.description ?? expense.notes ?? '',
        payment_method: expense.payment_method ?? 'Bank Transfer',
        recurring:      expense.recurring ?? false,
      } : { ...EMPTY, date: today() })
    }
  }, [open, expense])

  function set(key: string, val: any) {
    setForm(f => ({ ...f, [key]: val }))
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!form.category || !form.amount) {
      toast.error('Category and Amount are required')
      return
    }
    setSaving(true)
    try {
      const supabase = createClient()
      const payload: Record<string, any> = {
        date:           form.date,
        category:       form.category,
        type:           form.category, // backward compat
        brand:          form.brand !== '__none__' ? form.brand : null,
        amount:         Number(form.amount),
        description:    form.description.trim() || null,
        notes:          form.description.trim() || null, // backward compat
        payment_method: form.payment_method,
        recurring:      form.recurring,
      }
      if (expense) {
        const { error } = await supabase.from('expenses').update(payload).eq('id', expense.id)
        if (error) throw error
        toast.success('Expense updated')
      } else {
        const { error } = await supabase.from('expenses').insert(payload)
        if (error) throw error
        toast.success('Expense added')
      }
      onSaved()
      onClose()
    } catch (err: any) {
      toast.error(err?.message ?? 'Failed to save expense')
    } finally {
      setSaving(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={v => !v && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{expense ? 'Edit Expense' : 'Add Expense'}</DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Date *</Label>
              <Input type="date" value={form.date} onChange={e => set('date', e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label>Amount (RM) *</Label>
              <Input type="number" step="0.01" min="0" value={form.amount}
                onChange={e => set('amount', e.target.value)} placeholder="0.00" />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label>Category *</Label>
            <Select value={form.category} onValueChange={v => set('category', v)}>
              <SelectTrigger><SelectValue placeholder="Select category" /></SelectTrigger>
              <SelectContent>
                {CATEGORIES.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Brand (optional)</Label>
              <Select value={form.brand} onValueChange={v => set('brand', v)}>
                <SelectTrigger><SelectValue placeholder="Company-wide" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none__">Company-wide</SelectItem>
                  {BRANDS.map(b => <SelectItem key={b} value={b}>{b}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Payment Method</Label>
              <Select value={form.payment_method} onValueChange={v => set('payment_method', v)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {PAYMENTS.map(p => <SelectItem key={p} value={p}>{p}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="space-y-1.5">
            <Label>Description</Label>
            <textarea
              value={form.description}
              onChange={e => set('description', e.target.value)}
              placeholder="What is this expense for?"
              rows={2}
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2"
            />
          </div>

          <label className="flex items-center gap-2 text-sm cursor-pointer">
            <input
              type="checkbox"
              checked={form.recurring}
              onChange={e => set('recurring', e.target.checked)}
              className="rounded border-gray-300"
            />
            Recurring expense
          </label>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose}>Cancel</Button>
            <Button type="submit" disabled={saving}>{saving ? 'Saving...' : 'Save Expense'}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
