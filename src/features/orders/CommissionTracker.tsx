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

import * as React from 'react'
import { useNavigate } from 'react-router-dom'
import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  ResponsiveContainer,
  Tooltip as RechartsTooltip,
  XAxis,
  YAxis,
} from 'recharts'
import { Ban, Coins, MoreHorizontal, Receipt, SlidersHorizontal, Wallet } from 'lucide-react'
import { format, parseISO, subMonths } from 'date-fns'
import { useDb } from '@/data/store'
import { clients as clientList, commissionRows, commissionTotals, type CommissionRow } from '@/data/selectors'
import { COMMISSION_BASIS_LABEL, COMMISSION_STATUS_LABEL } from '@/data/reference'
import { logExport, updateCommission } from '@/data/api'
import { runAction, useAsyncData, useUrlFilters } from '@/lib/hooks'
import { fmtDate, fmtMoney, pluralise, todayIso } from '@/lib/utils'
import type { Commission, CommissionBasis } from '@/data/types'
import {
  Badge,
  Button,
  Column,
  DataTable,
  DateInput,
  Dialog,
  DialogFooterActions,
  EmptyState,
  FormGrid,
  FormRow,
  InlineError,
  InlineWarning,
  Input,
  KpiTile,
  Menu,
  MenuContent,
  MenuItem,
  MenuTrigger,
  NumberInput,
  Panel,
  PanelHeader,
  PageHeading,
  Select,
  TileGrid,
  Textarea,
  Tooltip,
  WriteOnly,
} from '@/components/ui'
import { ClearFiltersButton, CommissionStatusBadge } from './shared'

// Two series, teal and amber: validated for colour-vision separation against
// the paper surface, and both carry a legend as well as their colour.
const EARNED = '#159684'
const RECEIVED = '#b4762a'

type ActionKind = 'invoice' | 'receipt' | 'writeoff'

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
  const [action, setAction] = React.useState<{ kind: ActionKind; row: CommissionRow } | null>(null)

  const totals = commissionTotals(db)

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

  /** Earned against received, by month, for the last twelve months. */
  const chartData = React.useMemo(() => {
    const buckets: { key: string; label: string; earned: number; received: number }[] = []
    const index = new Map<string, number>()
    for (let i = 11; i >= 0; i--) {
      const d = subMonths(new Date(), i)
      const key = format(d, 'yyyy-MM')
      index.set(key, buckets.length)
      buckets.push({ key, label: format(d, 'MMM'), earned: 0, received: 0 })
    }
    for (const c of db.commissions) {
      if (c.status === 'WRITTEN_OFF') continue
      const indent = db.indents.find((i) => i.id === c.indentId)
      const earnedOn = c.invoicedOn ?? indent?.orderDate ?? null
      if (earnedOn && c.amount) {
        const slot = index.get(format(parseISO(earnedOn), 'yyyy-MM'))
        if (slot != null) buckets[slot]!.earned += c.amount
      }
      if (c.receivedOn && c.receivedAmount) {
        const slot = index.get(format(parseISO(c.receivedOn), 'yyyy-MM'))
        if (slot != null) buckets[slot]!.received += c.receivedAmount
      }
    }
    return buckets.map((b) => ({
      ...b,
      earned: Math.round(b.earned),
      received: Math.round(b.received),
    }))
  }, [db])

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
      cell: (r) => (
        <WriteOnly>
          <Menu>
            <MenuTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                aria-label="Commission actions"
                onClick={(e) => e.stopPropagation()}
              >
                <MoreHorizontal className="h-4 w-4" />
              </Button>
            </MenuTrigger>
            <MenuContent>
              {/* The menu is portalled but still a React child of the row, so
                  a selection would otherwise also open the indent. */}
              <div onClick={(e) => e.stopPropagation()}>
              <MenuItem
                icon={<Receipt className="h-3.5 w-3.5" />}
                disabled={r.commission.amount == null}
                onSelect={() => setAction({ kind: 'invoice', row: r })}
              >
                Mark invoiced
              </MenuItem>
              <MenuItem
                icon={<Wallet className="h-3.5 w-3.5" />}
                disabled={r.commission.amount == null}
                onSelect={() => setAction({ kind: 'receipt', row: r })}
              >
                Record a receipt
              </MenuItem>
              <MenuItem
                icon={<Ban className="h-3.5 w-3.5" />}
                danger
                disabled={r.commission.amount == null}
                onSelect={() => setAction({ kind: 'writeoff', row: r })}
              >
                Write off
              </MenuItem>
              </div>
            </MenuContent>
          </Menu>
        </WriteOnly>
      ),
    },
  ]

  return (
    <div className="space-y-4">
      <PageHeading
        title="Commission"
        subtitle="TCL's earnings on each indent, payable by the client. The goods are invoiced by the manufacturer to the client and never enter these figures."
        meta={
          <>
            <Badge tone="neutral">{pluralise(db.commissions.length, 'record')}</Badge>
            {totals.tbdCount > 0 ? <Badge tone="warn">{totals.tbdCount} still to be decided</Badge> : null}
          </>
        }
      />

      <TileGrid>
        <KpiTile
          label="Earned"
          value={fmtMoney(totals.earned, 'USD', { compact: true, decimals: 0 })}
          icon={<Coins className="h-4 w-4" />}
          hint={`Across ${pluralise(db.commissions.filter((c) => c.status !== 'WRITTEN_OFF').length, 'live record')}`}
        />
        <KpiTile
          label="Invoiced"
          value={fmtMoney(totals.invoiced, 'USD', { compact: true, decimals: 0 })}
          tone="accent"
          icon={<Receipt className="h-4 w-4" />}
          hint={`${totals.pendingCount} not yet invoiced`}
        />
        <KpiTile
          label="Received"
          value={fmtMoney(totals.received, 'USD', { compact: true, decimals: 0 })}
          tone="ok"
          icon={<Wallet className="h-4 w-4" />}
          hint={totals.earned > 0 ? `${Math.round((totals.received / totals.earned) * 100)}% of what is earned` : undefined}
        />
        <KpiTile
          label="Outstanding"
          value={fmtMoney(totals.outstanding, 'USD', { compact: true, decimals: 0 })}
          tone={totals.outstanding > 0 ? 'warn' : 'default'}
          icon={<Coins className="h-4 w-4" />}
          hint="Earned but not yet in the bank"
        />
      </TileGrid>

      <Panel>
        <PanelHeader
          title="Commission by month"
          subtitle="What was earned against what came in, over the last twelve months"
        />
        <div className="p-4">
          <div className="h-56 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={chartData} margin={{ top: 4, right: 8, left: 0, bottom: 0 }} barGap={2}>
                <CartesianGrid vertical={false} stroke="#e6e1d8" />
                <XAxis
                  dataKey="label"
                  tickLine={false}
                  axisLine={{ stroke: '#e6e1d8' }}
                  tick={{ fill: '#3f7389', fontSize: 11 }}
                />
                <YAxis
                  tickLine={false}
                  axisLine={false}
                  width={58}
                  tick={{ fill: '#3f7389', fontSize: 11 }}
                  tickFormatter={(v: number) => fmtMoney(v, 'USD', { compact: true, decimals: 0 })}
                />
                <RechartsTooltip
                  cursor={{ fill: 'rgba(15,34,45,0.04)' }}
                  contentStyle={{
                    borderRadius: 6,
                    border: '1px solid #e6e1d8',
                    fontSize: 12,
                    boxShadow: '0 10px 30px -12px rgb(15 34 45 / 0.28)',
                  }}
                  formatter={(value: number, name: string) => [fmtMoney(value, 'USD', { decimals: 0 }), name]}
                />
                <Legend
                  iconType="square"
                  iconSize={9}
                  wrapperStyle={{ fontSize: 11, color: '#3f7389', paddingTop: 4 }}
                />
                <Bar dataKey="earned" name="Earned" fill={EARNED} radius={[4, 4, 0, 0]} maxBarSize={18} />
                <Bar dataKey="received" name="Received" fill={RECEIVED} radius={[4, 4, 0, 0]} maxBarSize={18} />
              </BarChart>
            </ResponsiveContainer>
          </div>
          <p className="mt-2 text-xs text-ink-500">
            A record is counted as earned in the month it was invoiced, or in the month of the indent while it is still
            pending. Written-off records are left out of both series.
          </p>
        </div>
      </Panel>

      <Panel>
        <div className="grid gap-2.5 border-b border-paper-200 p-3 sm:grid-cols-2 lg:grid-cols-4">
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
          <div className="flex items-center gap-2">
            <Button
              variant={values.tbd === '1' ? 'primary' : 'secondary'}
              size="sm"
              onClick={() => setValue('tbd', values.tbd === '1' ? '' : '1')}
            >
              To be decided only
            </Button>
            <ClearFiltersButton count={activeCount} onClear={clear} />
          </div>
        </div>

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
                  outstanding {fmtMoney(rows.reduce((s, r) => s + Math.max(0, r.outstanding), 0), 'USD', { compact: true })}
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

      <CommissionActionDialog action={action} onClose={() => setAction(null)} />
    </div>
  )
}

// -------------------------------------------------------- row actions

function CommissionActionDialog({
  action,
  onClose,
}: {
  action: { kind: ActionKind; row: CommissionRow } | null
  onClose: () => void
}) {
  const [reference, setReference] = React.useState('')
  const [date, setDate] = React.useState(todayIso())
  const [amount, setAmount] = React.useState<number | null>(null)
  const [remark, setRemark] = React.useState('')
  const [busy, setBusy] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)

  const commission = action?.row.commission
  const due = commission?.amount ?? 0
  const outstanding = Math.round(((commission?.amount ?? 0) - (commission?.receivedAmount ?? 0)) * 100) / 100

  React.useEffect(() => {
    if (!action) return
    setReference(action.row.commission.invoiceReference ?? '')
    setDate(action.kind === 'invoice' ? (action.row.commission.invoicedOn ?? todayIso()) : todayIso())
    setAmount(action.kind === 'receipt' ? Math.max(0, outstanding) : null)
    setRemark(action.row.commission.remarks ?? '')
    setError(null)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [action])

  if (!action || !commission) return null

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    let patch: Partial<Commission>
    if (action.kind === 'invoice') {
      patch = { status: 'INVOICED', invoiceReference: reference.trim() || null, invoicedOn: date || null }
    } else if (action.kind === 'receipt') {
      const received = Math.round(((commission.receivedAmount ?? 0) + (amount ?? 0)) * 100) / 100
      patch = {
        receivedAmount: received,
        receivedOn: date || null,
        status: received >= due ? 'RECEIVED' : 'PARTIALLY_RECEIVED',
        invoicedOn: commission.invoicedOn ?? date,
        invoiceReference: commission.invoiceReference ?? (reference.trim() || null),
      }
    } else {
      patch = {
        status: 'WRITTEN_OFF',
        remarks: remark.trim() || null,
        invoicedOn: commission.invoicedOn ?? date,
      }
    }

    setBusy(true)
    const ok = await runAction(() => updateCommission(commission.id, patch), {
      success:
        action.kind === 'invoice'
          ? `Commission on ${action.row.indent.indentNumber} marked invoiced.`
          : action.kind === 'receipt'
            ? `Receipt recorded against ${action.row.indent.indentNumber}.`
            : `Commission on ${action.row.indent.indentNumber} written off.`,
      onError: setError,
    })
    setBusy(false)
    if (ok !== null) onClose()
  }

  const copy = {
    invoice: {
      title: 'Mark the commission invoiced',
      description: `TCL invoices ${action.row.clientName} for its commission on ${action.row.indent.indentNumber}.`,
      confirm: 'Mark invoiced',
    },
    receipt: {
      title: 'Record a receipt',
      description: `Full or partial. Receipts larger than the ${fmtMoney(due, commission.currency)} due are refused.`,
      confirm: 'Record the receipt',
    },
    writeoff: {
      title: 'Write off this commission',
      description: 'The record stays with its history and drops out of the earned and outstanding figures.',
      confirm: 'Write it off',
    },
  }[action.kind]

  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open) onClose()
      }}
      icon={
        action.kind === 'writeoff' ? (
          <Ban className="h-5 w-5 text-danger-600" />
        ) : (
          <Receipt className="h-5 w-5 text-accent-600" />
        )
      }
      title={copy.title}
      description={copy.description}
    >
      <form onSubmit={submit} className="space-y-3.5">
        <div className="rounded-md border border-paper-300 bg-paper-50/60 px-3 py-2 text-xs text-ink-600">
          <span className="font-mono text-ink-800">{action.row.indent.indentNumber}</span> · indent value{' '}
          {fmtMoney(action.row.indentValue, commission.currency, { decimals: 0 })} · commission{' '}
          {commission.amount != null ? fmtMoney(commission.amount, commission.currency) : 'not agreed'} · received{' '}
          {fmtMoney(commission.receivedAmount, commission.currency)}
        </div>

        {action.kind === 'invoice' ? (
          <FormGrid>
            <FormRow label="Invoice reference" required>
              <Input value={reference} onChange={(e) => setReference(e.target.value)} mono placeholder="TCL/COM/2026/004" />
            </FormRow>
            <FormRow label="Invoiced on" required>
              <DateInput value={date} onChange={(e) => setDate(e.target.value)} />
            </FormRow>
          </FormGrid>
        ) : null}

        {action.kind === 'receipt' ? (
          <>
            <FormGrid>
              <FormRow
                label={`Amount received (${commission.currency})`}
                required
                hint={`${fmtMoney(outstanding, commission.currency)} is outstanding.`}
              >
                <NumberInput
                  value={amount}
                  onChange={setAmount}
                  min={0}
                  step="any"
                  invalid={Boolean(amount && amount > outstanding)}
                />
              </FormRow>
              <FormRow label="Received on" required>
                <DateInput value={date} onChange={(e) => setDate(e.target.value)} />
              </FormRow>
            </FormGrid>
            {amount && amount > outstanding ? (
              <InlineWarning>
                <span>
                  That is more than the {fmtMoney(outstanding, commission.currency)} outstanding. Receipts cannot exceed
                  the commission due, so the save will be refused.
                </span>
              </InlineWarning>
            ) : null}
            {!commission.invoicedOn ? (
              <InlineWarning>
                <span>
                  This commission has not been invoiced. The receipt date will be used as the invoice date, since a
                  commission cannot be received before it is invoiced.
                </span>
              </InlineWarning>
            ) : null}
          </>
        ) : null}

        {action.kind === 'writeoff' ? (
          <>
            <FormRow label="Why it is being written off" hint="Kept on the record, and the change is audited.">
              <Textarea
                value={remark}
                onChange={(e) => setRemark(e.target.value)}
                rows={3}
                placeholder="Agreed with the client as a goodwill adjustment after the delayed shipment."
              />
            </FormRow>
            {!commission.invoicedOn ? (
              <FormRow label="Date of the decision" required hint="Recorded as the invoice date, which the write-off needs.">
                <DateInput value={date} onChange={(e) => setDate(e.target.value)} />
              </FormRow>
            ) : null}
          </>
        ) : null}

        {error ? <InlineError>{error}</InlineError> : null}

        <div className="flex items-center justify-end gap-2 pt-1">
          <DialogFooterActions
            onCancel={onClose}
            confirmLabel={copy.confirm}
            confirmTone={action.kind === 'writeoff' ? 'danger' : 'primary'}
            loading={busy}
          />
        </div>
      </form>
    </Dialog>
  )
}
