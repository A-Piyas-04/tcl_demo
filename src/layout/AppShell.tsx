/**
 * The application frame: a dark navigation rail, a slim top bar, and the
 * workspace. The rail collapses to icons; the workspace is a bounded column so
 * content never stretches into wide bands on a large screen.
 */

import * as React from 'react'
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom'
import { AnimatePresence, motion } from 'framer-motion'
import {
  Bell,
  Boxes,
  ChevronsLeft,
  ChevronsRight,
  Eye,
  FactoryIcon,
  FileText,
  Gauge,
  GitBranch,
  LogOut,
  type LucideIcon,
  Network,
  PanelsTopLeft,
  Pill,
  RefreshCw,
  Rocket,
  Search,
  Settings,
  ShieldCheck,
  Ship,
  Timer,
  Users,
  Wallet,
} from 'lucide-react'
import { cn, fmtAgo } from '@/lib/utils'
import {
  useCanWrite,
  useCurrentUser,
  useDb,
  usePresenter,
  useRole,
  useStore,
} from '@/data/store'
import { markNotificationsRead } from '@/data/api'
import {
  Avatar,
  Badge,
  Kbd,
  Menu,
  MenuContent,
  MenuItem,
  MenuLabel,
  MenuSeparator,
  MenuTrigger,
  Popover,
  PopoverContent,
  PopoverTrigger,
  SegmentedControl,
  Switch,
  Tooltip,
} from '@/components/ui'
import { CommandPalette } from './CommandPalette'
import { Breadcrumbs } from './Breadcrumbs'

interface NavItem {
  to: string
  label: string
  icon: LucideIcon
  /** exact match only, for the dashboard */
  end?: boolean
}

interface NavGroup {
  title: string
  items: NavItem[]
}

const NAV: NavGroup[] = [
  {
    title: 'Overview',
    items: [{ to: '/', label: 'Dashboard', icon: Gauge, end: true }],
  },
  {
    title: 'Register',
    items: [
      { to: '/products', label: 'Products', icon: Pill },
      { to: '/manufacturers', label: 'Manufacturers', icon: FactoryIcon },
      { to: '/clients', label: 'Clients', icon: Users },
    ],
  },
  {
    title: 'Pipeline',
    items: [
      { to: '/requirements', label: 'Requirements', icon: PanelsTopLeft },
      { to: '/engagements', label: 'Engagements', icon: GitBranch },
      { to: '/samples', label: 'Samples', icon: Timer },
    ],
  },
  {
    title: 'Trade',
    items: [
      { to: '/client-orders', label: 'Client orders', icon: Boxes },
      { to: '/indents', label: 'Indents', icon: Rocket },
      { to: '/shipments', label: 'Shipments', icon: Ship },
      { to: '/commissions', label: 'Commission', icon: Wallet },
    ],
  },
  {
    title: 'Insight',
    items: [
      { to: '/relationships', label: 'Relationships', icon: Network },
      { to: '/documents', label: 'Documents', icon: FileText },
      { to: '/reports', label: 'Reports', icon: ShieldCheck },
    ],
  },
  {
    title: 'Administration',
    items: [{ to: '/admin', label: 'Admin', icon: Settings }],
  },
]

export function AppShell() {
  const [collapsed, setCollapsed] = React.useState(false)
  const [paletteOpen, setPaletteOpen] = React.useState(false)
  const location = useLocation()
  const navigate = useNavigate()
  const user = useCurrentUser()

  // ⌘K / Ctrl-K opens the palette; g-then-key jumps to a section.
  React.useEffect(() => {
    let lastG = 0
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null
      const typing =
        target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable)

      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault()
        setPaletteOpen(true)
        return
      }
      if (typing) return
      if (e.key === '/') {
        e.preventDefault()
        setPaletteOpen(true)
        return
      }
      if (e.key.toLowerCase() === 'g') {
        lastG = Date.now()
        return
      }
      if (Date.now() - lastG < 900) {
        const jump: Record<string, string> = {
          d: '/',
          p: '/products',
          m: '/manufacturers',
          c: '/clients',
          r: '/requirements',
          e: '/engagements',
          o: '/client-orders',
          i: '/indents',
          s: '/shipments',
          k: '/commissions',
        }
        const to = jump[e.key.toLowerCase()]
        if (to) {
          e.preventDefault()
          navigate(to)
          lastG = 0
        }
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [navigate])

  return (
    <div className="flex min-h-screen bg-paper-100">
      {/* navigation rail */}
      <motion.aside
        animate={{ width: collapsed ? '3.75rem' : '15rem' }}
        transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
        className="sticky top-0 z-30 hidden h-screen shrink-0 flex-col border-r border-ink-800 bg-ink-900 md:flex"
      >
        <div className="flex h-[3.25rem] items-center gap-2.5 border-b border-ink-800 px-3">
          <span className="grid h-7 w-7 shrink-0 place-items-center rounded-md bg-accent-500 font-mono text-[13px] font-bold text-ink-950">
            T
          </span>
          {!collapsed ? (
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="min-w-0 leading-tight">
              <p className="truncate text-sm font-semibold text-paper-100">Techstream</p>
              <p className="truncate text-[10px] text-ink-500">Sourcing platform</p>
            </motion.div>
          ) : null}
        </div>

        <nav className="scroll-slim flex-1 space-y-4 overflow-y-auto px-2 py-3">
          {NAV.map((group) => (
            <div key={group.title}>
              {!collapsed ? (
                <p className="px-2 pb-1 text-[10px] font-semibold uppercase tracking-wider text-ink-600">
                  {group.title}
                </p>
              ) : (
                <div className="mx-2 mb-2 h-px bg-ink-800" />
              )}
              <ul className="space-y-0.5">
                {group.items.map((item) => (
                  <li key={item.to}>
                    <RailLink item={item} collapsed={collapsed} />
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </nav>

        <div className="border-t border-ink-800 p-2">
          <button
            onClick={() => setCollapsed((c) => !c)}
            className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-xs text-ink-500 transition-colors hover:bg-ink-850 hover:text-paper-200"
          >
            {collapsed ? <ChevronsRight className="h-4 w-4" /> : <ChevronsLeft className="h-4 w-4" />}
            {!collapsed ? 'Collapse' : null}
          </button>
        </div>
      </motion.aside>

      {/* workspace */}
      <div className="flex min-w-0 flex-1 flex-col">
        <TopBar onOpenPalette={() => setPaletteOpen(true)} />
        <main className="min-w-0 flex-1">
          <div className="mx-auto w-full max-w-[94rem] px-4 py-5 sm:px-6">
            <AnimatePresence mode="wait">
              <motion.div
                key={location.pathname}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -4 }}
                transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
              >
                <Outlet />
              </motion.div>
            </AnimatePresence>
          </div>
        </main>
        <footer className="border-t border-paper-300 px-4 py-3 sm:px-6">
          <p className="mx-auto max-w-[94rem] text-2xs text-ink-400">
            Prototype with demonstration data — no live database. Signed in as {user?.fullName ?? 'guest'}.
          </p>
        </footer>
      </div>

      <MobileNav />
      <CommandPalette open={paletteOpen} onOpenChange={setPaletteOpen} />
    </div>
  )
}

function RailLink({ item, collapsed }: { item: NavItem; collapsed: boolean }) {
  const Icon = item.icon
  const link = (
    <NavLink
      to={item.to}
      end={item.end}
      className={({ isActive }) =>
        cn(
          'group relative flex items-center gap-2.5 rounded px-2 py-1.5 text-sm transition-colors',
          isActive ? 'bg-ink-800 font-medium text-white' : 'text-ink-400 hover:bg-ink-850 hover:text-paper-200',
          collapsed && 'justify-center px-0',
        )
      }
    >
      {({ isActive }) => (
        <>
          {isActive ? (
            <motion.span
              layoutId="rail-active"
              className="absolute left-0 top-1/2 h-5 w-[2px] -translate-y-1/2 rounded-r bg-accent-400"
              transition={{ duration: 0.2 }}
            />
          ) : null}
          <Icon className="h-4 w-4 shrink-0" />
          {!collapsed ? <span className="truncate">{item.label}</span> : null}
        </>
      )}
    </NavLink>
  )
  return collapsed ? (
    <Tooltip content={item.label} side="right">
      {link}
    </Tooltip>
  ) : (
    link
  )
}

function TopBar({ onOpenPalette }: { onOpenPalette: () => void }) {
  const db = useDb()
  const user = useCurrentUser()
  const role = useRole()
  const canWrite = useCanWrite()
  const presenter = usePresenter()
  const setRole = useStore((s) => s.setRole)
  const setPresenter = useStore((s) => s.setPresenter)
  const resetDemoData = useStore((s) => s.resetDemoData)
  const signOut = useStore((s) => s.signOut)

  const unread = db.notifications.filter((n) => !n.isRead && n.userId === user?.id)
  const mine = db.notifications.filter((n) => n.userId === user?.id).slice(0, 8)

  return (
    <header className="sticky top-0 z-20 border-b border-paper-300 bg-paper-50/95 backdrop-blur-[3px]">
      <div className="mx-auto flex h-[3.25rem] w-full max-w-[94rem] items-center gap-3 px-4 sm:px-6">
        <div className="min-w-0 flex-1">
          <Breadcrumbs />
        </div>

        <button
          onClick={onOpenPalette}
          className="group hidden h-8 items-center gap-2 rounded-md border border-paper-300 bg-white px-2.5 text-xs text-ink-400 shadow-tile transition-colors hover:border-paper-400 hover:text-ink-600 sm:flex"
        >
          <Search className="h-3.5 w-3.5" />
          <span className="pr-6">Search anything…</span>
          <span className="flex items-center gap-0.5">
            <Kbd>⌘</Kbd>
            <Kbd>K</Kbd>
          </span>
        </button>

        {!canWrite ? (
          <Tooltip content="This session can read and export everything, and change nothing. Action buttons are not rendered.">
            <Badge tone="info" className="hidden items-center gap-1 sm:inline-flex">
              <Eye className="h-3 w-3" />
              View only
            </Badge>
          </Tooltip>
        ) : null}

        <Popover>
          <PopoverTrigger asChild>
            <button
              aria-label={`Notifications${unread.length ? `, ${unread.length} unread` : ''}`}
              className="relative rounded-md p-1.5 text-ink-500 transition-colors hover:bg-paper-200 hover:text-ink-800"
            >
              <Bell className="h-4 w-4" />
              {unread.length ? (
                <span className="absolute right-1 top-1 flex h-2 w-2">
                  <span className="absolute inline-flex h-full w-full animate-pulse-ring rounded-full bg-accent-400" />
                  <span className="relative inline-flex h-2 w-2 rounded-full bg-accent-500" />
                </span>
              ) : null}
            </button>
          </PopoverTrigger>
          <PopoverContent width="w-80">
            <div className="flex items-center justify-between border-b border-paper-200 px-3 py-2">
              <p className="text-sm font-semibold text-ink-900">Notifications</p>
              {unread.length ? (
                <button
                  onClick={() => void markNotificationsRead(unread.map((n) => n.id))}
                  className="text-2xs text-accent-700 hover:underline"
                >
                  Mark all read
                </button>
              ) : null}
            </div>
            <ul className="scroll-slim max-h-80 divide-y divide-paper-200 overflow-y-auto">
              {mine.length === 0 ? (
                <li className="px-3 py-6 text-center text-xs text-ink-400">Nothing waiting for you.</li>
              ) : (
                mine.map((n) => (
                  <li key={n.id} className={cn('px-3 py-2', !n.isRead && 'bg-accent-50/40')}>
                    <p className="text-xs font-medium text-ink-800">{n.title}</p>
                    {n.body ? <p className="mt-0.5 text-2xs leading-relaxed text-ink-500">{n.body}</p> : null}
                    <p className="mt-1 text-2xs text-ink-400">{fmtAgo(n.createdAt)}</p>
                  </li>
                ))
              )}
            </ul>
          </PopoverContent>
        </Popover>

        <Menu>
          <MenuTrigger asChild>
            <button className="flex items-center gap-2 rounded-md py-1 pl-1 pr-1.5 transition-colors hover:bg-paper-200">
              <Avatar name={user?.fullName ?? 'Guest'} />
              <span className="hidden min-w-0 text-left leading-tight sm:block">
                <span className="block truncate text-xs font-medium text-ink-900">{user?.fullName}</span>
                <span className="block truncate text-[10px] text-ink-400">
                  {role === 'FULL_ACCESS' ? 'Full access' : 'View only'}
                </span>
              </span>
            </button>
          </MenuTrigger>
          <MenuContent className="w-72">
            <MenuLabel>Signed in</MenuLabel>
            <div className="px-2 pb-2">
              <p className="text-sm font-medium text-ink-900">{user?.fullName}</p>
              <p className="text-2xs text-ink-500">{user?.email}</p>
              <p className="mt-0.5 text-2xs text-ink-400">{user?.department}</p>
            </div>
            <MenuSeparator />

            <MenuLabel>Demonstration controls</MenuLabel>
            <div className="space-y-2.5 px-2 py-2">
              <div>
                <p className="mb-1 text-2xs text-ink-500">Role in force</p>
                <SegmentedControl
                  size="sm"
                  value={role}
                  onChange={(v) => setRole(v)}
                  options={[
                    { value: 'FULL_ACCESS', label: 'Full access' },
                    { value: 'VIEWER', label: 'View only' },
                  ]}
                />
              </div>
              <div>
                <p className="mb-1 text-2xs text-ink-500">Simulated latency</p>
                <SegmentedControl
                  size="sm"
                  value={presenter.latency}
                  onChange={(v) => setPresenter({ latency: v })}
                  options={[
                    { value: 'off', label: 'Off' },
                    { value: 'realistic', label: 'Realistic' },
                    { value: 'slow', label: 'Slow' },
                  ]}
                />
              </div>
              <Switch
                checked={presenter.showRuleHints}
                onChange={(v) => setPresenter({ showRuleHints: v })}
                label="Show rule notes"
                description="Explain the rules the prototype enforces."
              />
            </div>
            <MenuSeparator />
            <MenuItem icon={<RefreshCw className="h-3.5 w-3.5" />} onSelect={() => resetDemoData()}>
              Reset demonstration data
            </MenuItem>
            <MenuItem icon={<LogOut className="h-3.5 w-3.5" />} onSelect={() => signOut()}>
              Sign out
            </MenuItem>
          </MenuContent>
        </Menu>
      </div>
    </header>
  )
}

/** Bottom bar on phones: the five sections that matter on a small screen. */
function MobileNav() {
  const items = [
    { to: '/', label: 'Home', icon: Gauge, end: true },
    { to: '/products', label: 'Products', icon: Pill },
    { to: '/clients', label: 'Clients', icon: Users },
    { to: '/engagements', label: 'Pipeline', icon: GitBranch },
    { to: '/indents', label: 'Indents', icon: Rocket },
  ]
  return (
    <nav className="fixed inset-x-0 bottom-0 z-30 border-t border-ink-800 bg-ink-900 pb-[env(safe-area-inset-bottom)] md:hidden">
      <ul className="flex">
        {items.map((item) => {
          const Icon = item.icon
          return (
            <li key={item.to} className="flex-1">
              <NavLink
                to={item.to}
                end={item.end}
                className={({ isActive }) =>
                  cn(
                    'flex flex-col items-center gap-0.5 py-2 text-[10px] transition-colors',
                    isActive ? 'text-accent-300' : 'text-ink-500',
                  )
                }
              >
                <Icon className="h-4 w-4" />
                {item.label}
              </NavLink>
            </li>
          )
        })}
      </ul>
    </nav>
  )
}

/** Shown while a route's data loads for the first time. */
export function RouteSpinner() {
  return (
    <div className="flex items-center gap-2 py-16 text-sm text-ink-400">
      <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-paper-400 border-t-accent-500" />
      Loading…
    </div>
  )
}

