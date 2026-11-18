/**
 * Product 2.0 — API details: the molecule, its manufacturer sources with
 * sample rounds and the sourcing track, and its client bulk orders.
 */

import * as React from 'react'
import { useNavigate, useParams, useSearchParams } from 'react-router-dom'
import {
  Archive,
  ArchiveRestore,
  Building2,
  CheckCircle2,
  FlaskConical,
  MoreHorizontal,
  Pencil,
  Plus,
  RotateCcw,
  ShoppingCart,
  Trash2,
  Truck,
  XCircle,
} from 'lucide-react'
import { runAction } from '@/lib/hooks'
import { fmtDate, pluralise } from '@/lib/utils'
import {
  Badge,
  Button,
  type Column,
  ConfirmDialog,
  Count,
  DataTable,
  EmptyState,
  Field,
  FieldGrid,
  FilingDot,
  Menu,
  MenuContent,
  MenuItem,
  MenuTrigger,
  PageHeading,
  Panel,
  PanelHeader,
  SkeletonTable,
  Tab,
  TabList,
  TabPanel,
  Tabs,
  WriteOnly,
} from '@/components/ui'
import { NotFound } from '@/features/misc/Fallbacks'
import { deleteSourcing, reopenSample, setApiActive, useP2 } from './store'
import {
  SampleStatusBadge,
  SourcingStatusBadge,
  TradeMiniBar,
  TradeStatusBadge,
  WorkflowTrack,
  partyName,
  useFirstLoad,
} from './components'
import { ApiFormDialog, DecisionDialog, SampleDialog, SourcingDialog } from './sourcingDialogs'
import { OrderDialog } from './tradeDialogs'
import { dec, fmtDecMoney, fmtDecQty } from './decimal'
import {
  apiSourcingStatus,
  currentTradeStage,
  orderFinancials,
  samplesFor,
  sourcingStatus,
  sourcingSteps,
  totalsByCurrency,
  tradeBundle,
  type TradeBundle,
} from './workflow'
import type { P2Data, Party, SampleRecord, SourcingRecord } from './types'

export function P2Detail() {
  const { apiId = '' } = useParams()
  const data = useP2()
  const navigate = useNavigate()
  const loading = useFirstLoad()
  const [params, setParams] = useSearchParams()
  const [editing, setEditing] = React.useState(false)
  const [archiving, setArchiving] = React.useState(false)
  const [busy, setBusy] = React.useState(false)
  const [addingSource, setAddingSource] = React.useState(false)
  const [addingOrder, setAddingOrder] = React.useState(false)

  const api = data.apiProducts.find((a) => a.id === apiId)
  if (!api) return <NotFound />

  const tab = params.get('tab') ?? 'sourcing'
  const setTab = (value: string) => {
    const next = new URLSearchParams(params)
    next.set('tab', value)
    setParams(next, { replace: true })
  }

  const sources = data.sourcing.filter((s) => s.apiProductId === api.id).sort((a, b) => (a.identifiedOn < b.identifiedOn ? -1 : 1))
  const bundles = data.tradeOrders
    .filter((o) => o.apiProductId === api.id)
    .sort((a, b) => (a.orderDate < b.orderDate ? 1 : -1))
    .map((o) => tradeBundle(data, o))
  const status = apiSourcingStatus(data, api.id)
  const accepted = sources.filter((s) => sourcingStatus(data, s.id) === 'ACCEPTED').length
  const open = bundles.filter((b) => currentTradeStage(b) !== null).length
  const fin = bundles.map((b) => ({ b, f: orderFinancials(b) }))
  const expected = totalsByCurrency(fin.filter((x) => x.f.receivedCommission == null).map((x) => ({ amount: x.f.expectedCommission ?? 0n, currency: x.b.order.currency })))
  const received = totalsByCurrency(fin.filter((x) => x.f.receivedCommission != null).map((x) => ({ amount: x.f.receivedCommission!, currency: x.b.order.currency })))
  const fmtTotals = (t: { amount: bigint; currency: string }[]) => (t.length ? t.map((x) => fmtDecMoney(x.amount, x.currency, 0)).join(' + ') : '—')

  return (
    <div className="space-y-4">
      <PageHeading
        title={api.name}
        subtitle={api.description ?? undefined}
        meta={
          <>
            <SourcingStatusBadge status={status} />
            {api.casNumber ? (
              <Badge tone="outline">
                <span className="font-mono">CAS {api.casNumber}</span>
              </Badge>
            ) : null}
            {api.grade ? <Badge tone="neutral">{api.grade}</Badge> : null}
            <Badge tone="neutral">{api.therapeuticArea}</Badge>
            {!api.isActive ? <Badge tone="warn">Archived</Badge> : null}
          </>
        }
        actions={
          <WriteOnly>
            <Button icon={<Pencil className="h-3.5 w-3.5" />} onClick={() => setEditing(true)}>
              Edit
            </Button>
            {api.isActive ? (
              <Button variant="ghost" icon={<Archive className="h-3.5 w-3.5" />} onClick={() => setArchiving(true)}>
                Archive
              </Button>
            ) : (
              <Button
                icon={<ArchiveRestore className="h-3.5 w-3.5" />}
                loading={busy}
                onClick={async () => {
                  setBusy(true)
                  await runAction(() => setApiActive(api.id, true), { success: `${api.name} restored.` })
                  setBusy(false)
                }}
              >
                Restore
              </Button>
            )}
          </WriteOnly>
        }
      />

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <SummaryTile label="Sources" value={`${accepted} / ${sources.length}`} sub="approved / identified" />
        <SummaryTile label="Trade orders" value={`${open} / ${bundles.length}`} sub="open / total" />
        <SummaryTile label="Commission expected" value={fmtTotals(expected)} sub="not yet received" mono />
        <SummaryTile label="Commission received" value={fmtTotals(received)} sub="confirmed receipts" mono tone="ok" />
      </div>

      <Tabs value={tab} onValueChange={setTab}>
        <TabList>
          <Tab value="sourcing">
            Sourcing <Count value={sources.length} active={tab === 'sourcing'} />
          </Tab>
          <Tab value="trade">
            Trade orders <Count value={bundles.length} active={tab === 'trade'} />
          </Tab>
          <Tab value="overview">Overview &amp; suppliers</Tab>
        </TabList>

        <TabPanel value="sourcing" className="pt-4">
          {loading ? (
            <SkeletonTable rows={4} />
          ) : (
            <div className="space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="text-sm text-ink-500">
                  Each manufacturer is sourced separately: <span className="font-medium text-ink-700">Identified → Sample submitted → Accepted / Rejected</span>.
                </p>
                <WriteOnly>
                  <Button variant="primary" size="sm" icon={<Plus className="h-3.5 w-3.5" />} disabled={!api.isActive} onClick={() => setAddingSource(true)}>
                    Add manufacturer source
                  </Button>
                </WriteOnly>
              </div>
              {sources.length === 0 ? (
                <EmptyState
                  icon={<FlaskConical className="h-5 w-5" />}
                  title="No manufacturer identified yet"
                  description="Add the first manufacturer source. Sourcing starts at Identified."
                  action={
                    <WriteOnly>
                      <Button size="sm" variant="primary" onClick={() => setAddingSource(true)} disabled={!api.isActive}>
                        Add manufacturer source
                      </Button>
                    </WriteOnly>
                  }
                />
              ) : (
                sources.map((s) => <SourceCard key={s.id} data={data} source={s} onOrder={() => { setTab('trade'); setAddingOrder(true) }} />)
              )}
            </div>
          )}
        </TabPanel>

        <TabPanel value="trade" className="pt-4">
          <Panel>
            <PanelHeader
              icon={<ShoppingCart className="h-4 w-4" />}
              title="Client bulk orders"
              subtitle="Client order → PI / Indent → LC → Shipment → Delivered → Commission"
              actions={
                <WriteOnly>
                  <Button size="sm" variant="primary" icon={<Plus className="h-3.5 w-3.5" />} disabled={!api.isActive} onClick={() => setAddingOrder(true)}>
                    New bulk order
                  </Button>
                </WriteOnly>
              }
            />
            <OrdersTable
              bundles={bundles}
              data={data}
              loading={loading}
              onOpen={(b) => navigate(`/product-2/${api.id}/orders/${b.order.id}`)}
              empty={
                <EmptyState
                  compact
                  icon={<ShoppingCart className="h-5 w-5" />}
                  title="No trade orders yet"
                  description={accepted ? 'Record the first client bulk order.' : 'Bulk orders open once a sample from one of the sources is accepted.'}
                  action={
                    accepted ? (
                      <WriteOnly>
                        <Button size="sm" variant="primary" onClick={() => setAddingOrder(true)}>
                          New bulk order
                        </Button>
                      </WriteOnly>
                    ) : (
                      <Button size="sm" onClick={() => setTab('sourcing')}>
                        Go to sourcing
                      </Button>
                    )
                  }
                />
              }
            />
          </Panel>
        </TabPanel>

        <TabPanel value="overview" className="space-y-4 pt-4">
          <Panel>
            <PanelHeader title="API information" />
            <div className="p-4">
              <FieldGrid cols={3}>
                <Field label="Name">{api.name}</Field>
                <Field label="CAS number" mono>
                  {api.casNumber ?? '—'}
                </Field>
                <Field label="Grade">{api.grade ?? '—'}</Field>
                <Field label="Therapeutic area">{api.therapeuticArea}</Field>
                <Field label="Synonyms">{api.synonyms.join(', ') || '—'}</Field>
                <Field label="Added">{fmtDate(api.createdAt)}</Field>
                {api.description ? (
                  <Field label="Notes" wrap className="col-span-2 lg:col-span-3">
                    {api.description}
                  </Field>
                ) : null}
              </FieldGrid>
            </div>
          </Panel>
          <Panel>
            <PanelHeader icon={<Building2 className="h-4 w-4" />} title="Manufacturers & intermediary suppliers" subtitle="Who makes this API and through whom TCL buys it." />
            {sources.length === 0 ? (
              <div className="p-4">
                <EmptyState compact title="No suppliers recorded" />
              </div>
            ) : (
              <div className="divide-y divide-paper-200">
                {sources.map((s) => {
                  const m = data.parties.find((p) => p.id === s.manufacturerId)
                  const i = s.intermediaryId ? data.parties.find((p) => p.id === s.intermediaryId) : null
                  return (
                    <div key={s.id} className="grid gap-4 p-4 sm:grid-cols-2">
                      <PartyBlock role="Manufacturer" party={m} extra={<SourcingStatusBadge status={sourcingStatus(data, s.id)} />} />
                      {i ? <PartyBlock role="Intermediary supplier" party={i} /> : <div className="text-sm text-ink-400 sm:pt-5">Direct from manufacturer — no intermediary.</div>}
                    </div>
                  )
                })}
              </div>
            )}
          </Panel>
        </TabPanel>
      </Tabs>

      <ApiFormDialog open={editing} onOpenChange={setEditing} existing={api} />
      <SourcingDialog open={addingSource} onOpenChange={setAddingSource} apiProductId={api.id} />
      <OrderDialog
        open={addingOrder}
        onOpenChange={setAddingOrder}
        apiProductId={api.id}
        onCreated={(id) => navigate(`/product-2/${api.id}/orders/${id}`)}
      />
      <ConfirmDialog
        open={archiving}
        onOpenChange={setArchiving}
        title="Archive this API?"
        recordName={api.name}
        consequence="It leaves the default list and no new sources or orders can be added. Its records are kept and it can be restored."
        confirmLabel="Archive"
        loading={busy}
        onConfirm={async () => {
          setBusy(true)
          await runAction(() => setApiActive(api.id, false), { success: `${api.name} archived.` })
          setBusy(false)
          setArchiving(false)
        }}
      />
    </div>
  )
}

// ---------------------------------------------------------------- pieces

function SummaryTile({ label, value, sub, mono, tone }: { label: string; value: React.ReactNode; sub: string; mono?: boolean; tone?: 'ok' }) {
  return (
    <div className={tone === 'ok' ? 'rounded-lg border border-ok-200 bg-ok-50/60 p-3 ' : 'rounded-lg border border-paper-300 bg-white p-3 '}>
      <p className="text-sm font-semibold text-ink-500">{label}</p>
 <p className={`mt-1 truncate font-semibold text-ink-900 ${mono ? 'text-sm tabular' : 'text-xl'}`}>{value}</p>
      <p className="text-sm text-ink-400">{sub}</p>
    </div>
  )
}

function PartyBlock({ role, party, extra }: { role: string; party: Party | undefined; extra?: React.ReactNode }) {
  if (!party) return null
  return (
    <div className="min-w-0 space-y-1">
      <p className="text-sm font-semibold text-ink-500">{role}</p>
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-sm font-medium text-ink-900">{party.name}</span>
        {extra}
      </div>
      <p className="text-sm text-ink-500">
        {party.country}
        {party.contactName ? ` · ${party.contactName}` : ''}
        {party.email ? ` · ${party.email}` : ''}
        {party.phone ? ` · ${party.phone}` : ''}
      </p>
    </div>
  )
}

function SourceCard({ data, source, onOrder }: { data: P2Data; source: SourcingRecord; onOrder: () => void }) {
  const [editing, setEditing] = React.useState(false)
  const [submitting, setSubmitting] = React.useState(false)
  const [deciding, setDeciding] = React.useState<{ sample: SampleRecord; initial: 'ACCEPTED' | 'REJECTED' } | null>(null)
  const [reopening, setReopening] = React.useState<SampleRecord | null>(null)
  const [removing, setRemoving] = React.useState(false)
  const [busy, setBusy] = React.useState(false)

  const status = sourcingStatus(data, source.id)
  const samples = samplesFor(data, source.id)
  const pending = samples.find((s) => s.status === 'SUBMITTED')
  const latest = samples[samples.length - 1]
  const orderCount = data.tradeOrders.filter((o) => o.sourcingId === source.id).length
  const mfr = partyName(data, source.manufacturerId)

  return (
    <Panel flush>
      <div className="flex flex-wrap items-start justify-between gap-3 border-b border-paper-200 px-4 py-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="text-sm font-semibold text-ink-900">{mfr}</h3>
            <span className="text-sm text-ink-400">{data.parties.find((p) => p.id === source.manufacturerId)?.country}</span>
            <FilingDot present={source.hasDmf} label="DMF" />
            <FilingDot present={source.hasCep} label="CEP" />
          </div>
          <p className="mt-0.5 flex flex-wrap items-center gap-x-3 text-sm text-ink-500">
            <span className="inline-flex items-center gap-1">
              <Truck className="h-3 w-3" />
              {source.intermediaryId ? `via ${partyName(data, source.intermediaryId)}` : 'Direct'}
            </span>
            {source.indicativePrice ? (
 <span className="tabular">
                Indicative {fmtDecMoney(dec(source.indicativePrice), source.priceCurrency)}/{source.priceUom}
              </span>
            ) : null}
            {orderCount ? <span>{pluralise(orderCount, 'trade order')}</span> : null}
          </p>
          {source.notes ? <p className="mt-1 text-sm text-ink-500">{source.notes}</p> : null}
        </div>
        <WriteOnly>
          <div className="flex items-center gap-1.5">
            {status === 'IDENTIFIED' || status === 'REJECTED' ? (
              <Button size="sm" variant="primary" icon={<FlaskConical className="h-3.5 w-3.5" />} onClick={() => setSubmitting(true)}>
                {status === 'REJECTED' ? `Submit round ${(latest?.roundNo ?? 0) + 1}` : 'Record sample submission'}
              </Button>
            ) : null}
            {pending ? (
              <>
                <Button size="sm" variant="primary" icon={<CheckCircle2 className="h-3.5 w-3.5" />} onClick={() => setDeciding({ sample: pending, initial: 'ACCEPTED' })}>
                  Accept
                </Button>
                <Button size="sm" variant="danger" icon={<XCircle className="h-3.5 w-3.5" />} onClick={() => setDeciding({ sample: pending, initial: 'REJECTED' })}>
                  Reject
                </Button>
              </>
            ) : null}
            {status === 'ACCEPTED' ? (
              <Button size="sm" variant="primary" icon={<ShoppingCart className="h-3.5 w-3.5" />} onClick={onOrder}>
                New bulk order
              </Button>
            ) : null}
            <Menu>
              <MenuTrigger asChild>
                <Button variant="ghost" size="icon" aria-label="Source actions">
                  <MoreHorizontal className="h-4 w-4" />
                </Button>
              </MenuTrigger>
              <MenuContent align="end">
                <MenuItem icon={<Pencil className="h-3.5 w-3.5" />} onSelect={() => setEditing(true)}>
                  Edit source
                </MenuItem>
                {latest && latest.status !== 'SUBMITTED' ? (
                  <MenuItem icon={<RotateCcw className="h-3.5 w-3.5" />} onSelect={() => setReopening(latest)}>
                    Reopen round {latest.roundNo} decision
                  </MenuItem>
                ) : null}
                {samples.length === 0 ? (
                  <MenuItem icon={<Trash2 className="h-3.5 w-3.5" />} onSelect={() => setRemoving(true)}>
                    Remove source
                  </MenuItem>
                ) : null}
              </MenuContent>
            </Menu>
          </div>
        </WriteOnly>
      </div>

      <div className="space-y-3 p-4">
        <WorkflowTrack variant="sourcing" steps={sourcingSteps(data, source)} title="Sourcing progress" aside={<SourcingStatusBadge status={status} />} />

        {samples.length ? (
          <div className="scroll-slim overflow-x-auto rounded-md border border-paper-200">
            <table className="w-full min-w-[44rem] text-left text-sm">
              <thead className="bg-paper-50 text-sm text-ink-500">
                <tr>
                  <th className="px-3 py-2 font-semibold">Round</th>
                  <th className="px-3 py-2 font-semibold">Quantity</th>
                  <th className="px-3 py-2 font-semibold">Submitted</th>
                  <th className="px-3 py-2 font-semibold">To client</th>
                  <th className="px-3 py-2 font-semibold">Courier / CoA</th>
                  <th className="px-3 py-2 font-semibold">Status</th>
                  <th className="px-3 py-2 font-semibold">Decided</th>
                  <th className="px-3 py-2 font-semibold">Reason / remarks</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-paper-200">
                {samples.map((s) => (
                  <tr key={s.id} className={s.status === 'REJECTED' ? 'bg-danger-50/40' : s.status === 'ACCEPTED' ? 'bg-ok-50/40' : undefined}>
                    <td className="px-3 py-2 font-medium text-ink-800">#{s.roundNo}</td>
 <td className="px-3 py-2 tabular text-ink-700">{fmtDecQty(dec(s.quantity), s.uom)}</td>
                    <td className="px-3 py-2 text-ink-700">{fmtDate(s.submittedOn)}</td>
                    <td className="px-3 py-2 text-ink-700">{partyName(data, s.submittedToClientId)}</td>
                    <td className="px-3 py-2 text-ink-500">
                      <span className="block font-mono">{s.courierRef ?? '—'}</span>
                      {s.coaRef ? <span className="block font-mono text-sm">CoA {s.coaRef}</span> : null}
                    </td>
                    <td className="px-3 py-2">
                      <SampleStatusBadge status={s.status} />
                    </td>
                    <td className="px-3 py-2 text-ink-700">{fmtDate(s.decidedOn)}</td>
                    <td className="max-w-[16rem] px-3 py-2 text-ink-600">
                      {s.rejectionReason ? <span className="block text-danger-700">{s.rejectionReason}</span> : null}
                      {s.decisionRemarks ? <span className="block ">{s.decisionRemarks}</span> : null}
                      {!s.rejectionReason && !s.decisionRemarks ? '—' : null}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="text-sm text-ink-400">No sample submitted yet.</p>
        )}
      </div>

      <SourcingDialog open={editing} onOpenChange={setEditing} apiProductId={source.apiProductId} existing={source} />
      <SampleDialog open={submitting} onOpenChange={setSubmitting} source={source} roundNo={(latest?.roundNo ?? 0) + 1} />
      {deciding ? (
        <DecisionDialog open onOpenChange={(o) => !o && setDeciding(null)} sample={deciding.sample} initial={deciding.initial} />
      ) : null}
      <ConfirmDialog
        open={!!reopening}
        onOpenChange={(o) => !o && setReopening(null)}
        title="Reopen this decision?"
        recordName={`${mfr} — sample round ${reopening?.roundNo ?? ''}`}
        consequence="The round goes back to awaiting a decision. Use this only to correct a decision recorded in error."
        confirmLabel="Reopen decision"
        tone="primary"
        loading={busy}
        onConfirm={async () => {
          if (!reopening) return
          setBusy(true)
          await runAction(() => reopenSample(reopening.id), { success: 'Decision reopened.' })
          setBusy(false)
          setReopening(null)
        }}
      />
      <ConfirmDialog
        open={removing}
        onOpenChange={setRemoving}
        title="Remove this source?"
        recordName={mfr}
        consequence="It has no samples, so nothing else is affected."
        confirmLabel="Remove"
        loading={busy}
        onConfirm={async () => {
          setBusy(true)
          await runAction(() => deleteSourcing(source.id), { success: `${mfr} removed.` })
          setBusy(false)
          setRemoving(false)
        }}
      />
    </Panel>
  )
}

/** Trade orders table, shared by the API page and the all-orders list. */
export function OrdersTable({
  bundles,
  data,
  loading,
  onOpen,
  empty,
  showApi,
}: {
  bundles: TradeBundle[]
  data: P2Data
  loading?: boolean
  onOpen: (b: TradeBundle) => void
  empty?: React.ReactNode
  showApi?: boolean
}) {
  const columns: Column<TradeBundle>[] = [
    {
      key: 'ref',
      header: 'Order',
      pinned: true,
      sortable: true,
      width: '8.5rem',
      value: (b) => b.order.orderRef,
      cell: (b) => (
        <span className="min-w-0">
          <span className="block font-mono text-sm font-medium text-ink-900">{b.order.orderRef}</span>
          <span className="block text-sm text-ink-400">{fmtDate(b.order.orderDate)}</span>
        </span>
      ),
    },
    ...(showApi
      ? [
          {
            key: 'api',
            header: 'API',
            sortable: true,
            value: (b: TradeBundle) => data.apiProducts.find((a) => a.id === b.order.apiProductId)?.name ?? '',
            cell: (b: TradeBundle) => (
              <span className="truncate text-sm text-ink-800">{data.apiProducts.find((a) => a.id === b.order.apiProductId)?.name}</span>
            ),
          } satisfies Column<TradeBundle>,
        ]
      : []),
    {
      key: 'client',
      header: 'Client',
      sortable: true,
      value: (b) => partyName(data, b.order.clientId),
      cell: (b) => (
        <span className="min-w-0">
          <span className="block truncate text-sm text-ink-800">{partyName(data, b.order.clientId)}</span>
          <span className="block truncate text-sm text-ink-400">
            from {partyName(data, data.sourcing.find((s) => s.id === b.order.sourcingId)?.manufacturerId)}
          </span>
        </span>
      ),
    },
    {
      key: 'qty',
      header: 'Quantity',
      align: 'right',
      sortable: true,
      width: '7rem',
      value: (b) => Number(b.order.quantity),
 cell: (b) => <span className="text-sm tabular">{fmtDecQty(dec(b.order.quantity), b.order.uom)}</span>,
    },
    {
      key: 'fob',
      header: 'FOB value',
      align: 'right',
      sortable: true,
      width: '9rem',
      value: (b) => Number(orderFinancials(b).fobValue / 10000n) / 100,
 cell: (b) => <span className="text-sm tabular">{fmtDecMoney(orderFinancials(b).fobValue, b.order.currency, 0)}</span>,
    },
    {
      key: 'status',
      header: 'Trade status',
      width: '14rem',
      value: (b) => currentTradeStage(b) ?? 'DONE',
      cell: (b) => (
        <span className="flex flex-col gap-1">
          <TradeStatusBadge bundle={b} />
          <TradeMiniBar bundle={b} />
        </span>
      ),
    },
    {
      key: 'commission',
      header: 'Commission',
      align: 'right',
      width: '9rem',
      value: (b) => b.commission?.status ?? '',
      cell: (b) => {
        const f = orderFinancials(b)
        return f.receivedCommission != null ? (
 <span className="text-sm tabular text-ok-600">{fmtDecMoney(f.receivedCommission, b.order.currency)}</span>
        ) : (
 <span className="text-sm tabular text-ink-500">{fmtDecMoney(f.expectedCommission, b.order.currency)}</span>
        )
      },
    },
  ]
  return (
    <DataTable
      rows={bundles}
      columns={columns}
      rowKey={(b) => b.order.id}
      loading={loading}
      onRowClick={onOpen}
      empty={empty}
      exportName="product-2-trade-orders"
    />
  )
}
