/**
 * The four things that happen to a commission, in the order they happen:
 * terms are agreed, the client is invoiced, money comes in, or it is written
 * off. One implementation, used by the commission tracker and the indent, so
 * the same record can never be moved by two different sets of rules.
 */

import * as React from 'react'
import { Ban, Handshake, MoreHorizontal, Receipt, Wallet } from 'lucide-react'
import { useDb } from '@/data/store'
import { companyName, indentValue } from '@/data/selectors'
import { COMMISSION_BASIS_LABEL } from '@/data/reference'
import { updateCommission } from '@/data/api'
import { runAction } from '@/lib/hooks'
import { fmtMoney, todayIso } from '@/lib/utils'
import type { Commission, CommissionBasis } from '@/data/types'
import {
  Button,
  DateInput,
  Dialog,
  DialogFooterActions,
  FormGrid,
  FormRow,
  InlineError,
  InlineWarning,
  Input,
  Menu,
  MenuContent,
  MenuItem,
  MenuTrigger,
  NumberInput,
  Select,
  Textarea,
  WriteOnly,
} from '@/components/ui'

export type CommissionActionKind = 'terms' | 'invoice' | 'receipt' | 'writeoff'

/** Which actions make sense from where the record stands. */
export function commissionActionsFor(c: Commission): Record<CommissionActionKind, boolean> {
  const open = c.status !== 'RECEIVED' && c.status !== 'WRITTEN_OFF'
  return {
    terms: c.status === 'PENDING',
    invoice: c.status === 'PENDING' && c.amount != null,
    receipt: (c.status === 'INVOICED' || c.status === 'PARTIALLY_RECEIVED') && c.amount != null,
    writeoff: open && c.amount != null,
  }
}

const ACTION_LABEL: Record<CommissionActionKind, string> = {
  terms: 'Agree the terms',
  invoice: 'Mark invoiced',
  receipt: 'Record a receipt',
  writeoff: 'Write off',
}

const ACTION_ICON: Record<CommissionActionKind, React.ReactNode> = {
  terms: <Handshake className="h-3.5 w-3.5" />,
  invoice: <Receipt className="h-3.5 w-3.5" />,
  receipt: <Wallet className="h-3.5 w-3.5" />,
  writeoff: <Ban className="h-3.5 w-3.5" />,
}

/** A row menu for tables. */
export function CommissionActionsMenu({ commission }: { commission: Commission }) {
  const [kind, setKind] = React.useState<CommissionActionKind | null>(null)
  const allowed = commissionActionsFor(commission)
  const kinds = (Object.keys(allowed) as CommissionActionKind[]).filter((k) => allowed[k])
  if (kinds.length === 0) return null
  return (
    <WriteOnly>
      <Menu>
        <MenuTrigger asChild>
          <Button variant="ghost" size="icon" aria-label="Commission actions" onClick={(e) => e.stopPropagation()}>
            <MoreHorizontal className="h-4 w-4" />
          </Button>
        </MenuTrigger>
        <MenuContent>
          {/* portalled but still a React child of the row, so stop the row opening */}
          <div onClick={(e) => e.stopPropagation()}>
            {kinds.map((k) => (
              <MenuItem key={k} icon={ACTION_ICON[k]} danger={k === 'writeoff'} onSelect={() => setKind(k)}>
                {ACTION_LABEL[k]}
              </MenuItem>
            ))}
          </div>
        </MenuContent>
      </Menu>
      <CommissionActionDialog commission={commission} kind={kind} onClose={() => setKind(null)} />
    </WriteOnly>
  )
}

/** The same actions as buttons, for a detail panel. The first allowed one is primary. */
export function CommissionActionButtons({ commission }: { commission: Commission }) {
  const [kind, setKind] = React.useState<CommissionActionKind | null>(null)
  const allowed = commissionActionsFor(commission)
  const kinds = (Object.keys(allowed) as CommissionActionKind[]).filter((k) => allowed[k])
  if (kinds.length === 0) return null
  return (
    <WriteOnly>
      <div className="flex flex-wrap gap-1.5">
        {kinds.map((k, i) => (
          <Button
            key={k}
            size="sm"
            variant={i === 0 ? 'primary' : k === 'writeoff' ? 'ghost' : 'secondary'}
            icon={ACTION_ICON[k]}
            onClick={() => setKind(k)}
          >
            {ACTION_LABEL[k]}
          </Button>
        ))}
      </div>
      <CommissionActionDialog commission={commission} kind={kind} onClose={() => setKind(null)} />
    </WriteOnly>
  )
}

function CommissionActionDialog({
  commission,
  kind,
  onClose,
}: {
  commission: Commission
  kind: CommissionActionKind | null
  onClose: () => void
}) {
  const db = useDb()
  const indent = db.indents.find((i) => i.id === commission.indentId)
  const value = indent ? indentValue(db, indent.id) : 0
  const clientName = indent ? companyName(db, indent.clientCompanyId) : 'the client'
  const indentNumber = indent?.indentNumber ?? 'this indent'

  const [basis, setBasis] = React.useState<CommissionBasis>('PERCENT_OF_VALUE')
  const [ratePct, setRatePct] = React.useState<number | null>(null)
  const [fixed, setFixed] = React.useState<number | null>(null)
  const [reference, setReference] = React.useState('')
  const [date, setDate] = React.useState(todayIso())
  const [amount, setAmount] = React.useState<number | null>(null)
  const [remark, setRemark] = React.useState('')
  const [busy, setBusy] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)

  const due = commission.amount ?? 0
  const outstanding = Math.round((due - commission.receivedAmount) * 100) / 100
  const computed =
    basis === 'PERCENT_OF_VALUE' && ratePct != null ? Math.round(value * ratePct) / 100 : basis === 'FIXED_AMOUNT' ? fixed : null

  React.useEffect(() => {
    if (!kind) return
    setBasis(commission.basis === 'TBD' ? 'PERCENT_OF_VALUE' : commission.basis)
    setRatePct(commission.ratePct)
    setFixed(commission.basis === 'FIXED_AMOUNT' ? commission.amount : null)
    setReference(commission.invoiceReference ?? '')
    setDate(todayIso())
    setAmount(kind === 'receipt' ? Math.max(0, outstanding) : null)
    setRemark('')
    setError(null)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [kind])

  if (!kind) return null

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    let patch: Partial<Commission>
    if (kind === 'terms') {
      if (computed == null || computed <= 0) {
        setError(basis === 'PERCENT_OF_VALUE' ? 'Enter the agreed rate.' : 'Enter the agreed amount.')
        return
      }
      patch = {
        basis,
        ratePct: basis === 'PERCENT_OF_VALUE' ? ratePct : null,
        baseAmount: basis === 'PERCENT_OF_VALUE' ? value : null,
        amount: computed,
      }
    } else if (kind === 'invoice') {
      if (!reference.trim()) {
        setError('Enter the invoice reference.')
        return
      }
      patch = { status: 'INVOICED', invoiceReference: reference.trim(), invoicedOn: date }
    } else if (kind === 'receipt') {
      if (!amount || amount <= 0) {
        setError('Enter the amount received.')
        return
      }
      const received = Math.round((commission.receivedAmount + amount) * 100) / 100
      patch = { receivedAmount: received, receivedOn: date, status: received >= due ? 'RECEIVED' : 'PARTIALLY_RECEIVED' }
    } else {
      if (!remark.trim()) {
        setError('Say why it is being written off. The reason stays on the record.')
        return
      }
      patch = { status: 'WRITTEN_OFF', remarks: remark.trim(), invoicedOn: commission.invoicedOn ?? date }
    }

    setBusy(true)
    const ok = await runAction(() => updateCommission(commission.id, patch), {
      success:
        kind === 'terms'
          ? `Commission on ${indentNumber} agreed at ${fmtMoney(computed, commission.currency)}.`
          : kind === 'invoice'
            ? `Commission on ${indentNumber} marked invoiced.`
            : kind === 'receipt'
              ? `Receipt recorded against ${indentNumber}.`
              : `Commission on ${indentNumber} written off.`,
      onError: setError,
    })
    setBusy(false)
    if (ok !== null) onClose()
  }

  const copy = {
    terms: {
      title: 'Agree the commission terms',
      description: `What ${clientName} will pay TCL on ${indentNumber}. Once there is a figure, it can be invoiced.`,
      confirm: 'Save the terms',
    },
    invoice: {
      title: 'Mark the commission invoiced',
      description: `TCL invoices ${clientName} for its commission on ${indentNumber}.`,
      confirm: 'Mark invoiced',
    },
    receipt: {
      title: 'Record a receipt',
      description: `Full or partial. Receipts larger than the ${fmtMoney(due, commission.currency)} due are refused.`,
      confirm: 'Record the receipt',
    },
    writeoff: {
      title: 'Write off this commission',
      description: 'The record stays with its history and drops out of the earned and outstanding figures.',
      confirm: 'Write it off',
    },
  }[kind]

  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open) onClose()
      }}
      icon={ACTION_ICON[kind]}
      title={copy.title}
      description={copy.description}
    >
      <form onSubmit={submit} className="space-y-3.5">
        <div className="rounded-md border border-paper-300 bg-paper-50/60 px-3 py-2 text-xs text-ink-600">
          <span className="font-mono text-ink-800">{indentNumber}</span> · indent value{' '}
          {fmtMoney(value, commission.currency, { decimals: 0 })} · commission{' '}
          {commission.amount != null ? fmtMoney(commission.amount, commission.currency) : 'not agreed'} · received{' '}
          {fmtMoney(commission.receivedAmount, commission.currency)}
        </div>

        {kind === 'terms' ? (
          <FormGrid>
            <FormRow label="Basis" required>
              <Select
                value={basis}
                onChange={(v) => setBasis(v as CommissionBasis)}
                options={(['PERCENT_OF_VALUE', 'FIXED_AMOUNT'] as CommissionBasis[]).map((b) => ({
                  value: b,
                  label: COMMISSION_BASIS_LABEL[b],
                }))}
              />
            </FormRow>
            {basis === 'PERCENT_OF_VALUE' ? (
              <FormRow
                label="Rate (%)"
                required
                hint={computed != null ? `${fmtMoney(computed, commission.currency)} on the indent value` : undefined}
              >
                <NumberInput value={ratePct} onChange={setRatePct} min={0} step="any" />
              </FormRow>
            ) : (
              <FormRow label={`Amount (${commission.currency})`} required>
                <NumberInput value={fixed} onChange={setFixed} min={0} step="any" />
              </FormRow>
            )}
          </FormGrid>
        ) : null}

        {kind === 'invoice' ? (
          <FormGrid>
            <FormRow label="Invoice reference" required>
              <Input value={reference} onChange={(e) => setReference(e.target.value)} mono placeholder="TCL/COM/2026/004" />
            </FormRow>
            <FormRow label="Invoiced on" required>
              <DateInput value={date} max={todayIso()} onChange={(e) => setDate(e.target.value)} />
            </FormRow>
          </FormGrid>
        ) : null}

        {kind === 'receipt' ? (
          <>
            <FormGrid>
              <FormRow
                label={`Amount received (${commission.currency})`}
                required
                hint={`${fmtMoney(outstanding, commission.currency)} is outstanding.`}
              >
                <NumberInput value={amount} onChange={setAmount} min={0} step="any" invalid={Boolean(amount && amount > outstanding)} />
              </FormRow>
              <FormRow label="Received on" required>
                <DateInput value={date} max={todayIso()} onChange={(e) => setDate(e.target.value)} />
              </FormRow>
            </FormGrid>
            {amount && amount > outstanding ? (
              <InlineWarning>
                <span>
                  That is more than the {fmtMoney(outstanding, commission.currency)} outstanding. Receipts cannot exceed
                  the commission due, so the save will be refused.
                </span>
              </InlineWarning>
            ) : null}
          </>
        ) : null}

        {kind === 'writeoff' ? (
          <FormRow label="Why it is being written off" required hint="Kept on the record, and the change is audited.">
            <Textarea
              value={remark}
              onChange={(e) => setRemark(e.target.value)}
              rows={3}
              placeholder="Agreed with the client as a goodwill adjustment after the delayed shipment."
            />
          </FormRow>
        ) : null}

        {error ? <InlineError>{error}</InlineError> : null}

        <div className="flex items-center justify-end gap-2 pt-1">
          <DialogFooterActions
            onCancel={onClose}
            confirmLabel={copy.confirm}
            confirmTone={kind === 'writeoff' ? 'danger' : 'primary'}
            loading={busy}
          />
        </div>
      </form>
    </Dialog>
  )
}
