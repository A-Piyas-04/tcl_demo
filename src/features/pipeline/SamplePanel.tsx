/**
 * Sample rounds on one engagement (UC-07, AC-07, UF-02).
 *
 * The cycle is request, dispatch, client receipt, outcome, and each step moves
 * the engagement stage through the API rather than from here. Every round is
 * kept with its own dates and outcome, so a second round never overwrites the
 * first one.
 *
 * After a failed round there are exactly two sensible moves, and the screen
 * says so: raise another round, which takes Under evaluation back to Sample
 * requested, or reject the engagement. On hold is for pausing the whole
 * engagement and is deliberately not offered here.
 */

import * as React from 'react'
import { AlertTriangle, FlaskConical, Plus, Truck } from 'lucide-react'
import { useDb } from '@/data/store'
import {
  SAMPLE_OUTCOME_LABEL,
  SAMPLE_PURPOSE_LABEL,
  COURIERS,
  UOMS,
  reasonName,
  reasonsFor,
  stageConfig,
} from '@/data/reference'
import {
  createSampleRound,
  recordSampleDispatch,
  recordSampleOutcome,
  recordSampleReceipt,
} from '@/data/api'
import { runAction } from '@/lib/hooks'
import { addMonthsIso, fmtDate, fmtQty, todayIso } from '@/lib/utils'
import { daysSince } from '@/data/selectors'
import type { Engagement, EngagementStage, SamplePurpose, SampleRound } from '@/data/types'
import {
  Badge,
  Button,
  DateInput,
  Dialog,
  EmptyState,
  Field,
  FieldGrid,
  FormGrid,
  FormRow,
  InlineError,
  InlineWarning,
  Input,
  NumberInput,
  Panel,
  PanelHeader,
  RadioCards,
  Select,
  Textarea,
  Tooltip,
  WriteButton,
  WriteOnly,
} from '@/components/ui'

type Step = 'request' | 'dispatch' | 'receipt' | 'outcome'

/** Stages from which the rules let a (further) sample round start. */
const CAN_REQUEST_FROM: EngagementStage[] = ['IDENTIFIED', 'OFFERED', 'SAMPLE_REQUESTED', 'UNDER_EVALUATION']

export function canRequestSample(stage: EngagementStage) {
  return CAN_REQUEST_FROM.includes(stage)
}

/** One step of the sample cycle as a dialog, so it can be opened from outside the panel. */
export function SampleStepDialog({
  engagement,
  step,
  onClose,
}: {
  engagement: Engagement
  step: { kind: Step; roundId?: string } | null
  onClose: () => void
}) {
  const db = useDb()
  if (!step) return null
  const rounds = db.samples.filter((s) => s.engagementId === engagement.id)
  const round = step.roundId ? rounds.find((r) => r.id === step.roundId) : undefined
  if (step.kind === 'request') {
    return <RequestDialog engagement={engagement} nextRound={rounds.length + 1} onClose={onClose} />
  }
  if (!round) return null
  if (step.kind === 'dispatch') return <DispatchDialog round={round} onClose={onClose} />
  if (step.kind === 'receipt') return <ReceiptDialog round={round} onClose={onClose} />
  return <OutcomeDialog round={round} onClose={onClose} />
}

export function SamplePanel({
  engagement,
  onRequestStage,
}: {
  engagement: Engagement
  /** asks the parent to open the stage dialog, e.g. to reject after a failure */
  onRequestStage: (to: EngagementStage) => void
}) {
  const db = useDb()
  const [step, setStep] = React.useState<{ kind: Step; round?: SampleRound } | null>(null)

  const rounds = db.samples
    .filter((s) => s.engagementId === engagement.id)
    .sort((a, b) => b.roundNo - a.roundNo)

  const latest = rounds[0]
  const lastFailed = latest?.outcome === 'FAIL' ? latest : undefined
  const lastPassed = latest?.outcome === 'PASS' && engagement.stage === 'UNDER_EVALUATION' ? latest : undefined
  const closed = engagement.stage === 'REJECTED' || engagement.stage === 'DISCONTINUED'
  const canRequest = canRequestSample(engagement.stage)

  return (
    <Panel>
      <PanelHeader
        title="Sample rounds"
        subtitle="Request, dispatch, client receipt, result. Each step moves the stage for you."
        icon={<FlaskConical className="h-4 w-4" />}
        actions={
          <>
            <Badge tone="neutral">{rounds.length}</Badge>
            {canRequest && rounds.length > 0 ? (
              <WriteButton
                variant="secondary"
                size="sm"
                icon={<Plus className="h-3.5 w-3.5" />}
                onClick={() => setStep({ kind: 'request' })}
              >
                Request a sample
              </WriteButton>
            ) : null}
          </>
        }
      />

      {closed ? (
        <div className="p-3">
          <InlineWarning>
            <span>
              This engagement is closed, so no outcome can be recorded against it. Reopen it from the stage control
              first, which is an audited action.
            </span>
          </InlineWarning>
        </div>
      ) : null}

      {rounds.length === 0 ? (
        <div className="p-4">
          <EmptyState
            icon={<FlaskConical className="h-5 w-5" />}
            title="No sample has been requested"
            description={
              engagement.stage === 'IDENTIFIED'
                ? 'A sample normally follows an offer. Requesting one from Identified is possible, but it is recorded as an override with a reason.'
                : 'Record what the client asked for: quantity, unit and purpose. The stage moves to Sample requested.'
            }
            compact
            action={
              canRequest ? (
                <WriteButton variant="primary" size="sm" onClick={() => setStep({ kind: 'request' })}>
                  Request a sample
                </WriteButton>
              ) : undefined
            }
          />
        </div>
      ) : (
        <ul className="divide-y divide-paper-200">
          {rounds.map((round) => (
            <RoundRow key={round.id} round={round} onStep={(kind) => setStep({ kind, round })} disabled={closed} />
          ))}
        </ul>
      )}

      {lastPassed ? (
        <WriteOnly>
          <div className="flex flex-wrap items-center gap-2 border-t border-paper-200 bg-ok-50/60 p-3">
            <p className="min-w-0 flex-1 text-sm text-ok-600">
              <span className="font-semibold">Round {lastPassed.roundNo} passed.</span> Record the client&apos;s approval to
              open ordering.
            </p>
            <Button variant="primary" size="sm" onClick={() => onRequestStage('APPROVED')}>
              Record approval
            </Button>
          </div>
        </WriteOnly>
      ) : null}

      {lastFailed && !closed && engagement.stage === 'UNDER_EVALUATION' ? (
        <WriteOnly>
          <div className="space-y-2 border-t border-paper-200 bg-warn-50/60 p-3">
            <p className="flex items-center gap-1.5 text-sm font-semibold text-warn-600">
              <AlertTriangle className="h-4 w-4" />
              Round {lastFailed.roundNo} failed. There are two ways forward
            </p>
            <p className="text-xs leading-relaxed text-ink-600">
              {reasonName(lastFailed.rejectionReasonCode) ?? 'No reason recorded'}
              {lastFailed.outcomeNotes ? `. ${lastFailed.outcomeNotes}` : '.'}
            </p>
            <div className="flex flex-wrap gap-2">
              <Button variant="secondary" size="sm" onClick={() => setStep({ kind: 'request' })}>
                Raise another round
              </Button>
              <Button variant="danger" size="sm" onClick={() => onRequestStage('REJECTED')}>
                Reject the engagement
              </Button>
            </div>
            <p className="text-2xs leading-relaxed text-ink-500">
              Another round takes the engagement from Under evaluation back to Sample requested. On hold is a different
              thing: it pauses the whole engagement and is not how a second round is raised.
            </p>
          </div>
        </WriteOnly>
      ) : null}

      {step?.kind === 'request' ? (
        <RequestDialog engagement={engagement} nextRound={rounds.length + 1} onClose={() => setStep(null)} />
      ) : null}
      {step?.kind === 'dispatch' && step.round ? (
        <DispatchDialog round={step.round} onClose={() => setStep(null)} />
      ) : null}
      {step?.kind === 'receipt' && step.round ? (
        <ReceiptDialog round={step.round} onClose={() => setStep(null)} />
      ) : null}
      {step?.kind === 'outcome' && step.round ? (
        <OutcomeDialog round={step.round} onClose={() => setStep(null)} />
      ) : null}
    </Panel>
  )
}

function RoundRow({
  round,
  onStep,
  disabled,
}: {
  round: SampleRound
  onStep: (step: Step) => void
  disabled: boolean
}) {
  const threshold = stageConfig('UNDER_EVALUATION').ageingThresholdDays
  const waiting = round.dispatchedOn && round.outcome === 'PENDING' ? daysSince(round.dispatchedOn) : null
  const overdue = waiting != null && waiting > threshold

  return (
    <li className="space-y-2 px-3 py-3">
      <div className="flex flex-wrap items-center gap-2">
        <span className="grid h-5 w-5 shrink-0 place-items-center rounded bg-paper-200 text-[10px] font-semibold text-ink-700">
          {round.roundNo}
        </span>
        <span className="text-sm font-semibold text-ink-900">{SAMPLE_PURPOSE_LABEL[round.purpose]}</span>
        <span className="text-xs tabular text-ink-600">{fmtQty(round.requestedQty, round.qtyUom)}</span>
        <Badge
          tone={
            round.outcome === 'PASS'
              ? 'ok'
              : round.outcome === 'FAIL'
                ? 'danger'
                : round.outcome === 'CANCELLED'
                  ? 'neutral'
                  : 'warn'
          }
        >
          {SAMPLE_OUTCOME_LABEL[round.outcome]}
        </Badge>
        {overdue ? (
          <Tooltip content={`Dispatched ${waiting} days ago with no outcome, beyond the ${threshold}-day threshold.`}>
            <Badge tone="warn">Overdue {waiting}d</Badge>
          </Tooltip>
        ) : null}
      </div>

      <FieldGrid cols={4}>
        <Field label="Requested">{fmtDate(round.requestedOn)}</Field>
        <Field label="Dispatched">{fmtDate(round.dispatchedOn)}</Field>
        <Field label="Client received">{fmtDate(round.receivedOn)}</Field>
        <Field label="Outcome dated">{fmtDate(round.outcomeOn)}</Field>
        <Field label="Courier">{round.courierName ?? '—'}</Field>
        <Field label="Tracking" mono>
          {round.trackingNumber ?? '—'}
        </Field>
        <Field label="Batch" mono>
          {round.batchNumber ?? '—'}
        </Field>
        <Field label="Expected receipt">{fmtDate(round.expectedReceiptOn)}</Field>
      </FieldGrid>

      {round.outcome === 'FAIL' ? (
        <p className="rounded border border-danger-200 bg-danger-50 px-2 py-1.5 text-xs leading-relaxed text-danger-700">
          <span className="font-medium">Rejected: </span>
          {reasonName(round.rejectionReasonCode) ?? 'reason not recorded'}
          {round.outcomeNotes ? ` — ${round.outcomeNotes}` : ''}
        </p>
      ) : round.outcomeNotes ? (
        <p className="text-xs italic leading-relaxed text-ink-500">“{round.outcomeNotes}”</p>
      ) : null}

      <WriteOnly>
        <div className="flex flex-wrap gap-1.5">
          {!round.dispatchedOn ? (
            <Button
              variant="secondary"
              size="sm"
              icon={<Truck className="h-3.5 w-3.5" />}
              disabled={disabled}
              onClick={() => onStep('dispatch')}
            >
              Record dispatch
            </Button>
          ) : null}
          {round.dispatchedOn && !round.receivedOn ? (
            <Button variant="secondary" size="sm" disabled={disabled} onClick={() => onStep('receipt')}>
              Record client receipt
            </Button>
          ) : null}
          {round.outcome === 'PENDING' && round.receivedOn ? (
            <Button variant="secondary" size="sm" disabled={disabled} onClick={() => onStep('outcome')}>
              Record outcome
            </Button>
          ) : null}
        </div>
      </WriteOnly>
    </li>
  )
}

function RequestDialog({
  engagement,
  nextRound,
  onClose,
}: {
  engagement: Engagement
  nextRound: number
  onClose: () => void
}) {
  const db = useDb()
  const contacts = db.contacts.filter((c) => c.companyId === engagement.clientCompanyId && c.isActive)
  const needsOverride = engagement.stage === 'IDENTIFIED'

  const [purpose, setPurpose] = React.useState<SamplePurpose>('EVALUATION')
  const [requestedQty, setRequestedQty] = React.useState<number | null>(100)
  const [qtyUom, setQtyUom] = React.useState('G')
  const [requestedOn, setRequestedOn] = React.useState(todayIso())
  const [expectedReceiptOn, setExpectedReceiptOn] = React.useState(addMonthsIso(todayIso(), 1))
  const [requestingContactId, setRequestingContactId] = React.useState('')
  const [overrideNote, setOverrideNote] = React.useState('')
  const [saving, setSaving] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)

  const submit = async () => {
    setError(null)
    if (requestedQty == null || requestedQty <= 0) {
      setError('Enter the quantity the client asked for.')
      return
    }
    if (needsOverride && !overrideNote.trim()) {
      setError('An override needs a note explaining why the sample comes before the offer.')
      return
    }
    setSaving(true)
    const result = await runAction(
      () =>
        createSampleRound(
          {
            engagementId: engagement.id,
            purpose,
            requestedOn,
            requestedQty,
            qtyUom,
            expectedReceiptOn: expectedReceiptOn || null,
            requestingContactId: requestingContactId || null,
          },
          needsOverride ? { override: true, overrideNote: overrideNote.trim() } : {},
        ),
      {
        success:
          nextRound > 1
            ? `Round ${nextRound} raised. The engagement is back at Sample requested.`
            : 'Sample requested. The engagement moved to Sample requested.',
        onError: setError,
      },
    )
    setSaving(false)
    if (result) onClose()
  }

  return (
    <Dialog
      open
      onOpenChange={(v) => {
        if (!v) onClose()
      }}
      width="lg"
      title={nextRound > 1 ? `Raise sample round ${nextRound}` : 'Request a sample'}
      description="What the client asked for, and who asked. The stage moves to Sample requested once it is saved."
      footer={
        <>
          <Button variant="ghost" size="sm" onClick={onClose}>
            Cancel
          </Button>
          <Button variant="primary" size="sm" loading={saving} onClick={() => void submit()}>
            {nextRound > 1 ? `Raise round ${nextRound}` : 'Request sample'}
          </Button>
        </>
      }
    >
      <div className="space-y-3.5">
        {needsOverride ? (
          <InlineWarning>
            <span>
              This engagement is at Identified, so no offer has been made. A sample before an offer is out of order: it
              is allowed, recorded as an override against your name, and needs a note.
            </span>
          </InlineWarning>
        ) : null}

        <FormRow label="Purpose" required>
          <RadioCards
            value={purpose}
            onChange={setPurpose}
            columns={2}
            options={(Object.keys(SAMPLE_PURPOSE_LABEL) as SamplePurpose[]).map((p) => ({
              value: p,
              label: SAMPLE_PURPOSE_LABEL[p],
              description:
                p === 'EVALUATION'
                  ? "The client's own laboratory check."
                  : p === 'REGISTRATION'
                    ? 'Material needed for a dossier or filing.'
                    : p === 'STABILITY'
                      ? 'Longer study on shelf life.'
                      : "A full trial batch on the client's line.",
            }))}
          />
        </FormRow>

        <FormGrid cols={3}>
          <FormRow label="Quantity" required>
            <NumberInput value={requestedQty} onChange={setRequestedQty} min={0} />
          </FormRow>
          <FormRow label="Unit">
            <Select value={qtyUom} onChange={setQtyUom} options={UOMS.map((u) => ({ value: u, label: u }))} />
          </FormRow>
          <FormRow label="Requested on" required>
            <DateInput value={requestedOn} max={todayIso()} onChange={(e) => setRequestedOn(e.target.value)} />
          </FormRow>
        </FormGrid>

        <FormGrid>
          <FormRow label="Expected at the client by" hint="Used to flag a round that goes quiet.">
            <DateInput value={expectedReceiptOn} onChange={(e) => setExpectedReceiptOn(e.target.value)} />
          </FormRow>
          <FormRow label="Requesting contact">
            <Select
              value={requestingContactId}
              onChange={setRequestingContactId}
              allowEmpty
              emptyLabel="Not recorded"
              placeholder="Not recorded"
              disabled={contacts.length === 0}
              options={contacts.map((c) => ({
                value: c.id,
                label: c.fullName,
                description: c.designation ?? undefined,
              }))}
            />
          </FormRow>
        </FormGrid>

        {needsOverride ? (
          <FormRow label="Why the sample comes first" required>
            <Textarea
              value={overrideNote}
              onChange={(e) => setOverrideNote(e.target.value)}
              rows={3}
              placeholder="The client will not price the project before testing material."
            />
          </FormRow>
        ) : null}

        {error ? <InlineError>{error}</InlineError> : null}
      </div>
    </Dialog>
  )
}

function DispatchDialog({ round, onClose }: { round: SampleRound; onClose: () => void }) {
  const db = useDb()
  const [dispatchedOn, setDispatchedOn] = React.useState(todayIso())
  const [courierName, setCourierName] = React.useState(COURIERS[0]!)
  const [trackingNumber, setTrackingNumber] = React.useState('')
  const [batchNumber, setBatchNumber] = React.useState('')
  const [expectedReceiptOn, setExpectedReceiptOn] = React.useState(round.expectedReceiptOn ?? '')
  const [saving, setSaving] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)

  const duplicateTracking =
    trackingNumber.trim().length > 3 &&
    db.samples.some((s) => s.id !== round.id && s.trackingNumber === trackingNumber.trim())

  const submit = async () => {
    setError(null)
    if (dispatchedOn < round.requestedOn) {
      setError(`The dispatch date cannot be before the sample was requested on ${fmtDate(round.requestedOn)}.`)
      return
    }
    setSaving(true)
    const result = await runAction(
      () =>
        recordSampleDispatch(round.id, {
          dispatchedOn,
          courierName: courierName || null,
          trackingNumber: trackingNumber.trim() || null,
          batchNumber: batchNumber.trim() || null,
          expectedReceiptOn: expectedReceiptOn || null,
        }),
      { success: 'Dispatch recorded. The engagement moved to Sample sent.', onError: setError },
    )
    setSaving(false)
    if (result !== null) onClose()
  }

  return (
    <Dialog
      open
      onOpenChange={(v) => {
        if (!v) onClose()
      }}
      width="lg"
      title={`Record dispatch of round ${round.roundNo}`}
      description="The courier details and the batch the sample came from. The stage moves to Sample sent."
      footer={
        <>
          <Button variant="ghost" size="sm" onClick={onClose}>
            Cancel
          </Button>
          <Button variant="primary" size="sm" loading={saving} onClick={() => void submit()}>
            Record dispatch
          </Button>
        </>
      }
    >
      <div className="space-y-3.5">
        <FormGrid cols={3}>
          <FormRow label="Dispatched on" required>
            <DateInput
              value={dispatchedOn}
              min={round.requestedOn}
              max={todayIso()}
              onChange={(e) => setDispatchedOn(e.target.value)}
              invalid={dispatchedOn < round.requestedOn}
            />
          </FormRow>
          <FormRow label="Courier">
            <Select
              value={courierName}
              onChange={setCourierName}
              options={COURIERS.map((c) => ({ value: c, label: c }))}
            />
          </FormRow>
          <FormRow label="Tracking number">
            <Input
              value={trackingNumber}
              onChange={(e) => setTrackingNumber(e.target.value)}
              mono
              placeholder="1234567890"
            />
          </FormRow>
        </FormGrid>

        {duplicateTracking ? (
          <InlineWarning>
            <span>
              That tracking number is already recorded against another dispatch. Check it before saving, since the same
              number on two rounds is usually a mis-entry.
            </span>
          </InlineWarning>
        ) : null}

        <FormGrid>
          <FormRow label="Batch number" hint="The batch the sample was drawn from, as on the COA.">
            <Input value={batchNumber} onChange={(e) => setBatchNumber(e.target.value)} mono placeholder="BN-2026-11" />
          </FormRow>
          <FormRow label="Expected at the client by">
            <DateInput value={expectedReceiptOn} onChange={(e) => setExpectedReceiptOn(e.target.value)} />
          </FormRow>
        </FormGrid>

        {error ? <InlineError>{error}</InlineError> : null}
      </div>
    </Dialog>
  )
}

function ReceiptDialog({ round, onClose }: { round: SampleRound; onClose: () => void }) {
  const [receivedOn, setReceivedOn] = React.useState(todayIso())
  const [saving, setSaving] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)

  const tooEarly = Boolean(round.dispatchedOn && receivedOn < round.dispatchedOn)

  const submit = async () => {
    setError(null)
    if (tooEarly) {
      setError(
        `The client cannot have received the sample before it was dispatched on ${fmtDate(round.dispatchedOn)}.`,
      )
      return
    }
    setSaving(true)
    const result = await runAction(() => recordSampleReceipt(round.id, receivedOn), {
      success: 'Receipt recorded. The engagement moved to Under evaluation.',
      onError: setError,
    })
    setSaving(false)
    if (result !== null) onClose()
  }

  return (
    <Dialog
      open
      onOpenChange={(v) => {
        if (!v) onClose()
      }}
      width="sm"
      title={`Record client receipt of round ${round.roundNo}`}
      description={`Dispatched on ${fmtDate(round.dispatchedOn)}. The stage moves to Under evaluation.`}
      footer={
        <>
          <Button variant="ghost" size="sm" onClick={onClose}>
            Cancel
          </Button>
          <Button variant="primary" size="sm" loading={saving} onClick={() => void submit()}>
            Record receipt
          </Button>
        </>
      }
    >
      <div className="space-y-3.5">
        <FormRow
          label="Received on"
          required
          error={tooEarly ? 'A receipt cannot pre-date the dispatch.' : undefined}
        >
          <DateInput
            value={receivedOn}
            min={round.dispatchedOn ?? undefined}
            max={todayIso()}
            onChange={(e) => setReceivedOn(e.target.value)}
            invalid={tooEarly}
          />
        </FormRow>
        {error ? <InlineError>{error}</InlineError> : null}
      </div>
    </Dialog>
  )
}

function OutcomeDialog({ round, onClose }: { round: SampleRound; onClose: () => void }) {
  const [outcome, setOutcome] = React.useState<'PASS' | 'FAIL'>('PASS')
  const [outcomeOn, setOutcomeOn] = React.useState(todayIso())
  const [reasonCode, setReasonCode] = React.useState('')
  const [notes, setNotes] = React.useState('')
  const [saving, setSaving] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)

  const submit = async () => {
    setError(null)
    if (outcome === 'FAIL' && !reasonCode) {
      setError('A failed sample needs a reason from the list, so the failure analysis report can count it.')
      return
    }
    if (round.receivedOn && outcomeOn < round.receivedOn) {
      setError(`The outcome cannot be dated before the client received the sample on ${fmtDate(round.receivedOn)}.`)
      return
    }
    setSaving(true)
    const result = await runAction(
      () => recordSampleOutcome(round.id, outcome, { outcomeOn, reasonCode: reasonCode || null, notes: notes.trim() || null }),
      {
        success:
            outcome === 'PASS'
              ? 'Pass recorded. Record the approval when the client confirms it.'
            : 'Fail recorded. Choose whether to raise another round or reject the engagement.',
        onError: setError,
      },
    )
    setSaving(false)
    if (result !== null) onClose()
  }

  return (
    <Dialog
      open
      onOpenChange={(v) => {
        if (!v) onClose()
      }}
      width="lg"
      title={`Record the outcome of round ${round.roundNo}`}
      description="Recording an outcome does not move the stage on its own. A pass is followed by the approval, which carries the client's own date and reference."
      footer={
        <>
          <Button variant="ghost" size="sm" onClick={onClose}>
            Cancel
          </Button>
          <Button
            variant={outcome === 'FAIL' ? 'danger' : 'primary'}
            size="sm"
            loading={saving}
            onClick={() => void submit()}
          >
            Record outcome
          </Button>
        </>
      }
    >
      <div className="space-y-3.5">
        <FormRow label="Outcome" required>
          <RadioCards
            value={outcome}
            onChange={setOutcome}
            columns={2}
            options={[
              { value: 'PASS', label: 'Pass', description: 'The material met the client specification.' },
              { value: 'FAIL', label: 'Fail', description: 'It did not. A reason is required.' },
            ]}
          />
        </FormRow>

        <FormGrid>
          <FormRow label="Outcome date" required hint="The date on the client's evaluation report.">
            <DateInput
              value={outcomeOn}
              min={round.receivedOn ?? undefined}
              max={todayIso()}
              onChange={(e) => setOutcomeOn(e.target.value)}
            />
          </FormRow>
          {outcome === 'FAIL' ? (
            <FormRow label="Rejection reason" required>
              <Select
                value={reasonCode}
                onChange={setReasonCode}
                placeholder="Choose a reason"
                options={reasonsFor('SAMPLE').map((r) => ({ value: r.code, label: r.name }))}
              />
            </FormRow>
          ) : null}
        </FormGrid>

        <FormRow label="Notes" hint="The client's own wording, where it helps the next conversation.">
          <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={3} />
        </FormRow>

        {error ? <InlineError>{error}</InlineError> : null}
      </div>
    </Dialog>
  )
}
