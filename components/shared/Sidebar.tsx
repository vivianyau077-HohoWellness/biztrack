'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { cn } from '@/lib/utils'
import { createClient } from '@/lib/supabase/client'
import { toast } from 'sonner'
import {
  LayoutDashboard, ShoppingCart, BarChart2,
  FolderKanban, Settings, LogOut, Leaf, ChevronDown, ChevronRight,
  PanelLeftClose, PanelLeft, Megaphone,
  Package, DollarSign, BookOpen, Crown,
} from 'lucide-react'

// ---------------------------------------------------------------------------
// Nav structure
// ---------------------------------------------------------------------------

interface NavChild { label: string; href: string }
interface NavGroup {
  label: string
  icon: React.ComponentType<{ className?: string }>
  href?: string
  children?: NavChild[]
}

const NAV: NavGroup[] = [
  { label: 'Home',      icon: LayoutDashboard, href: '/dashboard' },
  {
    label: 'Orders', icon: ShoppingCart,
    children: [
      { label: 'Daily Order',    href: '/orders' },
      { label: 'Import History', href: '/orders/import-history' },
    ],
  },
  { label: 'Analytics', icon: BarChart2, href: '/analytics' },
  {
    label: 'Finance', icon: DollarSign,
    children: [
      { label: 'PnL',      href: '/pnl' },
      { label: 'Expenses', href: '/expenses' },
    ],
  },
  {
    label: 'Catalog', icon: Package,
    children: [
      { label: 'Packages',  href: '/catalog/packages' },
      { label: 'Products',  href: '/products' },
      { label: 'Inventory', href: '/inventory' },
      { label: 'Suppliers', href: '/suppliers' },
    ],
  },
  { label: 'Projects',   icon: FolderKanban, href: '/projects' },
  { label: 'Campaigns',  icon: Megaphone,    href: '/campaigns' },
  { label: 'VIP',        icon: Crown,        href: '/vip' },
  { label: 'Wiki / SOP', icon: BookOpen,      href: '/wiki' },
  { label: 'Settings',   icon: Settings,     href: '/settings' },
]

// ---------------------------------------------------------------------------
// Helpers — safe localStorage reads that work during SSR
// ---------------------------------------------------------------------------

function readCollapsed(): boolean {
  try { return localStorage.getItem('sidebar_collapsed') === 'true' } catch { return false }
}

function initialOpenGroups(pathname: string): Set<string> {
  const auto = new Set<string>()
  NAV.forEach(item => {
    if (item.children?.some(c => pathname.startsWith(c.href))) auto.add(item.label)
  })
  return auto
}

// ---------------------------------------------------------------------------
// Sidebar uses CSS variables set by applyTheme() so every theme is reflected
// automatically. Variables: --sidebar-bg, --sidebar-border, --sidebar-text,
// --sidebar-active-bg, --sidebar-active-text, --sidebar-hover-bg
// ---------------------------------------------------------------------------

export default function Sidebar() {
  const pathname = usePathname()
  const router   = useRouter()
  const supabase = createClient()

  // Lazy initializers so the sidebar ALWAYS renders immediately — no null flash
  // that could cause React to drop click events during re-hydration.
  const [collapsed,  setCollapsed]  = useState(readCollapsed)
  const [openGroups, setOpenGroups] = useState(() => initialOpenGroups(pathname))

  // Sync collapsed state from localStorage after hydration (handles SSR mismatch)
  useEffect(() => {
    const saved = localStorage.getItem('sidebar_collapsed')
    if (saved !== null) setCollapsed(saved === 'true')
  }, [])

  function toggleCollapsed() {
    setCollapsed(prev => {
      const next = !prev
      localStorage.setItem('sidebar_collapsed', String(next))
      return next
    })
  }

  function toggleGroup(label: string) {
    if (collapsed) {
      setCollapsed(false)
      localStorage.setItem('sidebar_collapsed', 'false')
      setOpenGroups(prev => new Set([...Array.from(prev), label]))
      return
    }
    setOpenGroups(prev => {
      const next = new Set(prev)
      next.has(label) ? next.delete(label) : next.add(label)
      return next
    })
  }

  async function handleLogout() {
    await supabase.auth.signOut()
    toast.success('Logged out')
    router.push('/login')
    router.refresh()
  }

  // Shared class fragments referencing CSS vars set by applyTheme()
  const itemBase     = 'flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-colors'
  const itemActive   = 'bg-[var(--sidebar-active-bg)] text-[var(--sidebar-active-text)]'
  const itemInactive = 'text-[var(--sidebar-text)] hover:bg-[var(--sidebar-hover-bg)]'
  const childBase    = 'flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm transition-colors'

  return (
    <aside
      className={cn(
        'flex flex-col h-screen border-r shrink-0 transition-all duration-200 ease-in-out',
        collapsed ? 'w-16' : 'w-64',
      )}
      style={{
        backgroundColor: 'var(--sidebar-bg)',
        borderColor:     'var(--sidebar-border)',
      }}
    >
      {/* ── Brand header ── */}
      <div
        className="flex h-16 items-center border-b px-3 gap-2"
        style={{ borderColor: 'var(--sidebar-border)' }}
      >
        <div className="shrink-0 bg-primary rounded-lg p-1.5">
          <Leaf className="h-4 w-4 text-primary-foreground" />
        </div>
        {!collapsed && (
          <>
            <span
              className="flex-1 font-bold text-sm truncate"
              style={{ color: 'var(--sidebar-text)' }}
            >
              Hoho Wellness
            </span>
            <button
              onClick={toggleCollapsed}
              className="p-1 rounded-md transition-colors hover:bg-[var(--sidebar-hover-bg)]"
              style={{ color: 'var(--sidebar-text)', opacity: 0.6 }}
              title="Collapse sidebar"
            >
              <PanelLeftClose className="h-4 w-4" />
            </button>
          </>
        )}
      </div>

      {/* ── Navigation ── */}
      <nav className="flex-1 overflow-y-auto px-2 py-3 space-y-0.5">
        {NAV.map(item => {
          if (item.children) {
            const isOpen   = openGroups.has(item.label)
            const isActive = item.children.some(c => pathname.startsWith(c.href))

            return (
              <div key={item.label}>
                <button
                  onClick={() => toggleGroup(item.label)}
                  title={collapsed ? item.label : undefined}
                  className={cn('w-full', itemBase, isActive ? itemActive : itemInactive)}
                >
                  <item.icon className="h-4 w-4 shrink-0" />
                  {!collapsed && (
                    <>
                      <span className="flex-1 text-left">{item.label}</span>
                      {isOpen
                        ? <ChevronDown  className="h-3.5 w-3.5 opacity-50" />
                        : <ChevronRight className="h-3.5 w-3.5 opacity-50" />}
                    </>
                  )}
                </button>

                {!collapsed && isOpen && (
                  <div
                    className="mt-0.5 ml-3 pl-3 border-l-2 space-y-0.5"
                    style={{ borderColor: 'var(--sidebar-active-bg)' }}
                  >
                    {item.children.map(child => {
                      const childActive = pathname.startsWith(child.href)
                      return (
                        <Link
                          key={child.href}
                          href={child.href}
                          className={cn(childBase, childActive ? itemActive : itemInactive)}
                        >
                          <span className="text-xs font-mono opacity-40">–</span>
                          {child.label}
                        </Link>
                      )
                    })}
                  </div>
                )}
              </div>
            )
          }

          const isActive = item.href
            ? pathname === item.href || pathname.startsWith(item.href + '/')
            : false

          return (
            <Link
              key={item.label}
              href={item.href!}
              title={collapsed ? item.label : undefined}
              className={cn(itemBase, isActive ? itemActive : itemInactive)}
            >
              <item.icon className="h-4 w-4 shrink-0" />
              {!collapsed && <span>{item.label}</span>}
            </Link>
          )
        })}
      </nav>

      {/* ── Footer ── */}
      <div
        className="border-t p-2 space-y-0.5"
        style={{ borderColor: 'var(--sidebar-border)' }}
      >
        {collapsed ? (
          <>
            <button
              onClick={toggleCollapsed}
              title="Expand sidebar"
              className="w-full flex justify-center p-2 rounded-lg transition-colors hover:bg-[var(--sidebar-hover-bg)]"
              style={{ color: 'var(--sidebar-text)', opacity: 0.6 }}
            >
              <PanelLeft className="h-4 w-4" />
            </button>
            <button
              onClick={handleLogout}
              title="Logout"
              className="w-full flex justify-center p-2 rounded-lg transition-colors hover:text-red-500 hover:bg-[var(--sidebar-hover-bg)]"
              style={{ color: 'var(--sidebar-text)', opacity: 0.6 }}
            >
              <LogOut className="h-4 w-4" />
            </button>
          </>
        ) : (
          <button
            onClick={handleLogout}
            className="w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition-colors hover:text-red-500 hover:bg-[var(--sidebar-hover-bg)]"
            style={{ color: 'var(--sidebar-text)', opacity: 0.8 }}
          >
            <LogOut className="h-4 w-4" />
            Logout
          </button>
        )}
      </div>
    </aside>
  )
}
