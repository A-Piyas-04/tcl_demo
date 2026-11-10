/**
 * Manufacturer detail: what this supplier makes, what TCL represents from it,
 * and which clients take those products (FR-M2-07).
 *
 * This is the supply-side leg of the three-way pivot. The clients tab answers
 * the question sourcing needs before a volume negotiation: which of our
 * clients already take this manufacturer's products, and how far along are
 * they.
 */

import * as React from 'react'
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom'
import {
  Building2,
  FileBadge,
  FileText,
  Handshake,
  History,
  Mail,
  Package,
  Pencil,
  Phone,
  Plus,
  Ship,
  ShieldAlert,
  Truck,
  Users,
} from 'lucide-react'
import { useDb } from '@/data/store'
import {
  companyName,
  documentRows,
  engagementRows,
  indentValue,
  sourceRows,
  userName,
  type DocumentRow,
  type EngagementRow,
  type SourceRow,
} from '@/data/selectors'
import {
  MANUFACTURER_STATUS_LABEL,
  ORDER_STATUS_LABEL,
  REPRESENTATION_LABEL,
  SITE_KIND_LABEL,
  countryName,
  documentTypeName,
  paymentTermLabel,
} from '@/data/reference'
import { useAsyncData } from '@/lib/hooks'
import { fmtDate, fmtMoney, fmtQty, pluralise } from '@/lib/utils'
import type { Indent } from '@/data/types'
import {
  AgeingFlag,
  Badge,
  Button,
  Column,
  Count,
  DataTable,
  EmptyState,
  Field,
  FieldGrid,
  FilingDot,
  LinkButton,
  ManufacturerStatusBadge,
  NameCell,
  Panel,
  PanelHeader,
  PageHeading,
  PortfolioBadge,
  SkeletonTable,
  StageBadge,
  Tab,
  TabList,
  TabPanel,
  Tabs,
  Tooltip,
  WriteOnly,
} from '@/components/ui'
import { NotFound } from '@/features/misc/Fallbacks'
import { StatusChangeDialog } from './StatusChangeDialog'

const OPEN_ORDER_STATUSES = ['DRAFT', 'OPEN', 'PARTIALLY_SHIPPED', 'ON_HOLD']

export function ManufacturerDetail() {
  const { id = '' } = useParams()
  const db = useDb()
  const [params, setParams] = useSearchParams()
  const [statusOpen, setStatusOpen] = React.useState(false)

  const company = db.companies.find((c) => c.id === id)

  const { data, loading } = useAsyncData(
    () => {
      const indents = db.indents.filter((i) => i.manufacturerCompanyId === id)
      const indentIds = indents.map((i) => i.id)
      return {
        sources: sourceRows(db, { manufacturerId: id }),
        engagements: engagementRows(db, { manufacturerId: id }),
        sites: db.sites.filter((s) => s.companyId === id),
        contacts: db.contacts.filter((c) => c.companyId === id && c.isActive),
        indents,
        shipments: db.shipments.filter((s) => indentIds.includes(s.indentId)),
        commissions: db.commissions.filter((c) => indentIds.includes(c.indentId)),
        statusChanges: db.statusChanges.filter((s) => s.companyId === id),
        companyDocuments: documentRows(db, { entityType: 'COMPANY', entityId: id }),
      }
    },
    [id],
  )

  if (!company || !company.manufacturer) return <NotFound />
  const profile = company.manufacturer

  const tab = params.get('tab') ?? 'products'
  const setTab = (value: string) => {
    const next = new URLSearchParams(params)
    next.set('tab', value)
    setParams(next, { replace: true })
  }

  const portfolioCount = data?.sources.filter((s) => s.inPortfolio).length ?? 0
  const clientCount = new Set((data?.engagements ?? []).map((e) => e.client.id)).size
  const openIndents = (data?.indents ?? []).filter((i) => OPEN_ORDER_STATUSES.includes(i.status))
  const commissionEarned = (data?.commissions ?? []).reduce(
    (sum, c) => (c.status === 'WRITTEN_OFF' ? sum : sum + (c.amount ?? 0)),
    0,
  )
  const commissionCurrency = data?.commissions[0]?.currency ?? 'USD'

  return (
    <div className="space-y-4">
      <PageHeading
        title={company.displayName}
        subtitle={company.legalName}
        meta={
          <>
            <Badge tone="outline">{countryName(company.countryCode)}</Badge>
            <ManufacturerStatusBadge status={profile.status} />
            {profile.representation ? (
              <Badge tone="accent">{REPRESENTATION_LABEL[profile.representation]}</Badge>
            ) : (
              <Badge tone="neutral">No representation agreed</Badge>
            )}
            {company.possibleDuplicate ? <Badge tone="warn">Check duplicate</Badge> : null}
            {!company.isActive ? <Badge tone="neutral">Deactivated</Badge> : null}
          </>
        }
        actions={
          <WriteOnly>
            <LinkButton
              to={`/manufacturers/${id}/edit`}
              variant="secondary"
              size="md"
              icon={<Pencil className="h-3.5 w-3.5" />}
            >
              Edit
            </LinkButton>
            <Button
              variant="ghost"
              size="md"
              icon={<ShieldAlert className="h-3.5 w-3.5" />}
              onClick={() => setStatusOpen(true)}
            >
              Change status
            </Button>
          </WriteOnly>
        }
      />

      {profile.status === 'BLACKLISTED' ? (
        <Panel className="border-danger-200 bg-danger-50/60 p-3.5">
          <p className="flex items-center gap-1.5 text-sm font-semibold text-danger-700">
            <ShieldAlert className="h-4 w-4" />
            Blacklisted{profile.blacklistedOn ? ` on ${fmtDate(profile.blacklistedOn)}` : ''}
          </p>
          <p className="mt-1 max-w-3xl text-xs leading-relaxed text-ink-700">
            {profile.blacklistReason ?? 'No reason was recorded.'} No product of this manufacturer can be taken into
            the portfolio while it stays blacklisted.
          </p>
        </Panel>
      ) : null}

      {/* summary as four bounded cells, not one wide band */}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Panel className="p-3.5">
          <p className="text-2xs font-semibold uppercase tracking-wider text-ink-500">Products made</p>
          <p className="mt-1 text-2xl font-semibold tabular text-ink-900">{data?.sources.length ?? '—'}</p>
          <p className="mt-0.5 text-xs text-ink-500">{portfolioCount} represented by TCL</p>
        </Panel>
        <Panel className="p-3.5">
          <p className="text-2xs font-semibold uppercase tracking-wider text-ink-500">Clients engaged</p>
          <p className="mt-1 text-2xl font-semibold tabular text-ink-900">{clientCount || '—'}</p>
          <p className="mt-0.5 text-xs text-ink-500">
            {(data?.engagements ?? []).filter((e) => e.stage === 'COMMERCIAL').length} in commercial supply
          </p>
        </Panel>
        <Panel className="p-3.5">
          <p className="text-2xs font-semibold uppercase tracking-wider text-ink-500">Open indents</p>
          <p className="mt-1 text-2xl font-semibold tabular text-ink-900">{openIndents.length || '—'}</p>
          <p className="mt-0.5 text-xs text-ink-500">{pluralise(data?.indents.length ?? 0, 'indent')} in all</p>
        </Panel>
        <Panel className="p-3.5">
          <p className="text-2xs font-semibold uppercase tracking-wider text-ink-500">Commission earned</p>
          <p className="mt-1 text-2xl font-semibold tabular text-ink-900">
            {commissionEarned > 0 ? fmtMoney(commissionEarned, commissionCurrency, { compact: true }) : '—'}
          </p>
          <p className="mt-0.5 text-xs text-ink-500">On business routed through this source</p>
        </Panel>
      </div>

      <Tabs value={tab} onValueChange={setTab}>
        <TabList>
          <Tab value="products">
            Products &amp; portfolio
            <Count value={data?.sources.length ?? 0} active={tab === 'products'} />
          </Tab>
          <Tab value="clients">
            Clients engaged
            <Count value={clientCount} active={tab === 'clients'} />
          </Tab>
          <Tab value="sites">
            Sites &amp; certificates
            <Count value={data?.sites.length ?? 0} active={tab === 'sites'} />
          </Tab>
          <Tab value="contacts">
            Contacts
            <Count value={data?.contacts.length ?? 0} active={tab === 'contacts'} />
          </Tab>
          <Tab value="orders">
            Indents &amp; shipments
            <Count value={data?.indents.length ?? 0} active={tab === 'orders'} />
          </Tab>
          <Tab value="terms">Agency terms</Tab>
          <Tab value="history">History</Tab>
        </TabList>

        <div className="pt-4">
          <TabPanel value="products">
            <ProductsTab
              loading={loading}
              sources={data?.sources ?? []}
              manufacturerId={id}
              manufacturerName={company.displayName}
            />
          </TabPanel>

          <TabPanel value="clients">
            <ClientsTab loading={loading} rows={data?.engagements ?? []} manufacturerName={company.displayName} />
          </TabPanel>

          <TabPanel value="sites">
            <SitesTab loading={loading} sites={data?.sites ?? []} documents={data?.companyDocuments ?? []} />
          </TabPanel>

          <TabPanel value="contacts">
            <ContactsTab loading={loading} contacts={data?.contacts ?? []} />
          </TabPanel>

          <TabPanel value="orders">
            <OrdersTab
              loading={loading}
              indents={data?.indents ?? []}
              shipments={data?.shipments ?? []}
            />
          </TabPanel>

          <TabPanel value="terms">
            <Panel>
              <PanelHeader
                title="Agency terms"
                subtitle="TCL indents on this manufacturer for a named client. It does not buy or sell, so the commission is receivable from the client, not from this supplier."
              />
              <div className="p-4">
                <FieldGrid cols={3}>
                  <Field label="Representation type">
                    {profile.representation ? REPRESENTATION_LABEL[profile.representation] : 'None agreed'}
                  </Field>
                  <Field label="Agreement reference" mono>
                    {profile.agreementReference ?? '—'}
                  </Field>
                  <Field label="Relationship status">{MANUFACTURER_STATUS_LABEL[profile.status]}</Field>
                  <Field label="Agreement signed">{fmtDate(profile.agreementSignedOn)}</Field>
                  <Field label="Agreement expires">{fmtDate(profile.agreementExpiresOn)}</Field>
                  <Field label="Onboarded">{fmtDate(profile.onboardedOn)}</Field>
                  <Field label="Default incoterm" mono>
                    {profile.defaultIncoterm ?? '—'}
                  </Field>
                  <Field label="Default payment term">{paymentTermLabel(profile.defaultPaymentTermCode)}</Field>
                  <Field label="Relationship owner">{userName(db, profile.ownerUserId)}</Field>
                </FieldGrid>
                <div className="mt-4 border-t border-paper-200 pt-3.5">
                  <p className="text-2xs font-medium uppercase tracking-wide text-ink-500">Commission basis</p>
                  <p className="mt-1 max-w-2xl text-sm leading-relaxed text-ink-800">
                    {profile.commissionBasisNote ?? 'Not agreed yet. Each indent will need its own figure.'}
                  </p>
                </div>
                {company.website || company.generalEmail || company.generalPhone ? (
                  <div className="mt-4 border-t border-paper-200 pt-3.5">
                    <FieldGrid cols={3}>
                      <Field label="Website">
                        {company.website ? (
                          <a
                            href={company.website}
                            target="_blank"
                            rel="noreferrer"
                            className="text-accent-700 hover:underline"
                          >
                            {company.website.replace(/^https?:\/\//, '')}
                          </a>
                        ) : (
                          '—'
                        )}
                      </Field>
                      <Field label="General email">{company.generalEmail ?? '—'}</Field>
                      <Field label="General phone" mono>
                        {company.generalPhone ?? '—'}
                      </Field>
                    </FieldGrid>
                  </div>
                ) : null}
                {company.notes ? (
                  <div className="mt-4 border-t border-paper-200 pt-3.5">
                    <p className="text-2xs font-medium uppercase tracking-wide text-ink-500">Notes</p>
                    <p className="mt-1 max-w-2xl text-sm leading-relaxed text-ink-700">{company.notes}</p>
                  </div>
                ) : null}
              </div>
            </Panel>
          </TabPanel>

          <TabPanel value="history">
            <HistoryTab loading={loading} companyId={id} changes={data?.statusChanges ?? []} />
          </TabPanel>
        </div>
      </Tabs>

      <StatusChangeDialog open={statusOpen} onOpenChange={setStatusOpen} company={company} />
    </div>
  )
}

// ----------------------------------------------------------------- products

function ProductsTab({
  loading,
  sources,
  manufacturerId,
  manufacturerName,
}: {
  loading: boolean
  sources: SourceRow[]
  manufacturerId: string
  manufacturerName: string
}) {
  const represented = sources.filter((s) => s.inPortfolio)
  const known = sources.filter((s) => !s.inPortfolio)

  const columns: Column<SourceRow>[] = [
    {
      key: 'product',
      header: 'Product',
      pinned: true,
      sortable: true,
      value: (r) => r.product.genericName,
      cell: (r) => (
        <NameCell
          title={r.product.genericName}
          subtitle={`${r.mp.grade} · ${r.mp.pharmacopoeia}${r.site ? ` · ${r.site.name}` : ''}`}
        />
      ),
    },
    {
      key: 'status',
      header: 'Source status',
      sortable: true,
      width: '8rem',
      value: (r) => r.mp.status,
      cell: (r) => (
        <Badge tone={r.mp.status === 'ACTIVE' ? 'ok' : r.mp.status === 'IN_DEVELOPMENT' ? 'info' : 'neutral'}>
          {r.mp.status === 'IN_DEVELOPMENT' ? 'In development' : r.mp.status === 'ACTIVE' ? 'Active' : 'Discontinued'}
        </Badge>
      ),
    },
    {
      key: 'state',
      header: 'TCL',
      width: '9rem',
      value: (r) => (r.inPortfolio ? (r.isOfferable ? 'Offerable' : 'Price pending') : 'Not represented'),
      cell: (r) => <PortfolioBadge inPortfolio={r.inPortfolio} offerable={r.isOfferable} />,
    },
    {
      key: 'filings',
      header: 'Filings',
      width: '8rem',
      value: (r) => r.filings.map((f) => `${f.kind} ${f.referenceNumber}`).join('; '),
      cell: (r) => (
        <span className="flex gap-1">
          <FilingDot present={r.hasDmf} label="DMF" />
          <FilingDot present={r.hasCep} label="CEP" />
        </span>
      ),
    },
    {
      key: 'price',
      header: 'Current price',
      align: 'right',
      value: (r) => r.priceTiers[0]?.price ?? null,
      cell: (r) => {
        const tier = r.priceTiers[0]
        if (!tier) return <span className="text-xs text-warn-600">No valid price</span>
        return (
          <Tooltip content={`Valid to ${fmtDate(r.earliestPriceExpiry)}`}>
            <span className="text-sm tabular text-ink-900">
              {fmtMoney(tier.price, tier.currency, { decimals: 0 })}
              <span className="text-2xs text-ink-400">
                /{tier.perUom} {tier.incoterm}
              </span>
            </span>
          </Tooltip>
        )
      },
    },
    {
      key: 'moq',
      header: 'MOQ',
      align: 'right',
      optional: true,
      value: (r) => r.mp.moqQty,
      cell: (r) => <span className="text-xs tabular text-ink-600">{fmtQty(r.mp.moqQty, r.mp.moqUom)}</span>,
    },
    {
      key: 'clients',
      header: 'Clients',
      align: 'right',
      sortable: true,
      width: '6rem',
      value: (r) => r.engagementCount,
      cell: (r) => (
        <span className="text-xs tabular text-ink-700">
          {r.engagementCount || '—'}
          {r.commercialCount > 0 ? <span className="text-ok-600"> ({r.commercialCount})</span> : null}
        </span>
      ),
    },
  ]

  if (loading) {
    return (
      <Panel>
        <SkeletonTable rows={5} cols={6} />
      </Panel>
    )
  }

  if (sources.length === 0) {
    return (
      <Panel className="p-4">
        <EmptyState
          icon={<Package className="h-5 w-5" />}
          title={`No product is recorded against ${manufacturerName}`}
          description="A manufacturer-product is the real unit of sourcing: one product, at one grade and pharmacopoeia, from one plant. Add the first one from the supplier's product list."
          action={
            <WriteOnly>
              <LinkButton to={`/sources/new?manufacturer=${manufacturerId}`} variant="primary" size="sm">
                Add product
              </LinkButton>
            </WriteOnly>
          }
        />
      </Panel>
    )
  }

  return (
    <div className="space-y-4">
      <Panel>
        <PanelHeader
          title="Represented by TCL"
          subtitle="Sources that can be offered to a client"
          actions={
            <>
              <Badge tone="accent">{represented.length}</Badge>
              <WriteOnly>
                <LinkButton
                  to={`/sources/new?manufacturer=${manufacturerId}`}
                  variant="secondary"
                  size="sm"
                  icon={<Plus className="h-3.5 w-3.5" />}
                >
                  Add product
                </LinkButton>
              </WriteOnly>
            </>
          }
        />
        <SourceTable rows={represented} columns={columns} pageSize={12} empty="None of this manufacturer's products are represented yet" />
      </Panel>

      {known.length > 0 ? (
        <Panel>
          <PanelHeader
            title="Known, not represented"
            subtitle="Market intelligence. These cannot be offered until TCL takes them into the portfolio."
            actions={<Badge tone="outline">{known.length}</Badge>}
          />
          <SourceTable rows={known} columns={columns} pageSize={8} dense empty="Nothing here" />
        </Panel>
      ) : null}
    </div>
  )
}

function SourceTable({
  rows,
  columns,
  pageSize,
  dense,
  empty,
}: {
  rows: SourceRow[]
  columns: Column<SourceRow>[]
  pageSize: number
  dense?: boolean
  empty: string
}) {
  const navigate = useNavigate()
  return (
    <DataTable
      rows={rows}
      columns={columns}
      rowKey={(r) => r.mp.id}
      pageSize={pageSize}
      dense={dense}
      onRowClick={(r) => navigate(`/sources/${r.mp.id}`)}
      rowTone={(r) => (r.mp.status === 'DISCONTINUED' ? 'text-ink-500 opacity-70' : undefined)}
      empty={<EmptyState title={empty} compact />}
    />
  )
}

// ------------------------------------------------------------------ clients

function ClientsTab({
  loading,
  rows,
  manufacturerName,
}: {
  loading: boolean
  rows: EngagementRow[]
  manufacturerName: string
}) {
  const db = useDb()

  const grouped = React.useMemo(() => {
    const map = new Map<string, EngagementRow[]>()
    for (const r of rows) {
      const list = map.get(r.client.id) ?? []
      list.push(r)
      map.set(r.client.id, list)
    }
    return [...map.entries()].sort((a, b) => companyName(db, a[0]).localeCompare(companyName(db, b[0])))
  }, [rows, db])

  if (loading) {
    return (
      <Panel>
        <SkeletonTable rows={6} cols={5} />
      </Panel>
    )
  }

  if (rows.length === 0) {
    return (
      <Panel className="p-4">
        <EmptyState
          icon={<Users className="h-5 w-5" />}
          title={`No client is engaged on a ${manufacturerName} product`}
          description="Once a client requirement is matched to one of this manufacturer's sources, the engagement appears here with its stage and how long it has been there."
          action={
            <WriteOnly>
              <LinkButton to="/requirements/new" variant="primary" size="sm">
                Record a client requirement
              </LinkButton>
            </WriteOnly>
          }
        />
      </Panel>
    )
  }

  return (
    <Panel>
      <PanelHeader
        title="Clients taking this manufacturer's products"
        subtitle="Grouped by client, with the stage and days in stage, which is what a volume negotiation with the supplier needs"
      />
      <ul className="divide-y divide-paper-200">
        {grouped.map(([clientId, list]) => (
          <li key={clientId} className="px-4 py-3">
            <div className="flex items-center justify-between gap-3">
              <Link to={`/clients/${clientId}`} className="text-sm font-semibold text-ink-900 hover:text-accent-700">
                {list[0]!.client.displayName}
              </Link>
              <span className="flex items-center gap-1.5">
                {list.filter((r) => r.stage === 'COMMERCIAL').length > 0 ? (
                  <Badge tone="ok">{list.filter((r) => r.stage === 'COMMERCIAL').length} commercial</Badge>
                ) : null}
                <Badge tone="outline">{pluralise(list.length, 'product')}</Badge>
              </span>
            </div>
            <ul className="mt-2 space-y-1">
              {list.map((r) => (
                <li key={r.engagement.id}>
                  <Link
                    to={`/engagements/${r.engagement.id}`}
                    className="flex w-full items-center gap-3 rounded border border-transparent px-2 py-1.5 text-left transition-colors hover:border-paper-300 hover:bg-paper-100"
                  >
                    <span className="min-w-0 flex-1 truncate text-sm text-ink-800">{r.product.genericName}</span>
                    <span className="hidden font-mono text-2xs text-ink-500 sm:inline">
                      {r.mp.grade} · {r.mp.pharmacopoeia}
                    </span>
                    <StageBadge stage={r.stage} size="sm" />
                    <AgeingFlag days={r.daysInStage} threshold={60} />
                  </Link>
                </li>
              ))}
            </ul>
          </li>
        ))}
      </ul>
    </Panel>
  )
}

// -------------------------------------------------------------------- sites

function SitesTab({
  loading,
  sites,
  documents,
}: {
  loading: boolean
  sites: ReturnType<typeof useDb>['sites']
  documents: DocumentRow[]
}) {
  const db = useDb()

  if (loading) {
    return (
      <Panel>
        <SkeletonTable rows={4} cols={4} />
      </Panel>
    )
  }

  if (sites.length === 0) {
    return (
      <Panel className="p-4">
        <EmptyState
          icon={<Building2 className="h-5 w-5" />}
          title="No site is recorded"
          description="A source has to name the plant it is made at, so at least one plant is needed before products can be added."
          action={
            <WriteOnly>
              <LinkButton to="/manufacturers" variant="primary" size="sm">
                Back to the register
              </LinkButton>
            </WriteOnly>
          }
        />
      </Panel>
    )
  }

  return (
    <div className="space-y-4">
      <Panel>
        <PanelHeader
          title="Sites and plant certificates"
          subtitle="A GMP or WHO-GMP certificate covers the plant, not the product, so it reaches every source made there."
          icon={<FileBadge className="h-4 w-4" />}
        />
        <ul className="divide-y divide-paper-200">
          {sites.map((site) => {
            const certs = documentRows(db, { entityType: 'COMPANY_SITE', entityId: site.id })
            return (
              <li key={site.id} className="px-4 py-3">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-sm font-semibold text-ink-900">{site.name}</span>
                  <Badge tone="neutral">{SITE_KIND_LABEL[site.kind]}</Badge>
                  {site.isPrimary ? <Badge tone="accent">Primary</Badge> : null}
                  {!site.isActive ? <Badge tone="warn">Inactive</Badge> : null}
                </div>
                <p className="mt-0.5 text-xs text-ink-500">
                  {[site.addressLine, site.city, countryName(site.countryCode)].filter(Boolean).join(', ')}
                </p>
                {certs.length === 0 ? (
                  <p className="mt-2 text-xs text-warn-600">No certificate is on file for this plant.</p>
                ) : (
                  <ul className="mt-2 space-y-1">
                    {certs.map((c) => (
                      <li
                        key={c.document.id}
                        className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded border border-paper-200 bg-paper-50/60 px-2.5 py-1.5"
                      >
                        <FileText className="h-3.5 w-3.5 shrink-0 text-ink-400" />
                        <span className="min-w-0 flex-1 truncate text-xs text-ink-800">
                          {documentTypeName(c.document.typeCode)}
                          {c.document.referenceNumber ? (
                            <span className="ml-1.5 font-mono text-2xs text-ink-500">
                              {c.document.referenceNumber}
                            </span>
                          ) : null}
                        </span>
                        {c.document.issuingAuthority ? (
                          <span className="text-2xs text-ink-500">{c.document.issuingAuthority}</span>
                        ) : null}
                        <span className="text-2xs tabular text-ink-500">
                          expires {fmtDate(c.document.expiresOn)}
                        </span>
                        <ExpiryBadge row={c} />
                      </li>
                    ))}
                  </ul>
                )}
              </li>
            )
          })}
        </ul>
      </Panel>

      {documents.length > 0 ? (
        <Panel>
          <PanelHeader title="Documents on the company" subtitle="Agency agreement and anything else filed against the manufacturer itself" />
          <ul className="divide-y divide-paper-200">
            {documents.map((d) => (
              <li key={d.document.id} className="flex items-center gap-3 px-4 py-2.5">
                <FileText className="h-4 w-4 shrink-0 text-ink-400" />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm text-ink-900">{d.document.title}</span>
                  <span className="block truncate text-xs text-ink-500">
                    {documentTypeName(d.document.typeCode)} · uploaded {fmtDate(d.document.uploadedAt)}
                  </span>
                </span>
                <ExpiryBadge row={d} />
              </li>
            ))}
          </ul>
        </Panel>
      ) : null}
    </div>
  )
}

export function ExpiryBadge({ row }: { row: DocumentRow }) {
  if (row.state === 'expired') {
    return <Badge tone="danger">Expired</Badge>
  }
  if (row.state === 'expiring') {
    return <Badge tone="warn">Expires in {row.daysRemaining}d</Badge>
  }
  if (row.state === 'superseded') {
    return <Badge tone="neutral">Superseded</Badge>
  }
  if (row.state === 'not-expiring') {
    return <Badge tone="outline">No expiry</Badge>
  }
  return <Badge tone="ok">Valid</Badge>
}

// ----------------------------------------------------------------- contacts

function ContactsTab({ loading, contacts }: { loading: boolean; contacts: ReturnType<typeof useDb>['contacts'] }) {
  if (loading) {
    return (
      <Panel>
        <SkeletonTable rows={3} cols={4} />
      </Panel>
    )
  }
  if (contacts.length === 0) {
    return (
      <Panel className="p-4">
        <EmptyState
          icon={<Users className="h-5 w-5" />}
          title="No contact person is recorded"
          description="The record is allowed without one, but it shows as incomplete on the register until somebody is named."
          action={
            <WriteOnly>
              <LinkButton to="/manufacturers" variant="primary" size="sm">
                Back to the register
              </LinkButton>
            </WriteOnly>
          }
        />
      </Panel>
    )
  }
  const ordered = [...contacts].sort((a, b) => Number(b.isPrimary) - Number(a.isPrimary))
  return (
    <Panel>
      <PanelHeader title="Contacts" subtitle="One contact is marked primary and receives correspondence by default" />
      <ul className="divide-y divide-paper-200">
        {ordered.map((c) => (
          <li key={c.id} className="flex flex-wrap items-center gap-x-4 gap-y-1.5 px-4 py-3">
            <span className="min-w-[12rem] flex-1">
              <span className="flex items-center gap-2">
                <span className="text-sm font-medium text-ink-900">{c.fullName}</span>
                {c.isPrimary ? <Badge tone="accent">Primary</Badge> : null}
              </span>
              <span className="block text-xs text-ink-500">
                {[c.designation, c.department].filter(Boolean).join(' · ') || 'Role not recorded'}
              </span>
            </span>
            {c.email ? (
              <a
                href={`mailto:${c.email}`}
                className="flex items-center gap-1.5 text-xs text-accent-700 hover:underline"
              >
                <Mail className="h-3.5 w-3.5" />
                {c.email}
              </a>
            ) : null}
            {c.phone ? (
              <span className="flex items-center gap-1.5 text-xs tabular text-ink-600">
                <Phone className="h-3.5 w-3.5 text-ink-400" />
                {c.phone}
              </span>
            ) : null}
          </li>
        ))}
      </ul>
    </Panel>
  )
}

// ------------------------------------------------------------------- orders

function OrdersTab({
  loading,
  indents,
  shipments,
}: {
  loading: boolean
  indents: Indent[]
  shipments: ReturnType<typeof useDb>['shipments']
}) {
  const db = useDb()

  if (loading) {
    return (
      <Panel>
        <SkeletonTable rows={5} cols={6} />
      </Panel>
    )
  }

  if (indents.length === 0) {
    return (
      <Panel className="p-4">
        <EmptyState
          icon={<Truck className="h-5 w-5" />}
          title="No indent has been placed on this manufacturer"
          description="An indent is the order TCL places on a manufacturer for one named client. It follows a client order, so start there."
          action={
            <WriteOnly>
              <LinkButton to="/client-orders/new" variant="primary" size="sm">
                Record a client order
              </LinkButton>
            </WriteOnly>
          }
        />
      </Panel>
    )
  }

  const ordered = [...indents].sort((a, b) => (a.orderDate < b.orderDate ? 1 : -1))

  return (
    <div className="space-y-4">
      <Panel>
        <PanelHeader
          title="Indents placed on this manufacturer"
          subtitle="Each indent is raised for one named client, who opens the letter of credit in the manufacturer's favour"
        />
        <ul className="divide-y divide-paper-200">
          {ordered.map((i) => (
            <li key={i.id}>
              <Link
                to={`/indents/${i.id}`}
                className="flex flex-wrap items-center gap-x-3 gap-y-1 px-4 py-2.5 transition-colors hover:bg-paper-100"
              >
                <span className="w-32 shrink-0 font-mono text-xs tabular text-ink-900">{i.indentNumber}</span>
                <span className="min-w-0 flex-1 truncate text-sm text-ink-800">
                  for {companyName(db, i.clientCompanyId)}
                </span>
                <Badge
                  tone={
                    i.status === 'COMPLETED'
                      ? 'ok'
                      : i.status === 'CANCELLED'
                        ? 'neutral'
                        : i.status === 'ON_HOLD'
                          ? 'warn'
                          : 'info'
                  }
                >
                  {ORDER_STATUS_LABEL[i.status]}
                </Badge>
                {i.lcNumber ? (
                  <Tooltip content={`LC ${i.lcNumber}${i.lcBank ? ` · ${i.lcBank}` : ''}${i.lcExpiryDate ? ` · expires ${fmtDate(i.lcExpiryDate)}` : ''}`}>
                    <Badge tone="accent">LC on file</Badge>
                  </Tooltip>
                ) : (
                  <Badge tone="outline">No LC</Badge>
                )}
                <span className="w-28 text-right text-sm tabular text-ink-900">
                  {fmtMoney(indentValue(db, i.id), i.currency, { decimals: 0 })}
                </span>
                <span className="w-24 text-right text-xs tabular text-ink-400">{fmtDate(i.orderDate)}</span>
              </Link>
            </li>
          ))}
        </ul>
      </Panel>

      <Panel>
        <PanelHeader title="Shipments against those indents" subtitle="One indent can ship in several consignments" />
        {shipments.length === 0 ? (
          <div className="p-4">
            <EmptyState
              icon={<Ship className="h-5 w-5" />}
              title="Nothing has shipped yet"
              description="A shipment is recorded against an indent, with its batches, bill of lading and customs clearance."
              compact
            />
          </div>
        ) : (
          <ul className="divide-y divide-paper-200">
            {[...shipments]
              .sort((a, b) => ((a.etd ?? '') < (b.etd ?? '') ? 1 : -1))
              .map((s) => {
                const indent = indents.find((i) => i.id === s.indentId)
                return (
                  <li key={s.id}>
                    <Link
                      to={`/shipments/${s.id}`}
                      className="flex flex-wrap items-center gap-x-3 gap-y-1 px-4 py-2.5 transition-colors hover:bg-paper-100"
                    >
                      <span className="w-32 shrink-0 font-mono text-xs tabular text-ink-900">{s.shipmentRef}</span>
                      <span className="min-w-0 flex-1 truncate text-xs text-ink-600">
                        {indent ? `${indent.indentNumber} · ` : ''}
                        {s.portOfLoading ?? '—'} to {s.portOfDischarge ?? '—'}
                      </span>
                      <Badge tone={s.status === 'HELD_AT_CUSTOMS' ? 'danger' : s.status === 'DELIVERED' ? 'ok' : 'info'}>
                        {s.status === 'HELD_AT_CUSTOMS' ? 'Held at customs' : s.status.charAt(0) + s.status.slice(1).toLowerCase().replace(/_/g, ' ')}
                      </Badge>
                      <span className="w-24 text-right text-xs tabular text-ink-400">{fmtDate(s.eta)}</span>
                    </Link>
                  </li>
                )
              })}
          </ul>
        )}
      </Panel>
    </div>
  )
}

// ------------------------------------------------------------------ history

function HistoryTab({
  loading,
  companyId,
  changes,
}: {
  loading: boolean
  companyId: string
  changes: ReturnType<typeof useDb>['statusChanges']
}) {
  const db = useDb()

  const audit = React.useMemo(() => {
    const siteIds = db.sites.filter((s) => s.companyId === companyId).map((s) => s.id)
    const contactIds = db.contacts.filter((c) => c.companyId === companyId).map((c) => c.id)
    const sourceIds = db.manufacturerProducts
      .filter((m) => m.manufacturerCompanyId === companyId)
      .map((m) => m.id)
    const relevant = new Set([companyId, ...siteIds, ...contactIds, ...sourceIds])
    return db.audit.filter((a) => relevant.has(a.recordId)).slice(0, 25)
  }, [db, companyId])

  if (loading) {
    return (
      <Panel>
        <SkeletonTable rows={4} cols={3} />
      </Panel>
    )
  }

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <Panel>
        <PanelHeader
          title="Relationship status"
          subtitle="Every move between New, Under development, Commercial, Inactive and Blacklisted"
          icon={<Handshake className="h-4 w-4" />}
        />
        {changes.length === 0 ? (
          <div className="p-4">
            <EmptyState
              icon={<History className="h-5 w-5" />}
              title="No status change has been recorded"
              description="The record still sits at the status it was registered with."
              compact
            />
          </div>
        ) : (
          <ol className="relative space-y-3 px-4 py-4 pl-9">
            <span className="absolute left-[27px] bottom-5 top-5 w-px bg-paper-300" aria-hidden />
            {[...changes]
              .sort((a, b) => (a.changedAt < b.changedAt ? 1 : -1))
              .map((c) => (
                <li key={c.id} className="relative">
                  <span
                    className="absolute -left-5 top-1 h-3.5 w-3.5 rounded-full border-2 border-white bg-accent-500"
                    aria-hidden
                  />
                  <p className="flex flex-wrap items-baseline gap-x-2 text-sm text-ink-900">
                    <span className="font-medium">
                      {c.fromStatus ? `${MANUFACTURER_STATUS_LABEL[c.fromStatus]} to ` : ''}
                      {MANUFACTURER_STATUS_LABEL[c.toStatus]}
                    </span>
                    <span className="text-xs text-ink-400">
                      {fmtDate(c.changedAt)} · {userName(db, c.changedByUserId)}
                    </span>
                  </p>
                  {c.remark ? (
                    <p className="mt-0.5 text-xs italic leading-relaxed text-ink-500">“{c.remark}”</p>
                  ) : null}
                </li>
              ))}
          </ol>
        )}
      </Panel>

      <Panel>
        <PanelHeader title="Recent changes" subtitle="From the audit log, newest first" icon={<History className="h-4 w-4" />} />
        {audit.length === 0 ? (
          <div className="p-4">
            <EmptyState title="Nothing has been changed in this session" compact />
          </div>
        ) : (
          <ul className="divide-y divide-paper-200">
            {audit.map((a) => (
              <li key={a.id} className="flex items-baseline gap-3 px-4 py-2">
                <Badge tone={a.action === 'INSERT' ? 'ok' : a.action === 'DELETE' ? 'danger' : 'neutral'}>
                  {a.action === 'INSERT' ? 'Created' : a.action === 'DELETE' ? 'Removed' : 'Changed'}
                </Badge>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm text-ink-800">{a.recordLabel}</span>
                  <span className="block text-xs text-ink-500">
                    {a.tableName.replace(/_/g, ' ')}
                    {a.changedFields
                      ? ` · ${Object.keys(a.changedFields).join(', ')}`
                      : ''}
                  </span>
                </span>
                <span className="shrink-0 text-xs tabular text-ink-400">
                  {fmtDate(a.occurredAt)} · {userName(db, a.userId)}
                </span>
              </li>
            ))}
          </ul>
        )}
      </Panel>
    </div>
  )
}
