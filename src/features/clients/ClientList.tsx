/**
 * The client list: the demand-side register, and one of the three co-equal
 * entry points (FR-M9-03).
 *
 * Filterable by product, by the product's manufacturer, and by both at once,
 * which answers "which of my clients take Budesonide from Cipla" in one step.
 */

import * as React from 'react'
import { useNavigate } from 'react-router-dom'
import { Plus, SlidersHorizontal, Users, X } from 'lucide-react'
import { useDb } from '@/data/store'
import { clients as clientList, engagementRows, manufacturers as mfrList } from '@/data/selectors'
import { CLIENT_STATUS_LABEL, paymentTermLabel } from '@/data/reference'
import { logExport } from '@/data/api'
import { useAsyncData, useDebounced, useUrlFilters } from '@/lib/hooks'
import { fmtDate, pluralise } from '@/lib/utils'
import type { ClientStatus, Company } from '@/data/types'
import {
  Avatar,
  Badge,
  Button,
  ClientStatusBadge,
  Column,
  DataTable,
  EmptyState,
  LinkButton,
  NameCell,
  Panel,
  PageHeading,
  SearchInput,
  Select,
  Tooltip,
  WriteOnly,
} from '@/components/ui'

interface Row {
  client: Company
  status: ClientStatus
  ownerName: string
  productCount: number
  sourceCount: number
  commercialCount: number
}

const DEFAULTS = {
  q: '',
  product: '',
  manufacturer: '',
  status: '',
  owner: '',
  inactive: '',
}

export function ClientList() {
  const db = useDb()
  const navigate = useNavigate()
  const { values, setValue, clear, activeCount, queryString } = useUrlFilters(DEFAULTS)
  const [search, setSearch] = React.useState(values.q)
  const debounced = useDebounced(search, 180)

  React.useEffect(() => {
    setValue('q', debounced)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [debounced])

  const { data: rows, loading } = useAsyncData<Row[]>(() => {
    const engs = engagementRows(db)

    return clientList(db)
      .filter((c) => (values.inactive === '1' ? true : c.isActive))
      .map((client) => {
        const mine = engs.filter((e) => e.client.id === client.id)
        return {
          client,
          status: client.client?.status ?? 'PROSPECT',
          ownerName: engs.find((e) => e.client.id === client.id)?.ownerName ?? '—',
          productCount: new Set(mine.map((e) => e.product.id)).size,
          sourceCount: new Set(mine.map((e) => e.mp.id)).size,
          commercialCount: mine.filter((e) => e.stage === 'COMMERCIAL').length,
        }
      })
      .filter((row) => {
        const q = values.q.trim().toLowerCase()
        if (q) {
          const hit =
            row.client.displayName.toLowerCase().includes(q) ||
            row.client.legalName.toLowerCase().includes(q) ||
            (row.client.client?.therapeuticFocus ?? '').toLowerCase().includes(q)
          if (!hit) return false
        }
        if (values.status && row.status !== values.status) return false
        if (values.owner && row.client.client?.ownerUserId !== values.owner) return false

        // the three-way pivot: product, the product's manufacturer, or both
        if (values.product || values.manufacturer) {
          const match = engs.some(
            (e) =>
              e.client.id === row.client.id &&
              (!values.product || e.product.id === values.product) &&
              (!values.manufacturer || e.manufacturer.id === values.manufacturer),
          )
          if (!match) return false
        }
        return true
      })
      .sort((a, b) => a.client.displayName.localeCompare(b.client.displayName))
  }, [values])

  const columns: Column<Row>[] = [
    {
      key: 'name',
      header: 'Client',
      pinned: true,
      sortable: true,
      value: (r) => r.client.displayName,
      cell: (r) => (
        <NameCell
          title={r.client.displayName}
          subtitle={r.client.legalName}
          badge={
            !r.client.isActive ? (
              <Badge tone="neutral">Inactive</Badge>
            ) : r.client.possibleDuplicate ? (
              <Badge tone="warn">Check duplicate</Badge>
            ) : undefined
          }
        />
      ),
    },
    {
      key: 'status',
      header: 'Status',
      sortable: true,
      width: '7.5rem',
      value: (r) => CLIENT_STATUS_LABEL[r.status],
      cell: (r) => <ClientStatusBadge status={r.status} />,
    },
    {
      key: 'products',
      header: 'Products taken',
      align: 'right',
      sortable: true,
      width: '8rem',
      value: (r) => r.productCount,
      cell: (r) => <span className="tabular text-sm text-ink-800">{r.productCount || '—'}</span>,
    },
    {
      key: 'sources',
      header: 'Sources used',
      align: 'right',
      sortable: true,
      width: '8rem',
      value: (r) => r.sourceCount,
      cell: (r) => (
        <Tooltip content="Distinct manufacturer-products behind those molecules. More sources than products means dual sourcing.">
          <span className="tabular text-sm text-ink-800">{r.sourceCount || '—'}</span>
        </Tooltip>
      ),
    },
    {
      key: 'commercial',
      header: 'Commercial',
      align: 'right',
      sortable: true,
      width: '7.5rem',
      value: (r) => r.commercialCount,
      cell: (r) =>
        r.commercialCount > 0 ? (
          <Badge tone="ok">{r.commercialCount} supplying</Badge>
        ) : (
          <span className="text-xs text-ink-400">—</span>
        ),
    },
    {
      key: 'owner',
      header: 'Owner',
      sortable: true,
      width: '11rem',
      value: (r) => r.ownerName,
      cell: (r) => (
        <span className="flex items-center gap-2">
          <Avatar name={r.ownerName} size="sm" />
          <span className="truncate text-xs text-ink-700">{r.ownerName}</span>
        </span>
      ),
    },
    {
      key: 'terms',
      header: 'Payment terms',
      optional: true,
      value: (r) => paymentTermLabel(r.client.client?.paymentTermCode ?? null),
      cell: (r) => (
        <span className="truncate text-xs text-ink-600">
          {paymentTermLabel(r.client.client?.paymentTermCode ?? null)}
        </span>
      ),
    },
    {
      key: 'focus',
      header: 'Therapeutic focus',
      optional: true,
      value: (r) => r.client.client?.therapeuticFocus ?? null,
      cell: (r) => <span className="truncate text-xs text-ink-600">{r.client.client?.therapeuticFocus ?? '—'}</span>,
    },
    {
      key: 'first',
      header: 'First business',
      align: 'right',
      sortable: true,
      width: '8.5rem',
      value: (r) => r.client.client?.firstBusinessDate ?? null,
      cell: (r) => (
        <span className="text-xs tabular text-ink-600">{fmtDate(r.client.client?.firstBusinessDate)}</span>
      ),
    },
  ]

  const filtersOn = activeCount > 0
  const owners = React.useMemo(() => {
    const ids = new Set(clientList(db).map((c) => c.client?.ownerUserId).filter(Boolean) as string[])
    return db.users
      .filter((u) => ids.has(u.id))
      .map((u) => ({ value: u.id, label: u.fullName }))
      .sort((a, b) => a.label.localeCompare(b.label))
  }, [db])

  return (
    <div className="space-y-4">
      <PageHeading
        title="Clients"
        subtitle="Every company that buys through TCL, what it takes and who looks after it."
        meta={
          <>
            <Badge tone="neutral">{pluralise(clientList(db).filter((c) => c.isActive).length, 'client')}</Badge>
            <Badge tone="ok">
              {pluralise(
                clientList(db).filter((c) => c.isActive && c.client?.status === 'ACTIVE').length,
                'active relationship',
              )}
            </Badge>
          </>
        }
        actions={
          <WriteOnly>
            <LinkButton to="/clients/new" variant="primary" size="md" icon={<Plus className="h-3.5 w-3.5" />}>
              Register a client
            </LinkButton>
          </WriteOnly>
        }
      />

      <Panel>
        <div className="grid gap-2.5 border-b border-paper-200 p-3 sm:grid-cols-2 lg:grid-cols-4">
          <SearchInput
            value={search}
            onChange={setSearch}
            placeholder="Client name or therapeutic focus…"
            className="sm:col-span-2 lg:col-span-1"
          />
          <Select
            value={values.product}
            onChange={(v) => setValue('product', v)}
            allowEmpty
            emptyLabel="Any product"
            placeholder="Any product"
            options={db.products
              .filter((p) => p.isActive)
              .map((p) => ({ value: p.id, label: p.genericName }))
              .sort((a, b) => a.label.localeCompare(b.label))}
          />
          <Select
            value={values.manufacturer}
            onChange={(v) => setValue('manufacturer', v)}
            allowEmpty
            emptyLabel="Any manufacturer"
            placeholder="Any manufacturer"
            options={mfrList(db)
              .filter((m) => m.isActive)
              .map((m) => ({ value: m.id, label: m.displayName }))}
          />
          <Select
            value={values.status}
            onChange={(v) => setValue('status', v)}
            allowEmpty
            emptyLabel="Any status"
            placeholder="Any status"
            options={(Object.keys(CLIENT_STATUS_LABEL) as ClientStatus[]).map((s) => ({
              value: s,
              label: CLIENT_STATUS_LABEL[s],
            }))}
          />
          <Select
            value={values.owner}
            onChange={(v) => setValue('owner', v)}
            allowEmpty
            emptyLabel="Any owner"
            placeholder="Any owner"
            options={owners}
          />
          {filtersOn ? (
            <div className="flex items-center gap-2">
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
            </div>
          ) : null}
        </div>

        <DataTable
          rows={rows ?? []}
          columns={columns}
          rowKey={(r) => r.client.id}
          loading={loading}
          onRowClick={(r) => navigate(`/clients/${r.client.id}`)}
          exportName="clients"
          exportFilters={queryString}
          onExport={(count) => void logExport('client list', queryString, count)}
          toolbar={
            <span className="flex items-center gap-2 text-xs text-ink-500">
              <SlidersHorizontal className="h-3.5 w-3.5" />
              {rows ? pluralise(rows.length, 'client') : '…'}
              {filtersOn ? <Badge tone="accent">{activeCount} filters</Badge> : null}
              <label className="ml-1 flex cursor-pointer items-center gap-1.5 text-xs text-ink-500">
                <input
                  type="checkbox"
                  checked={values.inactive === '1'}
                  onChange={(e) => setValue('inactive', e.target.checked ? '1' : '')}
                  className="h-3.5 w-3.5 rounded border-paper-400 text-accent-600"
                />
                Include inactive
              </label>
            </span>
          }
          empty={
            <EmptyState
              icon={<Users className="h-5 w-5" />}
              title={values.q ? `No client matches “${values.q}”` : 'No client matches these filters'}
              description={
                values.q
                  ? 'Search covers the display name, the legal name and the therapeutic focus. If this is a new company, register it.'
                  : values.product || values.manufacturer
                    ? 'No client takes that combination of molecule and source yet. Record a requirement so the demand is on the books.'
                    : 'Try removing a filter.'
              }
              action={
                values.q ? (
                  <WriteOnly>
                    <LinkButton to={`/clients/new?name=${encodeURIComponent(values.q)}`} variant="primary" size="sm">
                      Register “{values.q}”
                    </LinkButton>
                  </WriteOnly>
                ) : (
                  <WriteOnly>
                    <LinkButton to="/clients/new" variant="primary" size="sm">
                      Register a client
                    </LinkButton>
                  </WriteOnly>
                )
              }
              secondary={
                filtersOn ? (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => {
                      clear()
                      setSearch('')
                    }}
                  >
                    Clear filters
                  </Button>
                ) : null
              }
            />
          }
        />
      </Panel>
    </div>
  )
}
