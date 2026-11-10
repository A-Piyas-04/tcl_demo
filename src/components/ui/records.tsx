/**
 * Pieces every business record carries, whichever area it belongs to: the
 * status chips for orders, shipments and commission, and the documents and
 * activity panels. An engagement, an order and a shipment all file documents
 * and log notes the same way, so they share one implementation.
 */

import * as React from 'react'
import { FileText, MessageSquare, Plus } from 'lucide-react'
import {
  COMMISSION_STATUS_LABEL,
  DOCUMENT_TYPES,
  ORDER_STATUS_LABEL,
  SHIPMENT_STATUS_LABEL,
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
  OrderStatus,
  ShipmentStatus,
} from '@/data/types'
import { Badge, EmptyState, InlineError, Panel, PanelHeader, WriteButton } from './primitives'
import { Dialog, DialogFooterActions } from './overlays'
import { DateInput, FormGrid, FormRow, Input, Select, Textarea } from './form'

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

// ------------------------------------------------------------- documents

/** The document types that sensibly belong to each kind of record. */
const DOC_TYPES_BY_ENTITY: Partial<Record<DocumentEntityType, string[]>> = {
  ENGAGEMENT: ['QUOTATION', 'COA', 'SPEC', 'APPROVAL_LETTER', 'STABILITY', 'MSDS', 'OTHER'],
  CLIENT_ORDER: ['INDENT_DOC', 'INVOICE', 'OTHER'],
  INDENT: ['INDENT_DOC', 'LC_DOC', 'INVOICE', 'OTHER'],
  SHIPMENT: ['BL_AWB', 'INVOICE', 'COA', 'OTHER'],
  BATCH: ['COA', 'OTHER'],
  COMPANY: ['AGREEMENT', 'GMP', 'WHO_GMP', 'OTHER'],
}

/** The documents filed against one record, with an attach action. */
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
        icon={<FileText className="h-4 w-4" />}
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
            description={emptyHint ?? 'Documents are filed against the record they belong to.'}
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
  const allowed = DOC_TYPES_BY_ENTITY[entityType]
  const types = allowed ? DOCUMENT_TYPES.filter((t) => allowed.includes(t.code)) : DOCUMENT_TYPES
  const options = types.map((t) => ({ value: t.code, label: t.name }))
  const [typeCode, setTypeCode] = React.useState(options[0]?.value ?? 'OTHER')
  const [title, setTitle] = React.useState('')
  const [reference, setReference] = React.useState('')
  const [issuedOn, setIssuedOn] = React.useState(todayIso())
  const [expiresOn, setExpiresOn] = React.useState('')
  const [busy, setBusy] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)

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
      description="The prototype records the document's details; no file is stored. A newer document of the same type supersedes the one it replaces, and both stay on the record."
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
          <FormRow label="Expires on" hint="Only for documents that lapse, such as an LC or a certificate.">
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
  { value: 'VISIT', label: 'Visit' },
  { value: 'TASK', label: 'Task' },
]

/** What has been said and done on this record, newest first. */
export function ActivityPanel({
  entityType,
  entityId,
  title = 'Activity',
  subtitle,
  emptyHint,
}: {
  entityType: string
  entityId: string
  title?: string
  subtitle?: string
  emptyHint?: string
}) {
  const db = useDb()
  const [open, setOpen] = React.useState(false)
  const [kind, setKind] = React.useState<ActivityKind>('NOTE')
  const [subject, setSubject] = React.useState('')
  const [body, setBody] = React.useState('')
  const [followUp, setFollowUp] = React.useState('')
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
          followUpDate: followUp || null,
          isCompleted: kind !== 'TASK' && !followUp,
        }),
      { success: 'Logged against this record.', onError: setError },
    )
    setBusy(false)
    if (ok) {
      setOpen(false)
      setSubject('')
      setBody('')
      setFollowUp('')
    }
  }

  return (
    <Panel>
      <PanelHeader
        title={title}
        subtitle={subtitle}
        icon={<MessageSquare className="h-4 w-4" />}
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
            description={
              emptyHint ??
              'A call, an email, a query from the client: record it here and the next person to open the record sees it.'
            }
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
              {a.followUpDate && !a.isCompleted ? (
                <p className="mt-1 text-2xs text-warn-600">Follow up by {fmtDate(a.followUpDate)}</p>
              ) : null}
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
              <Input value={subject} onChange={(e) => setSubject(e.target.value)} placeholder="Client confirmed the sample arrived" />
            </FormRow>
          </FormGrid>
          <FormRow label="Detail">
            <Textarea value={body} onChange={(e) => setBody(e.target.value)} rows={3} />
          </FormRow>
          <FormRow label="Follow up by" hint="Optional. Leaves the entry open until then.">
            <DateInput value={followUp} min={todayIso()} onChange={(e) => setFollowUp(e.target.value)} />
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
