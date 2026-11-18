/**
 * Product 2.0 — one client bulk order and its trade workflow:
 * Client order → PI/Indent → LC → Shipment → Delivered → Commission received.
 *
 * Each stage is completed only by a manual, confirmed user action; the next
 * stage's actions stay unavailable until the previous one is done.
 */

import * as React from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import {
  ArrowRight,
  Banknote,
  CheckCircle2,
  ClipboardCheck,
  FileSignature,
  Landmark,
  Lock,
  PackageCheck,
  Pencil,
  Ship,
  ShoppingCart,
  Trash2,
} from 'lucide-react'
import { runAction } from '@/lib/hooks'
import { cn, fmtDate } from '@/lib/utils'
import {
  Badge,
  Button,
  ConfirmDialog,
  Field,
  FieldGrid,
  InlineWarning,
  PageHeading,
  Panel,
  PanelHeader,
  SkeletonTable,
  WriteOnly,
} from '@/components/ui'
import { NotFound } from '@/features/misc/Fallbacks'
import { confirmLcOpened, deleteOrder, useP2 } from './store'
import { CalcRow, TradeStatusBadge, WorkflowTrack, partyName, useFirstLoad } from './components'
import {
  CommissionTermsDialog,
  ConfirmOrderDialog,
  DeliveryDialog,
  LcDialog,
  OrderDialog,
  PiDialog,
  ReceiptDialog,
  ShipmentDialog,
  ShippedDialog,
} from './tradeDialogs'
import { dec, fmtDecMoney, fmtDecPct, fmtDecQty } from './decimal'
import { COMMISSION_BASIS_LABEL, TRADE_STAGE_LABEL, currentTradeStage, orderFinancials, tradeBundle, tradeSteps } from './workflow'

type DialogKey = 'edit' | 'confirm' | 'pi' | 'lc' | 'shipment' | 'shipped' | 'delivery' | 'terms' | 'receipt' | null

const MODE_LABEL = { SEA: 'Sea freight', AIR: 'Air freight', ROAD: 'Road', COURIER: 'Courier' } as const

export function P2OrderDetail() {
  const { apiId = '', orderId = '' } = useParams()
  const data = useP2()
  const navigate = useNavigate()
  const loading = useFirstLoad()
  const [dialog, setDialog] = React.useState<DialogKey>(null)
  const [confirmLc, setConfirmLc] = React.useState(false)
  const [confirmDelete, setConfirmDelete] = React.useState(false)
  const [busy, setBusy] = React.useState(false)

  const order = data.tradeOrders.find((o) => o.id === orderId && o.apiProductId === apiId)
  const api = data.apiProducts.find((a) => a.id === apiId)
  if (!order || !api) return <NotFound />

  const b = tradeBundle(data, order)
  const fin = orderFinancials(b)
  const stage = currentTradeStage(b)
  const source = data.sourcing.find((s) => s.id === order.sourcingId)
  const c = order.currency
  const close = () => setDialog(null)
  const open = (k: DialogKey) => () => setDialog(k)
  const editable = !b.pi

  // the single next action, surfaced above the stage panels
  const next: { label: string; hint: string; action: () => void; icon: React.ReactNode } | null =
    stage === 'CLIENT_ORDER'
      ? { label: 'Confirm client order', hint: 'Confirm once the client has committed (signed PO received).', action: open('confirm'), icon: <ClipboardCheck className="h-3.5 w-3.5" /> }
      : stage === 'PI_PLACED'
        ? { label: 'Place PI / indent', hint: 'Record the PI or indent placed on the manufacturer.', action: open('pi'), icon: <FileSignature className="h-3.5 w-3.5" /> }
        : stage === 'LC_OPENED'
          ? b.lc
            ? { label: 'Confirm LC opened', hint: 'LC details are in draft. Confirm once the bank has issued it.', action: () => setConfirmLc(true), icon: <Landmark className="h-3.5 w-3.5" /> }
            : { label: 'Enter LC details', hint: 'Record the letter of credit the client opens.', action: open('lc'), icon: <Landmark className="h-3.5 w-3.5" /> }
          : stage === 'SHIPMENT'
            ? b.shipment
              ? { label: 'Mark as shipped', hint: 'Confirm when goods leave origin.', action: open('shipped'), icon: <Ship className="h-3.5 w-3.5" /> }
              : { label: 'Start shipment', hint: 'Record booking details; status becomes “in progress”.', action: open('shipment'), icon: <Ship className="h-3.5 w-3.5" /> }
            : stage === 'DELIVERED'
              ? { label: 'Confirm delivery', hint: 'Confirm the client has received the goods.', action: open('delivery'), icon: <PackageCheck className="h-3.5 w-3.5" /> }
              : stage === 'COMMISSION'
                ? { label: 'Record commission received', hint: 'Enter the commission actually received.', action: open('receipt'), icon: <Banknote className="h-3.5 w-3.5" /> }
                : null

  return (
    <div className="space-y-4">
      <PageHeading
        title={
          <span className="flex flex-wrap items-baseline gap-x-2">
            <span className="font-mono">{order.orderRef}</span>
            <span className="text-base font-normal text-ink-500">{api.name}</span>
          </span>
        }
        meta={
          <>
            <TradeStatusBadge bundle={b} />
            <Badge tone="neutral">{partyName(data, order.clientId)}</Badge>
            <Badge tone="outline">
              from {partyName(data, source?.manufacturerId)}
              {source?.intermediaryId ? ` via ${partyName(data, source.intermediaryId)}` : ''}
            </Badge>
          </>
        }
        actions={
          <WriteOnly>
            {editable ? (
              <Button icon={<Pencil className="h-3.5 w-3.5" />} onClick={open('edit')}>
                Edit order
              </Button>
            ) : null}
            {!order.confirmedOn ? (
              <Button variant="ghost" icon={<Trash2 className="h-3.5 w-3.5" />} onClick={() => setConfirmDelete(true)}>
                Delete
              </Button>
            ) : null}
          </WriteOnly>
        }
      />

      {loading ? (
        <SkeletonTable rows={5} />
      ) : (
        <>
          <WorkflowTrack variant="trade" steps={tradeSteps(b)} title="Trade progress" />

          {next ? (
            <WriteOnly>
              <div className="flex flex-wrap items-center justify-between gap-3 rounded-md border border-accent-200 bg-accent-50/60 px-4 py-3">
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-accent-800">Next step · {TRADE_STAGE_LABEL[stage!]}</p>
                  <p className="text-sm text-ink-700">{next.hint}</p>
                </div>
                <Button variant="primary" icon={next.icon} onClick={next.action}>
                  {next.label}
                </Button>
              </div>
            </WriteOnly>
          ) : (
            <div className="flex items-center gap-2 rounded-md border border-ok-200 bg-ok-50 px-4 py-3 text-sm text-ok-600">
              <CheckCircle2 className="h-4 w-4" /> Trade complete — delivered and commission received.
            </div>
          )}

          <div className="grid gap-4 lg:grid-cols-3">
            <div className="space-y-4 lg:col-span-2">
              {/* 1. client order */}
              <StagePanel
                n={1}
                icon={<ShoppingCart className="h-4 w-4" />}
                title="Client bulk order"
                done={!!order.confirmedOn}
                badge={order.confirmedOn ? `Confirmed ${fmtDate(order.confirmedOn)}` : 'Awaiting confirmation'}
              >
                <FieldGrid cols={3}>
                  <Field label="Client">{partyName(data, order.clientId)}</Field>
                  <Field label="Client PO" mono>
                    {order.clientPoRef ?? '—'}
                  </Field>
                  <Field label="Order date">{fmtDate(order.orderDate)}</Field>
                  <Field label="Bulk quantity" mono>
                    {fmtDecQty(dec(order.quantity), order.uom)}
                  </Field>
                  <Field label="Incoterm">{order.incoterm}</Field>
                  <Field label="Required by">{fmtDate(order.requiredBy)}</Field>
                  {order.remarks ? (
                    <Field label="Remarks" wrap className="col-span-2 lg:col-span-3">
                      {order.remarks}
                    </Field>
                  ) : null}
                </FieldGrid>
                {!editable ? <LockedNote>Quantity and price are fixed now that a PI has been placed.</LockedNote> : null}
              </StagePanel>

              {/* 2. PI */}
              <StagePanel
                n={2}
                icon={<FileSignature className="h-4 w-4" />}
                title="PI / Indent"
                done={!!b.pi}
                badge={b.pi ? `Placed ${fmtDate(b.pi.piDate)}` : undefined}
                locked={!order.confirmedOn}
                lockedText="Available once the client order is confirmed."
                action={
                  order.confirmedOn && !b.pi ? (
                    <Button size="sm" variant="primary" onClick={open('pi')}>
                      Place PI / indent
                    </Button>
                  ) : null
                }
              >
                {b.pi ? (
                  <FieldGrid cols={3}>
                    <Field label="PI / indent number" mono>
                      {b.pi.piNumber}
                    </Field>
                    <Field label="PI date">{fmtDate(b.pi.piDate)}</Field>
                    <Field label="Quantity" mono>
                      {fmtDecQty(dec(b.pi.quantity), order.uom)}
                    </Field>
                    {b.pi.remarks ? (
                      <Field label="Remarks" wrap className="col-span-2 lg:col-span-3">
                        {b.pi.remarks}
                      </Field>
                    ) : null}
                  </FieldGrid>
                ) : null}
              </StagePanel>

              {/* 3. LC */}
              <StagePanel
                n={3}
                icon={<Landmark className="h-4 w-4" />}
                title="Letter of credit"
                done={b.lc?.status === 'OPENED'}
                badge={b.lc ? (b.lc.status === 'OPENED' ? `Opened ${fmtDate(b.lc.openedOn)}` : 'Draft — not confirmed') : undefined}
                locked={!b.pi}
                lockedText="Available once the PI / indent is placed."
                action={
                  b.pi && b.lc?.status !== 'OPENED' ? (
                    <>
                      <Button size="sm" onClick={open('lc')}>
                        {b.lc ? 'Edit draft' : 'Enter LC details'}
                      </Button>
                      {b.lc ? (
                        <Button size="sm" variant="primary" onClick={() => setConfirmLc(true)}>
                          Confirm LC opened
                        </Button>
                      ) : null}
                    </>
                  ) : null
                }
              >
                {b.lc ? (
                  <FieldGrid cols={3}>
                    <Field label="LC number" mono>
                      {b.lc.lcNumber}
                    </Field>
                    <Field label="LC amount" mono>
                      {fmtDecMoney(dec(b.lc.amount), b.lc.currency)}
                    </Field>
                    <Field label="Issuing bank">{b.lc.issuingBank}</Field>
                    <Field label="Opening date">{fmtDate(b.lc.openedOn)}</Field>
                    <Field label="Latest shipment">{fmtDate(b.lc.latestShipmentDate)}</Field>
                    <Field label="Expiry">{fmtDate(b.lc.expiryDate)}</Field>
                    <Field label="Advising bank">{b.lc.advisingBank ?? '—'}</Field>
                    {b.lc.remarks ? (
                      <Field label="Remarks" wrap className="col-span-2">
                        {b.lc.remarks}
                      </Field>
                    ) : null}
                  </FieldGrid>
                ) : null}
              </StagePanel>

              {/* 4–5. shipment & delivery */}
              <StagePanel
                n={4}
                icon={<Ship className="h-4 w-4" />}
                title="Shipment & delivery"
                done={b.shipment?.status === 'DELIVERED'}
                badge={
                  b.shipment
                    ? b.shipment.status === 'IN_PROGRESS'
                      ? 'Shipment in progress'
                      : b.shipment.status === 'SHIPPED'
                        ? `Shipped ${fmtDate(b.shipment.shippedOn)}`
                        : `Delivered ${fmtDate(b.shipment.deliveredOn)}`
                    : undefined
                }
                locked={b.lc?.status !== 'OPENED'}
                lockedText="Available once the LC is confirmed as opened."
                action={
                  b.lc?.status === 'OPENED' ? (
                    !b.shipment ? (
                      <Button size="sm" variant="primary" onClick={open('shipment')}>
                        Start shipment
                      </Button>
                    ) : b.shipment.status === 'IN_PROGRESS' ? (
                      <>
                        <Button size="sm" onClick={open('shipment')}>
                          Update details
                        </Button>
                        <Button size="sm" variant="primary" onClick={open('shipped')}>
                          Mark as shipped
                        </Button>
                      </>
                    ) : b.shipment.status === 'SHIPPED' ? (
                      <>
                        <Button size="sm" onClick={open('shipment')}>
                          Update details
                        </Button>
                        <Button size="sm" variant="primary" onClick={open('delivery')}>
                          Confirm delivery
                        </Button>
                      </>
                    ) : null
                  ) : null
                }
              >
                {b.shipment ? (
                  <div className="space-y-3">
                    <ShipmentStatusStrip status={b.shipment.status} />
                    <FieldGrid cols={3}>
                      <Field label="Mode">{MODE_LABEL[b.shipment.mode]}</Field>
                      <Field label="Carrier">{b.shipment.carrier ?? '—'}</Field>
                      <Field label="B/L / AWB" mono>
                        {b.shipment.blAwbNumber ?? '—'}
                      </Field>
                      <Field label="Route">
                        {b.shipment.portOfLoading || b.shipment.portOfDischarge ? (
                          <span className="inline-flex items-center gap-1">
                            {b.shipment.portOfLoading ?? '?'} <ArrowRight className="h-3 w-3 text-ink-400" /> {b.shipment.portOfDischarge ?? '?'}
                          </span>
                        ) : (
                          '—'
                        )}
                      </Field>
                      <Field label="ETD / ETA">
                        {fmtDate(b.shipment.etd)} → {fmtDate(b.shipment.eta)}
                      </Field>
                      <Field label="Shipped on">{fmtDate(b.shipment.shippedOn)}</Field>
                      <Field label="Delivered on">{fmtDate(b.shipment.deliveredOn)}</Field>
                      {b.shipment.deliveryRemarks ? (
                        <Field label="Delivery remarks" wrap className="col-span-2">
                          {b.shipment.deliveryRemarks}
                        </Field>
                      ) : null}
                    </FieldGrid>
                    {b.lc && b.shipment.shippedOn && b.shipment.shippedOn > b.lc.latestShipmentDate ? (
                      <InlineWarning>Shipped after the LC’s latest shipment date ({fmtDate(b.lc.latestShipmentDate)}).</InlineWarning>
                    ) : null}
                  </div>
                ) : null}
              </StagePanel>
            </div>

            {/* financials */}
            <div className="space-y-4">
              <Panel>
                <PanelHeader title="Pricing" subtitle="FOB and transport are kept separate from the LC amount." />
                <div className="px-4 py-2">
                  <CalcRow label="Quantity" value={fmtDecQty(fin.quantity, order.uom)} />
                  <CalcRow label="FOB unit price" value={`${fmtDecMoney(fin.fobUnitPrice, c, 4)}/${order.uom}`} />
                  <CalcRow label="FOB value" hint="qty × price" value={fmtDecMoney(fin.fobValue, c)} emphasis />
                  <CalcRow label="Transportation charges" value={fmtDecMoney(fin.transportCharges, c)} />
                  <CalcRow label="Total transaction amount" value={fmtDecMoney(fin.transactionTotal, c)} emphasis />
                  <CalcRow
                    label="LC amount"
                    value={fin.lcAmount != null ? fmtDecMoney(fin.lcAmount, b.lc!.currency) : 'No LC yet'}
                    muted={fin.lcAmount == null}
                  />
                  {fin.lcAmount != null && b.lc!.currency === c && fin.lcAmount !== fin.transactionTotal ? (
                    <p className="pb-1 text-sm text-ink-400">
                      LC is {fmtDecMoney(fin.lcAmount > fin.transactionTotal ? fin.lcAmount - fin.transactionTotal : fin.transactionTotal - fin.lcAmount, c)}{' '}
                      {fin.lcAmount > fin.transactionTotal ? 'above' : 'below'} the transaction total.
                    </p>
                  ) : null}
                </div>
              </Panel>

              <Panel className={cn(b.commission?.status === 'RECEIVED' && 'border-ok-200')}>
                <PanelHeader
                  icon={<Banknote className="h-4 w-4" />}
                  title="Commission"
                  actions={
                    b.commission?.status === 'RECEIVED' ? (
                      <Badge tone="ok">Received</Badge>
                    ) : (
                      <WriteOnly>
                        <Button size="sm" variant="ghost" icon={<Pencil className="h-3 w-3" />} onClick={open('terms')}>
                          Terms
                        </Button>
                      </WriteOnly>
                    )
                  }
                />
                <div className="px-4 py-2">
                  <CalcRow label="Basis" value={<span className="font-sans">{fin.basis ? COMMISSION_BASIS_LABEL[fin.basis] : '—'}</span>} />
                  <CalcRow label="Commission rate" value={fmtDecPct(fin.percentage)} />
                  <CalcRow label="Commissionable amount" value={fmtDecMoney(fin.commissionableAmount, c)} />
                  <CalcRow label="Expected commission" value={fmtDecMoney(fin.expectedCommission, c)} emphasis />
                  <CalcRow
                    label="Actual received"
                    value={fin.receivedCommission != null ? fmtDecMoney(fin.receivedCommission, c) : 'Not yet'}
                    muted={fin.receivedCommission == null}
                  />
                  {fin.variance != null && fin.variance !== 0n ? (
                    <CalcRow label="Variance" value={fmtDecMoney(fin.variance, c, 2, true)} />
                  ) : null}
                  {b.commission?.status === 'RECEIVED' ? (
                    <p className="pb-1 pt-1 text-sm text-ink-500">
                      Received {fmtDate(b.commission.receivedOn)}
                      {b.commission.receiptRef ? ` · ref ${b.commission.receiptRef}` : ''}
                    </p>
                  ) : stage === 'COMMISSION' ? (
                    <WriteOnly>
                      <Button className="my-2 w-full justify-center" variant="primary" size="sm" onClick={open('receipt')}>
                        Record commission received
                      </Button>
                    </WriteOnly>
                  ) : (
                    <p className="pb-1 pt-1 text-sm text-ink-400">Receipt can be recorded after delivery is confirmed.</p>
                  )}
                </div>
              </Panel>

              <p className="text-center text-sm text-ink-400">
                <Link to={`/product-2/${api.id}?tab=trade`} className="hover:text-ink-700 hover:underline">
                  All orders for {api.name}
                </Link>
              </p>
            </div>
          </div>
        </>
      )}

      <OrderDialog open={dialog === 'edit'} onOpenChange={close} apiProductId={api.id} existing={b} />
      <ConfirmOrderDialog open={dialog === 'confirm'} onOpenChange={close} bundle={b} />
      <PiDialog open={dialog === 'pi'} onOpenChange={close} bundle={b} />
      <LcDialog open={dialog === 'lc'} onOpenChange={close} bundle={b} />
      <ShipmentDialog open={dialog === 'shipment'} onOpenChange={close} bundle={b} />
      <ShippedDialog open={dialog === 'shipped'} onOpenChange={close} bundle={b} />
      <DeliveryDialog open={dialog === 'delivery'} onOpenChange={close} bundle={b} />
      <CommissionTermsDialog open={dialog === 'terms'} onOpenChange={close} bundle={b} />
      <ReceiptDialog open={dialog === 'receipt'} onOpenChange={close} bundle={b} />

      <ConfirmDialog
        open={confirmLc}
        onOpenChange={setConfirmLc}
        title="Confirm the LC is opened?"
        recordName={b.lc ? `LC ${b.lc.lcNumber} — ${fmtDecMoney(dec(b.lc.amount), b.lc.currency)}` : 'LC'}
        consequence="LC details lock after confirmation, and shipment can start."
        confirmLabel="Confirm LC opened"
        tone="primary"
        loading={busy}
        onConfirm={async () => {
          setBusy(true)
          await runAction(() => confirmLcOpened(order.id), { success: 'LC confirmed as opened.' })
          setBusy(false)
          setConfirmLc(false)
        }}
      />
      <ConfirmDialog
        open={confirmDelete}
        onOpenChange={setConfirmDelete}
        title="Delete this order?"
        recordName={order.orderRef}
        consequence="It has not been confirmed. The order and its commission terms are removed. Other orders are not affected."
        confirmLabel="Delete order"
        loading={busy}
        onConfirm={async () => {
          setBusy(true)
          const ok = await runAction(() => deleteOrder(order.id), { success: `${order.orderRef} deleted.` })
          setBusy(false)
          setConfirmDelete(false)
          if (ok !== null) navigate(`/product-2/${api.id}?tab=trade`)
        }}
      />
    </div>
  )
}

// ---------------------------------------------------------------- pieces

function StagePanel({
  n,
  icon,
  title,
  done,
  badge,
  locked,
  lockedText,
  action,
  children,
}: {
  n: number
  icon: React.ReactNode
  title: string
  done: boolean
  badge?: string
  locked?: boolean
  lockedText?: string
  action?: React.ReactNode
  children?: React.ReactNode
}) {
  return (
    <Panel className={cn(done && 'border-ok-200')}>
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-paper-200 px-4 py-2.5">
        <div className="flex min-w-0 items-center gap-2.5">
          <span
            className={cn(
              'grid h-6 w-6 shrink-0 place-items-center rounded-full text-sm font-semibold',
              done ? 'bg-ok-500 text-white' : 'bg-paper-200 text-ink-500',
            )}
          >
            {done ? <CheckCircle2 className="h-3.5 w-3.5" /> : n}
          </span>
          <span className="text-ink-400">{icon}</span>
          <h2 className="truncate text-sm font-semibold text-ink-900">{title}</h2>
          {badge ? <Badge tone={done ? 'ok' : 'neutral'}>{badge}</Badge> : null}
        </div>
        {action ? (
          <WriteOnly>
            <div className="flex items-center gap-1.5">{action}</div>
          </WriteOnly>
        ) : null}
      </div>
      <div className="p-4">
        {locked ? (
          <p className="flex items-center gap-1.5 text-sm text-ink-400">
            <Lock className="h-3 w-3" /> {lockedText}
          </p>
        ) : children ? (
          children
        ) : (
          <p className="text-sm text-ink-400">Not recorded yet.</p>
        )}
      </div>
    </Panel>
  )
}

function LockedNote({ children }: { children: React.ReactNode }) {
  return (
    <p className="mt-3 flex items-center gap-1.5 text-sm text-ink-400">
      <Lock className="h-3 w-3" /> {children}
    </p>
  )
}

function ShipmentStatusStrip({ status }: { status: 'IN_PROGRESS' | 'SHIPPED' | 'DELIVERED' }) {
  const steps = [
    { k: 'IN_PROGRESS', label: 'In progress' },
    { k: 'SHIPPED', label: 'Shipped' },
    { k: 'DELIVERED', label: 'Delivered' },
  ]
  const idx = steps.findIndex((s) => s.k === status)
  return (
    <div className="flex gap-1">
      {steps.map((s, i) => (
        <div key={s.k} className="flex-1">
          <div className={cn('h-1.5 rounded-full', i <= idx ? 'bg-ok-500' : 'bg-paper-300')} />
          <span className={cn('mt-1 block text-sm', i <= idx ? 'font-medium text-ok-600' : 'text-ink-400')}>{s.label}</span>
        </div>
      ))}
    </div>
  )
}
