/**
 * Reference data and display metadata.
 *
 * Mirrors the seed block of `dcos/07-database-schema.sql` (section 14), plus the
 * labels and colours the UI needs. Anything an administrator could edit in the
 * real system lives here rather than being written into components.
 */

import { PIPELINE_STAGES } from './types'
export { PIPELINE_STAGES }

import type {
  ClientStatus,
  CommissionBasis,
  CommissionStatus,
  EngagementStage,
  FilingKind,
  ManufacturerStatus,
  MpStatus,
  OfferStatus,
  OrderStatus,
  Pharmacopoeia,
  ProductCategory,
  ReasonOption,
  RepresentationKind,
  RequirementKind,
  RequirementStatus,
  SampleOutcome,
  SamplePurpose,
  ShipmentMode,
  ShipmentStatus,
  SiteKind,
  StageConfig,
} from './types'

export const COUNTRIES: { code: string; name: string }[] = [
  { code: 'BD', name: 'Bangladesh' },
  { code: 'IN', name: 'India' },
  { code: 'CN', name: 'China' },
  { code: 'US', name: 'United States' },
  { code: 'GB', name: 'United Kingdom' },
  { code: 'DE', name: 'Germany' },
  { code: 'FR', name: 'France' },
  { code: 'IT', name: 'Italy' },
  { code: 'ES', name: 'Spain' },
  { code: 'CH', name: 'Switzerland' },
  { code: 'IE', name: 'Ireland' },
  { code: 'NL', name: 'Netherlands' },
  { code: 'JP', name: 'Japan' },
  { code: 'KR', name: 'South Korea' },
  { code: 'SG', name: 'Singapore' },
]

export const countryName = (code: string) =>
  COUNTRIES.find((c) => c.code === code)?.name ?? code

export const CURRENCIES = ['USD', 'BDT', 'EUR', 'INR', 'CNY'] as const

export const UOMS = ['KG', 'G', 'MG', 'MT', 'L', 'ML', 'DRUM', 'PC'] as const

/** Conversion factors to a canonical unit per dimension (KG for mass, L for volume). */
const UOM_TO_BASE: Record<string, { dim: string; factor: number }> = {
  MT: { dim: 'MASS', factor: 1000 },
  KG: { dim: 'MASS', factor: 1 },
  G: { dim: 'MASS', factor: 0.001 },
  MG: { dim: 'MASS', factor: 0.000001 },
  L: { dim: 'VOLUME', factor: 1 },
  ML: { dim: 'VOLUME', factor: 0.001 },
  DRUM: { dim: 'COUNT', factor: 1 },
  PC: { dim: 'COUNT', factor: 1 },
}

/** Mirrors fn_convert_qty(): refuses rather than guessing across dimensions. */
export function convertQty(qty: number, from: string, to: string): number {
  if (from === to) return qty
  const a = UOM_TO_BASE[from]
  const b = UOM_TO_BASE[to]
  if (!a || !b || a.dim !== b.dim) {
    throw new Error(`No unit conversion defined from ${from} to ${to}`)
  }
  return (qty * a.factor) / b.factor
}

export const INCOTERMS = ['EXW', 'FOB', 'CFR', 'CIF', 'CIP', 'DDP'] as const

export const PAYMENT_TERMS = [
  { code: 'LC_AT_SIGHT', label: 'LC at sight', days: 0 },
  { code: 'LC_90D', label: 'LC 90 days', days: 90 },
  { code: 'LC_180D', label: 'LC 180 days', days: 180 },
  { code: 'TT_ADVANCE', label: 'TT in advance', days: 0 },
  { code: 'DA_60', label: 'Documents against acceptance, 60 days', days: 60 },
]

export const paymentTermLabel = (code: string | null) =>
  code ? (PAYMENT_TERMS.find((p) => p.code === code)?.label ?? code) : '—'

export const THERAPEUTIC_CATEGORIES = [
  'Respiratory',
  'Gastrointestinal',
  'Cardiovascular',
  'Anti-infective',
  'Central nervous system',
  'Oncology',
  'Endocrine & metabolic',
  'Analgesic & anti-inflammatory',
  'Dermatological',
  'Ophthalmic',
  'Vitamins & minerals',
]

export const DOCUMENT_TYPES = [
  { code: 'DMF', name: 'Drug Master File', expiring: false, warnDays: 90 },
  { code: 'CEP', name: 'Certificate of Suitability', expiring: true, warnDays: 180 },
  { code: 'GMP', name: 'GMP Certificate', expiring: true, warnDays: 90 },
  { code: 'WHO_GMP', name: 'WHO-GMP Certificate', expiring: true, warnDays: 90 },
  { code: 'COA', name: 'Certificate of Analysis', expiring: false, warnDays: 0 },
  { code: 'MSDS', name: 'Material Safety Data Sheet', expiring: false, warnDays: 0 },
  { code: 'SPEC', name: 'Product Specification', expiring: false, warnDays: 0 },
  { code: 'STABILITY', name: 'Stability Study Data', expiring: false, warnDays: 0 },
  { code: 'QUOTATION', name: 'Quotation', expiring: false, warnDays: 0 },
  { code: 'AGREEMENT', name: 'Agency Agreement', expiring: true, warnDays: 60 },
  { code: 'APPROVAL_LETTER', name: 'Client Approval Letter', expiring: false, warnDays: 0 },
  { code: 'INDENT_DOC', name: 'Indent Document', expiring: false, warnDays: 0 },
  { code: 'INVOICE', name: 'Invoice', expiring: false, warnDays: 0 },
  { code: 'LC_DOC', name: 'Letter of Credit', expiring: true, warnDays: 30 },
  { code: 'BL_AWB', name: 'Bill of Lading / Airway Bill', expiring: false, warnDays: 0 },
  { code: 'OTHER', name: 'Other', expiring: false, warnDays: 0 },
]

export const documentTypeName = (code: string) =>
  DOCUMENT_TYPES.find((d) => d.code === code)?.name ?? code

/** Reasons for rejecting, holding or discontinuing (FR-M6-08). */
export const REASONS: ReasonOption[] = [
  { code: 'PRICE_HIGH', name: 'Price too high', appliesTo: 'ENGAGEMENT' },
  { code: 'QUALITY_FAIL', name: 'Quality specification not met', appliesTo: 'SAMPLE' },
  { code: 'IMPURITY_PROFILE', name: 'Impurity profile unacceptable', appliesTo: 'SAMPLE' },
  { code: 'LEAD_TIME', name: 'Lead time too long', appliesTo: 'ENGAGEMENT' },
  { code: 'NO_DMF', name: 'Required DMF or CEP not available', appliesTo: 'ENGAGEMENT' },
  { code: 'REG_NOT_ACCEPTED', name: 'Source not accepted by regulator', appliesTo: 'ENGAGEMENT' },
  { code: 'MOQ_TOO_HIGH', name: 'Minimum order quantity too high', appliesTo: 'ENGAGEMENT' },
  { code: 'CLIENT_NO_RESPONSE', name: 'No response from client', appliesTo: 'ENGAGEMENT' },
  { code: 'PROJECT_SHELVED', name: 'Client shelved the project', appliesTo: 'ENGAGEMENT' },
  { code: 'COMPETITOR_WON', name: 'Lost to a competing supplier', appliesTo: 'ENGAGEMENT' },
  { code: 'PACKING_UNSUITABLE', name: 'Packing not suitable', appliesTo: 'SAMPLE' },
  { code: 'AWAITING_CLIENT', name: 'Waiting on the client', appliesTo: 'ENGAGEMENT' },
  {
    code: 'AWAITING_MANUFACTURER',
    name: 'Waiting on the manufacturer (sample, documents, price)',
    appliesTo: 'ENGAGEMENT',
  },
  { code: 'AWAITING_REGULATORY', name: 'Waiting on a regulatory step', appliesTo: 'ENGAGEMENT' },
  { code: 'SUPPLY_ISSUE', name: 'Manufacturer supply or quality issue', appliesTo: 'ENGAGEMENT' },
  {
    code: 'CLIENT_STOPPED_PRODUCT',
    name: 'Client stopped making the finished product',
    appliesTo: 'ENGAGEMENT',
  },
  { code: 'OTHER', name: 'Other', appliesTo: 'ENGAGEMENT' },
]

export const reasonName = (code: string | null) =>
  code ? (REASONS.find((r) => r.code === code)?.name ?? code) : null

export const reasonsFor = (appliesTo: ReasonOption['appliesTo']) =>
  REASONS.filter((r) => r.appliesTo === appliesTo || r.code === 'OTHER')

export const STAGE_CONFIG: StageConfig[] = [
  { stage: 'IDENTIFIED', ageingThresholdDays: 14, requiresReason: false, isTerminal: false, displayOrder: 1 },
  { stage: 'OFFERED', ageingThresholdDays: 21, requiresReason: false, isTerminal: false, displayOrder: 2 },
  { stage: 'SAMPLE_REQUESTED', ageingThresholdDays: 14, requiresReason: false, isTerminal: false, displayOrder: 3 },
  { stage: 'SAMPLE_SENT', ageingThresholdDays: 21, requiresReason: false, isTerminal: false, displayOrder: 4 },
  { stage: 'UNDER_EVALUATION', ageingThresholdDays: 60, requiresReason: false, isTerminal: false, displayOrder: 5 },
  { stage: 'APPROVED', ageingThresholdDays: 90, requiresReason: false, isTerminal: false, displayOrder: 6 },
  { stage: 'COMMERCIAL', ageingThresholdDays: 365, requiresReason: false, isTerminal: false, displayOrder: 7 },
  { stage: 'ON_HOLD', ageingThresholdDays: 90, requiresReason: true, isTerminal: false, displayOrder: 8 },
  { stage: 'REJECTED', ageingThresholdDays: 0, requiresReason: true, isTerminal: true, displayOrder: 9 },
  { stage: 'DISCONTINUED', ageingThresholdDays: 0, requiresReason: true, isTerminal: true, displayOrder: 10 },
]

export const stageConfig = (stage: EngagementStage) =>
  STAGE_CONFIG.find((s) => s.stage === stage)!

// ------------------------------------------------------------------ labels

export const STAGE_LABEL: Record<EngagementStage, string> = {
  IDENTIFIED: 'Identified',
  OFFERED: 'Offered',
  SAMPLE_REQUESTED: 'Sample requested',
  SAMPLE_SENT: 'Sample sent',
  UNDER_EVALUATION: 'Under evaluation',
  APPROVED: 'Approved',
  COMMERCIAL: 'Commercial',
  ON_HOLD: 'On hold',
  REJECTED: 'Rejected',
  DISCONTINUED: 'Discontinued',
}

/** Tailwind classes per stage: text, background, border, and a solid dot. */
export const STAGE_STYLE: Record<EngagementStage, { chip: string; dot: string; bar: string }> = {
  IDENTIFIED: { chip: 'text-[#4b5563] bg-[#eef0f3] border-[#d8dce2]', dot: 'bg-[#7c8694]', bar: 'bg-[#7c8694]' },
  OFFERED: { chip: 'text-[#1f4f79] bg-[#e8f1f9] border-[#c6ddef]', dot: 'bg-[#2f6fa8]', bar: 'bg-[#2f6fa8]' },
  SAMPLE_REQUESTED: { chip: 'text-[#573f8f] bg-[#f0ecfa] border-[#dad0f1]', dot: 'bg-[#7a57c4]', bar: 'bg-[#7a57c4]' },
  SAMPLE_SENT: { chip: 'text-[#573f8f] bg-[#f0ecfa] border-[#dad0f1]', dot: 'bg-[#9b7fd4]', bar: 'bg-[#9b7fd4]' },
  UNDER_EVALUATION: { chip: 'text-[#8a5a1a] bg-[#fdf3e3] border-[#f0ddbd]', dot: 'bg-[#b4762a]', bar: 'bg-[#b4762a]' },
  APPROVED: { chip: 'text-[#0f6153] bg-[#e7f6f1] border-[#bfe5da]', dot: 'bg-[#15806a]', bar: 'bg-[#15806a]' },
  COMMERCIAL: { chip: 'text-[#0a5240] bg-[#e2f4ec] border-[#b4e0cd]', dot: 'bg-[#0c6b4f]', bar: 'bg-[#0c6b4f]' },
  ON_HOLD: { chip: 'text-[#7a5210] bg-[#fdf6e8] border-[#f0e0b9]', dot: 'bg-[#9a6714]', bar: 'bg-[#9a6714]' },
  REJECTED: { chip: 'text-[#8d2d27] bg-[#fdeeed] border-[#f3cdca]', dot: 'bg-[#b23a34]', bar: 'bg-[#b23a34]' },
  DISCONTINUED: { chip: 'text-[#56504a] bg-[#f3f1ee] border-[#ded9d2]', dot: 'bg-[#6b6257]', bar: 'bg-[#6b6257]' },
}

export const CLIENT_STATUS_LABEL: Record<ClientStatus, string> = {
  PROSPECT: 'Prospect',
  ACTIVE: 'Active',
  DORMANT: 'Dormant',
  LOST: 'Lost',
}

export const MANUFACTURER_STATUS_LABEL: Record<ManufacturerStatus, string> = {
  NEW: 'New',
  UNDER_DEVELOPMENT: 'Under development',
  EXISTING_COMMERCIAL: 'Existing / commercial',
  INACTIVE: 'Inactive',
  BLACKLISTED: 'Blacklisted',
}

export const PRODUCT_CATEGORY_LABEL: Record<ProductCategory, string> = {
  API: 'API',
  EXCIPIENT: 'Excipient',
  INTERMEDIATE: 'Intermediate',
  OTHER: 'Other',
}

export const MP_STATUS_LABEL: Record<MpStatus, string> = {
  ACTIVE: 'Active',
  IN_DEVELOPMENT: 'In development',
  DISCONTINUED: 'Discontinued',
}

export const SITE_KIND_LABEL: Record<SiteKind, string> = {
  HEAD_OFFICE: 'Head office',
  PLANT: 'Plant',
  WAREHOUSE: 'Warehouse',
  RND_CENTRE: 'R&D centre',
}

/** Clients call a head office a corporate office and a plant a factory. */
export const SITE_KIND_LABEL_CLIENT: Record<SiteKind, string> = {
  ...SITE_KIND_LABEL,
  HEAD_OFFICE: 'Corporate office',
  PLANT: 'Factory',
}

export const REPRESENTATION_LABEL: Record<RepresentationKind, string> = {
  EXCLUSIVE_AGENT: 'Exclusive agent',
  NON_EXCLUSIVE_AGENT: 'Non-exclusive agent',
  INDENT: 'Indent',
  DISTRIBUTOR: 'Distributor',
}

export const REQUIREMENT_KIND_LABEL: Record<RequirementKind, string> = {
  NEW_DEVELOPMENT: 'New development',
  ALTERNATE_SOURCE: 'Alternate source',
}

export const REQUIREMENT_STATUS_LABEL: Record<RequirementStatus, string> = {
  OPEN: 'Open',
  SOURCING: 'Sourcing',
  ENGAGED: 'Engaged',
  FULFILLED: 'Fulfilled',
  CLOSED_LOST: 'Closed — lost',
  CANCELLED: 'Cancelled',
}

export const ALTERNATE_REASONS = [
  { code: 'PRICE', label: 'Price' },
  { code: 'QUALITY', label: 'Quality' },
  { code: 'LEAD_TIME', label: 'Lead time' },
  { code: 'DUAL_SOURCING', label: 'Dual-sourcing policy' },
  { code: 'REGULATORY', label: 'Regulatory' },
]

export const ORDER_STATUS_LABEL: Record<OrderStatus, string> = {
  DRAFT: 'Draft',
  OPEN: 'Open',
  PARTIALLY_SHIPPED: 'Partly shipped',
  SHIPPED: 'Shipped',
  COMPLETED: 'Completed',
  CANCELLED: 'Cancelled',
  ON_HOLD: 'On hold',
}

export const SHIPMENT_STATUS_LABEL: Record<ShipmentStatus, string> = {
  PLANNED: 'Planned',
  IN_TRANSIT: 'In transit',
  ARRIVED: 'Arrived',
  HELD_AT_CUSTOMS: 'Held at customs',
  CLEARED: 'Cleared',
  DELIVERED: 'Delivered',
  CANCELLED: 'Cancelled',
}

/** The forward sequence a shipment normally follows, for the stepper. */
export const SHIPMENT_FLOW: ShipmentStatus[] = [
  'PLANNED',
  'IN_TRANSIT',
  'ARRIVED',
  'CLEARED',
  'DELIVERED',
]

export const SHIPMENT_MODE_LABEL: Record<ShipmentMode, string> = {
  AIR: 'Air',
  SEA: 'Sea',
  COURIER: 'Courier',
  ROAD: 'Road',
}

export const OFFER_STATUS_LABEL: Record<OfferStatus, string> = {
  DRAFT: 'Draft',
  SENT: 'Sent',
  SUPERSEDED: 'Superseded',
  ACCEPTED: 'Accepted',
  DECLINED: 'Declined',
  EXPIRED: 'Expired',
}

export const SAMPLE_PURPOSE_LABEL: Record<SamplePurpose, string> = {
  EVALUATION: 'Evaluation',
  REGISTRATION: 'Registration',
  STABILITY: 'Stability',
  TRIAL_BATCH: 'Trial batch',
}

export const SAMPLE_OUTCOME_LABEL: Record<SampleOutcome, string> = {
  PENDING: 'Pending',
  PASS: 'Pass',
  FAIL: 'Fail',
  CANCELLED: 'Cancelled',
}

export const COMMISSION_STATUS_LABEL: Record<CommissionStatus, string> = {
  PENDING: 'Pending',
  INVOICED: 'Invoiced',
  PARTIALLY_RECEIVED: 'Partly received',
  RECEIVED: 'Received',
  WRITTEN_OFF: 'Written off',
}

export const COMMISSION_BASIS_LABEL: Record<CommissionBasis, string> = {
  PERCENT_OF_VALUE: 'Percentage of indent value',
  FIXED_AMOUNT: 'Fixed amount',
  TBD: 'To be decided',
}

export const FILING_LABEL: Record<FilingKind, string> = {
  DMF: 'DMF',
  ASMF: 'ASMF',
  CEP: 'CEP',
  OTHER: 'Other filing',
}

export const PHARMACOPOEIAS: Pharmacopoeia[] = ['USP', 'BP', 'EP', 'IP', 'JP', 'IH', 'OTHER']

export const REGULATORY_AUTHORITIES = ['USFDA', 'EDQM', 'EMA', 'PMDA', 'NMPA', 'DGDA', 'MHRA', 'TGA']

export const PORTS = {
  loading: ['Nhava Sheva, IN', 'Mundra, IN', 'Chennai, IN', 'Shanghai, CN', 'Ningbo, CN', 'Hamburg, DE', 'Barcelona, ES'],
  discharge: ['Chattogram, BD', 'Dhaka (Air), BD', 'Mongla, BD'],
}

export const FORWARDERS = ['Maersk Logistics', 'DHL Global Forwarding', 'Kuehne+Nagel', 'Expeditors', 'MSC Logistics']
export const CNF_AGENTS = ['Rahman & Sons C&F', 'Padma Clearing Agency', 'Chattogram Port Services', 'Unique C&F']
export const COURIERS = ['DHL', 'FedEx', 'UPS', 'Aramex']
export const BANKS = [
  'Standard Chartered Bangladesh',
  'HSBC Bangladesh',
  'City Bank PLC',
  'BRAC Bank PLC',
  'Eastern Bank PLC',
  'Dutch-Bangla Bank',
]

export const DEFAULT_SETTINGS = {
  overshipmentTolerancePct: 2,
  minShelfLifeMonths: 24,
  sessionIdleMinutes: 30,
  loginLockoutAttempts: 5,
  maxUploadMb: 25,
  reportSyncRowLimit: 50000,
  docExpiryWarnDays: 90,
}

/** Permission codes, as seeded in the schema. Read-only ones are held by both roles. */
export const READ_ONLY_PERMISSIONS = [
  'user.view',
  'role.view',
  'reference.view',
  'manufacturer.view',
  'product.view',
  'manufacturer_product.view',
  'price.view',
  'client.view',
  'requirement.view',
  'engagement.view',
  'engagement.read_cross_client',
  'offer.view',
  'sample.view',
  'order.view',
  'shipment.view',
  'commission.view',
  'discovery.view',
  'document.view',
  'report.view',
  'report.export',
  'audit.view',
] as const

export const WRITE_PERMISSIONS = [
  'user.manage',
  'role.manage',
  'reference.manage',
  'setting.manage',
  'workflow.manage',
  'manufacturer.create',
  'manufacturer.edit',
  'manufacturer.delete',
  'manufacturer.set_status',
  'product.create',
  'product.edit',
  'product.delete',
  'manufacturer_product.manage',
  'portfolio.manage',
  'price.manage',
  'client.create',
  'client.edit',
  'client.delete',
  'client.reassign_owner',
  'requirement.manage',
  'engagement.manage',
  'engagement.change_stage',
  'engagement.approve',
  'engagement.override_stage',
  'engagement.reopen',
  'offer.manage',
  'sample.manage',
  'sample.record_outcome',
  'order.manage',
  'order.override_approval_check',
  'shipment.manage',
  'commission.manage',
  'document.upload',
  'document.delete',
  'duplicate.merge',
] as const

export type Permission =
  | (typeof READ_ONLY_PERMISSIONS)[number]
  | (typeof WRITE_PERMISSIONS)[number]
