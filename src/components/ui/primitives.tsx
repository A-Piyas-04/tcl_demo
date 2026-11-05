/**
 * The base UI vocabulary: surfaces, buttons, badges, states.
 *
 * Design rules held here, so they are obeyed everywhere:
 *  - Surfaces are solid with a hairline border. No glass, no blur.
 *  - Content sits in bounded panels inside grids, never in full-width bands.
 *  - Actions disappear for a View Only session rather than being greyed out.
 */

import * as React from 'react'
import { Link } from 'react-router-dom'
import { motion } from 'framer-motion'
import { Loader2 } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useCanWrite } from '@/data/store'

// ------------------------------------------------------------------ panel

export const Panel = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement> & { flush?: boolean }
>(function Panel({ className, flush, ...props }, ref) {
  return <div ref={ref} className={cn('panel', !flush && 'overflow-hidden', className)} {...props} />
})

export function PanelHeader({
  title,
  subtitle,
  actions,
  icon,
  className,
}: {
  title: React.ReactNode
  subtitle?: React.ReactNode
  actions?: React.ReactNode
  icon?: React.ReactNode
  className?: string
}) {
  return (
    <div className={cn('panel-head', className)}>
      <div className="flex min-w-0 items-center gap-2.5">
        {icon ? <span className="shrink-0 text-ink-500">{icon}</span> : null}
        <div className="min-w-0">
          <h2 className="truncate text-sm font-semibold text-ink-900">{title}</h2>
          {subtitle ? <p className="truncate text-xs text-ink-500">{subtitle}</p> : null}
        </div>
      </div>
      {actions ? <div className="flex shrink-0 items-center gap-1.5">{actions}</div> : null}
    </div>
  )
}

// ----------------------------------------------------------------- button

type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger' | 'subtle'
type ButtonSize = 'sm' | 'md' | 'lg' | 'icon'

const BUTTON_VARIANT: Record<ButtonVariant, string> = {
  primary:
    'bg-accent-600 text-white shadow-tile hover:bg-accent-700 active:bg-accent-800 disabled:bg-accent-600/50',
  secondary:
    'bg-white text-ink-800 border border-paper-300 shadow-tile hover:border-paper-400 hover:bg-paper-50 active:bg-paper-100',
  ghost: 'text-ink-700 hover:bg-paper-200/80 active:bg-paper-300/70',
  subtle: 'bg-paper-200 text-ink-800 hover:bg-paper-300 active:bg-paper-400/70',
  danger: 'bg-danger-600 text-white shadow-tile hover:bg-danger-700 active:bg-danger-700',
}

const BUTTON_SIZE: Record<ButtonSize, string> = {
  sm: 'h-7 px-2.5 text-xs gap-1.5 rounded',
  md: 'h-8 px-3 text-sm gap-2 rounded-md',
  lg: 'h-10 px-4 text-base gap-2 rounded-md',
  icon: 'h-8 w-8 justify-center rounded-md',
}

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant
  size?: ButtonSize
  loading?: boolean
  icon?: React.ReactNode
}

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { className, variant = 'secondary', size = 'md', loading, icon, children, disabled, ...props },
  ref,
) {
  return (
    <button
      ref={ref}
      disabled={disabled || loading}
      className={cn(
        'inline-flex select-none items-center whitespace-nowrap font-medium transition-[background-color,border-color,box-shadow,transform] duration-150',
        'disabled:cursor-not-allowed disabled:opacity-60 active:scale-[0.985]',
        BUTTON_VARIANT[variant],
        BUTTON_SIZE[size],
        className,
      )}
      {...props}
    >
      {loading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : icon}
      {children}
    </button>
  )
})

/** A button that simply is not there for a View Only session (doc 04 §5). */
export function WriteButton(props: ButtonProps) {
  const canWrite = useCanWrite()
  if (!canWrite) return null
  return <Button {...props} />
}

/** Wraps anything that only a Full Access session should see. */
export function WriteOnly({ children }: { children: React.ReactNode }) {
  const canWrite = useCanWrite()
  if (!canWrite) return null
  return <>{children}</>
}

export function LinkButton({
  to,
  className,
  variant = 'secondary',
  size = 'md',
  icon,
  children,
  ...props
}: { to: string } & Omit<ButtonProps, 'onClick'> & { children?: React.ReactNode }) {
  return (
    <Link
      to={to}
      className={cn(
        'inline-flex select-none items-center whitespace-nowrap font-medium transition-colors duration-150',
        BUTTON_VARIANT[variant],
        BUTTON_SIZE[size],
        className,
      )}
      {...(props as React.AnchorHTMLAttributes<HTMLAnchorElement>)}
    >
      {icon}
      {children}
    </Link>
  )
}

// ------------------------------------------------------------------ badge

type BadgeTone = 'neutral' | 'accent' | 'ok' | 'warn' | 'danger' | 'info' | 'outline'

const BADGE_TONE: Record<BadgeTone, string> = {
  neutral: 'bg-paper-200 text-ink-700 border-paper-300',
  accent: 'bg-accent-50 text-accent-800 border-accent-200',
  ok: 'bg-ok-50 text-ok-600 border-ok-200',
  warn: 'bg-warn-50 text-warn-600 border-warn-200',
  danger: 'bg-danger-50 text-danger-700 border-danger-200',
  info: 'bg-[#eef4fb] text-[#1f4f79] border-[#cfe0f0]',
  outline: 'bg-transparent text-ink-600 border-paper-400',
}

/** Forwards its ref so a Badge can be a tooltip or popover trigger. */
export const Badge = React.forwardRef<
  HTMLSpanElement,
  { tone?: BadgeTone; dot?: string } & React.HTMLAttributes<HTMLSpanElement>
>(function Badge({ tone = 'neutral', className, dot, children, ...props }, ref) {
  return (
    <span
      ref={ref}
      className={cn(
        'inline-flex items-center gap-1.5 whitespace-nowrap rounded border px-1.5 py-0.5 text-2xs font-medium',
        BADGE_TONE[tone],
        className,
      )}
      {...props}
    >
      {dot ? <span className={cn('h-1.5 w-1.5 shrink-0 rounded-full', dot)} /> : null}
      {children}
    </span>
  )
})

// -------------------------------------------------------------- skeletons

export function Skeleton({ className }: { className?: string }) {
  return <div className={cn('sk h-4 w-full', className)} />
}

export function SkeletonText({ lines = 3, className }: { lines?: number; className?: string }) {
  return (
    <div className={cn('space-y-2', className)}>
      {Array.from({ length: lines }).map((_, i) => (
        <Skeleton key={i} className={i === lines - 1 ? 'w-2/3' : 'w-full'} />
      ))}
    </div>
  )
}

export function SkeletonTable({ rows = 8, cols = 5 }: { rows?: number; cols?: number }) {
  return (
    <div role="status" aria-label="Loading" className="divide-y divide-paper-200">
      <div className="flex gap-4 bg-paper-100/60 px-3 py-2">
        {Array.from({ length: cols }).map((_, i) => (
          <Skeleton key={i} className="h-3 flex-1" />
        ))}
      </div>
      {Array.from({ length: rows }).map((_, r) => (
        <div key={r} className="flex items-center gap-4 px-3 py-2.5" style={{ opacity: 1 - r * 0.07 }}>
          {Array.from({ length: cols }).map((_, c) => (
            <Skeleton key={c} className={cn('h-3.5 flex-1', c === 0 && 'max-w-[36%]')} />
          ))}
        </div>
      ))}
    </div>
  )
}

export function SkeletonTiles({ count = 6 }: { count?: number }) {
  return (
    <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className="panel aspect-[5/4] p-4">
          <Skeleton className="h-3 w-2/3" />
          <Skeleton className="mt-6 h-8 w-1/2" />
          <Skeleton className="mt-3 h-2.5 w-3/4" />
        </div>
      ))}
    </div>
  )
}

// ------------------------------------------------------------ empty state

export function EmptyState({
  title,
  description,
  icon,
  action,
  secondary,
  compact,
}: {
  title: string
  description?: React.ReactNode
  icon?: React.ReactNode
  action?: React.ReactNode
  secondary?: React.ReactNode
  compact?: boolean
}) {
  return (
    <div
      className={cn(
        'dotgrid flex flex-col items-center justify-center rounded-md border border-dashed border-paper-400 bg-paper-50/50 text-center',
        compact ? 'gap-2 px-4 py-8' : 'gap-3 px-6 py-14',
      )}
    >
      {icon ? (
        <div className="grid h-10 w-10 place-items-center rounded-full border border-paper-300 bg-white text-ink-400 shadow-tile">
          {icon}
        </div>
      ) : null}
      <div className="max-w-sm space-y-1">
        <p className="text-sm font-semibold text-ink-800">{title}</p>
        {description ? <p className="text-xs leading-relaxed text-ink-500">{description}</p> : null}
      </div>
      {action || secondary ? (
        <div className="mt-1 flex flex-wrap items-center justify-center gap-2">
          {action}
          {secondary}
        </div>
      ) : null}
    </div>
  )
}

// ------------------------------------------------------------------ misc

export function Kbd({ children }: { children: React.ReactNode }) {
  return (
    <kbd className="rounded border border-paper-400 bg-paper-50 px-1 py-0.5 font-mono text-[10px] font-medium text-ink-600 shadow-[0_1px_0_theme(colors.paper.400)]">
      {children}
    </kbd>
  )
}

export const Avatar = React.forwardRef<
  HTMLSpanElement,
  { name: string; size?: 'xs' | 'sm' | 'md'; className?: string }
>(function Avatar({ name, size = 'md', className }, ref) {
  const palette = [
    'bg-accent-100 text-accent-800',
    'bg-[#e8f1f9] text-[#1f4f79]',
    'bg-[#f0ecfa] text-[#573f8f]',
    'bg-[#fdf3e3] text-[#8a5a1a]',
    'bg-[#e7f6f1] text-[#0f6153]',
  ]
  let h = 0
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) >>> 0
  const sizes = { xs: 'h-5 w-5 text-[9px]', sm: 'h-6 w-6 text-[10px]', md: 'h-7 w-7 text-[11px]' }
  return (
    <span
      ref={ref}
      title={name}
      className={cn(
        'inline-grid shrink-0 place-items-center rounded-full font-semibold uppercase',
        palette[h % palette.length],
        sizes[size],
        className,
      )}
    >
      {name.split(' ').map((w) => w[0]).join('').slice(0, 2)}
    </span>
  )
})

/** A thin labelled meter. Used in tiles; never spans the page. */
export function Meter({
  value,
  max,
  tone = 'bg-accent-500',
  className,
}: {
  value: number
  max: number
  tone?: string
  className?: string
}) {
  const pct = max > 0 ? Math.min(100, (value / max) * 100) : 0
  return (
    <div className={cn('h-1.5 w-full overflow-hidden rounded-full bg-paper-300/70', className)}>
      <motion.div
        className={cn('h-full rounded-full', tone)}
        initial={{ width: 0 }}
        animate={{ width: `${pct}%` }}
        transition={{ duration: 0.7, ease: [0.22, 1, 0.36, 1] }}
      />
    </div>
  )
}

/** Key-value row used in detail panels. */
export function Field({
  label,
  children,
  mono,
  className,
}: {
  label: React.ReactNode
  children: React.ReactNode
  mono?: boolean
  className?: string
}) {
  return (
    <div className={cn('min-w-0', className)}>
      <dt className="text-2xs font-medium uppercase tracking-wide text-ink-500">{label}</dt>
      <dd className={cn('mt-0.5 truncate text-sm text-ink-800', mono && 'font-mono tabular text-[0.8rem]')}>
        {children}
      </dd>
    </div>
  )
}

export function FieldGrid({ children, cols = 3 }: { children: React.ReactNode; cols?: 2 | 3 | 4 }) {
  return (
    <dl
      className={cn(
        'grid gap-x-5 gap-y-3.5',
        cols === 2 && 'grid-cols-1 sm:grid-cols-2',
        cols === 3 && 'grid-cols-2 lg:grid-cols-3',
        cols === 4 && 'grid-cols-2 lg:grid-cols-4',
      )}
    >
      {children}
    </dl>
  )
}

/** A short explanation of a rule the prototype enforces, shown in demo mode. */
export function RuleHint({ children }: { children: React.ReactNode }) {
  return (
    <p className="flex items-start gap-1.5 rounded border border-accent-200 bg-accent-50/70 px-2 py-1.5 text-2xs leading-relaxed text-accent-900">
      <span className="mt-[1px] font-semibold">Rule</span>
      <span className="text-accent-800">{children}</span>
    </p>
  )
}

/** Inline error, used by forms and rule refusals. */
export function InlineError({ children }: { children: React.ReactNode }) {
  if (!children) return null
  return (
    <p role="alert" className="flex items-start gap-1.5 rounded border border-danger-200 bg-danger-50 px-2 py-1.5 text-xs leading-relaxed text-danger-700">
      {children}
    </p>
  )
}

export function InlineWarning({ children }: { children: React.ReactNode }) {
  if (!children) return null
  return (
    <p className="flex items-start gap-1.5 rounded border border-warn-200 bg-warn-50 px-2 py-1.5 text-xs leading-relaxed text-warn-600">
      {children}
    </p>
  )
}

/** Page heading. Deliberately not a coloured band across the window. */
export function PageHeading({
  title,
  subtitle,
  actions,
  meta,
}: {
  title: React.ReactNode
  subtitle?: React.ReactNode
  actions?: React.ReactNode
  meta?: React.ReactNode
}) {
  return (
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div className="min-w-0">
        <h1 className="text-2xl font-semibold tracking-tight text-ink-900">{title}</h1>
        {subtitle ? <p className="mt-0.5 max-w-2xl text-sm text-ink-500">{subtitle}</p> : null}
        {meta ? <div className="mt-2 flex flex-wrap items-center gap-2">{meta}</div> : null}
      </div>
      {actions ? <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div> : null}
    </div>
  )
}

export function Divider({ className }: { className?: string }) {
  return <div className={cn('h-px w-full bg-paper-200', className)} />
}

/** Small count chip used beside tab labels. */
export function Count({ value, active }: { value: number; active?: boolean }) {
  return (
    <span
      className={cn(
        'ml-1.5 rounded px-1 py-px text-[10px] font-semibold tabular',
        active ? 'bg-accent-100 text-accent-800' : 'bg-paper-200 text-ink-500',
      )}
    >
      {value}
    </span>
  )
}
