/**
 * Record or edit a client requirement (UC-04, AC-04).
 *
 * Three rules shape this screen. The kind, new development or alternate source,
 * is mandatory because it is what the monthly development register counts. An
 * alternate source must name the incumbent and the reason for looking, which
 * the API enforces and this form surfaces inline. And an open requirement for
 * the same client and molecule is a warning, not a block: genuine cases exist,
 * so continuing asks for a reason instead.
 */

import * as React from 'react'
import { useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { AlertTriangle, ArrowLeft, Copy, Split } from 'lucide-react'
import { useCurrentUser, useDb, usePresenter } from '@/data/store'
import { createRequirement, updateRequirement } from '@/data/api'
import {
  ALTERNATE_REASONS,
  CURRENCIES,
  PHARMACOPOEIAS,
  REQUIREMENT_KIND_LABEL,
  REQUIREMENT_STATUS_LABEL,
  UOMS,
} from '@/data/reference'
import { clients as clientList } from '@/data/selectors'
import { runAction } from '@/lib/hooks'
import { fmtDate, fmtQty, todayIso } from '@/lib/utils'
import type { Pharmacopoeia, Requirement, RequirementKind } from '@/data/types'
import {
  Badge,
  Button,
  Combobox,
  DateInput,
  FormGrid,
  FormRow,
  FormSection,
  InlineError,
  Input,
  LinkButton,
  NumberInput,
  Panel,
  PanelHeader,
  PageHeading,
  RadioCards,
  RuleHint,
  Select,
  Switch,
  Textarea,
} from '@/components/ui'
import { NotFound } from '@/features/misc/Fallbacks'

export function RequirementForm() {
  const { id } = useParams()
  const [params] = useSearchParams()
  const db = useDb()
  const navigate = useNavigate()
  const user = useCurrentUser()
  const presenter = usePresenter()
  const editing = Boolean(id)
  const existing = id ? db.requirements.find((r) => r.id === id) : undefined

  const [clientCompanyId, setClientCompanyId] = React.useState(
    existing?.clientCompanyId ?? params.get('client') ?? '',
  )
  const [productId, setProductId] = React.useState(existing?.productId ?? params.get('product') ?? '')
  const [kind, setKind] = React.useState<RequirementKind | null>(existing?.kind ?? null)
  const [currentSourceNote, setCurrentSourceNote] = React.useState(existing?.currentSourceNote ?? '')
  const [alternateReason, setAlternateReason] = React.useState(existing?.alternateReason ?? '')
  const [estAnnualQty, setEstAnnualQty] = React.useState<number | null>(existing?.estAnnualQty ?? null)
  const [qtyUom, setQtyUom] = React.useState(existing?.qtyUom ?? 'KG')
  const [qtyIsIndicative, setQtyIsIndicative] = React.useState(existing?.qtyIsIndicative ?? false)
  const [targetPrice, setTargetPrice] = React.useState<number | null>(existing?.targetPrice ?? null)
  const [targetCurrency, setTargetCurrency] = React.useState(existing?.targetCurrency ?? 'USD')
  const [enquiryDate, setEnquiryDate] = React.useState(existing?.enquiryDate ?? todayIso())
  const [requiredByDate, setRequiredByDate] = React.useState(existing?.requiredByDate ?? '')
  const [requiredPharmacopoeia, setRequiredPharmacopoeia] = React.useState(
    existing?.requiredPharmacopoeia ?? '',
  )
  const [requiredGrade, setRequiredGrade] = React.useState(existing?.requiredGrade ?? '')
  const [requestingContactId, setRequestingContactId] = React.useState(existing?.requestingContactId ?? '')
  const [ownerUserId, setOwnerUserId] = React.useState(existing?.ownerUserId ?? user?.id ?? '')
  const [remarks, setRemarks] = React.useState(existing?.remarks ?? '')
  const [status, setStatus] = React.useState(existing?.status ?? 'OPEN')
  const [duplicateReason, setDuplicateReason] = React.useState(existing?.duplicateReason ?? '')
  const [continueAnyway, setContinueAnyway] = React.useState(false)
  const [saving, setSaving] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)

  if (editing && !existing) return <NotFound />

  const client = db.companies.find((c) => c.id === clientCompanyId)
  const contacts = db.contacts.filter((c) => c.companyId === clientCompanyId && c.isActive)

  // UC-04 2b: an open requirement for the same client and molecule.
  const duplicate = React.useMemo(() => {
    if (editing || !clientCompanyId || !productId) return null
    return (
      db.requirements.find(
        (r) =>
          r.clientCompanyId === clientCompanyId &&
          r.productId === productId &&
          ['OPEN', 'SOURCING', 'ENGAGED'].includes(r.status),
      ) ?? null
    )
  }, [db.requirements, clientCompanyId, productId, editing])

  const needsIncumbent = kind === 'ALTERNATE_SOURCE'
  const kindMissing = kind == null
  const duplicateBlocking = Boolean(duplicate) && !continueAnyway
  const duplicateNeedsReason = Boolean(duplicate) && continueAnyway && !duplicateReason.trim()

  const problem =
    !clientCompanyId
      ? 'Choose the client who asked.'
      : !productId
        ? 'Choose the molecule.'
        : kindMissing
          ? 'Choose whether this is a new development or an alternate source. The kind drives the monthly development register and cannot be inferred.'
          : needsIncumbent && !currentSourceNote.trim()
            ? 'Name the source the client buys from today.'
            : needsIncumbent && !alternateReason
              ? 'Choose why the client is looking for another source.'
              : duplicateBlocking
                ? 'An open requirement already exists for this client and molecule. Open it, or choose to create another one anyway.'
                : duplicateNeedsReason
                  ? 'Write why a second open requirement is needed.'
                  : null

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    if (problem) {
      setError(problem)
      return
    }
    setSaving(true)
    const payload = {
      clientCompanyId,
      productId,
      kind: kind!,
      enquiryDate,
      requiredByDate: requiredByDate || null,
      estAnnualQty,
      qtyUom: estAnnualQty != null ? qtyUom : null,
      qtyIsIndicative,
      targetPrice,
      targetCurrency: targetPrice != null ? targetCurrency : null,
      requiredPharmacopoeia: (requiredPharmacopoeia || null) as Pharmacopoeia | null,
      requiredGrade: requiredGrade.trim() || null,
      currentSourceNote: needsIncumbent ? currentSourceNote.trim() : null,
      alternateReason: needsIncumbent ? alternateReason : null,
      requestingContactId: requestingContactId || null,
      ownerUserId,
      duplicateReason: duplicate ? duplicateReason.trim() : (existing?.duplicateReason ?? null),
      remarks: remarks.trim() || null,
      status: status as Requirement['status'],
    }

    if (editing) {
      const saved = await runAction(() => updateRequirement(id!, payload), {
        success: 'Requirement updated.',
        onError: setError,
      })
      setSaving(false)
      if (saved !== null) navigate(`/requirements/${id}`)
      return
    }

    const created = await runAction(() => createRequirement(payload), {
      success: 'Requirement recorded. The candidate sources are listed below it.',
      onError: setError,
    })
    setSaving(false)
    if (created) navigate(`/requirements/${created.id}`)
  }

  const clientWarning =
    client?.client && (client.client.status === 'LOST' || client.client.status === 'DORMANT')
      ? `${client.displayName} is marked ${client.client.status === 'LOST' ? 'lost' : 'dormant'}. Recording a requirement is a sign the relationship is live again, so review the client record afterwards.`
      : null

  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <PageHeading
        title={editing ? 'Edit requirement' : 'Record a requirement'}
        subtitle={
          editing
            ? 'The kind and the client cannot be guessed later, so correct them here rather than opening a second record.'
            : 'What one client wants, in their words and their units. Saving it searches the portfolio immediately.'
        }
        actions={
          <LinkButton
            to={editing ? `/requirements/${id}` : '/requirements'}
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
          <PanelHeader title="Who asked, and for what" />
          <div className="space-y-4 p-4">
            <FormGrid>
              <FormRow label="Client" required hint="Any Full Access user may record a requirement for any client.">
                <Combobox
                  value={clientCompanyId || null}
                  onChange={(v) => {
                    setClientCompanyId(v)
                    setRequestingContactId('')
                  }}
                  options={clientList(db).map((c) => ({
                    value: c.id,
                    label: c.displayName,
                    description: c.countryCode,
                  }))}
                  placeholder="Search for the client"
                  invalid={Boolean(error) && !clientCompanyId}
                />
              </FormRow>
              <FormRow label="Molecule" required hint="If the molecule is genuinely new, add it to the catalogue first.">
                <Combobox
                  value={productId || null}
                  onChange={setProductId}
                  options={db.products
                    .filter((p) => p.isActive)
                    .map((p) => ({
                      value: p.id,
                      label: p.genericName,
                      description: p.casNumber ? `CAS ${p.casNumber}` : undefined,
                    }))}
                  placeholder="Search for the molecule"
                  invalid={Boolean(error) && !productId}
                  footer={
                    <LinkButton to="/products/new" variant="ghost" size="sm">
                      Add a product
                    </LinkButton>
                  }
                />
              </FormRow>
            </FormGrid>

            {clientWarning ? (
              <p className="flex items-start gap-1.5 rounded border border-warn-200 bg-warn-50 px-2 py-1.5 text-xs leading-relaxed text-warn-600">
                {clientWarning}
              </p>
            ) : null}

            <FormRow
              label="Kind of requirement"
              required
              error={
                Boolean(error) && kindMissing
                  ? 'Choose a kind. The new or alternate distinction drives the monthly development register and cannot be inferred.'
                  : undefined
              }
            >
              <RadioCards
                value={kind}
                onChange={setKind}
                columns={2}
                options={[
                  {
                    value: 'NEW_DEVELOPMENT',
                    label: REQUIREMENT_KIND_LABEL.NEW_DEVELOPMENT,
                    icon: <Split className="h-3.5 w-3.5" />,
                    description: 'A molecule this client has never bought.',
                  },
                  {
                    value: 'ALTERNATE_SOURCE',
                    label: REQUIREMENT_KIND_LABEL.ALTERNATE_SOURCE,
                    icon: <Copy className="h-3.5 w-3.5" />,
                    description: 'A second or replacement source for something they already buy.',
                  },
                ]}
              />
            </FormRow>

            {needsIncumbent ? (
              <FormGrid>
                <FormRow
                  label="Current source"
                  required
                  hint="Who the client buys from today, as they described it."
                  error={Boolean(error) && !currentSourceNote.trim() ? 'Name the incumbent source.' : undefined}
                >
                  <Input
                    value={currentSourceNote}
                    onChange={(e) => setCurrentSourceNote(e.target.value)}
                    placeholder="Biocon, through a local indentor"
                  />
                </FormRow>
                <FormRow
                  label="Reason for an alternate"
                  required
                  error={Boolean(error) && !alternateReason ? 'Choose a reason.' : undefined}
                >
                  <Select
                    value={alternateReason}
                    onChange={setAlternateReason}
                    placeholder="Choose a reason"
                    options={ALTERNATE_REASONS.map((r) => ({ value: r.code, label: r.label }))}
                  />
                </FormRow>
              </FormGrid>
            ) : null}
          </div>
        </Panel>

        {duplicate ? (
          <Panel className="border-warn-200 bg-warn-50/60">
            <div className="space-y-2.5 p-4">
              <p className="flex items-center gap-1.5 text-sm font-semibold text-warn-600">
                <AlertTriangle className="h-4 w-4" />
                This client already has an open requirement for this molecule
              </p>
              <div className="flex flex-wrap items-center gap-2 rounded border border-paper-300 bg-white px-2.5 py-2">
                <span className="text-sm font-medium text-ink-900">
                  {REQUIREMENT_KIND_LABEL[duplicate.kind]}
                </span>
                <Badge tone="info">{REQUIREMENT_STATUS_LABEL[duplicate.status]}</Badge>
                <span className="text-xs text-ink-500">recorded {fmtDate(duplicate.enquiryDate)}</span>
                <span className="text-xs tabular text-ink-500">
                  {fmtQty(duplicate.estAnnualQty, duplicate.qtyUom)}
                </span>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <Button
                  type="button"
                  variant="primary"
                  size="sm"
                  onClick={() => navigate(`/requirements/${duplicate.id}`)}
                >
                  Open existing
                </Button>
                <Button
                  type="button"
                  variant={continueAnyway ? 'subtle' : 'secondary'}
                  size="sm"
                  onClick={() => setContinueAnyway(true)}
                >
                  Create anyway
                </Button>
              </div>
              {continueAnyway ? (
                <FormRow
                  label="Why a second requirement is needed"
                  required
                  hint="A different grade, a different factory or a separate tender are all good reasons. It is written to the record."
                  error={Boolean(error) && duplicateNeedsReason ? 'Write the reason.' : undefined}
                >
                  <Input
                    value={duplicateReason}
                    onChange={(e) => setDuplicateReason(e.target.value)}
                    placeholder="Different grade for the Gazipur plant"
                  />
                </FormRow>
              ) : null}
            </div>
          </Panel>
        ) : null}

        <Panel>
          <PanelHeader title="Volume, price and dates" subtitle="The client's own figures, in the client's own units" />
          <div className="space-y-4 p-4">
            <FormSection title="Quantity">
              <FormGrid cols={3}>
                <FormRow label="Estimated annual quantity">
                  <NumberInput value={estAnnualQty} onChange={setEstAnnualQty} min={0} placeholder="2000" />
                </FormRow>
                <FormRow label="Unit">
                  <Select value={qtyUom} onChange={setQtyUom} options={UOMS.map((u) => ({ value: u, label: u }))} />
                </FormRow>
                <FormRow label="Confidence">
                  <div className="pt-1">
                    <Switch
                      checked={qtyIsIndicative}
                      onChange={setQtyIsIndicative}
                      label="Indicative only"
                      description="Kept out of value-weighted pipeline reports."
                    />
                  </div>
                </FormRow>
              </FormGrid>
            </FormSection>

            <FormSection title="Price and timing">
              <FormGrid cols={3}>
                <FormRow label="Target price" hint="What the client hopes to pay, per unit.">
                  <NumberInput value={targetPrice} onChange={setTargetPrice} min={0} placeholder="95" />
                </FormRow>
                <FormRow label="Currency">
                  <Select
                    value={targetCurrency}
                    onChange={setTargetCurrency}
                    options={CURRENCIES.map((c) => ({ value: c, label: c }))}
                  />
                </FormRow>
                <FormRow label="Required by" hint="When the client needs first supply.">
                  <DateInput value={requiredByDate} onChange={(e) => setRequiredByDate(e.target.value)} />
                </FormRow>
              </FormGrid>
              <FormGrid>
                <FormRow label="Enquiry date" required hint="The day the client asked.">
                  <DateInput
                    value={enquiryDate}
                    max={todayIso()}
                    onChange={(e) => setEnquiryDate(e.target.value)}
                  />
                </FormRow>
                {editing ? (
                  <FormRow label="Status" hint="Closing a requirement leaves its engagements untouched.">
                    <Select
                      value={status}
                      onChange={(v) => setStatus(v as Requirement['status'])}
                      options={Object.entries(REQUIREMENT_STATUS_LABEL).map(([value, label]) => ({ value, label }))}
                    />
                  </FormRow>
                ) : null}
              </FormGrid>
            </FormSection>
          </div>
        </Panel>

        <Panel>
          <PanelHeader
            title="Specification and people"
            subtitle="A named pharmacopoeia narrows the candidate sources, so record it only if the client insisted"
          />
          <div className="space-y-4 p-4">
            <FormGrid cols={2}>
              <FormRow
                label="Required pharmacopoeia"
                hint="Leave blank when any standard is acceptable. Naming one excludes every other grade from the match."
              >
                <Select
                  value={requiredPharmacopoeia}
                  onChange={(v) => setRequiredPharmacopoeia(v as Pharmacopoeia | '')}
                  allowEmpty
                  emptyLabel="Any standard"
                  placeholder="Any standard"
                  options={PHARMACOPOEIAS.map((p) => ({ value: p, label: p }))}
                />
              </FormRow>
              <FormRow label="Required grade" hint="For example micronised, or a particular particle size.">
                <Input
                  value={requiredGrade}
                  onChange={(e) => setRequiredGrade(e.target.value)}
                  placeholder="Micronised"
                />
              </FormRow>
            </FormGrid>
            <FormGrid cols={2}>
              <FormRow
                label="Requesting contact"
                hint={clientCompanyId ? undefined : 'Choose the client first.'}
              >
                <Select
                  value={requestingContactId}
                  onChange={setRequestingContactId}
                  allowEmpty
                  emptyLabel="Not recorded"
                  placeholder="Not recorded"
                  disabled={!clientCompanyId || contacts.length === 0}
                  options={contacts.map((c) => ({
                    value: c.id,
                    label: c.fullName,
                    description: c.designation ?? undefined,
                  }))}
                />
              </FormRow>
              <FormRow label="Owner" required hint="Who chases this requirement.">
                <Select
                  value={ownerUserId}
                  onChange={setOwnerUserId}
                  options={db.users.filter((u) => u.isActive).map((u) => ({ value: u.id, label: u.fullName }))}
                />
              </FormRow>
            </FormGrid>
            <FormRow label="Remarks" hint="Anything about the enquiry the next person should know.">
              <Textarea value={remarks} onChange={(e) => setRemarks(e.target.value)} rows={3} />
            </FormRow>
          </div>
        </Panel>

        {presenter.showRuleHints ? (
          <RuleHint>
            An alternate-source requirement is refused without the current source and a reason, because the whole point
            of the record is to say what the client is replacing and why. The kind is refused if left blank, since the
            monthly register counts new developments separately from alternate sources.
          </RuleHint>
        ) : null}

        {error ? <InlineError>{error}</InlineError> : null}

        <div className="flex items-center justify-between gap-3 pb-6">
          <p className="text-xs text-ink-400">
            {editing ? 'Changes are written to the audit log.' : 'The enquiry is written to the audit log.'}
          </p>
          <div className="flex items-center gap-2">
            <Button
              type="button"
              variant="ghost"
              size="md"
              onClick={() => navigate(editing ? `/requirements/${id}` : '/requirements')}
            >
              Cancel
            </Button>
            <Button variant="primary" size="md" type="submit" loading={saving}>
              {editing ? 'Save changes' : 'Record requirement'}
            </Button>
          </div>
        </div>
      </form>
    </div>
  )
}
