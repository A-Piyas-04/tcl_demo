/**
 * Record an offer against a molecule, choosing which source was quoted.
 *
 * This is the record-only replacement for the old "pick sources and open an
 * engagement" flow: nothing is selected for a future action. An employee simply
 * writes down an offer that has already been made by phone or email, and the
 * engagement is found or created behind it. Every source for the molecule is
 * listed — represented or not, priced or not — because the record describes what
 * happened, not what the system judges offerable.
 */

import * as React from 'react'
import { useDb } from '@/data/store'
import { allSourcesFor, bestPrice } from '@/data/selectors'
import { recordOffer } from '@/data/api'
import { CURRENCIES, INCOTERMS, UOMS } from '@/data/reference'
import { runAction } from '@/lib/hooks'
import { addMonthsIso, fmtMoney, todayIso } from '@/lib/utils'
import type { ID } from '@/data/types'
import {
  Button,
  DateInput,
  Dialog,
  FormGrid,
  FormRow,
  InlineError,
  InlineWarning,
  NumberInput,
  Select,
  Textarea,
} from '@/components/ui'

export function RecordOfferDialog({
  open,
  onOpenChange,
  productId,
  clientCompanyId,
  requirementId,
  onRecorded,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  productId: ID
  clientCompanyId: ID
  requirementId?: ID | null
  onRecorded?: () => void
}) {
  const db = useDb()
  const sources = React.useMemo(() => allSourcesFor(db, productId), [db, productId])

  const [mpId, setMpId] = React.useState<string>('')
  const [offeredPrice, setOfferedPrice] = React.useState<number | null>(null)
  const [currency, setCurrency] = React.useState('USD')
  const [perUom, setPerUom] = React.useState('KG')
  const [incoterm, setIncoterm] = React.useState('CIF')
  const [moqQty, setMoqQty] = React.useState<number | null>(null)
  const [moqUom, setMoqUom] = React.useState('KG')
  const [offerDate, setOfferDate] = React.useState(todayIso())
  const [validUntil, setValidUntil] = React.useState(addMonthsIso(todayIso(), 1))
  const [remarks, setRemarks] = React.useState('')
  const [saving, setSaving] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)

  // Prefill the commercial fields from the chosen source's current price, if any.
  const applySource = React.useCallback(
    (id: string) => {
      setMpId(id)
      const row = sources.find((s) => s.mp.id === id)
      const price = id ? bestPrice(db, id) : null
      setOfferedPrice(price?.price ?? null)
      setCurrency(price?.currency ?? 'USD')
      setPerUom(price?.perUom ?? 'KG')
      setIncoterm(price?.incoterm ?? 'CIF')
      setMoqQty(row?.mp.moqQty ?? null)
      setMoqUom(row?.mp.moqUom ?? 'KG')
    },
    [db, sources],
  )

  React.useEffect(() => {
    if (!open) return
    const only = sources.length === 1 ? sources[0].mp.id : ''
    applySource(only)
    setOfferDate(todayIso())
    setValidUntil(addMonthsIso(todayIso(), 1))
    setRemarks('')
    setError(null)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open])

  const chosen = sources.find((s) => s.mp.id === mpId)
  const source = mpId ? bestPrice(db, mpId) : null
  const belowSource = source != null && offeredPrice != null && offeredPrice < source.price

  const submit = async () => {
    setError(null)
    if (!mpId) {
      setError('Choose the source that was quoted.')
      return
    }
    if (offeredPrice == null || offeredPrice <= 0) {
      setError('Enter the price the client was quoted.')
      return
    }
    if (validUntil < offerDate) {
      setError('The validity date cannot be before the offer date.')
      return
    }
    if (offerDate > todayIso()) {
      setError('That date is in the future. Record the date the offer was made.')
      return
    }
    setSaving(true)
    const result = await runAction(
      () =>
        recordOffer({
          clientCompanyId,
          manufacturerProductId: mpId,
          requirementId: requirementId ?? null,
          offerDate,
          offeredPrice,
          currency,
          perUom,
          incoterm,
          moqQty,
          moqUom: moqQty != null ? moqUom : null,
          validUntil,
          sourcePriceId: source?.id ?? null,
          remarks: remarks.trim() || null,
        }),
      {
        success: (r) =>
          r.engagementCreated
            ? 'Offer recorded. A new engagement was created behind it.'
            : 'Offer recorded against the existing engagement.',
        onError: setError,
      },
    )
    setSaving(false)
    if (result) {
      onRecorded?.()
      onOpenChange(false)
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      width="lg"
      title="Record an offer"
      description="Write down an offer already made to the client. Pick the source that was quoted; the engagement is created behind it if none exists yet."
      footer={
        <>
          <Button variant="ghost" size="sm" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button variant="primary" size="sm" loading={saving} onClick={() => void submit()}>
            Record offer
          </Button>
        </>
      }
    >
      <div className="space-y-3.5">
        <FormRow label="Source quoted" required hint="Every known source for the molecule, represented or not.">
          <Select
            value={mpId}
            onChange={applySource}
            placeholder={sources.length ? 'Choose the source' : 'No source is on record for this molecule'}
            options={sources.map((s) => ({
              value: s.mp.id,
              label: `${s.manufacturer.displayName} — ${s.mp.grade ?? 'grade n/a'} ${s.mp.pharmacopoeia ?? ''}`.trim(),
            }))}
          />
        </FormRow>

        {chosen && !chosen.inPortfolio ? (
          <InlineWarning>
            <span>
              {chosen.manufacturer.displayName} is not currently represented by TCL. The offer is still recorded as it
              happened; representation is a separate fact.
            </span>
          </InlineWarning>
        ) : null}

        <FormGrid cols={3}>
          <FormRow label="Offered price" required hint="What the client was quoted, per unit.">
            <NumberInput value={offeredPrice} onChange={setOfferedPrice} min={0} />
          </FormRow>
          <FormRow label="Currency">
            <Select value={currency} onChange={setCurrency} options={CURRENCIES.map((c) => ({ value: c, label: c }))} />
          </FormRow>
          <FormRow label="Per unit">
            <Select value={perUom} onChange={setPerUom} options={UOMS.map((u) => ({ value: u, label: u }))} />
          </FormRow>
        </FormGrid>

        {belowSource ? (
          <InlineWarning>
            <span>
              This is below the source price of {fmtMoney(source!.price, source!.currency)}/{source!.perUom}. If that is
              deliberate, say why in the remarks.
            </span>
          </InlineWarning>
        ) : null}

        <FormGrid cols={3}>
          <FormRow label="Incoterm">
            <Select value={incoterm} onChange={setIncoterm} options={INCOTERMS.map((i) => ({ value: i, label: i }))} />
          </FormRow>
          <FormRow label="Minimum order quantity">
            <NumberInput value={moqQty} onChange={setMoqQty} min={0} />
          </FormRow>
          <FormRow label="MOQ unit">
            <Select value={moqUom} onChange={setMoqUom} options={UOMS.map((u) => ({ value: u, label: u }))} />
          </FormRow>
        </FormGrid>

        <FormGrid>
          <FormRow label="Offer date" required hint="The date the offer was made, not today if it was earlier.">
            <DateInput
              value={offerDate}
              max={todayIso()}
              onChange={(e) => setOfferDate(e.target.value)}
              invalid={offerDate > todayIso()}
            />
          </FormRow>
          <FormRow label="Valid until" required hint="An offer validity before the offer date is refused.">
            <DateInput
              value={validUntil}
              min={offerDate}
              onChange={(e) => setValidUntil(e.target.value)}
              invalid={validUntil < offerDate}
            />
          </FormRow>
        </FormGrid>

        <FormRow label="Remarks" hint="Payment terms, packing, anything the client was told alongside the price.">
          <Textarea value={remarks} onChange={(e) => setRemarks(e.target.value)} rows={3} />
        </FormRow>

        {error ? <InlineError>{error}</InlineError> : null}
      </div>
    </Dialog>
  )
}
