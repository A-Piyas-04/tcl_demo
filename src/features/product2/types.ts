/**
 * Product 2.0 data model. Deliberately independent of the main prototype
 * database (src/data) so it can be wired to the rest of the application later.
 *
 * Each table is its own collection, keyed by id, linked by foreign keys:
 *
 *   ApiProduct 1─* SourcingRecord 1─* SampleRecord
 *   ApiProduct 1─* TradeOrder ─1 SourcingRecord (the approved source it buys from)
 *   TradeOrder 1─* PiIndent, LcRecord, ShipmentRecord, CommissionRecord
 *
 * Money and quantities are decimal strings (see decimal.ts), never floats.
 * Dates are ISO yyyy-mm-dd; timestamps are full ISO strings.
 */

export type ID = string
export type IsoDate = string
export type IsoDateTime = string
export type DecimalString = string

interface Timestamps {
  createdAt: IsoDateTime
  updatedAt: IsoDateTime
}

// ------------------------------------------------------------- directory

export type PartyKind = 'MANUFACTURER' | 'INTERMEDIARY' | 'CLIENT'

export interface Party extends Timestamps {
  id: ID
  kind: PartyKind
  name: string
  country: string
  contactName: string | null
  email: string | null
  phone: string | null
}

// ----------------------------------------------------------- API product

export interface ApiProduct extends Timestamps {
  id: ID
  name: string
  casNumber: string | null
  synonyms: string[]
  therapeuticArea: string
  /** pharmacopoeial grade, e.g. USP, EP, BP */
  grade: string | null
  description: string | null
  isActive: boolean
}

// --------------------------------------------------------------- sourcing

export interface SourcingRecord extends Timestamps {
  id: ID
  apiProductId: ID
  manufacturerId: ID
  /** trader/agent between TCL and the manufacturer, when there is one */
  intermediaryId: ID | null
  identifiedOn: IsoDate
  /** indicative price quoted at identification, for reference only */
  indicativePrice: DecimalString | null
  priceCurrency: string
  priceUom: string
  hasDmf: boolean
  hasCep: boolean
  notes: string | null
}

export type SampleStatus = 'SUBMITTED' | 'ACCEPTED' | 'REJECTED'

export interface SampleRecord extends Timestamps {
  id: ID
  sourcingId: ID
  roundNo: number
  quantity: DecimalString
  uom: string
  submittedOn: IsoDate
  /** client the sample was given to for evaluation, when known */
  submittedToClientId: ID | null
  courierRef: string | null
  coaRef: string | null
  status: SampleStatus
  decidedOn: IsoDate | null
  rejectionReason: string | null
  decisionRemarks: string | null
}

/** Derived, never stored. */
export type SourcingStatus = 'IDENTIFIED' | 'SAMPLE_SUBMITTED' | 'ACCEPTED' | 'REJECTED'

// ------------------------------------------------------------------ trade

export interface TradeOrder extends Timestamps {
  id: ID
  orderRef: string
  apiProductId: ID
  sourcingId: ID
  clientId: ID
  clientPoRef: string | null
  orderDate: IsoDate
  requiredBy: IsoDate | null
  quantity: DecimalString
  uom: string
  currency: string
  /** FOB price per unit of measure */
  fobUnitPrice: DecimalString
  /** freight and other transport charges for the whole order */
  transportCharges: DecimalString
  incoterm: string
  remarks: string | null
  /** manual client-order confirmation */
  confirmedOn: IsoDate | null
}

export interface PiIndent extends Timestamps {
  id: ID
  tradeOrderId: ID
  piNumber: string
  piDate: IsoDate
  quantity: DecimalString
  remarks: string | null
}

export type LcStatus = 'DRAFT' | 'OPENED'

export interface LcRecord extends Timestamps {
  id: ID
  tradeOrderId: ID
  lcNumber: string
  issuingBank: string
  advisingBank: string | null
  amount: DecimalString
  currency: string
  openedOn: IsoDate
  expiryDate: IsoDate
  latestShipmentDate: IsoDate
  status: LcStatus
  confirmedOn: IsoDate | null
  remarks: string | null
}

export type ShipmentStatus = 'IN_PROGRESS' | 'SHIPPED' | 'DELIVERED'
export type ShipmentMode = 'SEA' | 'AIR' | 'ROAD' | 'COURIER'

export interface ShipmentRecord extends Timestamps {
  id: ID
  tradeOrderId: ID
  status: ShipmentStatus
  mode: ShipmentMode
  carrier: string | null
  blAwbNumber: string | null
  portOfLoading: string | null
  portOfDischarge: string | null
  etd: IsoDate | null
  eta: IsoDate | null
  shippedOn: IsoDate | null
  deliveredOn: IsoDate | null
  deliveryRemarks: string | null
}

export type CommissionBasis = 'FOB' | 'TOTAL'
export type CommissionStatus = 'EXPECTED' | 'RECEIVED'

export interface CommissionRecord extends Timestamps {
  id: ID
  tradeOrderId: ID
  basis: CommissionBasis
  /** e.g. "2.5" for 2.5% */
  percentage: DecimalString
  status: CommissionStatus
  receivedAmount: DecimalString | null
  receivedOn: IsoDate | null
  receiptRef: string | null
  remarks: string | null
}

export type TradeStageKey = 'CLIENT_ORDER' | 'PI_PLACED' | 'LC_OPENED' | 'SHIPMENT' | 'DELIVERED' | 'COMMISSION'

// --------------------------------------------------------------- database

export interface P2Data {
  version: 1
  parties: Party[]
  apiProducts: ApiProduct[]
  sourcing: SourcingRecord[]
  samples: SampleRecord[]
  tradeOrders: TradeOrder[]
  piIndents: PiIndent[]
  lcs: LcRecord[]
  shipments: ShipmentRecord[]
  commissions: CommissionRecord[]
  /** running counter for TO-YYYY-NNN references */
  orderSeq: number
}
