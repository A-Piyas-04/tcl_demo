/**
 * Reference data (NFR-MA-02: database-driven and editable by an administrator).
 *
 * Every screen in the application reads its countries, currencies, units,
 * document types, reasons and terms from `src/data/reference.ts` rather than
 * hard-coding them, which is the part that matters for maintenance. In the
 * prototype those sets are module constants, so the tables here are read-only
 * and the page says so.
 */

import * as React from 'react'
import { Link, useParams } from 'react-router-dom'
import { Database } from 'lucide-react'
import {
  convertQty,
  COUNTRIES,
  CURRENCIES,
  DOCUMENT_TYPES,
  INCOTERMS,
  PAYMENT_TERMS,
  REASONS,
  THERAPEUTIC_CATEGORIES,
  UOMS,
} from '@/data/reference'
import { logExport } from '@/data/api'
import { pluralise } from '@/lib/utils'
import {
  Badge,
  Column,
  DataTable,
  EmptyState,
  LinkButton,
  Panel,
  PanelHeader,
  PageHeading,
} from '@/components/ui'
import { PrototypeNote } from './shared'

// ------------------------------------------------------------------- shape

/**
 * Every set is reduced to the same four display slots, so one table renders all
 * of them and each set only names the columns it actually uses.
 */
export interface ReferenceRow {
  id: string
  code?: string
  name?: string
  detail?: string
  extra?: string
}

export interface ReferenceSet {
  slug: string
  label: string
  description: string
  headers: { code?: string; name?: string; detail?: string; extra?: string }
  rows: () => ReferenceRow[]
}

/** The unit a conversion lands in, derived from the exported converter. */
function unitDimension(uom: string): { dimension: string; factor: string } {
  for (const [base, dimension] of [['KG', 'Mass'], ['L', 'Volume'], ['PC', 'Count']] as const) {
    try {
      const factor = convertQty(1, uom, base)
      return {
        dimension,
        factor: uom === base ? `Base unit for ${dimension.toLowerCase()}` : `1 ${uom} = ${factor} ${base}`,
      }
    } catch {
      // not this dimension; try the next base unit
    }
  }
  return { dimension: 'Not convertible', factor: 'No factor defined' }
}

export const REFERENCE_SETS: ReferenceSet[] = [
  {
    slug: 'countries',
    label: 'Countries',
    description:
      'Used for manufacturer and client addresses, and as part of the duplicate check on a company name.',
    headers: { code: 'ISO code', name: 'Country' },
    rows: () => COUNTRIES.map((c) => ({ id: c.code, code: c.code, name: c.name })),
  },
  {
    slug: 'currencies',
    label: 'Currencies',
    description:
      'A currency is stored alongside every amount, so a price, an indent value and a commission are never bare numbers.',
    headers: { code: 'Code' },
    rows: () => CURRENCIES.map((c) => ({ id: c, code: c })),
  },
  {
    slug: 'units',
    label: 'Units and conversions',
    description:
      'Quantities convert only within a dimension. Asking for kilograms from litres is refused rather than guessed, which is what keeps the over-shipment check honest.',
    headers: { code: 'Unit', name: 'Dimension', detail: 'Conversion' },
    rows: () =>
      UOMS.map((u) => {
        const { dimension, factor } = unitDimension(u)
        return { id: u, code: u, name: dimension, detail: factor }
      }),
  },
  {
    slug: 'therapeutic-categories',
    label: 'Therapeutic categories',
    description:
      'Attached to products, and used to describe a client’s focus so an enquiry can be matched to the right book.',
    headers: { name: 'Category' },
    rows: () => THERAPEUTIC_CATEGORIES.map((t) => ({ id: t, name: t })),
  },
  {
    slug: 'document-types',
    label: 'Document types',
    description:
      'Whether a type expires decides if it appears in the expiring-documents report, and the warning window decides how early.',
    headers: { code: 'Code', name: 'Document type', detail: 'Expiry', extra: 'Warning window' },
    rows: () =>
      DOCUMENT_TYPES.map((d) => ({
        id: d.code,
        code: d.code,
        name: d.name,
        detail: d.expiring ? 'Expires' : 'Does not expire',
        extra: d.expiring ? `${d.warnDays} days before` : '—',
      })),
  },
  {
    slug: 'reasons',
    label: 'Rejection and hold reasons',
    description:
      'A reason is required when an engagement is rejected, put on hold or discontinued, and when a sample fails. It is stored on that transition only and never carried into the next one.',
    headers: { code: 'Code', name: 'Reason', detail: 'Applies to' },
    rows: () =>
      REASONS.map((r) => ({
        id: r.code,
        code: r.code,
        name: r.name,
        detail: r.appliesTo === 'ENGAGEMENT' ? 'Engagement' : r.appliesTo === 'SAMPLE' ? 'Sample' : 'Offer',
      })),
  },
  {
    slug: 'incoterms',
    label: 'Incoterms',
    description:
      'Carried on a price, an offer, an indent and a shipment. A price is only comparable against another on the same incoterm.',
    headers: { code: 'Term' },
    rows: () => INCOTERMS.map((i) => ({ id: i, code: i })),
  },
  {
    slug: 'payment-terms',
    label: 'Payment terms',
    description:
      'Held as a default on a client and on a manufacturer, and copied onto an order unless it is changed there.',
    headers: { code: 'Code', name: 'Term', detail: 'Credit period' },
    rows: () =>
      PAYMENT_TERMS.map((p) => ({
        id: p.code,
        code: p.code,
        name: p.label,
        detail: p.days === 0 ? 'No credit period' : `${p.days} days`,
      })),
  },
]

// ------------------------------------------------------------------ screen

export function ReferenceData() {
  const { type } = useParams()
  const set = REFERENCE_SETS.find((s) => s.slug === type) ?? REFERENCE_SETS[0]!
  const unknown = Boolean(type) && !REFERENCE_SETS.some((s) => s.slug === type)

  const rows = React.useMemo(() => set.rows(), [set])

  const columns = React.useMemo<Column<ReferenceRow>[]>(() => {
    const out: Column<ReferenceRow>[] = []
    if (set.headers.code) {
      out.push({
        key: 'code',
        header: set.headers.code,
        pinned: true,
        sortable: true,
        width: '10rem',
        value: (r) => r.code ?? '',
        cell: (r) => <span className="font-mono text-xs font-medium text-ink-800">{r.code}</span>,
      })
    }
    if (set.headers.name) {
      out.push({
        key: 'name',
        header: set.headers.name,
        pinned: !set.headers.code,
        sortable: true,
        value: (r) => r.name ?? '',
        cell: (r) => <span className="text-sm text-ink-800">{r.name}</span>,
      })
    }
    if (set.headers.detail) {
      out.push({
        key: 'detail',
        header: set.headers.detail,
        sortable: true,
        value: (r) => r.detail ?? '',
        cell: (r) => <span className="text-xs text-ink-600">{r.detail}</span>,
      })
    }
    if (set.headers.extra) {
      out.push({
        key: 'extra',
        header: set.headers.extra,
        align: 'right',
        value: (r) => r.extra ?? '',
        cell: (r) => <span className="text-xs tabular text-ink-600">{r.extra}</span>,
      })
    }
    return out
  }, [set])

  return (
    <div className="space-y-4">
      <PageHeading
        title="Reference data"
        subtitle="The lists every other screen chooses from, kept in one place so a change lands everywhere at once."
        meta={<Badge tone="neutral">{pluralise(REFERENCE_SETS.length, 'set')}</Badge>}
      />

      <PrototypeNote title="Read-only in this build">
        In the built system these are database rows an administrator adds to and edits, as NFR-MA-02 requires. This
        prototype holds them as constants in one module, so the tables below cannot be changed here. What the screens
        already do correctly is read from that one place rather than repeating the lists in each form.
      </PrototypeNote>

      {unknown ? (
        <Panel className="p-4">
          <EmptyState
            icon={<Database className="h-5 w-5" />}
            title="No such reference set"
            description={<>Nothing is held under <span className="font-mono text-[0.75rem]">{type}</span>.</>}
            action={
              <LinkButton to="/admin/reference" variant="primary" size="sm">
                Back to reference data
              </LinkButton>
            }
          />
        </Panel>
      ) : (
        <div className="grid gap-3 lg:grid-cols-[15rem,minmax(0,1fr)]">
          <Panel>
            <PanelHeader title="Sets" icon={<Database className="h-4 w-4" />} />
            <nav className="divide-y divide-paper-200">
              {REFERENCE_SETS.map((s) => {
                const active = s.slug === set.slug
                return (
                  <Link
                    key={s.slug}
                    to={`/admin/reference/${s.slug}`}
                    className={
                      active
                        ? 'flex items-baseline justify-between gap-2 bg-accent-50 px-3 py-2 text-sm font-medium text-accent-800'
                        : 'flex items-baseline justify-between gap-2 px-3 py-2 text-sm text-ink-700 hover:bg-paper-100'
                    }
                  >
                    <span className="min-w-0 truncate">{s.label}</span>
                    <span className="shrink-0 text-2xs tabular text-ink-400">{s.rows().length}</span>
                  </Link>
                )
              })}
            </nav>
          </Panel>

          <Panel>
            <PanelHeader title={set.label} subtitle={set.description} />
            <DataTable
              rows={rows}
              columns={columns}
              rowKey={(r) => r.id}
              pageSize={20}
              exportName={`reference-${set.slug}`}
              onExport={(count) => void logExport(`reference data: ${set.label}`, '', count)}
              empty={
                <EmptyState
                  icon={<Database className="h-5 w-5" />}
                  title="This set is empty"
                  description="Nothing is seeded for this set, so the forms that read it would offer no options."
                  action={
                    <LinkButton to="/admin/reference" variant="secondary" size="sm">
                      Choose another set
                    </LinkButton>
                  }
                />
              }
            />
          </Panel>
        </div>
      )}
    </div>
  )
}
