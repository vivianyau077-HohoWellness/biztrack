'use client'

import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useCleanupDialogArtifacts } from '@/lib/hooks/use-cleanup-dialog-artifacts'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { BRANDS, BRAND_COLORS } from '@/lib/constants'
import { cn } from '@/lib/utils'
import { Upload, BarChart3, Users, Target } from 'lucide-react'
import { subDays, format } from 'date-fns'
import DateRangePicker from '@/components/shared/DateRangePicker'
import SalesOverviewTab from './_components/SalesOverviewTab'
import CustomerInsightsTab from './_components/CustomerInsightsTab'
import GoalTrackingTab from './_components/GoalTrackingTab'
import AdSpendImportModal from './_components/AdSpendImportModal'

type Tab = 'sales' | 'ads' | 'customers' | 'goals'

const TAB_CONFIG = [
  { id: 'sales' as Tab, label: 'Sales Overview', icon: BarChart3 },
  { id: 'customers' as Tab, label: 'Customer Insights', icon: Users },
  { id: 'goals' as Tab, label: 'Goal Tracking', icon: Target },
]

export default function AnalyticsPage() {
  useCleanupDialogArtifacts()
  const supabase = createClient()

  const today = new Date()
  const [selectedBrand, setSelectedBrand] = useState('')
  const [activeTab, setActiveTab] = useState<Tab>('sales')
  const [dateFrom, setDateFrom] = useState(format(subDays(today, 29), 'yyyy-MM-dd'))
  const [dateTo, setDateTo] = useState(format(today, 'yyyy-MM-dd'))
  const [showImport, setShowImport] = useState(false)

  const { data: projects = [] } = useQuery({
    queryKey: ['projects'],
    queryFn: async () => {
      const { data } = await supabase.from('projects').select('id, name, code').order('name')
      return data ?? []
    },
  })

  // Map brand code → project id
  const projectId = selectedBrand
    ? (projects.find(p => p.name === selectedBrand || p.code === selectedBrand)?.id ?? '')
    : ''

  return (
    <div className="space-y-0">
      {/* Page title */}
      <div className="mb-4">
        <h1 className="text-2xl font-bold tracking-tight">Analytics Command Center</h1>
        <p className="text-sm text-muted-foreground mt-0.5">Live calculations from your orders database</p>
      </div>

      {/* Sticky top bar */}
      <div className="sticky top-0 z-10 bg-background border-b pb-3 pt-1 mb-6 space-y-3">
        {/* Brand toggle + Import */}
        <div className="flex flex-wrap items-center gap-2 justify-between">
          <div className="flex flex-wrap gap-1.5">
            <button
              onClick={() => setSelectedBrand('')}
              className={cn(
                'px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors',
                selectedBrand === ''
                  ? 'bg-primary text-primary-foreground border-primary'
                  : 'border-border hover:bg-muted',
              )}
            >
              All Brands
            </button>
            {BRANDS.map(brand => (
              <button
                key={brand}
                onClick={() => setSelectedBrand(brand === selectedBrand ? '' : brand)}
                className={cn(
                  'px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors',
                  selectedBrand === brand
                    ? `${BRAND_COLORS[brand].bg} ${BRAND_COLORS[brand].text} ${BRAND_COLORS[brand].border}`
                    : 'border-border hover:bg-muted',
                )}
              >
                {brand}
              </button>
            ))}
          </div>
          <Button size="sm" variant="outline" onClick={() => setShowImport(true)}>
            <Upload className="h-3.5 w-3.5 mr-1.5" />
            Import Ad Spend
          </Button>
        </div>

        {/* Date range */}
        <div className="flex items-center gap-2">
          <DateRangePicker
            dateFrom={dateFrom}
            dateTo={dateTo}
            onChange={(f, t) => { setDateFrom(f); setDateTo(t) }}
          />
        </div>

        {/* Tab navigation */}
        <div className="flex gap-1 border-b -mb-3 pb-0">
          {TAB_CONFIG.map(tab => {
            const Icon = tab.icon
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={cn(
                  'flex items-center gap-1.5 px-4 py-2 text-sm font-medium border-b-2 transition-colors',
                  activeTab === tab.id
                    ? 'border-primary text-primary'
                    : 'border-transparent text-muted-foreground hover:text-foreground hover:border-muted-foreground',
                )}
              >
                <Icon className="h-3.5 w-3.5" />
                {tab.label}
              </button>
            )
          })}
        </div>
      </div>

      {/* Tab content */}
      <div className="min-h-[400px]">
        {activeTab === 'sales' && (
          <SalesOverviewTab
            projectId={projectId}
            dateFrom={dateFrom}
            dateTo={dateTo}
            selectedBrand={selectedBrand}
          />
        )}
        {activeTab === 'customers' && (
          <CustomerInsightsTab
            projectId={projectId}
            dateFrom={dateFrom}
            dateTo={dateTo}
            selectedBrand={selectedBrand}
          />
        )}
        {activeTab === 'goals' && (
          <GoalTrackingTab
            projectId={projectId}
            selectedBrand={selectedBrand}
            projects={projects}
          />
        )}
      </div>

      {/* Import modal */}
      <AdSpendImportModal
        open={showImport}
        onClose={() => setShowImport(false)}
        projects={projects}
      />
    </div>
  )
}
