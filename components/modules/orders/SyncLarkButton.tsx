'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { RefreshCw } from 'lucide-react'
import { toast } from 'sonner'
import { syncLarkNow } from '@/app/actions/sync-lark'

export default function SyncLarkButton() {
  const [syncing, setSyncing] = useState(false)

  async function handleSync() {
    setSyncing(true)
    try {
      const result = await syncLarkNow()
      const errMsg = result.errors.length > 0 ? ` (${result.errors.length} errors)` : ''
      toast.success(`Synced ${result.synced} records, skipped ${result.skipped}${errMsg}`)
    } catch (e: any) {
      toast.error(e.message ?? 'Lark sync failed')
    } finally {
      setSyncing(false)
    }
  }

  return (
    <Button variant="outline" size="sm" onClick={handleSync} disabled={syncing}>
      <RefreshCw className={`h-4 w-4 mr-1 ${syncing ? 'animate-spin' : ''}`} />
      {syncing ? 'Syncing...' : 'Sync Lark'}
    </Button>
  )
}
