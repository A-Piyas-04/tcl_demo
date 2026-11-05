/**
 * Other clients taking this API (UC-13, FR-M9-09).
 *
 * Reached from one client's engagement on a molecule. It lists every other
 * client engaged on the same molecule, with the source behind each, and can be
 * regrouped by manufacturer, which is the shape a sourcing officer wants before
 * a volume negotiation.
 *
 * Both roles may use this view in v1, because answering "who else takes this
 * molecule" is a core purpose of the system. The confidentiality concern
 * between competing clients is handled by logging rather than by permissions:
 * every visit writes a CROSS_CLIENT_VIEW entry to the security log.
 */

import * as React from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { ArrowLeft, Building2, ShieldCheck, Users } from 'lucide-react'
import { useDb } from '@/data/store'
import { engagementRows, type EngagementRow } from '@/data/selectors'
import { loadCrossClient } from '@/data/api'
import { useAsyncData, useLocalPreference } from '@/lib/hooks'
import { fmtDate, pluralise } from '@/lib/utils'
import {
  Badge,
  Button,
  Column,
  DataTable,
  EmptyState,
  LinkButton,
  NameCell,
  Panel,
  PanelHeader,
  PageHeading,
  SegmentedControl,
  SkeletonTable,
  StageBadge,
} from '@/components/ui'
import { NotFound } from '@/features/misc/Fallbacks'

type Grouping = 'client' | 'source'

export function PeersView() {
  const { id = '' } = useParams()
  const db = useDb()
  const navigate = useNavigate()
  const [grouping, setGrouping] = useLocalPreference<Grouping>('peers.grouping', 'client')
  const [commercialOnly, setCommercialOnly] = React.useState(false)

  const engagement = db.engagements.find((e) => e.id === id)
  const product = engagement ? db.products.find((p) => p.id === engagement.productId) : undefined
  const fromClient = engagement ? db.companies.find((c) => c.id === engagement.clientCompanyId) : undefined

  const productId = engagement?.productId ?? ''
  const fromClientId = engagement?.clientCompanyId ?? ''

  // The visit itself is the audited event, so it is recorded on arrival.
  React.useEffect(() => {
    if (!productId || !fromClientId) return
    void loadCrossClient(productId, fromClientId)
  }, [productId, fromClientId])

  const { data: rows, loading } = useAsyncData<EngagementRow[]>(
    () =>
      productId
        ? engagementRows(db, { productId, excludeClientId: fromClientId }).sort((a, b) =>
            a.client.displayName.localeCompare(b.client.displayName),
          )
        : [],
    [productId, fromClientId],
  )

  if (!engagement || !product || !fromClient) return <NotFound />

  const shown = (rows ?? []).filter((r) => (commercialOnly ? r.stage === 'COMMERCIAL' : true))
  const clientCount = new Set(shown.map((r) => r.client.id)).size
  const sourceCount = new Set(shown.map((r) => r.manufacturer.id)).size

  const columns: Column<EngagementRow>[] = [
    {
      key: 'client',
      header: 'Client',
      pinned: true,
      sortable: true,
      value: (r) => r.client.displayName,
      cell: (r) => <NameCell title={r.client.displayName} subtitle={r.client.legalName} />,
    },
    {
      key: 'source',
      header: 'Source',
      sortable: true,
      value: (r) => r.manufacturer.displayName,
      cell: (r) => (
        <span className="text-sm text-ink-800">
          {r.manufacturer.displayName}
          <span className="ml-1.5 font-mono text-2xs text-ink-500">
            {r.mp.grade} · {r.mp.pharmacopoeia}
          </span>
        </span>
      ),
    },
    {
      key: 'stage',
      header: 'Stage',
      sortable: true,
      width: '10rem',
      value: (r) => r.stage,
      cell: (r) => <StageBadge stage={r.stage} />,
    },
    {
      key: 'approved',
      header: 'Approved on',
      align: 'right',
      sortable: true,
      width: '9rem',
      value: (r) => r.engagement.approvedOn,
      cell: (r) => <span className="text-xs tabular text-ink-600">{fmtDate(r.engagement.approvedOn)}</span>,
    },
    {
      key: 'commercial',
      header: 'Commercial since',
      align: 'right',
      sortable: true,
      width: '10rem',
      value: (r) => r.engagement.firstCommercialOn,
      cell: (r) =>
        r.engagement.firstCommercialOn ? (
          <span className="text-xs tabular text-ink-700">{fmtDate(r.engagement.firstCommercialOn)}</span>
        ) : (
          <span className="text-xs text-ink-400">Not yet supplying</span>
        ),
    },
    {
      key: 'owner',
      header: 'Owner',
      optional: true,
      value: (r) => r.ownerName,
      cell: (r) => <span className="truncate text-xs text-ink-600">{r.ownerName}</span>,
    },
  ]

  return (
    <div className="space-y-4">
      <PageHeading
        title={`Other clients taking ${product.genericName}`}
        subtitle={`Seen from ${fromClient.displayName}'s engagement. That client's own rows are left out.`}
        meta={
          <>
            <Badge tone="accent">{pluralise(clientCount, 'other client')}</Badge>
            <Badge tone="neutral">{pluralise(sourceCount, 'source')}</Badge>
            <Link to={`/products/${product.id}`} className="text-xs text-accent-700 underline">
              Open the molecule
            </Link>
          </>
        }
        actions={
          <Button
            variant="ghost"
            size="md"
            type="button"
            icon={<ArrowLeft className="h-3.5 w-3.5" />}
            onClick={() => navigate(`/engagements/${id}`)}
          >
            Back to the engagement
          </Button>
        }
      />

      <div className="grid gap-3 lg:grid-cols-3">
        <Panel className="p-3.5 lg:col-span-2">
          <p className="flex items-center gap-1.5 text-xs font-semibold text-ink-700">
            <ShieldCheck className="h-3.5 w-3.5 text-ink-400" />
            This view is recorded
          </p>
          <p className="mt-1 text-xs leading-relaxed text-ink-600">
            Both Full Access and View Only sessions may open this screen. Each visit is written to the security log
            with the user, the molecule and the time, because the clients listed here compete with one another. The
            record exists so the company can see who looked, and it stays inside TCL.
          </p>
        </Panel>
        <Panel className="p-3.5">
          <p className="text-2xs font-semibold uppercase tracking-wider text-ink-500">Starting point</p>
          <Link
            to={`/clients/${fromClient.id}`}
            className="mt-1 block truncate text-sm font-semibold text-ink-900 hover:text-accent-700"
          >
            {fromClient.displayName}
          </Link>
          <p className="mt-0.5 text-xs text-ink-500">
            {product.genericName} · {engagement.stage === 'COMMERCIAL' ? 'in commercial supply' : 'in the pipeline'}
          </p>
        </Panel>
      </div>

      <Panel>
        <PanelHeader
          title={grouping === 'client' ? 'One row per client and source' : 'Grouped by source'}
          subtitle={
            grouping === 'client'
              ? 'A client taking the molecule from two sources appears twice.'
              : 'Per manufacturer, the clients already behind it.'
          }
          actions={
            <>
              <Button
                variant={commercialOnly ? 'primary' : 'secondary'}
                size="sm"
                onClick={() => setCommercialOnly((v) => !v)}
              >
                Commercial only
              </Button>
              <SegmentedControl<Grouping>
                value={grouping}
                onChange={setGrouping}
                size="sm"
                options={[
                  { value: 'client', label: 'By client' },
                  { value: 'source', label: 'By source' },
                ]}
              />
            </>
          }
        />

        {loading ? (
          <SkeletonTable rows={5} cols={5} />
        ) : shown.length === 0 ? (
          <div className="p-4">
            <EmptyState
              icon={<Users className="h-5 w-5" />}
              title={
                commercialOnly
                  ? `No other client is in commercial supply on ${product.genericName}`
                  : `${fromClient.displayName} is the only client on ${product.genericName}`
              }
              description={
                commercialOnly
                  ? 'Others are engaged but not yet supplying. Clear the filter to see them.'
                  : 'Nobody else in the register is engaged on this molecule, so there is no comparison to draw yet.'
              }
              action={
                commercialOnly ? (
                  <Button variant="secondary" size="sm" onClick={() => setCommercialOnly(false)}>
                    Show every stage
                  </Button>
                ) : (
                  <LinkButton to={`/products/${product.id}`} variant="primary" size="sm">
                    Open the molecule
                  </LinkButton>
                )
              }
            />
          </div>
        ) : grouping === 'client' ? (
          <DataTable
            rows={shown}
            columns={columns}
            rowKey={(r) => r.engagement.id}
            onRowClick={(r) => navigate(`/engagements/${r.engagement.id}`)}
            pageSize={20}
          />
        ) : (
          <BySource rows={shown} />
        )}
      </Panel>
    </div>
  )
}

/** Per manufacturer, the clients behind it. Alternate flow 2a of UC-13. */
function BySource({ rows }: { rows: EngagementRow[] }) {
  const navigate = useNavigate()
  const grouped = React.useMemo(() => {
    const map = new Map<string, EngagementRow[]>()
    for (const r of rows) {
      const list = map.get(r.manufacturer.id) ?? []
      list.push(r)
      map.set(r.manufacturer.id, list)
    }
    return [...map.values()].sort(
      (a, b) =>
        b.filter((r) => r.stage === 'COMMERCIAL').length - a.filter((r) => r.stage === 'COMMERCIAL').length ||
        a[0]!.manufacturer.displayName.localeCompare(b[0]!.manufacturer.displayName),
    )
  }, [rows])

  return (
    <ul className="divide-y divide-paper-200">
      {grouped.map((list) => {
        const mfr = list[0]!.manufacturer
        const commercial = list.filter((r) => r.stage === 'COMMERCIAL').length
        return (
          <li key={mfr.id} className="px-4 py-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <Link
                to={`/manufacturers/${mfr.id}`}
                className="flex items-center gap-1.5 text-sm font-semibold text-ink-900 hover:text-accent-700"
              >
                <Building2 className="h-3.5 w-3.5 text-ink-400" />
                {mfr.displayName}
              </Link>
              <span className="flex items-center gap-1.5">
                <Badge tone="neutral">{pluralise(list.length, 'client')}</Badge>
                {commercial > 0 ? <Badge tone="ok">{commercial} supplying</Badge> : null}
              </span>
            </div>
            <ul className="mt-2 space-y-1">
              {list.map((r) => (
                <li key={r.engagement.id}>
                  <button
                    onClick={() => navigate(`/engagements/${r.engagement.id}`)}
                    className="flex w-full items-center gap-3 rounded border border-transparent px-2 py-1.5 text-left transition-colors hover:border-paper-300 hover:bg-paper-100"
                  >
                    <span className="min-w-0 flex-1 truncate text-sm text-ink-800">{r.client.displayName}</span>
                    <span className="hidden font-mono text-2xs text-ink-500 sm:inline">
                      {r.mp.grade} · {r.mp.pharmacopoeia}
                    </span>
                    <StageBadge stage={r.stage} size="sm" />
                    <span className="w-24 text-right text-2xs tabular text-ink-500">
                      {fmtDate(r.engagement.firstCommercialOn ?? r.engagement.approvedOn)}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          </li>
        )
      })}
    </ul>
  )
}
