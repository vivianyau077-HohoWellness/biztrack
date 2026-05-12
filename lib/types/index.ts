export type OrderStatus = 'pending' | 'processing' | 'shipped' | 'delivered' | 'cancelled'

export type CustomerStatus = 'Active' | 'New' | 'At Risk' | 'Lapsed' | 'Churned'

export type CustomerTag = 'New' | 'Repeat' | 'VIP' | 'Dormant' | 'Lost'

export interface CustomerCRM {
  id: string
  name: string
  phone: string
  address: string | null
  created_at: string
  // CRM fields (migration 013)
  total_orders: number
  total_spent: number
  first_order_date: string | null
  last_order_date: string | null
  average_order_value: number
  customer_tag: CustomerTag
  preferred_brand: string | null
  preferred_platform: string | null
  notes: string | null
  last_contacted_at: string | null
  follow_up_date: string | null
  follow_up_note: string | null
  // Receipt (migration 023)
  receipt_url: string | null
  receipt_uploaded_at: string | null
}

export type AttributeType = 'text' | 'number' | 'boolean' | 'select'

export interface Project {
  id: string
  name: string
  code: string
  created_at: string
}

export interface Customer {
  id: string
  name: string
  phone: string
  address: string | null
  created_at: string
  receipt_url?: string | null
}

export interface CustomerWithStats extends Customer {
  order_count: number
  total_spend: number
  avg_order_value: number
  first_order_date: string | null
  last_order_date: string | null
  status: CustomerStatus
  project_ids: string[]
}

export interface Order {
  id: string
  customer_id: string | null
  project_id: string | null
  package_id: string | null
  product_name: string
  package_name: string | null
  total_price: number
  status: OrderStatus
  order_date: string
  created_at: string
  fb_name: string | null
  channel: string | null
  purchase_reason: string | null
  is_new_customer: boolean
  // Production-ready fields (migration 011)
  package_snapshot: { name?: string; price?: number; code?: string } | null
  cost_price: number | null
  profit: number | null
  import_status: string | null
  import_error: string | null
  tracking_number: string | null
  shipping_fee: number | null
  handling_fee: number | null
  is_cod: boolean | null
  payment_status: string | null
  settled_at: string | null
  delivery_status: string | null
  quantity: number | null
  state: string | null
  customers?: Customer
  projects?: Project
  packages?: Pick<Package, 'id' | 'name' | 'code'>
}

export interface Product {
  id: string
  project_id: string | null
  sku: string
  name: string
  cost: number
  brand: string | null
  category: string | null
  unit_cost: number | null
  selling_price: number | null
  weight_g: number | null
  platform: string[]
  status: string
  description: string | null
  image_url: string | null
  created_at: string
  updated_at: string
}

export interface Package {
  id: string
  project_id: string
  name: string
  code: string | null
  price: number | null
  cost: number | null
  custom_attributes: Record<string, unknown>
  is_active: boolean
  sort_order: number
}

export interface PackageItem {
  id: string
  package_id: string
  product_id: string
  quantity: number
}

export interface PackageAttributeSchema {
  id: string
  project_id: string
  attribute_key: string
  attribute_label: string
  attribute_type: AttributeType
  options: string[]
  is_required: boolean
  sort_order: number
  created_at: string
}

export interface PackageBreakdownRow {
  package_name: string
  code: string | null
  units_sold: number
  revenue: number
}

export interface ProjectPnL {
  total_revenue: number
  total_orders: number
  avg_order_value: number
  package_breakdown: PackageBreakdownRow[]
  cost_estimate: {
    shipping: number
    platform_fee: number
    product_cost: number
    total: number
  }
  gross_profit: number
  profit_margin: number
}

export interface Salary {
  id: string
  employee_name: string
  amount: number
  start_date: string
  end_date: string | null
}

export interface Expense {
  id: string
  project_id: string | null
  type: string | null
  category: string | null
  brand: string | null
  amount: number
  date: string
  notes: string | null
  description: string | null
  payment_method: string | null
  receipt_url: string | null
  recurring: boolean
  projects?: Project
}

export interface InventorySummary {
  product_id: string
  sku: string
  product_name: string
  brand: string | null
  current_stock: number
}

export interface Supplier {
  id: string
  name: string
  contact_person: string | null
  phone: string | null
  email: string | null
  products_supplied: string
  lead_time_days: number | null
  payment_terms: string | null
  notes: string | null
  status: string
  created_at: string
}

export interface Campaign {
  id: string
  name: string
  platform: string
  brand: string
  budget: number
  spent: number
  start_date: string
  end_date: string | null
  status: string
  objective: string
  target_product_id: string | null
  notes: string | null
  created_at: string
}

export interface DashboardKPIs {
  totalRevenue: number
  totalOrders: number
  newCustomers: number
  netProfit: number
  repeatOrders: number
  avgOrderValue: number
}

export interface PnLData {
  project: Project
  revenue: number
  productCost: number
  shipping: number
  platformFee: number
  marketing: number
  salary: number
  totalCosts: number
  grossProfit: number
  netProfit: number
}

export interface PaginatedResult<T> {
  data: T[]
  count: number
  page: number
  pageSize: number
}

export interface OrderFilters {
  status?: OrderStatus
  projectId?: string
  dateFrom?: string
  dateTo?: string
  search?: string
  batchId?: string
  incomplete?: boolean
  page?: number
  pageSize?: number
}
