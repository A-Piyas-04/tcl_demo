/**
 * Requirement detail: match and engage (UC-05, AC-05).
 *
 * The screen answers one question, "who can supply this", and then lets the
 * user act on the answer. Candidate sources are the represented, available
 * sources that match the molecule and, where the client named one, the
 * pharmacopoeia. Everything else for that molecule is listed underneath with
 * the reason it is out, because "no candidates" and "three candidates we are
 * not allowed to use" are different problems.
 *
 * Opening an engagement never duplicates: an engagement that already exists
 * for this client and source is linked to the requirement instead.
 */

import * as React from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { ArrowRight, CircleSlash, Handshake, Pencil, Target } from 'lucide-react'
import { useDb } from '@/data/store'
import {
  SOURCING_GAP_COPY,
  allSourcesFor,
  companyName,
  engagementFor,
  engagementRows,
  matchingSources,
  nextStepFor,
  requirementNextStep,
  sourcingGap,
  userName,
  type SourceRow,
} from '@/data/selectors'
import {
  ALTERNATE_REASONS,
  REQUIREMENT_KIND_LABEL,
  REQUIREMENT_STATUS_LABEL,
  countryName,
  stageConfig,
} from '@/data/reference'
import { openEngagements } from '@/data/api'
import { runAction, useAsyncData } from '@/lib/hooks'
import { fmtDate, fmtMoney, fmtQty, pluralise } from '@/lib/utils'
import type { Requirement } from '@/data/types'
import {
  AgeingFlag,
  Badge,
  Checkbox,
  EmptyState,
  Field,
  FieldGrid,
  FilingDot,
  LinkButton,
  Panel,
  PanelHeader,
  PageHeading,
  PortfolioBadge,
  SkeletonTable,
  StageBadge,
  StageRail,
  Tooltip,
  WriteButton,
  WriteOnly,
} from '@/components/ui'
import { NotFound } from '@/features/misc/Fallbacks'
import { NextStepCard } from './DealProgress'

export function RequirementDetail() {
  const { id = '' } = useParams()
  const db = useDb()
  const navigate = useNavigate()
  const [selected, setSelected] = React.useState<string[]>([])
  const [busy, setBusy] = React.useState(false)

  const requirement = db.requirements.find((r) => r.id === id)

  const { data, loading } = useAsyncData(
    () => {
      const req = db.requirements.find((r) => r.id === id)
      if (!req) return null
      const candidates = matchingSources(db, req)
      const candidateIds = new Set(candidates.map((c) => c.mp.id))
      const unavailable = allSourcesFor(db, req.productId).filter((s) => !candidateIds.has(s.mp.id))
      const links = db.requirementEngagements.filter((l) => l.requirementId === req.id)
      const engagements = engagementRows(db, { clientId: req.clientCompanyId }).filter((row) =>
        links.some((l) => l.engagementId === row.engagement.id),
      )
      return { candidates, unavailable, engagements }
    },
    [id],
  )

  if (!requirement) return <NotFound />

  const product = db.products.find((p) => p.id === requirement.productId)
  const contact = db.contacts.find((c) => c.id === requirement.requestingContactId)
  const candidates = data?.candidates ?? []
  const gap = sourcingGap(db, requirement.productId, requirement.requiredPharmacopoeia)

  const open = async () => {
    setBusy(true)
    const result = await runAction(() => openEngagements(id, selected), {
      success: (r) => {
        const made = r.created.length
        const again = r.reused.length
        if (made && again) {
          return `${pluralise(made, 'engagement')} opened. ${pluralise(again, 'existing engagement')} linked to this requirement rather than duplicated.`
        }
        if (made) return `${pluralise(made, 'engagement')} opened at Identified.`
        return `${pluralise(again, 'engagement')} already existed and has been linked to this requirement, not duplicated.`
      },
    })
    setBusy(false)
    if (result) {
      setSelected([])
      if (result.created.length === 1 && result.reused.length === 0) {
        navigate(`/engagements/${result.created[0]!.id}`)
      }
    }
  }

  const next = requirementNextStep(db, requirement)
  const engagementsFirst = (data?.engagements.length ?? 0) > 0

  const engagementsPanel = (
    <Panel>
      <PanelHeader
        title="Engagements for this requirement"
        subtitle="One per source the client is considering, each with its own progress and next step"
        actions={<Badge tone="neutral">{data?.engagements.length ?? 0}</Badge>}
      />
      {loading ? (
        <SkeletonTable rows={3} cols={4} />
      ) : (data?.engagements.length ?? 0) === 0 ? (
        <div className="p-4">
          <EmptyState
            icon={<Handshake className="h-5 w-5" />}
            title="No engagement has been opened yet"
            description="An engagement is one client with one source, moving from offer to approval and supply. Select a candidate source to open one."
            compact
          />
        </div>
      ) : (
        <ul className="divide-y divide-paper-200">
          {data!.engagements.map((row) => {
            const step = nextStepFor(db, row.engagement)
            return (
              <li key={row.engagement.id}>
                <button
                  onClick={() => navigate(`/engagements/${row.engagement.id}`)}
                  className="grid w-full gap-x-4 gap-y-2 px-3 py-3 text-left transition-colors hover:bg-paper-100 md:grid-cols-[12rem_minmax(0,1fr)_14rem] md:items-center"
                >
                  <span className="min-w-0">
                    <span className="block truncate text-sm font-semibold text-ink-900">{row.manufacturer.displayName}</span>
                    <span className="block truncate font-mono text-2xs text-ink-500">
                      {row.mp.grade} · {row.mp.pharmacopoeia}
                    </span>
                  </span>
                  <span className="min-w-0 space-y-1">
                    <StageRail stage={row.stage} stageBeforeHold={row.engagement.stageBeforeHold} compact />
                    <span className="flex items-center gap-2">
                      <StageBadge stage={row.stage} size="sm" />
                      <AgeingFlag days={row.daysInStage} threshold={stageConfig(row.stage).ageingThresholdDays} />
                    </span>
                  </span>
                  <span className="flex min-w-0 items-center gap-1.5 text-xs text-ink-600">
                    <span className="min-w-0 flex-1 truncate">
                      <span className="text-ink-400">Next: </span>
                      {step.title}
                    </span>
                    <ArrowRight className="h-3.5 w-3.5 shrink-0 text-ink-300" />
                  </span>
                </button>
              </li>
            )
          })}
        </ul>
      )}
    </Panel>
  )

  return (
    <div className="space-y-4">
      <PageHeading
        title={`${companyName(db, requirement.clientCompanyId)} needs ${product?.genericName ?? 'a molecule'}`}
        subtitle={`Requirement recorded on ${fmtDate(requirement.enquiryDate)}${requirement.estAnnualQty ? `, about ${fmtQty(requirement.estAnnualQty, requirement.qtyUom)} a year` : ''}.`}
        meta={
          <>
            <Badge tone={requirement.kind === 'NEW_DEVELOPMENT' ? 'info' : 'accent'}>
              {REQUIREMENT_KIND_LABEL[requirement.kind]}
            </Badge>
            <Tooltip content="Set by hand on the requirement. It does not change automatically as engagements progress.">
              <Badge tone="neutral">Status: {REQUIREMENT_STATUS_LABEL[requirement.status]}</Badge>
            </Tooltip>
            {requirement.requiredPharmacopoeia ? (
              <Badge tone="outline">{requirement.requiredPharmacopoeia} required</Badge>
            ) : null}
            {requirement.qtyIsIndicative ? <Badge tone="warn">Volume indicative</Badge> : null}
          </>
        }
        actions={
          <>
            <LinkButton to={`/clients/${requirement.clientCompanyId}`} variant="ghost" size="md">
              Open the client
            </LinkButton>
            <WriteOnly>
              <LinkButton
                to={`/requirements/${id}/edit`}
                variant="secondary"
                size="md"
                icon={<Pencil className="h-3.5 w-3.5" />}
              >
                Edit
              </LinkButton>
            </WriteOnly>
          </>
        }
      />

      <NextStepCard step={next} />

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_20rem]">
        <div className="min-w-0 space-y-4">
          {engagementsFirst ? engagementsPanel : null}

          <Panel>
            <div className="flex flex-col items-center gap-3 border-b border-paper-200 bg-paper-50 px-4 py-4 text-center">
              <h2 className="rounded-md border border-accent-700 bg-accent-800 px-6 py-2 text-xl font-semibold text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.2),0_4px_0_#10403b,0_8px_14px_-7px_rgba(7,19,26,0.45)]">
                Pick sources
              </h2>
              <p className="text-base text-ink-600">
                {requirement.requiredPharmacopoeia
                  ? `Represented and available, limited to ${requirement.requiredPharmacopoeia}`
                  : 'Represented by TCL and available to offer'}
                {' · '}{candidates.length} available
              </p>
            </div>
            {loading ? (
              <SkeletonTable rows={4} cols={6} />
            ) : candidates.length === 0 ? (
              <div className="p-4">
                <EmptyState
                  icon={<Target className="h-5 w-5" />}
                  title={gap ? SOURCING_GAP_COPY[gap].label : 'No candidate source'}
                  description={
                    gap
                      ? `${SOURCING_GAP_COPY[gap].detail}${['OPEN', 'SOURCING'].includes(requirement.status) ? ' It appears on the unsourced demand list.' : ''}`
                      : 'No represented source matches this requirement.'
                  }
                  action={
                    <WriteOnly>
                      <LinkButton to="/manufacturers/new" variant="primary" size="sm">
                        Register a manufacturer
                      </LinkButton>
                    </WriteOnly>
                  }
                  secondary={
                    <LinkButton to="/requirements/unsourced" variant="ghost" size="sm">
                      Open the unsourced demand report
                    </LinkButton>
                  }
                />
              </div>
            ) : (
              <>
                <ul className="divide-y divide-paper-200">
                  {candidates.map((s) => (
                    <CandidateRow
                      key={s.mp.id}
                      source={s}
                      requirement={requirement}
                      checked={selected.includes(s.mp.id)}
                      onToggle={(on) =>
                        setSelected((prev) => (on ? [...prev, s.mp.id] : prev.filter((x) => x !== s.mp.id)))
                      }
                    />
                  ))}
                </ul>
                <WriteOnly>
                  <div className="flex flex-wrap items-center justify-between gap-2 border-t border-paper-200 bg-paper-50 px-3 py-2.5">
                    <p className="text-xs text-ink-500">
                      {selected.length === 0
                        ? 'Select one or more sources. Engaging several at once is normal: the client will approve one, some or none.'
                        : `${pluralise(selected.length, 'source')} selected.`}
                    </p>
                    <WriteButton
                      variant="primary"
                      size="sm"
                      icon={<Handshake className="h-3.5 w-3.5" />}
                      disabled={selected.length === 0}
                      loading={busy}
                      onClick={() => void open()}
                    >
                      Open engagement
                    </WriteButton>
                  </div>
                </WriteOnly>
              </>
            )}
          </Panel>

          <Panel>
            <PanelHeader
              title="Sources that cannot answer this"
              subtitle="Known to the register but excluded, with the reason"
              actions={<Badge tone="outline">{data?.unavailable.length ?? 0}</Badge>}
            />
            {loading ? (
              <SkeletonTable rows={3} cols={4} />
            ) : (data?.unavailable.length ?? 0) === 0 ? (
              <div className="p-4">
                <EmptyState
                  icon={<CircleSlash className="h-5 w-5" />}
                  title="Nothing is excluded"
                  description="Every source the register holds for this molecule is a candidate."
                  compact
                />
              </div>
            ) : (
              <ul className="divide-y divide-paper-200">
                {data!.unavailable.map((s) => {
                  const reason = exclusionReason(s, requirement)
                  return (
                    <li key={s.mp.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 px-3 py-2.5">
                      <Link
                        to={`/sources/${s.mp.id}`}
                        className="min-w-0 flex-1 truncate text-sm font-medium text-ink-900 hover:text-accent-700"
                      >
                        {s.manufacturer.displayName}
                      </Link>
                      <span className="font-mono text-2xs text-ink-500">
                        {s.mp.grade} · {s.mp.pharmacopoeia}
                      </span>
                      <Tooltip content={reason.detail}>
                        <Badge tone={reason.tone}>{reason.label}</Badge>
                      </Tooltip>
                    </li>
                  )
                })}
              </ul>
            )}
          </Panel>

          {engagementsFirst ? null : engagementsPanel}
        </div>

        <div className="space-y-4">
          <Panel>
            <PanelHeader title="The requirement" />
            <div className="p-4">
              <FieldGrid cols={2}>
                <Field label="Client">
                  <Link
                    to={`/clients/${requirement.clientCompanyId}`}
                    className="text-accent-700 hover:underline"
                  >
                    {companyName(db, requirement.clientCompanyId)}
                  </Link>
                </Field>
                <Field label="Molecule">
                  <Link to={`/products/${requirement.productId}`} className="text-accent-700 hover:underline">
                    {product?.genericName ?? '—'}
                  </Link>
                </Field>
                <Field label="Annual quantity">
                  {fmtQty(requirement.estAnnualQty, requirement.qtyUom)}
                  {requirement.qtyIsIndicative ? <span className="ml-1 text-2xs text-ink-400">indicative</span> : null}
                </Field>
                <Field label="Target price">
                  {fmtMoney(requirement.targetPrice, requirement.targetCurrency ?? 'USD', { decimals: 0 })}
                </Field>
                <Field label="Required pharmacopoeia">{requirement.requiredPharmacopoeia ?? 'Any'}</Field>
                <Field label="Required grade">{requirement.requiredGrade ?? '—'}</Field>
                <Field label="Enquiry date">{fmtDate(requirement.enquiryDate)}</Field>
                <Field label="Required by">{fmtDate(requirement.requiredByDate)}</Field>
                <Field label="Requesting contact">
                  {contact ? `${contact.fullName}${contact.designation ? `, ${contact.designation}` : ''}` : '—'}
                </Field>
                <Field label="Owner">{userName(db, requirement.ownerUserId)}</Field>
              </FieldGrid>
            </div>
          </Panel>

          {requirement.kind === 'ALTERNATE_SOURCE' ? (
            <Panel>
              <PanelHeader title="What it replaces" subtitle="Recorded because the kind is alternate source" />
              <div className="p-4">
                <FieldGrid cols={2}>
                  <Field label="Current source">{requirement.currentSourceNote ?? '—'}</Field>
                  <Field label="Reason">
                    {ALTERNATE_REASONS.find((r) => r.code === requirement.alternateReason)?.label ??
                      requirement.alternateReason ??
                      '—'}
                  </Field>
                </FieldGrid>
              </div>
            </Panel>
          ) : null}

          {requirement.duplicateReason || requirement.remarks ? (
            <Panel>
              <PanelHeader title="Notes" />
              <div className="space-y-3 p-4">
                {requirement.duplicateReason ? (
                  <div>
                    <p className="text-2xs font-medium uppercase tracking-wide text-ink-500">
                      Why a second open requirement
                    </p>
                    <p className="mt-0.5 text-sm leading-relaxed text-ink-800">{requirement.duplicateReason}</p>
                  </div>
                ) : null}
                {requirement.remarks ? (
                  <p className="text-sm leading-relaxed text-ink-800">{requirement.remarks}</p>
                ) : null}
              </div>
            </Panel>
          ) : null}
        </div>
      </div>
    </div>
  )
}

function CandidateRow({
  source,
  requirement,
  checked,
  onToggle,
}: {
  source: SourceRow
  requirement: Requirement
  checked: boolean
  onToggle: (on: boolean) => void
}) {
  const db = useDb()
  const existing = engagementFor(db, requirement.clientCompanyId, source.mp.id)
  const tier = source.priceTiers[0]

  return (
    <li className="flex items-start gap-3 px-3 py-3">
      <WriteOnly>
        <span className="pt-0.5">
          <Checkbox checked={checked} onChange={onToggle} />
        </span>
      </WriteOnly>
      <div className="min-w-0 flex-1 space-y-1.5">
        <div className="flex flex-wrap items-center gap-2">
          <Link to={`/sources/${source.mp.id}`} className="text-sm font-semibold text-ink-900 hover:text-accent-700">
            {source.manufacturer.displayName}
          </Link>
          <span className="text-xs text-ink-500">{countryName(source.manufacturer.countryCode)}</span>
          <PortfolioBadge inPortfolio={source.inPortfolio} offerable={source.isOfferable} />
          {existing ? (
            <Tooltip content="An engagement already exists for this client and source. It will be linked to this requirement, not duplicated.">
              <span className="inline-flex items-center gap-1.5">
                <Badge tone="neutral">Already engaged</Badge>
                <StageBadge stage={existing.stage} size="sm" />
              </span>
            </Tooltip>
          ) : null}
        </div>
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-ink-600">
          <span>
            <span className="text-ink-400">Grade </span>
            {source.mp.grade}
            <span className="ml-1.5 font-mono text-2xs text-ink-500">{source.mp.pharmacopoeia}</span>
          </span>
          <span className="flex items-center gap-1">
            <FilingDot present={source.hasDmf} label="DMF" />
            <FilingDot present={source.hasCep} label="CEP" />
          </span>
          <span>
            <span className="text-ink-400">MOQ </span>
            {fmtQty(source.mp.moqQty, source.mp.moqUom)}
          </span>
          <span>
            <span className="text-ink-400">Lead time </span>
            {source.mp.leadTimeDays ? `${source.mp.leadTimeDays} days` : '—'}
          </span>
          <span>
            <span className="text-ink-400">Plant </span>
            {source.site?.name ?? 'not recorded'}
          </span>
        </div>
        <div className="flex flex-wrap items-center gap-2 text-xs">
          {tier ? (
            <>
              <span className="font-medium tabular text-ink-900">
                {fmtMoney(tier.price, tier.currency, { decimals: 0 })}
                <span className="text-2xs text-ink-400">
                  /{tier.perUom} {tier.incoterm}
                </span>
              </span>
              <span className="text-ink-500">valid to {fmtDate(source.earliestPriceExpiry)}</span>
            </>
          ) : (
            <Tooltip content="An engagement can be opened, but no offer can be made until the price is renewed.">
              <Badge tone="warn">No valid price, cannot be offered</Badge>
            </Tooltip>
          )}
          {requirement.targetPrice != null && tier && tier.price > requirement.targetPrice ? (
            <Badge tone="outline" className="whitespace-normal">
              Above the client's target of{' '}
              {fmtMoney(requirement.targetPrice, requirement.targetCurrency ?? 'USD', { decimals: 0 })}
            </Badge>
          ) : null}
        </div>
      </div>
    </li>
  )
}

/** Why a known source is not a candidate, in the order the rules exclude it. */
function exclusionReason(
  s: SourceRow,
  r: Requirement,
): { label: string; tone: 'warn' | 'danger' | 'outline' | 'accent'; detail: string } {
  const status = s.manufacturer.manufacturer?.status
  if (status === 'BLACKLISTED') {
    return {
      label: 'Manufacturer blacklisted',
      tone: 'danger',
      detail: s.manufacturer.manufacturer?.blacklistReason ?? 'Blacklisted, so nothing from this source can be offered.',
    }
  }
  if (status === 'INACTIVE' || !s.manufacturer.isActive) {
    return {
      label: 'Manufacturer inactive',
      tone: 'warn',
      detail: 'The manufacturer is inactive. Reactivate it before engaging this source.',
    }
  }
  if (s.mp.status !== 'ACTIVE') {
    return {
      label: s.mp.status === 'DISCONTINUED' ? 'Source discontinued' : 'Source in development',
      tone: 'warn',
      detail: 'This manufacturer no longer offers the molecule, or does not offer it yet.',
    }
  }
  if (!s.inPortfolio) {
    return {
      label: 'Not represented',
      tone: 'outline',
      detail:
        'A known source TCL does not represent. It is market intelligence until an agency arrangement is in place, so it cannot be offered.',
    }
  }
  if (r.requiredPharmacopoeia && s.mp.pharmacopoeia !== r.requiredPharmacopoeia) {
    return {
      label: `${s.mp.pharmacopoeia}, not ${r.requiredPharmacopoeia}`,
      tone: 'accent',
      detail: `The client named ${r.requiredPharmacopoeia}. Ask whether ${s.mp.pharmacopoeia} is acceptable, or find another grade.`,
    }
  }
  if (!s.hasValidPrice) {
    return {
      label: 'No valid price',
      tone: 'warn',
      detail: 'In the portfolio, but with no currently valid price, so no offer can be made.',
    }
  }
  return { label: 'Excluded', tone: 'outline', detail: 'Excluded from the match list.' }
}
