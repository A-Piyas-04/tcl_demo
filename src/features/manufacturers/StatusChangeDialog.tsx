/**
 * Change a manufacturer's relationship status (FR-M2-02, FR-M2-08).
 *
 * Every move is kept as history, so the register can answer "when did this
 * supplier become commercial" years later. Blacklisting needs a recorded
 * reason: the api refuses it without one, and the refusal is shown inline.
 */

import * as React from 'react'
import { ShieldAlert } from 'lucide-react'
import { setManufacturerStatus } from '@/data/api'
import { MANUFACTURER_STATUS_LABEL } from '@/data/reference'
import { runAction } from '@/lib/hooks'
import type { Company, ManufacturerStatus } from '@/data/types'
import {
  Badge,
  Dialog,
  DialogFooterActions,
  FormRow,
  InlineError,
  InlineWarning,
  RadioCards,
  Textarea,
} from '@/components/ui'

const DESCRIPTION: Record<ManufacturerStatus, string> = {
  NEW: 'Recently registered, not yet evaluated.',
  UNDER_DEVELOPMENT: 'Being evaluated, or a client development is running on its products.',
  EXISTING_COMMERCIAL: 'Supplying commercially under agreed agency terms.',
  INACTIVE: 'Kept for history, but its products cannot be taken into the portfolio.',
  BLACKLISTED: 'Barred. Its products cannot be taken into the portfolio, and a new record under the same name is blocked.',
}

export function StatusChangeDialog({
  open,
  onOpenChange,
  company,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  company: Company
}) {
  const current = company.manufacturer?.status ?? 'NEW'
  const [status, setStatus] = React.useState<ManufacturerStatus>(current)
  const [remark, setRemark] = React.useState('')
  const [error, setError] = React.useState<string | null>(null)
  const [saving, setSaving] = React.useState(false)

  // Reopening the dialog starts from the status actually on the record.
  React.useEffect(() => {
    if (open) {
      setStatus(current)
      setRemark('')
      setError(null)
    }
  }, [open, current])

  const blacklisting = status === 'BLACKLISTED'
  const unchanged = status === current

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    if (unchanged) {
      setError(`This manufacturer is already ${MANUFACTURER_STATUS_LABEL[current].toLowerCase()}.`)
      return
    }
    setSaving(true)
    const result = await runAction(() => setManufacturerStatus(company.id, status, remark), {
      success: `${company.displayName} is now ${MANUFACTURER_STATUS_LABEL[status].toLowerCase()}.`,
      onError: setError,
    })
    setSaving(false)
    if (result !== null) onOpenChange(false)
  }

  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      width="md"
      icon={<ShieldAlert className="h-5 w-5 text-accent-600" />}
      title="Change relationship status"
      description={
        <>
          {company.displayName} is currently{' '}
          <span className="font-semibold text-ink-700">{MANUFACTURER_STATUS_LABEL[current]}</span>. The change is kept
          as history with the date, the user and the remark.
        </>
      }
    >
      <form onSubmit={submit} className="space-y-3.5">
        <FormRow label="New status" required>
          <RadioCards
            value={status}
            onChange={(v) => {
              setStatus(v)
              setError(null)
            }}
            columns={1}
            options={(Object.keys(MANUFACTURER_STATUS_LABEL) as ManufacturerStatus[]).map((s) => ({
              value: s,
              label: MANUFACTURER_STATUS_LABEL[s],
              description: s === current ? `${DESCRIPTION[s]} (current)` : DESCRIPTION[s],
            }))}
          />
        </FormRow>

        <FormRow
          label={blacklisting ? 'Reason for blacklisting' : 'Remark'}
          required={blacklisting}
          hint={
            blacklisting
              ? 'Recorded against the manufacturer and shown to anyone who tries to register the same name again.'
              : 'Optional, but it is what makes the history readable later.'
          }
        >
          <Textarea
            value={remark}
            onChange={(e) => setRemark(e.target.value)}
            rows={3}
            invalid={blacklisting && remark.trim().length === 0 && Boolean(error)}
            placeholder={
              blacklisting
                ? 'Repeated GMP failures at the Unit II plant, two client rejections in 2026.'
                : 'First commercial indent shipped, agency agreement signed.'
            }
          />
        </FormRow>

        {blacklisting ? (
          <InlineWarning>
            <span>
              Blacklisting takes effect at once. Products of a blacklisted manufacturer cannot be taken into the
              portfolio, so nothing new can be offered from this source. Sources already represented stay on the
              record, and existing indents and shipments are untouched.
            </span>
          </InlineWarning>
        ) : status === 'INACTIVE' ? (
          <InlineWarning>
            <span>
              An inactive manufacturer is kept for history. Its products cannot be taken into the portfolio until it
              is made active again.
            </span>
          </InlineWarning>
        ) : null}

        {company.manufacturer?.blacklistedOn && !blacklisting ? (
          <p className="text-xs text-ink-500">
            Previously blacklisted on {company.manufacturer.blacklistedOn}. <Badge tone="outline">History kept</Badge>
          </p>
        ) : null}

        {error ? <InlineError>{error}</InlineError> : null}

        <div className="flex items-center justify-end gap-2 pt-1">
          <DialogFooterActions
            onCancel={() => onOpenChange(false)}
            confirmLabel={blacklisting ? 'Blacklist' : 'Change status'}
            confirmTone={blacklisting ? 'danger' : 'primary'}
            loading={saving}
            disabled={unchanged}
          />
        </div>
      </form>
    </Dialog>
  )
}
