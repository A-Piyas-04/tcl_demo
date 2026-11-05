/**
 * The sample tracker (FR-M7-06): every sample round across the book.
 *
 * The question it answers is "what is sitting at a client with nothing coming
 * back". A round dispatched longer ago than the Under evaluation ageing
 * threshold with no outcome is flagged, because that is the point at which
 * somebody should pick up the telephone.
 */

import { useNavigate } from 'react-router-dom'
import { FlaskConical, SlidersHorizontal, X } from 'lucide-react'
import { useCurrentUser, useDb } from '@/data/store'
import { clients as clientList, daysSince } from '@/data/selectors'
import {
  SAMPLE_OUTCOME_LABEL,
  SAMPLE_PURPOSE_LABEL,
  reasonName,
  stageConfig,
} from '@/data/reference'
import { logExport } from '@/data/api'
import { useAsyncData, useUrlFilters } from '@/lib/hooks'
import { fmtDate, fmtQty, pluralise } from '@/lib/utils'
import type { Company, Engagement, ManufacturerProduct, Product, SampleOutcome, SampleRound } from '@/data/types'
import {
  Badge,
  Button,
  Column,
  DataTable,
  EmptyState,
  LinkButton,
  NameCell,
  Panel,
  PageHeading,
  SegmentedControl,
  Select,
  StageBadge,
  Tooltip,
  WriteOnly,
} from '@/components/ui'

const DEFAULTS = {
  outcome: '',
  overdue: '',
  client: '',
  owner: '',
}

interface Row {
  round: SampleRound
  engagement: Engagement
  client: Company
  product: Product
  manufacturer: Company
  mp: ManufacturerProduct
  ownerName: string
  daysSinceDispatch: number | null
  isOverdue: boolean
}

export function SampleTracker() {
  const db = useDb()
  const navigate = useNavigate()
  const user = useCurrentUser()
  const { values, setValue, setMany, activeCount, queryString } = useUrlFilters(DEFAULTS)
  const threshold = stageConfig('UNDER_EVALUATION').ageingThresholdDays

  const { data: rows, loading } = useAsyncData<Row[]>(() => {
    const out: Row[] = []
    for (const round of db.samples) {
      const engagement = db.engagements.find((e) => e.id === round.engagementId)
      if (!engagement) continue
      const client = db.companies.find((c) => c.id === engagement.clientCompanyId)
      const product = db.products.find((p) => p.id === engagement.productId)
      const manufacturer = db.companies.find((c) => c.id === engagement.manufacturerCompanyId)
      const mp = db.manufacturerProducts.find((m) => m.id === engagement.manufacturerProductId)
      if (!client || !product || !manufacturer || !mp) continue

      const since = round.dispatchedOn ? daysSince(round.dispatchedOn) : null
      const overdue = round.outcome === 'PENDING' && since != null && since > threshold

      out.push({
        round,
        engagement,
        client,
        product,
        manufacturer,
        mp,
        ownerName: db.users.find((u) => u.id === engagement.ownerUserId)?.fullName ?? '—',
        daysSinceDispatch: since,
        isOverdue: overdue,
      })
    }

    return out
      .filter((row) => {
        if (values.outcome === 'pending' && row.round.outcome !== 'PENDING') return false
        if (values.outcome && values.outcome !== 'pending' && row.round.outcome !== values.outcome) return false
        if (values.overdue === '1' && !row.isOverdue) return false
        if (values.client && row.client.id !== values.client) return false
        if (values.owner && row.engagement.ownerUserId !== values.owner) return false
        return true
      })
      .sort(
        (a, b) =>
          Number(b.isOverdue) - Number(a.isOverdue) ||
          (b.daysSinceDispatch ?? -1) - (a.daysSinceDispatch ?? -1) ||
          (a.round.requestedOn < b.round.requestedOn ? 1 : -1),
      )
  }, [values, threshold])

  const all = rows ?? []
  const overdueCount = all.filter((r) => r.isOverdue).length

  const columns: Column<Row>[] = [
    {
      key: 'client',
      header: 'Client',
      pinned: true,
      sortable: true,
      value: (r) => r.client.displayName,
      cell: (r) => <NameCell title={r.client.displayName} subtitle={r.product.genericName} />,
    },
    {
      key: 'source',
      header: 'Source',
      sortable: true,
      value: (r) => r.manufacturer.displayName,
      cell: (r) => (
        <NameCell title={r.manufacturer.displayName} subtitle={`${r.mp.grade} · ${r.mp.pharmacopoeia}`} />
      ),
    },
    {
      key: 'round',
      header: 'Round',
      align: 'right',
      sortable: true,
      width: '5rem',
      value: (r) => r.round.roundNo,
      cell: (r) => <span className="text-sm tabular text-ink-700">{r.round.roundNo}</span>,
    },
    {
      key: 'purpose',
      header: 'Purpose',
      sortable: true,
      width: '8rem',
      value: (r) => SAMPLE_PURPOSE_LABEL[r.round.purpose],
      cell: (r) => <Badge tone="outline">{SAMPLE_PURPOSE_LABEL[r.round.purpose]}</Badge>,
    },
    {
      key: 'qty',
      header: 'Quantity',
      align: 'right',
      sortable: true,
      value: (r) => r.round.requestedQty,
      cell: (r) => (
        <span className="text-xs tabular text-ink-700">{fmtQty(r.round.requestedQty, r.round.qtyUom)}</span>
      ),
    },
    {
      key: 'requested',
      header: 'Requested',
      optional: true,
      sortable: true,
      value: (r) => r.round.requestedOn,
      cell: (r) => <span className="text-xs tabular text-ink-500">{fmtDate(r.round.requestedOn)}</span>,
    },
    {
      key: 'dispatched',
      header: 'Dispatched',
      sortable: true,
      width: '7.5rem',
      value: (r) => r.round.dispatchedOn,
      cell: (r) =>
        r.round.dispatchedOn ? (
          <span className="text-xs tabular text-ink-600">{fmtDate(r.round.dispatchedOn)}</span>
        ) : (
          <span className="text-xs text-ink-400">not yet</span>
        ),
    },
    {
      key: 'since',
      header: 'Days since dispatch',
      align: 'right',
      sortable: true,
      width: '8rem',
      value: (r) => r.daysSinceDispatch,
      cell: (r) =>
        r.daysSinceDispatch == null ? (
          <span className="text-xs text-ink-400">—</span>
        ) : r.isOverdue ? (
          <Tooltip content={`No outcome after ${r.daysSinceDispatch} days, beyond the ${threshold}-day threshold for Under evaluation.`}>
            <span className="text-xs font-medium tabular text-warn-600">{r.daysSinceDispatch}d</span>
          </Tooltip>
        ) : (
          <span className="text-xs tabular text-ink-600">{r.daysSinceDispatch}d</span>
        ),
    },
    {
      key: 'stage',
      header: 'Engagement stage',
      optional: true,
      value: (r) => r.engagement.stage,
      cell: (r) => <StageBadge stage={r.engagement.stage} size="sm" />,
    },
    {
      key: 'outcome',
      header: 'Outcome',
      sortable: true,
      width: '9rem',
      value: (r) => SAMPLE_OUTCOME_LABEL[r.round.outcome],
      cell: (r) => (
        <span className="flex items-center gap-1.5">
          <Badge tone={outcomeTone(r.round.outcome)}>{SAMPLE_OUTCOME_LABEL[r.round.outcome]}</Badge>
          {r.isOverdue ? <Badge tone="warn">Overdue</Badge> : null}
          {r.round.outcome === 'FAIL' && r.round.rejectionReasonCode ? (
            <Tooltip content={reasonName(r.round.rejectionReasonCode) ?? ''}>
              <span className="text-2xs text-ink-400">why</span>
            </Tooltip>
          ) : null}
        </span>
      ),
    },
    {
      key: 'owner',
      header: 'Owner',
      sortable: true,
      optional: true,
      value: (r) => r.ownerName,
      cell: (r) => <span className="truncate text-xs text-ink-600">{r.ownerName}</span>,
    },
  ]

  return (
    <div className="space-y-4">
      <PageHeading
        title="Samples"
        subtitle="Every round across the book, so nothing sits silently at a client."
        meta={
          <>
            <Badge tone="neutral">{pluralise(all.length, 'round')}</Badge>
            {overdueCount > 0 ? <Badge tone="warn">{pluralise(overdueCount, 'overdue')}</Badge> : null}
            <Tooltip content="From the Under evaluation ageing threshold in the stage configuration.">
              <Badge tone="outline">Threshold {threshold} days</Badge>
            </Tooltip>
          </>
        }
        actions={
          <SegmentedControl
            value={values.overdue === '1' ? 'overdue' : 'all'}
            onChange={(v) => setValue('overdue', v === 'overdue' ? '1' : '')}
            options={[
              { value: 'all', label: 'All rounds' },
              { value: 'overdue', label: 'Overdue only' },
            ]}
          />
        }
      />

      <Panel>
        <div className="grid gap-2.5 border-b border-paper-200 p-3 sm:grid-cols-2 lg:grid-cols-4">
          <Select
            value={values.outcome}
            onChange={(v) => setValue('outcome', v)}
            allowEmpty
            emptyLabel="Any outcome"
            placeholder="Any outcome"
            options={[
              { value: 'pending', label: 'Pending' },
              { value: 'PASS', label: 'Pass' },
              { value: 'FAIL', label: 'Fail' },
              { value: 'CANCELLED', label: 'Cancelled' },
            ]}
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
            value={values.owner}
            onChange={(v) => setValue('owner', v)}
            allowEmpty
            emptyLabel="Any owner"
            placeholder="Any owner"
            options={db.users.filter((u) => u.isActive).map((u) => ({ value: u.id, label: u.fullName }))}
          />
          <div className="flex items-center gap-2">
            <Button
              variant="secondary"
              size="sm"
              onClick={() => setValue('owner', user?.id ?? '')}
              disabled={!user || values.owner === user.id}
            >
              Mine
            </Button>
            {activeCount > 0 ? (
              <Button
                variant="ghost"
                size="sm"
                icon={<X className="h-3.5 w-3.5" />}
                onClick={() => setMany({ outcome: '', overdue: '', client: '', owner: '' })}
              >
                Clear
              </Button>
            ) : null}
          </div>
        </div>

        <DataTable
          rows={all}
          columns={columns}
          rowKey={(r) => r.round.id}
          loading={loading}
          onRowClick={(r) => navigate(`/engagements/${r.engagement.id}`)}
          exportName="sample-rounds"
          exportFilters={queryString}
          onExport={(count) => void logExport('sample tracker', queryString, count)}
          rowTone={(r) => (r.isOverdue ? 'bg-warn-50/50' : undefined)}
          toolbar={
            <span className="flex items-center gap-2 text-xs text-ink-500">
              <SlidersHorizontal className="h-3.5 w-3.5" />
              {loading ? '…' : pluralise(all.length, 'sample round')}
              {activeCount > 0 ? <Badge tone="accent">{activeCount} filters</Badge> : null}
            </span>
          }
          empty={
            activeCount > 0 ? (
              <EmptyState
                icon={<FlaskConical className="h-5 w-5" />}
                title="No sample round matches these filters"
                description="Try clearing the outcome or the overdue filter."
                action={
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={() => setMany({ outcome: '', overdue: '', client: '', owner: '' })}
                  >
                    Clear filters
                  </Button>
                }
              />
            ) : (
              <EmptyState
                icon={<FlaskConical className="h-5 w-5" />}
                title="No sample has been requested yet"
                description="A sample round is raised from an engagement, once the client asks to test material."
                action={
                  <LinkButton to="/engagements" variant="primary" size="sm">
                    Open the engagement board
                  </LinkButton>
                }
                secondary={
                  <WriteOnly>
                    <LinkButton to="/requirements/new" variant="ghost" size="sm">
                      Record a requirement
                    </LinkButton>
                  </WriteOnly>
                }
              />
            )
          }
        />
      </Panel>
    </div>
  )
}

function outcomeTone(outcome: SampleOutcome) {
  switch (outcome) {
    case 'PASS':
      return 'ok' as const
    case 'FAIL':
      return 'danger' as const
    case 'CANCELLED':
      return 'neutral' as const
    default:
      return 'warn' as const
  }
}
