/**
 * Engagement detail: the workspace for one deal (FR-M6-05, UC-06 to UC-10).
 *
 * One client, one manufacturer's product. The top of the page answers "where
 * is this and what do I do next": the sourcing stages, the trade steps that
 * follow approval, and one suggested next step whose button opens the right
 * dialog. Underneath, tabs hold the detail: offers and samples, the orders,
 * indents, shipments and commission that came of it, its documents, and its
 * history. Nothing about the deal needs another screen to be understood.
 */

import * as React from 'react'
import { Link, useParams, useSearchParams } from 'react-router-dom'
import { Building2, ChevronDown, History, Users } from 'lucide-react'
import { useDb } from '@/data/store'
import {
  approvalContext,
  companyName,
  currentPriceTiers,
  dealProgress,
  latestPrice,
  nextStepFor,
  userName,
  type NextStep,
} from '@/data/selectors'
import { STAGE_LABEL, countryName, stageConfig } from '@/data/reference'
import { manualNextStages } from '@/data/rules'
import { fmtDate, fmtMoney, fmtQty, pluralise } from '@/lib/utils'
import type { EngagementStage } from '@/data/types'
import {
  AgeingFlag,
  Badge,
  Button,
  EmptyState,
  Field,
  FieldGrid,
  FilingDot,
  HelpTip,
  InlineWarning,
  LinkButton,
  Menu,
  MenuContent,
  MenuItem,
  MenuLabel,
  MenuSeparator,
  MenuTrigger,
  PageHeading,
  Panel,
  PanelHeader,
  PortfolioBadge,
  StageBadge,
  StageRail,
  StageTimeline,
  Tab,
  TabList,
  TabPanel,
  Tabs,
  Tooltip,
  WriteOnly,
} from '@/components/ui'
import {
  ActivityPanel,
  CommissionStatusBadge,
  DocumentsPanel,
  OrderStatusBadge,
  ShipmentStatusBadge,
} from '@/components/ui/records'
import { NotFound } from '@/features/misc/Fallbacks'
import { lcState } from '@/features/orders/shared'
import { StageChangeDialog } from './StageDialogs'
import { OfferDialog, OfferPanel } from './OfferPanel'
import { SamplePanel, SampleStepDialog } from './SamplePanel'
import { NextStepCard, TradeSteps } from './DealProgress'

const TABS = ['overview', 'work', 'trade', 'documents', 'history'] as const
type TabKey = (typeof TABS)[number]

export function EngagementDetail() {
  const { id = '' } = useParams()
  const db = useDb()
  const [params, setParams] = useSearchParams()
  const [target, setTarget] = React.useState<EngagementStage | null>(null)
  const [offerOpen, setOfferOpen] = React.useState(false)
  const [sampleStep, setSampleStep] = React.useState<{
    kind: 'request' | 'dispatch' | 'receipt' | 'outcome'
    roundId?: string
  } | null>(null)

  const tabParam = params.get('tab') as TabKey | null
  const tab: TabKey = tabParam && TABS.includes(tabParam) ? tabParam : 'overview'
  const setTab = (next: string) => {
    const p = new URLSearchParams(params)
    if (next === 'overview') p.delete('tab')
    else p.set('tab', next)
    setParams(p, { replace: true })
  }

  const engagement = db.engagements.find((e) => e.id === id)
  if (!engagement) return <NotFound />

  const product = db.products.find((p) => p.id === engagement.productId)
  const mp = db.manufacturerProducts.find((m) => m.id === engagement.manufacturerProductId)
  const manufacturer = db.companies.find((c) => c.id === engagement.manufacturerCompanyId)
  const client = db.companies.find((c) => c.id === engagement.clientCompanyId)
  const filings = db.filings.filter((f) => f.manufacturerProductId === engagement.manufacturerProductId && f.isActive)
  const tiers = currentPriceTiers(db, engagement.manufacturerProductId)
  const expired = latestPrice(db, engagement.manufacturerProductId)
  const inPortfolio = db.portfolio.some((p) => p.manufacturerProductId === engagement.manufacturerProductId && p.isActive)
  const history = db.stageHistory.filter((h) => h.engagementId === engagement.id)
  const requirements = db.requirementEngagements
    .filter((l) => l.engagementId === engagement.id)
    .map((l) => db.requirements.find((r) => r.id === l.requirementId))
    .filter((r): r is NonNullable<typeof r> => Boolean(r))
  const peers = db.engagements.filter(
    (o) => o.productId === engagement.productId && o.clientCompanyId !== engagement.clientCompanyId,
  ).length
  const offerCount = db.offers.filter((o) => o.engagementId === engagement.id).length
  const sampleCount = db.samples.filter((s) => s.engagementId === engagement.id).length

  const deal = dealProgress(db, engagement)
  const next = nextStepFor(db, engagement)
  const approval = approvalContext(db, engagement)
  const manual = manualNextStages(engagement)
  const daysInStage = Math.max(0, Math.round((Date.now() - new Date(engagement.stageChangedAt).getTime()) / 86400000))

  const recordName = `${product?.genericName ?? 'This molecule'} (${manufacturer?.displayName ?? 'source'}) for ${client?.displayName ?? 'the client'}`

  const runNext = (step: NextStep) => {
    const action = step.action
    if (!action) return
    switch (action.kind) {
      case 'offer':
        setOfferOpen(true)
        break
      case 'sample':
        setSampleStep({ kind: 'request' })
        break
      case 'dispatch':
      case 'receipt':
      case 'outcome':
        setSampleStep({ kind: action.kind, roundId: action.roundId })
        break
      case 'approve':
        setTarget('APPROVED')
        break
      case 'link':
        break
    }
  }

  const offerBlocked =
    next.action?.kind === 'offer' && tiers.length === 0
      ? {
          text: expired
            ? `No offer can be made: the source price expired on ${fmtDate(expired.validTo)}.`
            : 'No offer can be made: this source has no price on record.',
          href: `/sources/${engagement.manufacturerProductId}`,
          label: 'Renew the source price',
        }
      : null

  return (
    <div className="space-y-4">
      <PageHeading
        title={`${client?.displayName ?? 'Client'} · ${product?.genericName ?? 'Engagement'}`}
        subtitle={`From ${manufacturer?.displayName ?? 'an unknown manufacturer'}${mp ? `, ${mp.grade}, ${mp.pharmacopoeia}` : ''}. An engagement follows one client considering one manufacturer's product, from first offer to commercial supply.`}
        meta={
          <>
            <StageBadge stage={engagement.stage} />
            <Tooltip content={`Ageing threshold for this stage is ${stageConfig(engagement.stage).ageingThresholdDays} days.`}>
              <span className="inline-flex items-center gap-1">
                <span className="text-xs text-ink-500">in stage</span>
                <AgeingFlag days={daysInStage} threshold={stageConfig(engagement.stage).ageingThresholdDays} />
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
                <Button variant="secondary" size="md" icon={<ChevronDown className="h-3.5 w-3.5" />}>
                  Change stage
                </Button>
              </MenuTrigger>
              <MenuContent>
                <MenuLabel>From {STAGE_LABEL[engagement.stage]}</MenuLabel>
                {manual.length === 0 ? (
                  <MenuItem disabled>Nothing to change by hand</MenuItem>
                ) : (
                  manual.map((stage) => (
                    <MenuItem key={stage} onSelect={() => setTarget(stage)}>
                      {STAGE_LABEL[stage]}
                    </MenuItem>
                  ))
                )}
                <MenuSeparator />
                <p className="max-w-[15rem] px-2 py-1 text-2xs text-ink-400">
                  Offers and samples move the stage when recorded.
                </p>
              </MenuContent>
            </Menu>
          </WriteOnly>
        }
      />

      <Panel>
        <div className="grid gap-4 p-4 lg:grid-cols-[minmax(0,1fr)_20rem]">
          <div className="min-w-0 space-y-4">
            <div className="space-y-1.5">
              <p className="text-2xs font-semibold uppercase tracking-wider text-ink-500">Sourcing</p>
              <StageRail stage={engagement.stage} history={history} stageBeforeHold={engagement.stageBeforeHold} />
            </div>
            <div className="space-y-1.5">
              <p className="text-2xs font-semibold uppercase tracking-wider text-ink-500">Trade</p>
              <TradeSteps steps={deal.steps} />
            </div>
            <div className="grid gap-x-5 gap-y-2 sm:grid-cols-2 lg:grid-cols-4">
              <Field label="First offered">{fmtDate(engagement.firstOfferedOn)}</Field>
              <Field label="First sample">{fmtDate(engagement.firstSampleOn)}</Field>
              <Field label="Approved on">{fmtDate(engagement.approvedOn)}</Field>
              <Field label="First commercial supply">{fmtDate(engagement.firstCommercialOn)}</Field>
            </div>
          </div>
          <NextStepCard step={next} onAction={() => runNext(next)} blockedReason={offerBlocked} />
        </div>
      </Panel>

      {engagement.approvalConditions ? (
        <InlineWarning>
          <span>
            <strong>Conditional approval.</strong> {engagement.approvalConditions} The condition is shown again on any
            order line raised against this source.
          </span>
        </InlineWarning>
      ) : null}

      <Tabs value={tab} onValueChange={setTab}>
        <TabList>
          <Tab value="overview">Overview</Tab>
          <Tab value="work">
            Offers &amp; samples
            <span className="ml-1.5 text-2xs text-ink-400">{offerCount + sampleCount}</span>
          </Tab>
          <Tab value="trade">
            Orders &amp; shipments
            <span className="ml-1.5 text-2xs text-ink-400">{deal.orders.length}</span>
          </Tab>
          <Tab value="documents">Documents</Tab>
          <Tab value="history">History</Tab>
        </TabList>

        <TabPanel value="overview" className="pt-4">
          <div className="grid gap-4 lg:grid-cols-3">
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
                    <Link to={`/manufacturers/${engagement.manufacturerCompanyId}`} className="text-accent-700 hover:underline">
                      {manufacturer?.displayName ?? '—'}
                    </Link>
                  </Field>
                  <Field label="Grade">{mp?.grade ?? '—'}</Field>
                  <Field label="Pharmacopoeia">{mp?.pharmacopoeia ?? '—'}</Field>
                  <Field label="Lead time">{mp?.leadTimeDays ? `${mp.leadTimeDays} days` : '—'}</Field>
                  <Field label="MOQ">{fmtQty(mp?.moqQty ?? null, mp?.moqUom ?? null)}</Field>
                  <Field label="Price from">
                    {tiers[0] ? (
                      `${fmtMoney(tiers[0].price, tiers[0].currency, { decimals: 0 })}/${tiers[0].perUom}`
                    ) : (
                      <span className="text-warn-600">{expired ? `expired ${fmtDate(expired.validTo)}` : 'none'}</span>
                    )}
                  </Field>
                </FieldGrid>
                <div className="flex flex-wrap gap-1.5">
                  <FilingDot present={filings.some((f) => f.kind === 'DMF' || f.kind === 'ASMF')} label="DMF" />
                  <FilingDot present={filings.some((f) => f.kind === 'CEP')} label="CEP" />
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
                  <Field label="Client">
                    <Link to={`/clients/${engagement.clientCompanyId}`} className="text-accent-700 hover:underline">
                      {companyName(db, engagement.clientCompanyId)}
                    </Link>
                  </Field>
                  <Field label="Country">{client ? countryName(client.countryCode) : '—'}</Field>
                </FieldGrid>
                {approval.siblingApproved > 0 ? (
                  <p className="flex items-center gap-1 text-xs text-ink-500">
                    {pluralise(approval.siblingApproved, 'other approved source')} for this molecule
                    <HelpTip>Dual sourcing is normal and regulator-encouraged.</HelpTip>
                  </p>
                ) : null}
                <LinkButton to={`/engagements/${id}/peers`} variant="ghost" size="sm">
                  Other clients taking this molecule
                  <span className="ml-1 text-2xs text-ink-400">{peers}</span>
                </LinkButton>
              </div>
            </Panel>

            <Panel>
              <PanelHeader title="Requirements served" subtitle="The client enquiries this engagement answers" />
              {requirements.length > 0 ? (
                <ul className="divide-y divide-paper-200">
                  {requirements.map((r) => (
                    <li key={r.id} className="px-3 py-2">
                      <Link
                        to={`/requirements/${r.id}`}
                        className="flex items-center justify-between gap-2 text-sm text-ink-800 hover:text-accent-700"
                      >
                        <span className="truncate">Enquiry of {fmtDate(r.enquiryDate)}</span>
                        <span className="shrink-0 text-xs tabular text-ink-500">{fmtQty(r.estAnnualQty, r.qtyUom)}/yr</span>
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
          </div>
        </TabPanel>

        <TabPanel value="work" className="space-y-4 pt-4">
          <OfferPanel engagement={engagement} />
          <SamplePanel engagement={engagement} onRequestStage={setTarget} />
        </TabPanel>

        <TabPanel value="trade" className="pt-4">
          <TradeTab dealData={deal} next={next} />
        </TabPanel>

        <TabPanel value="documents" className="pt-4">
          <DocumentsPanel
            entityType="ENGAGEMENT"
            entityId={engagement.id}
            title="Documents"
            subtitle="Quotations, COAs, specifications and the client's approval letter"
            emptyHint="Quotations, COAs and the client's approval letter belong on this engagement."
          />
        </TabPanel>

        <TabPanel value="history" className="grid gap-4 pt-4 lg:grid-cols-2">
          <Panel>
            <PanelHeader
              title="Stage history"
              subtitle="Every move, with who made it, why, and how long the previous stage lasted"
              icon={<History className="h-4 w-4" />}
            />
            <div className="p-4">
              {history.length > 0 ? (
                <StageTimeline history={history} userName={(uid) => userName(db, uid)} />
              ) : (
                <EmptyState title="No stage change has been recorded yet" compact />
              )}
            </div>
          </Panel>
          <ActivityPanel
            entityType="ENGAGEMENT"
            entityId={engagement.id}
            subtitle="Calls, emails and visits on this engagement"
            emptyHint="A short note after a call is what makes the history readable six months later."
          />
        </TabPanel>
      </Tabs>

      <StageChangeDialog
        engagement={target ? engagement : null}
        to={target}
        recordName={recordName}
        onClose={() => setTarget(null)}
        requireNoteBecause={target === 'APPROVED' ? approval.requireNoteBecause : null}
        notice={
          target === 'APPROVED' && approval.siblingApproved > 0 ? (
            <InlineWarning>
              <span>
                {client?.displayName ?? 'This client'} already has {pluralise(approval.siblingApproved, 'approved source')}{' '}
                for {product?.genericName ?? 'this molecule'}. That is permitted, and worth knowing so the duplication is
                deliberate.
              </span>
            </InlineWarning>
          ) : null
        }
      />
      {offerOpen ? (
        <OfferDialog open={offerOpen} onOpenChange={setOfferOpen} engagement={engagement} revision={offerCount > 0} />
      ) : null}
      <SampleStepDialog engagement={engagement} step={sampleStep} onClose={() => setSampleStep(null)} />
    </div>
  )
}

/** Everything ordered through this client and source, in the order it happens. */
function TradeTab({ dealData, next }: { dealData: ReturnType<typeof dealProgress>; next: NextStep }) {
  const db = useDb()
  const { orders, indents, shipments, commissions, lineStatuses } = dealData

  if (orders.length === 0) {
    return (
      <Panel className="p-4">
        <EmptyState
          title="Nothing has been ordered through this source yet"
          description="Once the client approves the source, their order is recorded here, then the indent TCL places on the manufacturer, the shipments and TCL's commission."
          action={
            next.action?.kind === 'link' && next.action.href.includes('/client-orders/new') ? (
              <WriteOnly>
                <LinkButton to={next.action.href} variant="primary" size="sm">
                  Record client order
                </LinkButton>
              </WriteOnly>
            ) : undefined
          }
        />
      </Panel>
    )
  }

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <Panel>
        <PanelHeader title="Client orders" subtitle="What the client ordered from this source" />
        <ul className="divide-y divide-paper-200">
          {orders.map((o) => {
            const lines = lineStatuses.filter((l) => l.orderId === o.id)
            return (
              <li key={o.id} className="px-4 py-2.5">
                <div className="flex flex-wrap items-center gap-2">
                  <Link to={`/client-orders/${o.id}`} className="font-mono text-xs font-medium text-accent-700 hover:underline">
                    {o.coNumber}
                  </Link>
                  <OrderStatusBadge status={o.status} />
                  <span className="ml-auto text-xs text-ink-500">{fmtDate(o.orderDate)}</span>
                </div>
                {lines.map((l) => (
                  <p key={l.lineId} className="mt-1 text-xs tabular text-ink-600">
                    {fmtQty(l.orderedQty, l.uom)} ordered · {fmtQty(l.shippedQty, l.uom)} shipped ·{' '}
                    {fmtQty(l.deliveredQty, l.uom)} delivered
                  </p>
                ))}
              </li>
            )
          })}
        </ul>
      </Panel>

      <Panel>
        <PanelHeader title="Indents" subtitle="Placed on the manufacturer for this client" />
        {indents.length === 0 ? (
          <div className="p-3">
            <EmptyState title="No indent placed yet" description="Raise it from the client order." compact />
          </div>
        ) : (
          <ul className="divide-y divide-paper-200">
            {indents.map((i) => {
              const lc = lcState(i).state
              const commission = commissions.find((c) => c.indentId === i.id)
              return (
                <li key={i.id} className="flex flex-wrap items-center gap-2 px-4 py-2.5">
                  <Link to={`/indents/${i.id}`} className="font-mono text-xs font-medium text-accent-700 hover:underline">
                    {i.indentNumber}
                  </Link>
                  <OrderStatusBadge status={i.status} />
                  <Badge tone={lc === 'none' ? 'outline' : lc === 'expired' ? 'danger' : lc === 'expiring' ? 'warn' : 'ok'}>
                    {lc === 'none' ? 'No LC yet' : lc === 'expired' ? 'LC expired' : lc === 'expiring' ? 'LC expiring' : 'LC on file'}
                  </Badge>
                  {commission ? (
                    <span className="ml-auto flex items-center gap-1.5 text-xs text-ink-500">
                      Commission
                      <CommissionStatusBadge status={commission.status} />
                      {commission.amount != null ? (
                        <span className="tabular">{fmtMoney(commission.amount, commission.currency, { decimals: 0 })}</span>
                      ) : null}
                    </span>
                  ) : null}
                </li>
              )
            })}
          </ul>
        )}
      </Panel>

      <Panel className="lg:col-span-2">
        <PanelHeader title="Shipments" subtitle="Against the indents above" />
        {shipments.length === 0 ? (
          <div className="p-3">
            <EmptyState title="Nothing shipped yet" description="A shipment is added on the indent once the manufacturer confirms despatch." compact />
          </div>
        ) : (
          <ul className="divide-y divide-paper-200">
            {shipments.map((s) => (
              <li key={s.id} className="flex flex-wrap items-center gap-2 px-4 py-2.5">
                <Link to={`/shipments/${s.id}`} className="font-mono text-xs font-medium text-accent-700 hover:underline">
                  {s.shipmentRef}
                </Link>
                <ShipmentStatusBadge status={s.status} />
                <span className="text-xs text-ink-500">
                  {db.indents.find((i) => i.id === s.indentId)?.indentNumber ?? ''}
                </span>
                <span className="ml-auto text-xs tabular text-ink-500">
                  {s.actualArrivalDate ? `arrived ${fmtDate(s.actualArrivalDate)}` : s.eta ? `ETA ${fmtDate(s.eta)}` : ''}
                </span>
              </li>
            ))}
          </ul>
        )}
      </Panel>
    </div>
  )
}
