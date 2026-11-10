/**
 * Read models: the joins and roll-ups the screens show.
 *
 * These are the front-end equivalents of the views in
 * `dcos/07-database-schema.sql` section 13, named after them so the two can be
 * compared: v_engagement_full, v_product_sources, v_current_price,
 * v_client_order_line_status, v_commission_book, v_unsourced_demand,
 * fn_development_register.
 */

import { differenceInCalendarDays, parseISO } from 'date-fns'
import { convertQty, stageConfig } from './reference'
import { today } from './rules'
import { DEMO_STORIES } from './seed'
import type {
  Batch,
  ClientOrder,
  ClientOrderLine,
  Commission,
  Company,
  CompanySite,
  Database,
  Shipment,
  DocumentRecord,
  Engagement,
  EngagementStage,
  ID,
  Indent,
  ManufacturerProduct,
  MpPrice,
  Pharmacopoeia,
  Product,
  Requirement,
  RequirementKind,
} from './types'

// ------------------------------------------------------------- lookup maps

export function indexBy<T extends { id: ID }>(rows: T[]): Map<ID, T> {
  const m = new Map<ID, T>()
  for (const r of rows) m.set(r.id, r)
  return m
}

export const companyName = (db: Database, id: ID | null | undefined) =>
  id ? (db.companies.find((c) => c.id === id)?.displayName ?? '—') : '—'

export const productName = (db: Database, id: ID | null | undefined) =>
  id ? (db.products.find((p) => p.id === id)?.genericName ?? '—') : '—'

export const userName = (db: Database, id: ID | null | undefined) =>
  id ? (db.users.find((u) => u.id === id)?.fullName ?? '—') : '—'

export const siteName = (db: Database, id: ID | null | undefined) =>
  id ? (db.sites.find((s) => s.id === id)?.name ?? '—') : '—'

export const clients = (db: Database) => db.companies.filter((c) => c.kind === 'CLIENT' || c.kind === 'BOTH')
export const manufacturers = (db: Database) =>
  db.companies.filter((c) => c.kind === 'MANUFACTURER' || c.kind === 'BOTH')

// ------------------------------------------------------- v_current_price

export function currentPriceTiers(db: Database, mpId: ID, on = today()): MpPrice[] {
  return db.prices
    .filter((p) => p.manufacturerProductId === mpId && p.validFrom <= on && p.validTo >= on)
    .sort((a, b) => a.minQty - b.minQty)
}

export function bestPrice(db: Database, mpId: ID, opts: { qty?: number; incoterm?: string } = {}): MpPrice | null {
  const tiers = currentPriceTiers(db, mpId)
    .filter((p) => (opts.incoterm ? p.incoterm === opts.incoterm : true))
    .filter((p) => (opts.qty != null ? p.minQty <= opts.qty : true))
    .sort((a, b) => b.minQty - a.minQty)
  return tiers[0] ?? null
}

/** The most recent price of any date, so a screen can say "expired on …". */
export function latestPrice(db: Database, mpId: ID): MpPrice | null {
  return (
    db.prices
      .filter((p) => p.manufacturerProductId === mpId)
      .sort((a, b) => (a.validTo < b.validTo ? 1 : -1))[0] ?? null
  )
}

// ---------------------------------------------------- v_product_sources

export interface SourceRow {
  mp: ManufacturerProduct
  product: Product
  manufacturer: Company
  site: CompanySite | null
  inPortfolio: boolean
  representation: string | null
  sourceAvailable: boolean
  isOfferable: boolean
  hasValidPrice: boolean
  priceTiers: MpPrice[]
  earliestPriceExpiry: string | null
  filings: { kind: string; authority: string; referenceNumber: string }[]
  hasDmf: boolean
  hasCep: boolean
  engagementCount: number
  commercialCount: number
}

export function sourceRows(db: Database, filter: { productId?: ID; manufacturerId?: ID } = {}): SourceRow[] {
  const out: SourceRow[] = []
  for (const mp of db.manufacturerProducts) {
    if (filter.productId && mp.productId !== filter.productId) continue
    if (filter.manufacturerId && mp.manufacturerCompanyId !== filter.manufacturerId) continue
    const product = db.products.find((p) => p.id === mp.productId)
    const manufacturer = db.companies.find((c) => c.id === mp.manufacturerCompanyId)
    if (!product || !manufacturer) continue

    const pf = db.portfolio.find((p) => p.manufacturerProductId === mp.id && p.isActive)
    const mStatus = manufacturer.manufacturer?.status ?? 'NEW'
    const sourceAvailable =
      mp.status === 'ACTIVE' && manufacturer.isActive && mStatus !== 'INACTIVE' && mStatus !== 'BLACKLISTED'
    const tiers = currentPriceTiers(db, mp.id)
    const filings = db.filings.filter((f) => f.manufacturerProductId === mp.id && f.isActive)
    const engs = db.engagements.filter((e) => e.manufacturerProductId === mp.id)

    out.push({
      mp,
      product,
      manufacturer,
      site: mp.siteId ? (db.sites.find((s) => s.id === mp.siteId) ?? null) : null,
      inPortfolio: Boolean(pf),
      representation: pf?.representation ?? null,
      sourceAvailable,
      hasValidPrice: tiers.length > 0,
      isOfferable: Boolean(pf) && sourceAvailable && tiers.length > 0,
      priceTiers: tiers,
      earliestPriceExpiry: tiers.length ? tiers.map((t) => t.validTo).sort()[0]! : null,
      filings: filings.map((f) => ({ kind: f.kind, authority: f.authority, referenceNumber: f.referenceNumber })),
      hasDmf: filings.some((f) => f.kind === 'DMF' || f.kind === 'ASMF'),
      hasCep: filings.some((f) => f.kind === 'CEP'),
      engagementCount: engs.length,
      commercialCount: engs.filter((e) => e.stage === 'COMMERCIAL').length,
    })
  }
  return out
}

// --------------------------------------------------- v_engagement_full

export interface EngagementRow {
  engagement: Engagement
  client: Company
  product: Product
  manufacturer: Company
  mp: ManufacturerProduct
  stage: EngagementStage
  daysInStage: number
  isAgeing: boolean
  inPortfolio: boolean
  hasDmf: boolean
  hasCep: boolean
  ownerName: string
  lastActivityAt: string | null
  offerCount: number
  sampleCount: number
}

export function engagementRows(
  db: Database,
  filter: {
    clientId?: ID
    productId?: ID
    manufacturerId?: ID
    mpId?: ID
    stage?: EngagementStage
    stages?: EngagementStage[]
    ownerId?: ID
    excludeClientId?: ID
  } = {},
): EngagementRow[] {
  const out: EngagementRow[] = []
  for (const e of db.engagements) {
    if (filter.clientId && e.clientCompanyId !== filter.clientId) continue
    if (filter.excludeClientId && e.clientCompanyId === filter.excludeClientId) continue
    if (filter.productId && e.productId !== filter.productId) continue
    if (filter.manufacturerId && e.manufacturerCompanyId !== filter.manufacturerId) continue
    if (filter.mpId && e.manufacturerProductId !== filter.mpId) continue
    if (filter.stage && e.stage !== filter.stage) continue
    if (filter.stages && !filter.stages.includes(e.stage)) continue
    if (filter.ownerId && e.ownerUserId !== filter.ownerId) continue

    const client = db.companies.find((c) => c.id === e.clientCompanyId)
    const product = db.products.find((p) => p.id === e.productId)
    const manufacturer = db.companies.find((c) => c.id === e.manufacturerCompanyId)
    const mp = db.manufacturerProducts.find((m) => m.id === e.manufacturerProductId)
    if (!client || !product || !manufacturer || !mp) continue

    const days = daysSince(e.stageChangedAt)
    const threshold = stageConfig(e.stage).ageingThresholdDays
    const filings = db.filings.filter((f) => f.manufacturerProductId === mp.id && f.isActive)
    const acts = db.activities.filter((a) => a.entityType === 'ENGAGEMENT' && a.entityId === e.id)

    out.push({
      engagement: e,
      client,
      product,
      manufacturer,
      mp,
      stage: e.stage,
      daysInStage: days,
      isAgeing: threshold > 0 && days > threshold,
      inPortfolio: db.portfolio.some((p) => p.manufacturerProductId === mp.id && p.isActive),
      hasDmf: filings.some((f) => f.kind === 'DMF' || f.kind === 'ASMF'),
      hasCep: filings.some((f) => f.kind === 'CEP'),
      ownerName: userName(db, e.ownerUserId),
      lastActivityAt: acts.length ? acts.map((a) => a.occurredAt).sort().at(-1)! : null,
      offerCount: db.offers.filter((o) => o.engagementId === e.id).length,
      sampleCount: db.samples.filter((s) => s.engagementId === e.id).length,
    })
  }
  return out
}

export function engagementFor(db: Database, clientId: ID, mpId: ID): Engagement | undefined {
  return db.engagements.find((e) => e.clientCompanyId === clientId && e.manufacturerProductId === mpId)
}

// -------------------------------------------------- v_unsourced_demand

export interface RequirementRow {
  requirement: Requirement
  client: Company
  product: Product
  ownerName: string
  engagementCount: number
  bestStage: EngagementStage | null
  isUnsourced: boolean
  candidateCount: number
  daysOpen: number
}

export function requirementRows(
  db: Database,
  filter: { clientId?: ID; productId?: ID; kind?: RequirementKind; unsourcedOnly?: boolean; openOnly?: boolean } = {},
): RequirementRow[] {
  const out: RequirementRow[] = []
  for (const r of db.requirements) {
    if (filter.clientId && r.clientCompanyId !== filter.clientId) continue
    if (filter.productId && r.productId !== filter.productId) continue
    if (filter.kind && r.kind !== filter.kind) continue
    if (filter.openOnly && !['OPEN', 'SOURCING', 'ENGAGED'].includes(r.status)) continue

    const client = db.companies.find((c) => c.id === r.clientCompanyId)
    const product = db.products.find((p) => p.id === r.productId)
    if (!client || !product) continue

    const links = db.requirementEngagements.filter((l) => l.requirementId === r.id)
    const engs = links
      .map((l) => db.engagements.find((e) => e.id === l.engagementId))
      .filter(Boolean) as Engagement[]

    const candidates = matchingSources(db, r)
    const unsourced = ['OPEN', 'SOURCING'].includes(r.status) && candidates.length === 0
    if (filter.unsourcedOnly && !unsourced) continue

    out.push({
      requirement: r,
      client,
      product,
      ownerName: userName(db, r.ownerUserId),
      engagementCount: engs.length,
      bestStage: engs.length ? furthestStage(engs.map((e) => e.stage)) : null,
      isUnsourced: unsourced,
      candidateCount: candidates.length,
      daysOpen: daysSince(r.enquiryDate),
    })
  }
  return out
}

/** The portfolio sources that answer a requirement, honouring the pharmacopoeia. */
export function matchingSources(db: Database, r: Pick<Requirement, 'productId' | 'requiredPharmacopoeia'>): SourceRow[] {
  return sourceRows(db, { productId: r.productId }).filter(
    (s) =>
      s.inPortfolio &&
      s.sourceAvailable &&
      (!r.requiredPharmacopoeia || s.mp.pharmacopoeia === r.requiredPharmacopoeia),
  )
}

/** Every source for a product, whether represented or not (UC-11 step 3). */
export function allSourcesFor(db: Database, productId: ID, requiredPharmacopoeia?: Pharmacopoeia | null): SourceRow[] {
  return sourceRows(db, { productId }).filter(
    (s) => !requiredPharmacopoeia || s.mp.pharmacopoeia === requiredPharmacopoeia,
  )
}

const STAGE_RANK: EngagementStage[] = [
  'DISCONTINUED',
  'REJECTED',
  'ON_HOLD',
  'IDENTIFIED',
  'OFFERED',
  'SAMPLE_REQUESTED',
  'SAMPLE_SENT',
  'UNDER_EVALUATION',
  'APPROVED',
  'COMMERCIAL',
]

export function furthestStage(stages: EngagementStage[]): EngagementStage | null {
  let best: EngagementStage | null = null
  for (const s of stages) {
    if (!best || STAGE_RANK.indexOf(s) > STAGE_RANK.indexOf(best)) best = s
  }
  return best
}

// ----------------------------------------------------------- sourcing gap

export type SourcingGap = 'NO_SOURCE' | 'NOT_REPRESENTED' | 'PHARMACOPOEIA' | 'SOURCE_UNAVAILABLE'

/**
 * Why a molecule cannot be offered: nobody makes it, TCL does not represent
 * whoever does, the represented source is to another standard, or every source
 * is blocked. Null when a represented, available source matches.
 */
export function sourcingGap(
  db: Database,
  productId: ID,
  requiredPharmacopoeia?: Pharmacopoeia | null,
): SourcingGap | null {
  const known = allSourcesFor(db, productId)
  if (known.length === 0) return 'NO_SOURCE'
  const representedAvailable = known.filter((s) => s.inPortfolio && s.sourceAvailable)
  const matching = representedAvailable.filter(
    (s) => !requiredPharmacopoeia || s.mp.pharmacopoeia === requiredPharmacopoeia,
  )
  if (matching.length > 0) return null
  if (representedAvailable.length > 0) return 'PHARMACOPOEIA'
  if (known.some((s) => !s.inPortfolio && s.sourceAvailable)) return 'NOT_REPRESENTED'
  return 'SOURCE_UNAVAILABLE'
}

export const SOURCING_GAP_COPY: Record<SourcingGap, { label: string; tone: 'danger' | 'warn' | 'accent'; detail: string }> = {
  NO_SOURCE: {
    label: 'No source in the register',
    tone: 'danger',
    detail: 'Nobody in the register makes this molecule. Sourcing has to find and register a manufacturer.',
  },
  NOT_REPRESENTED: {
    label: 'Source exists, not represented',
    tone: 'warn',
    detail:
      'The register already holds a manufacturer for this molecule that TCL does not represent. This is an agency conversation, not a search.',
  },
  PHARMACOPOEIA: {
    label: 'Wrong pharmacopoeia',
    tone: 'accent',
    detail:
      'TCL represents a source for this molecule, but not to the standard the client named. Either a second grade from the same plant or another source is needed.',
  },
  SOURCE_UNAVAILABLE: {
    label: 'Source blocked',
    tone: 'warn',
    detail:
      'Every known source is discontinued, or its manufacturer is inactive or blacklisted, so none of them can be offered.',
  },
}

// ------------------------------------------------------------ approvals

/** What an approval should warn about, wherever it is made from. */
export function approvalContext(db: Database, e: Engagement) {
  const hasPassedSample = db.samples.some((s) => s.engagementId === e.id && s.outcome === 'PASS')
  const siblingApproved = db.engagements.filter(
    (o) =>
      o.id !== e.id &&
      o.clientCompanyId === e.clientCompanyId &&
      o.productId === e.productId &&
      (o.stage === 'APPROVED' || o.stage === 'COMMERCIAL'),
  ).length
  return {
    hasPassedSample,
    siblingApproved,
    requireNoteBecause: hasPassedSample
      ? null
      : 'No sample round on this engagement has a recorded pass. Approving without an evaluation is unusual, so write down what the approval rests on.',
  }
}

// --------------------------------------------------------- deal progress

export type DealStepKey = 'ORDERED' | 'INDENTED' | 'SHIPPED' | 'DELIVERED' | 'COMMISSION'
export type DealStepState = 'done' | 'partial' | 'todo'

export interface DealProgress {
  orderLines: ClientOrderLine[]
  orders: ClientOrder[]
  indents: Indent[]
  shipments: Shipment[]
  commissions: Commission[]
  lineStatuses: OrderLineStatus[]
  steps: { key: DealStepKey; label: string; state: DealStepState; detail: string }[]
}

/**
 * The trade half of a deal: everything ordered through this client and source,
 * read from the order, indent, shipment and commission records.
 */
export function dealProgress(db: Database, e: Engagement): DealProgress {
  const orderLines = db.clientOrderLines.filter((l) => {
    if (l.engagementId === e.id) return true
    if (l.manufacturerProductId !== e.manufacturerProductId) return false
    return db.clientOrders.find((o) => o.id === l.clientOrderId)?.clientCompanyId === e.clientCompanyId
  })
  const orderIds = new Set(orderLines.map((l) => l.clientOrderId))
  const orders = db.clientOrders.filter((o) => orderIds.has(o.id))
  const lineIds = new Set(orderLines.map((l) => l.id))
  const indentLineIds = new Set(
    db.orderIndentLinks.filter((l) => lineIds.has(l.clientOrderLineId)).map((l) => l.indentLineId),
  )
  const indentIds = new Set(db.indentLines.filter((l) => indentLineIds.has(l.id)).map((l) => l.indentId))
  const indents = db.indents.filter((i) => indentIds.has(i.id))
  const shipments = db.shipments.filter((s) => indentIds.has(s.indentId) && s.status !== 'CANCELLED')
  const commissions = db.commissions.filter((c) => indentIds.has(c.indentId))
  const lineStatuses = orderLineStatuses(db).filter((s) => lineIds.has(s.lineId))

  const ordered = lineStatuses.reduce((n, s) => n + s.orderedQty, 0)
  const indented = lineStatuses.reduce((n, s) => n + s.indentedQty, 0)
  const delivered = lineStatuses.reduce((n, s) => n + s.deliveredQty, 0)
  const moving = shipments.filter((s) => s.status !== 'PLANNED')
  const uom = orderLines[0]?.qtyUom ?? ''

  const step = (cond: boolean, partial: boolean): DealStepState => (cond ? 'done' : partial ? 'partial' : 'todo')
  const received = commissions.filter((c) => c.status === 'RECEIVED').length
  const invoiced = commissions.filter((c) => c.status === 'INVOICED' || c.status === 'PARTIALLY_RECEIVED').length

  return {
    orderLines,
    orders,
    indents,
    shipments,
    commissions,
    lineStatuses,
    steps: [
      {
        key: 'ORDERED',
        label: 'Client order',
        state: step(orders.length > 0, false),
        detail: orders.length ? `${orders.map((o) => o.coNumber).join(', ')} · ${round(ordered)} ${uom}` : 'Not ordered yet',
      },
      {
        key: 'INDENTED',
        label: 'Indent placed',
        state: step(orders.length > 0 && indented >= ordered - 1e-6, indented > 0),
        detail: indents.length ? indents.map((i) => i.indentNumber).join(', ') : 'No indent yet',
      },
      {
        key: 'SHIPPED',
        label: 'Shipped',
        state: step(moving.length > 0 && shipments.every((s) => s.status !== 'PLANNED'), moving.length > 0 || shipments.length > 0),
        detail: shipments.length ? pluralCount(shipments.length, 'shipment') : 'Nothing shipped',
      },
      {
        key: 'DELIVERED',
        label: 'Delivered',
        state: step(ordered > 0 && delivered >= ordered - 1e-6, delivered > 0),
        detail: delivered > 0 ? `${round(delivered)} of ${round(ordered)} ${uom}` : 'Nothing delivered',
      },
      {
        key: 'COMMISSION',
        label: 'Commission received',
        state: step(commissions.length > 0 && received === commissions.length, received > 0 || invoiced > 0),
        detail: commissions.length
          ? received === commissions.length
            ? 'Received in full'
            : invoiced + received > 0
              ? 'Invoiced, awaiting payment'
              : commissions.some((c) => c.basis === 'TBD')
                ? 'Terms to be agreed'
                : 'Not invoiced yet'
          : 'Earned once an indent is placed',
      },
    ],
  }
}

const pluralCount = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`

// -------------------------------------------------------------- next step

export type NextAction =
  | { kind: 'offer' }
  | { kind: 'sample' }
  | { kind: 'dispatch'; roundId: ID }
  | { kind: 'receipt'; roundId: ID }
  | { kind: 'outcome'; roundId: ID }
  | { kind: 'approve' }
  | { kind: 'link'; href: string; label: string }

export interface NextStep {
  tone: 'action' | 'waiting' | 'done' | 'closed'
  title: string
  detail: string
  action?: NextAction
  /** the button label, when there is an action */
  actionLabel?: string
}

/**
 * What a person should do next on this engagement, worked out from the records
 * already there. It suggests; the rules still decide what is allowed.
 */
export function nextStepFor(db: Database, e: Engagement): NextStep {
  const client = companyName(db, e.clientCompanyId)
  const offers = db.offers.filter((o) => o.engagementId === e.id).sort((a, b) => b.versionNo - a.versionNo)
  const rounds = db.samples.filter((s) => s.engagementId === e.id).sort((a, b) => b.roundNo - a.roundNo)
  const latestOffer = offers[0]
  const latestRound = rounds[0]
  const orderHref = `/client-orders/new?client=${e.clientCompanyId}&source=${e.manufacturerProductId}&engagement=${e.id}`

  switch (e.stage) {
    case 'REJECTED':
    case 'DISCONTINUED':
      return {
        tone: 'closed',
        title: e.stage === 'REJECTED' ? 'Closed: rejected' : 'Closed: discontinued',
        detail: 'Nothing further is expected. If the client reconsiders, reopen it from Change stage; it returns to Identified.',
      }
    case 'ON_HOLD':
      return {
        tone: 'waiting',
        title: 'Paused',
        detail: `Put on hold${e.stageBeforeHold ? ` at ${e.stageBeforeHold.toLowerCase().replace(/_/g, ' ')}` : ''}. Resume it from Change stage when the reason has passed.`,
      }
    case 'IDENTIFIED':
      return {
        tone: 'action',
        title: 'Send the client an offer',
        detail: `${client} has not been quoted for this source yet. Recording the offer moves the engagement to Offered.`,
        action: { kind: 'offer' },
        actionLabel: 'Create offer',
      }
    case 'OFFERED':
      if (latestOffer?.status === 'DECLINED') {
        return {
          tone: 'action',
          title: 'Offer declined: revise it or close',
          detail: `${client} declined offer v${latestOffer.versionNo}. Send a revised offer, or reject the engagement from Change stage.`,
          action: { kind: 'offer' },
          actionLabel: 'Revise offer',
        }
      }
      return {
        tone: 'action',
        title: latestOffer?.status === 'ACCEPTED' ? 'Offer accepted: request a sample' : 'Request a sample for evaluation',
        detail:
          latestOffer?.status === 'ACCEPTED'
            ? `${client} accepted offer v${latestOffer.versionNo}. The next step is material for their QC to evaluate.`
            : `Offer v${latestOffer?.versionNo ?? 1} is with ${client}. When they want to test material, request a sample round.`,
        action: { kind: 'sample' },
        actionLabel: 'Request a sample',
      }
    case 'SAMPLE_REQUESTED':
      return latestRound && !latestRound.dispatchedOn
        ? {
            tone: 'action',
            title: 'Record the sample dispatch',
            detail: `Round ${latestRound.roundNo} was requested on ${latestRound.requestedOn}. Record the courier and tracking number once the manufacturer sends it.`,
            action: { kind: 'dispatch', roundId: latestRound.id },
            actionLabel: 'Record dispatch',
          }
        : { tone: 'waiting', title: 'Waiting for the sample to be sent', detail: 'The manufacturer has the request.' }
    case 'SAMPLE_SENT':
      return latestRound && !latestRound.receivedOn
        ? {
            tone: 'action',
            title: 'Confirm the client received the sample',
            detail: `Round ${latestRound.roundNo} left on ${latestRound.dispatchedOn ?? '—'}. Record the date ${client} received it to start their evaluation.`,
            action: { kind: 'receipt', roundId: latestRound.id },
            actionLabel: 'Record receipt',
          }
        : { tone: 'waiting', title: 'Sample on its way', detail: 'Waiting for the client to confirm receipt.' }
    case 'UNDER_EVALUATION':
      if (latestRound?.outcome === 'PASS') {
        return {
          tone: 'action',
          title: 'Sample passed: record the approval',
          detail: `${client}'s QC passed round ${latestRound.roundNo}. Record the approval date and reference to open ordering.`,
          action: { kind: 'approve' },
          actionLabel: 'Record approval',
        }
      }
      if (latestRound?.outcome === 'FAIL') {
        return {
          tone: 'action',
          title: 'Sample failed: try again or close',
          detail: `Round ${latestRound.roundNo} failed. Raise another round, or reject the engagement from Change stage.`,
          action: { kind: 'sample' },
          actionLabel: 'Raise another round',
        }
      }
      return {
        tone: 'action',
        title: "Record the client's evaluation result",
        detail: `${client} is evaluating round ${latestRound?.roundNo ?? 1}. Chase their QC and record pass or fail when they answer.`,
        ...(latestRound ? { action: { kind: 'outcome' as const, roundId: latestRound.id }, actionLabel: 'Record outcome' } : {}),
      }
    case 'APPROVED':
      return {
        tone: 'action',
        title: 'Approved: record the first client order',
        detail: `${client} has approved this source${e.approvedOn ? ` on ${e.approvedOn}` : ''}. Their order and the indent on the manufacturer turn this into commercial supply.`,
        action: { kind: 'link', href: orderHref, label: 'Record client order' },
        actionLabel: 'Record client order',
      }
    case 'COMMERCIAL':
      return commercialStep(db, e, orderHref)
  }
}

/**
 * What a requirement needs next: a source, a choice of sources, or progress on
 * the engagements already opened. The requirement's own status is still set
 * by hand; this reads the records around it.
 */
export function requirementNextStep(db: Database, r: Requirement): NextStep {
  const engagements = db.requirementEngagements
    .filter((l) => l.requirementId === r.id)
    .map((l) => db.engagements.find((e) => e.id === l.engagementId))
    .filter((e): e is Engagement => Boolean(e))
  const product = productName(db, r.productId)

  if (r.status === 'CANCELLED' || r.status === 'CLOSED_LOST') {
    return { tone: 'closed', title: 'Closed', detail: 'This requirement is no longer being pursued.' }
  }

  if (engagements.length === 0) {
    const candidates = matchingSources(db, r)
    if (candidates.length > 0) {
      return {
        tone: 'action',
        title: 'Choose which sources to offer',
        detail: `${candidates.length} represented ${candidates.length === 1 ? 'source makes' : 'sources make'} ${product}${r.requiredPharmacopoeia ? ` to ${r.requiredPharmacopoeia}` : ''}. Tick one or more below and open an engagement for each; the client may approve one, some or none.`,
      }
    }
    const gap = sourcingGap(db, r.productId, r.requiredPharmacopoeia) ?? 'NO_SOURCE'
    return {
      tone: 'action',
      title: 'Find a source',
      detail: `${SOURCING_GAP_COPY[gap].label}. ${SOURCING_GAP_COPY[gap].detail}`,
      action:
        gap === 'NO_SOURCE'
          ? { kind: 'link', href: '/manufacturers/new', label: 'Register a manufacturer' }
          : { kind: 'link', href: `/products/${r.productId}`, label: 'Review the known sources' },
      actionLabel: gap === 'NO_SOURCE' ? 'Register a manufacturer' : 'Review the known sources',
    }
  }

  const live = engagements.filter((e) => !['REJECTED', 'DISCONTINUED'].includes(e.stage))
  const best = furthestStage(engagements.map((e) => e.stage))
  if (live.length === 0) {
    return {
      tone: 'action',
      title: 'Every source so far has been closed',
      detail: 'Open another candidate below, reopen one of the engagements, or close the requirement as lost.',
    }
  }
  if (best === 'COMMERCIAL') {
    return {
      tone: 'done',
      title: 'Answered: supplying commercially',
      detail: `${companyName(db, r.clientCompanyId)} is buying ${product} through TCL. Follow the trade on the engagement.`,
    }
  }
  if (best === 'APPROVED') {
    return {
      tone: 'action',
      title: 'Approved: waiting for the first order',
      detail: 'The client has approved a source. Their first order turns this into commercial supply.',
    }
  }
  return {
    tone: 'waiting',
    title: `${live.length} ${live.length === 1 ? 'engagement' : 'engagements'} in progress`,
    detail: 'Each engagement below shows its own next step. Open one to record offers, samples and approval.',
  }
}

function commercialStep(db: Database, e: Engagement, orderHref: string): NextStep {
  const deal = dealProgress(db, e)
  if (deal.orders.length === 0) {
    return {
      tone: 'done',
      title: 'Supplying commercially',
      detail: 'No client order for this source is recorded in the system yet. Record one when the client reorders.',
      action: { kind: 'link', href: orderHref, label: 'Record client order' },
      actionLabel: 'Record client order',
    }
  }
  const unindented = deal.lineStatuses.find((s) => s.unindentedQty > 1e-6)
  if (unindented) {
    return {
      tone: 'action',
      title: 'Place the indent on the manufacturer',
      detail: `${unindented.coNumber} still has ${round(unindented.unindentedQty)} ${unindented.uom} with no indent behind it.`,
      action: { kind: 'link', href: `/client-orders/${unindented.orderId}?raise=1`, label: 'Raise indent' },
      actionLabel: 'Raise indent',
    }
  }
  const noLc = deal.indents.find((i) => !i.lcNumber && i.status !== 'COMPLETED')
  if (noLc) {
    return {
      tone: 'action',
      title: "Record the client's letter of credit",
      detail: `${noLc.indentNumber} has no LC on record. The client opens it in the manufacturer's favour before shipment.`,
      action: { kind: 'link', href: `/indents/${noLc.id}`, label: 'Open indent' },
      actionLabel: 'Open indent',
    }
  }
  const unshipped = deal.indents.find((i) => !deal.shipments.some((s) => s.indentId === i.id))
  if (unshipped) {
    return {
      tone: 'action',
      title: 'Record the shipment',
      detail: `${unshipped.indentNumber} has no shipment yet. Add it once the manufacturer confirms dispatch.`,
      action: { kind: 'link', href: `/indents/${unshipped.id}`, label: 'Open indent' },
      actionLabel: 'Open indent',
    }
  }
  const held = deal.shipments.find((s) => s.status === 'HELD_AT_CUSTOMS')
  if (held) {
    return {
      tone: 'action',
      title: 'Shipment held at customs',
      detail: `${held.shipmentRef}: ${held.holdRemark ?? 'held'}. Follow up with the C&F agent and record clearance.`,
      action: { kind: 'link', href: `/shipments/${held.id}`, label: 'Open shipment' },
      actionLabel: 'Open shipment',
    }
  }
  const moving = deal.shipments.find((s) => ['PLANNED', 'IN_TRANSIT', 'ARRIVED'].includes(s.status))
  if (moving) {
    return {
      tone: 'waiting',
      title: 'Goods on the way',
      detail: `${moving.shipmentRef} is ${moving.status.toLowerCase().replace(/_/g, ' ')}${moving.eta ? `, ETA ${moving.eta}` : ''}. Record arrival and clearance as they happen.`,
      action: { kind: 'link', href: `/shipments/${moving.id}`, label: 'Track shipment' },
      actionLabel: 'Track shipment',
    }
  }
  const undelivered = deal.shipments.find((s) => s.status === 'CLEARED')
  if (undelivered) {
    return {
      tone: 'action',
      title: 'Record the delivery',
      detail: `${undelivered.shipmentRef} is cleared. Record what reached the client, with their GRN.`,
      action: { kind: 'link', href: `/shipments/${undelivered.id}`, label: 'Open shipment' },
      actionLabel: 'Open shipment',
    }
  }
  const tbd = deal.commissions.find((c) => c.basis === 'TBD')
  if (tbd) {
    return {
      tone: 'action',
      title: 'Agree the commission',
      detail: 'The goods are delivered but the commission terms are still to be decided.',
      action: { kind: 'link', href: `/indents/${tbd.indentId}`, label: 'Open indent' },
      actionLabel: 'Open indent',
    }
  }
  const uninvoiced = deal.commissions.find((c) => c.status === 'PENDING')
  if (uninvoiced) {
    return {
      tone: 'action',
      title: 'Invoice the commission',
      detail: 'Delivery is complete. Invoice the client for TCL\u2019s commission.',
      action: { kind: 'link', href: `/commissions?client=${e.clientCompanyId}`, label: 'Open commission' },
      actionLabel: 'Open commission',
    }
  }
  const awaiting = deal.commissions.find((c) => c.status === 'INVOICED' || c.status === 'PARTIALLY_RECEIVED')
  if (awaiting) {
    return {
      tone: 'waiting',
      title: 'Waiting for the commission payment',
      detail: `Invoiced${awaiting.invoicedOn ? ` on ${awaiting.invoicedOn}` : ''}. Record the receipt when the client pays.`,
      action: { kind: 'link', href: `/commissions?client=${e.clientCompanyId}`, label: 'Open commission' },
      actionLabel: 'Open commission',
    }
  }
  return {
    tone: 'done',
    title: 'Complete: delivered and paid',
    detail: 'Everything on record is delivered and the commission is received. Record a new order when the client reorders.',
    action: { kind: 'link', href: orderHref, label: 'Record client order' },
    actionLabel: 'Record client order',
  }
}

// ------------------------------------------- v_client_order_line_status

export interface OrderLineStatus {
  lineId: ID
  lineNo: number
  orderId: ID
  coNumber: string
  clientId: ID
  clientName: string
  productId: ID
  productName: string
  mpId: ID
  sourceName: string
  orderedQty: number
  indentedQty: number
  shippedQty: number
  clearedQty: number
  deliveredQty: number
  unindentedQty: number
  unshippedQty: number
  undeliveredQty: number
  uom: string
  overrideReason: string | null
}

export function orderLineStatuses(db: Database, filter: { orderId?: ID; clientId?: ID } = {}): OrderLineStatus[] {
  const out: OrderLineStatus[] = []
  for (const line of db.clientOrderLines) {
    const order = db.clientOrders.find((o) => o.id === line.clientOrderId)
    if (!order) continue
    if (filter.orderId && order.id !== filter.orderId) continue
    if (filter.clientId && order.clientCompanyId !== filter.clientId) continue

    const mp = db.manufacturerProducts.find((m) => m.id === line.manufacturerProductId)
    const links = db.orderIndentLinks.filter((l) => l.clientOrderLineId === line.id)

    let indented = 0
    for (const l of links) indented += safeConvert(l.linkedQty, l.qtyUom, line.qtyUom)

    let shipped = 0
    let cleared = 0
    for (const l of links) {
      const sls = db.shipmentLines.filter((sl) => sl.indentLineId === l.indentLineId)
      for (const sl of sls) {
        const shipment = db.shipments.find((s) => s.id === sl.shipmentId)
        if (!shipment || shipment.status === 'CANCELLED') continue
        const q = safeConvert(sl.qty, sl.qtyUom, line.qtyUom)
        shipped += q
        if (shipment.customsClearedOn) cleared += q
      }
    }

    let delivered = 0
    for (const d of db.deliveries.filter((x) => x.clientOrderLineId === line.id)) {
      delivered += safeConvert(d.deliveredQty, d.qtyUom, line.qtyUom)
    }

    out.push({
      lineId: line.id,
      lineNo: line.lineNo,
      orderId: order.id,
      coNumber: order.coNumber,
      clientId: order.clientCompanyId,
      clientName: companyName(db, order.clientCompanyId),
      productId: line.productId,
      productName: productName(db, line.productId),
      mpId: line.manufacturerProductId,
      sourceName: mp ? companyName(db, mp.manufacturerCompanyId) : '—',
      orderedQty: line.qty,
      indentedQty: round(indented),
      shippedQty: round(shipped),
      clearedQty: round(cleared),
      deliveredQty: round(delivered),
      unindentedQty: round(line.qty - indented),
      unshippedQty: round(line.qty - shipped),
      undeliveredQty: round(line.qty - delivered),
      uom: line.qtyUom,
      overrideReason: line.overrideReason,
    })
  }
  return out.sort((a, b) => a.lineNo - b.lineNo)
}

export function indentValue(db: Database, indentId: ID): number {
  return db.indentLines
    .filter((l) => l.indentId === indentId)
    .reduce((sum, l) => sum + l.qty * l.unitPrice, 0)
}

/** Every client order an indent serves (normally exactly one). */
export function ordersForIndent(db: Database, indentId: ID): ID[] {
  const lineIds = db.indentLines.filter((l) => l.indentId === indentId).map((l) => l.id)
  const orderLineIds = db.orderIndentLinks
    .filter((l) => lineIds.includes(l.indentLineId))
    .map((l) => l.clientOrderLineId)
  const orderIds = new Set(
    db.clientOrderLines.filter((l) => orderLineIds.includes(l.id)).map((l) => l.clientOrderId),
  )
  return [...orderIds]
}

export function indentsForOrder(db: Database, orderId: ID): Indent[] {
  const lineIds = db.clientOrderLines.filter((l) => l.clientOrderId === orderId).map((l) => l.id)
  const indentLineIds = db.orderIndentLinks
    .filter((l) => lineIds.includes(l.clientOrderLineId))
    .map((l) => l.indentLineId)
  const indentIds = new Set(db.indentLines.filter((l) => indentLineIds.includes(l.id)).map((l) => l.indentId))
  return db.indents.filter((i) => indentIds.has(i.id))
}

// --------------------------------------------------- v_commission_book

export interface CommissionRow {
  commission: Commission
  indent: Indent
  clientName: string
  manufacturerName: string
  indentValue: number
  outstanding: number
}

export function commissionRows(db: Database, filter: { status?: Commission['status']; clientId?: ID } = {}): CommissionRow[] {
  const out: CommissionRow[] = []
  for (const c of db.commissions) {
    const indent = db.indents.find((i) => i.id === c.indentId)
    if (!indent) continue
    if (filter.status && c.status !== filter.status) continue
    if (filter.clientId && indent.clientCompanyId !== filter.clientId) continue
    out.push({
      commission: c,
      indent,
      clientName: companyName(db, indent.clientCompanyId),
      manufacturerName: companyName(db, indent.manufacturerCompanyId),
      indentValue: round(indentValue(db, indent.id)),
      outstanding: round((c.amount ?? 0) - c.receivedAmount),
    })
  }
  return out
}

export interface CommissionTotals {
  earned: number
  invoiced: number
  received: number
  outstanding: number
  pendingCount: number
  tbdCount: number
}

export function commissionTotals(db: Database): CommissionTotals {
  let earned = 0
  let invoiced = 0
  let received = 0
  let pendingCount = 0
  let tbdCount = 0
  for (const c of db.commissions) {
    if (c.status === 'WRITTEN_OFF') continue
    earned += c.amount ?? 0
    if (c.invoicedOn) invoiced += c.amount ?? 0
    received += c.receivedAmount
    if (c.status === 'PENDING') pendingCount++
    if (c.basis === 'TBD') tbdCount++
  }
  return {
    earned: round(earned),
    invoiced: round(invoiced),
    received: round(received),
    outstanding: round(earned - received),
    pendingCount,
    tbdCount,
  }
}

type Money = { amount: number; currency: string }

/** The same four figures as `commissionTotals`, kept per currency so unlike amounts are never added. */
export function commissionMoney(db: Database): { earned: Money[]; invoiced: Money[]; received: Money[]; outstanding: Money[] } {
  const live = db.commissions.filter((c) => c.status !== 'WRITTEN_OFF')
  return {
    earned: live.map((c) => ({ amount: c.amount ?? 0, currency: c.currency })),
    invoiced: live.filter((c) => c.invoicedOn).map((c) => ({ amount: c.amount ?? 0, currency: c.currency })),
    received: live.map((c) => ({ amount: c.receivedAmount, currency: c.currency })),
    outstanding: live.map((c) => ({ amount: (c.amount ?? 0) - c.receivedAmount, currency: c.currency })),
  }
}

/**
 * The month a commission counts as earned: when it was invoiced, or the month
 * of the indent while it is still pending. One rule for every screen.
 */
export function commissionEarnedOn(c: Commission, indent: Pick<Indent, 'orderDate'> | undefined): string | null {
  return c.invoicedOn ?? indent?.orderDate ?? null
}

// ------------------------------------------- fn_development_register

export interface RegisterRow {
  requirementId: ID
  kind: RequirementKind
  enquiryDate: string
  clientName: string
  productName: string
  engagementId: ID | null
  manufacturerName: string | null
  stageAtPeriodEnd: EngagementStage | null
  approvedOn: string | null
  firstCommercialOn: string | null
  ownerName: string
}

/**
 * One row per requirement × source, as the SQL function returns. Totals count
 * requirements, not rows — see `registerTotals`.
 */
export function developmentRegister(db: Database, from: string, to: string): RegisterRow[] {
  const out: RegisterRow[] = []
  for (const r of db.requirements) {
    if (r.enquiryDate < from || r.enquiryDate > to) continue
    const links = db.requirementEngagements.filter((l) => l.requirementId === r.id)
    const base = {
      requirementId: r.id,
      kind: r.kind,
      enquiryDate: r.enquiryDate,
      clientName: companyName(db, r.clientCompanyId),
      productName: productName(db, r.productId),
      ownerName: userName(db, r.ownerUserId),
    }
    if (links.length === 0) {
      out.push({
        ...base,
        engagementId: null,
        manufacturerName: null,
        stageAtPeriodEnd: null,
        approvedOn: null,
        firstCommercialOn: null,
      })
      continue
    }
    for (const link of links) {
      const e = db.engagements.find((x) => x.id === link.engagementId)
      if (!e) continue
      out.push({
        ...base,
        engagementId: e.id,
        manufacturerName: companyName(db, e.manufacturerCompanyId),
        stageAtPeriodEnd: stageAt(db, e.id, to),
        approvedOn: e.approvedOn && e.approvedOn <= to ? e.approvedOn : null,
        firstCommercialOn: e.firstCommercialOn && e.firstCommercialOn <= to ? e.firstCommercialOn : null,
      })
    }
  }
  return out.sort((a, b) => a.kind.localeCompare(b.kind) || a.clientName.localeCompare(b.clientName))
}

/** The stage an engagement was at on a given date, read from history. */
export function stageAt(db: Database, engagementId: ID, on: string): EngagementStage | null {
  const history = db.stageHistory
    .filter((h) => h.engagementId === engagementId && h.changedAt.slice(0, 10) <= on)
    .sort((a, b) => (a.changedAt < b.changedAt ? 1 : -1))
  return history[0]?.toStage ?? null
}

export function registerTotals(rows: RegisterRow[]) {
  const ids = new Map<RequirementKind, Set<ID>>()
  for (const r of rows) {
    const set = ids.get(r.kind) ?? new Set<ID>()
    set.add(r.requirementId)
    ids.set(r.kind, set)
  }
  return {
    requirements: new Set(rows.map((r) => r.requirementId)).size,
    rows: rows.length,
    newDevelopment: ids.get('NEW_DEVELOPMENT')?.size ?? 0,
    alternateSource: ids.get('ALTERNATE_SOURCE')?.size ?? 0,
  }
}

// ----------------------------------------------------------- documents

export interface DocumentRow {
  document: DocumentRecord
  parentLabel: string
  parentHref: string | null
  daysRemaining: number | null
  state: 'valid' | 'expiring' | 'expired' | 'not-expiring' | 'superseded'
}

export function documentRows(
  db: Database,
  filter: { entityType?: string; entityId?: ID; typeCode?: string; expiringOnly?: boolean } = {},
): DocumentRow[] {
  const warnDays = 90
  const out: DocumentRow[] = []
  for (const d of db.documents) {
    if (!d.isActive) continue
    if (filter.entityType && d.entityType !== filter.entityType) continue
    if (filter.entityId && d.entityId !== filter.entityId) continue
    if (filter.typeCode && d.typeCode !== filter.typeCode) continue

    const superseded = Boolean(d.supersededById)
    const days = d.expiresOn ? differenceInCalendarDays(parseISO(d.expiresOn), new Date()) : null
    const state: DocumentRow['state'] = superseded
      ? 'superseded'
      : days == null
        ? 'not-expiring'
        : days < 0
          ? 'expired'
          : days <= warnDays
            ? 'expiring'
            : 'valid'
    if (filter.expiringOnly && !(state === 'expiring' || state === 'expired')) continue

    out.push({
      document: d,
      ...describeParent(db, d),
      daysRemaining: days,
      state,
    })
  }
  return out.sort((a, b) => (a.daysRemaining ?? 99999) - (b.daysRemaining ?? 99999))
}

function describeParent(db: Database, d: DocumentRecord): { parentLabel: string; parentHref: string | null } {
  switch (d.entityType) {
    case 'COMPANY': {
      const c = db.companies.find((x) => x.id === d.entityId)
      return {
        parentLabel: c?.displayName ?? '—',
        parentHref: c ? (c.kind === 'CLIENT' ? `/clients/${c.id}` : `/manufacturers/${c.id}`) : null,
      }
    }
    case 'COMPANY_SITE': {
      const s = db.sites.find((x) => x.id === d.entityId)
      const c = s ? db.companies.find((x) => x.id === s.companyId) : undefined
      return {
        parentLabel: s ? `${c?.displayName ?? ''} — ${s.name}` : '—',
        parentHref: c ? `/manufacturers/${c.id}` : null,
      }
    }
    case 'MANUFACTURER_PRODUCT': {
      const mp = db.manufacturerProducts.find((x) => x.id === d.entityId)
      const p = mp ? db.products.find((x) => x.id === mp.productId) : undefined
      const c = mp ? db.companies.find((x) => x.id === mp.manufacturerCompanyId) : undefined
      return {
        parentLabel: mp ? `${p?.genericName ?? ''} — ${c?.displayName ?? ''}` : '—',
        parentHref: mp ? `/sources/${mp.id}` : null,
      }
    }
    case 'BATCH': {
      const b = db.batches.find((x) => x.id === d.entityId)
      return { parentLabel: b ? `Batch ${b.batchNumber}` : '—', parentHref: b ? `/batches/${b.id}` : null }
    }
    case 'ENGAGEMENT': {
      const e = db.engagements.find((x) => x.id === d.entityId)
      return {
        parentLabel: e ? `${companyName(db, e.clientCompanyId)} — ${productName(db, e.productId)}` : '—',
        parentHref: e ? `/engagements/${e.id}` : null,
      }
    }
    case 'INDENT': {
      const i = db.indents.find((x) => x.id === d.entityId)
      return { parentLabel: i?.indentNumber ?? '—', parentHref: i ? `/indents/${i.id}` : null }
    }
    case 'CLIENT_ORDER': {
      const o = db.clientOrders.find((x) => x.id === d.entityId)
      return { parentLabel: o?.coNumber ?? '—', parentHref: o ? `/client-orders/${o.id}` : null }
    }
    default:
      return { parentLabel: d.entityType, parentHref: null }
  }
}

/** Plant certificates reach the sources made at that plant (AC-15). */
export function certificatesForSource(db: Database, mp: ManufacturerProduct): DocumentRow[] {
  const own = documentRows(db, { entityType: 'MANUFACTURER_PRODUCT', entityId: mp.id })
  const site = mp.siteId ? documentRows(db, { entityType: 'COMPANY_SITE', entityId: mp.siteId }) : []
  return [...own, ...site]
}

// ------------------------------------------------------------- batches

export interface BatchRow {
  batch: Batch
  productName: string
  manufacturerName: string
  shipmentCount: number
  totalQty: number
  uom: string
  clientNames: string[]
  deliveredQty: number
  state: 'valid' | 'expiring' | 'expired'
}

export function batchRows(db: Database, filter: { mpId?: ID } = {}): BatchRow[] {
  const out: BatchRow[] = []
  for (const b of db.batches) {
    if (filter.mpId && b.manufacturerProductId !== filter.mpId) continue
    const mp = db.manufacturerProducts.find((m) => m.id === b.manufacturerProductId)
    const lines = db.shipmentLines.filter((l) => l.batchId === b.id)
    const uom = lines[0]?.qtyUom ?? mp?.moqUom ?? 'KG'
    let total = 0
    for (const l of lines) total += safeConvert(l.qty, l.qtyUom, uom)

    const clientIds = new Set<ID>()
    let delivered = 0
    for (const l of lines) {
      for (const d of db.deliveries.filter((x) => x.shipmentLineId === l.id)) {
        delivered += safeConvert(d.deliveredQty, d.qtyUom, uom)
        const ol = db.clientOrderLines.find((x) => x.id === d.clientOrderLineId)
        const order = ol ? db.clientOrders.find((o) => o.id === ol.clientOrderId) : undefined
        if (order) clientIds.add(order.clientCompanyId)
      }
      const indent = db.indents.find((i) => i.id === l.indentId)
      if (indent) clientIds.add(indent.clientCompanyId)
    }

    const days = b.expiryDate ? differenceInCalendarDays(parseISO(b.expiryDate), new Date()) : null
    out.push({
      batch: b,
      productName: mp ? productName(db, mp.productId) : '—',
      manufacturerName: mp ? companyName(db, mp.manufacturerCompanyId) : '—',
      shipmentCount: new Set(lines.map((l) => l.shipmentId)).size,
      totalQty: round(total),
      uom,
      clientNames: [...clientIds].map((id) => companyName(db, id)),
      deliveredQty: round(delivered),
      state: days == null ? 'valid' : days < 0 ? 'expired' : days < 365 ? 'expiring' : 'valid',
    })
  }
  return out
}

// ------------------------------------------------------- dashboard sets

export interface DashboardData {
  pipelineByStage: { stage: EngagementStage; count: number }[]
  overdueFollowUps: EngagementRow[]
  samplesAwaiting: EngagementRow[]
  approvedNotOrdered: EngagementRow[]
  unsourced: RequirementRow[]
  shipmentsInTransit: number
  shipmentsHeld: number
  lcsExpiring: Indent[]
  documentsExpiring: DocumentRow[]
  commission: CommissionTotals
  deliveriesDue: number
}

export function dashboard(db: Database, ownerId?: ID): DashboardData {
  const scope = ownerId ? { ownerId } : {}
  const rows = engagementRows(db, scope)

  const pipelineByStage = (
    ['IDENTIFIED', 'OFFERED', 'SAMPLE_REQUESTED', 'SAMPLE_SENT', 'UNDER_EVALUATION', 'APPROVED', 'COMMERCIAL'] as EngagementStage[]
  ).map((stage) => ({ stage, count: rows.filter((r) => r.stage === stage).length }))

  const orderedEngagementIds = new Set(
    db.clientOrderLines.map((l) => l.engagementId).filter(Boolean) as ID[],
  )

  return {
    pipelineByStage,
    overdueFollowUps: rows
      .filter((r) => r.isAgeing && ['OFFERED', 'SAMPLE_SENT', 'UNDER_EVALUATION'].includes(r.stage))
      .sort((a, b) => b.daysInStage - a.daysInStage),
    samplesAwaiting: rows
      .filter((r) => r.stage === 'UNDER_EVALUATION' || r.stage === 'SAMPLE_SENT')
      .sort((a, b) => b.daysInStage - a.daysInStage),
    approvedNotOrdered: rows
      .filter((r) => r.stage === 'APPROVED' && !orderedEngagementIds.has(r.engagement.id))
      .sort((a, b) => b.daysInStage - a.daysInStage),
    unsourced: requirementRows(db, { unsourcedOnly: true, openOnly: true })
      .filter((r) => (ownerId ? r.requirement.ownerUserId === ownerId : true))
      .sort((a, b) => b.daysOpen - a.daysOpen),
    shipmentsInTransit: db.shipments.filter((s) => s.status === 'IN_TRANSIT' || s.status === 'PLANNED').length,
    shipmentsHeld: db.shipments.filter((s) => s.status === 'HELD_AT_CUSTOMS').length,
    lcsExpiring: db.indents
      .filter((i) => i.lcExpiryDate && differenceInCalendarDays(parseISO(i.lcExpiryDate), new Date()) <= 45)
      .sort((a, b) => (a.lcExpiryDate! < b.lcExpiryDate! ? -1 : 1)),
    documentsExpiring: documentRows(db, { expiringOnly: true }),
    commission: commissionTotals(db),
    deliveriesDue: db.shipments.filter((s) => s.status === 'CLEARED').length,
  }
}

// ------------------------------------------------------- needs attention

export interface AttentionItem {
  id: ID
  label: string
  sublabel: string
  href: string
  meta?: string
}

export interface AttentionGroup {
  key: 'feedback' | 'approve' | 'order' | 'match' | 'customs' | 'eta' | 'deliver' | 'lc' | 'commission'
  area: 'Sourcing' | 'Trade' | 'Commission'
  title: string
  why: string
  tone: 'danger' | 'warn' | 'accent'
  seeAll?: string
  items: AttentionItem[]
}

/**
 * Everything someone should act on today, grouped by what the action is.
 * Each item opens the record where the action is taken. Empty groups are
 * left out, so the list is only as long as the work.
 */
export function attentionGroups(db: Database, ownerId?: ID): AttentionGroup[] {
  const mine = (e: Engagement) => !ownerId || e.ownerUserId === ownerId
  const eng = (id: ID) => db.engagements.find((e) => e.id === id)
  const dealLabel = (e: Engagement) => `${companyName(db, e.clientCompanyId)} · ${productName(db, e.productId)}`
  const fromLabel = (e: Engagement) => `from ${companyName(db, e.manufacturerCompanyId)}`
  const groups: AttentionGroup[] = []
  const evalThreshold = stageConfig('UNDER_EVALUATION').ageingThresholdDays

  // samples with no client feedback past the evaluation threshold
  const quiet = db.samples
    .filter((s) => s.outcome === 'PENDING' && s.dispatchedOn && daysSince(s.dispatchedOn) > evalThreshold)
    .map((s) => ({ s, e: eng(s.engagementId) }))
    .filter((x): x is { s: typeof x.s; e: Engagement } => Boolean(x.e) && mine(x.e!) && !['REJECTED', 'DISCONTINUED'].includes(x.e!.stage))
    .sort((a, b) => (a.s.dispatchedOn! < b.s.dispatchedOn! ? -1 : 1))
  if (quiet.length) {
    groups.push({
      key: 'feedback',
      area: 'Sourcing',
      title: `${quiet.length} ${quiet.length === 1 ? 'sample has' : 'samples have'} had no client feedback for over ${evalThreshold} days`,
      why: "Chase the client's QC for a result.",
      tone: 'warn',
      seeAll: '/samples?overdue=1',
      items: quiet.map(({ s, e }) => ({
        id: s.id,
        label: dealLabel(e),
        sublabel: `round ${s.roundNo} ${fromLabel(e)}`,
        href: `/engagements/${e.id}?tab=work`,
        meta: `${daysSince(s.dispatchedOn!)}d`,
      })),
    })
  }

  // a passed sample, approval not yet recorded
  const passed = db.engagements.filter(
    (e) =>
      mine(e) &&
      e.stage === 'UNDER_EVALUATION' &&
      db.samples.filter((s) => s.engagementId === e.id).sort((a, b) => b.roundNo - a.roundNo)[0]?.outcome === 'PASS',
  )
  if (passed.length) {
    groups.push({
      key: 'approve',
      area: 'Sourcing',
      title: `${passed.length} passed ${passed.length === 1 ? 'sample is' : 'samples are'} waiting for the approval to be recorded`,
      why: "Record the client's approval to open ordering.",
      tone: 'accent',
      items: passed.map((e) => ({ id: e.id, label: dealLabel(e), sublabel: fromLabel(e), href: `/engagements/${e.id}` })),
    })
  }

  // approved but never ordered
  const ordered = new Set(db.clientOrderLines.map((l) => l.engagementId).filter(Boolean) as ID[])
  const idle = db.engagements
    .filter((e) => mine(e) && e.stage === 'APPROVED' && !ordered.has(e.id))
    .sort((a, b) => ((a.approvedOn ?? '') < (b.approvedOn ?? '') ? -1 : 1))
  if (idle.length) {
    groups.push({
      key: 'order',
      area: 'Sourcing',
      title: `${idle.length} approved ${idle.length === 1 ? 'source has' : 'sources have'} no order yet`,
      why: 'Approval won, revenue not yet. Follow up for the first order.',
      tone: 'accent',
      seeAll: '/engagements?stage=APPROVED',
      items: idle.map((e) => ({
        id: e.id,
        label: dealLabel(e),
        sublabel: fromLabel(e),
        href: `/engagements/${e.id}`,
        meta: e.approvedOn ? `${daysSince(e.approvedOn)}d` : undefined,
      })),
    })
  }

  // requirements with candidate sources but nothing opened
  const unmatched = db.requirements
    .filter((r) => (!ownerId || r.ownerUserId === ownerId) && ['OPEN', 'SOURCING'].includes(r.status))
    .filter((r) => !db.requirementEngagements.some((l) => l.requirementId === r.id))
    .filter((r) => matchingSources(db, r).length > 0)
    .sort((a, b) => (a.enquiryDate < b.enquiryDate ? -1 : 1))
  if (unmatched.length) {
    groups.push({
      key: 'match',
      area: 'Sourcing',
      title: `${unmatched.length} ${unmatched.length === 1 ? 'requirement has' : 'requirements have'} a source available but nothing offered`,
      why: 'Pick the sources to offer and open engagements.',
      tone: 'accent',
      seeAll: '/requirements?status=OPEN',
      items: unmatched.map((r) => ({
        id: r.id,
        label: `${companyName(db, r.clientCompanyId)} · ${productName(db, r.productId)}`,
        sublabel: `asked ${r.enquiryDate}`,
        href: `/requirements/${r.id}`,
        meta: `${daysSince(r.enquiryDate)}d`,
      })),
    })
  }

  if (!ownerId) {
    const shipLabel = (s: Shipment) => {
      const indent = db.indents.find((i) => i.id === s.indentId)
      return indent ? `${companyName(db, indent.clientCompanyId)} · from ${companyName(db, indent.manufacturerCompanyId)}` : ''
    }
    const held = db.shipments.filter((s) => s.status === 'HELD_AT_CUSTOMS')
    if (held.length) {
      groups.push({
        key: 'customs',
        area: 'Trade',
        title: `${held.length} ${held.length === 1 ? 'shipment is' : 'shipments are'} held at customs`,
        why: 'Follow up with the C&F agent and record the clearance.',
        tone: 'danger',
        seeAll: '/shipments?status=HELD_AT_CUSTOMS',
        items: held.map((s) => ({ id: s.id, label: s.shipmentRef, sublabel: s.holdRemark ?? shipLabel(s), href: `/shipments/${s.id}` })),
      })
    }
    const now = today()
    const late = db.shipments.filter(
      (s) => s.eta && s.eta < now && !s.actualArrivalDate && (s.status === 'PLANNED' || s.status === 'IN_TRANSIT'),
    )
    if (late.length) {
      groups.push({
        key: 'eta',
        area: 'Trade',
        title: `${late.length} ${late.length === 1 ? 'shipment is' : 'shipments are'} past ETA with no arrival recorded`,
        why: 'Confirm with the forwarder and update the shipment.',
        tone: 'warn',
        seeAll: '/shipments',
        items: late.map((s) => ({ id: s.id, label: s.shipmentRef, sublabel: shipLabel(s), href: `/shipments/${s.id}`, meta: `ETA ${s.eta}` })),
      })
    }
    const cleared = db.shipments.filter((s) => s.status === 'CLEARED')
    if (cleared.length) {
      groups.push({
        key: 'deliver',
        area: 'Trade',
        title: `${cleared.length} cleared ${cleared.length === 1 ? 'shipment is' : 'shipments are'} awaiting delivery`,
        why: "Record what reached the client's factory, with their GRN.",
        tone: 'accent',
        seeAll: '/shipments?status=CLEARED',
        items: cleared.map((s) => ({ id: s.id, label: s.shipmentRef, sublabel: shipLabel(s), href: `/shipments/${s.id}` })),
      })
    }
    const lcs = db.indents.filter((i) => {
      if (!i.lcExpiryDate || i.status === 'COMPLETED' || i.status === 'CANCELLED') return false
      return differenceInCalendarDays(parseISO(i.lcExpiryDate), new Date()) <= 45
    })
    if (lcs.length) {
      groups.push({
        key: 'lc',
        area: 'Trade',
        title: `${lcs.length} ${lcs.length === 1 ? 'letter of credit expires' : 'letters of credit expire'} within 45 days or already has`,
        why: 'Ask the client to extend the LC before the manufacturer ships.',
        tone: 'warn',
        seeAll: '/indents?lc=expiring',
        items: lcs.map((i) => ({
          id: i.id,
          label: i.indentNumber,
          sublabel: `${companyName(db, i.clientCompanyId)} · on ${companyName(db, i.manufacturerCompanyId)}`,
          href: `/indents/${i.id}`,
          meta: i.lcExpiryDate ?? undefined,
        })),
      })
    }
    const toAgree = db.commissions.filter((c) => c.basis === 'TBD' && c.status === 'PENDING')
    const toInvoice = db.commissions.filter((c) => c.basis !== 'TBD' && c.status === 'PENDING' && c.amount != null)
    if (toAgree.length + toInvoice.length) {
      const items = [...toInvoice, ...toAgree].map((c) => {
        const indent = db.indents.find((i) => i.id === c.indentId)
        return {
          id: c.id,
          label: indent?.indentNumber ?? 'Indent',
          sublabel: `${indent ? companyName(db, indent.clientCompanyId) : ''} · ${c.basis === 'TBD' ? 'terms to agree' : 'ready to invoice'}`,
          href: `/indents/${c.indentId}`,
          meta: c.amount != null ? `${c.currency} ${Math.round(c.amount).toLocaleString('en-US')}` : undefined,
        }
      })
      groups.push({
        key: 'commission',
        area: 'Commission',
        title: `${toInvoice.length} ${toInvoice.length === 1 ? 'commission is' : 'commissions are'} ready to invoice, ${toAgree.length} still need terms`,
        why: "TCL's only revenue. Agree the terms, then invoice the client.",
        tone: 'accent',
        seeAll: '/commissions?status=PENDING',
        items,
      })
    }
  }

  return groups
}

// --------------------------------------------------------- demo stories

export interface ResolvedStory {
  key: string
  title: string
  subtitle: string
  point: string
  href: string
  stage: EngagementStage | null
}

/** The presentation route, resolved against whatever the data holds now. */
export function demoStories(db: Database): ResolvedStory[] {
  const byName = (name: string) => db.companies.find((c) => c.displayName === name)
  const out: ResolvedStory[] = []
  for (const s of DEMO_STORIES) {
    const client = byName(s.client)
    const product = db.products.find((p) => p.genericName === s.product)
    if (!client || !product) continue
    if (!s.manufacturer) {
      const req = db.requirements
        .filter((r) => r.clientCompanyId === client.id && r.productId === product.id)
        .sort((a, b) => (a.enquiryDate < b.enquiryDate ? 1 : -1))[0]
      if (!req) continue
      out.push({
        key: s.key,
        title: s.title,
        subtitle: `${client.displayName} · ${product.genericName}`,
        point: s.point,
        href: `/requirements/${req.id}`,
        stage: null,
      })
      continue
    }
    const mfr = byName(s.manufacturer)
    const e = db.engagements.find(
      (x) => x.clientCompanyId === client.id && x.productId === product.id && x.manufacturerCompanyId === mfr?.id,
    )
    if (!e) continue
    out.push({
      key: s.key,
      title: s.title,
      subtitle: `${client.displayName} · ${product.genericName} from ${s.manufacturer}`,
      point: s.point,
      href: `/engagements/${e.id}`,
      stage: e.stage,
    })
  }
  return out
}

// ---------------------------------------------------------------- search

export interface SearchHit {
  kind: 'product' | 'client' | 'manufacturer' | 'contact' | 'order' | 'indent' | 'batch'
  id: ID
  label: string
  sublabel: string
  href: string
  matchedOn?: string
}

/** Synonym-aware global search (FR-M9-05). */
export function search(db: Database, term: string, limit = 24): SearchHit[] {
  const q = term.trim().toLowerCase()
  if (q.length < 2) return []
  const hits: SearchHit[] = []

  for (const p of db.products) {
    const nameHit = p.genericName.toLowerCase().includes(q)
    const synonym = p.synonyms.find((s) => s.toLowerCase().includes(q))
    const casHit = p.casNumber?.includes(q)
    if (nameHit || synonym || casHit) {
      hits.push({
        kind: 'product',
        id: p.id,
        label: p.genericName,
        sublabel: `${p.category}${p.casNumber ? ` · CAS ${p.casNumber}` : ''}`,
        href: `/products/${p.id}`,
        matchedOn: !nameHit && synonym ? `synonym “${synonym}”` : !nameHit && casHit ? 'CAS number' : undefined,
      })
    }
  }
  for (const c of db.companies) {
    if (c.displayName.toLowerCase().includes(q) || c.legalName.toLowerCase().includes(q)) {
      const isClient = c.kind === 'CLIENT' || c.kind === 'BOTH'
      hits.push({
        kind: isClient ? 'client' : 'manufacturer',
        id: c.id,
        label: c.displayName,
        sublabel: c.legalName,
        href: isClient ? `/clients/${c.id}` : `/manufacturers/${c.id}`,
      })
    }
  }
  for (const ct of db.contacts) {
    if (ct.fullName.toLowerCase().includes(q) || ct.email?.toLowerCase().includes(q)) {
      const c = db.companies.find((x) => x.id === ct.companyId)
      const isClient = c?.kind === 'CLIENT'
      hits.push({
        kind: 'contact',
        id: ct.id,
        label: ct.fullName,
        sublabel: `${ct.designation ?? 'Contact'} · ${c?.displayName ?? ''}`,
        href: c ? (isClient ? `/clients/${c.id}?tab=contacts` : `/manufacturers/${c.id}?tab=contacts`) : '/',
      })
    }
  }
  for (const o of db.clientOrders) {
    if (o.coNumber.toLowerCase().includes(q) || o.clientReference?.toLowerCase().includes(q)) {
      hits.push({
        kind: 'order',
        id: o.id,
        label: o.coNumber,
        sublabel: `Client order · ${companyName(db, o.clientCompanyId)}`,
        href: `/client-orders/${o.id}`,
      })
    }
  }
  for (const i of db.indents) {
    if (i.indentNumber.toLowerCase().includes(q) || i.lcNumber?.toLowerCase().includes(q)) {
      hits.push({
        kind: 'indent',
        id: i.id,
        label: i.indentNumber,
        sublabel: `Indent · ${companyName(db, i.manufacturerCompanyId)} for ${companyName(db, i.clientCompanyId)}`,
        href: `/indents/${i.id}`,
      })
    }
  }
  for (const b of db.batches) {
    if (b.batchNumber.toLowerCase().includes(q)) {
      const mp = db.manufacturerProducts.find((m) => m.id === b.manufacturerProductId)
      hits.push({
        kind: 'batch',
        id: b.id,
        label: b.batchNumber,
        sublabel: `Batch · ${mp ? productName(db, mp.productId) : ''}`,
        href: `/batches/${b.id}`,
      })
    }
  }

  return hits.slice(0, limit)
}

// --------------------------------------------------------------- helpers

export function daysSince(iso: string): number {
  return Math.max(0, differenceInCalendarDays(new Date(), parseISO(iso)))
}

function safeConvert(qty: number, from: string, to: string): number {
  try {
    return convertQty(qty, from, to)
  } catch {
    return qty
  }
}

const round = (n: number) => Math.round(n * 10000) / 10000
