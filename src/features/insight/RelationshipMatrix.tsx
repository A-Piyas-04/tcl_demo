/**
 * Client-wise and manufacturer-wise product matrices (FR-M11-04).
 *
 * A heat map rather than a list: rows are companies, columns are molecules, and
 * each cell is the furthest stage that pairing has reached. Read a row to see
 * what one company does with TCL, read a column to see how established a
 * molecule is. Read-only, with a logged export.
 */

import * as React from 'react'
import { useNavigate } from 'react-router-dom'
import { Grid3x3, X } from 'lucide-react'
import { useDb } from '@/data/store'
import { engagementRows, furthestStage, type EngagementRow } from '@/data/selectors'
import { STAGE_LABEL, THERAPEUTIC_CATEGORIES } from '@/data/reference'
import { logExport } from '@/data/api'
import { useAsyncData, useUrlFilters } from '@/lib/hooks'
import { downloadCsv, fmtDate, pluralise } from '@/lib/utils'
import type { Company, EngagementStage, ID, Product } from '@/data/types'
import {
  Badge,
  Button,
  Dialog,
  EmptyState,
  LinkButton,
  Panel,
  PageHeading,
  SegmentedControl,
  Select,
  SkeletonText,
  StageBadge,
  Tooltip,
} from '@/components/ui'
import { ExportButton, ReportNote, stageHex } from './shared'

/** Short codes, so a cell can carry its stage without widening the column. */
const STAGE_CODE: Record<EngagementStage, string> = {
  IDENTIFIED: 'Id',
  OFFERED: 'Of',
  SAMPLE_REQUESTED: 'Sr',
  SAMPLE_SENT: 'Ss',
  UNDER_EVALUATION: 'Ev',
  APPROVED: 'Ap',
  COMMERCIAL: 'Cm',
  ON_HOLD: 'Hd',
  REJECTED: 'Rj',
  DISCONTINUED: 'Dc',
}

/** Stage colour at a low alpha, deepened a little where a pairing has depth. */
function cellBackground(stage: EngagementStage, count: number): string {
  const hex = stageHex(stage)
  const r = parseInt(hex.slice(1, 3), 16)
  const g = parseInt(hex.slice(3, 5), 16)
  const b = parseInt(hex.slice(5, 7), 16)
  const alpha = Math.min(0.46, 0.16 + (count - 1) * 0.1)
  return `rgba(${r}, ${g}, ${b}, ${alpha})`
}

interface Cell {
  stage: EngagementStage
  count: number
  rows: EngagementRow[]
}

interface Matrix {
  companies: Company[]
  products: Product[]
  cells: Map<string, Cell>
  engagementCount: number
}

const DEFAULTS = { therapeutic: '', stage: '', commercial: '', mode: 'stages' }

export function RelationshipMatrix({ axis }: { axis: 'client' | 'manufacturer' }) {
  const db = useDb()
  const navigate = useNavigate()
  const { values, setValue, clear, activeCount, queryString } = useUrlFilters(DEFAULTS)
  const [open, setOpen] = React.useState<Cell | null>(null)

  const mode = values.mode === 'counts' ? 'counts' : 'stages'

  const { data: matrix, loading } = useAsyncData<Matrix>(() => {
    let rows = engagementRows(db)
    if (values.stage) rows = rows.filter((r) => r.stage === values.stage)
    if (values.commercial === '1') rows = rows.filter((r) => r.stage === 'COMMERCIAL')
    if (values.therapeutic) {
      rows = rows.filter((r) => r.product.therapeuticCategories.includes(values.therapeutic))
    }

    const cells = new Map<string, Cell>()
    const companyIds = new Map<ID, Company>()
    const productIds = new Map<ID, Product>()

    for (const row of rows) {
      const company = axis === 'client' ? row.client : row.manufacturer
      companyIds.set(company.id, company)
      productIds.set(row.product.id, row.product)
      const key = `${company.id}|${row.product.id}`
      const existing = cells.get(key)
      if (existing) existing.rows.push(row)
      else cells.set(key, { stage: row.stage, count: 0, rows: [row] })
    }
    for (const cell of cells.values()) {
      cell.count = cell.rows.length
      cell.stage = furthestStage(cell.rows.map((r) => r.stage)) ?? cell.rows[0]!.stage
    }

    const countFor = (id: ID, side: 'company' | 'product') =>
      [...cells.entries()].filter(([key]) => key.split('|')[side === 'company' ? 0 : 1] === id).length

    return {
      companies: [...companyIds.values()].sort(
        (a, b) => countFor(b.id, 'company') - countFor(a.id, 'company') || a.displayName.localeCompare(b.displayName),
      ),
      products: [...productIds.values()].sort(
        (a, b) => countFor(b.id, 'product') - countFor(a.id, 'product') || a.genericName.localeCompare(b.genericName),
      ),
      cells,
      engagementCount: rows.length,
    }
  }, [axis, values])

  const openCell = (cell: Cell) => {
    if (cell.rows.length === 1) navigate(`/engagements/${cell.rows[0]!.engagement.id}`)
    else setOpen(cell)
  }

  const exportMatrix = () => {
    if (!matrix) return
    downloadCsv(
      `${axis}-product-matrix`,
      [axis === 'client' ? 'Client' : 'Manufacturer', 'Country', ...matrix.products.map((p) => p.genericName)],
      matrix.companies.map((company) => [
        company.displayName,
        company.countryCode,
        ...matrix.products.map((product) => {
          const cell = matrix.cells.get(`${company.id}|${product.id}`)
          if (!cell) return ''
          return mode === 'counts' ? cell.count : STAGE_LABEL[cell.stage]
        }),
      ]),
    )
    void logExport(`${axis} against product matrix`, queryString, matrix.companies.length)
  }

  const title = axis === 'client' ? 'Client against product' : 'Manufacturer against product'
  const question =
    axis === 'client'
      ? 'Which molecules does each client take from TCL, and how far has each pairing got?'
      : 'Which molecules does each manufacturer supply through TCL, and to how many clients?'

  const stagesPresent = React.useMemo(() => {
    if (!matrix) return [] as EngagementStage[]
    const set = new Set<EngagementStage>()
    for (const cell of matrix.cells.values()) set.add(cell.stage)
    return (Object.keys(STAGE_LABEL) as EngagementStage[]).filter((s) => set.has(s))
  }, [matrix])

  return (
    <div className="space-y-4">
      <PageHeading
        title={title}
        subtitle={question}
        meta={
          matrix ? (
            <>
              <Badge tone="neutral">{pluralise(matrix.companies.length, axis === 'client' ? 'client' : 'manufacturer')}</Badge>
              <Badge tone="neutral">{pluralise(matrix.products.length, 'molecule')}</Badge>
              <Badge tone="accent">{pluralise(matrix.engagementCount, 'engagement')}</Badge>
            </>
          ) : null
        }
        actions={<ExportButton onClick={exportMatrix} disabled={!matrix} />}
      />

      <Panel>
        <div className="grid gap-2.5 border-b border-paper-200 p-3 sm:grid-cols-2 lg:grid-cols-4">
          <Select
            value={values.therapeutic}
            onChange={(v) => setValue('therapeutic', v)}
            allowEmpty
            emptyLabel="Any therapeutic area"
            placeholder="Any therapeutic area"
            options={THERAPEUTIC_CATEGORIES.map((t) => ({ value: t, label: t }))}
          />
          <Select
            value={values.stage}
            onChange={(v) => setValue('stage', v)}
            allowEmpty
            emptyLabel="Any stage"
            placeholder="Any stage"
            options={(Object.keys(STAGE_LABEL) as EngagementStage[]).map((s) => ({ value: s, label: STAGE_LABEL[s] }))}
          />
          <div className="flex items-center gap-2">
            <Button
              variant={values.commercial === '1' ? 'primary' : 'secondary'}
              size="sm"
              onClick={() => setValue('commercial', values.commercial === '1' ? '' : '1')}
            >
              Commercial only
            </Button>
            {activeCount > 0 ? (
              <Button variant="ghost" size="sm" icon={<X className="h-3.5 w-3.5" />} onClick={clear}>
                Clear
              </Button>
            ) : null}
          </div>
          <div className="flex items-center justify-start lg:justify-end">
            <SegmentedControl
              value={mode}
              onChange={(v) => setValue('mode', v)}
              size="sm"
              options={[
                { value: 'stages', label: 'Stages' },
                { value: 'counts', label: 'Counts' },
              ]}
            />
          </div>
        </div>

        {loading || !matrix ? (
          <div className="p-4">
            <SkeletonText lines={8} />
          </div>
        ) : matrix.companies.length === 0 ? (
          <div className="p-4">
            <EmptyState
              icon={<Grid3x3 className="h-5 w-5" />}
              title="Nothing matches these filters"
              description="The matrix only shows pairings that have an engagement behind them. Widen the filters, or follow a single record through the connection tree instead."
              action={
                activeCount > 0 ? (
                  <Button variant="primary" size="sm" onClick={clear}>
                    Clear filters
                  </Button>
                ) : (
                  <LinkButton to="/relationships/tree" variant="primary" size="sm">
                    Open the connection tree
                  </LinkButton>
                )
              }
            />
          </div>
        ) : (
          <div className="scroll-slim max-h-[32rem] overflow-auto">
            <table className="border-separate border-spacing-0 text-sm">
              <thead>
                <tr>
                  <th className="sticky left-0 top-0 z-30 h-32 w-56 border-b border-r border-paper-300 bg-paper-100 px-3 text-left align-bottom text-2xs font-semibold uppercase tracking-wide text-ink-500">
                    {axis === 'client' ? 'Client' : 'Manufacturer'}
                  </th>
                  {matrix.products.map((product) => (
                    <th
                      key={product.id}
                      className="sticky top-0 z-20 h-32 w-10 border-b border-paper-300 bg-paper-100 p-0 align-bottom"
                    >
                      <div className="flex h-32 w-10 items-end justify-center pb-1.5">
                        <span className="whitespace-nowrap text-[11px] font-medium text-ink-700 [writing-mode:vertical-rl] rotate-180">
                          {product.genericName}
                        </span>
                      </div>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {matrix.companies.map((company) => (
                  <tr key={company.id} className="group">
                    <th className="sticky left-0 z-10 w-56 border-b border-r border-paper-200 bg-white px-3 py-1.5 text-left font-normal group-hover:bg-paper-100">
                      <LinkButton
                        to={axis === 'client' ? `/clients/${company.id}` : `/manufacturers/${company.id}`}
                        variant="ghost"
                        size="sm"
                        className="h-auto max-w-full truncate px-0 text-xs font-medium text-ink-900"
                      >
                        {company.displayName}
                      </LinkButton>
                    </th>
                    {matrix.products.map((product) => {
                      const cell = matrix.cells.get(`${company.id}|${product.id}`)
                      if (!cell) {
                        return (
                          <td
                            key={product.id}
                            className="h-9 w-10 border-b border-r border-paper-200 bg-paper-50/40 group-hover:bg-paper-100/60"
                          />
                        )
                      }
                      return (
                        <td key={product.id} className="h-9 w-10 border-b border-r border-paper-200 p-0">
                          <Tooltip
                            content={
                              <span>
                                {company.displayName} · {product.genericName}
                                <br />
                                {STAGE_LABEL[cell.stage]} · {pluralise(cell.count, 'engagement')}
                              </span>
                            }
                          >
                            <button
                              type="button"
                              onClick={() => openCell(cell)}
                              style={{ backgroundColor: cellBackground(cell.stage, cell.count) }}
                              className="h-9 w-10 text-center text-[11px] font-semibold tabular text-ink-800 transition-shadow hover:shadow-[inset_0_0_0_2px_rgb(12_120_107)]"
                            >
                              {mode === 'counts' ? cell.count : STAGE_CODE[cell.stage]}
                            </button>
                          </Tooltip>
                        </td>
                      )
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        <div className="flex flex-wrap items-start justify-between gap-3 border-t border-paper-200 p-3">
          <div className="space-y-1.5">
            <p className="text-2xs font-medium uppercase tracking-wide text-ink-500">Cells in this view</p>
            <ul className="flex flex-wrap items-center gap-1.5">
              {stagesPresent.map((s) => (
                <li key={s} className="flex items-center gap-1">
                  <span
                    className="grid h-5 w-7 place-items-center rounded-sm text-[10px] font-semibold text-ink-800"
                    style={{ backgroundColor: cellBackground(s, 1) }}
                  >
                    {STAGE_CODE[s]}
                  </span>
                  <span className="text-2xs text-ink-600">{STAGE_LABEL[s]}</span>
                </li>
              ))}
            </ul>
          </div>
          <ReportNote className="max-w-md">
            A cell shows the furthest stage that pairing has reached, deepening slightly where more than one source is
            involved. Click a cell to open the engagement. Empty means no engagement has ever been opened.
          </ReportNote>
        </div>
      </Panel>

      <Dialog
        open={open !== null}
        onOpenChange={(o) => !o && setOpen(null)}
        title="Engagements behind this cell"
        description={
          open
            ? `${axis === 'client' ? open.rows[0]!.client.displayName : open.rows[0]!.manufacturer.displayName} · ${open.rows[0]!.product.genericName}`
            : undefined
        }
        width="md"
      >
        <ul className="divide-y divide-paper-200">
          {(open?.rows ?? []).map((row) => (
            <li key={row.engagement.id} className="flex items-center gap-3 py-2.5">
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium text-ink-900">
                  {axis === 'client' ? row.manufacturer.displayName : row.client.displayName}
                </p>
                <p className="truncate text-xs text-ink-500">
                  {row.mp.grade} {row.mp.pharmacopoeia} · owner {row.ownerName} · stage set {fmtDate(row.engagement.stageChangedAt)}
                </p>
              </div>
              <StageBadge stage={row.stage} size="sm" />
              <LinkButton to={`/engagements/${row.engagement.id}`} variant="secondary" size="sm">
                Open
              </LinkButton>
            </li>
          ))}
        </ul>
      </Dialog>
    </div>
  )
}
