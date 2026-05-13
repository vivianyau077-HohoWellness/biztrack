import { z } from 'zod'

export const loginSchema = z.object({
  email: z.string().email('Invalid email address'),
  password: z.string().min(6, 'Password must be at least 6 characters'),
})

export const customerSchema = z.object({
  name: z.string().min(1, 'Name is required'),
  phone: z.string().min(8, 'Phone number must be at least 8 digits').regex(/^[0-9+\-\s]+$/, 'Invalid phone number'),
  address: z.string().optional(),
})

export const orderSchema = z.object({
  customer_name: z.string().optional(),
  customer_phone: z.string().optional(),
  fb_name: z.string().optional(),
  project_id: z.string().uuid('Select a project'),
  channel: z.string().min(1, 'Channel is required'),
  product_name: z.string().min(1, 'Product is required'),
  package_name: z.string().optional(),
  package_id: z.string().uuid().optional().nullable(),
  purchase_reason: z.string().optional(),
  is_new_customer: z.boolean().optional(),
  total_price: z.coerce.number().min(0, 'Price must be positive'),
  status: z.enum(['pending', 'processing', 'shipped', 'delivered', 'cancelled']).default('pending'),
  order_date: z.string().min(1, 'Order date is required'),
  tracking_number: z.string().optional().nullable(),
  state: z.string().optional(),
  address: z.string().optional(),
})

export const productSchema = z.object({
  sku: z.string().min(1, 'SKU is required'),
  name: z.string().min(1, 'Product name is required'),
  cost: z.coerce.number().min(0, 'Cost must be positive'),
  project_id: z.string().uuid(),
})

export const packageSchema = z.object({
  name: z.string().min(1, 'Package name is required'),
  code: z.string().optional(),
  price: z.coerce.number().min(0, 'Price must be positive').nullable(),
  project_id: z.string().uuid(),
})

export const expenseSchema = z.object({
  project_id: z.string().uuid('Select a project'),
  type: z.string().min(1, 'Expense type is required'),
  amount: z.coerce.number().min(0, 'Amount must be positive'),
  date: z.string().min(1, 'Date is required'),
  notes: z.string().optional(),
})

export const salarySchema = z.object({
  employee_name: z.string().min(1, 'Employee name is required'),
  amount: z.coerce.number().min(0, 'Amount must be positive'),
  start_date: z.string().min(1, 'Start date is required'),
  end_date: z.string().optional().nullable(),
})

export const projectSchema = z.object({
  name: z.string().min(1, 'Project name is required'),
  code: z.string().min(1, 'Project code is required').max(10).toUpperCase(),
})

export const passwordSchema = z.object({
  password: z.string().min(6, 'Password must be at least 6 characters'),
  confirmPassword: z.string(),
}).refine((d) => d.password === d.confirmPassword, {
  message: "Passwords don't match",
  path: ['confirmPassword'],
})

export type LoginFormData = z.infer<typeof loginSchema>
export type CustomerFormData = z.infer<typeof customerSchema>
export type OrderFormData = z.infer<typeof orderSchema>
export type ProductFormData = z.infer<typeof productSchema>
export type PackageFormData = z.infer<typeof packageSchema>
export type ExpenseFormData = z.infer<typeof expenseSchema>
export type SalaryFormData = z.infer<typeof salarySchema>
export type ProjectFormData = z.infer<typeof projectSchema>
export type PasswordFormData = z.infer<typeof passwordSchema>
