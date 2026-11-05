/**
 * Sign-in, then a short branded splash while the workspace prepares.
 *
 * No authentication happens: picking a person signs in as them. The screen
 * exists because the demonstration starts here, and because switching between
 * a Full Access person and a View Only one is part of the story.
 */

import * as React from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { ArrowRight, Eye, Lock, ShieldCheck } from 'lucide-react'
import { useDb, useStore } from '@/data/store'
import { Avatar, Badge, Button } from '@/components/ui'
import { cn } from '@/lib/utils'

export function LoginScreen() {
  const db = useDb()
  const signIn = useStore((s) => s.signIn)
  const [selected, setSelected] = React.useState<string | null>(null)
  const [signingIn, setSigningIn] = React.useState(false)

  const people = db.users.filter((u) => u.isActive && u.activatedAt)
  const fullAccess = people.filter((u) => u.roleCode === 'FULL_ACCESS')
  const viewers = people.filter((u) => u.roleCode === 'VIEWER')

  const enter = (id: string) => {
    setSelected(id)
    setSigningIn(true)
    window.setTimeout(() => signIn(id), 900)
  }

  return (
    <div className="relative flex min-h-screen items-center justify-center overflow-hidden bg-ink-950 px-4 py-10">
      {/* quiet geometric backdrop: no glass, no blur */}
      <div className="pointer-events-none absolute inset-0 opacity-[0.07]">
        <svg className="h-full w-full" aria-hidden>
          <defs>
            <pattern id="grid" width="48" height="48" patternUnits="userSpaceOnUse">
              <path d="M48 0H0V48" fill="none" stroke="white" strokeWidth="1" />
            </pattern>
          </defs>
          <rect width="100%" height="100%" fill="url(#grid)" />
        </svg>
      </div>
      <motion.div
        aria-hidden
        className="pointer-events-none absolute -left-24 top-1/4 h-72 w-72 rounded-full border border-accent-500/20"
        animate={{ scale: [1, 1.08, 1] }}
        transition={{ duration: 9, repeat: Infinity, ease: 'easeInOut' }}
      />
      <motion.div
        aria-hidden
        className="pointer-events-none absolute -right-20 bottom-10 h-56 w-56 rounded-full border border-accent-500/15"
        animate={{ scale: [1.06, 1, 1.06] }}
        transition={{ duration: 11, repeat: Infinity, ease: 'easeInOut' }}
      />

      <div className="relative grid w-full max-w-4xl gap-6 lg:grid-cols-[1fr_1.1fr]">
        <motion.div
          initial={{ opacity: 0, x: -12 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
          className="flex flex-col justify-center gap-5 px-1 py-4"
        >
          <div className="flex items-center gap-3">
            <span className="grid h-10 w-10 place-items-center rounded-lg bg-accent-500 font-mono text-lg font-bold text-ink-950">
              T
            </span>
            <div>
              <p className="text-lg font-semibold text-paper-100">Techstream Ltd</p>
              <p className="text-xs text-ink-500">Sourcing platform</p>
            </div>
          </div>
          <h1 className="max-w-sm text-3xl font-semibold leading-tight tracking-tight text-paper-100">
            Who buys what, from whom, at what stage.
          </h1>
          <p className="max-w-sm text-sm leading-relaxed text-ink-400">
            The register of clients, manufacturers and molecules TCL connects — with the pipeline, the indents and the
            commission in one place.
          </p>
          <dl className="grid max-w-sm grid-cols-3 gap-3 border-t border-ink-800 pt-4">
            {[
              ['Clients', db.companies.filter((c) => c.kind === 'CLIENT').length],
              ['Sources', db.manufacturerProducts.length],
              ['Engagements', db.engagements.length],
            ].map(([label, value]) => (
              <div key={String(label)}>
                <dt className="text-2xs uppercase tracking-wider text-ink-600">{label}</dt>
                <dd className="mt-0.5 text-xl font-semibold tabular text-paper-100">{String(value)}</dd>
              </div>
            ))}
          </dl>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 14 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4, delay: 0.08, ease: [0.22, 1, 0.36, 1] }}
          className="overflow-hidden rounded-xl border border-paper-300 bg-paper-50 shadow-pop"
        >
          <div className="border-b border-paper-200 bg-white px-5 py-3.5">
            <h2 className="text-sm font-semibold text-ink-900">Sign in</h2>
            <p className="mt-0.5 text-xs text-ink-500">
              A demonstration: choose a colleague to sign in as. No password is checked.
            </p>
          </div>

          <div className="scroll-slim max-h-[22rem] overflow-y-auto px-3 py-3">
            <p className="px-1 pb-1.5 text-2xs font-semibold uppercase tracking-wider text-ink-400">Full access</p>
            <ul className="space-y-1">
              {fullAccess.map((u) => (
                <li key={u.id}>
                  <PersonButton
                    name={u.fullName}
                    detail={u.department ?? ''}
                    selected={selected === u.id}
                    onClick={() => enter(u.id)}
                  />
                </li>
              ))}
            </ul>
            <p className="px-1 pb-1.5 pt-3 text-2xs font-semibold uppercase tracking-wider text-ink-400">View only</p>
            <ul className="space-y-1">
              {viewers.map((u) => (
                <li key={u.id}>
                  <PersonButton
                    name={u.fullName}
                    detail={u.department ?? ''}
                    selected={selected === u.id}
                    viewer
                    onClick={() => enter(u.id)}
                  />
                </li>
              ))}
            </ul>
          </div>

          <div className="flex items-center justify-between gap-3 border-t border-paper-200 bg-white px-5 py-3">
            <p className="flex items-center gap-1.5 text-2xs text-ink-400">
              <Lock className="h-3 w-3" />
              Internal use only — no client or manufacturer logs in.
            </p>
            <Button
              variant="primary"
              size="sm"
              loading={signingIn}
              icon={!signingIn ? <ArrowRight className="h-3.5 w-3.5" /> : undefined}
              onClick={() => enter(fullAccess[0]!.id)}
            >
              Enter as {fullAccess[0]!.fullName.split(' ')[0]}
            </Button>
          </div>
        </motion.div>
      </div>
    </div>
  )
}

function PersonButton({
  name,
  detail,
  selected,
  viewer,
  onClick,
}: {
  name: string
  detail: string
  selected?: boolean
  viewer?: boolean
  onClick: () => void
}) {
  return (
    <button
      onClick={onClick}
      className={cn(
        'group flex w-full items-center gap-2.5 rounded-md border px-2.5 py-2 text-left transition-all duration-150',
        selected
          ? 'border-accent-500 bg-accent-50 shadow-[0_0_0_1px_theme(colors.accent.500)]'
          : 'border-transparent bg-white hover:border-paper-300 hover:bg-paper-100',
      )}
    >
      <Avatar name={name} />
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm font-medium text-ink-900">{name}</span>
        <span className="block truncate text-2xs text-ink-500">{detail}</span>
      </span>
      {viewer ? (
        <Badge tone="info" className="shrink-0">
          <Eye className="h-2.5 w-2.5" />
          Read
        </Badge>
      ) : (
        <ShieldCheck className="h-3.5 w-3.5 shrink-0 text-ink-300 group-hover:text-accent-600" />
      )}
    </button>
  )
}

/** Branded splash on first entry, so the workspace does not snap into place. */
export function SplashScreen({ onDone }: { onDone: () => void }) {
  React.useEffect(() => {
    const t = window.setTimeout(onDone, 1250)
    return () => window.clearTimeout(t)
  }, [onDone])

  const steps = ['Loading the register', 'Building the three-way map', 'Reading the pipeline']

  return (
    <AnimatePresence>
      <motion.div
        className="fixed inset-0 z-[60] grid place-items-center bg-ink-950"
        initial={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.3 }}
      >
        <div className="flex flex-col items-center gap-5">
          <motion.div
            className="relative grid h-14 w-14 place-items-center rounded-xl bg-accent-500 font-mono text-2xl font-bold text-ink-950"
            initial={{ scale: 0.85, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
          >
            T
            <motion.span
              className="absolute inset-0 rounded-xl border-2 border-accent-400"
              animate={{ scale: [1, 1.35], opacity: [0.7, 0] }}
              transition={{ duration: 1.6, repeat: Infinity, ease: 'easeOut' }}
            />
          </motion.div>
          <div className="h-0.5 w-44 overflow-hidden rounded-full bg-ink-800">
            <motion.div
              className="h-full bg-accent-500"
              initial={{ width: '0%' }}
              animate={{ width: '100%' }}
              transition={{ duration: 1.15, ease: 'easeInOut' }}
            />
          </div>
          <div className="h-4 text-center">
            {steps.map((s, i) => (
              <motion.p
                key={s}
                className="absolute left-0 right-0 text-xs text-ink-500"
                initial={{ opacity: 0 }}
                animate={{ opacity: [0, 1, 1, 0] }}
                transition={{ duration: 1.25, times: [0, 0.2, 0.75, 1], delay: i * 0.4 }}
              >
                {s}
              </motion.p>
            ))}
          </div>
        </div>
      </motion.div>
    </AnimatePresence>
  )
}
