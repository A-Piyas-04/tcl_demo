/**
 * Dialogs for the catalogue and sourcing side of Product 2.0: API products,
 * directory companies, sources, sample submissions and sample decisions.
 */

import * as React from 'react'
import { CheckCircle2, FlaskConical, Pill, Plus, XCircle } from 'lucide-react'
import {
  Button,
  Checkbox,
  DateInput,
  FormGrid,
  FormRow,
  Input,
  RadioCards,
  Select,
  TagInput,
  Textarea,
} from '@/components/ui'
import { fmtDate } from '@/lib/utils'
import { FormDialog, useSubmit } from './formkit'
import { CURRENCIES, DecimalInput, THERAPEUTIC_AREAS, UOMS, partyName, todayIso } from './components'
import { isDecimalString, dec } from './decimal'
import {
  addSourcing,
  createApi,
  createParty,
  decideSample,
  submitSample,
  updateApi,
  updateSourcing,
  useP2,
} from './store'
import type { ApiProduct, ID, PartyKind, SampleRecord, SourcingRecord } from './types'

const KIND_LABEL: Record<PartyKind, string> = {
  MANUFACTURER: 'manufacturer',
  INTERMEDIARY: 'intermediary supplier',
  CLIENT: 'client',
}

// ------------------------------------------------------------ API product

export function ApiFormDialog({
  open,
  onOpenChange,
  existing,
  onSaved,
}: {
  open: boolean
  onOpenChange: (o: boolean) => void
  existing?: ApiProduct
  onSaved?: (id: ID) => void
}) {
  const { busy, error, setError, submit } = useSubmit()
  const [show, setShow] = React.useState(false)
  const [name, setName] = React.useState('')
  const [cas, setCas] = React.useState('')
  const [synonyms, setSynonyms] = React.useState<string[]>([])
  const [area, setArea] = React.useState('')
  const [grade, setGrade] = React.useState('')
  const [description, setDescription] = React.useState('')

  React.useEffect(() => {
    if (!open) return
    setShow(false)
    setError(null)
    setName(existing?.name ?? '')
    setCas(existing?.casNumber ?? '')
    setSynonyms(existing?.synonyms ?? [])
    setArea(existing?.therapeuticArea ?? '')
    setGrade(existing?.grade ?? '')
    setDescription(existing?.description ?? '')
  }, [open, existing, setError])

  const errors = {
    name: !name.trim() ? 'Enter the API name.' : null,
    cas: cas.trim() && !/^\d{2,7}-\d{2}-\d$/.test(cas.trim()) ? 'Format is digits-digits-digit, e.g. 1115-70-4.' : null,
    area: !area ? 'Choose a therapeutic area.' : null,
  }
  const invalid = Object.values(errors).some(Boolean)

  const onSubmit = () => {
    setShow(true)
    if (invalid) return
    const input = { name, casNumber: cas, synonyms, therapeuticArea: area, grade, description }
    void submit(() => (existing ? updateApi(existing.id, input).then(() => existing.id) : createApi(input)), {
      success: existing ? `${name.trim()} updated.` : `${name.trim()} added to Product 2.0.`,
      onSuccess: (id) => {
        onOpenChange(false)
        onSaved?.(id)
      },
    })
  }

  return (
    <FormDialog
      open={open}
      onOpenChange={onOpenChange}
      title={existing ? `Edit ${existing.name}` : 'Add API product'}
      description="The molecule itself. Manufacturers, samples and orders are added on its page."
      icon={<Pill className="h-5 w-5" />}
      confirmLabel={existing ? 'Save changes' : 'Add API'}
      busy={busy}
      error={error}
      onSubmit={onSubmit}
    >
      <FormGrid>
        <FormRow label="API name" required htmlFor="p2-api-name" error={show ? errors.name : null} className="sm:col-span-2">
          <Input id="p2-api-name" value={name} onChange={(e) => setName(e.target.value)} invalid={show && !!errors.name} placeholder="e.g. Metformin Hydrochloride" autoFocus />
        </FormRow>
        <FormRow label="CAS number" htmlFor="p2-api-cas" error={show ? errors.cas : null}>
          <Input id="p2-api-cas" mono value={cas} onChange={(e) => setCas(e.target.value)} invalid={show && !!errors.cas} placeholder="1115-70-4" />
        </FormRow>
        <FormRow label="Grade" htmlFor="p2-api-grade" hint="Pharmacopoeia, e.g. USP, EP, BP">
          <Input id="p2-api-grade" value={grade} onChange={(e) => setGrade(e.target.value)} placeholder="USP" />
        </FormRow>
        <FormRow label="Therapeutic area" required error={show ? errors.area : null}>
          <Select value={area} onChange={setArea} invalid={show && !!errors.area} options={THERAPEUTIC_AREAS.map((t) => ({ value: t, label: t }))} placeholder="Choose…" />
        </FormRow>
        <FormRow label="Synonyms" hint="Press Enter after each">
          <TagInput values={synonyms} onChange={setSynonyms} />
        </FormRow>
        <FormRow label="Notes" className="sm:col-span-2">
          <Textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={2} />
        </FormRow>
      </FormGrid>
    </FormDialog>
  )
}

// ------------------------------------------------------------- directory

export function PartyDialog({
  open,
  onOpenChange,
  kind,
  onCreated,
}: {
  open: boolean
  onOpenChange: (o: boolean) => void
  kind: PartyKind
  onCreated: (id: ID) => void
}) {
  const { busy, error, setError, submit } = useSubmit()
  const [show, setShow] = React.useState(false)
  const [name, setName] = React.useState('')
  const [country, setCountry] = React.useState('')
  const [contact, setContact] = React.useState('')
  const [email, setEmail] = React.useState('')
  const [phone, setPhone] = React.useState('')

  React.useEffect(() => {
    if (!open) return
    setShow(false)
    setError(null)
    setName('')
    setCountry('')
    setContact('')
    setEmail('')
    setPhone('')
  }, [open, setError])

  const errors = {
    name: !name.trim() ? 'Enter the company name.' : null,
    country: !country.trim() ? 'Enter the country.' : null,
    email: email.trim() && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim()) ? 'That does not look like an email address.' : null,
  }

  return (
    <FormDialog
      open={open}
      onOpenChange={onOpenChange}
      width="sm"
      title={`New ${KIND_LABEL[kind]}`}
      confirmLabel="Add"
      busy={busy}
      error={error}
      onSubmit={() => {
        setShow(true)
        if (Object.values(errors).some(Boolean)) return
        void submit(() => createParty({ kind, name, country, contactName: contact, email, phone }), {
          success: `${name.trim()} added.`,
          onSuccess: (id) => {
            onOpenChange(false)
            onCreated(id)
          },
        })
      }}
    >
      <FormGrid cols={1}>
        <FormRow label="Company name" required error={show ? errors.name : null}>
          <Input value={name} onChange={(e) => setName(e.target.value)} invalid={show && !!errors.name} autoFocus />
        </FormRow>
        <FormRow label="Country" required error={show ? errors.country : null}>
          <Input value={country} onChange={(e) => setCountry(e.target.value)} invalid={show && !!errors.country} />
        </FormRow>
        <FormRow label="Contact person">
          <Input value={contact} onChange={(e) => setContact(e.target.value)} />
        </FormRow>
        <FormGrid>
          <FormRow label="Email" error={show ? errors.email : null}>
            <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} invalid={show && !!errors.email} />
          </FormRow>
          <FormRow label="Phone">
            <Input value={phone} onChange={(e) => setPhone(e.target.value)} />
          </FormRow>
        </FormGrid>
      </FormGrid>
    </FormDialog>
  )
}

/** A company select with an inline "add new". */
export function PartyPicker({
  kind,
  value,
  onChange,
  invalid,
  allowEmpty,
  emptyLabel,
}: {
  kind: PartyKind
  value: ID | null
  onChange: (id: ID | null) => void
  invalid?: boolean
  allowEmpty?: boolean
  emptyLabel?: string
}) {
  const data = useP2()
  const [adding, setAdding] = React.useState(false)
  const options = data.parties
    .filter((p) => p.kind === kind)
    .sort((a, b) => a.name.localeCompare(b.name))
    .map((p) => ({ value: p.id, label: p.name, description: p.country }))
  return (
    <div className="flex gap-1.5">
      <div className="min-w-0 flex-1">
        <Select
          value={value ?? ''}
          onChange={(v) => onChange(v || null)}
          options={options}
          invalid={invalid}
          allowEmpty={allowEmpty}
          emptyLabel={emptyLabel}
          placeholder={emptyLabel ?? `Choose ${KIND_LABEL[kind]}…`}
        />
      </div>
      <Button type="button" variant="secondary" size="icon" aria-label={`Add a new ${KIND_LABEL[kind]}`} onClick={() => setAdding(true)}>
        <Plus className="h-3.5 w-3.5" />
      </Button>
      <PartyDialog open={adding} onOpenChange={setAdding} kind={kind} onCreated={(id) => onChange(id)} />
    </div>
  )
}

// --------------------------------------------------------------- sourcing

export function SourcingDialog({
  open,
  onOpenChange,
  apiProductId,
  existing,
}: {
  open: boolean
  onOpenChange: (o: boolean) => void
  apiProductId: ID
  existing?: SourcingRecord
}) {
  const { busy, error, setError, submit } = useSubmit()
  const data = useP2()
  const [show, setShow] = React.useState(false)
  const [manufacturerId, setManufacturerId] = React.useState<ID | null>(null)
  const [intermediaryId, setIntermediaryId] = React.useState<ID | null>(null)
  const [identifiedOn, setIdentifiedOn] = React.useState(todayIso())
  const [price, setPrice] = React.useState('')
  const [currency, setCurrency] = React.useState('USD')
  const [uom, setUom] = React.useState('kg')
  const [dmf, setDmf] = React.useState(false)
  const [cep, setCep] = React.useState(false)
  const [notes, setNotes] = React.useState('')

  React.useEffect(() => {
    if (!open) return
    setShow(false)
    setError(null)
    setManufacturerId(existing?.manufacturerId ?? null)
    setIntermediaryId(existing?.intermediaryId ?? null)
    setIdentifiedOn(existing?.identifiedOn ?? todayIso())
    setPrice(existing?.indicativePrice ?? '')
    setCurrency(existing?.priceCurrency ?? 'USD')
    setUom(existing?.priceUom ?? 'kg')
    setDmf(existing?.hasDmf ?? false)
    setCep(existing?.hasCep ?? false)
    setNotes(existing?.notes ?? '')
  }, [open, existing, setError])

  const errors = {
    manufacturer: !manufacturerId ? 'Choose the manufacturer.' : null,
    identifiedOn: !identifiedOn ? 'Enter a date.' : identifiedOn > todayIso() ? 'Cannot be in the future.' : null,
    price: price.trim() && (!isDecimalString(price, 4) || dec(price) <= 0n) ? 'A positive number, up to 4 decimals.' : null,
  }

  return (
    <FormDialog
      open={open}
      onOpenChange={onOpenChange}
      title={existing ? 'Edit source' : 'Add manufacturer source'}
      description="Who makes this API, and through whom TCL reaches them. Sourcing starts at Identified."
      icon={<FlaskConical className="h-5 w-5" />}
      confirmLabel={existing ? 'Save' : 'Add source'}
      busy={busy}
      error={error}
      onSubmit={() => {
        setShow(true)
        if (Object.values(errors).some(Boolean)) return
        const input = {
          manufacturerId: manufacturerId!,
          intermediaryId,
          identifiedOn,
          indicativePrice: price,
          priceCurrency: currency,
          priceUom: uom,
          hasDmf: dmf,
          hasCep: cep,
          notes,
        }
        void submit(
          () => (existing ? updateSourcing(existing.id, input).then(() => existing.id) : addSourcing(apiProductId, input)),
          {
            success: existing ? 'Source updated.' : `${partyName(data, manufacturerId)} added as a source.`,
            onSuccess: () => onOpenChange(false),
          },
        )
      }}
    >
      <FormGrid>
        <FormRow label="Manufacturer" required error={show ? errors.manufacturer : null} className="sm:col-span-2">
          <PartyPicker kind="MANUFACTURER" value={manufacturerId} onChange={setManufacturerId} invalid={show && !!errors.manufacturer} />
        </FormRow>
        <FormRow label="Intermediary supplier" hint="Leave empty when TCL deals with the manufacturer directly." className="sm:col-span-2">
          <PartyPicker kind="INTERMEDIARY" value={intermediaryId} onChange={setIntermediaryId} allowEmpty emptyLabel="Direct — no intermediary" />
        </FormRow>
        <FormRow label="Identified on" required error={show ? errors.identifiedOn : null}>
          <DateInput value={identifiedOn} max={todayIso()} onChange={(e) => setIdentifiedOn(e.target.value)} invalid={show && !!errors.identifiedOn} />
        </FormRow>
        <FormRow label="Indicative price" hint="Reference only; orders carry their own price." error={show ? errors.price : null}>
          <div className="grid grid-cols-[1fr_5rem_4.5rem] gap-1.5">
            <DecimalInput value={price} onChange={setPrice} invalid={show && !!errors.price} />
            <Select value={currency} onChange={setCurrency} options={CURRENCIES.map((c) => ({ value: c, label: c }))} />
            <Select value={uom} onChange={setUom} options={UOMS.map((u) => ({ value: u, label: `/${u}` }))} />
          </div>
        </FormRow>
        <div className="flex items-center gap-5 sm:col-span-2">
          <Checkbox checked={dmf} onChange={setDmf} label="DMF available" />
          <Checkbox checked={cep} onChange={setCep} label="CEP available" />
        </div>
        <FormRow label="Notes" className="sm:col-span-2">
          <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} />
        </FormRow>
      </FormGrid>
    </FormDialog>
  )
}

// ----------------------------------------------------------------- sample

export function SampleDialog({
  open,
  onOpenChange,
  source,
  roundNo,
}: {
  open: boolean
  onOpenChange: (o: boolean) => void
  source: SourcingRecord
  roundNo: number
}) {
  const { busy, error, setError, submit } = useSubmit()
  const [show, setShow] = React.useState(false)
  const [quantity, setQuantity] = React.useState('')
  const [uom, setUom] = React.useState('kg')
  const [submittedOn, setSubmittedOn] = React.useState(todayIso())
  const [clientId, setClientId] = React.useState<ID | null>(null)
  const [courier, setCourier] = React.useState('')
  const [coa, setCoa] = React.useState('')

  React.useEffect(() => {
    if (!open) return
    setShow(false)
    setError(null)
    setQuantity('')
    setUom('kg')
    setSubmittedOn(todayIso())
    setClientId(null)
    setCourier('')
    setCoa('')
  }, [open, setError])

  const errors = {
    quantity: !quantity.trim()
      ? 'Enter the sample quantity.'
      : !isDecimalString(quantity, 4) || dec(quantity) <= 0n
        ? 'Must be a positive number.'
        : null,
    submittedOn: !submittedOn
      ? 'Enter a date.'
      : submittedOn > todayIso()
        ? 'Cannot be in the future.'
        : submittedOn < source.identifiedOn
          ? `Cannot be before the source was identified (${fmtDate(source.identifiedOn)}).`
          : null,
  }

  return (
    <FormDialog
      open={open}
      onOpenChange={onOpenChange}
      title={`Record sample submission — round ${roundNo}`}
      description="Confirms the sample was sent for evaluation. The accept / reject decision is recorded separately."
      icon={<FlaskConical className="h-5 w-5" />}
      confirmLabel="Confirm submission"
      busy={busy}
      error={error}
      onSubmit={() => {
        setShow(true)
        if (Object.values(errors).some(Boolean)) return
        void submit(
          () => submitSample(source.id, { quantity, uom, submittedOn, submittedToClientId: clientId, courierRef: courier, coaRef: coa }),
          { success: `Sample round ${roundNo} recorded as submitted.`, onSuccess: () => onOpenChange(false) },
        )
      }}
    >
      <FormGrid>
        <FormRow label="Sample quantity" required error={show ? errors.quantity : null}>
          <div className="grid grid-cols-[1fr_5rem] gap-1.5">
            <DecimalInput value={quantity} onChange={setQuantity} invalid={show && !!errors.quantity} placeholder="0.5" />
            <Select value={uom} onChange={setUom} options={UOMS.map((u) => ({ value: u, label: u }))} />
          </div>
        </FormRow>
        <FormRow label="Submitted on" required error={show ? errors.submittedOn : null}>
          <DateInput value={submittedOn} max={todayIso()} min={source.identifiedOn} onChange={(e) => setSubmittedOn(e.target.value)} invalid={show && !!errors.submittedOn} />
        </FormRow>
        <FormRow label="Submitted to (client)" className="sm:col-span-2">
          <PartyPicker kind="CLIENT" value={clientId} onChange={setClientId} allowEmpty emptyLabel="Not recorded" />
        </FormRow>
        <FormRow label="Courier / AWB reference">
          <Input value={courier} onChange={(e) => setCourier(e.target.value)} />
        </FormRow>
        <FormRow label="CoA reference">
          <Input value={coa} onChange={(e) => setCoa(e.target.value)} />
        </FormRow>
      </FormGrid>
    </FormDialog>
  )
}

// --------------------------------------------------------------- decision

export function DecisionDialog({
  open,
  onOpenChange,
  sample,
  initial,
}: {
  open: boolean
  onOpenChange: (o: boolean) => void
  sample: SampleRecord
  initial: 'ACCEPTED' | 'REJECTED'
}) {
  const { busy, error, setError, submit } = useSubmit()
  const [show, setShow] = React.useState(false)
  const [decision, setDecision] = React.useState<'ACCEPTED' | 'REJECTED'>(initial)
  const [decidedOn, setDecidedOn] = React.useState(todayIso())
  const [reason, setReason] = React.useState('')
  const [remarks, setRemarks] = React.useState('')

  React.useEffect(() => {
    if (!open) return
    setShow(false)
    setError(null)
    setDecision(initial)
    setDecidedOn(todayIso())
    setReason('')
    setRemarks('')
  }, [open, initial, setError])

  const errors = {
    decidedOn: !decidedOn
      ? 'Enter a date.'
      : decidedOn > todayIso()
        ? 'Cannot be in the future.'
        : decidedOn < sample.submittedOn
          ? `Cannot be before submission (${fmtDate(sample.submittedOn)}).`
          : null,
    reason: decision === 'REJECTED' && !reason.trim() ? 'Say why the sample was rejected.' : null,
  }

  const accepted = decision === 'ACCEPTED'
  return (
    <FormDialog
      open={open}
      onOpenChange={onOpenChange}
      title={`Decision on sample round ${sample.roundNo}`}
      description={
        accepted
          ? 'Accepting completes sourcing for this manufacturer and lets bulk orders be placed against it.'
          : 'A rejection does not complete sourcing. A new sample round can be submitted afterwards.'
      }
      icon={accepted ? <CheckCircle2 className="h-5 w-5 text-ok-500" /> : <XCircle className="h-5 w-5 text-danger-500" />}
      confirmLabel={accepted ? 'Confirm acceptance' : 'Confirm rejection'}
      confirmTone={accepted ? 'primary' : 'danger'}
      busy={busy}
      error={error}
      onSubmit={() => {
        setShow(true)
        if (Object.values(errors).some(Boolean)) return
        void submit(() => decideSample(sample.id, { decision, decidedOn, rejectionReason: reason, remarks }), {
          success: accepted ? `Sample round ${sample.roundNo} accepted.` : `Sample round ${sample.roundNo} rejected.`,
          onSuccess: () => onOpenChange(false),
        })
      }}
    >
      <RadioCards
        value={decision}
        onChange={setDecision}
        options={[
          { value: 'ACCEPTED', label: 'Accepted', description: 'Meets the client’s specification.', icon: <CheckCircle2 className="h-3.5 w-3.5 text-ok-500" /> },
          { value: 'REJECTED', label: 'Rejected', description: 'Fails specification or evaluation.', icon: <XCircle className="h-3.5 w-3.5 text-danger-500" /> },
        ]}
      />
      <FormGrid>
        <FormRow label="Decision date" required error={show ? errors.decidedOn : null}>
          <DateInput value={decidedOn} min={sample.submittedOn} max={todayIso()} onChange={(e) => setDecidedOn(e.target.value)} invalid={show && !!errors.decidedOn} />
        </FormRow>
        {!accepted ? (
          <FormRow label="Rejection reason" required error={show ? errors.reason : null} className="sm:col-span-2">
            <Input value={reason} onChange={(e) => setReason(e.target.value)} invalid={show && !!errors.reason} placeholder="e.g. Assay below 98.0%" />
          </FormRow>
        ) : null}
        <FormRow label="Remarks" className="sm:col-span-2">
          <Textarea value={remarks} onChange={(e) => setRemarks(e.target.value)} rows={2} />
        </FormRow>
      </FormGrid>
    </FormDialog>
  )
}
