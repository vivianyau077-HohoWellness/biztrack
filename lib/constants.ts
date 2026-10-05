export const BRAND_COLORS: Record<string, { bg: string; text: string; border: string; tab: string }> = {
  DD:   { bg: 'bg-blue-100',   text: 'text-blue-700',   border: 'border-blue-200',   tab: 'blue'   },
  FIOR: { bg: 'bg-green-100',  text: 'text-green-700',  border: 'border-green-200',  tab: 'green'  },
  Juji: { bg: 'bg-orange-100', text: 'text-orange-700', border: 'border-orange-200', tab: 'orange' },
  KHH:  { bg: 'bg-purple-100', text: 'text-purple-700', border: 'border-purple-200', tab: 'purple' },
  NE:   { bg: 'bg-red-100',    text: 'text-red-700',    border: 'border-red-200',    tab: 'red'    },
}

export const BRANDS = ['DD', 'Juji', 'NE'] as const
export type Brand = typeof BRANDS[number]
