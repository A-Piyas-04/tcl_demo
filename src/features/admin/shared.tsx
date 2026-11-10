/**
 * Pieces shared by the administration screens.
 *
 * Two things live here. The first is the honest note that several admin screens
 * carry: the built system keeps this configuration in database tables an
 * administrator edits, while the prototype reads it from one module and shows it
 * read-only. The second is the module grouping for permission codes, used by the
 * role matrix (doc 01 §M1, FR-M1-05).
 */

import * as React from 'react'
import { NoteTip } from '@/components/ui'
import { READ_ONLY_PERMISSIONS, WRITE_PERMISSIONS, type Permission } from '@/data/reference'

/**
 * A bounded note, not a banner across the window. Used where the prototype
 * cannot do something the built system would, so the limit is stated rather
 * than hidden behind a control that does nothing.
 */
export function PrototypeNote({
  title,
  children,
}: {
  title: string
  children: React.ReactNode
}) {
  return <NoteTip label={title}>{children}</NoteTip>
}

// ------------------------------------------------------- permission grouping

/**
 * The code prefix before the dot decides which module a permission belongs to.
 * Checks in the application test for the code, so this map is for display only.
 */
const MODULE_BY_PREFIX: Record<string, string> = {
  user: 'Identity',
  role: 'Identity',
  reference: 'Identity',
  setting: 'Identity',
  workflow: 'Identity',
  manufacturer: 'Manufacturers',
  product: 'Products',
  manufacturer_product: 'Sources',
  portfolio: 'Sources',
  price: 'Sources',
  client: 'Clients',
  requirement: 'Pipeline',
  engagement: 'Pipeline',
  offer: 'Pipeline',
  sample: 'Samples',
  order: 'Trade',
  shipment: 'Trade',
  commission: 'Trade',
  discovery: 'Discovery',
  document: 'Documents',
  report: 'Reporting',
  audit: 'Audit',
  duplicate: 'Audit',
}

/** The order modules read in, roughly the order of the navigation. */
export const MODULE_ORDER = [
  'Identity',
  'Manufacturers',
  'Products',
  'Sources',
  'Clients',
  'Pipeline',
  'Samples',
  'Trade',
  'Discovery',
  'Documents',
  'Reporting',
  'Audit',
]

export const moduleOf = (code: string): string =>
  MODULE_BY_PREFIX[code.split('.')[0] ?? ''] ?? 'Other'

export interface PermissionRow {
  code: Permission
  module: string
  /** Full Access holds every code; View Only holds the read-only ones. */
  viewer: boolean
}

/** The whole permission set, grouped and ordered for the matrix. */
export function permissionRows(): PermissionRow[] {
  const rows: PermissionRow[] = [
    ...READ_ONLY_PERMISSIONS.map((code) => ({ code, module: moduleOf(code), viewer: true })),
    ...WRITE_PERMISSIONS.map((code) => ({ code, module: moduleOf(code), viewer: false })),
  ]
  return rows.sort((a, b) => {
    const byModule = MODULE_ORDER.indexOf(a.module) - MODULE_ORDER.indexOf(b.module)
    return byModule !== 0 ? byModule : a.code.localeCompare(b.code)
  })
}

/** "engagement.approve" reads as "Approve" once the module carries the noun. */
export function permissionAction(code: string): string {
  const action = code.split('.')[1] ?? code
  const words = action.replace(/_/g, ' ')
  return words.charAt(0).toUpperCase() + words.slice(1)
}
