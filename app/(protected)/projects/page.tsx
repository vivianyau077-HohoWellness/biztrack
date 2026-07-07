'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { useProjects } from '@/lib/hooks/useProjects'
import PageHeader from '@/components/shared/PageHeader'
import AddProjectModal from '@/components/modules/projects/AddProjectModal'
import { useCleanupDialogArtifacts } from '@/lib/hooks/use-cleanup-dialog-artifacts'
import { Button } from '@/components/ui/button'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Badge } from '@/components/ui/badge'
import { Plus, FolderKanban, ArrowRight } from 'lucide-react'
import PasswordGate from '@/components/shared/PasswordGate'
import ProfitTargetTab from '../analytics/_components/ProfitTargetTab'
import PnlDetail from '../analytics/_components/PnlDetail'
import AdLeadPlanner from '../analytics/_components/AdLeadPlanner'

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
  const router = useRouter()
  const { projects, ready, addProject } = useProjects()
  const [showModal, setShowModal] = useState(false)

  if (!ready) return null

  return (
    <div>
      <PageHeader title="Project Management" description="Manage your product lines and packages">
        <Button size="sm" onClick={() => setShowModal(true)}>
          <Plus className="h-4 w-4 mr-1" />Add Project
        </Button>
      </PageHeader>

      {projects.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 text-center">
          <div className="bg-green-50 rounded-full p-5 mb-4">
            <FolderKanban className="h-10 w-10 text-green-600" />
          </div>
          <h3 className="text-lg font-semibold text-gray-900 mb-1">No projects yet</h3>
          <p className="text-sm text-muted-foreground mb-4">Create your first project to get started</p>
          <Button onClick={() => setShowModal(true)}>
            <Plus className="h-4 w-4 mr-1" />Add Project
          </Button>
        </div>
      ) : (
        <div className="rounded-lg border bg-white overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow className="bg-gray-50/50">
                <TableHead>Project Name</TableHead>
                <TableHead>Code</TableHead>
                <TableHead className="text-center">Packages</TableHead>
                <TableHead className="text-right">Total Sales</TableHead>
                <TableHead className="w-10" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {projects.map(p => (
                <TableRow
                  key={p.id}
                  className="cursor-pointer hover:bg-gray-50 transition-colors"
                  onClick={() => router.push(`/projects/${p.id}`)}
                >
                  <TableCell className="font-medium">{p.name}</TableCell>
                  <TableCell>
                    <span className="font-mono text-xs bg-gray-100 px-2 py-0.5 rounded">
                      {p.code}
                    </span>
                  </TableCell>
                  <TableCell className="text-center">
                    <Badge variant="secondary" className="text-xs">
                      {p.packages.length}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-right text-muted-foreground text-sm">
                    RM 0.00
                  </TableCell>
                  <TableCell>
                    <ArrowRight className="h-4 w-4 text-muted-foreground" />
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      <div className="mt-10 border-t pt-6">
        <h2 className="text-lg font-semibold text-gray-900 mb-3">P&L</h2>
        <PnlDetail />
      </div>

      <div className="mt-8">
        <h2 className="text-lg font-semibold text-gray-900 mb-3">Profit Target</h2>
        <ProfitTargetTab />
      </div>

      <div className="mt-8">
        <h2 className="text-lg font-semibold text-gray-900 mb-1">Ad &amp; Lead Planning (Online — 2 Pages)</h2>
        <p className="text-sm text-muted-foreground mb-3">Beauty Page / Repair Page separately: leads/day, CPL, AOV, ad/day.</p>
        <AdLeadPlanner />
      </div>

      <AddProjectModal
        open={showModal}
        onClose={() => setShowModal(false)}
        existingProjects={projects}
        onAdd={addProject}
      />
    </div>
  )
}
