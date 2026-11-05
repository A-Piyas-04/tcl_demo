/**
 * Engagement detail: the record of one relationship (FR-M6-05, UC-06 to UC-08).
 *
 * One client, one source, one stage. The header carries the lifecycle and the
 * only control that may change it, which offers nothing but the transitions the
 * machine allows from here. Offers and sample rounds sit in the main column
 * because they are the work; the source, the client, the requirements served
 * and the paperwork sit in a bounded right-hand rail because they are context.
 */

import * as React from 'react'
import { Link, useParams } from 'react-router-dom'
import {
  Activity as ActivityIcon,
  Building2,
  ChevronDown,
  FileText,
  History,
  Plus,
  Users,
} from 'lucide-react'
import { useDb } from '@/data/store'
import {
  companyName,
  currentPriceTiers,
  documentRows,
  latestPrice,
  userName,
} from '@/data/selectors'
import { STAGE_LABEL, countryName, stageConfig } from '@/data/reference'
import { allowedNextStages } from '@/data/rules'
import { logActivity } from '@/data/api'
import { runAction, useAsyncData } from '@/lib/hooks'
import { fmtDate, fmtDateTime, fmtMoney, fmtQty, pluralise, todayIso } from '@/lib/utils'
import type { ActivityKind, EngagementStage } from '@/data/types'
import {
  AgeingFlag,
  Avatar,
  Badge,
  Button,
  Dialog,
  EmptyState,
  Field,
  FieldGrid,
  FilingDot,
  FormRow,
  InlineWarning,
  Input,
  LinkButton,
  Menu,
  MenuContent,
  MenuItem,
  MenuLabel,
  MenuTrigger,
  Panel,
  PanelHeader,
  PageHeading,
  PortfolioBadge,
  Select,
  StageBadge,
  StageRail,
  StageTimeline,
  Textarea,
  Tooltip,
  WriteButton,
  WriteOnly,
} from '@/components/ui'
import { NotFound } from '@/features/misc/Fallbacks'
import { StageChangeDialog } from './StageDialogs'
import { OfferPanel } from './OfferPanel'
import { SamplePanel } from './SamplePanel'

export function EngagementDetail() {
  const { id = '' } = useParams()
  const db = useDb()
  const [target, setTarget] = React.useState<EngagementStage | null>(null)
  const [logging, setLogging] = React.useState(false)

  const engagement = db.engagements.find((e) => e.id === id)

  const { data } = useAsyncData(
    () => {
      const eng = db.engagements.find((e) => e.id === id)
      if (!eng) return null
      const links = db.requirementEngagements.filter((l) => l.engagementId === eng.id)
      return {
        history: db.stageHistory.filter((h) => h.engagementId === eng.id),
        requirements: links
          .map((l) => db.requirements.find((r) => r.id === l.requirementId))
          .filter((r): r is NonNullable<typeof r> => Boolean(r)),
        orderLines: db.clientOrderLines.filter((l) => l.engagementId === eng.id),
        indentLines: db.indentLines.filter((l) => {
          if (l.manufacturerProductId !== eng.manufacturerProductId) return false
          const indent = db.indents.find((i) => i.id === l.indentId)
          return indent?.clientCompanyId === eng.clientCompanyId
        }),
        documents: documentRows(db, { entityType: 'ENGAGEMENT', entityId: eng.id }),
        activities: db.activities
          .filter((a) => a.entityType === 'ENGAGEMENT' && a.entityId === eng.id)
          .sort((a, b) => (a.occurredAt < b.occurredAt ? 1 : -1)),
        peers: db.engagements.filter(
          (o) => o.productId === eng.productId && o.clientCompanyId !== eng.clientCompanyId,
        ).length,
      }
    },
    [id],
  )

  if (!engagement) return <NotFound />

  const product = db.products.find((p) => p.id === engagement.productId)
  const mp = db.manufacturerProducts.find((m) => m.id === engagement.manufacturerProductId)
  const manufacturer = db.companies.find((c) => c.id === engagement.manufacturerCompanyId)
  const client = db.companies.find((c) => c.id === engagement.clientCompanyId)
  const filings = db.filings.filter((f) => f.manufacturerProductId === engagement.manufacturerProductId && f.isActive)
  const tiers = currentPriceTiers(db, engagement.manufacturerProductId)
  const expired = latestPrice(db, engagement.manufacturerProductId)
  const inPortfolio = db.portfolio.some(
    (p) => p.manufacturerProductId === engagement.manufacturerProductId && p.isActive,
  )

  const recordName = `${product?.genericName ?? 'This molecule'} (${manufacturer?.displayName ?? 'source'}) for ${client?.displayName ?? 'the client'}`
  const next = allowedNextStages(engagement.stage)
  const samples = db.samples.filter((s) => s.engagementId === engagement.id)
  const hasPassedSample = samples.some((s) => s.outcome === 'PASS')
  const siblingApproved = db.engagements.filter(
    (e) =>
      e.id !== engagement.id &&
      e.clientCompanyId === engagement.clientCompanyId &&
      e.productId === engagement.productId &&
      (e.stage === 'APPROVED' || e.stage === 'COMMERCIAL'),
  ).length

  return (
    <div className="space-y-4">
      <PageHeading
        title={`${product?.genericName ?? 'Engagement'} (${manufacturer?.displayName ?? '—'})`}
        subtitle={`For ${client?.displayName ?? 'an unknown client'}. ${mp ? `${mp.grade}, ${mp.pharmacopoeia}.` : ''}`}
        meta={
          <>
            <StageBadge stage={engagement.stage} />
            <Tooltip content={`Ageing threshold for this stage is ${stageConfig(engagement.stage).ageingThresholdDays} days.`}>
              <span className="inline-flex items-center gap-1">
                <span className="text-xs text-ink-500">in stage</span>
                <AgeingFlag
                  days={Math.max(
                    0,
                    Math.round((Date.now() - new Date(engagement.stageChangedAt).getTime()) / 86400000),
                  )}
                  threshold={stageConfig(engagement.stage).ageingThresholdDays}
                />
              </span>
            </Tooltip>
            {engagement.origin === 'MIGRATED' ? (
              <Tooltip content="Loaded at go-live from the existing relationship, not created in the application.">
                <Badge tone="neutral">Migrated</Badge>
              </Tooltip>
            ) : null}
            <Badge tone="outline">Owner {userName(db, engagement.ownerUserId)}</Badge>
          </>
        }
        actions={
          <WriteOnly>
            <Menu>
              <MenuTrigger asChild>
                <Button variant="primary" size="md" icon={<ChevronDown className="h-3.5 w-3.5" />}>
                  Change stage
                </Button>
              </MenuTrigger>
              <MenuContent>
                <MenuLabel>Allowed from {STAGE_LABEL[engagement.stage]}</MenuLabel>
                {next.length === 0 ? (
                  <MenuItem disabled>Nothing is allowed from here</MenuItem>
                ) : (
                  next.map((stage) => (
                    <MenuItem key={stage} onSelect={() => setTarget(stage)}>
                      {STAGE_LABEL[stage]}
                    </MenuItem>
                  ))
                )}
              </MenuContent>
            </Menu>
          </WriteOnly>
        }
      />

      <Panel>
        <div className="space-y-3 p-4">
          <StageRail
            stage={engagement.stage}
            history={data?.history}
            stageBeforeHold={engagement.stageBeforeHold}
          />
          <div className="grid gap-x-5 gap-y-2 sm:grid-cols-2 lg:grid-cols-4">
            <Field label="First offered">{fmtDate(engagement.firstOfferedOn)}</Field>
            <Field label="First sample">{fmtDate(engagement.firstSampleOn)}</Field>
            <Field label="Approved on">{fmtDate(engagement.approvedOn)}</Field>
            <Field label="First commercial supply">{fmtDate(engagement.firstCommercialOn)}</Field>
          </div>
        </div>
      </Panel>

      {engagement.isOverrideCreated ? (
        <InlineWarning>
          <span>
            This engagement was created by override on a source TCL does not represent. Sourcing should settle the
            representation before the client is offered anything.
          </span>
        </InlineWarning>
      ) : null}

      {engagement.approvalConditions ? (
        <InlineWarning>
          <span>
            <strong>Conditional approval.</strong> {engagement.approvalConditions} The condition is shown again on any
            order line raised against this source.
          </span>
        </InlineWarning>
      ) : null}

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_20rem]">
        <div className="space-y-4">
          <OfferPanel engagement={engagement} />

          <SamplePanel engagement={engagement} onRequestStage={setTarget} />

          <Panel>
            <PanelHeader
              title="Stage history"
              subtitle="Every move, with who made it, why, and how long the previous stage lasted"
              icon={<History className="h-4 w-4" />}
            />
            <div className="p-4">
              {data && data.history.length > 0 ? (
                <StageTimeline history={data.history} userName={(uid) => userName(db, uid)} />
              ) : (
                <EmptyState title="No stage change has been recorded yet" compact />
              )}
            </div>
          </Panel>

          <Panel>
            <PanelHeader
              title="Activity"
              subtitle="Calls, emails and visits on this engagement"
              icon={<ActivityIcon className="h-4 w-4" />}
              actions={
                <WriteButton
                  variant="secondary"
                  size="sm"
                  icon={<Plus className="h-3.5 w-3.5" />}
                  onClick={() => setLogging(true)}
                >
                  Log an activity
                </WriteButton>
              }
            />
            {data && data.activities.length > 0 ? (
              <ul className="divide-y divide-paper-200">
                {data.activities.map((a) => (
                  <li key={a.id} className="px-3 py-2.5">
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge tone="outline">{a.kind.charAt(0) + a.kind.slice(1).toLowerCase()}</Badge>
                      <span className="min-w-0 flex-1 truncate text-sm font-medium text-ink-900">{a.subject}</span>
                      <span className="text-xs tabular text-ink-400">{fmtDateTime(a.occurredAt)}</span>
                      <Avatar name={userName(db, a.createdByUserId)} size="xs" />
                    </div>
                    {a.body ? <p className="mt-1 text-xs leading-relaxed text-ink-600">{a.body}</p> : null}
                    {a.followUpDate && !a.isCompleted ? (
                      <p className="mt-1 text-2xs text-warn-600">Follow up by {fmtDate(a.followUpDate)}</p>
                    ) : null}
                  </li>
                ))}
              </ul>
            ) : (
              <div className="p-4">
                <EmptyState
                  title="Nothing has been logged against this engagement"
                  description="A short note after a call is what makes the history readable six months later."
                  compact
                  action={
                    <WriteButton variant="primary" size="sm" onClick={() => setLogging(true)}>
                      Log an activity
                    </WriteButton>
                  }
                />
              </div>
            )}
          </Panel>
        </div>

        <div className="space-y-4">
          <Panel>
            <PanelHeader
              title="The source"
              subtitle={manufacturer ? countryName(manufacturer.countryCode) : undefined}
              icon={<Building2 className="h-4 w-4" />}
              actions={<PortfolioBadge inPortfolio={inPortfolio} offerable={inPortfolio && tiers.length > 0} />}
            />
            <div className="space-y-3 p-4">
              <FieldGrid cols={2}>
                <Field label="Manufacturer">
                  <Link
                    to={`/manufacturers/${engagement.manufacturerCompanyId}`}
                    className="text-accent-700 hover:underline"
                  >
                    {manufacturer?.displayName ?? '—'}
                  </Link>
                </Field>
                <Field label="Grade">{mp?.grade ?? '—'}</Field>
                <Field label="Pharmacopoeia">{mp?.pharmacopoeia ?? '—'}</Field>
                <Field label="Plant">{mp?.siteId ? (db.sites.find((s) => s.id === mp.siteId)?.name ?? '—') : '—'}</Field>
                <Field label="MOQ">{fmtQty(mp?.moqQty ?? null, mp?.moqUom ?? null)}</Field>
                <Field label="Lead time">{mp?.leadTimeDays ? `${mp.leadTimeDays} days` : '—'}</Field>
              </FieldGrid>

              <div className="flex flex-wrap gap-1.5">
                <FilingDot present={filings.some((f) => f.kind === 'DMF' || f.kind === 'ASMF')} label="DMF" />
                <FilingDot present={filings.some((f) => f.kind === 'CEP')} label="CEP" />
                {filings.map((f) => (
                  <Tooltip key={f.id} content={`${f.authority} · ${f.referenceNumber}`}>
                    <Badge tone="outline">{f.kind}</Badge>
                  </Tooltip>
                ))}
              </div>

              <div>
                <p className="text-2xs font-medium uppercase tracking-wide text-ink-500">Current price tiers</p>
                {tiers.length === 0 ? (
                  <p className="mt-1 text-xs text-warn-600">
                    No valid price
                    {expired ? `, the last one expired on ${fmtDate(expired.validTo)}` : ' has ever been recorded'}.
                  </p>
                ) : (
                  <ul className="mt-1 space-y-1">
                    {tiers.map((t) => (
                      <li key={t.id} className="flex items-baseline justify-between gap-2 text-xs">
                        <span className="text-ink-500">
                          from {fmtQty(t.minQty, t.perUom)} {t.incoterm}
                        </span>
                        <span className="font-medium tabular text-ink-900">
                          {fmtMoney(t.price, t.currency, { decimals: 0 })}/{t.perUom}
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>

              <LinkButton to={`/sources/${engagement.manufacturerProductId}`} variant="secondary" size="sm">
                Open the source
              </LinkButton>
            </div>
          </Panel>

          <Panel>
            <PanelHeader title="The client" icon={<Users className="h-4 w-4" />} />
            <div className="space-y-3 p-4">
              <FieldGrid cols={2}>
                <Field label="Client">{companyName(db, engagement.clientCompanyId)}</Field>
                <Field label="Country">{client ? countryName(client.countryCode) : '—'}</Field>
              </FieldGrid>
              <div className="flex flex-wrap gap-2">
                <LinkButton to={`/clients/${engagement.clientCompanyId}`} variant="secondary" size="sm">
                  Open the client
                </LinkButton>
                <LinkButton to={`/engagements/${id}/peers`} variant="ghost" size="sm">
                  Other clients taking this API
                  {data ? <span className="ml-1 text-2xs text-ink-400">{data.peers}</span> : null}
                </LinkButton>
              </div>
              {siblingApproved > 0 ? (
                <p className="text-xs leading-relaxed text-ink-500">
                  This client already has {pluralise(siblingApproved, 'approved source')} for{' '}
                  {product?.genericName ?? 'this molecule'}. Dual sourcing is normal and regulator-encouraged.
                </p>
              ) : null}
            </div>
          </Panel>

          <Panel>
            <PanelHeader title="Requirements served" subtitle="The enquiries this engagement answers" />
            {data && data.requirements.length > 0 ? (
              <ul className="divide-y divide-paper-200">
                {data.requirements.map((r) => (
                  <li key={r.id} className="px-3 py-2">
                    <Link
                      to={`/requirements/${r.id}`}
                      className="flex items-center justify-between gap-2 text-sm text-ink-800 hover:text-accent-700"
                    >
                      <span className="truncate">{fmtDate(r.enquiryDate)}</span>
                      <span className="shrink-0 text-xs tabular text-ink-500">{fmtQty(r.estAnnualQty, r.qtyUom)}</span>
                    </Link>
                  </li>
                ))}
              </ul>
            ) : (
              <div className="p-3">
                <EmptyState
                  title="Not linked to a requirement"
                  description="Engagements loaded at go-live have no originating enquiry."
                  compact
                />
              </div>
            )}
          </Panel>

          <Panel>
            <PanelHeader title="Orders and indents" subtitle="Where this source has actually been used" />
            {data && (data.orderLines.length > 0 || data.indentLines.length > 0) ? (
              <ul className="divide-y divide-paper-200">
                {data.orderLines.map((line) => {
                  const order = db.clientOrders.find((o) => o.id === line.clientOrderId)
                  return (
                    <li key={line.id} className="px-3 py-2">
                      <Link
                        to={`/orders/${line.clientOrderId}`}
                        className="flex items-center justify-between gap-2 text-sm text-ink-800 hover:text-accent-700"
                      >
                        <span className="truncate font-mono text-xs">{order?.coNumber ?? 'Client order'}</span>
                        <span className="shrink-0 text-xs tabular text-ink-500">{fmtQty(line.qty, line.qtyUom)}</span>
                      </Link>
                    </li>
                  )
                })}
                {data.indentLines.map((line) => {
                  const indent = db.indents.find((i) => i.id === line.indentId)
                  return (
                    <li key={line.id} className="px-3 py-2">
                      <Link
                        to={`/indents/${line.indentId}`}
                        className="flex items-center justify-between gap-2 text-sm text-ink-800 hover:text-accent-700"
                      >
                        <span className="truncate font-mono text-xs">{indent?.indentNumber ?? 'Indent'}</span>
                        <span className="shrink-0 text-xs tabular text-ink-500">{fmtQty(line.qty, line.qtyUom)}</span>
                      </Link>
                    </li>
                  )
                })}
              </ul>
            ) : (
              <div className="p-3">
                <EmptyState
                  title="Nothing has been ordered through this source yet"
                  description="Ordering opens up once the engagement is approved."
                  compact
                />
              </div>
            )}
          </Panel>

          <Panel>
            <PanelHeader title="Documents" icon={<FileText className="h-4 w-4" />} />
            {data && data.documents.length > 0 ? (
              <ul className="divide-y divide-paper-200">
                {data.documents.map((d) => (
                  <li key={d.document.id} className="flex items-center gap-2 px-3 py-2">
                    <FileText className="h-3.5 w-3.5 shrink-0 text-ink-400" />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm text-ink-800">{d.document.title}</span>
                      <span className="block truncate text-2xs text-ink-500">
                        {d.document.typeCode} · {fmtDate(d.document.uploadedAt)}
                      </span>
                    </span>
                  </li>
                ))}
              </ul>
            ) : (
              <div className="p-3">
                <EmptyState
                  title="No document is filed here"
                  description="Quotations, COAs and the client's approval letter belong on this engagement."
                  compact
                />
              </div>
            )}
          </Panel>
        </div>
      </div>

      <StageChangeDialog
        engagement={target ? engagement : null}
        to={target}
        recordName={recordName}
        onClose={() => setTarget(null)}
        requireNoteBecause={
          target === 'APPROVED' && !hasPassedSample
            ? 'No sample round on this engagement has a recorded pass. Approving without an evaluation is unusual, so write down what the approval rests on.'
            : null
        }
        notice={
          target === 'APPROVED' && siblingApproved > 0 ? (
            <InlineWarning>
              <span>
                {client?.displayName ?? 'This client'} already has {pluralise(siblingApproved, 'approved source')} for{' '}
                {product?.genericName ?? 'this molecule'}. That is permitted, and worth knowing so the duplication is
                deliberate.
              </span>
            </InlineWarning>
          ) : null
        }
      />

      <LogActivityDialog open={logging} onClose={() => setLogging(false)} engagementId={id} clientId={engagement.clientCompanyId} />
    </div>
  )
}

const ACTIVITY_KINDS: ActivityKind[] = ['CALL', 'EMAIL', 'MEETING', 'VISIT', 'NOTE', 'TASK']

function LogActivityDialog({
  open,
  onClose,
  engagementId,
  clientId,
}: {
  open: boolean
  onClose: () => void
  engagementId: string
  clientId: string
}) {
  const db = useDb()
  const contacts = db.contacts.filter((c) => c.companyId === clientId && c.isActive)
  const [kind, setKind] = React.useState<ActivityKind>('CALL')
  const [subject, setSubject] = React.useState('')
  const [body, setBody] = React.useState('')
  const [contactId, setContactId] = React.useState('')
  const [followUpDate, setFollowUpDate] = React.useState('')
  const [saving, setSaving] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)

  React.useEffect(() => {
    if (!open) return
    setKind('CALL')
    setSubject('')
    setBody('')
    setContactId('')
    setFollowUpDate('')
    setError(null)
  }, [open])

  const submit = async () => {
    setError(null)
    if (!subject.trim()) {
      setError('Write a one-line subject, so the log reads as a list.')
      return
    }
    setSaving(true)
    const result = await runAction(
      () =>
        logActivity({
          kind,
          entityType: 'ENGAGEMENT',
          entityId: engagementId,
          subject: subject.trim(),
          body: body.trim() || null,
          occurredAt: new Date().toISOString(),
          contactId: contactId || null,
          followUpDate: followUpDate || null,
          isCompleted: false,
        }),
      { success: 'Activity logged.', onError: setError },
    )
    setSaving(false)
    if (result) onClose()
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        if (!v) onClose()
      }}
      width="md"
      title="Log an activity"
      description="What happened, in one line, plus anything worth keeping."
      footer={
        <>
          <Button variant="ghost" size="sm" onClick={onClose}>
            Cancel
          </Button>
          <Button variant="primary" size="sm" loading={saving} onClick={() => void submit()}>
            Log it
          </Button>
        </>
      }
    >
      <div className="space-y-3.5">
        <FormRow label="Kind">
          <Select
            value={kind}
            onChange={(v) => setKind(v as ActivityKind)}
            options={ACTIVITY_KINDS.map((k) => ({ value: k, label: k.charAt(0) + k.slice(1).toLowerCase() }))}
          />
        </FormRow>
        <FormRow label="Subject">
          <Input
            value={subject}
            onChange={(e) => setSubject(e.target.value)}
            placeholder="Client confirmed the sample arrived"
          />
        </FormRow>
        <FormRow label="Detail">
          <Textarea value={body} onChange={(e) => setBody(e.target.value)} rows={3} />
        </FormRow>
        <FormRow label="Contact">
          <Select
            value={contactId}
            onChange={setContactId}
            allowEmpty
            emptyLabel="Not recorded"
            placeholder="Not recorded"
            disabled={contacts.length === 0}
            options={contacts.map((c) => ({ value: c.id, label: c.fullName }))}
          />
        </FormRow>
        <FormRow label="Follow up by">
          <Input
            type="date"
            value={followUpDate}
            min={todayIso()}
            onChange={(e) => setFollowUpDate(e.target.value)}
            mono
          />
        </FormRow>
        {error ? <p className="text-xs text-danger-700">{error}</p> : null}
      </div>
    </Dialog>
  )
}
