/**
 * Add or edit a product (UC-02).
 *
 * The duplicate rules are the point of this screen: an exact name in the same
 * category is blocked, a near match or a shared CAS number warns and needs an
 * explicit confirmation, and the same name in another category is allowed.
 */

import * as React from 'react'
import { useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { AlertTriangle, ArrowLeft, Check, Info } from 'lucide-react'
import { useDb } from '@/data/store'
import { checkProductDuplicate } from '@/data/rules'
import { createProduct, updateProduct } from '@/data/api'
import { PRODUCT_CATEGORY_LABEL, THERAPEUTIC_CATEGORIES, UOMS } from '@/data/reference'
import { runAction } from '@/lib/hooks'
import type { ProductCategory } from '@/data/types'
import {
  Badge,
  Button,
  Checkbox,
  FormGrid,
  FormRow,
  Input,
  InlineError,
  InlineWarning,
  LinkButton,
  Panel,
  PanelHeader,
  PageHeading,
  RadioCards,
  RuleHint,
  Select,
  TagInput,
  Textarea,
} from '@/components/ui'
import { NotFound } from '@/features/misc/Fallbacks'
import { usePresenter } from '@/data/store'

export function ProductForm() {
  const { id } = useParams()
  const [params] = useSearchParams()
  const db = useDb()
  const navigate = useNavigate()
  const presenter = usePresenter()
  const editing = Boolean(id)
  const existing = id ? db.products.find((p) => p.id === id) : undefined

  const [genericName, setGenericName] = React.useState(existing?.genericName ?? params.get('name') ?? '')
  const [category, setCategory] = React.useState<ProductCategory>(existing?.category ?? 'API')
  const [casNumber, setCasNumber] = React.useState(existing?.casNumber ?? '')
  const [defaultUom, setDefaultUom] = React.useState(existing?.defaultUom ?? 'KG')
  const [hsCode, setHsCode] = React.useState(existing?.hsCode ?? '')
  const [description, setDescription] = React.useState(existing?.description ?? '')
  const [synonyms, setSynonyms] = React.useState<string[]>(existing?.synonyms ?? [])
  const [therapeutic, setTherapeutic] = React.useState<string[]>(existing?.therapeuticCategories ?? [])
  const [acknowledged, setAcknowledged] = React.useState(false)
  const [saving, setSaving] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)

  if (editing && !existing) return <NotFound />

  const dup = React.useMemo(
    () => checkProductDuplicate(genericName, category, casNumber || null, db.products, id),
    [genericName, category, casNumber, db.products, id],
  )

  const nameTouched = genericName.trim().length > 1
  const blocked = nameTouched && Boolean(dup.exact)
  const needsAck = nameTouched && !dup.exact && (dup.near.length > 0 || Boolean(dup.sameCas))
  const canSave = nameTouched && !blocked && (!needsAck || acknowledged)

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    if (!canSave) return
    setSaving(true)
    const payload = {
      genericName: genericName.trim(),
      category,
      casNumber: casNumber.trim() || null,
      defaultUom,
      hsCode: hsCode.trim() || null,
      description: description.trim() || null,
      synonyms,
      therapeuticCategories: therapeutic,
      possibleDuplicate: needsAck,
    }
    const result = await runAction(
      () => (editing ? updateProduct(id!, payload) : createProduct(payload)),
      {
        success: editing ? `${payload.genericName} updated.` : `${payload.genericName} added to the catalogue.`,
        onError: setError,
      },
    )
    setSaving(false)
    if (result) navigate(`/products/${editing ? id : (result as { id: string }).id}`)
  }

  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <PageHeading
        title={editing ? `Edit ${existing!.genericName}` : 'Add a product'}
        subtitle={
          editing
            ? 'Changing the name re-runs the duplicate check.'
            : 'One molecule, entered once, used everywhere. Synonyms make it findable however colleagues spell it.'
        }
        actions={
          <LinkButton
            to={editing ? `/products/${id}` : '/products'}
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
          <PanelHeader title="Identity" subtitle="How the molecule is named and classified" />
          <div className="space-y-4 p-4">
            <FormGrid>
              <FormRow
                label="Generic name"
                required
                error={blocked ? 'A product with this name already exists in this category.' : undefined}
                hint={!blocked ? 'The non-proprietary molecule name, e.g. Esomeprazole Magnesium.' : undefined}
              >
                <Input
                  value={genericName}
                  onChange={(e) => {
                    setGenericName(e.target.value)
                    setAcknowledged(false)
                  }}
                  invalid={blocked}
                  autoFocus
                  placeholder="Budesonide"
                />
              </FormRow>
              <FormRow label="Default unit of measure" required hint="Quantities are always stored with a unit.">
                <Select
                  value={defaultUom}
                  onChange={setDefaultUom}
                  options={UOMS.map((u) => ({ value: u, label: u }))}
                />
              </FormRow>
            </FormGrid>

            <FormRow label="Category" required>
              <RadioCards
                value={category}
                onChange={(v) => {
                  setCategory(v)
                  setAcknowledged(false)
                }}
                columns={2}
                options={(Object.keys(PRODUCT_CATEGORY_LABEL) as ProductCategory[]).map((c) => ({
                  value: c,
                  label: PRODUCT_CATEGORY_LABEL[c],
                  description:
                    c === 'API'
                      ? 'The active ingredient.'
                      : c === 'EXCIPIENT'
                        ? 'Inactive material: binder, filler, antioxidant.'
                        : c === 'INTERMEDIATE'
                          ? 'A chemical step before the finished API.'
                          : 'Anything else TCL trades.',
                }))}
              />
            </FormRow>

            <FormGrid>
              <FormRow label="CAS number" hint="Blank is accepted, but the record is flagged as incomplete.">
                <Input value={casNumber} onChange={(e) => setCasNumber(e.target.value)} placeholder="51333-22-3" mono />
              </FormRow>
              <FormRow label="HS code" hint="Customs tariff code, useful at import.">
                <Input value={hsCode} onChange={(e) => setHsCode(e.target.value)} placeholder="2941.90.10" mono />
              </FormRow>
            </FormGrid>
          </div>
        </Panel>

        {blocked ? (
          <InlineError>
            <span>
              <strong>{dup.exact!.name}</strong> already exists in this category.{' '}
              <button
                type="button"
                onClick={() => navigate(`/products/${dup.exact!.id}`)}
                className="font-medium underline"
              >
                Open the existing product
              </button>{' '}
              instead of creating a second one.
            </span>
          </InlineError>
        ) : null}

        {dup.otherCategory ? (
          <InlineWarning>
            <span>
              <strong>{dup.otherCategory.name}</strong> already exists as{' '}
              {PRODUCT_CATEGORY_LABEL[dup.otherCategory.category as ProductCategory]}. That is allowed — the same name
              can be an excipient in one context and an API in another.
            </span>
          </InlineWarning>
        ) : null}

        {needsAck ? (
          <Panel className="border-warn-200 bg-warn-50/60">
            <div className="space-y-2.5 p-4">
              <p className="flex items-center gap-1.5 text-sm font-semibold text-warn-600">
                <AlertTriangle className="h-4 w-4" />
                This looks like something already in the catalogue
              </p>
              {dup.near.length > 0 ? (
                <div className="space-y-1">
                  <p className="text-xs text-ink-600">Similar names:</p>
                  <ul className="flex flex-wrap gap-1.5">
                    {dup.near.map((n) => (
                      <li key={n.id}>
                        <button
                          type="button"
                          onClick={() => navigate(`/products/${n.id}`)}
                          className="rounded border border-paper-300 bg-white px-2 py-1 text-xs text-ink-800 transition-colors hover:border-accent-400"
                        >
                          {n.name}
                          <span className="ml-1.5 text-2xs text-ink-400">{Math.round(n.score * 100)}% alike</span>
                        </button>
                      </li>
                    ))}
                  </ul>
                </div>
              ) : null}
              {dup.sameCas ? (
                <p className="text-xs text-ink-700">
                  CAS {casNumber} is already recorded against{' '}
                  <button
                    type="button"
                    onClick={() => navigate(`/products/${dup.sameCas!.id}`)}
                    className="font-medium underline"
                  >
                    {dup.sameCas.name}
                  </button>
                  . The same CAS on two products almost always means a duplicate.
                </p>
              ) : null}
              <Checkbox
                checked={acknowledged}
                onChange={setAcknowledged}
                label="I have checked these and this is genuinely a different product"
              />
              <p className="text-2xs text-ink-500">
                The new record will be tagged for duplicate review either way.
              </p>
            </div>
          </Panel>
        ) : null}

        <Panel>
          <PanelHeader title="Findability" subtitle="How colleagues will look for it" />
          <div className="space-y-4 p-4">
            <FormRow
              label="Synonyms and alternate spellings"
              hint="Searched alongside the generic name. Record both “Dextromethorphan HBr” and “Dextromethorphan Hydrobromide”."
            >
              <TagInput values={synonyms} onChange={setSynonyms} placeholder="Add a synonym and press Enter" />
            </FormRow>

            <FormRow label="Therapeutic areas" hint="Used by the reports and the product filters.">
              <div className="flex flex-wrap gap-1.5">
                {THERAPEUTIC_CATEGORIES.map((t) => {
                  const on = therapeutic.includes(t)
                  return (
                    <button
                      key={t}
                      type="button"
                      onClick={() => setTherapeutic((prev) => (on ? prev.filter((x) => x !== t) : [...prev, t]))}
                      className={
                        on
                          ? 'rounded border border-accent-500 bg-accent-50 px-2 py-1 text-xs font-medium text-accent-800'
                          : 'rounded border border-paper-300 bg-white px-2 py-1 text-xs text-ink-600 transition-colors hover:border-paper-400'
                      }
                    >
                      {on ? <Check className="mr-1 inline h-3 w-3" /> : null}
                      {t}
                    </button>
                  )
                })}
              </div>
            </FormRow>

            <FormRow label="Notes" hint="Anything the team should know about this molecule.">
              <Textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={3} />
            </FormRow>
          </div>
        </Panel>

        {presenter.showRuleHints ? (
          <RuleHint>
            The database refuses a second product with the same normalised name in the same category, so two people
            cannot create “Budesonide” and “budesonide ” in parallel. A near match or a shared CAS number only warns —
            legitimate cases exist — but the record is tagged for review.
          </RuleHint>
        ) : null}

        {error ? <InlineError>{error}</InlineError> : null}

        <div className="flex items-center justify-between gap-3 pb-6">
          <p className="text-xs text-ink-400">
            {editing ? 'Changes are written to the audit log.' : 'Creation is written to the audit log.'}
          </p>
          <div className="flex items-center gap-2">
            <Button
              variant="ghost"
              size="md"
              type="button"
              onClick={() => navigate(editing ? `/products/${id}` : '/products')}
            >
              Cancel
            </Button>
            <Button variant="primary" size="md" type="submit" loading={saving} disabled={!canSave}>
              {editing ? 'Save changes' : 'Add product'}
            </Button>
          </div>
        </div>
      </form>
    </div>
  )
}

export { Badge, Info }
