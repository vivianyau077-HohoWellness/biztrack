'use client'

import { useState } from 'react'
import PageHeader from '@/components/shared/PageHeader'
import { useCleanupDialogArtifacts } from '@/lib/hooks/use-cleanup-dialog-artifacts'
import PasswordGate from '@/components/shared/PasswordGate'
import { cn } from '@/lib/utils'
import { BRAND_COLORS } from '@/lib/constants'
import ProfitTargetTab from '../analytics/_components/ProfitTargetTab'
import PnlDetail from '../analytics/_components/PnlDetail'
import AdLeadPlanner from '../analytics/_components/AdLeadPlanner'
import MonthlySalesAnalysis from '../analytics/_components/MonthlySalesAnalysis'
import PeriodCompare from '../analytics/_components/PeriodCompare'
import JujiMonthlySalesAnalysis from '../analytics/_components/JujiMonthlySalesAnalysis'
import JujiPeriodCompare from '../analytics/_components/JujiPeriodCompare'

const PROJECT_BRANDS = ['DD', 'Juji', 'NE'] as const
type PBrand = typeof PROJECT_BRANDS[number]
const TITLE: Record<PBrand, string> = { DD: 'Diamond Drink', Juji: 'Jujigrainz', NE: 'Nutrieye' }

export default function ProjectsPage() {
  useCleanupDialogArtifacts()
  const [brand, setBrand] = useState<PBrand>('DD')

  return (
    <div>
      <PageHeader title={`${TITLE[brand]} — Business Dashboard`} description="Sales analysis, profit target & ad planning" />

      <div className="mt-4 flex items-center gap-2">
        {PROJECT_BRANDS.map(b => (
          <button
            key={b}
            onClick={() => setBrand(b)}
            className={cn(
              'px-3 py-1.5 rounded-lg text-sm font-medium border transition-colors',
              brand === b ? `${BRAND_COLORS[b].bg} ${BRAND_COLORS[b].text} ${BRAND_COLORS[b].border}` : 'border-border hover:bg-muted',
            )}
          >
            {TITLE[b]}
          </button>
        ))}
      </div>

      {brand === 'DD' && (
        <>
          <div className="mt-6">
            <h2 className="text-lg font-semibold text-gray-900 mb-1">Monthly Sales Analysis</h2>
            <p className="text-sm text-muted-foreground mb-3">By platform · New / Repeat / VIP orders, sales &amp; AOV · ROAS &amp; CPL · month vs current.</p>
            <MonthlySalesAnalysis />
          </div>

          <div className="mt-8 border-t pt-6">
            <h2 className="text-lg font-semibold text-gray-900 mb-1">Period Comparison</h2>
            <p className="text-sm text-muted-foreground mb-3">Compare any two date ranges — e.g. 1–7 this month vs 1–7 another month — apples-to-apples.</p>
            <PeriodCompare />
          </div>

          <div className="mt-8 border-t pt-6">
            <h2 className="text-lg font-semibold text-gray-900 mb-3">Profit Target</h2>
            <ProfitTargetTab />
          </div>

          <div className="mt-8 border-t pt-6">
            <h2 className="text-lg font-semibold text-gray-900 mb-1">Ad &amp; Lead Planning</h2>
            <p className="text-sm text-muted-foreground mb-3">Predicts each channel from your past sales mix; plans leads / CPL / ad budget per page.</p>
            <AdLeadPlanner />
          </div>

          <div className="mt-8 border-t pt-6">
            <h2 className="text-lg font-semibold text-gray-900 mb-3">Profit &amp; Loss</h2>
            <PasswordGate
              endpoint="/api/projects/unlock"
              title="Profit &amp; Loss — Protected"
              description="This section contains confidential P&L data. Enter the password to view."
            >
              <PnlDetail />
            </PasswordGate>
          </div>
        </>
      )}

      {brand === 'Juji' && (
        <>
          <div className="mt-6">
            <h2 className="text-lg font-semibold text-gray-900 mb-1">Monthly Sales Analysis</h2>
            <p className="text-sm text-muted-foreground mb-3">By channel · New / Repeat / VIP orders &amp; sales · ROAS, ad spend &amp; messages · month vs current.</p>
            <JujiMonthlySalesAnalysis />
          </div>
          <div className="mt-8 border-t pt-6">
            <h2 className="text-lg font-semibold text-gray-900 mb-1">Period Comparison</h2>
            <p className="text-sm text-muted-foreground mb-3">Compare any two date ranges — e.g. 1–7 this month vs 1–7 another month — apples-to-apples.</p>
            <JujiPeriodCompare />
          </div>
          <div className="mt-8 border-t pt-6">
            <p className="text-sm text-muted-foreground">Profit Target and Ad &amp; Lead Planning for Jujigrainz are coming next.</p>
          </div>
        </>
      )}

      {brand === 'NE' && (
        <div className="mt-6">
          <p className="text-sm text-muted-foreground">Nutrieye business dashboard is coming next. For now see NE under Analytics → Sales Distribution / Segmentation / Repurchase Ladder.</p>
        </div>
      )}
    </div>
  )
}
