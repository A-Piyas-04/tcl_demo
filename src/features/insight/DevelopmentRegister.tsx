/**
 * The monthly development register (UC-16, FR-M11-02, AC-16).
 *
 * The report management actually asks for: every requirement enquired in the
 * period, one row per requirement and source, with the stage each engagement
 * had reached at period end rather than the stage it is at today.
 *
 * Read-only. The export is open to both roles and is logged.
 */

import * as React from 'react'
import { Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip as RcTooltip, XAxis, YAxis } from 'recharts'
import { CalendarRange, ClipboardList } from 'lucide-react'
import { useDb } from '@/data/store'
import { developmentRegister, registerTotals, type RegisterRow } from '@/data/selectors'
import { REQUIREMENT_KIND_LABEL, STAGE_LABEL } from '@/data/reference'
import { logExport } from '@/data/api'
import { useAsyncData, useLocalPreference, useUrlFilters } from '@/lib/hooks'
import { downloadCsv, fmtDate, fmtMonth, pluralise } from '@/lib/utils'
import type { RequirementKind } from '@/data/types'
import {
  Badge,
  Button,
  Column,
  DataTable,
  DateInput,
  EmptyState,
  LinkButton,
  Panel,
  PanelHeader,
  PageHeading,
  SegmentedControl,
  Select,
  SkeletonText,
  StageBadge,
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
  groupRows,
  monthEnd,
  monthStart,
  monthTick,
  recentMonths,
} from './shared'

type Grouping = 'kind' | 'client' | 'owner'

const DEFAULTS = { from: '', to: '', kind: '' }

export function DevelopmentRegister() {
  const db = useDb()
  const { values, setValue, setMany, queryString } = useUrlFilters(DEFAULTS)
  const [grouping, setGrouping] = useLocalPreference<Grouping>('register.grouping', 'kind')

  const thisMonth = new Date().toISOString().slice(0, 7)
  const from = values.from || monthStart(`${thisMonth}-01`)
  const to = values.to || monthEnd(`${thisMonth}-01`)
  const kind = (values.kind || '') as RequirementKind | ''

  const { data: rows, loading } = useAsyncData<RegisterRow[]>(() => {
    const all = developmentRegister(db, from, to)
    return kind ? all.filter((r) => r.kind === kind) : all
  }, [from, to, kind])

  const totals = React.useMemo(() => registerTotals(rows ?? []), [rows])

  /** The newest month that has anything in it, offered when a period is empty. */
  const latestMonthWithRecords = React.useMemo(() => {
    const months = db.requirements.map((r) => r.enquiryDate.slice(0, 7)).sort()
    return months.at(-1) ?? thisMonth
  }, [db, thisMonth])

  /** New against alternate developments by enquiry month, last twelve months. */
  const trend = React.useMemo(() => {
    const months = recentMonths(12)
    return months.map((month) => {
      const inMonth = db.requirements.filter((r) => r.enquiryDate.slice(0, 7) === month)
      return {
        month,
        label: monthTick(month),
        newDevelopment: inMonth.filter((r) => r.kind === 'NEW_DEVELOPMENT').length,
        alternateSource: inMonth.filter((r) => r.kind === 'ALTERNATE_SOURCE').length,
      }
    })
  }, [db])

  const groups = React.useMemo(() => {
    if (!rows) return []
    const key = (r: RegisterRow) =>
      grouping === 'kind' ? REQUIREMENT_KIND_LABEL[r.kind] : grouping === 'client' ? r.clientName : r.ownerName
    return groupRows(rows, key).map((g) => ({
      ...g,
      requirements: new Set(g.rows.map((r) => r.requirementId)).size,
    }))
  }, [rows, grouping])

  const columns: Column<RegisterRow>[] = [
    {
      key: 'kind',
      header: 'Kind',
      pinned: true,
      sortable: true,
      width: '9rem',
      value: (r) => REQUIREMENT_KIND_LABEL[r.kind],
      cell: (r) => (
        <Badge tone={r.kind === 'NEW_DEVELOPMENT' ? 'info' : 'accent'}>{REQUIREMENT_KIND_LABEL[r.kind]}</Badge>
      ),
    },
    {
      key: 'client',
      header: 'Client',
      sortable: true,
      value: (r) => r.clientName,
      cell: (r) => <span className="truncate text-sm font-medium text-ink-900">{r.clientName}</span>,
    },
    {
      key: 'product',
      header: 'Product',
      sortable: true,
      value: (r) => r.productName,
      cell: (r) => <span className="truncate text-sm text-ink-800">{r.productName}</span>,
    },
    {
      key: 'manufacturer',
      header: 'Manufacturer',
      sortable: true,
      value: (r) => r.manufacturerName,
      cell: (r) =>
        r.manufacturerName ? (
          <span className="truncate text-xs text-ink-700">{r.manufacturerName}</span>
        ) : (
          <Tooltip content="The requirement has no source against it yet, so it counts once with no manufacturer.">
            <span className="text-xs text-ink-400">No source yet</span>
          </Tooltip>
        ),
    },
    {
      key: 'stage',
      header: 'Stage at period end',
      sortable: true,
      width: '11rem',
      value: (r) => (r.stageAtPeriodEnd ? STAGE_LABEL[r.stageAtPeriodEnd] : null),
      cell: (r) =>
        r.stageAtPeriodEnd ? (
          <StageBadge stage={r.stageAtPeriodEnd} size="sm" />
        ) : (
          <span className="text-xs text-ink-400">Not started</span>
        ),
    },
    {
      key: 'enquiry',
      header: 'Enquiry date',
      sortable: true,
      width: '7.5rem',
      value: (r) => r.enquiryDate,
      cell: (r) => <span className="text-xs tabular text-ink-600">{fmtDate(r.enquiryDate)}</span>,
    },
    {
      key: 'approved',
      header: 'Approved',
      sortable: true,
      width: '7.5rem',
      value: (r) => r.approvedOn,
      cell: (r) => <span className="text-xs tabular text-ink-600">{fmtDate(r.approvedOn)}</span>,
    },
    {
      key: 'commercial',
      header: 'First commercial',
      sortable: true,
      width: '8.5rem',
      value: (r) => r.firstCommercialOn,
      cell: (r) => <span className="text-xs tabular text-ink-600">{fmtDate(r.firstCommercialOn)}</span>,
    },
    {
      key: 'owner',
      header: 'Owner',
      sortable: true,
      width: '9rem',
      value: (r) => r.ownerName,
      cell: (r) => <span className="truncate text-xs text-ink-600">{r.ownerName}</span>,
    },
  ]

  const exportRows = () => {
    if (!rows) return
    downloadCsv(
      `development-register-${from}-to-${to}`,
      [
        'Kind',
        'Client',
        'Product',
        'Manufacturer',
        'Stage at period end',
        'Enquiry date',
        'Approved on',
        'First commercial on',
        'Owner',
      ],
      rows.map((r) => [
        REQUIREMENT_KIND_LABEL[r.kind],
        r.clientName,
        r.productName,
        r.manufacturerName,
        r.stageAtPeriodEnd ? STAGE_LABEL[r.stageAtPeriodEnd] : 'Not started',
        r.enquiryDate,
        r.approvedOn,
        r.firstCommercialOn,
        r.ownerName,
      ]),
    )
    void logExport('development register', queryString, rows.length)
  }

  const pickMonth = (month: string) => {
    if (!month) return
    setMany({ from: monthStart(`${month}-01`), to: monthEnd(`${month}-01`) })
  }

  const isWholeMonth = from === monthStart(from) && to === monthEnd(from) && from.slice(0, 7) === to.slice(0, 7)

  return (
    <div className="space-y-4">
      <PageHeading
        title="Development register"
        subtitle={
          isWholeMonth
            ? `Requirements enquired in ${fmtMonth(from)}, with the stage each source had reached at period end.`
            : `Requirements enquired between ${fmtDate(from)} and ${fmtDate(to)}.`
        }
        meta={
          <>
            <Badge tone="accent">{pluralise(totals.requirements, 'requirement')}</Badge>
            <Badge tone="neutral">{pluralise(totals.rows, 'row')}</Badge>
          </>
        }
        actions={<ExportButton onClick={exportRows} disabled={!rows || rows.length === 0} />}
      />

      <Panel>
        <div className="grid gap-2.5 border-b border-paper-200 p-3 sm:grid-cols-2 lg:grid-cols-4">
          <div className="space-y-1.5">
            <p className="text-2xs font-medium uppercase tracking-wide text-ink-500">Month</p>
            <input
              type="month"
              value={from.slice(0, 7)}
              onChange={(e) => pickMonth(e.target.value)}
              className="h-8 w-full rounded border border-paper-400 bg-white px-2.5 font-mono text-sm tabular text-ink-900 focus:border-accent-500 focus:outline-none focus:ring-2 focus:ring-accent-500/25"
            />
          </div>
          <div className="space-y-1.5">
            <p className="text-2xs font-medium uppercase tracking-wide text-ink-500">Or a range, from</p>
            <DateInput value={from} onChange={(e) => setValue('from', e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <p className="text-2xs font-medium uppercase tracking-wide text-ink-500">To</p>
            <DateInput value={to} onChange={(e) => setValue('to', e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <p className="text-2xs font-medium uppercase tracking-wide text-ink-500">Kind</p>
            <Select
              value={kind}
              onChange={(v) => setValue('kind', v)}
              allowEmpty
              emptyLabel="New and alternate"
              placeholder="New and alternate"
              options={(Object.keys(REQUIREMENT_KIND_LABEL) as RequirementKind[]).map((k) => ({
                value: k,
                label: REQUIREMENT_KIND_LABEL[k],
              }))}
            />
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2 p-3">
          <span className="text-2xs font-medium uppercase tracking-wide text-ink-500">Group by</span>
          <SegmentedControl
            value={grouping}
            onChange={setGrouping}
            size="sm"
            options={[
              { value: 'kind', label: 'Kind' },
              { value: 'client', label: 'Client' },
              { value: 'owner', label: 'Owner' },
            ]}
          />
          <Button variant="ghost" size="sm" onClick={() => pickMonth(new Date().toISOString().slice(0, 7))}>
            This month
          </Button>
        </div>
      </Panel>

      <StatGrid>
        <StatCell
          label="Requirements"
          value={totals.requirements}
          tone="accent"
          hint={`Counted once each, against ${pluralise(totals.rows, 'row')} in the table`}
        />
        <StatCell label="New developments" value={totals.newDevelopment} hint="A molecule the client has not bought before" />
        <StatCell
          label="Alternate sources"
          value={totals.alternateSource}
          hint="A second or replacement source for a molecule already bought"
        />
        <StatCell
          label="Reached approval"
          value={(rows ?? []).filter((r) => r.approvedOn).length}
          hint="Sources approved by the client on or before period end"
        />
      </StatGrid>

      <ReportNote>
        Totals count requirements, not rows. A requirement pursued with two sources produces two rows, which is why the
        two figures differ: {pluralise(totals.requirements, 'requirement')} across {pluralise(totals.rows, 'row')}.
      </ReportNote>

      <div className="grid gap-4 lg:grid-cols-2">
        <ChartPanel
          title="New against alternate, by month"
          subtitle="Enquiry month, last twelve months"
          icon={<CalendarRange className="h-4 w-4" />}
        >
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={trend} margin={{ top: 4, right: 8, bottom: 18, left: 0 }} barCategoryGap="28%">
              <CartesianGrid stroke={CHART_GRID} vertical={false} />
              <XAxis
                dataKey="label"
                tick={AXIS_TICK}
                tickLine={false}
                axisLine={{ stroke: CHART_GRID }}
                interval={1}
                label={{ value: 'Enquiry month', position: 'insideBottom', offset: -12, style: AXIS_TICK }}
              />
              <YAxis
                tick={AXIS_TICK}
                tickLine={false}
                axisLine={false}
                allowDecimals={false}
                width={28}
                label={{ value: 'Requirements', angle: -90, position: 'insideLeft', style: AXIS_TICK }}
              />
              <RcTooltip content={<ChartTooltip />} cursor={{ fill: 'rgba(15,34,45,0.04)' }} />
              <Legend verticalAlign="top" align="right" iconType="square" wrapperStyle={{ fontSize: 11 }} />
              <Bar dataKey="newDevelopment" name="New development" fill={CHART_ACCENT} radius={[2, 2, 0, 0]} />
              <Bar dataKey="alternateSource" name="Alternate source" fill={CHART_ACCENT_SOFT} radius={[2, 2, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </ChartPanel>

        <Panel>
          <PanelHeader
            title={`Grouped by ${grouping}`}
            subtitle="Requirements first, rows in brackets"
            icon={<ClipboardList className="h-4 w-4" />}
          />
          {loading ? (
            <div className="p-4">
              <SkeletonText lines={5} />
            </div>
          ) : groups.length === 0 ? (
            <div className="p-4">
              <EmptyState title="No records in this period" compact />
            </div>
          ) : (
            <ul className="divide-y divide-paper-200">
              {groups.map((group) => (
                <li key={group.key} className="flex items-center gap-3 px-4 py-2.5">
                  <span className="min-w-0 flex-1 truncate text-sm text-ink-800">{group.key}</span>
                  <span className="text-sm font-semibold tabular text-ink-900">{group.requirements}</span>
                  <span className="w-12 text-right text-xs tabular text-ink-400">({group.rows.length})</span>
                </li>
              ))}
            </ul>
          )}
        </Panel>
      </div>

      <Panel>
        <DataTable
          rows={rows ?? []}
          columns={columns}
          rowKey={(r) => `${r.requirementId}:${r.engagementId ?? 'none'}`}
          loading={loading}
          exportName={`development-register-${from}`}
          exportFilters={queryString}
          onExport={(count) => void logExport('development register', queryString, count)}
          toolbar={
            <span className="text-xs text-ink-500">
              {isWholeMonth ? fmtMonth(from) : `${fmtDate(from)} to ${fmtDate(to)}`} ·{' '}
              {rows ? pluralise(rows.length, 'row') : '…'}
            </span>
          }
          empty={
            <EmptyState
              icon={<ClipboardList className="h-5 w-5" />}
              title="No records for this period"
              description="No requirement was enquired between these dates. The columns are shown so the shape of the report is clear."
              action={
                latestMonthWithRecords !== from.slice(0, 7) ? (
                  <Button variant="primary" size="sm" onClick={() => pickMonth(latestMonthWithRecords)}>
                    Show {fmtMonth(`${latestMonthWithRecords}-01`)} instead
                  </Button>
                ) : (
                  <Button variant="primary" size="sm" onClick={() => pickMonth(thisMonth)}>
                    Show this month
                  </Button>
                )
              }
              secondary={
                <LinkButton to="/requirements/new" variant="ghost" size="sm">
                  Record a requirement
                </LinkButton>
              }
            />
          }
        />
      </Panel>

      <div className="space-y-1.5">
        <ReportNote>
          Stage at period end comes from the stage history, not from the engagement's stage today. An engagement offered
          in October and approved in November reads as offered in the October register.
        </ReportNote>
        <ReportNote>
          A requirement counts in the month of its enquiry date. That is the v1 decision and it remains an open
          question: the alternative is the month the engagement opened.
        </ReportNote>
      </div>
    </div>
  )
}
