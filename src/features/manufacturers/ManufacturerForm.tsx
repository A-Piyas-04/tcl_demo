/**
 * Register or edit a manufacturer (UC-01), implementing FR-M2-01 to FR-M2-06.
 *
 * The duplicate rules are the point of this screen. An exact legal name in the
 * same country is blocked and the existing record is named; if that record is
 * blacklisted, the reason and the date it was applied are shown (UC-01 3c). A
 * near match only warns, needs an explicit acknowledgement, and tags the new
 * record for duplicate review (UC-01 3a).
 *
 * One site and one contact can be entered inline on create. Both are optional
 * (UC-01 alternates 5a and 6a); a record saved without a contact shows as
 * incomplete on the register.
 */

import * as React from 'react'
import { useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { AlertTriangle, ArrowLeft, ShieldAlert } from 'lucide-react'
import { useCurrentUser, useDb, usePresenter } from '@/data/store'
import { checkCompanyDuplicate } from '@/data/rules'
import { createCompany, createContact, createSite, updateCompany } from '@/data/api'
import {
  COUNTRIES,
  INCOTERMS,
  MANUFACTURER_STATUS_LABEL,
  PAYMENT_TERMS,
  REPRESENTATION_LABEL,
  SITE_KIND_LABEL,
} from '@/data/reference'
import { runAction } from '@/lib/hooks'
import { fmtDate } from '@/lib/utils'
import type { ManufacturerStatus, RepresentationKind, SiteKind } from '@/data/types'
import {
  Badge,
  Button,
  Checkbox,
  DateInput,
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
  Textarea,
} from '@/components/ui'
import { NotFound } from '@/features/misc/Fallbacks'

const STATUS_DESCRIPTION: Record<ManufacturerStatus, string> = {
  NEW: 'Just registered, not yet evaluated. The usual starting point.',
  UNDER_DEVELOPMENT: 'Being evaluated, or a client development is running on its products.',
  EXISTING_COMMERCIAL: 'Already supplying commercially under agreed terms.',
  INACTIVE: 'Kept for history. Its products cannot be taken into the portfolio.',
  BLACKLISTED: 'Barred. Set this from the detail page, where a reason is recorded.',
}

export function ManufacturerForm() {
  const { id } = useParams()
  const [params] = useSearchParams()
  const db = useDb()
  const navigate = useNavigate()
  const presenter = usePresenter()
  const currentUser = useCurrentUser()
  const editing = Boolean(id)
  const existing = id ? db.companies.find((c) => c.id === id) : undefined

  // identity
  const [legalName, setLegalName] = React.useState(existing?.legalName ?? params.get('name') ?? '')
  const [displayName, setDisplayName] = React.useState(existing?.displayName ?? params.get('name') ?? '')
  const [countryCode, setCountryCode] = React.useState(existing?.countryCode ?? 'IN')
  const [website, setWebsite] = React.useState(existing?.website ?? '')
  const [generalEmail, setGeneralEmail] = React.useState(existing?.generalEmail ?? '')
  const [generalPhone, setGeneralPhone] = React.useState(existing?.generalPhone ?? '')
  const [notes, setNotes] = React.useState(existing?.notes ?? '')

  // relationship and agency terms
  const profile = existing?.manufacturer
  const [status, setStatus] = React.useState<ManufacturerStatus>(profile?.status ?? 'NEW')
  const [representation, setRepresentation] = React.useState<string>(profile?.representation ?? '')
  const [agreementReference, setAgreementReference] = React.useState(profile?.agreementReference ?? '')
  const [agreementSignedOn, setAgreementSignedOn] = React.useState(profile?.agreementSignedOn ?? '')
  const [agreementExpiresOn, setAgreementExpiresOn] = React.useState(profile?.agreementExpiresOn ?? '')
  const [commissionBasisNote, setCommissionBasisNote] = React.useState(profile?.commissionBasisNote ?? '')
  const [defaultIncoterm, setDefaultIncoterm] = React.useState(profile?.defaultIncoterm ?? '')
  const [defaultPaymentTermCode, setDefaultPaymentTermCode] = React.useState(profile?.defaultPaymentTermCode ?? '')

  // the first site and contact, create only
  const [siteName, setSiteName] = React.useState('')
  const [siteKind, setSiteKind] = React.useState<SiteKind>('HEAD_OFFICE')
  const [siteCity, setSiteCity] = React.useState('')
  const [siteAddress, setSiteAddress] = React.useState('')
  const [contactName, setContactName] = React.useState('')
  const [contactDesignation, setContactDesignation] = React.useState('')
  const [contactEmail, setContactEmail] = React.useState('')
  const [contactPhone, setContactPhone] = React.useState('')

  const [acknowledged, setAcknowledged] = React.useState(false)
  const [saving, setSaving] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)

  if (editing && (!existing || !existing.manufacturer)) return <NotFound />

  const dup = React.useMemo(
    () => checkCompanyDuplicate(legalName, countryCode, db.companies, id),
    [legalName, countryCode, db.companies, id],
  )

  const blacklistedMatch = dup.exact?.blacklisted
    ? db.companies.find((c) => c.id === dup.exact!.id)
    : undefined

  const nameTouched = legalName.trim().length > 1
  const blocked = nameTouched && Boolean(dup.exact)
  const needsAck = nameTouched && !dup.exact && dup.near.length > 0
  const canSave = nameTouched && displayName.trim().length > 0 && !blocked && (!needsAck || acknowledged)

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    if (!canSave) return
    setSaving(true)

    const manufacturer = {
      status,
      ownerUserId: profile?.ownerUserId ?? currentUser?.id ?? null,
      representation: (representation || null) as RepresentationKind | null,
      agreementReference: agreementReference.trim() || null,
      agreementSignedOn: agreementSignedOn || null,
      agreementExpiresOn: agreementExpiresOn || null,
      commissionBasisNote: commissionBasisNote.trim() || null,
      defaultIncoterm: defaultIncoterm || null,
      defaultPaymentTermCode: defaultPaymentTermCode || null,
      blacklistReason: profile?.blacklistReason ?? null,
      blacklistedOn: profile?.blacklistedOn ?? null,
      onboardedOn: profile?.onboardedOn ?? null,
    }

    const base = {
      kind: 'MANUFACTURER' as const,
      legalName: legalName.trim(),
      displayName: displayName.trim(),
      countryCode,
      website: website.trim() || null,
      generalEmail: generalEmail.trim() || null,
      generalPhone: generalPhone.trim() || null,
      notes: notes.trim() || null,
      possibleDuplicate: editing ? (existing!.possibleDuplicate || needsAck) : needsAck,
      manufacturer,
    }

    const result = await runAction(
      async () => {
        if (editing) return updateCompany(id!, base)
        const company = await createCompany(base)
        if (siteName.trim()) {
          await createSite({
            companyId: company.id,
            kind: siteKind,
            name: siteName.trim(),
            city: siteCity.trim() || null,
            countryCode,
            addressLine: siteAddress.trim() || null,
            isPrimary: true,
            isDeliveryDestination: false,
          })
        }
        if (contactName.trim()) {
          await createContact({
            companyId: company.id,
            siteId: null,
            fullName: contactName.trim(),
            designation: contactDesignation.trim() || null,
            department: null,
            email: contactEmail.trim() || null,
            phone: contactPhone.trim() || null,
            isPrimary: true,
          })
        }
        return company
      },
      {
        success: editing
          ? `${base.displayName} updated.`
          : `${base.displayName} registered${contactName.trim() ? '' : ', with no contact yet'}.`,
        onError: setError,
      },
    )

    setSaving(false)
    if (result) navigate(`/manufacturers/${editing ? id : (result as { id: string }).id}`)
  }

  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <PageHeading
        title={editing ? `Edit ${existing!.displayName}` : 'Register a manufacturer'}
        subtitle={
          editing
            ? 'Changing the legal name or the country re-runs the duplicate check.'
            : 'One supplier, entered once. The legal name and country together decide whether this is a new record or one TCL already holds.'
        }
        actions={
          <LinkButton
            to={editing ? `/manufacturers/${id}` : '/manufacturers'}
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
          <PanelHeader title="Identity" subtitle="How the supplier is named on paper and in conversation" />
          <div className="space-y-4 p-4">
            <FormGrid>
              <FormRow
                label="Legal name"
                required
                error={blocked ? 'A manufacturer with this legal name already exists in this country.' : undefined}
                hint={!blocked ? 'As it appears on the agreement and the invoice.' : undefined}
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
                  placeholder="Divis Laboratories Limited"
                />
              </FormRow>
              <FormRow label="Display name" required hint="The short name used in lists and on screen.">
                <Input
                  value={displayName}
                  onChange={(e) => setDisplayName(e.target.value)}
                  placeholder="Divis Labs"
                />
              </FormRow>
            </FormGrid>

            <FormGrid cols={3}>
              <FormRow label="Country" required hint="Part of the duplicate key.">
                <Select
                  value={countryCode}
                  onChange={(v) => {
                    setCountryCode(v)
                    setAcknowledged(false)
                  }}
                  options={COUNTRIES.map((c) => ({ value: c.code, label: c.name }))}
                />
              </FormRow>
              <FormRow label="General email">
                <Input
                  type="email"
                  value={generalEmail}
                  onChange={(e) => setGeneralEmail(e.target.value)}
                  placeholder="exports@example.com"
                />
              </FormRow>
              <FormRow label="General phone">
                <Input value={generalPhone} onChange={(e) => setGeneralPhone(e.target.value)} mono placeholder="+91 40 2345 6789" />
              </FormRow>
            </FormGrid>

            <FormRow label="Website">
              <Input value={website} onChange={(e) => setWebsite(e.target.value)} placeholder="https://example.com" />
            </FormRow>
          </div>
        </Panel>

        {blocked && !dup.exact!.blacklisted ? (
          <InlineError>
            <span>
              <strong>{dup.exact!.name}</strong> is already registered in this country.{' '}
              <button
                type="button"
                onClick={() => navigate(`/manufacturers/${dup.exact!.id}`)}
                className="font-medium underline"
              >
                Open the existing manufacturer
              </button>{' '}
              instead of creating a second record. Nothing has been saved.
            </span>
          </InlineError>
        ) : null}

        {blocked && dup.exact!.blacklisted ? (
          <Panel className="border-danger-200 bg-danger-50/70">
            <div className="space-y-2 p-4">
              <p className="flex items-center gap-1.5 text-sm font-semibold text-danger-700">
                <ShieldAlert className="h-4 w-4" />
                {dup.exact!.name} is blacklisted
              </p>
              <p className="text-xs leading-relaxed text-ink-700">
                {dup.exact!.blacklistReason ?? 'No reason was recorded.'}
                {blacklistedMatch?.manufacturer?.blacklistedOn
                  ? ` Applied on ${fmtDate(blacklistedMatch.manufacturer.blacklistedOn)}.`
                  : ''}
              </p>
              <p className="text-xs leading-relaxed text-ink-600">
                This record cannot be created. If the decision has changed, reinstate the existing manufacturer by
                changing its status, which needs a recorded reason.
              </p>
              <div>
                <Button
                  variant="secondary"
                  size="sm"
                  type="button"
                  onClick={() => navigate(`/manufacturers/${dup.exact!.id}`)}
                >
                  Open the blacklisted record
                </Button>
              </div>
            </div>
          </Panel>
        ) : null}

        {needsAck ? (
          <Panel className="border-warn-200 bg-warn-50/60">
            <div className="space-y-2.5 p-4">
              <p className="flex items-center gap-1.5 text-sm font-semibold text-warn-600">
                <AlertTriangle className="h-4 w-4" />
                This looks like a manufacturer already in the register
              </p>
              <p className="text-xs text-ink-600">
                Suffixes such as Ltd, Pvt and GmbH are ignored when names are compared, so these are closer than they
                look:
              </p>
              <ul className="flex flex-wrap gap-1.5">
                {dup.near.map((n) => (
                  <li key={n.id}>
                    <button
                      type="button"
                      onClick={() => navigate(`/manufacturers/${n.id}`)}
                      className="rounded border border-paper-300 bg-white px-2 py-1 text-xs text-ink-800 transition-colors hover:border-accent-400"
                    >
                      {n.name}
                      <span className="ml-1.5 text-2xs text-ink-400">{Math.round(n.score * 100)}% alike</span>
                    </button>
                  </li>
                ))}
              </ul>
              <Checkbox
                checked={acknowledged}
                onChange={setAcknowledged}
                label="I have checked these and this is a genuinely different company"
              />
              <p className="text-2xs text-ink-500">The new record is tagged for duplicate review either way.</p>
            </div>
          </Panel>
        ) : null}

        <Panel>
          <PanelHeader title="Relationship" subtitle="Where this supplier stands with TCL today (FR-M2-02)" />
          <div className="space-y-4 p-4">
            <FormRow label="Relationship status" required>
              <RadioCards
                value={status}
                onChange={setStatus}
                columns={2}
                options={(['NEW', 'UNDER_DEVELOPMENT', 'EXISTING_COMMERCIAL', 'INACTIVE'] as ManufacturerStatus[]).map(
                  (s) => ({
                    value: s,
                    label: MANUFACTURER_STATUS_LABEL[s],
                    description: STATUS_DESCRIPTION[s],
                  }),
                )}
              />
            </FormRow>
            {status === 'BLACKLISTED' ? (
              <InlineWarning>
                <span>Blacklisting is done from the detail page, so the reason is recorded with it.</span>
              </InlineWarning>
            ) : null}
          </div>
        </Panel>

        <Panel>
          <PanelHeader
            title="Agency terms"
            subtitle="TCL indents on the manufacturer for a named client, so the commission is receivable from the client (FR-M2-05)"
          />
          <div className="space-y-4 p-4">
            <FormGrid>
              <FormRow label="Representation type" hint="Blank means nothing is agreed yet.">
                <Select
                  value={representation}
                  onChange={setRepresentation}
                  allowEmpty
                  emptyLabel="None agreed"
                  placeholder="None agreed"
                  options={(Object.keys(REPRESENTATION_LABEL) as RepresentationKind[]).map((r) => ({
                    value: r,
                    label: REPRESENTATION_LABEL[r],
                  }))}
                />
              </FormRow>
              <FormRow label="Agreement reference">
                <Input
                  value={agreementReference}
                  onChange={(e) => setAgreementReference(e.target.value)}
                  mono
                  placeholder="TCL/AGR/2026/118"
                />
              </FormRow>
              <FormRow label="Agreement signed on">
                <DateInput value={agreementSignedOn} onChange={(e) => setAgreementSignedOn(e.target.value)} />
              </FormRow>
              <FormRow label="Agreement expires on">
                <DateInput value={agreementExpiresOn} onChange={(e) => setAgreementExpiresOn(e.target.value)} />
              </FormRow>
              <FormRow label="Default incoterm">
                <Select
                  value={defaultIncoterm}
                  onChange={setDefaultIncoterm}
                  allowEmpty
                  emptyLabel="Not set"
                  placeholder="Not set"
                  options={INCOTERMS.map((i) => ({ value: i, label: i }))}
                />
              </FormRow>
              <FormRow label="Default payment term">
                <Select
                  value={defaultPaymentTermCode}
                  onChange={setDefaultPaymentTermCode}
                  allowEmpty
                  emptyLabel="Not set"
                  placeholder="Not set"
                  options={PAYMENT_TERMS.map((p) => ({ value: p.code, label: p.label }))}
                />
              </FormRow>
            </FormGrid>
            <FormRow
              label="Commission basis"
              hint="In words, as agreed. The figure on each indent is recorded against that indent."
            >
              <Textarea
                value={commissionBasisNote}
                onChange={(e) => setCommissionBasisNote(e.target.value)}
                rows={2}
                placeholder="Commission billed to the client at 3% of indent value."
              />
            </FormRow>
          </div>
        </Panel>

        {!editing ? (
          <>
            <Panel>
              <PanelHeader
                title="First site"
                subtitle="Optional. With no site entered, the head office can be added later, and a plant is needed before a source can name where it is made."
              />
              <div className="space-y-4 p-4">
                <FormGrid>
                  <FormRow label="Site name">
                    <Input
                      value={siteName}
                      onChange={(e) => setSiteName(e.target.value)}
                      placeholder="Hyderabad head office"
                    />
                  </FormRow>
                  <FormRow label="Site type">
                    <Select
                      value={siteKind}
                      onChange={(v) => setSiteKind(v as SiteKind)}
                      options={(Object.keys(SITE_KIND_LABEL) as SiteKind[]).map((k) => ({
                        value: k,
                        label: SITE_KIND_LABEL[k],
                      }))}
                    />
                  </FormRow>
                  <FormRow label="City">
                    <Input value={siteCity} onChange={(e) => setSiteCity(e.target.value)} placeholder="Hyderabad" />
                  </FormRow>
                  <FormRow label="Address">
                    <Input
                      value={siteAddress}
                      onChange={(e) => setSiteAddress(e.target.value)}
                      placeholder="Plot 24, Road 5, IDA Jeedimetla"
                    />
                  </FormRow>
                </FormGrid>
              </div>
            </Panel>

            <Panel>
              <PanelHeader
                title="First contact"
                subtitle="Optional. A manufacturer saved without a contact is flagged as incomplete on the register."
              />
              <div className="space-y-4 p-4">
                <FormGrid>
                  <FormRow label="Full name">
                    <Input
                      value={contactName}
                      onChange={(e) => setContactName(e.target.value)}
                      placeholder="Anita Krishnan"
                    />
                  </FormRow>
                  <FormRow label="Designation">
                    <Input
                      value={contactDesignation}
                      onChange={(e) => setContactDesignation(e.target.value)}
                      placeholder="Head of exports"
                    />
                  </FormRow>
                  <FormRow label="Email">
                    <Input
                      type="email"
                      value={contactEmail}
                      onChange={(e) => setContactEmail(e.target.value)}
                      placeholder="anita@example.com"
                    />
                  </FormRow>
                  <FormRow label="Phone">
                    <Input value={contactPhone} onChange={(e) => setContactPhone(e.target.value)} mono placeholder="+91 98450 11223" />
                  </FormRow>
                </FormGrid>
                {!contactName.trim() ? (
                  <p className="text-xs text-ink-500">
                    <Badge tone="outline">Incomplete</Badge> will show against this manufacturer until a contact is
                    named.
                  </p>
                ) : null}
              </div>
            </Panel>

            <FormRow label="Notes" hint="Anything the team should know about this supplier.">
              <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={3} />
            </FormRow>
          </>
        ) : (
          <Panel>
            <PanelHeader title="Notes" subtitle="Sites and contacts are maintained from the detail page" />
            <div className="p-4">
              <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={3} />
            </div>
          </Panel>
        )}

        {presenter.showRuleHints ? (
          <RuleHint>
            The database refuses a second manufacturer whose normalised legal name and country match an active record,
            so "Divis Laboratories Ltd" and "divis laboratories limited" in India cannot both exist. A near match only
            warns, because two genuinely different companies can share a family name, but the record is tagged for
            review. A name that matches a blacklisted manufacturer is blocked outright.
          </RuleHint>
        ) : null}

        {error ? <InlineError>{error}</InlineError> : null}

        <div className="flex items-center justify-between gap-3 pb-6">
          <p className="text-xs text-ink-400">
            {editing ? 'Changes are written to the audit log.' : 'The manufacturer, site and contact are saved together.'}
          </p>
          <div className="flex items-center gap-2">
            <Button
              variant="ghost"
              size="md"
              type="button"
              onClick={() => navigate(editing ? `/manufacturers/${id}` : '/manufacturers')}
            >
              Cancel
            </Button>
            <Button variant="primary" size="md" type="submit" loading={saving} disabled={!canSave}>
              {editing ? 'Save changes' : 'Register manufacturer'}
            </Button>
          </div>
        </div>
      </form>
    </div>
  )
}
