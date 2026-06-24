'use server'

import { createAdminClient } from '@/lib/supabase/admin'

// Marks an inactive customer (by phone) as followed-up, reusing the existing
// customers.follow_up_date / follow_up_note columns so the status persists for
// everyone and survives reloads.
export async function setInactiveFollowUp(
  phone: string,
  done: boolean,
  note?: string,
): Promise<{ success: boolean; error?: string }> {
  if (!phone) return { success: false, error: 'phone required' }
  const sb = createAdminClient()
  const { error } = await sb
    .from('customers')
    .update({
      follow_up_date: done ? new Date().toISOString().split('T')[0] : null,
      follow_up_note: note && note.trim() ? note.trim() : null,
    })
    .eq('phone', phone)
  if (error) return { success: false, error: error.message }
  return { success: true }
}
