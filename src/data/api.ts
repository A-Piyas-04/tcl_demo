/**
 * The data access layer the screens talk to.
 *
 * Every call is asynchronous and adds a little latency, so loading and skeleton
 * states are real rather than decorative. Because screens only ever call this
 * module, replacing it with HTTP calls to a real server is a change here and
 * nowhere else.
 *
 * Writes are refused for a View Only session the same way the server would
 * refuse them, and every write leaves an audit entry.
 */

import { store, newId, useStore } from './store'
import { checkLastFullAccess, checkStageChange, deriveTradeStatuses, stageNeedsRecord, today } from './rules'
import { stageConfig } from './reference'
void stageConfig
import type {
  Activity,
  AuditAction,
  Batch,
  ClientOrder,
  ClientOrderLine,
  Commission,
  Company,
  CompanyContact,
  CompanySite,
  Database,
  Delivery,
  DocumentRecord,
  Engagement,
  EngagementStage,
  ID,
  Indent,
  IndentLine,
  ManufacturerProduct,
  MpFiling,
  MpPrice,
  Offer,
  OrderIndentLink,
  PortfolioItem,
  Product,
  Requirement,
  RoleCode,
  SampleRound,
  SavedFilter,
  Shipment,
  ShipmentLine,
  User,
} from './types'

// ------------------------------------------------------------------ errors

/** Thrown when a business rule refuses the change. The message is shown as-is. */
export class RuleError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'RuleError'
  }
}

/** Thrown when a View Only session attempts a write: the server's 403. */
export class ForbiddenError extends Error {
  constructor(what: string) {
    super(`Not permitted: ${what} needs Full Access. This session is View Only.`)
    this.name = 'ForbiddenError'
  }
}

// ----------------------------------------------------------------- latency

const LATENCY: Record<string, [number, number]> = {
  off: [0, 0],
  realistic: [280, 620],
  slow: [900, 1600],
}

export function delay(kind: 'read' | 'write' = 'read'): Promise<void> {
  const mode = store.get().presenter.latency
  const [lo, hi] = LATENCY[mode] ?? LATENCY.realistic!
  if (hi === 0) return Promise.resolve()
  const base = lo + Math.random() * (hi - lo)
  return new Promise((r) => setTimeout(r, kind === 'write' ? base * 0.8 : base))
}

// -------------------------------------------------------------- primitives

function requireWrite(what: string) {
  if (!store.canWrite()) throw new ForbiddenError(what)
}

function audit(action: AuditAction, tableName: string, recordId: ID, recordLabel: string, changedFields?: Record<string, { old: unknown; new: unknown }>) {
  useStore.getState().pushAudit({
    userId: store.currentUserId(),
    action,
    tableName,
    recordId,
    recordLabel,
    changedFields: changedFields ?? null,
  })
}

function security(
  eventType: 'EXPORT' | 'CROSS_CLIENT_VIEW' | 'PERMISSION_DENIED',
  detail: string,
  rowCount: number | null = null,
) {
  useStore.getState().pushSecurity({ eventType, userId: store.currentUserId(), detail, rowCount })
}

const write = (fn: (db: Database) => void) => useStore.getState().mutate(fn)

/** A write that moves goods: order, indent and shipment statuses follow from it. */
const writeTrade = (fn: (db: Database) => void) =>
  write((db) => {
    fn(db)
    Object.assign(db, deriveTradeStatuses(db))
  })

const nowIso = () => new Date().toISOString()

// ------------------------------------------------------------------ reads
// Reads are thin: the heavy lifting is in `selectors.ts`, which works off the
// store synchronously. These exist so a screen can show a loading state.

export async function load<T>(produce: () => T): Promise<T> {
  await delay('read')
  return produce()
}

/** FR-M9-09: the cross-client view is open to both roles, and always logged. */
export async function loadCrossClient(productId: ID, fromClientId: ID): Promise<void> {
  await delay('read')
  const db = store.db()
  const product = db.products.find((p) => p.id === productId)
  const client = db.companies.find((c) => c.id === fromClientId)
  security(
    'CROSS_CLIENT_VIEW',
    `Viewed other clients taking ${product?.genericName ?? productId}, from ${client?.displayName ?? fromClientId}`,
  )
}

/** NFR-SE-10: every export is logged with the filters and the row count. */
export async function logExport(screen: string, filters: string, rowCount: number): Promise<void> {
  await delay('read')
  security('EXPORT', `Exported ${screen}${filters ? ` (filters: ${filters})` : ''}`, rowCount)
}

// --------------------------------------------------------------- products

export async function createProduct(input: Omit<Product, 'id' | 'createdAt' | 'updatedAt' | 'isActive' | 'possibleDuplicate'> & { possibleDuplicate?: boolean }): Promise<Product> {
  requireWrite('creating a product')
  await delay('write')
  const product: Product = {
    ...input,
    id: newId('prd'),
    isActive: true,
    possibleDuplicate: input.possibleDuplicate ?? false,
    createdAt: nowIso(),
    updatedAt: nowIso(),
  }
  write((db) => {
    db.products = [product, ...db.products]
  })
  audit('INSERT', 'product', product.id, product.genericName)
  return product
}

export async function updateProduct(id: ID, patch: Partial<Product>): Promise<Product> {
  requireWrite('editing a product')
  await delay('write')
  const before = store.db().products.find((p) => p.id === id)
  if (!before) throw new RuleError('That product no longer exists.')
  const after = { ...before, ...patch, updatedAt: nowIso() }
  write((db) => {
    db.products = db.products.map((p) => (p.id === id ? after : p))
  })
  audit('UPDATE', 'product', id, after.genericName, diff(before, patch))
  return after
}

export async function archiveProduct(id: ID): Promise<void> {
  requireWrite('archiving a product')
  await delay('write')
  const p = store.db().products.find((x) => x.id === id)
  if (!p) return
  write((db) => {
    db.products = db.products.map((x) => (x.id === id ? { ...x, isActive: false, updatedAt: nowIso() } : x))
  })
  audit('UPDATE', 'product', id, p.genericName, { isActive: { old: true, new: false } })
}

export async function restoreProduct(id: ID): Promise<void> {
  requireWrite('restoring a product')
  await delay('write')
  const p = store.db().products.find((x) => x.id === id)
  if (!p) return
  write((db) => {
    db.products = db.products.map((x) => (x.id === id ? { ...x, isActive: true, updatedAt: nowIso() } : x))
  })
  audit('UPDATE', 'product', id, p.genericName, { isActive: { old: false, new: true } })
}

// -------------------------------------------------------------- companies

export async function createCompany(input: Omit<Company, 'id' | 'createdAt' | 'updatedAt' | 'isActive'>): Promise<Company> {
  requireWrite(`creating a ${input.kind === 'CLIENT' ? 'client' : 'manufacturer'}`)
  await delay('write')
  const company: Company = { ...input, id: newId('cmp'), isActive: true, createdAt: nowIso(), updatedAt: nowIso() }
  write((db) => {
    db.companies = [company, ...db.companies]
  })
  audit('INSERT', 'company', company.id, company.displayName)
  return company
}

export async function updateCompany(id: ID, patch: Partial<Company>): Promise<Company> {
  requireWrite('editing a company')
  await delay('write')
  const before = store.db().companies.find((c) => c.id === id)
  if (!before) throw new RuleError('That company no longer exists.')
  const after = { ...before, ...patch, updatedAt: nowIso() }
  write((db) => {
    db.companies = db.companies.map((c) => (c.id === id ? after : c))
  })
  audit('UPDATE', 'company', id, after.displayName, diff(before, patch))
  return after
}

export async function setManufacturerStatus(
  id: ID,
  toStatus: Company['manufacturer'] extends infer _ ? NonNullable<Company['manufacturer']>['status'] : never,
  remark: string,
): Promise<void> {
  requireWrite('changing a manufacturer status')
  await delay('write')
  const company = store.db().companies.find((c) => c.id === id)
  if (!company?.manufacturer) throw new RuleError('That manufacturer no longer exists.')
  if (toStatus === 'BLACKLISTED' && !remark.trim()) {
    throw new RuleError('Blacklisting a manufacturer needs a recorded reason.')
  }
  const from = company.manufacturer.status
  write((db) => {
    db.companies = db.companies.map((c) =>
      c.id === id && c.manufacturer
        ? {
            ...c,
            updatedAt: nowIso(),
            manufacturer: {
              ...c.manufacturer,
              status: toStatus,
              blacklistReason: toStatus === 'BLACKLISTED' ? remark : c.manufacturer.blacklistReason,
              blacklistedOn: toStatus === 'BLACKLISTED' ? today() : c.manufacturer.blacklistedOn,
            },
          }
        : c,
    )
    db.statusChanges = [
      {
        id: newId('msh'),
        companyId: id,
        fromStatus: from,
        toStatus,
        changedAt: nowIso(),
        changedByUserId: store.currentUserId(),
        remark: remark || null,
      } as Database['statusChanges'][number],
      ...db.statusChanges,
    ]
  })
  audit('UPDATE', 'company', id, company.displayName, { status: { old: from, new: toStatus } })
}

export async function archiveCompany(id: ID): Promise<void> {
  requireWrite('deactivating a company')
  await delay('write')
  const c = store.db().companies.find((x) => x.id === id)
  if (!c) return
  write((db) => {
    db.companies = db.companies.map((x) => (x.id === id ? { ...x, isActive: false, updatedAt: nowIso() } : x))
  })
  audit('UPDATE', 'company', id, c.displayName, { isActive: { old: true, new: false } })
}

export async function createSite(input: Omit<CompanySite, 'id' | 'isActive'>): Promise<CompanySite> {
  requireWrite('adding a site')
  await delay('write')
  const site: CompanySite = { ...input, id: newId('sit'), isActive: true }
  write((db) => {
    db.sites = [...db.sites, site]
  })
  audit('INSERT', 'company_site', site.id, site.name)
  return site
}

export async function updateSite(id: ID, patch: Partial<CompanySite>): Promise<void> {
  requireWrite('editing a site')
  await delay('write')
  const before = store.db().sites.find((s) => s.id === id)
  if (!before) return
  write((db) => {
    db.sites = db.sites.map((s) => (s.id === id ? { ...s, ...patch } : s))
  })
  audit('UPDATE', 'company_site', id, before.name, diff(before, patch))
}

export async function createContact(input: Omit<CompanyContact, 'id' | 'isActive'>): Promise<CompanyContact> {
  requireWrite('adding a contact')
  await delay('write')
  const contact: CompanyContact = { ...input, id: newId('con'), isActive: true }
  write((db) => {
    // only one primary contact per company
    db.contacts = [
      ...db.contacts.map((c) =>
        contact.isPrimary && c.companyId === contact.companyId ? { ...c, isPrimary: false } : c,
      ),
      contact,
    ]
  })
  audit('INSERT', 'company_contact', contact.id, contact.fullName)
  return contact
}

export async function updateContact(id: ID, patch: Partial<CompanyContact>): Promise<void> {
  requireWrite('editing a contact')
  await delay('write')
  const before = store.db().contacts.find((c) => c.id === id)
  if (!before) return
  write((db) => {
    db.contacts = db.contacts.map((c) =>
      c.id === id
        ? { ...c, ...patch }
        : patch.isPrimary && c.companyId === before.companyId
          ? { ...c, isPrimary: false }
          : c,
    )
  })
  audit('UPDATE', 'company_contact', id, before.fullName, diff(before, patch))
}

// --------------------------------------------------- manufacturer-products

export async function createManufacturerProduct(
  input: Omit<ManufacturerProduct, 'id' | 'createdAt' | 'updatedAt'>,
): Promise<ManufacturerProduct> {
  requireWrite('linking a product to a manufacturer')
  await delay('write')
  const db = store.db()
  const clash = db.manufacturerProducts.find(
    (m) =>
      m.manufacturerCompanyId === input.manufacturerCompanyId &&
      m.productId === input.productId &&
      m.grade.toLowerCase() === input.grade.toLowerCase() &&
      m.pharmacopoeia === input.pharmacopoeia &&
      (m.siteId ?? null) === (input.siteId ?? null),
  )
  if (clash) {
    throw new RuleError('This manufacturer already has that product at the same grade, pharmacopoeia and plant.')
  }
  const mp: ManufacturerProduct = { ...input, id: newId('mpr'), createdAt: nowIso(), updatedAt: nowIso() }
  write((db2) => {
    db2.manufacturerProducts = [mp, ...db2.manufacturerProducts]
  })
  const product = db.products.find((p) => p.id === mp.productId)
  audit('INSERT', 'manufacturer_product', mp.id, `${product?.genericName ?? '?'} — ${mp.grade} ${mp.pharmacopoeia}`)
  return mp
}

export async function updateManufacturerProduct(id: ID, patch: Partial<ManufacturerProduct>): Promise<void> {
  requireWrite('editing a source')
  await delay('write')
  const before = store.db().manufacturerProducts.find((m) => m.id === id)
  if (!before) return
  write((db) => {
    db.manufacturerProducts = db.manufacturerProducts.map((m) =>
      m.id === id ? { ...m, ...patch, updatedAt: nowIso() } : m,
    )
  })
  audit('UPDATE', 'manufacturer_product', id, `${before.grade} ${before.pharmacopoeia}`, diff(before, patch))
}

export async function addFiling(input: Omit<MpFiling, 'id' | 'isActive'>): Promise<MpFiling> {
  requireWrite('recording a regulatory filing')
  await delay('write')
  const filing: MpFiling = { ...input, id: newId('fil'), isActive: true }
  write((db) => {
    db.filings = [...db.filings, filing]
  })
  audit('INSERT', 'manufacturer_product_filing', filing.id, `${filing.kind} ${filing.referenceNumber}`)
  return filing
}

export async function removeFiling(id: ID): Promise<void> {
  requireWrite('removing a regulatory filing')
  await delay('write')
  const f = store.db().filings.find((x) => x.id === id)
  if (!f) return
  write((db) => {
    db.filings = db.filings.map((x) => (x.id === id ? { ...x, isActive: false } : x))
  })
  audit('UPDATE', 'manufacturer_product_filing', id, `${f.kind} ${f.referenceNumber}`, {
    isActive: { old: true, new: false },
  })
}

/** FR-M4-05 / AC-03: a blacklisted or inactive manufacturer cannot be represented. */
export async function setPortfolio(mpId: ID, inPortfolio: boolean, representation: PortfolioItem['representation'] = 'INDENT'): Promise<void> {
  requireWrite('changing the portfolio')
  await delay('write')
  const db = store.db()
  const mp = db.manufacturerProducts.find((m) => m.id === mpId)
  if (!mp) throw new RuleError('That source no longer exists.')
  const company = db.companies.find((c) => c.id === mp.manufacturerCompanyId)
  const status = company?.manufacturer?.status
  if (inPortfolio && (status === 'BLACKLISTED' || status === 'INACTIVE')) {
    throw new RuleError(
      `${company?.displayName} is ${status === 'BLACKLISTED' ? 'blacklisted' : 'inactive'}, so its products cannot be taken into the portfolio.`,
    )
  }
  if (inPortfolio && mp.status === 'DISCONTINUED') {
    throw new RuleError('This source is discontinued, so it cannot be taken into the portfolio.')
  }
  const existing = db.portfolio.find((p) => p.manufacturerProductId === mpId && p.isActive)
  if (inPortfolio && existing) return
  write((db2) => {
    if (inPortfolio) {
      db2.portfolio = [
        ...db2.portfolio,
        {
          id: newId('pfi'),
          manufacturerProductId: mpId,
          representation,
          startedOn: today(),
          endedOn: null,
          isActive: true,
          remarks: null,
        },
      ]
    } else {
      db2.portfolio = db2.portfolio.map((p) =>
        p.manufacturerProductId === mpId && p.isActive ? { ...p, isActive: false, endedOn: today() } : p,
      )
    }
  })
  audit('UPDATE', 'portfolio_item', mpId, 'Portfolio', { inPortfolio: { old: !inPortfolio, new: inPortfolio } })
}

/** AC-03: overlapping validity for the same source, incoterm and tier is refused. */
export async function addPrice(input: Omit<MpPrice, 'id' | 'createdAt'>): Promise<MpPrice> {
  requireWrite('recording a price')
  await delay('write')
  const db = store.db()
  const overlap = db.prices.find(
    (p) =>
      p.manufacturerProductId === input.manufacturerProductId &&
      p.incoterm === input.incoterm &&
      p.minQty === input.minQty &&
      p.validFrom <= input.validTo &&
      p.validTo >= input.validFrom,
  )
  if (overlap) {
    throw new RuleError(
      `A price for this source, ${input.incoterm} at tier ${input.minQty} already covers ${overlap.validFrom} to ${overlap.validTo}. End-date it first, or change the dates.`,
    )
  }
  if (input.validTo < input.validFrom) throw new RuleError('The "valid to" date cannot be before "valid from".')
  const price: MpPrice = { ...input, id: newId('prc'), createdAt: nowIso() }
  write((db2) => {
    db2.prices = [...db2.prices, price]
  })
  audit('INSERT', 'manufacturer_product_price', price.id, `${price.price} ${price.currency}/${price.perUom} ${price.incoterm}`)
  return price
}

/** Prices are never overwritten: superseding means end-dating the old row. */
export async function endDatePrice(id: ID, endOn: string): Promise<void> {
  requireWrite('end-dating a price')
  await delay('write')
  const before = store.db().prices.find((p) => p.id === id)
  if (!before) return
  if (endOn < before.validFrom) throw new RuleError('A price cannot end before it started.')
  write((db) => {
    db.prices = db.prices.map((p) => (p.id === id ? { ...p, validTo: endOn } : p))
  })
  audit('UPDATE', 'manufacturer_product_price', id, `${before.price} ${before.currency}`, {
    validTo: { old: before.validTo, new: endOn },
  })
}

// ------------------------------------------------------------ requirements

export async function createRequirement(
  input: Omit<Requirement, 'id' | 'createdAt' | 'updatedAt' | 'status'> & { status?: Requirement['status'] },
): Promise<Requirement> {
  requireWrite('recording a requirement')
  await delay('write')
  if (input.kind === 'ALTERNATE_SOURCE' && (!input.currentSourceNote || !input.alternateReason)) {
    throw new RuleError('An alternate-source requirement must name the current source and the reason for seeking another.')
  }
  const req: Requirement = {
    ...input,
    status: input.status ?? 'OPEN',
    id: newId('req'),
    createdAt: nowIso(),
    updatedAt: nowIso(),
  }
  write((db) => {
    db.requirements = [req, ...db.requirements]
  })
  const db = store.db()
  const client = db.companies.find((c) => c.id === req.clientCompanyId)
  const product = db.products.find((p) => p.id === req.productId)
  audit('INSERT', 'requirement', req.id, `${client?.displayName ?? '?'} — ${product?.genericName ?? '?'}`)
  return req
}

export async function updateRequirement(id: ID, patch: Partial<Requirement>): Promise<void> {
  requireWrite('editing a requirement')
  await delay('write')
  const before = store.db().requirements.find((r) => r.id === id)
  if (!before) return
  write((db) => {
    db.requirements = db.requirements.map((r) => (r.id === id ? { ...r, ...patch, updatedAt: nowIso() } : r))
  })
  audit('UPDATE', 'requirement', id, `Requirement ${id}`, diff(before, patch))
}

// ------------------------------------------------------------- engagements

/** UC-05: open engagements from a requirement, reusing any that already exist. */
export async function openEngagements(
  requirementId: ID,
  manufacturerProductIds: ID[],
): Promise<{ created: Engagement[]; reused: Engagement[] }> {
  requireWrite('opening an engagement')
  await delay('write')
  const db = store.db()
  const req = db.requirements.find((r) => r.id === requirementId)
  if (!req) throw new RuleError('That requirement no longer exists.')

  const created: Engagement[] = []
  const reused: Engagement[] = []

  for (const mpId of manufacturerProductIds) {
    const mp = db.manufacturerProducts.find((m) => m.id === mpId)
    if (!mp) continue
    const existing = db.engagements.find(
      (e) => e.clientCompanyId === req.clientCompanyId && e.manufacturerProductId === mpId,
    )
    if (existing) {
      reused.push(existing)
      continue
    }
    created.push({
      id: newId('eng'),
      clientCompanyId: req.clientCompanyId,
      manufacturerProductId: mpId,
      productId: mp.productId,
      manufacturerCompanyId: mp.manufacturerCompanyId,
      stage: 'IDENTIFIED',
      stageChangedAt: nowIso(),
      stageReasonCode: null,
      stageNote: null,
      stageBeforeHold: null,
      origin: 'PIPELINE',
      ownerUserId: req.ownerUserId,
      firstOfferedOn: null,
      firstSampleOn: null,
      approvedOn: null,
      approvalReference: null,
      approvalConditions: null,
      firstCommercialOn: null,
      isOverrideCreated: false,
      remarks: null,
      createdAt: nowIso(),
      updatedAt: nowIso(),
    })
  }

  write((db2) => {
    db2.engagements = [...created, ...db2.engagements]
    db2.stageHistory = [
      ...created.map((e) => ({
        id: newId('hst'),
        engagementId: e.id,
        fromStage: null,
        toStage: 'IDENTIFIED' as EngagementStage,
        changedAt: nowIso(),
        changedByUserId: store.currentUserId(),
        reasonCode: null,
        remark: 'Engagement created',
        isOverride: false,
        daysInPreviousStage: null,
      })),
      ...db2.stageHistory,
    ]
    db2.requirementEngagements = [
      ...db2.requirementEngagements,
      ...[...created, ...reused]
        .filter((e) => !db2.requirementEngagements.some((l) => l.requirementId === requirementId && l.engagementId === e.id))
        .map((e) => ({ requirementId, engagementId: e.id, linkedAt: nowIso() })),
    ]
    db2.requirements = db2.requirements.map((r) =>
      r.id === requirementId ? { ...r, status: 'ENGAGED' as const, updatedAt: nowIso() } : r,
    )
  })

  for (const e of created) {
    const product = db.products.find((p) => p.id === e.productId)
    const mfr = db.companies.find((c) => c.id === e.manufacturerCompanyId)
    audit('INSERT', 'engagement', e.id, `${product?.genericName ?? '?'} (${mfr?.displayName ?? '?'})`)
  }
  return { created, reused }
}

export interface StageChangeInput {
  reasonCode?: string | null
  note?: string | null
  /** the client's approval date, when moving to Approved */
  effectiveOn?: string | null
  /** the user has confirmed an override (sample before offer) */
  override?: boolean
  approvalReference?: string | null
  approvalConditions?: string | null
  /** set by the offer and sample calls, which create the record the stage stands for */
  fromRecord?: boolean
}

/** Mirrors change_engagement_stage(): the only way a stage ever changes. */
export async function changeStage(
  engagementId: ID,
  to: EngagementStage,
  input: StageChangeInput = {},
): Promise<Engagement> {
  requireWrite('changing an engagement stage')
  await delay('write')
  const db = store.db()
  const eng = db.engagements.find((e) => e.id === engagementId)
  if (!eng) throw new RuleError('That engagement no longer exists.')

  const check = checkStageChange(eng, to)
  if (!check.ok) throw new RuleError(check.error!)
  const needsRecord = stageNeedsRecord(eng, to)
  if (needsRecord && !input.fromRecord) throw new RuleError(needsRecord)
  if (check.requiresReason && !input.reasonCode) {
    throw new RuleError(`Moving to ${stageLabel(to)} needs a reason from the configured list.`)
  }
  if (check.requiresOverride && !input.override) {
    throw new RuleError('This step is out of order, so it needs an override with a recorded reason.')
  }
  if (check.requiresOverride && !input.note) {
    throw new RuleError('An override must carry a note explaining it.')
  }
  if (to === 'APPROVED' && input.effectiveOn && input.effectiveOn > today()) {
    throw new RuleError('The approval date cannot be in the future.')
  }

  const from = eng.stage
  const days = Math.max(0, Math.round((Date.now() - new Date(eng.stageChangedAt).getTime()) / 86400000))

  const after: Engagement = {
    ...eng,
    stage: to,
    stageChangedAt: nowIso(),
    stageReasonCode: input.reasonCode ?? null,
    stageNote: input.note ?? null,
    stageBeforeHold: to === 'ON_HOLD' ? from : null,
    firstOfferedOn: to === 'OFFERED' ? (eng.firstOfferedOn ?? today()) : eng.firstOfferedOn,
    firstSampleOn: to === 'SAMPLE_REQUESTED' ? (eng.firstSampleOn ?? today()) : eng.firstSampleOn,
    approvedOn:
      to === 'APPROVED' && from !== 'ON_HOLD'
        ? (input.effectiveOn ?? today())
        : to === 'REJECTED' || to === 'IDENTIFIED'
          ? null
          : eng.approvedOn,
    approvalReference: to === 'APPROVED' ? (input.approvalReference ?? eng.approvalReference) : eng.approvalReference,
    approvalConditions: to === 'APPROVED' ? (input.approvalConditions ?? eng.approvalConditions) : eng.approvalConditions,
    firstCommercialOn: to === 'COMMERCIAL' ? (eng.firstCommercialOn ?? today()) : eng.firstCommercialOn,
    updatedAt: nowIso(),
  }

  write((db2) => {
    db2.engagements = db2.engagements.map((e) => (e.id === engagementId ? after : e))
    db2.stageHistory = [
      {
        id: newId('hst'),
        engagementId,
        fromStage: from,
        toStage: to,
        changedAt: nowIso(),
        changedByUserId: store.currentUserId(),
        reasonCode: input.reasonCode ?? null,
        remark: input.note ?? null,
        isOverride: Boolean(input.override),
        daysInPreviousStage: days,
      },
      ...db2.stageHistory,
    ]
  })

  const product = db.products.find((p) => p.id === eng.productId)
  const client = db.companies.find((c) => c.id === eng.clientCompanyId)
  audit('UPDATE', 'engagement', engagementId, `${client?.displayName ?? '?'} — ${product?.genericName ?? '?'}`, {
    stage: { old: from, new: to },
  })
  return after
}

export async function updateEngagement(id: ID, patch: Partial<Engagement>): Promise<void> {
  requireWrite('editing an engagement')
  await delay('write')
  const before = store.db().engagements.find((e) => e.id === id)
  if (!before) return
  if ('stage' in patch) throw new RuleError('A stage is changed through the stage control, not by editing the record.')
  write((db) => {
    db.engagements = db.engagements.map((e) => (e.id === id ? { ...e, ...patch, updatedAt: nowIso() } : e))
  })
  audit('UPDATE', 'engagement', id, `Engagement ${id}`, diff(before, patch))
}

// ----------------------------------------------------------------- offers

export async function createOffer(
  input: Omit<Offer, 'id' | 'versionNo' | 'status' | 'createdAt' | 'createdByUserId'>,
): Promise<Offer> {
  requireWrite('creating an offer')
  await delay('write')
  const db = store.db()
  const eng = db.engagements.find((e) => e.id === input.engagementId)
  if (!eng) throw new RuleError('That engagement no longer exists.')
  if (input.validUntil < input.offerDate) throw new RuleError('The offer validity date cannot be before the offer date.')

  const existing = db.offers.filter((o) => o.engagementId === input.engagementId)
  const versionNo = existing.length + 1
  const offer: Offer = {
    ...input,
    id: newId('ofr'),
    versionNo,
    status: 'SENT',
    createdAt: nowIso(),
    createdByUserId: store.currentUserId() ?? '',
  }
  write((db2) => {
    db2.offers = [
      ...db2.offers.map((o) =>
        o.engagementId === input.engagementId && o.status !== 'SUPERSEDED' ? { ...o, status: 'SUPERSEDED' as const } : o,
      ),
      offer,
    ]
  })
  audit('INSERT', 'offer', offer.id, `Offer v${versionNo}: ${offer.offeredPrice} ${offer.currency}/${offer.perUom}`)

  // The first offer advances the engagement; a revision leaves the stage alone.
  if (eng.stage === 'IDENTIFIED') {
    await changeStage(input.engagementId, 'OFFERED', { note: `Offer v${versionNo} issued`, fromRecord: true })
  }
  return offer
}

/**
 * Records the client's answer to an offer. Accepting does not advance the
 * engagement on its own: the stage moves when the client asks for a sample or
 * the source is approved, so the two are kept separate.
 */
export async function setOfferStatus(
  id: ID,
  status: Extract<Offer['status'], 'ACCEPTED' | 'DECLINED' | 'EXPIRED'>,
  note?: string | null,
): Promise<void> {
  requireWrite('recording an offer outcome')
  await delay('write')
  const db = store.db()
  const offer = db.offers.find((o) => o.id === id)
  if (!offer) throw new RuleError('That offer no longer exists.')
  if (offer.status === 'SUPERSEDED') {
    throw new RuleError('This offer has been superseded by a later version. Record the answer against the current offer.')
  }
  write((db2) => {
    db2.offers = db2.offers.map((o) =>
      o.id === id ? { ...o, status, remarks: note ?? o.remarks } : o,
    )
  })
  audit('UPDATE', 'offer', id, `Offer v${offer.versionNo}`, { status: { old: offer.status, new: status } })
}

// ---------------------------------------------------------------- samples

export async function createSampleRound(
  input: Omit<SampleRound, 'id' | 'roundNo' | 'outcome' | 'outcomeOn' | 'outcomeByUserId' | 'rejectionReasonCode' | 'outcomeNotes' | 'dispatchedOn' | 'courierName' | 'trackingNumber' | 'batchNumber' | 'receivedOn'>,
  opts: { override?: boolean; overrideNote?: string } = {},
): Promise<SampleRound> {
  requireWrite('raising a sample request')
  await delay('write')
  const db = store.db()
  const eng = db.engagements.find((e) => e.id === input.engagementId)
  if (!eng) throw new RuleError('That engagement no longer exists.')

  const rounds = db.samples.filter((s) => s.engagementId === input.engagementId)
  const round: SampleRound = {
    ...input,
    id: newId('smp'),
    roundNo: rounds.length + 1,
    dispatchedOn: null,
    courierName: null,
    trackingNumber: null,
    batchNumber: null,
    receivedOn: null,
    outcome: 'PENDING',
    outcomeOn: null,
    outcomeByUserId: null,
    rejectionReasonCode: null,
    outcomeNotes: null,
  }

  // Moving the stage first means a refusal leaves nothing behind.
  if (eng.stage !== 'SAMPLE_REQUESTED') {
    await changeStage(input.engagementId, 'SAMPLE_REQUESTED', {
      fromRecord: true,
      override: opts.override,
      note: opts.override ? opts.overrideNote : `Sample round ${round.roundNo} requested`,
    })
  }

  write((db2) => {
    db2.samples = [...db2.samples, round]
  })
  audit('INSERT', 'sample_round', round.id, `Sample round ${round.roundNo}`)
  return round
}

export async function recordSampleDispatch(
  id: ID,
  patch: Pick<SampleRound, 'dispatchedOn' | 'courierName' | 'trackingNumber' | 'batchNumber' | 'expectedReceiptOn'>,
): Promise<void> {
  requireWrite('recording a sample dispatch')
  await delay('write')
  const db = store.db()
  const round = db.samples.find((s) => s.id === id)
  if (!round) throw new RuleError('That sample round no longer exists.')
  if (patch.dispatchedOn && patch.dispatchedOn < round.requestedOn) {
    throw new RuleError('The dispatch date cannot be before the sample was requested.')
  }
  write((db2) => {
    db2.samples = db2.samples.map((s) => (s.id === id ? { ...s, ...patch } : s))
  })
  audit('UPDATE', 'sample_round', id, `Sample round ${round.roundNo}`, diff(round, patch))
  const eng = db.engagements.find((e) => e.id === round.engagementId)
  if (eng?.stage === 'SAMPLE_REQUESTED') {
    await changeStage(eng.id, 'SAMPLE_SENT', { note: `Dispatched by ${patch.courierName ?? 'courier'}`, fromRecord: true })
  }
}

export async function recordSampleReceipt(id: ID, receivedOn: string): Promise<void> {
  requireWrite('recording sample receipt')
  await delay('write')
  const db = store.db()
  const round = db.samples.find((s) => s.id === id)
  if (!round) throw new RuleError('That sample round no longer exists.')
  if (round.dispatchedOn && receivedOn < round.dispatchedOn) {
    throw new RuleError(`The client cannot receive a sample on ${receivedOn}, before it was dispatched on ${round.dispatchedOn}.`)
  }
  write((db2) => {
    db2.samples = db2.samples.map((s) => (s.id === id ? { ...s, receivedOn } : s))
  })
  audit('UPDATE', 'sample_round', id, `Sample round ${round.roundNo}`, { receivedOn: { old: round.receivedOn, new: receivedOn } })
  const eng = db.engagements.find((e) => e.id === round.engagementId)
  if (eng?.stage === 'SAMPLE_SENT') {
    await changeStage(eng.id, 'UNDER_EVALUATION', { note: 'Client confirmed receipt', fromRecord: true })
  }
}

export async function recordSampleOutcome(
  id: ID,
  outcome: 'PASS' | 'FAIL',
  input: { outcomeOn: string; reasonCode?: string | null; notes?: string | null },
): Promise<void> {
  requireWrite('recording a sample outcome')
  await delay('write')
  const db = store.db()
  const round = db.samples.find((s) => s.id === id)
  if (!round) throw new RuleError('That sample round no longer exists.')
  if (outcome === 'FAIL' && !input.reasonCode) {
    throw new RuleError('A failed sample needs a reason from the configured list.')
  }
  if (round.receivedOn && input.outcomeOn < round.receivedOn) {
    throw new RuleError('The outcome cannot be dated before the client received the sample.')
  }
  write((db2) => {
    db2.samples = db2.samples.map((s) =>
      s.id === id
        ? {
            ...s,
            outcome,
            outcomeOn: input.outcomeOn,
            outcomeByUserId: store.currentUserId(),
            rejectionReasonCode: input.reasonCode ?? null,
            outcomeNotes: input.notes ?? null,
          }
        : s,
    )
  })
  audit('UPDATE', 'sample_round', id, `Sample round ${round.roundNo}`, {
    outcome: { old: round.outcome, new: outcome },
  })
}

// ----------------------------------------------------- client orders etc.

export async function createClientOrder(
  input: Omit<ClientOrder, 'id' | 'coNumber' | 'hasOverride' | 'createdAt' | 'updatedAt' | 'createdByUserId' | 'status'> & { status?: ClientOrder['status'] },
  lines: {
    manufacturerProductId: ID
    qty: number
    qtyUom: string
    targetPrice?: number | null
    requiredDeliveryDate?: string | null
    overrideReason?: string | null
  }[],
): Promise<ClientOrder> {
  requireWrite('raising a client order')
  await delay('write')
  const db = store.db()
  if (lines.length === 0) throw new RuleError('A client order needs at least one line.')

  // the approved-source gate, line by line
  let hasOverride = false
  for (const line of lines) {
    const eng = db.engagements.find(
      (e) => e.clientCompanyId === input.clientCompanyId && e.manufacturerProductId === line.manufacturerProductId,
    )
    const approved = eng?.stage === 'APPROVED' || eng?.stage === 'COMMERCIAL'
    if (!approved) {
      if (!line.overrideReason?.trim()) {
        const mp = db.manufacturerProducts.find((m) => m.id === line.manufacturerProductId)
        const product = db.products.find((p) => p.id === mp?.productId)
        throw new RuleError(
          `${product?.genericName ?? 'That source'} is ${eng ? `at ${stageLabel(eng.stage)}` : 'not engaged'} for this client, not approved. Ordering it needs a recorded reason.`,
        )
      }
      hasOverride = true
    }
  }

  const seq = db.clientOrders.length + 1
  const order: ClientOrder = {
    ...input,
    status: input.status ?? 'OPEN',
    id: newId('cor'),
    coNumber: `CO-${new Date().getFullYear()}-${String(seq).padStart(5, '0')}`,
    hasOverride,
    createdAt: nowIso(),
    updatedAt: nowIso(),
    createdByUserId: store.currentUserId() ?? '',
  }

  const orderLines: ClientOrderLine[] = lines.map((line, i) => {
    const mp = db.manufacturerProducts.find((m) => m.id === line.manufacturerProductId)!
    const eng = db.engagements.find(
      (e) => e.clientCompanyId === input.clientCompanyId && e.manufacturerProductId === line.manufacturerProductId,
    )
    return {
      id: newId('col'),
      clientOrderId: order.id,
      lineNo: i + 1,
      productId: mp.productId,
      manufacturerProductId: mp.id,
      engagementId: eng?.id ?? null,
      qty: line.qty,
      qtyUom: line.qtyUom,
      targetPrice: line.targetPrice ?? null,
      targetPriceUom: line.targetPrice != null ? line.qtyUom : null,
      requiredDeliveryDate: line.requiredDeliveryDate ?? null,
      status: 'OPEN',
      overrideReason: line.overrideReason ?? null,
      remarks: null,
    }
  })

  write((db2) => {
    db2.clientOrders = [order, ...db2.clientOrders]
    db2.clientOrderLines = [...db2.clientOrderLines, ...orderLines]
  })
  const client = db.companies.find((c) => c.id === order.clientCompanyId)
  audit('INSERT', 'client_order', order.id, `${order.coNumber} — ${client?.displayName ?? '?'}`)
  return order
}

/** UC-09 step 6: one indent per manufacturer, for this client. */
export async function raiseIndents(
  clientOrderId: ID,
  prices: Record<ID, number>,
  opts: { proformaInvoiceRef?: string | null } = {},
): Promise<Indent[]> {
  requireWrite('raising an indent')
  await delay('write')
  const db = store.db()
  const order = db.clientOrders.find((o) => o.id === clientOrderId)
  if (!order) throw new RuleError('That client order no longer exists.')
  const lines = db.clientOrderLines.filter((l) => l.clientOrderId === clientOrderId)
  const alreadyLinked = new Set(db.orderIndentLinks.map((l) => l.clientOrderLineId))
  const pending = lines.filter((l) => !alreadyLinked.has(l.id))
  if (pending.length === 0) throw new RuleError('Every line on this order is already covered by an indent.')

  const byMfr = new Map<ID, ClientOrderLine[]>()
  for (const line of pending) {
    const mp = db.manufacturerProducts.find((m) => m.id === line.manufacturerProductId)!
    const list = byMfr.get(mp.manufacturerCompanyId) ?? []
    list.push(line)
    byMfr.set(mp.manufacturerCompanyId, list)
  }

  const indents: Indent[] = []
  const indentLines: IndentLine[] = []
  const links: OrderIndentLink[] = []
  const commissions: Commission[] = []
  let seq = db.indents.length

  for (const [mfrId, mfrLines] of byMfr) {
    const indent: Indent = {
      id: newId('ind'),
      indentNumber: `IND-${new Date().getFullYear()}-${String(++seq).padStart(5, '0')}`,
      manufacturerCompanyId: mfrId,
      clientCompanyId: order.clientCompanyId,
      orderDate: today(),
      status: 'OPEN',
      currency: order.currency,
      incoterm: order.incoterm,
      paymentTermCode: order.paymentTermCode,
      lcNumber: null,
      lcDate: null,
      lcBank: null,
      lcExpiryDate: null,
      proformaInvoiceRef: opts.proformaInvoiceRef ?? null,
      expectedShipDate: null,
      cancelledReason: null,
      remarks: null,
      createdAt: nowIso(),
      updatedAt: nowIso(),
      createdByUserId: store.currentUserId() ?? '',
    }
    indents.push(indent)

    let lineNo = 0
    let value = 0
    for (const line of mfrLines) {
      const unitPrice = prices[line.id] ?? 0
      if (unitPrice <= 0) {
        const mp = db.manufacturerProducts.find((m) => m.id === line.manufacturerProductId)
        const product = db.products.find((p) => p.id === mp?.productId)
        throw new RuleError(`Enter the agreed price for ${product?.genericName ?? 'each line'} before raising the indent.`)
      }
      const il: IndentLine = {
        id: newId('inl'),
        indentId: indent.id,
        lineNo: ++lineNo,
        manufacturerProductId: line.manufacturerProductId,
        qty: line.qty,
        qtyUom: line.qtyUom,
        unitPrice,
        priceUom: line.qtyUom,
        status: 'OPEN',
        remarks: null,
      }
      indentLines.push(il)
      value += unitPrice * line.qty
      links.push({
        clientOrderLineId: line.id,
        indentLineId: il.id,
        manufacturerProductId: line.manufacturerProductId,
        linkedQty: line.qty,
        qtyUom: line.qtyUom,
        createdAt: nowIso(),
      })
    }

    commissions.push({
      id: newId('com'),
      indentId: indent.id,
      payableBy: 'CLIENT',
      basis: 'TBD',
      ratePct: null,
      baseAmount: Math.round(value * 100) / 100,
      amount: null,
      currency: order.currency,
      status: 'PENDING',
      invoiceReference: null,
      invoicedOn: null,
      receivedAmount: 0,
      receivedOn: null,
      remarks: 'Rate to be agreed with the client.',
    })
  }

  write((db2) => {
    db2.indents = [...indents, ...db2.indents]
    db2.indentLines = [...db2.indentLines, ...indentLines]
    db2.orderIndentLinks = [...db2.orderIndentLinks, ...links]
    db2.commissions = [...db2.commissions, ...commissions]
  })

  for (const ind of indents) {
    const mfr = db.companies.find((c) => c.id === ind.manufacturerCompanyId)
    audit('INSERT', 'indent', ind.id, `${ind.indentNumber} — ${mfr?.displayName ?? '?'}`)
  }

  // The commercial gate: the first indent for an approved engagement.
  const touched = new Set(pending.map((l) => l.engagementId).filter(Boolean) as ID[])
  for (const engId of touched) {
    const eng = store.db().engagements.find((e) => e.id === engId)
    if (eng?.stage === 'APPROVED') {
      await changeStage(engId, 'COMMERCIAL', { note: 'Automatic: first indent placed' })
    }
  }
  return indents
}

export async function updateIndent(id: ID, patch: Partial<Indent>): Promise<void> {
  requireWrite('editing an indent')
  await delay('write')
  const before = store.db().indents.find((i) => i.id === id)
  if (!before) return
  if (patch.lcExpiryDate && patch.lcDate && patch.lcExpiryDate < patch.lcDate) {
    throw new RuleError('The LC expiry date cannot be before the LC date.')
  }
  write((db) => {
    db.indents = db.indents.map((i) => (i.id === id ? { ...i, ...patch, updatedAt: nowIso() } : i))
  })
  audit('UPDATE', 'indent', id, before.indentNumber, diff(before, patch))
}

// --------------------------------------------------- shipments and batches

export async function createShipment(input: Omit<Shipment, 'id' | 'shipmentRef' | 'createdAt' | 'updatedAt'>): Promise<Shipment> {
  requireWrite('recording a shipment')
  await delay('write')
  const db = store.db()
  if (input.eta && input.etd && input.eta < input.etd) {
    throw new RuleError('The ETA cannot be before the ETD.')
  }
  const shipment: Shipment = {
    ...input,
    id: newId('shp'),
    shipmentRef: `SHP-${new Date().getFullYear()}-${String(db.shipments.length + 1).padStart(4, '0')}`,
    createdAt: nowIso(),
    updatedAt: nowIso(),
  }
  write((db2) => {
    db2.shipments = [shipment, ...db2.shipments]
  })
  audit('INSERT', 'shipment', shipment.id, shipment.shipmentRef)
  return shipment
}

export async function updateShipment(id: ID, patch: Partial<Shipment>): Promise<void> {
  requireWrite('updating a shipment')
  await delay('write')
  const before = store.db().shipments.find((s) => s.id === id)
  if (!before) return
  if (patch.status === 'HELD_AT_CUSTOMS' && !patch.holdRemark && !before.holdRemark) {
    throw new RuleError('A shipment held at customs needs a remark saying why.')
  }
  if ((patch.status === 'CLEARED' || patch.status === 'DELIVERED') && !(patch.customsClearedOn ?? before.customsClearedOn)) {
    throw new RuleError('Record the customs clearance date before marking the shipment cleared.')
  }
  if (patch.customsClearedOn && (patch.actualArrivalDate ?? before.actualArrivalDate) && patch.customsClearedOn < (patch.actualArrivalDate ?? before.actualArrivalDate)!) {
    throw new RuleError('Customs clearance cannot be dated before the shipment arrived.')
  }
  writeTrade((db) => {
    db.shipments = db.shipments.map((s) => (s.id === id ? { ...s, ...patch, updatedAt: nowIso() } : s))
  })
  audit('UPDATE', 'shipment', id, before.shipmentRef, diff(before, patch))
}

/**
 * Adds a batch to a shipment. If the batch number already exists for that
 * source it is reused, exactly as UC-10 3c requires.
 */
export async function addShipmentLine(input: {
  shipmentId: ID
  indentLineId: ID
  batchNumber: string
  manufacturingDate: string
  expiryDate: string | null
  retestDate: string | null
  qty: number
  qtyUom: string
  shortShelfLifeRemark?: string | null
}): Promise<{ line: ShipmentLine; batch: Batch; reusedBatch: boolean; warning?: string }> {
  requireWrite('recording a batch on a shipment')
  await delay('write')
  const db = store.db()
  const shipment = db.shipments.find((s) => s.id === input.shipmentId)
  const indentLine = db.indentLines.find((l) => l.id === input.indentLineId)
  if (!shipment || !indentLine) throw new RuleError('That shipment or indent line no longer exists.')
  if (indentLine.indentId !== shipment.indentId) {
    throw new RuleError('That indent line belongs to a different indent from this shipment.')
  }

  // batch dates
  if (!input.expiryDate && !input.retestDate) throw new RuleError('A batch needs an expiry date, a retest date, or both.')
  if (input.manufacturingDate > today()) throw new RuleError('The manufacturing date cannot be in the future.')
  if (input.expiryDate && input.expiryDate <= input.manufacturingDate) {
    throw new RuleError('The expiry date must be after the manufacturing date.')
  }
  if (input.retestDate && input.expiryDate && input.retestDate > input.expiryDate) {
    throw new RuleError('The retest date cannot be after the expiry date.')
  }

  // reuse an existing batch, or refuse if the dates disagree
  let batch = db.batches.find(
    (b) => b.manufacturerProductId === indentLine.manufacturerProductId && b.batchNumber === input.batchNumber,
  )
  const reusedBatch = Boolean(batch)
  if (batch) {
    if (batch.manufacturingDate !== input.manufacturingDate || (batch.expiryDate ?? '') !== (input.expiryDate ?? '')) {
      throw new RuleError(
        `Batch ${input.batchNumber} is already recorded for this source, made ${batch.manufacturingDate} and expiring ${batch.expiryDate ?? 'n/a'}. The dates entered do not match, which usually means a mis-entry.`,
      )
    }
  }

  // over-shipment, unit-aware, against the indent line
  const { convertQty } = await import('./reference')
  const tolerance = store.settings().overshipmentTolerancePct
  const siblings = db.shipmentLines.filter((l) => l.indentLineId === input.indentLineId)
  let shipped = 0
  for (const s of siblings) shipped += convertQty(s.qty, s.qtyUom, indentLine.qtyUom)
  const adding = convertQty(input.qty, input.qtyUom, indentLine.qtyUom)
  const limit = indentLine.qty * (1 + tolerance / 100)
  if (shipped + adding > limit) {
    throw new RuleError(
      `That would bring the shipped total to ${round(shipped + adding)} ${indentLine.qtyUom} against an indent line of ${round(indentLine.qty)} ${indentLine.qtyUom} (tolerance ${tolerance}%).`,
    )
  }
  const warning =
    shipped + adding > indentLine.qty
      ? `This takes the total to ${round(shipped + adding)} ${indentLine.qtyUom}, above the indent line but within the ${tolerance}% tolerance.`
      : undefined

  // shelf life against the ordering client's minimum
  const link = db.orderIndentLinks.find((l) => l.indentLineId === input.indentLineId)
  const orderLine = link ? db.clientOrderLines.find((l) => l.id === link.clientOrderLineId) : undefined
  const order = orderLine ? db.clientOrders.find((o) => o.id === orderLine.clientOrderId) : undefined
  const client = order ? db.companies.find((c) => c.id === order.clientCompanyId) : undefined
  const minMonths = client?.client?.minShelfLifeMonths ?? store.settings().minShelfLifeMonths
  if (input.expiryDate && !input.shortShelfLifeRemark) {
    const cutoff = new Date()
    cutoff.setMonth(cutoff.getMonth() + minMonths)
    if (new Date(input.expiryDate) < cutoff) {
      throw new RuleError(
        `This batch expires on ${input.expiryDate}, less than ${minMonths} months away — below ${client?.displayName ?? 'the client'}'s minimum. Record a short-shelf-life remark to accept it.`,
      )
    }
  }

  const newBatch: Batch | null = batch
    ? null
    : {
        id: newId('bat'),
        manufacturerProductId: indentLine.manufacturerProductId,
        batchNumber: input.batchNumber,
        manufacturingDate: input.manufacturingDate,
        expiryDate: input.expiryDate,
        retestDate: input.retestDate,
        coaDocumentId: null,
        createdAt: nowIso(),
      }
  batch = batch ?? newBatch!

  const line: ShipmentLine = {
    id: newId('sbl'),
    shipmentId: input.shipmentId,
    indentId: shipment.indentId,
    indentLineId: input.indentLineId,
    manufacturerProductId: indentLine.manufacturerProductId,
    batchId: batch.id,
    qty: input.qty,
    qtyUom: input.qtyUom,
    shortShelfLifeRemark: input.shortShelfLifeRemark ?? null,
  }

  writeTrade((db2) => {
    if (newBatch) db2.batches = [newBatch, ...db2.batches]
    db2.shipmentLines = [...db2.shipmentLines, line]
  })
  if (newBatch) audit('INSERT', 'batch', newBatch.id, newBatch.batchNumber)
  audit('INSERT', 'shipment_line', line.id, `${batch.batchNumber} — ${line.qty} ${line.qtyUom}`)
  return { line, batch, reusedBatch, warning }
}

export async function recordDelivery(input: {
  shipmentLineId: ID
  clientOrderLineId: ID
  deliverySiteId: ID
  deliveredQty: number
  qtyUom: string
  deliveredOn: string
  grnReference?: string | null
}): Promise<Delivery> {
  requireWrite('recording a delivery')
  await delay('write')
  const db = store.db()
  const line = db.shipmentLines.find((l) => l.id === input.shipmentLineId)
  if (!line) throw new RuleError('That shipment line no longer exists.')
  const shipment = db.shipments.find((s) => s.id === line.shipmentId)!
  const orderLine = db.clientOrderLines.find((l) => l.id === input.clientOrderLineId)
  if (!orderLine) throw new RuleError('That order line no longer exists.')
  const order = db.clientOrders.find((o) => o.id === orderLine.clientOrderId)!

  if (!shipment.customsClearedOn) {
    throw new RuleError('This shipment has not been customs-cleared, so nothing can be delivered from it yet.')
  }
  if (input.deliveredOn < shipment.customsClearedOn) {
    throw new RuleError(`The delivery date is before customs clearance on ${shipment.customsClearedOn}.`)
  }
  const serves = db.orderIndentLinks.some(
    (l) => l.clientOrderLineId === input.clientOrderLineId && l.indentLineId === line.indentLineId,
  )
  if (!serves) throw new RuleError('That order line is not served by the indent line on this shipment.')
  const site = db.sites.find((s) => s.id === input.deliverySiteId)
  if (!site || site.companyId !== order.clientCompanyId) {
    throw new RuleError('That delivery site does not belong to the ordering client.')
  }

  const { convertQty } = await import('./reference')
  const already = db.deliveries.filter((d) => d.shipmentLineId === input.shipmentLineId)
  let done = 0
  for (const d of already) done += convertQty(d.deliveredQty, d.qtyUom, line.qtyUom)
  const adding = convertQty(input.deliveredQty, input.qtyUom, line.qtyUom)
  if (done + adding > line.qty) {
    throw new RuleError(
      `This shipment line holds ${round(line.qty)} ${line.qtyUom}, of which ${round(done)} is already delivered.`,
    )
  }

  const delivery: Delivery = {
    id: newId('dlv'),
    shipmentLineId: input.shipmentLineId,
    clientOrderLineId: input.clientOrderLineId,
    deliverySiteId: input.deliverySiteId,
    deliveredQty: input.deliveredQty,
    qtyUom: input.qtyUom,
    deliveredOn: input.deliveredOn,
    grnReference: input.grnReference ?? null,
    remarks: null,
  }
  writeTrade((db2) => {
    db2.deliveries = [...db2.deliveries, delivery]
  })
  audit('INSERT', 'delivery', delivery.id, `${delivery.deliveredQty} ${delivery.qtyUom} to ${site.name}`)
  return delivery
}

// ------------------------------------------------------------- commission

export async function updateCommission(id: ID, patch: Partial<Commission>): Promise<void> {
  requireWrite('updating a commission record')
  await delay('write')
  const db = store.db()
  const before = db.commissions.find((c) => c.id === id)
  if (!before) throw new RuleError('That commission record no longer exists.')
  const after = { ...before, ...patch }

  if (after.basis === 'PERCENT_OF_VALUE' && (after.ratePct == null || after.ratePct <= 0)) {
    throw new RuleError('A percentage commission needs a rate.')
  }
  if (after.basis !== 'TBD' && after.amount == null) {
    throw new RuleError('Enter the commission amount, or set the basis to "to be decided".')
  }
  if (after.status !== 'PENDING' && after.amount == null) {
    throw new RuleError('A commission with no agreed figure cannot be invoiced.')
  }
  if (after.amount != null && after.receivedAmount > after.amount) {
    throw new RuleError('Receipts cannot exceed the commission due.')
  }
  if (after.status !== 'PENDING' && !after.invoicedOn) {
    throw new RuleError('An invoiced commission needs an invoice date.')
  }

  write((db2) => {
    db2.commissions = db2.commissions.map((c) => (c.id === id ? after : c))
  })
  const indent = db.indents.find((i) => i.id === before.indentId)
  audit('UPDATE', 'commission', id, `Commission on ${indent?.indentNumber ?? '?'}`, diff(before, patch))
}

// --------------------------------------------------------------- documents

export async function uploadDocument(
  input: Omit<DocumentRecord, 'id' | 'versionNo' | 'supersededById' | 'isActive' | 'uploadedAt' | 'uploadedByUserId'>,
): Promise<DocumentRecord> {
  requireWrite('uploading a document')
  await delay('write')
  const db = store.db()
  const maxBytes = store.settings().maxUploadMb * 1024 * 1024
  if (input.fileSizeBytes > maxBytes) {
    throw new RuleError(`That file is larger than the ${store.settings().maxUploadMb} MB limit.`)
  }
  if (input.expiresOn && input.issuedOn && input.expiresOn < input.issuedOn) {
    throw new RuleError('The expiry date cannot be before the issue date.')
  }

  // a newer version of the same type on the same parent supersedes the old one
  const previous = db.documents.filter(
    (d) => d.entityType === input.entityType && d.entityId === input.entityId && d.typeCode === input.typeCode && d.isActive && !d.supersededById,
  )
  const doc: DocumentRecord = {
    ...input,
    id: newId('doc'),
    versionNo: previous.length + 1,
    supersededById: null,
    isActive: true,
    uploadedAt: nowIso(),
    uploadedByUserId: store.currentUserId() ?? '',
  }
  write((db2) => {
    db2.documents = [doc, ...db2.documents.map((d) => (previous.some((p) => p.id === d.id) ? { ...d, supersededById: doc.id } : d))]
  })
  audit('INSERT', 'document', doc.id, doc.title)
  return doc
}

export async function removeDocument(id: ID): Promise<void> {
  requireWrite('removing a document')
  await delay('write')
  const d = store.db().documents.find((x) => x.id === id)
  if (!d) return
  write((db) => {
    db.documents = db.documents.map((x) => (x.id === id ? { ...x, isActive: false } : x))
  })
  audit('DELETE', 'document', id, d.title)
}

// -------------------------------------------------------------- activities

export async function logActivity(input: Omit<Activity, 'id' | 'createdByUserId'>): Promise<Activity> {
  requireWrite('logging an activity')
  await delay('write')
  const activity: Activity = { ...input, id: newId('act'), createdByUserId: store.currentUserId() ?? '' }
  write((db) => {
    db.activities = [activity, ...db.activities]
  })
  audit('INSERT', 'activity', activity.id, activity.subject)
  return activity
}

// ------------------------------------------------------------------ users

export async function createUser(input: Omit<User, 'id' | 'initials' | 'activatedAt' | 'lastLoginAt' | 'isActive'>): Promise<User> {
  requireWrite('creating a user')
  await delay('write')
  const db = store.db()
  if (db.users.some((u) => u.email.toLowerCase() === input.email.toLowerCase())) {
    throw new RuleError('That email address is already registered.')
  }
  const user: User = {
    ...input,
    id: newId('usr'),
    isActive: true,
    activatedAt: null,
    lastLoginAt: null,
    initials: input.fullName.split(' ').map((w) => w[0]).join('').slice(0, 2).toUpperCase(),
  }
  write((db2) => {
    db2.users = [...db2.users, user]
  })
  audit('INSERT', 'app_user', user.id, user.fullName)
  return user
}

export async function setUserRole(id: ID, roleCode: RoleCode): Promise<void> {
  requireWrite('changing a user role')
  await delay('write')
  const db = store.db()
  const user = db.users.find((u) => u.id === id)
  if (!user) throw new RuleError('That user no longer exists.')
  const guard = checkLastFullAccess(db.users, { userId: id, toRole: roleCode })
  if (!guard.ok) throw new RuleError(guard.error!)
  write((db2) => {
    db2.users = db2.users.map((u) => (u.id === id ? { ...u, roleCode } : u))
  })
  audit('UPDATE', 'app_user', id, user.fullName, { roleCode: { old: user.roleCode, new: roleCode } })
  useStore.getState().pushSecurity({
    eventType: 'ROLE_CHANGE',
    userId: store.currentUserId(),
    detail: `Changed ${user.fullName} to ${roleCode === 'FULL_ACCESS' ? 'Full Access' : 'View Only'}`,
    rowCount: null,
  })
}

export async function setUserActive(id: ID, isActive: boolean, reassignToUserId?: ID): Promise<void> {
  requireWrite('activating or deactivating a user')
  await delay('write')
  const db = store.db()
  const user = db.users.find((u) => u.id === id)
  if (!user) throw new RuleError('That user no longer exists.')
  if (!isActive) {
    const guard = checkLastFullAccess(db.users, { userId: id, toActive: false })
    if (!guard.ok) throw new RuleError(guard.error!)
    const openWork =
      db.engagements.filter((e) => e.ownerUserId === id && !['REJECTED', 'DISCONTINUED'].includes(e.stage)).length +
      db.requirements.filter((r) => r.ownerUserId === id && ['OPEN', 'SOURCING', 'ENGAGED'].includes(r.status)).length
    if (openWork > 0 && !reassignToUserId) {
      throw new RuleError(
        `${user.fullName} owns ${openWork} open record${openWork === 1 ? '' : 's'}. Choose who takes them over before deactivating.`,
      )
    }
  }
  write((db2) => {
    db2.users = db2.users.map((u) => (u.id === id ? { ...u, isActive } : u))
    if (!isActive && reassignToUserId) {
      db2.engagements = db2.engagements.map((e) => (e.ownerUserId === id ? { ...e, ownerUserId: reassignToUserId } : e))
      db2.requirements = db2.requirements.map((r) => (r.ownerUserId === id ? { ...r, ownerUserId: reassignToUserId } : r))
      db2.companies = db2.companies.map((c) =>
        c.client?.ownerUserId === id ? { ...c, client: { ...c.client, ownerUserId: reassignToUserId } } : c,
      )
    }
  })
  audit('UPDATE', 'app_user', id, user.fullName, { isActive: { old: !isActive, new: isActive } })
}

// ----------------------------------------------------------- saved filters
// Personal, so a View Only session may save them too (NFR-SE-05).

export async function saveFilter(screen: string, name: string, queryString: string): Promise<SavedFilter> {
  await delay('write')
  const userId = store.currentUserId()
  if (!userId) throw new RuleError('Not signed in.')
  const filter: SavedFilter = { id: newId('sfl'), userId, screen, name, queryString, createdAt: nowIso() }
  write((db) => {
    db.savedFilters = [...db.savedFilters.filter((f) => !(f.userId === userId && f.screen === screen && f.name === name)), filter]
  })
  return filter
}

export async function deleteFilter(id: ID): Promise<void> {
  await delay('write')
  write((db) => {
    db.savedFilters = db.savedFilters.filter((f) => f.id !== id)
  })
}

export async function markNotificationsRead(ids: ID[]): Promise<void> {
  await delay('write')
  write((db) => {
    db.notifications = db.notifications.map((n) => (ids.includes(n.id) ? { ...n, isRead: true } : n))
  })
}

// ---------------------------------------------------------------- helpers

function diff<T extends object>(before: T, patch: Partial<T>): Record<string, { old: unknown; new: unknown }> {
  const out: Record<string, { old: unknown; new: unknown }> = {}
  for (const key of Object.keys(patch) as (keyof T)[]) {
    const oldValue = before[key]
    const newValue = patch[key]
    if (oldValue !== newValue && typeof oldValue !== 'object') {
      out[String(key)] = { old: oldValue, new: newValue }
    }
  }
  return out
}

const round = (n: number) => Math.round(n * 10000) / 10000

const stageLabel = (s: EngagementStage) => s.charAt(0) + s.slice(1).toLowerCase().replace(/_/g, ' ')
