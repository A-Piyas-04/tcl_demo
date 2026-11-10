/**
 * Shipments (UC-10, AC-10).
 *
 * The exceptions are the reason this list exists: a consignment held at
 * customs, and one whose ETA has passed with no arrival recorded. Both are
 * highlighted on the row rather than hidden behind a filter.
 *
 * Customs clearance is per shipment: one bill of entry clears the whole
 * consignment (assumption A7).
 */

import { useNavigate } from 'react-router-dom'
import { ShieldAlert, Ship, SlidersHorizontal } from 'lucide-react'
import { SectionNav } from '@/layout/sections'
import { useDb } from '@/data/store'
import { clients as clientList, manufacturers as mfrList } from '@/data/selectors'
import { SHIPMENT_MODE_LABEL, SHIPMENT_STATUS_LABEL } from '@/data/reference'
import { logExport } from '@/data/api'
import { useAsyncData, useUrlFilters, useUrlSearch } from '@/lib/hooks'
import { fmtDate, fmtQty, pluralise, todayIso } from '@/lib/utils'
import type { Indent, Shipment, ShipmentMode, ShipmentStatus } from '@/data/types'
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
import { ShipmentStatusBadge, sumQty } from './shared'

interface Row {
  shipment: Shipment
  indent: Indent | undefined
  manufacturerName: string
  clientName: string
  batchCount: number
  qty: number
  uom: string
  overdue: boolean
}

const DEFAULTS = {
  q: '',
  status: '',
  mode: '',
  manufacturer: '',
  client: '',
}

export function ShipmentList() {
  const db = useDb()
  const navigate = useNavigate()
  const { values, setValue, clear, activeCount, queryString } = useUrlFilters(DEFAULTS)
  const [search, setSearch] = useUrlSearch(values.q, (v) => setValue('q', v))
  const today = todayIso()

  const { data: rows, loading } = useAsyncData<Row[]>(() => {
    return db.shipments
      .map((shipment) => {
        const indent = db.indents.find((i) => i.id === shipment.indentId)
        const lines = db.shipmentLines.filter((l) => l.shipmentId === shipment.id)
        const totals = sumQty(lines.map((l) => ({ qty: l.qty, uom: l.qtyUom })))
        return {
          shipment,
          indent,
          manufacturerName: indent
            ? (db.companies.find((c) => c.id === indent.manufacturerCompanyId)?.displayName ?? '—')
            : '—',
          clientName: indent ? (db.companies.find((c) => c.id === indent.clientCompanyId)?.displayName ?? '—') : '—',
          batchCount: lines.length,
          qty: totals.qty,
          uom: totals.uom,
          overdue: Boolean(
            shipment.eta &&
              shipment.eta < today &&
              !shipment.actualArrivalDate &&
              shipment.status !== 'CANCELLED',
          ),
        }
      })
      .filter((row) => {
        const q = values.q.trim().toLowerCase()
        if (q) {
          const hit =
            row.shipment.shipmentRef.toLowerCase().includes(q) ||
            (row.shipment.blAwbNumber ?? '').toLowerCase().includes(q) ||
            (row.indent?.indentNumber ?? '').toLowerCase().includes(q) ||
            row.manufacturerName.toLowerCase().includes(q) ||
            row.clientName.toLowerCase().includes(q)
          if (!hit) return false
        }
        if (values.status && row.shipment.status !== values.status) return false
        if (values.mode && row.shipment.mode !== values.mode) return false
        if (values.manufacturer && row.indent?.manufacturerCompanyId !== values.manufacturer) return false
        if (values.client && row.indent?.clientCompanyId !== values.client) return false
        return true
      })
      .sort((a, b) => ((a.shipment.etd ?? '') < (b.shipment.etd ?? '') ? 1 : -1))
  }, [values, today])

  const columns: Column<Row>[] = [
    {
      key: 'ref',
      header: 'Shipment',
      pinned: true,
      sortable: true,
      width: '10rem',
      value: (r) => r.shipment.shipmentRef,
      cell: (r) => (
        <span className="block min-w-0">
          <span className="block truncate font-mono text-[0.8rem] tabular font-medium text-ink-900">
            {r.shipment.shipmentRef}
          </span>
          <span className="block truncate text-2xs text-ink-500">{r.indent?.indentNumber ?? 'indent missing'}</span>
        </span>
      ),
    },
    {
      key: 'parties',
      header: 'From, for',
      sortable: true,
      value: (r) => r.manufacturerName,
      cell: (r) => <NameCell title={r.manufacturerName} subtitle={`for ${r.clientName}`} />,
    },
    {
      key: 'mode',
      header: 'Mode',
      sortable: true,
      width: '5.5rem',
      value: (r) => r.shipment.mode,
      cell: (r) => <Badge tone="outline">{SHIPMENT_MODE_LABEL[r.shipment.mode]}</Badge>,
    },
    {
      key: 'bl',
      header: 'BL or AWB',
      width: '8.5rem',
      value: (r) => r.shipment.blAwbNumber,
      cell: (r) => <span className="font-mono text-2xs text-ink-600">{r.shipment.blAwbNumber ?? '—'}</span>,
    },
    {
      key: 'ports',
      header: 'Ports',
      value: (r) => `${r.shipment.portOfLoading ?? ''} ${r.shipment.portOfDischarge ?? ''}`,
      cell: (r) => (
        <span className="block min-w-0 text-xs text-ink-600">
          <span className="block truncate">{r.shipment.portOfLoading ?? '—'}</span>
          <span className="block truncate text-ink-500">to {r.shipment.portOfDischarge ?? '—'}</span>
        </span>
      ),
    },
    {
      key: 'etd',
      header: 'ETD',
      align: 'right',
      sortable: true,
      width: '7rem',
      value: (r) => r.shipment.etd,
      cell: (r) => <span className="text-xs tabular text-ink-600">{fmtDate(r.shipment.etd)}</span>,
    },
    {
      key: 'eta',
      header: 'ETA',
      align: 'right',
      sortable: true,
      width: '7.5rem',
      value: (r) => r.shipment.eta,
      cell: (r) =>
        r.overdue ? (
          <Tooltip content="The ETA has passed and no arrival has been recorded. Chase the forwarder.">
            <span className="text-xs font-medium tabular text-warn-600">{fmtDate(r.shipment.eta)}</span>
          </Tooltip>
        ) : (
          <span className="text-xs tabular text-ink-600">{fmtDate(r.shipment.eta)}</span>
        ),
    },
    {
      key: 'arrival',
      header: 'Arrived',
      align: 'right',
      sortable: true,
      width: '7rem',
      value: (r) => r.shipment.actualArrivalDate,
      cell: (r) => (
        <span className="text-xs tabular text-ink-600">{fmtDate(r.shipment.actualArrivalDate)}</span>
      ),
    },
    {
      key: 'cleared',
      header: 'Cleared',
      align: 'right',
      sortable: true,
      width: '7rem',
      value: (r) => r.shipment.customsClearedOn,
      cell: (r) => (
        <span className="text-xs tabular text-ink-600">{fmtDate(r.shipment.customsClearedOn)}</span>
      ),
    },
    {
      key: 'status',
      header: 'Status',
      sortable: true,
      width: '9.5rem',
      value: (r) => r.shipment.status,
      cell: (r) => (
        <span className="flex flex-col items-start gap-0.5">
          <ShipmentStatusBadge status={r.shipment.status} />
          {r.shipment.status === 'HELD_AT_CUSTOMS' && r.shipment.holdRemark ? (
            <Tooltip content={r.shipment.holdRemark}>
              <span className="truncate text-2xs text-danger-700">why it is held</span>
            </Tooltip>
          ) : null}
        </span>
      ),
    },
    {
      key: 'batches',
      header: 'Batches',
      align: 'right',
      sortable: true,
      width: '6rem',
      value: (r) => r.batchCount,
      cell: (r) =>
        r.batchCount > 0 ? (
          <span className="tabular text-sm text-ink-800">{r.batchCount}</span>
        ) : (
          <Tooltip content="No batch recorded yet, so nothing counts as shipped against the indent line.">
            <span className="text-xs text-warn-600">none</span>
          </Tooltip>
        ),
    },
    {
      key: 'qty',
      header: 'Quantity',
      align: 'right',
      sortable: true,
      width: '8rem',
      value: (r) => r.qty,
      cell: (r) => <span className="tabular text-sm text-ink-800">{r.qty > 0 ? fmtQty(r.qty, r.uom) : '—'}</span>,
    },
    {
      key: 'cnf',
      header: 'C&F agent',
      optional: true,
      value: (r) => r.shipment.cnfAgentName,
      cell: (r) => <span className="truncate text-xs text-ink-600">{r.shipment.cnfAgentName ?? '—'}</span>,
    },
    {
      key: 'forwarder',
      header: 'Forwarder',
      optional: true,
      value: (r) => r.shipment.forwarderName,
      cell: (r) => <span className="truncate text-xs text-ink-600">{r.shipment.forwarderName ?? '—'}</span>,
    },
  ]

  const held = db.shipments.filter((s) => s.status === 'HELD_AT_CUSTOMS').length
  const overdue = db.shipments.filter(
    (s) => s.eta && s.eta < today && !s.actualArrivalDate && s.status !== 'CANCELLED',
  ).length

  return (
    <div className="space-y-4">
      <div>
        <PageHeading
          title="Shipments"
          subtitle="What the manufacturers have despatched against each indent, and where it has reached. A shipment is added from its indent once the manufacturer confirms despatch."
          meta={
            <>
              <Badge tone="neutral">{pluralise(db.shipments.length, 'shipment')}</Badge>
              {held > 0 ? (
                <Badge tone="danger">
                  <ShieldAlert className="h-3 w-3" />
                  {held} held at customs
                </Badge>
              ) : null}
              {overdue > 0 ? <Badge tone="warn">{overdue} past ETA with no arrival</Badge> : null}
            </>
          }
        />
        <SectionNav section="shipments" />
      </div>

      <Panel>
        <FilterBar
          search={search}
          onSearch={setSearch}
          searchPlaceholder="Shipment, indent, BL or party…"
          activeCount={activeCount}
          onClear={clear}
          moreActive={['mode', 'manufacturer'].filter((k) => values[k as keyof typeof values]).length}
          primary={
            <>
              <Select
                value={values.status}
                onChange={(v) => setValue('status', v)}
                allowEmpty
                emptyLabel="Any status"
                placeholder="Any status"
                options={(Object.keys(SHIPMENT_STATUS_LABEL) as ShipmentStatus[]).map((s) => ({
                  value: s,
                  label: SHIPMENT_STATUS_LABEL[s],
                }))}
              />
              <Select
                value={values.client}
                onChange={(v) => setValue('client', v)}
                allowEmpty
                emptyLabel="Any client"
                placeholder="Any client"
                options={clientList(db).map((c) => ({ value: c.id, label: c.displayName }))}
              />
            </>
          }
          more={
            <>
              <Select
                value={values.mode}
                onChange={(v) => setValue('mode', v)}
                allowEmpty
                emptyLabel="Any mode"
                placeholder="Any mode"
                options={(Object.keys(SHIPMENT_MODE_LABEL) as ShipmentMode[]).map((m) => ({
                  value: m,
                  label: SHIPMENT_MODE_LABEL[m],
                }))}
              />
              <Select
                value={values.manufacturer}
                onChange={(v) => setValue('manufacturer', v)}
                allowEmpty
                emptyLabel="Any manufacturer"
                placeholder="Any manufacturer"
                options={mfrList(db).map((m) => ({ value: m.id, label: m.displayName }))}
              />
            </>
          }
        />

        <DataTable
          rows={rows ?? []}
          columns={columns}
          rowKey={(r) => r.shipment.id}
          loading={loading}
          onRowClick={(r) => navigate(`/shipments/${r.shipment.id}`)}
          exportName="shipments"
          exportFilters={queryString}
          onExport={(count) => void logExport('shipment list', queryString, count)}
          rowTone={(r) =>
            r.shipment.status === 'HELD_AT_CUSTOMS'
              ? 'bg-danger-50/50'
              : r.overdue
                ? 'bg-warn-50/40'
                : undefined
          }
          toolbar={
            <span className="flex flex-wrap items-center gap-2.5 text-xs text-ink-500">
              <SlidersHorizontal className="h-3.5 w-3.5" />
              {rows ? pluralise(rows.length, 'shipment') : '…'}
              <span className="flex items-center gap-1">
                <span className="h-2.5 w-2.5 rounded-sm border border-danger-200 bg-danger-50" /> held at customs
              </span>
              <span className="flex items-center gap-1">
                <span className="h-2.5 w-2.5 rounded-sm border border-warn-200 bg-warn-50" /> past ETA
              </span>
            </span>
          }
          empty={
            <EmptyState
              icon={<Ship className="h-5 w-5" />}
              title={activeCount > 0 ? 'No shipment matches these filters' : 'No shipment recorded yet'}
              description={
                activeCount > 0
                  ? 'Try clearing the status or mode filter.'
                  : 'A shipment is recorded against an indent when the manufacturer confirms despatch.'
              }
              action={
                <WriteOnly>
                  <LinkButton to="/indents" variant="primary" size="sm">
                    Open an indent
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
