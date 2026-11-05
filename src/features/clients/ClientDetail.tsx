/**
 * Client detail (UC-12, FR-M5-05, FR-M9-08).
 *
 * This is the screen a BD officer opens before a client visit: everything the
 * client takes, who makes it, how far each engagement has got, what is still
 * being asked for, where goods may be delivered, who to speak to, and what TCL
 * has earned. Products are grouped by molecule so a client taking one molecule
 * from two sources reads as one group with two rows, which is the dual-sourcing
 * picture of alternate flow 2a.
 *
 * If the client record is inactive the page stays open and read-only
 * (exception flow 1a); nothing is hidden, nothing can be changed.
 */

import * as React from 'react'
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom'
import {
  Building2,
  CalendarClock,
  FileText,
  Mail,
  MapPin,
  Package,
  Pencil,
  Phone,
  Plus,
  Receipt,
  Truck,
  Users,
} from 'lucide-react'
import { useDb, useSettings } from '@/data/store'
import {
  commissionRows,
  documentRows,
  engagementRows,
  orderLineStatuses,
  requirementRows,
  userName,
  type CommissionRow,
  type DocumentRow,
  type EngagementRow,
  type OrderLineStatus,
  type RequirementRow,
} from '@/data/selectors'
import {
  COMMISSION_STATUS_LABEL,
  ORDER_STATUS_LABEL,
  REQUIREMENT_KIND_LABEL,
  REQUIREMENT_STATUS_LABEL,
  SITE_KIND_LABEL_CLIENT,
  STAGE_LABEL,
  documentTypeName,
  paymentTermLabel,
} from '@/data/reference'
import { createContact, createSite, logActivity, updateContact, updateSite } from '@/data/api'
import { runAction, useAsyncData } from '@/lib/hooks'
import { fmtDate, fmtDateTime, fmtMoney, fmtQty, pluralise } from '@/lib/utils'
import type {
  ActivityKind,
  CompanyContact,
  CompanySite,
  EngagementStage,
  SiteKind,
} from '@/data/types'
import {
  AgeingFlag,
  Avatar,
  Badge,
  Button,
  ClientStatusBadge,
  Count,
  DateInput,
  Dialog,
  EmptyState,
  Field,
  FieldGrid,
  FormGrid,
  FormRow,
  Input,
  LinkButton,
  Meter,
  Panel,
  PanelHeader,
  PageHeading,
  Select,
  SkeletonTable,
  StageBadge,
  Switch,
  Tab,
  TabList,
  TabPanel,
  Tabs,
  Textarea,
  Tooltip,
  WriteButton,
  WriteOnly,
} from '@/components/ui'
import { NotFound } from '@/features/misc/Fallbacks'

const CLIENT_DEPARTMENTS = ['Purchase', 'QA', 'QC', 'R&D', 'Regulatory', 'Accounts']

const ACTIVITY_KINDS: { value: ActivityKind; label: string }[] = [
  { value: 'CALL', label: 'Call' },
  { value: 'MEETING', label: 'Meeting' },
  { value: 'EMAIL', label: 'Email' },
  { value: 'VISIT', label: 'Visit' },
  { value: 'NOTE', label: 'Note' },
]

export function ClientDetail() {
  const { id = '' } = useParams()
  const db = useDb()
  const settings = useSettings()
  const [params, setParams] = useSearchParams()

  const client = db.companies.find((c) => c.id === id)

  const { data, loading } = useAsyncData(
    () => ({
      engagements: engagementRows(db, { clientId: id }),
      requirements: requirementRows(db, { clientId: id }),
      sites: db.sites.filter((s) => s.companyId === id),
      contacts: db.contacts.filter((c) => c.companyId === id && c.isActive),
      orders: db.clientOrders.filter((o) => o.clientCompanyId === id),
      lines: orderLineStatuses(db, { clientId: id }),
      indents: db.indents.filter((i) => i.clientCompanyId === id),
      commissions: commissionRows(db, { clientId: id }),
      documents: documentRows(db, { entityType: 'COMPANY', entityId: id }),
    }),
    [id],
  )

  if (!client || !client.client) return <NotFound />

  const profile = client.client
  const readOnly = !client.isActive

  const tab = params.get('tab') ?? 'products'
  const setTab = (value: string) => {
    const next = new URLSearchParams(params)
    next.set('tab', value)
    setParams(next, { replace: true })
  }

  const engagements = data?.engagements ?? []
  const engagementIds = new Set(engagements.map((e) => e.engagement.id))
  const engagementDocuments = engagements.flatMap((e) =>
    documentRows(db, { entityType: 'ENGAGEMENT', entityId: e.engagement.id }),
  )
  const documents = [...(data?.documents ?? []), ...engagementDocuments]

  const activities = db.activities
    .filter(
      (a) =>
        (a.entityType === 'COMPANY' && a.entityId === id) ||
        (a.entityType === 'ENGAGEMENT' && engagementIds.has(a.entityId)),
    )
    .slice()
    .sort((a, b) => (a.occurredAt < b.occurredAt ? 1 : -1))

  const productCount = new Set(engagements.map((e) => e.product.id)).size
  const commercialCount = engagements.filter((e) => e.stage === 'COMMERCIAL').length
  const openRequirements = (data?.requirements ?? []).filter((r) =>
    ['OPEN', 'SOURCING', 'ENGAGED'].includes(r.requirement.status),
  ).length
  const commissionCurrency = data?.commissions[0]?.commission.currency ?? 'USD'
  const commissionEarned = (data?.commissions ?? []).reduce(
    (sum, c) => (c.commission.status === 'WRITTEN_OFF' ? sum : sum + (c.commission.amount ?? 0)),
    0,
  )

  return (
    <div className="space-y-4">
      <PageHeading
        title={client.displayName}
        subtitle={client.legalName}
        meta={
          <>
            <ClientStatusBadge status={profile.status} />
            <Badge tone="neutral">
              <Avatar name={userName(db, profile.ownerUserId)} size="xs" className="-ml-0.5" />
              {userName(db, profile.ownerUserId)}
            </Badge>
            {profile.therapeuticFocus ? <Badge tone="outline">{profile.therapeuticFocus}</Badge> : null}
            {!client.isActive ? <Badge tone="warn">Inactive</Badge> : null}
            {client.possibleDuplicate ? <Badge tone="warn">Check duplicate</Badge> : null}
          </>
        }
        actions={
          readOnly ? null : (
            <WriteOnly>
              <LinkButton
                to={`/clients/${id}/edit`}
                variant="secondary"
                size="md"
                icon={<Pencil className="h-3.5 w-3.5" />}
              >
                Edit
              </LinkButton>
              <LinkButton
                to={`/requirements/new?client=${id}`}
                variant="primary"
                size="md"
                icon={<Plus className="h-3.5 w-3.5" />}
              >
                Record requirement
              </LinkButton>
            </WriteOnly>
          )
        }
      />

      {readOnly ? (
        <Panel className="max-w-2xl border-warn-200 bg-warn-50/60 p-3.5">
          <p className="text-sm font-semibold text-warn-600">This client record is inactive</p>
          <p className="mt-1 text-xs leading-relaxed text-ink-700">
            The record was deactivated rather than deleted, so every engagement, order and document below remains
            readable. Nothing on this page can be changed while it stays inactive. An administrator can reactivate it
            from the client list.
          </p>
        </Panel>
      ) : null}

      {/* summary as four bounded cells, not one wide band */}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Panel className="p-3.5">
          <p className="text-2xs font-semibold uppercase tracking-wider text-ink-500">Products taken</p>
          <p className="mt-1 text-2xl font-semibold tabular text-ink-900">{loading ? '—' : productCount || '—'}</p>
          <p className="mt-0.5 text-xs text-ink-500">
            across {pluralise(new Set(engagements.map((e) => e.mp.id)).size, 'source')}
          </p>
        </Panel>
        <Panel className="p-3.5">
          <p className="text-2xs font-semibold uppercase tracking-wider text-ink-500">In commercial supply</p>
          <p className="mt-1 text-2xl font-semibold tabular text-ink-900">{loading ? '—' : commercialCount || '—'}</p>
          <Meter value={commercialCount} max={Math.max(1, engagements.length)} className="mt-2" />
        </Panel>
        <Panel className="p-3.5">
          <p className="text-2xs font-semibold uppercase tracking-wider text-ink-500">Open requirements</p>
          <p className="mt-1 text-2xl font-semibold tabular text-ink-900">{loading ? '—' : openRequirements || '—'}</p>
          <p className="mt-0.5 text-xs text-ink-500">
            {pluralise(data?.requirements.length ?? 0, 'enquiry')} in total
          </p>
        </Panel>
        <Panel className="p-3.5">
          <p className="text-2xs font-semibold uppercase tracking-wider text-ink-500">Commission earned</p>
          <p className="mt-1 text-2xl font-semibold tabular text-ink-900">
            {loading ? '—' : fmtMoney(commissionEarned, commissionCurrency, { compact: true, decimals: 0 })}
          </p>
          <p className="mt-0.5 text-xs text-ink-500">
            on {pluralise(data?.indents.length ?? 0, 'indent')} raised for this client
          </p>
        </Panel>
      </div>

      <Panel className="p-4">
        <FieldGrid cols={4}>
          <Field label="Payment terms">{paymentTermLabel(profile.paymentTermCode)}</Field>
          <Field label="Credit limit">
            <Tooltip content="Recorded for reference. The system does not block orders against it in v1.">
              <span>
                {profile.creditLimit == null
                  ? 'Not recorded'
                  : `${fmtMoney(profile.creditLimit, profile.creditCurrency ?? 'USD', { decimals: 0 })}`}
              </span>
            </Tooltip>
          </Field>
          <Field label="Minimum shelf life on receipt">
            {profile.minShelfLifeMonths
              ? `${profile.minShelfLifeMonths} months`
              : `${settings.minShelfLifeMonths} months (company default)`}
          </Field>
          <Field label="First business">{fmtDate(profile.firstBusinessDate)}</Field>
          <Field label="Country">{client.countryCode}</Field>
          <Field label="General email">
            {client.generalEmail ? (
              <a href={`mailto:${client.generalEmail}`} className="hover:text-accent-700">
                {client.generalEmail}
              </a>
            ) : (
              '—'
            )}
          </Field>
          <Field label="General phone">{client.generalPhone ?? '—'}</Field>
          <Field label="Website">
            {client.website ? (
              <a
                href={client.website}
                target="_blank"
                rel="noreferrer"
                className="truncate hover:text-accent-700"
              >
                {client.website.replace(/^https?:\/\//, '')}
              </a>
            ) : (
              '—'
            )}
          </Field>
        </FieldGrid>
        {client.notes ? <p className="mt-3 text-xs leading-relaxed text-ink-600">{client.notes}</p> : null}
      </Panel>

      <Tabs value={tab} onValueChange={setTab}>
        <TabList>
          <Tab value="products">
            Products taken
            <Count value={productCount} active={tab === 'products'} />
          </Tab>
          <Tab value="requirements">
            Requirements
            <Count value={data?.requirements.length ?? 0} active={tab === 'requirements'} />
          </Tab>
          <Tab value="sites">
            Sites
            <Count value={data?.sites.length ?? 0} active={tab === 'sites'} />
          </Tab>
          <Tab value="contacts">
            Contacts
            <Count value={data?.contacts.length ?? 0} active={tab === 'contacts'} />
          </Tab>
          <Tab value="orders">
            Orders
            <Count value={data?.orders.length ?? 0} active={tab === 'orders'} />
          </Tab>
          <Tab value="documents">
            Documents
            <Count value={documents.length} active={tab === 'documents'} />
          </Tab>
          <Tab value="activity">
            Activity
            <Count value={activities.length} active={tab === 'activity'} />
          </Tab>
        </TabList>

        <div className="pt-4">
          <TabPanel value="products">
            <ProductsTab loading={loading} rows={engagements} clientId={id} readOnly={readOnly} />
          </TabPanel>

          <TabPanel value="requirements">
            <RequirementsTab
              loading={loading}
              rows={data?.requirements ?? []}
              clientId={id}
              readOnly={readOnly}
            />
          </TabPanel>

          <TabPanel value="sites">
            <SitesTab loading={loading} sites={data?.sites ?? []} clientId={id} readOnly={readOnly} />
          </TabPanel>

          <TabPanel value="contacts">
            <ContactsTab
              loading={loading}
              contacts={data?.contacts ?? []}
              sites={data?.sites ?? []}
              clientId={id}
              readOnly={readOnly}
            />
          </TabPanel>

          <TabPanel value="orders">
            <OrdersTab
              loading={loading}
              orders={data?.orders ?? []}
              lines={data?.lines ?? []}
              indents={data?.indents ?? []}
              commissions={data?.commissions ?? []}
              clientName={client.displayName}
              readOnly={readOnly}
            />
          </TabPanel>

          <TabPanel value="documents">
            <DocumentsTab loading={loading} rows={documents} clientName={client.displayName} />
          </TabPanel>

          <TabPanel value="activity">
            <ActivityTab loading={loading} activities={activities} clientId={id} readOnly={readOnly} />
          </TabPanel>
        </div>
      </Tabs>
    </div>
  )
}

// ----------------------------------------------------------- products taken

function ProductsTab({
  loading,
  rows,
  clientId,
  readOnly,
}: {
  loading: boolean
  rows: EngagementRow[]
  clientId: string
  readOnly: boolean
}) {
  const [stage, setStage] = React.useState('')
  const [manufacturer, setManufacturer] = React.useState('')

  const manufacturerOptions = React.useMemo(() => {
    const seen = new Map<string, string>()
    for (const r of rows) seen.set(r.manufacturer.id, r.manufacturer.displayName)
    return [...seen.entries()]
      .map(([value, label]) => ({ value, label }))
      .sort((a, b) => a.label.localeCompare(b.label))
  }, [rows])

  const filtered = rows.filter(
    (r) => (!stage || r.stage === stage) && (!manufacturer || r.manufacturer.id === manufacturer),
  )

  // grouped by molecule, so two sources for one molecule read as one group
  const grouped = React.useMemo(() => {
    const map = new Map<string, EngagementRow[]>()
    for (const r of filtered) {
      const list = map.get(r.product.id) ?? []
      list.push(r)
      map.set(r.product.id, list)
    }
    return [...map.values()].sort((a, b) => a[0]!.product.genericName.localeCompare(b[0]!.product.genericName))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filtered.map((r) => r.engagement.id).join(',')])

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
          icon={<Package className="h-5 w-5" />}
          title="This client takes nothing yet"
          description="Once a requirement is matched to a source, the engagement appears here with its stage and its ageing."
          action={
            readOnly ? undefined : (
              <WriteOnly>
                <LinkButton to={`/requirements/new?client=${clientId}`} variant="primary" size="sm">
                  Record a requirement
                </LinkButton>
              </WriteOnly>
            )
          }
          secondary={
            <LinkButton to="/products" variant="ghost" size="sm">
              Browse the product catalogue
            </LinkButton>
          }
        />
      </Panel>
    )
  }

  return (
    <Panel>
      <PanelHeader
        title="Products taken, grouped by molecule"
        subtitle="A molecule taken from two sources shows as one group with two rows"
        actions={
          <>
            <Select
              value={stage}
              onChange={setStage}
              allowEmpty
              emptyLabel="Any stage"
              placeholder="Any stage"
              className="w-40"
              options={(Object.keys(STAGE_LABEL) as EngagementStage[]).map((s) => ({
                value: s,
                label: STAGE_LABEL[s],
              }))}
            />
            <Select
              value={manufacturer}
              onChange={setManufacturer}
              allowEmpty
              emptyLabel="Any manufacturer"
              placeholder="Any manufacturer"
              className="w-44"
              options={manufacturerOptions}
            />
          </>
        }
      />

      {grouped.length === 0 ? (
        <div className="p-4">
          <EmptyState
            title="Nothing matches those two filters"
            description="The client takes products, but none at that stage from that manufacturer."
            action={
              <Button
                variant="secondary"
                size="sm"
                onClick={() => {
                  setStage('')
                  setManufacturer('')
                }}
              >
                Clear the filters
              </Button>
            }
            compact
          />
        </div>
      ) : (
        <ul className="divide-y divide-paper-200">
          {grouped.map((list) => {
            const product = list[0]!.product
            return (
              <li key={product.id} className="px-4 py-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <Link
                    to={`/products/${product.id}`}
                    className="text-sm font-semibold text-ink-900 hover:text-accent-700"
                  >
                    {product.genericName}
                  </Link>
                  {list.length > 1 ? (
                    <Tooltip content="This client takes the same molecule from more than one source. Normal, and encouraged by regulators.">
                      <Badge tone="accent">Dual sourced · {list.length}</Badge>
                    </Tooltip>
                  ) : null}
                </div>
                <ul className="mt-2 space-y-1">
                  {list.map((r) => (
                    <li
                      key={r.engagement.id}
                      className="rounded border border-transparent transition-colors hover:border-paper-300 hover:bg-paper-100"
                    >
                      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 px-2 py-1.5">
                        <Link
                          to={`/engagements/${r.engagement.id}`}
                          className="min-w-0 flex-1 truncate text-sm text-ink-800 hover:text-accent-700"
                        >
                          {r.manufacturer.displayName}
                        </Link>
                        <span className="hidden font-mono text-2xs text-ink-500 sm:inline">
                          {r.mp.grade} · {r.mp.pharmacopoeia}
                        </span>
                        <StageBadge stage={r.stage} size="sm" />
                        <AgeingFlag days={r.daysInStage} threshold={60} />
                        <span className="w-24 text-right text-2xs tabular text-ink-500">
                          {r.lastActivityAt ? fmtDate(r.lastActivityAt) : 'No activity'}
                        </span>
                        <span className="flex w-28 items-center justify-end gap-1.5">
                          <Avatar name={r.ownerName} size="xs" />
                          <span className="truncate text-2xs text-ink-500">{r.ownerName}</span>
                        </span>
                        <Link
                          to={`/engagements/${r.engagement.id}/peers`}
                          className="shrink-0 text-2xs font-medium text-accent-700 underline"
                        >
                          Other clients taking this
                        </Link>
                      </div>
                    </li>
                  ))}
                </ul>
              </li>
            )
          })}
        </ul>
      )}
    </Panel>
  )
}

// ------------------------------------------------------------- requirements

function RequirementsTab({
  loading,
  rows,
  clientId,
  readOnly,
}: {
  loading: boolean
  rows: RequirementRow[]
  clientId: string
  readOnly: boolean
}) {
  if (loading) {
    return (
      <Panel>
        <SkeletonTable rows={4} cols={6} />
      </Panel>
    )
  }

  if (rows.length === 0) {
    return (
      <Panel className="p-4">
        <EmptyState
          icon={<CalendarClock className="h-5 w-5" />}
          title="No requirement recorded for this client"
          description="A requirement is what the client asked for: a new molecule to develop, or a second source for something it already buys."
          action={
            readOnly ? undefined : (
              <WriteOnly>
                <LinkButton to={`/requirements/new?client=${clientId}`} variant="primary" size="sm">
                  Record a requirement
                </LinkButton>
              </WriteOnly>
            )
          }
        />
      </Panel>
    )
  }

  const sorted = rows
    .slice()
    .sort((a, b) => (a.requirement.enquiryDate < b.requirement.enquiryDate ? 1 : -1))

  return (
    <Panel>
      <PanelHeader
        title="What this client has asked for"
        subtitle="New developments and alternate-source requests, newest first"
        actions={
          readOnly ? null : (
            <WriteOnly>
              <LinkButton
                to={`/requirements/new?client=${clientId}`}
                variant="secondary"
                size="sm"
                icon={<Plus className="h-3.5 w-3.5" />}
              >
                Record a requirement
              </LinkButton>
            </WriteOnly>
          )
        }
      />
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-paper-300 bg-paper-100/70">
            <th className="th">Molecule</th>
            <th className="th">Kind</th>
            <th className="th">Standard</th>
            <th className="th text-right">Annual quantity</th>
            <th className="th text-right">Target price</th>
            <th className="th text-right">Candidate sources</th>
            <th className="th text-right">Days open</th>
            <th className="th">Status</th>
          </tr>
        </thead>
        <tbody>
          {sorted.map((r) => (
            <tr key={r.requirement.id} className="border-b border-paper-200 last:border-0 hover:bg-paper-100/70">
              <td className="cell">
                <Link
                  to={`/requirements/${r.requirement.id}`}
                  className="font-medium text-ink-900 hover:text-accent-700"
                >
                  {r.product.genericName}
                </Link>
                <span className="block text-2xs text-ink-500">asked {fmtDate(r.requirement.enquiryDate)}</span>
              </td>
              <td className="cell">
                <Badge tone={r.requirement.kind === 'NEW_DEVELOPMENT' ? 'info' : 'accent'}>
                  {REQUIREMENT_KIND_LABEL[r.requirement.kind]}
                </Badge>
              </td>
              <td className="cell font-mono text-xs text-ink-600">
                {r.requirement.requiredPharmacopoeia ?? 'Any'}
              </td>
              <td className="cell text-right tabular text-ink-800">
                {fmtQty(r.requirement.estAnnualQty, r.requirement.qtyUom)}
                {r.requirement.qtyIsIndicative ? (
                  <span className="ml-1 text-2xs text-ink-400">indicative</span>
                ) : null}
              </td>
              <td className="cell text-right tabular text-ink-800">
                {r.requirement.targetPrice == null
                  ? '—'
                  : fmtMoney(r.requirement.targetPrice, r.requirement.targetCurrency ?? 'USD')}
              </td>
              <td className="cell text-right">
                {r.candidateCount === 0 ? (
                  <Tooltip content="No source in the portfolio answers this requirement, so it sits on the shopping list.">
                    <Badge tone="warn">None yet</Badge>
                  </Tooltip>
                ) : (
                  <span className="tabular text-ink-800">{r.candidateCount}</span>
                )}
              </td>
              <td className="cell text-right">
                <AgeingFlag days={r.daysOpen} threshold={90} />
              </td>
              <td className="cell">
                <Badge
                  tone={
                    r.requirement.status === 'FULFILLED'
                      ? 'ok'
                      : r.requirement.status === 'CLOSED_LOST' || r.requirement.status === 'CANCELLED'
                        ? 'neutral'
                        : 'outline'
                  }
                >
                  {REQUIREMENT_STATUS_LABEL[r.requirement.status]}
                </Badge>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </Panel>
  )
}

// -------------------------------------------------------------------- sites

function SitesTab({
  loading,
  sites,
  clientId,
  readOnly,
}: {
  loading: boolean
  sites: CompanySite[]
  clientId: string
  readOnly: boolean
}) {
  const [editing, setEditing] = React.useState<CompanySite | 'new' | null>(null)

  if (loading) {
    return (
      <Panel>
        <SkeletonTable rows={3} cols={4} />
      </Panel>
    )
  }

  const deliverable = sites.filter((s) => s.isDeliveryDestination && s.isActive)

  return (
    <>
      <Panel>
        <PanelHeader
          title="Sites"
          subtitle="A client calls a head office a corporate office and a plant a factory. Deliveries may only go to a site of the ordering client."
          actions={
            readOnly ? null : (
              <WriteButton
                variant="secondary"
                size="sm"
                icon={<Plus className="h-3.5 w-3.5" />}
                onClick={() => setEditing('new')}
              >
                Add a site
              </WriteButton>
            )
          }
        />
        {sites.length === 0 ? (
          <div className="p-4">
            <EmptyState
              icon={<MapPin className="h-5 w-5" />}
              title="No site recorded"
              description="An order needs a delivery destination, and a destination has to be a site of this client. Add the factory that receives goods."
              action={
                readOnly ? undefined : (
                  <WriteButton variant="primary" size="sm" onClick={() => setEditing('new')}>
                    Add a site
                  </WriteButton>
                )
              }
            />
          </div>
        ) : (
          <ul className="divide-y divide-paper-200">
            {sites.map((s) => (
              <li key={s.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 px-4 py-2.5">
                <span className="min-w-0 flex-1">
                  <span className="flex items-center gap-1.5">
                    <span className="truncate text-sm font-medium text-ink-900">{s.name}</span>
                    {s.isPrimary ? <Badge tone="outline">Primary</Badge> : null}
                    {!s.isActive ? <Badge tone="neutral">Inactive</Badge> : null}
                  </span>
                  <span className="block truncate text-xs text-ink-500">
                    {[s.addressLine, s.city, s.countryCode].filter(Boolean).join(', ')}
                  </span>
                </span>
                <Badge tone="neutral">{SITE_KIND_LABEL_CLIENT[s.kind]}</Badge>
                {s.isDeliveryDestination ? (
                  <Tooltip content="Goods may be delivered here.">
                    <Badge tone="ok">Delivery destination</Badge>
                  </Tooltip>
                ) : (
                  <Badge tone="outline">Not for delivery</Badge>
                )}
                {readOnly ? null : (
                  <WriteButton variant="ghost" size="sm" onClick={() => setEditing(s)}>
                    Edit
                  </WriteButton>
                )}
              </li>
            ))}
          </ul>
        )}
        {sites.length > 0 && deliverable.length === 0 ? (
          <p className="border-t border-paper-200 px-4 py-2.5 text-xs text-warn-600">
            None of these sites is marked as a delivery destination, so an order for this client has nowhere to go.
            Mark the factory or warehouse that receives goods.
          </p>
        ) : null}
      </Panel>

      {editing ? (
        <SiteDialog
          clientId={clientId}
          site={editing === 'new' ? null : editing}
          onClose={() => setEditing(null)}
        />
      ) : null}
    </>
  )
}

function SiteDialog({
  clientId,
  site,
  onClose,
}: {
  clientId: string
  site: CompanySite | null
  onClose: () => void
}) {
  const [name, setName] = React.useState(site?.name ?? '')
  const [kind, setKind] = React.useState<SiteKind>(site?.kind ?? 'PLANT')
  const [city, setCity] = React.useState(site?.city ?? '')
  const [countryCode, setCountryCode] = React.useState(site?.countryCode ?? 'BD')
  const [addressLine, setAddressLine] = React.useState(site?.addressLine ?? '')
  const [isPrimary, setIsPrimary] = React.useState(site?.isPrimary ?? false)
  const [isDelivery, setIsDelivery] = React.useState(site?.isDeliveryDestination ?? true)
  const [busy, setBusy] = React.useState(false)

  const save = async () => {
    if (!name.trim()) return
    setBusy(true)
    const payload = {
      kind,
      name: name.trim(),
      city: city.trim() || null,
      countryCode,
      addressLine: addressLine.trim() || null,
      isPrimary,
      isDeliveryDestination: isDelivery,
    }
    const ok = await runAction(
      async () => {
        if (site) await updateSite(site.id, payload)
        else await createSite({ companyId: clientId, ...payload })
        return true
      },
      { success: site ? `${payload.name} updated.` : `${payload.name} added.` },
    )
    setBusy(false)
    if (ok !== null) onClose()
  }

  return (
    <Dialog
      open
      onOpenChange={(open) => (open ? undefined : onClose())}
      title={site ? `Edit ${site.name}` : 'Add a site'}
      description="Only a factory or a warehouse is normally a delivery destination. A corporate office is not."
      footer={
        <>
          <Button variant="ghost" size="sm" onClick={onClose}>
            Cancel
          </Button>
          <Button variant="primary" size="sm" loading={busy} disabled={!name.trim()} onClick={() => void save()}>
            {site ? 'Save changes' : 'Add site'}
          </Button>
        </>
      }
    >
      <div className="space-y-3.5">
        <FormGrid>
          <FormRow label="Site name" required>
            <Input value={name} onChange={(e) => setName(e.target.value)} autoFocus placeholder="Gazipur Factory" />
          </FormRow>
          <FormRow label="Site type" required>
            <Select
              value={kind}
              onChange={(v) => {
                const next = v as SiteKind
                setKind(next)
                setIsDelivery(next === 'PLANT' || next === 'WAREHOUSE')
              }}
              options={(Object.keys(SITE_KIND_LABEL_CLIENT) as SiteKind[]).map((k) => ({
                value: k,
                label: SITE_KIND_LABEL_CLIENT[k],
              }))}
            />
          </FormRow>
        </FormGrid>
        <FormGrid>
          <FormRow label="City">
            <Input value={city} onChange={(e) => setCity(e.target.value)} />
          </FormRow>
          <FormRow label="Country">
            <Input value={countryCode} onChange={(e) => setCountryCode(e.target.value.toUpperCase().slice(0, 2))} mono />
          </FormRow>
        </FormGrid>
        <FormRow label="Address">
          <Input value={addressLine} onChange={(e) => setAddressLine(e.target.value)} />
        </FormRow>
        <Switch
          checked={isDelivery}
          onChange={setIsDelivery}
          label="Valid delivery destination"
          description="Goods on an order for this client may be delivered here."
        />
        <Switch
          checked={isPrimary}
          onChange={setIsPrimary}
          label="Primary site"
          description="The address used when no other is given."
        />
      </div>
    </Dialog>
  )
}

// ----------------------------------------------------------------- contacts

function ContactsTab({
  loading,
  contacts,
  sites,
  clientId,
  readOnly,
}: {
  loading: boolean
  contacts: CompanyContact[]
  sites: CompanySite[]
  clientId: string
  readOnly: boolean
}) {
  const [editing, setEditing] = React.useState<CompanyContact | 'new' | null>(null)

  if (loading) {
    return (
      <Panel>
        <SkeletonTable rows={4} cols={4} />
      </Panel>
    )
  }

  const byDepartment = CLIENT_DEPARTMENTS.map((dept) => ({
    dept,
    people: contacts.filter((c) => c.department === dept),
  })).filter((g) => g.people.length > 0)
  const other = contacts.filter((c) => !CLIENT_DEPARTMENTS.includes(c.department ?? ''))

  return (
    <>
      <Panel>
        <PanelHeader
          title="Contacts by department"
          subtitle="Purchase places the order, QA approves the source, Accounts pays the invoice"
          actions={
            readOnly ? null : (
              <WriteButton
                variant="secondary"
                size="sm"
                icon={<Plus className="h-3.5 w-3.5" />}
                onClick={() => setEditing('new')}
              >
                Add a contact
              </WriteButton>
            )
          }
        />
        {contacts.length === 0 ? (
          <div className="p-4">
            <EmptyState
              icon={<Users className="h-5 w-5" />}
              title="No contact recorded"
              description="Nobody preparing a visit knows who to ring. Add at least the purchase contact."
              action={
                readOnly ? undefined : (
                  <WriteButton variant="primary" size="sm" onClick={() => setEditing('new')}>
                    Add a contact
                  </WriteButton>
                )
              }
            />
          </div>
        ) : (
          <div className="divide-y divide-paper-200">
            {[...byDepartment, ...(other.length ? [{ dept: 'Other', people: other }] : [])].map((group) => (
              <div key={group.dept} className="px-4 py-3">
                <p className="text-2xs font-semibold uppercase tracking-wider text-ink-500">{group.dept}</p>
                <ul className="mt-1.5 space-y-1">
                  {group.people.map((c) => (
                    <li key={c.id} className="flex flex-wrap items-center gap-x-3 gap-y-1">
                      <Avatar name={c.fullName} size="sm" />
                      <span className="min-w-0 flex-1">
                        <span className="flex items-center gap-1.5">
                          <span className="truncate text-sm font-medium text-ink-900">{c.fullName}</span>
                          {c.isPrimary ? <Badge tone="accent">Primary</Badge> : null}
                        </span>
                        <span className="block truncate text-xs text-ink-500">{c.designation ?? '—'}</span>
                      </span>
                      {c.email ? (
                        <a
                          href={`mailto:${c.email}`}
                          className="flex items-center gap-1 text-xs text-ink-600 hover:text-accent-700"
                        >
                          <Mail className="h-3 w-3" />
                          <span className="truncate">{c.email}</span>
                        </a>
                      ) : null}
                      {c.phone ? (
                        <span className="flex items-center gap-1 text-xs tabular text-ink-600">
                          <Phone className="h-3 w-3" />
                          {c.phone}
                        </span>
                      ) : null}
                      {readOnly ? null : (
                        <WriteButton variant="ghost" size="sm" onClick={() => setEditing(c)}>
                          Edit
                        </WriteButton>
                      )}
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        )}
      </Panel>

      {editing ? (
        <ContactDialog
          clientId={clientId}
          sites={sites}
          contact={editing === 'new' ? null : editing}
          onClose={() => setEditing(null)}
        />
      ) : null}
    </>
  )
}

function ContactDialog({
  clientId,
  sites,
  contact,
  onClose,
}: {
  clientId: string
  sites: CompanySite[]
  contact: CompanyContact | null
  onClose: () => void
}) {
  const [fullName, setFullName] = React.useState(contact?.fullName ?? '')
  const [department, setDepartment] = React.useState(contact?.department ?? 'Purchase')
  const [designation, setDesignation] = React.useState(contact?.designation ?? '')
  const [email, setEmail] = React.useState(contact?.email ?? '')
  const [phone, setPhone] = React.useState(contact?.phone ?? '')
  const [siteId, setSiteId] = React.useState(contact?.siteId ?? '')
  const [isPrimary, setIsPrimary] = React.useState(contact?.isPrimary ?? false)
  const [busy, setBusy] = React.useState(false)

  const save = async () => {
    if (!fullName.trim()) return
    setBusy(true)
    const payload = {
      siteId: siteId || null,
      fullName: fullName.trim(),
      designation: designation.trim() || null,
      department,
      email: email.trim() || null,
      phone: phone.trim() || null,
      isPrimary,
    }
    const ok = await runAction(
      async () => {
        if (contact) await updateContact(contact.id, payload)
        else await createContact({ companyId: clientId, ...payload })
        return true
      },
      { success: contact ? `${payload.fullName} updated.` : `${payload.fullName} added.` },
    )
    setBusy(false)
    if (ok !== null) onClose()
  }

  return (
    <Dialog
      open
      onOpenChange={(open) => (open ? undefined : onClose())}
      title={contact ? `Edit ${contact.fullName}` : 'Add a contact'}
      description="One contact per company can be primary. Marking a new one primary clears the old flag."
      footer={
        <>
          <Button variant="ghost" size="sm" onClick={onClose}>
            Cancel
          </Button>
          <Button variant="primary" size="sm" loading={busy} disabled={!fullName.trim()} onClick={() => void save()}>
            {contact ? 'Save changes' : 'Add contact'}
          </Button>
        </>
      }
    >
      <div className="space-y-3.5">
        <FormGrid>
          <FormRow label="Full name" required>
            <Input value={fullName} onChange={(e) => setFullName(e.target.value)} autoFocus />
          </FormRow>
          <FormRow label="Department" required>
            <Select
              value={department}
              onChange={setDepartment}
              options={CLIENT_DEPARTMENTS.map((d) => ({ value: d, label: d }))}
            />
          </FormRow>
        </FormGrid>
        <FormRow label="Designation">
          <Input
            value={designation}
            onChange={(e) => setDesignation(e.target.value)}
            placeholder="Deputy Manager, Purchase"
          />
        </FormRow>
        <FormGrid>
          <FormRow label="Email">
            <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
          </FormRow>
          <FormRow label="Phone">
            <Input value={phone} onChange={(e) => setPhone(e.target.value)} />
          </FormRow>
        </FormGrid>
        <FormRow label="Based at" hint="Optional. Leave blank for a company-wide contact.">
          <Select
            value={siteId}
            onChange={setSiteId}
            allowEmpty
            emptyLabel="No particular site"
            placeholder="No particular site"
            options={sites.map((s) => ({ value: s.id, label: s.name }))}
          />
        </FormRow>
        <Switch checked={isPrimary} onChange={setIsPrimary} label="Primary contact for this client" />
      </div>
    </Dialog>
  )
}

// ------------------------------------------------------------------- orders

function OrdersTab({
  loading,
  orders,
  lines,
  indents,
  commissions,
  clientName,
  readOnly,
}: {
  loading: boolean
  orders: ReturnType<typeof useDb>['clientOrders']
  lines: OrderLineStatus[]
  indents: ReturnType<typeof useDb>['indents']
  commissions: CommissionRow[]
  clientName: string
  readOnly: boolean
}) {
  if (loading) {
    return (
      <Panel>
        <SkeletonTable rows={4} cols={6} />
      </Panel>
    )
  }

  if (orders.length === 0 && indents.length === 0) {
    return (
      <Panel className="p-4">
        <EmptyState
          icon={<Truck className="h-5 w-5" />}
          title="No order from this client yet"
          description="An order can only name a source the client has already approved, so the first order follows the first approval."
          action={
            readOnly ? undefined : (
              <WriteOnly>
                <LinkButton to="/client-orders/new" variant="primary" size="sm">
                  Record a client order
                </LinkButton>
              </WriteOnly>
            )
          }
        />
      </Panel>
    )
  }

  const currency = commissions[0]?.commission.currency ?? 'USD'
  const earned = commissions.reduce(
    (sum, c) => (c.commission.status === 'WRITTEN_OFF' ? sum : sum + (c.commission.amount ?? 0)),
    0,
  )
  const received = commissions.reduce((sum, c) => sum + c.commission.receivedAmount, 0)

  return (
    <div className="space-y-4">
      <Panel>
        <PanelHeader
          title="Orders and their fulfilment"
          subtitle="Ordered, indented on the manufacturer, shipped, cleared through customs, delivered"
        />
        {orders.length === 0 ? (
          <div className="p-4">
            <EmptyState
              title="Indents exist but no client order is recorded"
              description="Older business was migrated as indents only. New business starts from a client order."
              compact
            />
          </div>
        ) : (
          <ul className="divide-y divide-paper-200">
            {orders
              .slice()
              .sort((a, b) => (a.orderDate < b.orderDate ? 1 : -1))
              .map((o) => {
                const own = lines.filter((l) => l.orderId === o.id)
                const ordered = own.reduce((s, l) => s + l.orderedQty, 0)
                const indented = own.reduce((s, l) => s + l.indentedQty, 0)
                const shipped = own.reduce((s, l) => s + l.shippedQty, 0)
                const cleared = own.reduce((s, l) => s + l.clearedQty, 0)
                const delivered = own.reduce((s, l) => s + l.deliveredQty, 0)
                const uom = own[0]?.uom ?? 'KG'
                return (
                  <li key={o.id} className="px-4 py-3">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <Link
                        to={`/client-orders/${o.id}`}
                        className="font-mono text-sm font-semibold text-ink-900 hover:text-accent-700"
                      >
                        {o.coNumber}
                      </Link>
                      <span className="flex items-center gap-1.5">
                        {o.hasOverride ? <Badge tone="warn">Override</Badge> : null}
                        <Badge tone={o.status === 'COMPLETED' ? 'ok' : o.status === 'CANCELLED' ? 'neutral' : 'outline'}>
                          {ORDER_STATUS_LABEL[o.status]}
                        </Badge>
                        <span className="text-2xs tabular text-ink-500">{fmtDate(o.orderDate)}</span>
                      </span>
                    </div>
                    <dl className="mt-2 grid grid-cols-2 gap-x-4 gap-y-1.5 sm:grid-cols-5">
                      {[
                        ['Ordered', ordered],
                        ['Indented', indented],
                        ['Shipped', shipped],
                        ['Cleared', cleared],
                        ['Delivered', delivered],
                      ].map(([label, value]) => (
                        <div key={String(label)}>
                          <dt className="text-2xs uppercase tracking-wide text-ink-500">{label}</dt>
                          <dd className="text-xs tabular text-ink-800">{fmtQty(value as number, uom)}</dd>
                        </div>
                      ))}
                    </dl>
                    <Meter value={delivered} max={Math.max(1, ordered)} className="mt-2" />
                    <p className="mt-1 text-2xs text-ink-500">
                      {pluralise(own.length, 'line')} ·{' '}
                      {ordered > 0 ? `${Math.round((delivered / ordered) * 100)}% delivered` : 'nothing shipped yet'}
                    </p>
                  </li>
                )
              })}
          </ul>
        )}
      </Panel>

      <div className="grid gap-4 lg:grid-cols-2">
        <Panel>
          <PanelHeader
            title="Indents raised for this client"
            subtitle="The orders TCL placed on manufacturers on this client's behalf"
          />
          {indents.length === 0 ? (
            <div className="p-4">
              <EmptyState title="No indent raised yet" compact />
            </div>
          ) : (
            <ul className="divide-y divide-paper-200">
              {indents
                .slice()
                .sort((a, b) => (a.orderDate < b.orderDate ? 1 : -1))
                .map((i) => (
                  <li key={i.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 px-4 py-2.5">
                    <Link
                      to={`/indents/${i.id}`}
                      className="min-w-0 flex-1 truncate font-mono text-xs font-medium text-ink-900 hover:text-accent-700"
                    >
                      {i.indentNumber}
                    </Link>
                    <span className="flex items-center gap-1 text-xs text-ink-600">
                      <Building2 className="h-3 w-3 text-ink-400" />
                      <span className="truncate">
                        {commissions.find((c) => c.indent.id === i.id)?.manufacturerName ?? '—'}
                      </span>
                    </span>
                    <Badge tone={i.status === 'COMPLETED' ? 'ok' : 'outline'}>{ORDER_STATUS_LABEL[i.status]}</Badge>
                    <span className="text-2xs tabular text-ink-500">{fmtDate(i.orderDate)}</span>
                  </li>
                ))}
            </ul>
          )}
        </Panel>

        <Panel>
          <PanelHeader title="What TCL earns from this client" subtitle="Commission on the indents above" />
          <div className="space-y-3 p-4">
            <p className="text-xs leading-relaxed text-ink-700">
              TCL does not buy the goods and sell them on. It raises an indent on the manufacturer for{' '}
              {clientName}, and earns a commission from the client on the value of that indent. The client pays the
              manufacturer directly, so there is no TCL selling price anywhere on this page.
            </p>
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="rounded border border-paper-300 bg-paper-50 p-2.5">
                <p className="text-2xs font-semibold uppercase tracking-wider text-ink-500">Earned</p>
                <p className="mt-0.5 text-lg font-semibold tabular text-ink-900">
                  {fmtMoney(earned, currency, { decimals: 0 })}
                </p>
              </div>
              <div className="rounded border border-paper-300 bg-paper-50 p-2.5">
                <p className="text-2xs font-semibold uppercase tracking-wider text-ink-500">Received</p>
                <p className="mt-0.5 text-lg font-semibold tabular text-ink-900">
                  {fmtMoney(received, currency, { decimals: 0 })}
                </p>
              </div>
            </div>
            {commissions.length === 0 ? (
              <p className="text-xs text-ink-500">No commission recorded against this client yet.</p>
            ) : (
              <ul className="space-y-1">
                {commissions.map((c) => (
                  <li key={c.commission.id} className="flex flex-wrap items-center gap-x-2.5 gap-y-1 text-xs">
                    <Receipt className="h-3 w-3 shrink-0 text-ink-400" />
                    <Link
                      to={`/indents/${c.indent.id}`}
                      className="min-w-0 flex-1 truncate font-mono text-ink-800 hover:text-accent-700"
                    >
                      {c.indent.indentNumber}
                    </Link>
                    <span className="tabular text-ink-800">
                      {fmtMoney(c.commission.amount, c.commission.currency, { decimals: 0 })}
                    </span>
                    <Badge tone={c.commission.status === 'RECEIVED' ? 'ok' : 'outline'}>
                      {COMMISSION_STATUS_LABEL[c.commission.status]}
                    </Badge>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </Panel>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------- documents

function DocumentsTab({
  loading,
  rows,
  clientName,
}: {
  loading: boolean
  rows: DocumentRow[]
  clientName: string
}) {
  if (loading) {
    return (
      <Panel>
        <SkeletonTable rows={3} cols={4} />
      </Panel>
    )
  }

  if (rows.length === 0) {
    return (
      <Panel className="p-4">
        <EmptyState
          icon={<FileText className="h-5 w-5" />}
          title="No document filed against this client"
          description={`Approval letters appear here as soon as ${clientName} approves a source. Agreements and correspondence can be filed against the company itself.`}
          compact
        />
      </Panel>
    )
  }

  return (
    <Panel>
      <PanelHeader
        title="Documents"
        subtitle="Filed against the company, plus the approval letters on its engagements"
      />
      <ul className="divide-y divide-paper-200">
        {rows.map((d) => (
          <li key={d.document.id} className="flex items-center gap-3 px-4 py-2.5">
            <FileText className="h-4 w-4 shrink-0 text-ink-400" />
            <span className="min-w-0 flex-1">
              <span className="block truncate text-sm text-ink-900">{d.document.title}</span>
              <span className="block truncate text-xs text-ink-500">
                {documentTypeName(d.document.typeCode)} · uploaded {fmtDate(d.document.uploadedAt)}
                {d.document.referenceNumber ? ` · ${d.document.referenceNumber}` : ''}
              </span>
            </span>
            {d.parentHref ? (
              <Link to={d.parentHref} className="hidden truncate text-xs text-accent-700 underline sm:block">
                {d.parentLabel}
              </Link>
            ) : null}
            {d.state === 'expired' ? (
              <Badge tone="danger">Expired</Badge>
            ) : d.state === 'expiring' ? (
              <Badge tone="warn">Expires {fmtDate(d.document.expiresOn)}</Badge>
            ) : null}
          </li>
        ))}
      </ul>
    </Panel>
  )
}

// ----------------------------------------------------------------- activity

function ActivityTab({
  loading,
  activities,
  clientId,
  readOnly,
}: {
  loading: boolean
  activities: ReturnType<typeof useDb>['activities']
  clientId: string
  readOnly: boolean
}) {
  const db = useDb()
  const navigate = useNavigate()
  const [logging, setLogging] = React.useState(false)

  if (loading) {
    return (
      <Panel>
        <SkeletonTable rows={5} cols={3} />
      </Panel>
    )
  }

  return (
    <>
      <Panel>
        <PanelHeader
          title="Activity"
          subtitle="Calls, meetings, emails and visits against this client and its engagements, newest first"
          actions={
            readOnly ? null : (
              <WriteButton
                variant="secondary"
                size="sm"
                icon={<Plus className="h-3.5 w-3.5" />}
                onClick={() => setLogging(true)}
              >
                Log an activity
              </WriteButton>
            )
          }
        />
        {activities.length === 0 ? (
          <div className="p-4">
            <EmptyState
              icon={<CalendarClock className="h-5 w-5" />}
              title="Nothing logged yet"
              description="A short note after each call is what makes the next visit easy to prepare."
              action={
                readOnly ? undefined : (
                  <WriteButton variant="primary" size="sm" onClick={() => setLogging(true)}>
                    Log an activity
                  </WriteButton>
                )
              }
            />
          </div>
        ) : (
          <ul className="divide-y divide-paper-200">
            {activities.slice(0, 60).map((a) => {
              const engagement = a.entityType === 'ENGAGEMENT' ? db.engagements.find((e) => e.id === a.entityId) : undefined
              const product = engagement ? db.products.find((p) => p.id === engagement.productId) : undefined
              return (
                <li key={a.id} className="px-4 py-2.5">
                  <div className="flex flex-wrap items-baseline gap-x-2.5 gap-y-1">
                    <Badge tone="outline">
                      {ACTIVITY_KINDS.find((k) => k.value === a.kind)?.label ?? a.kind}
                    </Badge>
                    <span className="min-w-0 flex-1 text-sm text-ink-900">{a.subject}</span>
                    {engagement && product ? (
                      <button
                        onClick={() => navigate(`/engagements/${engagement.id}`)}
                        className="text-2xs text-accent-700 underline"
                      >
                        {product.genericName}
                      </button>
                    ) : null}
                    <span className="text-2xs tabular text-ink-400">{fmtDateTime(a.occurredAt)}</span>
                    <span className="text-2xs text-ink-500">{userName(db, a.createdByUserId)}</span>
                  </div>
                  {a.body ? <p className="mt-0.5 text-xs leading-relaxed text-ink-600">{a.body}</p> : null}
                  {a.followUpDate ? (
                    <p className="mt-0.5 text-2xs text-ink-500">
                      Follow up {fmtDate(a.followUpDate)}
                      {a.isCompleted ? ' · done' : ''}
                    </p>
                  ) : null}
                </li>
              )
            })}
          </ul>
        )}
      </Panel>

      {logging ? <ActivityDialog clientId={clientId} onClose={() => setLogging(false)} /> : null}
    </>
  )
}

function ActivityDialog({ clientId, onClose }: { clientId: string; onClose: () => void }) {
  const db = useDb()
  const contacts = db.contacts.filter((c) => c.companyId === clientId && c.isActive)
  const [kind, setKind] = React.useState<ActivityKind>('CALL')
  const [subject, setSubject] = React.useState('')
  const [body, setBody] = React.useState('')
  const [occurredAt, setOccurredAt] = React.useState(new Date().toISOString().slice(0, 10))
  const [contactId, setContactId] = React.useState('')
  const [followUpDate, setFollowUpDate] = React.useState('')
  const [busy, setBusy] = React.useState(false)

  const save = async () => {
    if (!subject.trim()) return
    setBusy(true)
    const ok = await runAction(
      () =>
        logActivity({
          kind,
          entityType: 'COMPANY',
          entityId: clientId,
          subject: subject.trim(),
          body: body.trim() || null,
          occurredAt: new Date(occurredAt).toISOString(),
          contactId: contactId || null,
          followUpDate: followUpDate || null,
          isCompleted: !followUpDate,
        }),
      { success: 'Activity logged.' },
    )
    setBusy(false)
    if (ok !== null) onClose()
  }

  return (
    <Dialog
      open
      onOpenChange={(open) => (open ? undefined : onClose())}
      title="Log an activity"
      description="A short record of what happened, so the next person picking this up is not starting cold."
      footer={
        <>
          <Button variant="ghost" size="sm" onClick={onClose}>
            Cancel
          </Button>
          <Button variant="primary" size="sm" loading={busy} disabled={!subject.trim()} onClick={() => void save()}>
            Log it
          </Button>
        </>
      }
    >
      <div className="space-y-3.5">
        <FormGrid>
          <FormRow label="Kind" required>
            <Select
              value={kind}
              onChange={(v) => setKind(v as ActivityKind)}
              options={ACTIVITY_KINDS.map((k) => ({ value: k.value, label: k.label }))}
            />
          </FormRow>
          <FormRow label="When" required>
            <DateInput value={occurredAt} onChange={(e) => setOccurredAt(e.target.value)} />
          </FormRow>
        </FormGrid>
        <FormRow label="Subject" required hint="One line, as it will appear in the list.">
          <Input
            value={subject}
            onChange={(e) => setSubject(e.target.value)}
            autoFocus
            placeholder="Discussed the sample feedback with QA"
          />
        </FormRow>
        <FormRow label="Detail">
          <Textarea value={body} onChange={(e) => setBody(e.target.value)} rows={3} />
        </FormRow>
        <FormGrid>
          <FormRow label="Who it was with" hint="Optional.">
            <Select
              value={contactId}
              onChange={setContactId}
              allowEmpty
              emptyLabel="Not recorded"
              placeholder="Not recorded"
              options={contacts.map((c) => ({
                value: c.id,
                label: c.fullName,
                description: c.department ?? undefined,
              }))}
            />
          </FormRow>
          <FormRow label="Follow up on" hint="Leave blank if nothing is outstanding.">
            <DateInput value={followUpDate} onChange={(e) => setFollowUpDate(e.target.value)} />
          </FormRow>
        </FormGrid>
      </div>
    </Dialog>
  )
}
