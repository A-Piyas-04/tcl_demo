/**
 * Expiring and expired documents (FR-M10-03, AC-15).
 *
 * The whole point is a warning before a shipment is held, not after, so the
 * list is ordered by urgency and grouped into what is already gone, what goes
 * this quarter and what goes next. Read-only, with a logged export.
 */

import * as React from 'react'
import { Link } from 'react-router-dom'
import { CalendarClock, CheckCircle2, FileWarning } from 'lucide-react'
import { useDb, useSettings } from '@/data/store'
import { documentRows, userName, type DocumentRow } from '@/data/selectors'
import { documentTypeName } from '@/data/reference'
import { logExport } from '@/data/api'
import { useAsyncData } from '@/lib/hooks'
import { downloadCsv, fmtDate, pluralise } from '@/lib/utils'
import {
  Badge,
  EmptyState,
  LinkButton,
  Panel,
  PanelHeader,
  PageHeading,
  SkeletonText,
} from '@/components/ui'
import { ExportButton, ReportNote, StatCell, StatGrid } from './shared'
import { SectionNav } from '@/layout/sections'

interface Bucket {
  key: string
  title: string
  subtitle: string
  tone: 'danger' | 'warn' | 'neutral'
  rows: DocumentRow[]
}

export function ExpiringDocuments() {
  const db = useDb()
  const settings = useSettings()

  const { data: buckets, loading } = useAsyncData<Bucket[]>(() => {
    const rows = documentRows(db, { expiringOnly: true }).sort(
      (a, b) => (a.daysRemaining ?? 0) - (b.daysRemaining ?? 0),
    )
    return [
      {
        key: 'expired',
        title: 'Already expired',
        subtitle: 'Supply can be stopped at customs on any of these',
        tone: 'danger',
        rows: rows.filter((r) => (r.daysRemaining ?? 0) < 0),
      },
      {
        key: '30',
        title: 'Within 30 days',
        subtitle: 'Chase the manufacturer now',
        tone: 'warn',
        rows: rows.filter((r) => (r.daysRemaining ?? 0) >= 0 && (r.daysRemaining ?? 0) <= 30),
      },
      {
        key: 'later',
        title: 'Later in the warning window',
        subtitle: 'Renewals to raise at the next review',
        tone: 'neutral',
        rows: rows.filter((r) => (r.daysRemaining ?? 0) > 30),
      },
    ]
  }, [])

  const all = React.useMemo(() => (buckets ?? []).flatMap((b) => b.rows), [buckets])

  const exportRows = () => {
    downloadExport(all)
    void logExport('expiring documents', '', all.length)
  }

  return (
    <div className="space-y-4">
      <div>
        <PageHeading
          title="Reports"
          subtitle="Expiring documents: a warning before a shipment is held, not after."
          meta={
            <>
              <Badge tone="neutral">{pluralise(all.length, 'document')}</Badge>
              <Badge tone="accent">Window {settings.docExpiryWarnDays} days</Badge>
            </>
          }
          actions={
            <>
              <LinkButton to="/documents" variant="secondary" size="md">
                Whole library
              </LinkButton>
              <ExportButton onClick={exportRows} disabled={all.length === 0} />
            </>
          }
        />
        <SectionNav section="reports" />
      </div>

      <StatGrid>
        {(buckets ?? []).map((bucket) => (
          <StatCell
            key={bucket.key}
            label={bucket.title}
            value={bucket.rows.length}
            tone={bucket.rows.length === 0 ? 'default' : bucket.tone === 'neutral' ? 'default' : bucket.tone}
            hint={bucket.subtitle}
          />
        ))}
        <StatCell
          label="Soonest expiry"
          value={all[0] ? fmtDate(all[0].document.expiresOn) : '—'}
          hint={all[0] ? `${all[0].document.title}, on ${all[0].parentLabel}` : 'Nothing inside the window'}
        />
      </StatGrid>

      {loading || !buckets ? (
        <Panel className="p-4">
          <SkeletonText lines={8} />
        </Panel>
      ) : all.length === 0 ? (
        <Panel className="p-4">
          <EmptyState
            icon={<CheckCircle2 className="h-5 w-5 text-ok-600" />}
            title="Nothing expires inside the window"
            description={`No document expires within ${settings.docExpiryWarnDays} days and none has lapsed. The window is set in administration.`}
            action={
              <LinkButton to="/documents" variant="primary" size="sm">
                Open the document library
              </LinkButton>
            }
          />
        </Panel>
      ) : (
        <div className="space-y-4">
          {buckets
            .filter((bucket) => bucket.rows.length > 0)
            .map((bucket) => (
              <Panel key={bucket.key}>
                <PanelHeader
                  title={bucket.title}
                  subtitle={bucket.subtitle}
                  icon={
                    bucket.key === 'expired' ? (
                      <FileWarning className="h-4 w-4 text-danger-600" />
                    ) : (
                      <CalendarClock className="h-4 w-4" />
                    )
                  }
                  actions={<Badge tone={bucket.tone === 'neutral' ? 'neutral' : bucket.tone}>{bucket.rows.length}</Badge>}
                />
                <ul className="divide-y divide-paper-200">
                  {bucket.rows.map((row) => (
                    <li key={row.document.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 px-4 py-2.5">
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium text-ink-900">{row.document.title}</p>
                        <p className="truncate text-xs text-ink-500">
                          {documentTypeName(row.document.typeCode)}
                          {row.document.referenceNumber ? ` · ${row.document.referenceNumber}` : ''} · uploaded by{' '}
                          {userName(db, row.document.uploadedByUserId)}
                        </p>
                      </div>
                      {row.parentHref ? (
                        <Link
                          to={row.parentHref}
                          className="max-w-[16rem] truncate text-xs font-medium text-accent-700 hover:underline"
                        >
                          {row.parentLabel}
                        </Link>
                      ) : (
                        <span className="max-w-[16rem] truncate text-xs text-ink-600">{row.parentLabel}</span>
                      )}
                      <span className="w-24 text-right text-xs tabular text-ink-600">
                        {fmtDate(row.document.expiresOn)}
                      </span>
                      <span className="w-24 text-right text-xs tabular">
                        {(row.daysRemaining ?? 0) < 0 ? (
                          <span className="font-semibold text-danger-700">
                            {Math.abs(row.daysRemaining ?? 0)} days ago
                          </span>
                        ) : (
                          <span className="text-warn-600">in {row.daysRemaining} days</span>
                        )}
                      </span>
                    </li>
                  ))}
                </ul>
              </Panel>
            ))}
        </div>
      )}

      <ReportNote>
        Only the current version of a document counts here. A superseded version is kept for the record and left out of
        expiry reporting.
      </ReportNote>
    </div>
  )
}

/** The column set is particular to this report, so the export is built here. */
function downloadExport(rows: DocumentRow[]) {
  downloadCsv(
    'expiring-documents',
    ['Document', 'Type', 'Reference', 'Belongs to', 'Issued on', 'Expires on', 'Days remaining', 'State'],
    rows.map((r) => [
      r.document.title,
      documentTypeName(r.document.typeCode),
      r.document.referenceNumber,
      r.parentLabel,
      r.document.issuedOn,
      r.document.expiresOn,
      r.daysRemaining,
      r.state === 'expired' ? 'Expired' : 'Expiring',
    ]),
  )
}
