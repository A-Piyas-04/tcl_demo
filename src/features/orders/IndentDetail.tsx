/**
 * One indent: the order TCL placed on a manufacturer for one named client
 * (UC-09 steps 7 to 10, AC-09, UF-03).
 *
 * Three things live here and nowhere else. The agreed unit price per line,
 * which is what the client pays the manufacturer. The letter of credit, opened
 * by the client in the manufacturer's favour, which TCL records and chases
 * without being a party to it. And the commission, which is TCL's only
 * revenue, payable by the client.
 */

import * as React from 'react'
import { Link, useParams } from 'react-router-dom'
import {
  Banknote,
  Coins,
  Landmark,
  Pencil,
  Plus,
  Ship,
} from 'lucide-react'
import { useDb, usePresenter } from '@/data/store'
import { indentValue, ordersForIndent, userName } from '@/data/selectors'
import {
  BANKS,
  COMMISSION_BASIS_LABEL,
  FORWARDERS,
  INCOTERMS,
  PORTS,
  SHIPMENT_MODE_LABEL,
  paymentTermLabel,
} from '@/data/reference'
import { createShipment, updateIndent } from '@/data/api'
import { runAction, useAsyncData } from '@/lib/hooks'
import { fmtDate, fmtMoney, fmtQty, pluralise, todayIso } from '@/lib/utils'
import type { Commission, Indent, ShipmentMode } from '@/data/types'
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
import { CommissionActionButtons } from './CommissionActions'
import {
  ActivityPanel,
  CommissionStatusBadge,
  DocumentsPanel,
  IndentingNote,
  LcBadge,
  OrderStatusBadge,
  ShipmentStatusBadge,
  StatCell,
  lcState,
} from './shared'

export function IndentDetail() {
  const { id = '' } = useParams()
  const db = useDb()
  const presenter = usePresenter()
  const [lcOpen, setLcOpen] = React.useState(false)
  const [shipmentOpen, setShipmentOpen] = React.useState(false)

  const indent = db.indents.find((i) => i.id === id)

  const { data, loading } = useAsyncData(
    () => ({
      lines: db.indentLines.filter((l) => l.indentId === id).sort((a, b) => a.lineNo - b.lineNo),
      shipments: db.shipments.filter((s) => s.indentId === id),
      commission: db.commissions.find((c) => c.indentId === id),
      orderIds: ordersForIndent(db, id),
      value: indentValue(db, id),
    }),
    [id],
  )

  if (!indent) return <NotFound />

  const manufacturer = db.companies.find((c) => c.id === indent.manufacturerCompanyId)
  const client = db.companies.find((c) => c.id === indent.clientCompanyId)
  const lines = data?.lines ?? []
  const shipments = data?.shipments ?? []
  const commission = data?.commission
  const value = data?.value ?? 0
  const lc = lcState(indent)

  return (
    <div className="space-y-4">
      <PageHeading
        title={<span className="font-mono tabular">{indent.indentNumber}</span>}
        subtitle={
          <>
            Placed on{' '}
            <Link to={`/manufacturers/${indent.manufacturerCompanyId}`} className="font-medium text-ink-700 hover:text-accent-700">
              {manufacturer?.displayName ?? 'the manufacturer'}
            </Link>{' '}
            for{' '}
            <Link to={`/clients/${indent.clientCompanyId}`} className="font-medium text-ink-700 hover:text-accent-700">
              {client?.displayName ?? 'the client'}
            </Link>
            , on {fmtDate(indent.orderDate)} by {userName(db, indent.createdByUserId)}
            {(data?.orderIds.length ?? 0) > 0 ? (
              <>
                , against client order{' '}
                {data!.orderIds.map((oid, i) => (
                  <span key={oid}>
                    {i > 0 ? ', ' : ''}
                    <Link to={`/client-orders/${oid}`} className="font-mono font-medium text-ink-700 hover:text-accent-700">
                      {db.clientOrders.find((o) => o.id === oid)?.coNumber ?? 'order'}
                    </Link>
                  </span>
                ))}
              </>
            ) : null}
            . An indent is the order TCL places on the manufacturer for the client; the client pays the manufacturer.
          </>
        }
        meta={
          <>
            <OrderStatusBadge status={indent.status} />
            <LcBadge indent={indent} />
            {commission ? <CommissionStatusBadge status={commission.status} /> : null}
            {indent.incoterm ? <Badge tone="neutral">{indent.incoterm}</Badge> : null}
            {indent.paymentTermCode ? (
              <Badge tone="neutral">{paymentTermLabel(indent.paymentTermCode)}</Badge>
            ) : null}
            {indent.proformaInvoiceRef ? (
              <Badge tone="outline">
                <span className="font-mono">PI {indent.proformaInvoiceRef}</span>
              </Badge>
            ) : null}
          </>
        }
        actions={
          <WriteButton variant="primary" size="md" icon={<Plus className="h-3.5 w-3.5" />} onClick={() => setShipmentOpen(true)}>
            Add shipment
          </WriteButton>
        }
      />

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <StatCell
          label="Indent value"
          value={fmtMoney(value, indent.currency, { decimals: 0 })}
          hint="Agreed between client and manufacturer"
        />
        <StatCell label="Lines" value={lines.length} hint={`${pluralise(shipments.length, 'shipment')} so far`} />
        <StatCell
          label="TCL commission"
          value={commission?.amount != null ? fmtMoney(commission.amount, commission.currency, { decimals: 0 }) : 'To be decided'}
          tone="accent"
          hint={commission ? `Payable by ${client?.displayName ?? 'the client'}` : 'No commission record'}
        />
        <StatCell
          label="Letter of credit"
          value={lc.state === 'none' ? 'Not opened' : lc.state === 'expired' ? 'Expired' : lc.daysToExpiry != null ? `${lc.daysToExpiry}d left` : 'On file'}
          tone={lc.state === 'expired' ? 'danger' : lc.state === 'expiring' ? 'warn' : lc.state === 'none' ? 'ink' : 'ok'}
          hint={indent.lcBank ?? 'Issuing bank not recorded'}
        />
      </div>

      {/* --------------------------------------------------------- lines */}
      <Panel>
        <PanelHeader
          title="Lines"
          subtitle="The agreed unit price is what the client pays the manufacturer, not a TCL price"
          actions={<Badge tone="neutral">{pluralise(lines.length, 'line')}</Badge>}
        />
        {loading ? (
          <SkeletonTable rows={3} cols={6} />
        ) : lines.length === 0 ? (
          <div className="p-4">
            <EmptyState
              title="This indent has no lines"
              description="An indent with no line cannot be shipped against. Raise it again from the client order."
              compact
            />
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-paper-300 bg-paper-100/70">
                  <th className="th w-10">#</th>
                  <th className="th">Product</th>
                  <th className="th">Grade and standard</th>
                  <th className="th text-right">Quantity</th>
                  <th className="th text-right">Agreed unit price</th>
                  <th className="th text-right">Line value</th>
                  <th className="th">Serves client-order line</th>
                </tr>
              </thead>
              <tbody>
                {lines.map((line) => {
                  const mp = db.manufacturerProducts.find((m) => m.id === line.manufacturerProductId)
                  const product = mp ? db.products.find((p) => p.id === mp.productId) : undefined
                  const link = db.orderIndentLinks.find((l) => l.indentLineId === line.id)
                  const orderLine = link ? db.clientOrderLines.find((l) => l.id === link.clientOrderLineId) : undefined
                  const order = orderLine ? db.clientOrders.find((o) => o.id === orderLine.clientOrderId) : undefined
                  return (
                    <tr key={line.id} className="border-b border-paper-200 last:border-0 hover:bg-paper-100/60">
                      <td className="cell tabular text-ink-500">{line.lineNo}</td>
                      <td className="cell">
                        {product ? (
                          <Link to={`/products/${product.id}`} className="font-medium text-ink-900 hover:text-accent-700">
                            {product.genericName}
                          </Link>
                        ) : (
                          '—'
                        )}
                      </td>
                      <td className="cell">
                        <span className="text-ink-800">{mp?.grade ?? '—'}</span>
                        <span className="ml-1.5 font-mono text-2xs text-ink-500">{mp?.pharmacopoeia}</span>
                      </td>
                      <td className="cell text-right tabular">{fmtQty(line.qty, line.qtyUom)}</td>
                      <td className="cell text-right tabular">
                        {fmtMoney(line.unitPrice, indent.currency)}
                        <span className="text-2xs text-ink-400">/{line.priceUom}</span>
                      </td>
                      <td className="cell text-right font-medium tabular text-ink-900">
                        {fmtMoney(line.qty * line.unitPrice, indent.currency, { decimals: 0 })}
                      </td>
                      <td className="cell">
                        {order && orderLine ? (
                          <Link
                            to={`/client-orders/${order.id}`}
                            className="font-mono text-2xs text-accent-700 hover:underline"
                          >
                            {order.coNumber} line {orderLine.lineNo}
                          </Link>
                        ) : (
                          <Tooltip content="Nothing can be delivered from an indent line that is not linked to a client-order line.">
                            <Badge tone="warn">Not linked</Badge>
                          </Tooltip>
                        )}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
              <tfoot>
                <tr className="border-t border-paper-300 bg-paper-100/70">
                  <td className="cell" colSpan={5} />
                  <td className="cell text-right text-sm font-semibold tabular text-ink-900">
                    {fmtMoney(value, indent.currency, { decimals: 0 })}
                  </td>
                  <td className="cell" />
                </tr>
              </tfoot>
            </table>
          </div>
        )}
      </Panel>

      {/* ------------------------------------------- LC and commission */}
      <div className="grid gap-4 lg:grid-cols-2">
        <Panel>
          <PanelHeader
            title="Letter of credit"
            subtitle="Opened by the client in the manufacturer's favour"
            icon={<Landmark className="h-4 w-4" />}
            actions={
              <WriteButton size="sm" variant="secondary" icon={<Pencil className="h-3.5 w-3.5" />} onClick={() => setLcOpen(true)}>
                {indent.lcNumber ? 'Edit' : 'Record'}
              </WriteButton>
            }
          />
          <div className="space-y-3 p-4">
            {indent.lcNumber ? (
              <>
                <FieldGrid cols={2}>
                  <Field label="LC number" mono>
                    {indent.lcNumber}
                  </Field>
                  <Field label="LC date">{fmtDate(indent.lcDate)}</Field>
                  <Field label="Issuing bank">{indent.lcBank ?? '—'}</Field>
                  <Field label="Expiry">
                    <span
                      className={
                        lc.state === 'expired'
                          ? 'font-medium text-danger-700'
                          : lc.state === 'expiring'
                            ? 'font-medium text-warn-600'
                            : undefined
                      }
                    >
                      {fmtDate(indent.lcExpiryDate)}
                      {lc.daysToExpiry != null
                        ? lc.state === 'expired'
                          ? ' (expired)'
                          : ` (${lc.daysToExpiry} days)`
                        : ''}
                    </span>
                  </Field>
                </FieldGrid>
                {lc.state === 'expired' ? (
                  <InlineWarning>
                    <span>
                      This credit has expired. Nothing can be shipped against it until the client has it extended or
                      reissued.
                    </span>
                  </InlineWarning>
                ) : lc.state === 'expiring' ? (
                  <InlineWarning>
                    <span>
                      The credit expires within 45 days. Chase the client and the manufacturer on the shipping date.
                    </span>
                  </InlineWarning>
                ) : null}
              </>
            ) : (
              <EmptyState
                icon={<Landmark className="h-5 w-5" />}
                title="The client has not opened the credit yet"
                description="Until it is open the manufacturer has nothing to ship against. Record the number, date, issuing bank and expiry as soon as the client sends the copy."
                action={
                  <WriteButton size="sm" variant="primary" onClick={() => setLcOpen(true)}>
                    Record the letter of credit
                  </WriteButton>
                }
                compact
              />
            )}
            <IndentingNote>
              The credit is between the client's bank and the manufacturer. TCL is not a party to it: it records the
              terms and chases the dates, which is why the record sits on the indent and not on the client order.
            </IndentingNote>
          </div>
        </Panel>

        <CommissionPanel
          indent={indent}
          commission={commission}
          value={value}
          clientName={client?.displayName ?? 'the client'}
        />
      </div>

      {/* ----------------------------------------------------- shipments */}
      <Panel>
        <PanelHeader
          title="Shipments against this indent"
          subtitle="Customs clearance applies to the whole consignment, one bill of entry per shipment"
          actions={<Badge tone="neutral">{pluralise(shipments.length, 'shipment')}</Badge>}
        />
        {loading ? (
          <SkeletonTable rows={2} cols={5} />
        ) : shipments.length === 0 ? (
          <div className="p-4">
            <EmptyState
              icon={<Ship className="h-5 w-5" />}
              title="Nothing has shipped against this indent"
              description="Record the shipment when the manufacturer confirms dispatch: mode, bill of lading or airway bill, ports, ETD and ETA. Batches are added to it afterwards."
              action={
                <WriteButton variant="primary" size="sm" onClick={() => setShipmentOpen(true)}>
                  Add a shipment
                </WriteButton>
              }
            />
          </div>
        ) : (
          <ul className="divide-y divide-paper-200">
            {shipments.map((s) => {
              const batchCount = db.shipmentLines.filter((l) => l.shipmentId === s.id).length
              return (
                <li key={s.id}>
                  <Link
                    to={`/shipments/${s.id}`}
                    className="flex flex-wrap items-center gap-x-3 gap-y-1.5 px-4 py-3 transition-colors hover:bg-paper-100"
                  >
                    <span className="font-mono text-[0.8rem] tabular font-medium text-ink-900">{s.shipmentRef}</span>
                    <Badge tone="outline">{SHIPMENT_MODE_LABEL[s.mode]}</Badge>
                    <span className="min-w-0 flex-1 truncate text-xs text-ink-600">
                      {s.portOfLoading ?? '—'} to {s.portOfDischarge ?? '—'}
                      {s.blAwbNumber ? ` · ${s.blAwbNumber}` : ''}
                    </span>
                    <span className="text-2xs tabular text-ink-500">
                      ETD {fmtDate(s.etd)} · ETA {fmtDate(s.eta)}
                    </span>
                    <span className="text-2xs text-ink-500">{pluralise(batchCount, 'batch', 'batches')}</span>
                    <ShipmentStatusBadge status={s.status} />
                  </Link>
                </li>
              )
            })}
          </ul>
        )}
      </Panel>

      {presenter.showRuleHints ? (
        <RuleHint>
          An expiry earlier than the LC date is refused. A commission on a percentage basis needs a rate, a commission
          on any settled basis needs a figure before it can be invoiced, and a receipt larger than the amount due is
          refused.
        </RuleHint>
      ) : null}

      <div className="grid gap-4 lg:grid-cols-2">
        <DocumentsPanel
          entityType="INDENT"
          entityId={id}
          title="Documents"
          subtitle="Proforma invoice, indent document, the credit and the commission invoice"
          emptyHint="The manufacturer's proforma invoice and the copy of the letter of credit belong here."
        />
        <ActivityPanel entityType="INDENT" entityId={id} subtitle="Chasing the credit, the shipping date and the commission" />
      </div>

      <LcDialog open={lcOpen} onOpenChange={setLcOpen} indent={indent} />
      <AddShipmentDialog open={shipmentOpen} onOpenChange={setShipmentOpen} indent={indent} />
    </div>
  )
}

// ------------------------------------------------------------ commission

function CommissionPanel({
  indent,
  commission,
  value,
  clientName,
}: {
  indent: Indent
  commission: Commission | undefined
  value: number
  clientName: string
}) {
  if (!commission) {
    return (
      <Panel>
        <PanelHeader title="Commission" subtitle="TCL's earnings on this indent" icon={<Coins className="h-4 w-4" />} />
        <div className="p-4">
          <EmptyState
            icon={<Coins className="h-5 w-5" />}
            title="No commission record on this indent"
            description="One commission record is created with each indent. This indent predates that, or the record was removed."
            compact
          />
        </div>
      </Panel>
    )
  }

  const outstanding = (commission.amount ?? 0) - commission.receivedAmount

  return (
    <Panel>
      <PanelHeader
        title="Commission"
        subtitle={`TCL's earnings, payable by ${clientName}`}
        icon={<Coins className="h-4 w-4" />}
      />
      <div className="space-y-3 p-4">
        <CommissionActionButtons commission={commission} />
        <FieldGrid cols={2}>
          <Field label="Payable by">
            {commission.payableBy === 'CLIENT' ? clientName : 'the manufacturer'}
          </Field>
          <Field label="Basis">{COMMISSION_BASIS_LABEL[commission.basis]}</Field>
          <Field label="Rate">{commission.ratePct != null ? `${commission.ratePct}%` : '—'}</Field>
          <Field label="Base, the indent value">{fmtMoney(value, commission.currency, { decimals: 0 })}</Field>
          <Field label="Amount">
            {commission.amount != null ? (
              <span className="font-semibold text-ink-900">
                {fmtMoney(commission.amount, commission.currency)}
              </span>
            ) : (
              <span className="text-warn-600">Not yet agreed</span>
            )}
          </Field>
          <Field label="Status">
            <CommissionStatusBadge status={commission.status} />
          </Field>
          <Field label="Invoice reference" mono>
            {commission.invoiceReference ?? '—'}
          </Field>
          <Field label="Invoiced on">{fmtDate(commission.invoicedOn)}</Field>
          <Field label="Received">
            {fmtMoney(commission.receivedAmount, commission.currency)}
            {commission.receivedOn ? (
              <span className="ml-1.5 text-2xs text-ink-500">on {fmtDate(commission.receivedOn)}</span>
            ) : null}
          </Field>
          <Field label="Outstanding">
            <span className={outstanding > 0 ? 'font-medium text-warn-600' : 'text-ok-600'}>
              {commission.amount != null ? fmtMoney(outstanding, commission.currency) : '—'}
            </span>
          </Field>
        </FieldGrid>

        {commission.basis === 'TBD' ? (
          <IndentingNote>
            The basis is still being settled with the client. That is a business decision, not missing data, which is
            why "to be decided" exists: the indent proceeds and the figure is added when it is agreed. Nothing can be
            invoiced until there is one.
          </IndentingNote>
        ) : null}
        {commission.remarks ? (
          <p className="text-xs italic leading-relaxed text-ink-500">{commission.remarks}</p>
        ) : null}
        <p className="text-2xs text-ink-400">
          Commission is TCL's only revenue on {indent.indentNumber}. The goods are invoiced by the manufacturer to the
          client.
        </p>
      </div>
    </Panel>
  )
}

// --------------------------------------------------------- letter of credit

function LcDialog({
  open,
  onOpenChange,
  indent,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  indent: Indent
}) {
  const [lcNumber, setLcNumber] = React.useState(indent.lcNumber ?? '')
  const [lcDate, setLcDate] = React.useState(indent.lcDate ?? '')
  const [lcBank, setLcBank] = React.useState(indent.lcBank ?? '')
  const [lcExpiryDate, setLcExpiryDate] = React.useState(indent.lcExpiryDate ?? '')
  const [expectedShipDate, setExpectedShipDate] = React.useState(indent.expectedShipDate ?? '')
  const [proforma, setProforma] = React.useState(indent.proformaInvoiceRef ?? '')
  const [incoterm, setIncoterm] = React.useState(indent.incoterm ?? '')
  const [busy, setBusy] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)

  React.useEffect(() => {
    if (!open) return
    setLcNumber(indent.lcNumber ?? '')
    setLcDate(indent.lcDate ?? '')
    setLcBank(indent.lcBank ?? '')
    setLcExpiryDate(indent.lcExpiryDate ?? '')
    setExpectedShipDate(indent.expectedShipDate ?? '')
    setProforma(indent.proformaInvoiceRef ?? '')
    setIncoterm(indent.incoterm ?? '')
    setError(null)
  }, [open, indent])

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    setBusy(true)
    const ok = await runAction(
      () =>
        updateIndent(indent.id, {
          lcNumber: lcNumber.trim() || null,
          lcDate: lcDate || null,
          lcBank: lcBank || null,
          lcExpiryDate: lcExpiryDate || null,
          expectedShipDate: expectedShipDate || null,
          proformaInvoiceRef: proforma.trim() || null,
          incoterm: incoterm || null,
        }),
      { success: 'Indent updated.', onError: setError },
    )
    setBusy(false)
    if (ok !== null) onOpenChange(false)
  }

  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      icon={<Banknote className="h-5 w-5 text-accent-600" />}
      title="Letter of credit and terms"
      description="The credit is opened by the client in the manufacturer's favour. TCL records it and chases the dates."
    >
      <form onSubmit={submit} className="space-y-3.5">
        <FormGrid>
          <FormRow label="LC number">
            <Input value={lcNumber} onChange={(e) => setLcNumber(e.target.value)} mono placeholder="LC/2026/48213" />
          </FormRow>
          <FormRow label="Issuing bank" hint="The client's bank, which issues the credit.">
            <Select
              value={lcBank}
              onChange={setLcBank}
              allowEmpty
              emptyLabel="Not recorded"
              placeholder="Not recorded"
              options={BANKS.map((b) => ({ value: b, label: b }))}
            />
          </FormRow>
          <FormRow label="LC date">
            <DateInput value={lcDate} onChange={(e) => setLcDate(e.target.value)} />
          </FormRow>
          <FormRow label="Expiry" hint="An expiry before the LC date is refused.">
            <DateInput
              value={lcExpiryDate}
              onChange={(e) => setLcExpiryDate(e.target.value)}
              invalid={Boolean(lcDate && lcExpiryDate && lcExpiryDate < lcDate)}
            />
          </FormRow>
        </FormGrid>

        <FormGrid cols={3}>
          <FormRow label="Proforma invoice reference">
            <Input value={proforma} onChange={(e) => setProforma(e.target.value)} mono placeholder="PI-1042/2026" />
          </FormRow>
          <FormRow label="Incoterm">
            <Select
              value={incoterm}
              onChange={setIncoterm}
              allowEmpty
              emptyLabel="Not stated"
              placeholder="Not stated"
              options={INCOTERMS.map((i) => ({ value: i, label: i }))}
            />
          </FormRow>
          <FormRow label="Expected ship date">
            <DateInput value={expectedShipDate} onChange={(e) => setExpectedShipDate(e.target.value)} />
          </FormRow>
        </FormGrid>

        {lcDate && lcExpiryDate && lcExpiryDate < lcDate ? (
          <InlineWarning>
            <span>The expiry is earlier than the LC date. Correct one of the two before saving.</span>
          </InlineWarning>
        ) : null}

        {error ? <InlineError>{error}</InlineError> : null}

        <div className="flex items-center justify-end gap-2 pt-1">
          <DialogFooterActions onCancel={() => onOpenChange(false)} confirmLabel="Save" loading={busy} />
        </div>
      </form>
    </Dialog>
  )
}

// ------------------------------------------------------------- shipment

function AddShipmentDialog({
  open,
  onOpenChange,
  indent,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  indent: Indent
}) {
  const [mode, setMode] = React.useState<ShipmentMode>('SEA')
  const [blAwb, setBlAwb] = React.useState('')
  const [carrier, setCarrier] = React.useState('')
  const [forwarder, setForwarder] = React.useState('')
  const [loading, setLoading] = React.useState('')
  const [discharge, setDischarge] = React.useState('')
  const [etd, setEtd] = React.useState('')
  const [eta, setEta] = React.useState('')
  const [remarks, setRemarks] = React.useState('')
  const [busy, setBusy] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)

  React.useEffect(() => {
    if (!open) return
    setMode('SEA')
    setBlAwb('')
    setCarrier('')
    setForwarder('')
    setLoading('')
    setDischarge('')
    setEtd(todayIso())
    setEta('')
    setRemarks('')
    setError(null)
  }, [open])

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    setBusy(true)
    const ok = await runAction(
      () =>
        createShipment({
          indentId: indent.id,
          mode,
          status: 'PLANNED',
          blAwbNumber: blAwb.trim() || null,
          carrier: carrier.trim() || null,
          forwarderName: forwarder || null,
          cnfAgentName: null,
          portOfLoading: loading || null,
          portOfDischarge: discharge || null,
          etd: etd || null,
          eta: eta || null,
          actualArrivalDate: null,
          customsClearedOn: null,
          holdRemark: null,
          remarks: remarks.trim() || null,
        }),
      { success: (s) => `${s.shipmentRef} recorded. Add the batches it carries next.`, onError: setError },
    )
    setBusy(false)
    if (ok) onOpenChange(false)
  }

  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      width="lg"
      icon={<Ship className="h-5 w-5 text-accent-600" />}
      title="Add a shipment"
      description={`Against ${indent.indentNumber}. Batches are added to the shipment once it exists.`}
    >
      <form onSubmit={submit} className="space-y-3.5">
        <FormGrid cols={3}>
          <FormRow label="Mode" required>
            <Select
              value={mode}
              onChange={(v) => setMode(v as ShipmentMode)}
              options={(Object.keys(SHIPMENT_MODE_LABEL) as ShipmentMode[]).map((m) => ({
                value: m,
                label: SHIPMENT_MODE_LABEL[m],
              }))}
            />
          </FormRow>
          <FormRow label={mode === 'AIR' ? 'Airway bill number' : 'Bill of lading number'}>
            <Input value={blAwb} onChange={(e) => setBlAwb(e.target.value)} mono placeholder="MAEU418203" />
          </FormRow>
          <FormRow label="Carrier">
            <Input value={carrier} onChange={(e) => setCarrier(e.target.value)} placeholder="Maersk" />
          </FormRow>
        </FormGrid>

        <FormGrid cols={3}>
          <FormRow label="Port of loading">
            <Select
              value={loading}
              onChange={setLoading}
              allowEmpty
              emptyLabel="Not stated"
              placeholder="Not stated"
              options={PORTS.loading.map((p) => ({ value: p, label: p }))}
            />
          </FormRow>
          <FormRow label="Port of discharge">
            <Select
              value={discharge}
              onChange={setDischarge}
              allowEmpty
              emptyLabel="Not stated"
              placeholder="Not stated"
              options={PORTS.discharge.map((p) => ({ value: p, label: p }))}
            />
          </FormRow>
          <FormRow label="Forwarder">
            <Select
              value={forwarder}
              onChange={setForwarder}
              allowEmpty
              emptyLabel="Not appointed"
              placeholder="Not appointed"
              options={FORWARDERS.map((f) => ({ value: f, label: f }))}
            />
          </FormRow>
        </FormGrid>

        <FormGrid>
          <FormRow label="ETD">
            <DateInput value={etd} onChange={(e) => setEtd(e.target.value)} />
          </FormRow>
          <FormRow label="ETA" hint="An ETA before the ETD is refused.">
            <DateInput
              value={eta}
              onChange={(e) => setEta(e.target.value)}
              invalid={Boolean(etd && eta && eta < etd)}
            />
          </FormRow>
        </FormGrid>

        <FormRow label="Remarks">
          <Textarea value={remarks} onChange={(e) => setRemarks(e.target.value)} rows={2} />
        </FormRow>

        {error ? <InlineError>{error}</InlineError> : null}

        <div className="flex items-center justify-end gap-2 pt-1">
          <DialogFooterActions onCancel={() => onOpenChange(false)} confirmLabel="Record the shipment" loading={busy} />
        </div>
      </form>
    </Dialog>
  )
}
