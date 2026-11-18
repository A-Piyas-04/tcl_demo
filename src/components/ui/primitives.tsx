/**
 * The base UI vocabulary: surfaces, buttons, badges, states.
 *
 * Design rules held here, so they are obeyed everywhere:
 *  - Surfaces are solid with a hairline border. No glass, no blur.
 *  - Content sits in bounded panels inside grids, never in full-width bands.
 *  - Actions disappear for a View Only session rather than being greyed out.
 */

import * as React from 'react'
import { Link, useLocation } from 'react-router-dom'
import * as TooltipPrimitive from '@radix-ui/react-tooltip'
import { motion } from 'framer-motion'
import { Info, Loader2 } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useCanWrite } from '@/data/store'

// ------------------------------------------------------------------ hover help

const TIP_CLASS =
  'z-50 max-w-xs rounded border border-ink-800 bg-ink-900 px-2 py-1 text-sm leading-relaxed text-paper-100 shadow-pop data-[state=delayed-open]:animate-fade-up'

/**
 * An explanation the screen does not have to say out loud. Hover or focus the
 * mark and the sentence appears; the layout stays quiet until then.
 */
export function HelpTip({
  children,
  side = 'top',
  className,
}: {
  children?: React.ReactNode
  side?: 'top' | 'right' | 'bottom' | 'left'
  className?: string
}) {
  if (!children) return null
  return (
    <TooltipPrimitive.Root>
      <TooltipPrimitive.Trigger asChild>
        <button
          type="button"
          aria-label="Explain this"
          onClick={(e) => e.preventDefault()}
          className={cn(
            'inline-grid h-4 w-4 shrink-0 translate-y-px place-items-center rounded-full text-ink-300',
            'transition-colors hover:text-ink-600 focus-visible:text-ink-600',
            className,
          )}
        >
          <Info className="h-3.5 w-3.5" aria-hidden />
        </button>
      </TooltipPrimitive.Trigger>
      <TooltipPrimitive.Portal>
        <TooltipPrimitive.Content side={side} sideOffset={6} className={TIP_CLASS}>
          {children}
          <TooltipPrimitive.Arrow className="fill-ink-900" />
        </TooltipPrimitive.Content>
      </TooltipPrimitive.Portal>
    </TooltipPrimitive.Root>
  )
}

/**
 * Subtitles render in place. They used to be routed to a hover tooltip above a
 * certain length, which is what put an ⓘ mark beside almost every heading,
 * tile and empty state in the product. A label that needs an explanation is a
 * label that needs rewriting, so `tip` is now always null and the ⓘ marks are
 * gone. `HelpTip` remains for the rare case a section genuinely earns one.
 */
export function splitBlurb(node: React.ReactNode): {
  caption: React.ReactNode | null
  tip: React.ReactNode | null
} {
  if (node === null || node === undefined || node === false || node === '') {
    return { caption: null, tip: null }
  }
  if (typeof node === 'string') {
    const text = node.trim()
    return { caption: text || null, tip: null }
  }
  return { caption: node, tip: null }
}

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
  const { caption, tip } = splitBlurb(subtitle)
  return (
    <div className={cn('panel-head', className)}>
      <div className="flex min-w-0 items-center gap-2.5">
        {icon ? <span className="shrink-0 text-ink-500">{icon}</span> : null}
        <div className="min-w-0">
          <div className="flex min-w-0 items-center gap-1">
            <h2 className="truncate-end text-lg font-semibold text-ink-900">{title}</h2>
            <HelpTip>{tip}</HelpTip>
          </div>
          {caption ? <p className="truncate-end text-sm text-ink-500">{caption}</p> : null}
        </div>
      </div>
      {actions ? <div className="flex shrink-0 items-center gap-2">{actions}</div> : null}
    </div>
  )
}

// ----------------------------------------------------------------- button

type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger' | 'subtle'
type ButtonSize = 'sm' | 'md' | 'lg' | 'icon'

/**
 * One filled button exists: `primary`. Everything else is outlined or text, so
 * a view can only ever have one obvious action.
 *
 * `danger` is deliberately NOT filled — an irreversible action is outlined with
 * danger text and confirmed, rather than presented as the brightest thing on
 * the screen. An Accept/Reject pair is `primary` + `secondary`.
 */
const BUTTON_VARIANT: Record<ButtonVariant, string> = {
  // A key you press: lit along the top, hard edge underneath, and it sinks.
  primary:
    'text-white shadow-key bg-gradient-to-b from-accent-500 to-accent-700 hover:from-accent-400 hover:to-accent-600 active:shadow-pressed active:from-accent-700 active:to-accent-700 disabled:opacity-50',
  secondary:
    'bg-gradient-to-b from-white to-paper-100 text-ink-800 border border-ink-400 shadow-raised hover:to-paper-200 active:shadow-pressed active:from-paper-200',
  ghost: 'text-ink-700 hover:bg-paper-200 active:bg-paper-300',
  subtle: 'bg-gradient-to-b from-paper-100 to-paper-200 text-ink-800 shadow-raised active:shadow-pressed',
  danger:
    'bg-gradient-to-b from-white to-danger-50 text-danger-700 border border-danger-500 shadow-raised hover:to-danger-100 active:shadow-pressed',
}

/** Every size clears the 36px pointer target; `.hit` raises it to 44px on touch. */
const BUTTON_SIZE: Record<ButtonSize, string> = {
  sm: 'h-9 px-3 text-base gap-1.5 rounded',
  md: 'h-9 px-4 text-base gap-2 rounded',
  lg: 'h-11 px-4 text-base gap-2 rounded',
  icon: 'h-9 w-9 justify-center rounded',
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
        'pressable inline-flex select-none items-center whitespace-nowrap font-semibold',
        'disabled:cursor-not-allowed disabled:opacity-60 disabled:active:translate-y-0',
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
  accent: 'bg-accent-50 text-accent-700 border-accent-200',
  ok: 'bg-ok-50 text-ok-700 border-ok-200',
  warn: 'bg-warn-50 text-warn-700 border-warn-200',
  danger: 'bg-danger-50 text-danger-700 border-danger-200',
  info: 'bg-info-50 text-info-700 border-info-200',
  outline: 'bg-transparent text-ink-600 border-paper-400',
}

/**
 * A badge is a STATE THAT CHANGES — a stage, an order status, an expiry
 * warning. A fixed attribute of a record (pharmacopoeia, therapeutic area,
 * grade, kind) is not a state and must use `Quiet` below instead.
 *
 * One size, one radius, one style. 12px is the only place in the product where
 * text is allowed below 13px.
 */
export const Badge = React.forwardRef<
  HTMLSpanElement,
  { tone?: BadgeTone; dot?: string } & React.HTMLAttributes<HTMLSpanElement>
>(function Badge({ tone = 'neutral', className, dot, children, ...props }, ref) {
  return (
    <span
      ref={ref}
      className={cn(
        'inline-flex items-center gap-1.5 whitespace-nowrap rounded border px-2 py-0.5 text-xs font-semibold',
        BADGE_TONE[tone],
        className,
      )}
      {...props}
    >
      {dot ? <span className={cn('h-1.5 w-1.5 shrink-0 rounded-full', dot)} aria-hidden /> : null}
      {children}
    </span>
  )
})

/**
 * A static attribute of a record: pharmacopoeial grade, therapeutic area,
 * category, kind. Plain text, not a coloured pill — nothing here changes over
 * time, so nothing here earns a status colour.
 */
export function Quiet({ children, className }: { children: React.ReactNode; className?: string }) {
  if (children == null || children === '') return null
  return <span className={cn('whitespace-nowrap text-sm text-ink-500', className)}>{children}</span>
}

/**
 * Severity carried by a dot plus a word, never by colour alone.
 */
export function SeverityDot({
  tone,
  label,
  className,
}: {
  tone: 'ok' | 'warn' | 'danger' | 'info' | 'neutral'
  label: string
  className?: string
}) {
  const dot = {
    ok: 'bg-ok-600',
    warn: 'bg-warn-600',
    danger: 'bg-danger-600',
    info: 'bg-info-600',
    neutral: 'bg-ink-400',
  }[tone]
  const text = {
    ok: 'text-ok-700',
    warn: 'text-warn-700',
    danger: 'text-danger-700',
    info: 'text-info-700',
    neutral: 'text-ink-600',
  }[tone]
  return (
    <span className={cn('inline-flex items-center gap-1.5 whitespace-nowrap text-base', text, className)}>
      <span className={cn('h-1.5 w-1.5 shrink-0 rounded-full', dot)} aria-hidden />
      {label}
    </span>
  )
}

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
  const { caption, tip } = splitBlurb(description)
  return (
    <div
      className={cn(
        'dotgrid flex flex-col items-center justify-center rounded-md border border-dashed border-paper-400 bg-paper-50/50 text-center',
        compact ? 'gap-2 px-4 py-8' : 'gap-3 px-6 py-14',
      )}
    >
      {icon ? (
        <div className="grid h-10 w-10 place-items-center rounded-full border border-paper-300 bg-white text-ink-400 ">
          {icon}
        </div>
      ) : null}
      <div className="max-w-sm space-y-1">
        <p className="inline-flex items-center gap-1 text-base font-semibold text-ink-800">
          {title}
          <HelpTip>{tip}</HelpTip>
        </p>
        {caption ? <p className="text-sm leading-relaxed text-ink-500">{caption}</p> : null}
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
    <kbd className="rounded border border-paper-400 bg-paper-100 px-1.5 py-0.5 font-mono text-xs font-semibold text-ink-600">
      {children}
    </kbd>
  )
}

export const Avatar = React.forwardRef<
  HTMLSpanElement,
  { name: string; size?: 'xs' | 'sm' | 'md'; className?: string }
>(function Avatar({ name, size = 'md', className }, ref) {
  // One treatment, not a palette of five. An avatar identifies a person; the
  // initials do that. A hue per person would be colour carrying no meaning.
  const sizes = { xs: 'h-6 w-6 text-sm', sm: 'h-7 w-7 text-sm', md: 'h-8 w-8 text-sm' }
  return (
    <span
      ref={ref}
      title={name}
      className={cn(
        'inline-grid shrink-0 place-items-center rounded-full bg-paper-200 font-semibold uppercase text-ink-600',
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
  tone = 'bg-accent-600',
  className,
}: {
  value: number
  max: number
  tone?: string
  className?: string
}) {
  const pct = max > 0 ? Math.min(100, (value / max) * 100) : 0
  return (
    <div className={cn('h-1.5 w-full overflow-hidden rounded-full bg-paper-300', className)}>
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
  wrap,
  className,
}: {
  label: React.ReactNode
  children: React.ReactNode
  mono?: boolean
  /** Let a sentence-length value wrap instead of truncating. */
  wrap?: boolean
  className?: string
}) {
  return (
    <div className={cn('min-w-0', className)}>
      <dt className="text-sm text-ink-500">{label}</dt>
      <dd
        className={cn(
          'mt-1 text-base text-ink-900',
          wrap ? 'leading-snug' : 'truncate-end',
          // `mono` is for codes only: CAS, AWB, document and record references.
          mono && 'font-mono',
        )}
      >
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
  if (!children) return null
  return (
    <TooltipPrimitive.Root>
      <TooltipPrimitive.Trigger asChild>
        <button
          type="button"
          onClick={(e) => e.preventDefault()}
          className="inline-flex w-fit items-center gap-1 rounded border border-accent-200 bg-accent-50/70 px-1.5 py-0.5 text-sm font-medium text-accent-800 transition-colors hover:bg-accent-100"
        >
          <Info className="h-3 w-3" aria-hidden />
          Rule
        </button>
      </TooltipPrimitive.Trigger>
      <TooltipPrimitive.Portal>
        <TooltipPrimitive.Content side="top" sideOffset={6} className={TIP_CLASS}>
          {children}
          <TooltipPrimitive.Arrow className="fill-ink-900" />
        </TooltipPrimitive.Content>
      </TooltipPrimitive.Portal>
    </TooltipPrimitive.Root>
  )
}

/**
 * A labelled note collapsed to one chip. The sentence is on hover, so a screen
 * can carry the caveat without spending four lines of prose on it.
 */
export function NoteTip({
  label = 'About this',
  children,
  tone = 'neutral',
  className,
}: {
  label?: string
  children: React.ReactNode
  tone?: 'neutral' | 'accent'
  className?: string
}) {
  if (!children) return null
  return (
    <TooltipPrimitive.Root>
      <TooltipPrimitive.Trigger asChild>
        <button
          type="button"
          onClick={(e) => e.preventDefault()}
          className={cn(
            'inline-flex w-fit items-center gap-1 rounded border px-1.5 py-0.5 text-sm font-medium transition-colors',
            tone === 'accent'
              ? 'border-accent-200 bg-accent-50/70 text-accent-800 hover:bg-accent-100'
              : 'border-paper-300 bg-paper-50 text-ink-500 hover:bg-paper-200 hover:text-ink-700',
            className,
          )}
        >
          <Info className="h-3 w-3" aria-hidden />
          {label}
        </button>
      </TooltipPrimitive.Trigger>
      <TooltipPrimitive.Portal>
        <TooltipPrimitive.Content side="top" sideOffset={6} className={TIP_CLASS}>
          {children}
          <TooltipPrimitive.Arrow className="fill-ink-900" />
        </TooltipPrimitive.Content>
      </TooltipPrimitive.Portal>
    </TooltipPrimitive.Root>
  )
}

/** Inline error, used by forms and rule refusals. */
export function InlineError({ children }: { children: React.ReactNode }) {
  if (!children) return null
  return (
    <p role="alert" className="flex items-start gap-2 rounded border-l-2 border-danger-500 bg-danger-50 px-3 py-2 text-base leading-relaxed text-danger-700">
      {children}
    </p>
  )
}

export function InlineWarning({ children }: { children: React.ReactNode }) {
  if (!children) return null
  return (
    <p className="flex items-start gap-2 rounded border-l-2 border-warn-500 bg-warn-50 px-3 py-2 text-base leading-relaxed text-warn-700">
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
  const { caption, tip } = splitBlurb(subtitle)
  return (
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div className="min-w-0">
        <div className="flex min-w-0 items-center gap-1.5">
          <h1 className="min-w-0 text-2xl font-semibold text-ink-900">{title}</h1>
          <HelpTip side="bottom">{tip}</HelpTip>
        </div>
        {caption ? <p className="mt-1 text-base text-ink-500">{caption}</p> : null}
        {meta ? <div className="mt-2 flex flex-wrap items-center gap-2">{meta}</div> : null}
      </div>
      {actions ? <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div> : null}
    </div>
  )
}

export interface SectionTab {
  to: string
  label: string
  /** extra path prefixes that also make this tab active */
  match?: string[]
  count?: number
}

/**
 * The second level of navigation: sibling views of one sidebar section
 * (for example Client orders and Indents under Orders). Links, not state, so
 * every view keeps its own URL.
 */
export function SectionTabs({ tabs, className }: { tabs: SectionTab[]; className?: string }) {
  const location = useLocation()
  const isActive = (t: SectionTab) => {
    const prefixes = [t.to, ...(t.match ?? [])]
    return prefixes.some((p) => location.pathname === p || location.pathname.startsWith(`${p}/`))
  }
  // the most specific match wins, so "/commissions/analysis" does not also light "/commissions"
  const active = tabs
    .filter(isActive)
    .sort((a, b) => b.to.length - a.to.length)[0]
  return (
    <nav aria-label="Section views" className={cn('-mb-px flex gap-1 overflow-x-auto border-b border-paper-300', className)}>
      {tabs.map((t) => {
        const on = active?.to === t.to
        return (
          <Link
            key={t.to}
            to={t.to}
            aria-current={on ? 'page' : undefined}
            className={cn(
              'relative flex h-10 items-center whitespace-nowrap px-3 text-base transition-colors',
              on ? 'font-semibold text-ink-900' : 'text-ink-500 hover:text-ink-900',
            )}
          >
            {t.label}
            {typeof t.count === 'number' ? <Count value={t.count} active={on} /> : null}
            {on ? <span className="absolute inset-x-2 -bottom-px h-0.5 rounded-full bg-accent-600" aria-hidden /> : null}
          </Link>
        )
      })}
    </nav>
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
        'ml-1.5 rounded px-1.5 py-px text-xs font-semibold',
        active ? 'bg-accent-100 text-accent-700' : 'bg-paper-200 text-ink-600',
      )}
    >
      {value}
    </span>
  )
}
