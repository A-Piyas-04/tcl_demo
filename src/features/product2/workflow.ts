/**
 * Workflow derivation and financial calculations for Product 2.0.
 *
 * Progress is never stored as a flag: it is read off the records that exist
 * (a sample with a decision, a PI, an opened LC, a shipment, a receipt), so a
 * stage is complete only because a user recorded the thing that completes it.
 */

import { add, dec, mul, pctOf, sub, type Dec } from './decimal'
import type {
  CommissionRecord,
  ID,
  LcRecord,
  P2Data,
  PiIndent,
  SampleRecord,
  ShipmentRecord,
  SourcingRecord,
  SourcingStatus,
  TradeOrder,
  TradeStageKey,
} from './types'

// --------------------------------------------------------------- sourcing

export const SOURCING_STATUS_LABEL: Record<SourcingStatus, string> = {
  IDENTIFIED: 'Identified',
  SAMPLE_SUBMITTED: 'Sample submitted',
  ACCEPTED: 'Sample accepted',
  REJECTED: 'Sample rejected',
}

export function samplesFor(data: P2Data, sourcingId: ID): SampleRecord[] {
  return data.samples.filter((s) => s.sourcingId === sourcingId).sort((a, b) => a.roundNo - b.roundNo)
}

/**
 * Accepted wins outright. Otherwise the latest round decides: pending means
 * submitted, a rejection means rejected (and a new round may be submitted).
 */
export function sourcingStatus(data: P2Data, sourcingId: ID): SourcingStatus {
  const samples = samplesFor(data, sourcingId)
  if (samples.length === 0) return 'IDENTIFIED'
  if (samples.some((s) => s.status === 'ACCEPTED')) return 'ACCEPTED'
  const latest = samples[samples.length - 1]!
  return latest.status === 'SUBMITTED' ? 'SAMPLE_SUBMITTED' : 'REJECTED'
}

export type StepState = 'done' | 'current' | 'pending' | 'rejected'

export interface Step {
  key: string
  label: string
  state: StepState
  date?: string | null
  note?: string | null
}

export function sourcingSteps(data: P2Data, sourcing: SourcingRecord): Step[] {
  const samples = samplesFor(data, sourcing.id)
  const status = sourcingStatus(data, sourcing.id)
  const accepted = samples.find((s) => s.status === 'ACCEPTED')
  const latest = samples[samples.length - 1]
  const decisionSample = accepted ?? (latest?.status === 'REJECTED' ? latest : undefined)

  return [
    { key: 'IDENTIFIED', label: 'Identified', state: 'done', date: sourcing.identifiedOn },
    {
      key: 'SUBMITTED',
      label: 'Sample submitted',
      state: samples.length ? 'done' : 'current',
      date: (accepted ?? latest)?.submittedOn ?? null,
      note: samples.length > 1 ? `${samples.length} rounds` : null,
    },
    {
      key: 'DECISION',
      label: status === 'REJECTED' ? 'Sample rejected' : status === 'ACCEPTED' ? 'Sample accepted' : 'Accepted / rejected',
      state:
        status === 'ACCEPTED' ? 'done' : status === 'REJECTED' ? 'rejected' : status === 'SAMPLE_SUBMITTED' ? 'current' : 'pending',
      date: decisionSample?.decidedOn ?? null,
      note: status === 'REJECTED' ? (latest?.rejectionReason ?? null) : null,
    },
  ]
}

/** Overall sourcing status for an API: the best of its sources. */
const SOURCING_RANK: Record<SourcingStatus, number> = { ACCEPTED: 3, SAMPLE_SUBMITTED: 2, IDENTIFIED: 1, REJECTED: 0 }

export function apiSourcingStatus(data: P2Data, apiProductId: ID): SourcingStatus | null {
  const sources = data.sourcing.filter((s) => s.apiProductId === apiProductId)
  if (!sources.length) return null
  return sources
    .map((s) => sourcingStatus(data, s.id))
    .sort((a, b) => SOURCING_RANK[b] - SOURCING_RANK[a])[0]!
}

// ------------------------------------------------------------------ trade

export const TRADE_STAGES: { key: TradeStageKey; label: string }[] = [
  { key: 'CLIENT_ORDER', label: 'Client order' },
  { key: 'PI_PLACED', label: 'PI / Indent placed' },
  { key: 'LC_OPENED', label: 'LC opened' },
  { key: 'SHIPMENT', label: 'Shipment' },
  { key: 'DELIVERED', label: 'Delivered' },
  { key: 'COMMISSION', label: 'Commission received' },
]

export const TRADE_STAGE_LABEL = Object.fromEntries(TRADE_STAGES.map((s) => [s.key, s.label])) as Record<
  TradeStageKey,
  string
>

export interface TradeBundle {
  order: TradeOrder
  pi: PiIndent | null
  lc: LcRecord | null
  shipment: ShipmentRecord | null
  commission: CommissionRecord | null
}

/** One record of each kind per order today; the model allows more later, so take the latest. */
const latestOf = <T extends { tradeOrderId: ID; createdAt: string }>(rows: T[], orderId: ID): T | null =>
  rows
    .filter((r) => r.tradeOrderId === orderId)
    .sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1))[0] ?? null

export function tradeBundle(data: P2Data, order: TradeOrder): TradeBundle {
  return {
    order,
    pi: latestOf(data.piIndents, order.id),
    lc: latestOf(data.lcs, order.id),
    shipment: latestOf(data.shipments, order.id),
    commission: latestOf(data.commissions, order.id),
  }
}

export function stageDone(b: TradeBundle, key: TradeStageKey): boolean {
  switch (key) {
    case 'CLIENT_ORDER':
      return !!b.order.confirmedOn
    case 'PI_PLACED':
      return !!b.pi
    case 'LC_OPENED':
      return b.lc?.status === 'OPENED'
    case 'SHIPMENT':
      return b.shipment?.status === 'SHIPPED' || b.shipment?.status === 'DELIVERED'
    case 'DELIVERED':
      return b.shipment?.status === 'DELIVERED'
    case 'COMMISSION':
      return b.commission?.status === 'RECEIVED'
  }
}

/** The first stage not yet completed; null when every stage is done. */
export function currentTradeStage(b: TradeBundle): TradeStageKey | null {
  return TRADE_STAGES.find((s) => !stageDone(b, s.key))?.key ?? null
}

/** Human status for a list cell. */
export function tradeStatusLabel(b: TradeBundle): string {
  const current = currentTradeStage(b)
  switch (current) {
    case null:
      return 'Completed'
    case 'CLIENT_ORDER':
      return 'Awaiting order confirmation'
    case 'PI_PLACED':
      return 'Awaiting PI / indent'
    case 'LC_OPENED':
      return b.lc ? 'LC in draft' : 'Awaiting LC'
    case 'SHIPMENT':
      return b.shipment ? 'Shipment in progress' : 'Awaiting shipment'
    case 'DELIVERED':
      return 'Shipped — in transit'
    case 'COMMISSION':
      return 'Delivered — commission due'
  }
}

export function tradeSteps(b: TradeBundle): Step[] {
  const current = currentTradeStage(b)
  const dateFor: Record<TradeStageKey, string | null | undefined> = {
    CLIENT_ORDER: b.order.confirmedOn ?? b.order.orderDate,
    PI_PLACED: b.pi?.piDate,
    LC_OPENED: b.lc?.status === 'OPENED' ? b.lc.openedOn : null,
    SHIPMENT: b.shipment?.shippedOn ?? b.shipment?.etd,
    DELIVERED: b.shipment?.deliveredOn,
    COMMISSION: b.commission?.receivedOn,
  }
  return TRADE_STAGES.map((s) => {
    const done = stageDone(b, s.key)
    let label = s.label
    if (s.key === 'SHIPMENT') {
      label = done ? 'Shipped' : b.shipment ? 'Shipment in progress' : 'Shipment'
    }
    if (s.key === 'LC_OPENED' && !done && b.lc) label = 'LC (draft)'
    if (s.key === 'CLIENT_ORDER' && !done) label = 'Client order (unconfirmed)'
    return {
      key: s.key,
      label,
      state: done ? 'done' : s.key === current ? 'current' : 'pending',
      date: dateFor[s.key] ?? null,
    }
  })
}

// ------------------------------------------------------------- financials

export interface OrderFinancials {
  quantity: Dec
  fobUnitPrice: Dec
  /** quantity × FOB unit price */
  fobValue: Dec
  transportCharges: Dec
  /** FOB value + transport charges */
  transactionTotal: Dec
  /** what the LC was actually opened for, which may differ from the transaction total */
  lcAmount: Dec | null
  basis: 'FOB' | 'TOTAL' | null
  percentage: Dec | null
  commissionableAmount: Dec | null
  expectedCommission: Dec | null
  receivedCommission: Dec | null
  /** received − expected, once received */
  variance: Dec | null
}

export function orderFinancials(b: TradeBundle): OrderFinancials {
  const quantity = dec(b.order.quantity)
  const fobUnitPrice = dec(b.order.fobUnitPrice)
  const fobValue = mul(quantity, fobUnitPrice)
  const transportCharges = dec(b.order.transportCharges)
  const transactionTotal = add(fobValue, transportCharges)
  const c = b.commission
  const commissionableAmount = c ? (c.basis === 'FOB' ? fobValue : transactionTotal) : null
  const percentage = c ? dec(c.percentage) : null
  const expectedCommission = commissionableAmount != null && percentage != null ? pctOf(commissionableAmount, percentage) : null
  const receivedCommission = c?.status === 'RECEIVED' && c.receivedAmount ? dec(c.receivedAmount) : null
  return {
    quantity,
    fobUnitPrice,
    fobValue,
    transportCharges,
    transactionTotal,
    lcAmount: b.lc ? dec(b.lc.amount) : null,
    basis: c?.basis ?? null,
    percentage,
    commissionableAmount,
    expectedCommission,
    receivedCommission,
    variance: receivedCommission != null && expectedCommission != null ? sub(receivedCommission, expectedCommission) : null,
  }
}

export const COMMISSION_BASIS_LABEL = { FOB: 'FOB value', TOTAL: 'Total transaction amount' } as const

/** Sum amounts per currency; different currencies are never added together. */
export function totalsByCurrency(items: { amount: Dec; currency: string }[]): { currency: string; amount: Dec }[] {
  const m = new Map<string, Dec>()
  for (const i of items) m.set(i.currency, (m.get(i.currency) ?? 0n) + i.amount)
  return [...m.entries()].map(([currency, amount]) => ({ currency, amount })).sort((a, b) => (b.amount > a.amount ? 1 : -1))
}
