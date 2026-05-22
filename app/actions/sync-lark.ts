'use server'

import { runLarkSync } from '@/lib/lark-sync'
import type { SyncResult } from '@/lib/lark-sync'

export async function syncLarkNow(): Promise<SyncResult> {
  return runLarkSync()
}
