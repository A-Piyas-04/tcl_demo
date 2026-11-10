/**
 * The commission book (UC-09 step 9, AC-09).
 *
 * Commission is TCL's only revenue. It is earned on an indent, payable by the
 * client, and recorded once per indent. The goods themselves are invoiced by
 * the manufacturer to the client and never pass through TCL's books, so
 * nothing on this screen is a trading profit on the goods.
 *
 * A basis of "to be decided" is a real state, not missing data: the rate is
 * still being negotiated, the indent proceeds, and nothing can be invoiced
 * until there is a figure.
 */

import { useNavigate } from 'react-router-dom'
import { Coins, Receipt, SlidersHorizontal, Wallet } from 'lucide-react'
import { useDb } from '@/data/store'
import {
  clients as clientList,
  commissionMoney,
  commissionRows,
  commissionTotals,
  type CommissionRow,
} from '@/data/selectors'
import { COMMISSION_BASIS_LABEL, COMMISSION_STATUS_LABEL } from '@/data/reference'
import { logExport } from '@/data/api'
import { useAsyncData, useUrlFilters } from '@/lib/hooks'
import { fmtDate, fmtMoney, fmtMoneyTotals, pluralise } from '@/lib/utils'
import type { Commission, CommissionBasis } from '@/data/types'
import {
  Badge,
  Button,
  Column,
  DataTable,
  EmptyState,
  FilterBar,
  KpiTile,
  Panel,
  PageHeading,
  Select,
  TileGrid,
  Tooltip,
  WriteOnly,
} from '@/components/ui'
import { SectionNav } from '@/layout/sections'
import { CommissionStatusBadge } from './shared'
import { CommissionActionsMenu } from './CommissionActions'

const DEFAULTS = {
  status: '',
  client: '',
  basis: '',
  tbd: '',
}

export function CommissionTracker() {
  const db = useDb()
  const navigate = useNavigate()
  const { values, setValue, clear, activeCount, queryString } = useUrlFilters(DEFAULTS)

  const totals = commissionTotals(db)
  const money = commissionMoney(db)

  const { data: rows, loading } = useAsyncData<CommissionRow[]>(() => {
    return commissionRows(db)
      .filter((row) => {
        if (values.status && row.commission.status !== values.status) return false
        if (values.client && row.indent.clientCompanyId !== values.client) return false
        if (values.basis && row.commission.basis !== values.basis) return false
        if (values.tbd === '1' && row.commission.basis !== 'TBD') return false
        return true
      })
      .sort((a, b) => (a.indent.orderDate < b.indent.orderDate ? 1 : -1))
  }, [values])

  const columns: Column<CommissionRow>[] = [
    {
      key: 'indent',
      header: 'Indent',
      pinned: true,
      sortable: true,
      width: '10.5rem',
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
      key: 'client',
      header: 'Payable by',
      sortable: true,
      value: (r) => r.clientName,
      cell: (r) => (
        <span className="block min-w-0">
          <span className="block truncate text-sm text-ink-900">{r.clientName}</span>
          <span className="block truncate text-2xs text-ink-500">on {r.manufacturerName}</span>
        </span>
      ),
    },
    {
      key: 'value',
      header: 'Indent value',
      align: 'right',
      sortable: true,
      width: '9rem',
      value: (r) => r.indentValue,
      cell: (r) => (
        <span className="tabular text-sm text-ink-700">
          {fmtMoney(r.indentValue, r.indent.currency, { decimals: 0 })}
        </span>
      ),
    },
    {
      key: 'basis',
      header: 'Basis',
      sortable: true,
      width: '9rem',
      value: (r) => r.commission.basis,
      cell: (r) =>
        r.commission.basis === 'TBD' ? (
          <Tooltip content="The rate is still being negotiated with the client. The indent proceeds; nothing can be invoiced until a figure is agreed.">
            <Badge tone="warn">To be decided</Badge>
          </Tooltip>
        ) : (
          <span className="text-xs text-ink-700">{COMMISSION_BASIS_LABEL[r.commission.basis]}</span>
        ),
    },
    {
      key: 'rate',
      header: 'Rate',
      align: 'right',
      sortable: true,
      width: '5rem',
      value: (r) => r.commission.ratePct,
      cell: (r) => (
        <span className="tabular text-xs text-ink-700">
          {r.commission.ratePct != null ? `${r.commission.ratePct}%` : '—'}
        </span>
      ),
    },
    {
      key: 'amount',
      header: 'Commission',
      align: 'right',
      sortable: true,
      width: '9rem',
      value: (r) => r.commission.amount,
      cell: (r) =>
        r.commission.amount != null ? (
          <span className="text-sm font-medium tabular text-ink-900">
            {fmtMoney(r.commission.amount, r.commission.currency)}
          </span>
        ) : (
          <span className="text-xs text-warn-600">not agreed</span>
        ),
    },
    {
      key: 'status',
      header: 'Status',
      sortable: true,
      width: '8rem',
      value: (r) => r.commission.status,
      cell: (r) => <CommissionStatusBadge status={r.commission.status} />,
    },
    {
      key: 'invoiced',
      header: 'Invoiced on',
      align: 'right',
      sortable: true,
      width: '8rem',
      value: (r) => r.commission.invoicedOn,
      cell: (r) => (
        <span className="block min-w-0 text-right">
          <span className="block text-xs tabular text-ink-600">{fmtDate(r.commission.invoicedOn)}</span>
          {r.commission.invoiceReference ? (
            <span className="block truncate font-mono text-2xs text-ink-400">{r.commission.invoiceReference}</span>
          ) : null}
        </span>
      ),
    },
    {
      key: 'received',
      header: 'Received',
      align: 'right',
      sortable: true,
      width: '8.5rem',
      value: (r) => r.commission.receivedAmount,
      cell: (r) => (
        <span className="tabular text-sm text-ink-700">
          {r.commission.receivedAmount > 0 ? fmtMoney(r.commission.receivedAmount, r.commission.currency) : '—'}
        </span>
      ),
    },
    {
      key: 'outstanding',
      header: 'Outstanding',
      align: 'right',
      sortable: true,
      width: '9rem',
      value: (r) => r.outstanding,
      cell: (r) =>
        r.commission.amount == null ? (
          <span className="text-xs text-ink-400">—</span>
        ) : r.outstanding > 0 ? (
          <span className="text-sm font-medium tabular text-warn-600">
            {fmtMoney(r.outstanding, r.commission.currency)}
          </span>
        ) : (
          <Badge tone="ok">Settled</Badge>
        ),
    },
    {
      key: 'actions',
      header: '',
      width: '3rem',
      cell: (r) => <CommissionActionsMenu commission={r.commission} />,
    },
  ]

  return (
    <div className="space-y-4">
      <div>
        <PageHeading
          title="Commission"
          subtitle="TCL's earnings on each indent, payable by the client. Agree the terms, invoice, and record what comes in. The goods are invoiced by the manufacturer to the client and never enter these figures."
          meta={
            <>
              <Badge tone="neutral">{pluralise(db.commissions.length, 'record')}</Badge>
              {totals.tbdCount > 0 ? <Badge tone="warn">{totals.tbdCount} with terms still to be agreed</Badge> : null}
            </>
          }
        />
        <SectionNav section="commission" />
      </div>

      <TileGrid>
        <KpiTile
          label="Earned"
          value={fmtMoneyTotals(money.earned, { compact: true, decimals: 0 })}
          icon={<Coins className="h-4 w-4" />}
          hint={`Across ${pluralise(db.commissions.filter((c) => c.status !== 'WRITTEN_OFF').length, 'live record')}`}
        />
        <KpiTile
          label="Invoiced"
          value={fmtMoneyTotals(money.invoiced, { compact: true, decimals: 0 })}
          tone="accent"
          icon={<Receipt className="h-4 w-4" />}
          hint={`${totals.pendingCount} not yet invoiced`}
        />
        <KpiTile
          label="Received"
          value={fmtMoneyTotals(money.received, { compact: true, decimals: 0 })}
          tone="ok"
          icon={<Wallet className="h-4 w-4" />}
          hint={totals.earned > 0 ? `${Math.round((totals.received / totals.earned) * 100)}% of what is earned` : undefined}
        />
        <KpiTile
          label="Outstanding"
          value={fmtMoneyTotals(money.outstanding, { compact: true, decimals: 0 })}
          tone={totals.outstanding > 0 ? 'warn' : 'default'}
          icon={<Coins className="h-4 w-4" />}
          hint="Earned but not yet in the bank"
        />
      </TileGrid>

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
                options={(Object.keys(COMMISSION_STATUS_LABEL) as Commission['status'][]).map((s) => ({
                  value: s,
                  label: COMMISSION_STATUS_LABEL[s],
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
              <Select
                value={values.basis}
                onChange={(v) => setValue('basis', v)}
                allowEmpty
                emptyLabel="Any basis"
                placeholder="Any basis"
                options={(Object.keys(COMMISSION_BASIS_LABEL) as CommissionBasis[]).map((b) => ({
                  value: b,
                  label: COMMISSION_BASIS_LABEL[b],
                }))}
              />
            </>
          }
        />

        <DataTable
          rows={rows ?? []}
          columns={columns}
          rowKey={(r) => r.commission.id}
          loading={loading}
          onRowClick={(r) => navigate(`/indents/${r.indent.id}`)}
          exportName="commission-book"
          exportFilters={queryString}
          onExport={(count) => void logExport('commission book', queryString, count)}
          rowTone={(r) => (r.commission.status === 'WRITTEN_OFF' ? 'bg-paper-200/50' : undefined)}
          toolbar={
            <span className="flex flex-wrap items-center gap-2.5 text-xs text-ink-500">
              <SlidersHorizontal className="h-3.5 w-3.5" />
              {rows ? pluralise(rows.length, 'record') : '…'}
              {rows ? (
                <span className="tabular">
                  outstanding{' '}
                  {fmtMoneyTotals(
                    rows.map((r) => ({ amount: Math.max(0, r.outstanding), currency: r.commission.currency })),
                    { compact: true },
                  )}
                </span>
              ) : null}
            </span>
          }
          empty={
            <EmptyState
              icon={<Coins className="h-5 w-5" />}
              title={activeCount > 0 ? 'No commission record matches these filters' : 'No commission recorded yet'}
              description={
                activeCount > 0
                  ? 'Try clearing the status or basis filter.'
                  : 'A commission record is created with each indent. Raise an indent from a client order and the record appears here.'
              }
              action={
                <WriteOnly>
                  <Button variant="primary" size="sm" onClick={() => navigate('/client-orders/new')}>
                    Record a client order
                  </Button>
                </WriteOnly>
              }
            />
          }
        />
      </Panel>

    </div>
  )
}

