/**
 * Link a product to a manufacturer, and optionally take it into the portfolio
 * with a first price (UC-03, FR-M4-01 to FR-M4-06).
 *
 * The combination of manufacturer, product, grade, pharmacopoeia and plant is
 * unique: a repeat is refused and the refusal is shown inline (UC-03 7a). The
 * plant list offers only this manufacturer's own sites, which is what the
 * schema enforces (FR-M2-03).
 */

import * as React from 'react'
import { useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { ArrowLeft } from 'lucide-react'
import { useDb, usePresenter } from '@/data/store'
import {
  addFiling,
  addPrice,
  createManufacturerProduct,
  setPortfolio,
  updateManufacturerProduct,
} from '@/data/api'
import {
  CURRENCIES,
  FILING_LABEL,
  INCOTERMS,
  MP_STATUS_LABEL,
  PHARMACOPOEIAS,
  REGULATORY_AUTHORITIES,
  REPRESENTATION_LABEL,
  SITE_KIND_LABEL,
  UOMS,
} from '@/data/reference'
import { runAction } from '@/lib/hooks'
import { today } from '@/data/rules'
import type {
  FilingKind,
  MpStatus,
  Pharmacopoeia,
  RepresentationKind,
} from '@/data/types'
import {
  Badge,
  Button,
  Checkbox,
  Combobox,
  FormGrid,
  FormRow,
  Input,
  InlineError,
  InlineWarning,
  LinkButton,
  NumberInput,
  Panel,
  PanelHeader,
  PageHeading,
  RadioCards,
  RuleHint,
  Select,
  Textarea,
} from '@/components/ui'
import { NotFound } from '@/features/misc/Fallbacks'

export function ManufacturerProductForm() {
  const { id } = useParams()
  const [params] = useSearchParams()
  const db = useDb()
  const navigate = useNavigate()
  const presenter = usePresenter()
  const editing = Boolean(id)
  const existing = id ? db.manufacturerProducts.find((m) => m.id === id) : undefined

  const manufacturerId = existing?.manufacturerCompanyId ?? params.get('manufacturer') ?? ''
  const manufacturer = db.companies.find((c) => c.id === manufacturerId)

  const [productId, setProductId] = React.useState(existing?.productId ?? '')
  const [grade, setGrade] = React.useState(existing?.grade ?? '')
  const [pharmacopoeia, setPharmacopoeia] = React.useState<Pharmacopoeia>(existing?.pharmacopoeia ?? 'USP')
  const [siteId, setSiteId] = React.useState(existing?.siteId ?? '')
  const [status, setStatus] = React.useState<MpStatus>(existing?.status ?? 'ACTIVE')
  const [moqQty, setMoqQty] = React.useState<number | null>(existing?.moqQty ?? null)
  const [moqUom, setMoqUom] = React.useState<string>(existing?.moqUom ?? 'KG')
  const [leadTimeDays, setLeadTimeDays] = React.useState<number | null>(existing?.leadTimeDays ?? null)
  const [packingDetails, setPackingDetails] = React.useState(existing?.packingDetails ?? '')
  const [annualCapacityQty, setAnnualCapacityQty] = React.useState<number | null>(
    existing?.annualCapacityQty ?? null,
  )
  const [annualCapacityUom, setAnnualCapacityUom] = React.useState<string>(existing?.annualCapacityUom ?? 'MT')
  const [remarks, setRemarks] = React.useState(existing?.remarks ?? '')

  // first filing and first price, create only
  const [withFiling, setWithFiling] = React.useState(false)
  const [filingKind, setFilingKind] = React.useState<FilingKind>('DMF')
  const [filingAuthority, setFilingAuthority] = React.useState('USFDA')
  const [filingReference, setFilingReference] = React.useState('')

  const [withPortfolio, setWithPortfolio] = React.useState(false)
  const [representation, setRepresentation] = React.useState<RepresentationKind>('INDENT')

  const [withPrice, setWithPrice] = React.useState(false)
  const [price, setPrice] = React.useState<number | null>(null)
  const [currency, setCurrency] = React.useState<string>('USD')
  const [perUom, setPerUom] = React.useState<string>('KG')
  const [incoterm, setIncoterm] = React.useState<string>('FOB')
  const [minQty, setMinQty] = React.useState<number | null>(1)
  const [validFrom, setValidFrom] = React.useState(today())
  const [validTo, setValidTo] = React.useState('')

  const [saving, setSaving] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)

  if (editing && !existing) return <NotFound />
  if (!manufacturer || !manufacturer.manufacturer) return <NotFound />

  const sites = db.sites.filter((s) => s.companyId === manufacturerId && s.isActive)
  const plants = sites.filter((s) => s.kind === 'PLANT')
  const product = db.products.find((p) => p.id === productId)

  // The same uniqueness rule the api enforces, shown before the save.
  const clash = db.manufacturerProducts.find(
    (m) =>
      m.id !== id &&
      m.manufacturerCompanyId === manufacturerId &&
      m.productId === productId &&
      m.grade.trim().toLowerCase() === grade.trim().toLowerCase() &&
      m.pharmacopoeia === pharmacopoeia &&
      (m.siteId ?? null) === (siteId || null),
  )

  const blockedStatus =
    manufacturer.manufacturer.status === 'BLACKLISTED' || manufacturer.manufacturer.status === 'INACTIVE'

  const canSave = Boolean(productId) && grade.trim().length > 0 && !clash

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    if (!canSave) return
    setSaving(true)

    const payload = {
      manufacturerCompanyId: manufacturerId,
      productId,
      siteId: siteId || null,
      grade: grade.trim(),
      pharmacopoeia,
      status,
      moqQty,
      moqUom: moqQty == null ? null : moqUom,
      leadTimeDays,
      packingDetails: packingDetails.trim() || null,
      annualCapacityQty,
      annualCapacityUom: annualCapacityQty == null ? null : annualCapacityUom,
      remarks: remarks.trim() || null,
    }

    const result = await runAction(
      async () => {
        if (editing) {
          await updateManufacturerProduct(id!, payload)
          return { id: id! }
        }
        const mp = await createManufacturerProduct(payload)
        if (withFiling && filingReference.trim()) {
          await addFiling({
            manufacturerProductId: mp.id,
            kind: filingKind,
            authority: filingAuthority,
            referenceNumber: filingReference.trim(),
            documentId: null,
            remarks: null,
          })
        }
        if (withPortfolio) {
          await setPortfolio(mp.id, true, representation)
        }
        if (withPrice && price != null && validTo) {
          await addPrice({
            manufacturerProductId: mp.id,
            price,
            currency,
            perUom,
            incoterm,
            minQty: minQty ?? 1,
            validFrom,
            validTo,
            sourceReference: null,
            remarks: null,
          })
        }
        return mp
      },
      {
        success: editing
          ? 'Source updated.'
          : `${product?.genericName ?? 'The product'} added to ${manufacturer.displayName}.`,
        onError: setError,
      },
    )

    setSaving(false)
    if (result) navigate(`/sources/${result.id}`)
  }

  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <PageHeading
        title={editing ? 'Edit source' : `Add a product to ${manufacturer.displayName}`}
        subtitle={
          editing
            ? 'The product, grade, pharmacopoeia and plant together identify the source, so changing one of them is a different source.'
            : 'A source is one product, at one grade and pharmacopoeia, from one plant. Two grades of the same molecule are two sources.'
        }
        actions={
          <LinkButton
            to={editing ? `/sources/${id}` : `/manufacturers/${manufacturerId}`}
            variant="ghost"
            size="md"
            icon={<ArrowLeft className="h-3.5 w-3.5" />}
          >
            Cancel
          </LinkButton>
        }
      />

      <form onSubmit={submit} className="space-y-4">
        <Panel>
          <PanelHeader title="What is made" subtitle="The identity of the source (FR-M4-01)" />
          <div className="space-y-4 p-4">
            <FormRow label="Product" required hint="Only products already in the catalogue can be linked.">
              <Combobox
                value={productId || null}
                onChange={setProductId}
                options={db.products
                  .filter((p) => p.isActive)
                  .slice()
                  .sort((a, b) => a.genericName.localeCompare(b.genericName))
                  .map((p) => ({
                    value: p.id,
                    label: p.genericName,
                    description: [p.category, p.casNumber ? `CAS ${p.casNumber}` : null].filter(Boolean).join(' · '),
                  }))}
                placeholder="Search the product catalogue…"
                emptyMessage="No product matches that. Add it to the catalogue first."
                footer={
                  <LinkButton to="/products/new" variant="ghost" size="sm">
                    Add a product to the catalogue
                  </LinkButton>
                }
              />
            </FormRow>

            <FormGrid cols={3}>
              <FormRow label="Grade" required hint="As the manufacturer names it.">
                <Input value={grade} onChange={(e) => setGrade(e.target.value)} placeholder="Micronised" />
              </FormRow>
              <FormRow label="Pharmacopoeia" required>
                <Select
                  value={pharmacopoeia}
                  onChange={(v) => setPharmacopoeia(v as Pharmacopoeia)}
                  options={PHARMACOPOEIAS.map((p) => ({ value: p, label: p }))}
                />
              </FormRow>
              <FormRow
                label="Plant"
                hint={
                  plants.length === 0
                    ? 'This manufacturer has no plant on record yet.'
                    : 'Only this manufacturer’s own sites.'
                }
              >
                <Select
                  value={siteId}
                  onChange={setSiteId}
                  allowEmpty
                  emptyLabel="Not recorded"
                  placeholder="Not recorded"
                  options={sites.map((s) => ({
                    value: s.id,
                    label: s.name,
                    description: `${SITE_KIND_LABEL[s.kind]}${s.city ? ` · ${s.city}` : ''}`,
                  }))}
                />
              </FormRow>
            </FormGrid>

            <FormRow label="Source status" required>
              <RadioCards
                value={status}
                onChange={setStatus}
                columns={3}
                options={(Object.keys(MP_STATUS_LABEL) as MpStatus[]).map((s) => ({
                  value: s,
                  label: MP_STATUS_LABEL[s],
                  description:
                    s === 'ACTIVE'
                      ? 'Made and available today.'
                      : s === 'IN_DEVELOPMENT'
                        ? 'The manufacturer is still developing it.'
                        : 'No longer made.',
                }))}
              />
            </FormRow>
          </div>
        </Panel>

        {clash ? (
          <InlineError>
            <span>
              {manufacturer.displayName} already has this product at {grade.trim() || 'this grade'}{' '}
              {pharmacopoeia}
              {siteId ? ' from the same plant' : ' with no plant recorded'}.{' '}
              <button
                type="button"
                onClick={() => navigate(`/sources/${clash.id}`)}
                className="font-medium underline"
              >
                Open the existing source
              </button>{' '}
              instead. Nothing has been saved.
            </span>
          </InlineError>
        ) : null}

        <Panel>
          <PanelHeader title="Commercial terms" subtitle="Order size, lead time, packing and capacity (FR-M4-03)" />
          <div className="space-y-4 p-4">
            <FormGrid cols={3}>
              <FormRow label="Minimum order quantity">
                <NumberInput value={moqQty} onChange={setMoqQty} min={0} />
              </FormRow>
              <FormRow label="MOQ unit">
                <Select value={moqUom} onChange={setMoqUom} options={UOMS.map((u) => ({ value: u, label: u }))} />
              </FormRow>
              <FormRow label="Lead time">
                <NumberInput value={leadTimeDays} onChange={setLeadTimeDays} min={0} suffix="days" />
              </FormRow>
              <FormRow label="Annual capacity">
                <NumberInput value={annualCapacityQty} onChange={setAnnualCapacityQty} min={0} />
              </FormRow>
              <FormRow label="Capacity unit">
                <Select
                  value={annualCapacityUom}
                  onChange={setAnnualCapacityUom}
                  options={UOMS.map((u) => ({ value: u, label: u }))}
                />
              </FormRow>
            </FormGrid>
            <FormRow label="Packing" hint="How it ships: drum size, liner, pallet.">
              <Textarea
                value={packingDetails}
                onChange={(e) => setPackingDetails(e.target.value)}
                rows={2}
                placeholder="25 kg fibre drums, double LDPE liner."
              />
            </FormRow>
            <FormRow label="Remarks">
              <Textarea value={remarks} onChange={(e) => setRemarks(e.target.value)} rows={2} />
            </FormRow>
          </div>
        </Panel>

        {!editing ? (
          <>
            <Panel>
              <PanelHeader
                title="First regulatory filing"
                subtitle="Optional. More filings can be added on the source, one per market (FR-M4-04)."
              />
              <div className="space-y-3.5 p-4">
                <Checkbox
                  checked={withFiling}
                  onChange={setWithFiling}
                  label="Record a filing now"
                />
                {withFiling ? (
                  <FormGrid cols={3}>
                    <FormRow label="Filing type">
                      <Select
                        value={filingKind}
                        onChange={(v) => setFilingKind(v as FilingKind)}
                        options={(Object.keys(FILING_LABEL) as FilingKind[]).map((k) => ({
                          value: k,
                          label: FILING_LABEL[k],
                        }))}
                      />
                    </FormRow>
                    <FormRow label="Authority">
                      <Select
                        value={filingAuthority}
                        onChange={setFilingAuthority}
                        options={REGULATORY_AUTHORITIES.map((a) => ({ value: a, label: a }))}
                      />
                    </FormRow>
                    <FormRow label="Reference number">
                      <Input
                        value={filingReference}
                        onChange={(e) => setFilingReference(e.target.value)}
                        mono
                        placeholder="DMF 034112"
                      />
                    </FormRow>
                  </FormGrid>
                ) : null}
              </div>
            </Panel>

            <Panel>
              <PanelHeader
                title="TCL portfolio"
                subtitle="Leave this off to keep the source as market intelligence (UC-03 alternate 5a)"
              />
              <div className="space-y-3.5 p-4">
                <Checkbox
                  checked={withPortfolio}
                  onChange={setWithPortfolio}
                  disabled={blockedStatus}
                  label="Take this source into the TCL portfolio"
                />
                {blockedStatus ? (
                  <InlineWarning>
                    <span>
                      {manufacturer.displayName} is{' '}
                      {manufacturer.manufacturer.status === 'BLACKLISTED' ? 'blacklisted' : 'inactive'}, so none of its
                      products can be taken into the portfolio. The source can still be recorded.
                    </span>
                  </InlineWarning>
                ) : withPortfolio ? (
                  <FormRow label="Representation type" required>
                    <Select
                      value={representation}
                      onChange={(v) => setRepresentation(v as RepresentationKind)}
                      options={(Object.keys(REPRESENTATION_LABEL) as RepresentationKind[]).map((r) => ({
                        value: r,
                        label: REPRESENTATION_LABEL[r],
                      }))}
                    />
                  </FormRow>
                ) : null}
              </div>
            </Panel>

            <Panel>
              <PanelHeader
                title="First price"
                subtitle="Optional. Without a price the source is marked price pending and cannot be offered (UC-03 alternate 6a)."
              />
              <div className="space-y-3.5 p-4">
                <Checkbox checked={withPrice} onChange={setWithPrice} label="Record a price now" />
                {withPrice ? (
                  <>
                    <FormGrid cols={3}>
                      <FormRow label="Price">
                        <NumberInput value={price} onChange={setPrice} min={0} step="0.01" />
                      </FormRow>
                      <FormRow label="Currency">
                        <Select
                          value={currency}
                          onChange={setCurrency}
                          options={CURRENCIES.map((c) => ({ value: c, label: c }))}
                        />
                      </FormRow>
                      <FormRow label="Per unit">
                        <Select value={perUom} onChange={setPerUom} options={UOMS.map((u) => ({ value: u, label: u }))} />
                      </FormRow>
                      <FormRow label="Incoterm">
                        <Select
                          value={incoterm}
                          onChange={setIncoterm}
                          options={INCOTERMS.map((i) => ({ value: i, label: i }))}
                        />
                      </FormRow>
                      <FormRow label="From quantity">
                        <NumberInput value={minQty} onChange={setMinQty} min={0} suffix={perUom} />
                      </FormRow>
                      <FormRow label="Valid from">
                        <Input type="date" value={validFrom} onChange={(e) => setValidFrom(e.target.value)} mono />
                      </FormRow>
                    </FormGrid>
                    <FormRow label="Valid to" hint="A price without an end date cannot be recorded.">
                      <Input type="date" value={validTo} onChange={(e) => setValidTo(e.target.value)} mono />
                    </FormRow>
                    {withPrice && (price == null || !validTo) ? (
                      <p className="text-xs text-ink-500">
                        <Badge tone="outline">Skipped</Badge> The price needs an amount and an end date, otherwise it is
                        left out and the source is saved as price pending.
                      </p>
                    ) : null}
                  </>
                ) : null}
              </div>
            </Panel>
          </>
        ) : null}

        {presenter.showRuleHints ? (
          <RuleHint>
            The same manufacturer, product, grade, pharmacopoeia and plant can exist only once, and a missing plant
            counts as a value rather than as "unknown". Taking a source into the portfolio is refused for a
            blacklisted or inactive manufacturer and for a discontinued source, and a price whose validity overlaps an
            existing row for the same incoterm and tier is refused outright.
          </RuleHint>
        ) : null}

        {error ? <InlineError>{error}</InlineError> : null}

        <div className="flex items-center justify-between gap-3 pb-6">
          <p className="text-xs text-ink-400">
            {editing ? 'Changes are written to the audit log.' : 'The source, filing, portfolio entry and price are saved together.'}
          </p>
          <div className="flex items-center gap-2">
            <Button
              variant="ghost"
              size="md"
              type="button"
              onClick={() => navigate(editing ? `/sources/${id}` : `/manufacturers/${manufacturerId}`)}
            >
              Cancel
            </Button>
            <Button variant="primary" size="md" type="submit" loading={saving} disabled={!canSave}>
              {editing ? 'Save changes' : 'Add source'}
            </Button>
          </div>
        </div>
      </form>
    </div>
  )
}
