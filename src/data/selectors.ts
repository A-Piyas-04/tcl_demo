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
import { fmtDate } from '@/lib/utils'
import { convertQty, stageConfig } from './reference'
import { deriveTradeStatuses, today } from './rules'
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

// --------------------------------------------- trade status (derive only)

/**
 * The status each order, indent and shipment WOULD have, given what has shipped
 * and been delivered. Returned as Maps of id → status so the result can never be
 * `Object.assign`ed back onto the Database — which is exactly how the old bug
 * (a derived status silently overwriting a person's) happened. The stored status
 * stays authoritative and typed; this is a read-only second opinion, for display
 * and for `statusDisagreements`.
 */
export function tradeStatusView(db: Database): {
  shipments: Map<ID, string>
  clientOrders: Map<ID, string>
  clientOrderLines: Map<ID, string>
  indents: Map<ID, string>
  indentLines: Map<ID, string>
} {
  const d = deriveTradeStatuses(db)
  const toMap = <T extends { id: ID; status: string }>(rows: T[]) => {
    const m = new Map<ID, string>()
    for (const r of rows) m.set(r.id, r.status)
    return m
  }
  return {
    shipments: toMap(d.shipments),
    clientOrders: toMap(d.clientOrders),
    clientOrderLines: toMap(d.clientOrderLines),
    indents: toMap(d.indents),
    indentLines: toMap(d.indentLines),
  }
}

export interface StatusDisagreement {
  kind: 'Client order' | 'Indent' | 'Shipment'
  id: ID
  label: string
  stored: string
  derived: string
  href: string
}

/** Every row whose recorded status differs from what the quantities imply. */
export function statusDisagreements(db: Database): StatusDisagreement[] {
  const view = tradeStatusView(db)
  const out: StatusDisagreement[] = []
  for (const o of db.clientOrders) {
    const derived = view.clientOrders.get(o.id)
    if (derived && derived !== o.status) {
      out.push({ kind: 'Client order', id: o.id, label: o.coNumber, stored: o.status, derived, href: `/client-orders/${o.id}` })
    }
  }
  for (const i of db.indents) {
    const derived = view.indents.get(i.id)
    if (derived && derived !== i.status) {
      out.push({ kind: 'Indent', id: i.id, label: i.indentNumber, stored: i.status, derived, href: `/indents/${i.id}` })
    }
  }
  for (const s of db.shipments) {
    const derived = view.shipments.get(s.id)
    if (derived && derived !== s.status) {
      out.push({ kind: 'Shipment', id: s.id, label: s.shipmentRef, stored: s.status, derived, href: `/shipments/${s.id}` })
    }
  }
  return out
}

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
    detail: 'No manufacturer in the register makes this molecule.',
  },
  NOT_REPRESENTED: {
    label: 'Source exists, not represented',
    tone: 'warn',
    detail: 'The register holds a manufacturer for this molecule that TCL does not represent.',
  },
  PHARMACOPOEIA: {
    label: 'Wrong pharmacopoeia',
    tone: 'accent',
    detail: 'TCL represents a source for this molecule, but not to the standard the client named.',
  },
  SOURCE_UNAVAILABLE: {
    label: 'Source blocked',
    tone: 'warn',
    detail: 'Every known source is discontinued, or its manufacturer is inactive or blacklisted.',
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
 * The date the first offer was recorded on an engagement, derived from the
 * earliest offer rather than stored — so it can never drift from the record.
 */
export function firstOfferedOn(db: Database, engagementId: ID): string | null {
  const dates = db.offers.filter((o) => o.engagementId === engagementId).map((o) => o.offerDate)
  return dates.length ? dates.reduce((a, b) => (a < b ? a : b)) : null
}

/** The date the first sample was requested, derived from the earliest round. */
export function firstSampleOn(db: Database, engagementId: ID): string | null {
  const dates = db.samples.filter((s) => s.engagementId === engagementId).map((s) => s.requestedOn)
  return dates.length ? dates.reduce((a, b) => (a < b ? a : b)) : null
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

// ------------------------------------------------------------ record state

export interface RecordSummary {
  recorded: string[]
  missing: string[]
}

/**
 * What is and is not recorded on this engagement, as plain statements of fact.
 * It reads the same records the old next-step engine read, but it never tells
 * anyone what to do: two lists, no tone, no verbs, no buttons. The dialogs that
 * record each thing are reached from the stage control and the work tabs.
 */
export function recordState(db: Database, e: Engagement): RecordSummary {
  const recorded: string[] = []
  const missing: string[] = []
  const offers = db.offers.filter((o) => o.engagementId === e.id).sort((a, b) => b.versionNo - a.versionNo)
  const rounds = db.samples.filter((s) => s.engagementId === e.id).sort((a, b) => b.roundNo - a.roundNo)
  const latestOffer = offers[0]
  const latestRound = rounds[0]

  if (latestOffer) {
    const answer =
      latestOffer.status === 'ACCEPTED'
        ? ', accepted'
        : latestOffer.status === 'DECLINED'
          ? ', declined'
          : latestOffer.status === 'EXPIRED'
            ? ', expired'
            : ''
    recorded.push(`Offer v${latestOffer.versionNo}, ${fmtDate(latestOffer.offerDate)}${answer}`)
  } else {
    missing.push('No offer')
  }

  if (latestRound) {
    recorded.push(`Sample round ${latestRound.roundNo} requested ${fmtDate(latestRound.requestedOn)}`)
    if (latestRound.dispatchedOn) recorded.push(`Sample dispatched ${fmtDate(latestRound.dispatchedOn)}`)
    if (latestRound.receivedOn) recorded.push(`Sample received ${fmtDate(latestRound.receivedOn)}`)
    if (latestRound.outcome === 'PASS')
      recorded.push(`Round ${latestRound.roundNo} passed${latestRound.outcomeOn ? ` ${fmtDate(latestRound.outcomeOn)}` : ''}`)
    else if (latestRound.outcome === 'FAIL')
      recorded.push(`Round ${latestRound.roundNo} failed${latestRound.outcomeOn ? ` ${fmtDate(latestRound.outcomeOn)}` : ''}`)
    else missing.push('No evaluation result')
  } else {
    missing.push('No sample round')
  }

  if (e.approvedOn) recorded.push(`Approved ${fmtDate(e.approvedOn)}${e.approvalReference ? `, ref ${e.approvalReference}` : ''}`)
  else missing.push('No approval')

  const orderLines = db.clientOrderLines.filter((l) => l.engagementId === e.id)
  if (orderLines.length) recorded.push(`${pluralCount(orderLines.length, 'client order line')} recorded`)
  else missing.push('No client order')

  if (e.firstCommercialOn) recorded.push(`Commercial since ${fmtDate(e.firstCommercialOn)}`)

  if (e.stage === 'REJECTED') recorded.push('Recorded as rejected')
  else if (e.stage === 'DISCONTINUED') recorded.push('Recorded as discontinued')
  else if (e.stage === 'ON_HOLD')
    recorded.push(`On hold${e.stageBeforeHold ? ` from ${e.stageBeforeHold.toLowerCase().replace(/_/g, ' ')}` : ''}`)

  return { recorded, missing }
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
  key: 'feedback' | 'approve' | 'order' | 'match' | 'customs' | 'eta' | 'deliver' | 'lc' | 'commission' | 'status'
  area: 'Sourcing' | 'Trade' | 'Commission'
  title: string
  note: string
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
      note: 'No result has been recorded since the sample was dispatched.',
      tone: 'warn',
      seeAll: '/samples?overdue=1',
      items: quiet.map(({ s, e }) => ({
        id: s.id,
        label: dealLabel(e),
        sublabel: `round ${s.roundNo} ${fromLabel(e)}`,
        href: `/engagements/${e.id}?tab=work`,
        meta: `${daysSince(s.dispatchedOn!)} days`,
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
      note: 'The latest round is recorded as passed. No approval is recorded.',
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
      note: 'Approved on the record. No client order is recorded against the source.',
      tone: 'accent',
      seeAll: '/engagements?stage=APPROVED',
      items: idle.map((e) => ({
        id: e.id,
        label: dealLabel(e),
        sublabel: fromLabel(e),
        href: `/engagements/${e.id}`,
        meta: e.approvedOn ? `${daysSince(e.approvedOn)} days` : undefined,
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
      title: `${unmatched.length} ${unmatched.length === 1 ? 'requirement has' : 'requirements have'} a represented source in the register and no offer recorded`,
      note: 'The register holds a represented source for the molecule. No offer is recorded.',
      tone: 'accent',
      seeAll: '/requirements?status=OPEN',
      items: unmatched.map((r) => ({
        id: r.id,
        label: `${companyName(db, r.clientCompanyId)} · ${productName(db, r.productId)}`,
        sublabel: `asked ${fmtDate(r.enquiryDate)}`,
        href: `/requirements/${r.id}`,
        meta: `${daysSince(r.enquiryDate)} days`,
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
        note: 'Recorded as held at customs. No clearance is recorded.',
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
        note: 'The ETA on record has passed. No arrival is recorded.',
        tone: 'warn',
        seeAll: '/shipments',
        items: late.map((s) => ({ id: s.id, label: s.shipmentRef, sublabel: shipLabel(s), href: `/shipments/${s.id}`, meta: `ETA ${fmtDate(s.eta)}` })),
      })
    }
    const cleared = db.shipments.filter((s) => s.status === 'CLEARED')
    if (cleared.length) {
      groups.push({
        key: 'deliver',
        area: 'Trade',
        title: `${cleared.length} cleared ${cleared.length === 1 ? 'shipment is' : 'shipments are'} awaiting delivery`,
        note: 'Recorded as cleared. No delivery is recorded.',
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
        title: `${lcs.length} ${lcs.length === 1 ? 'letter of credit expires' : 'letters of credit expire'} within 45 days, or ${lcs.length === 1 ? 'has' : 'have'} already expired`,
        note: 'The LC expiry on record falls within 45 days, or has passed.',
        tone: 'warn',
        seeAll: '/indents?lc=expiring',
        items: lcs.map((i) => ({
          id: i.id,
          label: i.indentNumber,
          sublabel: `${companyName(db, i.clientCompanyId)} · on ${companyName(db, i.manufacturerCompanyId)}`,
          href: `/indents/${i.id}`,
          meta: i.lcExpiryDate ? fmtDate(i.lcExpiryDate) : undefined,
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
        note: 'No invoice is recorded; some have no agreed basis on record.',
        tone: 'accent',
        seeAll: '/commissions?status=PENDING',
        items,
      })
    }
  }

  // rows whose recorded status no longer matches what the quantities imply —
  // surfaced, not silently overwritten, so a person decides
  const disagree = statusDisagreements(db)
  if (disagree.length) {
    groups.push({
      key: 'status',
      area: 'Trade',
      title: `${disagree.length} ${disagree.length === 1 ? 'record has' : 'records have'} a status that no longer matches the quantities`,
      note: 'The recorded status differs from what has shipped and been delivered. Update it if it is out of date.',
      tone: 'accent',
      items: disagree.map((d) => ({
        id: d.id,
        label: `${d.kind} ${d.label}`,
        sublabel: `recorded ${d.stored.toLowerCase().replace(/_/g, ' ')}, quantities imply ${d.derived.toLowerCase().replace(/_/g, ' ')}`,
        href: d.href,
      })),
    })
  }

  return groups
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
