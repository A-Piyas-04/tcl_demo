/**
 * One client order: its lines, the indents raised from them, and what is still
 * uncovered (UC-09 steps 5 to 8, AC-09, UF-03).
 *
 * The order says what the client wants. The indent is the order TCL places on
 * the manufacturer for that client, and the money on it is the price agreed
 * between those two parties. Raising an indent here groups the open lines by
 * manufacturer, one indent each, every one naming this client.
 */

import * as React from 'react'
import { Link, useParams, useSearchParams } from 'react-router-dom'
import { ArrowRight, FileStack, Receipt, Split, Zap } from 'lucide-react'
import { useDb, usePresenter } from '@/data/store'
import {
  bestPrice,
  indentValue,
  indentsForOrder,
  orderLineStatuses,
  siteName,
  userName,
  type OrderLineStatus,
} from '@/data/selectors'
import { ORDER_STATUS_LABEL, paymentTermLabel } from '@/data/reference'
import { raiseIndents } from '@/data/api'
import { runAction, useAsyncData } from '@/lib/hooks'
import { fmtDate, fmtMoney, fmtQty, pluralise } from '@/lib/utils'
import type { ClientOrderLine } from '@/data/types'
import {
  Badge,
  Dialog,
  DialogFooterActions,
  EmptyState,
  Field,
  FieldGrid,
  FormRow,
  InlineError,
  InlineWarning,
  Input,
  NumberInput,
  Panel,
  PanelHeader,
  PageHeading,
  RuleHint,
  SkeletonTable,
  Tooltip,
  WriteButton,
} from '@/components/ui'
import { NotFound } from '@/features/misc/Fallbacks'
import {
  ActivityPanel,
  DocumentsPanel,
  IndentingNote,
  LcBadge,
  OrderStatusBadge,
  StatCell,
  sumQty,
} from './shared'

export function ClientOrderDetail() {
  const { id = '' } = useParams()
  const db = useDb()
  const presenter = usePresenter()
  const [params, setParams] = useSearchParams()
  const [raiseOpen, setRaiseOpen] = React.useState(false)

  const order = db.clientOrders.find((o) => o.id === id)

  const { data, loading } = useAsyncData(
    () => ({
      lines: orderLineStatuses(db, { orderId: id }),
      indents: indentsForOrder(db, id),
      rawLines: db.clientOrderLines.filter((l) => l.clientOrderId === id),
      linkedLineIds: new Set(db.orderIndentLinks.map((l) => l.clientOrderLineId)),
    }),
    [id],
  )

  // Arriving from the order form with ?raise=1 opens step 6 straight away.
  React.useEffect(() => {
    if (params.get('raise') !== '1') return
    // Held back a moment: the dialog on the order form is still closing, and
    // its focus returning to a trigger that has gone would be read as an
    // interaction outside this dialog and dismiss it as soon as it appeared.
    const t = window.setTimeout(() => {
      setRaiseOpen(true)
      const next = new URLSearchParams(params)
      next.delete('raise')
      setParams(next, { replace: true })
    }, 450)
    return () => window.clearTimeout(t)
  }, [params, setParams])

  if (!order) return <NotFound />

  const lines = data?.lines ?? []
  const indents = data?.indents ?? []
  const pending = (data?.rawLines ?? []).filter((l) => !data!.linkedLineIds.has(l.id))

  const ordered = sumQty(lines.map((l) => ({ qty: l.orderedQty, uom: l.uom })))
  const indented = sumQty(lines.map((l) => ({ qty: l.indentedQty, uom: l.uom })))
  const delivered = sumQty(lines.map((l) => ({ qty: l.deliveredQty, uom: l.uom })))

  // Group the lines by product so split sourcing reads as one requirement.
  const grouped = new Map<string, OrderLineStatus[]>()
  for (const line of lines) {
    const list = grouped.get(line.productId) ?? []
    list.push(line)
    grouped.set(line.productId, list)
  }

  return (
    <div className="space-y-4">
      <PageHeading
        title={<span className="font-mono tabular">{order.coNumber}</span>}
        subtitle={
          <>
            Placed by <Link to={`/clients/${order.clientCompanyId}`} className="font-medium text-ink-700 hover:text-accent-700">
              {lines[0]?.clientName ?? db.companies.find((c) => c.id === order.clientCompanyId)?.displayName ?? 'the client'}
            </Link>{' '}
            on {fmtDate(order.orderDate)}. Recorded by {userName(db, order.createdByUserId)}.
          </>
        }
        meta={
          <>
            <OrderStatusBadge status={order.status} />
            {order.hasOverride ? (
              <Tooltip content="At least one line uses a source that was not approved for this client. The reason is on the line.">
                <Badge tone="warn">Contains an override</Badge>
              </Tooltip>
            ) : null}
            {order.clientReference ? (
              <Badge tone="outline">
                <span className="font-mono">{order.clientReference}</span>
              </Badge>
            ) : null}
            <Badge tone="neutral">{order.currency}</Badge>
            {order.incoterm ? <Badge tone="neutral">{order.incoterm}</Badge> : null}
          </>
        }
        actions={
          pending.length > 0 ? (
            <WriteButton
              variant="primary"
              size="md"
              icon={<Zap className="h-3.5 w-3.5" />}
              onClick={() => setRaiseOpen(true)}
            >
              Raise indent
            </WriteButton>
          ) : null
        }
      />

      {/* Four bounded cells, not one wide band. */}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <StatCell label="Lines" value={lines.length} hint={`${grouped.size} ${grouped.size === 1 ? 'molecule' : 'molecules'}`} />
        <StatCell label="Total ordered" value={fmtQty(ordered.qty, ordered.uom)} hint={ordered.mixed ? 'Mixed units, indicative' : 'As ordered by the client'} />
        <StatCell
          label="On indent"
          value={fmtQty(indented.qty, indented.uom)}
          tone="accent"
          hint={pending.length > 0 ? `${pluralise(pending.length, 'line')} not yet covered` : 'Every line is covered'}
        />
        <StatCell
          label="Delivered"
          value={fmtQty(delivered.qty, delivered.uom)}
          tone={delivered.qty >= ordered.qty && ordered.qty > 0 ? 'ok' : 'ink'}
          hint={`${ordered.qty > 0 ? Math.round((delivered.qty / ordered.qty) * 100) : 0}% of the order`}
        />
      </div>

      <Panel>
        <PanelHeader
          title="Terms on this order"
          subtitle="Defaulted from the client record when the order was recorded"
        />
        <div className="p-4">
          <FieldGrid cols={4}>
            <Field label="Currency">{order.currency}</Field>
            <Field label="Incoterm">{order.incoterm ?? '—'}</Field>
            <Field label="Payment terms">{paymentTermLabel(order.paymentTermCode)}</Field>
            <Field label="Delivery site">{order.deliverySiteId ? siteName(db, order.deliverySiteId) : 'Not set'}</Field>
          </FieldGrid>
          {order.remarks ? <p className="mt-3 text-xs leading-relaxed text-ink-600">{order.remarks}</p> : null}
        </div>
      </Panel>

      {/* ------------------------------------------------------------ lines */}
      <Panel>
        <PanelHeader
          title="Lines"
          subtitle="Ordered, indented, shipped, cleared and delivered, with the balances still open"
          actions={<Badge tone="neutral">{pluralise(lines.length, 'line')}</Badge>}
        />
        {loading ? (
          <SkeletonTable rows={4} cols={7} />
        ) : lines.length === 0 ? (
          <div className="p-4">
            <EmptyState
              title="This order has no lines"
              description="An order with no line cannot be indented. Record the lines on the order, or cancel it."
              compact
            />
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-paper-300 bg-paper-100/70">
                  <th className="th w-10">#</th>
                  <th className="th">Product and source</th>
                  <th className="th text-right">Ordered</th>
                  <th className="th text-right">Indented</th>
                  <th className="th text-right">Shipped</th>
                  <th className="th text-right">Cleared</th>
                  <th className="th text-right">Delivered</th>
                  <th className="th text-right">Not indented</th>
                  <th className="th text-right">Not delivered</th>
                </tr>
              </thead>
              {[...grouped.entries()].map(([productId, group]) => (
                <tbody key={productId} className="border-b-2 border-paper-200 last:border-b-0">
                  {group.length > 1 ? (
                    <tr className="bg-accent-50/40">
                      <td className="px-3 py-1.5" colSpan={9}>
                        <span className="flex items-center gap-2 text-xs font-semibold text-accent-900">
                          <Split className="h-3.5 w-3.5" />
                          {group[0]!.productName}
                          <Badge tone="accent">Split sourced across {group.length} manufacturers</Badge>
                        </span>
                      </td>
                    </tr>
                  ) : null}
                  {group.map((line) => (
                    <tr key={line.lineId} className="border-b border-paper-200 last:border-0 align-top hover:bg-paper-100/60">
                      <td className="cell tabular text-ink-500">{line.lineNo}</td>
                      <td className="cell">
                        <Link
                          to={`/products/${line.productId}`}
                          className="block font-medium text-ink-900 hover:text-accent-700"
                        >
                          {line.productName}
                        </Link>
                        <span className="block text-xs text-ink-500">{line.sourceName}</span>
                        {line.overrideReason ? (
                          <span className="mt-1 flex items-start gap-1.5">
                            <Badge tone="warn">Override</Badge>
                            <span className="text-2xs italic leading-relaxed text-warn-600">
                              {line.overrideReason}
                            </span>
                          </span>
                        ) : null}
                      </td>
                      <td className="cell text-right font-medium tabular">{fmtQty(line.orderedQty, line.uom)}</td>
                      <td className="cell text-right tabular text-ink-700">{fmtQty(line.indentedQty, line.uom)}</td>
                      <td className="cell text-right tabular text-ink-700">{fmtQty(line.shippedQty, line.uom)}</td>
                      <td className="cell text-right tabular text-ink-700">{fmtQty(line.clearedQty, line.uom)}</td>
                      <td className="cell text-right tabular text-ink-900">{fmtQty(line.deliveredQty, line.uom)}</td>
                      <td className="cell text-right tabular">
                        {line.unindentedQty > 0 ? (
                          <span className="font-medium text-warn-600">{fmtQty(line.unindentedQty, line.uom)}</span>
                        ) : (
                          <span className="text-ink-400">—</span>
                        )}
                      </td>
                      <td className="cell text-right tabular">
                        {line.undeliveredQty > 0 ? (
                          <span className="text-ink-700">{fmtQty(line.undeliveredQty, line.uom)}</span>
                        ) : (
                          <Badge tone="ok">Complete</Badge>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              ))}
            </table>
          </div>
        )}
      </Panel>

      {/* ---------------------------------------------------------- indents */}
      <Panel>
        <PanelHeader
          title="Indents raised"
          subtitle="One per manufacturer, each placed for this client"
          actions={<Badge tone="neutral">{pluralise(indents.length, 'indent')}</Badge>}
        />
        {loading ? (
          <SkeletonTable rows={2} cols={5} />
        ) : indents.length === 0 ? (
          <div className="p-4">
            <EmptyState
              icon={<FileStack className="h-5 w-5" />}
              title="No indent raised from this order yet"
              description="Until an indent exists the manufacturer has not been booked, so nothing can ship. Raising one groups the lines by manufacturer."
              action={
                <WriteButton variant="primary" size="sm" onClick={() => setRaiseOpen(true)}>
                  Raise indent
                </WriteButton>
              }
            />
          </div>
        ) : (
          <ul className="divide-y divide-paper-200">
            {indents.map((indent) => (
              <li key={indent.id}>
                <Link
                  to={`/indents/${indent.id}`}
                  className="flex flex-wrap items-center gap-x-3 gap-y-1.5 px-4 py-3 transition-colors hover:bg-paper-100"
                >
                  <span className="font-mono text-[0.8rem] tabular font-medium text-ink-900">
                    {indent.indentNumber}
                  </span>
                  <span className="min-w-0 flex-1 truncate text-sm text-ink-800">
                    on {db.companies.find((c) => c.id === indent.manufacturerCompanyId)?.displayName ?? '—'}
                  </span>
                  <span className="text-sm font-medium tabular text-ink-900">
                    {fmtMoney(indentValue(db, indent.id), indent.currency, { decimals: 0 })}
                  </span>
                  <LcBadge indent={indent} />
                  <Badge tone="neutral">{ORDER_STATUS_LABEL[indent.status]}</Badge>
                  <ArrowRight className="h-3.5 w-3.5 text-ink-400" />
                </Link>
              </li>
            ))}
          </ul>
        )}
      </Panel>

      {presenter.showRuleHints ? (
        <RuleHint>
          An indent names one manufacturer and one client. A line can only be indented once, so the balance column
          shows what is still uncovered, and a second indent can be raised for it later. The first indent against an
          engagement at Approved moves that engagement to Commercial.
        </RuleHint>
      ) : null}

      <div className="grid gap-4 lg:grid-cols-2">
        <DocumentsPanel
          entityType="CLIENT_ORDER"
          entityId={id}
          title="Documents"
          subtitle="The client's own purchase document and anything filed against the order"
          emptyHint="The client's own purchase document, email confirmation or revised schedule belongs here. Shipping documents sit on the shipment."
        />
        <ActivityPanel entityType="CLIENT_ORDER" entityId={id} subtitle="Calls, emails and notes on this order" />
      </div>

      <RaiseIndentDialog
        open={raiseOpen}
        onOpenChange={setRaiseOpen}
        orderId={id}
        pending={pending}
        clientName={lines[0]?.clientName ?? ''}
        currency={order.currency}
      />
    </div>
  )
}

/**
 * UC-09 steps 6 and 7. The lines are grouped by manufacturer, one proposed
 * indent each, and the agreed unit price is asked for per line: the api
 * refuses a line with no price, so the figure is not optional.
 */
function RaiseIndentDialog({
  open,
  onOpenChange,
  orderId,
  pending,
  clientName,
  currency,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  orderId: string
  pending: ClientOrderLine[]
  clientName: string
  currency: string
}) {
  const db = useDb()
  const [prices, setPrices] = React.useState<Record<string, number | null>>({})
  const [proforma, setProforma] = React.useState('')
  const [busy, setBusy] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)

  // Pre-fill from the currently valid price, which the user may overwrite.
  React.useEffect(() => {
    if (!open) return
    const next: Record<string, number | null> = {}
    for (const line of pending) {
      next[line.id] = bestPrice(db, line.manufacturerProductId, { qty: line.qty })?.price ?? null
    }
    setPrices(next)
    setProforma('')
    setError(null)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open])

  const groups = React.useMemo(() => {
    const byMfr = new Map<string, ClientOrderLine[]>()
    for (const line of pending) {
      const mp = db.manufacturerProducts.find((m) => m.id === line.manufacturerProductId)
      if (!mp) continue
      const list = byMfr.get(mp.manufacturerCompanyId) ?? []
      list.push(line)
      byMfr.set(mp.manufacturerCompanyId, list)
    }
    return [...byMfr.entries()]
  }, [pending, db])

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    const payload: Record<string, number> = {}
    for (const [lineId, price] of Object.entries(prices)) if (price != null) payload[lineId] = price
    setBusy(true)
    const result = await runAction(() => raiseIndents(orderId, payload, { proformaInvoiceRef: proforma.trim() || null }), {
      success: (indents) =>
        `${pluralise(indents.length, 'indent')} raised for ${clientName}. Any engagement at Approved has moved to Commercial, which is the commercial gate.`,
      onError: setError,
    })
    setBusy(false)
    if (result) onOpenChange(false)
  }

  const total = (lines: ClientOrderLine[]) =>
    lines.reduce((sum, l) => sum + (prices[l.id] ?? 0) * l.qty, 0)

  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      width="lg"
      icon={<Receipt className="h-5 w-5 text-accent-600" />}
      title="Raise the indents"
      description={`One indent per manufacturer, each placed on that manufacturer for ${clientName || 'this client'}.`}
    >
      <form onSubmit={submit} className="space-y-4">
        <IndentingNote>
          The price on each line is the one agreed between the client and the manufacturer. It is what the client
          pays the manufacturer, not a TCL price. TCL earns commission from the client, recorded on the indent.
        </IndentingNote>

        {groups.length === 0 ? (
          <EmptyState
            title="Every line is already covered by an indent"
            description="Nothing is left to indent on this order. Open an indent to record its letter of credit or a shipment."
            compact
          />
        ) : null}

        {groups.map(([mfrId, group]) => (
          <div key={mfrId} className="rounded-md border border-paper-300 bg-paper-50/40 p-3">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <p className="text-sm font-semibold text-ink-900">
                Proposed indent on {db.companies.find((c) => c.id === mfrId)?.displayName ?? '—'}
              </p>
              <p className="text-xs text-ink-500">
                for {clientName} · {pluralise(group.length, 'line')} ·{' '}
                <span className="font-medium tabular text-ink-800">
                  {fmtMoney(total(group), currency, { decimals: 0 })}
                </span>
              </p>
            </div>
            <ul className="mt-2.5 space-y-2.5">
              {group.map((line) => {
                const mp = db.manufacturerProducts.find((m) => m.id === line.manufacturerProductId)
                const product = mp ? db.products.find((p) => p.id === mp.productId) : undefined
                const valid = bestPrice(db, line.manufacturerProductId, { qty: line.qty })
                return (
                  <li key={line.id} className="flex flex-wrap items-end gap-3">
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm text-ink-800">
                        {product?.genericName ?? 'Product'}
                        <span className="ml-1.5 font-mono text-2xs text-ink-500">
                          {mp?.grade} {mp?.pharmacopoeia}
                        </span>
                      </span>
                      <span className="block text-xs text-ink-500">
                        {fmtQty(line.qty, line.qtyUom)}
                        {line.targetPrice != null
                          ? ` · client named ${fmtMoney(line.targetPrice, currency, { decimals: 0 })}/${line.qtyUom}`
                          : ''}
                        {valid ? '' : ' · no currently valid price, enter the agreed figure'}
                      </span>
                    </span>
                    <span className="w-40">
                      <FormRow label={`Agreed price (${currency})`} htmlFor={`price-${line.id}`}>
                        <NumberInput
                          id={`price-${line.id}`}
                          value={prices[line.id] ?? null}
                          onChange={(v) => setPrices((prev) => ({ ...prev, [line.id]: v }))}
                          min={0}
                          step="any"
                          suffix={`/${line.qtyUom}`}
                          invalid={prices[line.id] == null || (prices[line.id] ?? 0) <= 0}
                        />
                      </FormRow>
                    </span>
                  </li>
                )
              })}
            </ul>
          </div>
        ))}

        {groups.length > 0 ? (
          <FormRow
            label="Manufacturer's proforma invoice reference"
            hint="Recorded on every indent raised now. It can be added later if the manufacturer has not sent it."
          >
            <Input value={proforma} onChange={(e) => setProforma(e.target.value)} mono placeholder="PI-1042/2026" />
          </FormRow>
        ) : null}

        {Object.values(prices).some((p) => p == null || p <= 0) && groups.length > 0 ? (
          <InlineWarning>
            <span>Every line needs an agreed price. A line with no price is refused on save.</span>
          </InlineWarning>
        ) : null}

        {error ? <InlineError>{error}</InlineError> : null}

        <div className="flex items-center justify-end gap-2 pt-1">
          <DialogFooterActions
            onCancel={() => onOpenChange(false)}
            confirmLabel={groups.length > 1 ? `Raise ${groups.length} indents` : 'Raise the indent'}
            loading={busy}
            disabled={groups.length === 0}
          />
        </div>
      </form>
    </Dialog>
  )
}
