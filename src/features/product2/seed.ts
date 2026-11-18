/**
 * Demonstration data for Product 2.0. Fictional companies only. Covers every
 * state of both workflows so each screen has something real to show:
 * identified-only sources, pending and rejected samples, a re-submitted
 * sample, and trade orders parked at each of the six stages.
 */

import type {
  ApiProduct,
  CommissionRecord,
  LcRecord,
  P2Data,
  Party,
  PiIndent,
  SampleRecord,
  ShipmentRecord,
  SourcingRecord,
  TradeOrder,
} from './types'

const ts = (date: string) => `${date}T09:00:00.000Z`

function party(id: string, kind: Party['kind'], name: string, country: string, contactName: string | null = null): Party {
  return {
    id,
    kind,
    name,
    country,
    contactName,
    email: contactName ? `${contactName.split(' ')[0]!.toLowerCase()}@example.com` : null,
    phone: null,
    createdAt: ts('2025-01-10'),
    updatedAt: ts('2025-01-10'),
  }
}

const PARTIES: Party[] = [
  party('p2m_aurovance', 'MANUFACTURER', 'Aurovance Lifesciences', 'India', 'Rahul Mehta'),
  party('p2m_huaxin', 'MANUFACTURER', 'Huaxin Fine Pharma', 'China', 'Li Wei'),
  party('p2m_kalinga', 'MANUFACTURER', 'Kalinga Fine Chemicals', 'India', 'Sunita Rao'),
  party('p2m_yuanrun', 'MANUFACTURER', 'Yuanrun Biotech', 'China', 'Zhang Min'),
  party('p2m_vasudha', 'MANUFACTURER', 'Vasudha Synthesis', 'India'),
  party('p2m_iberia', 'MANUFACTURER', 'Iberica Quimica Farma', 'Spain', 'Elena Ruiz'),
  party('p2i_meridian', 'INTERMEDIARY', 'Meridian Pharma Trading FZE', 'United Arab Emirates', 'Omar Haddad'),
  party('p2i_orient', 'INTERMEDIARY', 'Orient Chem Link', 'Hong Kong', 'Kenneth Ho'),
  party('p2c_novagen', 'CLIENT', 'Novagen Pharmaceuticals', 'Bangladesh', 'Farhana Akter'),
  party('p2c_riverstone', 'CLIENT', 'Riverstone Healthcare', 'Bangladesh', 'Tanvir Hasan'),
  party('p2c_medisphere', 'CLIENT', 'Medisphere Laboratories', 'Bangladesh'),
  party('p2c_lumen', 'CLIENT', 'Lumen Generics', 'Sri Lanka', 'Nimal Perera'),
]

function api(
  id: string,
  name: string,
  casNumber: string,
  therapeuticArea: string,
  grade: string,
  synonyms: string[],
  created: string,
): ApiProduct {
  return {
    id,
    name,
    casNumber,
    synonyms,
    therapeuticArea,
    grade,
    description: null,
    isActive: true,
    createdAt: ts(created),
    updatedAt: ts(created),
  }
}

const APIS: ApiProduct[] = [
  api('p2a_esomeprazole', 'Esomeprazole Magnesium Trihydrate', '217087-09-7', 'Gastrointestinal', 'USP', ['Esomeprazole Mg'], '2025-02-03'),
  api('p2a_rosuvastatin', 'Rosuvastatin Calcium', '147098-20-2', 'Cardiovascular', 'EP', [], '2025-03-12'),
  api('p2a_metformin', 'Metformin Hydrochloride', '1115-70-4', 'Antidiabetic', 'BP', ['Metformin HCl'], '2025-04-01'),
  api('p2a_cefixime', 'Cefixime Trihydrate', '125110-14-7', 'Anti-infective', 'USP', [], '2025-05-20'),
  api('p2a_montelukast', 'Montelukast Sodium', '151767-02-1', 'Respiratory', 'USP', [], '2026-06-08'),
  api('p2a_empagliflozin', 'Empagliflozin', '864070-44-0', 'Antidiabetic', 'In-house', [], '2025-09-15'),
  api('p2a_levocetirizine', 'Levocetirizine Dihydrochloride', '130018-87-0', 'Antihistamine', 'EP', ['Levocetirizine 2HCl'], '2026-08-21'),
  api('p2a_ticagrelor', 'Ticagrelor', '274693-27-5', 'Cardiovascular', 'In-house', [], '2026-10-30'),
]

function src(
  id: string,
  apiProductId: string,
  manufacturerId: string,
  intermediaryId: string | null,
  identifiedOn: string,
  indicativePrice: string | null,
  extra: Partial<SourcingRecord> = {},
): SourcingRecord {
  return {
    id,
    apiProductId,
    manufacturerId,
    intermediaryId,
    identifiedOn,
    indicativePrice,
    priceCurrency: 'USD',
    priceUom: 'kg',
    hasDmf: false,
    hasCep: false,
    notes: null,
    createdAt: ts(identifiedOn),
    updatedAt: ts(identifiedOn),
    ...extra,
  }
}

const SOURCING: SourcingRecord[] = [
  src('p2s_eso_auro', 'p2a_esomeprazole', 'p2m_aurovance', null, '2025-02-05', '182.50', { hasDmf: true }),
  src('p2s_eso_huaxin', 'p2a_esomeprazole', 'p2m_huaxin', 'p2i_orient', '2026-07-14', '149.00'),
  src('p2s_rosu_kalinga', 'p2a_rosuvastatin', 'p2m_kalinga', null, '2025-03-15', '410.00', { hasDmf: true, hasCep: true }),
  src('p2s_met_vasudha', 'p2a_metformin', 'p2m_vasudha', null, '2025-04-03', '4.85'),
  src('p2s_met_yuanrun', 'p2a_metformin', 'p2m_yuanrun', 'p2i_meridian', '2026-09-02', '4.20', {
    notes: 'Price indication via Meridian; awaiting sample dispatch.',
  }),
  src('p2s_cef_yuanrun', 'p2a_cefixime', 'p2m_yuanrun', 'p2i_orient', '2025-05-22', '96.00'),
  src('p2s_monte_auro', 'p2a_montelukast', 'p2m_aurovance', null, '2026-06-10', '1250.00', { hasDmf: true }),
  src('p2s_empa_kalinga', 'p2a_empagliflozin', 'p2m_kalinga', null, '2025-09-18', '2400.00'),
  src('p2s_levo_iberia', 'p2a_levocetirizine', 'p2m_iberia', 'p2i_meridian', '2026-08-25', null, { hasCep: true }),
]

function sample(
  id: string,
  sourcingId: string,
  roundNo: number,
  submittedOn: string,
  status: SampleRecord['status'],
  decidedOn: string | null,
  extra: Partial<SampleRecord> = {},
): SampleRecord {
  return {
    id,
    sourcingId,
    roundNo,
    quantity: '0.5',
    uom: 'kg',
    submittedOn,
    submittedToClientId: null,
    courierRef: null,
    coaRef: null,
    status,
    decidedOn,
    rejectionReason: null,
    decisionRemarks: null,
    createdAt: ts(submittedOn),
    updatedAt: ts(decidedOn ?? submittedOn),
    ...extra,
  }
}

const SAMPLES: SampleRecord[] = [
  sample('p2x_eso_auro_1', 'p2s_eso_auro', 1, '2025-02-20', 'ACCEPTED', '2025-03-28', {
    submittedToClientId: 'p2c_novagen',
    courierRef: 'DHL 7731 2045 11',
    coaRef: 'AUR/ESO/2502/014',
    decisionRemarks: 'Meets USP monograph; dissolution within limits.',
  }),
  sample('p2x_eso_huaxin_1', 'p2s_eso_huaxin', 1, '2026-08-01', 'REJECTED', '2026-09-05', {
    submittedToClientId: 'p2c_riverstone',
    rejectionReason: 'Related substance (impurity D) above 0.15% limit',
    decisionRemarks: 'Manufacturer agreed to re-process the batch.',
  }),
  sample('p2x_eso_huaxin_2', 'p2s_eso_huaxin', 2, '2026-10-22', 'SUBMITTED', null, {
    submittedToClientId: 'p2c_riverstone',
    courierRef: 'FedEx 3920 1180 22',
  }),
  sample('p2x_rosu_kalinga_1', 'p2s_rosu_kalinga', 1, '2025-04-02', 'ACCEPTED', '2025-05-10', {
    submittedToClientId: 'p2c_novagen',
    quantity: '0.25',
  }),
  sample('p2x_met_vasudha_1', 'p2s_met_vasudha', 1, '2025-04-15', 'ACCEPTED', '2025-05-02', {
    submittedToClientId: 'p2c_medisphere',
    quantity: '2',
  }),
  sample('p2x_cef_yuanrun_1', 'p2s_cef_yuanrun', 1, '2025-06-10', 'REJECTED', '2025-07-18', {
    submittedToClientId: 'p2c_novagen',
    rejectionReason: 'Water content out of specification (KF 14.9%)',
  }),
  sample('p2x_monte_auro_1', 'p2s_monte_auro', 1, '2026-10-05', 'SUBMITTED', null, {
    submittedToClientId: 'p2c_lumen',
    quantity: '0.1',
    courierRef: 'DHL 5521 9087 30',
  }),
  sample('p2x_empa_kalinga_1', 'p2s_empa_kalinga', 1, '2025-10-01', 'ACCEPTED', '2025-11-20', {
    submittedToClientId: 'p2c_riverstone',
    quantity: '0.1',
  }),
]

function order(
  id: string,
  orderRef: string,
  apiProductId: string,
  sourcingId: string,
  clientId: string,
  orderDate: string,
  quantity: string,
  fobUnitPrice: string,
  transportCharges: string,
  confirmedOn: string | null,
  extra: Partial<TradeOrder> = {},
): TradeOrder {
  return {
    id,
    orderRef,
    apiProductId,
    sourcingId,
    clientId,
    clientPoRef: null,
    orderDate,
    requiredBy: null,
    quantity,
    uom: 'kg',
    currency: 'USD',
    fobUnitPrice,
    transportCharges,
    incoterm: 'FOB',
    remarks: null,
    confirmedOn,
    createdAt: ts(orderDate),
    updatedAt: ts(confirmedOn ?? orderDate),
    ...extra,
  }
}

const ORDERS: TradeOrder[] = [
  order('p2o_001', 'TO-2026-001', 'p2a_esomeprazole', 'p2s_eso_auro', 'p2c_novagen', '2026-01-12', '500', '178.00', '2450.00', '2026-01-14', {
    clientPoRef: 'NPL/PO/26/0041',
  }),
  order('p2o_002', 'TO-2026-002', 'p2a_esomeprazole', 'p2s_eso_auro', 'p2c_riverstone', '2026-08-03', '250', '180.50', '1600.00', '2026-08-05', {
    clientPoRef: 'RHL-PO-8812',
  }),
  order('p2o_003', 'TO-2026-003', 'p2a_rosuvastatin', 'p2s_rosu_kalinga', 'p2c_novagen', '2026-09-18', '100', '405.00', '1250.00', '2026-09-20', {
    requiredBy: '2026-12-15',
  }),
  order('p2o_004', 'TO-2026-004', 'p2a_metformin', 'p2s_met_vasudha', 'p2c_medisphere', '2026-10-06', '12000', '4.7250', '6800.00', '2026-10-08'),
  order('p2o_005', 'TO-2026-005', 'p2a_metformin', 'p2s_met_vasudha', 'p2c_lumen', '2026-11-10', '5000', '4.8000', '3200.00', null, {
    remarks: 'Awaiting signed PO from client purchasing.',
  }),
  order('p2o_006', 'TO-2026-006', 'p2a_empagliflozin', 'p2s_empa_kalinga', 'p2c_riverstone', '2026-05-04', '20', '2350.00', '900.00', '2026-05-06', {
    incoterm: 'FOB',
    clientPoRef: 'RHL-PO-8650',
  }),
  order('p2o_007', 'TO-2026-007', 'p2a_rosuvastatin', 'p2s_rosu_kalinga', 'p2c_medisphere', '2026-11-02', '50', '412.00', '800.00', '2026-11-04'),
]

function pi(id: string, tradeOrderId: string, piNumber: string, piDate: string, quantity: string): PiIndent {
  return { id, tradeOrderId, piNumber, piDate, quantity, remarks: null, createdAt: ts(piDate), updatedAt: ts(piDate) }
}

const PIS: PiIndent[] = [
  pi('p2pi_001', 'p2o_001', 'AUR/PI/2026/0112', '2026-01-18', '500'),
  pi('p2pi_002', 'p2o_002', 'AUR/PI/2026/0874', '2026-08-09', '250'),
  pi('p2pi_003', 'p2o_003', 'KFC-PI-26-331', '2026-09-24', '100'),
  pi('p2pi_004', 'p2o_004', 'VS/IND/26/207', '2026-10-12', '12000'),
  pi('p2pi_006', 'p2o_006', 'KFC-PI-26-140', '2026-05-09', '20'),
]

function lc(
  id: string,
  tradeOrderId: string,
  lcNumber: string,
  issuingBank: string,
  amount: string,
  openedOn: string,
  expiryDate: string,
  latestShipmentDate: string,
  status: LcRecord['status'],
): LcRecord {
  return {
    id,
    tradeOrderId,
    lcNumber,
    issuingBank,
    advisingBank: null,
    amount,
    currency: 'USD',
    openedOn,
    expiryDate,
    latestShipmentDate,
    status,
    confirmedOn: status === 'OPENED' ? openedOn : null,
    remarks: null,
    createdAt: ts(openedOn),
    updatedAt: ts(openedOn),
  }
}

const LCS: LcRecord[] = [
  // LC opened for FOB + freight exactly
  lc('p2lc_001', 'p2o_001', '0123LC26000418', 'Eastern Commerce Bank', '91450.00', '2026-01-28', '2026-05-28', '2026-04-30', 'OPENED'),
  // LC opened for FOB only — freight paid separately by the client
  lc('p2lc_002', 'p2o_002', '0456LC26002291', 'Delta Trust Bank', '45125.00', '2026-08-20', '2026-12-20', '2026-11-30', 'OPENED'),
  lc('p2lc_003', 'p2o_003', '0789LC26003310', 'Eastern Commerce Bank', '41750.00', '2026-10-02', '2027-02-02', '2027-01-05', 'OPENED'),
  lc('p2lc_004', 'p2o_004', '0789LC26003577', 'Harbour City Bank', '63500.00', '2026-11-15', '2027-03-15', '2027-02-15', 'DRAFT'),
  lc('p2lc_006', 'p2o_006', '0456LC26001120', 'Delta Trust Bank', '47900.00', '2026-05-18', '2026-09-18', '2026-08-18', 'OPENED'),
]

function shipment(id: string, tradeOrderId: string, status: ShipmentRecord['status'], extra: Partial<ShipmentRecord>): ShipmentRecord {
  return {
    id,
    tradeOrderId,
    status,
    mode: 'SEA',
    carrier: null,
    blAwbNumber: null,
    portOfLoading: null,
    portOfDischarge: null,
    etd: null,
    eta: null,
    shippedOn: null,
    deliveredOn: null,
    deliveryRemarks: null,
    createdAt: ts('2026-01-01'),
    updatedAt: ts('2026-01-01'),
    ...extra,
  }
}

const SHIPMENTS: ShipmentRecord[] = [
  shipment('p2sh_001', 'p2o_001', 'DELIVERED', {
    carrier: 'Maersk',
    blAwbNumber: 'MAEU 238114502',
    portOfLoading: 'Nhava Sheva',
    portOfDischarge: 'Chattogram',
    etd: '2026-03-02',
    eta: '2026-03-20',
    shippedOn: '2026-03-03',
    deliveredOn: '2026-03-24',
    deliveryRemarks: 'Received in full, 20 drums, seals intact.',
    createdAt: ts('2026-02-25'),
    updatedAt: ts('2026-03-24'),
  }),
  shipment('p2sh_002', 'p2o_002', 'SHIPPED', {
    mode: 'AIR',
    carrier: 'Emirates SkyCargo',
    blAwbNumber: '176-2290 4415',
    portOfLoading: 'Hyderabad',
    portOfDischarge: 'Dhaka',
    etd: '2026-11-12',
    eta: '2026-11-19',
    shippedOn: '2026-11-12',
    createdAt: ts('2026-11-01'),
    updatedAt: ts('2026-11-12'),
  }),
  shipment('p2sh_006', 'p2o_006', 'DELIVERED', {
    mode: 'AIR',
    carrier: 'Qatar Airways Cargo',
    blAwbNumber: '157-8812 0091',
    shippedOn: '2026-07-22',
    deliveredOn: '2026-07-27',
    createdAt: ts('2026-07-10'),
    updatedAt: ts('2026-07-27'),
  }),
]

function commission(
  id: string,
  tradeOrderId: string,
  basis: CommissionRecord['basis'],
  percentage: string,
  received: { amount: string; on: string; ref: string } | null,
  created: string,
): CommissionRecord {
  return {
    id,
    tradeOrderId,
    basis,
    percentage,
    status: received ? 'RECEIVED' : 'EXPECTED',
    receivedAmount: received?.amount ?? null,
    receivedOn: received?.on ?? null,
    receiptRef: received?.ref ?? null,
    remarks: null,
    createdAt: ts(created),
    updatedAt: ts(received?.on ?? created),
  }
}

const COMMISSIONS: CommissionRecord[] = [
  commission('p2cm_001', 'p2o_001', 'FOB', '3', { amount: '2670.00', on: '2026-04-15', ref: 'TT-AUR-0415' }, '2026-01-12'),
  commission('p2cm_002', 'p2o_002', 'TOTAL', '2.5', null, '2026-08-03'),
  commission('p2cm_003', 'p2o_003', 'FOB', '4', null, '2026-09-18'),
  commission('p2cm_004', 'p2o_004', 'TOTAL', '1.75', null, '2026-10-06'),
  commission('p2cm_005', 'p2o_005', 'FOB', '2', null, '2026-11-10'),
  commission('p2cm_006', 'p2o_006', 'FOB', '5', null, '2026-05-04'),
  commission('p2cm_007', 'p2o_007', 'FOB', '4', null, '2026-11-02'),
]

export function buildP2Seed(): P2Data {
  // deep copy so a reset never shares references with mutated state
  return JSON.parse(
    JSON.stringify({
      version: 1,
      parties: PARTIES,
      apiProducts: APIS,
      sourcing: SOURCING,
      samples: SAMPLES,
      tradeOrders: ORDERS,
      piIndents: PIS,
      lcs: LCS,
      shipments: SHIPMENTS,
      commissions: COMMISSIONS,
      orderSeq: 7,
    } satisfies P2Data),
  ) as P2Data
}
