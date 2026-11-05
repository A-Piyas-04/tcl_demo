/**
 * Indents (UC-09, AC-09).
 *
 * An indent is the order TCL places on a manufacturer on behalf of one named
 * client. Both parties appear on every row, because the pair is the record:
 * the client pays the manufacturer directly, and TCL's earnings are the
 * commission shown in the last column.
 *
 * The letter of credit column is the one the commercial team watches. It is
 * opened by the client in the manufacturer's favour; TCL records and chases
 * it, and is never a party to it.
 */

import * as React from 'react'
import { useNavigate } from 'react-router-dom'
import { FileStack, Plus, SlidersHorizontal } from 'lucide-react'
import { useDb } from '@/data/store'
import {
  clients as clientList,
  indentValue,
  manufacturers as mfrList,
} from '@/data/selectors'
import { ORDER_STATUS_LABEL } from '@/data/reference'
import { logExport } from '@/data/api'
import { useAsyncData, useDebounced, useUrlFilters } from '@/lib/hooks'
import { fmtDate, fmtMoney, pluralise } from '@/lib/utils'
import type { Commission, Indent, OrderStatus } from '@/data/types'
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
  CommissionStatusBadge,
  OrderStatusBadge,
  lcState,
} from './shared'

interface Row {
  indent: Indent
  manufacturerName: string
  clientName: string
  value: number
  lineCount: number
  shipmentCount: number
  commission: Commission | undefined
  lc: ReturnType<typeof lcState>
}

const DEFAULTS = {
  q: '',
  manufacturer: '',
  client: '',
  status: '',
  lc: '',
  from: '',
  to: '',
}

export function IndentList() {
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
    return db.indents
      .map((indent) => ({
        indent,
        manufacturerName: db.companies.find((c) => c.id === indent.manufacturerCompanyId)?.displayName ?? '—',
        clientName: db.companies.find((c) => c.id === indent.clientCompanyId)?.displayName ?? '—',
        value: indentValue(db, indent.id),
        lineCount: db.indentLines.filter((l) => l.indentId === indent.id).length,
        shipmentCount: db.shipments.filter((s) => s.indentId === indent.id).length,
        commission: db.commissions.find((c) => c.indentId === indent.id),
        lc: lcState(indent),
      }))
      .filter((row) => {
        const q = values.q.trim().toLowerCase()
        if (q) {
          const hit =
            row.indent.indentNumber.toLowerCase().includes(q) ||
            row.manufacturerName.toLowerCase().includes(q) ||
            row.clientName.toLowerCase().includes(q) ||
            (row.indent.lcNumber ?? '').toLowerCase().includes(q) ||
            (row.indent.proformaInvoiceRef ?? '').toLowerCase().includes(q)
          if (!hit) return false
        }
        if (values.manufacturer && row.indent.manufacturerCompanyId !== values.manufacturer) return false
        if (values.client && row.indent.clientCompanyId !== values.client) return false
        if (values.status && row.indent.status !== values.status) return false
        if (values.from && row.indent.orderDate < values.from) return false
        if (values.to && row.indent.orderDate > values.to) return false
        if (values.lc === 'expiring' && !(row.lc.state === 'expiring' || row.lc.state === 'expired')) return false
        if (values.lc === 'none' && row.lc.state !== 'none') return false
        return true
      })
      .sort((a, b) => (a.indent.orderDate < b.indent.orderDate ? 1 : -1))
  }, [values])

  const columns: Column<Row>[] = [
    {
      key: 'number',
      header: 'Indent',
      pinned: true,
      sortable: true,
      width: '11rem',
      value: (r) => r.indent.indentNumber,
      cell: (r) => (
        <span className="block min-w-0">
          <span className="block truncate font-mono text-[0.8rem] tabular font-medium text-ink-900">
            {r.indent.indentNumber}
          </span>
          <span className="block truncate text-2xs text-ink-500">{fmtDate(r.indent.orderDate)}</span>
        </span>
      ),
    },
    {
      key: 'manufacturer',
      header: 'Placed on',
      sortable: true,
      value: (r) => r.manufacturerName,
      cell: (r) => <NameCell title={r.manufacturerName} subtitle={`${r.lineCount} line${r.lineCount === 1 ? '' : 's'}`} />,
    },
    {
      key: 'client',
      header: 'Raised for',
      sortable: true,
      value: (r) => r.clientName,
      cell: (r) => <NameCell title={r.clientName} subtitle="the client who pays the manufacturer" />,
    },
    {
      key: 'value',
      header: 'Indent value',
      align: 'right',
      sortable: true,
      width: '9rem',
      value: (r) => r.value,
      cell: (r) => (
        <span className="text-sm font-medium tabular text-ink-900">
          {fmtMoney(r.value, r.indent.currency, { decimals: 0 })}
        </span>
      ),
    },
    {
      key: 'lc',
      header: 'Letter of credit',
      sortable: true,
      width: '12rem',
      value: (r) => r.indent.lcExpiryDate ?? '',
      cell: (r) => {
        if (r.lc.state === 'none') {
          return (
            <Tooltip content="The client has not opened the letter of credit yet, so the manufacturer has nothing to ship against.">
              <Badge tone="outline">Not opened</Badge>
            </Tooltip>
          )
        }
        const tone = r.lc.state === 'expired' ? 'text-danger-700' : r.lc.state === 'expiring' ? 'text-warn-600' : 'text-ink-700'
        return (
          <span className="block min-w-0">
            <span className="block truncate font-mono text-2xs text-ink-700">{r.indent.lcNumber}</span>
            <span className={`block truncate text-2xs ${tone}`}>
              {r.indent.lcExpiryDate
                ? r.lc.state === 'expired'
                  ? `expired ${fmtDate(r.indent.lcExpiryDate)}`
                  : `expires ${fmtDate(r.indent.lcExpiryDate)}${r.lc.state === 'expiring' ? ` (${r.lc.daysToExpiry}d)` : ''}`
                : 'no expiry recorded'}
            </span>
          </span>
        )
      },
    },
    {
      key: 'status',
      header: 'Status',
      sortable: true,
      width: '7.5rem',
      value: (r) => r.indent.status,
      cell: (r) => <OrderStatusBadge status={r.indent.status} />,
    },
    {
      key: 'shipments',
      header: 'Shipments',
      align: 'right',
      sortable: true,
      width: '6.5rem',
      value: (r) => r.shipmentCount,
      cell: (r) =>
        r.shipmentCount > 0 ? (
          <span className="tabular text-sm text-ink-800">{r.shipmentCount}</span>
        ) : (
          <span className="text-xs text-ink-400">none yet</span>
        ),
    },
    {
      key: 'commission',
      header: 'Commission',
      width: '9rem',
      value: (r) => r.commission?.status ?? '',
      cell: (r) =>
        r.commission ? (
          <span className="flex min-w-0 flex-col gap-0.5">
            <CommissionStatusBadge status={r.commission.status} />
            <span className="truncate text-2xs tabular text-ink-500">
              {r.commission.amount != null
                ? fmtMoney(r.commission.amount, r.commission.currency, { decimals: 0 })
                : 'figure to be decided'}
            </span>
          </span>
        ) : (
          <span className="text-xs text-ink-400">—</span>
        ),
    },
    {
      key: 'proforma',
      header: 'Proforma invoice',
      optional: true,
      value: (r) => r.indent.proformaInvoiceRef,
      cell: (r) => <span className="font-mono text-2xs text-ink-600">{r.indent.proformaInvoiceRef ?? '—'}</span>,
    },
    {
      key: 'bank',
      header: 'Issuing bank',
      optional: true,
      value: (r) => r.indent.lcBank,
      cell: (r) => <span className="truncate text-xs text-ink-600">{r.indent.lcBank ?? '—'}</span>,
    },
  ]

  const expiringCount = db.indents.filter((i) => {
    const s = lcState(i).state
    return s === 'expiring' || s === 'expired'
  }).length

  return (
    <div className="space-y-4">
      <PageHeading
        title="Indents"
        subtitle="Each indent is placed on one manufacturer for one named client. TCL records it, chases it and earns commission on it."
        meta={
          <>
            <Badge tone="neutral">{pluralise(db.indents.length, 'indent')}</Badge>
            {expiringCount > 0 ? <Badge tone="warn">{expiringCount} with an LC expiring or expired</Badge> : null}
          </>
        }
        actions={
          <WriteOnly>
            <LinkButton to="/client-orders/new" variant="secondary" size="md" icon={<Plus className="h-3.5 w-3.5" />}>
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
            placeholder="Indent number, party, LC or proforma…"
            className="sm:col-span-2 lg:col-span-1"
          />
          <Select
            value={values.manufacturer}
            onChange={(v) => setValue('manufacturer', v)}
            allowEmpty
            emptyLabel="Any manufacturer"
            placeholder="Any manufacturer"
            options={mfrList(db).map((m) => ({ value: m.id, label: m.displayName }))}
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
          <Select
            value={values.lc}
            onChange={(v) => setValue('lc', v)}
            allowEmpty
            emptyLabel="Any LC state"
            placeholder="Any LC state"
            options={[
              { value: 'expiring', label: 'Expiring within 45 days, or expired' },
              { value: 'none', label: 'No LC opened yet' },
            ]}
          />
          <div className="flex items-center gap-1.5 sm:col-span-2">
            <DateInput
              value={values.from}
              onChange={(e) => setValue('from', e.target.value)}
              aria-label="Raised on or after"
            />
            <span className="text-xs text-ink-400">to</span>
            <DateInput
              value={values.to}
              onChange={(e) => setValue('to', e.target.value)}
              aria-label="Raised on or before"
            />
          </div>
        </div>

        <DataTable
          rows={rows ?? []}
          columns={columns}
          rowKey={(r) => r.indent.id}
          loading={loading}
          onRowClick={(r) => navigate(`/indents/${r.indent.id}`)}
          exportName="indents"
          exportFilters={queryString}
          onExport={(count) => void logExport('indent list', queryString, count)}
          rowTone={(r) =>
            r.lc.state === 'expired' ? 'bg-danger-50/40' : r.lc.state === 'expiring' ? 'bg-warn-50/40' : undefined
          }
          toolbar={
            <span className="flex flex-wrap items-center gap-2.5 text-xs text-ink-500">
              <SlidersHorizontal className="h-3.5 w-3.5" />
              {rows ? pluralise(rows.length, 'indent') : '…'}
              {rows ? (
                <span className="tabular">
                  worth {fmtMoney(rows.reduce((s, r) => s + r.value, 0), 'USD', { compact: true })}
                </span>
              ) : null}
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
              icon={<FileStack className="h-5 w-5" />}
              title={activeCount > 0 ? 'No indent matches these filters' : 'No indent raised yet'}
              description={
                activeCount > 0
                  ? 'Try clearing the LC state or widening the date range.'
                  : 'An indent follows from a client order: record the order, then raise one indent per manufacturer.'
              }
              action={
                <WriteOnly>
                  <LinkButton to="/client-orders/new" variant="primary" size="sm">
                    Record a client order
                  </LinkButton>
                </WriteOnly>
              }
            />
          }
        />
      </Panel>
    </div>
  )
}
