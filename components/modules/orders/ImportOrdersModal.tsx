'use client'

import { useState, useRef, useEffect } from 'react'
import Papa from 'papaparse'
import { useQueryClient, useQuery } from '@tanstack/react-query'
import {
  fetchActivePackages,
  bulkUpsertCustomers,
  bulkInsertOrders,
  fetchExistingTrackingNumbers,
  createImportBatch,
  updateImportBatch,
  fetchImportMappings,
  saveImportMapping,
  generateOrderId,
} from '@/app/actions/data'
import { processOrdersBatch } from '@/app/actions/order-processing'
import { useProjects } from '@/lib/hooks/useProjects'
import type { Project } from '@/lib/hooks/useProjects'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { toast } from 'sonner'
import { Upload, AlertCircle, RefreshCw, CheckCircle2, XCircle, Save, ChevronRight } from 'lucide-react'

// ── Types ──────────────────────────────────────────────────────────────────────

type Step = 'upload' | 'mapping' | 'preview' | 'done'
type RowError = 'missing_name' | 'invalid_price' | 'missing_date'
type RowStatus = 'ready' | 'warning' | 'error' | 'skip'
type CsvFormat = 'A' | 'B' | 'DD' | 'DD2025' | 'unknown'

interface ParsedRow {
  orderRef: string
  date: string
  customerName: string
  phone: string
  packageName: string
  trackingNumber: string | null
  totalPrice: number
  listPrice: number | null
  channel: string
  address: string
  isRepeat: boolean
  isCod: boolean
  codAmount: number | null
  shippingFee: number | null
  courier: string
  country: string
  projectId: string | null
  packageId: string | null
  productName: string
  remark: string
  state: string
  sourceId: string | null
  errors: RowError[]
  status: RowStatus
  packageMatched: boolean
  skipReason?: string
  importWarning?: string
  needsAutoId?: boolean
}

interface ImportResult {
  success: number
  warnings: number
  skipped: number
  errors: number
  errorDetails: string[]
  totalRevenue: number
  prepaidCount: number
  codCount: number
  batchId: string | null
}

interface FieldDef {
  key: string
  label: string
  required: boolean
  autoKeys: string[]
}

// ── Format detection ───────────────────────────────────────────────────────────

function detectFormat(headers: string[]): CsvFormat {
  const lower = headers.map(h => h.toLowerCase().trim())
  if (lower.includes('线上单号')) return 'A'
  if (lower.some(h => h.includes('receiver name'))) return 'B'
  // DD2025 legacy format: has 'Chanel' (typo), 'Phone number', 'Price', but NO 'Order code'
  if (lower.includes('chanel') && lower.includes('phone number') && lower.includes('price') && !lower.includes('order code')) return 'DD2025'
  // DD format: has 'order code' column (e.g. DD003120)
  if (lower.includes('order code')) return 'DD'
  // fallback heuristics
  if (lower.includes('full phone no') || lower.includes('parcel')) return 'B'
  if (lower.includes('name') && lower.includes('phone number')) return 'A'
  return 'unknown'
}

// ── Field auto-key maps ────────────────────────────────────────────────────────

const FORMAT_A_AUTO_KEYS: Record<string, string[]> = {
  tracking:      ['线上单号', 'Tracking Number', 'Tracking', 'AWB'],
  date:          ['Date'],
  customer_name: ['Name'],
  phone:         ['Phone number', 'Phone no'],
  channel:       ['Channel'],
  package:       ['Package'],
  package_code:  ['商品编码'],
  price:         ['Total Price'],
  list_price:    ['Fior Prices'],
  address:       ['Address line (1)', 'Address'],
  postcode:      ['Postcode (1)', 'Postcode'],
  city:          ['City (1)', 'City'],
  state:         ['State'],
  cod:           ['COD'],
  cod_amount:    ['代收货款金额'],
  shipping_fee:  ['运费'],
  courier:       ['店铺'],
  customer_type: ['new/repeat Manual'],
  remark:        ['Purchase reason'],
}

const FORMAT_B_AUTO_KEYS: Record<string, string[]> = {
  row_number:      ['Number'],
  track_2026:      ['Track 2026'],
  track_2025:      ['Track 2025'],
  date:            ['Date'],
  customer_name:   ['Receiver Name'],
  phone:           ['Full Phone No'],
  phone2:          ['Phone no'],
  channel:         ['Channel'],
  package:         ['Package'],
  price:           ['Total Price'],
  remark:          ['Remark', 'Purchase reason'],
  courier:         ['Parcel'],
  customer_type:   ['new/repeat Manual'],
  source_id:       ['Shopee Order No'],
  payment_method:  ['Payment Method', 'Payment method', 'payment method'],
  price_domain:    ['Price Domain', 'price domain', 'COD Amount'],
}

const FORMAT_DD_AUTO_KEYS: Record<string, string[]> = {
  date:           ['Date'],
  channel:        ['Channel'],
  customer_name:  ['Name'],
  phone:          ['Phone Number'],
  package:        ['Package'],
  price:          ['Total Price'],
  remark:         ['Remark'],
  payment_method: ['Payment method', 'Payment Method'],
  state:          ['State'],
  tracking:       ['Order code'],
  customer_type:  ['New or Repeat'],
}

const FORMAT_DD2025_AUTO_KEYS: Record<string, string[]> = {
  date:           ['Date'],
  channel:        ['Chanel'],
  customer_name:  ['Name'],
  phone:          ['Phone number'],
  package:        ['Package'],
  price:          ['Price'],
  remark:         ['Purchase reason Copy'],
  customer_type:  ['New/repeat'],
}

// ── Field definitions ──────────────────────────────────────────────────────────

const FIELD_DEFS_A: FieldDef[] = [
  { key: 'tracking',      label: 'Tracking Number',  required: false, autoKeys: FORMAT_A_AUTO_KEYS.tracking },
  { key: 'date',          label: 'Order Date',        required: true,  autoKeys: FORMAT_A_AUTO_KEYS.date },
  { key: 'customer_name', label: 'Customer Name',     required: true,  autoKeys: FORMAT_A_AUTO_KEYS.customer_name },
  { key: 'phone',         label: 'Phone',             required: false, autoKeys: FORMAT_A_AUTO_KEYS.phone },
  { key: 'channel',       label: 'Channel',           required: false, autoKeys: FORMAT_A_AUTO_KEYS.channel },
  { key: 'package',       label: 'Package Name',      required: false, autoKeys: FORMAT_A_AUTO_KEYS.package },
  { key: 'package_code',  label: 'Package Code',      required: false, autoKeys: FORMAT_A_AUTO_KEYS.package_code },
  { key: 'price',         label: 'Total Price',       required: true,  autoKeys: FORMAT_A_AUTO_KEYS.price },
  { key: 'list_price',    label: 'List Price',        required: false, autoKeys: FORMAT_A_AUTO_KEYS.list_price },
  { key: 'address',       label: 'Address',           required: false, autoKeys: FORMAT_A_AUTO_KEYS.address },
  { key: 'cod',           label: 'COD Indicator',     required: false, autoKeys: FORMAT_A_AUTO_KEYS.cod },
  { key: 'cod_amount',    label: 'COD Amount',        required: false, autoKeys: FORMAT_A_AUTO_KEYS.cod_amount },
  { key: 'shipping_fee',  label: 'Shipping Fee',      required: false, autoKeys: FORMAT_A_AUTO_KEYS.shipping_fee },
  { key: 'courier',       label: 'Courier',           required: false, autoKeys: FORMAT_A_AUTO_KEYS.courier },
  { key: 'customer_type', label: 'New / Repeat',      required: false, autoKeys: FORMAT_A_AUTO_KEYS.customer_type },
  { key: 'remark',        label: 'Remark',            required: false, autoKeys: FORMAT_A_AUTO_KEYS.remark },
]

const FIELD_DEFS_DD: FieldDef[] = [
  { key: 'date',           label: 'Order Date',      required: true,  autoKeys: FORMAT_DD_AUTO_KEYS.date },
  { key: 'customer_name',  label: 'Customer Name',   required: true,  autoKeys: FORMAT_DD_AUTO_KEYS.customer_name },
  { key: 'phone',          label: 'Phone Number',    required: false, autoKeys: FORMAT_DD_AUTO_KEYS.phone },
  { key: 'channel',        label: 'Channel',         required: false, autoKeys: FORMAT_DD_AUTO_KEYS.channel },
  { key: 'package',        label: 'Package Name',    required: false, autoKeys: FORMAT_DD_AUTO_KEYS.package },
  { key: 'price',          label: 'Total Price',     required: true,  autoKeys: FORMAT_DD_AUTO_KEYS.price },
  { key: 'remark',         label: 'Remark',          required: false, autoKeys: FORMAT_DD_AUTO_KEYS.remark },
  { key: 'payment_method', label: 'Payment Method',  required: false, autoKeys: FORMAT_DD_AUTO_KEYS.payment_method },
  { key: 'state',          label: 'State',           required: false, autoKeys: FORMAT_DD_AUTO_KEYS.state },
  { key: 'tracking',       label: 'Order Code',      required: false, autoKeys: FORMAT_DD_AUTO_KEYS.tracking },
  { key: 'customer_type',  label: 'New / Repeat',    required: false, autoKeys: FORMAT_DD_AUTO_KEYS.customer_type },
]

const FIELD_DEFS_DD2025: FieldDef[] = [
  { key: 'date',          label: 'Order Date',     required: true,  autoKeys: FORMAT_DD2025_AUTO_KEYS.date },
  { key: 'customer_name', label: 'Customer Name',  required: true,  autoKeys: FORMAT_DD2025_AUTO_KEYS.customer_name },
  { key: 'phone',         label: 'Phone Number',   required: false, autoKeys: FORMAT_DD2025_AUTO_KEYS.phone },
  { key: 'channel',       label: 'Channel',        required: false, autoKeys: FORMAT_DD2025_AUTO_KEYS.channel },
  { key: 'package',       label: 'Package Name',   required: false, autoKeys: FORMAT_DD2025_AUTO_KEYS.package },
  { key: 'price',         label: 'Sale Price',     required: true,  autoKeys: FORMAT_DD2025_AUTO_KEYS.price },
  { key: 'remark',        label: 'Purchase Reason',required: false, autoKeys: FORMAT_DD2025_AUTO_KEYS.remark },
  { key: 'customer_type', label: 'New / Repeat',   required: false, autoKeys: FORMAT_DD2025_AUTO_KEYS.customer_type },
]

const FIELD_DEFS_B: FieldDef[] = [
  { key: 'row_number',    label: 'Row Number',         required: true,  autoKeys: FORMAT_B_AUTO_KEYS.row_number },
  { key: 'track_2026',    label: 'Tracking (2026)',    required: false, autoKeys: FORMAT_B_AUTO_KEYS.track_2026 },
  { key: 'track_2025',    label: 'Tracking (2025)',    required: false, autoKeys: FORMAT_B_AUTO_KEYS.track_2025 },
  { key: 'date',          label: 'Order Date',         required: true,  autoKeys: FORMAT_B_AUTO_KEYS.date },
  { key: 'customer_name', label: 'Customer Name',      required: true,  autoKeys: FORMAT_B_AUTO_KEYS.customer_name },
  { key: 'phone',         label: 'Primary Phone',      required: false, autoKeys: FORMAT_B_AUTO_KEYS.phone },
  { key: 'phone2',        label: 'Secondary Phone',    required: false, autoKeys: FORMAT_B_AUTO_KEYS.phone2 },
  { key: 'channel',       label: 'Channel',            required: false, autoKeys: FORMAT_B_AUTO_KEYS.channel },
  { key: 'package',       label: 'Package Name',       required: false, autoKeys: FORMAT_B_AUTO_KEYS.package },
  { key: 'price',         label: 'Total Price',        required: true,  autoKeys: FORMAT_B_AUTO_KEYS.price },
  { key: 'remark',        label: 'Remark (COD check)', required: false, autoKeys: FORMAT_B_AUTO_KEYS.remark },
  { key: 'courier',       label: 'Courier',            required: false, autoKeys: FORMAT_B_AUTO_KEYS.courier },
  { key: 'customer_type', label: 'New / Repeat',       required: false, autoKeys: FORMAT_B_AUTO_KEYS.customer_type },
  { key: 'source_id',       label: 'Shopee Order No',    required: false, autoKeys: FORMAT_B_AUTO_KEYS.source_id },
  { key: 'payment_method',  label: 'Payment Method',     required: false, autoKeys: FORMAT_B_AUTO_KEYS.payment_method },
  { key: 'price_domain',    label: 'Price Domain (COD)', required: false, autoKeys: FORMAT_B_AUTO_KEYS.price_domain },
]

// ── Parse helpers ──────────────────────────────────────────────────────────────

function autoDetectMapping(headers: string[], format: CsvFormat): Record<string, string> {
  const fieldDefs = format === 'B' ? FIELD_DEFS_B : format === 'DD' ? FIELD_DEFS_DD : format === 'DD2025' ? FIELD_DEFS_DD2025 : FIELD_DEFS_A
  const normalized = headers.map(h => ({ original: h, lower: h.trim().toLowerCase() }))
  const result: Record<string, string> = {}
  for (const field of fieldDefs) {
    for (const key of field.autoKeys) {
      const found = normalized.find(h => h.lower === key.trim().toLowerCase())
      if (found) { result[field.key] = found.original; break }
    }
  }
  return result
}

function getField(row: Record<string, string>, mapping: Record<string, string>, key: string): string {
  const csvCol = mapping[key]
  if (!csvCol) return ''
  return (row[csvCol] ?? '').trim()
}

function parseDate(raw: string): string {
  const s = raw.trim()
  const dmy = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/)
  if (dmy) return `${dmy[3]}-${dmy[2].padStart(2, '0')}-${dmy[1].padStart(2, '0')}`
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s
  const d = new Date(s)
  return isNaN(d.getTime()) ? s : d.toISOString().split('T')[0]
}

function parsePrice(raw: string): number {
  return parseFloat(raw.replace(/RM/gi, '').replace(/,/g, '').trim())
}

function normalizePhone(raw: string, format: CsvFormat = 'A'): string {
  let s = raw.replace(/[\s\-\(\)]/g, '')
  // Fix Excel scientific notation: 1.25039898E+08
  if (/^\d+\.?\d*[eE][+\-]?\d+$/.test(s)) {
    const n = Math.round(parseFloat(s))
    s = n.toString()
    if (s.length === 9 && s.startsWith('1')) s = '60' + s
    else if (s.length === 10 && s.startsWith('01')) s = '6' + s
    return s
  }
  if (format === 'B') {
    // Format B: store as clean digits without leading country code issues
    if (s.startsWith('60')) return s
    if (s.startsWith('0')) return '6' + s  // 01X -> 601X
    if (s.startsWith('1') && s.length === 9) return '60' + s
  } else {
    // Format A: keep original normalization
    if (/^\d+\.?\d*[eE][+\-]?\d+$/.test(s)) {
      const n = Math.round(parseFloat(s))
      s = n.toString()
      if (s.length === 9 && s.startsWith('1')) s = '0' + s
    }
  }
  return s
}

function mapChannel(raw: string): string {
  const c = raw.trim().toLowerCase()
  if (c.startsWith('fb ') || c === 'facebook') return 'Facebook'
  if (c === 'xhs') return 'Xiaohongshu'
  if (c === 'shopee') return 'Shopee'
  if (c === 'tiktok') return 'TikTok'
  if (c === 'lazada') return 'Lazada'
  return raw.trim()
}

function mapChannelB(raw: string): string {
  const c = raw.trim().toUpperCase()
  if (c.includes('FB') || c.includes('FACEBOOK')) return 'Facebook'
  if (c === 'SHOPEE') return 'Shopee'
  if (c === 'WHATSAPP' || c === 'WA') return 'WhatsApp'
  if (c === 'TIKTOK') return 'TikTok'
  if (c === 'LAZADA') return 'Lazada'
  if (c === 'INSTAGRAM' || c === 'IG') return 'Instagram'
  return raw.trim()
}

function parseIsRepeat(raw: string): boolean {
  // FIOR CSV: 'New' = new customer; 'No' = repeat customer
  const s = raw.trim().toLowerCase()
  return s === 'no' || s === 'repeat'
}

function parseCod(raw: string): boolean {
  return raw.trim().toLowerCase().includes('cod')
}

function detectCodFromRemark(remark: string, paymentMethod?: string, priceDomain?: string): boolean {
  const r = remark.trim().toLowerCase()
  if (r.includes('cod') || r.includes('cash on delivery')) return true
  if (paymentMethod && paymentMethod.trim().toLowerCase().includes('cod')) return true
  // Price domain: if it has a numeric value it may be the COD payout amount
  if (priceDomain && priceDomain.trim() !== '') {
    const n = parseFloat(priceDomain.replace(/[^0-9.]/g, ''))
    if (!isNaN(n) && n > 0) return true
  }
  return false
}

function mapCourier(raw: string): string {
  const s = raw.trim().toLowerCase()
  if (s.includes('dhl'))                             return 'DHL'
  if (s.includes('poslaju') || s.includes('pos laju')) return 'Pos Laju'
  if (s.includes('jnt') || s.includes('j&t'))       return 'J&T'
  if (s.includes('gdex'))                            return 'GDex'
  if (s.includes('ninja'))                           return 'Ninja Van'
  return raw.trim()
}

function matchProject(channel: string, projects: Project[]): Project | undefined {
  const c = channel.trim().toLowerCase()
  return projects.find(p => p.name.toLowerCase() === c || (p.code && p.code.toLowerCase() === c))
}

function errorLabel(e: RowError): string {
  return ({ missing_name: 'Missing name', invalid_price: 'Invalid price', missing_date: 'Missing date' })[e]
}

function generateTrackingB(
  rowNumber: string,
  track2026: string,
  track2025: string,
  projectName: string,
  year: number = 2026
): string {
  if (track2026.trim()) return track2026.trim()
  if (track2025.trim()) return track2025.trim()
  const num = parseInt(rowNumber, 10)
  if (isNaN(num)) return `${projectName}${year}${rowNumber}`
  return `${projectName}${year}${String(num).padStart(6, '0')}`
}

type Pkg = { id: string; project_id: string; name: string; code: string | null }

function normalizePackageName(name: string): string {
  // Strip BOM, zero-width spaces, and other invisible chars; collapse whitespace; lowercase
  return name
    .replace(/[\uFEFF\u200B-\u200D\u00A0]/g, ' ')
    .trim()
    .replace(/\s+/g, ' ')
    .toLowerCase()
}

interface PackageMatchResult {
  id: string | null
  matched: boolean
  warning?: string
}

function findPackageMatch(codeRaw: string, nameRaw: string, projectId: string | null, allPackages: Pkg[]): PackageMatchResult {
  if (!projectId) return { id: null, matched: false }
  const pool = allPackages.filter(p => p.project_id === projectId)

  console.log(`[pkgMatch] CSV="${nameRaw}" project=${projectId} pool=${pool.length} allPkgs=${allPackages.length}`)
  if (pool.length > 0 && nameRaw.trim()) {
    const nl = normalizePackageName(nameRaw)
    console.log(`[pkgMatch]   normalized CSV="${nl}"`)
    console.log(`[pkgMatch]   DB names:`, pool.map(p => `"${normalizePackageName(p.name)}"`).join(', '))
  }

  // 1. Try code match (exact)
  if (codeRaw.trim()) {
    const byCode = pool.find(p => p.code && p.code.toLowerCase() === codeRaw.toLowerCase().trim())
    if (byCode) return { id: byCode.id, matched: true }
  }

  if (!nameRaw.trim()) return { id: null, matched: false }

  const nl = normalizePackageName(nameRaw)

  // 2. Exact normalized match (case-insensitive, spaces collapsed)
  const byExact = pool.find(p => normalizePackageName(p.name) === nl)
  if (byExact) return { id: byExact.id, matched: true }

  // 3. Contains match (either direction) — handles '1 Tin + 1 Box（Shopee）' vs '1 Tin + 1 Box'
  const byContains = pool.find(p => {
    const pn = normalizePackageName(p.name)
    return pn.includes(nl) || nl.includes(pn)
  })
  if (byContains) return { id: byContains.id, matched: true }

  // 4. Starts-with match (CSV name starts with DB name or vice versa)
  const byStartsWith = pool.find(p => {
    const pn = normalizePackageName(p.name)
    return pn.startsWith(nl) || nl.startsWith(pn)
  })
  if (byStartsWith) return { id: byStartsWith.id, matched: true }

  // No match — return warning but still allow import
  return { id: null, matched: false, warning: `Package not matched: ${nameRaw}` }
}

function parseRows(
  rawData: Record<string, string>[],
  mapping: Record<string, string>,
  projects: Project[],
  allPackages: Pkg[],
  fallbackProjectId?: string,
  format: CsvFormat = 'A',
  projectName: string = ''
): ParsedRow[] {
  const parsed: ParsedRow[] = []

  for (const raw of rawData) {
    const get = (key: string) => getField(raw, mapping, key)

    if (format === 'DD2025') {
      // ── Format DD2025 (Diamond Drink legacy 2025) ─────────────────────────
      const dateRaw         = get('date')
      const customerNameRaw = get('customer_name')
      const phoneRaw        = get('phone')
      const channelRaw      = get('channel')
      const packageName     = get('package')
      const priceRaw        = get('price')
      const remarkRaw       = get('remark')
      const customerType    = get('customer_type')

      if (!dateRaw && !customerNameRaw) continue

      const totalPrice = parsePrice(priceRaw)
      const date       = parseDate(dateRaw)

      // Phone may be in scientific notation (e.g. 6.016874066e+10)
      let phone = phoneRaw.trim()
      if (phone.includes('e') || phone.includes('E')) {
        phone = Math.round(Number(phone)).toString()
      } else {
        phone = normalizePhone(phone, 'B')
      }

      const channel  = channelRaw.trim()
      const isRepeat = parseIsRepeat(customerType)

      const projectId = fallbackProjectId ?? null
      const pkgMatch  = findPackageMatch('', packageName, projectId, allPackages)

      const errors: RowError[] = []
      if (!customerNameRaw) errors.push('missing_name')
      if (!dateRaw)          errors.push('missing_date')
      if (isNaN(totalPrice)) errors.push('invalid_price')

      let status: RowStatus = 'ready'
      let importWarning: string | undefined
      let skipReason: string | undefined

      if (errors.length > 0) {
        status = 'error'
        skipReason = errors.map(errorLabel).join(', ')
      } else if (!pkgMatch.matched && packageName) {
        status = 'warning'
        importWarning = pkgMatch.warning
      }

      parsed.push({
        orderRef:       `row-${parsed.length + 1}`,
        date,
        customerName:   customerNameRaw,
        phone,
        packageName,
        trackingNumber: null,
        totalPrice:     isNaN(totalPrice) ? 0 : totalPrice,
        listPrice:      null,
        channel,
        address:        '',
        isRepeat,
        isCod:          false,
        codAmount:      null,
        shippingFee:    null,
        courier:        '',
        country:        'MY',
        projectId,
        packageId:      pkgMatch.id,
        productName:    packageName || channel || '—',
        remark:         remarkRaw,
        state:          '',
        sourceId:       null,
        errors,
        status,
        packageMatched: pkgMatch.matched,
        skipReason,
        importWarning,
        needsAutoId:    true,
      })
    } else if (format === 'DD') {
      // ── Format DD (Diamond Drink actual CSV format) ───────────────────────
      const dateRaw         = get('date')
      const customerNameRaw = get('customer_name')
      const phoneRaw        = get('phone')
      const channelRaw      = get('channel')
      const packageName     = get('package')
      const priceRaw        = get('price')
      const remarkRaw       = get('remark')
      const paymentMethod   = get('payment_method')
      const stateRaw        = get('state')
      const trackingRaw     = get('tracking')
      const customerType    = get('customer_type')

      if (!dateRaw && !customerNameRaw) continue

      const totalPrice = parsePrice(priceRaw)
      const date       = parseDate(dateRaw)
      // Phone Number col has full number (e.g. 60196816681), no scientific notation
      const phone      = normalizePhone(phoneRaw, 'B')
      // Store channel as-is (e.g. "【焕肤】FB", "FB SG")
      const channel    = channelRaw.trim()
      const isRepeat   = parseIsRepeat(customerType)
      // COD if Payment method column contains 'COD'
      const isCod      = paymentMethod.trim().toUpperCase().includes('COD')
      const tracking   = trackingRaw.trim() || null

      const projectId = fallbackProjectId ?? null
      const pkgMatch  = findPackageMatch('', packageName, projectId, allPackages)

      const errors: RowError[] = []
      if (!customerNameRaw) errors.push('missing_name')
      if (!dateRaw)          errors.push('missing_date')
      if (isNaN(totalPrice)) errors.push('invalid_price')

      let status: RowStatus = 'ready'
      let importWarning: string | undefined
      let skipReason: string | undefined

      if (errors.length > 0) {
        status = 'error'
        skipReason = errors.map(errorLabel).join(', ')
      } else if (!pkgMatch.matched && packageName) {
        status = 'warning'
        importWarning = pkgMatch.warning
      }

      parsed.push({
        orderRef:       tracking ?? `row-${parsed.length + 1}`,
        date,
        customerName:   customerNameRaw,
        phone,
        packageName,
        trackingNumber: tracking,
        totalPrice:     isNaN(totalPrice) ? 0 : totalPrice,
        listPrice:      null,
        channel,
        address:        '',
        isRepeat,
        isCod,
        codAmount:      null,
        shippingFee:    null,
        courier:        '',
        country:        'MY',
        projectId,
        packageId:      pkgMatch.id,
        productName:    packageName || channel || '—',
        remark:         remarkRaw,
        state:          stateRaw,
        sourceId:       null,
        errors,
        status,
        packageMatched: pkgMatch.matched,
        skipReason,
        importWarning,
        needsAutoId:    !tracking,
      })
    } else if (format === 'B') {
      // ── Format B (Juji, NE) ───────────────────────────────────────────────
      const rowNumber       = get('row_number')
      const track2026       = get('track_2026')
      const track2025       = get('track_2025')
      const dateRaw         = get('date')
      const customerNameRaw = get('customer_name')
      const phoneRaw        = get('phone')
      const phone2Raw       = get('phone2')
      const channelRaw      = get('channel')
      const packageName     = get('package')
      const priceRaw        = get('price')
      const remarkRaw       = get('remark')
      const courierRaw      = get('courier')
      const customerType    = get('customer_type')
      const sourceIdRaw     = get('source_id')
      const paymentMethod   = get('payment_method')
      const priceDomain     = get('price_domain')

      // Only skip truly blank rows (both date AND customer name are empty)
      if (!dateRaw && !customerNameRaw) continue

      // Handle Shopee "username / Real Name" format
      let customerName = customerNameRaw
      let sourceId: string | null = sourceIdRaw || null
      if (customerNameRaw.includes(' / ')) {
        const parts = customerNameRaw.split(' / ')
        const username = parts[0].trim()
        const realName = parts.slice(1).join(' / ').trim()
        customerName = realName || username
        if (!sourceId) sourceId = username
      }

      const totalPrice = parsePrice(priceRaw)

      // Skip truly blank rows only
      if (!dateRaw && !customerName) continue

      const hasExistingTracking = track2026.trim() !== '' || track2025.trim() !== ''
      const trackingNumber = hasExistingTracking
        ? generateTrackingB(rowNumber, track2026, track2025, projectName)
        : null
      const needsAutoId    = !hasExistingTracking
      const isCod          = detectCodFromRemark(remarkRaw, paymentMethod, priceDomain)
      let phone            = normalizePhone(phoneRaw, 'B')
      if (!phone && phone2Raw) phone = normalizePhone(phone2Raw, 'B')
      const channel        = mapChannelB(channelRaw)
      const date           = parseDate(dateRaw)
      const isRepeat       = parseIsRepeat(customerType)
      const courier        = mapCourier(courierRaw)

      // For Format B, ALWAYS use the selected project — this is critical
      const projectId = fallbackProjectId ?? null
      const pkgMatch  = findPackageMatch('', packageName, projectId, allPackages)

      const errors: RowError[] = []
      if (!customerName)     errors.push('missing_name')
      if (!dateRaw)          errors.push('missing_date')
      if (isNaN(totalPrice)) errors.push('invalid_price')

      // Determine row status
      let status: RowStatus = 'ready'
      let importWarning: string | undefined
      let skipReason: string | undefined

      if (errors.length > 0) {
        status = 'error'
        skipReason = errors.map(errorLabel).join(', ')
      } else if (!pkgMatch.matched && packageName) {
        status = 'warning'
        importWarning = pkgMatch.warning
      }

      parsed.push({
        orderRef:       trackingNumber ?? `row-${rowNumber || parsed.length + 1}`,
        date,
        customerName,
        phone,
        packageName,
        trackingNumber,
        totalPrice:     isNaN(totalPrice) ? 0 : totalPrice,
        listPrice:      null,
        channel,
        address:        '',
        isRepeat,
        isCod,
        codAmount:      null,
        shippingFee:    null,
        courier,
        country:        'MY',
        projectId,
        packageId:      pkgMatch.id,
        productName:    packageName || channelRaw || '—',
        remark:         remarkRaw,
        state:          '',
        sourceId,
        errors,
        status,
        packageMatched: pkgMatch.matched,
        skipReason,
        importWarning,
        needsAutoId,
      })
    } else {
      // ── Format A (FIOR, KHH) ───────────────────────────────────────────────
      const trackingRaw    = get('tracking')
      const dateRaw        = get('date')
      const customerName   = get('customer_name')
      const channelRaw     = get('channel')
      const phoneRaw       = get('phone')
      const packageName    = get('package')
      const packageCode    = get('package_code')
      const priceRaw       = get('price')
      const listPriceRaw   = get('list_price')
      const address        = get('address')
      const customerType   = get('customer_type')
      const codRaw         = get('cod')
      const codAmountRaw   = get('cod_amount')
      const shippingFeeRaw = get('shipping_fee')
      const courierRaw     = get('courier')
      const remarkRaw      = get('remark')

      // Skip only truly blank rows (date AND customer name both empty)
      if (!dateRaw && !customerName) continue

      const totalPrice = parsePrice(priceRaw)

      // For Format A, skip if no tracking number (can't link without it)
      if (!trackingRaw) continue

      const phone      = normalizePhone(phoneRaw, 'A')
      const listPriceN = listPriceRaw  ? parsePrice(listPriceRaw)  : NaN
      const codAmountN = codAmountRaw  ? parsePrice(codAmountRaw)  : NaN
      const shippingN  = shippingFeeRaw ? parsePrice(shippingFeeRaw) : NaN
      const date       = parseDate(dateRaw)
      const channel    = mapChannel(channelRaw)
      const isRepeat   = parseIsRepeat(customerType)
      const isCod      = parseCod(codRaw)
      const courier    = mapCourier(courierRaw)

      // Use channel-matched project first; fall back to manually selected project
      const matched   = matchProject(channel, projects) ?? matchProject(channelRaw, projects)
      const projectId = matched?.id ?? fallbackProjectId ?? null
      const pkgMatch  = findPackageMatch(packageCode, packageName, projectId, allPackages)

      const errors: RowError[] = []
      if (!customerName)     errors.push('missing_name')
      if (!dateRaw)          errors.push('missing_date')
      if (isNaN(totalPrice)) errors.push('invalid_price')

      // Determine row status
      let status: RowStatus = 'ready'
      let importWarning: string | undefined
      let skipReason: string | undefined

      if (errors.length > 0) {
        status = 'error'
        skipReason = errors.map(errorLabel).join(', ')
      } else if (!pkgMatch.matched && packageName) {
        status = 'warning'
        importWarning = pkgMatch.warning
      }

      parsed.push({
        orderRef:       trackingRaw,
        date,
        customerName,
        phone,
        packageName,
        trackingNumber: trackingRaw,
        totalPrice:     isNaN(totalPrice) ? 0 : totalPrice,
        listPrice:      isNaN(listPriceN) ? null : listPriceN,
        channel,
        address,
        isRepeat,
        isCod,
        codAmount:   isNaN(codAmountN) ? null : codAmountN,
        shippingFee: isNaN(shippingN)  ? null : shippingN,
        courier,
        country:     'MY',
        projectId,
        packageId:   pkgMatch.id,
        productName: packageName || channelRaw || '—',
        remark:      remarkRaw,
        state:       get('state'),
        sourceId:    null,
        errors,
        status,
        packageMatched: pkgMatch.matched,
        skipReason,
        importWarning,
      })
    }
  }

  return parsed
}

// ── Component ──────────────────────────────────────────────────────────────────

interface Props { open: boolean; onClose: () => void }

export default function ImportOrdersModal({ open, onClose }: Props) {
  const queryClient = useQueryClient()
  const fileInputRef = useRef<HTMLInputElement>(null)
  const fileNameRef  = useRef<string>('')

  const [step, setStep]                   = useState<Step>('upload')
  const [csvHeaders, setCsvHeaders]       = useState<string[]>([])
  const [rawData, setRawData]             = useState<Record<string, string>[]>([])
  const [mapping, setMapping]             = useState<Record<string, string>>({})
  const [rows, setRows]                   = useState<ParsedRow[]>([])
  const [importing, setImporting]         = useState(false)
  const [result, setResult]               = useState<ImportResult | null>(null)
  const [saveName, setSaveName]           = useState('')
  const [saving, setSaving]               = useState(false)
  const [selectedProjectId, setSelectedProjectId] = useState<string>('')
  const [detectedFormat, setDetectedFormat] = useState<CsvFormat>('unknown')

  const { projects } = useProjects()

  const [allPackages, setAllPackages] = useState<Pkg[]>([])
  useEffect(() => {
    if (!open) return
    fetchActivePackages().then(pkgs => {
      console.log('[ImportModal] fetchActivePackages returned', pkgs.length, 'packages:', pkgs.map(p => `${p.project_id}:${p.name}`))
      setAllPackages(pkgs)
    }).catch(err => console.error('[ImportModal] fetchActivePackages failed:', err))
  }, [open])

  const { data: savedMappings = [], refetch: refetchMappings } = useQuery({
    queryKey: ['import-mappings'],
    queryFn:  fetchImportMappings,
  })

  // ── File handling ─────────────────────────────────────────────────────────

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    fileNameRef.current = file.name

    Papa.parse<Record<string, string>>(file, {
      header: true,
      skipEmptyLines: true,
      transformHeader: h => h.replace(/^\uFEFF/, '').trim(),
      complete: res => {
        const headers = res.meta.fields ?? []
        const format  = detectFormat(headers)
        setCsvHeaders(headers)
        setRawData(res.data)
        setDetectedFormat(format)
        setMapping(autoDetectMapping(headers, format))
        setStep('mapping')
      },
      error: () => {
        toast.error('Failed to parse CSV.')
        if (fileInputRef.current) fileInputRef.current.value = ''
      },
    })
  }

  function updateMapping(fieldKey: string, csvCol: string) {
    setMapping(prev => ({ ...prev, [fieldKey]: csvCol === '__none__' ? '' : csvCol }))
  }

  // ── Mapping confirmed ─────────────────────────────────────────────────────

  function handleMappingConfirm() {
    const selectedProject = projects.find(p => p.id === selectedProjectId)
    const parsed = parseRows(
      rawData,
      mapping,
      projects,
      allPackages,
      selectedProjectId || undefined,
      detectedFormat,
      selectedProject?.name || ''
    )
    if (!parsed.length) {
      toast.error('No valid rows found. Check that required columns are mapped and non-empty.')
      return
    }
    setRows(parsed)
    setStep('preview')
  }

  // ── Save mapping ──────────────────────────────────────────────────────────

  async function handleSaveMapping() {
    if (!saveName.trim()) { toast.error('Enter a name for this mapping.'); return }
    setSaving(true)
    try {
      await saveImportMapping(saveName.trim(), mapping)
      await refetchMappings()
      setSaveName('')
      toast.success('Mapping saved!')
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : 'Save failed')
    } finally {
      setSaving(false)
    }
  }

  // ── Import ────────────────────────────────────────────────────────────────

  async function handleImport() {
    setImporting(true)
    // Import both 'ready' and 'warning' rows (warnings = unmatched package but still valid)
    const validRows  = rows.filter(r => r.status === 'ready' || r.status === 'warning')
    let skippedCount = rows.filter(r => r.status === 'error').length
    let errorCount   = 0
    const errorDetails: string[] = []

    // Use the selected project as dominant project, fallback to most-common in rows
    let dominantProjectId = selectedProjectId || null
    if (!dominantProjectId) {
      const projectIdCounts: Record<string, number> = {}
      for (const r of validRows) {
        if (r.projectId) projectIdCounts[r.projectId] = (projectIdCounts[r.projectId] ?? 0) + 1
      }
      dominantProjectId = Object.keys(projectIdCounts).sort(
        (a, b) => projectIdCounts[b] - projectIdCounts[a]
      )[0] ?? null
    }

    let batchId: string | null = null
    try {
      batchId = await createImportBatch(dominantProjectId, fileNameRef.current || 'import.csv', rows.length)
    } catch { /* non-blocking */ }

    try {
      // Build customer rows — pass phone as empty string when missing so the
      // server action can handle the no-phone path correctly
      const customerRows = validRows.map(r => ({
        name:    r.customerName,
        phone:   r.phone || '',
        address: r.address || null,
      }))
      const customerMap = await bulkUpsertCustomers(customerRows)

      const trackingNumbers = validRows.map(r => r.trackingNumber).filter((t): t is string => t !== null)
      const existingTrackingArr = trackingNumbers.length > 0
        ? await fetchExistingTrackingNumbers(trackingNumbers)
        : []
      const existingTracking = new Set<string>(existingTrackingArr)

      // Pre-generate order IDs for Format B rows that need auto-generated tracking numbers
      // We do this atomically before building toInsert so each row gets a unique sequential ID
      const resolvedTrackingNumbers = new Map<number, string>()
      for (let i = 0; i < validRows.length; i++) {
        const r = validRows[i]
        if (r.needsAutoId) {
          const pid = r.projectId ?? selectedProjectId ?? dominantProjectId
          if (pid) {
            try {
              const autoId = await generateOrderId(pid)
              resolvedTrackingNumbers.set(i, autoId)
            } catch (genErr) {
              console.error('Failed to generate order ID:', genErr)
            }
          }
        }
      }

      const toInsert: object[] = []
      for (let i = 0; i < validRows.length; i++) {
        const r = validRows[i]
        // Use pre-generated tracking if needed, else use the parsed one
        const trackingNumber = r.needsAutoId
          ? (resolvedTrackingNumbers.get(i) ?? r.trackingNumber)
          : r.trackingNumber

        if (trackingNumber && existingTracking.has(trackingNumber)) {
          skippedCount++
          continue
        }

        // Resolve customer_id: try by phone first, then by no-phone name key
        const customerKey = r.phone ? r.phone : `__noPhone__${r.customerName}`
        const customerId  = customerMap[customerKey] ?? null

        // project_id: ALWAYS use the selected project as ultimate fallback
        const projectId = r.projectId ?? selectedProjectId ?? dominantProjectId ?? null

        toInsert.push({
          customer_id:     customerId,
          project_id:      projectId,
          package_id:      r.packageId,
          product_name:    r.productName,
          package_name:    r.packageName || null,
          total_price:     r.totalPrice,
          list_price:      r.listPrice ?? null,
          status:          'pending',
          order_date:      r.date,
          channel:         r.channel || null,
          is_new_customer: !r.isRepeat,
          tracking_number: trackingNumber,
          import_status:   r.status === 'warning' ? 'warning' : 'success',
          import_error:    r.importWarning ?? null,
          quantity:        1,
          import_batch_id: batchId,
          is_cod:          r.isCod,
          payment_status:  'Settled',
          shipping_fee:    r.shippingFee ?? null,
          handling_fee:    r.codAmount   ?? null,
          courier:         r.courier     || null,
          country:         r.country     || 'MY',
          purchase_reason: r.remark      || null,
          state:           r.state       || null,
        })
      }

      const { ids: insertedIds, errors: insertErrors } = await bulkInsertOrders(toInsert, dominantProjectId)
      errorCount   += insertErrors.length
      errorDetails.push(...insertErrors)
      const successCount = insertedIds.length

      if (insertedIds.length > 0) {
        const { failed, errors: procErrors } = await processOrdersBatch(insertedIds)
        if (failed > 0) console.error('Some orders failed processing:', procErrors)
      }

      if (batchId) {
        try {
          await updateImportBatch(
            batchId,
            { success_count: successCount, skipped_count: skippedCount, error_count: errorCount },
            errorCount > 0 && successCount === 0 ? 'failed' : 'completed'
          )
        } catch { /* non-blocking */ }
      }

      queryClient.invalidateQueries({ queryKey: ['orders'] })
      queryClient.invalidateQueries({ queryKey: ['dashboard'] })
      queryClient.invalidateQueries({ queryKey: ['import-batches'] })

      // Build summary stats from the rows actually inserted
      const insertedSet = new Set(insertedIds)
      const insertedRows = validRows.filter(r =>
        r.trackingNumber ? insertedSet.size > 0 : false
      )
      // Approximate stats from the toInsert payload (simpler)
      const totalRevenue = (toInsert as Array<{total_price: number}>)
        .reduce((sum, o) => sum + (o.total_price ?? 0), 0)
      const prepaidCount = (toInsert as Array<{is_cod: boolean}>)
        .filter(o => !o.is_cod).length
      const codCount = (toInsert as Array<{is_cod: boolean}>)
        .filter(o => o.is_cod).length
      const warningCount = (toInsert as Array<{import_status: string}>)
        .filter(o => o.import_status === 'warning').length

      setResult({
        success: successCount - warningCount,
        warnings: warningCount,
        skipped: skippedCount,
        errors: errorCount,
        errorDetails,
        totalRevenue,
        prepaidCount,
        codCount,
        batchId,
      })
      setStep('done')
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : 'Import failed')
    } finally {
      setImporting(false)
    }
  }

  // ── Reset ─────────────────────────────────────────────────────────────────

  function handleClose() {
    if (importing) return
    setStep('upload')
    setCsvHeaders([])
    setRawData([])
    setMapping({})
    setRows([])
    setResult(null)
    setSaveName('')
    setSelectedProjectId('')
    setDetectedFormat('unknown')
    if (fileInputRef.current) fileInputRef.current.value = ''
    onClose()
  }

  const readyRows    = rows.filter(r => r.status === 'ready')
  const warningRows  = rows.filter(r => r.status === 'warning')
  const invalidRows  = rows.filter(r => r.status === 'error')
  const importableRows = rows.filter(r => r.status === 'ready' || r.status === 'warning')
  const dialogWidth = step === 'preview' ? 'max-w-5xl' : step === 'mapping' ? 'max-w-2xl' : 'max-w-md'
  const currentFieldDefs = detectedFormat === 'B' ? FIELD_DEFS_B : detectedFormat === 'DD' ? FIELD_DEFS_DD : detectedFormat === 'DD2025' ? FIELD_DEFS_DD2025 : FIELD_DEFS_A

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className={dialogWidth}>
        <DialogHeader>
          <DialogTitle>Import Orders from CSV</DialogTitle>
        </DialogHeader>

        {/* ── Upload ─────────────────────────────────────────────────────────── */}
        {step === 'upload' && (
          <div className="space-y-4">
            {/* Project selector */}
            <div className="space-y-1.5">
              <label className="text-sm font-medium">Project (Brand)</label>
              <Select value={selectedProjectId} onValueChange={setSelectedProjectId}>
                <SelectTrigger>
                  <SelectValue placeholder="Select project for this import…" />
                </SelectTrigger>
                <SelectContent>
                  {projects.map(p => (
                    <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">
                Orders will be linked to this project. Required for Format B (Juji/NE) and Format DD. Auto-detected from channel for Format A.
              </p>
            </div>

            <div
              className="border-2 border-dashed rounded-lg p-10 text-center cursor-pointer hover:border-primary hover:bg-muted/30 transition-colors"
              onClick={() => fileInputRef.current?.click()}
            >
              <Upload className="h-8 w-8 mx-auto mb-3 text-muted-foreground" />
              <p className="text-sm font-medium">Click to upload a CSV file</p>
              <p className="text-xs text-muted-foreground mt-2 leading-relaxed">
                Format A (FIOR/KHH): 线上单号, Date, Name, Phone number, COD…<br />
                Format B (Juji/NE): Number, Receiver Name, Full Phone No, Remark…<br />
                Format DD (DD): Date, Name, Phone Number, Order code, Payment method…<br />
                Format DD-2025 (DD Legacy): Date, Chanel, Name, Phone number, Price…
              </p>
              <input ref={fileInputRef} type="file" accept=".csv" className="hidden" onChange={handleFileChange} />
            </div>
          </div>
        )}

        {/* ── Mapping ────────────────────────────────────────────────────────── */}
        {step === 'mapping' && (
          <div className="space-y-3">
            <p className="text-xs text-muted-foreground">
              Map each field to the corresponding CSV column. Auto-detected from headers.
            </p>

            {/* Format badge */}
            {detectedFormat !== 'unknown' && (
              <div className="flex items-center gap-2 text-xs">
                <span className="font-medium">Detected Format:</span>
                <Badge variant={detectedFormat === 'A' ? 'default' : 'secondary'}>
                  {detectedFormat === 'A' ? 'Format A — FIOR/KHH style'
                    : detectedFormat === 'DD' ? 'Format DD — Diamond Drink'
                    : detectedFormat === 'DD2025' ? 'Format DD-2025 — Diamond Drink (Legacy)'
                    : 'Format B — Juji/NE style'}
                </Badge>
              </div>
            )}

            {/* Load saved mapping */}
            {savedMappings.length > 0 && (
              <div className="flex items-center gap-2 text-sm">
                <span className="text-muted-foreground shrink-0 text-xs">Load saved:</span>
                <Select onValueChange={id => {
                  const found = savedMappings.find(m => m.id === id)
                  if (found) setMapping(found.mapping)
                }}>
                  <SelectTrigger className="h-7 text-xs flex-1">
                    <SelectValue placeholder="Choose a saved mapping…" />
                  </SelectTrigger>
                  <SelectContent>
                    {savedMappings.map(m => (
                      <SelectItem key={m.id} value={m.id}>{m.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}

            {/* Field mapping table */}
            <div className="max-h-[360px] overflow-auto rounded-lg border text-xs">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="text-xs py-2 w-36">Field</TableHead>
                    <TableHead className="text-xs py-2">CSV Column</TableHead>
                    <TableHead className="text-xs py-2 w-8 text-center">✓</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {currentFieldDefs.map(field => {
                    const mapped = mapping[field.key] ?? ''
                    return (
                      <TableRow key={field.key}>
                        <TableCell className="py-1 font-medium text-xs">
                          {field.label}
                          {field.required && <span className="text-destructive ml-0.5">*</span>}
                        </TableCell>
                        <TableCell className="py-1">
                          <Select
                            value={mapped || '__none__'}
                            onValueChange={v => updateMapping(field.key, v)}
                          >
                            <SelectTrigger className="h-7 text-xs">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="__none__">— not mapped —</SelectItem>
                              {csvHeaders.map(h => (
                                <SelectItem key={h} value={h}>{h}</SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </TableCell>
                        <TableCell className="py-1 text-center">
                          {mapped
                            ? <CheckCircle2 className="h-3.5 w-3.5 text-green-600 mx-auto" />
                            : field.required
                              ? <XCircle className="h-3.5 w-3.5 text-destructive mx-auto" />
                              : <span className="text-muted-foreground">—</span>}
                        </TableCell>
                      </TableRow>
                    )
                  })}
                </TableBody>
              </Table>
            </div>

            {/* Save mapping row */}
            <div className="flex items-center gap-2">
              <Input
                className="h-7 text-xs flex-1"
                placeholder="Save this mapping as…"
                value={saveName}
                onChange={e => setSaveName(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && handleSaveMapping()}
              />
              <Button
                variant="outline"
                size="sm"
                className="h-7 text-xs"
                onClick={handleSaveMapping}
                disabled={saving || !saveName.trim()}
              >
                <Save className="h-3 w-3 mr-1" />Save
              </Button>
            </div>
          </div>
        )}

        {/* ── Preview ────────────────────────────────────────────────────────── */}
        {step === 'preview' && (
          <div className="space-y-3">
            <div className="flex items-center gap-4 text-sm flex-wrap">
              <span className="text-green-600 font-medium">{readyRows.length} ready</span>
              {warningRows.length > 0 && (
                <span className="text-amber-600 font-medium flex items-center gap-1">
                  <AlertCircle className="h-3.5 w-3.5" />
                  {warningRows.length} with warnings (unmatched package)
                </span>
              )}
              {invalidRows.length > 0 && (
                <span className="text-destructive font-medium flex items-center gap-1">
                  <AlertCircle className="h-3.5 w-3.5" />
                  {invalidRows.length} will be skipped
                </span>
              )}
            </div>
            <div className="max-h-[420px] overflow-auto rounded-lg border text-xs">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="text-xs py-2">Ref</TableHead>
                    <TableHead className="text-xs py-2">Date</TableHead>
                    <TableHead className="text-xs py-2">Name</TableHead>
                    <TableHead className="text-xs py-2">Phone</TableHead>
                    <TableHead className="text-xs py-2">Package</TableHead>
                    <TableHead className="text-xs py-2">Price</TableHead>
                    <TableHead className="text-xs py-2">Channel</TableHead>
                    <TableHead className="text-xs py-2">COD</TableHead>
                    <TableHead className="text-xs py-2 w-6" />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rows.map((row, i) => {
                    const hasError   = row.status === 'error'
                    const hasWarning = row.status === 'warning'
                    const isSkipped  = hasError
                    const matched    = projects.find(p => p.id === row.projectId)
                    const rowBg      = hasError ? 'bg-destructive/5' : hasWarning ? 'bg-amber-50' : undefined
                    return (
                      <TableRow key={i} className={rowBg}>
                        <TableCell className="py-1.5 font-mono text-muted-foreground text-[10px]">
                          {row.orderRef || '—'}
                        </TableCell>
                        <TableCell className="py-1.5">{row.date}</TableCell>
                        <TableCell className="py-1.5 font-medium">
                          {row.customerName || <span className="text-destructive">—</span>}
                          {row.isRepeat && (
                            <Badge variant="secondary" className="ml-1 text-[10px] px-1 py-0 h-4">
                              <RefreshCw className="h-2.5 w-2.5 mr-0.5" />Repeat
                            </Badge>
                          )}
                        </TableCell>
                        <TableCell className="py-1.5">
                          {row.phone || <span className="text-muted-foreground text-[10px]">—</span>}
                        </TableCell>
                        <TableCell className="py-1.5">
                          <span className={row.packageMatched ? 'text-green-700' : row.packageName ? 'text-amber-600' : 'text-muted-foreground'}>
                            {row.packageName || '—'}
                          </span>
                          {row.packageMatched
                            ? <span className="ml-1 text-green-600 text-[10px]">✓</span>
                            : row.packageName
                              ? <span className="ml-1 text-amber-500 text-[10px]" title={row.importWarning}>?</span>
                              : null
                          }
                        </TableCell>
                        <TableCell className="py-1.5">
                          {row.errors.includes('invalid_price')
                            ? <span className="text-destructive">!</span>
                            : `RM ${row.totalPrice.toFixed(2)}`}
                        </TableCell>
                        <TableCell className="py-1.5">
                          {row.channel
                            ? matched
                              ? <Badge variant="outline" className="text-[10px] px-1 py-0 h-4">{matched.name}</Badge>
                              : <span className="text-muted-foreground text-[10px]">{row.channel}</span>
                            : '—'}
                        </TableCell>
                        <TableCell className="py-1.5">
                          {row.isCod && (
                            <Badge className="text-[10px] px-1 py-0 h-4 bg-orange-100 text-orange-700 border-orange-200 border">
                              COD
                            </Badge>
                          )}
                        </TableCell>
                        <TableCell className="py-1.5">
                          {hasError && (
                            <span title={row.skipReason ?? row.errors.map(errorLabel).join(', ')} className="text-destructive cursor-help">
                              <AlertCircle className="h-3.5 w-3.5" />
                            </span>
                          )}
                          {hasWarning && (
                            <span title={row.importWarning} className="text-amber-500 cursor-help">
                              <AlertCircle className="h-3.5 w-3.5" />
                            </span>
                          )}
                          {isSkipped && row.skipReason && (
                            <span className="text-[9px] text-destructive block">{row.skipReason}</span>
                          )}
                        </TableCell>
                      </TableRow>
                    )
                  })}
                </TableBody>
              </Table>
            </div>
          </div>
        )}

        {/* ── Done ───────────────────────────────────────────────────────────── */}
        {step === 'done' && result && (
          <div className="space-y-4 py-2">
            <div className="grid grid-cols-4 gap-2">
              <div className="rounded-lg border bg-green-50 p-3 text-center">
                <CheckCircle2 className="h-5 w-5 text-green-600 mx-auto mb-1" />
                <p className="text-xl font-bold text-green-700">{result.success}</p>
                <p className="text-xs text-muted-foreground">Imported</p>
              </div>
              <div className="rounded-lg border bg-amber-50 p-3 text-center">
                <AlertCircle className="h-5 w-5 text-amber-500 mx-auto mb-1" />
                <p className="text-xl font-bold text-amber-600">{result.warnings}</p>
                <p className="text-xs text-muted-foreground">Warnings</p>
              </div>
              <div className="rounded-lg border bg-yellow-50 p-3 text-center">
                <RefreshCw className="h-5 w-5 text-yellow-600 mx-auto mb-1" />
                <p className="text-xl font-bold text-yellow-700">{result.skipped}</p>
                <p className="text-xs text-muted-foreground">Skipped</p>
              </div>
              <div className="rounded-lg border bg-red-50 p-3 text-center">
                <XCircle className="h-5 w-5 text-red-600 mx-auto mb-1" />
                <p className="text-xl font-bold text-red-700">{result.errors}</p>
                <p className="text-xs text-muted-foreground">Errors</p>
              </div>
            </div>
            {/* Revenue and payment breakdown */}
            <div className="rounded-lg border bg-muted/30 p-3 space-y-1 text-sm">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Total revenue imported</span>
                <span className="font-semibold">RM {result.totalRevenue.toLocaleString('en-MY', { minimumFractionDigits: 2 })}</span>
              </div>
              <div className="flex justify-between text-xs">
                <span className="text-muted-foreground">Prepaid orders</span>
                <span>{result.prepaidCount}</span>
              </div>
              <div className="flex justify-between text-xs">
                <span className="text-muted-foreground">COD orders</span>
                <span>{result.codCount}</span>
              </div>
            </div>
            {result.errorDetails.length > 0 && (
              <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-xs text-red-700 space-y-1 max-h-28 overflow-auto">
                {result.errorDetails.map((e, i) => <p key={i}>{e}</p>)}
              </div>
            )}
            {result.batchId && (
              <a
                href={`/orders?batch=${result.batchId}`}
                className="block text-center text-xs text-primary underline underline-offset-2"
              >
                View imported orders &rarr;
              </a>
            )}
          </div>
        )}

        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={handleClose} disabled={importing}>
            {step === 'done' ? 'Close' : 'Cancel'}
          </Button>
          {step === 'mapping' && (
            <Button onClick={handleMappingConfirm}>
              Preview <ChevronRight className="h-4 w-4 ml-1" />
            </Button>
          )}
          {step === 'preview' && (
            <>
              <Button variant="outline" onClick={() => setStep('mapping')} disabled={importing}>
                Back
              </Button>
              <Button onClick={handleImport} disabled={importing || importableRows.length === 0}>
                {importing
                  ? 'Importing…'
                  : `Import ${importableRows.length} Order${importableRows.length !== 1 ? 's' : ''}`}
              </Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
