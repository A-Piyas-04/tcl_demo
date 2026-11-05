/**
 * Pieces shared by the orders and logistics screens.
 *
 * Nothing here is domain logic: the rules live in `@/data/rules` and the api.
 * These are the small presentational parts that would otherwise be copied
 * across the ten screens of UC-09 and UC-10 — status chips, the fulfilment
 * bar, the letter-of-credit state, and the documents and activity panels that
 * every order, indent and shipment carries.
 */

import * as React from 'react'
import { FileText, MessageSquare, Plus } from 'lucide-react'
import { differenceInCalendarDays, parseISO } from 'date-fns'
import {
  COMMISSION_STATUS_LABEL,
  DOCUMENT_TYPES,
  ORDER_STATUS_LABEL,
  SHIPMENT_STATUS_LABEL,
  convertQty,
} from '@/data/reference'
import { documentRows, userName } from '@/data/selectors'
import { logActivity, uploadDocument } from '@/data/api'
import { useDb } from '@/data/store'
import { runAction } from '@/lib/hooks'
import { fmtDate, fmtDateTime, todayIso } from '@/lib/utils'
import type {
  ActivityKind,
  CommissionStatus,
  DocumentEntityType,
  Indent,
  OrderStatus,
  ShipmentStatus,
} from '@/data/types'
import {
  Badge,
  Button,
  DateInput,
  Dialog,
  DialogFooterActions,
  EmptyState,
  FormGrid,
  FormRow,
  InlineError,
  Input,
  Meter,
  Panel,
  PanelHeader,
  Select,
  Textarea,
  Tooltip,
  WriteButton,
} from '@/components/ui'

// ------------------------------------------------------------------ chips

export function OrderStatusBadge({ status }: { status: OrderStatus }) {
  const tone =
    status === 'COMPLETED'
      ? 'ok'
      : status === 'CANCELLED'
        ? 'danger'
        : status === 'ON_HOLD'
          ? 'warn'
          : status === 'DRAFT'
            ? 'neutral'
            : 'accent'
  return <Badge tone={tone}>{ORDER_STATUS_LABEL[status]}</Badge>
}

export function ShipmentStatusBadge({ status }: { status: ShipmentStatus }) {
  const tone =
    status === 'DELIVERED'
      ? 'ok'
      : status === 'HELD_AT_CUSTOMS'
        ? 'danger'
        : status === 'CANCELLED'
          ? 'neutral'
          : status === 'CLEARED'
            ? 'ok'
            : status === 'ARRIVED'
              ? 'info'
              : 'accent'
  return <Badge tone={tone}>{SHIPMENT_STATUS_LABEL[status]}</Badge>
}

export function CommissionStatusBadge({ status }: { status: CommissionStatus }) {
  const tone =
    status === 'RECEIVED'
      ? 'ok'
      : status === 'WRITTEN_OFF'
        ? 'danger'
        : status === 'PENDING'
          ? 'neutral'
          : status === 'PARTIALLY_RECEIVED'
            ? 'warn'
            : 'info'
  return <Badge tone={tone}>{COMMISSION_STATUS_LABEL[status]}</Badge>
}

// ------------------------------------------------------- fulfilment bar

export interface FulfilmentNumbers {
  ordered: number
  indented: number
  shipped: number
  delivered: number
}

/**
 * Indented, shipped and delivered against ordered, as one thin segmented
 * track. Deliberately narrow: it sits in a table cell, not across the page.
 */
export function FulfilmentBar({
  ordered,
  indented,
  shipped,
  delivered,
  className,
}: FulfilmentNumbers & { className?: string }) {
  const pct = (n: number) => (ordered > 0 ? Math.min(100, Math.round((n / ordered) * 100)) : 0)
  return (
    <Tooltip
      content={
        <span className="block space-y-0.5">
          <span className="block">Indented {pct(indented)}%</span>
          <span className="block">Shipped {pct(shipped)}%</span>
          <span className="block">Delivered {pct(delivered)}%</span>
        </span>
      }
    >
      <div className={className}>
        <div className="space-y-[3px]">
          <Meter value={indented} max={ordered} tone="bg-accent-300" className="h-1" />
          <Meter value={shipped} max={ordered} tone="bg-accent-500" className="h-1" />
          <Meter value={delivered} max={ordered} tone="bg-ok-500" className="h-1" />
        </div>
        <div className="mt-1 text-[10px] tabular text-ink-500">{pct(delivered)}% delivered</div>
      </div>
    </Tooltip>
  )
}

export function FulfilmentLegend() {
  return (
    <span className="flex flex-wrap items-center gap-3 text-[10px] text-ink-500">
      <span className="flex items-center gap-1">
        <span className="h-1.5 w-3 rounded-full bg-accent-300" /> indented
      </span>
      <span className="flex items-center gap-1">
        <span className="h-1.5 w-3 rounded-full bg-accent-500" /> shipped
      </span>
      <span className="flex items-center gap-1">
        <span className="h-1.5 w-3 rounded-full bg-ok-500" /> delivered
      </span>
    </span>
  )
}

// -------------------------------------------------------- quantity totals

/**
 * Sums quantities that may be recorded in different units, reporting the unit
 * it settled on. Where a conversion does not exist the lines are counted in
 * their own unit and the result says so, rather than adding unlike things.
 */
export function sumQty(lines: { qty: number; uom: string }[]): { qty: number; uom: string; mixed: boolean } {
  if (lines.length === 0) return { qty: 0, uom: '', mixed: false }
  const target = lines[0]!.uom
  let total = 0
  let mixed = false
  for (const line of lines) {
    try {
      total += convertQty(line.qty, line.uom, target)
    } catch {
      mixed = true
      total += line.qty
    }
  }
  return { qty: Math.round(total * 10000) / 10000, uom: target, mixed }
}

// ------------------------------------------------- letter of credit state

export type LcState = 'none' | 'valid' | 'expiring' | 'expired'

/** An LC within 45 days of expiry is chased; one past expiry is a problem. */
export function lcState(indent: Pick<Indent, 'lcNumber' | 'lcExpiryDate'>): {
  state: LcState
  daysToExpiry: number | null
} {
  if (!indent.lcNumber) return { state: 'none', daysToExpiry: null }
  if (!indent.lcExpiryDate) return { state: 'valid', daysToExpiry: null }
  const days = differenceInCalendarDays(parseISO(indent.lcExpiryDate), new Date())
  return { state: days < 0 ? 'expired' : days <= 45 ? 'expiring' : 'valid', daysToExpiry: days }
}

export function LcBadge({ indent }: { indent: Pick<Indent, 'lcNumber' | 'lcExpiryDate'> }) {
  const { state, daysToExpiry } = lcState(indent)
  if (state === 'none') return <Badge tone="outline">No LC yet</Badge>
  if (state === 'expired') return <Badge tone="danger">Expired {fmtDate(indent.lcExpiryDate)}</Badge>
  if (state === 'expiring') return <Badge tone="warn">Expires in {daysToExpiry}d</Badge>
  return <Badge tone="ok">LC on file</Badge>
}

// ------------------------------------------------------------- documents

const DOC_TYPES_FOR_ORDERS = ['INDENT_DOC', 'LC_DOC', 'BL_AWB', 'INVOICE', 'COA', 'QUOTATION', 'OTHER']

/** The documents filed against one order, indent, shipment or batch. */
export function DocumentsPanel({
  entityType,
  entityId,
  title,
  subtitle,
  emptyHint,
}: {
  entityType: DocumentEntityType
  entityId: string
  title: string
  subtitle?: string
  emptyHint?: string
}) {
  const db = useDb()
  const [open, setOpen] = React.useState(false)
  const rows = documentRows(db, { entityType, entityId })

  return (
    <Panel>
      <PanelHeader
        title={title}
        subtitle={subtitle}
        actions={
          rows.length > 0 ? (
            <WriteButton size="sm" variant="secondary" icon={<Plus className="h-3.5 w-3.5" />} onClick={() => setOpen(true)}>
              Attach
            </WriteButton>
          ) : null
        }
      />
      {rows.length === 0 ? (
        <div className="p-4">
          <EmptyState
            icon={<FileText className="h-5 w-5" />}
            title="Nothing filed here yet"
            description={emptyHint ?? 'Proforma invoices, the letter of credit, shipping documents and the bill of entry are filed against the record they belong to.'}
            action={
              <WriteButton size="sm" variant="primary" onClick={() => setOpen(true)}>
                Attach a document
              </WriteButton>
            }
            compact
          />
        </div>
      ) : (
        <ul className="divide-y divide-paper-200">
          {rows.map((r) => (
            <li key={r.document.id} className="flex items-center gap-3 px-4 py-2.5">
              <FileText className="h-4 w-4 shrink-0 text-ink-400" />
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm text-ink-900">{r.document.title}</span>
                <span className="block truncate text-xs text-ink-500">
                  {r.document.typeCode}
                  {r.document.referenceNumber ? ` · ${r.document.referenceNumber}` : ''} · filed{' '}
                  {fmtDate(r.document.uploadedAt)} by {userName(db, r.document.uploadedByUserId)}
                </span>
              </span>
              {r.state === 'expired' ? (
                <Badge tone="danger">Expired</Badge>
              ) : r.state === 'expiring' ? (
                <Badge tone="warn">{r.daysRemaining}d left</Badge>
              ) : null}
            </li>
          ))}
        </ul>
      )}
      <AttachDocumentDialog open={open} onOpenChange={setOpen} entityType={entityType} entityId={entityId} />
    </Panel>
  )
}

function AttachDocumentDialog({
  open,
  onOpenChange,
  entityType,
  entityId,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  entityType: DocumentEntityType
  entityId: string
}) {
  const [typeCode, setTypeCode] = React.useState('INDENT_DOC')
  const [title, setTitle] = React.useState('')
  const [reference, setReference] = React.useState('')
  const [issuedOn, setIssuedOn] = React.useState(todayIso())
  const [expiresOn, setExpiresOn] = React.useState('')
  const [busy, setBusy] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)

  const types = DOCUMENT_TYPES.filter((t) => DOC_TYPES_FOR_ORDERS.includes(t.code))
  const options = (types.length ? types : DOCUMENT_TYPES).map((t) => ({ value: t.code, label: t.name }))

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    setBusy(true)
    const name = title.trim() || (options.find((o) => o.value === typeCode)?.label ?? 'Document')
    const ok = await runAction(
      () =>
        uploadDocument({
          typeCode,
          entityType,
          entityId,
          title: name,
          referenceNumber: reference.trim() || null,
          issuingAuthority: null,
          issuedOn: issuedOn || null,
          expiresOn: expiresOn || null,
          fileName: `${name.toLowerCase().replace(/[^a-z0-9]+/g, '-')}.pdf`,
          fileSizeBytes: 184_320,
          mimeType: 'application/pdf',
        }),
      { success: `${name} filed.`, onError: setError },
    )
    setBusy(false)
    if (ok) {
      onOpenChange(false)
      setTitle('')
      setReference('')
      setExpiresOn('')
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      title="Attach a document"
      description="A newer document of the same type supersedes the one it replaces, and both stay on the record."
    >
      <form onSubmit={submit} className="space-y-3.5">
        <FormGrid>
          <FormRow label="Document type" required>
            <Select value={typeCode} onChange={setTypeCode} options={options} />
          </FormRow>
          <FormRow label="Reference number">
            <Input value={reference} onChange={(e) => setReference(e.target.value)} mono placeholder="PI-1042/2026" />
          </FormRow>
        </FormGrid>
        <FormRow label="Title" hint="Left blank, the document type is used.">
          <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Proforma invoice from the manufacturer" />
        </FormRow>
        <FormGrid>
          <FormRow label="Issued on">
            <DateInput value={issuedOn} onChange={(e) => setIssuedOn(e.target.value)} />
          </FormRow>
          <FormRow label="Expires on" hint="Only for documents that lapse, such as an LC.">
            <DateInput value={expiresOn} onChange={(e) => setExpiresOn(e.target.value)} />
          </FormRow>
        </FormGrid>
        {error ? <InlineError>{error}</InlineError> : null}
        <div className="flex items-center justify-end gap-2 pt-1">
          <DialogFooterActions onCancel={() => onOpenChange(false)} confirmLabel="File it" loading={busy} />
        </div>
      </form>
    </Dialog>
  )
}

// -------------------------------------------------------------- activity

const ACTIVITY_KINDS: { value: ActivityKind; label: string }[] = [
  { value: 'NOTE', label: 'Note' },
  { value: 'CALL', label: 'Call' },
  { value: 'EMAIL', label: 'Email' },
  { value: 'MEETING', label: 'Meeting' },
  { value: 'TASK', label: 'Task' },
]

/** What has been said and done on this record, newest first. */
export function ActivityPanel({
  entityType,
  entityId,
  title = 'Activity',
  subtitle,
}: {
  entityType: string
  entityId: string
  title?: string
  subtitle?: string
}) {
  const db = useDb()
  const [open, setOpen] = React.useState(false)
  const [kind, setKind] = React.useState<ActivityKind>('NOTE')
  const [subject, setSubject] = React.useState('')
  const [body, setBody] = React.useState('')
  const [busy, setBusy] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)

  const rows = db.activities
    .filter((a) => a.entityType === entityType && a.entityId === entityId)
    .slice()
    .sort((a, b) => (a.occurredAt < b.occurredAt ? 1 : -1))

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    if (!subject.trim()) {
      setError('Give the entry a subject so colleagues can scan the history.')
      return
    }
    setBusy(true)
    const ok = await runAction(
      () =>
        logActivity({
          kind,
          entityType,
          entityId,
          subject: subject.trim(),
          body: body.trim() || null,
          occurredAt: new Date().toISOString(),
          contactId: null,
          followUpDate: null,
          isCompleted: kind !== 'TASK',
        }),
      { success: 'Logged against this record.', onError: setError },
    )
    setBusy(false)
    if (ok) {
      setOpen(false)
      setSubject('')
      setBody('')
    }
  }

  return (
    <Panel>
      <PanelHeader
        title={title}
        subtitle={subtitle}
        actions={
          rows.length > 0 ? (
            <WriteButton size="sm" variant="secondary" icon={<Plus className="h-3.5 w-3.5" />} onClick={() => setOpen(true)}>
              Log
            </WriteButton>
          ) : null
        }
      />
      {rows.length === 0 ? (
        <div className="p-4">
          <EmptyState
            icon={<MessageSquare className="h-5 w-5" />}
            title="Nothing logged against this record"
            description="Chasing the letter of credit, a shipping update from the forwarder, a query from the client: record it here and the next person sees it."
            action={
              <WriteButton size="sm" variant="primary" onClick={() => setOpen(true)}>
                Log a note
              </WriteButton>
            }
            compact
          />
        </div>
      ) : (
        <ul className="divide-y divide-paper-200">
          {rows.map((a) => (
            <li key={a.id} className="px-4 py-2.5">
              <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
                <span className="text-sm font-medium text-ink-900">{a.subject}</span>
                <Badge tone="outline">{a.kind.charAt(0) + a.kind.slice(1).toLowerCase()}</Badge>
                <span className="text-xs text-ink-400">
                  {fmtDateTime(a.occurredAt)} · {userName(db, a.createdByUserId)}
                </span>
              </div>
              {a.body ? <p className="mt-0.5 text-xs leading-relaxed text-ink-600">{a.body}</p> : null}
            </li>
          ))}
        </ul>
      )}

      <Dialog
        open={open}
        onOpenChange={setOpen}
        title="Log an entry"
        description="Kept against this record and visible to everyone who opens it."
      >
        <form onSubmit={submit} className="space-y-3.5">
          <FormGrid>
            <FormRow label="Kind" required>
              <Select value={kind} onChange={(v) => setKind(v as ActivityKind)} options={ACTIVITY_KINDS} />
            </FormRow>
            <FormRow label="Subject" required>
              <Input value={subject} onChange={(e) => setSubject(e.target.value)} placeholder="Chased the issuing bank for the LC" />
            </FormRow>
          </FormGrid>
          <FormRow label="Detail">
            <Textarea value={body} onChange={(e) => setBody(e.target.value)} rows={3} />
          </FormRow>
          {error ? <InlineError>{error}</InlineError> : null}
          <div className="flex items-center justify-end gap-2 pt-1">
            <DialogFooterActions onCancel={() => setOpen(false)} confirmLabel="Log it" loading={busy} />
          </div>
        </form>
      </Dialog>
    </Panel>
  )
}

// ------------------------------------------------------------ small cells

/** A bounded metric cell. Used in fours inside a grid, never as a wide strip. */
export function StatCell({
  label,
  value,
  hint,
  tone = 'ink',
}: {
  label: string
  value: React.ReactNode
  hint?: React.ReactNode
  tone?: 'ink' | 'accent' | 'ok' | 'warn' | 'danger'
}) {
  const valueTone = {
    ink: 'text-ink-900',
    accent: 'text-accent-800',
    ok: 'text-ok-600',
    warn: 'text-warn-600',
    danger: 'text-danger-700',
  }[tone]
  return (
    <Panel className="p-3.5">
      <p className="text-2xs font-semibold uppercase tracking-wider text-ink-500">{label}</p>
      <p className={`mt-1 truncate text-2xl font-semibold tabular ${valueTone}`}>{value}</p>
      {hint ? <p className="mt-0.5 text-xs text-ink-500">{hint}</p> : null}
    </Panel>
  )
}

/** The copy that keeps the indenting model straight on every screen. */
export function IndentingNote({ children }: { children: React.ReactNode }) {
  return <p className="text-xs leading-relaxed text-ink-500">{children}</p>
}

export function ClearFiltersButton({ onClear, count }: { onClear: () => void; count: number }) {
  if (count === 0) return null
  return (
    <Button variant="ghost" size="sm" onClick={onClear}>
      Clear {count} filter{count === 1 ? '' : 's'}
    </Button>
  )
}
