/**
 * Components that know about the domain: stages, portfolio state, tiles.
 *
 * The stage rail is the signature element — an engagement's whole life as one
 * compact track, with the history underneath it.
 */

import * as React from 'react'
import { motion, useInView, useMotionValue, useSpring } from 'framer-motion'
import { Link } from 'react-router-dom'
import { AlertCircle, ArrowRight, Check, CircleDot, Pause, X } from 'lucide-react'
import { cn, fmtDate, fmtNumber } from '@/lib/utils'
import {
  CLIENT_STATUS_LABEL,
  MANUFACTURER_STATUS_LABEL,
  PIPELINE_STAGES,
  STAGE_LABEL,
  STAGE_STYLE,
  reasonName,
} from '@/data/reference'
import type {
  ClientStatus,
  EngagementStage,
  ManufacturerStatus,
  StageHistoryEntry,
} from '@/data/types'
import { Badge } from './primitives'
import { Tooltip } from './overlays'

// ------------------------------------------------------------ stage chip

export function StageBadge({
  stage,
  size = 'md',
  showDot = true,
}: {
  stage: EngagementStage
  size?: 'sm' | 'md'
  showDot?: boolean
}) {
  const style = STAGE_STYLE[stage]
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 whitespace-nowrap rounded border font-medium',
        style.chip,
        size === 'sm' ? 'px-1.5 py-px text-[10px]' : 'px-2 py-0.5 text-2xs',
      )}
    >
      {showDot ? <span className={cn('h-1.5 w-1.5 shrink-0 rounded-full', style.dot)} /> : null}
      {STAGE_LABEL[stage]}
    </span>
  )
}

export function ClientStatusBadge({ status }: { status: ClientStatus }) {
  const tone = status === 'ACTIVE' ? 'ok' : status === 'PROSPECT' ? 'info' : status === 'DORMANT' ? 'warn' : 'danger'
  return <Badge tone={tone}>{CLIENT_STATUS_LABEL[status]}</Badge>
}

export function ManufacturerStatusBadge({ status }: { status: ManufacturerStatus }) {
  const tone =
    status === 'EXISTING_COMMERCIAL'
      ? 'ok'
      : status === 'UNDER_DEVELOPMENT'
        ? 'info'
        : status === 'NEW'
          ? 'neutral'
          : status === 'INACTIVE'
            ? 'warn'
            : 'danger'
  return <Badge tone={tone}>{MANUFACTURER_STATUS_LABEL[status]}</Badge>
}

/** Portfolio state: what TCL represents versus what merely exists. */
export function PortfolioBadge({ inPortfolio, offerable }: { inPortfolio: boolean; offerable?: boolean }) {
  if (!inPortfolio) {
    return (
      <Tooltip content="A known source that TCL does not represent. Market intelligence only — it cannot be offered to a client.">
        <Badge tone="outline">Not represented</Badge>
      </Tooltip>
    )
  }
  if (offerable === false) {
    return (
      <Tooltip content="In TCL's portfolio, but with no currently valid price, so no offer can be made yet.">
        <Badge tone="warn">Price pending</Badge>
      </Tooltip>
    )
  }
  return (
    <Tooltip content="In TCL's portfolio with a valid price: offerable to clients.">
      <Badge tone="accent">In portfolio</Badge>
    </Tooltip>
  )
}

// ------------------------------------------------------------ stage rail

const RAIL_ICON: Partial<Record<EngagementStage, React.ReactNode>> = {
  ON_HOLD: <Pause className="h-3 w-3" />,
  REJECTED: <X className="h-3 w-3" />,
  DISCONTINUED: <X className="h-3 w-3" />,
}

/**
 * The lifecycle as a segmented track. Reached stages are filled, the current
 * one is ringed, and an exit (hold, rejected, discontinued) is shown as a
 * terminal marker rather than pretending the path continued.
 */
export function StageRail({
  stage,
  history,
  stageBeforeHold,
  compact,
}: {
  stage: EngagementStage
  history?: StageHistoryEntry[]
  stageBeforeHold?: EngagementStage | null
  compact?: boolean
}) {
  const reachedSet = React.useMemo(
    () => new Set<EngagementStage>((history ?? []).map((h) => h.toStage)),
    [history],
  )
  const isExit = stage === 'ON_HOLD' || stage === 'REJECTED' || stage === 'DISCONTINUED'
  // Where the track is parked while on hold.
  const anchor = isExit ? (stageBeforeHold ?? furthestPipeline(reachedSet)) : stage
  const anchorIndex = anchor ? PIPELINE_STAGES.indexOf(anchor) : -1

  return (
    <div className="space-y-2">
      <div className="flex items-stretch gap-1">
        {PIPELINE_STAGES.map((s: EngagementStage, i: number) => {
          const reached = reachedSet.size ? reachedSet.has(s) : i <= anchorIndex
          const isCurrent = !isExit && s === stage
          const style = STAGE_STYLE[s]
          return (
            <div key={s} className="group relative min-w-0 flex-1">
              <Tooltip content={STAGE_LABEL[s]}>
                <div className="flex flex-col gap-1.5">
                  <motion.div
                    className={cn(
                      'h-1.5 rounded-full',
                      reached ? style.bar : 'bg-paper-300',
                      isCurrent && 'ring-2 ring-offset-1 ring-offset-white',
                    )}
                    style={isCurrent ? { boxShadow: '0 0 0 2px rgb(255 255 255), 0 0 0 3.5px currentColor' } : undefined}
                    initial={{ scaleX: 0, originX: 0 }}
                    animate={{ scaleX: 1 }}
                    transition={{ duration: 0.4, delay: i * 0.05, ease: [0.22, 1, 0.36, 1] }}
                  />
                  {!compact ? (
                    <span
                      className={cn(
                        'block truncate text-[10px] leading-tight',
                        isCurrent ? 'font-semibold text-ink-900' : reached ? 'text-ink-600' : 'text-ink-400',
                      )}
                    >
                      {STAGE_LABEL[s]}
                    </span>
                  ) : null}
                </div>
              </Tooltip>
            </div>
          )
        })}
      </div>
      {isExit ? (
        <div className="flex items-center gap-1.5">
          <span
            className={cn(
              'inline-flex items-center gap-1 rounded border px-1.5 py-0.5 text-2xs font-medium',
              STAGE_STYLE[stage].chip,
            )}
          >
            {RAIL_ICON[stage]}
            {STAGE_LABEL[stage]}
          </span>
          {stage === 'ON_HOLD' && stageBeforeHold ? (
            <span className="text-2xs text-ink-500">
              paused at {STAGE_LABEL[stageBeforeHold]} — it can only resume there
            </span>
          ) : null}
        </div>
      ) : null}
    </div>
  )
}

function furthestPipeline(reached: Set<EngagementStage>): EngagementStage | null {
  let best: EngagementStage | null = null
  for (const s of PIPELINE_STAGES) if (reached.has(s)) best = s
  return best
}

/** Vertical history list for an engagement. */
export function StageTimeline({
  history,
  userName,
}: {
  history: StageHistoryEntry[]
  userName: (id: string | null) => string
}) {
  const ordered = [...history].sort((a, b) => (a.changedAt < b.changedAt ? 1 : -1))
  return (
    <ol className="relative space-y-3 pl-5">
      <span className="absolute left-[7px] top-1.5 bottom-1.5 w-px bg-paper-300" aria-hidden />
      {ordered.map((h, i) => (
        <motion.li
          key={h.id}
          className="relative"
          initial={{ opacity: 0, x: -4 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ duration: 0.22, delay: Math.min(i * 0.03, 0.2) }}
        >
          <span
            className={cn(
              'absolute -left-5 top-1 grid h-3.5 w-3.5 place-items-center rounded-full border-2 border-white',
              STAGE_STYLE[h.toStage].dot,
            )}
            aria-hidden
          />
          <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
            <span className="text-sm font-medium text-ink-900">
              {h.fromStage ? (
                <span className="inline-flex items-center gap-1.5">
                  <span className="text-ink-500">{STAGE_LABEL[h.fromStage]}</span>
                  <ArrowRight className="h-3 w-3 text-ink-400" />
                  {STAGE_LABEL[h.toStage]}
                </span>
              ) : (
                STAGE_LABEL[h.toStage]
              )}
            </span>
            {h.isOverride ? <Badge tone="warn">Override</Badge> : null}
            <span className="text-xs text-ink-400">
              {fmtDate(h.changedAt)} · {userName(h.changedByUserId)}
              {h.daysInPreviousStage != null ? ` · ${h.daysInPreviousStage}d in previous stage` : ''}
            </span>
          </div>
          {h.reasonCode ? (
            <p className="mt-0.5 text-xs text-ink-600">
              <span className="font-medium">Reason:</span> {reasonName(h.reasonCode)}
            </p>
          ) : null}
          {h.remark ? <p className="mt-0.5 text-xs italic leading-relaxed text-ink-500">“{h.remark}”</p> : null}
        </motion.li>
      ))}
    </ol>
  )
}

// ------------------------------------------------------------ KPI tiles

/** Counts up when the tile scrolls into view. */
export function AnimatedNumber({
  value,
  format = fmtNumber,
  className,
}: {
  value: number
  format?: (n: number) => string
  className?: string
}) {
  const ref = React.useRef<HTMLSpanElement>(null)
  const inView = useInView(ref, { once: true, margin: '-40px' })
  const motionValue = useMotionValue(0)
  const spring = useSpring(motionValue, { duration: 900, bounce: 0 })
  const [display, setDisplay] = React.useState(0)

  React.useEffect(() => {
    if (inView) motionValue.set(value)
  }, [inView, value, motionValue])

  React.useEffect(() => spring.on('change', (v) => setDisplay(v)), [spring])

  return (
    <span ref={ref} className={cn('tabular', className)}>
      {format(Math.round(display))}
    </span>
  )
}

/**
 * A near-square tile. Deliberately not a wide band: tiles are laid out in a
 * bento grid so the dashboard reads as a composition, not a stack of bars.
 */
export function KpiTile({
  label,
  value,
  unit,
  hint,
  tone = 'default',
  icon,
  to,
  footer,
  children,
  span,
  className,
}: {
  label: string
  value?: React.ReactNode
  unit?: string
  hint?: React.ReactNode
  tone?: 'default' | 'accent' | 'warn' | 'danger' | 'ok' | 'ink'
  icon?: React.ReactNode
  to?: string
  footer?: React.ReactNode
  children?: React.ReactNode
  span?: 'wide' | 'tall' | 'big'
  className?: string
}) {
  const tones: Record<string, string> = {
    default: 'bg-white border-paper-300',
    accent: 'bg-accent-50/60 border-accent-200',
    warn: 'bg-warn-50/70 border-warn-200',
    danger: 'bg-danger-50/70 border-danger-200',
    ok: 'bg-ok-50/70 border-ok-200',
    ink: 'bg-ink-900 border-ink-800 text-paper-100',
  }
  const valueTone: Record<string, string> = {
    default: 'text-ink-900',
    accent: 'text-accent-800',
    warn: 'text-warn-600',
    danger: 'text-danger-700',
    ok: 'text-ok-600',
    ink: 'text-white',
  }

  const body = (
    <motion.div
      whileHover={to ? { y: -2 } : undefined}
      transition={{ duration: 0.18 }}
      className={cn(
        'group flex h-full flex-col justify-between gap-2 rounded-lg border p-3.5 shadow-tile transition-shadow',
        to && 'hover:shadow-raised',
        tones[tone],
        span === 'wide' && 'sm:col-span-2',
        span === 'tall' && 'sm:row-span-2',
        span === 'big' && 'sm:col-span-2 sm:row-span-2',
        className,
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <p
          className={cn(
            'text-2xs font-semibold uppercase tracking-wider',
            tone === 'ink' ? 'text-paper-300' : 'text-ink-500',
          )}
        >
          {label}
        </p>
        {icon ? (
          <span className={cn('shrink-0', tone === 'ink' ? 'text-accent-300' : 'text-ink-300')}>{icon}</span>
        ) : null}
      </div>

      {value !== undefined ? (
        <div className="flex items-baseline gap-1.5">
          <span className={cn('text-3xl font-semibold leading-none tracking-tight', valueTone[tone])}>{value}</span>
          {unit ? (
            <span className={cn('text-xs font-medium', tone === 'ink' ? 'text-paper-300' : 'text-ink-400')}>{unit}</span>
          ) : null}
        </div>
      ) : null}

      {children}

      {hint || footer ? (
        <div
          className={cn(
            'text-xs leading-relaxed',
            tone === 'ink' ? 'text-paper-300' : 'text-ink-500',
          )}
        >
          {hint}
          {footer}
        </div>
      ) : null}
    </motion.div>
  )

  return to ? (
    <Link to={to} className="block h-full focus-visible:rounded-lg">
      {body}
    </Link>
  ) : (
    body
  )
}

/** Bento grid for tiles: rows of square-ish cells, never one wide strip. */
export function TileGrid({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <div
      className={cn(
        'grid auto-rows-[minmax(8.5rem,auto)] grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4',
        className,
      )}
    >
      {children}
    </div>
  )
}

// ----------------------------------------------------------- sparklines

export function Sparkline({
  values,
  className,
  tone = 'stroke-accent-500',
  fill = 'fill-accent-500/10',
}: {
  values: number[]
  className?: string
  tone?: string
  fill?: string
}) {
  if (values.length < 2) return null
  const w = 100
  const h = 28
  const max = Math.max(...values)
  const min = Math.min(...values)
  const range = max - min || 1
  const points = values.map((v, i) => {
    const x = (i / (values.length - 1)) * w
    const y = h - ((v - min) / range) * (h - 4) - 2
    return [x, y] as const
  })
  const line = points.map(([x, y], i) => `${i === 0 ? 'M' : 'L'}${x.toFixed(1)},${y.toFixed(1)}`).join(' ')
  const area = `${line} L${w},${h} L0,${h} Z`
  return (
    <svg viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none" className={cn('h-7 w-full', className)} aria-hidden>
      <path d={area} className={fill} stroke="none" />
      <motion.path
        d={line}
        className={cn('fill-none', tone)}
        strokeWidth={1.75}
        strokeLinecap="round"
        strokeLinejoin="round"
        initial={{ pathLength: 0 }}
        animate={{ pathLength: 1 }}
        transition={{ duration: 0.9, ease: 'easeOut' }}
      />
      <circle
        cx={points.at(-1)![0]}
        cy={points.at(-1)![1]}
        r={2}
        className={cn(tone.replace('stroke', 'fill'))}
      />
    </svg>
  )
}

/** Horizontal bars for a small distribution, used inside a tile. */
export function MiniBars({
  items,
  max,
}: {
  items: { label: string; value: number; tone: string; to?: string }[]
  max?: number
}) {
  const peak = max ?? Math.max(1, ...items.map((i) => i.value))
  return (
    <ul className="space-y-1.5">
      {items.map((item, i) => {
        const row = (
          <>
            <span className="w-[6.75rem] shrink-0 truncate text-2xs text-ink-600">{item.label}</span>
            <span className="h-2 flex-1 overflow-hidden rounded-full bg-paper-200">
              <motion.span
                className={cn('block h-full rounded-full', item.tone)}
                initial={{ width: 0 }}
                animate={{ width: `${(item.value / peak) * 100}%` }}
                transition={{ duration: 0.6, delay: i * 0.04, ease: [0.22, 1, 0.36, 1] }}
              />
            </span>
            <span className="w-7 shrink-0 text-right text-2xs font-semibold tabular text-ink-700">{item.value}</span>
          </>
        )
        return (
          <li key={item.label}>
            {item.to ? (
              <Link to={item.to} className="flex items-center gap-2 rounded transition-colors hover:bg-paper-100">
                {row}
              </Link>
            ) : (
              <span className="flex items-center gap-2">{row}</span>
            )}
          </li>
        )
      })}
    </ul>
  )
}

// ---------------------------------------------------------------- misc

export function AgeingFlag({ days, threshold }: { days: number; threshold: number }) {
  if (threshold <= 0 || days <= threshold) {
    return <span className="text-xs tabular text-ink-500">{days}d</span>
  }
  return (
    <Tooltip content={`Beyond the ${threshold}-day threshold for this stage.`}>
      <span className="inline-flex items-center gap-1 text-xs font-medium tabular text-warn-600">
        <AlertCircle className="h-3 w-3" />
        {days}d
      </span>
    </Tooltip>
  )
}

/** A yes/no regulatory marker, compact enough for a table cell. */
export function FilingDot({ present, label }: { present: boolean; label: string }) {
  return (
    <Tooltip content={present ? `${label} on file` : `No ${label}`}>
      <span
        className={cn(
          'inline-flex items-center gap-1 rounded border px-1.5 py-px text-[10px] font-semibold',
          present ? 'border-ok-200 bg-ok-50 text-ok-600' : 'border-paper-300 bg-paper-100 text-ink-400',
        )}
      >
        {present ? <Check className="h-2.5 w-2.5" /> : <CircleDot className="h-2.5 w-2.5" />}
        {label}
      </span>
    </Tooltip>
  )
}
