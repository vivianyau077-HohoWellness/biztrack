'use client'

import PageHeader from '@/components/shared/PageHeader'
import { useCleanupDialogArtifacts } from '@/lib/hooks/use-cleanup-dialog-artifacts'
import PasswordGate from '@/components/shared/PasswordGate'
import ProfitTargetTab from '../analytics/_components/ProfitTargetTab'
import PnlDetail from '../analytics/_components/PnlDetail'
import AdLeadPlanner from '../analytics/_components/AdLeadPlanner'
import MonthlySalesAnalysis from '../analytics/_components/MonthlySalesAnalysis'

export default function ProjectsPage() {
  return (
    <PasswordGate
      endpoint="/api/projects/unlock"
      title="Projects — Protected"
      description="This page contains confidential data. Enter the password to view."
    >
      <ProjectsInner />
    </PasswordGate>
  )
}

function ProjectsInner() {
  useCleanupDialogArtifacts()

  return (
    <div>
      <PageHeader title="Diamond Drink — Business Dashboard" description="Sales analysis, forecast, profit target & ad planning" />

      <div className="mt-6">
        <h2 className="text-lg font-semibold text-gray-900 mb-1">Monthly Sales Analysis</h2>
        <p className="text-sm text-muted-foreground mb-3">By platform · New / Repeat / VIP orders, sales &amp; AOV · ROAS &amp; CPL · month forecast vs actual.</p>
        <MonthlySalesAnalysis />
      </div>

      <div className="mt-8 border-t pt-6">
        <h2 className="text-lg font-semibold text-gray-900 mb-3">Profit Target</h2>
        <ProfitTargetTab />
      </div>

      <div className="mt-8 border-t pt-6">
        <h2 className="text-lg font-semibold text-gray-900 mb-1">Ad &amp; Lead Planning (Online — 2 Pages)</h2>
        <p className="text-sm text-muted-foreground mb-3">Beauty Page / Repair Page separately: leads/day, CPL, AOV, ad/day.</p>
        <AdLeadPlanner />
      </div>

      <div className="mt-8 border-t pt-6">
        <h2 className="text-lg font-semibold text-gray-900 mb-3">P&L</h2>
        <PnlDetail />
      </div>
    </div>
  )
}
