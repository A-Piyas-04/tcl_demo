/**
 * ⌘K palette: jump to any record by name (synonym-aware) or start an action.
 */

import * as React from 'react'
import { useNavigate } from 'react-router-dom'
import { Command } from 'cmdk'
import { AnimatePresence, motion } from 'framer-motion'
import {
  ArrowRight,
  Boxes,
  FactoryIcon,
  FileText,
  Gauge,
  GitBranch,
  Network,
  PanelsTopLeft,
  Pill,
  Plus,
  Rocket,
  Settings,
  Ship,
  Users,
  Wallet,
} from 'lucide-react'
import { useCanWrite, useDb } from '@/data/store'
import { search } from '@/data/selectors'
import { Kbd } from '@/components/ui'
import { cn } from '@/lib/utils'

const KIND_ICON = {
  product: Pill,
  client: Users,
  manufacturer: FactoryIcon,
  contact: Users,
  order: Boxes,
  indent: Rocket,
  batch: Ship,
} as const

const GO_TO = [
  { label: 'Dashboard', to: '/', icon: Gauge, keys: 'g d' },
  { label: 'Products', to: '/products', icon: Pill, keys: 'g p' },
  { label: 'Manufacturers', to: '/manufacturers', icon: FactoryIcon, keys: 'g m' },
  { label: 'Clients', to: '/clients', icon: Users, keys: 'g c' },
  { label: 'Requirements', to: '/requirements', icon: PanelsTopLeft, keys: 'g r' },
  { label: 'Engagement board', to: '/engagements', icon: GitBranch, keys: 'g e' },
  { label: 'Client orders', to: '/client-orders', icon: Boxes, keys: 'g o' },
  { label: 'Indents', to: '/indents', icon: Rocket, keys: 'g i' },
  { label: 'Shipments', to: '/shipments', icon: Ship, keys: 'g s' },
  { label: 'Commission', to: '/commissions', icon: Wallet, keys: 'g k' },
  { label: 'Relationships', to: '/relationships', icon: Network },
  { label: 'Documents', to: '/documents', icon: FileText },
  { label: 'Admin', to: '/admin', icon: Settings },
]

const ACTIONS = [
  { label: 'New requirement', to: '/requirements/new' },
  { label: 'New product', to: '/products/new' },
  { label: 'New manufacturer', to: '/manufacturers/new' },
  { label: 'New client', to: '/clients/new' },
  { label: 'New client order', to: '/client-orders/new' },
]

export function CommandPalette({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  const [query, setQuery] = React.useState('')
  const navigate = useNavigate()
  const db = useDb()
  const canWrite = useCanWrite()

  const hits = React.useMemo(() => (query.trim().length >= 2 ? search(db, query, 18) : []), [db, query])

  const go = (to: string) => {
    onOpenChange(false)
    setQuery('')
    navigate(to)
  }

  React.useEffect(() => {
    if (!open) setQuery('')
  }, [open])

  return (
    <AnimatePresence>
      {open ? (
        <>
          <motion.div
            className="fixed inset-0 z-50 bg-ink-950/35"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.14 }}
            onClick={() => onOpenChange(false)}
          />
          <motion.div
            className="fixed left-1/2 top-[12vh] z-50 w-[calc(100vw-2rem)] max-w-xl -translate-x-1/2"
            initial={{ opacity: 0, y: -8, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -6, scale: 0.98 }}
            transition={{ duration: 0.18, ease: [0.22, 1, 0.36, 1] }}
          >
            <Command
              loop
              className="overflow-hidden rounded-xl border border-paper-300 bg-white shadow-pop"
              onKeyDown={(e) => {
                if (e.key === 'Escape') onOpenChange(false)
              }}
            >
              <div className="flex items-center gap-2 border-b border-paper-200 px-3">
                <Command.Input
                  autoFocus
                  value={query}
                  onValueChange={setQuery}
                  placeholder="Search products, clients, manufacturers, orders…"
                  className="h-11 flex-1 bg-transparent text-sm text-ink-900 outline-none placeholder:text-ink-400"
                />
                <Kbd>esc</Kbd>
              </div>

              <Command.List className="scroll-slim max-h-[52vh] overflow-y-auto p-1.5">
                <Command.Empty className="px-3 py-8 text-center text-xs text-ink-400">
                  {query.trim().length >= 2 ? (
                    <>
                      Nothing matches “{query}”.
                      {canWrite ? (
                        <button onClick={() => go('/products/new')} className="mt-2 block w-full text-accent-700 hover:underline">
                          Create a product instead
                        </button>
                      ) : null}
                    </>
                  ) : (
                    'Type at least two characters.'
                  )}
                </Command.Empty>

                {hits.length > 0 ? (
                  <Command.Group heading={<GroupHeading>Records</GroupHeading>}>
                    {hits.map((hit) => {
                      const Icon = KIND_ICON[hit.kind]
                      return (
                        <Item key={`${hit.kind}-${hit.id}`} value={`${hit.label} ${hit.sublabel}`} onSelect={() => go(hit.href)}>
                          <Icon className="h-3.5 w-3.5 shrink-0 text-ink-400" />
                          <span className="min-w-0 flex-1">
                            <span className="block truncate text-sm text-ink-900">{hit.label}</span>
                            <span className="block truncate text-2xs text-ink-400">
                              {hit.sublabel}
                              {hit.matchedOn ? ` · matched on ${hit.matchedOn}` : ''}
                            </span>
                          </span>
                          <ArrowRight className="h-3 w-3 shrink-0 text-ink-300" />
                        </Item>
                      )
                    })}
                  </Command.Group>
                ) : null}

                {canWrite ? (
                  <Command.Group heading={<GroupHeading>Create</GroupHeading>}>
                    {ACTIONS.map((a) => (
                      <Item key={a.to} value={`new ${a.label}`} onSelect={() => go(a.to)}>
                        <Plus className="h-3.5 w-3.5 shrink-0 text-accent-600" />
                        <span className="flex-1 text-sm text-ink-900">{a.label}</span>
                      </Item>
                    ))}
                  </Command.Group>
                ) : null}

                <Command.Group heading={<GroupHeading>Go to</GroupHeading>}>
                  {GO_TO.map((g) => {
                    const Icon = g.icon
                    return (
                      <Item key={g.to} value={`go ${g.label}`} onSelect={() => go(g.to)}>
                        <Icon className="h-3.5 w-3.5 shrink-0 text-ink-400" />
                        <span className="flex-1 text-sm text-ink-900">{g.label}</span>
                        {g.keys ? <span className="font-mono text-[10px] text-ink-300">{g.keys}</span> : null}
                      </Item>
                    )
                  })}
                </Command.Group>
              </Command.List>

              <div className="flex items-center justify-between border-t border-paper-200 bg-paper-50 px-3 py-1.5 text-2xs text-ink-400">
                <span className="flex items-center gap-1.5">
                  <Kbd>↑</Kbd>
                  <Kbd>↓</Kbd>
                  to move
                  <Kbd>↵</Kbd>
                  to open
                </span>
                <span>Search covers product synonyms and CAS numbers</span>
              </div>
            </Command>
          </motion.div>
        </>
      ) : null}
    </AnimatePresence>
  )
}

function GroupHeading({ children }: { children: React.ReactNode }) {
  return <span className="px-2 text-2xs font-semibold uppercase tracking-wider text-ink-400">{children}</span>
}

function Item({
  value,
  onSelect,
  children,
}: {
  value: string
  onSelect: () => void
  children: React.ReactNode
}) {
  return (
    <Command.Item
      value={value}
      onSelect={onSelect}
      className={cn(
        'flex cursor-pointer items-center gap-2.5 rounded px-2 py-1.5 outline-none',
        'data-[selected=true]:bg-paper-200',
      )}
    >
      {children}
    </Command.Item>
  )
}
