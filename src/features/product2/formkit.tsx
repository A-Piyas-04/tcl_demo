/**
 * Form scaffolding shared by every Product 2.0 dialog: one submit path that
 * blocks double submission, shows a refusal inline, and toasts on success.
 */

import * as React from 'react'
import { runAction } from '@/lib/hooks'
import { Dialog, DialogFooterActions, InlineError } from '@/components/ui'

export function useSubmit() {
  const [busy, setBusy] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)
  const inFlight = React.useRef(false)

  const submit = React.useCallback(
    async <T,>(action: () => Promise<T>, opts: { success: string | ((r: T) => string); onSuccess?: (r: T) => void }) => {
      if (inFlight.current) return null // a second click while saving does nothing
      inFlight.current = true
      setBusy(true)
      setError(null)
      const result = await runAction(action, {
        success: opts.success,
        onSuccess: opts.onSuccess,
        onError: (m) => setError(m),
      })
      inFlight.current = false
      setBusy(false)
      return result
    },
    [],
  )

  return { busy, error, setError, submit }
}

export function FormDialog({
  open,
  onOpenChange,
  title,
  description,
  icon,
  width = 'md',
  confirmLabel,
  confirmTone = 'primary',
  busy,
  error,
  onSubmit,
  children,
  disabled,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  title: React.ReactNode
  description?: React.ReactNode
  icon?: React.ReactNode
  width?: 'sm' | 'md' | 'lg' | 'xl'
  confirmLabel: string
  confirmTone?: 'primary' | 'danger'
  busy: boolean
  error: string | null
  onSubmit: () => void
  children: React.ReactNode
  disabled?: boolean
}) {
  return (
    <Dialog open={open} onOpenChange={(o) => !busy && onOpenChange(o)} title={title} description={description} icon={icon} width={width}>
      <form
        noValidate
        className="space-y-4"
        onSubmit={(e) => {
          e.preventDefault()
          onSubmit()
        }}
      >
        {children}
        <InlineError>{error}</InlineError>
        <div className="flex items-center justify-end gap-2 border-t border-paper-200 pt-3">
          <DialogFooterActions
            onCancel={() => onOpenChange(false)}
            confirmLabel={confirmLabel}
            confirmTone={confirmTone}
            loading={busy}
            disabled={disabled}
          />
        </div>
      </form>
    </Dialog>
  )
}
