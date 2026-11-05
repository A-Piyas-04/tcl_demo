/**
 * Dialogs, drawers, menus and tooltips, built on Radix so keyboard navigation
 * and focus handling are correct without hand-rolling them.
 */

import * as React from 'react'
import * as DialogPrimitive from '@radix-ui/react-dialog'
import * as DropdownPrimitive from '@radix-ui/react-dropdown-menu'
import * as TooltipPrimitive from '@radix-ui/react-tooltip'
import * as PopoverPrimitive from '@radix-ui/react-popover'
import * as TabsPrimitive from '@radix-ui/react-tabs'
import { AnimatePresence, motion } from 'framer-motion'
import { AlertTriangle, X } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Button, type ButtonProps } from './primitives'

// ----------------------------------------------------------------- dialog

export function Dialog({
  open,
  onOpenChange,
  title,
  description,
  children,
  footer,
  width = 'md',
  icon,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  title: React.ReactNode
  description?: React.ReactNode
  children?: React.ReactNode
  footer?: React.ReactNode
  width?: 'sm' | 'md' | 'lg' | 'xl'
  icon?: React.ReactNode
}) {
  const widths = { sm: 'max-w-sm', md: 'max-w-lg', lg: 'max-w-2xl', xl: 'max-w-4xl' }
  return (
    <DialogPrimitive.Root open={open} onOpenChange={onOpenChange}>
      <AnimatePresence>
        {open ? (
          <DialogPrimitive.Portal forceMount>
            <DialogPrimitive.Overlay asChild forceMount>
              <motion.div
                className="fixed inset-0 z-40 bg-ink-950/35"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.16 }}
              />
            </DialogPrimitive.Overlay>
            <DialogPrimitive.Content asChild forceMount>
              <motion.div
                className={cn(
                  'fixed left-1/2 top-1/2 z-50 w-[calc(100vw-2rem)] -translate-x-1/2 -translate-y-1/2',
                  'overflow-hidden rounded-xl border border-paper-300 bg-white shadow-pop',
                  widths[width],
                )}
                initial={{ opacity: 0, scale: 0.97, y: '-48%' }}
                animate={{ opacity: 1, scale: 1, y: '-50%' }}
                exit={{ opacity: 0, scale: 0.98, y: '-48%' }}
                transition={{ duration: 0.18, ease: [0.22, 1, 0.36, 1] }}
              >
                <div className="flex items-start gap-3 border-b border-paper-200 px-5 py-3.5">
                  {icon ? <span className="mt-0.5 shrink-0 text-ink-500">{icon}</span> : null}
                  <div className="min-w-0 flex-1">
                    <DialogPrimitive.Title className="text-base font-semibold text-ink-900">
                      {title}
                    </DialogPrimitive.Title>
                    {description ? (
                      <DialogPrimitive.Description className="mt-0.5 text-xs leading-relaxed text-ink-500">
                        {description}
                      </DialogPrimitive.Description>
                    ) : null}
                  </div>
                  <DialogPrimitive.Close asChild>
                    <button
                      aria-label="Close"
                      className="-mr-1 -mt-0.5 rounded p-1 text-ink-400 transition-colors hover:bg-paper-200 hover:text-ink-700"
                    >
                      <X className="h-4 w-4" />
                    </button>
                  </DialogPrimitive.Close>
                </div>
                {children ? (
                  <div className="scroll-slim max-h-[65vh] overflow-y-auto px-5 py-4">{children}</div>
                ) : null}
                {footer ? (
                  <div className="flex items-center justify-end gap-2 border-t border-paper-200 bg-paper-50 px-5 py-3">
                    {footer}
                  </div>
                ) : null}
              </motion.div>
            </DialogPrimitive.Content>
          </DialogPrimitive.Portal>
        ) : null}
      </AnimatePresence>
    </DialogPrimitive.Root>
  )
}

/** NFR-US-04: a destructive action names the record it affects. */
export function ConfirmDialog({
  open,
  onOpenChange,
  title,
  recordName,
  consequence,
  confirmLabel = 'Confirm',
  tone = 'danger',
  loading,
  onConfirm,
  children,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  title: string
  recordName: string
  consequence?: React.ReactNode
  confirmLabel?: string
  tone?: 'danger' | 'primary'
  loading?: boolean
  onConfirm: () => void
  children?: React.ReactNode
}) {
  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      width="sm"
      icon={<AlertTriangle className={cn('h-5 w-5', tone === 'danger' ? 'text-danger-600' : 'text-accent-600')} />}
      title={title}
      description={
        <>
          This affects <span className="font-semibold text-ink-700">{recordName}</span>.
          {consequence ? <> {consequence}</> : null}
        </>
      }
      footer={
        <>
          <Button variant="ghost" size="sm" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button variant={tone === 'danger' ? 'danger' : 'primary'} size="sm" loading={loading} onClick={onConfirm}>
            {confirmLabel}
          </Button>
        </>
      }
    >
      {children}
    </Dialog>
  )
}

// ----------------------------------------------------------------- drawer

/** Right-hand inspector. Pairs with a bounded list, never a full-width band. */
export function Drawer({
  open,
  onOpenChange,
  title,
  subtitle,
  children,
  footer,
  width = 'md',
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  title: React.ReactNode
  subtitle?: React.ReactNode
  children: React.ReactNode
  footer?: React.ReactNode
  width?: 'sm' | 'md' | 'lg'
}) {
  const widths = { sm: 'max-w-sm', md: 'max-w-md', lg: 'max-w-xl' }
  return (
    <DialogPrimitive.Root open={open} onOpenChange={onOpenChange}>
      <AnimatePresence>
        {open ? (
          <DialogPrimitive.Portal forceMount>
            <DialogPrimitive.Overlay asChild forceMount>
              <motion.div
                className="fixed inset-0 z-40 bg-ink-950/25"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.16 }}
              />
            </DialogPrimitive.Overlay>
            <DialogPrimitive.Content asChild forceMount>
              <motion.div
                className={cn(
                  'fixed inset-y-0 right-0 z-50 flex w-full flex-col border-l border-paper-300 bg-paper-50 shadow-pop',
                  widths[width],
                )}
                initial={{ x: '100%' }}
                animate={{ x: 0 }}
                exit={{ x: '100%' }}
                transition={{ duration: 0.26, ease: [0.22, 1, 0.36, 1] }}
              >
                <div className="flex items-start justify-between gap-3 border-b border-paper-200 bg-white px-4 py-3">
                  <div className="min-w-0">
                    <DialogPrimitive.Title className="truncate text-sm font-semibold text-ink-900">
                      {title}
                    </DialogPrimitive.Title>
                    {subtitle ? (
                      <DialogPrimitive.Description className="truncate text-xs text-ink-500">
                        {subtitle}
                      </DialogPrimitive.Description>
                    ) : null}
                  </div>
                  <DialogPrimitive.Close asChild>
                    <button
                      aria-label="Close"
                      className="rounded p-1 text-ink-400 transition-colors hover:bg-paper-200 hover:text-ink-700"
                    >
                      <X className="h-4 w-4" />
                    </button>
                  </DialogPrimitive.Close>
                </div>
                <div className="scroll-slim flex-1 overflow-y-auto p-4">{children}</div>
                {footer ? (
                  <div className="flex items-center justify-end gap-2 border-t border-paper-200 bg-white px-4 py-3">
                    {footer}
                  </div>
                ) : null}
              </motion.div>
            </DialogPrimitive.Content>
          </DialogPrimitive.Portal>
        ) : null}
      </AnimatePresence>
    </DialogPrimitive.Root>
  )
}

// --------------------------------------------------------------- dropdown

export const Menu = DropdownPrimitive.Root
export const MenuTrigger = DropdownPrimitive.Trigger

export function MenuContent({
  children,
  align = 'end',
  className,
}: {
  children: React.ReactNode
  align?: 'start' | 'center' | 'end'
  className?: string
}) {
  return (
    <DropdownPrimitive.Portal>
      <DropdownPrimitive.Content
        align={align}
        sideOffset={6}
        className={cn(
          'z-50 min-w-[11rem] overflow-hidden rounded-md border border-paper-300 bg-white p-1 shadow-pop',
          'data-[state=open]:animate-fade-up',
          className,
        )}
      >
        {children}
      </DropdownPrimitive.Content>
    </DropdownPrimitive.Portal>
  )
}

export function MenuItem({
  children,
  onSelect,
  icon,
  danger,
  disabled,
  shortcut,
}: {
  children: React.ReactNode
  onSelect?: () => void
  icon?: React.ReactNode
  danger?: boolean
  disabled?: boolean
  shortcut?: string
}) {
  return (
    <DropdownPrimitive.Item
      disabled={disabled}
      onSelect={onSelect}
      className={cn(
        'flex cursor-pointer select-none items-center gap-2 rounded px-2 py-1.5 text-sm outline-none transition-colors',
        'data-[highlighted]:bg-paper-200 data-[disabled]:cursor-not-allowed data-[disabled]:opacity-50',
        danger ? 'text-danger-700 data-[highlighted]:bg-danger-50' : 'text-ink-800',
      )}
    >
      {icon ? <span className="shrink-0 text-ink-500">{icon}</span> : null}
      <span className="flex-1 truncate">{children}</span>
      {shortcut ? <span className="font-mono text-[10px] text-ink-400">{shortcut}</span> : null}
    </DropdownPrimitive.Item>
  )
}

export function MenuLabel({ children }: { children: React.ReactNode }) {
  return (
    <DropdownPrimitive.Label className="px-2 py-1 text-2xs font-semibold uppercase tracking-wider text-ink-400">
      {children}
    </DropdownPrimitive.Label>
  )
}

export function MenuSeparator() {
  return <DropdownPrimitive.Separator className="my-1 h-px bg-paper-200" />
}

// ---------------------------------------------------------------- popover

export const Popover = PopoverPrimitive.Root
export const PopoverTrigger = PopoverPrimitive.Trigger

export function PopoverContent({
  children,
  align = 'end',
  className,
  width,
}: {
  children: React.ReactNode
  align?: 'start' | 'center' | 'end'
  className?: string
  width?: string
}) {
  return (
    <PopoverPrimitive.Portal>
      <PopoverPrimitive.Content
        align={align}
        sideOffset={6}
        className={cn(
          'z-50 overflow-hidden rounded-md border border-paper-300 bg-white shadow-pop data-[state=open]:animate-fade-up',
          width ?? 'w-72',
          className,
        )}
      >
        {children}
      </PopoverPrimitive.Content>
    </PopoverPrimitive.Portal>
  )
}

// ---------------------------------------------------------------- tooltip

export function TooltipProvider({ children }: { children: React.ReactNode }) {
  return (
    <TooltipPrimitive.Provider delayDuration={320} skipDelayDuration={200}>
      {children}
    </TooltipPrimitive.Provider>
  )
}

export function Tooltip({
  content,
  children,
  side = 'top',
}: {
  content: React.ReactNode
  children: React.ReactNode
  side?: 'top' | 'right' | 'bottom' | 'left'
}) {
  if (!content) return <>{children}</>
  return (
    <TooltipPrimitive.Root>
      <TooltipPrimitive.Trigger asChild>{children}</TooltipPrimitive.Trigger>
      <TooltipPrimitive.Portal>
        <TooltipPrimitive.Content
          side={side}
          sideOffset={6}
          className="z-50 max-w-xs rounded border border-ink-800 bg-ink-900 px-2 py-1 text-xs leading-relaxed text-paper-100 shadow-pop data-[state=delayed-open]:animate-fade-up"
        >
          {content}
          <TooltipPrimitive.Arrow className="fill-ink-900" />
        </TooltipPrimitive.Content>
      </TooltipPrimitive.Portal>
    </TooltipPrimitive.Root>
  )
}

// ------------------------------------------------------------------ tabs

export const Tabs = TabsPrimitive.Root

export function TabList({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <TabsPrimitive.List
      className={cn('scroll-slim flex gap-0.5 overflow-x-auto border-b border-paper-300', className)}
    >
      {children}
    </TabsPrimitive.List>
  )
}

export function Tab({ value, children }: { value: string; children: React.ReactNode }) {
  return (
    <TabsPrimitive.Trigger
      value={value}
      className={cn(
        'relative -mb-px flex shrink-0 items-center whitespace-nowrap border-b-2 border-transparent px-3 py-2 text-sm font-medium text-ink-500 transition-colors',
        'hover:text-ink-800 data-[state=active]:border-accent-600 data-[state=active]:text-ink-900',
      )}
    >
      {children}
    </TabsPrimitive.Trigger>
  )
}

export function TabPanel({ value, children, className }: { value: string; children: React.ReactNode; className?: string }) {
  return (
    <TabsPrimitive.Content value={value} className={cn('outline-none', className)} tabIndex={-1}>
      <motion.div
        initial={{ opacity: 0, y: 4 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.2, ease: [0.22, 1, 0.36, 1] }}
      >
        {children}
      </motion.div>
    </TabsPrimitive.Content>
  )
}

// --------------------------------------------------------- action helpers

export function DialogFooterActions({
  onCancel,
  confirmLabel,
  confirmTone = 'primary',
  loading,
  disabled,
  extra,
}: {
  onCancel: () => void
  confirmLabel: string
  confirmTone?: ButtonProps['variant']
  loading?: boolean
  disabled?: boolean
  extra?: React.ReactNode
}) {
  return (
    <>
      {extra}
      <Button variant="ghost" size="sm" type="button" onClick={onCancel}>
        Cancel
      </Button>
      <Button variant={confirmTone} size="sm" type="submit" loading={loading} disabled={disabled}>
        {confirmLabel}
      </Button>
    </>
  )
}
