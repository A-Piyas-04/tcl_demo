/**
 * Pieces shared by the orders and logistics screens.
 *
 * Nothing here is domain logic: the rules live in `@/data/rules` and the api.
 * These are the small presentational parts that would otherwise be copied
 * across the screens of UC-09 and UC-10: the fulfilment bar, quantity totals
 * and the letter-of-credit state. Status chips and the documents and activity
 * panels are shared with the rest of the application from
 * `@/components/ui/records`.
 */

import type * as React from 'react'
import { differenceInCalendarDays, parseISO } from 'date-fns'
import { convertQty } from '@/data/reference'
import { fmtDate } from '@/lib/utils'
import type { Indent } from '@/data/types'
import { Badge, Button, Meter, Panel, Tooltip } from '@/components/ui'

export {
  ActivityPanel,
  CommissionStatusBadge,
  DocumentsPanel,
  OrderStatusBadge,
  ShipmentStatusBadge,
} from '@/components/ui/records'

// ------------------------------------------------------- fulfilment bar

export interface FulfilmentNumbers {
  ordered: number
  indented: number
  shipped: number
  delivered: number
}

/**
 * Indented, shipped and delivered against ordered, as one thin segmented
 * track. Deliberately narrow: it sits in a table cell, not across the page.
 */
export function FulfilmentBar({
  ordered,
  indented,
  shipped,
  delivered,
  className,
}: FulfilmentNumbers & { className?: string }) {
  const pct = (n: number) => (ordered > 0 ? Math.min(100, Math.round((n / ordered) * 100)) : 0)
  return (
    <Tooltip
      content={
        <span className="block space-y-0.5">
          <span className="block">Indented {pct(indented)}%</span>
          <span className="block">Shipped {pct(shipped)}%</span>
          <span className="block">Delivered {pct(delivered)}%</span>
        </span>
      }
    >
      <div className={className}>
        <div className="space-y-[3px]">
          <Meter value={indented} max={ordered} tone="bg-accent-300" className="h-1" />
          <Meter value={shipped} max={ordered} tone="bg-accent-500" className="h-1" />
          <Meter value={delivered} max={ordered} tone="bg-ok-500" className="h-1" />
        </div>
        <div className="mt-1 text-[10px] tabular text-ink-500">{pct(delivered)}% delivered</div>
      </div>
    </Tooltip>
  )
}

export function FulfilmentLegend() {
  return (
    <span className="flex flex-wrap items-center gap-3 text-[10px] text-ink-500">
      <span className="flex items-center gap-1">
        <span className="h-1.5 w-3 rounded-full bg-accent-300" /> indented
      </span>
      <span className="flex items-center gap-1">
        <span className="h-1.5 w-3 rounded-full bg-accent-500" /> shipped
      </span>
      <span className="flex items-center gap-1">
        <span className="h-1.5 w-3 rounded-full bg-ok-500" /> delivered
      </span>
    </span>
  )
}

// -------------------------------------------------------- quantity totals

/**
 * Sums quantities that may be recorded in different units, reporting the unit
 * it settled on. Where a conversion does not exist the lines are counted in
 * their own unit and the result says so, rather than adding unlike things.
 */
export function sumQty(lines: { qty: number; uom: string }[]): { qty: number; uom: string; mixed: boolean } {
  if (lines.length === 0) return { qty: 0, uom: '', mixed: false }
  const target = lines[0]!.uom
  let total = 0
  let mixed = false
  for (const line of lines) {
    try {
      total += convertQty(line.qty, line.uom, target)
    } catch {
      mixed = true
      total += line.qty
    }
  }
  return { qty: Math.round(total * 10000) / 10000, uom: target, mixed }
}

// ------------------------------------------------- letter of credit state

export type LcState = 'none' | 'valid' | 'expiring' | 'expired'

/** An LC within 45 days of expiry is chased; one past expiry is a problem. */
export function lcState(indent: Pick<Indent, 'lcNumber' | 'lcExpiryDate'>): {
  state: LcState
  daysToExpiry: number | null
} {
  if (!indent.lcNumber) return { state: 'none', daysToExpiry: null }
  if (!indent.lcExpiryDate) return { state: 'valid', daysToExpiry: null }
  const days = differenceInCalendarDays(parseISO(indent.lcExpiryDate), new Date())
  return { state: days < 0 ? 'expired' : days <= 45 ? 'expiring' : 'valid', daysToExpiry: days }
}

export function LcBadge({ indent }: { indent: Pick<Indent, 'lcNumber' | 'lcExpiryDate'> }) {
  const { state, daysToExpiry } = lcState(indent)
  if (state === 'none') return <Badge tone="outline">No LC yet</Badge>
  if (state === 'expired') return <Badge tone="danger">Expired {fmtDate(indent.lcExpiryDate)}</Badge>
  if (state === 'expiring') return <Badge tone="warn">Expires in {daysToExpiry}d</Badge>
  return <Badge tone="ok">LC on file</Badge>
}

// ------------------------------------------------------------- documents

// ------------------------------------------------------------ small cells

/** A bounded metric cell. Used in fours inside a grid, never as a wide strip. */
export function StatCell({
  label,
  value,
  hint,
  tone = 'ink',
}: {
  label: string
  value: React.ReactNode
  hint?: React.ReactNode
  tone?: 'ink' | 'accent' | 'ok' | 'warn' | 'danger'
}) {
  const valueTone = {
    ink: 'text-ink-900',
    accent: 'text-accent-800',
    ok: 'text-ok-600',
    warn: 'text-warn-600',
    danger: 'text-danger-700',
  }[tone]
  return (
    <Panel className="p-3.5">
      <p className="text-2xs font-semibold uppercase tracking-wider text-ink-500">{label}</p>
      <p className={`mt-1 truncate text-2xl font-semibold tabular ${valueTone}`}>{value}</p>
      {hint ? <p className="mt-0.5 text-xs text-ink-500">{hint}</p> : null}
    </Panel>
  )
}

/** The copy that keeps the indenting model straight on every screen. */
export function IndentingNote({ children }: { children: React.ReactNode }) {
  return <p className="text-xs leading-relaxed text-ink-500">{children}</p>
}

export function ClearFiltersButton({ onClear, count }: { onClear: () => void; count: number }) {
  if (count === 0) return null
  return (
    <Button variant="ghost" size="sm" onClick={onClear}>
      Clear {count} filter{count === 1 ? '' : 's'}
    </Button>
  )
}
