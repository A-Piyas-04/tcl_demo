/**
 * Product 2.0 store and service layer.
 *
 * Independent of the main prototype database: its own collections, saved to
 * localStorage so changes survive a page refresh. Every write goes through an
 * action here that validates input and enforces the workflow, exactly where a
 * real API would — swapping in a backend later means replacing these bodies.
 */

import { create } from 'zustand'
import { createJSONStorage, persist } from 'zustand/middleware'
import { delay, ForbiddenError, RuleError } from '@/data/api'
import { store as appStore } from '@/data/store'
import { buildP2Seed } from './seed'
import { dec, isDecimalString, toFixed } from './decimal'
import { samplesFor, sourcingStatus, tradeBundle } from './workflow'
import type {
  ApiProduct,
  CommissionBasis,
  ID,
  IsoDate,
  LcRecord,
  P2Data,
  Party,
  PartyKind,
  SampleRecord,
  ShipmentMode,
  ShipmentRecord,
  SourcingRecord,
  TradeOrder,
} from './types'

const STORAGE_KEY = 'tcl.product2.v1'

interface P2State {
  data: P2Data
  apply: (fn: (d: P2Data) => void) => void
  reset: () => void
}

export const useP2Store = create<P2State>()(
  persist(
    (set) => ({
      data: buildP2Seed(),
      apply: (fn) =>
        set((s) => {
          const next = structuredClone(s.data)
          fn(next)
          return { data: next }
        }),
      reset: () => set({ data: buildP2Seed() }),
    }),
    {
      name: STORAGE_KEY,
      storage: createJSONStorage(() => localStorage),
      partialize: (s) => ({ data: s.data }),
      version: 1,
    },
  ),
)

export const useP2 = () => useP2Store((s) => s.data)
const read = () => useP2Store.getState().data

// ------------------------------------------------------------ primitives

const nowIso = () => new Date().toISOString()
const todayIso = () => nowIso().slice(0, 10)
let seq = 0
const newId = (prefix: string) => `${prefix}_${Date.now().toString(36)}${(++seq).toString(36)}`

function guard(what: string) {
  if (!appStore.canWrite()) throw new ForbiddenError(what)
}

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/
function isDate(s: string | null | undefined): s is string {
  if (!s || !DATE_RE.test(s)) return false
  const d = new Date(`${s}T00:00:00Z`)
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === s
}

function requireDate(value: string | null | undefined, label: string): IsoDate {
  if (!isDate(value)) throw new RuleError(`${label} must be a valid date.`)
  return value
}

function optionalDate(value: string | null | undefined, label: string): IsoDate | null {
  if (!value) return null
  return requireDate(value, label)
}

function notFuture(value: IsoDate, label: string) {
  if (value > todayIso()) throw new RuleError(`${label} cannot be in the future.`)
}

function requireText(value: string | null | undefined, label: string, max = 200): string {
  const t = (value ?? '').trim()
  if (!t) throw new RuleError(`${label} is required.`)
  if (t.length > max) throw new RuleError(`${label} must be ${max} characters or fewer.`)
  return t
}

const optText = (value: string | null | undefined): string | null => {
  const t = (value ?? '').trim()
  return t ? t : null
}

function positiveDecimal(value: string | null | undefined, label: string, maxDp = 4): string {
  const s = (value ?? '').replace(/,/g, '').trim()
  if (!s) throw new RuleError(`${label} is required.`)
  if (!isDecimalString(s, maxDp)) throw new RuleError(`${label} must be a number with at most ${maxDp} decimal places.`)
  if (dec(s) <= 0n) throw new RuleError(`${label} must be greater than zero.`)
  return toFixed(dec(s), maxDp)
}

function nonNegativeDecimal(value: string | null | undefined, label: string, maxDp = 2): string {
  const s = (value ?? '').replace(/,/g, '').trim() || '0'
  if (!isDecimalString(s, maxDp)) throw new RuleError(`${label} must be a number with at most ${maxDp} decimal places.`)
  return toFixed(dec(s), maxDp)
}

function percentage(value: string | null | undefined): string {
  const s = (value ?? '').trim()
  if (!s) throw new RuleError('Commission percentage is required.')
  if (!isDecimalString(s, 4)) throw new RuleError('Commission percentage must be a number with at most 4 decimal places.')
  const d = dec(s)
  if (d <= 0n) throw new RuleError('Commission percentage must be greater than zero.')
  if (d > dec('100')) throw new RuleError('Commission percentage cannot exceed 100%.')
  return toFixed(d, 4)
}

function must<T>(value: T | undefined | null, what: string): T {
  if (value == null) throw new RuleError(`${what} no longer exists. Refresh and try again.`)
  return value
}

async function write<T>(what: string, fn: (d: P2Data) => T): Promise<T> {
  guard(what)
  await delay('write')
  // validate against a working copy first so a refusal leaves nothing half-written
  const working = structuredClone(read())
  const result = fn(working)
  useP2Store.setState({ data: working })
  return result
}

// ---------------------------------------------------------------- parties

export interface PartyInput {
  kind: PartyKind
  name: string
  country: string
  contactName?: string
  email?: string
  phone?: string
}

export function createParty(input: PartyInput): Promise<ID> {
  return write('Adding a company', (d) => {
    const name = requireText(input.name, 'Company name', 120)
    const country = requireText(input.country, 'Country', 60)
    if (d.parties.some((p) => p.kind === input.kind && p.name.toLowerCase() === name.toLowerCase())) {
      throw new RuleError(`${name} is already in the list.`)
    }
    const email = optText(input.email)
    if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new RuleError('Email address is not valid.')
    const id = newId(input.kind === 'CLIENT' ? 'p2c' : input.kind === 'MANUFACTURER' ? 'p2m' : 'p2i')
    const party: Party = {
      id,
      kind: input.kind,
      name,
      country,
      contactName: optText(input.contactName),
      email,
      phone: optText(input.phone),
      createdAt: nowIso(),
      updatedAt: nowIso(),
    }
    d.parties.push(party)
    return id
  })
}

// ------------------------------------------------------------ API product

export interface ApiInput {
  name: string
  casNumber: string
  synonyms: string[]
  therapeuticArea: string
  grade: string
  description: string
}

const CAS_RE = /^\d{2,7}-\d{2}-\d$/

function validateApi(d: P2Data, input: ApiInput, selfId: ID | null) {
  const name = requireText(input.name, 'API name', 120)
  const cas = optText(input.casNumber)
  if (cas && !CAS_RE.test(cas)) throw new RuleError('CAS number must look like 1115-70-4.')
  const clash = d.apiProducts.find((a) => a.id !== selfId && a.name.toLowerCase() === name.toLowerCase())
  if (clash) throw new RuleError(`An API named “${clash.name}” already exists.`)
  const casClash = cas && d.apiProducts.find((a) => a.id !== selfId && a.casNumber === cas)
  if (casClash) throw new RuleError(`CAS ${cas} is already used by ${casClash.name}.`)
  return {
    name,
    casNumber: cas,
    synonyms: [...new Set(input.synonyms.map((s) => s.trim()).filter(Boolean))],
    therapeuticArea: requireText(input.therapeuticArea, 'Therapeutic area', 60),
    grade: optText(input.grade),
    description: optText(input.description),
  }
}

export function createApi(input: ApiInput): Promise<ID> {
  return write('Adding an API product', (d) => {
    const fields = validateApi(d, input, null)
    const id = newId('p2a')
    const row: ApiProduct = { id, ...fields, isActive: true, createdAt: nowIso(), updatedAt: nowIso() }
    d.apiProducts.push(row)
    return id
  })
}

export function updateApi(id: ID, input: ApiInput): Promise<void> {
  return write('Editing an API product', (d) => {
    const row = must(d.apiProducts.find((a) => a.id === id), 'This API')
    Object.assign(row, validateApi(d, input, id), { updatedAt: nowIso() })
  })
}

export function setApiActive(id: ID, isActive: boolean): Promise<void> {
  return write(isActive ? 'Restoring an API product' : 'Archiving an API product', (d) => {
    const row = must(d.apiProducts.find((a) => a.id === id), 'This API')
    if (!isActive) {
      const open = d.tradeOrders.filter((o) => o.apiProductId === id && tradeBundle(d, o).commission?.status !== 'RECEIVED')
      if (open.length) throw new RuleError(`${row.name} has ${open.length} open trade order(s). Finish or remove them first.`)
    }
    row.isActive = isActive
    row.updatedAt = nowIso()
  })
}

// --------------------------------------------------------------- sourcing

export interface SourcingInput {
  manufacturerId: ID
  intermediaryId: ID | null
  identifiedOn: string
  indicativePrice: string
  priceCurrency: string
  priceUom: string
  hasDmf: boolean
  hasCep: boolean
  notes: string
}

function validateSourcing(d: P2Data, apiProductId: ID, input: SourcingInput, selfId: ID | null) {
  const mfr = d.parties.find((p) => p.id === input.manufacturerId && p.kind === 'MANUFACTURER')
  if (!mfr) throw new RuleError('Choose the manufacturer.')
  if (input.intermediaryId && !d.parties.some((p) => p.id === input.intermediaryId && p.kind === 'INTERMEDIARY')) {
    throw new RuleError('The intermediary supplier was not found.')
  }
  const dupe = d.sourcing.find(
    (s) =>
      s.id !== selfId &&
      s.apiProductId === apiProductId &&
      s.manufacturerId === input.manufacturerId &&
      (s.intermediaryId ?? null) === (input.intermediaryId ?? null),
  )
  if (dupe) throw new RuleError(`${mfr.name} is already recorded as a source for this API through the same channel.`)
  const identifiedOn = requireDate(input.identifiedOn, 'Identified on')
  notFuture(identifiedOn, 'Identified on')
  const price = optText(input.indicativePrice)
  return {
    manufacturerId: mfr.id,
    intermediaryId: input.intermediaryId || null,
    identifiedOn,
    indicativePrice: price ? positiveDecimal(price, 'Indicative price') : null,
    priceCurrency: requireText(input.priceCurrency, 'Currency', 3).toUpperCase(),
    priceUom: requireText(input.priceUom, 'Unit', 10),
    hasDmf: input.hasDmf,
    hasCep: input.hasCep,
    notes: optText(input.notes),
  }
}

export function addSourcing(apiProductId: ID, input: SourcingInput): Promise<ID> {
  return write('Adding a source', (d) => {
    const apiRow = must(d.apiProducts.find((a) => a.id === apiProductId), 'This API')
    if (!apiRow.isActive) throw new RuleError(`${apiRow.name} is archived. Restore it before adding sources.`)
    const fields = validateSourcing(d, apiProductId, input, null)
    const id = newId('p2s')
    const row: SourcingRecord = { id, apiProductId, ...fields, createdAt: nowIso(), updatedAt: nowIso() }
    d.sourcing.push(row)
    return id
  })
}

export function updateSourcing(id: ID, input: SourcingInput): Promise<void> {
  return write('Editing a source', (d) => {
    const row = must(d.sourcing.find((s) => s.id === id), 'This source')
    const fields = validateSourcing(d, row.apiProductId, input, id)
    if (fields.manufacturerId !== row.manufacturerId && d.tradeOrders.some((o) => o.sourcingId === id)) {
      throw new RuleError('The manufacturer cannot change: trade orders already buy from this source.')
    }
    Object.assign(row, fields, { updatedAt: nowIso() })
  })
}

export function deleteSourcing(id: ID): Promise<void> {
  return write('Removing a source', (d) => {
    must(d.sourcing.find((s) => s.id === id), 'This source')
    if (d.samples.some((s) => s.sourcingId === id)) {
      throw new RuleError('This source has sample records. Only a source with no samples can be removed.')
    }
    d.sourcing = d.sourcing.filter((s) => s.id !== id)
  })
}

// ---------------------------------------------------------------- samples

export interface SampleInput {
  quantity: string
  uom: string
  submittedOn: string
  submittedToClientId: ID | null
  courierRef: string
  coaRef: string
}

export function submitSample(sourcingId: ID, input: SampleInput): Promise<ID> {
  return write('Recording a sample submission', (d) => {
    const source = must(d.sourcing.find((s) => s.id === sourcingId), 'This source')
    const status = sourcingStatus(d, sourcingId)
    if (status === 'ACCEPTED') throw new RuleError('A sample from this source is already accepted. No further rounds are needed.')
    if (status === 'SAMPLE_SUBMITTED') {
      throw new RuleError('A sample is still awaiting a decision. Accept or reject it before submitting another round.')
    }
    const submittedOn = requireDate(input.submittedOn, 'Submitted on')
    notFuture(submittedOn, 'Submitted on')
    if (submittedOn < source.identifiedOn) throw new RuleError('A sample cannot be submitted before the source was identified.')
    const previous = samplesFor(d, sourcingId)
    const last = previous[previous.length - 1]
    if (last?.decidedOn && submittedOn < last.decidedOn) {
      throw new RuleError(`Round ${last.roundNo + 1} cannot be dated before round ${last.roundNo} was decided (${last.decidedOn}).`)
    }
    if (input.submittedToClientId && !d.parties.some((p) => p.id === input.submittedToClientId && p.kind === 'CLIENT')) {
      throw new RuleError('The client was not found.')
    }
    const id = newId('p2x')
    const row: SampleRecord = {
      id,
      sourcingId,
      roundNo: (last?.roundNo ?? 0) + 1,
      quantity: positiveDecimal(input.quantity, 'Sample quantity'),
      uom: requireText(input.uom, 'Unit', 10),
      submittedOn,
      submittedToClientId: input.submittedToClientId || null,
      courierRef: optText(input.courierRef),
      coaRef: optText(input.coaRef),
      status: 'SUBMITTED',
      decidedOn: null,
      rejectionReason: null,
      decisionRemarks: null,
      createdAt: nowIso(),
      updatedAt: nowIso(),
    }
    d.samples.push(row)
    return id
  })
}

export interface DecisionInput {
  decision: 'ACCEPTED' | 'REJECTED'
  decidedOn: string
  rejectionReason: string
  remarks: string
}

export function decideSample(sampleId: ID, input: DecisionInput): Promise<void> {
  return write(input.decision === 'ACCEPTED' ? 'Accepting a sample' : 'Rejecting a sample', (d) => {
    const row = must(d.samples.find((s) => s.id === sampleId), 'This sample')
    if (row.status !== 'SUBMITTED') throw new RuleError(`Round ${row.roundNo} was already ${row.status.toLowerCase()}.`)
    const decidedOn = requireDate(input.decidedOn, 'Decision date')
    notFuture(decidedOn, 'Decision date')
    if (decidedOn < row.submittedOn) throw new RuleError('The decision cannot be dated before the sample was submitted.')
    row.status = input.decision
    row.decidedOn = decidedOn
    row.rejectionReason = input.decision === 'REJECTED' ? requireText(input.rejectionReason, 'Rejection reason', 300) : null
    row.decisionRemarks = optText(input.remarks)
    row.updatedAt = nowIso()
  })
}

/** Undo a decision recorded in error — only while nothing depends on it. */
export function reopenSample(sampleId: ID): Promise<void> {
  return write('Reopening a sample decision', (d) => {
    const row = must(d.samples.find((s) => s.id === sampleId), 'This sample')
    if (row.status === 'SUBMITTED') throw new RuleError('This sample has no decision to reopen.')
    const later = d.samples.some((s) => s.sourcingId === row.sourcingId && s.roundNo > row.roundNo)
    if (later) throw new RuleError('A later sample round exists. Only the latest decision can be reopened.')
    if (row.status === 'ACCEPTED' && d.tradeOrders.some((o) => o.sourcingId === row.sourcingId)) {
      throw new RuleError('Trade orders already rely on this approval, so it cannot be reopened.')
    }
    row.status = 'SUBMITTED'
    row.decidedOn = null
    row.rejectionReason = null
    row.decisionRemarks = null
    row.updatedAt = nowIso()
  })
}

// ------------------------------------------------------------ trade order

export interface OrderInput {
  sourcingId: ID
  clientId: ID
  clientPoRef: string
  orderDate: string
  requiredBy: string
  quantity: string
  uom: string
  currency: string
  fobUnitPrice: string
  transportCharges: string
  incoterm: string
  remarks: string
  commissionBasis: CommissionBasis
  commissionPct: string
}

function validateOrder(d: P2Data, apiProductId: ID, input: OrderInput, selfId: ID | null) {
  const source = d.sourcing.find((s) => s.id === input.sourcingId && s.apiProductId === apiProductId)
  if (!source) throw new RuleError('Choose the source this order buys from.')
  if (sourcingStatus(d, source.id) !== 'ACCEPTED') {
    throw new RuleError('Bulk orders can only be placed on a source whose sample has been accepted.')
  }
  const client = d.parties.find((p) => p.id === input.clientId && p.kind === 'CLIENT')
  if (!client) throw new RuleError('Choose the client.')
  const orderDate = requireDate(input.orderDate, 'Order date')
  notFuture(orderDate, 'Order date')
  const requiredBy = optionalDate(input.requiredBy, 'Required by')
  if (requiredBy && requiredBy < orderDate) throw new RuleError('Required-by date cannot be before the order date.')
  const po = optText(input.clientPoRef)
  if (po && d.tradeOrders.some((o) => o.id !== selfId && o.clientId === client.id && o.clientPoRef?.toLowerCase() === po.toLowerCase())) {
    throw new RuleError(`${client.name} PO ${po} is already recorded on another order.`)
  }
  return {
    sourcingId: source.id,
    clientId: client.id,
    clientPoRef: po,
    orderDate,
    requiredBy,
    quantity: positiveDecimal(input.quantity, 'Order quantity'),
    uom: requireText(input.uom, 'Unit', 10),
    currency: requireText(input.currency, 'Currency', 3).toUpperCase(),
    fobUnitPrice: positiveDecimal(input.fobUnitPrice, 'FOB unit price'),
    transportCharges: nonNegativeDecimal(input.transportCharges, 'Transport charges'),
    incoterm: requireText(input.incoterm, 'Incoterm', 10),
    remarks: optText(input.remarks),
  }
}

export function createOrder(apiProductId: ID, input: OrderInput): Promise<ID> {
  return write('Creating a trade order', (d) => {
    const apiRow = must(d.apiProducts.find((a) => a.id === apiProductId), 'This API')
    if (!apiRow.isActive) throw new RuleError(`${apiRow.name} is archived.`)
    const fields = validateOrder(d, apiProductId, input, null)
    const pct = percentage(input.commissionPct)
    const id = newId('p2o')
    d.orderSeq += 1
    const year = fields.orderDate.slice(0, 4)
    const row: TradeOrder = {
      id,
      orderRef: `TO-${year}-${String(d.orderSeq).padStart(3, '0')}`,
      apiProductId,
      ...fields,
      confirmedOn: null,
      createdAt: nowIso(),
      updatedAt: nowIso(),
    }
    d.tradeOrders.push(row)
    d.commissions.push({
      id: newId('p2cm'),
      tradeOrderId: id,
      basis: input.commissionBasis,
      percentage: pct,
      status: 'EXPECTED',
      receivedAmount: null,
      receivedOn: null,
      receiptRef: null,
      remarks: null,
      createdAt: nowIso(),
      updatedAt: nowIso(),
    })
    return id
  })
}

/** Order terms are editable until a PI is placed against them; edits touch only this order. */
export function updateOrder(id: ID, input: Omit<OrderInput, 'commissionBasis' | 'commissionPct'>): Promise<void> {
  return write('Editing a trade order', (d) => {
    const row = must(d.tradeOrders.find((o) => o.id === id), 'This order')
    if (d.piIndents.some((p) => p.tradeOrderId === id)) {
      throw new RuleError('A PI has been placed on this order, so its quantity and price are fixed.')
    }
    const fields = validateOrder(d, row.apiProductId, { ...input, commissionBasis: 'FOB', commissionPct: '1' }, id)
    if (row.confirmedOn && fields.orderDate > row.confirmedOn) {
      throw new RuleError('Order date cannot be after the confirmation date.')
    }
    Object.assign(row, fields, { updatedAt: nowIso() })
  })
}

export function confirmOrder(id: ID, confirmedOn: string): Promise<void> {
  return write('Confirming a client order', (d) => {
    const row = must(d.tradeOrders.find((o) => o.id === id), 'This order')
    if (row.confirmedOn) throw new RuleError(`${row.orderRef} was already confirmed on ${row.confirmedOn}.`)
    const date = requireDate(confirmedOn, 'Confirmation date')
    notFuture(date, 'Confirmation date')
    if (date < row.orderDate) throw new RuleError('Confirmation cannot be dated before the order date.')
    row.confirmedOn = date
    row.updatedAt = nowIso()
  })
}

export function deleteOrder(id: ID): Promise<void> {
  return write('Deleting a trade order', (d) => {
    const row = must(d.tradeOrders.find((o) => o.id === id), 'This order')
    if (row.confirmedOn) throw new RuleError('A confirmed order cannot be deleted.')
    d.tradeOrders = d.tradeOrders.filter((o) => o.id !== id)
    d.commissions = d.commissions.filter((c) => c.tradeOrderId !== id)
  })
}

// --------------------------------------------------------------- PI/Indent

export interface PiInput {
  piNumber: string
  piDate: string
  quantity: string
  remarks: string
}

export function placePi(orderId: ID, input: PiInput): Promise<void> {
  return write('Placing a PI / indent', (d) => {
    const order = must(d.tradeOrders.find((o) => o.id === orderId), 'This order')
    if (!order.confirmedOn) throw new RuleError('Confirm the client order before placing the PI / indent.')
    if (d.piIndents.some((p) => p.tradeOrderId === orderId)) throw new RuleError('A PI / indent is already placed on this order.')
    const piNumber = requireText(input.piNumber, 'PI / indent number', 60)
    if (d.piIndents.some((p) => p.piNumber.toLowerCase() === piNumber.toLowerCase())) {
      throw new RuleError(`PI / indent number ${piNumber} is already used on another order.`)
    }
    const piDate = requireDate(input.piDate, 'PI date')
    notFuture(piDate, 'PI date')
    if (piDate < order.confirmedOn) throw new RuleError('The PI cannot be dated before the client order was confirmed.')
    const quantity = positiveDecimal(input.quantity, 'PI quantity')
    if (dec(quantity) > dec(order.quantity)) throw new RuleError('PI quantity cannot exceed the client order quantity.')
    d.piIndents.push({
      id: newId('p2pi'),
      tradeOrderId: orderId,
      piNumber,
      piDate,
      quantity,
      remarks: optText(input.remarks),
      createdAt: nowIso(),
      updatedAt: nowIso(),
    })
    order.updatedAt = nowIso()
  })
}

// --------------------------------------------------------------------- LC

export interface LcInput {
  lcNumber: string
  issuingBank: string
  advisingBank: string
  amount: string
  currency: string
  openedOn: string
  expiryDate: string
  latestShipmentDate: string
  remarks: string
}

function validateLc(d: P2Data, orderId: ID, input: LcInput, selfId: ID | null) {
  const lcNumber = requireText(input.lcNumber, 'LC number', 40)
  if (d.lcs.some((l) => l.id !== selfId && l.lcNumber.toLowerCase() === lcNumber.toLowerCase())) {
    throw new RuleError(`LC ${lcNumber} is already recorded on another order.`)
  }
  const openedOn = requireDate(input.openedOn, 'LC opening date')
  const expiryDate = requireDate(input.expiryDate, 'LC expiry date')
  const latestShipmentDate = requireDate(input.latestShipmentDate, 'Latest shipment date')
  if (expiryDate <= openedOn) throw new RuleError('LC expiry must be after the opening date.')
  if (latestShipmentDate < openedOn) throw new RuleError('Latest shipment date cannot be before the LC was opened.')
  if (latestShipmentDate > expiryDate) throw new RuleError('Latest shipment date cannot be after the LC expiry.')
  const pi = d.piIndents.find((p) => p.tradeOrderId === orderId)
  if (pi && openedOn < pi.piDate) throw new RuleError('The LC cannot be opened before the PI date.')
  return {
    lcNumber,
    issuingBank: requireText(input.issuingBank, 'Issuing bank', 120),
    advisingBank: optText(input.advisingBank),
    amount: positiveDecimal(input.amount, 'LC amount', 2),
    currency: requireText(input.currency, 'Currency', 3).toUpperCase(),
    openedOn,
    expiryDate,
    latestShipmentDate,
    remarks: optText(input.remarks),
  }
}

/** Saves LC details as a draft. Opening is a separate, explicit confirmation. */
export function saveLc(orderId: ID, input: LcInput): Promise<void> {
  return write('Saving LC details', (d) => {
    must(d.tradeOrders.find((o) => o.id === orderId), 'This order')
    if (!d.piIndents.some((p) => p.tradeOrderId === orderId)) throw new RuleError('Place the PI / indent before entering the LC.')
    const existing = d.lcs.find((l) => l.tradeOrderId === orderId)
    if (existing?.status === 'OPENED') throw new RuleError('This LC is already confirmed as opened and can no longer be edited.')
    const fields = validateLc(d, orderId, input, existing?.id ?? null)
    if (existing) {
      Object.assign(existing, fields, { updatedAt: nowIso() })
    } else {
      const row: LcRecord = {
        id: newId('p2lc'),
        tradeOrderId: orderId,
        ...fields,
        status: 'DRAFT',
        confirmedOn: null,
        createdAt: nowIso(),
        updatedAt: nowIso(),
      }
      d.lcs.push(row)
    }
  })
}

export function confirmLcOpened(orderId: ID): Promise<void> {
  return write('Confirming the LC', (d) => {
    const lc = must(d.lcs.find((l) => l.tradeOrderId === orderId), 'The LC draft')
    if (lc.status === 'OPENED') throw new RuleError('This LC is already confirmed.')
    notFuture(lc.openedOn, 'LC opening date')
    lc.status = 'OPENED'
    lc.confirmedOn = todayIso()
    lc.updatedAt = nowIso()
  })
}

// --------------------------------------------------------------- shipment

export interface ShipmentInput {
  mode: ShipmentMode
  carrier: string
  blAwbNumber: string
  portOfLoading: string
  portOfDischarge: string
  etd: string
  eta: string
}

function validateShipment(input: ShipmentInput) {
  const etd = optionalDate(input.etd, 'ETD')
  const eta = optionalDate(input.eta, 'ETA')
  if (etd && eta && eta < etd) throw new RuleError('ETA cannot be before ETD.')
  return {
    mode: input.mode,
    carrier: optText(input.carrier),
    blAwbNumber: optText(input.blAwbNumber),
    portOfLoading: optText(input.portOfLoading),
    portOfDischarge: optText(input.portOfDischarge),
    etd,
    eta,
  }
}

export function saveShipment(orderId: ID, input: ShipmentInput): Promise<void> {
  return write('Updating shipment details', (d) => {
    must(d.tradeOrders.find((o) => o.id === orderId), 'This order')
    const lc = d.lcs.find((l) => l.tradeOrderId === orderId)
    if (lc?.status !== 'OPENED') throw new RuleError('The LC must be confirmed as opened before the shipment starts.')
    const fields = validateShipment(input)
    if (fields.etd && fields.etd < lc.openedOn) throw new RuleError('ETD cannot be before the LC was opened.')
    const existing = d.shipments.find((s) => s.tradeOrderId === orderId)
    if (existing?.status === 'DELIVERED') throw new RuleError('The shipment is delivered and can no longer be edited.')
    if (existing) {
      Object.assign(existing, fields, { updatedAt: nowIso() })
    } else {
      const row: ShipmentRecord = {
        id: newId('p2sh'),
        tradeOrderId: orderId,
        status: 'IN_PROGRESS',
        ...fields,
        shippedOn: null,
        deliveredOn: null,
        deliveryRemarks: null,
        createdAt: nowIso(),
        updatedAt: nowIso(),
      }
      d.shipments.push(row)
    }
  })
}

export interface ShippedInput {
  shippedOn: string
  blAwbNumber: string
}

export function markShipped(orderId: ID, input: ShippedInput): Promise<{ lateAgainstLc: boolean }> {
  return write('Marking the order as shipped', (d) => {
    const s = must(d.shipments.find((x) => x.tradeOrderId === orderId), 'The shipment')
    if (s.status !== 'IN_PROGRESS') throw new RuleError('This shipment is already marked as shipped.')
    const lc = must(d.lcs.find((l) => l.tradeOrderId === orderId && l.status === 'OPENED'), 'The opened LC')
    const shippedOn = requireDate(input.shippedOn, 'Shipped on')
    notFuture(shippedOn, 'Shipped on')
    if (shippedOn < lc.openedOn) throw new RuleError('Goods cannot ship before the LC was opened.')
    if (shippedOn > lc.expiryDate) {
      throw new RuleError(`Shipped date is after the LC expiry (${lc.expiryDate}). Record an LC amendment first.`)
    }
    const bl = requireText(input.blAwbNumber || s.blAwbNumber, 'B/L or AWB number', 40)
    s.status = 'SHIPPED'
    s.shippedOn = shippedOn
    s.blAwbNumber = bl
    s.updatedAt = nowIso()
    return { lateAgainstLc: shippedOn > lc.latestShipmentDate }
  })
}

export interface DeliveryInput {
  deliveredOn: string
  remarks: string
}

export function confirmDelivery(orderId: ID, input: DeliveryInput): Promise<void> {
  return write('Confirming delivery', (d) => {
    const s = must(d.shipments.find((x) => x.tradeOrderId === orderId), 'The shipment')
    if (s.status === 'DELIVERED') throw new RuleError('Delivery is already confirmed.')
    if (s.status !== 'SHIPPED') throw new RuleError('Mark the goods as shipped before confirming delivery.')
    const deliveredOn = requireDate(input.deliveredOn, 'Delivered on')
    notFuture(deliveredOn, 'Delivered on')
    if (s.shippedOn && deliveredOn < s.shippedOn) throw new RuleError('Delivery cannot be before the shipped date.')
    s.status = 'DELIVERED'
    s.deliveredOn = deliveredOn
    s.deliveryRemarks = optText(input.remarks)
    s.updatedAt = nowIso()
  })
}

// ------------------------------------------------------------- commission

export function updateCommissionTerms(orderId: ID, basis: CommissionBasis, pct: string): Promise<void> {
  return write('Changing commission terms', (d) => {
    const c = must(d.commissions.find((x) => x.tradeOrderId === orderId), 'The commission record')
    if (c.status === 'RECEIVED') throw new RuleError('Commission is already received; its terms are fixed.')
    c.basis = basis
    c.percentage = percentage(pct)
    c.updatedAt = nowIso()
  })
}

export interface ReceiptInput {
  amount: string
  receivedOn: string
  receiptRef: string
  remarks: string
}

export function recordCommissionReceipt(orderId: ID, input: ReceiptInput): Promise<void> {
  return write('Recording commission received', (d) => {
    const c = must(d.commissions.find((x) => x.tradeOrderId === orderId), 'The commission record')
    if (c.status === 'RECEIVED') throw new RuleError('Commission receipt is already recorded for this order.')
    const s = d.shipments.find((x) => x.tradeOrderId === orderId)
    if (s?.status !== 'DELIVERED') throw new RuleError('Delivery must be confirmed before commission can be marked received.')
    const receivedOn = requireDate(input.receivedOn, 'Received on')
    notFuture(receivedOn, 'Received on')
    if (s.deliveredOn && receivedOn < s.deliveredOn) throw new RuleError('Commission cannot be received before delivery.')
    c.receivedAmount = positiveDecimal(input.amount, 'Amount received', 2)
    c.receivedOn = receivedOn
    c.receiptRef = optText(input.receiptRef)
    c.remarks = optText(input.remarks)
    c.status = 'RECEIVED'
    c.updatedAt = nowIso()
  })
}

// ------------------------------------------------------------------ admin

export async function resetP2Data(): Promise<void> {
  guard('Resetting Product 2.0 data')
  await delay('write')
  useP2Store.getState().reset()
}
