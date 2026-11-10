/**
 * The filter strip above a list: a search box and the two or three filters a
 * person actually reaches for, with everything else behind "More filters".
 * Each screen still chooses its own filters; only the layout is shared.
 */

import * as React from 'react'
import { SlidersHorizontal, X } from 'lucide-react'
import { Button } from './primitives'
import { SearchInput } from './form'

export function FilterBar({
  search,
  onSearch,
  searchPlaceholder,
  primary,
  more,
  moreActive = 0,
  activeCount,
  onClear,
  trailing,
}: {
  search?: string
  onSearch?: (value: string) => void
  searchPlaceholder?: string
  /** filters always on show */
  primary?: React.ReactNode
  /** filters revealed on demand */
  more?: React.ReactNode
  /** how many of the hidden filters are set, so a collapsed panel still says so */
  moreActive?: number
  /** how many filters are set in total, including the search */
  activeCount: number
  onClear: () => void
  trailing?: React.ReactNode
}) {
  const [open, setOpen] = React.useState(moreActive > 0)
  const panelId = React.useId()

  return (
    <div className="border-b border-paper-200">
      <div className="flex flex-wrap items-center gap-2 p-3">
        {onSearch ? (
          <SearchInput
            value={search ?? ''}
            onChange={onSearch}
            placeholder={searchPlaceholder ?? 'Search…'}
            className="w-full sm:w-64"
          />
        ) : null}
        {primary ? <div className="contents [&>[role=combobox]]:w-full sm:[&>[role=combobox]]:w-44">{primary}</div> : null}
        {more ? (
          <Button
            variant={open ? 'subtle' : 'ghost'}
            size="sm"
            icon={<SlidersHorizontal className="h-3.5 w-3.5" />}
            aria-expanded={open}
            aria-controls={panelId}
            onClick={() => setOpen((o) => !o)}
          >
            {open ? 'Fewer filters' : 'More filters'}
            {moreActive > 0 ? (
              <span className="rounded bg-accent-100 px-1 text-[10px] font-semibold text-accent-800">{moreActive}</span>
            ) : null}
          </Button>
        ) : null}
        {activeCount > 0 ? (
          <Button variant="ghost" size="sm" icon={<X className="h-3.5 w-3.5" />} onClick={onClear}>
            Clear
          </Button>
        ) : null}
        {trailing ? <div className="ml-auto flex items-center gap-2">{trailing}</div> : null}
      </div>
      {more && open ? (
        <div
          id={panelId}
          className="grid gap-2.5 border-t border-dashed border-paper-200 bg-paper-50/60 p-3 sm:grid-cols-2 lg:grid-cols-4"
        >
          {more}
        </div>
      ) : null}
    </div>
  )
}
