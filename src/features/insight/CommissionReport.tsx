/**
 * The commission report (FR-M11-09, UR-24a).
 *
 * TCL's own revenue. The company never buys or sells the goods: it places the
 * indent on the manufacturer for the client and earns a commission, which is
 * receivable from the client. Earned, invoiced, received and outstanding, by
 * client, by manufacturer and by month.
 *
 * Read-only, with a logged export.
 */

import { Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip as RcTooltip, XAxis, YAxis } from 'recharts'
import { AlertTriangle, Coins, Wallet } from 'lucide-react'
import { useDb } from '@/data/store'
import { commissionRows, commissionTotals, type CommissionRow } from '@/data/selectors'
import { COMMISSION_BASIS_LABEL, COMMISSION_STATUS_LABEL } from '@/data/reference'
import { logExport } from '@/data/api'
import { useAsyncData, useLocalPreference } from '@/lib/hooks'
import { downloadCsv, fmtDate, fmtMoney, fmtPct, pluralise } from '@/lib/utils'
import {
  Badge,
  Column,
  DataTable,
  EmptyState,
  LinkButton,
  Meter,
  Panel,
  PanelHeader,
  PageHeading,
  SegmentedControl,
  Tooltip,
} from '@/components/ui'
import {
  AXIS_TICK,
  CHART_ACCENT,
  CHART_ACCENT_SOFT,
  CHART_GRID,
  ChartPanel,
  ChartTooltip,
  ExportButton,
  ReportNote,
  StatCell,
  StatGrid,
  monthTick,
  recentMonths,
} from './shared'

type Axis = 'client' | 'manufacturer' | 'month'

interface Group {
  key: string
  label: string
  earned: number
  invoiced: number
  received: number
  outstanding: number
  indents: number
  tbd: number
}

export function CommissionReport() {
  const db = useDb()
  const [axis, setAxis] = useLocalPreference<Axis>('commission.axis', 'client')

  const { data, loading } = useAsyncData(() => {
    const rows = commissionRows(db).filter((r) => r.commission.status !== 'WRITTEN_OFF')
    const totals = commissionTotals(db)

    const build = (key: (r: CommissionRow) => string, label?: (k: string) => string): Group[] => {
      const map = new Map<string, Group>()
      for (const row of rows) {
        const k = key(row)
        const group =
          map.get(k) ??
          ({ key: k, label: label ? label(k) : k, earned: 0, invoiced: 0, received: 0, outstanding: 0, indents: 0, tbd: 0 } satisfies Group)
        const amount = row.commission.amount ?? 0
        group.earned += amount
        if (row.commission.invoicedOn) group.invoiced += amount
        group.received += row.commission.receivedAmount
        group.outstanding += amount - row.commission.receivedAmount
        group.indents++
        if (row.commission.basis === 'TBD') group.tbd++
        map.set(k, group)
      }
      return [...map.values()].sort((a, b) => b.earned - a.earned || a.label.localeCompare(b.label))
    }

    const months = recentMonths(12)
    const byMonth: Group[] = months.map((month) => {
      const earnedIn = rows.filter((r) => r.indent.orderDate.slice(0, 7) === month)
      const receivedIn = rows.filter((r) => r.commission.receivedOn?.slice(0, 7) === month)
      const earned = earnedIn.reduce((sum, r) => sum + (r.commission.amount ?? 0), 0)
      const received = receivedIn.reduce((sum, r) => sum + r.commission.receivedAmount, 0)
      return {
        key: month,
        label: monthTick(month),
        earned,
        invoiced: earnedIn.filter((r) => r.commission.invoicedOn).reduce((sum, r) => sum + (r.commission.amount ?? 0), 0),
        received,
        outstanding: earned - received,
        indents: earnedIn.length,
        tbd: earnedIn.filter((r) => r.commission.basis === 'TBD').length,
      }
    })

    return {
      rows,
      totals,
      byClient: build((r) => r.clientName),
      byManufacturer: build((r) => r.manufacturerName),
      byMonth,
      tbdRows: rows.filter((r) => r.commission.basis === 'TBD'),
    }
  }, [])

  const groups: Group[] =
    axis === 'client' ? (data?.byClient ?? []) : axis === 'manufacturer' ? (data?.byManufacturer ?? []) : (data?.byMonth ?? [])

  const peak = Math.max(1, ...groups.map((g) => g.earned))

  const columns: Column<Group>[] = [
    {
      key: 'group',
      header: axis === 'client' ? 'Client' : axis === 'manufacturer' ? 'Manufacturer' : 'Month',
      pinned: true,
      sortable: true,
      value: (r) => r.label,
      cell: (r) => (
        <span className="flex items-center gap-2">
          <span className="truncate text-sm font-medium text-ink-900">{r.label}</span>
          {r.tbd > 0 ? (
            <Tooltip content={`${pluralise(r.tbd, 'indent')} with the commission basis still to be decided.`}>
              <span>
                <Badge tone="warn">{r.tbd} to be decided</Badge>
              </span>
            </Tooltip>
          ) : null}
        </span>
      ),
    },
    {
      key: 'indents',
      header: 'Indents',
      align: 'right',
      sortable: true,
      width: '6.5rem',
      value: (r) => r.indents,
      cell: (r) => <span className="text-sm tabular text-ink-700">{r.indents || '—'}</span>,
    },
    {
      key: 'earned',
      header: 'Earned',
      align: 'right',
      sortable: true,
      width: '9rem',
      value: (r) => Math.round(r.earned),
      cell: (r) => <span className="text-sm font-semibold tabular text-ink-900">{fmtMoney(r.earned, 'USD', { decimals: 0 })}</span>,
    },
    {
      key: 'invoiced',
      header: 'Invoiced',
      align: 'right',
      sortable: true,
      width: '9rem',
      value: (r) => Math.round(r.invoiced),
      cell: (r) => <span className="text-sm tabular text-ink-700">{fmtMoney(r.invoiced, 'USD', { decimals: 0 })}</span>,
    },
    {
      key: 'received',
      header: 'Received',
      align: 'right',
      sortable: true,
      width: '9rem',
      value: (r) => Math.round(r.received),
      cell: (r) => <span className="text-sm tabular text-ok-600">{fmtMoney(r.received, 'USD', { decimals: 0 })}</span>,
    },
    {
      key: 'outstanding',
      header: 'Outstanding',
      align: 'right',
      sortable: true,
      width: '9rem',
      value: (r) => Math.round(r.outstanding),
      cell: (r) => (
        <span className={`text-sm tabular ${r.outstanding > 0 ? 'font-medium text-warn-600' : 'text-ink-400'}`}>
          {fmtMoney(r.outstanding, 'USD', { decimals: 0 })}
        </span>
      ),
    },
    {
      key: 'collected',
      header: 'Collected',
      width: '9rem',
      value: (r) => (r.earned > 0 ? Math.round((r.received / r.earned) * 100) : 0),
      cell: (r) => (
        <Tooltip content={r.earned > 0 ? `${fmtPct((r.received / r.earned) * 100, 0)} of what was earned` : 'Nothing earned yet'}>
          <span className="block">
            <Meter value={r.received} max={Math.max(r.earned, 1)} tone="bg-ok-500" />
          </span>
        </Tooltip>
      ),
    },
  ]

  const exportRows = () => {
    downloadCsv(
      `commission-by-${axis}`,
      [
        axis === 'client' ? 'Client' : axis === 'manufacturer' ? 'Manufacturer' : 'Month',
        'Indents',
        'Earned (USD)',
        'Invoiced (USD)',
        'Received (USD)',
        'Outstanding (USD)',
        'Basis to be decided',
      ],
      groups.map((g) => [
        g.label,
        g.indents,
        Math.round(g.earned),
        Math.round(g.invoiced),
        Math.round(g.received),
        Math.round(g.outstanding),
        g.tbd,
      ]),
    )
    void logExport(`commission report by ${axis}`, axis, groups.length)
  }

  const totals = data?.totals
  const collected = totals && totals.earned > 0 ? (totals.received / totals.earned) * 100 : 0

  return (
    <div className="space-y-4">
      <PageHeading
        title="Commission"
        subtitle="TCL's earnings on the indents it places, receivable from the client."
        meta={
          <>
            <Badge tone="neutral">{pluralise(data?.rows.length ?? 0, 'commission record')}</Badge>
            {totals && totals.tbdCount > 0 ? <Badge tone="warn">{totals.tbdCount} still to be agreed</Badge> : null}
          </>
        }
        actions={<ExportButton onClick={exportRows} disabled={groups.length === 0} />}
      />

      <StatGrid>
        <StatCell
          label="Earned"
          value={totals ? fmtMoney(totals.earned, 'USD', { compact: true, decimals: 0 }) : '—'}
          tone="accent"
          hint="Commission due to TCL on indents placed"
        />
        <StatCell
          label="Invoiced"
          value={totals ? fmtMoney(totals.invoiced, 'USD', { compact: true, decimals: 0 }) : '—'}
          hint="Billed to the client"
        />
        <StatCell
          label="Received"
          value={totals ? fmtMoney(totals.received, 'USD', { compact: true, decimals: 0 }) : '—'}
          tone="ok"
          hint={`${fmtPct(collected, 0)} of what was earned`}
          footer={<Meter value={totals?.received ?? 0} max={Math.max(totals?.earned ?? 1, 1)} tone="bg-ok-500" />}
        />
        <StatCell
          label="Outstanding"
          value={totals ? fmtMoney(totals.outstanding, 'USD', { compact: true, decimals: 0 }) : '—'}
          tone={totals && totals.outstanding > 0 ? 'warn' : 'default'}
          hint="Owed by clients, not by manufacturers"
        />
      </StatGrid>

      <div className="grid gap-4 lg:grid-cols-2">
        <ChartPanel
          title="Earned against received, by month"
          subtitle="Earned in the month of the indent, received in the month of the payment"
          icon={<Coins className="h-4 w-4" />}
        >
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={data?.byMonth ?? []} margin={{ top: 4, right: 8, bottom: 18, left: 4 }} barCategoryGap="28%">
              <CartesianGrid stroke={CHART_GRID} vertical={false} />
              <XAxis
                dataKey="label"
                tick={AXIS_TICK}
                tickLine={false}
                axisLine={{ stroke: CHART_GRID }}
                interval={1}
                label={{ value: 'Month', position: 'insideBottom', offset: -12, style: AXIS_TICK }}
              />
              <YAxis
                tick={AXIS_TICK}
                tickLine={false}
                axisLine={false}
                width={52}
                tickFormatter={(v: number) => fmtMoney(v, 'USD', { compact: true, decimals: 0 }).replace('USD ', '')}
                label={{ value: 'USD', angle: -90, position: 'insideLeft', style: AXIS_TICK }}
              />
              <RcTooltip
                content={<ChartTooltip format={(v) => fmtMoney(v, 'USD', { decimals: 0 })} />}
                cursor={{ fill: 'rgba(15,34,45,0.04)' }}
              />
              <Legend verticalAlign="top" align="right" iconType="square" wrapperStyle={{ fontSize: 11 }} />
              <Bar dataKey="earned" name="Earned" fill={CHART_ACCENT} radius={[2, 2, 0, 0]} />
              <Bar dataKey="received" name="Received" fill={CHART_ACCENT_SOFT} radius={[2, 2, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </ChartPanel>

        <Panel>
          <PanelHeader
            title="Earnings not yet agreed"
            subtitle="Indents whose commission basis is still to be decided"
            icon={<AlertTriangle className="h-4 w-4 text-warn-600" />}
            actions={<Badge tone={data && data.tbdRows.length > 0 ? 'warn' : 'neutral'}>{data?.tbdRows.length ?? 0}</Badge>}
          />
          {loading || !data ? null : data.tbdRows.length === 0 ? (
            <div className="p-4">
              <EmptyState title="Every commission has an agreed basis" compact />
            </div>
          ) : (
            <ul className="divide-y divide-paper-200">
              {data.tbdRows.slice(0, 6).map((row) => (
                <li key={row.commission.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 px-4 py-2.5">
                  <LinkButton
                    to={`/indents/${row.indent.id}`}
                    variant="ghost"
                    size="sm"
                    className="h-auto px-0 font-mono text-xs font-medium text-accent-700"
                  >
                    {row.indent.indentNumber}
                  </LinkButton>
                  <span className="min-w-0 flex-1 truncate text-xs text-ink-600">
                    {row.clientName} · {row.manufacturerName}
                  </span>
                  <span className="text-xs tabular text-ink-500">{fmtDate(row.indent.orderDate)}</span>
                  <span className="w-24 text-right text-xs tabular text-ink-700">
                    {fmtMoney(row.indentValue, row.indent.currency, { compact: true, decimals: 0 })}
                  </span>
                </li>
              ))}
            </ul>
          )}
          <ReportNote className="border-t border-paper-200 p-4">
            A basis of {COMMISSION_BASIS_LABEL.TBD.toLowerCase()} means the rate has not been settled with the client, so
            the amount is an expectation and not yet an earning.
          </ReportNote>
        </Panel>
      </div>

      <Panel>
        <div className="flex flex-wrap items-center gap-2 border-b border-paper-200 p-3">
          <span className="text-2xs font-medium uppercase tracking-wide text-ink-500">By</span>
          <SegmentedControl
            value={axis}
            onChange={setAxis}
            size="sm"
            options={[
              { value: 'client', label: 'Client' },
              { value: 'manufacturer', label: 'Manufacturer' },
              { value: 'month', label: 'Month' },
            ]}
          />
          <span className="ml-auto text-xs text-ink-500">
            Bars show earnings against the largest row, {fmtMoney(peak, 'USD', { compact: true, decimals: 0 })}.
          </span>
        </div>
        <DataTable
          rows={groups}
          columns={columns}
          rowKey={(r) => r.key}
          loading={loading}
          pageSize={20}
          exportName={`commission-by-${axis}`}
          onExport={(count) => void logExport(`commission report by ${axis}`, axis, count)}
          empty={
            <EmptyState
              icon={<Wallet className="h-5 w-5" />}
              title="No commission recorded yet"
              description="Commission is raised against an indent, so the report fills as indents are placed and invoiced."
              action={
                <LinkButton to="/indents" variant="primary" size="sm">
                  Open the indents
                </LinkButton>
              }
            />
          }
        />
      </Panel>

      <div className="space-y-1.5">
        <ReportNote>
          Commission is receivable from the client, not from the manufacturer. The manufacturer column answers a
          different question: which supplier the earnings came through.
        </ReportNote>
        <ReportNote>
          Statuses in use: {Object.values(COMMISSION_STATUS_LABEL).join(', ').toLowerCase()}. Written-off records are
          excluded from every figure here.
        </ReportNote>
      </div>
    </div>
  )
}
