/**
 * Product 2.0 — API product listing. Search and filter APIs by sourcing
 * status, trade activity, manufacturer, client and therapeutic area.
 */

import * as React from 'react'
import { useNavigate } from 'react-router-dom'
import { FlaskConical, MoreHorizontal, Pill, Plus, RefreshCw, ShoppingCart, SlidersHorizontal, Wallet } from 'lucide-react'
import { useUrlFilters, useUrlSearch, runAction } from '@/lib/hooks'
import { pluralise } from '@/lib/utils'
import {
  Badge,
  Button,
  type Column,
  ConfirmDialog,
  DataTable,
  EmptyState,
  FilingDot,
  FilterBar,
  KpiTile,
  Menu,
  MenuContent,
  MenuItem,
  MenuTrigger,
  NameCell,
  PageHeading,
  Panel,
  Select,
  WriteOnly,
} from '@/components/ui'
import { resetP2Data, useP2 } from './store'
import { P2Tabs, SourcingStatusBadge, THERAPEUTIC_AREAS, partyName, useFirstLoad } from './components'
import { ApiFormDialog } from './sourcingDialogs'
import { fmtDecMoney } from './decimal'
import {
  SOURCING_STATUS_LABEL,
  apiSourcingStatus,
  currentTradeStage,
  orderFinancials,
  sourcingStatus,
  totalsByCurrency,
  tradeBundle,
} from './workflow'
import type { ApiProduct, SourcingStatus } from './types'

interface Row {
  api: ApiProduct
  status: SourcingStatus | null
  sourceCount: number
  acceptedCount: number
  manufacturers: string[]
  orderCount: number
  openOrders: number
  hasDmf: boolean
  hasCep: boolean
  expected: string
}

const DEFAULTS = { q: '', sourcing: '', trade: '', manufacturer: '', client: '', area: '', archived: '' }

export function P2List() {
  const data = useP2()
  const navigate = useNavigate()
  const loading = useFirstLoad()
  const { values, setValue, clear, activeCount } = useUrlFilters(DEFAULTS)
  const [search, setSearch] = useUrlSearch(values.q, (v) => setValue('q', v))
  const [adding, setAdding] = React.useState(false)
  const [confirmReset, setConfirmReset] = React.useState(false)
  const [resetting, setResetting] = React.useState(false)

  const rows = React.useMemo<Row[]>(() => {
    const q = values.q.trim().toLowerCase()
    return data.apiProducts
      .filter((a) => (values.archived === '1' ? true : a.isActive))
      .map((api) => {
        const sources = data.sourcing.filter((s) => s.apiProductId === api.id)
        const orders = data.tradeOrders.filter((o) => o.apiProductId === api.id)
        const bundles = orders.map((o) => tradeBundle(data, o))
        const expected = totalsByCurrency(
          bundles
            .filter((b) => b.commission?.status !== 'RECEIVED')
            .map((b) => ({ amount: orderFinancials(b).expectedCommission ?? 0n, currency: b.order.currency })),
        )
        return {
          api,
          status: apiSourcingStatus(data, api.id),
          sourceCount: sources.length,
          acceptedCount: sources.filter((s) => sourcingStatus(data, s.id) === 'ACCEPTED').length,
          manufacturers: sources.map((s) => partyName(data, s.manufacturerId)),
          orderCount: orders.length,
          openOrders: bundles.filter((b) => currentTradeStage(b) !== null).length,
          hasDmf: sources.some((s) => s.hasDmf),
          hasCep: sources.some((s) => s.hasCep),
          expected: expected.length ? expected.map((t) => fmtDecMoney(t.amount, t.currency, 0)).join(' + ') : '—',
        }
      })
      .filter((r) => {
        if (q) {
          const hit =
            r.api.name.toLowerCase().includes(q) ||
            r.api.casNumber?.includes(q) ||
            r.api.synonyms.some((s) => s.toLowerCase().includes(q)) ||
            r.manufacturers.some((m) => m.toLowerCase().includes(q))
          if (!hit) return false
        }
        if (values.sourcing === 'NONE') {
          if (r.sourceCount > 0) return false
        } else if (values.sourcing) {
          // an API matches a status filter if ANY of its sources is in that status
          const any = data.sourcing.some((s) => s.apiProductId === r.api.id && sourcingStatus(data, s.id) === values.sourcing)
          if (!any) return false
        }
        if (values.trade === 'none' && r.orderCount > 0) return false
        if (values.trade === 'open' && r.openOrders === 0) return false
        if (values.trade === 'done' && !(r.orderCount > 0 && r.openOrders < r.orderCount)) return false
        if (values.area && r.api.therapeuticArea !== values.area) return false
        if (values.manufacturer && !data.sourcing.some((s) => s.apiProductId === r.api.id && s.manufacturerId === values.manufacturer)) return false
        if (values.client && !data.tradeOrders.some((o) => o.apiProductId === r.api.id && o.clientId === values.client)) return false
        return true
      })
      .sort((a, b) => a.api.name.localeCompare(b.api.name))
  }, [data, values])

  // headline figures
  const stats = React.useMemo(() => {
    const active = data.apiProducts.filter((a) => a.isActive)
    const bundles = data.tradeOrders.map((o) => tradeBundle(data, o))
    const outstanding = totalsByCurrency(
      bundles
        .filter((b) => b.commission?.status !== 'RECEIVED')
        .map((b) => ({ amount: orderFinancials(b).expectedCommission ?? 0n, currency: b.order.currency })),
    )
    const pendingSamples = data.samples.filter((s) => s.status === 'SUBMITTED').length
    return {
      apis: active.length,
      accepted: data.sourcing.filter((s) => sourcingStatus(data, s.id) === 'ACCEPTED').length,
      sources: data.sourcing.length,
      pendingSamples,
      openOrders: bundles.filter((b) => currentTradeStage(b) !== null).length,
      outstanding: outstanding[0] ? fmtDecMoney(outstanding[0].amount, outstanding[0].currency, 0) : 'USD 0',
      outstandingMore: outstanding.length > 1,
      dueOrders: bundles.filter((b) => currentTradeStage(b) === 'COMMISSION').length,
    }
  }, [data])

  const manufacturers = data.parties.filter((p) => p.kind === 'MANUFACTURER').sort((a, b) => a.name.localeCompare(b.name))
  const clients = data.parties.filter((p) => p.kind === 'CLIENT').sort((a, b) => a.name.localeCompare(b.name))

  const columns: Column<Row>[] = [
    {
      key: 'name',
      header: 'API',
      pinned: true,
      sortable: true,
      value: (r) => r.api.name,
      cell: (r) => (
        <NameCell
          title={r.api.name}
          subtitle={[r.api.casNumber ? `CAS ${r.api.casNumber}` : null, r.api.grade].filter(Boolean).join(' · ') || undefined}
          badge={!r.api.isActive ? <Badge tone="neutral">Archived</Badge> : undefined}
        />
      ),
    },
    {
      key: 'area',
      header: 'Therapeutic area',
      sortable: true,
      width: '9.5rem',
      value: (r) => r.api.therapeuticArea,
      cell: (r) => <span className="truncate text-sm text-ink-600">{r.api.therapeuticArea}</span>,
    },
    {
      key: 'sourcing',
      header: 'Sourcing',
      sortable: true,
      width: '9.5rem',
      value: (r) => (r.status ? SOURCING_STATUS_LABEL[r.status] : 'No source'),
      cell: (r) => <SourcingStatusBadge status={r.status} />,
    },
    {
      key: 'sources',
      header: 'Manufacturers',
      width: '12rem',
      value: (r) => r.manufacturers.join('; '),
      cell: (r) =>
        r.sourceCount ? (
          <span className="min-w-0">
            <span className="block truncate text-sm text-ink-700">{r.manufacturers.join(', ')}</span>
            <span className="text-sm text-ink-400">
              {r.acceptedCount} of {r.sourceCount} approved
            </span>
          </span>
        ) : (
          <span className="text-sm text-ink-400">—</span>
        ),
    },
    {
      key: 'filings',
      header: 'Filings',
      width: '6.5rem',
      optional: true,
      value: (r) => [r.hasDmf && 'DMF', r.hasCep && 'CEP'].filter(Boolean).join('+'),
      cell: (r) => (
        <span className="flex gap-1">
          <FilingDot present={r.hasDmf} label="DMF" />
          <FilingDot present={r.hasCep} label="CEP" />
        </span>
      ),
    },
    {
      key: 'orders',
      header: 'Trade orders',
      align: 'right',
      sortable: true,
      width: '7.5rem',
      value: (r) => r.orderCount,
      cell: (r) =>
        r.orderCount ? (
          <span className="tabular text-sm">
            <span className="font-medium text-ink-900">{r.openOrders}</span>
            <span className="text-ink-400"> open / {r.orderCount}</span>
          </span>
        ) : (
          <span className="text-sm text-ink-400">—</span>
        ),
    },
    {
      key: 'expected',
      header: 'Commission due',
      align: 'right',
      width: '9rem',
      value: (r) => r.expected,
 cell: (r) => <span className="text-sm tabular text-ink-700">{r.expected}</span>,
    },
  ]

  return (
    <div className="space-y-4">
      <div>
        <PageHeading
          title="Molecules"
          subtitle="Every API TCL sources — who makes it, which samples passed, and what has been traded."
          meta={<Badge tone="accent">{pluralise(data.apiProducts.filter((a) => a.isActive).length, 'active API')}</Badge>}
          actions={
            <WriteOnly>
              <Button variant="primary" icon={<Plus className="h-3.5 w-3.5" />} onClick={() => setAdding(true)}>
                Add API
              </Button>
              <Menu>
                <MenuTrigger asChild>
                  <Button variant="ghost" size="icon" aria-label="More actions">
                    <MoreHorizontal className="h-4 w-4" />
                  </Button>
                </MenuTrigger>
                <MenuContent align="end">
                  <MenuItem icon={<RefreshCw className="h-3.5 w-3.5" />} onSelect={() => setConfirmReset(true)}>
                    Reset data
                  </MenuItem>
                </MenuContent>
              </Menu>
            </WriteOnly>
          }
        />
        <P2Tabs />
      </div>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <KpiTile label="API products" value={stats.apis} icon={<Pill className="h-4 w-4" />} hint={`${pluralise(stats.sources, 'manufacturer source')} recorded`} />
        <KpiTile
          label="Approved sources"
          value={stats.accepted}
          tone="ok"
          icon={<FlaskConical className="h-4 w-4" />}
          hint={stats.pendingSamples ? `${pluralise(stats.pendingSamples, 'sample')} awaiting decision` : 'No samples pending'}
        />
        <KpiTile label="Orders in progress" value={stats.openOrders} icon={<ShoppingCart className="h-4 w-4" />} to="/product-2/orders?status=open" hint="Not yet commission-received" />
        <KpiTile
          label="Commission outstanding"
          value={<span className="text-2xl">{stats.outstanding}</span>}
          tone="accent"
          icon={<Wallet className="h-4 w-4" />}
          to="/product-2/commission"
          hint={`${pluralise(stats.dueOrders, 'delivered order')} awaiting payment${stats.outstandingMore ? ' · other currencies too' : ''}`}
        />
      </div>

      <Panel>
        <FilterBar
          search={search}
          onSearch={setSearch}
          searchPlaceholder="API, CAS, synonym or manufacturer…"
          activeCount={activeCount}
          onClear={clear}
          moreActive={['manufacturer', 'client', 'area', 'archived'].filter((k) => values[k as keyof typeof values]).length}
          primary={
            <>
              <Select
                value={values.sourcing}
                onChange={(v) => setValue('sourcing', v)}
                allowEmpty
                emptyLabel="Any sourcing status"
                placeholder="Any sourcing status"
                options={[
                  ...(Object.keys(SOURCING_STATUS_LABEL) as SourcingStatus[]).map((s) => ({ value: s, label: SOURCING_STATUS_LABEL[s] })),
                  { value: 'NONE', label: 'No source yet' },
                ]}
              />
              <Select
                value={values.trade}
                onChange={(v) => setValue('trade', v)}
                allowEmpty
                emptyLabel="Any trade activity"
                placeholder="Any trade activity"
                options={[
                  { value: 'open', label: 'Has open orders' },
                  { value: 'done', label: 'Has completed orders' },
                  { value: 'none', label: 'No orders yet' },
                ]}
              />
            </>
          }
          more={
            <>
              <Select
                value={values.manufacturer}
                onChange={(v) => setValue('manufacturer', v)}
                allowEmpty
                emptyLabel="Any manufacturer"
                placeholder="Any manufacturer"
                options={manufacturers.map((m) => ({ value: m.id, label: m.name }))}
              />
              <Select
                value={values.client}
                onChange={(v) => setValue('client', v)}
                allowEmpty
                emptyLabel="Any client"
                placeholder="Any client"
                options={clients.map((c) => ({ value: c.id, label: c.name }))}
              />
              <Select
                value={values.area}
                onChange={(v) => setValue('area', v)}
                allowEmpty
                emptyLabel="Any therapeutic area"
                placeholder="Any therapeutic area"
                options={THERAPEUTIC_AREAS.map((t) => ({ value: t, label: t }))}
              />
              <label className="flex cursor-pointer items-center gap-1.5 text-sm text-ink-600">
                <input
                  type="checkbox"
                  checked={values.archived === '1'}
                  onChange={(e) => setValue('archived', e.target.checked ? '1' : '')}
                  className="h-3.5 w-3.5 rounded border-paper-400 text-accent-600"
                />
                Include archived APIs
              </label>
            </>
          }
        />
        <DataTable
          rows={rows}
          columns={columns}
          rowKey={(r) => r.api.id}
          loading={loading}
          onRowClick={(r) => navigate(`/product-2/${r.api.id}`)}
          exportName="product-2-apis"
          toolbar={
            <span className="flex items-center gap-2 text-sm text-ink-500">
              <SlidersHorizontal className="h-3.5 w-3.5" />
              {pluralise(rows.length, 'API')}
              {activeCount ? <Badge tone="accent">{activeCount} filters</Badge> : null}
            </span>
          }
          empty={
            <EmptyState
              icon={<Pill className="h-5 w-5" />}
              title={values.q ? `Nothing matches “${values.q}”` : activeCount ? 'No APIs match these filters' : 'No API products yet'}
              description={activeCount ? 'Try removing a filter.' : 'Add the first API to start tracking its sourcing and trade.'}
              action={
                activeCount ? (
                  <Button size="sm" onClick={clear}>
                    Clear filters
                  </Button>
                ) : (
                  <WriteOnly>
                    <Button size="sm" variant="primary" onClick={() => setAdding(true)}>
                      Add API
                    </Button>
                  </WriteOnly>
                )
              }
            />
          }
        />
      </Panel>

      <ApiFormDialog open={adding} onOpenChange={setAdding} onSaved={(id) => navigate(`/product-2/${id}`)} />
      <ConfirmDialog
        open={confirmReset}
        onOpenChange={setConfirmReset}
        title="Reset data?"
        recordName="every molecule record"
        consequence="All changes made in this browser are discarded and the demonstration data is restored. The rest of the application is not affected."
        confirmLabel="Reset data"
        loading={resetting}
        onConfirm={async () => {
          setResetting(true)
          await runAction(resetP2Data, { success: 'Data restored.' })
          setResetting(false)
          setConfirmReset(false)
        }}
      />
    </div>
  )
}
