import { clsx, type ClassValue } from 'clsx'
import { twMerge } from 'tailwind-merge'
import { format, formatDistanceToNowStrict, parseISO } from 'date-fns'

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

// ------------------------------------------------------------------ dates
// NFR-US-07: one unambiguous format throughout, DD-MMM-YYYY.

export function fmtDate(value: string | null | undefined): string {
  if (!value) return '—'
  try {
    return format(parseISO(value.length > 10 ? value.slice(0, 10) : value), 'dd-MMM-yyyy')
  } catch {
    return value
  }
}

export function fmtDateTime(value: string | null | undefined): string {
  if (!value) return '—'
  try {
    return format(parseISO(value), 'dd-MMM-yyyy HH:mm')
  } catch {
    return value
  }
}

export function fmtMonth(value: string | null | undefined): string {
  if (!value) return '—'
  try {
    return format(parseISO(value.slice(0, 10)), 'MMMM yyyy')
  } catch {
    return value
  }
}

export function fmtAgo(value: string | null | undefined): string {
  if (!value) return '—'
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

export function fmtMoney(
  amount: number | null | undefined,
  currency = 'USD',
  opts: { compact?: boolean; decimals?: number } = {},
): string {
  if (amount == null) return '—'
  if (opts.compact && Math.abs(amount) >= 1000) {
    const units = [
      { v: 1e9, s: 'bn' },
      { v: 1e6, s: 'm' },
      { v: 1e3, s: 'k' },
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

export function fmtQty(qty: number | null | undefined, uom?: string | null): string {
  if (qty == null) return '—'
  const n = qty.toLocaleString('en-US', { maximumFractionDigits: 4 })
  return uom ? `${n} ${uom}` : n
}

export function fmtNumber(n: number | null | undefined): string {
  if (n == null) return '—'
  return n.toLocaleString('en-US')
}

export function fmtPct(n: number | null | undefined, decimals = 1): string {
  if (n == null) return '—'
  return `${n.toFixed(decimals)}%`
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

export function pluralise(n: number, one: string, many = `${one}s`): string {
  return `${n.toLocaleString('en-US')} ${n === 1 ? one : many}`
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
