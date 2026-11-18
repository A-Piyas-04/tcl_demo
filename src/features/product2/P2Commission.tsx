/**
 * Product 2.0 — commission register: expected vs received per order, with the
 * basis (FOB or total transaction) and rate each figure was calculated on.
 */

import * as React from 'react'
import { useNavigate } from 'react-router-dom'
import { CheckCircle2, Clock, Wallet } from 'lucide-react'
import { useUrlFilters } from '@/lib/hooks'
import { fmtDate, pluralise } from '@/lib/utils'
import { Badge, type Column, DataTable, EmptyState, FilterBar, KpiTile, PageHeading, Panel, Select } from '@/components/ui'
import { useP2 } from './store'
import { P2Tabs, partyName, useFirstLoad } from './components'
import { fmtDecMoney, fmtDecPct } from './decimal'
import {
  COMMISSION_BASIS_LABEL,
  currentTradeStage,
  orderFinancials,
  totalsByCurrency,
  tradeBundle,
  tradeStatusLabel,
  type OrderFinancials,
  type TradeBundle,
} from './workflow'

interface Row {
  b: TradeBundle
  f: OrderFinancials
  due: boolean
}

const DEFAULTS = { status: '', basis: '', client: '' }

export function P2Commission() {
  const data = useP2()
  const navigate = useNavigate()
  const loading = useFirstLoad()
  const { values, setValue, clear, activeCount } = useUrlFilters(DEFAULTS)

  const all = React.useMemo<Row[]>(
    () =>
      data.tradeOrders.map((o) => {
        const b = tradeBundle(data, o)
        return { b, f: orderFinancials(b), due: currentTradeStage(b) === 'COMMISSION' }
      }),
    [data],
  )

  const rows = all
    .filter((r) => {
      const st = r.b.commission?.status
      if (values.status === 'RECEIVED' && st !== 'RECEIVED') return false
      if (values.status === 'DUE' && !r.due) return false
      if (values.status === 'PIPELINE' && (st === 'RECEIVED' || r.due)) return false
      if (values.basis && r.f.basis !== values.basis) return false
      if (values.client && r.b.order.clientId !== values.client) return false
      return true
    })
    .sort((a, b) => (a.b.order.orderDate < b.b.order.orderDate ? 1 : -1))

  const sum = (rs: Row[], pick: (r: Row) => bigint | null) =>
    totalsByCurrency(rs.map((r) => ({ amount: pick(r) ?? 0n, currency: r.b.order.currency })))
  const show = (t: { amount: bigint; currency: string }[]) => (t.length ? t.map((x) => fmtDecMoney(x.amount, x.currency, 0)).join(' + ') : 'USD 0')
  const received = all.filter((r) => r.f.receivedCommission != null)
  const due = all.filter((r) => r.due)
  const pipeline = all.filter((r) => !r.due && r.f.receivedCommission == null)

  const columns: Column<Row>[] = [
    {
      key: 'ref',
      header: 'Order',
      pinned: true,
      sortable: true,
      width: '8.5rem',
      value: (r) => r.b.order.orderRef,
      cell: (r) => <span className="font-mono text-xs font-medium text-ink-900">{r.b.order.orderRef}</span>,
    },
    {
      key: 'api',
      header: 'API / client',
      value: (r) => data.apiProducts.find((a) => a.id === r.b.order.apiProductId)?.name ?? '',
      cell: (r) => (
        <span className="min-w-0">
          <span className="block truncate text-sm text-ink-800">{data.apiProducts.find((a) => a.id === r.b.order.apiProductId)?.name}</span>
          <span className="block truncate text-2xs text-ink-400">{partyName(data, r.b.order.clientId)}</span>
        </span>
      ),
    },
    {
      key: 'basis',
      header: 'Basis & rate',
      width: '11rem',
      value: (r) => `${r.f.basis} ${r.b.commission?.percentage}`,
      cell: (r) => (
        <span className="text-xs text-ink-700">
          {r.f.basis ? COMMISSION_BASIS_LABEL[r.f.basis] : '—'} <span className="font-mono text-ink-500">@ {fmtDecPct(r.f.percentage)}</span>
        </span>
      ),
    },
    {
      key: 'commissionable',
      header: 'Commissionable',
      align: 'right',
      width: '9rem',
      value: (r) => fmtDecMoney(r.f.commissionableAmount, r.b.order.currency),
      cell: (r) => <span className="font-mono text-xs tabular text-ink-600">{fmtDecMoney(r.f.commissionableAmount, r.b.order.currency, 0)}</span>,
    },
    {
      key: 'expected',
      header: 'Expected',
      align: 'right',
      width: '8.5rem',
      value: (r) => fmtDecMoney(r.f.expectedCommission, r.b.order.currency),
      cell: (r) => <span className="font-mono text-xs tabular text-ink-800">{fmtDecMoney(r.f.expectedCommission, r.b.order.currency)}</span>,
    },
    {
      key: 'received',
      header: 'Received',
      align: 'right',
      width: '8.5rem',
      value: (r) => (r.f.receivedCommission != null ? fmtDecMoney(r.f.receivedCommission, r.b.order.currency) : ''),
      cell: (r) =>
        r.f.receivedCommission != null ? (
          <span className="min-w-0 text-right">
            <span className="block font-mono text-xs tabular text-ok-600">{fmtDecMoney(r.f.receivedCommission, r.b.order.currency)}</span>
            {r.f.variance ? (
              <span className={`block font-mono text-2xs ${r.f.variance < 0n ? 'text-danger-600' : 'text-ink-400'}`}>
                {fmtDecMoney(r.f.variance, r.b.order.currency, 2, true)}
              </span>
            ) : null}
          </span>
        ) : (
          <span className="text-xs text-ink-400">—</span>
        ),
    },
    {
      key: 'status',
      header: 'Status',
      width: '12rem',
      value: (r) => r.b.commission?.status ?? '',
      cell: (r) =>
        r.b.commission?.status === 'RECEIVED' ? (
          <span>
            <Badge tone="ok">Received</Badge>
            <span className="ml-1.5 text-2xs text-ink-400">{fmtDate(r.b.commission.receivedOn)}</span>
          </span>
        ) : r.due ? (
          <Badge tone="accent">Due — delivered</Badge>
        ) : (
          <span className="text-xs text-ink-500">{tradeStatusLabel(r.b)}</span>
        ),
    },
  ]

  return (
    <div className="space-y-4">
      <div>
        <PageHeading title="Product 2.0" subtitle="Commission expected from each order, and what has actually been received." />
        <P2Tabs />
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        <KpiTile label="In the pipeline" value={<span className="text-2xl">{show(sum(pipeline, (r) => r.f.expectedCommission))}</span>} icon={<Clock className="h-4 w-4" />} hint={`${pluralise(pipeline.length, 'order')} not yet delivered`} />
        <KpiTile label="Due now" tone="accent" value={<span className="text-2xl">{show(sum(due, (r) => r.f.expectedCommission))}</span>} icon={<Wallet className="h-4 w-4" />} hint={`${pluralise(due.length, 'delivered order')} awaiting payment`} />
        <KpiTile label="Received" tone="ok" value={<span className="text-2xl">{show(sum(received, (r) => r.f.receivedCommission))}</span>} icon={<CheckCircle2 className="h-4 w-4" />} hint={`against ${show(sum(received, (r) => r.f.expectedCommission))} expected`} />
      </div>

      <Panel>
        <FilterBar
          activeCount={activeCount}
          onClear={clear}
          primary={
            <>
              <Select
                value={values.status}
                onChange={(v) => setValue('status', v)}
                allowEmpty
                emptyLabel="Any status"
                placeholder="Any status"
                options={[
                  { value: 'PIPELINE', label: 'In the pipeline' },
                  { value: 'DUE', label: 'Due now' },
                  { value: 'RECEIVED', label: 'Received' },
                ]}
              />
              <Select
                value={values.basis}
                onChange={(v) => setValue('basis', v)}
                allowEmpty
                emptyLabel="Any basis"
                placeholder="Any basis"
                options={[
                  { value: 'FOB', label: COMMISSION_BASIS_LABEL.FOB },
                  { value: 'TOTAL', label: COMMISSION_BASIS_LABEL.TOTAL },
                ]}
              />
              <Select
                value={values.client}
                onChange={(v) => setValue('client', v)}
                allowEmpty
                emptyLabel="Any client"
                placeholder="Any client"
                options={data.parties.filter((p) => p.kind === 'CLIENT').map((c) => ({ value: c.id, label: c.name }))}
              />
            </>
          }
        />
        <DataTable
          rows={rows}
          columns={columns}
          rowKey={(r) => r.b.order.id}
          loading={loading}
          onRowClick={(r) => navigate(`/product-2/${r.b.order.apiProductId}/orders/${r.b.order.id}`)}
          exportName="product-2-commission"
          empty={<EmptyState compact icon={<Wallet className="h-5 w-5" />} title="No commission records match" description="Try removing a filter." />}
        />
      </Panel>
    </div>
  )
}
