/**
 * The engagement board (FR-M6-04, UF-07).
 *
 * The engagement is the central record of the system: one row per client and
 * chosen source, moving through the stages. The board shows them as a kanban by
 * stage, and the same set is available as a table for people who would rather
 * sort and export.
 *
 * Dragging a card is a stage change, so it goes through exactly the same rules
 * as the stage control on the detail screen. A move the machine refuses springs
 * back and says why; a move that needs a reason, an override, a reopening or an
 * approval date opens the dialog that collects it.
 */

import * as React from 'react'
import { useNavigate } from 'react-router-dom'
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragStartEvent,
} from '@dnd-kit/core'
import { AnimatePresence, motion } from 'framer-motion'
import { ChevronDown, ChevronRight, GripVertical, KanbanSquare, SlidersHorizontal } from 'lucide-react'
import { toast } from 'sonner'
import { useCanWrite, useCurrentUser, useDb } from '@/data/store'
import {
  approvalContext,
  clients as clientList,
  engagementRows,
  manufacturers as mfrList,
  type EngagementRow,
} from '@/data/selectors'
import { PIPELINE_STAGES, STAGE_LABEL, STAGE_STYLE, stageConfig } from '@/data/reference'
import { changeStage, logExport } from '@/data/api'
import { checkStageChange, stageNeedsRecord } from '@/data/rules'
import { runAction, useAsyncData, useLocalPreference, useUrlFilters, useUrlSearch } from '@/lib/hooks'
import { SectionNav } from '@/layout/sections'
import { cn, fmtDate, pluralise } from '@/lib/utils'
import type { Engagement, EngagementStage } from '@/data/types'
import {
  AgeingFlag,
  Avatar,
  Badge,
  Button,
  Column,
  DataTable,
  EmptyState,
  FilterBar,
  LinkButton,
  NameCell,
  Panel,
  PageHeading,
  SegmentedControl,
  Select,
  SkeletonTable,
  StageBadge,
  Tooltip,
} from '@/components/ui'
import { StageChangeDialog } from './StageDialogs'

/** On hold, rejected and discontinued share one collapsed column. */
const CLOSED_STAGES: EngagementStage[] = ['ON_HOLD', 'REJECTED', 'DISCONTINUED']

const DEFAULTS = {
  q: '',
  view: '',
  stage: '',
  client: '',
  product: '',
  manufacturer: '',
  owner: '',
  ageing: '',
  mine: '',
}

interface Card extends EngagementRow {
  /** the client takes the same molecule from another source too */
  dualSourced: boolean
}

export function EngagementBoard() {
  const db = useDb()
  const navigate = useNavigate()
  const canWrite = useCanWrite()
  const user = useCurrentUser()
  const { values, setValue, setMany, clear, activeCount, queryString } = useUrlFilters(DEFAULTS)
  const [prefView, setPrefView] = useLocalPreference<'board' | 'table'>('engagements.view', 'board')
  const view = values.view === 'table' || values.view === 'board' ? values.view : prefView

  const [search, setSearch] = useUrlSearch(values.q, (v) => setValue('q', v))
  const [dragging, setDragging] = React.useState<string | null>(null)
  const [shaking, setShaking] = React.useState<string | null>(null)
  const [pending, setPending] = React.useState<{ engagement: Engagement; to: EngagementStage; name: string } | null>(
    null,
  )
  const [showClosed, setShowClosed] = React.useState(false)

  const setView = (next: 'board' | 'table') => {
    setPrefView(next)
    setValue('view', next)
  }

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }))

  const { data: cards, loading } = useAsyncData<Card[]>(() => {
    const rows = engagementRows(db, {
      clientId: values.client || undefined,
      productId: values.product || undefined,
      manufacturerId: values.manufacturer || undefined,
      ownerId: values.mine === '1' ? (user?.id ?? undefined) : values.owner || undefined,
      stage: (values.stage as EngagementStage) || undefined,
    })
    const all = engagementRows(db)
    return rows
      .filter((row) => {
        const q = values.q.trim().toLowerCase()
        if (q) {
          const hit =
            row.product.genericName.toLowerCase().includes(q) ||
            row.client.displayName.toLowerCase().includes(q) ||
            row.manufacturer.displayName.toLowerCase().includes(q)
          if (!hit) return false
        }
        if (values.ageing === '1' && !row.isAgeing) return false
        return true
      })
      .map((row) => ({
        ...row,
        dualSourced:
          all.filter((o) => o.client.id === row.client.id && o.product.id === row.product.id).length > 1,
      }))
      .sort((a, b) => b.daysInStage - a.daysInStage)
  }, [values, user?.id])

  const rows = cards ?? []
  const byStage = (stage: EngagementStage) => rows.filter((r) => r.stage === stage)
  const closed = rows.filter((r) => CLOSED_STAGES.includes(r.stage))
  const filtersOn = activeCount > (values.view ? 1 : 0)

  const nameOf = (row: EngagementRow) =>
    `${row.product.genericName} (${row.manufacturer.displayName}) for ${row.client.displayName}`

  const onDragEnd = async (event: DragEndEvent) => {
    setDragging(null)
    const id = String(event.active.id)
    const to = event.over ? (String(event.over.id) as EngagementStage) : null
    const row = rows.find((r) => r.engagement.id === id)
    if (!row || !to || to === row.stage) return

    const check = checkStageChange(row.engagement, to)
    if (!check.ok) {
      setShaking(id)
      window.setTimeout(() => setShaking(null), 500)
      toast.error(check.error ?? 'That move is not allowed.', { duration: 7000 })
      return
    }

    // Offers and samples are records, not just stages: send the user to record them.
    const needsRecord = stageNeedsRecord(row.engagement, to)
    if (needsRecord) {
      setShaking(id)
      window.setTimeout(() => setShaking(null), 500)
      toast(needsRecord, {
        duration: 8000,
        action: { label: 'Open engagement', onClick: () => navigate(`/engagements/${id}?tab=work`) },
      })
      return
    }

    // Anything that needs collecting opens the dialog; a clean move just happens.
    if (check.requiresReason || check.requiresOverride || check.requiresReopen || to === 'APPROVED') {
      setPending({ engagement: row.engagement, to, name: nameOf(row) })
      return
    }
    await runAction(() => changeStage(id, to, {}), {
      success: `${nameOf(row)} moved to ${STAGE_LABEL[to]}.`,
    })
  }

  const columns: Column<Card>[] = [
    {
      key: 'client',
      header: 'Client',
      pinned: true,
      sortable: true,
      value: (r) => r.client.displayName,
      cell: (r) => <NameCell title={r.client.displayName} subtitle={r.product.genericName} />,
    },
    {
      key: 'manufacturer',
      header: 'Source',
      sortable: true,
      value: (r) => r.manufacturer.displayName,
      cell: (r) => (
        <NameCell title={r.manufacturer.displayName} subtitle={`${r.mp.grade} · ${r.mp.pharmacopoeia}`} />
      ),
    },
    {
      key: 'stage',
      header: 'Stage',
      sortable: true,
      width: '9.5rem',
      value: (r) => STAGE_LABEL[r.stage],
      cell: (r) => <StageBadge stage={r.stage} size="sm" />,
    },
    {
      key: 'days',
      header: 'Days in stage',
      align: 'right',
      sortable: true,
      width: '7.5rem',
      value: (r) => r.daysInStage,
      cell: (r) => <AgeingFlag days={r.daysInStage} threshold={stageConfig(r.stage).ageingThresholdDays} />,
    },
    {
      key: 'since',
      header: 'Stage changed',
      optional: true,
      value: (r) => r.engagement.stageChangedAt.slice(0, 10),
      cell: (r) => <span className="text-xs tabular text-ink-500">{fmtDate(r.engagement.stageChangedAt)}</span>,
    },
    {
      key: 'offers',
      header: 'Offers',
      align: 'right',
      optional: true,
      value: (r) => r.offerCount,
      cell: (r) => <span className="text-xs tabular text-ink-600">{r.offerCount || '—'}</span>,
    },
    {
      key: 'samples',
      header: 'Sample rounds',
      align: 'right',
      optional: true,
      value: (r) => r.sampleCount,
      cell: (r) => <span className="text-xs tabular text-ink-600">{r.sampleCount || '—'}</span>,
    },
    {
      key: 'dual',
      header: 'Dual sourced',
      width: '7rem',
      value: (r) => (r.dualSourced ? 'yes' : 'no'),
      cell: (r) =>
        r.dualSourced ? (
          <Tooltip content="This client is considering or taking the same molecule from another source as well.">
            <Badge tone="accent">Dual</Badge>
          </Tooltip>
        ) : (
          <span className="text-xs text-ink-400">—</span>
        ),
    },
    {
      key: 'owner',
      header: 'Owner',
      sortable: true,
      value: (r) => r.ownerName,
      cell: (r) => (
        <span className="flex items-center gap-1.5">
          <Avatar name={r.ownerName} size="xs" />
          <span className="truncate text-xs text-ink-600">{r.ownerName}</span>
        </span>
      ),
    },
  ]

  return (
    <div className="space-y-4">
      <div>
        <PageHeading
          title="Engagements"
          subtitle="Client × supplier deals. Each card is one client considering one manufacturer's product, from first offer to commercial supply. Open a card to see its next step."
          meta={
            <>
              <Badge tone="neutral">{pluralise(rows.length, 'engagement')}</Badge>
              <Badge tone="warn">{pluralise(rows.filter((r) => r.isAgeing).length, 'ageing')}</Badge>
              {!canWrite ? <Badge tone="outline">Read only session</Badge> : null}
            </>
          }
          actions={
            <SegmentedControl
              value={view}
              onChange={setView}
              options={[
                { value: 'board', label: 'Board' },
                { value: 'table', label: 'Table' },
              ]}
            />
          }
        />
        <SectionNav section="engagements" />
      </div>

      <Panel>
        <FilterBar
          search={search}
          onSearch={setSearch}
          searchPlaceholder="Client, molecule or manufacturer…"
          activeCount={filtersOn ? activeCount - (values.view ? 1 : 0) : 0}
          onClear={() =>
            setMany({ q: '', stage: '', client: '', product: '', manufacturer: '', owner: '', ageing: '', mine: '' })
          }
          moreActive={['product', 'manufacturer', 'stage', 'owner'].filter((k) => values[k as keyof typeof values]).length}
          primary={
            <>
              <Select
                value={values.client}
                onChange={(v) => setValue('client', v)}
                allowEmpty
                emptyLabel="Any client"
                placeholder="Any client"
                options={clientList(db).map((c) => ({ value: c.id, label: c.displayName }))}
              />
              <SegmentedControl
                size="sm"
                value={values.mine === '1' ? 'mine' : 'all'}
                onChange={(v) => setValue('mine', v === 'mine' ? '1' : '')}
                options={[
                  { value: 'all', label: 'Everyone' },
                  { value: 'mine', label: 'Mine' },
                ]}
              />
              <Button
                variant={values.ageing === '1' ? 'primary' : 'secondary'}
                size="sm"
                onClick={() => setValue('ageing', values.ageing === '1' ? '' : '1')}
              >
                Ageing only
              </Button>
            </>
          }
          more={
            <>
              <Select
                value={values.product}
                onChange={(v) => setValue('product', v)}
                allowEmpty
                emptyLabel="Any molecule"
                placeholder="Any molecule"
                options={db.products.filter((p) => p.isActive).map((p) => ({ value: p.id, label: p.genericName }))}
              />
              <Select
                value={values.manufacturer}
                onChange={(v) => setValue('manufacturer', v)}
                allowEmpty
                emptyLabel="Any manufacturer"
                placeholder="Any manufacturer"
                options={mfrList(db).map((m) => ({ value: m.id, label: m.displayName }))}
              />
              <Select
                value={values.stage}
                onChange={(v) => setValue('stage', v)}
                allowEmpty
                emptyLabel="Any stage"
                placeholder="Any stage"
                options={(Object.keys(STAGE_LABEL) as EngagementStage[]).map((s) => ({ value: s, label: STAGE_LABEL[s] }))}
              />
              <Select
                value={values.owner}
                onChange={(v) => setValue('owner', v)}
                allowEmpty
                emptyLabel="Any owner"
                placeholder="Any owner"
                disabled={values.mine === '1'}
                options={db.users.filter((u) => u.isActive).map((u) => ({ value: u.id, label: u.fullName }))}
              />
            </>
          }
          trailing={
            <span className="flex items-center gap-1.5 text-xs text-ink-500">
              <SlidersHorizontal className="h-3.5 w-3.5" />
              {loading ? '…' : pluralise(rows.length, 'engagement')}
            </span>
          }
        />
        {canWrite && view === 'board' ? (
          <p className="px-3 py-2 text-2xs text-ink-500">
            Drag a card to approve, pause or close it. Offers and samples are recorded on the engagement itself, which moves
            the card for you.
          </p>
        ) : null}
      </Panel>

      {loading ? (
        <Panel>
          <SkeletonTable rows={6} cols={6} />
        </Panel>
      ) : rows.length === 0 ? (
        <Panel className="p-4">
          <EmptyState
            icon={<KanbanSquare className="h-5 w-5" />}
            title={filtersOn ? 'No engagement matches these filters' : 'No engagement has been opened yet'}
            description={
              filtersOn
                ? 'Try clearing the stage or owner filter.'
                : 'An engagement is opened from a requirement, by choosing which sources the client should consider.'
            }
            action={
              filtersOn ? (
                <Button variant="secondary" size="sm" onClick={clear}>
                  Clear filters
                </Button>
              ) : (
                <LinkButton to="/requirements" variant="primary" size="sm">
                  Open a requirement
                </LinkButton>
              )
            }
            secondary={
              filtersOn ? null : (
                <LinkButton to="/requirements/new" variant="ghost" size="sm">
                  Record a requirement
                </LinkButton>
              )
            }
          />
        </Panel>
      ) : view === 'table' ? (
        <Panel>
          <DataTable
            rows={rows}
            columns={columns}
            rowKey={(r) => r.engagement.id}
            onRowClick={(r) => navigate(`/engagements/${r.engagement.id}`)}
            exportName="engagements"
            exportFilters={queryString}
            onExport={(count) => void logExport('engagement list', queryString, count)}
            pageSize={25}
          />
        </Panel>
      ) : (
        <DndContext
          sensors={sensors}
          onDragStart={(e: DragStartEvent) => setDragging(String(e.active.id))}
          onDragCancel={() => setDragging(null)}
          onDragEnd={(e) => void onDragEnd(e)}
        >
          <div className="scroll-slim flex items-start gap-3 overflow-x-auto pb-2">
            {PIPELINE_STAGES.map((stage) => (
              <StageColumn
                key={stage}
                stage={stage}
                rows={byStage(stage)}
                draggable={canWrite}
                shaking={shaking}
                onOpen={(id) => navigate(`/engagements/${id}`)}
              />
            ))}

            {/* the exits, kept out of the way but never hidden */}
            <div className={cn('shrink-0', showClosed ? 'w-[17rem]' : 'w-[11rem]')}>
              <Panel>
                <button
                  onClick={() => setShowClosed((s) => !s)}
                  className="flex w-full items-center gap-1.5 border-b border-paper-200 px-2.5 py-2 text-left"
                >
                  {showClosed ? (
                    <ChevronDown className="h-3.5 w-3.5 text-ink-400" />
                  ) : (
                    <ChevronRight className="h-3.5 w-3.5 text-ink-400" />
                  )}
                  <span className="flex-1 truncate text-xs font-semibold text-ink-700">Held and closed</span>
                  <Badge tone="neutral">{closed.length}</Badge>
                </button>
                {showClosed ? (
                  <div className="space-y-3 p-2">
                    {CLOSED_STAGES.map((stage) => (
                      <ClosedGroup
                        key={stage}
                        stage={stage}
                        rows={rows.filter((r) => r.stage === stage)}
                        draggable={canWrite}
                        shaking={shaking}
                        onOpen={(id) => navigate(`/engagements/${id}`)}
                      />
                    ))}
                  </div>
                ) : (
                  <ul className="divide-y divide-paper-200">
                    {CLOSED_STAGES.map((stage) => (
                      <li key={stage} className="flex items-center justify-between gap-2 px-2.5 py-2">
                        <StageBadge stage={stage} size="sm" />
                        <span className="text-xs tabular text-ink-600">
                          {rows.filter((r) => r.stage === stage).length}
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
              </Panel>
            </div>
          </div>

          <DragOverlay dropAnimation={{ duration: 180, easing: 'cubic-bezier(0.22, 1, 0.36, 1)' }}>
            {dragging ? <OverlayCard row={rows.find((r) => r.engagement.id === dragging) ?? null} /> : null}
          </DragOverlay>
        </DndContext>
      )}

      <StageChangeDialog
        engagement={pending?.engagement ?? null}
        to={pending?.to ?? null}
        recordName={pending?.name ?? ''}
        onClose={() => setPending(null)}
        requireNoteBecause={
          pending?.to === 'APPROVED' ? approvalContext(db, pending.engagement).requireNoteBecause : null
        }
      />
    </div>
  )
}

function StageColumn({
  stage,
  rows,
  draggable,
  shaking,
  onOpen,
}: {
  stage: EngagementStage
  rows: Card[]
  draggable: boolean
  shaking: string | null
  onOpen: (id: string) => void
}) {
  const { setNodeRef, isOver } = useDroppable({ id: stage })
  const style = STAGE_STYLE[stage]
  return (
    <div className="w-[17rem] shrink-0">
      <Panel className={cn('transition-colors', isOver && 'border-accent-500 bg-accent-50/40')}>
        <div className={cn('h-1 w-full', style.bar)} />
        <div className="flex items-center justify-between gap-2 border-b border-paper-200 px-2.5 py-2">
          <span className="truncate text-xs font-semibold text-ink-800">{STAGE_LABEL[stage]}</span>
          <span className="flex items-center gap-1.5">
            <Tooltip content={`Ageing threshold ${stageConfig(stage).ageingThresholdDays} days`}>
              <span className="text-2xs tabular text-ink-400">{stageConfig(stage).ageingThresholdDays}d</span>
            </Tooltip>
            <Badge tone="neutral">{rows.length}</Badge>
          </span>
        </div>
        <div ref={setNodeRef} className="scroll-slim max-h-[60vh] min-h-[6rem] space-y-2 overflow-y-auto p-2">
          <AnimatePresence initial={false}>
            {rows.map((row) => (
              <BoardCard
                key={row.engagement.id}
                row={row}
                draggable={draggable}
                shaking={shaking === row.engagement.id}
                onOpen={onOpen}
              />
            ))}
          </AnimatePresence>
          {rows.length === 0 ? (
            <p className="px-1 py-6 text-center text-2xs leading-relaxed text-ink-400">
              Nothing at {STAGE_LABEL[stage].toLowerCase()}
            </p>
          ) : null}
        </div>
      </Panel>
    </div>
  )
}

function ClosedGroup({
  stage,
  rows,
  draggable,
  shaking,
  onOpen,
}: {
  stage: EngagementStage
  rows: Card[]
  draggable: boolean
  shaking: string | null
  onOpen: (id: string) => void
}) {
  const { setNodeRef, isOver } = useDroppable({ id: stage })
  return (
    <div
      ref={setNodeRef}
      className={cn(
        'space-y-2 rounded border border-dashed border-paper-300 p-1.5 transition-colors',
        isOver && 'border-accent-500 bg-accent-50/40',
      )}
    >
      <div className="flex items-center justify-between gap-2 px-0.5">
        <StageBadge stage={stage} size="sm" />
        <span className="text-2xs tabular text-ink-500">{rows.length}</span>
      </div>
      {rows.map((row) => (
        <BoardCard
          key={row.engagement.id}
          row={row}
          draggable={draggable}
          shaking={shaking === row.engagement.id}
          onOpen={onOpen}
        />
      ))}
    </div>
  )
}

function BoardCard({
  row,
  draggable,
  shaking,
  onOpen,
}: {
  row: Card
  draggable: boolean
  shaking: boolean
  onOpen: (id: string) => void
}) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: row.engagement.id,
    disabled: !draggable,
  })

  return (
    <motion.div
      ref={setNodeRef}
      layout
      initial={{ opacity: 0, y: 4 }}
      animate={{ opacity: isDragging ? 0.35 : 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.97 }}
      transition={{ duration: 0.18, ease: [0.22, 1, 0.36, 1] }}
      className={cn(
        'rounded-md border border-paper-300 bg-white p-2 shadow-tile',
        shaking && 'animate-shake-x border-danger-300',
      )}
    >
      <div className="flex items-start gap-1.5">
        {draggable ? (
          <button
            {...attributes}
            {...listeners}
            aria-label={`Move ${row.product.genericName} for ${row.client.displayName}`}
            className="mt-0.5 shrink-0 cursor-grab rounded p-0.5 text-ink-300 transition-colors hover:bg-paper-200 hover:text-ink-600 active:cursor-grabbing"
          >
            <GripVertical className="h-3.5 w-3.5" />
          </button>
        ) : null}
        <button onClick={() => onOpen(row.engagement.id)} className="min-w-0 flex-1 text-left">
          <span className="block truncate text-sm font-semibold text-ink-900">{row.client.displayName}</span>
          <span className="block truncate text-xs text-ink-700">{row.product.genericName}</span>
          <span className="block truncate text-2xs text-ink-500">{row.manufacturer.displayName}</span>
        </button>
      </div>
      <div className="mt-2 flex items-center gap-1.5">
        <AgeingFlag days={row.daysInStage} threshold={stageConfig(row.stage).ageingThresholdDays} />
        {row.dualSourced ? (
          <Tooltip content={`${row.client.displayName} is considering ${row.product.genericName} from more than one source.`}>
            <Badge tone="accent">Dual</Badge>
          </Tooltip>
        ) : null}
        {row.engagement.isOverrideCreated ? <Badge tone="warn">Override</Badge> : null}
        <span className="ml-auto">
          <Avatar name={row.ownerName} size="xs" />
        </span>
      </div>
    </motion.div>
  )
}

/** What follows the pointer while dragging. */
function OverlayCard({ row }: { row: Card | null }) {
  if (!row) return null
  return (
    <div className="w-[15.5rem] rotate-1 rounded-md border border-accent-400 bg-white p-2 shadow-raised">
      <span className="block truncate text-sm font-semibold text-ink-900">{row.client.displayName}</span>
      <span className="block truncate text-xs text-ink-700">{row.product.genericName}</span>
      <span className="block truncate text-2xs text-ink-500">{row.manufacturer.displayName}</span>
    </div>
  )
}
