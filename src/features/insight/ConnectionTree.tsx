/**
 * The client / product / manufacturer connection tree (UC-14, FR-M9-10).
 *
 * The signature view of the product: the triangle read from any corner. With a
 * product as the root, manufacturers branch to the left and clients to the
 * right, which is the clearest picture of a molecule's supply and demand. Edges
 * are engagements, coloured by stage.
 *
 * Read-only throughout. The export is open to both roles and is logged.
 */

import * as React from 'react'
import { useNavigate } from 'react-router-dom'
import {
  Background,
  BackgroundVariant,
  Controls,
  Handle,
  MarkerType,
  Position,
  ReactFlow,
  type Edge,
  type Node,
  type NodeProps,
  type NodeTypes,
} from '@xyflow/react'
import '@xyflow/react/dist/style.css'
import { Building2, FlaskConical, Network, Share2, Users } from 'lucide-react'
import { useDb } from '@/data/store'
import {
  clients as clientList,
  engagementRows,
  furthestStage,
  manufacturers as mfrList,
  sourceRows,
  type EngagementRow,
} from '@/data/selectors'
import { PIPELINE_STAGES, STAGE_LABEL } from '@/data/reference'
import { logExport } from '@/data/api'
import { useAsyncData, useUrlFilters } from '@/lib/hooks'
import { downloadCsv, pluralise } from '@/lib/utils'
import type { Database, EngagementStage, ID } from '@/data/types'
import {
  Badge,
  Button,
  Combobox,
  EmptyState,
  LinkButton,
  Panel,
  PanelHeader,
  PageHeading,
  SegmentedControl,
  Select,
  SkeletonText,
  StageBadge,
  Tooltip,
} from '@/components/ui'
import { ExportButton, ReportNote, StageLegend, stageHex } from './shared'

type RootKind = 'product' | 'client' | 'manufacturer'
type NodeKind = 'PRODUCT' | 'CLIENT' | 'MANUFACTURER'

/** Nodes nearer the left are supply, nearer the right are demand. */
const COLUMN_X: Record<number, number> = { [-2]: -620, [-1]: -310, 0: 0, 1: 310, 2: 620 }
const ROW_GAP = 76
const NODE_WIDTH = 196

/**
 * AC-14 sets the render threshold at 200. Two hundred panels on one side cannot
 * be read, so the tree shows 24 per side and keeps the rest behind a control.
 */
const PER_SIDE = 24
const PER_SIDE_MAX = 200
/** Depth 2 keeps the render budget by showing a few onward links per node. */
const PER_NODE_DEPTH_2 = 4

// ----------------------------------------------------------------- the graph

type LeafData = {
  nodeKind: NodeKind
  label: string
  sublabel: string
  count: number
  stage: EngagementStage | null
  recordId: ID
}

type RootData = {
  nodeKind: NodeKind
  label: string
  sublabel: string
  kindLabel: string
}

type TreeNode = Node<LeafData, 'leaf'> | Node<RootData, 'root'>

interface EdgeFact {
  id: string
  fromLabel: string
  fromKind: NodeKind
  toLabel: string
  toKind: NodeKind
  stage: EngagementStage | null
  engagementIds: ID[]
}

interface Graph {
  nodes: TreeNode[]
  edges: Edge[]
  facts: EdgeFact[]
  rootLabel: string
  totalLeft: number
  totalRight: number
  hiddenLeft: number
  hiddenRight: number
  isEmpty: boolean
}

/** A neighbour of the root, with the engagements that justify the link. */
interface Group {
  id: ID
  label: string
  sublabel: string
  kind: NodeKind
  engagements: EngagementRow[]
}

function groupBy(rows: EngagementRow[], pick: (r: EngagementRow) => Group): Group[] {
  const map = new Map<ID, Group>()
  for (const row of rows) {
    const g = pick(row)
    const existing = map.get(g.id)
    if (existing) existing.engagements.push(row)
    else map.set(g.id, { ...g, engagements: [row] })
  }
  return [...map.values()].sort(
    (a, b) => b.engagements.length - a.engagements.length || a.label.localeCompare(b.label),
  )
}

const asClient = (r: EngagementRow): Group => ({
  id: r.client.id,
  label: r.client.displayName,
  sublabel: r.client.countryCode,
  kind: 'CLIENT',
  engagements: [],
})

const asManufacturer = (r: EngagementRow): Group => ({
  id: r.manufacturer.id,
  label: r.manufacturer.displayName,
  sublabel: r.manufacturer.countryCode,
  kind: 'MANUFACTURER',
  engagements: [],
})

const asProduct = (r: EngagementRow): Group => ({
  id: r.product.id,
  label: r.product.genericName,
  sublabel: r.product.category,
  kind: 'PRODUCT',
  engagements: [],
})

function buildGraph(
  db: Database,
  rootKind: RootKind,
  rootId: ID,
  depth: number,
  stage: EngagementStage | '',
  perSide: number,
): Graph {
  const all = engagementRows(db)
  const filtered = stage ? all.filter((e) => e.stage === stage) : all

  const nodes: TreeNode[] = []
  const edges: Edge[] = []
  const facts: EdgeFact[] = []

  // one running row counter per column, so each column stacks from its own top
  const used = new Map<number, number>()
  const place = (column: number, total: number): { x: number; y: number } => {
    const index = used.get(column) ?? 0
    used.set(column, index + 1)
    return { x: COLUMN_X[column] ?? 0, y: (index - (total - 1) / 2) * ROW_GAP }
  }

  const addLeaf = (group: Group, column: number, total: number): string => {
    const id = `${group.kind}:${group.id}:${column}`
    if (!nodes.some((n) => n.id === id)) {
      nodes.push({
        id,
        type: 'leaf',
        position: place(column, total),
        data: {
          nodeKind: group.kind,
          label: group.label,
          sublabel: group.sublabel,
          count: group.engagements.length,
          stage: furthestStage(group.engagements.map((e) => e.stage)),
          recordId: group.id,
        },
        width: NODE_WIDTH,
      })
    }
    return id
  }

  const addEdge = (
    source: string,
    target: string,
    sourceLabel: string,
    sourceKind: NodeKind,
    targetLabel: string,
    targetKind: NodeKind,
    engagements: EngagementRow[],
  ) => {
    const id = `${source}->${target}`
    if (edges.some((e) => e.id === id)) return
    const edgeStage = furthestStage(engagements.map((e) => e.stage))
    const colour = edgeStage ? stageHex(edgeStage) : '#c4bdb2'
    edges.push({
      id,
      source,
      target,
      type: 'default',
      animated: false,
      style: { stroke: colour, strokeWidth: engagements.length > 1 ? 2.4 : 1.6 },
      markerEnd: { type: MarkerType.ArrowClosed, color: colour, width: 14, height: 14 },
      data: { engagementIds: engagements.map((e) => e.engagement.id) },
    })
    facts.push({
      id,
      fromLabel: sourceLabel,
      fromKind: sourceKind,
      toLabel: targetLabel,
      toKind: targetKind,
      stage: edgeStage,
      engagementIds: engagements.map((e) => e.engagement.id),
    })
  }

  // ---------------------------------------------------------------- the root
  let rootLabel = ''
  let rootSub = ''
  let rootNodeKind: NodeKind = 'PRODUCT'
  let left: Group[] = []
  let right: Group[] = []

  if (rootKind === 'product') {
    const product = db.products.find((p) => p.id === rootId)
    if (!product) return emptyGraph()
    rootLabel = product.genericName
    rootSub = product.casNumber ? `CAS ${product.casNumber}` : product.category
    rootNodeKind = 'PRODUCT'

    const here = filtered.filter((e) => e.product.id === rootId)
    left = groupBy(here, asManufacturer)
    // manufacturers TCL knows for this molecule but has no engagement on yet
    if (!stage) {
      for (const s of sourceRows(db, { productId: rootId })) {
        if (left.some((g) => g.id === s.manufacturer.id)) continue
        left.push({
          id: s.manufacturer.id,
          label: s.manufacturer.displayName,
          sublabel: s.manufacturer.countryCode,
          kind: 'MANUFACTURER',
          engagements: [],
        })
      }
    }
    right = groupBy(here, asClient)
  } else if (rootKind === 'client') {
    const client = db.companies.find((c) => c.id === rootId)
    if (!client) return emptyGraph()
    rootLabel = client.displayName
    rootSub = client.countryCode
    rootNodeKind = 'CLIENT'
    // the client is demand, so its molecules sit to its left and the
    // manufacturers behind them further left still
    left = groupBy(
      filtered.filter((e) => e.client.id === rootId),
      asProduct,
    )
  } else {
    const mfr = db.companies.find((c) => c.id === rootId)
    if (!mfr) return emptyGraph()
    rootLabel = mfr.displayName
    rootSub = mfr.countryCode
    rootNodeKind = 'MANUFACTURER'
    // the manufacturer is supply, so its molecules sit to its right and the
    // clients taking them further right
    right = groupBy(
      filtered.filter((e) => e.manufacturer.id === rootId),
      asProduct,
    )
    if (!stage) {
      for (const s of sourceRows(db, { manufacturerId: rootId })) {
        if (right.some((g) => g.id === s.product.id)) continue
        right.push({
          id: s.product.id,
          label: s.product.genericName,
          sublabel: s.product.category,
          kind: 'PRODUCT',
          engagements: [],
        })
      }
    }
  }

  const shownLeft = left.slice(0, perSide)
  const shownRight = right.slice(0, perSide)

  const rootNodeId = `ROOT:${rootId}`
  nodes.push({
    id: rootNodeId,
    type: 'root',
    position: { x: COLUMN_X[0] ?? 0, y: 0 },
    data: {
      nodeKind: rootNodeKind,
      label: rootLabel,
      sublabel: rootSub,
      kindLabel: rootKind === 'product' ? 'Molecule' : rootKind === 'client' ? 'Client' : 'Manufacturer',
    },
    width: 236,
  })

  for (const group of shownLeft) {
    const id = addLeaf(group, -1, shownLeft.length)
    addEdge(id, rootNodeId, group.label, group.kind, rootLabel, rootNodeKind, group.engagements)
  }
  for (const group of shownRight) {
    const id = addLeaf(group, 1, shownRight.length)
    addEdge(rootNodeId, id, rootLabel, rootNodeKind, group.label, group.kind, group.engagements)
  }

  // ------------------------------------------------------------- second level
  if (depth >= 2) {
    const onwardLeft: { parent: Group; child: Group }[] = []
    const onwardRight: { parent: Group; child: Group }[] = []

    for (const parent of shownLeft) {
      const children =
        rootKind === 'product'
          ? groupBy(
              filtered.filter((e) => e.manufacturer.id === parent.id && e.product.id !== rootId),
              asProduct,
            )
          : groupBy(parent.engagements, asManufacturer)
      for (const child of children.slice(0, PER_NODE_DEPTH_2)) onwardLeft.push({ parent, child })
    }
    for (const parent of shownRight) {
      const children =
        rootKind === 'product'
          ? groupBy(
              filtered.filter((e) => e.client.id === parent.id && e.product.id !== rootId),
              asProduct,
            )
          : groupBy(parent.engagements, asClient)
      for (const child of children.slice(0, PER_NODE_DEPTH_2)) onwardRight.push({ parent, child })
    }

    for (const { parent, child } of onwardLeft) {
      const childId = addLeaf(child, -2, onwardLeft.length)
      addEdge(
        childId,
        `${parent.kind}:${parent.id}:-1`,
        child.label,
        child.kind,
        parent.label,
        parent.kind,
        child.engagements,
      )
    }
    for (const { parent, child } of onwardRight) {
      const childId = addLeaf(child, 2, onwardRight.length)
      addEdge(
        `${parent.kind}:${parent.id}:1`,
        childId,
        parent.label,
        parent.kind,
        child.label,
        child.kind,
        child.engagements,
      )
    }
  }

  return {
    nodes,
    edges,
    facts,
    rootLabel,
    totalLeft: left.length,
    totalRight: right.length,
    hiddenLeft: Math.max(0, left.length - shownLeft.length),
    hiddenRight: Math.max(0, right.length - shownRight.length),
    isEmpty: left.length === 0 && right.length === 0,
  }
}

const emptyGraph = (): Graph => ({
  nodes: [],
  edges: [],
  facts: [],
  rootLabel: '',
  totalLeft: 0,
  totalRight: 0,
  hiddenLeft: 0,
  hiddenRight: 0,
  isEmpty: true,
})

// ------------------------------------------------------------ node rendering

const HANDLE_STYLE: React.CSSProperties = { opacity: 0, width: 1, height: 1, border: 'none' }

const KIND_ICON: Record<NodeKind, React.ReactNode> = {
  PRODUCT: <FlaskConical className="h-3.5 w-3.5" />,
  CLIENT: <Users className="h-3.5 w-3.5" />,
  MANUFACTURER: <Building2 className="h-3.5 w-3.5" />,
}

/** The root: larger, dark, and the only node that is not clickable. */
function RootNode({ data }: NodeProps<Node<RootData, 'root'>>) {
  return (
    <div className="w-[236px] rounded-lg border border-ink-800 bg-ink-900 px-3.5 py-3 shadow-raised">
      <Handle type="target" position={Position.Left} style={HANDLE_STYLE} isConnectable={false} />
      <Handle type="source" position={Position.Right} style={HANDLE_STYLE} isConnectable={false} />
      <p className="flex items-center gap-1.5 text-2xs font-semibold uppercase tracking-wider text-accent-300">
        {KIND_ICON[data.nodeKind]}
        {data.kindLabel}
      </p>
      <p className="mt-1 truncate text-sm font-semibold text-white">{data.label}</p>
      <p className="truncate text-2xs text-paper-400">{data.sublabel}</p>
    </div>
  )
}

/** A leaf: a white panel with a hairline border. Clicking it re-roots the tree. */
function LeafNode({ data }: NodeProps<Node<LeafData, 'leaf'>>) {
  return (
    <div className="w-[196px] cursor-pointer rounded-md border border-paper-300 bg-white px-2.5 py-2 shadow-tile transition-shadow hover:border-accent-400 hover:shadow-raised">
      <Handle type="target" position={Position.Left} style={HANDLE_STYLE} isConnectable={false} />
      <Handle type="source" position={Position.Right} style={HANDLE_STYLE} isConnectable={false} />
      <div className="flex items-center gap-1.5">
        <span className="shrink-0 text-ink-400">{KIND_ICON[data.nodeKind]}</span>
        <span className="min-w-0 flex-1 truncate text-xs font-semibold text-ink-900">{data.label}</span>
        <span className="shrink-0 rounded bg-paper-200 px-1 text-[10px] font-semibold tabular text-ink-600">
          {data.count}
        </span>
      </div>
      <div className="mt-1 flex items-center gap-1.5">
        {data.stage ? (
          <StageBadge stage={data.stage} size="sm" />
        ) : (
          <span className="text-[10px] text-ink-400">No engagement yet</span>
        )}
        <span className="ml-auto truncate text-[10px] text-ink-400">{data.sublabel}</span>
      </div>
    </div>
  )
}

const NODE_TYPES: NodeTypes = { root: RootNode, leaf: LeafNode } as NodeTypes

// ------------------------------------------------------------------- screen

const DEFAULTS = { root: 'product', id: '', depth: '1', stage: '', all: '' }

export function ConnectionTree() {
  const db = useDb()
  const navigate = useNavigate()
  const { values, setValue, setMany, queryString } = useUrlFilters(DEFAULTS)
  const [hoveredEdge, setHoveredEdge] = React.useState<string | null>(null)

  const rootKind = (values.root === 'client' || values.root === 'manufacturer' ? values.root : 'product') as RootKind
  const depth = values.depth === '2' ? 2 : 1
  const stage = (values.stage || '') as EngagementStage | ''
  const perSide = values.all === '1' ? PER_SIDE_MAX : PER_SIDE

  /** Records to choose from, and a sensible default when the URL names none. */
  const options = React.useMemo(() => {
    if (rootKind === 'client') {
      return clientList(db).map((c) => ({ value: c.id, label: c.displayName, description: c.countryCode }))
    }
    if (rootKind === 'manufacturer') {
      return mfrList(db).map((m) => ({ value: m.id, label: m.displayName, description: m.countryCode }))
    }
    return db.products
      .filter((p) => p.isActive)
      .map((p) => ({ value: p.id, label: p.genericName, description: p.casNumber ?? p.category }))
  }, [db, rootKind])

  const busiestId = React.useMemo(() => {
    const counts = new Map<ID, number>()
    for (const e of db.engagements) {
      const key =
        rootKind === 'client' ? e.clientCompanyId : rootKind === 'manufacturer' ? e.manufacturerCompanyId : e.productId
      counts.set(key, (counts.get(key) ?? 0) + 1)
    }
    return [...counts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? options[0]?.value ?? ''
  }, [db, rootKind, options])

  const rootId = values.id && options.some((o) => o.value === values.id) ? values.id : busiestId

  const { data: graph, loading } = useAsyncData<Graph>(
    () => buildGraph(db, rootKind, rootId, depth, stage, perSide),
    [rootKind, rootId, depth, stage, perSide],
  )

  const edges = React.useMemo(() => {
    if (!graph) return []
    return graph.edges.map((e) => {
      const fact = graph.facts.find((f) => f.id === e.id)
      if (e.id !== hoveredEdge || !fact) return e
      return {
        ...e,
        label: fact.stage
          ? `${STAGE_LABEL[fact.stage]}${fact.engagementIds.length > 1 ? ` · ${fact.engagementIds.length} engagements` : ''}`
          : 'Known source, no engagement',
        labelShowBg: true,
        labelBgPadding: [6, 3] as [number, number],
        labelBgBorderRadius: 4,
        labelStyle: { fontSize: 11, fill: '#0f222d', fontWeight: 600 },
        labelBgStyle: { fill: '#ffffff', stroke: '#e6e1d8' },
      }
    })
  }, [graph, hoveredEdge])

  const reroot = (node: TreeNode) => {
    if (node.type !== 'leaf') return
    const data = node.data as LeafData
    const kind: RootKind =
      data.nodeKind === 'PRODUCT' ? 'product' : data.nodeKind === 'CLIENT' ? 'client' : 'manufacturer'
    setMany({ root: kind, id: data.recordId, all: '' })
  }

  const openEdge = (edgeId: string) => {
    const fact = graph?.facts.find((f) => f.id === edgeId)
    if (!fact) return
    if (fact.engagementIds.length === 1) navigate(`/engagements/${fact.engagementIds[0]}`)
    else if (fact.engagementIds.length > 1) navigate(`/engagements?q=${encodeURIComponent(fact.toLabel)}`)
  }

  const exportEdges = () => {
    if (!graph) return
    downloadCsv(
      `connection-tree-${graph.rootLabel.toLowerCase().replace(/\s+/g, '-') || 'tree'}`,
      ['From', 'From type', 'To', 'To type', 'Stage', 'Engagements'],
      graph.facts.map((f) => [
        f.fromLabel,
        f.fromKind,
        f.toLabel,
        f.toKind,
        f.stage ? STAGE_LABEL[f.stage] : 'None',
        f.engagementIds.length,
      ]),
    )
    void logExport('connection tree edge list', queryString, graph.facts.length)
  }

  const hidden = (graph?.hiddenLeft ?? 0) + (graph?.hiddenRight ?? 0)

  return (
    <div className="space-y-4">
      <PageHeading
        title="Connection tree"
        subtitle="The client, product and manufacturer triangle, read from whichever corner you start at."
        meta={
          <>
            <Badge tone="neutral">{pluralise(graph?.facts.length ?? 0, 'link')}</Badge>
            <Badge tone="accent">Depth {depth}</Badge>
            {stage ? <Badge tone="info">{STAGE_LABEL[stage]} only</Badge> : null}
          </>
        }
        actions={<ExportButton onClick={exportEdges} label="Export edge list to CSV" disabled={!graph} />}
      />

      <Panel>
        <div className="grid gap-2.5 border-b border-paper-200 p-3 sm:grid-cols-2 lg:grid-cols-4">
          <div className="space-y-1.5">
            <p className="text-2xs font-medium uppercase tracking-wide text-ink-500">Root</p>
            <SegmentedControl
              value={rootKind}
              onChange={(v) => setMany({ root: v, id: '', all: '' })}
              size="sm"
              options={[
                { value: 'product', label: 'Product' },
                { value: 'client', label: 'Client' },
                { value: 'manufacturer', label: 'Manufacturer' },
              ]}
            />
          </div>
          <div className="space-y-1.5">
            <p className="text-2xs font-medium uppercase tracking-wide text-ink-500">Record</p>
            <Combobox
              value={rootId}
              onChange={(v) => setMany({ id: v, all: '' })}
              options={options}
              placeholder="Choose a record"
            />
          </div>
          <div className="space-y-1.5">
            <p className="text-2xs font-medium uppercase tracking-wide text-ink-500">Depth</p>
            <SegmentedControl
              value={depth === 2 ? '2' : '1'}
              onChange={(v) => setValue('depth', v)}
              size="sm"
              options={[
                { value: '1', label: '1 level' },
                { value: '2', label: '2 levels' },
              ]}
            />
          </div>
          <div className="space-y-1.5">
            <p className="text-2xs font-medium uppercase tracking-wide text-ink-500">Stage</p>
            <Select
              value={stage}
              onChange={(v) => setValue('stage', v)}
              allowEmpty
              emptyLabel="Every stage"
              placeholder="Every stage"
              options={(Object.keys(STAGE_LABEL) as EngagementStage[]).map((s) => ({ value: s, label: STAGE_LABEL[s] }))}
            />
          </div>
        </div>

        {loading || !graph ? (
          <div className="p-4">
            <SkeletonText lines={6} />
          </div>
        ) : graph.isEmpty ? (
          <div className="p-4">
            <EmptyState
              icon={<Network className="h-5 w-5" />}
              title={`${graph.rootLabel || 'This record'} has no relationships yet`}
              description="Nothing is linked to this record, so there is no tree to draw. A requirement from a client, or a source from a manufacturer, is what puts it on the map."
              action={
                <LinkButton to="/requirements/new" variant="primary" size="sm">
                  Record a client requirement
                </LinkButton>
              }
              secondary={
                <Button variant="ghost" size="sm" onClick={() => setMany({ id: busiestId, all: '' })}>
                  Open the busiest record instead
                </Button>
              }
            />
          </div>
        ) : (
          <>
            <div className="dotgrid h-[32rem] border-b border-paper-200 bg-paper-50">
              <ReactFlow
                key={`${rootKind}:${rootId}:${depth}:${stage}:${perSide}`}
                nodes={graph.nodes}
                edges={edges}
                nodeTypes={NODE_TYPES}
                onNodeClick={(_, node) => reroot(node as TreeNode)}
                onEdgeClick={(_, edge) => openEdge(edge.id)}
                onEdgeMouseEnter={(_, edge) => setHoveredEdge(edge.id)}
                onEdgeMouseLeave={() => setHoveredEdge(null)}
                nodesDraggable={false}
                nodesConnectable={false}
                zoomOnScroll={false}
                zoomOnDoubleClick={false}
                panOnScroll={false}
                preventScrolling={false}
                fitView
                fitViewOptions={{ padding: 0.18 }}
                minZoom={0.3}
                maxZoom={1.5}
                proOptions={{ hideAttribution: false }}
              >
                <Background variant={BackgroundVariant.Dots} gap={18} size={1} color="#ddd7cc" />
                <Controls showInteractive={false} position="bottom-right" />
              </ReactFlow>
            </div>

            <div className="flex flex-wrap items-center justify-between gap-3 p-3">
              <div className="space-y-1.5">
                <p className="text-2xs font-medium uppercase tracking-wide text-ink-500">Edge colour is the stage</p>
                <StageLegend stages={PIPELINE_STAGES} />
              </div>
              <div className="max-w-md space-y-1.5">
                <ReportNote>
                  Click a leaf to re-root the tree on it. Click an edge to open the engagement. Hover an edge to read
                  its stage. A grey edge is a source TCL knows about with no engagement on it yet.
                </ReportNote>
                {hidden > 0 ? (
                  <div className="flex items-center gap-2">
                    <Tooltip content={`The render threshold is ${PER_SIDE_MAX}. This tree shows ${PER_SIDE} a side so the panels stay legible.`}>
                      <span>
                        <Badge tone="warn">{hidden} more hidden</Badge>
                      </span>
                    </Tooltip>
                    <Button variant="secondary" size="sm" onClick={() => setValue('all', '1')}>
                      Show all ({graph.totalLeft + graph.totalRight})
                    </Button>
                  </div>
                ) : values.all === '1' ? (
                  <Button variant="ghost" size="sm" onClick={() => setValue('all', '')}>
                    Back to {PER_SIDE} a side
                  </Button>
                ) : null}
              </div>
            </div>
          </>
        )}
      </Panel>

      <div className="grid gap-4 lg:grid-cols-2">
        <Panel>
          <PanelHeader
            title="How to read it"
            subtitle="Supply on the left, demand on the right"
            icon={<Share2 className="h-4 w-4" />}
          />
          <ul className="space-y-2 p-4 text-xs leading-relaxed text-ink-600">
            <li>
              <span className="font-semibold text-ink-900">Product as root.</span> Manufacturers branch left, clients
              branch right. The quickest read of a molecule's supply and demand.
            </li>
            <li>
              <span className="font-semibold text-ink-900">Client as root.</span> The molecules the client takes sit to
              its left, and at depth 2 the manufacturers behind them sit further left again.
            </li>
            <li>
              <span className="font-semibold text-ink-900">Manufacturer as root.</span> Its molecules sit to its right,
              and at depth 2 the clients taking them sit further right.
            </li>
            <li>Depth 2 shows up to {PER_NODE_DEPTH_2} onward links per node, which keeps the picture readable.</li>
          </ul>
        </Panel>
        <Panel>
          <PanelHeader
            title="The same question as a matrix"
            subtitle="When you want to compare rows rather than follow a path"
            icon={<Network className="h-4 w-4" />}
          />
          <div className="flex flex-wrap gap-2 p-4">
            <LinkButton to="/relationships/client-product" variant="secondary" size="sm">
              Client against product
            </LinkButton>
            <LinkButton to="/relationships/manufacturer-product" variant="secondary" size="sm">
              Manufacturer against product
            </LinkButton>
          </div>
        </Panel>
      </div>
    </div>
  )
}
