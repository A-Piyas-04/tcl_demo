/**
 * Decimal-safe money arithmetic for Product 2.0.
 *
 * Amounts are stored as plain decimal strings ("12500.0000") and calculated
 * as BigInt fixed-point with six fractional digits, so no floating-point
 * rounding ever enters a commission figure. Rounding is half-up, away from
 * zero, and only happens when a result is displayed or stored.
 */

export type Dec = bigint

const DP = 6
const SCALE = 10n ** BigInt(DP)

const DECIMAL_RE = /^-?\d+(\.\d+)?$/

/** Parses "1,234.50" or "1234.5"; returns null for anything that is not a number. */
export function parseDec(input: string | null | undefined): Dec | null {
  if (input == null) return null
  const s = String(input).replace(/,/g, '').trim()
  if (!DECIMAL_RE.test(s)) return null
  const negative = s.startsWith('-')
  const [whole, frac = ''] = (negative ? s.slice(1) : s).split('.')
  const fracPadded = (frac + '0'.repeat(DP)).slice(0, DP)
  const value = BigInt(whole!) * SCALE + BigInt(fracPadded)
  return negative ? -value : value
}

/** Same as parseDec, treating blank or invalid input as zero. */
export const dec = (input: string | null | undefined): Dec => parseDec(input) ?? 0n

function divRound(n: bigint, d: bigint): bigint {
  const q = n / d
  const r = n % d
  if (r === 0n) return q
  const twice = (r < 0n ? -r : r) * 2n
  if (twice >= (d < 0n ? -d : d)) return n < 0n !== d < 0n ? q - 1n : q + 1n
  return q
}

export const add = (...xs: Dec[]): Dec => xs.reduce((a, b) => a + b, 0n)
export const sub = (a: Dec, b: Dec): Dec => a - b
export const mul = (a: Dec, b: Dec): Dec => divRound(a * b, SCALE)
/** `pct` percent of `amount`, e.g. pctOf(1000, 2.5) = 25. */
export const pctOf = (amount: Dec, pct: Dec): Dec => divRound(amount * pct, 100n * SCALE)

/** Rounds to `places` decimal places (half-up). */
export function round(value: Dec, places = 2): Dec {
  const step = 10n ** BigInt(DP - places)
  return divRound(value, step) * step
}

/** Canonical storage string with `places` decimals. */
export function toFixed(value: Dec, places = 2): string {
  const r = round(value, places)
  const negative = r < 0n
  const abs = negative ? -r : r
  const whole = abs / SCALE
  const frac = (abs % SCALE).toString().padStart(DP, '0').slice(0, places)
  return `${negative ? '-' : ''}${whole.toString()}${places > 0 ? `.${frac}` : ''}`
}

/** "USD 12,500.00"; negatives as "USD -1,500.00"; `signed` adds "+" to positives (for variances). */
export function fmtDecMoney(value: Dec | null | undefined, currency = 'USD', places = 2, signed = false): string {
  if (value == null) return '—'
  const [whole, frac] = toFixed(value, places).split('.')
  const negative = whole!.startsWith('-')
  const digits = negative ? whole!.slice(1) : whole!
  const grouped = digits.replace(/\B(?=(\d{3})+(?!\d))/g, ',')
  const sign = negative ? '-' : signed && value > 0n ? '+' : ''
  return `${currency} ${sign}${grouped}${frac ? `.${frac}` : ''}`
}

/** "2.5%" without trailing zeros. */
export function fmtDecPct(value: Dec | null | undefined): string {
  if (value == null) return '—'
  return `${toFixed(value, 4).replace(/\.?0+$/, '')}%`
}

/** Plain number with grouping and up to four decimals, for quantities. */
export function fmtDecQty(value: Dec | null | undefined, uom?: string): string {
  if (value == null) return '—'
  const [whole, frac] = toFixed(value, 4).split('.')
  const grouped = whole!.replace(/\B(?=(\d{3})+(?!\d))/g, ',')
  const trimmed = frac?.replace(/0+$/, '')
  return `${grouped}${trimmed ? `.${trimmed}` : ''}${uom ? ` ${uom}` : ''}`
}

/** Validation helper for form inputs: a non-negative decimal with at most `maxDp` places. */
export function isDecimalString(s: string, maxDp = 4): boolean {
  const t = s.replace(/,/g, '').trim()
  return new RegExp(`^\\d+(\\.\\d{1,${maxDp}})?$`).test(t)
}
