/**
 * Register or edit a client (FR-M5-01 to FR-M5-08).
 *
 * Two things carry this screen. First, the duplicate rules: the same legal name
 * in the same country is blocked outright, a near match warns and needs an
 * explicit acknowledgement, and the record is then tagged for review. Second,
 * every client must have an owning BD officer (FR-M5-04), so the field is
 * required rather than optional.
 *
 * On create, one site and one contact can be entered inline, because a client
 * with neither is of little use to anyone preparing a visit.
 */

import * as React from 'react'
import { useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { AlertTriangle, ArrowLeft } from 'lucide-react'
import { usePresenter, useDb, useSettings } from '@/data/store'
import { checkCompanyDuplicate } from '@/data/rules'
import { createCompany, createContact, createSite, updateCompany } from '@/data/api'
import {
  CLIENT_STATUS_LABEL,
  COUNTRIES,
  CURRENCIES,
  PAYMENT_TERMS,
  SITE_KIND_LABEL_CLIENT,
  THERAPEUTIC_CATEGORIES,
} from '@/data/reference'
import { runAction } from '@/lib/hooks'
import type { ClientStatus, SiteKind } from '@/data/types'
import {
  Badge,
  Button,
  Checkbox,
  DateInput,
  FormGrid,
  FormRow,
  Input,
  InlineError,
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

const CLIENT_DEPARTMENTS = ['Purchase', 'QA', 'QC', 'R&D', 'Regulatory', 'Accounts']

const STATUS_DESCRIPTION: Record<ClientStatus, string> = {
  PROSPECT: 'Approached, nothing taken yet.',
  ACTIVE: 'Currently buying through TCL.',
  DORMANT: 'Has bought before, nothing moving now.',
  LOST: 'Gone elsewhere. Kept for the history.',
}

export function ClientForm() {
  const { id } = useParams()
  const [params] = useSearchParams()
  const db = useDb()
  const settings = useSettings()
  const navigate = useNavigate()
  const presenter = usePresenter()
  const editing = Boolean(id)
  const existing = id ? db.companies.find((c) => c.id === id) : undefined

  const [legalName, setLegalName] = React.useState(existing?.legalName ?? params.get('name') ?? '')
  const [displayName, setDisplayName] = React.useState(existing?.displayName ?? params.get('name') ?? '')
  const [countryCode, setCountryCode] = React.useState(existing?.countryCode ?? 'BD')
  const [website, setWebsite] = React.useState(existing?.website ?? '')
  const [generalEmail, setGeneralEmail] = React.useState(existing?.generalEmail ?? '')
  const [generalPhone, setGeneralPhone] = React.useState(existing?.generalPhone ?? '')
  const [notes, setNotes] = React.useState(existing?.notes ?? '')

  const [status, setStatus] = React.useState<ClientStatus>(existing?.client?.status ?? 'PROSPECT')
  const [ownerUserId, setOwnerUserId] = React.useState(existing?.client?.ownerUserId ?? '')
  const [paymentTermCode, setPaymentTermCode] = React.useState(existing?.client?.paymentTermCode ?? '')
  const [creditLimit, setCreditLimit] = React.useState<number | null>(existing?.client?.creditLimit ?? null)
  const [creditCurrency, setCreditCurrency] = React.useState(existing?.client?.creditCurrency ?? 'USD')
  const [minShelfLifeMonths, setMinShelfLifeMonths] = React.useState<number | null>(
    existing?.client?.minShelfLifeMonths ?? null,
  )
  const [therapeuticFocus, setTherapeuticFocus] = React.useState(existing?.client?.therapeuticFocus ?? '')
  const [firstBusinessDate, setFirstBusinessDate] = React.useState(existing?.client?.firstBusinessDate ?? '')

  // inline first site and first contact, create only
  const [siteName, setSiteName] = React.useState('')
  const [siteKind, setSiteKind] = React.useState<SiteKind>('HEAD_OFFICE')
  const [siteCity, setSiteCity] = React.useState('')
  const [siteAddress, setSiteAddress] = React.useState('')
  const [contactName, setContactName] = React.useState('')
  const [contactDepartment, setContactDepartment] = React.useState('Purchase')
  const [contactDesignation, setContactDesignation] = React.useState('')
  const [contactEmail, setContactEmail] = React.useState('')
  const [contactPhone, setContactPhone] = React.useState('')

  const [acknowledged, setAcknowledged] = React.useState(false)
  const [saving, setSaving] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)

  if (editing && (!existing || !existing.client)) return <NotFound />

  const dup = React.useMemo(
    () => checkCompanyDuplicate(legalName, countryCode, db.companies, id),
    [legalName, countryCode, db.companies, id],
  )

  const owners = db.users
    .filter((u) => u.isActive && u.activatedAt && u.roleCode === 'FULL_ACCESS')
    .map((u) => ({
      value: u.id,
      label: u.fullName,
      description: u.department ?? undefined,
    }))

  const nameTouched = legalName.trim().length > 1
  const blocked = nameTouched && Boolean(dup.exact)
  const needsAck = nameTouched && !dup.exact && dup.near.length > 0
  const ownerMissing = !ownerUserId
  const canSave = nameTouched && displayName.trim().length > 0 && !ownerMissing && !blocked && (!needsAck || acknowledged)

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    if (!canSave) return
    setSaving(true)

    const profile = {
      status,
      ownerUserId,
      paymentTermCode: paymentTermCode || null,
      creditLimit,
      creditCurrency: creditLimit != null ? creditCurrency : null,
      minShelfLifeMonths,
      therapeuticFocus: therapeuticFocus.trim() || null,
      firstBusinessDate: firstBusinessDate || null,
    }
    const payload = {
      kind: 'CLIENT' as const,
      legalName: legalName.trim(),
      displayName: displayName.trim(),
      countryCode,
      website: website.trim() || null,
      generalEmail: generalEmail.trim() || null,
      generalPhone: generalPhone.trim() || null,
      notes: notes.trim() || null,
      possibleDuplicate: needsAck,
      client: profile,
    }

    const result = await runAction(
      () => (editing ? updateCompany(id!, payload) : createCompany(payload)),
      {
        success: editing ? `${payload.displayName} updated.` : `${payload.displayName} registered.`,
        onError: setError,
      },
    )

    if (result && !editing) {
      const newId = result.id
      if (siteName.trim()) {
        await runAction(() =>
          createSite({
            companyId: newId,
            kind: siteKind,
            name: siteName.trim(),
            city: siteCity.trim() || null,
            countryCode,
            addressLine: siteAddress.trim() || null,
            isPrimary: true,
            isDeliveryDestination: siteKind === 'PLANT' || siteKind === 'WAREHOUSE',
          }),
        )
      }
      if (contactName.trim()) {
        await runAction(() =>
          createContact({
            companyId: newId,
            siteId: null,
            fullName: contactName.trim(),
            designation: contactDesignation.trim() || null,
            department: contactDepartment,
            email: contactEmail.trim() || null,
            phone: contactPhone.trim() || null,
            isPrimary: true,
          }),
        )
      }
    }

    setSaving(false)
    if (result) navigate(`/clients/${editing ? id : result.id}`)
  }

  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <PageHeading
        title={editing ? `Edit ${existing!.displayName}` : 'Register a client'}
        subtitle={
          editing
            ? 'Changing the legal name re-runs the duplicate check.'
            : 'One record per buying company. Sites, contacts and engagements all hang off it.'
        }
        actions={
          <Button
            variant="ghost"
            size="md"
            type="button"
            icon={<ArrowLeft className="h-3.5 w-3.5" />}
            onClick={() => navigate(editing ? `/clients/${id}` : '/clients')}
          >
            Cancel
          </Button>
        }
      />

      <form onSubmit={submit} className="space-y-4">
        <Panel>
          <PanelHeader title="Identity" subtitle="How the company is named on paper and in conversation" />
          <div className="space-y-4 p-4">
            <FormGrid>
              <FormRow
                label="Legal name"
                required
                error={blocked ? 'A client with this legal name already exists in this country.' : undefined}
                hint={!blocked ? 'As it appears on the letter of credit and the invoice.' : undefined}
              >
                <Input
                  value={legalName}
                  onChange={(e) => {
                    setLegalName(e.target.value)
                    setAcknowledged(false)
                    if (!editing && !displayName.trim()) setDisplayName(e.target.value)
                  }}
                  invalid={blocked}
                  autoFocus
                  placeholder="Beximco Pharmaceuticals Limited"
                />
              </FormRow>
              <FormRow label="Display name" required hint="The short name used in lists and on screen.">
                <Input
                  value={displayName}
                  onChange={(e) => setDisplayName(e.target.value)}
                  placeholder="Beximco"
                />
              </FormRow>
            </FormGrid>

            <FormGrid cols={3}>
              <FormRow label="Country" required>
                <Select
                  value={countryCode}
                  onChange={(v) => {
                    setCountryCode(v)
                    setAcknowledged(false)
                  }}
                  options={COUNTRIES.map((c) => ({ value: c.code, label: c.name }))}
                />
              </FormRow>
              <FormRow label="Website">
                <Input value={website} onChange={(e) => setWebsite(e.target.value)} placeholder="https://" />
              </FormRow>
              <FormRow label="General phone">
                <Input value={generalPhone} onChange={(e) => setGeneralPhone(e.target.value)} placeholder="+880" />
              </FormRow>
            </FormGrid>

            <FormRow label="General email" hint="The switchboard address, not a person. People go in Contacts.">
              <Input
                type="email"
                value={generalEmail}
                onChange={(e) => setGeneralEmail(e.target.value)}
                placeholder="info@company.com.bd"
              />
            </FormRow>
          </div>
        </Panel>

        {blocked ? (
          <InlineError>
            <span>
              <strong>{dup.exact!.name}</strong> is already on the register.{' '}
              <button
                type="button"
                onClick={() => navigate(`/clients/${dup.exact!.id}`)}
                className="font-medium underline"
              >
                Open the existing client
              </button>{' '}
              rather than creating a second record for the same company.
            </span>
          </InlineError>
        ) : null}

        {needsAck ? (
          <Panel className="border-warn-200 bg-warn-50/60">
            <div className="space-y-2.5 p-4">
              <p className="flex items-center gap-1.5 text-sm font-semibold text-warn-600">
                <AlertTriangle className="h-4 w-4" />
                This looks like a company already on the register
              </p>
              <div className="space-y-1">
                <p className="text-xs text-ink-600">Similar legal names:</p>
                <ul className="flex flex-wrap gap-1.5">
                  {dup.near.map((n) => (
                    <li key={n.id}>
                      <button
                        type="button"
                        onClick={() => navigate(`/clients/${n.id}`)}
                        className="rounded border border-paper-300 bg-white px-2 py-1 text-xs text-ink-800 transition-colors hover:border-accent-400"
                      >
                        {n.name}
                        <span className="ml-1.5 text-2xs text-ink-400">{Math.round(n.score * 100)}% alike</span>
                      </button>
                    </li>
                  ))}
                </ul>
              </div>
              <Checkbox
                checked={acknowledged}
                onChange={setAcknowledged}
                label="I have checked these and this is a genuinely different company"
              />
              <p className="text-2xs text-ink-500">The new record will be tagged for duplicate review either way.</p>
            </div>
          </Panel>
        ) : null}

        <Panel>
          <PanelHeader title="Relationship" subtitle="Where the client stands with TCL, and who answers for it" />
          <div className="space-y-4 p-4">
            <FormRow label="Status" required>
              <RadioCards
                value={status}
                onChange={setStatus}
                columns={2}
                options={(Object.keys(CLIENT_STATUS_LABEL) as ClientStatus[]).map((s) => ({
                  value: s,
                  label: CLIENT_STATUS_LABEL[s],
                  description: STATUS_DESCRIPTION[s],
                }))}
              />
            </FormRow>

            <FormGrid>
              <FormRow
                label="Owning BD officer"
                required
                error={ownerMissing && legalName ? 'Every client needs a named owner.' : undefined}
                hint={!ownerMissing ? 'The person a question about this client goes to.' : undefined}
              >
                <Select
                  value={ownerUserId}
                  onChange={setOwnerUserId}
                  options={owners}
                  invalid={ownerMissing && Boolean(legalName)}
                  placeholder="Choose an owner"
                />
              </FormRow>
              <FormRow label="First business date" hint="When the first order was placed. Blank for a prospect.">
                <DateInput value={firstBusinessDate} onChange={(e) => setFirstBusinessDate(e.target.value)} />
              </FormRow>
            </FormGrid>

            <FormRow label="Therapeutic focus" hint="What the company mainly makes. Used by the reports.">
              <Input
                value={therapeuticFocus}
                onChange={(e) => setTherapeuticFocus(e.target.value)}
                placeholder={THERAPEUTIC_CATEGORIES[0]}
                list="client-therapeutic-focus"
              />
              <datalist id="client-therapeutic-focus">
                {THERAPEUTIC_CATEGORIES.map((t) => (
                  <option key={t} value={t} />
                ))}
              </datalist>
            </FormRow>
          </div>
        </Panel>

        <Panel>
          <PanelHeader
            title="Commercial terms"
            subtitle="Recorded for reference. None of it is enforced by the system in v1."
          />
          <div className="space-y-4 p-4">
            <FormGrid cols={3}>
              <FormRow label="Payment terms">
                <Select
                  value={paymentTermCode}
                  onChange={setPaymentTermCode}
                  allowEmpty
                  emptyLabel="Not recorded"
                  placeholder="Not recorded"
                  options={PAYMENT_TERMS.map((p) => ({ value: p.code, label: p.label }))}
                />
              </FormRow>
              <FormRow label="Credit limit" hint="Informational only. Orders are not blocked against it.">
                <NumberInput value={creditLimit} onChange={setCreditLimit} min={0} placeholder="0" />
              </FormRow>
              <FormRow label="Credit currency">
                <Select
                  value={creditCurrency}
                  onChange={setCreditCurrency}
                  disabled={creditLimit == null}
                  options={CURRENCIES.map((c) => ({ value: c, label: c }))}
                />
              </FormRow>
            </FormGrid>

            <FormRow
              label="Minimum remaining shelf life on receipt"
              hint={`Optional. Overrides the company default of ${settings.minShelfLifeMonths} months for this client only. A short-dated consignment then needs a recorded remark.`}
            >
              <NumberInput
                value={minShelfLifeMonths}
                onChange={setMinShelfLifeMonths}
                min={1}
                max={60}
                suffix="months"
                placeholder={String(settings.minShelfLifeMonths)}
              />
            </FormRow>

            <FormRow label="Notes" hint="Anything the team should know before a visit.">
              <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={3} />
            </FormRow>
          </div>
        </Panel>

        {!editing ? (
          <Panel>
            <PanelHeader
              title="First site and first contact"
              subtitle="Optional, and both can be added later from the client page"
              actions={<Badge tone="outline">Create only</Badge>}
            />
            <div className="space-y-4 p-4">
              <FormGrid cols={3}>
                <FormRow label="Site name">
                  <Input
                    value={siteName}
                    onChange={(e) => setSiteName(e.target.value)}
                    placeholder="Corporate office"
                  />
                </FormRow>
                <FormRow
                  label="Site type"
                  hint={
                    siteKind === 'PLANT' || siteKind === 'WAREHOUSE'
                      ? 'A valid delivery destination.'
                      : 'Not a delivery destination.'
                  }
                >
                  <Select
                    value={siteKind}
                    onChange={(v) => setSiteKind(v as SiteKind)}
                    options={(Object.keys(SITE_KIND_LABEL_CLIENT) as SiteKind[]).map((k) => ({
                      value: k,
                      label: SITE_KIND_LABEL_CLIENT[k],
                    }))}
                  />
                </FormRow>
                <FormRow label="City">
                  <Input value={siteCity} onChange={(e) => setSiteCity(e.target.value)} placeholder="Dhaka" />
                </FormRow>
              </FormGrid>
              <FormRow label="Address">
                <Input value={siteAddress} onChange={(e) => setSiteAddress(e.target.value)} />
              </FormRow>

              <FormGrid cols={3}>
                <FormRow label="Contact name">
                  <Input value={contactName} onChange={(e) => setContactName(e.target.value)} />
                </FormRow>
                <FormRow label="Department">
                  <Select
                    value={contactDepartment}
                    onChange={setContactDepartment}
                    options={CLIENT_DEPARTMENTS.map((d) => ({ value: d, label: d }))}
                  />
                </FormRow>
                <FormRow label="Designation">
                  <Input
                    value={contactDesignation}
                    onChange={(e) => setContactDesignation(e.target.value)}
                    placeholder="Manager, Purchase"
                  />
                </FormRow>
              </FormGrid>
              <FormGrid>
                <FormRow label="Contact email">
                  <Input type="email" value={contactEmail} onChange={(e) => setContactEmail(e.target.value)} />
                </FormRow>
                <FormRow label="Contact phone">
                  <Input value={contactPhone} onChange={(e) => setContactPhone(e.target.value)} />
                </FormRow>
              </FormGrid>
            </div>
          </Panel>
        ) : null}

        {presenter.showRuleHints ? (
          <RuleHint>
            The same legal name in the same country is refused outright, so two people cannot create “Square
            Pharmaceuticals Ltd” and “Square Pharmaceuticals Limited” in parallel. A near match only warns, because
            group companies legitimately share a name, but the record is tagged for review. An owning BD officer is
            required, so no client is left without someone to answer for it.
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
              onClick={() => navigate(editing ? `/clients/${id}` : '/clients')}
            >
              Cancel
            </Button>
            <Button variant="primary" size="md" type="submit" loading={saving} disabled={!canSave}>
              {editing ? 'Save changes' : 'Register client'}
            </Button>
          </div>
        </div>
      </form>
    </div>
  )
}
