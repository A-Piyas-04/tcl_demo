/**
 * Shared pieces for the insight area: the relationship views (M9, UC-14), the
 * document library (M10, UC-15) and the reports (M11, UC-16).
 *
 * Nothing here is domain logic. It is the chart palette, the bounded panel a
 * chart sits in, the small metric cell the reports use instead of a wide stat
 * strip, and the month arithmetic the period reports share.
 */

import * as React from 'react'
import { Download } from 'lucide-react'
import { STAGE_LABEL, STAGE_STYLE } from '@/data/reference'
import type { EngagementStage } from '@/data/types'
import { cn } from '@/lib/utils'
import { Button, HelpTip, NoteTip, Panel, PanelHeader, StageBadge, splitBlurb } from '@/components/ui'

// ------------------------------------------------------------- chart palette

/**
 * Recharts and React Flow need real colour values, not Tailwind classes, so the
 * stage colour is read back out of `STAGE_STYLE` rather than written twice. The
 * reference file stays the single source of truth for stage colours.
 */
export function stageHex(stage: EngagementStage): string {
  return STAGE_STYLE[stage].bar.match(/#[0-9a-fA-F]{6}/)?.[0] ?? '#7c8694'
}

export const CHART_INK = '#0f222d'
export const CHART_ACCENT = '#0c786b'
export const CHART_ACCENT_SOFT = '#79b8ac'
export const CHART_MUTED = '#9aa6ae'
export const CHART_GRID = '#e6e1d8'

/** One axis style for every chart, with low tick counts and no heavy gridlines. */
export const AXIS_TICK = { fontSize: 11, fill: '#5a6a74' } as const

// --------------------------------------------------------------- containers

/** A chart in a bounded panel. Charts are paired side by side, never stretched. */
export function ChartPanel({
  title,
  subtitle,
  actions,
  icon,
  height = 'h-60',
  children,
}: {
  title: React.ReactNode
  subtitle?: React.ReactNode
  actions?: React.ReactNode
  icon?: React.ReactNode
  height?: string
  children: React.ReactNode
}) {
  return (
    <Panel>
      <PanelHeader title={title} subtitle={subtitle} actions={actions} icon={icon} />
      <div className="p-3">
        <div className={height}>{children}</div>
      </div>
    </Panel>
  )
}

type CellTone = 'default' | 'accent' | 'warn' | 'danger' | 'ok'

const CELL_SURFACE: Record<CellTone, string> = {
  default: 'bg-white',
  accent: 'bg-accent-50/60 border-accent-200',
  warn: 'bg-warn-50/70 border-warn-200',
  danger: 'bg-danger-50/70 border-danger-200',
  ok: 'bg-ok-50/70 border-ok-200',
}

const CELL_VALUE: Record<CellTone, string> = {
  default: 'text-ink-900',
  accent: 'text-accent-800',
  warn: 'text-warn-600',
  danger: 'text-danger-700',
  ok: 'text-ok-600',
}

/** A near-square figure cell. Used in a grid, so no figure becomes a wide band. */
export function StatCell({
  label,
  value,
  hint,
  tone = 'default',
  footer,
}: {
  label: string
  value: React.ReactNode
  hint?: React.ReactNode
  tone?: CellTone
  footer?: React.ReactNode
}) {
  const { caption: hintCaption, tip: hintTip } = splitBlurb(hint)
  return (
    <Panel className={cn('flex min-h-[8.5rem] flex-col justify-between gap-2 p-3.5', CELL_SURFACE[tone])}>
      <p className="inline-flex items-center gap-1 text-2xs font-semibold uppercase tracking-wider text-ink-500">
        {label}
        <HelpTip>{hintTip}</HelpTip>
      </p>
      <p className={cn('text-2xl font-semibold leading-none tracking-tight tabular', CELL_VALUE[tone])}>{value}</p>
      {hintCaption ? <p className="text-xs leading-relaxed text-ink-500">{hintCaption}</p> : null}
      {footer}
    </Panel>
  )
}

export function StatGrid({ children, className }: { children: React.ReactNode; className?: string }) {
  return <div className={cn('grid gap-3 sm:grid-cols-2 lg:grid-cols-4', className)}>{children}</div>
}

/** A short line of explanation, collapsed to a chip that reveals it on hover. */
export function ReportNote({ children, className }: { children: React.ReactNode; className?: string }) {
  return <NoteTip className={className}>{children}</NoteTip>
}

/** Exports are open to both roles and always written to the security log. */
export function ExportButton({
  onClick,
  label = 'Export to CSV',
  disabled,
}: {
  onClick: () => void
  label?: string
  disabled?: boolean
}) {
  return (
    <Button
      variant="secondary"
      size="sm"
      icon={<Download className="h-3.5 w-3.5" />}
      onClick={onClick}
      disabled={disabled}
    >
      {label}
    </Button>
  )
}

/** Stage colours, so a coloured edge or cell can be read without guessing. */
export function StageLegend({ stages }: { stages: EngagementStage[] }) {
  return (
    <ul className="flex flex-wrap items-center gap-1.5">
      {stages.map((s) => (
        <li key={s}>
          <StageBadge stage={s} size="sm" />
        </li>
      ))}
    </ul>
  )
}

// ------------------------------------------------------------- chart tooltip

interface TooltipPayload {
  name?: string | number
  value?: number | string
  color?: string
  dataKey?: string | number
  payload?: Record<string, unknown>
}

/** A readable tooltip: solid surface, hairline border, one row per series. */
export function ChartTooltip({
  active,
  payload,
  label,
  format,
  labelFormat,
}: {
  active?: boolean
  payload?: TooltipPayload[]
  label?: string | number
  format?: (value: number) => string
  labelFormat?: (label: string) => string
}) {
  if (!active || !payload || payload.length === 0) return null
  const heading = label == null ? '' : labelFormat ? labelFormat(String(label)) : String(label)
  return (
    <div className="rounded-md border border-paper-300 bg-white px-2.5 py-2 shadow-pop">
      {heading ? <p className="mb-1 text-2xs font-semibold uppercase tracking-wide text-ink-500">{heading}</p> : null}
      <ul className="space-y-0.5">
        {payload.map((p, i) => (
          <li key={i} className="flex items-baseline gap-2 text-xs">
            <span className="h-2 w-2 shrink-0 rounded-sm" style={{ backgroundColor: p.color ?? CHART_MUTED }} />
            <span className="text-ink-600">{String(p.name ?? '')}</span>
            <span className="ml-auto font-semibold tabular text-ink-900">
              {typeof p.value === 'number' ? (format ? format(p.value) : p.value.toLocaleString('en-US')) : String(p.value ?? '')}
            </span>
          </li>
        ))}
      </ul>
    </div>
  )
}

// -------------------------------------------------------------- month maths

/** First day of the month a date falls in. */
export function monthStart(iso: string): string {
  return `${iso.slice(0, 7)}-01`
}

/** Last day of the month a date falls in. */
export function monthEnd(iso: string): string {
  const [y, m] = iso.slice(0, 7).split('-').map(Number)
  const last = new Date(Date.UTC(y!, m!, 0)).getUTCDate()
  return `${iso.slice(0, 7)}-${String(last).padStart(2, '0')}`
}

export function shiftMonth(yyyyMm: string, months: number): string {
  const [y, m] = yyyyMm.split('-').map(Number)
  const d = new Date(Date.UTC(y!, m! - 1 + months, 1))
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`
}

/** The last `count` months, oldest first, as YYYY-MM keys. */
export function recentMonths(count: number, endMonth = new Date().toISOString().slice(0, 7)): string[] {
  return Array.from({ length: count }, (_, i) => shiftMonth(endMonth, i - (count - 1)))
}

/** Short month label for an axis: Jan 26. */
export function monthTick(yyyyMm: string): string {
  const [y, m] = yyyyMm.split('-')
  const names = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
  return `${names[Number(m) - 1] ?? m} ${y?.slice(2) ?? ''}`
}

// ------------------------------------------------------------------ grouping

/** Groups rows by a key and returns the groups sorted by size, largest first. */
export function groupRows<T>(rows: T[], key: (row: T) => string): { key: string; rows: T[] }[] {
  const map = new Map<string, T[]>()
  for (const row of rows) {
    const k = key(row)
    const list = map.get(k)
    if (list) list.push(row)
    else map.set(k, [row])
  }
  return [...map.entries()]
    .map(([k, list]) => ({ key: k, rows: list }))
    .sort((a, b) => b.rows.length - a.rows.length || a.key.localeCompare(b.key))
}

export const stageName = (stage: EngagementStage | null) => (stage ? STAGE_LABEL[stage] : 'Not started')
