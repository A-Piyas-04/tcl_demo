/**
 * The manufacturer register: the supply side of the three co-equal entry
 * points (FR-M9-01), implementing module M2.
 *
 * Filterable by product, by client, and by both at once (FR-M9-02), which is
 * the question the business cannot answer today: "who makes this molecule, and
 * which of our clients already takes it from them".
 */

import { useNavigate } from 'react-router-dom'
import { Factory, Plus, SlidersHorizontal } from 'lucide-react'
import { useDb } from '@/data/store'
import { engagementRows, sourceRows, clients as clientList } from '@/data/selectors'
import { COUNTRIES, MANUFACTURER_STATUS_LABEL, REPRESENTATION_LABEL, countryName } from '@/data/reference'
import { logExport } from '@/data/api'
import { useAsyncData, useUrlFilters, useUrlSearch } from '@/lib/hooks'
import { fmtDate, pluralise, todayIso } from '@/lib/utils'
import type { Company, ManufacturerStatus, RepresentationKind } from '@/data/types'
import {
  Badge,
  Button,
  Column,
  DataTable,
  EmptyState,
  FilterBar,
  LinkButton,
  ManufacturerStatusBadge,
  NameCell,
  Panel,
  PageHeading,
  Select,
  Tooltip,
  WriteOnly,
} from '@/components/ui'

interface Row {
  company: Company
  status: ManufacturerStatus
  representation: RepresentationKind | null
  agreementExpiresOn: string | null
  productCount: number
  portfolioCount: number
  clientCount: number
  commercialCount: number
  hasContact: boolean
}

const DEFAULTS = {
  q: '',
  product: '',
  client: '',
  country: '',
  status: '',
  portfolio: '',
}

export function ManufacturerList() {
  const db = useDb()
  const navigate = useNavigate()
  const { values, setValue, clear, activeCount, queryString } = useUrlFilters(DEFAULTS)
  const [search, setSearch] = useUrlSearch(values.q, (v) => setValue('q', v))

  const { data: rows, loading } = useAsyncData<Row[]>(() => {
    const sources = sourceRows(db)
    const engs = engagementRows(db)

    return db.companies
      .filter((c) => c.kind === 'MANUFACTURER' || c.kind === 'BOTH')
      .map((company) => {
        const mine = sources.filter((s) => s.manufacturer.id === company.id)
        const engagements = engs.filter((e) => e.manufacturer.id === company.id)
        return {
          company,
          status: company.manufacturer?.status ?? 'NEW',
          representation: company.manufacturer?.representation ?? null,
          agreementExpiresOn: company.manufacturer?.agreementExpiresOn ?? null,
          productCount: mine.length,
          portfolioCount: mine.filter((s) => s.inPortfolio).length,
          clientCount: new Set(engagements.map((e) => e.client.id)).size,
          commercialCount: engagements.filter((e) => e.stage === 'COMMERCIAL').length,
          hasContact: db.contacts.some((ct) => ct.companyId === company.id && ct.isActive),
        }
      })
      .filter((row) => {
        const q = values.q.trim().toLowerCase()
        if (q) {
          const hit =
            row.company.displayName.toLowerCase().includes(q) ||
            row.company.legalName.toLowerCase().includes(q) ||
            countryName(row.company.countryCode).toLowerCase().includes(q)
          if (!hit) return false
        }
        if (values.country && row.company.countryCode !== values.country) return false
        if (values.status && row.status !== values.status) return false
        if (values.portfolio === '1' && row.portfolioCount === 0) return false
        if (values.product) {
          const makes = sources.some(
            (s) => s.manufacturer.id === row.company.id && s.product.id === values.product,
          )
          if (!makes) return false
        }
        if (values.client) {
          const takes = engs.some(
            (e) =>
              e.manufacturer.id === row.company.id &&
              e.client.id === values.client &&
              (!values.product || e.product.id === values.product),
          )
          if (!takes) return false
        }
        return true
      })
      .sort((a, b) => a.company.displayName.localeCompare(b.company.displayName))
  }, [values])

  const columns: Column<Row>[] = [
    {
      key: 'name',
      header: 'Manufacturer',
      pinned: true,
      sortable: true,
      value: (r) => r.company.displayName,
      cell: (r) => (
        <NameCell
          title={r.company.displayName}
          subtitle={`${r.company.legalName} · ${countryName(r.company.countryCode)}`}
          badge={
            r.company.possibleDuplicate ? (
              <Badge tone="warn">Check duplicate</Badge>
            ) : !r.hasContact ? (
              <Tooltip content="No contact person is recorded, so the record is incomplete (UC-01 alternate 6a).">
                <Badge tone="outline">Incomplete</Badge>
              </Tooltip>
            ) : undefined
          }
        />
      ),
    },
    {
      key: 'status',
      header: 'Relationship',
      sortable: true,
      width: '10rem',
      value: (r) => MANUFACTURER_STATUS_LABEL[r.status],
      cell: (r) => <ManufacturerStatusBadge status={r.status} />,
    },
    {
      key: 'products',
      header: 'Products',
      align: 'right',
      sortable: true,
      width: '7rem',
      value: (r) => r.productCount,
      cell: (r) => (
        <Tooltip content={`${r.portfolioCount} of ${r.productCount} represented by TCL`}>
          <span className="tabular text-sm">
            <span className="font-medium text-ink-900">{r.portfolioCount}</span>
            <span className="text-ink-400"> / {r.productCount}</span>
          </span>
        </Tooltip>
      ),
    },
    {
      key: 'clients',
      header: 'Clients',
      align: 'right',
      sortable: true,
      width: '6rem',
      value: (r) => r.clientCount,
      cell: (r) => <span className="tabular text-sm text-ink-800">{r.clientCount || '—'}</span>,
    },
    {
      key: 'commercial',
      header: 'Commercial',
      align: 'right',
      sortable: true,
      width: '7.5rem',
      value: (r) => r.commercialCount,
      cell: (r) =>
        r.commercialCount > 0 ? (
          <Badge tone="ok">{r.commercialCount} supplying</Badge>
        ) : (
          <span className="text-xs text-ink-400">—</span>
        ),
    },
    {
      key: 'representation',
      header: 'Representation',
      sortable: true,
      width: '10rem',
      value: (r) => (r.representation ? REPRESENTATION_LABEL[r.representation] : null),
      cell: (r) =>
        r.representation ? (
          <Badge tone="neutral">{REPRESENTATION_LABEL[r.representation]}</Badge>
        ) : (
          <span className="text-xs text-ink-400">None agreed</span>
        ),
    },
    {
      key: 'agreement',
      header: 'Agreement to',
      align: 'right',
      sortable: true,
      width: '8.5rem',
      value: (r) => r.agreementExpiresOn,
      cell: (r) => {
        if (!r.agreementExpiresOn) return <span className="text-xs text-ink-400">—</span>
        const lapsed = r.agreementExpiresOn < todayIso()
        return (
          <span className={lapsed ? 'text-xs tabular text-warn-600' : 'text-xs tabular text-ink-600'}>
            {fmtDate(r.agreementExpiresOn)}
          </span>
        )
      },
    },
    {
      key: 'country',
      header: 'Country',
      optional: true,
      value: (r) => countryName(r.company.countryCode),
      cell: (r) => <span className="text-xs text-ink-600">{countryName(r.company.countryCode)}</span>,
    },
  ]

  const filtersOn = activeCount > 0

  return (
    <div className="space-y-4">
      <PageHeading
        title="Manufacturers"
        subtitle="Every supplier TCL knows, what it makes, and which clients take it."
        meta={
          <>
            <Badge tone="neutral">
              {pluralise(
                db.companies.filter(
                  (c) => (c.kind === 'MANUFACTURER' || c.kind === 'BOTH') && c.isActive,
                ).length,
                'active manufacturer',
              )}
            </Badge>
            <Badge tone="accent">{pluralise(db.portfolio.filter((p) => p.isActive).length, 'represented source')}</Badge>
          </>
        }
        actions={
          <WriteOnly>
            <LinkButton to="/manufacturers/new" variant="primary" size="md" icon={<Plus className="h-3.5 w-3.5" />}>
              Register a manufacturer
            </LinkButton>
          </WriteOnly>
        }
      />

      <Panel>
        <FilterBar
          search={search}
          onSearch={setSearch}
          searchPlaceholder="Name, legal name or country…"
          activeCount={activeCount}
          onClear={clear}
          moreActive={['status', 'country'].filter((k) => values[k as keyof typeof values]).length}
          primary={
            <>
              <Select
                value={values.product}
                onChange={(v) => setValue('product', v)}
                allowEmpty
                emptyLabel="Any product"
                placeholder="Any product"
                options={db.products
                  .filter((p) => p.isActive)
                  .slice()
                  .sort((a, b) => a.genericName.localeCompare(b.genericName))
                  .map((p) => ({ value: p.id, label: p.genericName }))}
              />
              <Select
                value={values.client}
                onChange={(v) => setValue('client', v)}
                allowEmpty
                emptyLabel="Any client"
                placeholder="Any client"
                options={clientList(db).map((c) => ({ value: c.id, label: c.displayName }))}
              />
              <Button
                variant={values.portfolio === '1' ? 'primary' : 'secondary'}
                size="sm"
                onClick={() => setValue('portfolio', values.portfolio === '1' ? '' : '1')}
              >
                Represented only
              </Button>
            </>
          }
          more={
            <>
              <Select
                value={values.status}
                onChange={(v) => setValue('status', v)}
                allowEmpty
                emptyLabel="Any status"
                placeholder="Any status"
                options={(Object.keys(MANUFACTURER_STATUS_LABEL) as ManufacturerStatus[]).map((s) => ({
                  value: s,
                  label: MANUFACTURER_STATUS_LABEL[s],
                }))}
              />
              <Select
                value={values.country}
                onChange={(v) => setValue('country', v)}
                allowEmpty
                emptyLabel="Any country"
                placeholder="Any country"
                options={COUNTRIES.map((c) => ({ value: c.code, label: c.name }))}
              />
            </>
          }
        />

        <DataTable
          rows={rows ?? []}
          columns={columns}
          rowKey={(r) => r.company.id}
          loading={loading}
          onRowClick={(r) => navigate(`/manufacturers/${r.company.id}`)}
          exportName="manufacturers"
          exportFilters={queryString}
          onExport={(count) => void logExport('manufacturer list', queryString, count)}
          rowTone={(r) =>
            r.status === 'BLACKLISTED' || r.status === 'INACTIVE' || !r.company.isActive
              ? 'bg-paper-100/50 text-ink-500 opacity-70'
              : undefined
          }
          toolbar={
            <span className="flex items-center gap-2 text-xs text-ink-500">
              <SlidersHorizontal className="h-3.5 w-3.5" />
              {rows ? pluralise(rows.length, 'manufacturer') : '…'}
              {filtersOn ? <Badge tone="accent">{activeCount} filters</Badge> : null}
              {values.product && values.client ? (
                <Badge tone="info">Both filters applied</Badge>
              ) : null}
            </span>
          }
          empty={
            <EmptyState
              icon={<Factory className="h-5 w-5" />}
              title={values.q ? `Nothing matches “${values.q}”` : 'No manufacturer matches these filters'}
              description={
                values.product && values.client
                  ? 'No manufacturer makes that product for that client yet. Register the supplier, or drop one of the two filters to widen the search.'
                  : 'Search covers the display name, the legal name and the country.'
              }
              action={
                <WriteOnly>
                  <LinkButton
                    to={values.q ? `/manufacturers/new?name=${encodeURIComponent(values.q)}` : '/manufacturers/new'}
                    variant="primary"
                    size="sm"
                  >
                    Register a manufacturer
                  </LinkButton>
                </WriteOnly>
              }
              secondary={
                filtersOn ? (
                  <Button variant="secondary" size="sm" onClick={clear}>
                    Clear filters
                  </Button>
                ) : null
              }
            />
          }
        />
      </Panel>
    </div>
  )
}
