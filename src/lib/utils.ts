import { clsx, type ClassValue } from 'clsx'
import { twMerge } from 'tailwind-merge'
import { format, formatDistanceToNowStrict, parseISO } from 'date-fns'

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

// ------------------------------------------------------------------ dates
// One format everywhere: DD MMM YYYY. Relative age is only ever a suffix.

/** The placeholder for an absent value. Used by every formatter and cell. */
export const EMPTY = '—'

export function fmtDate(value: string | null | undefined): string {
  if (!value) return EMPTY
  try {
    return format(parseISO(value.length > 10 ? value.slice(0, 10) : value), 'dd MMM yyyy')
  } catch {
    return value
  }
}

export function fmtDateTime(value: string | null | undefined): string {
  if (!value) return EMPTY
  try {
    return format(parseISO(value), 'dd MMM yyyy HH:mm')
  } catch {
    return value
  }
}

export function fmtMonth(value: string | null | undefined): string {
  if (!value) return EMPTY
  try {
    return format(parseISO(value.slice(0, 10)), 'MMM yyyy')
  } catch {
    return value
  }
}

export function fmtAgo(value: string | null | undefined): string {
  if (!value) return EMPTY
  try {
    return `${formatDistanceToNowStrict(parseISO(value))} ago`
  } catch {
    return value
  }
}

export const todayIso = () => new Date().toISOString().slice(0, 10)

export function addMonthsIso(iso: string, months: number): string {
  const d = new Date(iso)
  d.setMonth(d.getMonth() + months)
  return d.toISOString().slice(0, 10)
}

// ----------------------------------------------------------------- money

/**
 * The threshold below which nothing is ever abbreviated. It exists so that a
 * tile can never read "189k" while the row beneath it reads "7,553": either
 * every figure in a group is abbreviated, or none is.
 */
export const COMPACT_FROM = 1_000_000

export function fmtMoney(
  amount: number | null | undefined,
  currency = 'USD',
  opts: { compact?: boolean; decimals?: number } = {},
): string {
  if (amount == null) return EMPTY
  // `compact` is a request, not an instruction: under the threshold the full
  // figure is returned, so a summary tile stays consistent with its list.
  if (opts.compact && Math.abs(amount) >= COMPACT_FROM) {
    const units = [
      { v: 1e9, s: 'bn' },
      { v: 1e6, s: 'm' },
    ]
    for (const u of units) {
      if (Math.abs(amount) >= u.v) {
        const n = amount / u.v
        return `${currency} ${n.toFixed(n < 10 ? 1 : 0)}${u.s}`
      }
    }
  }
  return `${currency} ${amount.toLocaleString('en-US', {
    minimumFractionDigits: opts.decimals ?? 2,
    maximumFractionDigits: opts.decimals ?? 2,
  })}`
}

/** Totals per currency. Amounts in different currencies are never added together. */
export function sumByCurrency(items: { amount: number; currency: string }[]): { currency: string; amount: number }[] {
  const totals = new Map<string, number>()
  for (const i of items) totals.set(i.currency, (totals.get(i.currency) ?? 0) + i.amount)
  return [...totals.entries()]
    .map(([currency, amount]) => ({ currency, amount }))
    .sort((a, b) => b.amount - a.amount)
}

export function fmtMoneyTotals(
  items: { amount: number; currency: string }[],
  opts: { compact?: boolean; decimals?: number } = {},
): string {
  const totals = sumByCurrency(items)
  if (totals.length === 0) return fmtMoney(0, 'USD', opts)
  return totals.map((t) => fmtMoney(t.amount, t.currency, opts)).join(' + ')
}

/** Quantities read "600 kg" and "0.5 kg": one space, lower-case unit, always. */
export function fmtQty(qty: number | null | undefined, uom?: string | null): string {
  if (qty == null) return EMPTY
  const n = qty.toLocaleString('en-US', { maximumFractionDigits: 4 })
  return uom ? `${n} ${uom.toLowerCase()}` : n
}

export function fmtNumber(n: number | null | undefined): string {
  if (n == null) return EMPTY
  return n.toLocaleString('en-US')
}

export function fmtPct(n: number | null | undefined, decimals = 1): string {
  if (n == null) return EMPTY
  return `${n.toFixed(decimals)}%`
}

/**
 * Severity for an age in days, so "41 days open" is not the same grey as
 * "3 days open". Returns a text class; callers pair it with a word or icon so
 * the signal never rests on colour alone.
 */
export function ageTone(days: number | null | undefined, warnAt: number, dangerAt = warnAt * 2): string {
  if (days == null) return 'text-ink-500'
  if (days >= dangerAt) return 'text-danger-600'
  if (days >= warnAt) return 'text-warn-600'
  return 'text-ink-700'
}

// ------------------------------------------------------------------ misc

/** Title-cases an enum value for display when no explicit label exists. */
export function humanise(value: string): string {
  return value.charAt(0) + value.slice(1).toLowerCase().replace(/_/g, ' ')
}

export function initials(name: string): string {
  return name
    .split(' ')
    .map((w) => w[0])
    .join('')
    .slice(0, 2)
    .toUpperCase()
}

/** Stable colour index for an avatar or a chart series. */
export function hashIndex(text: string, buckets: number): number {
  let h = 0
  for (let i = 0; i < text.length; i++) h = (h * 31 + text.charCodeAt(i)) >>> 0
  return h % buckets
}

/**
 * Counts read correctly without every call site having to remember the plural.
 * "enquiry" became "9 enquirys" on two screens because the default was simply
 * `one + 's'`; English spelling rules now apply unless a caller overrides them.
 */
export function pluralise(n: number, one: string, many?: string): string {
  const plural =
    many ??
    (/[^aeiou]y$/i.test(one)
      ? `${one.slice(0, -1)}ies`
      : /(s|sh|ch|x|z)$/i.test(one)
        ? `${one}es`
        : `${one}s`)
  return `${n.toLocaleString('en-US')} ${n === 1 ? one : plural}`
}

/** Builds a CSV and triggers a download. Exports are logged by the caller. */
export function downloadCsv(filename: string, headers: string[], rows: (string | number | null)[][]) {
  const escape = (v: string | number | null) => {
    if (v == null) return ''
    const s = String(v)
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
  }
  const csv = [headers.map(escape).join(','), ...rows.map((r) => r.map(escape).join(','))].join('\r\n')
  // BOM so Excel reads UTF-8 correctly (NFR-CO-04)
  const blob = new Blob([`﻿${csv}`], { type: 'text/csv;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename.endsWith('.csv') ? filename : `${filename}.csv`
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

export function fileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`
}
