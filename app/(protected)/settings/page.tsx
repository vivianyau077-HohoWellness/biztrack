'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import { fetchBrandSettings, saveBrandSetting } from '@/app/actions/brand-settings'
import type { BrandSetting } from '@/app/actions/brand-settings'
import { useProjects } from '@/lib/hooks/useProjects'
import PageHeader from '@/components/shared/PageHeader'
import ThemeCustomizer from '@/components/shared/ThemeCustomizer'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { toast } from 'sonner'
import type { User } from '@supabase/supabase-js'

export default function SettingsPage() {
  const supabase = createClient()
  const [user, setUser] = useState<User | null>(null)
  const [savingProfile, setSavingProfile] = useState(false)
  const [displayName, setDisplayName] = useState('')
  const [savingBrand, setSavingBrand] = useState<string | null>(null)
  // Password change — plain state, no react-hook-form
  const [newPassword,    setNewPassword]    = useState('')
  const [confirmPwd,     setConfirmPwd]     = useState('')
  const [pwdError,       setPwdError]       = useState('')
  const [changingPwd,    setChangingPwd]    = useState(false)

  const { projects } = useProjects()

  const [brandSettings, setBrandSettings] = useState<BrandSetting[]>([])

  function refreshBrandSettings() {
    fetchBrandSettings().then(setBrandSettings).catch(() => {})
  }

  // Delay the server-action POST until after React's first paint so navigation
  // handlers are registered and clicks aren't blocked by the in-flight request.
  useEffect(() => {
    const timer = setTimeout(refreshBrandSettings, 100)
    return () => clearTimeout(timer)
  }, [])

  // Local editable state for brand settings
  const [brandEdits, setBrandEdits] = useState<Record<string, {
    vip_spend_threshold: string
    vip_order_threshold: string
    retention_days: string
    inactive_days: string
  }>>({})

  useEffect(() => {
    if (projects.length > 0) {
      const edits: typeof brandEdits = {}
      for (const p of projects) {
        const s = brandSettings.find(b => b.project_id === p.id)
        edits[p.id] = {
          vip_spend_threshold: String(s?.vip_spend_threshold ?? 2000),
          vip_order_threshold: String(s?.vip_order_threshold ?? 6),
          retention_days: String(s?.retention_days ?? 365),
          inactive_days: String(s?.inactive_days ?? 365),
        }
      }
      setBrandEdits(edits)
    }
  }, [brandSettings, projects])

  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user } }) => {
      setUser(user)
      setDisplayName(user?.user_metadata?.full_name ?? '')
    })
  }, [])

  // Cleanup Radix body locks on unmount — now also handled globally by
  // DialogArtifactCleaner in layout, but kept here as a local safety net.
  useEffect(() => {
    return () => {
      document.body.style.pointerEvents = ''
      document.body.style.overflow = ''
      document.body.removeAttribute('data-scroll-locked')
      document.body.removeAttribute('aria-hidden')
      const root = document.getElementById('__next')
      if (root) {
        root.removeAttribute('aria-hidden')
        root.removeAttribute('inert')
      }
    }
  }, [])

  async function saveProfile() {
    setSavingProfile(true)
    const { error } = await supabase.auth.updateUser({ data: { full_name: displayName } })
    if (error) { toast.error(error.message); setSavingProfile(false); return }
    toast.success('Profile updated')
    setSavingProfile(false)
  }

  async function changePassword() {
    setPwdError('')
    if (newPassword.length < 6) { setPwdError('Password must be at least 6 characters'); return }
    if (newPassword !== confirmPwd) { setPwdError("Passwords don't match"); return }
    setChangingPwd(true)
    const { error } = await supabase.auth.updateUser({ password: newPassword })
    if (error) { toast.error(error.message); setChangingPwd(false); return }
    toast.success('Password updated successfully')
    setNewPassword('')
    setConfirmPwd('')
    setChangingPwd(false)
  }

  async function handleSaveBrandSetting(projectId: string) {
    const edit = brandEdits[projectId]
    if (!edit) return
    setSavingBrand(projectId)
    try {
      await saveBrandSetting(projectId, {
        vip_spend_threshold: parseFloat(edit.vip_spend_threshold) || 2000,
        vip_order_threshold: parseInt(edit.vip_order_threshold, 10) || 6,
        retention_days: parseInt(edit.retention_days, 10) || 365,
        inactive_days: parseInt(edit.inactive_days, 10) || 365,
      })
      toast.success('Brand settings saved')
      refreshBrandSettings()
    } catch (e: any) {
      toast.error(e.message ?? 'Failed to save')
    } finally {
      setSavingBrand(null)
    }
  }

  function updateBrandEdit(projectId: string, field: string, value: string) {
    setBrandEdits(prev => ({
      ...prev,
      [projectId]: { ...prev[projectId], [field]: value },
    }))
  }

  return (
    <div className="space-y-6 max-w-2xl">
      <PageHeader title="Settings" />

      <ThemeCustomizer />

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Profile</CardTitle>
          <CardDescription>Update your display name</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-1">
            <Label>Email</Label>
            <Input value={user?.email ?? ''} disabled className="bg-muted" />
          </div>
          <div className="space-y-1">
            <Label>Display Name</Label>
            <Input
              value={displayName}
              onChange={e => setDisplayName(e.target.value)}
              placeholder="Your name"
            />
          </div>
          <Button type="button" onClick={saveProfile} disabled={savingProfile} size="sm">
            {savingProfile ? 'Saving...' : 'Save Profile'}
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Change Password</CardTitle>
          <CardDescription>Use a strong password with at least 6 characters</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            <div className="space-y-1">
              <Label>New Password</Label>
              <Input
                type="password"
                placeholder="••••••••"
                value={newPassword}
                onChange={e => setNewPassword(e.target.value)}
              />
            </div>
            <div className="space-y-1">
              <Label>Confirm Password</Label>
              <Input
                type="password"
                placeholder="••••••••"
                value={confirmPwd}
                onChange={e => setConfirmPwd(e.target.value)}
              />
            </div>
            {pwdError && <p className="text-xs text-destructive">{pwdError}</p>}
            <Button type="button" size="sm" onClick={changePassword} disabled={changingPwd}>
              {changingPwd ? 'Updating...' : 'Update Password'}
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Brand VIP Settings */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Brand VIP & Retention Settings</CardTitle>
          <CardDescription>
            Configure VIP thresholds and retention windows per brand. These affect how customer tags are computed.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {projects.map(project => {
            const edit = brandEdits[project.id] ?? {
              vip_spend_threshold: '2000',
              vip_order_threshold: '6',
              retention_days: '365',
              inactive_days: '365',
            }
            return (
              <div key={project.id} className="space-y-3 pb-4 border-b last:border-b-0 last:pb-0">
                <p className="text-sm font-semibold">{project.name} ({project.code ?? project.name})</p>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <Label className="text-xs">VIP Spend Threshold (RM)</Label>
                    <Input
                      type="number"
                      step="1"
                      value={edit.vip_spend_threshold}
                      onChange={e => updateBrandEdit(project.id, 'vip_spend_threshold', e.target.value)}
                      placeholder="2000"
                    />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">VIP Order Threshold (orders)</Label>
                    <Input
                      type="number"
                      step="1"
                      value={edit.vip_order_threshold}
                      onChange={e => updateBrandEdit(project.id, 'vip_order_threshold', e.target.value)}
                      placeholder="6"
                    />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">Retention Window (days)</Label>
                    <Input
                      type="number"
                      step="1"
                      value={edit.retention_days}
                      onChange={e => updateBrandEdit(project.id, 'retention_days', e.target.value)}
                      placeholder="365"
                    />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">Inactive Threshold (days)</Label>
                    <Input
                      type="number"
                      step="1"
                      value={edit.inactive_days}
                      onChange={e => updateBrandEdit(project.id, 'inactive_days', e.target.value)}
                      placeholder="365"
                    />
                  </div>
                </div>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  onClick={() => handleSaveBrandSetting(project.id)}
                  disabled={savingBrand === project.id}
                >
                  {savingBrand === project.id ? 'Saving...' : `Save ${project.name} Settings`}
                </Button>
              </div>
            )
          })}
          {projects.length === 0 && (
            <p className="text-sm text-muted-foreground">No projects found.</p>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
