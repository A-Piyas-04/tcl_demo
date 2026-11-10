/**
 * Product detail: the molecule, every manufacturer who makes it, and every
 * client engaged on it (FR-M3-06). This is one leg of the three-way pivot.
 */

import * as React from 'react'
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom'
import {
  Archive,
  ArchiveRestore,
  Building2,
  FileText,
  FlaskConical,
  History,
  Pencil,
  Tag,
  Users,
} from 'lucide-react'
import { useDb } from '@/data/store'
import {
  companyName,
  documentRows,
  engagementRows,
  sourceRows,
  userName,
  type SourceRow,
} from '@/data/selectors'
import { PRODUCT_CATEGORY_LABEL, STAGE_LABEL } from '@/data/reference'
import { archiveProduct, restoreProduct } from '@/data/api'
import { runAction, useAsyncData } from '@/lib/hooks'
import { fmtDate, fmtMoney, fmtQty, pluralise } from '@/lib/utils'
import type { EngagementStage } from '@/data/types'
import {
  AgeingFlag,
  Badge,
  Button,
  Column,
  ConfirmDialog,
  Count,
  DataTable,
  EmptyState,
  Field,
  FieldGrid,
  FilingDot,
  LinkButton,
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

export function ProductDetail() {
  const { id = '' } = useParams()
  const db = useDb()
  const navigate = useNavigate()
  const [params, setParams] = useSearchParams()
  const [confirmArchive, setConfirmArchive] = React.useState(false)
  const [busy, setBusy] = React.useState(false)

  const product = db.products.find((p) => p.id === id)

  const { data, loading } = useAsyncData(
    () => ({
      sources: sourceRows(db, { productId: id }),
      engagements: engagementRows(db, { productId: id }),
      documents: documentRows(db, { entityType: 'PRODUCT', entityId: id }),
      requirements: db.requirements.filter((r) => r.productId === id),
    }),
    [id],
  )

  if (!product) return <NotFound />

  const tab = params.get('tab') ?? 'sources'
  const setTab = (value: string) => {
    const next = new URLSearchParams(params)
    next.set('tab', value)
    setParams(next, { replace: true })
  }

  const portfolioCount = data?.sources.filter((s) => s.inPortfolio).length ?? 0
  const clientCount = new Set((data?.engagements ?? []).map((e) => e.client.id)).size

  return (
    <div className="space-y-4">
      <PageHeading
        title={product.genericName}
        subtitle={product.description ?? undefined}
        meta={
          <>
            <Badge tone={product.category === 'API' ? 'accent' : 'neutral'}>
              {PRODUCT_CATEGORY_LABEL[product.category]}
            </Badge>
            {product.casNumber ? (
              <Badge tone="outline">
                <span className="font-mono">CAS {product.casNumber}</span>
              </Badge>
            ) : null}
            {!product.isActive ? <Badge tone="warn">Discontinued</Badge> : null}
            {product.therapeuticCategories.map((t) => (
              <Badge key={t} tone="neutral">
                {t}
              </Badge>
            ))}
          </>
        }
        actions={
          <WriteOnly>
            <LinkButton to={`/products/${id}/edit`} variant="secondary" size="md" icon={<Pencil className="h-3.5 w-3.5" />}>
              Edit
            </LinkButton>
            {product.isActive ? (
              <Button
                variant="ghost"
                size="md"
                icon={<Archive className="h-3.5 w-3.5" />}
                onClick={() => setConfirmArchive(true)}
              >
                Discontinue
              </Button>
            ) : (
              <Button
                variant="secondary"
                size="md"
                icon={<ArchiveRestore className="h-3.5 w-3.5" />}
                loading={busy}
                onClick={() =>
                  void runAction(() => restoreProduct(id), { success: `${product.genericName} is active again.` })
                }
              >
                Restore
              </Button>
            )}
          </WriteOnly>
        }
      />

      {/* summary strip as discrete cells, not one wide band */}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Panel className="p-3.5">
          <p className="text-2xs font-semibold uppercase tracking-wider text-ink-500">Sources known</p>
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
          <p className="text-2xs font-semibold uppercase tracking-wider text-ink-500">Default unit</p>
          <p className="mt-1 text-2xl font-semibold text-ink-900">{product.defaultUom}</p>
          <p className="mt-0.5 text-xs text-ink-500">{product.hsCode ? `HS ${product.hsCode}` : 'No HS code recorded'}</p>
        </Panel>
        <Panel className="p-3.5">
          <p className="text-2xs font-semibold uppercase tracking-wider text-ink-500">Open requirements</p>
          <p className="mt-1 text-2xl font-semibold tabular text-ink-900">
            {(data?.requirements ?? []).filter((r) => ['OPEN', 'SOURCING', 'ENGAGED'].includes(r.status)).length || '—'}
          </p>
          <p className="mt-0.5 text-xs text-ink-500">{pluralise(data?.requirements.length ?? 0, 'enquiry')} in total</p>
        </Panel>
      </div>

      {product.synonyms.length ? (
        <Panel className="flex flex-wrap items-center gap-2 px-4 py-3">
          <span className="flex items-center gap-1.5 text-xs font-medium text-ink-500">
            <Tag className="h-3.5 w-3.5" />
            Also known as
          </span>
          {product.synonyms.map((s) => (
            <Badge key={s} tone="outline">
              {s}
            </Badge>
          ))}
        </Panel>
      ) : null}

      <Tabs value={tab} onValueChange={setTab}>
        <TabList>
          <Tab value="sources">
            Manufacturers
            <Count value={data?.sources.length ?? 0} active={tab === 'sources'} />
          </Tab>
          <Tab value="clients">
            Clients &amp; engagements
            <Count value={data?.engagements.length ?? 0} active={tab === 'clients'} />
          </Tab>
          <Tab value="prices">Prices</Tab>
          <Tab value="documents">
            Documents
            <Count value={data?.documents.length ?? 0} active={tab === 'documents'} />
          </Tab>
          <Tab value="requirements">
            Requirements
            <Count value={data?.requirements.length ?? 0} active={tab === 'requirements'} />
          </Tab>
        </TabList>

        <div className="pt-4">
          <TabPanel value="sources">
            <SourcesTab loading={loading} sources={data?.sources ?? []} productName={product.genericName} />
          </TabPanel>

          <TabPanel value="clients">
            <ClientsTab loading={loading} rows={data?.engagements ?? []} />
          </TabPanel>

          <TabPanel value="prices">
            <PricesTab loading={loading} sources={data?.sources ?? []} />
          </TabPanel>

          <TabPanel value="documents">
            <Panel>
              <PanelHeader title="Documents on the molecule" subtitle="Specifications and general files. Plant certificates live on the manufacturer's site; COAs on the batch." />
              {loading ? (
                <SkeletonTable rows={3} cols={4} />
              ) : data!.documents.length === 0 ? (
                <div className="p-4">
                  <EmptyState
                    icon={<FileText className="h-5 w-5" />}
                    title="No documents filed against the molecule itself"
                    description="Regulatory filings are held per source. Open a manufacturer below to see its DMF, CEP and plant certificates."
                    compact
                  />
                </div>
              ) : (
                <ul className="divide-y divide-paper-200">
                  {data!.documents.map((d) => (
                    <li key={d.document.id} className="flex items-center gap-3 px-4 py-2.5">
                      <FileText className="h-4 w-4 shrink-0 text-ink-400" />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm text-ink-900">{d.document.title}</span>
                        <span className="block truncate text-xs text-ink-500">
                          {d.document.typeCode} · uploaded {fmtDate(d.document.uploadedAt)}
                        </span>
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </Panel>
          </TabPanel>

          <TabPanel value="requirements">
            <RequirementsTab loading={loading} requirements={data?.requirements ?? []} />
          </TabPanel>
        </div>
      </Tabs>

      <ConfirmDialog
        open={confirmArchive}
        onOpenChange={setConfirmArchive}
        title="Discontinue this product?"
        recordName={product.genericName}
        consequence="It stays in every historical record and report; it simply stops being offered for new work. Nothing is deleted."
        confirmLabel="Discontinue"
        loading={busy}
        onConfirm={async () => {
          setBusy(true)
          const ok = await runAction(() => archiveProduct(id), {
            success: `${product.genericName} marked discontinued.`,
            undo: () => void restoreProduct(id),
          })
          setBusy(false)
          setConfirmArchive(false)
          if (ok !== null) navigate('/products')
        }}
      />
    </div>
  )
}

function SourcesTab({
  loading,
  sources,
  productName: molecule,
}: {
  loading: boolean
  sources: SourceRow[]
  productName: string
}) {
  const navigate = useNavigate()
  const { id: productId = '' } = useParams()
  const represented = sources.filter((s) => s.inPortfolio)
  const known = sources.filter((s) => !s.inPortfolio)

  const columns: Column<SourceRow>[] = [
    {
      key: 'manufacturer',
      header: 'Manufacturer',
      pinned: true,
      sortable: true,
      value: (r) => r.manufacturer.displayName,
      cell: (r) => (
        <NameCell
          title={r.manufacturer.displayName}
          subtitle={`${r.site?.name ?? 'Plant not recorded'} · ${r.manufacturer.countryCode}`}
        />
      ),
    },
    {
      key: 'grade',
      header: 'Grade & standard',
      sortable: true,
      value: (r) => `${r.mp.grade} ${r.mp.pharmacopoeia}`,
      cell: (r) => (
        <span className="text-sm text-ink-800">
          {r.mp.grade}
          <span className="ml-1.5 font-mono text-2xs text-ink-500">{r.mp.pharmacopoeia}</span>
        </span>
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
          <Tooltip
            content={`${r.priceTiers.length} valid tier${r.priceTiers.length === 1 ? '' : 's'} · expires ${fmtDate(r.earliestPriceExpiry)}`}
          >
            <span className="text-sm tabular text-ink-900">
              {fmtMoney(tier.price, tier.currency, { decimals: 0 })}
              <span className="text-2xs text-ink-400">/{tier.perUom} {tier.incoterm}</span>
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
      key: 'lead',
      header: 'Lead time',
      align: 'right',
      width: '6.5rem',
      value: (r) => r.mp.leadTimeDays,
      cell: (r) => <span className="text-xs tabular text-ink-600">{r.mp.leadTimeDays ? `${r.mp.leadTimeDays}d` : '—'}</span>,
    },
    {
      key: 'clients',
      header: 'Clients',
      align: 'right',
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
          icon={<Building2 className="h-5 w-5" />}
          title="No manufacturer is linked to this molecule yet"
          description={`Nobody in the register makes ${molecule}. Sourcing can register a manufacturer and add it, or record the demand so it appears on the shopping list.`}
          action={
            <WriteOnly>
              <LinkButton to="/manufacturers/new" variant="primary" size="sm">
                Register a manufacturer
              </LinkButton>
            </WriteOnly>
          }
          secondary={
            <LinkButton to={`/requirements/new?product=${productId}`} variant="ghost" size="sm">
              Record a client requirement
            </LinkButton>
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
          actions={<Badge tone="accent">{represented.length}</Badge>}
        />
        <DataTable
          rows={represented}
          columns={columns}
          rowKey={(r) => r.mp.id}
          onRowClick={(r) => navigate(`/sources/${r.mp.id}`)}
          pageSize={12}
          exportName={`${molecule}-represented-sources`}
          empty={<EmptyState title="None of the known sources are represented yet" compact />}
        />
      </Panel>

      {known.length > 0 ? (
        <Panel>
          <PanelHeader
            title="Known sources, not represented"
            subtitle="Market intelligence — these cannot be offered until TCL takes them into the portfolio"
            actions={<Badge tone="outline">{known.length}</Badge>}
          />
          <DataTable
            rows={known}
            columns={columns}
            rowKey={(r) => r.mp.id}
            onRowClick={(r) => navigate(`/sources/${r.mp.id}`)}
            pageSize={8}
            dense
          />
        </Panel>
      ) : null}
    </div>
  )
}

function ClientsTab({ loading, rows }: { loading: boolean; rows: ReturnType<typeof engagementRows> }) {
  const navigate = useNavigate()
  const db = useDb()
  const { id: productId = '' } = useParams()

  // group by client so dual sourcing reads clearly
  const grouped = React.useMemo(() => {
    const map = new Map<string, typeof rows>()
    for (const r of rows) {
      const list = map.get(r.client.id) ?? []
      list.push(r)
      map.set(r.client.id, list)
    }
    return [...map.entries()].sort((a, b) =>
      companyName(db, a[0]).localeCompare(companyName(db, b[0])),
    )
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
          title="No client is engaged on this molecule"
          description="Once a requirement is matched to a source, the engagement appears here with its stage."
          action={
            <WriteOnly>
              <LinkButton to={`/requirements/new?product=${productId}`} variant="primary" size="sm">
                Record a requirement
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
        title="Clients engaged on this molecule"
        subtitle="Grouped by client, so a client taking it from two sources is obvious"
      />
      <ul className="divide-y divide-paper-200">
        {grouped.map(([clientId, list]) => (
          <li key={clientId} className="px-4 py-3">
            <div className="flex items-center justify-between gap-3">
              <Link to={`/clients/${clientId}`} className="text-sm font-semibold text-ink-900 hover:text-accent-700">
                {list[0]!.client.displayName}
              </Link>
              {list.length > 1 ? (
                <Tooltip content="This client takes the same molecule from more than one source — normal, and regulator-encouraged.">
                  <Badge tone="accent">Dual sourced · {list.length}</Badge>
                </Tooltip>
              ) : null}
            </div>
            <ul className="mt-2 space-y-1">
              {list.map((r) => (
                <li key={r.engagement.id}>
                  <button
                    onClick={() => navigate(`/engagements/${r.engagement.id}`)}
                    className="flex w-full items-center gap-3 rounded border border-transparent px-2 py-1.5 text-left transition-colors hover:border-paper-300 hover:bg-paper-100"
                  >
                    <span className="min-w-0 flex-1 truncate text-sm text-ink-800">{r.manufacturer.displayName}</span>
                    <span className="hidden font-mono text-2xs text-ink-500 sm:inline">
                      {r.mp.grade} · {r.mp.pharmacopoeia}
                    </span>
                    <StageBadge stage={r.stage} size="sm" />
                    <AgeingFlag days={r.daysInStage} threshold={60} />
                  </button>
                </li>
              ))}
            </ul>
          </li>
        ))}
      </ul>
    </Panel>
  )
}

function PricesTab({ loading, sources }: { loading: boolean; sources: SourceRow[] }) {
  const withPrices = sources.filter((s) => s.priceTiers.length > 0)
  if (loading) {
    return (
      <Panel>
        <SkeletonTable rows={4} cols={5} />
      </Panel>
    )
  }
  if (withPrices.length === 0) {
    return (
      <Panel className="p-4">
        <EmptyState
          icon={<FlaskConical className="h-5 w-5" />}
          title="No currently valid price for any source"
          description="A source with an expired price stays in the portfolio but cannot be offered until the price is renewed."
          compact
        />
      </Panel>
    )
  }
  return (
    <Panel>
      <PanelHeader title="Valid prices today" subtitle="Each source can hold several tiers and incoterms at once" />
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-paper-300 bg-paper-100/70">
            <th className="th">Manufacturer</th>
            <th className="th">Grade</th>
            <th className="th">Incoterm</th>
            <th className="th text-right">From quantity</th>
            <th className="th text-right">Price</th>
            <th className="th text-right">Valid to</th>
          </tr>
        </thead>
        <tbody>
          {withPrices.flatMap((s) =>
            s.priceTiers.map((tier) => (
              <tr key={tier.id} className="border-b border-paper-200 last:border-0 hover:bg-paper-100/70">
                <td className="cell">
                  <Link to={`/sources/${s.mp.id}`} className="font-medium text-ink-900 hover:text-accent-700">
                    {s.manufacturer.displayName}
                  </Link>
                </td>
                <td className="cell text-ink-700">{s.mp.grade}</td>
                <td className="cell font-mono text-xs">{tier.incoterm}</td>
                <td className="cell text-right tabular">{fmtQty(tier.minQty, tier.perUom)}</td>
                <td className="cell text-right font-medium tabular">
                  {fmtMoney(tier.price, tier.currency)}/{tier.perUom}
                </td>
                <td className="cell text-right tabular text-ink-600">{fmtDate(tier.validTo)}</td>
              </tr>
            )),
          )}
        </tbody>
      </table>
    </Panel>
  )
}

function RequirementsTab({
  loading,
  requirements,
}: {
  loading: boolean
  requirements: ReturnType<typeof useDb>['requirements']
}) {
  const db = useDb()
  const navigate = useNavigate()
  if (loading) {
    return (
      <Panel>
        <SkeletonTable rows={4} cols={5} />
      </Panel>
    )
  }
  if (requirements.length === 0) {
    return (
      <Panel className="p-4">
        <EmptyState icon={<History className="h-5 w-5" />} title="No client has asked for this molecule yet" compact />
      </Panel>
    )
  }
  return (
    <Panel>
      <PanelHeader title="Enquiries for this molecule" subtitle="New developments and alternate-source requests" />
      <ul className="divide-y divide-paper-200">
        {requirements
          .slice()
          .sort((a, b) => (a.enquiryDate < b.enquiryDate ? 1 : -1))
          .map((r) => (
            <li key={r.id}>
              <button
                onClick={() => navigate(`/requirements/${r.id}`)}
                className="flex w-full flex-wrap items-center gap-x-3 gap-y-1 px-4 py-2.5 text-left transition-colors hover:bg-paper-100"
              >
                <span className="min-w-0 flex-1 truncate text-sm font-medium text-ink-900">
                  {companyName(db, r.clientCompanyId)}
                </span>
                <Badge tone={r.kind === 'NEW_DEVELOPMENT' ? 'info' : 'accent'}>
                  {r.kind === 'NEW_DEVELOPMENT' ? 'New development' : 'Alternate source'}
                </Badge>
                {r.requiredPharmacopoeia ? <Badge tone="outline">{r.requiredPharmacopoeia}</Badge> : null}
                <span className="text-xs text-ink-500">{fmtQty(r.estAnnualQty, r.qtyUom)}/year</span>
                <span className="w-24 text-right text-xs tabular text-ink-400">{fmtDate(r.enquiryDate)}</span>
                <span className="w-20 text-right text-xs text-ink-500">{userName(db, r.ownerUserId)}</span>
              </button>
            </li>
          ))}
      </ul>
    </Panel>
  )
}

export { Field, FieldGrid, STAGE_LABEL }
export type { EngagementStage }
