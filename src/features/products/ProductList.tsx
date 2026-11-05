/**
 * The product list: one of the three co-equal entry points (FR-M9-01).
 *
 * Filterable by manufacturer, by client, and by both at once, which is the
 * question the business cannot answer today.
 */

import * as React from 'react'
import { useNavigate } from 'react-router-dom'
import { FlaskConical, Plus, SlidersHorizontal, X } from 'lucide-react'
import { useDb } from '@/data/store'
import { engagementRows, sourceRows, clients as clientList, manufacturers as mfrList } from '@/data/selectors'
import { PRODUCT_CATEGORY_LABEL, STAGE_LABEL, THERAPEUTIC_CATEGORIES } from '@/data/reference'
import { logExport } from '@/data/api'
import { useAsyncData, useDebounced, useUrlFilters } from '@/lib/hooks'
import { pluralise } from '@/lib/utils'
import type { EngagementStage, Product } from '@/data/types'
import {
  Badge,
  Button,
  Column,
  DataTable,
  EmptyState,
  FilingDot,
  LinkButton,
  NameCell,
  Panel,
  PageHeading,
  Select,
  SearchInput,
  Tooltip,
  WriteOnly,
} from '@/components/ui'

interface Row {
  product: Product
  sourceCount: number
  portfolioCount: number
  clientCount: number
  commercialCount: number
  stages: EngagementStage[]
  hasDmf: boolean
  hasCep: boolean
}

const DEFAULTS = {
  q: '',
  manufacturer: '',
  client: '',
  category: '',
  therapeutic: '',
  stage: '',
  portfolio: '',
  archived: '',
}

export function ProductList() {
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
    const all = sourceRows(db)
    const engs = engagementRows(db)

    return db.products
      .filter((p) => (values.archived === '1' ? true : p.isActive))
      .map((product) => {
        const sources = all.filter((s) => s.product.id === product.id)
        const engagements = engs.filter((e) => e.product.id === product.id)
        return {
          product,
          sourceCount: sources.length,
          portfolioCount: sources.filter((s) => s.inPortfolio).length,
          clientCount: new Set(engagements.map((e) => e.client.id)).size,
          commercialCount: engagements.filter((e) => e.stage === 'COMMERCIAL').length,
          stages: engagements.map((e) => e.stage),
          hasDmf: sources.some((s) => s.hasDmf),
          hasCep: sources.some((s) => s.hasCep),
        }
      })
      .filter((row) => {
        const q = values.q.trim().toLowerCase()
        if (q) {
          const hit =
            row.product.genericName.toLowerCase().includes(q) ||
            row.product.synonyms.some((s) => s.toLowerCase().includes(q)) ||
            row.product.casNumber?.includes(q)
          if (!hit) return false
        }
        if (values.category && row.product.category !== values.category) return false
        if (values.therapeutic && !row.product.therapeuticCategories.includes(values.therapeutic)) return false
        if (values.portfolio === '1' && row.portfolioCount === 0) return false
        if (values.manufacturer) {
          const made = all.some((s) => s.product.id === row.product.id && s.manufacturer.id === values.manufacturer)
          if (!made) return false
        }
        if (values.client) {
          const taken = engs.some((e) => e.product.id === row.product.id && e.client.id === values.client)
          if (!taken) return false
        }
        if (values.stage) {
          const atStage = engs.some(
            (e) => e.product.id === row.product.id && e.stage === values.stage && (!values.client || e.client.id === values.client),
          )
          if (!atStage) return false
        }
        return true
      })
      .sort((a, b) => a.product.genericName.localeCompare(b.product.genericName))
  }, [values])

  const columns: Column<Row>[] = [
    {
      key: 'name',
      header: 'Molecule',
      pinned: true,
      sortable: true,
      value: (r) => r.product.genericName,
      cell: (r) => (
        <NameCell
          title={r.product.genericName}
          subtitle={
            r.product.synonyms.length
              ? r.product.synonyms.slice(0, 2).join(' · ')
              : (r.product.casNumber ?? undefined)
          }
          badge={
            !r.product.isActive ? (
              <Badge tone="neutral">Discontinued</Badge>
            ) : r.product.possibleDuplicate ? (
              <Badge tone="warn">Check duplicate</Badge>
            ) : undefined
          }
        />
      ),
    },
    {
      key: 'category',
      header: 'Category',
      sortable: true,
      width: '7.5rem',
      value: (r) => r.product.category,
      cell: (r) => (
        <Badge tone={r.product.category === 'API' ? 'accent' : 'neutral'}>
          {PRODUCT_CATEGORY_LABEL[r.product.category]}
        </Badge>
      ),
    },
    {
      key: 'therapeutic',
      header: 'Therapeutic area',
      optional: true,
      value: (r) => r.product.therapeuticCategories.join('; '),
      cell: (r) => <span className="truncate text-xs text-ink-600">{r.product.therapeuticCategories.join(', ') || '—'}</span>,
    },
    {
      key: 'cas',
      header: 'CAS',
      optional: true,
      value: (r) => r.product.casNumber,
      cell: (r) => <span className="font-mono text-xs tabular text-ink-600">{r.product.casNumber ?? '—'}</span>,
    },
    {
      key: 'sources',
      header: 'Sources',
      align: 'right',
      sortable: true,
      width: '7rem',
      value: (r) => r.sourceCount,
      cell: (r) => (
        <Tooltip content={`${r.portfolioCount} of ${r.sourceCount} represented by TCL`}>
          <span className="tabular text-sm">
            <span className="font-medium text-ink-900">{r.portfolioCount}</span>
            <span className="text-ink-400"> / {r.sourceCount}</span>
          </span>
        </Tooltip>
      ),
    },
    {
      key: 'clients',
      header: 'Clients',
      align: 'right',
      sortable: true,
      width: '6rem',
      value: (r) => r.clientCount,
      cell: (r) => <span className="tabular text-sm text-ink-800">{r.clientCount || '—'}</span>,
    },
    {
      key: 'commercial',
      header: 'Commercial',
      align: 'right',
      sortable: true,
      width: '7rem',
      value: (r) => r.commercialCount,
      cell: (r) =>
        r.commercialCount > 0 ? (
          <Badge tone="ok">{r.commercialCount} supplying</Badge>
        ) : (
          <span className="text-xs text-ink-400">—</span>
        ),
    },
    {
      key: 'regulatory',
      header: 'Filings',
      width: '8rem',
      value: (r) => [r.hasDmf ? 'DMF' : '', r.hasCep ? 'CEP' : ''].filter(Boolean).join('+'),
      cell: (r) => (
        <span className="flex gap-1">
          <FilingDot present={r.hasDmf} label="DMF" />
          <FilingDot present={r.hasCep} label="CEP" />
        </span>
      ),
    },
  ]

  const filtersOn = activeCount > 0

  return (
    <div className="space-y-4">
      <PageHeading
        title="Products"
        subtitle="Every molecule TCL knows — what it is, who makes it, and who takes it."
        meta={
          <>
            <Badge tone="neutral">{pluralise(db.products.filter((p) => p.isActive).length, 'active product')}</Badge>
            <Badge tone="accent">
              {pluralise(db.portfolio.filter((p) => p.isActive).length, 'represented source')}
            </Badge>
          </>
        }
        actions={
          <WriteOnly>
            <LinkButton to="/products/new" variant="primary" size="md" icon={<Plus className="h-3.5 w-3.5" />}>
              Add product
            </LinkButton>
          </WriteOnly>
        }
      />

      <Panel>
        <div className="grid gap-2.5 border-b border-paper-200 p-3 sm:grid-cols-2 lg:grid-cols-4">
          <SearchInput
            value={search}
            onChange={setSearch}
            placeholder="Molecule, synonym or CAS…"
            className="sm:col-span-2 lg:col-span-1"
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
            value={values.client}
            onChange={(v) => setValue('client', v)}
            allowEmpty
            emptyLabel="Any client"
            placeholder="Any client"
            options={clientList(db).map((c) => ({ value: c.id, label: c.displayName }))}
          />
          <Select
            value={values.stage}
            onChange={(v) => setValue('stage', v)}
            allowEmpty
            emptyLabel="Any stage"
            placeholder="Any stage"
            options={(Object.keys(STAGE_LABEL) as EngagementStage[]).map((s) => ({
              value: s,
              label: STAGE_LABEL[s],
            }))}
          />
          <Select
            value={values.category}
            onChange={(v) => setValue('category', v)}
            allowEmpty
            emptyLabel="Any category"
            placeholder="Any category"
            options={Object.entries(PRODUCT_CATEGORY_LABEL).map(([value, label]) => ({ value, label }))}
          />
          <Select
            value={values.therapeutic}
            onChange={(v) => setValue('therapeutic', v)}
            allowEmpty
            emptyLabel="Any therapeutic area"
            placeholder="Any therapeutic area"
            options={THERAPEUTIC_CATEGORIES.map((t) => ({ value: t, label: t }))}
          />
          <div className="flex items-center gap-2">
            <Button
              variant={values.portfolio === '1' ? 'primary' : 'secondary'}
              size="sm"
              onClick={() => setValue('portfolio', values.portfolio === '1' ? '' : '1')}
            >
              Represented only
            </Button>
            {filtersOn ? (
              <Button variant="ghost" size="sm" icon={<X className="h-3.5 w-3.5" />} onClick={() => { clear(); setSearch('') }}>
                Clear
              </Button>
            ) : null}
          </div>
        </div>

        <DataTable
          rows={rows ?? []}
          columns={columns}
          rowKey={(r) => r.product.id}
          loading={loading}
          onRowClick={(r) => navigate(`/products/${r.product.id}`)}
          exportName="products"
          exportFilters={queryString}
          onExport={(count) => void logExport('product list', queryString, count)}
          toolbar={
            <span className="flex items-center gap-2 text-xs text-ink-500">
              <SlidersHorizontal className="h-3.5 w-3.5" />
              {rows ? pluralise(rows.length, 'molecule') : '…'}
              {filtersOn ? <Badge tone="accent">{activeCount} filters</Badge> : null}
              <label className="ml-1 flex cursor-pointer items-center gap-1.5 text-xs text-ink-500">
                <input
                  type="checkbox"
                  checked={values.archived === '1'}
                  onChange={(e) => setValue('archived', e.target.checked ? '1' : '')}
                  className="h-3.5 w-3.5 rounded border-paper-400 text-accent-600"
                />
                Include discontinued
              </label>
            </span>
          }
          empty={
            <EmptyState
              icon={<FlaskConical className="h-5 w-5" />}
              title={values.q ? `Nothing matches “${values.q}”` : 'No products match these filters'}
              description={
                values.q
                  ? 'Search covers generic names, synonyms and CAS numbers. If the molecule is genuinely new, add it to the catalogue.'
                  : 'Try removing a filter.'
              }
              action={
                values.q ? (
                  <WriteOnly>
                    <LinkButton to={`/products/new?name=${encodeURIComponent(values.q)}`} variant="primary" size="sm">
                      Add “{values.q}” as a product
                    </LinkButton>
                  </WriteOnly>
                ) : (
                  <Button variant="secondary" size="sm" onClick={() => { clear(); setSearch('') }}>
                    Clear filters
                  </Button>
                )
              }
              secondary={
                values.q ? (
                  <LinkButton to="/requirements/new" variant="ghost" size="sm">
                    Record it as a client requirement
                  </LinkButton>
                ) : null
              }
            />
          }
        />
      </Panel>
    </div>
  )
}
