'use client'

import PageHeader from '@/components/shared/PageHeader'
import { useCleanupDialogArtifacts } from '@/lib/hooks/use-cleanup-dialog-artifacts'
import PasswordGate from '@/components/shared/PasswordGate'
import ProfitTargetTab from '../analytics/_components/ProfitTargetTab'
import PnlDetail from '../analytics/_components/PnlDetail'
import AdLeadPlanner from '../analytics/_components/AdLeadPlanner'
import MonthlySalesAnalysis from '../analytics/_components/MonthlySalesAnalysis'
import PeriodCompare from '../analytics/_components/PeriodCompare'

export default function ProjectsPage() {
  useCleanupDialogArtifacts()

  return (
    <div>
      <PageHeader title="Diamond Drink — Business Dashboard" description="Sales analysis, profit target & ad planning" />

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

      {/* P&L — separately, password-protected */}
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
    </div>
  )
}
