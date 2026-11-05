/**
 * The stage-change dialog, shared by the engagement board and the engagement
 * detail screen.
 *
 * Implements UF-07 (the stage machine) and UC-08: the rules decide what the
 * dialog has to collect before the move is allowed. A reason for rejecting,
 * holding or discontinuing; a note for an out-of-order step; a confirmation
 * for reopening a closed engagement; the client's approval date, reference and
 * conditions for an approval. The refusal text comes from `checkStageChange`,
 * so the screen and the rules can never drift apart.
 */

import * as React from 'react'
import { AlertTriangle, History, ShieldAlert } from 'lucide-react'
import { changeStage } from '@/data/api'
import { checkStageChange } from '@/data/rules'
import { STAGE_LABEL, reasonsFor } from '@/data/reference'
import { runAction } from '@/lib/hooks'
import { todayIso } from '@/lib/utils'
import type { Engagement, EngagementStage } from '@/data/types'
import {
  Button,
  DateInput,
  Dialog,
  FormGrid,
  FormRow,
  InlineError,
  InlineWarning,
  Input,
  Select,
  Textarea,
} from '@/components/ui'

export interface StageChangeDialogProps {
  /** the engagement being moved, or null when the dialog is closed */
  engagement: Engagement | null
  /** the target stage, or null when the dialog is closed */
  to: EngagementStage | null
  /** "Budesonide (Biocon) for Square", used in the dialog copy */
  recordName: string
  onClose: () => void
  onChanged?: (to: EngagementStage) => void
  /** shown above the fields, e.g. a dual-approval notice */
  notice?: React.ReactNode
  /** when set, a note becomes mandatory and this text says why */
  requireNoteBecause?: string | null
}

export function StageChangeDialog({
  engagement,
  to,
  recordName,
  onClose,
  onChanged,
  notice,
  requireNoteBecause,
}: StageChangeDialogProps) {
  const [reasonCode, setReasonCode] = React.useState('')
  const [note, setNote] = React.useState('')
  const [effectiveOn, setEffectiveOn] = React.useState(todayIso())
  const [approvalReference, setApprovalReference] = React.useState('')
  const [approvalConditions, setApprovalConditions] = React.useState('')
  const [saving, setSaving] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)

  const engagementId = engagement?.id ?? null

  // A fresh target gets fresh fields: a reason never carries over from an
  // earlier transition (UF-07).
  React.useEffect(() => {
    setReasonCode('')
    setNote('')
    setEffectiveOn(todayIso())
    setApprovalReference('')
    setApprovalConditions('')
    setError(null)
  }, [engagementId, to])

  const open = Boolean(engagement && to)
  const check = engagement && to ? checkStageChange(engagement, to) : null
  const isApproval = to === 'APPROVED'
  const noteRequired = Boolean(check?.requiresOverride) || Boolean(requireNoteBecause)

  const missing =
    check?.requiresReason && !reasonCode
      ? 'Choose a reason from the list.'
      : noteRequired && !note.trim()
        ? 'Write a note explaining this.'
        : isApproval && effectiveOn > todayIso()
          ? 'The approval date cannot be in the future.'
          : null

  const submit = async (e?: React.FormEvent) => {
    e?.preventDefault()
    if (!engagement || !to) return
    setError(null)
    if (missing) {
      setError(missing)
      return
    }
    setSaving(true)
    const result = await runAction(
      () =>
        changeStage(engagement.id, to, {
          reasonCode: reasonCode || null,
          note: note.trim() || null,
          effectiveOn: isApproval ? effectiveOn : null,
          override: check?.requiresOverride ? true : undefined,
          approvalReference: isApproval ? approvalReference.trim() || null : null,
          approvalConditions: isApproval ? approvalConditions.trim() || null : null,
        }),
      {
        success: `${recordName} moved to ${to ? STAGE_LABEL[to] : ''}.`,
        onError: setError,
      },
    )
    setSaving(false)
    if (result) {
      onChanged?.(to)
      onClose()
    }
  }

  if (!engagement || !to) return null

  const title = check?.requiresReopen
    ? `Reopen this engagement at ${STAGE_LABEL[to]}?`
    : check?.requiresOverride
      ? `${STAGE_LABEL[to]} out of order`
      : isApproval
        ? 'Record the client approval'
        : `Move to ${STAGE_LABEL[to]}`

  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        if (!v) onClose()
      }}
      width="md"
      icon={
        check?.requiresOverride ? (
          <ShieldAlert className="h-5 w-5 text-warn-600" />
        ) : check?.requiresReopen ? (
          <History className="h-5 w-5 text-accent-600" />
        ) : (
          <AlertTriangle className="h-5 w-5 text-accent-600" />
        )
      }
      title={title}
      description={
        <>
          {recordName}, currently at {STAGE_LABEL[engagement.stage]}. Every stage change is timestamped, attributed and
          written to the stage history.
        </>
      }
      footer={
        <>
          <Button variant="ghost" size="sm" onClick={onClose}>
            Cancel
          </Button>
          <Button
            variant={to === 'REJECTED' || to === 'DISCONTINUED' ? 'danger' : 'primary'}
            size="sm"
            loading={saving}
            onClick={() => void submit()}
          >
            {check?.requiresReopen ? 'Reopen engagement' : isApproval ? 'Record approval' : `Move to ${STAGE_LABEL[to]}`}
          </Button>
        </>
      }
    >
      <form onSubmit={submit} className="space-y-3.5">
        {notice}

        {check?.requiresOverride ? (
          <InlineWarning>
            <span>
              A sample normally follows an offer. Going straight from Identified to Sample requested is recorded as an
              override against your name, so write down why the client needs the sample first.
            </span>
          </InlineWarning>
        ) : null}

        {check?.requiresReopen ? (
          <InlineWarning>
            <span>
              This engagement is closed. Reopening it returns it to Identified, clears the approval date and is written
              to the audit log.
            </span>
          </InlineWarning>
        ) : null}

        {requireNoteBecause ? <InlineWarning>{requireNoteBecause}</InlineWarning> : null}

        {check?.requiresReason ? (
          <FormRow
            label="Reason"
            required
            hint="Chosen from the configured list so the rejection and hold reports can count it."
          >
            <Select
              value={reasonCode}
              onChange={setReasonCode}
              placeholder="Choose a reason"
              invalid={Boolean(error) && !reasonCode}
              options={reasonsFor('ENGAGEMENT').map((r) => ({ value: r.code, label: r.name }))}
            />
          </FormRow>
        ) : null}

        {isApproval ? (
          <>
            <FormGrid>
              <FormRow label="Client's approval date" required hint="The date on the client's letter, not today's date.">
                <DateInput
                  value={effectiveOn}
                  max={todayIso()}
                  onChange={(e) => setEffectiveOn(e.target.value)}
                  invalid={effectiveOn > todayIso()}
                />
              </FormRow>
              <FormRow label="Approval reference" hint="The client's own reference, e.g. QA/APP/2026/118.">
                <Input
                  value={approvalReference}
                  onChange={(e) => setApprovalReference(e.target.value)}
                  placeholder="QA/APP/2026/118"
                  mono
                />
              </FormRow>
            </FormGrid>
            <FormRow
              label="Conditions"
              hint="A conditional approval is still an approval, and the condition is shown as a warning on any order raised against this source."
            >
              <Textarea
                value={approvalConditions}
                onChange={(e) => setApprovalConditions(e.target.value)}
                rows={2}
                placeholder="Approved for two batches pending stability data"
              />
            </FormRow>
          </>
        ) : null}

        <FormRow
          label="Note"
          required={noteRequired}
          hint={noteRequired ? undefined : 'Optional. It appears on the stage history.'}
        >
          <Textarea
            value={note}
            onChange={(e) => setNote(e.target.value)}
            rows={3}
            invalid={noteRequired && Boolean(error) && !note.trim()}
            placeholder={
              check?.requiresOverride
                ? 'The client asked for material before pricing, confirmed by email on …'
                : 'Anything the next person reading the history should know.'
            }
          />
        </FormRow>

        {error ? <InlineError>{error}</InlineError> : null}

        {/* the footer's submit button lives outside the form element */}
        <button type="submit" className="hidden" aria-hidden tabIndex={-1} />
      </form>
    </Dialog>
  )
}
