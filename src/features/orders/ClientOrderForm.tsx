/**
 * Record a client order (UC-09 steps 1 to 5, UF-03, AC-09).
 *
 * The point of this screen is the approved-source gate. Each line names a
 * manufacturer-product as its source, and that source must be at Approved or
 * Commercial for this client. Anything else is blocked, the engagement's
 * current stage is given as the reason, and the line is only accepted once an
 * override reason is recorded. The line is then marked and the order flagged.
 *
 * Two lines for the same molecule from different manufacturers are accepted
 * without complaint: that is how split sourcing is recorded.
 *
 * No TCL selling price appears anywhere. The only money on a line is the
 * target price the client named, held for reference.
 */

import * as React from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { ArrowLeft, Plus, Split, Trash2, TriangleAlert } from 'lucide-react'
import { useDb, usePresenter } from '@/data/store'
import { bestPrice, clients as clientList, engagementFor, latestPrice, sourceRows } from '@/data/selectors'
import { checkSourceApproved } from '@/data/rules'
import { INCOTERMS, PAYMENT_TERMS, STAGE_LABEL, UOMS, convertQty } from '@/data/reference'
import { createClientOrder } from '@/data/api'
import { runAction } from '@/lib/hooks'
import { fmtDate, fmtMoney, fmtQty, todayIso } from '@/lib/utils'
import type { SelectOption } from '@/components/ui'
import {
  Badge,
  Button,
  Checkbox,
  Combobox,
  DateInput,
  Dialog,
  FormGrid,
  FormRow,
  InlineError,
  InlineWarning,
  Input,
  LinkButton,
  NumberInput,
  Panel,
  PanelHeader,
  PageHeading,
  RuleHint,
  Select,
  Textarea,
  Tooltip,
} from '@/components/ui'
import { IndentingNote } from './shared'

interface DraftLine {
  key: string
  mpId: string
  qty: number | null
  qtyUom: string
  requiredDeliveryDate: string
  targetPrice: number | null
  overrideReason: string
  moqAccepted: boolean
}

let lineSeq = 0
const newLine = (): DraftLine => ({
  key: `line-${++lineSeq}`,
  mpId: '',
  qty: null,
  qtyUom: 'KG',
  requiredDeliveryDate: '',
  targetPrice: null,
  overrideReason: '',
  moqAccepted: false,
})

export function ClientOrderForm() {
  const db = useDb()
  const navigate = useNavigate()
  const [params] = useSearchParams()
  const presenter = usePresenter()

  const [clientId, setClientId] = React.useState(params.get('client') ?? '')
  const [orderDate, setOrderDate] = React.useState(todayIso())
  const [currency, setCurrency] = React.useState('USD')
  const [incoterm, setIncoterm] = React.useState('CIF')
  const [paymentTermCode, setPaymentTermCode] = React.useState('')
  const [deliverySiteId, setDeliverySiteId] = React.useState('')
  const [clientReference, setClientReference] = React.useState('')
  const [remarks, setRemarks] = React.useState('')
  const [lines, setLines] = React.useState<DraftLine[]>([newLine()])
  const [saving, setSaving] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)
  const [saved, setSaved] = React.useState<{ id: string; coNumber: string } | null>(null)

  const client = db.companies.find((c) => c.id === clientId)

  /** UC-09 step 2: the client record supplies the terms, so they are typed once. */
  React.useEffect(() => {
    if (!client?.client) return
    const previous = db.clientOrders
      .filter((o) => o.clientCompanyId === client.id)
      .sort((a, b) => (a.orderDate < b.orderDate ? 1 : -1))[0]
    setCurrency(client.client.creditCurrency ?? previous?.currency ?? 'USD')
    setPaymentTermCode(client.client.paymentTermCode ?? previous?.paymentTermCode ?? '')
    setIncoterm(previous?.incoterm ?? 'CIF')
    const sites = db.sites.filter((s) => s.companyId === client.id && s.isDeliveryDestination && s.isActive)
    const primary = sites.find((s) => s.isPrimary) ?? sites[0]
    setDeliverySiteId(primary?.id ?? '')
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clientId])

  const siteOptions: SelectOption[] = React.useMemo(
    () =>
      db.sites
        .filter((s) => s.companyId === clientId && s.isDeliveryDestination && s.isActive)
        .map((s) => ({
          value: s.id,
          label: s.name,
          description: [s.city, s.countryCode].filter(Boolean).join(', '),
        })),
    [db.sites, clientId],
  )

  /**
   * Every source TCL represents, with this client's engagement stage against
   * it. Approved and Commercial sources come first; the rest stay in the list
   * but are plainly marked, because ordering one needs a recorded reason.
   */
  const sourceOptions: SelectOption[] = React.useMemo(() => {
    if (!clientId) return []
    const rows = sourceRows(db).filter((r) => r.inPortfolio)
    return rows
      .map((r) => {
        const eng = engagementFor(db, clientId, r.mp.id)
        const gate = checkSourceApproved(eng)
        const rank = gate.allowed ? 0 : eng ? 1 : 2
        return {
          rank,
          stage: eng ? STAGE_LABEL[eng.stage] : null,
          option: {
            value: r.mp.id,
            label: `${r.product.genericName} · ${r.manufacturer.displayName}`,
            description: gate.allowed
              ? `${eng ? STAGE_LABEL[eng.stage] : ''} · ${r.mp.grade} ${r.mp.pharmacopoeia}`
              : eng
                ? `Not approved: at ${STAGE_LABEL[eng.stage]} for this client · ${r.mp.grade} ${r.mp.pharmacopoeia}`
                : `Not approved: no engagement with this client · ${r.mp.grade} ${r.mp.pharmacopoeia}`,
          } satisfies SelectOption,
        }
      })
      .sort((a, b) => a.rank - b.rank || a.option.label.localeCompare(b.option.label))
      .map((x) => x.option)
  }, [db, clientId])

  // --------------------------------------------------------- line checks

  const evaluated = lines.map((line) => {
    const mp = line.mpId ? db.manufacturerProducts.find((m) => m.id === line.mpId) : undefined
    const product = mp ? db.products.find((p) => p.id === mp.productId) : undefined
    const manufacturer = mp ? db.companies.find((c) => c.id === mp.manufacturerCompanyId) : undefined
    const eng = mp && clientId ? engagementFor(db, clientId, mp.id) : undefined
    const gate = mp ? checkSourceApproved(eng) : null
    const needsOverride = Boolean(gate && !gate.allowed)
    const overrideGiven = line.overrideReason.trim().length > 0

    // MOQ warning (UC-09 3c): a warning, not a refusal, confirmed explicitly.
    let belowMoq: string | null = null
    if (mp?.moqQty && line.qty != null && line.qty > 0) {
      try {
        const inMoqUom = convertQty(line.qty, line.qtyUom, mp.moqUom ?? line.qtyUom)
        if (inMoqUom < mp.moqQty) {
          belowMoq = `${manufacturer?.displayName ?? 'This manufacturer'} has a minimum order quantity of ${fmtQty(
            mp.moqQty,
            mp.moqUom,
          )}. This line is below it, so the manufacturer may decline or reprice.`
        }
      } catch {
        belowMoq = `The minimum order quantity is recorded in ${mp.moqUom}, which does not convert to ${line.qtyUom}. Check it with the manufacturer.`
      }
    }

    const price = mp && line.qty ? bestPrice(db, mp.id, { qty: line.qty }) : mp ? bestPrice(db, mp.id) : null
    const stale = mp && !price ? latestPrice(db, mp.id) : null

    const complete = Boolean(mp) && line.qty != null && line.qty > 0
    const blocked = needsOverride && !overrideGiven
    const moqBlocked = Boolean(belowMoq) && !line.moqAccepted

    return {
      line,
      mp,
      product,
      manufacturer,
      eng,
      gate,
      needsOverride,
      blocked,
      belowMoq,
      moqBlocked,
      price,
      stale,
      complete,
    }
  })

  // Split sourcing: the same molecule from more than one source on one order.
  const productCounts = new Map<string, number>()
  for (const row of evaluated) {
    if (!row.product) continue
    productCounts.set(row.product.id, (productCounts.get(row.product.id) ?? 0) + 1)
  }
  const splitProducts = [...productCounts.entries()].filter(([, n]) => n > 1).map(([id]) => id)

  const anyOverride = evaluated.some((r) => r.needsOverride && r.line.overrideReason.trim())
  const canSave =
    Boolean(clientId) &&
    evaluated.length > 0 &&
    evaluated.every((r) => r.complete && !r.blocked && !r.moqBlocked)

  const patch = (key: string, change: Partial<DraftLine>) =>
    setLines((prev) => prev.map((l) => (l.key === key ? { ...l, ...change } : l)))

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    if (!canSave) return
    setSaving(true)
    const result = await runAction(
      () =>
        createClientOrder(
          {
            clientCompanyId: clientId,
            deliverySiteId: deliverySiteId || null,
            orderDate,
            currency,
            incoterm: incoterm || null,
            paymentTermCode: paymentTermCode || null,
            clientReference: clientReference.trim() || null,
            cancelledReason: null,
            remarks: remarks.trim() || null,
          },
          evaluated.map((r) => ({
            manufacturerProductId: r.line.mpId,
            qty: r.line.qty!,
            qtyUom: r.line.qtyUom,
            targetPrice: r.line.targetPrice,
            requiredDeliveryDate: r.line.requiredDeliveryDate || null,
            overrideReason: r.line.overrideReason.trim() || null,
          })),
        ),
      {
        success: (order) => `${order.coNumber} recorded for ${client?.displayName ?? 'the client'}.`,
        onError: setError,
      },
    )
    setSaving(false)
    if (result) setSaved({ id: result.id, coNumber: result.coNumber })
  }

  /** Leaves for the saved order, opening the raise-indent step when asked. */
  const leave = (raiseNow: boolean) => {
    if (!saved) return
    const target = `/client-orders/${saved.id}${raiseNow ? '?raise=1' : ''}`
    setSaved(null)
    navigate(target)
  }

  return (
    <div className="mx-auto max-w-4xl space-y-4">
      <PageHeading
        title="Record a client order"
        subtitle="What the client wants, and the source for each line. The indents on each manufacturer follow from this order."
        actions={
          <LinkButton to="/client-orders" variant="ghost" size="md" icon={<ArrowLeft className="h-3.5 w-3.5" />}>
            Cancel
          </LinkButton>
        }
      />

      <form onSubmit={submit} className="space-y-4">
        <Panel>
          <PanelHeader
            title="The client and the terms"
            subtitle="Currency, incoterm, payment terms and delivery site default from the client record"
          />
          <div className="space-y-4 p-4">
            <FormGrid>
              <FormRow label="Client" required hint="Only sites and sources of this client are offered below.">
                <Combobox
                  value={clientId}
                  onChange={(v) => {
                    setClientId(v)
                    setLines([newLine()])
                  }}
                  options={clientList(db)
                    .filter((c) => c.isActive)
                    .map((c) => ({
                      value: c.id,
                      label: c.displayName,
                      description: `${c.countryCode}${c.client?.status ? ` · ${c.client.status.toLowerCase()}` : ''}`,
                    }))}
                  placeholder="Search for the client…"
                />
              </FormRow>
              <FormRow label="Order date" required>
                <DateInput value={orderDate} onChange={(e) => setOrderDate(e.target.value)} />
              </FormRow>
            </FormGrid>

            <FormGrid cols={3}>
              <FormRow label="Currency" required>
                <Select
                  value={currency}
                  onChange={setCurrency}
                  options={['USD', 'EUR', 'BDT', 'INR', 'CNY'].map((c) => ({ value: c, label: c }))}
                  disabled={!clientId}
                />
              </FormRow>
              <FormRow label="Incoterm">
                <Select
                  value={incoterm}
                  onChange={setIncoterm}
                  options={INCOTERMS.map((i) => ({ value: i, label: i }))}
                  disabled={!clientId}
                />
              </FormRow>
              <FormRow label="Payment terms">
                <Select
                  value={paymentTermCode}
                  onChange={setPaymentTermCode}
                  allowEmpty
                  emptyLabel="Not stated"
                  placeholder="Not stated"
                  options={PAYMENT_TERMS.map((p) => ({ value: p.code, label: p.label }))}
                  disabled={!clientId}
                />
              </FormRow>
            </FormGrid>

            <FormGrid>
              <FormRow
                label="Delivery site"
                hint={
                  clientId && siteOptions.length === 0
                    ? 'This client has no site marked as a delivery destination. Add one on the client record.'
                    : 'Only this client’s own delivery sites are listed. A delivery to another company is refused.'
                }
              >
                <Select
                  value={deliverySiteId}
                  onChange={setDeliverySiteId}
                  allowEmpty
                  emptyLabel="Decide later"
                  placeholder="Decide later"
                  options={siteOptions}
                  disabled={!clientId || siteOptions.length === 0}
                />
              </FormRow>
              <FormRow label="Client's own order reference" hint="The client's purchase reference, as they wrote it.">
                <Input
                  value={clientReference}
                  onChange={(e) => setClientReference(e.target.value)}
                  mono
                  placeholder="SQR/PO/4821"
                  disabled={!clientId}
                />
              </FormRow>
            </FormGrid>
          </div>
        </Panel>

        <Panel>
          <PanelHeader
            title="Order lines"
            subtitle="One line per source. The same molecule may appear more than once."
            actions={
              <Button
                type="button"
                variant="secondary"
                size="sm"
                icon={<Plus className="h-3.5 w-3.5" />}
                disabled={!clientId}
                onClick={() => setLines((prev) => [...prev, newLine()])}
              >
                Add a line
              </Button>
            }
          />
          <div className="space-y-3 p-4">
            <IndentingNote>
              Split sourcing is recorded as two lines: 500 kg of one molecule split 300 kg from one manufacturer and
              200 kg from another is two lines for the same product with different sources, and it raises two indents.
            </IndentingNote>

            {!clientId ? (
              <p className="rounded border border-dashed border-paper-400 bg-paper-50/60 px-3 py-6 text-center text-xs text-ink-500">
                Choose the client first, then its approved sources can be offered.
              </p>
            ) : null}

            {clientId
              ? evaluated.map((row, index) => {
                  const line = row.line
                  const isSplit = row.product ? splitProducts.includes(row.product.id) : false
                  return (
                    <div
                      key={line.key}
                      className="space-y-3 rounded-md border border-paper-300 bg-paper-50/40 p-3"
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="flex items-center gap-2 text-xs font-semibold text-ink-700">
                          Line {index + 1}
                          {isSplit ? (
                            <Tooltip content="This molecule is taken from more than one manufacturer on this order. Normal, and regulator-encouraged.">
                              <Badge tone="accent">
                                <Split className="h-3 w-3" />
                                Split sourced
                              </Badge>
                            </Tooltip>
                          ) : null}
                          {row.needsOverride && line.overrideReason.trim() ? (
                            <Badge tone="warn">Override recorded</Badge>
                          ) : null}
                        </span>
                        {lines.length > 1 ? (
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            icon={<Trash2 className="h-3.5 w-3.5" />}
                            onClick={() => setLines((prev) => prev.filter((l) => l.key !== line.key))}
                          >
                            Remove
                          </Button>
                        ) : null}
                      </div>

                      <FormRow
                        label="Source"
                        required
                        hint="The molecule and the manufacturer together. Sources not approved for this client are listed but marked."
                      >
                        <Combobox
                          value={line.mpId}
                          onChange={(v) => patch(line.key, { mpId: v, overrideReason: '', moqAccepted: false })}
                          options={sourceOptions}
                          placeholder="Search by molecule or manufacturer…"
                          emptyMessage="No represented source matches that. TCL can only order from a source it represents."
                          invalid={row.blocked}
                        />
                      </FormRow>

                      {row.gate && !row.gate.allowed ? (
                        <div className="space-y-2">
                          <InlineError>
                            <span>
                              <span className="font-semibold">Line blocked.</span>{' '}
                              {row.eng
                                ? `${row.product?.genericName ?? 'This source'} from ${row.manufacturer?.displayName ?? 'this manufacturer'} is at ${STAGE_LABEL[row.eng.stage]} for ${client?.displayName ?? 'this client'}, not Approved or Commercial.`
                                : `There is no engagement between ${client?.displayName ?? 'this client'} and this source.`}{' '}
                              Record a reason to order it anyway, or choose an approved source.
                            </span>
                          </InlineError>
                          <FormRow
                            label="Override reason"
                            required
                            hint="Written to the audit log with your user id, kept on the line, and flagged on the order."
                          >
                            <Textarea
                              value={line.overrideReason}
                              onChange={(e) => patch(line.key, { overrideReason: e.target.value })}
                              rows={2}
                              invalid={row.blocked}
                              placeholder="Client QA has accepted this source in writing ahead of the formal approval letter."
                            />
                          </FormRow>
                        </div>
                      ) : null}

                      <FormGrid cols={3}>
                        <FormRow label="Quantity" required>
                          <NumberInput
                            value={line.qty}
                            onChange={(v) => patch(line.key, { qty: v, moqAccepted: false })}
                            min={0}
                            step="any"
                            placeholder="300"
                          />
                        </FormRow>
                        <FormRow label="Unit" required>
                          <Select
                            value={line.qtyUom}
                            onChange={(v) => patch(line.key, { qtyUom: v, moqAccepted: false })}
                            options={UOMS.map((u) => ({ value: u, label: u }))}
                          />
                        </FormRow>
                        <FormRow label="Required delivery date">
                          <DateInput
                            value={line.requiredDeliveryDate}
                            onChange={(e) => patch(line.key, { requiredDeliveryDate: e.target.value })}
                          />
                        </FormRow>
                      </FormGrid>

                      <FormGrid>
                        <FormRow
                          label={`Target price the client named (${currency})`}
                          hint="Reference only. TCL does not sell the material, so there is no TCL price on this line."
                        >
                          <NumberInput
                            value={line.targetPrice}
                            onChange={(v) => patch(line.key, { targetPrice: v })}
                            min={0}
                            step="any"
                            suffix={`/${line.qtyUom}`}
                          />
                        </FormRow>
                        <div className="min-w-0 space-y-1">
                          <p className="text-xs font-medium text-ink-700">Currently valid price</p>
                          {row.price ? (
                            <p className="text-sm text-ink-800">
                              <span className="font-medium tabular">
                                {fmtMoney(row.price.price, row.price.currency)}
                              </span>
                              <span className="text-2xs text-ink-500">
                                /{row.price.perUom} {row.price.incoterm}
                              </span>
                              <span className="ml-1.5 text-2xs text-ink-400">
                                valid to {fmtDate(row.price.validTo)}
                              </span>
                            </p>
                          ) : row.stale ? (
                            <p className="text-xs text-warn-600">
                              The last recorded price expired on {fmtDate(row.stale.validTo)}. The agreed price is
                              entered when the indent is raised.
                            </p>
                          ) : (
                            <p className="text-xs text-ink-400">
                              No price recorded for this source. It is entered when the indent is raised.
                            </p>
                          )}
                        </div>
                      </FormGrid>

                      {row.belowMoq ? (
                        <div className="space-y-2">
                          <InlineWarning>
                            <span className="flex items-start gap-1.5">
                              <TriangleAlert className="mt-px h-3.5 w-3.5 shrink-0" />
                              {row.belowMoq}
                            </span>
                          </InlineWarning>
                          <Checkbox
                            checked={line.moqAccepted}
                            onChange={(v) => patch(line.key, { moqAccepted: v })}
                            label="The client has confirmed this quantity, proceed below the minimum"
                          />
                        </div>
                      ) : null}
                    </div>
                  )
                })
              : null}

            <FormRow label="Remarks on the order">
              <Textarea
                value={remarks}
                onChange={(e) => setRemarks(e.target.value)}
                rows={2}
                disabled={!clientId}
                placeholder="Anything the commercial team should know when the indents are raised."
              />
            </FormRow>
          </div>
        </Panel>

        {presenter.showRuleHints ? (
          <RuleHint>
            A line whose source is not at Approved or Commercial for this client is refused until an override reason is
            typed. Every Full Access user may override, so the control is the record, not the permission: the reason,
            the user and the time are written to the audit log, the line keeps the reason, and the order carries an
            override flag that the list filters on.
          </RuleHint>
        ) : null}

        {anyOverride ? (
          <InlineWarning>
            <span>
              This order will be saved with an override. It shows as such on the client order list and on the order
              itself.
            </span>
          </InlineWarning>
        ) : null}

        {error ? <InlineError>{error}</InlineError> : null}

        <div className="flex items-center justify-between gap-3 pb-6">
          <p className="text-xs text-ink-400">
            The order number is allocated on save and cannot be reused.
          </p>
          <div className="flex items-center gap-2">
            <Button variant="ghost" size="md" type="button" onClick={() => navigate('/client-orders')}>
              Cancel
            </Button>
            <Button variant="primary" size="md" type="submit" loading={saving} disabled={!canSave}>
              Save the client order
            </Button>
          </div>
        </div>
      </form>

      {/* UC-09 step 6 follows straight on, so it is offered rather than hidden in a menu. */}
      <Dialog
        open={Boolean(saved)}
        onOpenChange={(open) => {
          if (!open && saved) leave(false)
        }}
        width="sm"
        title={`${saved?.coNumber ?? 'The order'} is recorded`}
        description="The indents on each manufacturer can be raised now, or later from the order."
      >
        <div className="space-y-3">
          <p className="text-sm leading-relaxed text-ink-700">
            Raising the indents groups these lines by manufacturer and proposes one indent per manufacturer, each
            naming {client?.displayName ?? 'this client'}. You enter the price agreed between the client and that
            manufacturer on each line.
          </p>
          <div className="flex items-center justify-end gap-2">
            <Button variant="ghost" size="sm" onClick={() => leave(false)}>
              Not yet
            </Button>
            <Button variant="primary" size="sm" onClick={() => leave(true)}>
              Raise the indents
            </Button>
          </div>
        </div>
      </Dialog>
    </div>
  )
}
