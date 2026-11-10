/**
 * Shared hooks: asynchronous loads with a visible loading state, URL-backed
 * filters (FR-M9-12), and the toast helper for rule refusals.
 */

import * as React from 'react'
import { useSearchParams } from 'react-router-dom'
import { toast } from 'sonner'
import { delay, ForbiddenError, RuleError } from '@/data/api'
import { useRevision } from '@/data/store'

/**
 * Runs a synchronous selector behind a simulated round trip, so every screen
 * shows its skeleton once and then re-renders instantly on later changes.
 */
export function useAsyncData<T>(compute: () => T, deps: unknown[] = []): { data: T | null; loading: boolean } {
  const revision = useRevision()
  const [loading, setLoading] = React.useState(true)
  const [data, setData] = React.useState<T | null>(null)
  const firstRun = React.useRef(true)
  const computeRef = React.useRef(compute)
  computeRef.current = compute

  React.useEffect(() => {
    let cancelled = false
    if (firstRun.current) {
      setLoading(true)
      void delay('read').then(() => {
        if (cancelled) return
        setData(computeRef.current())
        setLoading(false)
        firstRun.current = false
      })
    } else {
      // later changes are already in memory: no artificial wait
      setData(computeRef.current())
      setLoading(false)
    }
    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [...deps, revision])

  return { data, loading }
}

/** Filters live in the query string so a view can be bookmarked and shared. */
export function useUrlFilters<T extends Record<string, string>>(defaults: T) {
  const [params, setParams] = useSearchParams()

  const values = React.useMemo(() => {
    const out = { ...defaults }
    for (const key of Object.keys(defaults) as (keyof T)[]) {
      const v = params.get(String(key))
      if (v != null) out[key] = v as T[keyof T]
    }
    return out
  }, [params, defaults])

  const setValue = React.useCallback(
    (key: keyof T, value: string) => {
      const next = new URLSearchParams(params)
      if (!value || value === defaults[key]) next.delete(String(key))
      else next.set(String(key), value)
      setParams(next, { replace: true })
    },
    [params, setParams, defaults],
  )

  const setMany = React.useCallback(
    (patch: Partial<T>) => {
      const next = new URLSearchParams(params)
      for (const [key, value] of Object.entries(patch)) {
        if (!value || value === defaults[key as keyof T]) next.delete(key)
        else next.set(key, String(value))
      }
      setParams(next, { replace: true })
    },
    [params, setParams, defaults],
  )

  const clear = React.useCallback(() => setParams(new URLSearchParams(), { replace: true }), [setParams])

  const activeCount = React.useMemo(
    () => (Object.keys(defaults) as string[]).filter((k) => params.get(k) && params.get(k) !== defaults[k as keyof T]).length,
    [params, defaults],
  )

  return { values, setValue, setMany, clear, activeCount, queryString: params.toString() }
}

/**
 * Wraps a write so a rule refusal becomes a readable message rather than an
 * unhandled rejection. Returns true when the action succeeded.
 */
export async function runAction<T>(
  action: () => Promise<T>,
  opts: {
    success?: string | ((result: T) => string)
    onSuccess?: (result: T) => void
    onError?: (message: string) => void
    undo?: () => void | Promise<void>
  } = {},
): Promise<T | null> {
  try {
    const result = await action()
    if (opts.success) {
      const message = typeof opts.success === 'function' ? opts.success(result) : opts.success
      toast.success(message, {
        action: opts.undo
          ? {
              label: 'Undo',
              onClick: () => void opts.undo!(),
            }
          : undefined,
      })
    }
    opts.onSuccess?.(result)
    return result
  } catch (error) {
    const message =
      error instanceof RuleError || error instanceof ForbiddenError
        ? error.message
        : 'Something went wrong. Nothing was saved.'
    if (opts.onError) opts.onError(message)
    else toast.error(message, { duration: 7000 })
    return null
  }
}

/**
 * A search box bound to a URL filter: typing is instant on screen and written
 * to the query string a moment later.
 */
export function useUrlSearch(urlValue: string, write: (value: string) => void, ms = 180): [string, (value: string) => void] {
  const [text, setText] = React.useState(urlValue)
  const debounced = useDebounced(text, ms)
  const writeRef = React.useRef(write)
  writeRef.current = write

  React.useEffect(() => {
    if (debounced !== urlValue) writeRef.current(debounced)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [debounced])

  // a cleared filter set clears the box too
  React.useEffect(() => {
    if (!urlValue) setText('')
  }, [urlValue])

  return [text, setText]
}

/** Debounced value, for search boxes. */
export function useDebounced<T>(value: T, ms = 200): T {
  const [debounced, setDebounced] = React.useState(value)
  React.useEffect(() => {
    const t = window.setTimeout(() => setDebounced(value), ms)
    return () => window.clearTimeout(t)
  }, [value, ms])
  return debounced
}

/** Remembers a per-screen preference for the session (view mode, grouping). */
export function useLocalPreference<T extends string>(key: string, initial: T): [T, (value: T) => void] {
  const [value, setValue] = React.useState<T>(() => {
    try {
      return (window.sessionStorage.getItem(`tcl.${key}`) as T) || initial
    } catch {
      return initial
    }
  })
  const set = React.useCallback(
    (v: T) => {
      setValue(v)
      try {
        window.sessionStorage.setItem(`tcl.${key}`, v)
      } catch {
        // storage can be unavailable; the preference is not important enough to fail over
      }
    },
    [key],
  )
  return [value, set]
}
