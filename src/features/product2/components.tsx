/**
 * Shared Product 2.0 UI: the workflow tracker, status badges, money input,
 * module tabs and small helpers. Built only from the application's UI kit so
 * the module looks like the rest of the product.
 */

import * as React from 'react'
import { motion } from 'framer-motion'
import { Check, FlaskConical, Ship, X } from 'lucide-react'
import { cn, fmtDate } from '@/lib/utils'
import { delay } from '@/data/api'
import { Badge, Input } from '@/components/ui'
import { SectionNav } from '@/layout/sections'
import type { ID, P2Data, SampleStatus, SourcingStatus } from './types'
import { SOURCING_STATUS_LABEL, type Step, type TradeBundle, currentTradeStage, tradeStatusLabel } from './workflow'

// ---------------------------------------------------------------- helpers

export const partyName = (data: P2Data, id: ID | null | undefined) =>
  (id && data.parties.find((p) => p.id === id)?.name) || '—'

export const apiName = (data: P2Data, id: ID) => data.apiProducts.find((a) => a.id === id)?.name ?? 'Unknown API'

export const todayIso = () => new Date().toISOString().slice(0, 10)

/** Skeleton on first paint, so the screen reads as loaded from a server. */
export function useFirstLoad(): boolean {
  const [loading, setLoading] = React.useState(true)
  React.useEffect(() => {
    let live = true
    void delay('read').then(() => live && setLoading(false))
    return () => {
      live = false
    }
  }, [])
  return loading
}

export const CURRENCIES = ['USD', 'EUR', 'GBP', 'CNY', 'INR', 'BDT']
export const UOMS = ['kg', 'g', 'L', 'MT']
export const INCOTERMS = ['FOB', 'CFR', 'CIF', 'CPT', 'CIP', 'EXW', 'FCA']
export const THERAPEUTIC_AREAS = [
  'Analgesic',
  'Anti-infective',
  'Antidiabetic',
  'Antihistamine',
  'Cardiovascular',
  'CNS',
  'Gastrointestinal',
  'Oncology',
  'Respiratory',
  'Vitamins & supplements',
  'Other',
]

// ------------------------------------------------------------- module tabs

/**
 * Product 2.0 is the Molecules register inside the Directory, so its tabs are
 * the Directory's tabs with the module's own views beneath them.
 */
export function P2Tabs({ counts }: { counts?: { orders?: number; commission?: number } }) {
  return (
    <SectionNav
      section="molecules"
      subTabs={[
        { to: '/product-2', label: 'API products' },
        { to: '/product-2/orders', label: 'Trade orders', count: counts?.orders },
        { to: '/product-2/commission', label: 'Commission', count: counts?.commission },
      ]}
    />
  )
}

// ---------------------------------------------------------------- badges

const SOURCING_TONE: Record<SourcingStatus, 'neutral' | 'info' | 'ok' | 'danger'> = {
  IDENTIFIED: 'neutral',
  SAMPLE_SUBMITTED: 'info',
  ACCEPTED: 'ok',
  REJECTED: 'danger',
}

export function SourcingStatusBadge({ status }: { status: SourcingStatus | null }) {
  if (!status) return <Badge tone="outline">No source yet</Badge>
  return <Badge tone={SOURCING_TONE[status]}>{SOURCING_STATUS_LABEL[status]}</Badge>
}

export function SampleStatusBadge({ status }: { status: SampleStatus }) {
  const map = {
    SUBMITTED: { tone: 'info', label: 'Awaiting decision' },
    ACCEPTED: { tone: 'ok', label: 'Accepted' },
    REJECTED: { tone: 'danger', label: 'Rejected' },
  } as const
  return <Badge tone={map[status].tone}>{map[status].label}</Badge>
}

export function TradeStatusBadge({ bundle }: { bundle: TradeBundle }) {
  const stage = currentTradeStage(bundle)
  const tone =
    stage === null ? 'ok' : stage === 'CLIENT_ORDER' ? 'warn' : stage === 'COMMISSION' ? 'accent' : 'info'
  return <Badge tone={tone}>{tradeStatusLabel(bundle)}</Badge>
}

/** Six-segment mini progress bar for list rows. */
export function TradeMiniBar({ bundle }: { bundle: TradeBundle }) {
  const current = currentTradeStage(bundle)
  const order = ['CLIENT_ORDER', 'PI_PLACED', 'LC_OPENED', 'SHIPMENT', 'DELIVERED', 'COMMISSION'] as const
  const idx = current === null ? order.length : order.indexOf(current)
  return (
    <span className="flex w-24 gap-0.5" aria-label={`${idx} of 6 stages complete`}>
      {order.map((k, i) => (
        <span key={k} className={cn('h-1.5 flex-1 rounded-full', i < idx ? 'bg-ok-500' : 'bg-paper-300')} />
      ))}
    </span>
  )
}

// --------------------------------------------------------- workflow track

const VARIANT = {
  sourcing: {
    icon: FlaskConical,
    label: 'Sourcing',
    edge: 'border-l-[3px] border-l-stage-sample',
    chip: 'bg-[#f3effb] text-[#5b3d9c] border-[#ddd2f3]',
  },
  trade: {
    icon: Ship,
    label: 'Trade',
    edge: 'border-l-[3px] border-l-stage-offered',
    chip: 'bg-[#eef4fb] text-[#1f4f79] border-[#cfe0f0]',
  },
} as const

/**
 * Stepper for both workflows. Green = complete, grey = pending (the current
 * step is ringed), red = rejected. The two variants carry their own label and
 * edge colour so Sourcing and Trade never read as the same track.
 */
export function WorkflowTrack({
  steps,
  variant,
  title,
  aside,
  className,
}: {
  steps: Step[]
  variant: keyof typeof VARIANT
  title?: React.ReactNode
  aside?: React.ReactNode
  className?: string
}) {
  const v = VARIANT[variant]
  const Icon = v.icon
  return (
    <div className={cn('rounded-md border border-paper-300 bg-white p-3.5 shadow-tile', v.edge, className)}>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <div className="flex min-w-0 items-center gap-2">
          <span className={cn('inline-flex items-center gap-1 rounded border px-1.5 py-0.5 text-2xs font-semibold uppercase tracking-wider', v.chip)}>
            <Icon className="h-3 w-3" />
            {v.label}
          </span>
          {title ? <span className="truncate text-sm font-medium text-ink-800">{title}</span> : null}
        </div>
        {aside}
      </div>
      <ol className="flex flex-col sm:flex-row">
        {steps.map((s, i) => {
          const next = steps[i + 1]
          const lineDone = s.state === 'done' && next && (next.state === 'done' || next.state === 'rejected')
          return (
            <li key={s.key} className="relative flex flex-1 items-start gap-3 pb-4 last:pb-0 sm:flex-col sm:items-center sm:gap-1.5 sm:pb-0 sm:text-center">
              {next ? (
                <>
                  <span
                    aria-hidden
                    className={cn(
                      'absolute hidden h-0.5 sm:block',
                      'left-[calc(50%+1rem)] right-[calc(-50%+1rem)] top-[0.9375rem]',
                      lineDone ? 'bg-ok-500' : 'bg-paper-300',
                    )}
                  />
                  <span
                    aria-hidden
                    className={cn('absolute bottom-0 left-[0.9375rem] top-8 w-0.5 sm:hidden', lineDone ? 'bg-ok-500' : 'bg-paper-300')}
                  />
                </>
              ) : null}
              <motion.span
                initial={{ scale: 0.6, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                transition={{ duration: 0.25, delay: i * 0.05 }}
                className={cn(
                  'relative z-[1] grid h-8 w-8 shrink-0 place-items-center rounded-full border-2 text-xs font-semibold',
                  s.state === 'done' && 'border-ok-500 bg-ok-500 text-white',
                  s.state === 'rejected' && 'border-danger-500 bg-danger-500 text-white',
                  s.state === 'current' && 'border-ink-300 bg-white text-ink-600 ring-4 ring-paper-200',
                  s.state === 'pending' && 'border-paper-300 bg-paper-100 text-ink-400',
                )}
              >
                {s.state === 'done' ? <Check className="h-4 w-4" /> : s.state === 'rejected' ? <X className="h-4 w-4" /> : i + 1}
              </motion.span>
              <span className="min-w-0 sm:px-1">
                <span
                  className={cn(
                    'block text-xs font-medium leading-tight',
                    s.state === 'done' && 'text-ok-600',
                    s.state === 'rejected' && 'text-danger-700',
                    s.state === 'current' && 'text-ink-900',
                    s.state === 'pending' && 'text-ink-400',
                  )}
                >
                  {s.label}
                </span>
                <span className="mt-0.5 block text-2xs text-ink-400">
                  {s.state === 'current' ? 'Next step' : s.date && s.state !== 'pending' ? fmtDate(s.date) : ' '}
                </span>
                {s.note ? (
                  <span className={cn('mt-0.5 block text-2xs leading-snug', s.state === 'rejected' ? 'text-danger-600' : 'text-ink-500')}>
                    {s.note}
                  </span>
                ) : null}
              </span>
            </li>
          )
        })}
      </ol>
    </div>
  )
}

// ------------------------------------------------------------ money input

/** Text input for decimal amounts: keeps exactly what was typed (no float coercion). */
export function DecimalInput({
  value,
  onChange,
  suffix,
  invalid,
  placeholder,
  id,
  disabled,
}: {
  value: string
  onChange: (v: string) => void
  suffix?: string
  invalid?: boolean
  placeholder?: string
  id?: string
  disabled?: boolean
}) {
  return (
    <div className="relative">
      <Input
        id={id}
        inputMode="decimal"
        mono
        value={value}
        disabled={disabled}
        placeholder={placeholder ?? '0.00'}
        invalid={invalid}
        onChange={(e) => onChange(e.target.value.replace(/[^\d.,]/g, ''))}
        className={suffix ? 'pr-12' : undefined}
      />
      {suffix ? (
        <span className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-xs font-medium text-ink-400">{suffix}</span>
      ) : null}
    </div>
  )
}

/** A labelled figure in a calculation breakdown. */
export function CalcRow({
  label,
  value,
  emphasis,
  muted,
  hint,
}: {
  label: React.ReactNode
  value: React.ReactNode
  emphasis?: boolean
  muted?: boolean
  hint?: React.ReactNode
}) {
  return (
    <div className={cn('flex items-baseline justify-between gap-3 py-1.5', emphasis && 'border-t border-paper-300 pt-2')}>
      <span className={cn('text-xs', emphasis ? 'font-semibold text-ink-900' : muted ? 'text-ink-400' : 'text-ink-600')}>
        {label}
        {hint ? <span className="ml-1 text-2xs text-ink-400">{hint}</span> : null}
      </span>
      <span className={cn('font-mono text-sm tabular', emphasis ? 'font-semibold text-ink-900' : muted ? 'text-ink-400' : 'text-ink-800')}>
        {value}
      </span>
    </div>
  )
}
