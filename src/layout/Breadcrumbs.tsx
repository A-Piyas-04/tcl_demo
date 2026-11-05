/**
 * Breadcrumbs that resolve record ids to names, so the trail reads
 * "Clients › Square › Budesonide (Biocon)" rather than showing identifiers
 * (doc 04 §4 rule 3).
 */

import { Link, useLocation } from 'react-router-dom'
import { ChevronRight } from 'lucide-react'
import { useDb } from '@/data/store'
import { companyName, productName } from '@/data/selectors'

const SECTION_LABEL: Record<string, string> = {
  products: 'Products',
  manufacturers: 'Manufacturers',
  clients: 'Clients',
  sources: 'Sources',
  requirements: 'Requirements',
  engagements: 'Engagements',
  samples: 'Samples',
  'client-orders': 'Client orders',
  indents: 'Indents',
  shipments: 'Shipments',
  batches: 'Batches',
  commissions: 'Commission',
  relationships: 'Relationships',
  documents: 'Documents',
  reports: 'Reports',
  admin: 'Admin',
  new: 'New',
  edit: 'Edit',
  unsourced: 'Unsourced demand',
  expiring: 'Expiring soon',
  tree: 'Connection tree',
  users: 'Users',
  roles: 'Roles & permissions',
  reference: 'Reference data',
  workflow: 'Stage configuration',
  notifications: 'Notification thresholds',
  duplicates: 'Duplicate review',
  health: 'System health',
  audit: 'Audit log',
  'development-register': 'Development register',
  pipeline: 'Pipeline by stage',
  funnel: 'Conversion funnel',
  commission: 'Commission report',
  matrix: 'Matrix',
  'client-product': 'Client × product matrix',
  'manufacturer-product': 'Manufacturer × product matrix',
  peers: 'Other clients taking this',
  countries: 'Countries',
  currencies: 'Currencies',
  units: 'Units & conversions',
  categories: 'Therapeutic categories',
  'doc-types': 'Document types',
  reasons: 'Reasons',
  incoterms: 'Incoterms',
  'payment-terms': 'Payment terms',
}

export function Breadcrumbs() {
  const location = useLocation()
  const db = useDb()
  const parts = location.pathname.split('/').filter(Boolean)

  if (parts.length === 0) {
    return <p className="truncate text-sm font-medium text-ink-700">Dashboard</p>
  }

  const crumbs: { label: string; to: string }[] = []
  let path = ''
  parts.forEach((part, i) => {
    path += `/${part}`
    const section = parts[0]!
    const isId = /_/.test(part)
    let label = SECTION_LABEL[part] ?? part

    if (isId) {
      label = resolveLabel(db, section, part)
    } else if (!SECTION_LABEL[part]) {
      label = part.charAt(0).toUpperCase() + part.slice(1).replace(/-/g, ' ')
    }
    crumbs.push({ label, to: i === parts.length - 1 ? location.pathname + location.search : path })
  })

  return (
    <nav aria-label="Breadcrumb" className="flex min-w-0 items-center gap-1 text-sm">
      <Link to="/" className="shrink-0 text-ink-400 transition-colors hover:text-ink-700">
        Home
      </Link>
      {crumbs.map((c, i) => (
        <span key={c.to} className="flex min-w-0 items-center gap-1">
          <ChevronRight className="h-3.5 w-3.5 shrink-0 text-ink-300" />
          {i === crumbs.length - 1 ? (
            <span className="truncate font-medium text-ink-800">{c.label}</span>
          ) : (
            <Link to={c.to} className="truncate text-ink-500 transition-colors hover:text-ink-800">
              {c.label}
            </Link>
          )}
        </span>
      ))}
    </nav>
  )
}

function resolveLabel(db: ReturnType<typeof useDb>, section: string, id: string): string {
  switch (section) {
    case 'products':
      return productName(db, id)
    case 'manufacturers':
    case 'clients':
      return companyName(db, id)
    case 'sources': {
      const mp = db.manufacturerProducts.find((m) => m.id === id)
      return mp ? `${productName(db, mp.productId)} — ${companyName(db, mp.manufacturerCompanyId)}` : 'Source'
    }
    case 'engagements': {
      const e = db.engagements.find((x) => x.id === id)
      return e ? `${productName(db, e.productId)} (${companyName(db, e.manufacturerCompanyId)})` : 'Engagement'
    }
    case 'requirements': {
      const r = db.requirements.find((x) => x.id === id)
      return r ? `${companyName(db, r.clientCompanyId)} — ${productName(db, r.productId)}` : 'Requirement'
    }
    case 'client-orders':
      return db.clientOrders.find((o) => o.id === id)?.coNumber ?? 'Order'
    case 'indents':
      return db.indents.find((i) => i.id === id)?.indentNumber ?? 'Indent'
    case 'shipments':
      return db.shipments.find((s) => s.id === id)?.shipmentRef ?? 'Shipment'
    case 'batches':
      return db.batches.find((b) => b.id === id)?.batchNumber ?? 'Batch'
    case 'samples': {
      const s = db.samples.find((x) => x.id === id)
      return s ? `Sample round ${s.roundNo}` : 'Sample'
    }
    default:
      return 'Record'
  }
}
