/**
 * Domain types for the TCL Sourcing Platform prototype.
 *
 * These mirror `dcos/07-database-schema.sql` v0.3 (the indent model). Names are
 * camelCase here, snake_case there; the shape is otherwise the same, so the
 * fake API in `api.ts` can be replaced by a real one without touching screens.
 *
 * The indent model, in one line: TCL never buys or sells. A client order says
 * what a client wants and from which source; an indent is the order TCL places
 * on a manufacturer for that client; commission is TCL's earnings from the client.
 */

export type ID = string

// ---------------------------------------------------------------- reference

export type CompanyKind = 'CLIENT' | 'MANUFACTURER' | 'BOTH'
export type ClientStatus = 'PROSPECT' | 'ACTIVE' | 'DORMANT' | 'LOST'
export type ManufacturerStatus =
  | 'NEW'
  | 'UNDER_DEVELOPMENT'
  | 'EXISTING_COMMERCIAL'
  | 'INACTIVE'
  | 'BLACKLISTED'
export type SiteKind = 'HEAD_OFFICE' | 'PLANT' | 'WAREHOUSE' | 'RND_CENTRE'
export type ProductCategory = 'API' | 'EXCIPIENT' | 'INTERMEDIATE' | 'OTHER'
export type Pharmacopoeia = 'USP' | 'BP' | 'EP' | 'IP' | 'JP' | 'IH' | 'OTHER'
export type MpStatus = 'ACTIVE' | 'IN_DEVELOPMENT' | 'DISCONTINUED'
export type RepresentationKind =
  | 'EXCLUSIVE_AGENT'
  | 'NON_EXCLUSIVE_AGENT'
  | 'INDENT'
  | 'DISTRIBUTOR'
export type FilingKind = 'DMF' | 'ASMF' | 'CEP' | 'OTHER'
export type RequirementKind = 'NEW_DEVELOPMENT' | 'ALTERNATE_SOURCE'
export type RequirementStatus =
  | 'OPEN'
  | 'SOURCING'
  | 'ENGAGED'
  | 'FULFILLED'
  | 'CLOSED_LOST'
  | 'CANCELLED'

export const ENGAGEMENT_STAGES = [
  'IDENTIFIED',
  'OFFERED',
  'SAMPLE_REQUESTED',
  'SAMPLE_SENT',
  'UNDER_EVALUATION',
  'APPROVED',
  'COMMERCIAL',
  'ON_HOLD',
  'REJECTED',
  'DISCONTINUED',
] as const
export type EngagementStage = (typeof ENGAGEMENT_STAGES)[number]

/** The seven stages that form the forward pipeline, in order. */
export const PIPELINE_STAGES: EngagementStage[] = [
  'IDENTIFIED',
  'OFFERED',
  'SAMPLE_REQUESTED',
  'SAMPLE_SENT',
  'UNDER_EVALUATION',
  'APPROVED',
  'COMMERCIAL',
]

export type EngagementOrigin = 'PIPELINE' | 'MIGRATED'
export type OfferStatus = 'DRAFT' | 'SENT' | 'SUPERSEDED' | 'ACCEPTED' | 'DECLINED' | 'EXPIRED'
export type SamplePurpose = 'EVALUATION' | 'REGISTRATION' | 'STABILITY' | 'TRIAL_BATCH'
export type SampleOutcome = 'PENDING' | 'PASS' | 'FAIL' | 'CANCELLED'
export type OrderStatus =
  | 'DRAFT'
  | 'OPEN'
  | 'PARTIALLY_SHIPPED'
  | 'SHIPPED'
  | 'COMPLETED'
  | 'CANCELLED'
  | 'ON_HOLD'
export type ShipmentMode = 'AIR' | 'SEA' | 'COURIER' | 'ROAD'
export type ShipmentStatus =
  | 'PLANNED'
  | 'IN_TRANSIT'
  | 'ARRIVED'
  | 'HELD_AT_CUSTOMS'
  | 'CLEARED'
  | 'DELIVERED'
  | 'CANCELLED'
export type CommissionStatus =
  | 'PENDING'
  | 'INVOICED'
  | 'PARTIALLY_RECEIVED'
  | 'RECEIVED'
  | 'WRITTEN_OFF'
export type CommissionPayer = 'CLIENT' | 'MANUFACTURER'
export type CommissionBasis = 'PERCENT_OF_VALUE' | 'FIXED_AMOUNT' | 'TBD'
export type ActivityKind = 'CALL' | 'MEETING' | 'EMAIL' | 'VISIT' | 'NOTE' | 'TASK'
export type AuditAction = 'INSERT' | 'UPDATE' | 'DELETE'
export type RoleCode = 'FULL_ACCESS' | 'VIEWER'

// ---------------------------------------------------------------- identity

export interface User {
  id: ID
  email: string
  fullName: string
  department: string | null
  phone: string | null
  roleCode: RoleCode
  isActive: boolean
  /** null until the one-time activation link is used; such a user cannot log in. */
  activatedAt: string | null
  lastLoginAt: string | null
  initials: string
}

export interface SavedFilter {
  id: ID
  userId: ID
  screen: string
  name: string
  queryString: string
  createdAt: string
}

// ---------------------------------------------------------------- parties

export interface Company {
  id: ID
  kind: CompanyKind
  legalName: string
  displayName: string
  countryCode: string
  website: string | null
  generalEmail: string | null
  generalPhone: string | null
  notes: string | null
  isActive: boolean
  possibleDuplicate: boolean
  createdAt: string
  updatedAt: string
  /** present when kind is CLIENT or BOTH */
  client?: ClientProfile
  /** present when kind is MANUFACTURER or BOTH */
  manufacturer?: ManufacturerProfile
}

export interface ClientProfile {
  status: ClientStatus
  ownerUserId: ID
  paymentTermCode: string | null
  creditLimit: number | null
  creditCurrency: string | null
  minShelfLifeMonths: number | null
  therapeuticFocus: string | null
  firstBusinessDate: string | null
}

export interface ManufacturerProfile {
  status: ManufacturerStatus
  ownerUserId: ID | null
  representation: RepresentationKind | null
  agreementReference: string | null
  agreementSignedOn: string | null
  agreementExpiresOn: string | null
  commissionBasisNote: string | null
  defaultIncoterm: string | null
  defaultPaymentTermCode: string | null
  blacklistReason: string | null
  blacklistedOn: string | null
  onboardedOn: string | null
}

export interface ManufacturerStatusChange {
  id: ID
  companyId: ID
  fromStatus: ManufacturerStatus | null
  toStatus: ManufacturerStatus
  changedAt: string
  changedByUserId: ID
  remark: string | null
}

export interface CompanySite {
  id: ID
  companyId: ID
  kind: SiteKind
  name: string
  city: string | null
  countryCode: string
  addressLine: string | null
  isPrimary: boolean
  isDeliveryDestination: boolean
  isActive: boolean
}

export interface CompanyContact {
  id: ID
  companyId: ID
  siteId: ID | null
  fullName: string
  designation: string | null
  department: string | null
  email: string | null
  phone: string | null
  isPrimary: boolean
  isActive: boolean
}

// ---------------------------------------------------------------- catalog

export interface Product {
  id: ID
  genericName: string
  category: ProductCategory
  casNumber: string | null
  defaultUom: string
  hsCode: string | null
  description: string | null
  synonyms: string[]
  therapeuticCategories: string[]
  isActive: boolean
  possibleDuplicate: boolean
  createdAt: string
  updatedAt: string
}

export interface ManufacturerProduct {
  id: ID
  manufacturerCompanyId: ID
  productId: ID
  siteId: ID | null
  grade: string
  pharmacopoeia: Pharmacopoeia
  status: MpStatus
  moqQty: number | null
  moqUom: string | null
  leadTimeDays: number | null
  packingDetails: string | null
  annualCapacityQty: number | null
  annualCapacityUom: string | null
  remarks: string | null
  createdAt: string
  updatedAt: string
}

export interface MpFiling {
  id: ID
  manufacturerProductId: ID
  kind: FilingKind
  authority: string
  referenceNumber: string
  isActive: boolean
  documentId: ID | null
  remarks: string | null
}

/** A period during which TCL represents a source. At most one active per source. */
export interface PortfolioItem {
  id: ID
  manufacturerProductId: ID
  representation: RepresentationKind
  startedOn: string
  endedOn: string | null
  isActive: boolean
  remarks: string | null
}

export interface MpPrice {
  id: ID
  manufacturerProductId: ID
  price: number
  currency: string
  perUom: string
  incoterm: string
  minQty: number
  validFrom: string
  validTo: string
  sourceReference: string | null
  remarks: string | null
  createdAt: string
}

// ---------------------------------------------------------------- demand

export interface Requirement {
  id: ID
  clientCompanyId: ID
  productId: ID
  kind: RequirementKind
  status: RequirementStatus
  enquiryDate: string
  requiredByDate: string | null
  estAnnualQty: number | null
  qtyUom: string | null
  qtyIsIndicative: boolean
  targetPrice: number | null
  targetCurrency: string | null
  requiredPharmacopoeia: Pharmacopoeia | null
  requiredGrade: string | null
  currentSourceNote: string | null
  alternateReason: string | null
  requestingContactId: ID | null
  ownerUserId: ID
  duplicateReason: string | null
  remarks: string | null
  createdAt: string
  updatedAt: string
}

export interface Engagement {
  id: ID
  clientCompanyId: ID
  manufacturerProductId: ID
  /** derived from the source, as the database trigger does */
  productId: ID
  manufacturerCompanyId: ID
  stage: EngagementStage
  stageChangedAt: string
  stageReasonCode: string | null
  stageNote: string | null
  stageBeforeHold: EngagementStage | null
  origin: EngagementOrigin
  ownerUserId: ID
  firstOfferedOn: string | null
  firstSampleOn: string | null
  approvedOn: string | null
  approvalReference: string | null
  approvalConditions: string | null
  firstCommercialOn: string | null
  isOverrideCreated: boolean
  remarks: string | null
  createdAt: string
  updatedAt: string
}

export interface RequirementEngagementLink {
  requirementId: ID
  engagementId: ID
  linkedAt: string
}

export interface StageHistoryEntry {
  id: ID
  engagementId: ID
  fromStage: EngagementStage | null
  toStage: EngagementStage
  changedAt: string
  changedByUserId: ID | null
  reasonCode: string | null
  remark: string | null
  isOverride: boolean
  daysInPreviousStage: number | null
}

export interface Offer {
  id: ID
  engagementId: ID
  versionNo: number
  offerDate: string
  offeredPrice: number
  currency: string
  perUom: string
  incoterm: string
  moqQty: number | null
  moqUom: string | null
  validUntil: string
  status: OfferStatus
  sourcePriceId: ID | null
  remarks: string | null
  createdAt: string
  createdByUserId: ID
}

export interface SampleRound {
  id: ID
  engagementId: ID
  roundNo: number
  purpose: SamplePurpose
  requestedOn: string
  requestedQty: number
  qtyUom: string
  expectedReceiptOn: string | null
  requestingContactId: ID | null
  dispatchedOn: string | null
  courierName: string | null
  trackingNumber: string | null
  batchNumber: string | null
  receivedOn: string | null
  outcome: SampleOutcome
  outcomeOn: string | null
  outcomeByUserId: ID | null
  rejectionReasonCode: string | null
  outcomeNotes: string | null
}

// ---------------------------------------------------------------- orders

/** What the client wants, and from which source. Carries no TCL selling price. */
export interface ClientOrder {
  id: ID
  coNumber: string
  clientCompanyId: ID
  deliverySiteId: ID | null
  orderDate: string
  status: OrderStatus
  currency: string
  incoterm: string | null
  paymentTermCode: string | null
  clientReference: string | null
  hasOverride: boolean
  cancelledReason: string | null
  remarks: string | null
  createdAt: string
  updatedAt: string
  createdByUserId: ID
}

export interface ClientOrderLine {
  id: ID
  clientOrderId: ID
  lineNo: number
  productId: ID
  manufacturerProductId: ID
  engagementId: ID | null
  qty: number
  qtyUom: string
  /** reference only — the price the client named, not a TCL price */
  targetPrice: number | null
  targetPriceUom: string | null
  requiredDeliveryDate: string | null
  status: OrderStatus
  overrideReason: string | null
  remarks: string | null
}

/** The order TCL places on a manufacturer on behalf of one named client. */
export interface Indent {
  id: ID
  indentNumber: string
  manufacturerCompanyId: ID
  clientCompanyId: ID
  orderDate: string
  status: OrderStatus
  currency: string
  incoterm: string | null
  paymentTermCode: string | null
  /** opened by the client in the manufacturer's favour */
  lcNumber: string | null
  lcDate: string | null
  lcBank: string | null
  lcExpiryDate: string | null
  proformaInvoiceRef: string | null
  expectedShipDate: string | null
  cancelledReason: string | null
  remarks: string | null
  createdAt: string
  updatedAt: string
  createdByUserId: ID
}

export interface IndentLine {
  id: ID
  indentId: ID
  lineNo: number
  manufacturerProductId: ID
  qty: number
  qtyUom: string
  /** agreed between client and manufacturer — what the client pays */
  unitPrice: number
  priceUom: string
  status: OrderStatus
  remarks: string | null
}

export interface OrderIndentLink {
  clientOrderLineId: ID
  indentLineId: ID
  manufacturerProductId: ID
  linkedQty: number
  qtyUom: string
  createdAt: string
}

export interface Shipment {
  id: ID
  shipmentRef: string
  indentId: ID
  mode: ShipmentMode
  status: ShipmentStatus
  blAwbNumber: string | null
  carrier: string | null
  forwarderName: string | null
  cnfAgentName: string | null
  portOfLoading: string | null
  portOfDischarge: string | null
  etd: string | null
  eta: string | null
  actualArrivalDate: string | null
  customsClearedOn: string | null
  holdRemark: string | null
  remarks: string | null
  createdAt: string
  updatedAt: string
}

/** A manufacturer's production batch, recorded once and reused. */
export interface Batch {
  id: ID
  manufacturerProductId: ID
  batchNumber: string
  manufacturingDate: string
  expiryDate: string | null
  retestDate: string | null
  coaDocumentId: ID | null
  createdAt: string
}

/** This quantity of this batch, on this shipment, against this indent line. */
export interface ShipmentLine {
  id: ID
  shipmentId: ID
  indentId: ID
  indentLineId: ID
  manufacturerProductId: ID
  batchId: ID
  qty: number
  qtyUom: string
  shortShelfLifeRemark: string | null
}

export interface Delivery {
  id: ID
  shipmentLineId: ID
  clientOrderLineId: ID
  deliverySiteId: ID
  deliveredQty: number
  qtyUom: string
  deliveredOn: string
  grnReference: string | null
  remarks: string | null
}

/** TCL's earnings on an indent. The company's only revenue line. */
export interface Commission {
  id: ID
  indentId: ID
  payableBy: CommissionPayer
  basis: CommissionBasis
  ratePct: number | null
  baseAmount: number | null
  amount: number | null
  currency: string
  status: CommissionStatus
  invoiceReference: string | null
  invoicedOn: string | null
  receivedAmount: number
  receivedOn: string | null
  remarks: string | null
}

// ---------------------------------------------------- documents and events

export interface DocumentRecord {
  id: ID
  typeCode: string
  entityType: DocumentEntityType
  entityId: ID
  title: string
  referenceNumber: string | null
  issuingAuthority: string | null
  issuedOn: string | null
  expiresOn: string | null
  versionNo: number
  supersededById: ID | null
  fileName: string
  fileSizeBytes: number
  mimeType: string
  isActive: boolean
  uploadedAt: string
  uploadedByUserId: ID
}

export type DocumentEntityType =
  | 'COMPANY'
  | 'COMPANY_SITE'
  | 'PRODUCT'
  | 'MANUFACTURER_PRODUCT'
  | 'ENGAGEMENT'
  | 'OFFER'
  | 'SAMPLE_ROUND'
  | 'CLIENT_ORDER'
  | 'INDENT'
  | 'SHIPMENT'
  | 'BATCH'
  | 'REQUIREMENT'

export interface Activity {
  id: ID
  kind: ActivityKind
  entityType: string
  entityId: ID
  subject: string
  body: string | null
  occurredAt: string
  contactId: ID | null
  followUpDate: string | null
  isCompleted: boolean
  createdByUserId: ID
}

export interface Notification {
  id: ID
  userId: ID
  category: string
  title: string
  body: string | null
  entityType: string | null
  entityId: ID | null
  isRead: boolean
  createdAt: string
}

export interface AuditEntry {
  id: ID
  occurredAt: string
  userId: ID | null
  action: AuditAction
  tableName: string
  recordId: ID
  recordLabel: string
  changedFields: Record<string, { old: unknown; new: unknown }> | null
}

export interface SecurityEntry {
  id: ID
  occurredAt: string
  eventType:
    | 'LOGIN'
    | 'LOGIN_FAIL'
    | 'PERMISSION_DENIED'
    | 'EXPORT'
    | 'CROSS_CLIENT_VIEW'
    | 'ROLE_CHANGE'
  userId: ID | null
  detail: string
  rowCount: number | null
}

// ---------------------------------------------------------------- settings

export interface StageConfig {
  stage: EngagementStage
  ageingThresholdDays: number
  requiresReason: boolean
  isTerminal: boolean
  displayOrder: number
}

export interface ReasonOption {
  code: string
  name: string
  appliesTo: 'ENGAGEMENT' | 'SAMPLE' | 'OFFER'
}

export interface AppSettings {
  overshipmentTolerancePct: number
  minShelfLifeMonths: number
  sessionIdleMinutes: number
  loginLockoutAttempts: number
  maxUploadMb: number
  reportSyncRowLimit: number
  docExpiryWarnDays: number
}

/** Everything in the demo, held in memory. */
export interface Database {
  users: User[]
  savedFilters: SavedFilter[]
  companies: Company[]
  sites: CompanySite[]
  contacts: CompanyContact[]
  statusChanges: ManufacturerStatusChange[]
  products: Product[]
  manufacturerProducts: ManufacturerProduct[]
  filings: MpFiling[]
  portfolio: PortfolioItem[]
  prices: MpPrice[]
  requirements: Requirement[]
  engagements: Engagement[]
  requirementEngagements: RequirementEngagementLink[]
  stageHistory: StageHistoryEntry[]
  offers: Offer[]
  samples: SampleRound[]
  clientOrders: ClientOrder[]
  clientOrderLines: ClientOrderLine[]
  indents: Indent[]
  indentLines: IndentLine[]
  orderIndentLinks: OrderIndentLink[]
  shipments: Shipment[]
  batches: Batch[]
  shipmentLines: ShipmentLine[]
  deliveries: Delivery[]
  commissions: Commission[]
  documents: DocumentRecord[]
  activities: Activity[]
  notifications: Notification[]
  audit: AuditEntry[]
  security: SecurityEntry[]
}
