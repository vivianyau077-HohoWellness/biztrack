import { redirect } from 'next/navigation'

// The Purchase Reason Gaps tool was a one-off cleanup (DD backfill done) and has been removed.
export default function ReasonGapsPage() {
  redirect('/analytics')
}
