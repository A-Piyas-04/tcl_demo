/**
 * Requirement detail: what the client asked for, and the register's answer.
 *
 * This screen records and reports; it does not curate. It shows the molecule the
 * client enquired about, every source the register holds for it as plain facts,
 * and the engagements already recorded against this requirement. Recording an
 * offer is the one action, and it is exactly that — writing down an offer that
 * was already made by phone or email. The system never picks a source or opens
 * an engagement on the user's behalf.
 */

import * as React from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { ArrowRight, Handshake, Pencil, PlusCircle, Target } from 'lucide-react'
import { useDb } from '@/data/store'
import {
  SOURCING_GAP_COPY,
  allSourcesFor,
  companyName,
  engagementFor,
  engagementRows,
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
import { useAsyncData } from '@/lib/hooks'
import { fmtDate, fmtMoney, fmtQty } from '@/lib/utils'
import {
  AgeingFlag,
  Badge,
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
  WriteOnly,
  WriteButton,
} from '@/components/ui'
import { NotFound } from '@/features/misc/Fallbacks'
import { RecordOfferDialog } from './RecordOfferDialog'

export function RequirementDetail() {
  const { id = '' } = useParams()
  const db = useDb()
  const navigate = useNavigate()
  const [offerOpen, setOfferOpen] = React.useState(false)

  const requirement = db.requirements.find((r) => r.id === id)

  const { data, loading } = useAsyncData(
    () => {
      const req = db.requirements.find((r) => r.id === id)
      if (!req) return null
      const sources = allSourcesFor(db, req.productId)
      const links = db.requirementEngagements.filter((l) => l.requirementId === req.id)
      const engagements = engagementRows(db, { clientId: req.clientCompanyId }).filter((row) =>
        links.some((l) => l.engagementId === row.engagement.id),
      )
      return { sources, engagements }
    },
    [id],
  )

  if (!requirement) return <NotFound />

  const product = db.products.find((p) => p.id === requirement.productId)
  const contact = db.contacts.find((c) => c.id === requirement.requestingContactId)
  const sources = data?.sources ?? []
  const gap = sourcingGap(db, requirement.productId, requirement.requiredPharmacopoeia)
  const engagementsFirst = (data?.engagements.length ?? 0) > 0

  const engagementsPanel = (
    <Panel>
      <PanelHeader
        title="Engagements for this requirement"
        subtitle="One per source recorded against this requirement, each with its own stage"
        actions={<Badge tone="neutral">{data?.engagements.length ?? 0}</Badge>}
      />
      {loading ? (
        <SkeletonTable rows={3} cols={4} />
      ) : (data?.engagements.length ?? 0) === 0 ? (
        <div className="p-4">
          <EmptyState
            icon={<Handshake className="h-5 w-5" />}
            title="No engagement is recorded yet"
            description="An engagement is one client with one source. Recording an offer against a source creates one."
            compact
          />
        </div>
      ) : (
        <ul className="divide-y divide-paper-200">
          {data!.engagements.map((row) => (
            <li key={row.engagement.id}>
              <button
                onClick={() => navigate(`/engagements/${row.engagement.id}`)}
                className="grid w-full gap-x-4 gap-y-2 px-3 py-3 text-left transition-colors hover:bg-paper-100 md:grid-cols-[14rem_minmax(0,1fr)_2rem] md:items-center"
              >
                <span className="min-w-0">
                  <span className="block truncate text-sm font-semibold text-ink-900">{row.manufacturer.displayName}</span>
                  <span className="block truncate text-sm text-ink-500">
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
                <ArrowRight className="h-3.5 w-3.5 shrink-0 justify-self-end text-ink-300" />
              </button>
            </li>
          ))}
        </ul>
      )}
    </Panel>
  )

  const sourcesPanel = (
    <Panel>
      <PanelHeader
        title="Sources in the register"
        subtitle="Every source recorded for this molecule, represented or not"
        actions={
          <div className="flex items-center gap-2">
            <Badge tone="outline">{sources.length}</Badge>
            <WriteOnly>
              <WriteButton
                variant="primary"
                size="sm"
                icon={<PlusCircle className="h-3.5 w-3.5" />}
                onClick={() => setOfferOpen(true)}
                disabled={sources.length === 0}
              >
                Record an offer
              </WriteButton>
            </WriteOnly>
          </div>
        }
      />
      {loading ? (
        <SkeletonTable rows={4} cols={5} />
      ) : sources.length === 0 ? (
        <div className="p-4">
          <EmptyState
            icon={<Target className="h-5 w-5" />}
            title={gap ? SOURCING_GAP_COPY[gap].label : 'No source on record'}
            description={
              gap
                ? `${SOURCING_GAP_COPY[gap].detail}${['OPEN', 'SOURCING'].includes(requirement.status) ? ' It appears on the unsourced demand report.' : ''}`
                : 'No source is recorded for this molecule.'
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
          {gap ? (
            <p className="border-b border-paper-200 bg-paper-50 px-4 py-2.5 text-sm text-ink-600">
              {SOURCING_GAP_COPY[gap].detail}
            </p>
          ) : null}
          <ul className="divide-y divide-paper-200">
            {sources.map((s) => (
              <KnownSourceRow key={s.mp.id} source={s} clientCompanyId={requirement.clientCompanyId} />
            ))}
          </ul>
        </>
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

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_20rem]">
        <div className="min-w-0 space-y-4">
          {engagementsFirst ? engagementsPanel : null}
          {sourcesPanel}
          {engagementsFirst ? null : engagementsPanel}
        </div>

        <div className="space-y-4">
          <Panel>
            <PanelHeader title="What the client asked for" />
            <div className="p-4">
              <FieldGrid cols={2}>
                <Field label="Client">
                  <Link to={`/clients/${requirement.clientCompanyId}`} className="link">
                    {companyName(db, requirement.clientCompanyId)}
                  </Link>
                </Field>
                <Field label="Molecule">
                  <Link to={`/products/${requirement.productId}`} className="link">
                    {product?.genericName ?? '—'}
                  </Link>
                </Field>
                <Field label="Annual quantity">
                  {fmtQty(requirement.estAnnualQty, requirement.qtyUom)}
                  {requirement.qtyIsIndicative ? <span className="ml-1 text-sm text-ink-400">indicative</span> : null}
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
                    <p className="text-sm font-medium text-ink-500">Why a second open requirement</p>
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

      <RecordOfferDialog
        open={offerOpen}
        onOpenChange={setOfferOpen}
        productId={requirement.productId}
        clientCompanyId={requirement.clientCompanyId}
        requirementId={requirement.id}
      />
    </div>
  )
}

/** One source for the molecule, as plain facts — no verdict on whether to offer it. */
function KnownSourceRow({ source, clientCompanyId }: { source: SourceRow; clientCompanyId: string }) {
  const db = useDb()
  const existing = engagementFor(db, clientCompanyId, source.mp.id)
  const tier = source.priceTiers[0]

  return (
    <li className="flex items-start gap-3 px-3 py-3">
      <div className="min-w-0 flex-1 space-y-1.5">
        <div className="flex flex-wrap items-center gap-2">
          <Link to={`/sources/${source.mp.id}`} className="text-sm font-semibold text-ink-900 hover:text-accent-700">
            {source.manufacturer.displayName}
          </Link>
          <span className="text-sm text-ink-500">{countryName(source.manufacturer.countryCode)}</span>
          <PortfolioBadge inPortfolio={source.inPortfolio} offerable={source.isOfferable} />
          {existing ? (
            <span className="inline-flex items-center gap-1.5">
              <Badge tone="neutral">Engagement recorded</Badge>
              <StageBadge stage={existing.stage} size="sm" />
            </span>
          ) : null}
        </div>
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-ink-600">
          <span>
            <span className="text-ink-400">Grade </span>
            {source.mp.grade}
            <span className="ml-1.5 text-sm text-ink-500">{source.mp.pharmacopoeia}</span>
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
        <div className="flex flex-wrap items-center gap-2 text-sm">
          {tier ? (
            <span className="font-medium tabular text-ink-900">
              {fmtMoney(tier.price, tier.currency, { decimals: 0 })}
              <span className="text-sm text-ink-400">
                /{tier.perUom} {tier.incoterm}
              </span>
              <span className="ml-2 text-sm text-ink-500">valid to {fmtDate(source.earliestPriceExpiry)}</span>
            </span>
          ) : (
            <span className="text-sm text-ink-500">No current price on record</span>
          )}
        </div>
      </div>
    </li>
  )
}
