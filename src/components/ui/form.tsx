/**
 * Form controls.
 *
 * NFR-US-05: validation errors appear inline against the field, in plain
 * language, and nothing the user typed is lost.
 */

import * as React from 'react'
import * as SelectPrimitive from '@radix-ui/react-select'
import * as SwitchPrimitive from '@radix-ui/react-switch'
import * as CheckboxPrimitive from '@radix-ui/react-checkbox'
import { Check, ChevronDown, Search as SearchIcon } from 'lucide-react'
import { cn } from '@/lib/utils'

// ------------------------------------------------------------ form field

export function FormRow({
  label,
  hint,
  error,
  required,
  children,
  className,
  htmlFor,
}: {
  label: React.ReactNode
  hint?: React.ReactNode
  error?: string | null
  required?: boolean
  children: React.ReactNode
  className?: string
  htmlFor?: string
}) {
  return (
    <div className={cn('min-w-0 space-y-1', className)}>
      <label htmlFor={htmlFor} className="flex items-baseline gap-1 text-xs font-medium text-ink-700">
        {label}
        {required ? <span className="text-danger-600">*</span> : null}
      </label>
      {children}
      {error ? (
        <p role="alert" className="text-xs text-danger-700">
          {error}
        </p>
      ) : hint ? (
        <p className="text-xs leading-relaxed text-ink-400">{hint}</p>
      ) : null}
    </div>
  )
}

export function FormGrid({ children, cols = 2, className }: { children: React.ReactNode; cols?: 1 | 2 | 3; className?: string }) {
  return (
    <div
      className={cn(
        'grid gap-x-4 gap-y-3.5',
        cols === 1 && 'grid-cols-1',
        cols === 2 && 'grid-cols-1 sm:grid-cols-2',
        cols === 3 && 'grid-cols-1 sm:grid-cols-3',
        className,
      )}
    >
      {children}
    </div>
  )
}

export function FormSection({
  title,
  description,
  children,
}: {
  title: string
  description?: string
  children: React.ReactNode
}) {
  return (
    <section className="space-y-3">
      <div>
        <h3 className="text-xs font-semibold uppercase tracking-wider text-ink-600">{title}</h3>
        {description ? <p className="mt-0.5 text-xs text-ink-400">{description}</p> : null}
      </div>
      {children}
    </section>
  )
}

// ------------------------------------------------------------------ input

const CONTROL =
  'w-full rounded border border-paper-400 bg-white px-2.5 text-sm text-ink-900 shadow-[inset_0_1px_1px_rgb(15_34_45/0.04)] ' +
  'placeholder:text-ink-400 transition-colors hover:border-ink-500/40 focus:border-accent-500 focus:outline-none focus:ring-2 focus:ring-accent-500/25 ' +
  'disabled:cursor-not-allowed disabled:bg-paper-200 disabled:text-ink-400'

export const Input = React.forwardRef<HTMLInputElement, React.InputHTMLAttributes<HTMLInputElement> & { invalid?: boolean; mono?: boolean }>(
  function Input({ className, invalid, mono, ...props }, ref) {
    return (
      <input
        ref={ref}
        aria-invalid={invalid || undefined}
        className={cn(CONTROL, 'h-8', invalid && 'border-danger-500 focus:border-danger-500 focus:ring-danger-500/25', mono && 'font-mono tabular', className)}
        {...props}
      />
    )
  },
)

export const Textarea = React.forwardRef<HTMLTextAreaElement, React.TextareaHTMLAttributes<HTMLTextAreaElement> & { invalid?: boolean }>(
  function Textarea({ className, invalid, rows = 3, ...props }, ref) {
    return (
      <textarea
        ref={ref}
        rows={rows}
        aria-invalid={invalid || undefined}
        className={cn(CONTROL, 'resize-y py-1.5 leading-relaxed', invalid && 'border-danger-500', className)}
        {...props}
      />
    )
  },
)

export function NumberInput({
  value,
  onChange,
  suffix,
  className,
  invalid,
  ...props
}: Omit<React.InputHTMLAttributes<HTMLInputElement>, 'value' | 'onChange'> & {
  value: number | null
  onChange: (value: number | null) => void
  suffix?: string
  invalid?: boolean
}) {
  return (
    <div className="relative">
      <input
        type="number"
        inputMode="decimal"
        value={value ?? ''}
        onChange={(e) => onChange(e.target.value === '' ? null : Number(e.target.value))}
        aria-invalid={invalid || undefined}
        className={cn(CONTROL, 'h-8 font-mono tabular', suffix && 'pr-11', invalid && 'border-danger-500', className)}
        {...props}
      />
      {suffix ? (
        <span className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-xs font-medium text-ink-400">
          {suffix}
        </span>
      ) : null}
    </div>
  )
}

export function DateInput({
  className,
  invalid,
  ...props
}: React.InputHTMLAttributes<HTMLInputElement> & { invalid?: boolean }) {
  return (
    <input
      type="date"
      aria-invalid={invalid || undefined}
      className={cn(CONTROL, 'h-8 font-mono tabular', invalid && 'border-danger-500', className)}
      {...props}
    />
  )
}

export function SearchInput({
  value,
  onChange,
  placeholder = 'Search…',
  className,
  autoFocus,
}: {
  value: string
  onChange: (value: string) => void
  placeholder?: string
  className?: string
  autoFocus?: boolean
}) {
  return (
    <div className={cn('relative', className)}>
      <SearchIcon className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-ink-400" />
      <input
        value={value}
        autoFocus={autoFocus}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className={cn(CONTROL, 'h-8 pl-8')}
      />
    </div>
  )
}

// ----------------------------------------------------------------- select

export interface SelectOption {
  value: string
  label: string
  description?: string
  disabled?: boolean
}

export function Select({
  value,
  onChange,
  options,
  placeholder = 'Select…',
  className,
  invalid,
  disabled,
  allowEmpty,
  emptyLabel = 'Any',
}: {
  value: string | null
  onChange: (value: string) => void
  options: SelectOption[]
  placeholder?: string
  className?: string
  invalid?: boolean
  disabled?: boolean
  allowEmpty?: boolean
  emptyLabel?: string
}) {
  const EMPTY = '__empty__'
  return (
    <SelectPrimitive.Root
      value={value === null || value === '' ? (allowEmpty ? EMPTY : undefined) : value}
      onValueChange={(v) => onChange(v === EMPTY ? '' : v)}
      disabled={disabled}
    >
      <SelectPrimitive.Trigger
        aria-invalid={invalid || undefined}
        className={cn(
          CONTROL,
          'flex h-8 items-center justify-between gap-2 text-left',
          invalid && 'border-danger-500',
          className,
        )}
      >
        <SelectPrimitive.Value placeholder={placeholder} className="truncate" />
        <SelectPrimitive.Icon>
          <ChevronDown className="h-3.5 w-3.5 shrink-0 text-ink-400" />
        </SelectPrimitive.Icon>
      </SelectPrimitive.Trigger>
      <SelectPrimitive.Portal>
        <SelectPrimitive.Content
          position="popper"
          sideOffset={4}
          className="z-50 max-h-72 w-[var(--radix-select-trigger-width)] min-w-[9rem] overflow-hidden rounded-md border border-paper-300 bg-white shadow-pop"
        >
          <SelectPrimitive.Viewport className="scroll-slim max-h-72 overflow-y-auto p-1">
            {allowEmpty ? (
              <SelectItem value={EMPTY} label={emptyLabel} />
            ) : null}
            {options.map((o) => (
              <SelectItem key={o.value} value={o.value} label={o.label} description={o.description} disabled={o.disabled} />
            ))}
          </SelectPrimitive.Viewport>
        </SelectPrimitive.Content>
      </SelectPrimitive.Portal>
    </SelectPrimitive.Root>
  )
}

function SelectItem({
  value,
  label,
  description,
  disabled,
}: {
  value: string
  label: string
  description?: string
  disabled?: boolean
}) {
  return (
    <SelectPrimitive.Item
      value={value}
      disabled={disabled}
      className={cn(
        'relative flex cursor-pointer select-none items-start gap-2 rounded px-2 py-1.5 pr-7 text-sm outline-none',
        'data-[highlighted]:bg-paper-200 data-[disabled]:cursor-not-allowed data-[disabled]:opacity-40',
      )}
    >
      <div className="min-w-0 flex-1">
        <SelectPrimitive.ItemText>{label}</SelectPrimitive.ItemText>
        {description ? <p className="truncate text-2xs text-ink-400">{description}</p> : null}
      </div>
      <SelectPrimitive.ItemIndicator className="absolute right-2 top-1.5">
        <Check className="h-3.5 w-3.5 text-accent-600" />
      </SelectPrimitive.ItemIndicator>
    </SelectPrimitive.Item>
  )
}

// --------------------------------------------------------------- combobox

/** Type-ahead picker for long lists (products, companies, sources). */
export function Combobox({
  value,
  onChange,
  options,
  placeholder = 'Search and select…',
  emptyMessage = 'Nothing matches that.',
  footer,
  invalid,
  disabled,
}: {
  value: string | null
  onChange: (value: string) => void
  options: SelectOption[]
  placeholder?: string
  emptyMessage?: string
  footer?: React.ReactNode
  invalid?: boolean
  disabled?: boolean
}) {
  const [open, setOpen] = React.useState(false)
  const [query, setQuery] = React.useState('')
  const wrapRef = React.useRef<HTMLDivElement>(null)
  const selected = options.find((o) => o.value === value)

  React.useEffect(() => {
    if (!open) return
    const onClick = (e: MouseEvent) => {
      if (!wrapRef.current?.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', onClick)
    return () => document.removeEventListener('mousedown', onClick)
  }, [open])

  const filtered = React.useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return options.slice(0, 60)
    return options
      .filter((o) => o.label.toLowerCase().includes(q) || o.description?.toLowerCase().includes(q))
      .slice(0, 60)
  }, [options, query])

  return (
    <div ref={wrapRef} className="relative">
      <button
        type="button"
        disabled={disabled}
        aria-invalid={invalid || undefined}
        onClick={() => setOpen((o) => !o)}
        className={cn(
          CONTROL,
          'flex h-8 items-center justify-between gap-2 text-left',
          invalid && 'border-danger-500',
          !selected && 'text-ink-400',
        )}
      >
        <span className="truncate">{selected?.label ?? placeholder}</span>
        <ChevronDown className="h-3.5 w-3.5 shrink-0 text-ink-400" />
      </button>
      {open ? (
        <div className="absolute z-50 mt-1 w-full overflow-hidden rounded-md border border-paper-300 bg-white shadow-pop animate-fade-up">
          <div className="border-b border-paper-200 p-1.5">
            <SearchInput value={query} onChange={setQuery} autoFocus placeholder="Type to filter…" />
          </div>
          <div className="scroll-slim max-h-64 overflow-y-auto p-1">
            {filtered.length === 0 ? (
              <p className="px-2 py-4 text-center text-xs text-ink-400">{emptyMessage}</p>
            ) : (
              filtered.map((o) => (
                <button
                  key={o.value}
                  type="button"
                  disabled={o.disabled}
                  onClick={() => {
                    onChange(o.value)
                    setOpen(false)
                    setQuery('')
                  }}
                  className={cn(
                    'flex w-full items-start gap-2 rounded px-2 py-1.5 text-left text-sm transition-colors',
                    o.value === value ? 'bg-accent-50 text-accent-900' : 'text-ink-800 hover:bg-paper-200',
                    o.disabled && 'cursor-not-allowed opacity-40',
                  )}
                >
                  <span className="min-w-0 flex-1">
                    <span className="block truncate">{o.label}</span>
                    {o.description ? <span className="block truncate text-2xs text-ink-400">{o.description}</span> : null}
                  </span>
                  {o.value === value ? <Check className="mt-0.5 h-3.5 w-3.5 shrink-0 text-accent-600" /> : null}
                </button>
              ))
            )}
          </div>
          {footer ? <div className="border-t border-paper-200 p-1.5">{footer}</div> : null}
        </div>
      ) : null}
    </div>
  )
}

// ------------------------------------------------------- switch, checkbox

export function Switch({
  checked,
  onChange,
  label,
  description,
  disabled,
}: {
  checked: boolean
  onChange: (checked: boolean) => void
  label?: React.ReactNode
  description?: React.ReactNode
  disabled?: boolean
}) {
  const body = (
    <SwitchPrimitive.Root
      checked={checked}
      onCheckedChange={onChange}
      disabled={disabled}
      className={cn(
        'relative h-[18px] w-8 shrink-0 rounded-full border transition-colors duration-200',
        checked ? 'border-accent-600 bg-accent-600' : 'border-paper-400 bg-paper-300',
        disabled && 'cursor-not-allowed opacity-50',
      )}
    >
      <SwitchPrimitive.Thumb className="block h-3.5 w-3.5 translate-x-[2px] rounded-full bg-white shadow-tile transition-transform duration-200 data-[state=checked]:translate-x-[16px]" />
    </SwitchPrimitive.Root>
  )
  if (!label) return body
  return (
    <label className="flex cursor-pointer items-start gap-2.5">
      {body}
      <span className="min-w-0">
        <span className="block text-sm text-ink-800">{label}</span>
        {description ? <span className="block text-xs text-ink-400">{description}</span> : null}
      </span>
    </label>
  )
}

export function Checkbox({
  checked,
  onChange,
  label,
  indeterminate,
  disabled,
  className,
}: {
  checked: boolean
  onChange: (checked: boolean) => void
  label?: React.ReactNode
  indeterminate?: boolean
  disabled?: boolean
  className?: string
}) {
  const box = (
    <CheckboxPrimitive.Root
      checked={indeterminate ? 'indeterminate' : checked}
      onCheckedChange={(v) => onChange(v === true)}
      disabled={disabled}
      className={cn(
        'grid h-4 w-4 shrink-0 place-items-center rounded border transition-colors',
        checked || indeterminate ? 'border-accent-600 bg-accent-600 text-white' : 'border-paper-400 bg-white hover:border-ink-500/50',
        disabled && 'cursor-not-allowed opacity-50',
        className,
      )}
    >
      <CheckboxPrimitive.Indicator>
        {indeterminate ? <span className="block h-0.5 w-2 rounded bg-white" /> : <Check className="h-3 w-3" />}
      </CheckboxPrimitive.Indicator>
    </CheckboxPrimitive.Root>
  )
  if (!label) return box
  return (
    <label className="flex cursor-pointer items-center gap-2 text-sm text-ink-800">
      {box}
      {label}
    </label>
  )
}

// ----------------------------------------------------------- radio cards

export function RadioCards<T extends string>({
  value,
  onChange,
  options,
  columns = 2,
}: {
  value: T | null
  onChange: (value: T) => void
  options: { value: T; label: string; description?: string; icon?: React.ReactNode }[]
  columns?: 1 | 2 | 3
}) {
  return (
    <div
      className={cn(
        'grid gap-2',
        columns === 1 && 'grid-cols-1',
        columns === 2 && 'grid-cols-1 sm:grid-cols-2',
        columns === 3 && 'grid-cols-1 sm:grid-cols-3',
      )}
      role="radiogroup"
    >
      {options.map((o) => {
        const active = o.value === value
        return (
          <button
            key={o.value}
            type="button"
            role="radio"
            aria-checked={active}
            onClick={() => onChange(o.value)}
            className={cn(
              'flex items-start gap-2.5 rounded-md border p-2.5 text-left transition-all duration-150',
              active
                ? 'border-accent-500 bg-accent-50 shadow-[0_0_0_1px_theme(colors.accent.500)]'
                : 'border-paper-300 bg-white hover:border-paper-400 hover:bg-paper-50',
            )}
          >
            <span
              className={cn(
                'mt-0.5 grid h-4 w-4 shrink-0 place-items-center rounded-full border transition-colors',
                active ? 'border-accent-600' : 'border-paper-400',
              )}
            >
              {active ? <span className="h-2 w-2 rounded-full bg-accent-600" /> : null}
            </span>
            <span className="min-w-0">
              <span className="flex items-center gap-1.5 text-sm font-medium text-ink-900">
                {o.icon}
                {o.label}
              </span>
              {o.description ? <span className="mt-0.5 block text-xs leading-relaxed text-ink-500">{o.description}</span> : null}
            </span>
          </button>
        )
      })}
    </div>
  )
}

// --------------------------------------------------------------- toggles

/** Segmented control, e.g. Mine / Everyone. */
export function SegmentedControl<T extends string>({
  value,
  onChange,
  options,
  size = 'md',
}: {
  value: T
  onChange: (value: T) => void
  options: { value: T; label: React.ReactNode }[]
  size?: 'sm' | 'md'
}) {
  return (
    <div
      className={cn(
        'inline-flex items-center gap-0.5 rounded-md border border-paper-300 bg-paper-200/70 p-0.5',
        size === 'sm' ? 'text-xs' : 'text-sm',
      )}
    >
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          onClick={() => onChange(o.value)}
          className={cn(
            'rounded px-2.5 font-medium transition-all duration-150',
            size === 'sm' ? 'h-6' : 'h-7',
            o.value === value ? 'bg-white text-ink-900 shadow-tile' : 'text-ink-500 hover:text-ink-800',
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  )
}

/** Editable list of short strings, used for product synonyms. */
export function TagInput({
  values,
  onChange,
  placeholder = 'Add and press Enter',
}: {
  values: string[]
  onChange: (values: string[]) => void
  placeholder?: string
}) {
  const [draft, setDraft] = React.useState('')
  const add = () => {
    const v = draft.trim()
    if (v && !values.includes(v)) onChange([...values, v])
    setDraft('')
  }
  return (
    <div className="space-y-1.5">
      <div className="flex gap-1.5">
        <Input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault()
              add()
            }
          }}
          placeholder={placeholder}
        />
        <button
          type="button"
          onClick={add}
          className="h-8 shrink-0 rounded border border-paper-300 bg-white px-2.5 text-xs font-medium text-ink-700 transition-colors hover:bg-paper-100"
        >
          Add
        </button>
      </div>
      {values.length ? (
        <div className="flex flex-wrap gap-1">
          {values.map((v) => (
            <span
              key={v}
              className="inline-flex items-center gap-1 rounded border border-paper-300 bg-paper-100 px-1.5 py-0.5 text-2xs text-ink-700"
            >
              {v}
              <button
                type="button"
                aria-label={`Remove ${v}`}
                onClick={() => onChange(values.filter((x) => x !== v))}
                className="text-ink-400 transition-colors hover:text-danger-600"
              >
                ×
              </button>
            </span>
          ))}
        </div>
      ) : null}
    </div>
  )
}
