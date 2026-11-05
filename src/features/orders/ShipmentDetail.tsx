/**
 * One shipment: where the consignment has reached, which batches it carries,
 * and what has been delivered from it (UC-10, AC-10, UF-03).
 *
 * The track across the top is the shipment's life. Held at customs is shown as
 * a branch off the track rather than a step, because a held consignment has
 * not moved forward: it is stuck at arrival until the hold is resolved.
 *
 * A batch is recorded once per source. Adding a batch number that already
 * exists reuses the record and says so; it never creates a second one.
 */

import * as React from 'react'
import { Link, useParams } from 'react-router-dom'
import { motion } from 'framer-motion'
import { differenceInMonths, parseISO } from 'date-fns'
import {
  Check,
  FileText,
  Package,
  PackageCheck,
  Plus,
  ShieldAlert,
  Ship,
  Truck,
} from 'lucide-react'
import { useDb, usePresenter, useSettings } from '@/data/store'
import { siteName } from '@/data/selectors'
import {
  CNF_AGENTS,
  SHIPMENT_FLOW,
  SHIPMENT_MODE_LABEL,
  SHIPMENT_STATUS_LABEL,
} from '@/data/reference'
import { checkBatchDates, checkOverShipment, checkShelfLife, type QtyGuard } from '@/data/rules'
import { addShipmentLine, recordDelivery, updateShipment } from '@/data/api'
import { runAction, useAsyncData } from '@/lib/hooks'
import { fmtDate, fmtQty, pluralise, todayIso } from '@/lib/utils'
import type { Shipment, ShipmentStatus } from '@/data/types'
import {
  Badge,
  DateInput,
  Dialog,
  DialogFooterActions,
  EmptyState,
  Field,
  FieldGrid,
  FormGrid,
  FormRow,
  InlineError,
  InlineWarning,
  Input,
  NumberInput,
  Panel,
  PanelHeader,
  PageHeading,
  RuleHint,
  Select,
  SkeletonTable,
  Textarea,
  Tooltip,
  WriteButton,
} from '@/components/ui'
import { NotFound } from '@/features/misc/Fallbacks'
import {
  ActivityPanel,
  DocumentsPanel,
  IndentingNote,
  ShipmentStatusBadge,
  StatCell,
  sumQty,
} from './shared'

type ActionKind = 'depart' | 'arrive' | 'clear' | 'hold'

export function ShipmentDetail() {
  const { id = '' } = useParams()
  const db = useDb()
  const presenter = usePresenter()
  const [action, setAction] = React.useState<ActionKind | null>(null)
  const [batchOpen, setBatchOpen] = React.useState(false)
  const [deliveryOpen, setDeliveryOpen] = React.useState(false)

  const shipment = db.shipments.find((s) => s.id === id)

  const { data, loading } = useAsyncData(
    () => {
      const lines = db.shipmentLines.filter((l) => l.shipmentId === id)
      return {
        lines,
        deliveries: db.deliveries.filter((d) => lines.some((l) => l.id === d.shipmentLineId)),
      }
    },
    [id],
  )

  if (!shipment) return <NotFound />

  const indent = db.indents.find((i) => i.id === shipment.indentId)
  const manufacturer = indent ? db.companies.find((c) => c.id === indent.manufacturerCompanyId) : undefined
  const client = indent ? db.companies.find((c) => c.id === indent.clientCompanyId) : undefined
  const lines = data?.lines ?? []
  const deliveries = data?.deliveries ?? []
  const shipped = sumQty(lines.map((l) => ({ qty: l.qty, uom: l.qtyUom })))
  const deliveredTotal = sumQty(deliveries.map((d) => ({ qty: d.deliveredQty, uom: d.qtyUom })))

  return (
    <div className="space-y-4">
      <PageHeading
        title={<span className="font-mono tabular">{shipment.shipmentRef}</span>}
        subtitle={
          <>
            Against{' '}
            {indent ? (
              <Link to={`/indents/${indent.id}`} className="font-mono font-medium text-ink-700 hover:text-accent-700">
                {indent.indentNumber}
              </Link>
            ) : (
              'an indent that no longer exists'
            )}
            {manufacturer ? `, despatched by ${manufacturer.displayName}` : ''}
            {client ? ` for ${client.displayName}` : ''}.
          </>
        }
        meta={
          <>
            <ShipmentStatusBadge status={shipment.status} />
            <Badge tone="outline">{SHIPMENT_MODE_LABEL[shipment.mode]}</Badge>
            {shipment.blAwbNumber ? (
              <Badge tone="neutral">
                <span className="font-mono">{shipment.blAwbNumber}</span>
              </Badge>
            ) : null}
          </>
        }
        actions={
          <>
            {shipment.status === 'PLANNED' ? (
              <WriteButton variant="primary" size="md" icon={<Ship className="h-3.5 w-3.5" />} onClick={() => setAction('depart')}>
                Record departure
              </WriteButton>
            ) : null}
            {shipment.status === 'IN_TRANSIT' ? (
              <WriteButton variant="primary" size="md" icon={<PackageCheck className="h-3.5 w-3.5" />} onClick={() => setAction('arrive')}>
                Record arrival
              </WriteButton>
            ) : null}
            {shipment.status === 'ARRIVED' || shipment.status === 'HELD_AT_CUSTOMS' ? (
              <WriteButton variant="primary" size="md" icon={<Check className="h-3.5 w-3.5" />} onClick={() => setAction('clear')}>
                Record clearance
              </WriteButton>
            ) : null}
            {shipment.status !== 'HELD_AT_CUSTOMS' && shipment.status !== 'DELIVERED' ? (
              <WriteButton variant="secondary" size="md" icon={<ShieldAlert className="h-3.5 w-3.5" />} onClick={() => setAction('hold')}>
                Mark held at customs
              </WriteButton>
            ) : null}
          </>
        }
      />

      {/* ------------------------------------------------------- the track */}
      <div className="grid gap-4 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
        <Panel>
          <PanelHeader title="Where it has reached" subtitle="Clearance applies to the whole consignment, one bill of entry" />
          <div className="p-4">
            <ShipmentTrack shipment={shipment} lastDeliveredOn={deliveries.map((d) => d.deliveredOn).sort().at(-1) ?? null} />
          </div>
        </Panel>

        <Panel>
          <PanelHeader title="The consignment" subtitle="Carrier, forwarder and the agent at the port" />
          <div className="p-4">
            <FieldGrid cols={2}>
              <Field label="Carrier">{shipment.carrier ?? '—'}</Field>
              <Field label="Forwarder">{shipment.forwarderName ?? 'Not appointed'}</Field>
              <Field label="C&amp;F agent">{shipment.cnfAgentName ?? 'Not appointed'}</Field>
              <Field label={shipment.mode === 'AIR' ? 'Airway bill' : 'Bill of lading'} mono>
                {shipment.blAwbNumber ?? '—'}
              </Field>
              <Field label="Port of loading">{shipment.portOfLoading ?? '—'}</Field>
              <Field label="Port of discharge">{shipment.portOfDischarge ?? '—'}</Field>
            </FieldGrid>
            {shipment.remarks ? (
              <p className="mt-3 text-xs leading-relaxed text-ink-600">{shipment.remarks}</p>
            ) : null}
          </div>
        </Panel>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <StatCell label="Batches on board" value={lines.length} hint={`${new Set(lines.map((l) => l.batchId)).size} distinct batch records`} />
        <StatCell label="Quantity shipped" value={fmtQty(shipped.qty, shipped.uom)} hint="Rolls up to the indent and order lines" />
        <StatCell
          label="Delivered"
          value={fmtQty(deliveredTotal.qty, deliveredTotal.uom || shipped.uom)}
          tone={shipped.qty > 0 && deliveredTotal.qty >= shipped.qty ? 'ok' : 'ink'}
          hint={pluralise(deliveries.length, 'delivery', 'deliveries')}
        />
        <StatCell
          label="Customs"
          value={shipment.customsClearedOn ? 'Cleared' : shipment.status === 'HELD_AT_CUSTOMS' ? 'Held' : 'Not cleared'}
          tone={shipment.customsClearedOn ? 'ok' : shipment.status === 'HELD_AT_CUSTOMS' ? 'danger' : 'warn'}
          hint={shipment.customsClearedOn ? fmtDate(shipment.customsClearedOn) : 'Nothing can be delivered until it clears'}
        />
      </div>

      {/* ----------------------------------------------------- batches */}
      <Panel>
        <PanelHeader
          title="Batches on this shipment"
          subtitle="Each line is a quantity of one batch against one indent line"
          actions={
            lines.length > 0 ? (
              <WriteButton size="sm" variant="secondary" icon={<Plus className="h-3.5 w-3.5" />} onClick={() => setBatchOpen(true)}>
                Add a batch
              </WriteButton>
            ) : null
          }
        />
        {loading ? (
          <SkeletonTable rows={3} cols={7} />
        ) : lines.length === 0 ? (
          <div className="p-4">
            <EmptyState
              icon={<Package className="h-5 w-5" />}
              title="No batch recorded on this shipment"
              description="Until a batch is recorded nothing counts as shipped against the indent line. A batch number already known for this source is reused with its recorded dates and COA."
              action={
                <WriteButton variant="primary" size="sm" onClick={() => setBatchOpen(true)}>
                  Add a batch
                </WriteButton>
              }
            />
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-paper-300 bg-paper-100/70">
                  <th className="th">Batch</th>
                  <th className="th text-right">Quantity</th>
                  <th className="th text-right">Manufactured</th>
                  <th className="th text-right">Expiry</th>
                  <th className="th text-right">Retest</th>
                  <th className="th text-right">Shelf life left</th>
                  <th className="th">Against indent line</th>
                  <th className="th">COA</th>
                </tr>
              </thead>
              <tbody>
                {lines.map((line) => {
                  const batch = db.batches.find((b) => b.id === line.batchId)
                  const indentLine = db.indentLines.find((l) => l.id === line.indentLineId)
                  const mp = db.manufacturerProducts.find((m) => m.id === line.manufacturerProductId)
                  const product = mp ? db.products.find((p) => p.id === mp.productId) : undefined
                  const months = batch?.expiryDate
                    ? differenceInMonths(parseISO(batch.expiryDate), new Date())
                    : null
                  const coa = db.documents.find(
                    (d) => d.entityType === 'BATCH' && d.entityId === line.batchId && d.typeCode === 'COA' && d.isActive,
                  )
                  return (
                    <tr key={line.id} className="border-b border-paper-200 last:border-0 align-top hover:bg-paper-100/60">
                      <td className="cell">
                        <Link
                          to={`/batches/${line.batchId}`}
                          className="font-mono text-[0.8rem] font-medium text-ink-900 hover:text-accent-700"
                        >
                          {batch?.batchNumber ?? '—'}
                        </Link>
                        <span className="block text-xs text-ink-500">{product?.genericName ?? ''}</span>
                        {line.shortShelfLifeRemark ? (
                          <span className="mt-1 flex items-start gap-1.5">
                            <Badge tone="warn">Short shelf life</Badge>
                            <span className="text-2xs italic leading-relaxed text-warn-600">
                              {line.shortShelfLifeRemark}
                            </span>
                          </span>
                        ) : null}
                      </td>
                      <td className="cell text-right font-medium tabular">{fmtQty(line.qty, line.qtyUom)}</td>
                      <td className="cell text-right tabular text-ink-600">{fmtDate(batch?.manufacturingDate)}</td>
                      <td className="cell text-right tabular text-ink-600">{fmtDate(batch?.expiryDate)}</td>
                      <td className="cell text-right tabular text-ink-600">{fmtDate(batch?.retestDate)}</td>
                      <td className="cell text-right tabular">
                        {months == null ? (
                          <span className="text-ink-400">—</span>
                        ) : months < 0 ? (
                          <span className="font-medium text-danger-700">expired</span>
                        ) : (
                          <span className={months < 24 ? 'text-warn-600' : 'text-ink-700'}>{months} months</span>
                        )}
                      </td>
                      <td className="cell text-xs text-ink-600">
                        {indentLine ? `line ${indentLine.lineNo} · ${fmtQty(indentLine.qty, indentLine.qtyUom)}` : '—'}
                      </td>
                      <td className="cell">
                        {coa ? (
                          <Tooltip content={`${coa.title} · filed ${fmtDate(coa.uploadedAt)}`}>
                            <span className="inline-flex items-center gap-1 text-xs text-accent-700">
                              <FileText className="h-3.5 w-3.5" />
                              on file
                            </span>
                          </Tooltip>
                        ) : (
                          <span className="text-xs text-warn-600">missing</span>
                        )}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </Panel>

      {/* ---------------------------------------------------- deliveries */}
      <Panel>
        <PanelHeader
          title="Deliveries"
          subtitle="To a site of the ordering client, once the consignment has cleared"
          actions={
            deliveries.length > 0 ? (
              <WriteButton size="sm" variant="secondary" icon={<Plus className="h-3.5 w-3.5" />} onClick={() => setDeliveryOpen(true)}>
                Record delivery
              </WriteButton>
            ) : null
          }
        />
        {loading ? (
          <SkeletonTable rows={2} cols={5} />
        ) : deliveries.length === 0 ? (
          <div className="p-4">
            <EmptyState
              icon={<Truck className="h-5 w-5" />}
              title={
                shipment.customsClearedOn
                  ? 'Nothing delivered from this shipment yet'
                  : 'This shipment has not cleared customs'
              }
              description={
                shipment.customsClearedOn
                  ? `Cleared on ${fmtDate(shipment.customsClearedOn)}, so the goods can now be delivered to the client's own site with a GRN reference.`
                  : 'Record the arrival and the customs clearance date first. Nothing can be delivered from a consignment that has not cleared.'
              }
              action={
                shipment.customsClearedOn ? (
                  <WriteButton variant="primary" size="sm" onClick={() => setDeliveryOpen(true)}>
                    Record a delivery
                  </WriteButton>
                ) : (
                  <WriteButton variant="primary" size="sm" onClick={() => setAction('clear')}>
                    Record clearance
                  </WriteButton>
                )
              }
            />
          </div>
        ) : (
          <ul className="divide-y divide-paper-200">
            {deliveries.map((d) => {
              const line = db.shipmentLines.find((l) => l.id === d.shipmentLineId)
              const batch = line ? db.batches.find((b) => b.id === line.batchId) : undefined
              const orderLine = db.clientOrderLines.find((l) => l.id === d.clientOrderLineId)
              const order = orderLine ? db.clientOrders.find((o) => o.id === orderLine.clientOrderId) : undefined
              return (
                <li key={d.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 px-4 py-2.5">
                  <span className="text-sm font-medium tabular text-ink-900">
                    {fmtQty(d.deliveredQty, d.qtyUom)}
                  </span>
                  <span className="font-mono text-2xs text-ink-600">{batch?.batchNumber ?? ''}</span>
                  <span className="min-w-0 flex-1 truncate text-xs text-ink-600">
                    to {siteName(db, d.deliverySiteId)}
                    {order && orderLine ? ` · against ${order.coNumber} line ${orderLine.lineNo}` : ''}
                  </span>
                  {d.grnReference ? (
                    <Badge tone="outline">
                      <span className="font-mono">GRN {d.grnReference}</span>
                    </Badge>
                  ) : null}
                  <span className="text-2xs tabular text-ink-500">{fmtDate(d.deliveredOn)}</span>
                </li>
              )
            })}
          </ul>
        )}
      </Panel>

      {presenter.showRuleHints ? (
        <RuleHint>
          A batch number already recorded for this source is reused, and refused if the dates typed disagree with the
          ones on file. The shipped total is checked against the indent line in its own unit, plus the configured
          tolerance. A delivery is refused before clearance, to a site of another company, against an order line this
          indent line does not serve, or beyond what the shipment line holds.
        </RuleHint>
      ) : null}

      <div className="grid gap-4 lg:grid-cols-2">
        <DocumentsPanel
          entityType="SHIPMENT"
          entityId={id}
          title="Documents"
          subtitle="Bill of lading, packing list, invoice and the bill of entry"
          emptyHint="The bill of lading or airway bill, the packing list and the bill of entry belong here. COAs sit on the batch."
        />
        <ActivityPanel entityType="SHIPMENT" entityId={id} subtitle="Updates from the forwarder and the C&F agent" />
      </div>

      <ShipmentActionDialog kind={action} onClose={() => setAction(null)} shipment={shipment} />
      <AddBatchDialog open={batchOpen} onOpenChange={setBatchOpen} shipment={shipment} />
      <RecordDeliveryDialog open={deliveryOpen} onOpenChange={setDeliveryOpen} shipment={shipment} />
    </div>
  )
}

// --------------------------------------------------------------- the track

const STEP_ICON: Partial<Record<ShipmentStatus, React.ReactNode>> = {
  PLANNED: <Package className="h-3 w-3" />,
  IN_TRANSIT: <Ship className="h-3 w-3" />,
  ARRIVED: <PackageCheck className="h-3 w-3" />,
  CLEARED: <Check className="h-3 w-3" />,
  DELIVERED: <Truck className="h-3 w-3" />,
}

function ShipmentTrack({
  shipment,
  lastDeliveredOn,
}: {
  shipment: Shipment
  lastDeliveredOn: string | null
}) {
  const held = shipment.status === 'HELD_AT_CUSTOMS'
  const cancelled = shipment.status === 'CANCELLED'
  // A held consignment is parked at arrival: it has not moved on.
  const anchor: ShipmentStatus = held ? 'ARRIVED' : cancelled ? 'PLANNED' : shipment.status
  const currentIndex = Math.max(0, SHIPMENT_FLOW.indexOf(anchor))

  const dateFor = (step: ShipmentStatus): { label: string; value: string | null } => {
    switch (step) {
      case 'PLANNED':
        return { label: 'recorded', value: shipment.createdAt.slice(0, 10) }
      case 'IN_TRANSIT':
        return { label: shipment.status === 'PLANNED' ? 'ETD' : 'departed', value: shipment.etd }
      case 'ARRIVED':
        return shipment.actualArrivalDate
          ? { label: 'arrived', value: shipment.actualArrivalDate }
          : { label: 'ETA', value: shipment.eta }
      case 'CLEARED':
        return { label: 'cleared', value: shipment.customsClearedOn }
      case 'DELIVERED':
        return { label: 'delivered', value: lastDeliveredOn }
      default:
        return { label: '', value: null }
    }
  }

  const fillPct = SHIPMENT_FLOW.length > 1 ? (currentIndex / (SHIPMENT_FLOW.length - 1)) * 100 : 0

  return (
    <div className="space-y-3">
      <div className="relative">
        {/* the rail, with the reached part filled */}
        <div className="absolute left-0 right-0 top-[9px] h-[3px] rounded-full bg-paper-300" aria-hidden />
        <motion.div
          className={`absolute left-0 top-[9px] h-[3px] rounded-full ${held ? 'bg-warn-500' : 'bg-accent-500'}`}
          style={{ right: 'auto' }}
          initial={{ width: 0 }}
          animate={{ width: `${fillPct}%` }}
          transition={{ duration: 0.8, ease: [0.22, 1, 0.36, 1] }}
          aria-hidden
        />
        <ol className="relative flex items-start justify-between">
          {SHIPMENT_FLOW.map((step, i) => {
            const reached = i <= currentIndex && !cancelled
            const isCurrent = i === currentIndex && !cancelled
            const { label, value } = dateFor(step)
            return (
              <li key={step} className="flex min-w-0 flex-1 flex-col items-center text-center">
                <motion.span
                  className={[
                    'grid h-5 w-5 place-items-center rounded-full border-2 border-white',
                    reached
                      ? isCurrent && held
                        ? 'bg-warn-500 text-white'
                        : 'bg-accent-600 text-white'
                      : 'bg-paper-300 text-ink-500',
                    isCurrent ? 'shadow-[0_0_0_3px_rgb(255_255_255),0_0_0_4.5px_rgb(12_120_107/0.35)]' : '',
                  ].join(' ')}
                  initial={{ scale: 0.6, opacity: 0 }}
                  animate={{ scale: 1, opacity: 1 }}
                  transition={{ duration: 0.3, delay: 0.1 + i * 0.07 }}
                >
                  {STEP_ICON[step]}
                </motion.span>
                <span
                  className={[
                    'mt-1.5 block w-full truncate text-[11px] leading-tight',
                    isCurrent ? 'font-semibold text-ink-900' : reached ? 'text-ink-700' : 'text-ink-400',
                  ].join(' ')}
                >
                  {SHIPMENT_STATUS_LABEL[step]}
                </span>
                <span className="mt-0.5 block w-full truncate text-[10px] tabular text-ink-400">
                  {value ? `${label} ${fmtDate(value)}` : '—'}
                </span>
              </li>
            )
          })}
        </ol>
      </div>

      {/* the hold is a branch off the track, not a step along it */}
      {held ? (
        <div className="flex items-start gap-2 pl-[18%]">
          <span className="mt-1 block h-4 w-4 shrink-0 rounded-bl border-b-2 border-l-2 border-danger-200" aria-hidden />
          <div className="min-w-0 rounded-md border border-danger-200 bg-danger-50 px-2.5 py-2">
            <p className="flex items-center gap-1.5 text-xs font-semibold text-danger-700">
              <ShieldAlert className="h-3.5 w-3.5" />
              Held at customs
            </p>
            {shipment.holdRemark ? (
              <p className="mt-0.5 text-xs leading-relaxed text-danger-700">{shipment.holdRemark}</p>
            ) : null}
            <p className="mt-0.5 text-2xs text-ink-500">
              The consignment stays at arrival until it is released. Record the clearance date once it is.
            </p>
          </div>
        </div>
      ) : null}

      {cancelled ? (
        <InlineWarning>
          <span>This shipment was cancelled. It is kept for history and counts towards nothing.</span>
        </InlineWarning>
      ) : null}
    </div>
  )
}

// ------------------------------------------------------- status dialogs

const ACTION_COPY: Record<
  ActionKind,
  { title: string; description: string; confirm: string; status: ShipmentStatus }
> = {
  depart: {
    title: 'Record departure',
    description: 'The manufacturer has despatched the consignment and the vessel or flight has left.',
    confirm: 'Record departure',
    status: 'IN_TRANSIT',
  },
  arrive: {
    title: 'Record arrival',
    description: 'The consignment has reached the port of discharge. Customs clearance is recorded separately.',
    confirm: 'Record arrival',
    status: 'ARRIVED',
  },
  clear: {
    title: 'Record customs clearance',
    description: 'One bill of entry clears the whole consignment. Nothing can be delivered until this date is recorded.',
    confirm: 'Record clearance',
    status: 'CLEARED',
  },
  hold: {
    title: 'Mark held at customs',
    description: 'A held consignment appears on the exceptions dashboard until it is released.',
    confirm: 'Mark held',
    status: 'HELD_AT_CUSTOMS',
  },
}

function ShipmentActionDialog({
  kind,
  onClose,
  shipment,
}: {
  kind: ActionKind | null
  onClose: () => void
  shipment: Shipment
}) {
  const [date, setDate] = React.useState(todayIso())
  const [agent, setAgent] = React.useState(shipment.cnfAgentName ?? '')
  const [remark, setRemark] = React.useState('')
  const [busy, setBusy] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)

  React.useEffect(() => {
    if (!kind) return
    setDate(todayIso())
    setAgent(shipment.cnfAgentName ?? '')
    setRemark('')
    setError(null)
  }, [kind, shipment.cnfAgentName])

  if (!kind) return null
  const copy = ACTION_COPY[kind]

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    if (kind === 'hold' && !remark.trim()) {
      setError('A shipment held at customs needs a remark saying why. Record what the query is and who is answering it.')
      return
    }
    const patch: Partial<Shipment> = { status: copy.status }
    if (kind === 'depart') patch.etd = date
    if (kind === 'arrive') patch.actualArrivalDate = date
    if (kind === 'clear') {
      patch.customsClearedOn = date
      patch.cnfAgentName = agent || null
      if (!shipment.actualArrivalDate) patch.actualArrivalDate = date
    }
    if (kind === 'hold') patch.holdRemark = remark.trim()
    if (remark.trim() && kind !== 'hold') patch.remarks = remark.trim()

    setBusy(true)
    const ok = await runAction(() => updateShipment(shipment.id, patch), {
      success: `${shipment.shipmentRef} is now ${SHIPMENT_STATUS_LABEL[copy.status].toLowerCase()}.`,
      onError: setError,
    })
    setBusy(false)
    if (ok !== null) onClose()
  }

  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open) onClose()
      }}
      title={copy.title}
      description={copy.description}
      icon={kind === 'hold' ? <ShieldAlert className="h-5 w-5 text-danger-600" /> : <Ship className="h-5 w-5 text-accent-600" />}
    >
      <form onSubmit={submit} className="space-y-3.5">
        {kind !== 'hold' ? (
          <FormGrid>
            <FormRow
              label={kind === 'depart' ? 'Departure date' : kind === 'arrive' ? 'Arrival date' : 'Customs clearance date'}
              required
              hint={kind === 'clear' ? 'Clearance cannot be dated before the arrival.' : undefined}
            >
              <DateInput value={date} onChange={(e) => setDate(e.target.value)} />
            </FormRow>
            {kind === 'clear' ? (
              <FormRow label="C&amp;F agent" hint="The agent who cleared the consignment at the port.">
                <Select
                  value={agent}
                  onChange={setAgent}
                  allowEmpty
                  emptyLabel="Not recorded"
                  placeholder="Not recorded"
                  options={CNF_AGENTS.map((a) => ({ value: a, label: a }))}
                />
              </FormRow>
            ) : null}
          </FormGrid>
        ) : null}

        <FormRow
          label={kind === 'hold' ? 'Why it is held' : 'Remark'}
          required={kind === 'hold'}
          hint={
            kind === 'hold'
              ? 'The api refuses a hold with no remark, because the next person needs to know what the query is.'
              : 'Optional.'
          }
        >
          <Textarea
            value={remark}
            onChange={(e) => setRemark(e.target.value)}
            rows={3}
            invalid={kind === 'hold' && Boolean(error) && !remark.trim()}
            placeholder={
              kind === 'hold'
                ? 'Bill of entry query on the HS code, the C&F agent is answering with the manufacturer’s specification.'
                : ''
            }
          />
        </FormRow>

        {kind === 'clear' && !shipment.actualArrivalDate ? (
          <InlineWarning>
            <span>No arrival date is recorded. The arrival will be set to this date as well.</span>
          </InlineWarning>
        ) : null}

        {error ? <InlineError>{error}</InlineError> : null}

        <div className="flex items-center justify-end gap-2 pt-1">
          <DialogFooterActions
            onCancel={onClose}
            confirmLabel={copy.confirm}
            confirmTone={kind === 'hold' ? 'danger' : 'primary'}
            loading={busy}
          />
        </div>
      </form>
    </Dialog>
  )
}

// ----------------------------------------------------------- add a batch

function AddBatchDialog({
  open,
  onOpenChange,
  shipment,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  shipment: Shipment
}) {
  const db = useDb()
  const settings = useSettings()
  const indentLines = db.indentLines.filter((l) => l.indentId === shipment.indentId).sort((a, b) => a.lineNo - b.lineNo)

  const [indentLineId, setIndentLineId] = React.useState(indentLines[0]?.id ?? '')
  const [batchNumber, setBatchNumber] = React.useState('')
  const [manufacturingDate, setManufacturingDate] = React.useState('')
  const [expiryDate, setExpiryDate] = React.useState('')
  const [retestDate, setRetestDate] = React.useState('')
  const [qty, setQty] = React.useState<number | null>(null)
  const [qtyUom, setQtyUom] = React.useState('KG')
  const [shortRemark, setShortRemark] = React.useState('')
  const [busy, setBusy] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)

  const indentLine = indentLines.find((l) => l.id === indentLineId)

  React.useEffect(() => {
    if (!open) return
    setIndentLineId(indentLines[0]?.id ?? '')
    setBatchNumber('')
    setManufacturingDate('')
    setExpiryDate('')
    setRetestDate('')
    setQty(null)
    setShortRemark('')
    setError(null)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open])

  React.useEffect(() => {
    if (indentLine) setQtyUom(indentLine.qtyUom)
  }, [indentLine])

  // An existing batch for this source is reused, with the dates on file.
  const existing = indentLine
    ? db.batches.find(
        (b) =>
          b.manufacturerProductId === indentLine.manufacturerProductId &&
          b.batchNumber.trim().toLowerCase() === batchNumber.trim().toLowerCase() &&
          batchNumber.trim().length > 0,
      )
    : undefined

  React.useEffect(() => {
    if (!existing) return
    setManufacturingDate(existing.manufacturingDate)
    setExpiryDate(existing.expiryDate ?? '')
    setRetestDate(existing.retestDate ?? '')
  }, [existing])

  // The same checks the api runs, shown before the save is attempted.
  const dateCheck: QtyGuard =
    manufacturingDate.length > 0
      ? checkBatchDates({ manufacturingDate, expiryDate: expiryDate || null, retestDate: retestDate || null })
      : { ok: true }

  const alreadyShipped = indentLine
    ? db.shipmentLines.filter((l) => l.indentLineId === indentLine.id).map((l) => ({ qty: l.qty, qtyUom: l.qtyUom }))
    : []
  const qtyCheck: QtyGuard =
    indentLine && qty && qty > 0
      ? checkOverShipment(
          indentLine.qty,
          indentLine.qtyUom,
          alreadyShipped,
          qty,
          qtyUom,
          settings.overshipmentTolerancePct,
        )
      : { ok: true }

  const link = indentLine ? db.orderIndentLinks.find((l) => l.indentLineId === indentLine.id) : undefined
  const orderLine = link ? db.clientOrderLines.find((l) => l.id === link.clientOrderLineId) : undefined
  const order = orderLine ? db.clientOrders.find((o) => o.id === orderLine.clientOrderId) : undefined
  const clientCompany = order ? db.companies.find((c) => c.id === order.clientCompanyId) : undefined
  const minMonths = clientCompany?.client?.minShelfLifeMonths ?? settings.minShelfLifeMonths
  const shelfCheck: QtyGuard = expiryDate ? checkShelfLife({ expiryDate }, minMonths) : { ok: true }
  const needsShelfRemark = !shelfCheck.ok && !shortRemark.trim()

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    if (!indentLine) {
      setError('Choose the indent line this batch is shipped against.')
      return
    }
    setBusy(true)
    const result = await runAction(
      () =>
        addShipmentLine({
          shipmentId: shipment.id,
          indentLineId: indentLine.id,
          batchNumber: batchNumber.trim(),
          manufacturingDate,
          expiryDate: expiryDate || null,
          retestDate: retestDate || null,
          qty: qty ?? 0,
          qtyUom,
          shortShelfLifeRemark: shortRemark.trim() || null,
        }),
      {
        success: (r) =>
          r.reusedBatch
            ? `Batch ${r.batch.batchNumber} was already recorded for this source, so the existing record was reused with its dates and COA.${r.warning ? ` ${r.warning}` : ''}`
            : `Batch ${r.batch.batchNumber} recorded.${r.warning ? ` ${r.warning}` : ''}`,
        onError: setError,
      },
    )
    setBusy(false)
    if (result) onOpenChange(false)
  }

  const productLabel = (lineId: string) => {
    const line = indentLines.find((l) => l.id === lineId)
    if (!line) return ''
    const mp = db.manufacturerProducts.find((m) => m.id === line.manufacturerProductId)
    const product = mp ? db.products.find((p) => p.id === mp.productId) : undefined
    return `${product?.genericName ?? 'Product'}, line ${line.lineNo}`
  }

  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      width="lg"
      icon={<Package className="h-5 w-5 text-accent-600" />}
      title="Add a batch to this shipment"
      description="One indent line may arrive as several batches, and one batch may be split across clients' indents."
    >
      <form onSubmit={submit} className="space-y-3.5">
        {indentLines.length === 0 ? (
          <EmptyState
            title="The indent has no lines"
            description="A batch is always recorded against an indent line. Check the indent."
            compact
          />
        ) : (
          <>
            <FormRow label="Against indent line" required>
              <Select
                value={indentLineId}
                onChange={setIndentLineId}
                options={indentLines.map((l) => {
                  const shipped = db.shipmentLines
                    .filter((sl) => sl.indentLineId === l.id)
                    .reduce((sum, sl) => sum + sl.qty, 0)
                  return {
                    value: l.id,
                    label: productLabel(l.id),
                    description: `ordered ${fmtQty(l.qty, l.qtyUom)} · already shipped ${fmtQty(shipped, l.qtyUom)}`,
                  }
                })}
              />
            </FormRow>

            <FormGrid cols={3}>
              <FormRow
                label="Batch number"
                required
                hint={existing ? 'Already recorded for this source, so its dates are shown below.' : 'As the manufacturer prints it.'}
              >
                <Input
                  value={batchNumber}
                  onChange={(e) => setBatchNumber(e.target.value)}
                  mono
                  placeholder="BN-2026-104"
                />
              </FormRow>
              <FormRow label="Quantity" required>
                <NumberInput value={qty} onChange={setQty} min={0} step="any" placeholder="100" />
              </FormRow>
              <FormRow label="Unit" required>
                <Select
                  value={qtyUom}
                  onChange={setQtyUom}
                  options={['KG', 'G', 'MT', 'L', 'DRUM'].map((u) => ({ value: u, label: u }))}
                />
              </FormRow>
            </FormGrid>

            {existing ? (
              <InlineWarning>
                <span>
                  Batch {existing.batchNumber} is already recorded for this source, made {fmtDate(existing.manufacturingDate)} and
                  expiring {fmtDate(existing.expiryDate)}. No second batch will be created, and dates that disagree with
                  these are refused as a probable mis-entry.
                </span>
              </InlineWarning>
            ) : null}

            <FormGrid cols={3}>
              <FormRow label="Manufactured on" required>
                <DateInput
                  value={manufacturingDate}
                  onChange={(e) => setManufacturingDate(e.target.value)}
                  disabled={Boolean(existing)}
                  invalid={!dateCheck.ok}
                />
              </FormRow>
              <FormRow label="Expiry date" hint="An expiry date, a retest date, or both.">
                <DateInput
                  value={expiryDate}
                  onChange={(e) => setExpiryDate(e.target.value)}
                  disabled={Boolean(existing)}
                  invalid={!dateCheck.ok}
                />
              </FormRow>
              <FormRow label="Retest date">
                <DateInput
                  value={retestDate}
                  onChange={(e) => setRetestDate(e.target.value)}
                  disabled={Boolean(existing)}
                />
              </FormRow>
            </FormGrid>

            {!dateCheck.ok ? <InlineError>{dateCheck.error}</InlineError> : null}
            {!qtyCheck.ok ? <InlineError>{qtyCheck.error}</InlineError> : null}
            {qtyCheck.ok && qtyCheck.warning ? <InlineWarning>{qtyCheck.warning}</InlineWarning> : null}

            {!shelfCheck.ok ? (
              <div className="space-y-2">
                <InlineWarning>
                  <span>
                    {shelfCheck.error} {clientCompany ? `${clientCompany.displayName} requires ${minMonths} months.` : ''}
                  </span>
                </InlineWarning>
                <FormRow
                  label="Short shelf life remark"
                  required
                  hint="What the client agreed, and who agreed it. The save is refused without this."
                >
                  <Textarea
                    value={shortRemark}
                    onChange={(e) => setShortRemark(e.target.value)}
                    rows={2}
                    invalid={needsShelfRemark}
                    placeholder="Client QA accepted the shorter shelf life in writing before shipment."
                  />
                </FormRow>
              </div>
            ) : null}

            <IndentingNote>
              The same batch number from a different manufacturer is a different batch, and is accepted.
            </IndentingNote>
          </>
        )}

        {error ? <InlineError>{error}</InlineError> : null}

        <div className="flex items-center justify-end gap-2 pt-1">
          <DialogFooterActions
            onCancel={() => onOpenChange(false)}
            confirmLabel="Add the batch"
            loading={busy}
            disabled={indentLines.length === 0 || !dateCheck.ok || !qtyCheck.ok || needsShelfRemark}
          />
        </div>
      </form>
    </Dialog>
  )
}

// ------------------------------------------------------ record a delivery

function RecordDeliveryDialog({
  open,
  onOpenChange,
  shipment,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  shipment: Shipment
}) {
  const db = useDb()
  const lines = db.shipmentLines.filter((l) => l.shipmentId === shipment.id)
  const indent = db.indents.find((i) => i.id === shipment.indentId)

  const [shipmentLineId, setShipmentLineId] = React.useState(lines[0]?.id ?? '')
  const [clientOrderLineId, setClientOrderLineId] = React.useState('')
  const [siteId, setSiteId] = React.useState('')
  const [qty, setQty] = React.useState<number | null>(null)
  const [deliveredOn, setDeliveredOn] = React.useState(todayIso())
  const [grn, setGrn] = React.useState('')
  const [busy, setBusy] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)

  const line = lines.find((l) => l.id === shipmentLineId)
  const batch = line ? db.batches.find((b) => b.id === line.batchId) : undefined

  // Only the client-order lines this indent line actually serves.
  const servedOrderLines = line
    ? db.orderIndentLinks
        .filter((l) => l.indentLineId === line.indentLineId)
        .map((l) => db.clientOrderLines.find((ol) => ol.id === l.clientOrderLineId))
        .filter((ol): ol is NonNullable<typeof ol> => Boolean(ol))
    : []

  // Only sites of the ordering client: a delivery elsewhere is refused.
  const sites = indent
    ? db.sites.filter((s) => s.companyId === indent.clientCompanyId && s.isDeliveryDestination && s.isActive)
    : []

  const alreadyDelivered = line
    ? db.deliveries.filter((d) => d.shipmentLineId === line.id).reduce((sum, d) => sum + d.deliveredQty, 0)
    : 0
  const remaining = line ? Math.round((line.qty - alreadyDelivered) * 10000) / 10000 : 0

  React.useEffect(() => {
    if (!open) return
    setShipmentLineId(lines[0]?.id ?? '')
    setDeliveredOn(shipment.customsClearedOn && shipment.customsClearedOn > todayIso() ? shipment.customsClearedOn : todayIso())
    setGrn('')
    setQty(null)
    setError(null)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open])

  React.useEffect(() => {
    setClientOrderLineId(servedOrderLines[0]?.id ?? '')
    const preferred = sites.find((s) => s.isPrimary) ?? sites[0]
    setSiteId((prev) => prev || preferred?.id || '')
    setQty(remaining > 0 ? remaining : null)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [shipmentLineId, open])

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    if (!line) {
      setError('Choose the shipment line being delivered.')
      return
    }
    setBusy(true)
    const ok = await runAction(
      () =>
        recordDelivery({
          shipmentLineId: line.id,
          clientOrderLineId,
          deliverySiteId: siteId,
          deliveredQty: qty ?? 0,
          qtyUom: line.qtyUom,
          deliveredOn,
          grnReference: grn.trim() || null,
        }),
      {
        success: (d) => `${fmtQty(d.deliveredQty, d.qtyUom)} delivered to ${siteName(db, d.deliverySiteId)}.`,
        onError: setError,
      },
    )
    setBusy(false)
    if (ok) onOpenChange(false)
  }

  const cleared = Boolean(shipment.customsClearedOn)

  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      width="lg"
      icon={<Truck className="h-5 w-5 text-accent-600" />}
      title="Record a delivery"
      description="From this shipment to a site of the ordering client, against the order line the indent line serves."
    >
      <form onSubmit={submit} className="space-y-3.5">
        {/* The cleared state is stated first, because everything depends on it. */}
        {cleared ? (
          <p className="flex items-center gap-2 rounded border border-ok-200 bg-ok-50 px-2.5 py-2 text-xs text-ok-600">
            <Check className="h-3.5 w-3.5 shrink-0" />
            Cleared customs on {fmtDate(shipment.customsClearedOn)}. A delivery dated before that is refused.
          </p>
        ) : (
          <InlineError>
            <span>
              This shipment has not been customs-cleared, so nothing can be delivered from it yet. Record the arrival
              and the clearance date first.
            </span>
          </InlineError>
        )}

        {lines.length === 0 ? (
          <EmptyState
            title="No batch on this shipment"
            description="A delivery is recorded against a batch on the shipment. Add the batches first."
            compact
          />
        ) : (
          <>
            <FormRow label="Shipment line" required>
              <Select
                value={shipmentLineId}
                onChange={setShipmentLineId}
                options={lines.map((l) => {
                  const b = db.batches.find((x) => x.id === l.batchId)
                  const done = db.deliveries
                    .filter((d) => d.shipmentLineId === l.id)
                    .reduce((sum, d) => sum + d.deliveredQty, 0)
                  return {
                    value: l.id,
                    label: `${b?.batchNumber ?? 'batch'} · ${fmtQty(l.qty, l.qtyUom)}`,
                    description: `${fmtQty(done, l.qtyUom)} already delivered`,
                  }
                })}
                disabled={!cleared}
              />
            </FormRow>

            <FormGrid>
              <FormRow
                label="Against client-order line"
                required
                hint="Only the order lines this indent line serves are listed. Any other is refused."
              >
                <Select
                  value={clientOrderLineId}
                  onChange={setClientOrderLineId}
                  disabled={!cleared || servedOrderLines.length === 0}
                  options={servedOrderLines.map((ol) => {
                    const order = db.clientOrders.find((o) => o.id === ol.clientOrderId)
                    return {
                      value: ol.id,
                      label: `${order?.coNumber ?? 'order'} line ${ol.lineNo}`,
                      description: `ordered ${fmtQty(ol.qty, ol.qtyUom)}`,
                    }
                  })}
                />
              </FormRow>
              <FormRow
                label="Delivery site"
                required
                hint="Only sites of the ordering client. A site of another company is refused."
              >
                <Select
                  value={siteId}
                  onChange={setSiteId}
                  disabled={!cleared || sites.length === 0}
                  options={sites.map((s) => ({
                    value: s.id,
                    label: s.name,
                    description: [s.city, s.countryCode].filter(Boolean).join(', '),
                  }))}
                />
              </FormRow>
            </FormGrid>

            <FormGrid cols={3}>
              <FormRow
                label={`Quantity (${line?.qtyUom ?? ''})`}
                required
                hint={line ? `This line holds ${fmtQty(remaining, line.qtyUom)} not yet delivered.` : undefined}
              >
                <NumberInput
                  value={qty}
                  onChange={setQty}
                  min={0}
                  step="any"
                  disabled={!cleared}
                  invalid={Boolean(qty && line && qty > remaining)}
                />
              </FormRow>
              <FormRow label="Delivered on" required>
                <DateInput
                  value={deliveredOn}
                  onChange={(e) => setDeliveredOn(e.target.value)}
                  disabled={!cleared}
                  invalid={Boolean(shipment.customsClearedOn && deliveredOn < shipment.customsClearedOn)}
                />
              </FormRow>
              <FormRow label="GRN reference" hint="The client's goods receipt note.">
                <Input value={grn} onChange={(e) => setGrn(e.target.value)} mono placeholder="GRN-4821" disabled={!cleared} />
              </FormRow>
            </FormGrid>

            {batch ? (
              <IndentingNote>
                Batch {batch.batchNumber}, expiring {fmtDate(batch.expiryDate)}. A second delivery can split the same
                line across two of the client's factories.
              </IndentingNote>
            ) : null}

            {qty && line && qty > remaining ? (
              <InlineWarning>
                <span>
                  This shipment line holds {fmtQty(line.qty, line.qtyUom)}, of which{' '}
                  {fmtQty(alreadyDelivered, line.qtyUom)} is already delivered. More than the balance is refused.
                </span>
              </InlineWarning>
            ) : null}
          </>
        )}

        {error ? <InlineError>{error}</InlineError> : null}

        <div className="flex items-center justify-end gap-2 pt-1">
          <DialogFooterActions
            onCancel={() => onOpenChange(false)}
            confirmLabel="Record the delivery"
            loading={busy}
            disabled={!cleared || lines.length === 0 || !clientOrderLineId || !siteId}
          />
        </div>
      </form>
    </Dialog>
  )
}
