/**
 * The dashboard (doc 04 §5).
 *
 * Both roles see the same figures; only the action buttons differ. Laid out as
 * a bento grid of near-square tiles — the pipeline tile is the anchor, and
 * nothing stretches into a full-width band.
 */

import * as React from 'react'
import { Link } from 'react-router-dom'
import { motion } from 'framer-motion'
import {
  AlertTriangle,
  ArrowUpRight,
  CalendarClock,
  FileWarning,
  FlaskConical,
  Handshake,
  PackageSearch,
  Ship,
  Timer,
  TriangleAlert,
  Wallet,
} from 'lucide-react'
import { useCurrentUser, useDb } from '@/data/store'
import { dashboard, type DashboardData } from '@/data/selectors'
import { STAGE_LABEL, STAGE_STYLE } from '@/data/reference'
import { useAsyncData, useLocalPreference } from '@/lib/hooks'
import { fmtDate, fmtMoney, pluralise } from '@/lib/utils'
import {
  AgeingFlag,
  AnimatedNumber,
  Badge,
  EmptyState,
  KpiTile,
  MiniBars,
  Panel,
  PanelHeader,
  PageHeading,
  SegmentedControl,
  Skeleton,
  SkeletonTiles,
  StageBadge,
  TileGrid,
  Tooltip,
} from '@/components/ui'

export function Dashboard() {
  const db = useDb()
  const user = useCurrentUser()
  const [scope, setScope] = useLocalPreference<'mine' | 'all'>('dash.scope', 'all')

  const ownsAnything = React.useMemo(
    () =>
      db.engagements.some((e) => e.ownerUserId === user?.id) ||
      db.requirements.some((r) => r.ownerUserId === user?.id),
    [db, user],
  )

  const { data, loading } = useAsyncData<DashboardData>(
    () => dashboard(db, scope === 'mine' && user ? user.id : undefined),
    [scope, user?.id],
  )

  const greeting = React.useMemo(() => {
    const h = new Date().getHours()
    return h < 12 ? 'Good morning' : h < 17 ? 'Good afternoon' : 'Good evening'
  }, [])

  return (
    <div className="space-y-5">
      <PageHeading
        title={`${greeting}, ${user?.fullName.split(' ')[0]}`}
        subtitle="What needs attention today, across the whole book."
        actions={
          ownsAnything ? (
            <SegmentedControl
              value={scope}
              onChange={setScope}
              options={[
                { value: 'mine', label: 'Mine' },
                { value: 'all', label: 'Everyone' },
              ]}
            />
          ) : null
        }
      />

      {loading || !data ? (
        <SkeletonTiles count={8} />
      ) : (
        <>
          <TileGrid>
            <PipelineTile data={data} />

            <KpiTile
              label="Approved, not ordered"
              value={<AnimatedNumber value={data.approvedNotOrdered.length} />}
              unit="sources"
              tone={data.approvedNotOrdered.length > 0 ? 'accent' : 'default'}
              icon={<Handshake className="h-4 w-4" />}
              to="/engagements?stage=APPROVED"
              hint="Approved business sitting idle. The cheapest revenue in the company."
            />

            <KpiTile
              label="Samples awaiting outcome"
              value={<AnimatedNumber value={data.samplesAwaiting.length} />}
              unit="with clients"
              icon={<FlaskConical className="h-4 w-4" />}
              to="/samples?outcome=pending"
              hint={
                data.samplesAwaiting[0]
                  ? `Longest: ${data.samplesAwaiting[0].daysInStage} days, ${data.samplesAwaiting[0].client.displayName}`
                  : 'Nothing outstanding.'
              }
            />

            <KpiTile
              label="Overdue follow-ups"
              value={<AnimatedNumber value={data.overdueFollowUps.length} />}
              unit="past threshold"
              tone={data.overdueFollowUps.length > 4 ? 'warn' : 'default'}
              icon={<Timer className="h-4 w-4" />}
              to="/engagements?ageing=1"
              hint="Offers and samples with no client response beyond the configured window."
            />

            <CommissionTile data={data} />

            <KpiTile
              label="Unsourced demand"
              value={<AnimatedNumber value={data.unsourced.length} />}
              unit="molecules"
              tone={data.unsourced.length > 0 ? 'warn' : 'default'}
              icon={<PackageSearch className="h-4 w-4" />}
              to="/requirements/unsourced"
              hint="Clients asked and TCL has no represented source. This is sourcing's shopping list."
            />

            <KpiTile
              label="Shipments"
              icon={<Ship className="h-4 w-4" />}
              to="/shipments"
              value={<AnimatedNumber value={data.shipmentsInTransit} />}
              unit="in transit"
              footer={
                <div className="mt-1 space-y-1">
                  {data.shipmentsHeld > 0 ? (
                    <span className="flex items-center gap-1 text-danger-700">
                      <TriangleAlert className="h-3 w-3" />
                      {pluralise(data.shipmentsHeld, 'shipment')} held at customs
                    </span>
                  ) : (
                    <span>Nothing held at customs.</span>
                  )}
                  {data.deliveriesDue > 0 ? <span className="block">{data.deliveriesDue} cleared, awaiting delivery</span> : null}
                </div>
              }
            />

            <KpiTile
              label="Certificates expiring"
              value={<AnimatedNumber value={data.documentsExpiring.length} />}
              unit="within 90 days"
              tone={data.documentsExpiring.some((d) => d.state === 'expired') ? 'danger' : 'default'}
              icon={<FileWarning className="h-4 w-4" />}
              to="/documents/expiring"
              hint={
                data.documentsExpiring.filter((d) => d.state === 'expired').length > 0
                  ? `${data.documentsExpiring.filter((d) => d.state === 'expired').length} already expired.`
                  : 'A warning before a shipment is held, not after.'
              }
            />

            <KpiTile
              label="Letters of credit"
              value={<AnimatedNumber value={data.lcsExpiring.length} />}
              unit="expiring soon"
              icon={<CalendarClock className="h-4 w-4" />}
              to="/indents?lc=expiring"
              hint="Opened by the client in the manufacturer's favour. TCL chases, never holds."
            />
          </TileGrid>

          <div className="grid gap-4 lg:grid-cols-2">
            <AttentionList
              title="Awaiting client feedback"
              subtitle="Samples sent or under evaluation, longest first"
              rows={data.samplesAwaiting}
              emptyText="No samples are waiting on a client."
              href="/samples"
            />
            <AttentionList
              title="Approved but never ordered"
              subtitle="Approval won, no order raised yet"
              rows={data.approvedNotOrdered}
              emptyText="Every approved source has an order against it."
              href="/engagements?stage=APPROVED"
              showApprovedOn
            />
          </div>

          {data.unsourced.length > 0 ? (
            <Panel>
              <PanelHeader
                title="Molecules clients asked for that TCL cannot supply"
                subtitle={`${data.unsourced.length} open requirements with no represented source`}
                icon={<PackageSearch className="h-4 w-4" />}
                actions={
                  <Link to="/requirements/unsourced" className="text-xs font-medium text-accent-700 hover:underline">
                    Open the report
                  </Link>
                }
              />
              <ul className="divide-y divide-paper-200">
                {data.unsourced.slice(0, 5).map((r) => (
                  <li key={r.requirement.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 px-4 py-2.5">
                    <Link
                      to={`/requirements/${r.requirement.id}`}
                      className="min-w-0 flex-1 truncate text-sm font-medium text-ink-900 hover:text-accent-700"
                    >
                      {r.product.genericName}
                    </Link>
                    <span className="truncate text-xs text-ink-500">{r.client.displayName}</span>
                    <Badge tone={r.requirement.kind === 'NEW_DEVELOPMENT' ? 'info' : 'accent'}>
                      {r.requirement.kind === 'NEW_DEVELOPMENT' ? 'New' : 'Alternate'}
                    </Badge>
                    <span className="w-20 text-right text-xs tabular text-ink-400">{r.daysOpen}d open</span>
                  </li>
                ))}
              </ul>
            </Panel>
          ) : null}
        </>
      )}
    </div>
  )
}

/** The anchor tile: the pipeline as a distribution, two cells wide and tall. */
function PipelineTile({ data }: { data: DashboardData }) {
  const total = data.pipelineByStage.reduce((s, x) => s + x.count, 0)
  const commercial = data.pipelineByStage.find((s) => s.stage === 'COMMERCIAL')?.count ?? 0

  // No `to` on this tile: its bars are themselves links, and a link inside a
  // link is invalid markup.
  return (
    <KpiTile label="Pipeline by stage" span="big" icon={<ArrowUpRight className="h-4 w-4" />}>
      <div className="flex items-baseline gap-2">
        <AnimatedNumber value={total} className="text-4xl font-semibold leading-none tracking-tight text-ink-900" />
        <span className="text-xs font-medium text-ink-400">live engagements</span>
      </div>
      <div className="mt-1 flex-1">
        <MiniBars
          items={data.pipelineByStage.map((s) => ({
            label: STAGE_LABEL[s.stage],
            value: s.count,
            tone: STAGE_STYLE[s.stage].bar,
            to: `/engagements?stage=${s.stage}`,
          }))}
        />
      </div>
      <p className="text-xs text-ink-500">
        <span className="font-semibold text-ok-600">{commercial}</span> in commercial supply ·{' '}
        <Link to="/engagements" className="font-medium text-accent-700 hover:underline">
          open the board
        </Link>{' '}
        to move one along
      </p>
    </KpiTile>
  )
}

/** TCL's earnings: the one number the business runs on. */
function CommissionTile({ data }: { data: DashboardData }) {
  const { commission } = data
  const collected = commission.earned > 0 ? (commission.received / commission.earned) * 100 : 0

  return (
    <KpiTile label="Commission (from clients)" span="tall" tone="ink" icon={<Wallet className="h-4 w-4" />} to="/commissions">
      <div>
        <p className="text-[10px] uppercase tracking-wider text-paper-400">Outstanding</p>
        <AnimatedNumber
          value={commission.outstanding}
          format={(n) => fmtMoney(n, 'USD', { compact: true, decimals: 0 })}
          className="text-3xl font-semibold leading-none tracking-tight text-white"
        />
      </div>
      <dl className="space-y-1.5 text-xs">
        {[
          ['Earned', commission.earned],
          ['Invoiced', commission.invoiced],
          ['Received', commission.received],
        ].map(([label, value]) => (
          <div key={String(label)} className="flex items-baseline justify-between gap-2">
            <dt className="text-paper-400">{label}</dt>
            <dd className="font-medium tabular text-paper-100">
              {fmtMoney(value as number, 'USD', { compact: true, decimals: 0 })}
            </dd>
          </div>
        ))}
      </dl>
      <div>
        <div className="h-1.5 overflow-hidden rounded-full bg-ink-800">
          <motion.div
            className="h-full rounded-full bg-accent-400"
            initial={{ width: 0 }}
            animate={{ width: `${collected}%` }}
            transition={{ duration: 0.8, ease: [0.22, 1, 0.36, 1] }}
          />
        </div>
        <p className="mt-1.5 text-[10px] leading-relaxed text-paper-400">
          {collected.toFixed(0)}% collected
          {commission.tbdCount > 0 ? ` · ${commission.tbdCount} indents still to be priced` : ''}
        </p>
      </div>
    </KpiTile>
  )
}

function AttentionList({
  title,
  subtitle,
  rows,
  emptyText,
  href,
  showApprovedOn,
}: {
  title: string
  subtitle: string
  rows: ReturnType<typeof dashboard>['samplesAwaiting']
  emptyText: string
  href: string
  showApprovedOn?: boolean
}) {
  return (
    <Panel>
      <PanelHeader
        title={title}
        subtitle={subtitle}
        actions={
          rows.length > 0 ? (
            <Link to={href} className="text-xs font-medium text-accent-700 hover:underline">
              See all
            </Link>
          ) : null
        }
      />
      {rows.length === 0 ? (
        <div className="p-4">
          <EmptyState title={emptyText} compact />
        </div>
      ) : (
        <ul className="divide-y divide-paper-200">
          {rows.slice(0, 6).map((r) => (
            <li key={r.engagement.id}>
              <Link
                to={`/engagements/${r.engagement.id}`}
                className="flex items-center gap-3 px-4 py-2.5 transition-colors hover:bg-paper-100"
              >
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-ink-900">{r.product.genericName}</p>
                  <p className="truncate text-xs text-ink-500">
                    {r.client.displayName} · {r.manufacturer.displayName}
                  </p>
                </div>
                {showApprovedOn ? (
                  <Tooltip content="Client approval date">
                    <span className="hidden text-xs tabular text-ink-500 sm:block">{fmtDate(r.engagement.approvedOn)}</span>
                  </Tooltip>
                ) : (
                  <StageBadge stage={r.stage} size="sm" />
                )}
                <AgeingFlag days={r.daysInStage} threshold={showApprovedOn ? 60 : 60} />
              </Link>
            </li>
          ))}
        </ul>
      )}
    </Panel>
  )
}

/** Small loading placeholder used by other dashboards-in-panels. */
export function PanelLoading({ lines = 4 }: { lines?: number }) {
  return (
    <div className="space-y-2.5 p-4">
      {Array.from({ length: lines }).map((_, i) => (
        <div key={i} className="flex items-center gap-3">
          <Skeleton className="h-3.5 flex-1" />
          <Skeleton className="h-3.5 w-16" />
        </div>
      ))}
    </div>
  )
}

export { AlertTriangle }
