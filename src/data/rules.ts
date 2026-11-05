/**
 * Business rules, mirroring what the database enforces in
 * `dcos/07-database-schema.sql` section 12.
 *
 * Keeping them here means the prototype refuses the same things the real system
 * would, so a demonstration of "what happens when you get it wrong" is honest
 * rather than staged. Each rule names the document it comes from.
 */

import type {
  Batch,
  Commission,
  Company,
  Engagement,
  EngagementStage,
  MpPrice,
  Product,
} from './types'
import { convertQty, stageConfig } from './reference'

// ------------------------------------------------------------ stage machine

/** Allowed transitions, matching the `stage_transition` seed and UF-07. */
export const STAGE_TRANSITIONS: {
  from: EngagementStage
  to: EngagementStage
  requiresPermission?: 'engagement.override_stage' | 'engagement.reopen'
}[] = [
  { from: 'IDENTIFIED', to: 'OFFERED' },
  { from: 'IDENTIFIED', to: 'SAMPLE_REQUESTED', requiresPermission: 'engagement.override_stage' },
  { from: 'IDENTIFIED', to: 'ON_HOLD' },
  { from: 'IDENTIFIED', to: 'REJECTED' },
  { from: 'IDENTIFIED', to: 'DISCONTINUED' },
  { from: 'OFFERED', to: 'SAMPLE_REQUESTED' },
  { from: 'OFFERED', to: 'REJECTED' },
  { from: 'OFFERED', to: 'ON_HOLD' },
  { from: 'SAMPLE_REQUESTED', to: 'SAMPLE_SENT' },
  { from: 'SAMPLE_REQUESTED', to: 'ON_HOLD' },
  { from: 'SAMPLE_REQUESTED', to: 'REJECTED' },
  { from: 'SAMPLE_SENT', to: 'UNDER_EVALUATION' },
  { from: 'SAMPLE_SENT', to: 'ON_HOLD' },
  { from: 'SAMPLE_SENT', to: 'REJECTED' },
  { from: 'UNDER_EVALUATION', to: 'APPROVED' },
  { from: 'UNDER_EVALUATION', to: 'REJECTED' },
  { from: 'UNDER_EVALUATION', to: 'SAMPLE_REQUESTED' },
  { from: 'UNDER_EVALUATION', to: 'ON_HOLD' },
  { from: 'APPROVED', to: 'COMMERCIAL' },
  { from: 'APPROVED', to: 'ON_HOLD' },
  { from: 'APPROVED', to: 'REJECTED' },
  { from: 'COMMERCIAL', to: 'DISCONTINUED' },
  { from: 'COMMERCIAL', to: 'ON_HOLD' },
  { from: 'ON_HOLD', to: 'IDENTIFIED' },
  { from: 'ON_HOLD', to: 'OFFERED' },
  { from: 'ON_HOLD', to: 'SAMPLE_REQUESTED' },
  { from: 'ON_HOLD', to: 'SAMPLE_SENT' },
  { from: 'ON_HOLD', to: 'UNDER_EVALUATION' },
  { from: 'ON_HOLD', to: 'APPROVED' },
  { from: 'ON_HOLD', to: 'COMMERCIAL' },
  { from: 'ON_HOLD', to: 'REJECTED' },
  { from: 'ON_HOLD', to: 'DISCONTINUED' },
  { from: 'REJECTED', to: 'IDENTIFIED', requiresPermission: 'engagement.reopen' },
  { from: 'DISCONTINUED', to: 'IDENTIFIED', requiresPermission: 'engagement.reopen' },
]

export interface StageCheck {
  ok: boolean
  /** why it was refused, in the words the user should see */
  error?: string
  /** the move is allowed but needs an explicit override and a note */
  requiresOverride?: boolean
  /** the move needs a reason from the configured list */
  requiresReason?: boolean
  /** reopening a closed engagement */
  requiresReopen?: boolean
}

/**
 * Mirrors change_engagement_stage(). Returns what the UI must collect before
 * the move, or the reason it cannot happen at all.
 */
export function checkStageChange(
  engagement: Engagement,
  to: EngagementStage,
): StageCheck {
  const from = engagement.stage
  if (from === to) {
    return { ok: false, error: `This engagement is already at ${to.toLowerCase().replace(/_/g, ' ')}.` }
  }

  const transition = STAGE_TRANSITIONS.find((t) => t.from === from && t.to === to)
  if (!transition) {
    const allowed = allowedNextStages(from)
    return {
      ok: false,
      error: allowed.length
        ? `${label(from)} cannot move straight to ${label(to)}. Allowed from here: ${allowed.map(label).join(', ')}.`
        : `${label(from)} is a closed stage. Reopen the engagement first.`,
    }
  }

  // Resume from hold only to the stage it was paused from.
  if (from === 'ON_HOLD' && to !== 'REJECTED' && to !== 'DISCONTINUED') {
    if (engagement.stageBeforeHold && engagement.stageBeforeHold !== to) {
      return {
        ok: false,
        error: `This engagement was put on hold at ${label(engagement.stageBeforeHold)}. It can resume only to that stage, or be closed.`,
      }
    }
  }

  return {
    ok: true,
    requiresOverride: transition.requiresPermission === 'engagement.override_stage',
    requiresReopen: transition.requiresPermission === 'engagement.reopen',
    requiresReason: stageConfig(to).requiresReason,
  }
}

export function allowedNextStages(from: EngagementStage): EngagementStage[] {
  return STAGE_TRANSITIONS.filter((t) => t.from === from).map((t) => t.to)
}

const label = (s: EngagementStage) => s.charAt(0) + s.slice(1).toLowerCase().replace(/_/g, ' ')

// ------------------------------------------------------- duplicate detection

/** Mirrors fn_normalise_name(): lowercase, strip accents, punctuation and suffixes. */
export function normaliseName(text: string): string {
  return text
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/\b(ltd|limited|inc|incorporated|pvt|private|co|company|corp|corporation|gmbh|sa|bv|plc)\b/g, '')
    .replace(/[\s.,'"&-]/g, '')
}

/** 0..1 similarity, used for the near-duplicate warning (pg_trgm equivalent). */
export function similarity(a: string, b: string): number {
  const x = normaliseName(a)
  const y = normaliseName(b)
  if (!x || !y) return 0
  if (x === y) return 1
  const grams = (s: string) => {
    const padded = `  ${s} `
    const out = new Set<string>()
    for (let i = 0; i < padded.length - 2; i++) out.add(padded.slice(i, i + 3))
    return out
  }
  const ga = grams(x)
  const gb = grams(y)
  let shared = 0
  ga.forEach((g) => {
    if (gb.has(g)) shared++
  })
  return shared / (ga.size + gb.size - shared)
}

export interface DuplicateCheck {
  exact: { id: string; name: string; blacklisted?: boolean; blacklistReason?: string | null } | null
  near: { id: string; name: string; score: number }[]
}

/** FR-M2-06 / FR-M5-06: block an exact match among active records, warn on near ones. */
export function checkCompanyDuplicate(
  legalName: string,
  countryCode: string,
  companies: Company[],
  ignoreId?: string,
): DuplicateCheck {
  const target = normaliseName(legalName)
  if (!target) return { exact: null, near: [] }
  let exact: DuplicateCheck['exact'] = null
  const near: DuplicateCheck['near'] = []

  for (const c of companies) {
    if (c.id === ignoreId || !c.isActive) continue
    const score = similarity(legalName, c.legalName)
    if (normaliseName(c.legalName) === target && c.countryCode === countryCode) {
      exact = {
        id: c.id,
        name: c.legalName,
        blacklisted: c.manufacturer?.status === 'BLACKLISTED',
        blacklistReason: c.manufacturer?.blacklistReason ?? null,
      }
    } else if (score >= 0.62) {
      near.push({ id: c.id, name: c.legalName, score })
    }
  }
  near.sort((a, b) => b.score - a.score)
  return { exact, near: near.slice(0, 4) }
}

/** FR-M3-02: unique generic name within a category; warn on near matches and shared CAS. */
export function checkProductDuplicate(
  genericName: string,
  category: string,
  casNumber: string | null,
  products: Product[],
  ignoreId?: string,
): DuplicateCheck & { sameCas: { id: string; name: string } | null; otherCategory: { id: string; name: string; category: string } | null } {
  const target = normaliseName(genericName)
  let exact: DuplicateCheck['exact'] = null
  let sameCas: { id: string; name: string } | null = null
  let otherCategory: { id: string; name: string; category: string } | null = null
  const near: DuplicateCheck['near'] = []

  for (const p of products) {
    if (p.id === ignoreId || !p.isActive) continue
    const same = normaliseName(p.genericName) === target
    if (same && p.category === category) {
      exact = { id: p.id, name: p.genericName }
    } else if (same) {
      otherCategory = { id: p.id, name: p.genericName, category: p.category }
    } else {
      const score = similarity(genericName, p.genericName)
      if (score >= 0.7) near.push({ id: p.id, name: p.genericName, score })
    }
    if (casNumber && p.casNumber && p.casNumber === casNumber && p.id !== ignoreId) {
      sameCas = { id: p.id, name: p.genericName }
    }
  }
  near.sort((a, b) => b.score - a.score)
  return { exact, near: near.slice(0, 4), sameCas, otherCategory }
}

// --------------------------------------------------------------- price rules

/**
 * AC-03: two prices for the same source, incoterm and MOQ tier may never have
 * overlapping validity. Mirrors the EXCLUDE constraint.
 */
export function findPriceOverlap(
  candidate: Pick<MpPrice, 'manufacturerProductId' | 'incoterm' | 'minQty' | 'validFrom' | 'validTo'>,
  prices: MpPrice[],
  ignoreId?: string,
): MpPrice | null {
  return (
    prices.find(
      (p) =>
        p.id !== ignoreId &&
        p.manufacturerProductId === candidate.manufacturerProductId &&
        p.incoterm === candidate.incoterm &&
        p.minQty === candidate.minQty &&
        p.validFrom <= candidate.validTo &&
        p.validTo >= candidate.validFrom,
    ) ?? null
  )
}

export function currentPrices(prices: MpPrice[], mpId: string, on = today()): MpPrice[] {
  return prices.filter(
    (p) => p.manufacturerProductId === mpId && p.validFrom <= on && p.validTo >= on,
  )
}

/** §7.8: the best applicable tier for an incoterm and quantity. */
export function priceFor(
  prices: MpPrice[],
  mpId: string,
  opts: { incoterm?: string; qty?: number; on?: string } = {},
): MpPrice | null {
  const applicable = currentPrices(prices, mpId, opts.on)
    .filter((p) => (opts.incoterm ? p.incoterm === opts.incoterm : true))
    .filter((p) => (opts.qty != null ? p.minQty <= opts.qty : true))
    .sort((a, b) => b.minQty - a.minQty)
  return applicable[0] ?? null
}

// --------------------------------------------------------- order gate rules

export interface SourceGate {
  allowed: boolean
  /** true when the line needs an override reason to be accepted */
  needsOverride: boolean
  stage: EngagementStage | null
  message: string | null
}

/**
 * FR-M8-05: an order line's source must be Approved or Commercial for that
 * client, or the user must record an override reason.
 */
export function checkSourceApproved(
  engagement: Engagement | undefined,
): SourceGate {
  if (!engagement) {
    return {
      allowed: false,
      needsOverride: true,
      stage: null,
      message: 'There is no engagement between this client and this source. Ordering it needs a recorded reason.',
    }
  }
  if (engagement.stage === 'APPROVED' || engagement.stage === 'COMMERCIAL') {
    return { allowed: true, needsOverride: false, stage: engagement.stage, message: null }
  }
  return {
    allowed: false,
    needsOverride: true,
    stage: engagement.stage,
    message: `This source is at ${label(engagement.stage)} for this client, not approved. Ordering it needs a recorded reason.`,
  }
}

// ------------------------------------------------------- shipment and batch

export interface QtyGuard {
  ok: boolean
  error?: string
  warning?: string
}

/**
 * Over-shipment guard (AC-10), unit-aware, against the indent line plus the
 * configured tolerance.
 */
export function checkOverShipment(
  lineQty: number,
  lineUom: string,
  alreadyShipped: { qty: number; qtyUom: string }[],
  addQty: number,
  addUom: string,
  tolerancePct: number,
): QtyGuard {
  let shipped = 0
  try {
    for (const s of alreadyShipped) shipped += convertQty(s.qty, s.qtyUom, lineUom)
    const adding = convertQty(addQty, addUom, lineUom)
    const limit = lineQty * (1 + tolerancePct / 100)
    const total = shipped + adding
    if (total > limit) {
      return {
        ok: false,
        error: `Shipping this would bring the total to ${round(total)} ${lineUom} against an indent line of ${round(lineQty)} ${lineUom} (tolerance ${tolerancePct}%).`,
      }
    }
    if (total > lineQty) {
      return {
        ok: true,
        warning: `This takes the total to ${round(total)} ${lineUom}, over the indent line's ${round(lineQty)} ${lineUom} but within the ${tolerancePct}% tolerance.`,
      }
    }
    return { ok: true }
  } catch (e) {
    return { ok: false, error: (e as Error).message }
  }
}

/** FR-M8-16: remaining shelf life on receipt against the client's minimum. */
export function checkShelfLife(
  batch: Pick<Batch, 'expiryDate'>,
  minMonths: number,
  on = today(),
): QtyGuard {
  if (!batch.expiryDate) return { ok: true }
  const cutoff = new Date(on)
  cutoff.setMonth(cutoff.getMonth() + minMonths)
  if (new Date(batch.expiryDate) < cutoff) {
    return {
      ok: false,
      error: `This batch expires on ${batch.expiryDate}, less than ${minMonths} months away. Record a short-shelf-life remark to accept it.`,
    }
  }
  return { ok: true }
}

/** Batch date rules: expiry after manufacture, retest on or before expiry, one of the two present. */
export function checkBatchDates(b: {
  manufacturingDate: string
  expiryDate: string | null
  retestDate: string | null
}): QtyGuard {
  if (!b.expiryDate && !b.retestDate) {
    return { ok: false, error: 'A batch needs an expiry date, a retest date, or both.' }
  }
  if (b.manufacturingDate > today()) {
    return { ok: false, error: 'The manufacturing date cannot be in the future.' }
  }
  if (b.expiryDate && b.expiryDate <= b.manufacturingDate) {
    return { ok: false, error: 'The expiry date must be after the manufacturing date.' }
  }
  if (b.retestDate && b.expiryDate && b.retestDate > b.expiryDate) {
    return { ok: false, error: 'The retest date cannot be after the expiry date.' }
  }
  return { ok: true }
}

/** Delivery rules (FR-M8-15), checked in the order the trigger checks them. */
export function checkDelivery(args: {
  shipmentClearedOn: string | null
  deliveredOn: string
  lineServesOrderLine: boolean
  siteBelongsToClient: boolean
  shipmentLineQty: number
  shipmentLineUom: string
  alreadyDelivered: { qty: number; uom: string }[]
  deliveringQty: number
  deliveringUom: string
}): QtyGuard {
  if (!args.shipmentClearedOn) {
    return { ok: false, error: 'This shipment has not been customs-cleared, so nothing can be delivered from it yet.' }
  }
  if (args.deliveredOn < args.shipmentClearedOn) {
    return { ok: false, error: `The delivery date is before customs clearance on ${args.shipmentClearedOn}.` }
  }
  if (!args.lineServesOrderLine) {
    return { ok: false, error: 'That order line is not served by the indent line on this shipment.' }
  }
  if (!args.siteBelongsToClient) {
    return { ok: false, error: 'That delivery site does not belong to the ordering client.' }
  }
  try {
    let done = 0
    for (const d of args.alreadyDelivered) done += convertQty(d.qty, d.uom, args.shipmentLineUom)
    const adding = convertQty(args.deliveringQty, args.deliveringUom, args.shipmentLineUom)
    if (done + adding > args.shipmentLineQty) {
      return {
        ok: false,
        error: `This shipment line holds ${round(args.shipmentLineQty)} ${args.shipmentLineUom}, of which ${round(done)} is already delivered.`,
      }
    }
  } catch (e) {
    return { ok: false, error: (e as Error).message }
  }
  return { ok: true }
}

// ------------------------------------------------------------- commission

/** Commission check constraints from the schema, in the order they matter. */
export function checkCommission(c: Partial<Commission>): QtyGuard {
  if (c.basis === 'PERCENT_OF_VALUE' && (c.ratePct == null || c.ratePct <= 0)) {
    return { ok: false, error: 'A percentage commission needs a rate.' }
  }
  if (c.basis !== 'TBD' && c.amount == null) {
    return { ok: false, error: 'Enter the commission amount, or set the basis to "to be decided".' }
  }
  if (c.status && c.status !== 'PENDING' && c.amount == null) {
    return { ok: false, error: 'A commission with no agreed figure cannot be invoiced.' }
  }
  if (c.amount != null && c.receivedAmount != null && c.receivedAmount > c.amount) {
    return { ok: false, error: 'Receipts cannot exceed the commission due.' }
  }
  return { ok: true }
}

/** A6: an indent is raised for one client and serves only that client's order lines. */
export function checkIndentClient(indentClientId: string, orderClientId: string): QtyGuard {
  if (indentClientId !== orderClientId) {
    return {
      ok: false,
      error: 'This indent was raised for a different client. An indent is placed on behalf of one client only.',
    }
  }
  return { ok: true }
}

// --------------------------------------------------------------- user rules

/** UC-17 4b: there must always be one active, activated Full Access user. */
export function checkLastFullAccess(
  users: { id: string; roleCode: string; isActive: boolean; activatedAt: string | null }[],
  change: { userId: string; toRole?: string; toActive?: boolean },
): QtyGuard {
  const after = users.map((u) =>
    u.id === change.userId
      ? {
          ...u,
          roleCode: change.toRole ?? u.roleCode,
          isActive: change.toActive ?? u.isActive,
        }
      : u,
  )
  const remaining = after.filter(
    (u) => u.roleCode === 'FULL_ACCESS' && u.isActive && u.activatedAt !== null,
  )
  if (remaining.length === 0) {
    return {
      ok: false,
      error: 'This would leave nobody with Full Access, locking the system into read-only. Give another activated user Full Access first.',
    }
  }
  return { ok: true }
}

// ------------------------------------------------------------------ helpers

export function today(): string {
  return new Date().toISOString().slice(0, 10)
}

const round = (n: number) => Math.round(n * 10000) / 10000
