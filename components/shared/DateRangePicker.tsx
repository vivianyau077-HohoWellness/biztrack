'use client'

import { useState, useRef, useEffect } from 'react'
import { DayPicker, type DateRange } from 'react-day-picker'
import { format, subDays, startOfWeek, endOfWeek, startOfMonth, endOfMonth, subMonths, addMonths, startOfYear, endOfYear, subYears } from 'date-fns'
import { CalendarDays, ChevronLeft, ChevronRight, X } from 'lucide-react'
import { cn } from '@/lib/utils'

// ── Types ────────────────────────────────────────────────────────────────────

interface Props {
  dateFrom: string   // 'yyyy-MM-dd'
  dateTo: string     // 'yyyy-MM-dd'
  onChange: (from: string, to: string) => void
  disabled?: boolean
  className?: string
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function toStr(d: Date) {
  return format(d, 'yyyy-MM-dd')
}

function fromStr(s: string) {
  // parse as local date to avoid UTC offset issues
  const [y, m, d] = s.split('-').map(Number)
  return new Date(y, m - 1, d)
}

function fmtDisplay(s: string) {
  return format(fromStr(s), 'd MMM yyyy')
}

// ── Presets ──────────────────────────────────────────────────────────────────

function getPresets(): { label: string; from: () => string; to: () => string }[] {
  const today = new Date()
  return [
    { label: 'Today',             from: () => toStr(today),                     to: () => toStr(today) },
    { label: 'Yesterday',         from: () => toStr(subDays(today, 1)),          to: () => toStr(subDays(today, 1)) },
    { label: 'Today & Yesterday', from: () => toStr(subDays(today, 1)),          to: () => toStr(today) },
    { label: 'Last 7 days',       from: () => toStr(subDays(today, 6)),          to: () => toStr(today) },
    { label: 'Last 14 days',      from: () => toStr(subDays(today, 13)),         to: () => toStr(today) },
    { label: 'Last 28 days',      from: () => toStr(subDays(today, 27)),         to: () => toStr(today) },
    { label: 'Last 30 days',      from: () => toStr(subDays(today, 29)),         to: () => toStr(today) },
    { label: 'This week',         from: () => toStr(startOfWeek(today, { weekStartsOn: 1 })), to: () => toStr(endOfWeek(today, { weekStartsOn: 1 })) },
    { label: 'Last week',         from: () => toStr(startOfWeek(subDays(today, 7), { weekStartsOn: 1 })), to: () => toStr(endOfWeek(subDays(today, 7), { weekStartsOn: 1 })) },
    { label: 'This month',        from: () => toStr(startOfMonth(today)),        to: () => toStr(endOfMonth(today)) },
    { label: 'Last month',        from: () => { const lm = subMonths(today, 1); return toStr(startOfMonth(lm)) }, to: () => { const lm = subMonths(today, 1); return toStr(endOfMonth(lm)) } },
    { label: 'This year',         from: () => toStr(startOfYear(today)),         to: () => toStr(today) },
    { label: 'Last year',         from: () => { const ly = subYears(today, 1); return toStr(startOfYear(ly)) }, to: () => { const ly = subYears(today, 1); return toStr(endOfYear(ly)) } },
  ]
}

// ── Component ─────────────────────────────────────────────────────────────────

export default function DateRangePicker({ dateFrom, dateTo, onChange, disabled, className }: Props) {
  const [open, setOpen] = useState(false)
  const [pending, setPending] = useState<DateRange>({ from: fromStr(dateFrom), to: fromStr(dateTo) })
  // Track which month is shown in the left calendar
  const [leftMonth, setLeftMonth] = useState<Date>(() => fromStr(dateFrom))
  const wrapperRef = useRef<HTMLDivElement>(null)
  const PRESETS = getPresets()

  // Sync pending state when external values change (e.g. preset buttons outside)
  useEffect(() => {
    if (!open) {
      setPending({ from: fromStr(dateFrom), to: fromStr(dateTo) })
      setLeftMonth(fromStr(dateFrom))
    }
  }, [dateFrom, dateTo, open])

  // Close on click outside
  useEffect(() => {
    if (!open) return
    function handler(e: MouseEvent) {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target as Node)) {
        setOpen(false)
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [open])

  function applyPreset(preset: typeof PRESETS[0]) {
    const f = preset.from()
    const t = preset.to()
    setPending({ from: fromStr(f), to: fromStr(t) })
    setLeftMonth(fromStr(f))
  }

  function handleSelect(range: DateRange | undefined) {
    setPending(range ?? { from: undefined, to: undefined })
  }

  function handleUpdate() {
    if (pending.from && pending.to) {
      onChange(toStr(pending.from), toStr(pending.to))
      setOpen(false)
    } else if (pending.from) {
      // single day selected
      onChange(toStr(pending.from), toStr(pending.from))
      setOpen(false)
    }
  }

  function handleCancel() {
    setPending({ from: fromStr(dateFrom), to: fromStr(dateTo) })
    setOpen(false)
  }

  function handleOpen() {
    if (disabled) return
    setPending({ from: fromStr(dateFrom), to: fromStr(dateTo) })
    setLeftMonth(fromStr(dateFrom))
    setOpen(true)
  }

  const rightMonth = addMonths(leftMonth, 1)

  const pendingLabel = pending.from
    ? pending.to && pending.to !== pending.from
      ? `${format(pending.from, 'd MMM yyyy')} – ${format(pending.to, 'd MMM yyyy')}`
      : format(pending.from, 'd MMM yyyy')
    : `${fmtDisplay(dateFrom)} – ${fmtDisplay(dateTo)}`

  return (
    <div ref={wrapperRef} className={cn('relative', className)}>
      {/* Trigger */}
      <button
        type="button"
        onClick={handleOpen}
        disabled={disabled}
        className={cn(
          'inline-flex items-center gap-2 h-8 px-3 rounded-md border border-input bg-background text-sm shadow-sm transition-colors hover:bg-muted disabled:opacity-50 disabled:cursor-not-allowed',
          open && 'ring-1 ring-ring',
        )}
      >
        <CalendarDays className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
        <span className="font-medium">{fmtDisplay(dateFrom)}</span>
        <span className="text-muted-foreground">–</span>
        <span className="font-medium">{fmtDisplay(dateTo)}</span>
      </button>

      {/* Dropdown panel */}
      {open && (
        <div className="absolute left-0 top-full mt-2 z-50 rounded-xl border bg-background shadow-2xl overflow-hidden flex flex-col" style={{ minWidth: 680 }}>
          <div className="flex flex-1">
            {/* Left: presets */}
            <div className="w-44 border-r bg-muted/30 p-2 space-y-0.5 shrink-0">
              <p className="text-xs font-semibold text-muted-foreground px-2 py-1.5">Presets</p>
              {PRESETS.map(preset => {
                const pFrom = preset.from()
                const pTo   = preset.to()
                const active = pending.from && pending.to
                  && toStr(pending.from) === pFrom
                  && toStr(pending.to) === pTo
                return (
                  <button
                    key={preset.label}
                    type="button"
                    onClick={() => applyPreset(preset)}
                    className={cn(
                      'w-full text-left text-xs px-2 py-1.5 rounded-md transition-colors',
                      active
                        ? 'bg-primary text-primary-foreground font-medium'
                        : 'hover:bg-muted text-foreground',
                    )}
                  >
                    {preset.label}
                  </button>
                )
              })}
            </div>

            {/* Right: two-month calendar */}
            <div className="flex-1 p-3">
              <div className="flex items-center justify-between mb-2 px-1">
                <button
                  type="button"
                  onClick={() => setLeftMonth(m => subMonths(m, 1))}
                  className="p-1 rounded hover:bg-muted transition-colors"
                >
                  <ChevronLeft className="h-4 w-4" />
                </button>
                <div className="flex gap-12">
                  <span className="text-sm font-semibold">{format(leftMonth, 'MMMM yyyy')}</span>
                  <span className="text-sm font-semibold">{format(rightMonth, 'MMMM yyyy')}</span>
                </div>
                <button
                  type="button"
                  onClick={() => setLeftMonth(m => addMonths(m, 1))}
                  className="p-1 rounded hover:bg-muted transition-colors"
                >
                  <ChevronRight className="h-4 w-4" />
                </button>
              </div>

              {/* Two DayPickers side by side sharing the same selection */}
              <div className="flex gap-4">
                <DayPicker
                  mode="range"
                  month={leftMonth}
                  onMonthChange={() => {}} // controlled via our navigation
                  selected={pending}
                  onSelect={handleSelect}
                  showOutsideDays={false}
                  disableNavigation
                  className="text-sm"
                  classNames={{
                    months: '',
                    month: '',
                    caption: 'hidden',
                    table: 'w-full border-collapse',
                    head_row: 'flex',
                    head_cell: 'text-muted-foreground w-9 font-normal text-xs text-center',
                    row: 'flex w-full mt-1',
                    cell: cn(
                      'h-9 w-9 text-center text-sm relative p-0',
                      '[&:has([aria-selected].day-range-end)]:rounded-r-full',
                      '[&:has([aria-selected].day-range-start)]:rounded-l-full',
                      '[&:has([aria-selected])]:bg-primary/10',
                    ),
                    day: 'h-9 w-9 p-0 font-normal rounded-full hover:bg-muted aria-selected:opacity-100 transition-colors',
                    day_range_start: 'day-range-start !bg-primary text-primary-foreground rounded-full',
                    day_range_end: 'day-range-end !bg-primary text-primary-foreground rounded-full',
                    day_selected: '!bg-primary text-primary-foreground rounded-full',
                    day_today: 'font-bold underline',
                    day_outside: 'text-muted-foreground/50',
                    day_disabled: 'text-muted-foreground/30',
                    day_range_middle: 'aria-selected:bg-primary/10 aria-selected:text-foreground rounded-none',
                    day_hidden: 'invisible',
                  }}
                />
                <DayPicker
                  mode="range"
                  month={rightMonth}
                  onMonthChange={() => {}}
                  selected={pending}
                  onSelect={handleSelect}
                  showOutsideDays={false}
                  disableNavigation
                  className="text-sm"
                  classNames={{
                    months: '',
                    month: '',
                    caption: 'hidden',
                    table: 'w-full border-collapse',
                    head_row: 'flex',
                    head_cell: 'text-muted-foreground w-9 font-normal text-xs text-center',
                    row: 'flex w-full mt-1',
                    cell: cn(
                      'h-9 w-9 text-center text-sm relative p-0',
                      '[&:has([aria-selected].day-range-end)]:rounded-r-full',
                      '[&:has([aria-selected].day-range-start)]:rounded-l-full',
                      '[&:has([aria-selected])]:bg-primary/10',
                    ),
                    day: 'h-9 w-9 p-0 font-normal rounded-full hover:bg-muted aria-selected:opacity-100 transition-colors',
                    day_range_start: 'day-range-start !bg-primary text-primary-foreground rounded-full',
                    day_range_end: 'day-range-end !bg-primary text-primary-foreground rounded-full',
                    day_selected: '!bg-primary text-primary-foreground rounded-full',
                    day_today: 'font-bold underline',
                    day_outside: 'text-muted-foreground/50',
                    day_disabled: 'text-muted-foreground/30',
                    day_range_middle: 'aria-selected:bg-primary/10 aria-selected:text-foreground rounded-none',
                    day_hidden: 'invisible',
                  }}
                />
              </div>
            </div>
          </div>

          {/* Bottom bar */}
          <div className="border-t bg-muted/20 px-4 py-3 flex items-center gap-4">
            <p className="text-xs text-muted-foreground">Dates shown in Kuala Lumpur Time (MYT, UTC+8)</p>
            <div className="flex-1 text-xs font-medium text-center">{pendingLabel}</div>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={handleCancel}
                className="h-8 px-3 rounded-md border text-sm hover:bg-muted transition-colors"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleUpdate}
                disabled={!pending.from}
                className="h-8 px-4 rounded-md bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 transition-colors disabled:opacity-50"
              >
                Update
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
