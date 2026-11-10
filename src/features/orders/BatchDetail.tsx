/**
 * One manufacturing batch (UC-10 3b and 3c, AC-10).
 *
 * A batch belongs to the manufacturer, not to a shipment and not to a client.
 * It is recorded once per source and reused, so the same batch can travel on
 * several shipments, against several clients' indents, and be delivered to
 * several sites. That one-batch-two-clients case is laid out plainly here,
 * because it is where a spreadsheet double counts.
 */

import { Link, useParams } from 'react-router-dom'
import { differenceInMonths, parseISO } from 'date-fns'
import { FileText, Package, Truck } from 'lucide-react'
import { useDb } from '@/data/store'
import { siteName } from '@/data/selectors'
import { SHIPMENT_MODE_LABEL } from '@/data/reference'
import { useAsyncData } from '@/lib/hooks'
import { fmtDate, fmtQty, pluralise } from '@/lib/utils'
import {
  Badge,
  EmptyState,
  Field,
  FieldGrid,
  NoteTip,
  PageHeading,
  Panel,
  PanelHeader,
  SkeletonTable,
  Tooltip,
} from '@/components/ui'
import { NotFound } from '@/features/misc/Fallbacks'
import { DocumentsPanel, ShipmentStatusBadge, StatCell, sumQty } from './shared'

export function BatchDetail() {
  const { id = '' } = useParams()
  const db = useDb()

  const batch = db.batches.find((b) => b.id === id)

  const { data, loading } = useAsyncData(
    () => {
      const lines = db.shipmentLines.filter((l) => l.batchId === id)
      return {
        lines,
        deliveries: db.deliveries.filter((d) => lines.some((l) => l.id === d.shipmentLineId)),
      }
    },
    [id],
  )

  if (!batch) return <NotFound />

  const mp = db.manufacturerProducts.find((m) => m.id === batch.manufacturerProductId)
  const product = mp ? db.products.find((p) => p.id === mp.productId) : undefined
  const manufacturer = mp ? db.companies.find((c) => c.id === mp.manufacturerCompanyId) : undefined
  const lines = data?.lines ?? []
  const deliveries = data?.deliveries ?? []

  const shipped = sumQty(lines.map((l) => ({ qty: l.qty, uom: l.qtyUom })))
  const delivered = sumQty(deliveries.map((d) => ({ qty: d.deliveredQty, uom: d.qtyUom })))
  const monthsLeft = batch.expiryDate ? differenceInMonths(parseISO(batch.expiryDate), new Date()) : null

  // Which clients this one batch served, through which indents.
  const clientIds = new Set<string>()
  for (const line of lines) {
    const indent = db.indents.find((i) => i.id === line.indentId)
    if (indent) clientIds.add(indent.clientCompanyId)
  }

  const coa = db.documents.find(
    (d) => d.entityType === 'BATCH' && d.entityId === batch.id && d.typeCode === 'COA' && d.isActive,
  )

  return (
    <div className="space-y-4">
      <PageHeading
        title={<span className="font-mono tabular">{batch.batchNumber}</span>}
        subtitle={
          <>
            {product ? (
              <Link to={`/products/${product.id}`} className="font-medium text-ink-700 hover:text-accent-700">
                {product.genericName}
              </Link>
            ) : (
              'Product unknown'
            )}{' '}
            made by{' '}
            {manufacturer ? (
              <Link to={`/manufacturers/${manufacturer.id}`} className="font-medium text-ink-700 hover:text-accent-700">
                {manufacturer.displayName}
              </Link>
            ) : (
              'an unknown manufacturer'
            )}
            . The batch is recorded once and reused by every shipment that carries it.
          </>
        }
        meta={
          <>
            {monthsLeft == null ? (
              <Badge tone="neutral">No expiry recorded</Badge>
            ) : monthsLeft < 0 ? (
              <Badge tone="danger">Expired {fmtDate(batch.expiryDate)}</Badge>
            ) : monthsLeft < 12 ? (
              <Badge tone="warn">Expires in {monthsLeft} months</Badge>
            ) : (
              <Badge tone="ok">Valid to {fmtDate(batch.expiryDate)}</Badge>
            )}
            {mp ? (
              <Badge tone="outline">
                {mp.grade} <span className="font-mono">{mp.pharmacopoeia}</span>
              </Badge>
            ) : null}
            {clientIds.size > 1 ? (
              <Tooltip content="One manufacturer batch shipped against more than one client's indent. Each shipment line references the same batch record, so nothing is double counted.">
                <Badge tone="accent">Served {clientIds.size} clients</Badge>
              </Tooltip>
            ) : null}
          </>
        }
      />

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <StatCell label="Quantity shipped" value={fmtQty(shipped.qty, shipped.uom)} hint={pluralise(new Set(lines.map((l) => l.shipmentId)).size, 'shipment')} />
        <StatCell
          label="Delivered"
          value={fmtQty(delivered.qty, delivered.uom || shipped.uom)}
          tone={shipped.qty > 0 && delivered.qty >= shipped.qty ? 'ok' : 'ink'}
          hint={pluralise(deliveries.length, 'delivery', 'deliveries')}
        />
        <StatCell
          label="Shelf life left"
          value={monthsLeft == null ? '—' : monthsLeft < 0 ? 'Expired' : `${monthsLeft} mo`}
          tone={monthsLeft == null ? 'ink' : monthsLeft < 0 ? 'danger' : monthsLeft < 24 ? 'warn' : 'ok'}
          hint={batch.expiryDate ? `Expires ${fmtDate(batch.expiryDate)}` : 'Retest date governs this batch'}
        />
        <StatCell
          label="Clients served"
          value={clientIds.size || '—'}
          tone={clientIds.size > 1 ? 'accent' : 'ink'}
          hint={clientIds.size > 1 ? 'The same batch, split across indents' : 'One client'}
        />
      </div>

      <Panel>
        <PanelHeader title="The batch as the manufacturer recorded it" subtitle="These dates are entered once and reused on every shipment" />
        <div className="p-4">
          <FieldGrid cols={4}>
            <Field label="Batch number" mono>
              {batch.batchNumber}
            </Field>
            <Field label="Manufactured on">{fmtDate(batch.manufacturingDate)}</Field>
            <Field label="Expiry date">{fmtDate(batch.expiryDate)}</Field>
            <Field label="Retest date">{fmtDate(batch.retestDate)}</Field>
            <Field label="Source">
              {mp ? (
                <Link to={`/sources/${mp.id}`} className="text-accent-700 hover:underline">
                  {product?.genericName} from {manufacturer?.displayName}
                </Link>
              ) : (
                '—'
              )}
            </Field>
            <Field label="Grade and standard">
              {mp ? `${mp.grade} ${mp.pharmacopoeia}` : '—'}
            </Field>
            <Field label="Certificate of analysis">
              {coa ? (
                <span className="inline-flex items-center gap-1 text-accent-700">
                  <FileText className="h-3.5 w-3.5" />
                  on file
                </span>
              ) : (
                <span className="text-warn-600">not filed</span>
              )}
            </Field>
            <Field label="First recorded">{fmtDate(batch.createdAt)}</Field>
          </FieldGrid>
          <NoteTip className="mt-3" label="Batch numbering">
            The same batch number from a different manufacturer is a different batch and is kept separately.
          </NoteTip>
        </div>
      </Panel>

      {/* ---------------------------------------------- shipment lines */}
      <Panel>
        <PanelHeader
          title="Every shipment line carrying this batch"
          subtitle="One row per shipment and indent, so the quantity for each client is clear"
          actions={<Badge tone="neutral">{pluralise(lines.length, 'line')}</Badge>}
        />
        {loading ? (
          <SkeletonTable rows={3} cols={6} />
        ) : lines.length === 0 ? (
          <div className="p-4">
            <EmptyState
              icon={<Package className="h-5 w-5" />}
              title="This batch is not on any shipment"
              description="The batch record exists but nothing has shipped against it. Add it to a shipment from the indent."
              compact
            />
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-paper-300 bg-paper-100/70">
                  <th className="th">Shipment</th>
                  <th className="th">Indent</th>
                  <th className="th">For client</th>
                  <th className="th text-right">Quantity</th>
                  <th className="th">Status</th>
                  <th className="th">Short shelf life remark</th>
                </tr>
              </thead>
              <tbody>
                {lines.map((line) => {
                  const shipment = db.shipments.find((s) => s.id === line.shipmentId)
                  const indent = db.indents.find((i) => i.id === line.indentId)
                  const client = indent ? db.companies.find((c) => c.id === indent.clientCompanyId) : undefined
                  return (
                    <tr key={line.id} className="border-b border-paper-200 last:border-0 align-top hover:bg-paper-100/60">
                      <td className="cell">
                        {shipment ? (
                          <Link
                            to={`/shipments/${shipment.id}`}
                            className="font-mono text-[0.8rem] font-medium text-ink-900 hover:text-accent-700"
                          >
                            {shipment.shipmentRef}
                          </Link>
                        ) : (
                          '—'
                        )}
                        <span className="block text-2xs text-ink-500">
                          {shipment ? `${SHIPMENT_MODE_LABEL[shipment.mode]} · ETD ${fmtDate(shipment.etd)}` : ''}
                        </span>
                      </td>
                      <td className="cell">
                        {indent ? (
                          <Link to={`/indents/${indent.id}`} className="font-mono text-2xs text-accent-700 hover:underline">
                            {indent.indentNumber}
                          </Link>
                        ) : (
                          '—'
                        )}
                      </td>
                      <td className="cell">
                        {client ? (
                          <Link to={`/clients/${client.id}`} className="text-ink-800 hover:text-accent-700">
                            {client.displayName}
                          </Link>
                        ) : (
                          '—'
                        )}
                      </td>
                      <td className="cell text-right font-medium tabular">{fmtQty(line.qty, line.qtyUom)}</td>
                      <td className="cell">
                        {shipment ? <ShipmentStatusBadge status={shipment.status} /> : null}
                      </td>
                      <td className="cell text-xs italic text-warn-600">{line.shortShelfLifeRemark ?? ''}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </Panel>

      {/* ------------------------------------------------- deliveries */}
      <Panel>
        <PanelHeader
          title="Every delivery of this batch"
          subtitle="Where each quantity physically went, with the client's goods receipt note"
          actions={<Badge tone="neutral">{pluralise(deliveries.length, 'delivery', 'deliveries')}</Badge>}
        />
        {loading ? (
          <SkeletonTable rows={2} cols={4} />
        ) : deliveries.length === 0 ? (
          <div className="p-4">
            <EmptyState
              icon={<Truck className="h-5 w-5" />}
              title="Nothing from this batch has been delivered yet"
              description="A delivery is recorded from the shipment, once the consignment has cleared customs."
              compact
            />
          </div>
        ) : (
          <ul className="divide-y divide-paper-200">
            {deliveries.map((d) => {
              const orderLine = db.clientOrderLines.find((l) => l.id === d.clientOrderLineId)
              const order = orderLine ? db.clientOrders.find((o) => o.id === orderLine.clientOrderId) : undefined
              return (
                <li key={d.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 px-4 py-2.5">
                  <span className="text-sm font-medium tabular text-ink-900">{fmtQty(d.deliveredQty, d.qtyUom)}</span>
                  <span className="min-w-0 flex-1 truncate text-xs text-ink-600">
                    to {siteName(db, d.deliverySiteId)}
                    {order && orderLine ? (
                      <>
                        {' · against '}
                        <Link to={`/client-orders/${order.id}`} className="font-mono text-accent-700 hover:underline">
                          {order.coNumber}
                        </Link>
                        {` line ${orderLine.lineNo}`}
                      </>
                    ) : null}
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

      <DocumentsPanel
        entityType="BATCH"
        entityId={id}
        title="Documents on this batch"
        subtitle="The certificate of analysis travels with the batch, not with the shipment"
        emptyHint="The certificate of analysis belongs here. Every shipment carrying this batch then shows it as on file."
      />
    </div>
  )
}
