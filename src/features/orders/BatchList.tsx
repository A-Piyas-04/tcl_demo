/**
 * Batches (UC-10, AC-10).
 *
 * Every manufacturing batch TCL has handled, with how much of it shipped, on
 * how many shipments, and to which clients. A batch recorded once and shipped
 * against two clients' indents appears here as one row with two clients, which
 * is exactly the case a spreadsheet gets wrong.
 */

import * as React from 'react'
import { useNavigate } from 'react-router-dom'
import { Package, SlidersHorizontal } from 'lucide-react'
import { useDb } from '@/data/store'
import { batchRows, manufacturers as mfrList, type BatchRow } from '@/data/selectors'
import { logExport } from '@/data/api'
import { useAsyncData, useUrlFilters, useUrlSearch } from '@/lib/hooks'
import { SectionNav } from '@/layout/sections'
import { fmtDate, fmtQty, pluralise } from '@/lib/utils'
import {
  Badge,
  Column,
  DataTable,
  EmptyState,
  FilterBar,
  LinkButton,
  NameCell,
  Panel,
  PageHeading,
  Select,
  Tooltip,
  WriteOnly,
} from '@/components/ui'

const DEFAULTS = {
  q: '',
  manufacturer: '',
  product: '',
  expiry: '',
}

const STATE_LABEL: Record<BatchRow['state'], string> = {
  valid: 'Valid',
  expiring: 'Expiring within a year',
  expired: 'Expired',
}

export function BatchList() {
  const db = useDb()
  const navigate = useNavigate()
  const { values, setValue, clear, activeCount, queryString } = useUrlFilters(DEFAULTS)
  const [search, setSearch] = useUrlSearch(values.q, (v) => setValue('q', v))

  const { data: rows, loading } = useAsyncData<BatchRow[]>(() => {
    return batchRows(db)
      .filter((row) => {
        const q = values.q.trim().toLowerCase()
        if (q) {
          const hit =
            row.batch.batchNumber.toLowerCase().includes(q) ||
            row.productName.toLowerCase().includes(q) ||
            row.manufacturerName.toLowerCase().includes(q) ||
            row.clientNames.some((c) => c.toLowerCase().includes(q))
          if (!hit) return false
        }
        if (values.manufacturer) {
          const mp = db.manufacturerProducts.find((m) => m.id === row.batch.manufacturerProductId)
          if (mp?.manufacturerCompanyId !== values.manufacturer) return false
        }
        if (values.product) {
          const mp = db.manufacturerProducts.find((m) => m.id === row.batch.manufacturerProductId)
          if (mp?.productId !== values.product) return false
        }
        if (values.expiry && row.state !== values.expiry) return false
        return true
      })
      .sort((a, b) => (a.batch.manufacturingDate < b.batch.manufacturingDate ? 1 : -1))
  }, [values])

  const columns: Column<BatchRow>[] = [
    {
      key: 'batch',
      header: 'Batch',
      pinned: true,
      sortable: true,
      width: '10rem',
      value: (r) => r.batch.batchNumber,
      cell: (r) => (
        <span className="block min-w-0">
          <span className="block truncate font-mono text-[0.8rem] tabular font-medium text-ink-900">
            {r.batch.batchNumber}
          </span>
          <span className="block truncate text-2xs text-ink-500">made {fmtDate(r.batch.manufacturingDate)}</span>
        </span>
      ),
    },
    {
      key: 'product',
      header: 'Product and manufacturer',
      sortable: true,
      value: (r) => r.productName,
      cell: (r) => <NameCell title={r.productName} subtitle={r.manufacturerName} />,
    },
    {
      key: 'qty',
      header: 'Shipped',
      align: 'right',
      sortable: true,
      width: '8rem',
      value: (r) => r.totalQty,
      cell: (r) => <span className="tabular text-sm text-ink-800">{fmtQty(r.totalQty, r.uom)}</span>,
    },
    {
      key: 'shipments',
      header: 'Shipments',
      align: 'right',
      sortable: true,
      width: '6.5rem',
      value: (r) => r.shipmentCount,
      cell: (r) => <span className="tabular text-sm text-ink-800">{r.shipmentCount || '—'}</span>,
    },
    {
      key: 'clients',
      header: 'Clients served',
      value: (r) => r.clientNames.join('; '),
      cell: (r) =>
        r.clientNames.length === 0 ? (
          <span className="text-xs text-ink-400">none yet</span>
        ) : r.clientNames.length === 1 ? (
          <span className="truncate text-xs text-ink-700">{r.clientNames[0]}</span>
        ) : (
          <Tooltip content={r.clientNames.join(', ')}>
            <span className="flex items-center gap-1.5">
              <Badge tone="accent">{r.clientNames.length} clients</Badge>
              <span className="truncate text-xs text-ink-600">{r.clientNames[0]} and others</span>
            </span>
          </Tooltip>
        ),
    },
    {
      key: 'delivered',
      header: 'Delivered',
      align: 'right',
      sortable: true,
      width: '8rem',
      value: (r) => r.deliveredQty,
      cell: (r) => (
        <span className="tabular text-sm text-ink-800">
          {r.deliveredQty > 0 ? fmtQty(r.deliveredQty, r.uom) : '—'}
        </span>
      ),
    },
    {
      key: 'expiry',
      header: 'Expiry',
      sortable: true,
      width: '10rem',
      value: (r) => r.batch.expiryDate,
      cell: (r) => (
        <span className="flex min-w-0 flex-col gap-0.5">
          {r.state === 'expired' ? (
            <Badge tone="danger">Expired</Badge>
          ) : r.state === 'expiring' ? (
            <Badge tone="warn">Expiring</Badge>
          ) : (
            <Badge tone="ok">Valid</Badge>
          )}
          <span className="truncate text-2xs tabular text-ink-500">{fmtDate(r.batch.expiryDate)}</span>
        </span>
      ),
    },
    {
      key: 'retest',
      header: 'Retest',
      align: 'right',
      optional: true,
      value: (r) => r.batch.retestDate,
      cell: (r) => <span className="text-xs tabular text-ink-600">{fmtDate(r.batch.retestDate)}</span>,
    },
  ]

  const products = React.useMemo(() => {
    const ids = new Set(
      db.batches
        .map((b) => db.manufacturerProducts.find((m) => m.id === b.manufacturerProductId)?.productId)
        .filter((x): x is string => Boolean(x)),
    )
    return db.products
      .filter((p) => ids.has(p.id))
      .sort((a, b) => a.genericName.localeCompare(b.genericName))
  }, [db])

  return (
    <div className="space-y-4">
      <div>
        <PageHeading
          title="Shipments"
          subtitle="Batches: each manufacturer batch is recorded once against its source, then reused by every shipment that carries it. One batch may serve several clients."
          meta={
            <>
              <Badge tone="neutral">{pluralise(db.batches.length, 'batch', 'batches')}</Badge>
              <Badge tone="warn">
                {batchRows(db).filter((r) => r.state === 'expiring' || r.state === 'expired').length} expiring or expired
              </Badge>
            </>
          }
        />
        <SectionNav section="shipments" />
      </div>

      <Panel>
        <FilterBar
          search={search}
          onSearch={setSearch}
          searchPlaceholder="Batch number, product, party…"
          activeCount={activeCount}
          onClear={clear}
          primary={
            <>
              <Select
                value={values.product}
                onChange={(v) => setValue('product', v)}
                allowEmpty
                emptyLabel="Any product"
                placeholder="Any product"
                options={products.map((p) => ({ value: p.id, label: p.genericName }))}
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
                value={values.expiry}
                onChange={(v) => setValue('expiry', v)}
                allowEmpty
                emptyLabel="Any expiry state"
                placeholder="Any expiry state"
                options={(Object.keys(STATE_LABEL) as BatchRow['state'][]).map((s) => ({
                  value: s,
                  label: STATE_LABEL[s],
                }))}
              />
            </>
          }
        />

        <DataTable
          rows={rows ?? []}
          columns={columns}
          rowKey={(r) => r.batch.id}
          loading={loading}
          onRowClick={(r) => navigate(`/batches/${r.batch.id}`)}
          exportName="batches"
          exportFilters={queryString}
          onExport={(count) => void logExport('batch list', queryString, count)}
          rowTone={(r) => (r.state === 'expired' ? 'bg-danger-50/40' : r.state === 'expiring' ? 'bg-warn-50/30' : undefined)}
          toolbar={
            <span className="flex flex-wrap items-center gap-2.5 text-xs text-ink-500">
              <SlidersHorizontal className="h-3.5 w-3.5" />
              {rows ? pluralise(rows.length, 'batch', 'batches') : '…'}
            </span>
          }
          empty={
            <EmptyState
              icon={<Package className="h-5 w-5" />}
              title={activeCount > 0 ? 'No batch matches these filters' : 'No batch recorded yet'}
              description={
                activeCount > 0
                  ? 'Try clearing the expiry state or the manufacturer.'
                  : 'A batch is recorded when it is added to a shipment against an indent line.'
              }
              action={
                <WriteOnly>
                  <LinkButton to="/shipments" variant="primary" size="sm">
                    Open a shipment
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
