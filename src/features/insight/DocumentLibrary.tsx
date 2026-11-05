/**
 * The document library (module M10, UC-15).
 *
 * Every certificate, filing, specification and letter TCL holds, with the
 * record it belongs to, its validity and its version. A newer document of the
 * same type on the same parent supersedes the previous one without deleting it,
 * and only the current version counts toward expiry reporting (FR-M10-05).
 *
 * Uploading needs Full Access, so the control is absent for a View Only
 * session. Exporting is open to both roles and is logged.
 */

import * as React from 'react'
import { Link } from 'react-router-dom'
import { motion } from 'framer-motion'
import { FileText, FileWarning, Paperclip, Plus, Trash2, Upload } from 'lucide-react'
import { useDb, useSettings } from '@/data/store'
import { certificatesForSource, documentRows, engagementRows, sourceRows, userName, type DocumentRow } from '@/data/selectors'
import { DOCUMENT_TYPES, REGULATORY_AUTHORITIES, documentTypeName } from '@/data/reference'
import { logExport, removeDocument, uploadDocument } from '@/data/api'
import { runAction, useAsyncData, useUrlFilters } from '@/lib/hooks'
import { fileSize, fmtDate, fmtDateTime, pluralise } from '@/lib/utils'
import type { DocumentEntityType, ID } from '@/data/types'
import {
  Badge,
  Button,
  Column,
  Combobox,
  ConfirmDialog,
  DataTable,
  DateInput,
  Dialog,
  DialogFooterActions,
  EmptyState,
  FormGrid,
  FormRow,
  InlineError,
  Input,
  LinkButton,
  NameCell,
  Panel,
  PanelHeader,
  PageHeading,
  Select,
  Tooltip,
  WriteButton,
  WriteOnly,
} from '@/components/ui'
import { ReportNote, StatCell, StatGrid } from './shared'

// ------------------------------------------------------------------ labels

const PARENT_KINDS: { value: DocumentEntityType; label: string; belongs: string }[] = [
  { value: 'COMPANY_SITE', label: 'Site (plant or office)', belongs: 'GMP and WHO-GMP plant certificates' },
  { value: 'MANUFACTURER_PRODUCT', label: 'Source (manufacturer product)', belongs: 'DMF, CEP, MSDS, specification, stability data' },
  { value: 'BATCH', label: 'Batch', belongs: 'Certificates of analysis' },
  { value: 'ENGAGEMENT', label: 'Engagement', belongs: 'Client approval letters' },
  { value: 'COMPANY', label: 'Company', belongs: 'Agency agreements and quotations' },
]

const parentKindLabel = (value: string) => PARENT_KINDS.find((p) => p.value === value)?.label ?? value

/** The parent each document type belongs on, stated in the upload dialog. */
const TYPE_HOME: Record<string, DocumentEntityType> = {
  GMP: 'COMPANY_SITE',
  WHO_GMP: 'COMPANY_SITE',
  DMF: 'MANUFACTURER_PRODUCT',
  CEP: 'MANUFACTURER_PRODUCT',
  MSDS: 'MANUFACTURER_PRODUCT',
  SPEC: 'MANUFACTURER_PRODUCT',
  STABILITY: 'MANUFACTURER_PRODUCT',
  COA: 'BATCH',
  APPROVAL_LETTER: 'ENGAGEMENT',
  AGREEMENT: 'COMPANY',
  QUOTATION: 'COMPANY',
}

const STATE_LABEL: Record<DocumentRow['state'], string> = {
  valid: 'Valid',
  expiring: 'Expiring',
  expired: 'Expired',
  'not-expiring': 'Does not expire',
  superseded: 'Superseded',
}

function StateBadge({ row }: { row: DocumentRow }) {
  if (row.state === 'expired') return <Badge tone="danger">Expired</Badge>
  if (row.state === 'expiring') return <Badge tone="warn">Expiring</Badge>
  if (row.state === 'superseded') return <Badge tone="neutral">Superseded</Badge>
  if (row.state === 'not-expiring') return <Badge tone="outline">Does not expire</Badge>
  return <Badge tone="ok">Valid</Badge>
}

const DEFAULTS = { type: '', state: '', entity: '', expiring: '' }

// ------------------------------------------------------------------- screen

export function DocumentLibrary() {
  const db = useDb()
  const { values, setValue, clear, activeCount, queryString } = useUrlFilters(DEFAULTS)
  const [uploadOpen, setUploadOpen] = React.useState(false)
  const [removing, setRemoving] = React.useState<DocumentRow | null>(null)
  const [busy, setBusy] = React.useState(false)

  const { data: rows, loading } = useAsyncData<DocumentRow[]>(() => {
    let all = documentRows(db, { typeCode: values.type || undefined })
    if (values.entity) all = all.filter((r) => r.document.entityType === values.entity)
    if (values.expiring === '1') all = all.filter((r) => r.state === 'expiring' || r.state === 'expired')
    if (values.state) all = all.filter((r) => r.state === values.state)
    return all
  }, [values])

  /** The document that replaced this one, and the one it replaced. */
  const replacement = (row: DocumentRow) =>
    row.document.supersededById ? db.documents.find((d) => d.id === row.document.supersededById) : undefined
  const predecessor = (row: DocumentRow) => db.documents.find((d) => d.supersededById === row.document.id)

  const counts = React.useMemo(() => {
    const all = documentRows(db)
    return {
      total: all.length,
      expiring: all.filter((r) => r.state === 'expiring').length,
      expired: all.filter((r) => r.state === 'expired').length,
      superseded: all.filter((r) => r.state === 'superseded').length,
    }
  }, [db])

  const columns: Column<DocumentRow>[] = [
    {
      key: 'title',
      header: 'Document',
      pinned: true,
      sortable: true,
      value: (r) => r.document.title,
      cell: (r) => (
        <NameCell
          title={r.document.title}
          subtitle={`${r.document.fileName} · ${fileSize(r.document.fileSizeBytes)}`}
          badge={
            r.document.versionNo > 1 ? (
              <Tooltip content={`Version ${r.document.versionNo}. Earlier versions are kept, not deleted.`}>
                <span>
                  <Badge tone="neutral">v{r.document.versionNo}</Badge>
                </span>
              </Tooltip>
            ) : undefined
          }
        />
      ),
    },
    {
      key: 'type',
      header: 'Type',
      sortable: true,
      width: '11rem',
      value: (r) => documentTypeName(r.document.typeCode),
      cell: (r) => <span className="text-xs text-ink-700">{documentTypeName(r.document.typeCode)}</span>,
    },
    {
      key: 'parent',
      header: 'Belongs to',
      sortable: true,
      value: (r) => r.parentLabel,
      cell: (r) =>
        r.parentHref ? (
          <Link
            to={r.parentHref}
            className="truncate text-xs font-medium text-accent-700 hover:underline"
            onClick={(e) => e.stopPropagation()}
          >
            {r.parentLabel}
          </Link>
        ) : (
          <span className="truncate text-xs text-ink-600">{r.parentLabel}</span>
        ),
    },
    {
      key: 'kind',
      header: 'Parent kind',
      optional: true,
      width: '9rem',
      value: (r) => parentKindLabel(r.document.entityType),
      cell: (r) => <span className="text-xs text-ink-500">{parentKindLabel(r.document.entityType)}</span>,
    },
    {
      key: 'reference',
      header: 'Reference',
      optional: true,
      value: (r) => r.document.referenceNumber,
      cell: (r) => (
        <span className="font-mono text-[0.75rem] tabular text-ink-600">{r.document.referenceNumber ?? '—'}</span>
      ),
    },
    {
      key: 'authority',
      header: 'Issuing authority',
      optional: true,
      value: (r) => r.document.issuingAuthority,
      cell: (r) => <span className="truncate text-xs text-ink-600">{r.document.issuingAuthority ?? '—'}</span>,
    },
    {
      key: 'issued',
      header: 'Issued',
      sortable: true,
      width: '7.5rem',
      value: (r) => r.document.issuedOn,
      cell: (r) => <span className="text-xs tabular text-ink-600">{fmtDate(r.document.issuedOn)}</span>,
    },
    {
      key: 'expires',
      header: 'Expires',
      sortable: true,
      width: '7.5rem',
      value: (r) => r.document.expiresOn,
      cell: (r) => <span className="text-xs tabular text-ink-600">{fmtDate(r.document.expiresOn)}</span>,
    },
    {
      key: 'days',
      header: 'Days left',
      align: 'right',
      sortable: true,
      width: '6.5rem',
      value: (r) => r.daysRemaining,
      cell: (r) =>
        r.daysRemaining == null ? (
          <span className="text-xs text-ink-400">—</span>
        ) : r.daysRemaining < 0 ? (
          <span className="text-xs font-medium tabular text-danger-700">{Math.abs(r.daysRemaining)} overdue</span>
        ) : (
          <span className={`text-xs tabular ${r.daysRemaining <= 90 ? 'font-medium text-warn-600' : 'text-ink-600'}`}>
            {r.daysRemaining}
          </span>
        ),
    },
    {
      key: 'state',
      header: 'State',
      sortable: true,
      width: '11rem',
      value: (r) => STATE_LABEL[r.state],
      cell: (r) => {
        const newer = replacement(r)
        const older = predecessor(r)
        return (
          <span className="flex flex-col items-start gap-0.5">
            <StateBadge row={r} />
            {newer ? (
              <span className="text-[10px] text-ink-400">replaced by v{newer.versionNo}</span>
            ) : older ? (
              <span className="text-[10px] text-ink-400">supersedes v{older.versionNo}</span>
            ) : null}
          </span>
        )
      },
    },
    {
      key: 'uploaded',
      header: 'Uploaded',
      optional: true,
      value: (r) => `${userName(db, r.document.uploadedByUserId)} ${r.document.uploadedAt}`,
      cell: (r) => (
        <span className="flex flex-col text-xs leading-tight text-ink-600">
          <span>{userName(db, r.document.uploadedByUserId)}</span>
          <span className="text-[10px] text-ink-400">{fmtDateTime(r.document.uploadedAt)}</span>
        </span>
      ),
    },
    {
      key: 'actions',
      header: '',
      width: '3rem',
      align: 'right',
      cell: (r) => (
        <WriteOnly>
          <Tooltip content="Remove this document. It is marked inactive, not destroyed.">
            <Button
              variant="ghost"
              size="icon"
              aria-label="Remove document"
              onClick={(e) => {
                e.stopPropagation()
                setRemoving(r)
              }}
            >
              <Trash2 className="h-3.5 w-3.5 text-ink-400" />
            </Button>
          </Tooltip>
        </WriteOnly>
      ),
    },
  ]

  return (
    <div className="space-y-4">
      <PageHeading
        title="Documents"
        subtitle="Certificates, filings and letters, each against the record it belongs to."
        meta={
          <>
            <Badge tone="neutral">{pluralise(counts.total, 'document')}</Badge>
            {counts.expiring > 0 ? <Badge tone="warn">{counts.expiring} expiring</Badge> : null}
            {counts.expired > 0 ? <Badge tone="danger">{counts.expired} expired</Badge> : null}
          </>
        }
        actions={
          <>
            <LinkButton to="/documents/expiring" variant="secondary" size="md" icon={<FileWarning className="h-3.5 w-3.5" />}>
              Expiring
            </LinkButton>
            <WriteButton
              variant="primary"
              size="md"
              icon={<Plus className="h-3.5 w-3.5" />}
              onClick={() => setUploadOpen(true)}
            >
              Upload document
            </WriteButton>
          </>
        }
      />

      <StatGrid>
        <StatCell label="On file" value={counts.total} hint="Current and superseded versions together" />
        <StatCell
          label="Expiring within 90 days"
          value={counts.expiring}
          tone={counts.expiring > 0 ? 'warn' : 'default'}
          hint="A warning before a shipment is held, not after"
        />
        <StatCell
          label="Already expired"
          value={counts.expired}
          tone={counts.expired > 0 ? 'danger' : 'default'}
          hint="Chase the manufacturer for a renewal"
        />
        <StatCell
          label="Superseded"
          value={counts.superseded}
          hint="Kept for the record, excluded from expiry reporting"
        />
      </StatGrid>

      <Panel>
        <div className="grid gap-2.5 border-b border-paper-200 p-3 sm:grid-cols-2 lg:grid-cols-4">
          <Select
            value={values.type}
            onChange={(v) => setValue('type', v)}
            allowEmpty
            emptyLabel="Any type"
            placeholder="Any type"
            options={DOCUMENT_TYPES.map((t) => ({ value: t.code, label: t.name }))}
          />
          <Select
            value={values.state}
            onChange={(v) => setValue('state', v)}
            allowEmpty
            emptyLabel="Any state"
            placeholder="Any state"
            options={(Object.keys(STATE_LABEL) as DocumentRow['state'][]).map((s) => ({
              value: s,
              label: STATE_LABEL[s],
            }))}
          />
          <Select
            value={values.entity}
            onChange={(v) => setValue('entity', v)}
            allowEmpty
            emptyLabel="Any parent kind"
            placeholder="Any parent kind"
            options={PARENT_KINDS.map((p) => ({ value: p.value, label: p.label, description: p.belongs }))}
          />
          <div className="flex items-center gap-2">
            <Button
              variant={values.expiring === '1' ? 'primary' : 'secondary'}
              size="sm"
              onClick={() => setValue('expiring', values.expiring === '1' ? '' : '1')}
            >
              Needs attention
            </Button>
            {activeCount > 0 ? (
              <Button variant="ghost" size="sm" onClick={clear}>
                Clear
              </Button>
            ) : null}
          </div>
        </div>

        <DataTable
          rows={rows ?? []}
          columns={columns}
          rowKey={(r) => r.document.id}
          loading={loading}
          exportName="documents"
          exportFilters={queryString}
          onExport={(count) => void logExport('document library', queryString, count)}
          toolbar={
            <span className="flex items-center gap-2 text-xs text-ink-500">
              <Paperclip className="h-3.5 w-3.5" />
              {rows ? pluralise(rows.length, 'document') : '…'}
            </span>
          }
          empty={
            <EmptyState
              icon={<FileText className="h-5 w-5" />}
              title="No documents match these filters"
              description="Documents are held against the record they belong to: a plant certificate on the site, a DMF or CEP on the source, a COA on the batch."
              action={
                activeCount > 0 ? (
                  <Button variant="primary" size="sm" onClick={clear}>
                    Clear filters
                  </Button>
                ) : (
                  <WriteOnly>
                    <Button variant="primary" size="sm" onClick={() => setUploadOpen(true)}>
                      Upload a document
                    </Button>
                  </WriteOnly>
                )
              }
            />
          }
        />
      </Panel>

      <Panel>
        <PanelHeader title="Where each document belongs" subtitle="FR-M10-01, so a certificate reaches every record that needs it" />
        <ul className="grid gap-2 p-4 text-xs leading-relaxed text-ink-600 sm:grid-cols-2">
          {PARENT_KINDS.map((p) => (
            <li key={p.value}>
              <span className="font-semibold text-ink-900">{p.label}.</span> {p.belongs}.
            </li>
          ))}
        </ul>
        <ReportNote className="border-t border-paper-200 p-4">
          A plant certificate held against a site is shown on every source made at that plant, so it is recorded once
          and read everywhere.
        </ReportNote>
      </Panel>

      <WriteOnly>
        <UploadDialog open={uploadOpen} onOpenChange={setUploadOpen} />
      </WriteOnly>

      <ConfirmDialog
        open={removing !== null}
        onOpenChange={(o) => !o && setRemoving(null)}
        title="Remove this document?"
        recordName={removing?.document.title ?? ''}
        consequence="The file is marked inactive and disappears from the library. The audit trail keeps the record of it."
        confirmLabel="Remove document"
        loading={busy}
        onConfirm={() => {
          if (!removing) return
          setBusy(true)
          void runAction(() => removeDocument(removing.document.id), {
            success: 'Document removed.',
            onSuccess: () => setRemoving(null),
          }).finally(() => setBusy(false))
        }}
      />
    </div>
  )
}

// ------------------------------------------------------------ upload dialog

interface Draft {
  entityType: DocumentEntityType
  entityId: ID
  typeCode: string
  title: string
  referenceNumber: string
  issuingAuthority: string
  issuedOn: string
  expiresOn: string
  noExpiry: boolean
}

const EMPTY_DRAFT: Draft = {
  entityType: 'COMPANY_SITE',
  entityId: '',
  typeCode: 'GMP',
  title: '',
  referenceNumber: '',
  issuingAuthority: '',
  issuedOn: '',
  expiresOn: '',
  noExpiry: false,
}

const sleep = (ms: number) => new Promise<void>((resolve) => window.setTimeout(resolve, ms))

/**
 * There is no file store behind this prototype, so the transfer is simulated
 * and only the metadata is kept. The rules enforced are the real ones: the size
 * limit from settings, and an expiry that cannot precede the issue date.
 */
function UploadDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  const db = useDb()
  const settings = useSettings()
  const [draft, setDraft] = React.useState<Draft>(EMPTY_DRAFT)
  const [file, setFile] = React.useState<File | null>(null)
  const [progress, setProgress] = React.useState<number | null>(null)
  const [error, setError] = React.useState<string | null>(null)
  const fileRef = React.useRef<HTMLInputElement>(null)

  React.useEffect(() => {
    if (!open) {
      setDraft(EMPTY_DRAFT)
      setFile(null)
      setProgress(null)
      setError(null)
    }
  }, [open])

  const set = <K extends keyof Draft>(key: K, value: Draft[K]) =>
    setDraft((d) => ({ ...d, [key]: value, ...(key === 'entityType' ? { entityId: '' } : {}) }))

  /** The records of the chosen parent kind, as a type-ahead list. */
  const records = React.useMemo(() => {
    switch (draft.entityType) {
      case 'COMPANY_SITE':
        return db.sites.map((s) => ({
          value: s.id,
          label: `${db.companies.find((c) => c.id === s.companyId)?.displayName ?? ''} — ${s.name}`,
          description: `${s.kind.toLowerCase().replace('_', ' ')} · ${s.countryCode}`,
        }))
      case 'MANUFACTURER_PRODUCT':
        return sourceRows(db).map((s) => ({
          value: s.mp.id,
          label: `${s.product.genericName} — ${s.manufacturer.displayName}`,
          description: `${s.mp.grade} ${s.mp.pharmacopoeia}`,
        }))
      case 'BATCH':
        return db.batches.map((b) => ({
          value: b.id,
          label: `Batch ${b.batchNumber}`,
          description: b.expiryDate ? `expires ${fmtDate(b.expiryDate)}` : undefined,
        }))
      case 'ENGAGEMENT':
        return engagementRows(db).map((e) => ({
          value: e.engagement.id,
          label: `${e.client.displayName} — ${e.product.genericName}`,
          description: e.manufacturer.displayName,
        }))
      default:
        return db.companies.map((c) => ({ value: c.id, label: c.displayName, description: c.countryCode }))
    }
  }, [db, draft.entityType])

  const expectedParent = TYPE_HOME[draft.typeCode]
  const parentMismatch = expectedParent != null && expectedParent !== draft.entityType

  /** What is already on file for the chosen source, so a supersede is no surprise. */
  const onFileAlready = React.useMemo(() => {
    if (draft.entityType !== 'MANUFACTURER_PRODUCT' || !draft.entityId) return null
    const mp = db.manufacturerProducts.find((m) => m.id === draft.entityId)
    if (!mp) return null
    const docs = certificatesForSource(db, mp)
    return {
      total: docs.length,
      sameType: docs.filter((d) => d.document.typeCode === draft.typeCode && !d.document.supersededById).length,
    }
  }, [db, draft.entityType, draft.entityId, draft.typeCode])

  const oversize = file != null && file.size > settings.maxUploadMb * 1024 * 1024
  const badDates = Boolean(!draft.noExpiry && draft.expiresOn && draft.issuedOn && draft.expiresOn < draft.issuedOn)
  const canSubmit =
    Boolean(draft.entityId) && Boolean(draft.typeCode) && Boolean(draft.title.trim()) && file != null && !oversize && !badDates

  const submit = async (event: React.FormEvent) => {
    event.preventDefault()
    setError(null)
    if (!file) {
      setError('Choose a file to upload.')
      return
    }
    if (oversize) {
      setError(`That file is ${fileSize(file.size)}, over the ${settings.maxUploadMb} MB limit. Nothing was sent.`)
      return
    }
    if (badDates) {
      setError('The expiry date cannot be before the issue date.')
      return
    }

    // the simulated transfer, so the progress bar means something
    for (const step of [12, 38, 64, 86, 100]) {
      setProgress(step)
      await sleep(110)
    }

    const saved = await runAction(
      () =>
        uploadDocument({
          typeCode: draft.typeCode,
          entityType: draft.entityType,
          entityId: draft.entityId,
          title: draft.title.trim(),
          referenceNumber: draft.referenceNumber.trim() || null,
          issuingAuthority: draft.issuingAuthority.trim() || null,
          issuedOn: draft.issuedOn || null,
          expiresOn: draft.noExpiry ? null : draft.expiresOn || null,
          fileName: file.name,
          fileSizeBytes: file.size,
          mimeType: file.type || 'application/octet-stream',
        }),
      {
        success: (doc) => (doc.versionNo > 1 ? `Stored as version ${doc.versionNo}. The previous version is kept, marked superseded.` : 'Document stored.'),
        onError: setError,
      },
    )
    setProgress(null)
    if (saved) onOpenChange(false)
  }

  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      title="Upload a document"
      description="Hold the document against the record it belongs to, so it reaches everything that needs it."
      width="lg"
      icon={<Upload className="h-4 w-4" />}
    >
      <form id="upload-document" onSubmit={submit} className="space-y-4">
        <ReportNote>
          Plant certificates, GMP and WHO-GMP, belong on a site. DMF and CEP belong on a source. A certificate of
          analysis belongs on a batch. A client approval letter belongs on an engagement.
        </ReportNote>

        <FormGrid cols={2}>
          <FormRow label="Parent kind" required hint={PARENT_KINDS.find((p) => p.value === draft.entityType)?.belongs}>
            <Select
              value={draft.entityType}
              onChange={(v) => set('entityType', v as DocumentEntityType)}
              options={PARENT_KINDS.map((p) => ({ value: p.value, label: p.label }))}
            />
          </FormRow>
          <FormRow label="Record" required>
            <Combobox
              value={draft.entityId}
              onChange={(v) => set('entityId', v)}
              options={records}
              placeholder="Search and select the record"
              emptyMessage="No record of that kind matches."
            />
          </FormRow>
          <FormRow
            label="Document type"
            required
            error={parentMismatch ? `This type normally belongs on a ${parentKindLabel(expectedParent!).toLowerCase()}.` : null}
          >
            <Select
              value={draft.typeCode}
              onChange={(v) => set('typeCode', v)}
              options={DOCUMENT_TYPES.map((t) => ({ value: t.code, label: t.name }))}
            />
          </FormRow>
          <FormRow label="Title" required hint="What a colleague would search for">
            <Input
              value={draft.title}
              onChange={(e) => set('title', e.target.value)}
              placeholder="WHO-GMP certificate, Unit II"
            />
          </FormRow>
          <FormRow label="Reference number">
            <Input
              value={draft.referenceNumber}
              onChange={(e) => set('referenceNumber', e.target.value)}
              mono
              placeholder="R1-CEP 2019-123"
            />
          </FormRow>
          <FormRow label="Issuing authority">
            <Select
              value={draft.issuingAuthority}
              onChange={(v) => set('issuingAuthority', v)}
              allowEmpty
              emptyLabel="Not stated"
              placeholder="Not stated"
              options={REGULATORY_AUTHORITIES.map((a) => ({ value: a, label: a }))}
            />
          </FormRow>
          <FormRow label="Issued on">
            <DateInput value={draft.issuedOn} onChange={(e) => set('issuedOn', e.target.value)} />
          </FormRow>
          <FormRow
            label="Expires on"
            error={badDates ? 'The expiry date cannot be before the issue date.' : null}
            hint="A document with no expiry is left out of expiry reporting"
          >
            <div className="space-y-1.5">
              <DateInput
                value={draft.expiresOn}
                onChange={(e) => set('expiresOn', e.target.value)}
                disabled={draft.noExpiry}
                invalid={badDates}
              />
              <label className="flex cursor-pointer items-center gap-1.5 text-xs text-ink-600">
                <input
                  type="checkbox"
                  checked={draft.noExpiry}
                  onChange={(e) => set('noExpiry', e.target.checked)}
                  className="h-3.5 w-3.5 rounded border-paper-400 text-accent-600"
                />
                This document does not expire
              </label>
            </div>
          </FormRow>
        </FormGrid>

        <FormRow label="File" required hint={`Up to ${settings.maxUploadMb} MB`}>
          <div className="space-y-2">
            <input
              ref={fileRef}
              type="file"
              className="hidden"
              onChange={(e) => {
                setFile(e.target.files?.[0] ?? null)
                setError(null)
              }}
            />
            <div className="flex flex-wrap items-center gap-2">
              <Button type="button" variant="secondary" size="sm" onClick={() => fileRef.current?.click()}>
                Choose a file
              </Button>
              {file ? (
                <span className="text-xs text-ink-600">
                  {file.name} · <span className={oversize ? 'font-semibold text-danger-700' : ''}>{fileSize(file.size)}</span>
                </span>
              ) : (
                <span className="text-xs text-ink-400">No file chosen</span>
              )}
            </div>
            {oversize ? (
              <InlineError>
                That file is {fileSize(file!.size)}, over the {settings.maxUploadMb} MB limit. Nothing has been sent.
              </InlineError>
            ) : null}
            {progress != null ? (
              <div className="space-y-1">
                <div className="h-1.5 overflow-hidden rounded-full bg-paper-300/70">
                  <motion.div
                    className="h-full rounded-full bg-accent-500"
                    initial={{ width: 0 }}
                    animate={{ width: `${progress}%` }}
                    transition={{ duration: 0.2, ease: 'easeOut' }}
                  />
                </div>
                <p className="text-2xs text-ink-500">Transferring {progress}% of {file?.name}</p>
              </div>
            ) : null}
          </div>
        </FormRow>

        {onFileAlready ? (
          <ReportNote>
            This source already holds {pluralise(onFileAlready.total, 'document')}
            {onFileAlready.sameType > 0
              ? `, including a current ${documentTypeName(draft.typeCode)}, which this upload will supersede without deleting.`
              : ', counting the certificates of the plant it is made at.'}
          </ReportNote>
        ) : null}

        <InlineError>{error}</InlineError>

        <div className="flex items-center justify-end gap-2 border-t border-paper-200 pt-3">
          <DialogFooterActions
            onCancel={() => onOpenChange(false)}
            confirmLabel="Upload"
            loading={progress != null}
            disabled={!canSubmit}
            extra={
              <span className="mr-auto text-2xs text-ink-400">
                No file store sits behind this prototype, so the transfer is simulated and the metadata is stored.
              </span>
            }
          />
        </div>
      </form>
    </Dialog>
  )
}
