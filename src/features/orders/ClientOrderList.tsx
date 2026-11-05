/**
 * Client orders (UC-09, AC-09).
 *
 * A client order records what a client wants and from which source. It carries
 * no TCL price: TCL never buys or sells the material, so the only money on the
 * line is the target price the client named, kept for reference.
 *
 * The fulfilment column answers the question the business cannot answer today:
 * of what was ordered, how much is on indent, how much has shipped, and how
 * much has actually reached the client's factory.
 */

import * as React from 'react'
import { useNavigate } from 'react-router-dom'
import { ClipboardList, Plus, SlidersHorizontal } from 'lucide-react'
import { useDb } from '@/data/store'
import { clients as clientList, orderLineStatuses } from '@/data/selectors'
import { ORDER_STATUS_LABEL } from '@/data/reference'
import { logExport } from '@/data/api'
import { useAsyncData, useDebounced, useUrlFilters } from '@/lib/hooks'
import { fmtDate, fmtQty, pluralise } from '@/lib/utils'
import type { ClientOrder, OrderStatus } from '@/data/types'
import {
  Badge,
  Column,
  DataTable,
  DateInput,
  EmptyState,
  LinkButton,
  NameCell,
  Panel,
  PageHeading,
  SearchInput,
  Select,
  Tooltip,
  WriteOnly,
} from '@/components/ui'
import {
  ClearFiltersButton,
  FulfilmentBar,
  FulfilmentLegend,
  OrderStatusBadge,
  sumQty,
} from './shared'

interface Row {
  order: ClientOrder
  clientName: string
  siteName: string
  lineCount: number
  totalQty: number
  totalUom: string
  mixedUnits: boolean
  indented: number
  shipped: number
  delivered: number
}

const DEFAULTS = {
  q: '',
  client: '',
  status: '',
  from: '',
  to: '',
  override: '',
}

export function ClientOrderList() {
  const db = useDb()
  const navigate = useNavigate()
  const { values, setValue, clear, activeCount, queryString } = useUrlFilters(DEFAULTS)
  const [search, setSearch] = React.useState(values.q)
  const debounced = useDebounced(search, 180)

  React.useEffect(() => {
    setValue('q', debounced)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [debounced])

  const { data: rows, loading } = useAsyncData<Row[]>(() => {
    const statuses = orderLineStatuses(db)
    return db.clientOrders
      .map((order) => {
        const lines = statuses.filter((l) => l.orderId === order.id)
        const totals = sumQty(lines.map((l) => ({ qty: l.orderedQty, uom: l.uom })))
        const indented = sumQty(lines.map((l) => ({ qty: l.indentedQty, uom: l.uom })))
        const shipped = sumQty(lines.map((l) => ({ qty: l.shippedQty, uom: l.uom })))
        const delivered = sumQty(lines.map((l) => ({ qty: l.deliveredQty, uom: l.uom })))
        return {
          order,
          clientName: lines[0]?.clientName ?? db.companies.find((c) => c.id === order.clientCompanyId)?.displayName ?? '—',
          siteName: order.deliverySiteId
            ? (db.sites.find((s) => s.id === order.deliverySiteId)?.name ?? '—')
            : 'Not set',
          lineCount: lines.length,
          totalQty: totals.qty,
          totalUom: totals.uom,
          mixedUnits: totals.mixed,
          indented: indented.qty,
          shipped: shipped.qty,
          delivered: delivered.qty,
        }
      })
      .filter((row) => {
        const q = values.q.trim().toLowerCase()
        if (q) {
          const hit =
            row.order.coNumber.toLowerCase().includes(q) ||
            row.clientName.toLowerCase().includes(q) ||
            (row.order.clientReference ?? '').toLowerCase().includes(q)
          if (!hit) return false
        }
        if (values.client && row.order.clientCompanyId !== values.client) return false
        if (values.status && row.order.status !== values.status) return false
        if (values.from && row.order.orderDate < values.from) return false
        if (values.to && row.order.orderDate > values.to) return false
        if (values.override === '1' && !row.order.hasOverride) return false
        return true
      })
      .sort((a, b) => (a.order.orderDate < b.order.orderDate ? 1 : -1))
  }, [values])

  const columns: Column<Row>[] = [
    {
      key: 'number',
      header: 'Order',
      pinned: true,
      sortable: true,
      width: '11rem',
      value: (r) => r.order.coNumber,
      cell: (r) => (
        <span className="block min-w-0">
          <span className="block truncate font-mono text-[0.8rem] tabular font-medium text-ink-900">
            {r.order.coNumber}
          </span>
          <span className="block truncate text-2xs text-ink-500">{fmtDate(r.order.orderDate)}</span>
        </span>
      ),
    },
    {
      key: 'client',
      header: 'Client',
      sortable: true,
      value: (r) => r.clientName,
      cell: (r) => <NameCell title={r.clientName} subtitle={r.siteName} />,
    },
    {
      key: 'lines',
      header: 'Lines',
      align: 'right',
      sortable: true,
      width: '5rem',
      value: (r) => r.lineCount,
      cell: (r) => <span className="tabular text-sm text-ink-800">{r.lineCount}</span>,
    },
    {
      key: 'qty',
      header: 'Ordered',
      align: 'right',
      sortable: true,
      width: '8.5rem',
      value: (r) => r.totalQty,
      cell: (r) => (
        <span className="tabular text-sm text-ink-800">
          {fmtQty(r.totalQty, r.totalUom)}
          {r.mixedUnits ? (
            <Tooltip content="This order mixes units that do not convert, so the total is indicative.">
              <span className="ml-1 text-warn-600">*</span>
            </Tooltip>
          ) : null}
        </span>
      ),
    },
    {
      key: 'progress',
      header: 'Fulfilment',
      width: '9rem',
      value: (r) => (r.totalQty > 0 ? Math.round((r.delivered / r.totalQty) * 100) : 0),
      cell: (r) => (
        <FulfilmentBar
          ordered={r.totalQty}
          indented={r.indented}
          shipped={r.shipped}
          delivered={r.delivered}
        />
      ),
    },
    {
      key: 'status',
      header: 'Status',
      sortable: true,
      width: '7.5rem',
      value: (r) => r.order.status,
      cell: (r) => <OrderStatusBadge status={r.order.status} />,
    },
    {
      key: 'override',
      header: 'Override',
      width: '6.5rem',
      value: (r) => (r.order.hasOverride ? 'Yes' : ''),
      cell: (r) =>
        r.order.hasOverride ? (
          <Tooltip content="One or more lines use a source that was not approved for this client. The reason is on the line.">
            <Badge tone="warn">Override</Badge>
          </Tooltip>
        ) : (
          <span className="text-xs text-ink-400">—</span>
        ),
    },
    {
      key: 'reference',
      header: 'Client reference',
      optional: true,
      value: (r) => r.order.clientReference,
      cell: (r) => (
        <span className="font-mono text-2xs text-ink-600">{r.order.clientReference ?? '—'}</span>
      ),
    },
    {
      key: 'site',
      header: 'Delivery site',
      optional: true,
      value: (r) => r.siteName,
      cell: (r) => <span className="truncate text-xs text-ink-600">{r.siteName}</span>,
    },
  ]

  return (
    <div className="space-y-4">
      <PageHeading
        title="Client orders"
        subtitle="What each client has asked for, and from which source. No TCL price sits on these lines: the client pays the manufacturer, and TCL earns commission."
        meta={
          <>
            <Badge tone="neutral">{pluralise(db.clientOrders.length, 'order')}</Badge>
            <Badge tone="warn">
              {pluralise(db.clientOrders.filter((o) => o.hasOverride).length, 'order with an override')}
            </Badge>
          </>
        }
        actions={
          <WriteOnly>
            <LinkButton to="/client-orders/new" variant="primary" size="md" icon={<Plus className="h-3.5 w-3.5" />}>
              Record a client order
            </LinkButton>
          </WriteOnly>
        }
      />

      <Panel>
        <div className="grid gap-2.5 border-b border-paper-200 p-3 sm:grid-cols-2 lg:grid-cols-4">
          <SearchInput
            value={search}
            onChange={setSearch}
            placeholder="Order number, client or their reference…"
            className="sm:col-span-2 lg:col-span-1"
          />
          <Select
            value={values.client}
            onChange={(v) => setValue('client', v)}
            allowEmpty
            emptyLabel="Any client"
            placeholder="Any client"
            options={clientList(db).map((c) => ({ value: c.id, label: c.displayName }))}
          />
          <Select
            value={values.status}
            onChange={(v) => setValue('status', v)}
            allowEmpty
            emptyLabel="Any status"
            placeholder="Any status"
            options={(Object.keys(ORDER_STATUS_LABEL) as OrderStatus[]).map((s) => ({
              value: s,
              label: ORDER_STATUS_LABEL[s],
            }))}
          />
          <div className="flex items-center gap-1.5">
            <DateInput
              value={values.from}
              onChange={(e) => setValue('from', e.target.value)}
              aria-label="Ordered on or after"
            />
            <span className="text-xs text-ink-400">to</span>
            <DateInput
              value={values.to}
              onChange={(e) => setValue('to', e.target.value)}
              aria-label="Ordered on or before"
            />
          </div>
        </div>

        <DataTable
          rows={rows ?? []}
          columns={columns}
          rowKey={(r) => r.order.id}
          loading={loading}
          onRowClick={(r) => navigate(`/client-orders/${r.order.id}`)}
          exportName="client-orders"
          exportFilters={queryString}
          onExport={(count) => void logExport('client order list', queryString, count)}
          rowTone={(r) => (r.order.hasOverride ? 'bg-warn-50/40' : undefined)}
          toolbar={
            <span className="flex flex-wrap items-center gap-2.5 text-xs text-ink-500">
              <SlidersHorizontal className="h-3.5 w-3.5" />
              {rows ? pluralise(rows.length, 'order') : '…'}
              <label className="flex cursor-pointer items-center gap-1.5">
                <input
                  type="checkbox"
                  checked={values.override === '1'}
                  onChange={(e) => setValue('override', e.target.checked ? '1' : '')}
                  className="h-3.5 w-3.5 rounded border-paper-400 text-accent-600"
                />
                Contains an override
              </label>
              <FulfilmentLegend />
              <ClearFiltersButton
                count={activeCount}
                onClear={() => {
                  clear()
                  setSearch('')
                }}
              />
            </span>
          }
          empty={
            <EmptyState
              icon={<ClipboardList className="h-5 w-5" />}
              title={activeCount > 0 ? 'No order matches these filters' : 'No client order recorded yet'}
              description={
                activeCount > 0
                  ? 'Try a wider date range, or clear the client and status filters.'
                  : 'An order names the client, the source for each line and the quantity. The indents on each manufacturer follow from it.'
              }
              action={
                <WriteOnly>
                  <LinkButton to="/client-orders/new" variant="primary" size="sm">
                    Record a client order
                  </LinkButton>
                </WriteOnly>
              }
              secondary={
                activeCount > 0 ? (
                  <ClearFiltersButton
                    count={activeCount}
                    onClear={() => {
                      clear()
                      setSearch('')
                    }}
                  />
                ) : null
              }
            />
          }
        />
      </Panel>
    </div>
  )
}
