/**
 * Source detail: one product, at one grade and pharmacopoeia, from one plant of
 * one manufacturer. This is the real unit of sourcing, and module M4 hangs off
 * it: regulatory filings (FR-M4-04), portfolio membership (FR-M4-05) and the
 * price history that decides whether anything can be offered (FR-M4-06 to 08).
 *
 * Nothing here is overwritten. A price is superseded by end-dating the old row,
 * a filing is withdrawn rather than deleted, and leaving the portfolio closes
 * the current period instead of erasing it.
 */

import * as React from 'react'
import { Link, useParams } from 'react-router-dom'
import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip as ChartTooltip,
  XAxis,
  YAxis,
} from 'recharts'
import {
  Banknote,
  FileBadge,
  FileText,
  Pencil,
  Plus,
  ScrollText,
  Trash2,
  Users,
} from 'lucide-react'
import { useDb } from '@/data/store'
import {
  certificatesForSource,
  engagementRows,
  type EngagementRow,
} from '@/data/selectors'
import {
  FILING_LABEL,
  INCOTERMS,
  CURRENCIES,
  MP_STATUS_LABEL,
  REGULATORY_AUTHORITIES,
  REPRESENTATION_LABEL,
  UOMS,
  documentTypeName,
} from '@/data/reference'
import {
  addFiling,
  addPrice,
  endDatePrice,
  removeFiling,
  setPortfolio,
  updateManufacturerProduct,
} from '@/data/api'
import { findPriceOverlap, today } from '@/data/rules'
import { runAction, useAsyncData } from '@/lib/hooks'
import { fmtDate, fmtMoney, fmtQty, pluralise } from '@/lib/utils'
import type {
  FilingKind,
  ManufacturerProduct,
  MpPrice,
  MpStatus,
  RepresentationKind,
} from '@/data/types'
import {
  AgeingFlag,
  Badge,
  Button,
  Dialog,
  DialogFooterActions,
  EmptyState,
  Field,
  FieldGrid,
  FormGrid,
  FormRow,
  Input,
  InlineError,
  InlineWarning,
  LinkButton,
  NumberInput,
  Panel,
  PanelHeader,
  PageHeading,
  PortfolioBadge,
  Select,
  SkeletonTable,
  StageBadge,
  Switch,
  Textarea,
  Tooltip,
  WriteButton,
  WriteOnly,
} from '@/components/ui'
import { NotFound } from '@/features/misc/Fallbacks'
import { ExpiryBadge } from './ManufacturerDetail'

export function SourceDetail() {
  const { id = '' } = useParams()
  const db = useDb()
  const [addFilingOpen, setAddFilingOpen] = React.useState(false)
  const [addPriceOpen, setAddPriceOpen] = React.useState(false)
  const [editTermsOpen, setEditTermsOpen] = React.useState(false)

  const mp = db.manufacturerProducts.find((m) => m.id === id)

  const { data, loading } = useAsyncData(
    () => {
      const source = db.manufacturerProducts.find((m) => m.id === id)
      return {
        filings: db.filings.filter((f) => f.manufacturerProductId === id && f.isActive),
        prices: db.prices
          .filter((p) => p.manufacturerProductId === id)
          .sort((a, b) => (a.validFrom < b.validFrom ? 1 : -1)),
        engagements: engagementRows(db, { mpId: id }),
        documents: source ? certificatesForSource(db, source) : [],
        portfolioPeriods: db.portfolio.filter((p) => p.manufacturerProductId === id),
      }
    },
    [id],
  )

  if (!mp) return <NotFound />

  const product = db.products.find((p) => p.id === mp.productId)
  const manufacturer = db.companies.find((c) => c.id === mp.manufacturerCompanyId)
  if (!product || !manufacturer) return <NotFound />

  const site = mp.siteId ? db.sites.find((s) => s.id === mp.siteId) : undefined
  const activePeriod = (data?.portfolioPeriods ?? []).find((p) => p.isActive)
  const inPortfolio = Boolean(activePeriod)
  const validPrices = (data?.prices ?? []).filter((p) => p.validFrom <= today() && p.validTo >= today())

  return (
    <div className="space-y-4">
      <PageHeading
        title={
          <span className="flex flex-wrap items-baseline gap-x-2">
            <Link to={`/products/${product.id}`} className="hover:text-accent-700">
              {product.genericName}
            </Link>
            <span className="text-base font-normal text-ink-500">from</span>
            <Link to={`/manufacturers/${manufacturer.id}`} className="text-lg font-semibold hover:text-accent-700">
              {manufacturer.displayName}
            </Link>
          </span>
        }
        subtitle={site ? `Made at ${site.name}, ${site.city ?? ''}`.trim() : 'Production plant not recorded'}
        meta={
          <>
            <Badge tone="neutral">{mp.grade}</Badge>
            <Badge tone="outline">
              <span className="font-mono">{mp.pharmacopoeia}</span>
            </Badge>
            <Badge tone={mp.status === 'ACTIVE' ? 'ok' : mp.status === 'IN_DEVELOPMENT' ? 'info' : 'neutral'}>
              {MP_STATUS_LABEL[mp.status]}
            </Badge>
            <PortfolioBadge inPortfolio={inPortfolio} offerable={inPortfolio && validPrices.length > 0} />
          </>
        }
        actions={
          <WriteOnly>
            <LinkButton
              to={`/sources/${id}/edit`}
              variant="secondary"
              size="md"
              icon={<Pencil className="h-3.5 w-3.5" />}
            >
              Edit source
            </LinkButton>
          </WriteOnly>
        }
      />

      {/* four bounded cells rather than one wide strip */}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Panel className="p-3.5">
          <p className="text-2xs font-semibold uppercase tracking-wider text-ink-500">Valid price tiers</p>
          <p className="mt-1 text-2xl font-semibold tabular text-ink-900">{validPrices.length || '—'}</p>
          <p className="mt-0.5 text-xs text-ink-500">
            {pluralise(data?.prices.length ?? 0, 'price row')} in the history
          </p>
        </Panel>
        <Panel className="p-3.5">
          <p className="text-2xs font-semibold uppercase tracking-wider text-ink-500">Regulatory filings</p>
          <p className="mt-1 text-2xl font-semibold tabular text-ink-900">{data?.filings.length ?? '—'}</p>
          <p className="mt-0.5 text-xs text-ink-500">
            {data?.filings.map((f) => f.kind).join(', ') || 'None on file'}
          </p>
        </Panel>
        <Panel className="p-3.5">
          <p className="text-2xs font-semibold uppercase tracking-wider text-ink-500">Clients engaged</p>
          <p className="mt-1 text-2xl font-semibold tabular text-ink-900">{data?.engagements.length || '—'}</p>
          <p className="mt-0.5 text-xs text-ink-500">
            {(data?.engagements ?? []).filter((e) => e.stage === 'COMMERCIAL').length} in commercial supply
          </p>
        </Panel>
        <Panel className="p-3.5">
          <p className="text-2xs font-semibold uppercase tracking-wider text-ink-500">Lead time</p>
          <p className="mt-1 text-2xl font-semibold tabular text-ink-900">
            {mp.leadTimeDays ? `${mp.leadTimeDays}` : '—'}
            {mp.leadTimeDays ? <span className="ml-1 text-xs font-medium text-ink-400">days</span> : null}
          </p>
          <p className="mt-0.5 text-xs text-ink-500">MOQ {fmtQty(mp.moqQty, mp.moqUom)}</p>
        </Panel>
      </div>

      <PortfolioPanel
        mp={mp}
        inPortfolio={inPortfolio}
        representation={activePeriod?.representation ?? null}
        startedOn={activePeriod?.startedOn ?? null}
        periods={data?.portfolioPeriods.length ?? 0}
        hasValidPrice={validPrices.length > 0}
      />

      <FilingsPanel
        loading={loading}
        filings={data?.filings ?? []}
        onAdd={() => setAddFilingOpen(true)}
      />

      <PricesPanel
        loading={loading}
        prices={data?.prices ?? []}
        uom={mp.moqUom ?? product.defaultUom}
        onAdd={() => setAddPriceOpen(true)}
      />

      <ClientsPanel loading={loading} rows={data?.engagements ?? []} />

      <Panel>
        <PanelHeader
          title="Commercial terms"
          subtitle="What the manufacturer will accept: order size, lead time, packing and the capacity behind it"
          actions={
            <WriteButton
              variant="secondary"
              size="sm"
              icon={<Pencil className="h-3.5 w-3.5" />}
              onClick={() => setEditTermsOpen(true)}
            >
              Edit terms
            </WriteButton>
          }
        />
        <div className="p-4">
          <FieldGrid cols={4}>
            <Field label="Minimum order quantity">{fmtQty(mp.moqQty, mp.moqUom)}</Field>
            <Field label="Lead time">{mp.leadTimeDays ? `${mp.leadTimeDays} days` : '—'}</Field>
            <Field label="Annual capacity">{fmtQty(mp.annualCapacityQty, mp.annualCapacityUom)}</Field>
            <Field label="Source status">{MP_STATUS_LABEL[mp.status]}</Field>
          </FieldGrid>
          <div className="mt-4 border-t border-paper-200 pt-3.5">
            <p className="text-2xs font-medium uppercase tracking-wide text-ink-500">Packing</p>
            <p className="mt-1 max-w-2xl text-sm leading-relaxed text-ink-800">
              {mp.packingDetails ?? 'Not recorded.'}
            </p>
          </div>
          {mp.remarks ? (
            <div className="mt-4 border-t border-paper-200 pt-3.5">
              <p className="text-2xs font-medium uppercase tracking-wide text-ink-500">Remarks</p>
              <p className="mt-1 max-w-2xl text-sm leading-relaxed text-ink-700">{mp.remarks}</p>
            </div>
          ) : null}
        </div>
      </Panel>

      <Panel>
        <PanelHeader
          title="Documents"
          subtitle="Filed against this source, plus the plant certificates it inherits from the site"
          icon={<FileBadge className="h-4 w-4" />}
        />
        {loading ? (
          <SkeletonTable rows={3} cols={4} />
        ) : (data?.documents.length ?? 0) === 0 ? (
          <div className="p-4">
            <EmptyState
              icon={<FileText className="h-5 w-5" />}
              title="No document reaches this source"
              description="A GMP certificate on the plant would appear here automatically, because it covers the plant and so every product made there."
              compact
            />
          </div>
        ) : (
          <ul className="divide-y divide-paper-200">
            {data!.documents.map((d) => (
              <li key={d.document.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 px-4 py-2.5">
                <FileText className="h-4 w-4 shrink-0 text-ink-400" />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm text-ink-900">{d.document.title}</span>
                  <span className="block truncate text-xs text-ink-500">
                    {documentTypeName(d.document.typeCode)}
                    {d.document.entityType === 'COMPANY_SITE' ? ' · inherited from the plant' : ''}
                    {d.document.expiresOn ? ` · expires ${fmtDate(d.document.expiresOn)}` : ''}
                  </span>
                </span>
                <ExpiryBadge row={d} />
              </li>
            ))}
          </ul>
        )}
      </Panel>

      <AddFilingDialog open={addFilingOpen} onOpenChange={setAddFilingOpen} mpId={id} />
      <AddPriceDialog
        open={addPriceOpen}
        onOpenChange={setAddPriceOpen}
        mpId={id}
        defaultUom={mp.moqUom ?? product.defaultUom}
        prices={data?.prices ?? []}
      />
      <EditTermsDialog open={editTermsOpen} onOpenChange={setEditTermsOpen} mp={mp} />
    </div>
  )
}

// ---------------------------------------------------------------- portfolio

function PortfolioPanel({
  mp,
  inPortfolio,
  representation,
  startedOn,
  periods,
  hasValidPrice,
}: {
  mp: ManufacturerProduct
  inPortfolio: boolean
  representation: RepresentationKind | null
  startedOn: string | null
  periods: number
  hasValidPrice: boolean
}) {
  const [kind, setKind] = React.useState<RepresentationKind>(representation ?? 'INDENT')
  const [busy, setBusy] = React.useState(false)

  const toggle = async (next: boolean) => {
    setBusy(true)
    await runAction(() => setPortfolio(mp.id, next, kind), {
      success: next
        ? 'Taken into the TCL portfolio. It can now be offered to clients.'
        : 'Removed from the portfolio. The period is kept on the record.',
    })
    setBusy(false)
  }

  return (
    <Panel>
      <PanelHeader
        title="TCL portfolio"
        subtitle="Only a represented source can be offered to a client. Everything else is market intelligence."
      />
      <div className="flex flex-wrap items-start justify-between gap-4 p-4">
        <div className="min-w-0 space-y-1.5">
          <div className="flex flex-wrap items-center gap-2">
            <PortfolioBadge inPortfolio={inPortfolio} offerable={inPortfolio && hasValidPrice} />
            {representation ? <Badge tone="neutral">{REPRESENTATION_LABEL[representation]}</Badge> : null}
            {startedOn ? <span className="text-xs text-ink-500">since {fmtDate(startedOn)}</span> : null}
          </div>
          <p className="max-w-xl text-xs leading-relaxed text-ink-500">
            {inPortfolio
              ? hasValidPrice
                ? 'Represented with a currently valid price, so an offer can be made today.'
                : 'Represented, but with no currently valid price, so no offer can be made until the price is renewed.'
              : 'Not represented. Taking it into the portfolio is refused for a blacklisted or inactive manufacturer, and for a discontinued source.'}
            {periods > 1 ? ` ${pluralise(periods, 'period')} on the record.` : ''}
          </p>
        </div>
        <WriteOnly>
          <div className="flex shrink-0 flex-col items-end gap-2">
            {!inPortfolio ? (
              <div className="w-48">
                <Select
                  value={kind}
                  onChange={(v) => setKind(v as RepresentationKind)}
                  options={(Object.keys(REPRESENTATION_LABEL) as RepresentationKind[]).map((r) => ({
                    value: r,
                    label: REPRESENTATION_LABEL[r],
                  }))}
                />
              </div>
            ) : null}
            <Switch
              checked={inPortfolio}
              disabled={busy}
              onChange={(next) => void toggle(next)}
              label={inPortfolio ? 'Represented by TCL' : 'Take into the portfolio'}
            />
          </div>
        </WriteOnly>
      </div>
    </Panel>
  )
}

// ------------------------------------------------------------------ filings

function FilingsPanel({
  loading,
  filings,
  onAdd,
}: {
  loading: boolean
  filings: ReturnType<typeof useDb>['filings']
  onAdd: () => void
}) {
  return (
    <Panel>
      <PanelHeader
        title="Regulatory filings"
        subtitle="One row per filing. A single source can hold a US DMF, an EU ASMF and a CEP at the same time, each with its own authority and number."
        icon={<ScrollText className="h-4 w-4" />}
        actions={
          <WriteButton variant="secondary" size="sm" icon={<Plus className="h-3.5 w-3.5" />} onClick={onAdd}>
            Add filing
          </WriteButton>
        }
      />
      {loading ? (
        <SkeletonTable rows={3} cols={4} />
      ) : filings.length === 0 ? (
        <div className="p-4">
          <EmptyState
            icon={<ScrollText className="h-5 w-5" />}
            title="No filing is recorded for this source"
            description="Without a DMF, ASMF or CEP, a regulated client cannot register the source, whatever the price is."
            action={
              <WriteButton variant="primary" size="sm" onClick={onAdd}>
                Add the first filing
              </WriteButton>
            }
            compact
          />
        </div>
      ) : (
        <ul className="divide-y divide-paper-200">
          {filings.map((f) => (
            <li key={f.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 px-4 py-2.5">
              <Badge tone={f.kind === 'CEP' ? 'accent' : 'info'}>{FILING_LABEL[f.kind]}</Badge>
              <span className="font-mono text-sm tabular text-ink-900">{f.referenceNumber}</span>
              <span className="min-w-0 flex-1 truncate text-xs text-ink-500">
                {f.authority}
                {f.remarks ? ` · ${f.remarks}` : ''}
              </span>
              <WriteOnly>
                <Tooltip content="Withdraw the filing. The row is kept, marked inactive.">
                  <Button
                    variant="ghost"
                    size="sm"
                    icon={<Trash2 className="h-3.5 w-3.5" />}
                    onClick={() =>
                      void runAction(() => removeFiling(f.id), {
                        success: `${f.kind} ${f.referenceNumber} withdrawn.`,
                      })
                    }
                  >
                    Withdraw
                  </Button>
                </Tooltip>
              </WriteOnly>
            </li>
          ))}
        </ul>
      )}
    </Panel>
  )
}

function AddFilingDialog({
  open,
  onOpenChange,
  mpId,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  mpId: string
}) {
  const [kind, setKind] = React.useState<FilingKind>('DMF')
  const [authority, setAuthority] = React.useState('USFDA')
  const [referenceNumber, setReferenceNumber] = React.useState('')
  const [remarks, setRemarks] = React.useState('')
  const [error, setError] = React.useState<string | null>(null)
  const [saving, setSaving] = React.useState(false)

  React.useEffect(() => {
    if (open) {
      setKind('DMF')
      setAuthority('USFDA')
      setReferenceNumber('')
      setRemarks('')
      setError(null)
    }
  }, [open])

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    if (!referenceNumber.trim()) {
      setError('A filing needs its reference number.')
      return
    }
    setSaving(true)
    const result = await runAction(
      () =>
        addFiling({
          manufacturerProductId: mpId,
          kind,
          authority,
          referenceNumber: referenceNumber.trim(),
          documentId: null,
          remarks: remarks.trim() || null,
        }),
      { success: `${kind} ${referenceNumber.trim()} recorded.`, onError: setError },
    )
    setSaving(false)
    if (result) onOpenChange(false)
  }

  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      title="Add a regulatory filing"
      description="A source can hold several filings at once, one per market. Record each separately."
    >
      <form onSubmit={submit} className="space-y-3.5">
        <FormGrid>
          <FormRow label="Filing type" required>
            <Select
              value={kind}
              onChange={(v) => setKind(v as FilingKind)}
              options={(Object.keys(FILING_LABEL) as FilingKind[]).map((k) => ({
                value: k,
                label: FILING_LABEL[k],
                description:
                  k === 'DMF'
                    ? 'United States'
                    : k === 'ASMF'
                      ? 'European Union'
                      : k === 'CEP'
                        ? 'European Pharmacopoeia suitability'
                        : undefined,
              }))}
            />
          </FormRow>
          <FormRow label="Authority" required>
            <Select
              value={authority}
              onChange={setAuthority}
              options={REGULATORY_AUTHORITIES.map((a) => ({ value: a, label: a }))}
            />
          </FormRow>
        </FormGrid>
        <FormRow label="Reference number" required hint="As issued by the authority.">
          <Input
            value={referenceNumber}
            onChange={(e) => setReferenceNumber(e.target.value)}
            mono
            autoFocus
            placeholder="DMF 034112"
          />
        </FormRow>
        <FormRow label="Remarks">
          <Textarea value={remarks} onChange={(e) => setRemarks(e.target.value)} rows={2} />
        </FormRow>
        {error ? <InlineError>{error}</InlineError> : null}
        <div className="flex items-center justify-end gap-2 pt-1">
          <DialogFooterActions
            onCancel={() => onOpenChange(false)}
            confirmLabel="Add filing"
            loading={saving}
          />
        </div>
      </form>
    </Dialog>
  )
}

// ------------------------------------------------------------------- prices

function PricesPanel({
  loading,
  prices,
  uom,
  onAdd,
}: {
  loading: boolean
  prices: MpPrice[]
  uom: string
  onAdd: () => void
}) {
  const on = today()

  // Oldest first, so the chart reads left to right in time.
  const series = React.useMemo(
    () =>
      [...prices]
        .sort((a, b) => (a.validFrom < b.validFrom ? -1 : 1))
        .map((p) => ({
          from: p.validFrom,
          label: fmtDate(p.validFrom),
          price: p.price,
          incoterm: p.incoterm,
          currency: p.currency,
        })),
    [prices],
  )

  if (loading) {
    return (
      <Panel>
        <SkeletonTable rows={4} cols={6} />
      </Panel>
    )
  }

  return (
    <div className="grid gap-4 lg:grid-cols-3">
      <Panel className="lg:col-span-2">
        <PanelHeader
          title="Price history"
          subtitle="Every row ever recorded. Prices are never overwritten: a new price supersedes the old one by end-dating it."
          icon={<Banknote className="h-4 w-4" />}
          actions={
            <WriteButton variant="secondary" size="sm" icon={<Plus className="h-3.5 w-3.5" />} onClick={onAdd}>
              Add price
            </WriteButton>
          }
        />
        {prices.length === 0 ? (
          <div className="p-4">
            <EmptyState
              icon={<Banknote className="h-5 w-5" />}
              title="No price has been recorded"
              description="A source with no valid price stays in the portfolio but cannot be offered, so this is usually the next thing to chase."
              action={
                <WriteButton variant="primary" size="sm" onClick={onAdd}>
                  Add the first price
                </WriteButton>
              }
              compact
            />
          </div>
        ) : (
          <div className="scroll-slim overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-paper-300 bg-paper-100/70">
                  <th className="th">Price</th>
                  <th className="th">Incoterm</th>
                  <th className="th text-right">From quantity</th>
                  <th className="th text-right">Valid from</th>
                  <th className="th text-right">Valid to</th>
                  <th className="th">State</th>
                  <th className="th" />
                </tr>
              </thead>
              <tbody>
                {prices.map((p) => {
                  const current = p.validFrom <= on && p.validTo >= on
                  const future = p.validFrom > on
                  return (
                    <tr
                      key={p.id}
                      className={
                        current
                          ? 'border-b border-paper-200 bg-accent-50/40 last:border-0'
                          : 'border-b border-paper-200 text-ink-500 last:border-0'
                      }
                    >
                      <td className="cell font-medium tabular text-ink-900">
                        {fmtMoney(p.price, p.currency)}
                        <span className="text-2xs text-ink-400">/{p.perUom}</span>
                      </td>
                      <td className="cell font-mono text-xs">{p.incoterm}</td>
                      <td className="cell text-right tabular">{fmtQty(p.minQty, p.perUom)}</td>
                      <td className="cell text-right tabular">{fmtDate(p.validFrom)}</td>
                      <td className="cell text-right tabular">{fmtDate(p.validTo)}</td>
                      <td className="cell">
                        {current ? (
                          <Badge tone="ok">Currently valid</Badge>
                        ) : future ? (
                          <Badge tone="info">Starts {fmtDate(p.validFrom)}</Badge>
                        ) : (
                          <Badge tone="neutral">Expired</Badge>
                        )}
                      </td>
                      <td className="cell text-right">
                        {current || future ? (
                          <WriteOnly>
                            <Tooltip content="End-date this price today. The row stays in the history with the shorter validity.">
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() =>
                                  void runAction(() => endDatePrice(p.id, on), {
                                    success: `Price end-dated ${fmtDate(on)}.`,
                                  })
                                }
                              >
                                End-date
                              </Button>
                            </Tooltip>
                          </WriteOnly>
                        ) : null}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </Panel>

      <Panel>
        <PanelHeader title="Price over time" subtitle={`Each row at its start date, per ${uom}`} />
        <div className="p-3.5">
          {series.length < 2 ? (
            <p className="py-10 text-center text-xs text-ink-400">
              A trend needs at least two price rows. There {series.length === 1 ? 'is one' : 'are none'} so far.
            </p>
          ) : (
            <div className="h-44">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={series} margin={{ top: 6, right: 8, bottom: 0, left: 0 }}>
                  <CartesianGrid stroke="#e6e1d8" strokeDasharray="2 4" vertical={false} />
                  <XAxis
                    dataKey="label"
                    tick={{ fontSize: 10, fill: '#3f7389' }}
                    tickLine={false}
                    axisLine={{ stroke: '#e6e1d8' }}
                    interval="preserveStartEnd"
                  />
                  <YAxis
                    tick={{ fontSize: 10, fill: '#3f7389' }}
                    tickLine={false}
                    axisLine={false}
                    width={44}
                    domain={['auto', 'auto']}
                  />
                  <ChartTooltip
                    contentStyle={{
                      borderRadius: 6,
                      border: '1px solid #e6e1d8',
                      fontSize: 12,
                      boxShadow: '0 2px 6px rgb(15 34 45 / 0.07)',
                    }}
                    formatter={(value: number, _name, item) => [
                      fmtMoney(value, (item?.payload as { currency?: string } | undefined)?.currency ?? 'USD'),
                      'Price',
                    ]}
                  />
                  <Line
                    type="monotone"
                    dataKey="price"
                    stroke="#0c786b"
                    strokeWidth={2}
                    dot={{ r: 2.5, fill: '#0c786b', strokeWidth: 0 }}
                    activeDot={{ r: 4 }}
                  />
                </LineChart>
              </ResponsiveContainer>
            </div>
          )}
          <p className="mt-2 text-2xs leading-relaxed text-ink-400">
            Rows for different incoterms and quantity tiers sit on the same line, so read it as the shape of the
            quotes received, not as one comparable series.
          </p>
        </div>
      </Panel>
    </div>
  )
}

function AddPriceDialog({
  open,
  onOpenChange,
  mpId,
  defaultUom,
  prices,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  mpId: string
  defaultUom: string
  prices: MpPrice[]
}) {
  const [price, setPrice] = React.useState<number | null>(null)
  const [currency, setCurrency] = React.useState<string>('USD')
  const [perUom, setPerUom] = React.useState<string>(defaultUom)
  const [incoterm, setIncoterm] = React.useState<string>('FOB')
  const [minQty, setMinQty] = React.useState<number | null>(1)
  const [validFrom, setValidFrom] = React.useState(today())
  const [validTo, setValidTo] = React.useState('')
  const [sourceReference, setSourceReference] = React.useState('')
  const [remarks, setRemarks] = React.useState('')
  const [error, setError] = React.useState<string | null>(null)
  const [saving, setSaving] = React.useState(false)

  React.useEffect(() => {
    if (open) {
      setPrice(null)
      setCurrency('USD')
      setPerUom(defaultUom)
      setIncoterm('FOB')
      setMinQty(1)
      setValidFrom(today())
      setValidTo('')
      setSourceReference('')
      setRemarks('')
      setError(null)
    }
  }, [open, defaultUom])

  // The same check the api runs, so the clash is visible before the save.
  const overlap =
    validFrom && validTo && minQty != null
      ? findPriceOverlap(
          { manufacturerProductId: mpId, incoterm, minQty, validFrom, validTo },
          prices,
        )
      : null

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    if (price == null || price <= 0) {
      setError('Enter the price.')
      return
    }
    if (!validTo) {
      setError('A price needs a "valid to" date. Prices expire, which is what makes an offer honest.')
      return
    }
    setSaving(true)
    const result = await runAction(
      () =>
        addPrice({
          manufacturerProductId: mpId,
          price,
          currency,
          perUom,
          incoterm,
          minQty: minQty ?? 1,
          validFrom,
          validTo,
          sourceReference: sourceReference.trim() || null,
          remarks: remarks.trim() || null,
        }),
      { success: `${fmtMoney(price, currency)}/${perUom} ${incoterm} recorded.`, onError: setError },
    )
    setSaving(false)
    if (result) onOpenChange(false)
  }

  const endDateExisting = async () => {
    if (!overlap) return
    const dayBefore = new Date(validFrom)
    dayBefore.setDate(dayBefore.getDate() - 1)
    const endOn = dayBefore.toISOString().slice(0, 10)
    await runAction(() => endDatePrice(overlap.id, endOn), {
      success: `The existing price now ends on ${fmtDate(endOn)}.`,
      onError: setError,
    })
  }

  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      width="lg"
      title="Add a price"
      description="One row per incoterm and quantity tier. Two rows for the same tier may never cover the same dates."
    >
      <form onSubmit={submit} className="space-y-3.5">
        <FormGrid cols={3}>
          <FormRow label="Price" required>
            <NumberInput value={price} onChange={setPrice} min={0} step="0.01" autoFocus />
          </FormRow>
          <FormRow label="Currency" required>
            <Select
              value={currency}
              onChange={setCurrency}
              options={CURRENCIES.map((c) => ({ value: c, label: c }))}
            />
          </FormRow>
          <FormRow label="Per unit" required>
            <Select value={perUom} onChange={setPerUom} options={UOMS.map((u) => ({ value: u, label: u }))} />
          </FormRow>
          <FormRow label="Incoterm" required>
            <Select value={incoterm} onChange={setIncoterm} options={INCOTERMS.map((i) => ({ value: i, label: i }))} />
          </FormRow>
          <FormRow label="From quantity" required hint="The tier this price applies from.">
            <NumberInput value={minQty} onChange={setMinQty} min={0} suffix={perUom} />
          </FormRow>
          <FormRow label="Quotation reference">
            <Input
              value={sourceReference}
              onChange={(e) => setSourceReference(e.target.value)}
              mono
              placeholder="QT/2026/0481"
            />
          </FormRow>
        </FormGrid>

        <FormGrid>
          <FormRow label="Valid from" required>
            <Input type="date" value={validFrom} onChange={(e) => setValidFrom(e.target.value)} mono />
          </FormRow>
          <FormRow label="Valid to" required hint="An offer cannot be made from an expired price.">
            <Input type="date" value={validTo} onChange={(e) => setValidTo(e.target.value)} mono />
          </FormRow>
        </FormGrid>

        {overlap ? (
          <InlineWarning>
            <span>
              A price for {incoterm} at tier {overlap.minQty} already covers {fmtDate(overlap.validFrom)} to{' '}
              {fmtDate(overlap.validTo)} at {fmtMoney(overlap.price, overlap.currency)}/{overlap.perUom}. The save will
              be refused until that row is end-dated or these dates change.
            </span>
          </InlineWarning>
        ) : null}

        <FormRow label="Remarks">
          <Textarea value={remarks} onChange={(e) => setRemarks(e.target.value)} rows={2} />
        </FormRow>

        {error ? <InlineError>{error}</InlineError> : null}

        <div className="flex items-center justify-end gap-2 pt-1">
          <DialogFooterActions
            onCancel={() => onOpenChange(false)}
            confirmLabel="Add price"
            loading={saving}
            extra={
              overlap ? (
                <Button variant="subtle" size="sm" type="button" onClick={() => void endDateExisting()}>
                  End-date the existing price
                </Button>
              ) : null
            }
          />
        </div>
      </form>
    </Dialog>
  )
}

// -------------------------------------------------------------- engagements

function ClientsPanel({ loading, rows }: { loading: boolean; rows: EngagementRow[] }) {
  if (loading) {
    return (
      <Panel>
        <SkeletonTable rows={3} cols={4} />
      </Panel>
    )
  }
  return (
    <Panel>
      <PanelHeader
        title="Clients on this source"
        subtitle="Each client evaluates and approves a source in its own right, so the same source sits at different stages for different clients"
      />
      {rows.length === 0 ? (
        <div className="p-4">
          <EmptyState
            icon={<Users className="h-5 w-5" />}
            title="No client is engaged on this source"
            description="An engagement starts when a client requirement is matched to this source."
            action={
              <WriteOnly>
                <LinkButton to="/requirements/new" variant="primary" size="sm">
                  Record a client requirement
                </LinkButton>
              </WriteOnly>
            }
            compact
          />
        </div>
      ) : (
        <ul className="divide-y divide-paper-200">
          {rows
            .slice()
            .sort((a, b) => a.client.displayName.localeCompare(b.client.displayName))
            .map((r) => (
              <li key={r.engagement.id}>
                <Link
                  to={`/engagements/${r.engagement.id}`}
                  className="flex flex-wrap items-center gap-x-3 gap-y-1 px-4 py-2.5 transition-colors hover:bg-paper-100"
                >
                  <span className="min-w-0 flex-1 truncate text-sm font-medium text-ink-900">
                    {r.client.displayName}
                  </span>
                  <span className="text-xs text-ink-500">{r.ownerName}</span>
                  <StageBadge stage={r.stage} size="sm" />
                  <AgeingFlag days={r.daysInStage} threshold={60} />
                </Link>
              </li>
            ))}
        </ul>
      )}
    </Panel>
  )
}

// ---------------------------------------------------------------- terms edit

function EditTermsDialog({
  open,
  onOpenChange,
  mp,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  mp: ManufacturerProduct
}) {
  const [status, setStatus] = React.useState<MpStatus>(mp.status)
  const [moqQty, setMoqQty] = React.useState<number | null>(mp.moqQty)
  const [moqUom, setMoqUom] = React.useState<string>(mp.moqUom ?? 'KG')
  const [leadTimeDays, setLeadTimeDays] = React.useState<number | null>(mp.leadTimeDays)
  const [packingDetails, setPackingDetails] = React.useState(mp.packingDetails ?? '')
  const [annualCapacityQty, setAnnualCapacityQty] = React.useState<number | null>(mp.annualCapacityQty)
  const [annualCapacityUom, setAnnualCapacityUom] = React.useState<string>(mp.annualCapacityUom ?? 'MT')
  const [remarks, setRemarks] = React.useState(mp.remarks ?? '')
  const [error, setError] = React.useState<string | null>(null)
  const [saving, setSaving] = React.useState(false)

  React.useEffect(() => {
    if (open) {
      setStatus(mp.status)
      setMoqQty(mp.moqQty)
      setMoqUom(mp.moqUom ?? 'KG')
      setLeadTimeDays(mp.leadTimeDays)
      setPackingDetails(mp.packingDetails ?? '')
      setAnnualCapacityQty(mp.annualCapacityQty)
      setAnnualCapacityUom(mp.annualCapacityUom ?? 'MT')
      setRemarks(mp.remarks ?? '')
      setError(null)
    }
  }, [open, mp])

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    setSaving(true)
    const result = await runAction(
      () =>
        updateManufacturerProduct(mp.id, {
          status,
          moqQty,
          moqUom: moqQty == null ? null : moqUom,
          leadTimeDays,
          packingDetails: packingDetails.trim() || null,
          annualCapacityQty,
          annualCapacityUom: annualCapacityQty == null ? null : annualCapacityUom,
          remarks: remarks.trim() || null,
        }),
      { success: 'Commercial terms updated.', onError: setError },
    )
    setSaving(false)
    if (result !== null) onOpenChange(false)
  }

  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      width="lg"
      title="Edit commercial terms"
      description="What this manufacturer will accept for this source. Prices are kept separately, so they are never lost here."
    >
      <form onSubmit={submit} className="space-y-3.5">
        <FormGrid cols={3}>
          <FormRow label="Source status" required>
            <Select
              value={status}
              onChange={(v) => setStatus(v as MpStatus)}
              options={(Object.keys(MP_STATUS_LABEL) as MpStatus[]).map((s) => ({
                value: s,
                label: MP_STATUS_LABEL[s],
              }))}
            />
          </FormRow>
          <FormRow label="Minimum order quantity">
            <NumberInput value={moqQty} onChange={setMoqQty} min={0} />
          </FormRow>
          <FormRow label="MOQ unit">
            <Select value={moqUom} onChange={setMoqUom} options={UOMS.map((u) => ({ value: u, label: u }))} />
          </FormRow>
          <FormRow label="Lead time">
            <NumberInput value={leadTimeDays} onChange={setLeadTimeDays} min={0} suffix="days" />
          </FormRow>
          <FormRow label="Annual capacity">
            <NumberInput value={annualCapacityQty} onChange={setAnnualCapacityQty} min={0} />
          </FormRow>
          <FormRow label="Capacity unit">
            <Select
              value={annualCapacityUom}
              onChange={setAnnualCapacityUom}
              options={UOMS.map((u) => ({ value: u, label: u }))}
            />
          </FormRow>
        </FormGrid>
        <FormRow label="Packing" hint="How it ships: drum size, liner, pallet.">
          <Textarea
            value={packingDetails}
            onChange={(e) => setPackingDetails(e.target.value)}
            rows={2}
            placeholder="25 kg HDPE drums, double LDPE liner, 20 drums per pallet."
          />
        </FormRow>
        <FormRow label="Remarks">
          <Textarea value={remarks} onChange={(e) => setRemarks(e.target.value)} rows={2} />
        </FormRow>
        {status === 'DISCONTINUED' ? (
          <InlineWarning>
            <span>
              A discontinued source cannot be taken into the portfolio. If it is represented today, remove it from the
              portfolio as well.
            </span>
          </InlineWarning>
        ) : null}
        {error ? <InlineError>{error}</InlineError> : null}
        <div className="flex items-center justify-end gap-2 pt-1">
          <DialogFooterActions onCancel={() => onOpenChange(false)} confirmLabel="Save terms" loading={saving} />
        </div>
      </form>
    </Dialog>
  )
}
