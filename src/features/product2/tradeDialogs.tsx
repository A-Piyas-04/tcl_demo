/**
 * Dialogs for the trade workflow: client order, confirmation, PI/indent, LC,
 * shipment, delivery, and commission terms and receipt. Every dialog acts on
 * one trade order id only, so editing one order never touches another.
 */

import * as React from 'react'
import { Banknote, CheckCircle2, ClipboardCheck, FileSignature, Landmark, PackageCheck, Ship, ShoppingCart } from 'lucide-react'
import { DateInput, FormGrid, FormRow, Input, InlineWarning, RadioCards, Select, Textarea } from '@/components/ui'
import { fmtDate } from '@/lib/utils'
import { FormDialog, useSubmit } from './formkit'
import { CalcRow, CURRENCIES, DecimalInput, INCOTERMS, UOMS, partyName, todayIso } from './components'
import { PartyPicker } from './sourcingDialogs'
import { add, dec, fmtDecMoney, fmtDecPct, isDecimalString, mul, parseDec, pctOf, sub } from './decimal'
import {
  confirmDelivery,
  confirmOrder,
  createOrder,
  markShipped,
  placePi,
  recordCommissionReceipt,
  saveLc,
  saveShipment,
  updateCommissionTerms,
  updateOrder,
  useP2,
} from './store'
import type { CommissionBasis, ID, ShipmentMode } from './types'
import { COMMISSION_BASIS_LABEL, orderFinancials, sourcingStatus, type TradeBundle } from './workflow'

const posDec = (s: string, dp = 4) => !!s.trim() && isDecimalString(s, dp) && dec(s) > 0n
const dateErr = (v: string, label = 'Enter a date.') => (!v ? label : v > todayIso() ? 'Cannot be in the future.' : null)

// ------------------------------------------------------------ trade order

export function OrderDialog({
  open,
  onOpenChange,
  apiProductId,
  existing,
  onCreated,
}: {
  open: boolean
  onOpenChange: (o: boolean) => void
  apiProductId: ID
  existing?: TradeBundle
  onCreated?: (id: ID) => void
}) {
  const data = useP2()
  const { busy, error, setError, submit } = useSubmit()
  const [show, setShow] = React.useState(false)
  const o = existing?.order
  const [sourcingId, setSourcingId] = React.useState('')
  const [clientId, setClientId] = React.useState<ID | null>(null)
  const [po, setPo] = React.useState('')
  const [orderDate, setOrderDate] = React.useState(todayIso())
  const [requiredBy, setRequiredBy] = React.useState('')
  const [quantity, setQuantity] = React.useState('')
  const [uom, setUom] = React.useState('kg')
  const [currency, setCurrency] = React.useState('USD')
  const [fob, setFob] = React.useState('')
  const [transport, setTransport] = React.useState('')
  const [incoterm, setIncoterm] = React.useState('FOB')
  const [remarks, setRemarks] = React.useState('')
  const [basis, setBasis] = React.useState<CommissionBasis>('FOB')
  const [pct, setPct] = React.useState('')

  const approved = data.sourcing.filter((s) => s.apiProductId === apiProductId && sourcingStatus(data, s.id) === 'ACCEPTED')

  React.useEffect(() => {
    if (!open) return
    setShow(false)
    setError(null)
    setSourcingId(o?.sourcingId ?? (approved.length === 1 ? approved[0]!.id : ''))
    setClientId(o?.clientId ?? null)
    setPo(o?.clientPoRef ?? '')
    setOrderDate(o?.orderDate ?? todayIso())
    setRequiredBy(o?.requiredBy ?? '')
    setQuantity(o?.quantity.replace(/\.?0+$/, '') ?? '')
    setUom(o?.uom ?? 'kg')
    setCurrency(o?.currency ?? 'USD')
    setFob(o?.fobUnitPrice.replace(/(\.\d*?)0+$/, '$1').replace(/\.$/, '') ?? '')
    setTransport(o?.transportCharges ?? '')
    setIncoterm(o?.incoterm ?? 'FOB')
    setRemarks(o?.remarks ?? '')
    setBasis(existing?.commission?.basis ?? 'FOB')
    setPct(existing?.commission?.percentage.replace(/\.?0+$/, '') ?? '')
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, existing])

  const pctVal = parseDec(pct)
  const errors = {
    source: !sourcingId ? 'Choose the approved source.' : null,
    client: !clientId ? 'Choose the client.' : null,
    orderDate: dateErr(orderDate),
    requiredBy: requiredBy && orderDate && requiredBy < orderDate ? 'Cannot be before the order date.' : null,
    quantity: !posDec(quantity) ? 'A positive quantity, up to 4 decimals.' : null,
    fob: !posDec(fob) ? 'A positive price, up to 4 decimals.' : null,
    transport: transport.trim() && !isDecimalString(transport, 2) ? 'A non-negative amount, up to 2 decimals.' : null,
    pct: existing
      ? null
      : !pct.trim() || !isDecimalString(pct, 4) || !pctVal || pctVal <= 0n
        ? 'A percentage above 0.'
        : pctVal > dec('100')
          ? 'Cannot exceed 100%.'
          : null,
  }

  // live calculation, decimal-safe
  const fobValue = posDec(quantity) && posDec(fob) ? mul(dec(quantity), dec(fob)) : null
  const total = fobValue != null ? add(fobValue, dec(transport)) : null
  const commissionable = basis === 'FOB' ? fobValue : total
  const expected = commissionable != null && pctVal && !errors.pct ? pctOf(commissionable, pctVal) : null

  const onSubmit = () => {
    setShow(true)
    if (Object.values(errors).some(Boolean)) return
    const input = {
      sourcingId,
      clientId: clientId!,
      clientPoRef: po,
      orderDate,
      requiredBy,
      quantity,
      uom,
      currency,
      fobUnitPrice: fob,
      transportCharges: transport,
      incoterm,
      remarks,
    }
    if (existing) {
      void submit(() => updateOrder(existing.order.id, input), {
        success: `${existing.order.orderRef} updated.`,
        onSuccess: () => onOpenChange(false),
      })
    } else {
      void submit(() => createOrder(apiProductId, { ...input, commissionBasis: basis, commissionPct: pct }), {
        success: 'Client bulk order recorded. Confirm it once the client’s PO is in hand.',
        onSuccess: (id) => {
          onOpenChange(false)
          onCreated?.(id)
        },
      })
    }
  }

  return (
    <FormDialog
      open={open}
      onOpenChange={onOpenChange}
      width="lg"
      title={existing ? `Edit ${existing.order.orderRef}` : 'New client bulk order'}
      description="A client’s bulk order for this API, bought from one approved source."
      icon={<ShoppingCart className="h-5 w-5" />}
      confirmLabel={existing ? 'Save changes' : 'Record order'}
      busy={busy}
      error={error}
      onSubmit={onSubmit}
      disabled={approved.length === 0}
    >
      {approved.length === 0 ? (
        <InlineWarning>No source of this API has an accepted sample yet. Bulk orders open once a sample is accepted.</InlineWarning>
      ) : null}
      <FormGrid>
        <FormRow label="Approved source" required error={show ? errors.source : null}>
          <Select
            value={sourcingId}
            onChange={setSourcingId}
            invalid={show && !!errors.source}
            placeholder="Choose source…"
            options={approved.map((s) => ({
              value: s.id,
              label: partyName(data, s.manufacturerId),
              description: s.intermediaryId ? `via ${partyName(data, s.intermediaryId)}` : 'Direct',
            }))}
          />
        </FormRow>
        <FormRow label="Client" required error={show ? errors.client : null}>
          <PartyPicker kind="CLIENT" value={clientId} onChange={setClientId} invalid={show && !!errors.client} />
        </FormRow>
        <FormRow label="Client PO reference">
          <Input value={po} onChange={(e) => setPo(e.target.value)} />
        </FormRow>
        <FormRow label="Incoterm">
          <Select value={incoterm} onChange={setIncoterm} options={INCOTERMS.map((i) => ({ value: i, label: i }))} />
        </FormRow>
        <FormRow label="Order date" required error={show ? errors.orderDate : null}>
          <DateInput value={orderDate} max={todayIso()} onChange={(e) => setOrderDate(e.target.value)} invalid={show && !!errors.orderDate} />
        </FormRow>
        <FormRow label="Required by" error={show ? errors.requiredBy : null}>
          <DateInput value={requiredBy} min={orderDate} onChange={(e) => setRequiredBy(e.target.value)} invalid={show && !!errors.requiredBy} />
        </FormRow>
        <FormRow label="Bulk quantity" required error={show ? errors.quantity : null}>
          <div className="grid grid-cols-[1fr_5rem] gap-1.5">
            <DecimalInput value={quantity} onChange={setQuantity} invalid={show && !!errors.quantity} placeholder="500" />
            <Select value={uom} onChange={setUom} options={UOMS.map((u) => ({ value: u, label: u }))} />
          </div>
        </FormRow>
        <FormRow label="FOB unit price" required error={show ? errors.fob : null}>
          <div className="grid grid-cols-[1fr_5rem] gap-1.5">
            <DecimalInput value={fob} onChange={setFob} invalid={show && !!errors.fob} suffix={`/${uom}`} />
            <Select value={currency} onChange={setCurrency} options={CURRENCIES.map((c) => ({ value: c, label: c }))} />
          </div>
        </FormRow>
        <FormRow label="Transportation charges" hint="Freight etc. for the whole order. Not part of FOB." error={show ? errors.transport : null}>
          <DecimalInput value={transport} onChange={setTransport} suffix={currency} invalid={show && !!errors.transport} />
        </FormRow>
        <FormRow label="Remarks">
          <Input value={remarks} onChange={(e) => setRemarks(e.target.value)} />
        </FormRow>
      </FormGrid>

      {!existing ? (
        <div className="space-y-3 rounded-md border border-paper-300 bg-paper-50 p-3">
          <p className="text-sm font-semibold text-ink-600">Commission terms</p>
          <RadioCards
            value={basis}
            onChange={setBasis}
            options={[
              { value: 'FOB', label: 'On FOB value', description: 'Quantity × FOB unit price.' },
              { value: 'TOTAL', label: 'On total transaction', description: 'FOB value + transportation charges.' },
            ]}
          />
          <FormRow label="Commission percentage" required error={show ? errors.pct : null} className="max-w-[12rem]">
            <DecimalInput value={pct} onChange={setPct} suffix="%" invalid={show && !!errors.pct} placeholder="2.5" />
          </FormRow>
        </div>
      ) : null}

      <div className="rounded-md border border-paper-300 bg-white px-3 py-1.5">
        <CalcRow label="FOB value" hint="qty × FOB price" value={fmtDecMoney(fobValue, currency)} />
        <CalcRow label="Transportation charges" value={fmtDecMoney(dec(transport), currency)} />
        <CalcRow label="Total transaction amount" value={fmtDecMoney(total, currency)} emphasis />
        {!existing ? (
          <>
            <CalcRow label={`Commissionable amount (${COMMISSION_BASIS_LABEL[basis]})`} value={fmtDecMoney(commissionable, currency)} />
            <CalcRow label={`Expected commission${pctVal ? ` @ ${fmtDecPct(pctVal)}` : ''}`} value={fmtDecMoney(expected, currency)} emphasis />
          </>
        ) : null}
      </div>
    </FormDialog>
  )
}

// ------------------------------------------------------- confirm order

export function ConfirmOrderDialog({ open, onOpenChange, bundle }: { open: boolean; onOpenChange: (o: boolean) => void; bundle: TradeBundle }) {
  const { busy, error, setError, submit } = useSubmit()
  const [date, setDate] = React.useState(todayIso())
  const [show, setShow] = React.useState(false)
  React.useEffect(() => {
    if (open) {
      setDate(todayIso())
      setShow(false)
      setError(null)
    }
  }, [open, setError])
  const err = dateErr(date) ?? (date < bundle.order.orderDate ? `Cannot be before the order date (${fmtDate(bundle.order.orderDate)}).` : null)
  return (
    <FormDialog
      open={open}
      onOpenChange={onOpenChange}
      width="sm"
      title={`Confirm ${bundle.order.orderRef}`}
      description="Confirms the client has committed to this bulk order. After this the order cannot be deleted."
      icon={<ClipboardCheck className="h-5 w-5 text-accent-600" />}
      confirmLabel="Confirm client order"
      busy={busy}
      error={error}
      onSubmit={() => {
        setShow(true)
        if (err) return
        void submit(() => confirmOrder(bundle.order.id, date), { success: `${bundle.order.orderRef} confirmed.`, onSuccess: () => onOpenChange(false) })
      }}
    >
      <FormRow label="Confirmed on" required error={show ? err : null}>
        <DateInput value={date} min={bundle.order.orderDate} max={todayIso()} onChange={(e) => setDate(e.target.value)} invalid={show && !!err} />
      </FormRow>
    </FormDialog>
  )
}

// ------------------------------------------------------------- PI/Indent

export function PiDialog({ open, onOpenChange, bundle }: { open: boolean; onOpenChange: (o: boolean) => void; bundle: TradeBundle }) {
  const { busy, error, setError, submit } = useSubmit()
  const [show, setShow] = React.useState(false)
  const [num, setNum] = React.useState('')
  const [date, setDate] = React.useState(todayIso())
  const [qty, setQty] = React.useState('')
  const [remarks, setRemarks] = React.useState('')
  const o = bundle.order
  React.useEffect(() => {
    if (!open) return
    setShow(false)
    setError(null)
    setNum('')
    setDate(todayIso())
    setQty(o.quantity.replace(/\.?0+$/, ''))
    setRemarks('')
  }, [open, o.quantity, setError])
  const errors = {
    num: !num.trim() ? 'Enter the PI / indent number.' : null,
    date: dateErr(date) ?? (o.confirmedOn && date < o.confirmedOn ? `Cannot be before confirmation (${fmtDate(o.confirmedOn)}).` : null),
    qty: !posDec(qty) ? 'A positive quantity.' : dec(qty) > dec(o.quantity) ? 'Cannot exceed the client order quantity.' : null,
  }
  return (
    <FormDialog
      open={open}
      onOpenChange={onOpenChange}
      title="Place PI / indent"
      description="The proforma invoice or indent placed on the manufacturer for this order."
      icon={<FileSignature className="h-5 w-5" />}
      confirmLabel="Confirm PI placed"
      busy={busy}
      error={error}
      onSubmit={() => {
        setShow(true)
        if (Object.values(errors).some(Boolean)) return
        void submit(() => placePi(o.id, { piNumber: num, piDate: date, quantity: qty, remarks }), {
          success: `PI ${num.trim()} placed on ${o.orderRef}.`,
          onSuccess: () => onOpenChange(false),
        })
      }}
    >
      <FormGrid>
        <FormRow label="PI / indent number" required error={show ? errors.num : null}>
          <Input mono value={num} onChange={(e) => setNum(e.target.value)} invalid={show && !!errors.num} autoFocus />
        </FormRow>
        <FormRow label="PI date" required error={show ? errors.date : null}>
          <DateInput value={date} min={o.confirmedOn ?? undefined} max={todayIso()} onChange={(e) => setDate(e.target.value)} invalid={show && !!errors.date} />
        </FormRow>
        <FormRow label="Quantity" required error={show ? errors.qty : null} hint={`Client ordered ${o.quantity.replace(/\.?0+$/, '')} ${o.uom}`}>
          <DecimalInput value={qty} onChange={setQty} suffix={o.uom} invalid={show && !!errors.qty} />
        </FormRow>
        <FormRow label="Remarks">
          <Input value={remarks} onChange={(e) => setRemarks(e.target.value)} />
        </FormRow>
      </FormGrid>
    </FormDialog>
  )
}

// --------------------------------------------------------------------- LC

export function LcDialog({ open, onOpenChange, bundle }: { open: boolean; onOpenChange: (o: boolean) => void; bundle: TradeBundle }) {
  const { busy, error, setError, submit } = useSubmit()
  const [show, setShow] = React.useState(false)
  const lc = bundle.lc
  const fin = orderFinancials(bundle)
  const [f, setF] = React.useState({
    lcNumber: '',
    issuingBank: '',
    advisingBank: '',
    amount: '',
    currency: 'USD',
    openedOn: todayIso(),
    expiryDate: '',
    latestShipmentDate: '',
    remarks: '',
  })
  const set = (k: keyof typeof f) => (v: string) => setF((s) => ({ ...s, [k]: v }))

  React.useEffect(() => {
    if (!open) return
    setShow(false)
    setError(null)
    setF({
      lcNumber: lc?.lcNumber ?? '',
      issuingBank: lc?.issuingBank ?? '',
      advisingBank: lc?.advisingBank ?? '',
      amount: lc?.amount ?? '',
      currency: lc?.currency ?? bundle.order.currency,
      openedOn: lc?.openedOn ?? todayIso(),
      expiryDate: lc?.expiryDate ?? '',
      latestShipmentDate: lc?.latestShipmentDate ?? '',
      remarks: lc?.remarks ?? '',
    })
  }, [open, lc, bundle.order.currency, setError])

  const piDate = bundle.pi?.piDate
  const errors = {
    lcNumber: !f.lcNumber.trim() ? 'Enter the LC number.' : null,
    issuingBank: !f.issuingBank.trim() ? 'Enter the issuing bank.' : null,
    amount: !posDec(f.amount, 2) ? 'A positive amount, up to 2 decimals.' : null,
    openedOn: !f.openedOn ? 'Enter a date.' : piDate && f.openedOn < piDate ? `Cannot be before the PI date (${fmtDate(piDate)}).` : null,
    expiryDate: !f.expiryDate ? 'Enter the expiry date.' : f.openedOn && f.expiryDate <= f.openedOn ? 'Must be after the opening date.' : null,
    latestShipmentDate: !f.latestShipmentDate
      ? 'Enter the latest shipment date.'
      : f.openedOn && f.latestShipmentDate < f.openedOn
        ? 'Cannot be before the opening date.'
        : f.expiryDate && f.latestShipmentDate > f.expiryDate
          ? 'Cannot be after LC expiry.'
          : null,
  }
  const amt = parseDec(f.amount)
  const diff = amt != null && f.currency === bundle.order.currency ? sub(amt, fin.transactionTotal) : null

  return (
    <FormDialog
      open={open}
      onOpenChange={onOpenChange}
      width="lg"
      title={lc ? 'Edit LC details' : 'Enter LC details'}
      description="Saved as a draft. Confirm the LC as opened separately once the bank has issued it."
      icon={<Landmark className="h-5 w-5" />}
      confirmLabel="Save LC draft"
      busy={busy}
      error={error}
      onSubmit={() => {
        setShow(true)
        if (Object.values(errors).some(Boolean)) return
        void submit(() => saveLc(bundle.order.id, f), { success: 'LC details saved as draft.', onSuccess: () => onOpenChange(false) })
      }}
    >
      <FormGrid>
        <FormRow label="LC number" required error={show ? errors.lcNumber : null}>
          <Input mono value={f.lcNumber} onChange={(e) => set('lcNumber')(e.target.value)} invalid={show && !!errors.lcNumber} />
        </FormRow>
        <FormRow label="LC amount" required error={show ? errors.amount : null}>
          <div className="grid grid-cols-[1fr_5rem] gap-1.5">
            <DecimalInput value={f.amount} onChange={set('amount')} invalid={show && !!errors.amount} />
            <Select value={f.currency} onChange={set('currency')} options={CURRENCIES.map((c) => ({ value: c, label: c }))} />
          </div>
        </FormRow>
        <FormRow label="Issuing bank" required error={show ? errors.issuingBank : null}>
          <Input value={f.issuingBank} onChange={(e) => set('issuingBank')(e.target.value)} invalid={show && !!errors.issuingBank} />
        </FormRow>
        <FormRow label="Advising bank">
          <Input value={f.advisingBank} onChange={(e) => set('advisingBank')(e.target.value)} />
        </FormRow>
        <FormRow label="Opening date" required error={show ? errors.openedOn : null}>
          <DateInput value={f.openedOn} min={piDate} onChange={(e) => set('openedOn')(e.target.value)} invalid={show && !!errors.openedOn} />
        </FormRow>
        <FormRow label="Expiry date" required error={show ? errors.expiryDate : null}>
          <DateInput value={f.expiryDate} min={f.openedOn} onChange={(e) => set('expiryDate')(e.target.value)} invalid={show && !!errors.expiryDate} />
        </FormRow>
        <FormRow label="Latest shipment date" required error={show ? errors.latestShipmentDate : null}>
          <DateInput value={f.latestShipmentDate} min={f.openedOn} max={f.expiryDate || undefined} onChange={(e) => set('latestShipmentDate')(e.target.value)} invalid={show && !!errors.latestShipmentDate} />
        </FormRow>
        <FormRow label="Remarks">
          <Input value={f.remarks} onChange={(e) => set('remarks')(e.target.value)} />
        </FormRow>
      </FormGrid>
      <div className="rounded-md border border-paper-300 bg-paper-50 px-3 py-1.5">
        <CalcRow label="FOB value" value={fmtDecMoney(fin.fobValue, bundle.order.currency)} />
        <CalcRow label="Transportation charges" value={fmtDecMoney(fin.transportCharges, bundle.order.currency)} />
        <CalcRow label="Total transaction amount" value={fmtDecMoney(fin.transactionTotal, bundle.order.currency)} emphasis />
        <CalcRow
          label="LC amount vs transaction total"
          hint="for reference — an LC may legitimately differ"
          value={diff == null ? '—' : diff === 0n ? 'Equal' : fmtDecMoney(diff, bundle.order.currency, 2, true)}
          muted={diff == null || diff === 0n}
        />
      </div>
    </FormDialog>
  )
}

// --------------------------------------------------------------- shipment

const MODES: { value: ShipmentMode; label: string }[] = [
  { value: 'SEA', label: 'Sea freight' },
  { value: 'AIR', label: 'Air freight' },
  { value: 'ROAD', label: 'Road' },
  { value: 'COURIER', label: 'Courier' },
]

export function ShipmentDialog({ open, onOpenChange, bundle }: { open: boolean; onOpenChange: (o: boolean) => void; bundle: TradeBundle }) {
  const { busy, error, setError, submit } = useSubmit()
  const [show, setShow] = React.useState(false)
  const s = bundle.shipment
  const [f, setF] = React.useState({ mode: 'SEA' as ShipmentMode, carrier: '', blAwbNumber: '', portOfLoading: '', portOfDischarge: '', etd: '', eta: '' })
  const set = (k: keyof typeof f) => (v: string) => setF((x) => ({ ...x, [k]: v }))
  React.useEffect(() => {
    if (!open) return
    setShow(false)
    setError(null)
    setF({
      mode: s?.mode ?? 'SEA',
      carrier: s?.carrier ?? '',
      blAwbNumber: s?.blAwbNumber ?? '',
      portOfLoading: s?.portOfLoading ?? '',
      portOfDischarge: s?.portOfDischarge ?? '',
      etd: s?.etd ?? '',
      eta: s?.eta ?? '',
    })
  }, [open, s, setError])
  const lcOpened = bundle.lc?.openedOn
  const errors = {
    etd: f.etd && lcOpened && f.etd < lcOpened ? `Cannot be before the LC opened (${fmtDate(lcOpened)}).` : null,
    eta: f.eta && f.etd && f.eta < f.etd ? 'ETA cannot be before ETD.' : null,
  }
  const late = f.etd && bundle.lc && f.etd > bundle.lc.latestShipmentDate
  return (
    <FormDialog
      open={open}
      onOpenChange={onOpenChange}
      width="lg"
      title={s ? 'Update shipment details' : 'Start shipment'}
      description={s ? 'Booking and routing details. Mark as shipped separately once goods leave.' : 'Records that the shipment is being arranged. Status becomes “Shipment in progress”.'}
      icon={<Ship className="h-5 w-5" />}
      confirmLabel={s ? 'Save' : 'Start shipment'}
      busy={busy}
      error={error}
      onSubmit={() => {
        setShow(true)
        if (Object.values(errors).some(Boolean)) return
        void submit(() => saveShipment(bundle.order.id, f), {
          success: s ? 'Shipment details updated.' : 'Shipment started — in progress.',
          onSuccess: () => onOpenChange(false),
        })
      }}
    >
      <FormGrid>
        <FormRow label="Mode">
          <Select value={f.mode} onChange={(v) => set('mode')(v)} options={MODES} />
        </FormRow>
        <FormRow label="Carrier / forwarder">
          <Input value={f.carrier} onChange={(e) => set('carrier')(e.target.value)} />
        </FormRow>
        <FormRow label="B/L or AWB number">
          <Input mono value={f.blAwbNumber} onChange={(e) => set('blAwbNumber')(e.target.value)} />
        </FormRow>
        <div />
        <FormRow label="Port of loading">
          <Input value={f.portOfLoading} onChange={(e) => set('portOfLoading')(e.target.value)} />
        </FormRow>
        <FormRow label="Port of discharge">
          <Input value={f.portOfDischarge} onChange={(e) => set('portOfDischarge')(e.target.value)} />
        </FormRow>
        <FormRow label="ETD" error={show ? errors.etd : null}>
          <DateInput value={f.etd} min={lcOpened} onChange={(e) => set('etd')(e.target.value)} invalid={show && !!errors.etd} />
        </FormRow>
        <FormRow label="ETA" error={show ? errors.eta : null}>
          <DateInput value={f.eta} min={f.etd || undefined} onChange={(e) => set('eta')(e.target.value)} invalid={show && !!errors.eta} />
        </FormRow>
      </FormGrid>
      {late ? (
        <InlineWarning>ETD is after the LC’s latest shipment date ({fmtDate(bundle.lc!.latestShipmentDate)}). An LC amendment may be needed.</InlineWarning>
      ) : null}
    </FormDialog>
  )
}

export function ShippedDialog({ open, onOpenChange, bundle }: { open: boolean; onOpenChange: (o: boolean) => void; bundle: TradeBundle }) {
  const { busy, error, setError, submit } = useSubmit()
  const [show, setShow] = React.useState(false)
  const [date, setDate] = React.useState(todayIso())
  const [bl, setBl] = React.useState('')
  const lc = bundle.lc
  React.useEffect(() => {
    if (!open) return
    setShow(false)
    setError(null)
    setDate(todayIso())
    setBl(bundle.shipment?.blAwbNumber ?? '')
  }, [open, bundle.shipment, setError])
  // Only a date that cannot be stored (missing, malformed, in the future) is an
  // error. Shipping before the LC opened, after its latest shipment date, or
  // after it expired are facts about what happened — recorded, warned, never
  // refused. A shipment after expiry is exactly when a demurrage claim arises.
  const errors = {
    date: dateErr(date),
    bl: !bl.trim() ? 'Enter the B/L or AWB number.' : null,
  }
  const beforeLc = Boolean(lc && date && date < lc.openedOn)
  const expired = Boolean(lc && date && date > lc.expiryDate)
  const late = Boolean(lc && date && date > lc.latestShipmentDate && date <= lc.expiryDate)
  return (
    <FormDialog
      open={open}
      onOpenChange={onOpenChange}
      width="sm"
      title="Mark as shipped"
      description="Confirms the goods have left the origin."
      icon={<Ship className="h-5 w-5 text-accent-600" />}
      confirmLabel="Confirm shipped"
      busy={busy}
      error={error}
      onSubmit={() => {
        setShow(true)
        if (Object.values(errors).some(Boolean)) return
        void submit(() => markShipped(bundle.order.id, { shippedOn: date, blAwbNumber: bl }), {
          success: (r) => (r.lateAgainstLc ? 'Marked as shipped — after the LC’s latest shipment date.' : 'Marked as shipped.'),
          onSuccess: () => onOpenChange(false),
        })
      }}
    >
      <FormRow label="Shipped on" required error={show ? errors.date : null}>
        <DateInput value={date} min={lc?.openedOn} max={todayIso()} onChange={(e) => setDate(e.target.value)} invalid={show && !!errors.date} />
      </FormRow>
      <FormRow label="B/L or AWB number" required error={show ? errors.bl : null}>
        <Input mono value={bl} onChange={(e) => setBl(e.target.value)} invalid={show && !!errors.bl} />
      </FormRow>
      {beforeLc ? (
        <InlineWarning>This is before the LC opened ({fmtDate(lc!.openedOn)}).</InlineWarning>
      ) : null}
      {expired ? (
        <InlineWarning>
          This is after the LC expired ({fmtDate(lc!.expiryDate)}). A demurrage charge may follow — record it on the
          shipment.
        </InlineWarning>
      ) : null}
      {late ? (
        <InlineWarning>This is after the LC’s latest shipment date ({fmtDate(lc!.latestShipmentDate)}).</InlineWarning>
      ) : null}
    </FormDialog>
  )
}

export function DeliveryDialog({ open, onOpenChange, bundle }: { open: boolean; onOpenChange: (o: boolean) => void; bundle: TradeBundle }) {
  const { busy, error, setError, submit } = useSubmit()
  const [show, setShow] = React.useState(false)
  const [date, setDate] = React.useState(todayIso())
  const [remarks, setRemarks] = React.useState('')
  const shippedOn = bundle.shipment?.shippedOn
  React.useEffect(() => {
    if (!open) return
    setShow(false)
    setError(null)
    setDate(todayIso())
    setRemarks('')
  }, [open, setError])
  const err = dateErr(date) ?? (shippedOn && date < shippedOn ? `Cannot be before shipping (${fmtDate(shippedOn)}).` : null)
  return (
    <FormDialog
      open={open}
      onOpenChange={onOpenChange}
      width="sm"
      title="Confirm delivery"
      description="Confirms the client received the goods. Shipment details lock after this."
      icon={<PackageCheck className="h-5 w-5 text-ok-500" />}
      confirmLabel="Confirm delivered"
      busy={busy}
      error={error}
      onSubmit={() => {
        setShow(true)
        if (err) return
        void submit(() => confirmDelivery(bundle.order.id, { deliveredOn: date, remarks }), {
          success: `${bundle.order.orderRef} delivered.`,
          onSuccess: () => onOpenChange(false),
        })
      }}
    >
      <FormRow label="Delivered on" required error={show ? err : null}>
        <DateInput value={date} min={shippedOn ?? undefined} max={todayIso()} onChange={(e) => setDate(e.target.value)} invalid={show && !!err} />
      </FormRow>
      <FormRow label="Delivery remarks" hint="Condition on arrival, shortages, etc.">
        <Textarea value={remarks} onChange={(e) => setRemarks(e.target.value)} rows={2} />
      </FormRow>
    </FormDialog>
  )
}

// ------------------------------------------------------------- commission

export function CommissionTermsDialog({ open, onOpenChange, bundle }: { open: boolean; onOpenChange: (o: boolean) => void; bundle: TradeBundle }) {
  const { busy, error, setError, submit } = useSubmit()
  const [show, setShow] = React.useState(false)
  const [basis, setBasis] = React.useState<CommissionBasis>('FOB')
  const [pct, setPct] = React.useState('')
  const fin = orderFinancials(bundle)
  React.useEffect(() => {
    if (!open) return
    setShow(false)
    setError(null)
    setBasis(bundle.commission?.basis ?? 'FOB')
    setPct(bundle.commission?.percentage.replace(/\.?0+$/, '') ?? '')
  }, [open, bundle.commission, setError])
  const p = parseDec(pct)
  const err = !pct.trim() || !isDecimalString(pct, 4) || !p || p <= 0n ? 'A percentage above 0, up to 4 decimals.' : p > dec('100') ? 'Cannot exceed 100%.' : null
  const base = basis === 'FOB' ? fin.fobValue : fin.transactionTotal
  const c = bundle.order.currency
  return (
    <FormDialog
      open={open}
      onOpenChange={onOpenChange}
      title="Commission terms"
      description={`Applies to ${bundle.order.orderRef} only.`}
      icon={<Banknote className="h-5 w-5" />}
      confirmLabel="Save terms"
      busy={busy}
      error={error}
      onSubmit={() => {
        setShow(true)
        if (err) return
        void submit(() => updateCommissionTerms(bundle.order.id, basis, pct), { success: 'Commission terms updated.', onSuccess: () => onOpenChange(false) })
      }}
    >
      <RadioCards
        value={basis}
        onChange={setBasis}
        options={[
          { value: 'FOB', label: 'On FOB value', description: fmtDecMoney(fin.fobValue, c) },
          { value: 'TOTAL', label: 'On total transaction', description: fmtDecMoney(fin.transactionTotal, c) },
        ]}
      />
      <FormRow label="Commission percentage" required error={show ? err : null} className="max-w-[12rem]">
        <DecimalInput value={pct} onChange={setPct} suffix="%" invalid={show && !!err} />
      </FormRow>
      <div className="rounded-md border border-paper-300 bg-paper-50 px-3 py-1.5">
        <CalcRow label="Commissionable amount" value={fmtDecMoney(base, c)} />
        <CalcRow label="Expected commission" value={fmtDecMoney(!err && p ? pctOf(base, p) : null, c)} emphasis />
      </div>
    </FormDialog>
  )
}

export function ReceiptDialog({ open, onOpenChange, bundle }: { open: boolean; onOpenChange: (o: boolean) => void; bundle: TradeBundle }) {
  const { busy, error, setError, submit } = useSubmit()
  const [show, setShow] = React.useState(false)
  const fin = orderFinancials(bundle)
  const c = bundle.order.currency
  const [amount, setAmount] = React.useState('')
  const [date, setDate] = React.useState(todayIso())
  const [ref, setRef] = React.useState('')
  const [remarks, setRemarks] = React.useState('')
  const deliveredOn = bundle.shipment?.deliveredOn
  React.useEffect(() => {
    if (!open) return
    setShow(false)
    setError(null)
    setAmount('')
    setDate(todayIso())
    setRef('')
    setRemarks('')
  }, [open, setError])
  const errors = {
    amount: !posDec(amount, 2) ? 'A positive amount, up to 2 decimals.' : null,
    date: dateErr(date) ?? (deliveredOn && date < deliveredOn ? `Cannot be before delivery (${fmtDate(deliveredOn)}).` : null),
  }
  const received = parseDec(amount)
  const variance = received != null && fin.expectedCommission != null ? sub(received, fin.expectedCommission) : null
  return (
    <FormDialog
      open={open}
      onOpenChange={onOpenChange}
      title="Record commission received"
      description="Enter what actually arrived. Differences from the expected figure are kept, not overwritten."
      icon={<CheckCircle2 className="h-5 w-5 text-ok-500" />}
      confirmLabel="Confirm receipt"
      busy={busy}
      error={error}
      onSubmit={() => {
        setShow(true)
        if (Object.values(errors).some(Boolean)) return
        void submit(() => recordCommissionReceipt(bundle.order.id, { amount, receivedOn: date, receiptRef: ref, remarks }), {
          success: `Commission received on ${bundle.order.orderRef}.`,
          onSuccess: () => onOpenChange(false),
        })
      }}
    >
      <div className="rounded-md border border-paper-300 bg-paper-50 px-3 py-1.5">
        <CalcRow label={`Expected (${fin.basis ? COMMISSION_BASIS_LABEL[fin.basis] : ''} @ ${fmtDecPct(fin.percentage)})`} value={fmtDecMoney(fin.expectedCommission, c)} />
      </div>
      <FormGrid>
        <FormRow label="Amount received" required error={show ? errors.amount : null}>
          <DecimalInput value={amount} onChange={setAmount} suffix={c} invalid={show && !!errors.amount} />
        </FormRow>
        <FormRow label="Received on" required error={show ? errors.date : null}>
          <DateInput value={date} min={deliveredOn ?? undefined} max={todayIso()} onChange={(e) => setDate(e.target.value)} invalid={show && !!errors.date} />
        </FormRow>
        <FormRow label="Receipt / TT reference">
          <Input value={ref} onChange={(e) => setRef(e.target.value)} />
        </FormRow>
        <FormRow label="Remarks">
          <Input value={remarks} onChange={(e) => setRemarks(e.target.value)} />
        </FormRow>
      </FormGrid>
      {variance != null && variance !== 0n ? (
        <InlineWarning>
          {variance < 0n ? 'Short' : 'Over'} by {fmtDecMoney(variance < 0n ? -variance : variance, c)} against the expected commission.
        </InlineWarning>
      ) : null}
    </FormDialog>
  )
}
