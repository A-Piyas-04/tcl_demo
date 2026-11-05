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
import type {
  Batch,
  Commission,
  Company,
  CompanySite,
  Database,
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
      .sort((a, b) => b.daysInStage - a.daysInStage)
      .slice(0, 8),
    samplesAwaiting: rows
      .filter((r) => r.stage === 'UNDER_EVALUATION' || r.stage === 'SAMPLE_SENT')
      .sort((a, b) => b.daysInStage - a.daysInStage)
      .slice(0, 8),
    approvedNotOrdered: rows
      .filter((r) => r.stage === 'APPROVED' && !orderedEngagementIds.has(r.engagement.id))
      .sort((a, b) => b.daysInStage - a.daysInStage),
    unsourced: requirementRows(db, { unsourcedOnly: true, openOnly: true, ...(ownerId ? {} : {}) })
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
