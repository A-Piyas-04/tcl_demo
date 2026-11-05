/**
 * The conversion funnel (FR-M11-05).
 *
 * Offered, sample, approved, commercial: how many engagements reached each
 * step, the ratio between the steps and the average days taken to move. Every
 * figure is read from the stage history, so an engagement that skipped a step
 * or went backwards is counted by what actually happened to it.
 *
 * Read-only, with a logged export.
 */

import { differenceInCalendarDays, parseISO } from 'date-fns'
import { motion } from 'framer-motion'
import { Filter, Users } from 'lucide-react'
import { useDb } from '@/data/store'
import { engagementRows } from '@/data/selectors'
import { STAGE_LABEL } from '@/data/reference'
import { logExport } from '@/data/api'
import { useAsyncData, useLocalPreference } from '@/lib/hooks'
import { downloadCsv, fmtPct, pluralise } from '@/lib/utils'
import type { Database, EngagementStage, ID } from '@/data/types'
import {
  Badge,
  Column,
  DataTable,
  EmptyState,
  LinkButton,
  Panel,
  PanelHeader,
  PageHeading,
  SegmentedControl,
  SkeletonText,
  Tooltip,
} from '@/components/ui'
import { ExportButton, ReportNote, StatCell, StatGrid, stageHex } from './shared'

type Breakdown = 'owner' | 'client'

/** The four steps the business talks about, in order. */
const STEPS = [
  { key: 'offered', label: 'Offered', stages: ['OFFERED'] as EngagementStage[] },
  { key: 'sample', label: 'Sample sent', stages: ['SAMPLE_SENT', 'SAMPLE_REQUESTED'] as EngagementStage[] },
  { key: 'approved', label: 'Approved', stages: ['APPROVED'] as EngagementStage[] },
  { key: 'commercial', label: 'Commercial', stages: ['COMMERCIAL'] as EngagementStage[] },
] as const

type StepKey = (typeof STEPS)[number]['key']

/** First arrival at each step, from the history of one engagement. */
function arrivals(db: Database, engagementId: ID): Partial<Record<StepKey, string>> {
  const history = db.stageHistory
    .filter((h) => h.engagementId === engagementId)
    .sort((a, b) => (a.changedAt < b.changedAt ? -1 : 1))
  const out: Partial<Record<StepKey, string>> = {}
  for (const step of STEPS) {
    const hit = history.find((h) => step.stages.includes(h.toStage))
    if (hit) out[step.key] = hit.changedAt
  }
  return out
}

interface Row {
  key: string
  counts: Record<StepKey, number>
  total: number
}

const daysBetween = (a: string, b: string) => Math.max(0, differenceInCalendarDays(parseISO(b), parseISO(a)))

export function ConversionFunnel() {
  const db = useDb()
  const [breakdown, setBreakdown] = useLocalPreference<Breakdown>('funnel.breakdown', 'owner')

  const { data, loading } = useAsyncData(() => {
    const all = engagementRows(db)
    // Business loaded at go-live arrived already approved or supplying, with no
    // offer or sample recorded here, so counting it would widen the funnel
    // instead of describing a conversion.
    const engagements = all.filter((e) => e.engagement.origin === 'PIPELINE')
    const migrated = all.length - engagements.length
    const reached = engagements.map((e) => ({ row: e, at: arrivals(db, e.engagement.id) }))

    const counts = {} as Record<StepKey, number>
    for (const step of STEPS) counts[step.key] = reached.filter((r) => r.at[step.key]).length

    /** Average days for each transition, over the engagements that made it. */
    const transitions = STEPS.slice(1).map((step, index) => {
      const previous = STEPS[index]!
      const spans = reached
        .filter((r) => r.at[previous.key] && r.at[step.key])
        .map((r) => daysBetween(r.at[previous.key]!, r.at[step.key]!))
      return {
        from: previous.label,
        to: step.label,
        count: spans.length,
        avgDays: spans.length ? Math.round(spans.reduce((a, b) => a + b, 0) / spans.length) : null,
        ratio: counts[previous.key] > 0 ? (counts[step.key] / counts[previous.key]) * 100 : null,
      }
    })

    const build = (key: (r: (typeof reached)[number]) => string): Row[] => {
      const map = new Map<string, Row>()
      for (const entry of reached) {
        const k = key(entry)
        const row =
          map.get(k) ??
          ({ key: k, counts: { offered: 0, sample: 0, approved: 0, commercial: 0 }, total: 0 } satisfies Row)
        row.total++
        for (const step of STEPS) if (entry.at[step.key]) row.counts[step.key]++
        map.set(k, row)
      }
      return [...map.values()].sort((a, b) => b.counts.commercial - a.counts.commercial || b.total - a.total)
    }

    return {
      total: engagements.length,
      migrated,
      counts,
      transitions,
      byOwner: build((e) => e.row.ownerName),
      byClient: build((e) => e.row.client.displayName),
    }
  }, [])

  const rows = breakdown === 'owner' ? (data?.byOwner ?? []) : (data?.byClient ?? [])

  const columns: Column<Row>[] = [
    {
      key: 'group',
      header: breakdown === 'owner' ? 'Owner' : 'Client',
      pinned: true,
      sortable: true,
      value: (r) => r.key,
      cell: (r) => <span className="truncate text-sm font-medium text-ink-900">{r.key}</span>,
    },
    ...STEPS.map<Column<Row>>((step) => ({
      key: step.key,
      header: step.label,
      align: 'right',
      sortable: true,
      width: '7.5rem',
      value: (r) => r.counts[step.key],
      cell: (r) => <span className="text-sm tabular text-ink-800">{r.counts[step.key] || '—'}</span>,
    })),
    {
      key: 'rate',
      header: 'Offer to approval',
      align: 'right',
      sortable: true,
      width: '9.5rem',
      value: (r) => (r.counts.offered ? Math.round((r.counts.approved / r.counts.offered) * 100) : null),
      cell: (r) =>
        r.counts.offered ? (
          <Tooltip content={`${r.counts.approved} approved out of ${pluralise(r.counts.offered, 'offer')}`}>
            <span className="text-sm font-medium tabular text-ink-900">
              {fmtPct((r.counts.approved / r.counts.offered) * 100, 0)}
            </span>
          </Tooltip>
        ) : (
          <span className="text-xs text-ink-400">—</span>
        ),
    },
  ]

  const exportRows = () => {
    downloadCsv(
      `conversion-funnel-by-${breakdown}`,
      [breakdown === 'owner' ? 'Owner' : 'Client', ...STEPS.map((s) => s.label), 'Offer to approval %'],
      rows.map((r) => [
        r.key,
        ...STEPS.map((s) => r.counts[s.key]),
        r.counts.offered ? Math.round((r.counts.approved / r.counts.offered) * 100) : null,
      ]),
    )
    void logExport(`conversion funnel by ${breakdown}`, '', rows.length)
  }

  const peak = data ? Math.max(1, data.counts.offered) : 1

  return (
    <div className="space-y-4">
      <PageHeading
        title="Conversion funnel"
        subtitle="Offered to sample to approved to commercial, with the time each step takes."
        meta={
          <>
            <Badge tone="neutral">{pluralise(data?.total ?? 0, 'engagement in the pipeline', 'engagements in the pipeline')}</Badge>
            {data && data.migrated > 0 ? (
              <Badge tone="outline">{data.migrated} loaded at go-live, excluded</Badge>
            ) : null}
            {data && data.counts.offered > 0 ? (
              <Badge tone="accent">
                {fmtPct((data.counts.commercial / data.counts.offered) * 100, 0)} of offers reach supply
              </Badge>
            ) : null}
          </>
        }
        actions={<ExportButton onClick={exportRows} disabled={rows.length === 0} />}
      />

      <StatGrid>
        {STEPS.map((step) => (
          <StatCell
            key={step.key}
            label={step.label}
            value={data?.counts[step.key] ?? 0}
            tone={step.key === 'commercial' ? 'ok' : 'default'}
            hint={
              data && data.counts.offered > 0 && step.key !== 'offered'
                ? `${fmtPct((data.counts[step.key] / data.counts.offered) * 100, 0)} of everything offered`
                : 'Reached at any point in its history'
            }
          />
        ))}
      </StatGrid>

      <div className="grid gap-4 lg:grid-cols-2">
        <Panel>
          <PanelHeader
            title="The funnel"
            subtitle="Each bar is the number of engagements that reached that step"
            icon={<Filter className="h-4 w-4" />}
          />
          {loading || !data ? (
            <div className="p-4">
              <SkeletonText lines={5} />
            </div>
          ) : (
            <div className="mx-auto max-w-sm space-y-3 p-4">
              {STEPS.map((step, index) => {
                const count = data.counts[step.key]
                const previous = index > 0 ? data.counts[STEPS[index - 1]!.key] : null
                const share = (count / peak) * 100
                return (
                  <div key={step.key} className="space-y-1">
                    <div className="flex items-baseline justify-between gap-2">
                      <span className="text-xs font-medium text-ink-800">{step.label}</span>
                      <span className="text-sm font-semibold tabular text-ink-900">{count}</span>
                    </div>
                    <div className="h-5 overflow-hidden rounded bg-paper-200">
                      <motion.div
                        className="h-full rounded"
                        style={{ backgroundColor: stageHex(step.stages[0]!) }}
                        initial={{ width: 0 }}
                        animate={{ width: `${Math.max(share, count > 0 ? 4 : 0)}%` }}
                        transition={{ duration: 0.6, delay: index * 0.07, ease: [0.22, 1, 0.36, 1] }}
                      />
                    </div>
                    {previous != null ? (
                      <p className="text-2xs text-ink-500">
                        {previous > 0 ? fmtPct((count / previous) * 100, 0) : '—'} of the step before
                      </p>
                    ) : (
                      <p className="text-2xs text-ink-500">The widest step, so the rest are read against it</p>
                    )}
                  </div>
                )
              })}
            </div>
          )}
        </Panel>

        <Panel>
          <PanelHeader
            title="Time between steps"
            subtitle="Average days, from the stage history"
            icon={<Users className="h-4 w-4" />}
          />
          {loading || !data ? (
            <div className="p-4">
              <SkeletonText lines={4} />
            </div>
          ) : (
            <ul className="divide-y divide-paper-200">
              {data.transitions.map((t) => (
                <li key={`${t.from}-${t.to}`} className="flex flex-wrap items-center gap-x-3 gap-y-1 px-4 py-3">
                  <span className="min-w-0 flex-1 text-sm text-ink-800">
                    {t.from} to {t.to}
                  </span>
                  <span className="text-xs tabular text-ink-500">{t.ratio != null ? fmtPct(t.ratio, 0) : '—'}</span>
                  <span className="w-24 text-right text-sm font-semibold tabular text-ink-900">
                    {t.avgDays != null ? `${t.avgDays} days` : '—'}
                  </span>
                  <span className="w-20 text-right text-2xs text-ink-400">
                    {t.count > 0 ? `${pluralise(t.count, 'case')}` : 'no cases'}
                  </span>
                </li>
              ))}
            </ul>
          )}
          <ReportNote className="border-t border-paper-200 p-4">
            A sample step counts {STAGE_LABEL.SAMPLE_SENT.toLowerCase()}, or {STAGE_LABEL.SAMPLE_REQUESTED.toLowerCase()}{' '}
            where the sample never went out, so a stalled request is still visible.
          </ReportNote>
        </Panel>
      </div>

      <Panel>
        <div className="flex flex-wrap items-center gap-2 border-b border-paper-200 p-3">
          <span className="text-2xs font-medium uppercase tracking-wide text-ink-500">Break down by</span>
          <SegmentedControl
            value={breakdown}
            onChange={setBreakdown}
            size="sm"
            options={[
              { value: 'owner', label: 'Owner' },
              { value: 'client', label: 'Client' },
            ]}
          />
        </div>
        <DataTable
          rows={rows}
          columns={columns}
          rowKey={(r) => r.key}
          loading={loading}
          pageSize={20}
          exportName={`conversion-funnel-by-${breakdown}`}
          onExport={(count) => void logExport(`conversion funnel by ${breakdown}`, '', count)}
          empty={
            <EmptyState
              icon={<Filter className="h-5 w-5" />}
              title="Nothing has moved through the funnel yet"
              description="The funnel reads the stage history, so it fills as engagements are moved along the board."
              action={
                <LinkButton to="/engagements" variant="primary" size="sm">
                  Open the engagement board
                </LinkButton>
              }
            />
          }
        />
      </Panel>

      <div className="space-y-1.5">
        <ReportNote>
          An engagement is counted at a step if it ever reached it, even if it later went on hold or was rejected, so
          the ratios describe what the business achieved rather than where the board stands today.
        </ReportNote>
        <ReportNote>
          {data && data.migrated > 0
            ? `${pluralise(data.migrated, 'engagement')} loaded at go-live is left out, because it arrived already approved or supplying and has no offer or sample recorded here. Counting it would widen the funnel rather than measure a conversion.`
            : 'Every engagement in the book was opened in the pipeline, so none is excluded.'}
        </ReportNote>
      </div>
    </div>
  )
}
