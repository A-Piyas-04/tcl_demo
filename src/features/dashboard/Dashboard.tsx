/**
 * The dashboard (doc 04 §5).
 *
 * It answers one question first: what should I do today? The "needs
 * attention" list groups the work by the action it needs, and every item opens
 * the record where that action is taken. Beside it, the pipeline and the
 * commission book give the shape of the business; underneath, the trade in
 * progress. Both roles see the same figures; only the action buttons differ.
 */

import * as React from 'react'
import { Link } from 'react-router-dom'
import {
  ArrowRight,
  ArrowUpRight,
  Boxes,
  CalendarClock,
  CheckCircle2,
  FileWarning,
  PackageSearch,
  Ship,
  Wallet,
} from 'lucide-react'
import { useCurrentUser, useDb } from '@/data/store'
import {
  attentionGroups,
  commissionMoney,
  dashboard,
  type AttentionGroup,
  type DashboardData,
} from '@/data/selectors'
import { STAGE_LABEL, STAGE_STYLE } from '@/data/reference'
import { useAsyncData, useLocalPreference } from '@/lib/hooks'
import { ageTone, cn, fmtMoneyTotals, pluralise } from '@/lib/utils'
import {
  AnimatedNumber,
  Badge,
  EmptyState,
  KpiTile,
  MiniBars,
  PageHeading,
  Panel,
  Quiet,
  PanelHeader,
  SegmentedControl,
  SkeletonTiles,
  TileGrid,
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
  const ownerId = scope === 'mine' && user ? user.id : undefined

  const { data, loading } = useAsyncData(
    () => ({ dash: dashboard(db, ownerId), attention: attentionGroups(db, ownerId) }),
    [ownerId],
  )

  const greeting = React.useMemo(() => {
    const h = new Date().getHours()
    return h < 12 ? 'Good morning' : h < 17 ? 'Good afternoon' : 'Good evening'
  }, [])

  return (
    <div className="space-y-6">
      <PageHeading
        title={`${greeting}, ${user?.fullName.split(' ')[0]}`}
        subtitle="What needs attention today"
        actions={
          ownsAnything ? (
            <SegmentedControl
              value={scope}
              onChange={setScope}
              options={[
                { value: 'all', label: 'Everyone' },
                { value: 'mine', label: 'Mine' },
              ]}
            />
          ) : null
        }
      />

      {loading || !data ? (
        <SkeletonTiles count={8} />
      ) : (
        <>
          <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_24rem]">
            <AttentionPanel groups={data.attention} mineOnly={Boolean(ownerId)} />
            <div className="grid content-start gap-4 sm:grid-cols-2 xl:grid-cols-1">
              <PipelineTile data={data.dash} />
              <CommissionTile />
            </div>
          </div>

          <div>
            <h2 className="mb-2 text-sm font-semibold text-ink-500">Trade in progress</h2>
            <TileGrid>
              <KpiTile
                label="Client orders open"
                value={
                  <AnimatedNumber
                    value={db.clientOrders.filter((o) => !['COMPLETED', 'CANCELLED'].includes(o.status)).length}
                  />
                }
                unit="not yet delivered"
                icon={<Boxes className="h-4 w-4" />}
                to="/client-orders"
                hint={`${pluralise(db.clientOrders.filter((o) => o.status === 'COMPLETED').length, 'order')} completed`}
              />
              <KpiTile
                label="Shipments on the way"
                value={<AnimatedNumber value={data.dash.shipmentsInTransit} />}
                unit="planned or in transit"
                icon={<Ship className="h-4 w-4" />}
                to="/shipments"
                hint={
                  data.dash.shipmentsHeld > 0
                    ? `${pluralise(data.dash.shipmentsHeld, 'shipment')} held at customs`
                    : 'Nothing held at customs.'
                }
                tone={data.dash.shipmentsHeld > 0 ? 'warn' : 'default'}
              />
              <KpiTile
                label="Letters of credit"
                value={<AnimatedNumber value={data.dash.lcsExpiring.length} />}
                unit="expiring within 45 days"
                icon={<CalendarClock className="h-4 w-4" />}
                to="/indents?lc=expiring"
                hint={`${pluralise(db.indents.filter((i) => i.lcNumber).length, "credit")} open`}
              />
              <KpiTile
                label="Certificates"
                value={<AnimatedNumber value={data.dash.documentsExpiring.length} />}
                unit="expired or expiring"
                tone={data.dash.documentsExpiring.some((d) => d.state === 'expired') ? 'danger' : 'default'}
                icon={<FileWarning className="h-4 w-4" />}
                to="/documents/expiring"
                hint={
                  data.dash.documentsExpiring.filter((d) => d.state === 'expired').length > 0
                    ? `${data.dash.documentsExpiring.filter((d) => d.state === 'expired').length} already expired.`
                    : 'A warning before a shipment is held, not after.'
                }
              />
            </TileGrid>
          </div>

          {data.dash.unsourced.length > 0 ? <UnsourcedPanel data={data.dash} /> : null}
        </>
      )}
    </div>
  )
}

const AREA_ORDER: AttentionGroup['area'][] = ['Sourcing', 'Trade', 'Commission']
const TONE_DOT: Record<AttentionGroup['tone'], string> = {
  danger: 'bg-danger-600',
  warn: 'bg-warn-500',
  accent: 'bg-accent-500',
}

function AttentionPanel({ groups, mineOnly }: { groups: AttentionGroup[]; mineOnly: boolean }) {
  const total = groups.reduce((n, g) => n + g.items.length, 0)
  return (
    <Panel className="min-w-0">
      <PanelHeader
        title="Needs attention"
        subtitle={mineOnly ? 'Your engagements and requirements' : 'Grouped by what has to be done, oldest first'}
        actions={<Badge tone={total ? 'warn' : 'ok'}>{total}</Badge>}
      />
      {groups.length === 0 ? (
        <div className="p-4">
          <EmptyState
            icon={<CheckCircle2 className="h-5 w-5 text-ok-600" />}
            title="Nothing is waiting on you"
            description="Every sample has an answer, every approval has an order, and nothing is stuck in transit."
            compact
          />
        </div>
      ) : (
        <div className="divide-y divide-paper-200">
          {AREA_ORDER.map((area) => {
            const inArea = groups.filter((g) => g.area === area)
            if (inArea.length === 0) return null
            return (
              <section key={area} className="px-4 py-3">
                <h3 className="mb-2 text-sm font-semibold text-ink-400">{area}</h3>
                <ul className="space-y-3">
                  {inArea.map((g) => (
                    <li key={g.key}>
                      <div className="flex items-start gap-2">
                        <span className={cn('mt-1.5 h-2 w-2 shrink-0 rounded-full', TONE_DOT[g.tone])} />
                        <div className="min-w-0 flex-1">
                          {/* title states the count; note is an observation, never an instruction */}
                          <p className="text-base font-semibold text-ink-900">{g.title}</p>
                          {g.note ? <p className="mt-0.5 text-sm text-ink-500">{g.note}</p> : null}
                          <ul className="mt-1.5 space-y-0.5">
                            {g.items.slice(0, 3).map((item) => (
                              <li key={item.id}>
                                <Link
                                  to={item.href}
                                  className="group flex items-center gap-2 rounded px-1.5 py-1 text-sm transition-colors hover:bg-paper-100"
                                >
                                  <span className="min-w-0 truncate font-medium text-ink-800 group-hover:text-accent-700">
                                    {item.label}
                                  </span>
                                  <span className="hidden min-w-0 flex-1 truncate text-ink-500 sm:block">{item.sublabel}</span>
                                  {item.meta ? <span className="ml-auto shrink-0 tabular text-ink-400">{item.meta}</span> : null}
                                  <ArrowRight className="h-3 w-3 shrink-0 text-ink-300" />
                                </Link>
                              </li>
                            ))}
                          </ul>
                          {g.items.length > 3 && g.seeAll ? (
                            <Link to={g.seeAll} className="ml-1.5 text-sm font-medium link">
                              See all {g.items.length}
                            </Link>
                          ) : g.items.length > 3 ? (
                            <p className="ml-1.5 text-sm text-ink-400">and {g.items.length - 3} more</p>
                          ) : null}
                        </div>
                      </div>
                    </li>
                  ))}
                </ul>
              </section>
            )
          })}
        </div>
      )}
    </Panel>
  )
}

/** The pipeline as a distribution; each bar opens the board at that stage. */
function PipelineTile({ data }: { data: DashboardData }) {
  const total = data.pipelineByStage.reduce((s, x) => s + x.count, 0)
  const commercial = data.pipelineByStage.find((s) => s.stage === 'COMMERCIAL')?.count ?? 0

  // No `to` on this tile: its bars are themselves links, and a link inside a
  // link is invalid markup.
  return (
    <KpiTile label="Engagements by stage" icon={<ArrowUpRight className="h-4 w-4" />} className="min-h-[15rem]">
      <div className="flex items-baseline gap-2">
        <AnimatedNumber value={total} className="text-2xl font-semibold leading-none text-ink-900" />
        <span className="text-sm font-medium text-ink-400">active client × supplier deals</span>
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
      <p className="text-sm text-ink-500">
        <span className="font-semibold text-ok-600">{commercial}</span> in commercial supply ·{' '}
        <Link to="/engagements" className="font-medium link">
          open the board
        </Link>
      </p>
    </KpiTile>
  )
}

/**
 * TCL's earnings. Formerly an inverted dark card, which made one tile a
 * different kind of object from its neighbours for no reason the reader could
 * act on. Same white surface as every other tile now.
 */
function CommissionTile() {
  const db = useDb()
  const money = commissionMoney(db)
  const earned = money.earned.reduce((n, m) => n + m.amount, 0)
  const received = money.received.reduce((n, m) => n + m.amount, 0)
  const collected = earned > 0 ? (received / earned) * 100 : 0
  const tbd = db.commissions.filter((c) => c.basis === 'TBD' && c.status !== 'WRITTEN_OFF').length

  return (
    <KpiTile label="Commission from clients" icon={<Wallet className="h-4 w-4" />} to="/commissions">
      <div>
        <p className="text-sm text-ink-600">Outstanding</p>
        <p className="text-xl font-semibold leading-tight text-ink-900">
          {fmtMoneyTotals(money.outstanding, { compact: true, decimals: 0 })}
        </p>
      </div>
      <dl className="space-y-1.5 text-base">
        {(
          [
            ['Earned', money.earned],
            ['Invoiced', money.invoiced],
            ['Received', money.received],
          ] as const
        ).map(([label, value]) => (
          <div key={label} className="flex items-baseline justify-between gap-2">
            <dt className="text-ink-500">{label}</dt>
            <dd className="font-semibold text-ink-900">
              {fmtMoneyTotals([...value], { compact: true, decimals: 0 })}
            </dd>
          </div>
        ))}
      </dl>
      <div>
        <div className="h-1.5 overflow-hidden rounded-full bg-paper-300">
          <div className="h-full rounded-full bg-accent-600" style={{ width: `${collected}%` }} />
        </div>
        <p className="mt-2 text-sm leading-relaxed text-ink-500">
          {collected.toFixed(0)}% collected
          {tbd > 0 ? ` · ${tbd} with terms still to agree` : ''}
        </p>
      </div>
    </KpiTile>
  )
}

function UnsourcedPanel({ data }: { data: DashboardData }) {
  const molecules = new Set(data.unsourced.map((r) => r.product.id)).size
  return (
    <Panel>
      <PanelHeader
        title="Unsourced demand"
        subtitle={`${pluralise(molecules, 'molecule')} across ${pluralise(data.unsourced.length, 'open requirement')} with no represented source`}
        icon={<PackageSearch className="h-4 w-4" />}
        actions={
          <Link to="/requirements/unsourced" className="text-sm font-medium link">
            Open unsourced demand
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
            <span className="truncate text-base text-ink-500">{r.client.displayName}</span>
            {/* the kind of requirement is a fixed attribute, not a changing state */}
            <Quiet>{r.requirement.kind === 'NEW_DEVELOPMENT' ? 'New development' : 'Alternate source'}</Quiet>
            <span className={cn('w-24 shrink-0 text-right text-base font-semibold', ageTone(r.daysOpen, 180, 365))}>
              {r.daysOpen} days
            </span>
          </li>
        ))}
      </ul>
    </Panel>
  )
}

