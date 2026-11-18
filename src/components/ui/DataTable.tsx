/**
 * The list view used across the application.
 *
 * Sorting, pagination, column visibility, row selection, CSV export and a
 * right-hand inspector (FR-M9-11). Rows animate in with a short stagger, and
 * clicking a row opens either the inspector or the record.
 */

import * as React from 'react'
import {
  ArrowDown,
  ArrowUp,
  ChevronLeft,
  ChevronRight,
  Columns3,
  Download,
  Inbox,
} from 'lucide-react'
import { cn, downloadCsv } from '@/lib/utils'
import { Badge, Button, EmptyState, SkeletonTable } from './primitives'
import { Checkbox } from './form'
import { Menu, MenuContent, MenuItem, MenuLabel, MenuSeparator, MenuTrigger, Tooltip } from './overlays'

export interface Column<T> {
  /** stable key, also used for column visibility */
  key: string
  header: React.ReactNode
  /** what the cell renders */
  cell: (row: T) => React.ReactNode
  /** the value used for sorting and CSV export */
  value?: (row: T) => string | number | null
  width?: string
  /**
   * Text reads left, figures and dates read right. There is no `center`:
   * a centred column never lines up with its own header or its neighbours.
   */
  align?: 'left' | 'right'
  /** a floor so a name column never collapses to nothing on a narrow screen */
  minWidth?: string
  sortable?: boolean
  /** hidden until the user turns it on */
  optional?: boolean
  /** never offered in the column menu (e.g. the name column) */
  pinned?: boolean
  className?: string
}

export interface DataTableProps<T> {
  rows: T[]
  columns: Column<T>[]
  rowKey: (row: T) => string
  loading?: boolean
  /** shown when there are no rows at all */
  empty?: React.ReactNode
  onRowClick?: (row: T) => void
  selectedKey?: string | null
  /** enables checkboxes and the selection summary */
  selectable?: boolean
  selectedKeys?: string[]
  onSelectionChange?: (keys: string[]) => void
  pageSize?: number
  /** name used for the CSV file and the export log */
  exportName?: string
  /** kept for parity with the log entry; the caller passes the filters it logged */
  exportFilters?: string
  onExport?: (rowCount: number) => void
  toolbar?: React.ReactNode
  /** compact row height for dense screens */
  dense?: boolean
  stickyHeader?: boolean
  rowTone?: (row: T) => string | undefined
}

export function DataTable<T>({
  rows,
  columns,
  rowKey,
  loading,
  empty,
  onRowClick,
  selectedKey,
  selectable,
  selectedKeys = [],
  onSelectionChange,
  pageSize = 25,
  exportName,
  onExport,
  toolbar,
  dense,
  stickyHeader = true,
  rowTone,
}: DataTableProps<T>) {
  const [sortKey, setSortKey] = React.useState<string | null>(null)
  const [sortDir, setSortDir] = React.useState<'asc' | 'desc'>('asc')
  const [page, setPage] = React.useState(0)
  const [hidden, setHidden] = React.useState<string[]>(() => columns.filter((c) => c.optional).map((c) => c.key))

  const visible = columns.filter((c) => !hidden.includes(c.key))

  const sorted = React.useMemo(() => {
    if (!sortKey) return rows
    const col = columns.find((c) => c.key === sortKey)
    if (!col) return rows
    const get = col.value ?? (() => null)
    return [...rows].sort((a, b) => {
      const av = get(a)
      const bv = get(b)
      if (av == null && bv == null) return 0
      if (av == null) return 1
      if (bv == null) return -1
      const r = typeof av === 'number' && typeof bv === 'number' ? av - bv : String(av).localeCompare(String(bv))
      return sortDir === 'asc' ? r : -r
    })
  }, [rows, sortKey, sortDir, columns])

  const pageCount = Math.max(1, Math.ceil(sorted.length / pageSize))
  const current = Math.min(page, pageCount - 1)
  const pageRows = sorted.slice(current * pageSize, current * pageSize + pageSize)

  React.useEffect(() => {
    setPage(0)
  }, [rows.length, sortKey, sortDir])

  const toggleSort = (key: string) => {
    if (sortKey === key) {
      setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'))
    } else {
      setSortKey(key)
      setSortDir('asc')
    }
  }

  const allOnPageSelected = pageRows.length > 0 && pageRows.every((r) => selectedKeys.includes(rowKey(r)))
  const someOnPageSelected = pageRows.some((r) => selectedKeys.includes(rowKey(r)))

  const handleExport = () => {
    const cols = visible.filter((c) => c.value)
    downloadCsv(
      exportName ?? 'export',
      cols.map((c) => (typeof c.header === 'string' ? c.header : c.key)),
      sorted.map((row) => cols.map((c) => c.value!(row))),
    )
    onExport?.(sorted.length)
  }

  return (
    <div className="flex min-h-0 flex-col">
      {(toolbar || exportName || columns.some((c) => c.optional || !c.pinned)) && (
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-paper-200 px-3 py-2">
          <div className="flex min-w-0 flex-wrap items-center gap-2">{toolbar}</div>
          <div className="flex shrink-0 items-center gap-1.5">
            {selectable && selectedKeys.length > 0 ? (
              <Badge tone="accent">{selectedKeys.length} selected</Badge>
            ) : null}
            <Menu>
              <MenuTrigger asChild>
                <Button variant="ghost" size="sm" icon={<Columns3 className="h-3.5 w-3.5" />}>
                  Columns
                </Button>
              </MenuTrigger>
              <MenuContent>
                <MenuLabel>Show columns</MenuLabel>
                <MenuSeparator />
                {columns
                  .filter((c) => !c.pinned)
                  .map((c) => (
                    <MenuItem
                      key={c.key}
                      onSelect={() =>
                        setHidden((h) => (h.includes(c.key) ? h.filter((k) => k !== c.key) : [...h, c.key]))
                      }
                      icon={
                        <span
                          className={cn(
                            'grid h-3.5 w-3.5 place-items-center rounded-sm border text-sm',
                            hidden.includes(c.key) ? 'border-paper-400' : 'border-accent-600 bg-accent-600 text-white',
                          )}
                        >
                          {hidden.includes(c.key) ? '' : '✓'}
                        </span>
                      }
                    >
                      {typeof c.header === 'string' ? c.header : c.key}
                    </MenuItem>
                  ))}
              </MenuContent>
            </Menu>
            {exportName ? (
              <Tooltip content={`Export ${sorted.length} rows to CSV. Every export is logged.`}>
                <Button variant="ghost" size="sm" icon={<Download className="h-3.5 w-3.5" />} onClick={handleExport}>
                  Export
                </Button>
              </Tooltip>
            ) : null}
          </div>
        </div>
      )}

      {loading ? (
        <SkeletonTable rows={Math.min(pageSize, 8)} cols={Math.min(visible.length, 6)} />
      ) : sorted.length === 0 ? (
        <div className="p-4">
          {empty ?? <EmptyState icon={<Inbox className="h-5 w-5" />} title="Nothing to show" compact />}
        </div>
      ) : (
        <div className="scroll-slim min-h-0 overflow-x-auto">
          <table className="w-full border-collapse text-sm">
            <thead className={cn(stickyHeader && 'sticky top-0 z-10')}>
              <tr className="border-b border-paper-300 bg-paper-100/95 backdrop-blur-[2px]">
                {selectable ? (
                  <th className="th w-9">
                    <Checkbox
                      checked={allOnPageSelected}
                      indeterminate={!allOnPageSelected && someOnPageSelected}
                      onChange={(checked) => {
                        const keys = pageRows.map(rowKey)
                        onSelectionChange?.(
                          checked
                            ? [...new Set([...selectedKeys, ...keys])]
                            : selectedKeys.filter((k) => !keys.includes(k)),
                        )
                      }}
                    />
                  </th>
                ) : null}
                {visible.map((c) => (
                  <th
                    key={c.key}
                    scope="col"
                    style={{
                      ...(c.width ? { width: c.width } : null),
                      minWidth: c.minWidth ?? (c.align === 'right' ? '5.5rem' : '7rem'),
                    }}
                    // the header takes the column's alignment, always
                    className={cn(
                      'th',
                      c.align === 'right' && 'text-right',
                      c.sortable && 'cursor-pointer transition-colors hover:text-ink-900',
                    )}
                    onClick={c.sortable ? () => toggleSort(c.key) : undefined}
                    onKeyDown={
                      c.sortable
                        ? (e) => {
                            if (e.key === 'Enter' || e.key === ' ') {
                              e.preventDefault()
                              toggleSort(c.key)
                            }
                          }
                        : undefined
                    }
                    tabIndex={c.sortable ? 0 : undefined}
                    aria-sort={sortKey === c.key ? (sortDir === 'asc' ? 'ascending' : 'descending') : undefined}
                  >
                    <span
                      className={cn(
                        'inline-flex items-center gap-1',
                        c.align === 'right' && 'flex-row-reverse',
                      )}
                    >
                      {c.header}
                      {c.sortable ? (
                        sortKey === c.key ? (
                          sortDir === 'asc' ? (
                            <ArrowUp className="h-3 w-3 text-accent-600" />
                          ) : (
                            <ArrowDown className="h-3 w-3 text-accent-600" />
                          )
                        ) : (
                          <ArrowUp className="h-3 w-3 opacity-0 transition-opacity group-hover:opacity-40" />
                        )
                      ) : null}
                    </span>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {pageRows.map((row) => {
                const key = rowKey(row)
                const isSelected = selectedKey === key
                return (
                  <tr
                    key={key}
                    onClick={onRowClick ? () => onRowClick(row) : undefined}
                    onKeyDown={
                      onRowClick
                        ? (e) => {
                            if (e.key === 'Enter') {
                              e.preventDefault()
                              onRowClick(row)
                            }
                          }
                        : undefined
                    }
                    tabIndex={onRowClick ? 0 : undefined}
                    className={cn(
                      'group border-b border-paper-200 transition-colors last:border-0',
                      onRowClick && 'cursor-pointer',
                      isSelected ? 'bg-accent-50' : 'hover:bg-paper-100',
                      rowTone?.(row),
                    )}
                  >
                    {selectable ? (
                      <td className="cell w-9" onClick={(e) => e.stopPropagation()}>
                        <Checkbox
                          checked={selectedKeys.includes(key)}
                          onChange={(checked) =>
                            onSelectionChange?.(
                              checked ? [...selectedKeys, key] : selectedKeys.filter((k) => k !== key),
                            )
                          }
                        />
                      </td>
                    ) : null}
                    {visible.map((c) => (
                      <td
                        key={c.key}
                        className={cn(
                          'cell',
                          dense && 'h-10',
                          c.align === 'right' && 'text-right',
                          c.className,
                        )}
                      >
                        {c.cell(row)}
                      </td>
                    ))}
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}

      {!loading && sorted.length > pageSize ? (
        <div className="flex items-center justify-between gap-3 border-t border-paper-200 px-3 py-2 text-sm text-ink-500">
          <span className="tabular">
            {current * pageSize + 1}–{Math.min((current + 1) * pageSize, sorted.length)} of{' '}
            {sorted.length.toLocaleString('en-US')}
          </span>
          <div className="flex items-center gap-1">
            <Button
              variant="ghost"
              size="icon"
              aria-label="Previous page"
              disabled={current === 0}
              onClick={() => setPage(current - 1)}
            >
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <span className="px-1 tabular">
              {current + 1} / {pageCount}
            </span>
            <Button
              variant="ghost"
              size="icon"
              aria-label="Next page"
              disabled={current >= pageCount - 1}
              onClick={() => setPage(current + 1)}
            >
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        </div>
      ) : null}
    </div>
  )
}

/**
 * Primary cell: a name, and a 13px second line only where it aids scanning.
 * Long values lose their END to an ellipsis and carry the full text as a
 * title, so the first word — the part you scan by — is always readable.
 */
export function NameCell({
  title,
  subtitle,
  badge,
  mono,
}: {
  title: React.ReactNode
  subtitle?: React.ReactNode
  badge?: React.ReactNode
  mono?: boolean
}) {
  const asText = (v: React.ReactNode) => (typeof v === 'string' || typeof v === 'number' ? String(v) : undefined)
  return (
    <div className="flex min-w-0 items-center gap-2">
      <div className="min-w-0">
        <div className="flex items-center gap-2">
          <span
            title={asText(title)}
            className={cn('truncate-end font-semibold text-ink-900', mono && 'font-mono')}
          >
            {title}
          </span>
          {badge}
        </div>
        {subtitle ? (
          <div title={asText(subtitle)} className="truncate-end text-sm text-ink-500">
            {subtitle}
          </div>
        ) : null}
      </div>
    </div>
  )
}

/**
 * Wraps controls that live inside a clickable row, so pressing one does not
 * also open the record behind it.
 */
export function RowActions({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <div
      className={cn('flex items-center justify-end gap-1', className)}
      onClick={(e) => e.stopPropagation()}
      onKeyDown={(e) => e.stopPropagation()}
    >
      {children}
    </div>
  )
}

/** The one way an absent value is written, everywhere in the product. */
export function Empty() {
  return <span className="text-ink-400">—</span>
}

/** A figure cell: right-aligned, never monospaced, never . */
export function NumCell({ children, tone }: { children: React.ReactNode; tone?: string }) {
  return <span className={cn('whitespace-nowrap', tone ?? 'text-ink-900')}>{children}</span>
}
