'use client'

import { useState } from 'react'
import { Lock } from 'lucide-react'
import { Button } from '@/components/ui/button'

// Server-verified password gate. Children (and their data fetching) only mount
// after the correct password is entered. Not persisted — re-prompts every visit.
export default function PasswordGate({
  endpoint,
  title = 'This page is protected',
  description = 'This content is confidential. Enter the password to view.',
  children,
}: {
  endpoint: string
  title?: string
  description?: string
  children: React.ReactNode
}) {
  const [unlocked, setUnlocked] = useState(false)
  const [pw, setPw] = useState('')
  const [err, setErr] = useState('')
  const [loading, setLoading] = useState(false)

  if (unlocked) return <>{children}</>

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setErr('')
    try {
      const res = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password: pw }),
      })
      if (res.ok) setUnlocked(true)
      else setErr('Wrong password, try again.')
    } catch {
      setErr('Something went wrong, please try again.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="flex items-center justify-center py-24">
      <form onSubmit={submit} className="w-full max-w-sm rounded-2xl border bg-white p-8 shadow-sm text-center">
        <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-green-50">
          <Lock className="h-7 w-7 text-green-600" />
        </div>
        <h2 className="text-lg font-semibold text-gray-900">{title}</h2>
        <p className="mt-1 text-sm text-muted-foreground">{description}</p>
        <input
          type="password"
          autoFocus
          value={pw}
          onChange={e => setPw(e.target.value)}
          placeholder="Enter password"
          className="mt-5 w-full h-10 rounded-md border border-input bg-background px-3 text-sm text-center"
        />
        {err && <p className="mt-2 text-sm text-red-600">{err}</p>}
        <Button type="submit" className="mt-4 w-full" disabled={loading || !pw}>
          {loading ? 'Checking…' : 'Unlock'}
        </Button>
      </form>
    </div>
  )
}
