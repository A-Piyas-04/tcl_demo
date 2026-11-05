/**
 * The pipeline report (FR-M11-03).
 *
 * Engagements grouped by stage, by owner and by client, with a value-weighted
 * figure wherever a requirement carries both an estimated annual quantity and a
 * target price. Indicative quantities are left out of the weighting, as the
 * requirements module says they must be.
 *
 * Read-only, with a logged export.
 */

import * as React from 'react'
import { Bar, BarChart, CartesianGrid, Cell, ResponsiveContainer, Tooltip as RcTooltip, XAxis, YAxis } from 'recharts'
import { Layers, Timer } from 'lucide-react'
import { useDb } from '@/data/store'
import { engagementRows, type EngagementRow } from '@/data/selectors'
import { PIPELINE_STAGES, STAGE_LABEL, stageConfig } from '@/data/reference'
import { logExport } from '@/data/api'
import { useAsyncData, useLocalPreference, useUrlFilters } from '@/lib/hooks'
import { downloadCsv, fmtMoney, fmtNumber, pluralise } from '@/lib/utils'
import type { Database, EngagementStage, ID } from '@/data/types'
import {
  Badge,
  Column,
  DataTable,
  EmptyState,
  LinkButton,
  Panel,
  Meter,
  PageHeading,
  SegmentedControl,
  Select,
  StageBadge,
  Tooltip,
} from '@/components/ui'
import {
  AXIS_TICK,
  CHART_GRID,
  CHART_MUTED,
  ChartPanel,
  ChartTooltip,
  ExportButton,
  ReportNote,
  StatCell,
  StatGrid,
  groupRows,
  stageHex,
} from './shared'

type Grouping = 'stage' | 'owner' | 'client'

/**
 * The annual value a client attached to the requirement behind an engagement.
 * Null when the client gave no figure, or gave one marked indicative.
 */
function weightedValue(db: Database, engagementId: ID): number | null {
  const links = db.requirementEngagements.filter((l) => l.engagementId === engagementId)
  let total: number | null = null
  for (const link of links) {
    const r = db.requirements.find((x) => x.id === link.requirementId)
    if (!r || r.qtyIsIndicative || r.estAnnualQty == null || r.targetPrice == null) continue
    total = (total ?? 0) + r.estAnnualQty * r.targetPrice
  }
  return total
}

interface GroupRow {
  key: string
  count: number
  value: number
  valued: number
  commercial: number
  ageing: number
  stage: EngagementStage | null
}

const DEFAULTS = { stage: '', owner: '' }

export function PipelineReport() {
  const db = useDb()
  const { values, setValue, queryString } = useUrlFilters(DEFAULTS)
  const [grouping, setGrouping] = useLocalPreference<Grouping>('pipeline.grouping', 'stage')

  const { data, loading } = useAsyncData(() => {
    let rows = engagementRows(db)
    if (values.stage) rows = rows.filter((r) => r.stage === values.stage)
    if (values.owner) rows = rows.filter((r) => r.engagement.ownerUserId === values.owner)

    const valueOf = new Map<ID, number | null>()
    for (const row of rows) valueOf.set(row.engagement.id, weightedValue(db, row.engagement.id))

    const build = (key: (r: EngagementRow) => string, stageOf?: (k: string) => EngagementStage | null): GroupRow[] =>
      groupRows(rows, key).map((group) => {
        let value = 0
        let valued = 0
        for (const row of group.rows) {
          const v = valueOf.get(row.engagement.id)
          if (v != null) {
            value += v
            valued++
          }
        }
        return {
          key: group.key,
          count: group.rows.length,
          value,
          valued,
          commercial: group.rows.filter((r) => r.stage === 'COMMERCIAL').length,
          ageing: group.rows.filter((r) => r.isAgeing).length,
          stage: stageOf ? stageOf(group.key) : null,
        }
      })

    const byStage = PIPELINE_STAGES.map((stage) => {
      const atStage = rows.filter((r) => r.stage === stage)
      let value = 0
      let valued = 0
      for (const row of atStage) {
        const v = valueOf.get(row.engagement.id)
        if (v != null) {
          value += v
          valued++
        }
      }
      return {
        key: STAGE_LABEL[stage],
        stage,
        count: atStage.length,
        value,
        valued,
        commercial: stage === 'COMMERCIAL' ? atStage.length : 0,
        ageing: atStage.filter((r) => r.isAgeing).length,
      } satisfies GroupRow
    })

    // average days spent in a stage, read from the transitions out of it
    const avgDays = PIPELINE_STAGES.map((stage) => {
      const spans = db.stageHistory
        .filter((h) => h.fromStage === stage && h.daysInPreviousStage != null)
        .map((h) => h.daysInPreviousStage!)
      return {
        stage,
        label: STAGE_LABEL[stage],
        days: spans.length ? Math.round(spans.reduce((a, b) => a + b, 0) / spans.length) : 0,
        samples: spans.length,
        threshold: stageConfig(stage).ageingThresholdDays,
      }
    })

    const totalValue = [...valueOf.values()].reduce<number>((sum, v) => sum + (v ?? 0), 0)

    return {
      rows,
      byStage,
      byOwner: build((r) => r.ownerName),
      byClient: build((r) => r.client.displayName),
      avgDays,
      totalValue,
      valuedCount: [...valueOf.values()].filter((v) => v != null).length,
    }
  }, [values])

  const groups: GroupRow[] =
    grouping === 'stage' ? (data?.byStage ?? []) : grouping === 'owner' ? (data?.byOwner ?? []) : (data?.byClient ?? [])

  const maxCount = Math.max(1, ...groups.map((g) => g.count))

  const columns: Column<GroupRow>[] = [
    {
      key: 'group',
      header: grouping === 'stage' ? 'Stage' : grouping === 'owner' ? 'Owner' : 'Client',
      pinned: true,
      sortable: true,
      value: (r) => r.key,
      cell: (r) =>
        r.stage ? (
          <StageBadge stage={r.stage} size="sm" />
        ) : (
          <span className="truncate text-sm font-medium text-ink-900">{r.key}</span>
        ),
    },
    {
      key: 'count',
      header: 'Engagements',
      align: 'right',
      sortable: true,
      width: '8rem',
      value: (r) => r.count,
      cell: (r) => <span className="text-sm font-semibold tabular text-ink-900">{r.count}</span>,
    },
    {
      key: 'share',
      header: 'Share',
      width: '9rem',
      value: (r) => Math.round((r.count / maxCount) * 100),
      cell: (r) => <Meter value={r.count} max={maxCount} tone="bg-accent-500" />,
    },
    {
      key: 'value',
      header: 'Value weighted',
      align: 'right',
      sortable: true,
      width: '11rem',
      value: (r) => Math.round(r.value),
      cell: (r) =>
        r.value > 0 ? (
          <Tooltip content={`${pluralise(r.valued, 'engagement')} of ${r.count} carry a firm quantity and a target price.`}>
            <span className="text-sm tabular text-ink-800">{fmtMoney(r.value, 'USD', { compact: true, decimals: 0 })}</span>
          </Tooltip>
        ) : (
          <span className="text-xs text-ink-400">No firm figure</span>
        ),
    },
    {
      key: 'commercial',
      header: 'Commercial',
      align: 'right',
      sortable: true,
      width: '7.5rem',
      value: (r) => r.commercial,
      cell: (r) => (r.commercial > 0 ? <Badge tone="ok">{r.commercial}</Badge> : <span className="text-xs text-ink-400">—</span>),
    },
    {
      key: 'ageing',
      header: 'Past threshold',
      align: 'right',
      sortable: true,
      width: '8.5rem',
      value: (r) => r.ageing,
      cell: (r) => (r.ageing > 0 ? <Badge tone="warn">{r.ageing}</Badge> : <span className="text-xs text-ink-400">—</span>),
    },
  ]

  const exportRows = () => {
    downloadCsv(
      `pipeline-by-${grouping}`,
      [grouping === 'stage' ? 'Stage' : grouping === 'owner' ? 'Owner' : 'Client', 'Engagements', 'Value weighted (USD)', 'Commercial', 'Past threshold'],
      groups.map((g) => [g.key, g.count, Math.round(g.value), g.commercial, g.ageing]),
    )
    void logExport(`pipeline report by ${grouping}`, queryString, groups.length)
  }

  const owners = React.useMemo(
    () => db.users.filter((u) => u.isActive).map((u) => ({ value: u.id, label: u.fullName })),
    [db],
  )

  return (
    <div className="space-y-4">
      <PageHeading
        title="Pipeline report"
        subtitle="Where the book stands, by stage, by owner and by client."
        meta={
          <>
            <Badge tone="neutral">{pluralise(data?.rows.length ?? 0, 'engagement')}</Badge>
            {data && data.totalValue > 0 ? (
              <Badge tone="accent">{fmtMoney(data.totalValue, 'USD', { compact: true, decimals: 0 })} weighted</Badge>
            ) : null}
          </>
        }
        actions={<ExportButton onClick={exportRows} disabled={groups.length === 0} />}
      />

      <StatGrid>
        <StatCell
          label="Live engagements"
          value={fmtNumber(data?.rows.length ?? 0)}
          hint="Every client and source pairing on the board"
        />
        <StatCell
          label="In commercial supply"
          value={fmtNumber((data?.byStage.find((s) => s.stage === 'COMMERCIAL')?.count ?? 0))}
          tone="ok"
          hint="Approved, ordered and shipping"
        />
        <StatCell
          label="Value weighted"
          value={data ? fmtMoney(data.totalValue, 'USD', { compact: true, decimals: 0 }) : '—'}
          tone="accent"
          hint={`From ${pluralise(data?.valuedCount ?? 0, 'engagement')} with a firm quantity and a target price`}
        />
        <StatCell
          label="Past the stage threshold"
          value={fmtNumber((data?.rows ?? []).filter((r) => r.isAgeing).length)}
          tone={(data?.rows ?? []).some((r) => r.isAgeing) ? 'warn' : 'default'}
          hint="Sitting longer than the configured window for its stage"
        />
      </StatGrid>

      <div className="grid gap-4 lg:grid-cols-2">
        <ChartPanel title="Engagements by stage" subtitle="The forward pipeline, narrowing to commercial" icon={<Layers className="h-4 w-4" />}>
          <ResponsiveContainer width="100%" height="100%">
            <BarChart
              data={data?.byStage ?? []}
              layout="vertical"
              margin={{ top: 4, right: 16, bottom: 4, left: 8 }}
              barCategoryGap="22%"
            >
              <CartesianGrid stroke={CHART_GRID} horizontal={false} />
              <XAxis type="number" tick={AXIS_TICK} tickLine={false} axisLine={{ stroke: CHART_GRID }} allowDecimals={false} />
              <YAxis type="category" dataKey="key" tick={AXIS_TICK} tickLine={false} axisLine={false} width={104} />
              <RcTooltip content={<ChartTooltip />} cursor={{ fill: 'rgba(15,34,45,0.04)' }} />
              <Bar dataKey="count" name="Engagements" radius={[0, 2, 2, 0]}>
                {(data?.byStage ?? []).map((row) => (
                  <Cell key={row.key} fill={row.stage ? stageHex(row.stage) : CHART_MUTED} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </ChartPanel>

        <ChartPanel
          title="Average days in each stage"
          subtitle="From the stage history, not from today's dates"
          icon={<Timer className="h-4 w-4" />}
        >
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={data?.avgDays ?? []} margin={{ top: 4, right: 8, bottom: 18, left: 0 }} barCategoryGap="26%">
              <CartesianGrid stroke={CHART_GRID} vertical={false} />
              <XAxis
                dataKey="label"
                tick={AXIS_TICK}
                tickLine={false}
                axisLine={{ stroke: CHART_GRID }}
                interval={0}
                angle={-28}
                textAnchor="end"
                height={54}
              />
              <YAxis
                tick={AXIS_TICK}
                tickLine={false}
                axisLine={false}
                width={30}
                label={{ value: 'Days', angle: -90, position: 'insideLeft', style: AXIS_TICK }}
              />
              <RcTooltip content={<ChartTooltip format={(v) => `${v} days`} />} cursor={{ fill: 'rgba(15,34,45,0.04)' }} />
              <Bar dataKey="days" name="Average days" radius={[2, 2, 0, 0]}>
                {(data?.avgDays ?? []).map((row) => (
                  <Cell key={row.stage} fill={stageHex(row.stage)} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </ChartPanel>
      </div>

      <Panel>
        <div className="flex flex-wrap items-center gap-2 border-b border-paper-200 p-3">
          <span className="text-2xs font-medium uppercase tracking-wide text-ink-500">Group by</span>
          <SegmentedControl
            value={grouping}
            onChange={setGrouping}
            size="sm"
            options={[
              { value: 'stage', label: 'Stage' },
              { value: 'owner', label: 'Owner' },
              { value: 'client', label: 'Client' },
            ]}
          />
          <div className="ml-auto flex flex-wrap items-center gap-2">
            <Select
              value={values.owner}
              onChange={(v) => setValue('owner', v)}
              allowEmpty
              emptyLabel="Any owner"
              placeholder="Any owner"
              options={owners}
            />
            <Select
              value={values.stage}
              onChange={(v) => setValue('stage', v)}
              allowEmpty
              emptyLabel="Any stage"
              placeholder="Any stage"
              options={(Object.keys(STAGE_LABEL) as EngagementStage[]).map((s) => ({ value: s, label: STAGE_LABEL[s] }))}
            />
          </div>
        </div>

        <DataTable
          rows={groups}
          columns={columns}
          rowKey={(r) => r.key}
          loading={loading}
          pageSize={20}
          exportName={`pipeline-by-${grouping}`}
          exportFilters={queryString}
          onExport={(count) => void logExport(`pipeline report by ${grouping}`, queryString, count)}
          empty={
            <EmptyState
              icon={<Layers className="h-5 w-5" />}
              title="No engagements match these filters"
              description="The pipeline report reads the engagement board, so an empty result usually means the filters are too narrow."
              action={
                <LinkButton to="/engagements" variant="primary" size="sm">
                  Open the engagement board
                </LinkButton>
              }
            />
          }
        />
      </Panel>

      <ReportNote>
        The value-weighted figure multiplies the client's estimated annual quantity by its target price, in US dollars,
        and only where the client gave a firm quantity. A quantity recorded as indicative is counted in the engagement
        total but left out of the money.
      </ReportNote>
    </div>
  )
}
