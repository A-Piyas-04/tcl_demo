/**
 * Unsourced demand (FR-M11-06): the sourcing team's shopping list.
 *
 * Open requirements with no represented, available source for the molecule, and
 * for the required pharmacopoeia where one was named. Grouped by molecule and
 * ranked by how much repeated demand sits behind it, because two clients asking
 * for the same thing is a far stronger case for taking on a manufacturer than
 * one client asking once.
 *
 * The screen also separates two different problems. Either nobody in the
 * register makes the molecule, which means finding a manufacturer, or somebody
 * makes it and TCL does not represent them, which means an agency conversation.
 */

import { Link } from 'react-router-dom'
import { Building2, Download, PackageSearch, Target } from 'lucide-react'
import { useDb } from '@/data/store'
import { allSourcesFor, requirementRows, type RequirementRow, type SourceRow } from '@/data/selectors'
import { convertQty, REQUIREMENT_KIND_LABEL } from '@/data/reference'
import { logExport } from '@/data/api'
import { useAsyncData } from '@/lib/hooks'
import { downloadCsv, fmtDate, fmtQty, pluralise } from '@/lib/utils'
import {
  Badge,
  Button,
  EmptyState,
  KpiTile,
  LinkButton,
  Panel,
  PanelHeader,
  PageHeading,
  SkeletonTiles,
  TileGrid,
  Tooltip,
  WriteOnly,
} from '@/components/ui'

type Gap = 'NO_SOURCE' | 'NOT_REPRESENTED' | 'PHARMACOPOEIA' | 'SOURCE_UNAVAILABLE'

const GAP_COPY: Record<Gap, { label: string; tone: 'danger' | 'warn' | 'accent'; detail: string }> = {
  NO_SOURCE: {
    label: 'No source in the register',
    tone: 'danger',
    detail: 'Nobody in the register makes this molecule. Sourcing has to find and register a manufacturer.',
  },
  NOT_REPRESENTED: {
    label: 'Source exists, not represented',
    tone: 'warn',
    detail:
      'The register already holds a manufacturer for this molecule that TCL does not represent. This is an agency conversation, not a search.',
  },
  PHARMACOPOEIA: {
    label: 'Wrong pharmacopoeia',
    tone: 'accent',
    detail:
      'TCL represents a source for this molecule, but not to the standard the client named. Either a second grade from the same plant or another source is needed.',
  },
  SOURCE_UNAVAILABLE: {
    label: 'Source blocked',
    tone: 'warn',
    detail:
      'Every known source is discontinued, or its manufacturer is inactive or blacklisted, so none of them can be offered.',
  },
}

interface Group {
  productId: string
  productName: string
  casNumber: string | null
  clientCount: number
  requirements: RequirementRow[]
  /** total estimated annual volume, converted where the units allow it */
  totalQty: number | null
  qtyUom: string | null
  indicativeOnly: boolean
  gap: Gap
  unrepresented: SourceRow[]
}

export function UnsourcedDemand() {
  const db = useDb()

  const { data: groups, loading } = useAsyncData<Group[]>(() => {
    const rows = requirementRows(db, { unsourcedOnly: true, openOnly: true })
    const byProduct = new Map<string, RequirementRow[]>()
    for (const row of rows) {
      const list = byProduct.get(row.product.id) ?? []
      list.push(row)
      byProduct.set(row.product.id, list)
    }

    const out: Group[] = []
    for (const [productId, list] of byProduct) {
      const product = list[0]!.product
      const known = allSourcesFor(db, productId)
      const unrepresented = known.filter((s) => !s.inPortfolio && s.sourceAvailable)
      const representedAvailable = known.filter((s) => s.inPortfolio && s.sourceAvailable)

      const gap: Gap =
        known.length === 0
          ? 'NO_SOURCE'
          : representedAvailable.length > 0
            ? 'PHARMACOPOEIA'
            : unrepresented.length > 0
              ? 'NOT_REPRESENTED'
              : 'SOURCE_UNAVAILABLE'

      out.push({
        productId,
        productName: product.genericName,
        casNumber: product.casNumber,
        clientCount: new Set(list.map((r) => r.client.id)).size,
        requirements: list.sort((a, b) =>
          (b.requirement.estAnnualQty ?? 0) - (a.requirement.estAnnualQty ?? 0),
        ),
        ...totalVolume(list),
        gap,
        unrepresented,
      })
    }

    // Most repeated demand first: clients asking, then volume behind it.
    return out.sort(
      (a, b) =>
        b.clientCount - a.clientCount ||
        (b.totalQty ?? 0) - (a.totalQty ?? 0) ||
        b.requirements.length - a.requirements.length,
    )
  }, [])

  const all = groups ?? []
  const requirementCount = all.reduce((n, g) => n + g.requirements.length, 0)
  const clientCount = new Set(all.flatMap((g) => g.requirements.map((r) => r.client.id))).size
  const agencyCases = all.filter((g) => g.gap === 'NOT_REPRESENTED').length

  const exportList = () => {
    const rows = all.flatMap((g) =>
      g.requirements.map((r) => [
        g.productName,
        GAP_COPY[g.gap].label,
        g.clientCount,
        r.client.displayName,
        REQUIREMENT_KIND_LABEL[r.requirement.kind],
        r.requirement.requiredPharmacopoeia ?? '',
        r.requirement.estAnnualQty ?? '',
        r.requirement.qtyUom ?? '',
        r.requirement.enquiryDate,
        r.daysOpen,
        r.ownerName,
      ]),
    )
    downloadCsv(
      'unsourced-demand',
      [
        'Molecule',
        'Gap',
        'Clients asking',
        'Client',
        'Kind',
        'Required pharmacopoeia',
        'Estimated annual quantity',
        'Unit',
        'Enquiry date',
        'Days open',
        'Owner',
      ],
      rows,
    )
    void logExport('unsourced demand', 'unsourcedOnly=1&openOnly=1', rows.length)
  }

  return (
    <div className="space-y-4">
      <PageHeading
        title="Unsourced demand"
        subtitle="Open requirements TCL cannot answer today, ranked by the weight of demand behind each molecule."
        meta={
          <>
            <Badge tone="warn">{pluralise(all.length, 'molecule')}</Badge>
            <Badge tone="neutral">{pluralise(requirementCount, 'open requirement')}</Badge>
          </>
        }
        actions={
          <>
            <LinkButton to="/requirements" variant="ghost" size="md">
              All requirements
            </LinkButton>
            <Button
              variant="secondary"
              size="md"
              icon={<Download className="h-3.5 w-3.5" />}
              onClick={exportList}
              disabled={all.length === 0}
            >
              Export
            </Button>
          </>
        }
      />

      {loading ? (
        <SkeletonTiles count={4} />
      ) : all.length === 0 ? (
        <Panel className="p-4">
          <EmptyState
            icon={<Target className="h-5 w-5" />}
            title="Every open requirement has at least one candidate source"
            description="Nothing is waiting on sourcing. The list fills itself again as soon as a requirement is recorded for a molecule TCL cannot supply."
            action={
              <WriteOnly>
                <LinkButton to="/requirements/new" variant="primary" size="sm">
                  Record a requirement
                </LinkButton>
              </WriteOnly>
            }
            secondary={
              <LinkButton to="/requirements" variant="ghost" size="sm">
                Open the requirement list
              </LinkButton>
            }
          />
        </Panel>
      ) : (
        <>
          <TileGrid>
            <KpiTile
              label="Molecules wanted"
              value={all.length}
              icon={<PackageSearch className="h-4 w-4" />}
              hint="Each one is a gap in the portfolio."
            />
            <KpiTile
              label="Clients waiting"
              value={clientCount}
              tone="warn"
              hint={`Across ${pluralise(requirementCount, 'open requirement')}.`}
            />
            <KpiTile
              label="Repeated demand"
              value={all.filter((g) => g.clientCount > 1).length}
              tone="accent"
              hint="Molecules asked for by more than one client. Start here."
            />
            <KpiTile
              label="Agency conversations"
              value={agencyCases}
              icon={<Building2 className="h-4 w-4" />}
              hint="A source is already in the register but is not represented."
            />
          </TileGrid>

          <div className="grid gap-3 lg:grid-cols-2">
            {all.map((group, i) => (
              <GroupPanel key={group.productId} group={group} rank={i + 1} />
            ))}
          </div>
        </>
      )}
    </div>
  )
}

function GroupPanel({ group, rank }: { group: Group; rank: number }) {
  const copy = GAP_COPY[group.gap]
  return (
    <Panel>
      <PanelHeader
        title={
          <span className="flex items-center gap-2">
            <span className="grid h-5 w-5 shrink-0 place-items-center rounded bg-ink-900 text-[10px] font-semibold text-white">
              {rank}
            </span>
            <Link to={`/products/${group.productId}`} className="truncate hover:text-accent-700">
              {group.productName}
            </Link>
          </span>
        }
        subtitle={
          group.casNumber ? `CAS ${group.casNumber}` : `${pluralise(group.requirements.length, 'enquiry', 'enquiries')}`
        }
        actions={
          <Tooltip content={copy.detail}>
            <Badge tone={copy.tone}>{copy.label}</Badge>
          </Tooltip>
        }
      />

      <div className="grid grid-cols-2 gap-3 border-b border-paper-200 p-3 sm:grid-cols-3">
        <Cell label="Clients asking" value={String(group.clientCount)} />
        <Cell
          label="Annual volume"
          value={group.totalQty != null ? fmtQty(group.totalQty, group.qtyUom) : 'Not quantified'}
          note={group.indicativeOnly ? 'Indicative' : undefined}
        />
        <Cell label="Enquiries" value={String(group.requirements.length)} />
      </div>

      <ul className="divide-y divide-paper-200">
        {group.requirements.map((r) => (
          <li key={r.requirement.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 px-3 py-2">
            <Link
              to={`/clients/${r.client.id}`}
              className="min-w-0 flex-1 truncate text-sm font-medium text-ink-900 hover:text-accent-700"
            >
              {r.client.displayName}
            </Link>
            <Badge tone={r.requirement.kind === 'NEW_DEVELOPMENT' ? 'info' : 'accent'}>
              {REQUIREMENT_KIND_LABEL[r.requirement.kind]}
            </Badge>
            {r.requirement.requiredPharmacopoeia ? (
              <Badge tone="outline">{r.requirement.requiredPharmacopoeia}</Badge>
            ) : null}
            <span className="text-xs tabular text-ink-600">
              {fmtQty(r.requirement.estAnnualQty, r.requirement.qtyUom)}
            </span>
            <span className="text-xs tabular text-ink-400">{fmtDate(r.requirement.enquiryDate)}</span>
            <Link
              to={`/requirements/${r.requirement.id}`}
              className="text-xs font-medium text-accent-700 hover:underline"
            >
              Open
            </Link>
          </li>
        ))}
      </ul>

      <div className="space-y-2 border-t border-paper-200 bg-paper-50 p-3">
        <p className="text-xs leading-relaxed text-ink-600">{copy.detail}</p>
        {group.unrepresented.length > 0 ? (
          <ul className="flex flex-wrap gap-1.5">
            {group.unrepresented.slice(0, 4).map((s) => (
              <li key={s.mp.id}>
                <Link
                  to={`/sources/${s.mp.id}`}
                  className="inline-flex items-center gap-1.5 rounded border border-paper-300 bg-white px-2 py-1 text-xs text-ink-800 transition-colors hover:border-accent-400"
                >
                  {s.manufacturer.displayName}
                  <span className="font-mono text-2xs text-ink-400">
                    {s.mp.grade} · {s.mp.pharmacopoeia}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        ) : null}
        <WriteOnly>
          <div className="flex flex-wrap gap-2">
            {group.gap === 'NO_SOURCE' ? (
              <LinkButton to="/manufacturers/new" variant="secondary" size="sm">
                Register a manufacturer
              </LinkButton>
            ) : (
              <LinkButton to={`/products/${group.productId}`} variant="secondary" size="sm">
                Review the sources for this molecule
              </LinkButton>
            )}
          </div>
        </WriteOnly>
      </div>
    </Panel>
  )
}

function Cell({ label, value, note }: { label: string; value: string; note?: string }) {
  return (
    <div className="min-w-0">
      <p className="text-2xs font-semibold uppercase tracking-wider text-ink-500">{label}</p>
      <p className="mt-0.5 truncate text-sm font-medium tabular text-ink-900">{value}</p>
      {note ? <p className="text-2xs text-ink-400">{note}</p> : null}
    </div>
  )
}

/** Adds the estimated volumes, converting where the units share a dimension. */
function totalVolume(rows: RequirementRow[]): { totalQty: number | null; qtyUom: string | null; indicativeOnly: boolean } {
  const quantified = rows.filter((r) => r.requirement.estAnnualQty != null && r.requirement.qtyUom)
  if (quantified.length === 0) return { totalQty: null, qtyUom: null, indicativeOnly: false }
  const unit = quantified[0]!.requirement.qtyUom!
  let total = 0
  for (const r of quantified) {
    try {
      total += convertQty(r.requirement.estAnnualQty!, r.requirement.qtyUom!, unit)
    } catch {
      // Units that cannot be converted are left out rather than guessed at.
    }
  }
  return {
    totalQty: Math.round(total * 100) / 100,
    qtyUom: unit,
    indicativeOnly: quantified.every((r) => r.requirement.qtyIsIndicative),
  }
}
