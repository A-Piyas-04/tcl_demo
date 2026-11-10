/**
 * Demonstration data.
 *
 * Deterministic: the same seed always produces the same database, so a
 * presentation shows the same figures every time and "reset demo data" really
 * does reset. Nothing here talks to a server.
 *
 * Company and product names are real trade names used as plausible examples;
 * every transaction, price, date, person and document is invented.
 */

import {
  BANKS,
  CNF_AGENTS,
  COURIERS,
  FORWARDERS,
  PORTS,
  THERAPEUTIC_CATEGORIES,
} from './reference'
import { deriveTradeStatuses } from './rules'
import type {
  Activity,
  AuditEntry,
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
  ManufacturerStatus,
  ManufacturerStatusChange,
  MpFiling,
  MpPrice,
  Notification,
  Offer,
  OrderIndentLink,
  Pharmacopoeia,
  PortfolioItem,
  Product,
  Requirement,
  RequirementEngagementLink,
  SampleRound,
  SecurityEntry,
  Shipment,
  ShipmentLine,
  StageHistoryEntry,
  User,
} from './types'

// ------------------------------------------------------------------- rng

/** mulberry32: small, fast, deterministic. */
function rng(seed: number) {
  let a = seed >>> 0
  return () => {
    a += 0x6d2b79f5
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

export const SEED = 20261105

function makeHelpers(rand: () => number) {
  const int = (min: number, max: number) => Math.floor(rand() * (max - min + 1)) + min
  const pick = <T,>(arr: readonly T[]): T => arr[Math.floor(rand() * arr.length)]!
  const pickN = <T,>(arr: readonly T[], n: number): T[] => {
    const copy = [...arr]
    const out: T[] = []
    while (out.length < n && copy.length) out.push(copy.splice(Math.floor(rand() * copy.length), 1)[0]!)
    return out
  }
  const chance = (p: number) => rand() < p
  return { int, pick, pickN, chance }
}

// ------------------------------------------------------------------ dates

/** Fixed "today" for the demo so the data always reads the same. */
export const DEMO_TODAY = new Date('2026-11-05T09:00:00+06:00')

const iso = (d: Date) => d.toISOString().slice(0, 10)
const isoT = (d: Date) => d.toISOString()

function daysAgo(n: number): Date {
  const d = new Date(DEMO_TODAY)
  d.setDate(d.getDate() - n)
  return d
}
function daysAhead(n: number): Date {
  return daysAgo(-n)
}

// --------------------------------------------------------------- name data

const CLIENT_SEED = [
  ['Square Pharmaceuticals PLC', 'Square', 'Respiratory, gastrointestinal, anti-infective'],
  ['Incepta Pharmaceuticals Ltd', 'Incepta', 'Oncology, biologics, cardiovascular'],
  ['Beximco Pharmaceuticals PLC', 'Beximco', 'Respiratory, CNS, generics for export'],
  ['Renata PLC', 'Renata', 'Endocrine, oncology, animal health'],
  ['ACI Limited', 'ACI', 'Analgesics, anti-infective, consumer health'],
  ['Healthcare Pharmaceuticals Ltd', 'Healthcare', 'Gastrointestinal, cardiovascular'],
  ['Eskayef Pharmaceuticals Ltd', 'Eskayef', 'Respiratory, anti-infective, insulin'],
  ['Aristopharma Ltd', 'Aristopharma', 'Cardiovascular, CNS, ophthalmic'],
  ['Opsonin Pharma Ltd', 'Opsonin', 'Analgesics, anti-infective'],
  ['Ibn Sina Pharmaceutical Industry PLC', 'Ibn Sina', 'Gastrointestinal, vitamins'],
  ['Drug International Ltd', 'Drug International', 'Herbal, generics'],
  ['General Pharmaceuticals Ltd', 'General Pharma', 'Anti-infective, dermatological'],
]

const MANUFACTURER_SEED: [string, string, string, ManufacturerStatus][] = [
  ['Biocon Limited', 'Biocon', 'IN', 'EXISTING_COMMERCIAL'],
  ['Wockhardt Limited', 'Wockhardt', 'IN', 'EXISTING_COMMERCIAL'],
  ['Concord Biotech Limited', 'Concord Biotech', 'IN', 'EXISTING_COMMERCIAL'],
  ['Bajaj Healthcare Limited', 'Bajaj Healthcare', 'IN', 'EXISTING_COMMERCIAL'],
  ['Aarti Pharmalabs Limited', 'Aarti Pharmalabs', 'IN', 'EXISTING_COMMERCIAL'],
  ['Sun Pharmaceutical Industries Limited', 'Sun Pharma', 'IN', 'UNDER_DEVELOPMENT'],
  ['Divis Laboratories Limited', 'Divis Labs', 'IN', 'EXISTING_COMMERCIAL'],
  ['Granules India Limited', 'Granules India', 'IN', 'UNDER_DEVELOPMENT'],
  ['Hetero Drugs Limited', 'Hetero Drugs', 'IN', 'EXISTING_COMMERCIAL'],
  ['Zhejiang Huahai Pharmaceutical Co', 'Zhejiang Huahai', 'CN', 'UNDER_DEVELOPMENT'],
  ['Zhejiang Hisun Pharmaceutical Co', 'Zhejiang Hisun', 'CN', 'EXISTING_COMMERCIAL'],
  ['Shandong Xinhua Pharmaceutical Co', 'Shandong Xinhua', 'CN', 'NEW'],
  ['North China Pharmaceutical Group', 'NCPC', 'CN', 'NEW'],
  ['Moehs Iberica SL', 'Moehs Iberica', 'ES', 'EXISTING_COMMERCIAL'],
  ['Cambrex Profarmaco Milano Srl', 'Cambrex Milano', 'IT', 'UNDER_DEVELOPMENT'],
  ['Siegfried AG', 'Siegfried', 'CH', 'NEW'],
  ['Fermion Oy', 'Fermion', 'IE', 'INACTIVE'],
  ['Orchid Chemicals Overseas Pvt', 'Orchid Overseas', 'IN', 'BLACKLISTED'],
]

/** [generic name, category, CAS, synonyms, therapeutic areas] */
const PRODUCT_SEED: [string, 'API' | 'EXCIPIENT' | 'INTERMEDIATE', string | null, string[], string[]][] = [
  ['Budesonide', 'API', '51333-22-3', ['Budesonide micronised', 'Budesonid'], ['Respiratory']],
  ['Esomeprazole Magnesium', 'API', '161796-78-7', ['Esomeprazole Mg trihydrate', 'Esomeprazol'], ['Gastrointestinal']],
  ['Omeprazole', 'API', '73590-58-6', ['Omeprazol', 'Omeprazole USP'], ['Gastrointestinal']],
  ['Pantoprazole Sodium', 'API', '138786-67-1', ['Pantoprazole Na sesquihydrate'], ['Gastrointestinal']],
  ['Dextromethorphan Hydrobromide', 'API', '125-69-9', ['Dextromethorphan HBr', 'DXM HBr'], ['Respiratory']],
  ['Montelukast Sodium', 'API', '151767-02-1', ['Montelukast Na'], ['Respiratory']],
  ['Salbutamol Sulphate', 'API', '51022-70-9', ['Albuterol sulfate', 'Salbutamol sulfate'], ['Respiratory']],
  ['Formoterol Fumarate', 'API', '43229-80-7', ['Formoterol fumarate dihydrate'], ['Respiratory']],
  ['Tiotropium Bromide', 'API', '136310-93-5', ['Tiotropium Br monohydrate'], ['Respiratory']],
  ['Atorvastatin Calcium', 'API', '134523-03-8', ['Atorvastatin Ca trihydrate'], ['Cardiovascular']],
  ['Rosuvastatin Calcium', 'API', '147098-20-2', ['Rosuvastatin Ca'], ['Cardiovascular']],
  ['Clopidogrel Bisulphate', 'API', '120202-66-6', ['Clopidogrel hydrogen sulfate'], ['Cardiovascular']],
  ['Metoprolol Succinate', 'API', '98418-47-4', ['Metoprolol succinate ER grade'], ['Cardiovascular']],
  ['Amlodipine Besylate', 'API', '111470-99-6', ['Amlodipine besilate'], ['Cardiovascular']],
  ['Valsartan', 'API', '137862-53-4', [], ['Cardiovascular']],
  ['Metformin Hydrochloride', 'API', '1115-70-4', ['Metformin HCl DC grade'], ['Endocrine & metabolic']],
  ['Sitagliptin Phosphate', 'API', '654671-77-9', ['Sitagliptin phosphate monohydrate'], ['Endocrine & metabolic']],
  ['Empagliflozin', 'API', '864070-44-0', [], ['Endocrine & metabolic']],
  ['Levothyroxine Sodium', 'API', '25416-65-3', ['Levothyroxine Na pentahydrate'], ['Endocrine & metabolic']],
  ['Azithromycin Dihydrate', 'API', '117772-70-0', ['Azithromycin dihydrate USP'], ['Anti-infective']],
  ['Amoxicillin Trihydrate', 'API', '61336-70-7', ['Amoxycillin trihydrate'], ['Anti-infective']],
  ['Cefixime Trihydrate', 'API', '125110-14-7', ['Cefixime USP'], ['Anti-infective']],
  ['Ceftriaxone Sodium', 'API', '104376-79-6', ['Ceftriaxone Na sterile'], ['Anti-infective']],
  ['Meropenem Trihydrate', 'API', '119478-56-7', ['Meropenem sterile'], ['Anti-infective']],
  ['Levofloxacin Hemihydrate', 'API', '138199-71-0', ['Levofloxacin hemihydrate USP'], ['Anti-infective']],
  ['Linezolid', 'API', '165800-03-3', [], ['Anti-infective']],
  ['Paracetamol', 'API', '103-90-2', ['Acetaminophen', 'Paracetamol BP'], ['Analgesic & anti-inflammatory']],
  ['Ibuprofen', 'API', '15687-27-1', ['Ibuprofen BP/USP'], ['Analgesic & anti-inflammatory']],
  ['Naproxen Sodium', 'API', '26159-34-2', ['Naproxen Na'], ['Analgesic & anti-inflammatory']],
  ['Etoricoxib', 'API', '202409-33-4', [], ['Analgesic & anti-inflammatory']],
  ['Sertraline Hydrochloride', 'API', '79559-97-0', ['Sertraline HCl'], ['Central nervous system']],
  ['Escitalopram Oxalate', 'API', '219861-08-2', ['Escitalopram oxalate USP'], ['Central nervous system']],
  ['Levetiracetam', 'API', '102767-28-2', [], ['Central nervous system']],
  ['Pregabalin', 'API', '148553-50-8', [], ['Central nervous system']],
  ['Imatinib Mesylate', 'API', '220127-57-1', ['Imatinib mesilate'], ['Oncology']],
  ['Capecitabine', 'API', '154361-50-9', [], ['Oncology']],
  ['Tacrolimus', 'API', '104987-11-3', ['Tacrolimus monohydrate'], ['Oncology']],
  ['Mycophenolate Mofetil', 'API', '115007-34-6', ['MMF'], ['Oncology']],
  ['Propyl Gallate', 'EXCIPIENT', '121-79-9', ['Propyl gallate NF'], ['Vitamins & minerals']],
  ['Microcrystalline Cellulose', 'EXCIPIENT', '9004-34-6', ['MCC PH 102', 'Avicel grade'], []],
  ['Povidone K30', 'EXCIPIENT', '9003-39-8', ['PVP K30', 'Povidone USP K30'], []],
  ['Croscarmellose Sodium', 'EXCIPIENT', '74811-65-7', ['Ac-Di-Sol grade'], []],
  ['Magnesium Stearate', 'EXCIPIENT', '557-04-0', ['Mg stearate NF'], []],
  ['Hypromellose', 'EXCIPIENT', '9004-65-3', ['HPMC', 'Hydroxypropyl methylcellulose'], []],
  ['Titanium Dioxide', 'EXCIPIENT', '13463-67-7', ['TiO2 pharma grade'], []],
  ['4-Chloro-3-nitrobenzoic acid', 'INTERMEDIATE', '96-99-1', [], []],
  ['2-Aminothiazole', 'INTERMEDIATE', '96-50-4', [], []],
]

const GRADES = ['Micronised', 'Non-micronised', 'Standard', 'DC grade', 'Sterile', 'Granular', 'Fine powder']
const PACKING = ['25 KG HDPE drum', '50 KG fibre drum', '20 KG triple-laminated bag', '5 KG aluminium can', '1 KG amber bottle']

const FIRST_NAMES = ['Tanvir', 'Nusrat', 'Rashed', 'Farhana', 'Imran', 'Shabnam', 'Arif', 'Mehedi', 'Sadia', 'Kamrul', 'Naznin', 'Rafiq', 'Sumaiya', 'Jahangir', 'Tahmina', 'Shakil']
const LAST_NAMES = ['Ahmed', 'Rahman', 'Islam', 'Hossain', 'Chowdhury', 'Karim', 'Khan', 'Haque', 'Sarker', 'Bhuiyan', 'Mollah', 'Siddique']
const FOREIGN_NAMES = [
  ['Rajesh', 'Nair'], ['Priya', 'Menon'], ['Anil', 'Deshmukh'], ['Sunita', 'Rao'], ['Wei', 'Zhang'],
  ['Li', 'Chen'], ['Marc', 'Dubois'], ['Elena', 'Rossi'], ['Carlos', 'Garcia'], ['Thomas', 'Müller'],
]
const DEPARTMENTS = ['Purchase', 'QA', 'QC', 'R&D', 'Regulatory', 'Accounts']
const DESIGNATIONS = ['Manager', 'Senior Manager', 'Deputy Manager', 'Head', 'Executive', 'General Manager']

// --------------------------------------------------------------- generator

let counter = 0
const nextId = (prefix: string) => `${prefix}_${(++counter).toString(36).padStart(4, '0')}`

export function buildDatabase(seed = SEED): Database {
  counter = 0
  const rand = rng(seed)
  const { int, pick, pickN, chance } = makeHelpers(rand)

  // ----------------------------------------------------------------- users
  const userDefs: [string, string, string, 'FULL_ACCESS' | 'VIEWER', boolean][] = [
    ['Nusrat Jahan', 'nusrat.jahan@techstream.com.bd', 'Management', 'FULL_ACCESS', true],
    ['Tanvir Ahmed', 'tanvir.ahmed@techstream.com.bd', 'Business Development', 'FULL_ACCESS', true],
    ['Farhana Karim', 'farhana.karim@techstream.com.bd', 'Business Development', 'FULL_ACCESS', true],
    ['Rashed Islam', 'rashed.islam@techstream.com.bd', 'Sourcing', 'FULL_ACCESS', true],
    ['Shabnam Haque', 'shabnam.haque@techstream.com.bd', 'Regulatory', 'FULL_ACCESS', true],
    ['Imran Hossain', 'imran.hossain@techstream.com.bd', 'Commercial & Logistics', 'FULL_ACCESS', true],
    ['Mehedi Chowdhury', 'mehedi.chowdhury@techstream.com.bd', 'IT & Operations', 'FULL_ACCESS', true],
    ['Sadia Rahman', 'sadia.rahman@techstream.com.bd', 'Finance (review only)', 'VIEWER', true],
    ['Kamrul Khan', 'kamrul.khan@techstream.com.bd', 'Internal audit', 'VIEWER', true],
    ['Arif Sarker', 'arif.sarker@techstream.com.bd', 'Business Development', 'FULL_ACCESS', false],
  ]
  const users: User[] = userDefs.map(([fullName, email, department, roleCode, isActive], i) => ({
    id: nextId('usr'),
    email,
    fullName,
    department,
    phone: `+8801${int(300000000, 999999999)}`,
    roleCode,
    isActive,
    activatedAt: isoT(daysAgo(400 - i * 20)),
    lastLoginAt: isActive ? isoT(daysAgo(int(0, 6))) : isoT(daysAgo(120)),
    initials: fullName.split(' ').map((w) => w[0]).join('').slice(0, 2).toUpperCase(),
  }))
  // One user invited but never activated: proves the last-admin guard.
  users.push({
    id: nextId('usr'),
    email: 'new.officer@techstream.com.bd',
    fullName: 'Tahmina Akter',
    department: 'Business Development',
    phone: null,
    roleCode: 'FULL_ACCESS',
    isActive: true,
    activatedAt: null,
    lastLoginAt: null,
    initials: 'TA',
  })

  const bdOfficers = users.filter((u) => u.department === 'Business Development' && u.isActive && u.activatedAt)
  const sourcingUser = users.find((u) => u.department === 'Sourcing')!
  const regulatoryUser = users.find((u) => u.department === 'Regulatory')!
  const commercialUser = users.find((u) => u.department === 'Commercial & Logistics')!
  const managementUser = users[0]!

  // ------------------------------------------------------------- companies
  const companies: Company[] = []
  const sites: CompanySite[] = []
  const contacts: CompanyContact[] = []
  const statusChanges: ManufacturerStatusChange[] = []

  const clientStatuses = ['ACTIVE', 'ACTIVE', 'ACTIVE', 'ACTIVE', 'ACTIVE', 'ACTIVE', 'ACTIVE', 'PROSPECT', 'PROSPECT', 'ACTIVE', 'DORMANT', 'LOST'] as const

  CLIENT_SEED.forEach(([legalName, displayName, focus], i) => {
    const id = nextId('cmp')
    const owner = bdOfficers[i % bdOfficers.length]!
    companies.push({
      id,
      kind: 'CLIENT',
      legalName: legalName!,
      displayName: displayName!,
      countryCode: 'BD',
      website: `https://www.${displayName!.toLowerCase().replace(/[^a-z]/g, '')}.com.bd`,
      generalEmail: `info@${displayName!.toLowerCase().replace(/[^a-z]/g, '')}.com.bd`,
      generalPhone: `+8802${int(2000000, 9999999)}`,
      notes: null,
      isActive: true,
      possibleDuplicate: false,
      createdAt: isoT(daysAgo(900 - i * 20)),
      updatedAt: isoT(daysAgo(int(1, 90))),
      client: {
        status: clientStatuses[i]!,
        ownerUserId: owner.id,
        paymentTermCode: pick(['LC_AT_SIGHT', 'LC_90D', 'LC_180D']),
        creditLimit: chance(0.5) ? int(2, 20) * 50000 : null,
        creditCurrency: 'USD',
        minShelfLifeMonths: chance(0.3) ? pick([18, 24, 30, 36]) : null,
        therapeuticFocus: focus!,
        firstBusinessDate: iso(daysAgo(int(400, 2200))),
      },
    })

    // corporate office + one or two factories
    sites.push({
      id: nextId('sit'),
      companyId: id,
      kind: 'HEAD_OFFICE',
      name: `${displayName} Corporate Office`,
      city: 'Dhaka',
      countryCode: 'BD',
      addressLine: `${int(1, 90)} ${pick(['Mohakhali', 'Gulshan Avenue', 'Banani', 'Tejgaon I/A', 'Motijheel C/A'])}`,
      isPrimary: true,
      isDeliveryDestination: false,
      isActive: true,
    })
    const factoryCount = chance(0.4) ? 2 : 1
    for (let f = 0; f < factoryCount; f++) {
      sites.push({
        id: nextId('sit'),
        companyId: id,
        kind: 'PLANT',
        name: `${displayName} Factory${factoryCount > 1 ? ` ${f + 1}` : ''}`,
        city: pick(['Gazipur', 'Savar', 'Narayanganj', 'Kaliakoir', 'Tongi', 'Rupganj']),
        countryCode: 'BD',
        addressLine: `Plot ${int(1, 400)}, ${pick(['BSCIC I/A', 'Industrial Park', 'EPZ Extension'])}`,
        isPrimary: false,
        isDeliveryDestination: true,
        isActive: true,
      })
    }

    // contacts across departments
    const contactCount = int(2, 4)
    for (let c = 0; c < contactCount; c++) {
      const fn = pick(FIRST_NAMES)
      const ln = pick(LAST_NAMES)
      contacts.push({
        id: nextId('con'),
        companyId: id,
        siteId: null,
        fullName: `${fn} ${ln}`,
        designation: `${pick(DESIGNATIONS)}, ${pick(DEPARTMENTS)}`,
        department: pick(DEPARTMENTS),
        email: `${fn.toLowerCase()}.${ln.toLowerCase()}@${displayName!.toLowerCase().replace(/[^a-z]/g, '')}.com.bd`,
        phone: `+8801${int(300000000, 999999999)}`,
        isPrimary: c === 0,
        isActive: true,
      })
    }
  })

  MANUFACTURER_SEED.forEach(([legalName, displayName, countryCode, status], i) => {
    const id = nextId('cmp')
    const blacklisted = status === 'BLACKLISTED'
    companies.push({
      id,
      kind: 'MANUFACTURER',
      legalName,
      displayName,
      countryCode,
      website: `https://www.${displayName.toLowerCase().replace(/[^a-z]/g, '')}.com`,
      generalEmail: `export@${displayName.toLowerCase().replace(/[^a-z]/g, '')}.com`,
      generalPhone: countryCode === 'IN' ? `+9122${int(20000000, 49999999)}` : `+86${int(1000000000, 1999999999)}`,
      notes: null,
      isActive: true,
      possibleDuplicate: false,
      createdAt: isoT(daysAgo(1000 - i * 30)),
      updatedAt: isoT(daysAgo(int(1, 120))),
      manufacturer: {
        status,
        ownerUserId: sourcingUser.id,
        representation: status === 'EXISTING_COMMERCIAL' ? pick(['INDENT', 'NON_EXCLUSIVE_AGENT', 'EXCLUSIVE_AGENT'] as const) : null,
        agreementReference: status === 'EXISTING_COMMERCIAL' ? `TCL/AGR/${2021 + (i % 5)}/${100 + i}` : null,
        agreementSignedOn: status === 'EXISTING_COMMERCIAL' ? iso(daysAgo(int(400, 1500))) : null,
        agreementExpiresOn: status === 'EXISTING_COMMERCIAL' ? iso(daysAhead(int(-30, 700))) : null,
        commissionBasisNote:
          status === 'EXISTING_COMMERCIAL'
            ? pick([
                'Commission billed to the client at 3% of indent value',
                'Commission billed to the client, 2.5% of indent value',
                'Per-deal commission, agreed order by order',
                'Fixed USD 1,500 per indent, agreed with the client',
              ])
            : null,
        defaultIncoterm: pick(['FOB', 'CIF', 'CFR']),
        defaultPaymentTermCode: pick(['LC_AT_SIGHT', 'LC_90D']),
        blacklistReason: blacklisted
          ? 'Two consecutive consignments failed client QC on impurity profile; plant audit outstanding.'
          : null,
        blacklistedOn: blacklisted ? iso(daysAgo(220)) : null,
        onboardedOn: status === 'NEW' ? null : iso(daysAgo(int(300, 1400))),
      },
    })

    sites.push({
      id: nextId('sit'),
      companyId: id,
      kind: 'HEAD_OFFICE',
      name: `${displayName} Head Office`,
      city: countryCode === 'IN' ? pick(['Mumbai', 'Hyderabad', 'Ahmedabad', 'Bengaluru']) : countryCode === 'CN' ? pick(['Shanghai', 'Hangzhou', 'Shijiazhuang']) : pick(['Barcelona', 'Milan', 'Zug', 'Cork']),
      countryCode,
      addressLine: null,
      isPrimary: true,
      isDeliveryDestination: false,
      isActive: true,
    })
    const plantCount = int(1, 2)
    for (let pIdx = 0; pIdx < plantCount; pIdx++) {
      const city = countryCode === 'IN' ? pick(['Bengaluru', 'Aurangabad', 'Vizag', 'Ankleshwar', 'Baddi']) : countryCode === 'CN' ? pick(['Taizhou', 'Zibo', 'Shijiazhuang']) : pick(['Girona', 'Pavia', 'Zofingen', 'Oulu'])
      sites.push({
        id: nextId('sit'),
        companyId: id,
        kind: 'PLANT',
        name: `${city} Plant`,
        city,
        countryCode,
        addressLine: null,
        isPrimary: false,
        isDeliveryDestination: false,
        isActive: true,
      })
    }

    const mContacts = int(1, 3)
    for (let c = 0; c < mContacts; c++) {
      const [fn, ln] = pick(FOREIGN_NAMES)
      contacts.push({
        id: nextId('con'),
        companyId: id,
        siteId: null,
        fullName: `${fn} ${ln}`,
        designation: `${pick(['Export Manager', 'Business Development Manager', 'Regional Head — South Asia', 'Regulatory Affairs Manager'])}`,
        department: pick(['Purchase', 'Regulatory', 'QA']),
        email: `${fn!.toLowerCase()}.${ln!.toLowerCase()}@${displayName.toLowerCase().replace(/[^a-z]/g, '')}.com`,
        phone: null,
        isPrimary: c === 0,
        isActive: true,
      })
    }

    // status history for manufacturers that progressed
    if (status === 'EXISTING_COMMERCIAL') {
      statusChanges.push(
        {
          id: nextId('msh'),
          companyId: id,
          fromStatus: null,
          toStatus: 'NEW',
          changedAt: isoT(daysAgo(int(900, 1400))),
          changedByUserId: sourcingUser.id,
          remark: 'Introduced at CPHI; product list received.',
        },
        {
          id: nextId('msh'),
          companyId: id,
          fromStatus: 'NEW',
          toStatus: 'UNDER_DEVELOPMENT',
          changedAt: isoT(daysAgo(int(500, 880))),
          changedByUserId: sourcingUser.id,
          remark: 'Samples moving with two clients.',
        },
        {
          id: nextId('msh'),
          companyId: id,
          fromStatus: 'UNDER_DEVELOPMENT',
          toStatus: 'EXISTING_COMMERCIAL',
          changedAt: isoT(daysAgo(int(100, 480))),
          changedByUserId: sourcingUser.id,
          remark: 'First commercial indent placed.',
        },
      )
    }
    if (blacklisted) {
      statusChanges.push({
        id: nextId('msh'),
        companyId: id,
        fromStatus: 'EXISTING_COMMERCIAL',
        toStatus: 'BLACKLISTED',
        changedAt: isoT(daysAgo(220)),
        changedByUserId: regulatoryUser.id,
        remark: 'Blacklisted after repeat QC failures.',
      })
    }
  })

  const clients = companies.filter((c) => c.kind === 'CLIENT')
  const manufacturers = companies.filter((c) => c.kind === 'MANUFACTURER')

  // -------------------------------------------------------------- products
  const products: Product[] = PRODUCT_SEED.map(([genericName, category, cas, synonyms, areas], i) => ({
    id: nextId('prd'),
    genericName,
    category,
    casNumber: cas,
    defaultUom: category === 'EXCIPIENT' ? pick(['KG', 'KG', 'MT']) : 'KG',
    hsCode: `2941.${int(10, 90)}.${int(10, 99)}`,
    description: null,
    synonyms,
    therapeuticCategories: areas.length ? areas : pickN(THERAPEUTIC_CATEGORIES, 1),
    isActive: i !== PRODUCT_SEED.length - 1, // one discontinued, to show the state
    possibleDuplicate: false,
    createdAt: isoT(daysAgo(800 - i * 10)),
    updatedAt: isoT(daysAgo(int(1, 120))),
  }))

  // ------------------------------------------- manufacturer-products, etc.
  const manufacturerProducts: ManufacturerProduct[] = []
  const filings: MpFiling[] = []
  const portfolio: PortfolioItem[] = []
  const prices: MpPrice[] = []

  for (const m of manufacturers) {
    const plants = sites.filter((s) => s.companyId === m.id && s.kind === 'PLANT')
    const count = m.manufacturer!.status === 'NEW' ? int(2, 4) : int(3, 7)
    const mine = pickN(products.filter((p) => p.isActive), count)
    for (const p of mine) {
      const grade = p.category === 'EXCIPIENT' ? pick(['Standard', 'Fine powder', 'Granular']) : pick(GRADES)
      const pharma: Pharmacopoeia = p.category === 'EXCIPIENT' ? pick(['USP', 'BP', 'EP'] as const) : pick(['USP', 'USP', 'BP', 'EP', 'IH'] as const)
      const mp: ManufacturerProduct = {
        id: nextId('mpr'),
        manufacturerCompanyId: m.id,
        productId: p.id,
        siteId: plants.length ? pick(plants).id : null,
        grade,
        pharmacopoeia: pharma,
        status: m.manufacturer!.status === 'INACTIVE' ? 'DISCONTINUED' : chance(0.12) ? 'IN_DEVELOPMENT' : 'ACTIVE',
        moqQty: pick([10, 25, 50, 100, 200]),
        moqUom: 'KG',
        leadTimeDays: pick([30, 45, 60, 75, 90]),
        packingDetails: pick(PACKING),
        annualCapacityQty: int(2, 40) * 1000,
        annualCapacityUom: 'KG',
        remarks: null,
        createdAt: isoT(daysAgo(int(120, 900))),
        updatedAt: isoT(daysAgo(int(1, 110))),
      }
      manufacturerProducts.push(mp)

      // regulatory filings
      if (chance(0.72)) {
        filings.push({
          id: nextId('fil'),
          manufacturerProductId: mp.id,
          kind: 'DMF',
          authority: 'USFDA',
          referenceNumber: `DMF-${int(20000, 39999)}`,
          isActive: true,
          documentId: null,
          remarks: null,
        })
      }
      if (chance(0.45)) {
        filings.push({
          id: nextId('fil'),
          manufacturerProductId: mp.id,
          kind: 'CEP',
          authority: 'EDQM',
          referenceNumber: `R1-CEP ${2015 + int(0, 10)}-${int(100, 399)}`,
          isActive: true,
          documentId: null,
          remarks: null,
        })
      }
      if (chance(0.22)) {
        filings.push({
          id: nextId('fil'),
          manufacturerProductId: mp.id,
          kind: 'ASMF',
          authority: 'EMA',
          referenceNumber: `ASMF-${int(500, 999)}`,
          isActive: true,
          documentId: null,
          remarks: null,
        })
      }

      // TCL portfolio: most commercial sources are represented
      const inPortfolio =
        m.manufacturer!.status === 'EXISTING_COMMERCIAL' ? chance(0.82) :
        m.manufacturer!.status === 'UNDER_DEVELOPMENT' ? chance(0.5) :
        chance(0.15)
      if (inPortfolio && mp.status !== 'DISCONTINUED') {
        portfolio.push({
          id: nextId('pfi'),
          manufacturerProductId: mp.id,
          representation: m.manufacturer!.representation ?? 'INDENT',
          startedOn: iso(daysAgo(int(60, 800))),
          endedOn: null,
          isActive: true,
          remarks: null,
        })

        // price history: an expired band and a current one
        const base = p.category === 'EXCIPIENT' ? int(4, 40) : int(40, 3200)
        const incoterm = pick(['CIF', 'FOB', 'CFR'])
        const olderFrom = daysAgo(int(400, 700))
        const olderTo = daysAgo(int(120, 200))
        prices.push({
          id: nextId('prc'),
          manufacturerProductId: mp.id,
          price: Math.round(base * 1.08 * 100) / 100,
          currency: 'USD',
          perUom: 'KG',
          incoterm,
          minQty: mp.moqQty ?? 25,
          validFrom: iso(olderFrom),
          validTo: iso(olderTo),
          sourceReference: `Quotation ${pick(['QT', 'OFR'])}-${int(1000, 9999)}`,
          remarks: null,
          createdAt: isoT(olderFrom),
        })
        // 82% have a currently valid price; the rest show "price expired"
        if (chance(0.82)) {
          prices.push({
            id: nextId('prc'),
            manufacturerProductId: mp.id,
            price: base,
            currency: 'USD',
            perUom: 'KG',
            incoterm,
            minQty: mp.moqQty ?? 25,
            validFrom: iso(daysAgo(int(20, 110))),
            validTo: iso(daysAhead(int(25, 240))),
            sourceReference: `Quotation ${pick(['QT', 'OFR'])}-${int(1000, 9999)}`,
            remarks: null,
            createdAt: isoT(daysAgo(int(20, 110))),
          })
          // a second, cheaper tier for bigger quantities
          if (chance(0.4)) {
            prices.push({
              id: nextId('prc'),
              manufacturerProductId: mp.id,
              price: Math.round(base * 0.94 * 100) / 100,
              currency: 'USD',
              perUom: 'KG',
              incoterm,
              minQty: (mp.moqQty ?? 25) * 4,
              validFrom: iso(daysAgo(int(20, 110))),
              validTo: iso(daysAhead(int(25, 240))),
              sourceReference: 'Tier price for bulk',
              remarks: null,
              createdAt: isoT(daysAgo(int(20, 110))),
            })
          }
        }
      }
    }
  }

  const portfolioMpIds = new Set(portfolio.filter((p) => p.isActive).map((p) => p.manufacturerProductId))

  // ---------------------------------------------- requirements, engagements
  const requirements: Requirement[] = []
  const engagements: Engagement[] = []
  const requirementEngagements: RequirementEngagementLink[] = []
  const stageHistory: StageHistoryEntry[] = []
  const offers: Offer[] = []
  const samples: SampleRound[] = []

  const stageWeights: [EngagementStage, number][] = [
    ['IDENTIFIED', 14],
    ['OFFERED', 18],
    ['SAMPLE_REQUESTED', 10],
    ['SAMPLE_SENT', 10],
    ['UNDER_EVALUATION', 16],
    ['APPROVED', 14],
    ['COMMERCIAL', 26],
    ['ON_HOLD', 9],
    ['REJECTED', 10],
    ['DISCONTINUED', 4],
  ]
  const stagePool: EngagementStage[] = []
  for (const [s, w] of stageWeights) for (let i = 0; i < w; i++) stagePool.push(s)

  const engagementKey = new Set<string>()

  /** Walk the forward path to a stage, writing history as the trigger would. */
  function buildEngagement(
    clientId: ID,
    mp: ManufacturerProduct,
    targetStage: EngagementStage,
    ownerId: ID,
    opts: { origin?: 'PIPELINE' | 'MIGRATED'; ageDays?: number } = {},
  ): Engagement | null {
    const key = `${clientId}:${mp.id}`
    if (engagementKey.has(key)) return null
    engagementKey.add(key)

    const origin = opts.origin ?? 'PIPELINE'
    const createdDaysAgo = opts.ageDays ?? int(40, 620)
    const id = nextId('eng')

    const path: EngagementStage[] =
      targetStage === 'ON_HOLD'
        ? ['IDENTIFIED', 'OFFERED', pick(['SAMPLE_REQUESTED', 'SAMPLE_SENT', 'UNDER_EVALUATION'] as const), 'ON_HOLD']
        : targetStage === 'REJECTED'
          ? ['IDENTIFIED', 'OFFERED', 'SAMPLE_REQUESTED', 'SAMPLE_SENT', 'UNDER_EVALUATION', 'REJECTED']
          : targetStage === 'DISCONTINUED'
            ? ['IDENTIFIED', 'OFFERED', 'SAMPLE_REQUESTED', 'SAMPLE_SENT', 'UNDER_EVALUATION', 'APPROVED', 'COMMERCIAL', 'DISCONTINUED']
            : (() => {
                const forward: EngagementStage[] = ['IDENTIFIED', 'OFFERED', 'SAMPLE_REQUESTED', 'SAMPLE_SENT', 'UNDER_EVALUATION', 'APPROVED', 'COMMERCIAL']
                return forward.slice(0, forward.indexOf(targetStage) + 1)
              })()

    const span = Math.max(path.length, 2)
    const step = Math.max(2, Math.floor(createdDaysAgo / span))
    let cursor = createdDaysAgo

    const eng: Engagement = {
      id,
      clientCompanyId: clientId,
      manufacturerProductId: mp.id,
      productId: mp.productId,
      manufacturerCompanyId: mp.manufacturerCompanyId,
      stage: targetStage,
      stageChangedAt: isoT(daysAgo(1)),
      stageReasonCode: null,
      stageNote: null,
      stageBeforeHold: null,
      origin,
      ownerUserId: ownerId,
      firstOfferedOn: null,
      firstSampleOn: null,
      approvedOn: null,
      approvalReference: null,
      approvalConditions: null,
      firstCommercialOn: null,
      isOverrideCreated: false,
      remarks: null,
      createdAt: isoT(daysAgo(createdDaysAgo)),
      updatedAt: isoT(daysAgo(1)),
    }

    if (origin === 'MIGRATED') {
      // loaded at go-live at its real stage, with its dates
      eng.approvedOn = iso(daysAgo(createdDaysAgo + 120))
      eng.approvalReference = `QA/APP/${2023 + int(0, 2)}/${int(100, 399)}`
      eng.firstCommercialOn = iso(daysAgo(createdDaysAgo + 60))
      eng.firstOfferedOn = iso(daysAgo(createdDaysAgo + 240))
      eng.firstSampleOn = iso(daysAgo(createdDaysAgo + 200))
      eng.stageChangedAt = isoT(daysAgo(createdDaysAgo))
      stageHistory.push({
        id: nextId('hst'),
        engagementId: id,
        fromStage: null,
        toStage: targetStage,
        changedAt: isoT(daysAgo(createdDaysAgo)),
        changedByUserId: managementUser.id,
        reasonCode: null,
        remark: `Migrated at go-live at stage ${targetStage}`,
        isOverride: false,
        daysInPreviousStage: null,
      })
      engagements.push(eng)
      return eng
    }

    let prev: EngagementStage | null = null
    path.forEach((stage, idx) => {
      const at = daysAgo(Math.max(1, cursor))
      const terminal = stage === 'REJECTED' || stage === 'ON_HOLD' || stage === 'DISCONTINUED'
      const reason = terminal
        ? stage === 'ON_HOLD'
          ? pick(['AWAITING_CLIENT', 'AWAITING_MANUFACTURER', 'AWAITING_REGULATORY'])
          : stage === 'REJECTED'
            ? pick(['PRICE_HIGH', 'QUALITY_FAIL', 'IMPURITY_PROFILE', 'CLIENT_NO_RESPONSE', 'COMPETITOR_WON', 'LEAD_TIME'])
            : pick(['CLIENT_STOPPED_PRODUCT', 'SUPPLY_ISSUE', 'PROJECT_SHELVED'])
        : null
      stageHistory.push({
        id: nextId('hst'),
        engagementId: id,
        fromStage: prev,
        toStage: stage,
        changedAt: isoT(at),
        changedByUserId: idx === 0 ? ownerId : pick([ownerId, regulatoryUser.id, commercialUser.id]),
        reasonCode: reason,
        remark: idx === 0 ? 'Engagement created' : null,
        isOverride: false,
        daysInPreviousStage: idx === 0 ? null : step,
      })
      if (stage === 'OFFERED' && !eng.firstOfferedOn) eng.firstOfferedOn = iso(at)
      if (stage === 'SAMPLE_REQUESTED' && !eng.firstSampleOn) eng.firstSampleOn = iso(at)
      if (stage === 'APPROVED') {
        eng.approvedOn = iso(at)
        eng.approvalReference = `QA/APP/2026/${int(100, 399)}`
        if (chance(0.18)) eng.approvalConditions = 'Approved for two batches pending stability data at 6 months.'
      }
      if (stage === 'COMMERCIAL' && !eng.firstCommercialOn) eng.firstCommercialOn = iso(at)
      if (terminal) {
        eng.stageReasonCode = reason
        eng.stageNote =
          stage === 'ON_HOLD'
            ? pick(['Client has paused the project until the next budget cycle.', 'Manufacturer cannot release a sample before the next campaign.', 'Awaiting DGDA guidance on the source change.'])
            : stage === 'REJECTED'
              ? pick(['Client confirmed by email that they will stay with the incumbent.', 'Impurity at RRT 0.82 above the client limit.', 'Offered price 11% above the incumbent.'])
              : 'Client discontinued the finished product.'
        if (stage === 'ON_HOLD') eng.stageBeforeHold = prev
      }
      eng.stageChangedAt = isoT(at)
      prev = stage
      cursor = Math.max(1, cursor - step)
    })

    engagements.push(eng)

    // offers for anything that reached Offered
    if (path.includes('OFFERED')) {
      const current = prices.find((p) => p.manufacturerProductId === mp.id && p.validTo >= iso(DEMO_TODAY))
      const basePrice = current?.price ?? int(50, 2000)
      const versions = chance(0.3) ? 2 : 1
      for (let v = 1; v <= versions; v++) {
        const offerDate = daysAgo(Math.max(2, createdDaysAgo - step * (1 + v)))
        offers.push({
          id: nextId('ofr'),
          engagementId: id,
          versionNo: v,
          offerDate: iso(offerDate),
          offeredPrice: Math.round(basePrice * (1.1 - v * 0.02) * 100) / 100,
          currency: 'USD',
          perUom: 'KG',
          incoterm: current?.incoterm ?? 'CIF',
          moqQty: mp.moqQty,
          moqUom: mp.moqUom,
          validUntil: iso(daysAhead(int(-40, 70))),
          status: v < versions ? 'SUPERSEDED' : path.includes('APPROVED') ? 'ACCEPTED' : targetStage === 'REJECTED' ? 'DECLINED' : 'SENT',
          sourcePriceId: current?.id ?? null,
          remarks: v > 1 ? 'Revised after the client pushed back on price.' : null,
          createdAt: isoT(offerDate),
          createdByUserId: ownerId,
        })
      }
    }

    // sample rounds for anything that reached Sample Requested
    if (path.includes('SAMPLE_REQUESTED')) {
      const rounds = chance(0.25) ? 2 : 1
      for (let r = 1; r <= rounds; r++) {
        const requested = daysAgo(Math.max(3, createdDaysAgo - step * (2 + r)))
        const dispatched = path.includes('SAMPLE_SENT') ? daysAgo(Math.max(2, createdDaysAgo - step * (3 + r))) : null
        const received = path.includes('UNDER_EVALUATION') && dispatched ? daysAgo(Math.max(1, createdDaysAgo - step * (3.5 + r))) : null
        const decided = path.includes('APPROVED') || targetStage === 'REJECTED'
        const isLast = r === rounds
        const failed = targetStage === 'REJECTED' && isLast
        samples.push({
          id: nextId('smp'),
          engagementId: id,
          roundNo: r,
          purpose: r === 1 ? 'EVALUATION' : pick(['REGISTRATION', 'STABILITY', 'TRIAL_BATCH'] as const),
          requestedOn: iso(requested),
          requestedQty: pick([100, 250, 500, 1000]),
          qtyUom: pick(['G', 'G', 'KG'] as const),
          expectedReceiptOn: dispatched ? iso(daysAhead(-int(1, 40))) : null,
          requestingContactId: null,
          dispatchedOn: dispatched ? iso(dispatched) : null,
          courierName: dispatched ? pick(COURIERS) : null,
          trackingNumber: dispatched ? `${int(1000000000, 9999999999)}` : null,
          batchNumber: dispatched ? `BN-${int(2024, 2026)}-${int(10, 99)}` : null,
          receivedOn: received ? iso(received) : null,
          outcome: !decided && isLast ? 'PENDING' : failed ? 'FAIL' : !isLast ? 'FAIL' : 'PASS',
          outcomeOn: decided || !isLast ? iso(daysAgo(Math.max(1, createdDaysAgo - step * (4 + r)))) : null,
          outcomeByUserId: decided || !isLast ? regulatoryUser.id : null,
          rejectionReasonCode: failed || !isLast ? pick(['QUALITY_FAIL', 'IMPURITY_PROFILE', 'PACKING_UNSUITABLE']) : null,
          outcomeNotes: failed || !isLast ? 'Assay within limits but a single unknown impurity above the client threshold.' : decided ? 'All parameters within specification.' : null,
        })
      }
    }

    return eng
  }

  // Requirements, each spawning engagements against matching sources.
  const reqCount = 64
  for (let i = 0; i < reqCount; i++) {
    const client = pick(clients.filter((c) => c.client!.status !== 'LOST'))
    const product = pick(products.filter((p) => p.isActive))
    const kind = chance(0.42) ? 'ALTERNATE_SOURCE' : 'NEW_DEVELOPMENT'
    const owner = bdOfficers[i % bdOfficers.length]!
    const enquiry = daysAgo(int(2, 420))
    const needsPharma = chance(0.45)

    const req: Requirement = {
      id: nextId('req'),
      clientCompanyId: client.id,
      productId: product.id,
      kind,
      status: 'OPEN',
      enquiryDate: iso(enquiry),
      requiredByDate: chance(0.7) ? iso(daysAhead(int(-60, 240))) : null,
      estAnnualQty: chance(0.85) ? pick([200, 500, 1000, 2000, 3000, 6000, 12000]) : null,
      qtyUom: 'KG',
      qtyIsIndicative: chance(0.25),
      targetPrice: chance(0.6) ? int(30, 2400) : null,
      targetCurrency: 'USD',
      requiredPharmacopoeia: needsPharma ? pick(['USP', 'BP', 'EP'] as const) : null,
      requiredGrade: chance(0.3) ? pick(GRADES) : null,
      currentSourceNote:
        kind === 'ALTERNATE_SOURCE'
          ? pick(['Currently importing direct from a Chinese source', 'Buying through another indentor', 'Single source, wants a second for dual sourcing', 'Incumbent supply has become unreliable'])
          : null,
      alternateReason: kind === 'ALTERNATE_SOURCE' ? pick(['PRICE', 'QUALITY', 'LEAD_TIME', 'DUAL_SOURCING', 'REGULATORY']) : null,
      requestingContactId: pick(contacts.filter((c) => c.companyId === client.id)).id,
      ownerUserId: owner.id,
      duplicateReason: null,
      remarks: null,
      createdAt: isoT(enquiry),
      updatedAt: isoT(daysAgo(int(1, 60))),
    }
    requirements.push(req)

    const candidates = manufacturerProducts.filter(
      (mp) =>
        mp.productId === product.id &&
        portfolioMpIds.has(mp.id) &&
        mp.status === 'ACTIVE' &&
        (!req.requiredPharmacopoeia || mp.pharmacopoeia === req.requiredPharmacopoeia),
    )

    if (candidates.length === 0) {
      req.status = chance(0.5) ? 'SOURCING' : 'OPEN'
      continue
    }

    const engageCount = Math.min(candidates.length, chance(0.35) ? 2 : 1)
    const chosen = pickN(candidates, engageCount)
    let anyEngaged = false
    for (const mp of chosen) {
      const stage = pick(stagePool)
      const eng = buildEngagement(client.id, mp, stage, owner.id, {
        ageDays: Math.max(30, Math.round((DEMO_TODAY.getTime() - enquiry.getTime()) / 86400000)),
      })
      if (eng) {
        anyEngaged = true
        requirementEngagements.push({ requirementId: req.id, engagementId: eng.id, linkedAt: isoT(enquiry) })
      }
    }
    if (anyEngaged) {
      req.status = chance(0.2) ? 'FULFILLED' : 'ENGAGED'
    }
  }

  // Long-standing business loaded at go-live, so the book is not all pipeline.
  for (let i = 0; i < 26; i++) {
    const client = pick(clients.filter((c) => c.client!.status === 'ACTIVE'))
    const mp = pick(manufacturerProducts.filter((m) => portfolioMpIds.has(m.id) && m.status === 'ACTIVE'))
    buildEngagement(client.id, mp, chance(0.75) ? 'COMMERCIAL' : 'APPROVED', pick(bdOfficers).id, {
      origin: 'MIGRATED',
      ageDays: int(200, 700),
    })
  }

  // ------------------------------------------- client orders and indents
  const clientOrders: ClientOrder[] = []
  const clientOrderLines: ClientOrderLine[] = []
  const indents: Indent[] = []
  const indentLines: IndentLine[] = []
  const orderIndentLinks: OrderIndentLink[] = []
  const shipments: Shipment[] = []
  const batches: Batch[] = []
  const shipmentLines: ShipmentLine[] = []
  const deliveries: Delivery[] = []
  const commissions: Commission[] = []

  let coSeq = 1
  let indSeq = 1
  let shpSeq = 1

  const orderable = engagements.filter((e) => e.stage === 'COMMERCIAL' || e.stage === 'APPROVED')
  const byClient = new Map<ID, Engagement[]>()
  for (const e of orderable) {
    const list = byClient.get(e.clientCompanyId) ?? []
    list.push(e)
    byClient.set(e.clientCompanyId, list)
  }

  const batchKey = new Map<string, Batch>()
  function getBatch(mpId: ID, number: string, mfgDaysAgo: number, shelfMonths: number): Batch {
    const key = `${mpId}:${number}`
    const found = batchKey.get(key)
    if (found) return found
    const mfg = daysAgo(mfgDaysAgo)
    const expiry = new Date(mfg)
    expiry.setMonth(expiry.getMonth() + shelfMonths)
    const b: Batch = {
      id: nextId('bat'),
      manufacturerProductId: mpId,
      batchNumber: number,
      manufacturingDate: iso(mfg),
      expiryDate: iso(expiry),
      retestDate: chance(0.4) ? iso(new Date(expiry.getTime() - 180 * 86400000)) : null,
      coaDocumentId: null,
      createdAt: isoT(mfg),
    }
    batches.push(b)
    batchKey.set(key, b)
    return b
  }

  for (const [clientId, engs] of byClient) {
    const client = companies.find((c) => c.id === clientId)!
    const commercialEngs = engs.filter((e) => e.stage === 'COMMERCIAL')
    if (commercialEngs.length === 0) continue
    const orderCount = Math.min(3, Math.max(1, Math.round(commercialEngs.length / 2)))
    const deliverySites = sites.filter((s) => s.companyId === clientId && s.isDeliveryDestination)

    for (let o = 0; o < orderCount; o++) {
      const orderDate = daysAgo(int(10, 300))
      const co: ClientOrder = {
        id: nextId('cor'),
        coNumber: `CO-2026-${String(coSeq++).padStart(5, '0')}`,
        clientCompanyId: clientId,
        deliverySiteId: deliverySites.length ? pick(deliverySites).id : null,
        orderDate: iso(orderDate),
        status: 'OPEN',
        currency: 'USD',
        incoterm: pick(['CIF', 'CFR', 'FOB']),
        paymentTermCode: client.client!.paymentTermCode,
        clientReference: `${client.displayName.slice(0, 3).toUpperCase()}/PO/${int(1000, 9999)}`,
        hasOverride: false,
        cancelledReason: null,
        remarks: null,
        createdAt: isoT(orderDate),
        updatedAt: isoT(orderDate),
        createdByUserId: commercialUser.id,
      }
      clientOrders.push(co)

      // one or two sources on this order; sometimes the same molecule twice
      const lineEngs = pickN(commercialEngs, Math.min(commercialEngs.length, chance(0.4) ? 2 : 1))
      const splitSame = chance(0.3) && commercialEngs.length > 1
      if (splitSame) {
        const sameProduct = commercialEngs.filter((e) => e.productId === lineEngs[0]!.productId)
        if (sameProduct.length > 1) lineEngs.splice(0, lineEngs.length, ...pickN(sameProduct, 2))
      }

      let lineNo = 0
      const madeLines: { line: ClientOrderLine; eng: Engagement }[] = []
      for (const eng of lineEngs) {
        const mp = manufacturerProducts.find((m) => m.id === eng.manufacturerProductId)!
        const qty = pick([100, 200, 300, 500, 800, 1000])
        const line: ClientOrderLine = {
          id: nextId('col'),
          clientOrderId: co.id,
          lineNo: ++lineNo,
          productId: eng.productId,
          manufacturerProductId: mp.id,
          engagementId: eng.id,
          qty,
          qtyUom: 'KG',
          targetPrice: chance(0.5) ? Math.round((prices.find((p) => p.manufacturerProductId === mp.id)?.price ?? 100) * 0.97) : null,
          targetPriceUom: 'KG',
          requiredDeliveryDate: iso(daysAhead(int(-120, 120))),
          status: 'OPEN',
          overrideReason: null,
          remarks: null,
        }
        clientOrderLines.push(line)
        madeLines.push({ line, eng })
      }

      // group lines by manufacturer: one indent each, for this client
      const byMfr = new Map<ID, { line: ClientOrderLine; eng: Engagement }[]>()
      for (const entry of madeLines) {
        const list = byMfr.get(entry.eng.manufacturerCompanyId) ?? []
        list.push(entry)
        byMfr.set(entry.eng.manufacturerCompanyId, list)
      }

      for (const [mfrId, entries] of byMfr) {
        const lcIssued = chance(0.78)
        const ind: Indent = {
          id: nextId('ind'),
          indentNumber: `IND-2026-${String(indSeq++).padStart(5, '0')}`,
          manufacturerCompanyId: mfrId,
          clientCompanyId: clientId,
          orderDate: iso(daysAhead(-int(5, 290))),
          status: 'OPEN',
          currency: 'USD',
          incoterm: co.incoterm,
          paymentTermCode: co.paymentTermCode,
          lcNumber: lcIssued ? `LC/${int(2025, 2026)}/${int(10000, 99999)}` : null,
          lcDate: lcIssued ? iso(daysAgo(int(10, 250))) : null,
          lcBank: lcIssued ? pick(BANKS) : null,
          lcExpiryDate: lcIssued ? iso(daysAhead(int(-20, 180))) : null,
          proformaInvoiceRef: `PI-${int(1000, 9999)}/${int(2025, 2026)}`,
          expectedShipDate: iso(daysAhead(int(-200, 60))),
          cancelledReason: null,
          remarks: null,
          createdAt: isoT(orderDate),
          updatedAt: isoT(orderDate),
          createdByUserId: commercialUser.id,
        }
        indents.push(ind)

        let indLineNo = 0
        let indentValue = 0
        for (const { line } of entries) {
          const price = prices.find((p) => p.manufacturerProductId === line.manufacturerProductId)
          const unitPrice = price?.price ?? int(50, 1500)
          const il: IndentLine = {
            id: nextId('inl'),
            indentId: ind.id,
            lineNo: ++indLineNo,
            manufacturerProductId: line.manufacturerProductId,
            qty: line.qty,
            qtyUom: line.qtyUom,
            unitPrice,
            priceUom: 'KG',
            status: 'OPEN',
            remarks: null,
          }
          indentLines.push(il)
          indentValue += unitPrice * line.qty
          orderIndentLinks.push({
            clientOrderLineId: line.id,
            indentLineId: il.id,
            manufacturerProductId: line.manufacturerProductId,
            linkedQty: line.qty,
            qtyUom: line.qtyUom,
            createdAt: isoT(orderDate),
          })

          // shipment against this indent line
          if (chance(0.82)) {
            const shipped = daysAgo(int(5, 200))
            const arrived = chance(0.8)
            const cleared = arrived && chance(0.78)
            const held = arrived && !cleared && chance(0.5)
            const shp: Shipment = {
              id: nextId('shp'),
              shipmentRef: `SHP-2026-${String(shpSeq++).padStart(4, '0')}`,
              indentId: ind.id,
              mode: pick(['SEA', 'SEA', 'AIR', 'COURIER'] as const),
              status: cleared ? (chance(0.7) ? 'DELIVERED' : 'CLEARED') : held ? 'HELD_AT_CUSTOMS' : arrived ? 'ARRIVED' : 'IN_TRANSIT',
              blAwbNumber: `${pick(['MAEU', 'MSCU', 'HLCU', 'AWB'])}${int(100000, 999999)}`,
              carrier: pick(['Maersk', 'MSC', 'Hapag-Lloyd', 'Emirates SkyCargo', 'Singapore Airlines Cargo']),
              forwarderName: pick(FORWARDERS),
              cnfAgentName: pick(CNF_AGENTS),
              portOfLoading: pick(PORTS.loading),
              portOfDischarge: pick(PORTS.discharge),
              etd: iso(shipped),
              eta: iso(new Date(shipped.getTime() + int(12, 32) * 86400000)),
              actualArrivalDate: arrived ? iso(new Date(shipped.getTime() + int(14, 36) * 86400000)) : null,
              customsClearedOn: cleared ? iso(new Date(shipped.getTime() + int(18, 44) * 86400000)) : null,
              holdRemark: held ? pick(['Bill of entry query on HS code; C&F agent responding.', 'Awaiting DGDA release letter at the port.', 'Assessment dispute on declared value.']) : null,
              remarks: null,
              createdAt: isoT(shipped),
              updatedAt: isoT(shipped),
            }
            shipments.push(shp)

            // one or several batches per line
            const batchCount = chance(0.45) ? int(2, 3) : 1
            const per = Math.floor(line.qty / batchCount)
            for (let b = 0; b < batchCount; b++) {
              const mfgAgo = int(60, 260)
              const shelf = chance(0.12) ? int(14, 22) : int(26, 48)
              const batch = getBatch(line.manufacturerProductId, `BN-${int(2025, 2026)}-${int(100, 999)}`, mfgAgo, shelf)
              const qty = b === batchCount - 1 ? line.qty - per * (batchCount - 1) : per
              const expiry = batch.expiryDate ? new Date(batch.expiryDate) : null
              const cutoff = new Date(DEMO_TODAY)
              cutoff.setMonth(cutoff.getMonth() + (client.client!.minShelfLifeMonths ?? 24))
              const short = expiry ? expiry < cutoff : false
              const sl: ShipmentLine = {
                id: nextId('sbl'),
                shipmentId: shp.id,
                indentId: ind.id,
                indentLineId: il.id,
                manufacturerProductId: line.manufacturerProductId,
                batchId: batch.id,
                qty,
                qtyUom: line.qtyUom,
                shortShelfLifeRemark: short ? 'Client QA accepted the shorter shelf life in writing before shipment.' : null,
              }
              shipmentLines.push(sl)

              // deliveries once cleared
              if (cleared && chance(0.8)) {
                const site = deliverySites.length ? pick(deliverySites) : null
                if (site) {
                  const full = chance(0.75)
                  deliveries.push({
                    id: nextId('dlv'),
                    shipmentLineId: sl.id,
                    clientOrderLineId: line.id,
                    deliverySiteId: site.id,
                    deliveredQty: full ? qty : Math.floor(qty / 2),
                    qtyUom: sl.qtyUom,
                    deliveredOn: iso(new Date(new Date(shp.customsClearedOn!).getTime() + int(1, 9) * 86400000)),
                    grnReference: `GRN-${int(1000, 9999)}`,
                    remarks: null,
                  })
                }
              }
            }
          }
        }

        // TCL's commission on this indent, from the client
        const basis = chance(0.72) ? 'PERCENT_OF_VALUE' : chance(0.6) ? 'FIXED_AMOUNT' : 'TBD'
        const ratePct = basis === 'PERCENT_OF_VALUE' ? pick([2, 2.5, 3, 3.5, 4]) : null
        const amount =
          basis === 'PERCENT_OF_VALUE'
            ? Math.round(indentValue * (ratePct! / 100) * 100) / 100
            : basis === 'FIXED_AMOUNT'
              ? pick([1200, 1500, 2000, 2500, 3000])
              : null
        const statusRoll = rand()
        const status =
          amount == null
            ? 'PENDING'
            : statusRoll < 0.3
              ? 'PENDING'
              : statusRoll < 0.52
                ? 'INVOICED'
                : statusRoll < 0.64
                  ? 'PARTIALLY_RECEIVED'
                  : statusRoll < 0.96
                    ? 'RECEIVED'
                    : 'WRITTEN_OFF'
        const invoiced = status !== 'PENDING'
        const received =
          status === 'RECEIVED' ? amount! : status === 'PARTIALLY_RECEIVED' ? Math.round(amount! * 0.5 * 100) / 100 : 0
        commissions.push({
          id: nextId('com'),
          indentId: ind.id,
          payableBy: 'CLIENT',
          basis,
          ratePct,
          baseAmount: basis === 'PERCENT_OF_VALUE' ? Math.round(indentValue * 100) / 100 : null,
          amount,
          currency: 'USD',
          status,
          invoiceReference: invoiced ? `TCL/COM/2026/${int(100, 899)}` : null,
          invoicedOn: invoiced ? iso(daysAgo(int(5, 180))) : null,
          receivedAmount: received,
          receivedOn: received > 0 ? iso(daysAgo(int(1, 120))) : null,
          remarks: basis === 'TBD' ? 'Rate still being negotiated with the client; indent released on the MD’s approval.' : null,
        })
      }
    }
  }

  // ------------------------------------------------------------- documents
  const documentDefs: DocumentRecord[] = []
  const addDoc = (d: Omit<DocumentRecord, 'id' | 'versionNo' | 'supersededById' | 'isActive' | 'uploadedAt' | 'uploadedByUserId' | 'fileSizeBytes' | 'mimeType'> & Partial<DocumentRecord>) => {
    documentDefs.push({
      id: nextId('doc'),
      versionNo: 1,
      supersededById: null,
      isActive: true,
      uploadedAt: isoT(daysAgo(int(5, 400))),
      uploadedByUserId: regulatoryUser.id,
      fileSizeBytes: int(80, 9000) * 1024,
      mimeType: 'application/pdf',
      ...d,
    } as DocumentRecord)
  }

  // plant certificates on sites
  for (const m of manufacturers) {
    const plants = sites.filter((s) => s.companyId === m.id && s.kind === 'PLANT')
    for (const plant of plants) {
      if (!chance(0.8)) continue
      const issued = daysAgo(int(100, 900))
      const expires = daysAhead(int(-60, 700))
      addDoc({
        typeCode: chance(0.7) ? 'GMP' : 'WHO_GMP',
        entityType: 'COMPANY_SITE',
        entityId: plant.id,
        title: `${chance(0.7) ? 'GMP' : 'WHO-GMP'} certificate — ${plant.name}`,
        referenceNumber: `GMP/${int(1000, 9999)}/${int(2023, 2026)}`,
        issuingAuthority: m.countryCode === 'IN' ? 'CDSCO' : m.countryCode === 'CN' ? 'NMPA' : 'EMA',
        issuedOn: iso(issued),
        expiresOn: iso(expires),
        fileName: `gmp-${plant.name.toLowerCase().replace(/\s+/g, '-')}.pdf`,
      })
    }
    if (m.manufacturer!.agreementReference) {
      addDoc({
        typeCode: 'AGREEMENT',
        entityType: 'COMPANY',
        entityId: m.id,
        title: `Agency agreement — ${m.displayName}`,
        referenceNumber: m.manufacturer!.agreementReference,
        issuingAuthority: null,
        issuedOn: m.manufacturer!.agreementSignedOn,
        expiresOn: m.manufacturer!.agreementExpiresOn,
        fileName: `agency-agreement-${m.displayName.toLowerCase().replace(/\s+/g, '-')}.pdf`,
        uploadedByUserId: sourcingUser.id,
      })
    }
  }

  // filings carry their document
  for (const f of filings) {
    if (!chance(0.65)) continue
    const mp = manufacturerProducts.find((m) => m.id === f.manufacturerProductId)!
    const product = products.find((p) => p.id === mp.productId)!
    const expires = f.kind === 'CEP' ? iso(daysAhead(int(-40, 900))) : null
    addDoc({
      typeCode: f.kind === 'CEP' ? 'CEP' : 'DMF',
      entityType: 'MANUFACTURER_PRODUCT',
      entityId: mp.id,
      title: `${f.kind} ${f.referenceNumber} — ${product.genericName}`,
      referenceNumber: f.referenceNumber,
      issuingAuthority: f.authority,
      issuedOn: iso(daysAgo(int(200, 1400))),
      expiresOn: expires,
      fileName: `${f.kind.toLowerCase()}-${f.referenceNumber.toLowerCase().replace(/[^a-z0-9]+/g, '-')}.pdf`,
    })
  }

  // COAs on batches
  for (const b of batches) {
    if (!chance(0.85)) continue
    addDoc({
      typeCode: 'COA',
      entityType: 'BATCH',
      entityId: b.id,
      title: `Certificate of analysis — ${b.batchNumber}`,
      referenceNumber: b.batchNumber,
      issuingAuthority: null,
      issuedOn: b.manufacturingDate,
      expiresOn: null,
      fileName: `coa-${b.batchNumber.toLowerCase()}.pdf`,
      uploadedByUserId: commercialUser.id,
    })
  }

  // approval letters on approved engagements
  for (const e of engagements) {
    if (!e.approvedOn || !chance(0.6)) continue
    addDoc({
      typeCode: 'APPROVAL_LETTER',
      entityType: 'ENGAGEMENT',
      entityId: e.id,
      title: `Client approval letter — ${e.approvalReference ?? 'reference pending'}`,
      referenceNumber: e.approvalReference,
      issuingAuthority: companies.find((c) => c.id === e.clientCompanyId)?.displayName ?? null,
      issuedOn: e.approvedOn,
      expiresOn: null,
      fileName: `approval-${(e.approvalReference ?? 'letter').toLowerCase().replace(/[^a-z0-9]+/g, '-')}.pdf`,
    })
  }

  // ------------------------------------------------------------ activities
  const activities: Activity[] = []
  for (const e of pickN(engagements, Math.min(engagements.length, 70))) {
    const n = int(1, 3)
    for (let i = 0; i < n; i++) {
      const kind = pick(['CALL', 'EMAIL', 'MEETING', 'VISIT', 'NOTE'] as const)
      activities.push({
        id: nextId('act'),
        kind,
        entityType: 'ENGAGEMENT',
        entityId: e.id,
        subject: pick([
          'Chased the client for sample feedback',
          'Shared the revised offer',
          'Technical query on impurity profile passed to the manufacturer',
          'Client QA asked for stability data',
          'Discussed lead time and shipment plan',
          'Visited the client QA head',
          'Manufacturer confirmed capacity for next quarter',
        ]),
        body: null,
        occurredAt: isoT(daysAgo(int(1, 200))),
        contactId: null,
        followUpDate: chance(0.25) ? iso(daysAhead(int(-10, 30))) : null,
        isCompleted: chance(0.7),
        createdByUserId: e.ownerUserId,
      })
    }
  }

  // ---------------------------------------------------------- notifications
  const notifications: Notification[] = []
  const ageing = engagements
    .filter((e) => e.stage === 'UNDER_EVALUATION' || e.stage === 'SAMPLE_SENT')
    .slice(0, 6)
  for (const e of ageing) {
    const product = products.find((p) => p.id === e.productId)!
    const client = companies.find((c) => c.id === e.clientCompanyId)!
    notifications.push({
      id: nextId('ntf'),
      userId: e.ownerUserId,
      category: 'STAGE_AGEING',
      title: `No client feedback on ${product.genericName}`,
      body: `${client.displayName} has had the sample for longer than the agreed window.`,
      entityType: 'ENGAGEMENT',
      entityId: e.id,
      isRead: chance(0.3),
      createdAt: isoT(daysAgo(int(1, 12))),
    })
  }
  for (const d of documentDefs.filter((x) => x.expiresOn && x.expiresOn <= iso(daysAhead(90))).slice(0, 5)) {
    notifications.push({
      id: nextId('ntf'),
      userId: regulatoryUser.id,
      category: 'DOC_EXPIRY',
      title: `${d.typeCode} expiring: ${d.title}`,
      body: `Expires on ${d.expiresOn}.`,
      entityType: 'DOCUMENT',
      entityId: d.id,
      isRead: false,
      createdAt: isoT(daysAgo(int(1, 20))),
    })
  }

  // ----------------------------------------------------------------- audit
  const audit: AuditEntry[] = []
  const security: SecurityEntry[] = []
  const auditables: { table: string; id: ID; label: string; at: string; user: ID }[] = []
  for (const e of engagements.slice(0, 40)) {
    auditables.push({ table: 'engagement', id: e.id, label: engagementLabel(e), at: e.createdAt, user: e.ownerUserId })
  }
  for (const c of companies.slice(0, 20)) {
    auditables.push({ table: 'company', id: c.id, label: c.displayName, at: c.createdAt, user: sourcingUser.id })
  }
  for (const a of auditables) {
    audit.push({
      id: nextId('aud'),
      occurredAt: a.at,
      userId: a.user,
      action: 'INSERT',
      tableName: a.table,
      recordId: a.id,
      recordLabel: a.label,
      changedFields: null,
    })
  }
  for (const h of stageHistory.slice(0, 60)) {
    if (!h.fromStage) continue
    audit.push({
      id: nextId('aud'),
      occurredAt: h.changedAt,
      userId: h.changedByUserId,
      action: 'UPDATE',
      tableName: 'engagement',
      recordId: h.engagementId,
      recordLabel: engagementLabel(engagements.find((e) => e.id === h.engagementId)!),
      changedFields: { stage: { old: h.fromStage, new: h.toStage } },
    })
  }
  audit.sort((a, b) => (a.occurredAt < b.occurredAt ? 1 : -1))

  for (let i = 0; i < 14; i++) {
    const u = pick(users.filter((x) => x.isActive && x.activatedAt))
    security.push({
      id: nextId('sec'),
      occurredAt: isoT(daysAgo(int(0, 30))),
      eventType: pick(['LOGIN', 'LOGIN', 'EXPORT', 'CROSS_CLIENT_VIEW', 'LOGIN_FAIL'] as const),
      userId: u.id,
      detail: pick([
        'Signed in',
        'Exported the product list (filters: category=API)',
        'Viewed other clients taking Budesonide, from Square',
        'Failed sign-in: wrong password',
      ]),
      rowCount: chance(0.3) ? int(10, 400) : null,
    })
  }
  security.sort((a, b) => (a.occurredAt < b.occurredAt ? 1 : -1))

  function engagementLabel(e: Engagement): string {
    const client = companies.find((c) => c.id === e.clientCompanyId)?.displayName ?? '?'
    const product = products.find((p) => p.id === e.productId)?.genericName ?? '?'
    const mfr = companies.find((c) => c.id === e.manufacturerCompanyId)?.displayName ?? '?'
    return `${client} — ${product} (${mfr})`
  }

  // ------------------------------------------------- demonstration stories
  // Hand-made records for the presentation route (see DEMO_STORIES). Built
  // last, with fixed values, so the generated book above is unchanged.
  const companyNamed = (name: string) => companies.find((c) => c.displayName === name)!
  const square = companyNamed('Square')
  const beximco = companyNamed('Beximco')
  const biocon = companyNamed('Biocon')
  const wockhardt = companyNamed('Wockhardt')
  const budesonide = products.find((p) => p.genericName === 'Budesonide')!
  const storyOwner = bdOfficers[0]!

  /** A represented, priced, filed Budesonide source at this manufacturer. */
  function storySource(m: Company, grade: string, pharmacopoeia: Pharmacopoeia, price: number): ManufacturerProduct {
    let mp = manufacturerProducts.find((x) => x.manufacturerCompanyId === m.id && x.productId === budesonide.id)
    if (!mp) {
      mp = {
        id: nextId('mpr'),
        manufacturerCompanyId: m.id,
        productId: budesonide.id,
        siteId: sites.find((s) => s.companyId === m.id && s.kind === 'PLANT')?.id ?? null,
        grade,
        pharmacopoeia,
        status: 'ACTIVE',
        moqQty: 25,
        moqUom: 'KG',
        leadTimeDays: 45,
        packingDetails: '5 KG aluminium can',
        annualCapacityQty: 4000,
        annualCapacityUom: 'KG',
        remarks: null,
        createdAt: isoT(daysAgo(420)),
        updatedAt: isoT(daysAgo(30)),
      }
      manufacturerProducts.push(mp)
    }
    mp.status = 'ACTIVE'
    if (!portfolio.some((p) => p.manufacturerProductId === mp!.id && p.isActive)) {
      portfolio.push({
        id: nextId('pfi'),
        manufacturerProductId: mp.id,
        representation: m.manufacturer?.representation ?? 'INDENT',
        startedOn: iso(daysAgo(400)),
        endedOn: null,
        isActive: true,
        remarks: null,
      })
    }
    if (!prices.some((p) => p.manufacturerProductId === mp!.id && p.validTo >= iso(DEMO_TODAY))) {
      prices.push({
        id: nextId('prc'),
        manufacturerProductId: mp.id,
        price,
        currency: 'USD',
        perUom: 'KG',
        incoterm: 'CIF',
        minQty: 25,
        validFrom: iso(daysAgo(240)),
        validTo: iso(daysAhead(150)),
        sourceReference: `Quotation QT-${m.displayName.slice(0, 3).toUpperCase()}-2026`,
        remarks: null,
        createdAt: isoT(daysAgo(240)),
      })
    }
    if (!filings.some((f) => f.manufacturerProductId === mp!.id && f.kind === 'DMF')) {
      filings.push({
        id: nextId('fil'),
        manufacturerProductId: mp.id,
        kind: 'DMF',
        authority: 'USFDA',
        referenceNumber: m === biocon ? 'DMF-24417' : 'DMF-31902',
        isActive: true,
        documentId: null,
        remarks: null,
      })
    }
    return mp
  }

  const bioconBudesonide = storySource(biocon, 'Micronised', 'EP', 1840)
  const wockhardtBudesonide = storySource(wockhardt, 'Micronised', 'USP', 1795)
  const bdNow = (n: number) => iso(daysAgo(n))

  /** A full pipeline history to Commercial, written the way the trigger would. */
  function storyEngagement(mp: ManufacturerProduct, startDaysAgo: number): Engagement {
    const id = nextId('eng')
    const path: [EngagementStage, number][] = [
      ['IDENTIFIED', startDaysAgo],
      ['OFFERED', startDaysAgo - 8],
      ['SAMPLE_REQUESTED', startDaysAgo - 20],
      ['SAMPLE_SENT', startDaysAgo - 30],
      ['UNDER_EVALUATION', startDaysAgo - 42],
      ['APPROVED', startDaysAgo - 90],
      ['COMMERCIAL', 93],
    ]
    path.forEach(([stage, ago], i) => {
      stageHistory.push({
        id: nextId('hst'),
        engagementId: id,
        fromStage: i === 0 ? null : path[i - 1]![0],
        toStage: stage,
        changedAt: isoT(daysAgo(ago)),
        changedByUserId: i === 0 ? storyOwner.id : stage === 'APPROVED' ? regulatoryUser.id : storyOwner.id,
        reasonCode: null,
        remark: i === 0 ? 'Engagement created' : stage === 'COMMERCIAL' ? 'Automatic: first indent placed' : null,
        isOverride: false,
        daysInPreviousStage: i === 0 ? null : path[i - 1]![1] - ago,
      })
    })
    const price = prices.find((p) => p.manufacturerProductId === mp.id && p.validTo >= iso(DEMO_TODAY))!
    offers.push({
      id: nextId('ofr'),
      engagementId: id,
      versionNo: 1,
      offerDate: bdNow(startDaysAgo - 8),
      offeredPrice: price.price,
      currency: 'USD',
      perUom: 'KG',
      incoterm: 'CIF',
      moqQty: 25,
      moqUom: 'KG',
      validUntil: bdNow(startDaysAgo - 68),
      status: 'ACCEPTED',
      sourcePriceId: price.id,
      remarks: null,
      createdAt: isoT(daysAgo(startDaysAgo - 8)),
      createdByUserId: storyOwner.id,
    })
    samples.push({
      id: nextId('smp'),
      engagementId: id,
      roundNo: 1,
      purpose: 'EVALUATION',
      requestedOn: bdNow(startDaysAgo - 20),
      requestedQty: 250,
      qtyUom: 'G',
      expectedReceiptOn: bdNow(startDaysAgo - 40),
      requestingContactId: contacts.find((c) => c.companyId === square.id)?.id ?? null,
      dispatchedOn: bdNow(startDaysAgo - 30),
      courierName: COURIERS[0]!,
      trackingNumber: mp === bioconBudesonide ? '4410287765' : '4410291108',
      batchNumber: mp === bioconBudesonide ? 'BUD-EP-2602' : 'BUD-US-2611',
      receivedOn: bdNow(startDaysAgo - 42),
      outcome: 'PASS',
      outcomeOn: bdNow(startDaysAgo - 85),
      outcomeByUserId: regulatoryUser.id,
      rejectionReasonCode: null,
      outcomeNotes: 'Assay, related substances and particle size within the inhalation specification.',
    })
    const eng: Engagement = {
      id,
      clientCompanyId: square.id,
      manufacturerProductId: mp.id,
      productId: mp.productId,
      manufacturerCompanyId: mp.manufacturerCompanyId,
      stage: 'COMMERCIAL',
      stageChangedAt: isoT(daysAgo(93)),
      stageReasonCode: null,
      stageNote: null,
      stageBeforeHold: null,
      origin: 'PIPELINE',
      ownerUserId: storyOwner.id,
      firstOfferedOn: bdNow(startDaysAgo - 8),
      firstSampleOn: bdNow(startDaysAgo - 20),
      approvedOn: bdNow(startDaysAgo - 90),
      approvalReference: mp === bioconBudesonide ? 'SQ/QA/APP/2026/118' : 'SQ/QA/APP/2026/121',
      approvalConditions: null,
      firstCommercialOn: bdNow(93),
      isOverrideCreated: false,
      remarks: null,
      createdAt: isoT(daysAgo(startDaysAgo)),
      updatedAt: isoT(daysAgo(93)),
    }
    engagements.push(eng)
    engagementKey.add(`${square.id}:${mp.id}`)
    addDoc({
      typeCode: 'APPROVAL_LETTER',
      entityType: 'ENGAGEMENT',
      entityId: id,
      title: `Square approval letter — Budesonide (${mp.manufacturerCompanyId === biocon.id ? 'Biocon' : 'Wockhardt'})`,
      referenceNumber: eng.approvalReference,
      issuingAuthority: null,
      issuedOn: eng.approvedOn,
      expiresOn: null,
      fileName: `square-approval-budesonide-${mp.id}.pdf`,
      uploadedAt: isoT(daysAgo(startDaysAgo - 89)),
    })
    return eng
  }

  // Story: Square, Budesonide, dual sourced from Biocon and Wockhardt, one order split across both.
  const squareReq: Requirement = {
    id: nextId('req'),
    clientCompanyId: square.id,
    productId: budesonide.id,
    kind: 'ALTERNATE_SOURCE',
    status: 'FULFILLED',
    enquiryDate: bdNow(232),
    requiredByDate: bdNow(100),
    estAnnualQty: 1200,
    qtyUom: 'KG',
    qtyIsIndicative: false,
    targetPrice: 1850,
    targetCurrency: 'USD',
    requiredPharmacopoeia: null,
    requiredGrade: 'Micronised',
    currentSourceNote: 'Single Chinese source for the inhaler line; wants a second approved source.',
    alternateReason: 'DUAL_SOURCING',
    requestingContactId: contacts.find((c) => c.companyId === square.id)?.id ?? null,
    ownerUserId: storyOwner.id,
    duplicateReason: null,
    remarks: 'Inhalation grade. Square QA wants both sources registered before the next DGDA renewal.',
    createdAt: isoT(daysAgo(232)),
    updatedAt: isoT(daysAgo(93)),
  }
  requirements.push(squareReq)
  const squareBiocon = storyEngagement(bioconBudesonide, 230)
  const squareWockhardt = storyEngagement(wockhardtBudesonide, 225)
  for (const e of [squareBiocon, squareWockhardt]) {
    requirementEngagements.push({ requirementId: squareReq.id, engagementId: e.id, linkedAt: isoT(daysAgo(230)) })
  }

  const squareSite = sites.find((s) => s.companyId === square.id && s.isDeliveryDestination)!
  const squareOrder: ClientOrder = {
    id: nextId('cor'),
    coNumber: `CO-2026-${String(coSeq++).padStart(5, '0')}`,
    clientCompanyId: square.id,
    deliverySiteId: squareSite.id,
    orderDate: bdNow(96),
    status: 'OPEN',
    currency: 'USD',
    incoterm: 'CIF',
    paymentTermCode: 'LC_90D',
    clientReference: 'SQU/PO/7731',
    hasOverride: false,
    cancelledReason: null,
    remarks: 'First commercial order on the dual-sourced Budesonide: 300 kg from Biocon, 200 kg from Wockhardt.',
    createdAt: isoT(daysAgo(96)),
    updatedAt: isoT(daysAgo(30)),
    createdByUserId: commercialUser.id,
  }
  clientOrders.push(squareOrder)

  const storyLegs: { eng: Engagement; mp: ManufacturerProduct; qty: number; ratePct: number; paid: boolean; lc: string; bl: string; batch: string }[] = [
    { eng: squareBiocon, mp: bioconBudesonide, qty: 300, ratePct: 3, paid: true, lc: 'LC/2026/48211', bl: 'MAEU482713', batch: 'BUD-EP-2607' },
    { eng: squareWockhardt, mp: wockhardtBudesonide, qty: 200, ratePct: 3, paid: false, lc: 'LC/2026/48212', bl: 'MSCU561904', batch: 'BUD-US-2614' },
  ]
  storyLegs.forEach((leg, i) => {
    const line: ClientOrderLine = {
      id: nextId('col'),
      clientOrderId: squareOrder.id,
      lineNo: i + 1,
      productId: budesonide.id,
      manufacturerProductId: leg.mp.id,
      engagementId: leg.eng.id,
      qty: leg.qty,
      qtyUom: 'KG',
      targetPrice: 1850,
      targetPriceUom: 'KG',
      requiredDeliveryDate: bdNow(30),
      status: 'OPEN',
      overrideReason: null,
      remarks: null,
    }
    clientOrderLines.push(line)
    const unitPrice = prices.find((p) => p.manufacturerProductId === leg.mp.id && p.validTo >= iso(DEMO_TODAY))!.price
    const ind: Indent = {
      id: nextId('ind'),
      indentNumber: `IND-2026-${String(indSeq++).padStart(5, '0')}`,
      manufacturerCompanyId: leg.mp.manufacturerCompanyId,
      clientCompanyId: square.id,
      orderDate: bdNow(93),
      status: 'OPEN',
      currency: 'USD',
      incoterm: 'CIF',
      paymentTermCode: 'LC_90D',
      lcNumber: leg.lc,
      lcDate: bdNow(86),
      lcBank: BANKS[0]!,
      lcExpiryDate: bdNow(-75),
      proformaInvoiceRef: `PI-${leg.mp.manufacturerCompanyId === biocon.id ? 'BIO' : 'WOC'}-0931/2026`,
      expectedShipDate: bdNow(72),
      cancelledReason: null,
      remarks: null,
      createdAt: isoT(daysAgo(93)),
      updatedAt: isoT(daysAgo(30)),
      createdByUserId: commercialUser.id,
    }
    indents.push(ind)
    const il: IndentLine = {
      id: nextId('inl'),
      indentId: ind.id,
      lineNo: 1,
      manufacturerProductId: leg.mp.id,
      qty: leg.qty,
      qtyUom: 'KG',
      unitPrice,
      priceUom: 'KG',
      status: 'OPEN',
      remarks: null,
    }
    indentLines.push(il)
    orderIndentLinks.push({
      clientOrderLineId: line.id,
      indentLineId: il.id,
      manufacturerProductId: leg.mp.id,
      linkedQty: leg.qty,
      qtyUom: 'KG',
      createdAt: isoT(daysAgo(93)),
    })
    const shp: Shipment = {
      id: nextId('shp'),
      shipmentRef: `SHP-2026-${String(shpSeq++).padStart(4, '0')}`,
      indentId: ind.id,
      mode: 'SEA',
      status: 'CLEARED',
      blAwbNumber: leg.bl,
      carrier: i === 0 ? 'Maersk' : 'MSC',
      forwarderName: FORWARDERS[0]!,
      cnfAgentName: CNF_AGENTS[0]!,
      portOfLoading: PORTS.loading[0]!,
      portOfDischarge: PORTS.discharge[0]!,
      etd: bdNow(70 - i * 3),
      eta: bdNow(48 - i * 3),
      actualArrivalDate: bdNow(46 - i * 3),
      customsClearedOn: bdNow(40 - i * 3),
      holdRemark: null,
      remarks: null,
      createdAt: isoT(daysAgo(70 - i * 3)),
      updatedAt: isoT(daysAgo(35)),
    }
    shipments.push(shp)
    const batch = getBatch(leg.mp.id, leg.batch, 130, 36)
    const sl: ShipmentLine = {
      id: nextId('sbl'),
      shipmentId: shp.id,
      indentId: ind.id,
      indentLineId: il.id,
      manufacturerProductId: leg.mp.id,
      batchId: batch.id,
      qty: leg.qty,
      qtyUom: 'KG',
      shortShelfLifeRemark: null,
    }
    shipmentLines.push(sl)
    deliveries.push({
      id: nextId('dlv'),
      shipmentLineId: sl.id,
      clientOrderLineId: line.id,
      deliverySiteId: squareSite.id,
      deliveredQty: leg.qty,
      qtyUom: 'KG',
      deliveredOn: bdNow(36 - i * 3),
      grnReference: `SQ-GRN-${5521 + i}`,
      remarks: null,
    })
    const value = unitPrice * leg.qty
    const amount = Math.round(value * leg.ratePct) / 100
    commissions.push({
      id: nextId('com'),
      indentId: ind.id,
      payableBy: 'CLIENT',
      basis: 'PERCENT_OF_VALUE',
      ratePct: leg.ratePct,
      baseAmount: value,
      amount,
      currency: 'USD',
      status: leg.paid ? 'RECEIVED' : 'INVOICED',
      invoiceReference: `TCL/COM/2026/${940 + i}`,
      invoicedOn: bdNow(30),
      receivedAmount: leg.paid ? amount : 0,
      receivedOn: leg.paid ? bdNow(12) : null,
      remarks: null,
    })
  })

  // Story: Beximco has just asked for Budesonide, and two represented sources can answer it.
  requirements.push({
    id: nextId('req'),
    clientCompanyId: beximco.id,
    productId: budesonide.id,
    kind: 'NEW_DEVELOPMENT',
    status: 'OPEN',
    enquiryDate: bdNow(2),
    requiredByDate: bdNow(-120),
    estAnnualQty: 600,
    qtyUom: 'KG',
    qtyIsIndicative: true,
    targetPrice: 1800,
    targetCurrency: 'USD',
    requiredPharmacopoeia: null,
    requiredGrade: 'Micronised',
    currentSourceNote: null,
    alternateReason: null,
    requestingContactId: contacts.find((c) => c.companyId === beximco.id)?.id ?? null,
    ownerUserId: storyOwner.id,
    duplicateReason: null,
    remarks: 'New inhaler development for the export range. Wants samples from two sources if possible.',
    createdAt: isoT(daysAgo(2)),
    updatedAt: isoT(daysAgo(2)),
  })

  // ------------------------------------------------------ consistency pass
  repairChronology()
  alignStatuses()

  /**
   * The generator above draws dates independently, so an indent could pre-date
   * its order or a shipment its indent. Each record is moved to sit after the
   * one it depends on, and nothing is left dated after the demonstration day.
   */
  function repairChronology() {
    const today = iso(DEMO_TODAY)
    const addDays = (d: string, n: number) => iso(new Date(new Date(`${d}T00:00:00Z`).getTime() + n * 86400000))
    const diff = (a: string, b: string) => Math.round((Date.parse(a) - Date.parse(b)) / 86400000)
    const atMost = (d: string) => (d > today ? today : d)

    for (const ind of indents) {
      const lineIds = new Set(indentLines.filter((l) => l.indentId === ind.id).map((l) => l.id))
      const orderLineIds = new Set(orderIndentLinks.filter((l) => lineIds.has(l.indentLineId)).map((l) => l.clientOrderLineId))
      const orderDates = clientOrderLines
        .filter((l) => orderLineIds.has(l.id))
        .map((l) => clientOrders.find((o) => o.id === l.clientOrderId)?.orderDate)
        .filter((d): d is string => Boolean(d))
        .sort()
      const latestOrder = orderDates.at(-1)
      if (latestOrder && ind.orderDate < latestOrder) {
        ind.orderDate = atMost(addDays(latestOrder, 2))
        ind.createdAt = ind.updatedAt = `${ind.orderDate}T09:00:00.000Z`
      }
      if (ind.lcDate && ind.lcDate < ind.orderDate) ind.lcDate = atMost(addDays(ind.orderDate, 6))
      if (ind.lcDate && ind.lcExpiryDate && ind.lcExpiryDate <= ind.lcDate) ind.lcExpiryDate = addDays(ind.lcDate, 120)
      if (ind.expectedShipDate && ind.expectedShipDate < ind.orderDate) ind.expectedShipDate = addDays(ind.orderDate, 30)
    }

    const dropDeliveries = new Set<ID>()
    for (const s of shipments) {
      const ind = indents.find((i) => i.id === s.indentId)
      if (!ind || !s.etd) continue
      const earliest = addDays(ind.orderDate, 10)
      const shift = s.etd < earliest ? diff(earliest, s.etd) : 0
      const move = (d: string | null) => (d ? addDays(d, shift) : null)
      s.etd = move(s.etd)
      s.eta = move(s.eta)
      s.actualArrivalDate = move(s.actualArrivalDate)
      s.customsClearedOn = move(s.customsClearedOn)

      if (s.etd! > today) {
        s.status = 'PLANNED'
        s.actualArrivalDate = null
        s.customsClearedOn = null
        s.holdRemark = null
      } else if (s.actualArrivalDate && s.actualArrivalDate > today) {
        s.status = 'IN_TRANSIT'
        s.actualArrivalDate = null
        s.customsClearedOn = null
        s.holdRemark = null
      } else if (s.customsClearedOn && s.customsClearedOn > today) {
        s.customsClearedOn = null
        if (s.status !== 'HELD_AT_CUSTOMS') s.status = 'ARRIVED'
      }
      s.createdAt = s.updatedAt = `${s.etd}T09:00:00.000Z`

      const lines = shipmentLines.filter((l) => l.shipmentId === s.id)
      for (const l of lines) {
        const batch = batches.find((b) => b.id === l.batchId)
        if (batch && batch.manufacturingDate > s.etd!) batch.manufacturingDate = addDays(s.etd!, -30)
        for (const d of deliveries.filter((x) => x.shipmentLineId === l.id)) {
          if (!s.customsClearedOn) {
            dropDeliveries.add(d.id)
            continue
          }
          let on = addDays(d.deliveredOn, shift)
          if (on <= s.customsClearedOn) on = addDays(s.customsClearedOn, 2)
          if (on > today) dropDeliveries.add(d.id)
          else d.deliveredOn = on
        }
      }
    }
    for (let i = deliveries.length - 1; i >= 0; i--) {
      if (dropDeliveries.has(deliveries[i]!.id)) deliveries.splice(i, 1)
    }

    for (const c of commissions) {
      const ind = indents.find((i) => i.id === c.indentId)
      if (!ind) continue
      if (c.invoicedOn && c.invoicedOn < ind.orderDate) c.invoicedOn = atMost(addDays(ind.orderDate, 14))
      if (c.receivedOn && c.invoicedOn && c.receivedOn < c.invoicedOn) c.receivedOn = atMost(addDays(c.invoicedOn, 21))
    }
  }

  /** Requirement and client statuses that agree with the engagements and orders behind them. */
  function alignStatuses() {
    for (const r of requirements) {
      const linked = requirementEngagements
        .filter((l) => l.requirementId === r.id)
        .map((l) => engagements.find((e) => e.id === l.engagementId))
        .filter((e): e is Engagement => Boolean(e))
      if (linked.length === 0) {
        if (r.status === 'ENGAGED' || r.status === 'FULFILLED') r.status = 'OPEN'
      } else if (r.status !== 'CANCELLED' && r.status !== 'CLOSED_LOST') {
        r.status = linked.some((e) => e.stage === 'COMMERCIAL') ? 'FULFILLED' : 'ENGAGED'
      }
    }
    for (const c of clients) {
      const trading =
        engagements.some((e) => e.clientCompanyId === c.id && e.stage === 'COMMERCIAL') ||
        clientOrders.some((o) => o.clientCompanyId === c.id)
      const pursuing = engagements.some(
        (e) => e.clientCompanyId === c.id && !['REJECTED', 'DISCONTINUED'].includes(e.stage),
      )
      if (c.client && (trading || pursuing) && (c.client.status === 'PROSPECT' || c.client.status === 'DORMANT')) {
        c.client.status = trading ? 'ACTIVE' : 'PROSPECT'
      }
    }
  }

  const db: Database = {
    users,
    savedFilters: [
      {
        id: nextId('sfl'),
        userId: users[1]!.id,
        screen: 'engagements',
        name: 'My pipeline, awaiting client',
        queryString: '?owner=me&stage=UNDER_EVALUATION',
        createdAt: isoT(daysAgo(30)),
      },
      {
        id: nextId('sfl'),
        userId: users[1]!.id,
        screen: 'products',
        name: 'Respiratory APIs we represent',
        queryString: '?category=API&therapeutic=Respiratory&portfolio=1',
        createdAt: isoT(daysAgo(12)),
      },
    ],
    companies,
    sites,
    contacts,
    statusChanges,
    products,
    manufacturerProducts,
    filings,
    portfolio,
    prices,
    requirements,
    engagements,
    requirementEngagements,
    stageHistory,
    offers,
    samples,
    clientOrders,
    clientOrderLines,
    indents,
    indentLines,
    orderIndentLinks,
    shipments,
    batches,
    shipmentLines,
    deliveries,
    commissions,
    documents: documentDefs,
    activities,
    notifications,
    audit,
    security,
  }
  // order, indent and shipment statuses follow from what shipped and was delivered
  Object.assign(db, deriveTradeStatuses(db))
  return db
}

/**
 * The presentation route: one deal at each stage of the business, found by
 * name so the list survives changes to the generated data.
 */
export interface DemoStory {
  key: string
  title: string
  client: string
  product: string
  /** absent for a story about a requirement that has no engagement yet */
  manufacturer?: string
  point: string
}

export const DEMO_STORIES: DemoStory[] = [
  {
    key: 'enquiry',
    title: 'A new enquiry',
    client: 'Beximco',
    product: 'Budesonide',
    point: 'Two represented sources can supply it. Choose which to offer and open the engagements.',
  },
  {
    key: 'offer',
    title: 'An offer with the client',
    client: 'Aristopharma',
    product: 'Dextromethorphan Hydrobromide',
    manufacturer: 'Moehs Iberica',
    point: 'The next step is a sample for the client to evaluate.',
  },
  {
    key: 'sample',
    title: 'A sample under evaluation',
    client: 'Ibn Sina',
    product: 'Ibuprofen',
    manufacturer: 'Biocon',
    point: "The client's QC has the sample. Record pass or fail, then the approval.",
  },
  {
    key: 'approved',
    title: 'Approved, not yet ordered',
    client: 'Healthcare',
    product: 'Capecitabine',
    manufacturer: 'Bajaj Healthcare',
    point: 'Record the first client order straight from the engagement.',
  },
  {
    key: 'transit',
    title: 'Goods on the way',
    client: 'Aristopharma',
    product: 'Dextromethorphan Hydrobromide',
    manufacturer: 'Bajaj Healthcare',
    point: 'Order, indent and shipment are linked. Track arrival and clearance.',
  },
  {
    key: 'complete',
    title: 'Delivered and paid, dual sourced',
    client: 'Square',
    product: 'Budesonide',
    manufacturer: 'Biocon',
    point: 'One order split across Biocon and Wockhardt. Delivered; commission received.',
  },
]
