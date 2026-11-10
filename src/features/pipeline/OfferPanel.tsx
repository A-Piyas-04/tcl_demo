/**
 * Offers on one engagement (UC-06, AC-05).
 *
 * Every version is kept. A revision supersedes the one before it and leaves the
 * stage alone; the first offer is what moves Identified to Offered, and the API
 * does that so the stage history is written either way.
 *
 * The screen refuses to open the dialog at all when the source has no currently
 * valid price, and says when the last one expired and where to renew it.
 */

import * as React from 'react'
import { Link } from 'react-router-dom'
import { Check, FileSignature, Plus, X } from 'lucide-react'
import { useDb } from '@/data/store'
import { bestPrice, currentPriceTiers, latestPrice } from '@/data/selectors'
import { CURRENCIES, INCOTERMS, OFFER_STATUS_LABEL, UOMS } from '@/data/reference'
import { createOffer, setOfferStatus } from '@/data/api'
import { runAction } from '@/lib/hooks'
import { addMonthsIso, fmtDate, fmtMoney, fmtQty, todayIso } from '@/lib/utils'
import type { Engagement, Offer, OfferStatus } from '@/data/types'
import {
  Badge,
  Button,
  DateInput,
  Dialog,
  EmptyState,
  FormGrid,
  FormRow,
  InlineError,
  InlineWarning,
  LinkButton,
  NumberInput,
  Panel,
  PanelHeader,
  Select,
  Textarea,
  Tooltip,
  WriteButton,
} from '@/components/ui'

function statusTone(status: OfferStatus) {
  switch (status) {
    case 'ACCEPTED':
      return 'ok' as const
    case 'DECLINED':
      return 'danger' as const
    case 'SENT':
      return 'accent' as const
    case 'SUPERSEDED':
      return 'neutral' as const
    default:
      return 'outline' as const
  }
}

export function OfferPanel({ engagement }: { engagement: Engagement }) {
  const db = useDb()
  const [open, setOpen] = React.useState(false)

  const offers = db.offers
    .filter((o) => o.engagementId === engagement.id)
    .sort((a, b) => b.versionNo - a.versionNo)

  const tiers = currentPriceTiers(db, engagement.manufacturerProductId)
  const blocked = tiers.length === 0
  const last = latestPrice(db, engagement.manufacturerProductId)

  return (
    <Panel>
      <PanelHeader
        title="Offers"
        subtitle="Newest first. A revision supersedes the previous version and does not move the stage."
        actions={
          <>
            <Badge tone="neutral">{offers.length}</Badge>
            <WriteButton
              variant="secondary"
              size="sm"
              icon={<Plus className="h-3.5 w-3.5" />}
              onClick={() => setOpen(true)}
              disabled={blocked}
            >
              {offers.length ? 'Revise offer' : 'Create offer'}
            </WriteButton>
          </>
        }
      />

      {blocked ? (
        <div className="p-3">
          <InlineError>
            <span>
              No offer can be made: this source has no currently valid price.{' '}
              {last ? (
                <>
                  The last one expired on <strong>{fmtDate(last.validTo)}</strong>.{' '}
                </>
              ) : (
                <>No price has ever been recorded against it. </>
              )}
              <Link to={`/sources/${engagement.manufacturerProductId}`} className="font-medium underline">
                Renew the price on the source
              </Link>
              , then come back here.
            </span>
          </InlineError>
        </div>
      ) : null}

      {offers.length === 0 ? (
        <div className="p-4">
          <EmptyState
            icon={<FileSignature className="h-5 w-5" />}
            title="No offer has been issued"
            description={
              blocked
                ? 'The price has to be valid before an offer can be put in front of the client.'
                : 'The first offer moves this engagement from Identified to Offered, with the price pre-filled from the current source price.'
            }
            compact
            action={
              blocked ? (
                <LinkButton to={`/sources/${engagement.manufacturerProductId}`} variant="primary" size="sm">
                  Open the source price screen
                </LinkButton>
              ) : (
                <WriteButton variant="primary" size="sm" onClick={() => setOpen(true)}>
                  Create offer
                </WriteButton>
              )
            }
          />
        </div>
      ) : (
        <ul className="divide-y divide-paper-200">
          {offers.map((offer) => (
            <OfferRow key={offer.id} offer={offer} />
          ))}
        </ul>
      )}

      <OfferDialog
        open={open}
        onOpenChange={setOpen}
        engagement={engagement}
        revision={offers.length > 0}
      />
    </Panel>
  )
}

function OfferRow({ offer }: { offer: Offer }) {
  const expired = offer.validUntil < todayIso()
  const awaitingAnswer = offer.status === 'SENT' || offer.status === 'DRAFT'
  return (
    <li className="flex flex-wrap items-center gap-x-3 gap-y-1 px-3 py-2.5">
      <span className="w-10 shrink-0 font-mono text-2xs text-ink-400">v{offer.versionNo}</span>
      <span className="text-sm font-semibold tabular text-ink-900">
        {fmtMoney(offer.offeredPrice, offer.currency)}
        <span className="text-2xs font-normal text-ink-400">/{offer.perUom}</span>
      </span>
      <Badge tone="outline">{offer.incoterm}</Badge>
      <span className="text-xs text-ink-600">MOQ {fmtQty(offer.moqQty, offer.moqUom)}</span>
      <span className="text-xs tabular text-ink-500">offered {fmtDate(offer.offerDate)}</span>
      <Tooltip content={expired ? 'The validity date has passed.' : 'Still within its validity.'}>
        <span className={expired ? 'text-xs tabular text-warn-600' : 'text-xs tabular text-ink-500'}>
          valid to {fmtDate(offer.validUntil)}
        </span>
      </Tooltip>
      <span className="ml-auto flex items-center gap-1.5">
        <Badge tone={statusTone(offer.status)}>{OFFER_STATUS_LABEL[offer.status]}</Badge>
        {awaitingAnswer ? (
          <>
            <Tooltip content="The client accepted this price. Recording it does not move the stage: that happens when they ask for a sample or approve the source.">
              <WriteButton
                variant="ghost"
                size="sm"
                icon={<Check className="h-3 w-3" />}
                onClick={() =>
                  void runAction(() => setOfferStatus(offer.id, 'ACCEPTED'), {
                    success: `Offer v${offer.versionNo} marked accepted.`,
                  })
                }
              >
                Accepted
              </WriteButton>
            </Tooltip>
            <Tooltip content="The client turned this price down. Close the engagement separately if they have walked away altogether.">
              <WriteButton
                variant="ghost"
                size="sm"
                icon={<X className="h-3 w-3" />}
                onClick={() =>
                  void runAction(() => setOfferStatus(offer.id, 'DECLINED'), {
                    success: `Offer v${offer.versionNo} marked declined.`,
                  })
                }
              >
                Declined
              </WriteButton>
            </Tooltip>
          </>
        ) : null}
      </span>
      {offer.remarks ? (
        <p className="w-full text-xs italic leading-relaxed text-ink-500">“{offer.remarks}”</p>
      ) : null}
    </li>
  )
}

export function OfferDialog({
  open,
  onOpenChange,
  engagement,
  revision,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  engagement: Engagement
  revision: boolean
}) {
  const db = useDb()
  const source = bestPrice(db, engagement.manufacturerProductId)
  const mp = db.manufacturerProducts.find((m) => m.id === engagement.manufacturerProductId)

  const [offeredPrice, setOfferedPrice] = React.useState<number | null>(source?.price ?? null)
  const [currency, setCurrency] = React.useState(source?.currency ?? 'USD')
  const [perUom, setPerUom] = React.useState(source?.perUom ?? 'KG')
  const [incoterm, setIncoterm] = React.useState(source?.incoterm ?? 'CIF')
  const [moqQty, setMoqQty] = React.useState<number | null>(mp?.moqQty ?? null)
  const [moqUom, setMoqUom] = React.useState(mp?.moqUom ?? 'KG')
  const [offerDate, setOfferDate] = React.useState(todayIso())
  const [validUntil, setValidUntil] = React.useState(addMonthsIso(todayIso(), 1))
  const [remarks, setRemarks] = React.useState('')
  const [saving, setSaving] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)

  React.useEffect(() => {
    if (!open) return
    setOfferedPrice(source?.price ?? null)
    setCurrency(source?.currency ?? 'USD')
    setPerUom(source?.perUom ?? 'KG')
    setIncoterm(source?.incoterm ?? 'CIF')
    setOfferDate(todayIso())
    setValidUntil(addMonthsIso(todayIso(), 1))
    setRemarks('')
    setError(null)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open])

  const belowSource = source != null && offeredPrice != null && offeredPrice < source.price

  const submit = async () => {
    setError(null)
    if (offeredPrice == null || offeredPrice <= 0) {
      setError('Enter the price being offered to the client.')
      return
    }
    if (validUntil < offerDate) {
      setError('The validity date cannot be before the offer date.')
      return
    }
    setSaving(true)
    const result = await runAction(
      () =>
        createOffer({
          engagementId: engagement.id,
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
        success: revision
          ? 'Revised offer recorded. The previous version is kept and marked superseded.'
          : 'Offer recorded and the engagement moved to Offered.',
        onError: setError,
      },
    )
    setSaving(false)
    if (result) onOpenChange(false)
  }

  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      width="lg"
      title={revision ? 'Revise the offer' : 'Create an offer'}
      description={
        source
          ? `Pre-filled from the current source price of ${fmtMoney(source.price, source.currency)}/${source.perUom} ${source.incoterm}, valid to ${fmtDate(source.validTo)}.`
          : 'No source price is available to pre-fill.'
      }
      footer={
        <>
          <Button variant="ghost" size="sm" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button variant="primary" size="sm" loading={saving} onClick={() => void submit()}>
            {revision ? 'Record revision' : 'Record offer'}
          </Button>
        </>
      }
    >
      <div className="space-y-3.5">
        <FormGrid cols={3}>
          <FormRow label="Offered price" required hint="What the client is quoted, per unit.">
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
              deliberate, say why in the remarks so the margin question is answered on the record.
            </span>
          </InlineWarning>
        ) : null}

        <FormGrid cols={3}>
          <FormRow label="Incoterm">
            <Select
              value={incoterm}
              onChange={setIncoterm}
              options={INCOTERMS.map((i) => ({ value: i, label: i }))}
            />
          </FormRow>
          <FormRow label="Minimum order quantity">
            <NumberInput value={moqQty} onChange={setMoqQty} min={0} />
          </FormRow>
          <FormRow label="MOQ unit">
            <Select value={moqUom} onChange={setMoqUom} options={UOMS.map((u) => ({ value: u, label: u }))} />
          </FormRow>
        </FormGrid>

        <FormGrid>
          <FormRow label="Offer date" required>
            <DateInput value={offerDate} onChange={(e) => setOfferDate(e.target.value)} />
          </FormRow>
          <FormRow label="Valid until" required hint="An offer validity in the past is refused.">
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
