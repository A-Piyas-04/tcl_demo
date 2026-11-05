/**
 * The requirement list: every molecule a client has asked for (FR-M6-01).
 *
 * Implements the reading side of UC-04. The kind of requirement, new
 * development or alternate source, is shown on every row because it is what
 * drives the monthly development register, and the candidate count says at a
 * glance whether sourcing has anything to offer.
 */

import * as React from 'react'
import { useNavigate } from 'react-router-dom'
import { ClipboardList, Plus, SearchX, SlidersHorizontal, X } from 'lucide-react'
import { useDb } from '@/data/store'
import { clients as clientList, requirementRows, type RequirementRow } from '@/data/selectors'
import {
  REQUIREMENT_KIND_LABEL,
  REQUIREMENT_STATUS_LABEL,
} from '@/data/reference'
import { logExport } from '@/data/api'
import { useAsyncData, useDebounced, useUrlFilters } from '@/lib/hooks'
import { fmtDate, fmtMoney, fmtQty, pluralise } from '@/lib/utils'
import type { RequirementKind, RequirementStatus } from '@/data/types'
import {
  Badge,
  Button,
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
  StageBadge,
  Tooltip,
  WriteOnly,
} from '@/components/ui'

const DEFAULTS = {
  q: '',
  kind: '',
  status: '',
  client: '',
  product: '',
  owner: '',
  unsourced: '',
  from: '',
  to: '',
}

const OPEN_STATUSES: RequirementStatus[] = ['OPEN', 'SOURCING', 'ENGAGED']

export function RequirementList() {
  const db = useDb()
  const navigate = useNavigate()
  const { values, setValue, clear, activeCount, queryString } = useUrlFilters(DEFAULTS)
  const [search, setSearch] = React.useState(values.q)
  const debounced = useDebounced(search, 180)

  React.useEffect(() => {
    setValue('q', debounced)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [debounced])

  const { data: rows, loading } = useAsyncData<RequirementRow[]>(() => {
    return requirementRows(db, {
      clientId: values.client || undefined,
      productId: values.product || undefined,
      kind: (values.kind as RequirementKind) || undefined,
      unsourcedOnly: values.unsourced === '1',
    })
      .filter((row) => {
        const r = row.requirement
        const q = values.q.trim().toLowerCase()
        if (q) {
          const hit =
            row.product.genericName.toLowerCase().includes(q) ||
            row.client.displayName.toLowerCase().includes(q) ||
            (r.remarks ?? '').toLowerCase().includes(q)
          if (!hit) return false
        }
        if (values.status && r.status !== values.status) return false
        if (values.owner && r.ownerUserId !== values.owner) return false
        if (values.from && r.enquiryDate < values.from) return false
        if (values.to && r.enquiryDate > values.to) return false
        return true
      })
      .sort((a, b) => (a.requirement.enquiryDate < b.requirement.enquiryDate ? 1 : -1))
  }, [values])

  const columns: Column<RequirementRow>[] = [
    {
      key: 'client',
      header: 'Client',
      pinned: true,
      sortable: true,
      value: (r) => r.client.displayName,
      cell: (r) => <NameCell title={r.client.displayName} subtitle={fmtDate(r.requirement.enquiryDate)} />,
    },
    {
      key: 'product',
      header: 'Molecule',
      sortable: true,
      value: (r) => r.product.genericName,
      cell: (r) => (
        <NameCell
          title={r.product.genericName}
          subtitle={r.requirement.requiredGrade ?? undefined}
          badge={
            r.isUnsourced ? (
              <Tooltip content="No represented, available source matches this requirement.">
                <Badge tone="warn">Unsourced</Badge>
              </Tooltip>
            ) : undefined
          }
        />
      ),
    },
    {
      key: 'kind',
      header: 'Kind',
      sortable: true,
      width: '9.5rem',
      value: (r) => REQUIREMENT_KIND_LABEL[r.requirement.kind],
      cell: (r) => (
        <Badge tone={r.requirement.kind === 'NEW_DEVELOPMENT' ? 'info' : 'accent'}>
          {REQUIREMENT_KIND_LABEL[r.requirement.kind]}
        </Badge>
      ),
    },
    {
      key: 'pharmacopoeia',
      header: 'Pharmacopoeia',
      width: '7.5rem',
      value: (r) => r.requirement.requiredPharmacopoeia,
      cell: (r) =>
        r.requirement.requiredPharmacopoeia ? (
          <Badge tone="outline">{r.requirement.requiredPharmacopoeia}</Badge>
        ) : (
          <Tooltip content="No standard named, so every pharmacopoeia is a candidate.">
            <span className="text-xs text-ink-400">Any</span>
          </Tooltip>
        ),
    },
    {
      key: 'qty',
      header: 'Annual quantity',
      align: 'right',
      sortable: true,
      value: (r) => r.requirement.estAnnualQty,
      cell: (r) => (
        <span className="text-sm tabular text-ink-800">
          {fmtQty(r.requirement.estAnnualQty, r.requirement.qtyUom)}
          {r.requirement.qtyIsIndicative ? (
            <Tooltip content="Indicative only, so this requirement is left out of value-weighted reports.">
              <span className="ml-1 text-2xs text-ink-400">est.</span>
            </Tooltip>
          ) : null}
        </span>
      ),
    },
    {
      key: 'target',
      header: 'Target price',
      align: 'right',
      sortable: true,
      value: (r) => r.requirement.targetPrice,
      cell: (r) => (
        <span className="text-sm tabular text-ink-700">
          {fmtMoney(r.requirement.targetPrice, r.requirement.targetCurrency ?? 'USD', { decimals: 0 })}
        </span>
      ),
    },
    {
      key: 'status',
      header: 'Status',
      sortable: true,
      width: '7.5rem',
      value: (r) => REQUIREMENT_STATUS_LABEL[r.requirement.status],
      cell: (r) => <Badge tone={statusTone(r.requirement.status)}>{REQUIREMENT_STATUS_LABEL[r.requirement.status]}</Badge>,
    },
    {
      key: 'candidates',
      header: 'Candidate sources',
      align: 'right',
      sortable: true,
      width: '7.5rem',
      value: (r) => r.candidateCount,
      cell: (r) =>
        r.candidateCount > 0 ? (
          <span className="text-sm tabular font-medium text-ink-900">{r.candidateCount}</span>
        ) : (
          <span className="text-xs text-warn-600">None</span>
        ),
    },
    {
      key: 'engagements',
      header: 'Engagements',
      width: '9rem',
      value: (r) => r.engagementCount,
      cell: (r) =>
        r.engagementCount === 0 ? (
          <span className="text-xs text-ink-400">—</span>
        ) : (
          <span className="flex items-center gap-1.5">
            <span className="text-sm tabular text-ink-800">{r.engagementCount}</span>
            {r.bestStage ? <StageBadge stage={r.bestStage} size="sm" showDot={false} /> : null}
          </span>
        ),
    },
    {
      key: 'days',
      header: 'Days open',
      align: 'right',
      sortable: true,
      width: '6.5rem',
      value: (r) => r.daysOpen,
      cell: (r) =>
        OPEN_STATUSES.includes(r.requirement.status) ? (
          <span className="text-sm tabular text-ink-700">{r.daysOpen}d</span>
        ) : (
          <span className="text-xs text-ink-400">closed</span>
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

  const filtersOn = activeCount > 0
  const unsourcedCount = rows?.filter((r) => r.isUnsourced).length ?? 0

  return (
    <div className="space-y-4">
      <PageHeading
        title="Requirements"
        subtitle="What clients have asked for, and whether TCL can answer it."
        meta={
          <>
            <Badge tone="neutral">
              {pluralise(db.requirements.filter((r) => OPEN_STATUSES.includes(r.status)).length, 'open requirement')}
            </Badge>
            {unsourcedCount > 0 ? (
              <LinkButton to="/requirements/unsourced" variant="ghost" size="sm">
                <Badge tone="warn">{pluralise(unsourcedCount, 'unsourced')}</Badge>
              </LinkButton>
            ) : null}
          </>
        }
        actions={
          <>
            <LinkButton to="/requirements/unsourced" variant="secondary" size="md">
              Unsourced demand
            </LinkButton>
            <WriteOnly>
              <LinkButton to="/requirements/new" variant="primary" size="md" icon={<Plus className="h-3.5 w-3.5" />}>
                Record a requirement
              </LinkButton>
            </WriteOnly>
          </>
        }
      />

      <Panel>
        <div className="grid gap-2.5 border-b border-paper-200 p-3 sm:grid-cols-2 lg:grid-cols-4">
          <SearchInput
            value={search}
            onChange={setSearch}
            placeholder="Client, molecule or remark…"
            className="sm:col-span-2 lg:col-span-1"
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
            value={values.product}
            onChange={(v) => setValue('product', v)}
            allowEmpty
            emptyLabel="Any molecule"
            placeholder="Any molecule"
            options={db.products
              .filter((p) => p.isActive)
              .map((p) => ({ value: p.id, label: p.genericName }))}
          />
          <Select
            value={values.kind}
            onChange={(v) => setValue('kind', v)}
            allowEmpty
            emptyLabel="Any kind"
            placeholder="Any kind"
            options={(Object.keys(REQUIREMENT_KIND_LABEL) as RequirementKind[]).map((k) => ({
              value: k,
              label: REQUIREMENT_KIND_LABEL[k],
            }))}
          />
          <Select
            value={values.status}
            onChange={(v) => setValue('status', v)}
            allowEmpty
            emptyLabel="Any status"
            placeholder="Any status"
            options={(Object.keys(REQUIREMENT_STATUS_LABEL) as RequirementStatus[]).map((s) => ({
              value: s,
              label: REQUIREMENT_STATUS_LABEL[s],
            }))}
          />
          <Select
            value={values.owner}
            onChange={(v) => setValue('owner', v)}
            allowEmpty
            emptyLabel="Any owner"
            placeholder="Any owner"
            options={db.users.filter((u) => u.isActive).map((u) => ({ value: u.id, label: u.fullName }))}
          />
          <div className="flex items-center gap-1.5">
            <DateInput
              value={values.from}
              onChange={(e) => setValue('from', e.target.value)}
              aria-label="Enquiries from"
            />
            <span className="text-xs text-ink-400">to</span>
            <DateInput value={values.to} onChange={(e) => setValue('to', e.target.value)} aria-label="Enquiries to" />
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant={values.unsourced === '1' ? 'primary' : 'secondary'}
              size="sm"
              onClick={() => setValue('unsourced', values.unsourced === '1' ? '' : '1')}
            >
              Unsourced only
            </Button>
            {filtersOn ? (
              <Button
                variant="ghost"
                size="sm"
                icon={<X className="h-3.5 w-3.5" />}
                onClick={() => {
                  clear()
                  setSearch('')
                }}
              >
                Clear
              </Button>
            ) : null}
          </div>
        </div>

        <DataTable
          rows={rows ?? []}
          columns={columns}
          rowKey={(r) => r.requirement.id}
          loading={loading}
          onRowClick={(r) => navigate(`/requirements/${r.requirement.id}`)}
          exportName="requirements"
          exportFilters={queryString}
          onExport={(count) => void logExport('requirement list', queryString, count)}
          toolbar={
            <span className="flex items-center gap-2 text-xs text-ink-500">
              <SlidersHorizontal className="h-3.5 w-3.5" />
              {rows ? pluralise(rows.length, 'requirement') : '…'}
              {filtersOn ? <Badge tone="accent">{activeCount} filters</Badge> : null}
            </span>
          }
          empty={
            filtersOn ? (
              <EmptyState
                icon={<SearchX className="h-5 w-5" />}
                title="No requirement matches these filters"
                description="Try widening the date range or clearing the kind and status."
                action={
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={() => {
                      clear()
                      setSearch('')
                    }}
                  >
                    Clear filters
                  </Button>
                }
              />
            ) : (
              <EmptyState
                icon={<ClipboardList className="h-5 w-5" />}
                title="No requirement has been recorded yet"
                description="A requirement is the start of the pipeline: it says which client wants which molecule, and in what quantity."
                action={
                  <WriteOnly>
                    <LinkButton to="/requirements/new" variant="primary" size="sm">
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

function statusTone(status: RequirementStatus) {
  switch (status) {
    case 'OPEN':
      return 'info' as const
    case 'SOURCING':
      return 'accent' as const
    case 'ENGAGED':
      return 'accent' as const
    case 'FULFILLED':
      return 'ok' as const
    case 'CLOSED_LOST':
      return 'danger' as const
    default:
      return 'neutral' as const
  }
}
