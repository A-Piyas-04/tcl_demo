/**
 * Audit and security logs (FR-M13-01, FR-M13-02, NFR-SE-10).
 *
 * Read-only for everyone, including Full Access, because an audit trail that
 * can be edited from inside the application is not an audit trail. Two logs are
 * kept apart on purpose: data changes, and the reads that have to be
 * accountable.
 */

import * as React from 'react'
import { History, Search, ShieldAlert } from 'lucide-react'
import { useDb } from '@/data/store'
import { userName } from '@/data/selectors'
import { logExport } from '@/data/api'
import { useDebounced, useUrlFilters } from '@/lib/hooks'
import { fmtDateTime, fmtNumber, pluralise } from '@/lib/utils'
import type { AuditEntry, SecurityEntry } from '@/data/types'
import {
  Badge,
  Button,
  Column,
  DataTable,
  DateInput,
  EmptyState,
  Field,
  FieldGrid,
  LinkButton,
  Panel,
  PanelHeader,
  PageHeading,
  SearchInput,
  Select,
  Tab,
  TabList,
  TabPanel,
  Tabs,
} from '@/components/ui'

const ACTION_LABEL: Record<AuditEntry['action'], string> = {
  INSERT: 'Insert',
  UPDATE: 'Update',
  DELETE: 'Delete',
}

const EVENT_LABEL: Record<SecurityEntry['eventType'], string> = {
  LOGIN: 'Sign-in',
  LOGIN_FAIL: 'Failed sign-in',
  PERMISSION_DENIED: 'Permission denied',
  EXPORT: 'Export',
  CROSS_CLIENT_VIEW: 'Cross-client view',
  ROLE_CHANGE: 'Role change',
}

const EVENT_TONE: Record<SecurityEntry['eventType'], 'neutral' | 'ok' | 'warn' | 'danger' | 'accent' | 'info'> = {
  LOGIN: 'neutral',
  LOGIN_FAIL: 'danger',
  PERMISSION_DENIED: 'danger',
  EXPORT: 'info',
  CROSS_CLIENT_VIEW: 'warn',
  ROLE_CHANGE: 'accent',
}

/** Anything written in the last few minutes is from this session's work. */
const RECENT_MS = 5 * 60 * 1000
const isRecent = (iso: string) => Date.now() - new Date(iso).getTime() < RECENT_MS

const DEFAULTS = {
  tab: 'data',
  q: '',
  user: '',
  table: '',
  action: '',
  event: '',
  from: '',
  to: '',
}

export function AuditLog() {
  const db = useDb()
  const { values, setValue, clear, activeCount, queryString } = useUrlFilters(DEFAULTS)
  const [search, setSearch] = React.useState(values.q)
  const debounced = useDebounced(search, 180)

  React.useEffect(() => {
    setValue('q', debounced)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [debounced])

  const tab = values.tab === 'security' ? 'security' : 'data'

  const inRange = React.useCallback(
    (iso: string) => {
      const day = iso.slice(0, 10)
      if (values.from && day < values.from) return false
      if (values.to && day > values.to) return false
      return true
    },
    [values.from, values.to],
  )

  const q = values.q.trim().toLowerCase()

  const auditRows = React.useMemo(
    () =>
      db.audit.filter((e) => {
        if (values.user && e.userId !== values.user) return false
        if (values.table && e.tableName !== values.table) return false
        if (values.action && e.action !== values.action) return false
        if (!inRange(e.occurredAt)) return false
        if (q) {
          const haystack = `${e.recordLabel} ${e.tableName} ${userName(db, e.userId)} ${Object.keys(
            e.changedFields ?? {},
          ).join(' ')}`.toLowerCase()
          if (!haystack.includes(q)) return false
        }
        return true
      }),
    [db, values.user, values.table, values.action, q, inRange],
  )

  const securityRows = React.useMemo(
    () =>
      db.security.filter((e) => {
        if (values.user && e.userId !== values.user) return false
        if (values.event && e.eventType !== values.event) return false
        if (!inRange(e.occurredAt)) return false
        if (q && !`${e.detail} ${userName(db, e.userId)}`.toLowerCase().includes(q)) return false
        return true
      }),
    [db, values.user, values.event, q, inRange],
  )

  const tables = React.useMemo(
    () => Array.from(new Set(db.audit.map((e) => e.tableName))).sort(),
    [db.audit],
  )

  const whenColumn = <T extends { id: string; occurredAt: string }>(): Column<T> => ({
    key: 'when',
    header: 'When',
    pinned: true,
    sortable: true,
    width: '12rem',
    value: (r) => r.occurredAt,
    cell: (r) => (
      <span className="flex items-center gap-2">
        <span className="tabular text-xs text-ink-700">{fmtDateTime(r.occurredAt)}</span>
        {isRecent(r.occurredAt) ? <Badge tone="accent">New</Badge> : null}
      </span>
    ),
  })

  const auditColumns: Column<AuditEntry>[] = [
    whenColumn<AuditEntry>(),
    {
      key: 'user',
      header: 'User',
      sortable: true,
      width: '10rem',
      value: (r) => userName(db, r.userId),
      cell: (r) => <span className="truncate text-xs text-ink-700">{userName(db, r.userId)}</span>,
    },
    {
      key: 'action',
      header: 'Action',
      sortable: true,
      width: '7rem',
      value: (r) => r.action,
      cell: (r) => (
        <Badge tone={r.action === 'DELETE' ? 'danger' : r.action === 'INSERT' ? 'ok' : 'neutral'}>
          {ACTION_LABEL[r.action]}
        </Badge>
      ),
    },
    {
      key: 'table',
      header: 'Table',
      sortable: true,
      width: '10rem',
      value: (r) => r.tableName,
      cell: (r) => <span className="font-mono text-xs text-ink-600">{r.tableName}</span>,
    },
    {
      key: 'record',
      header: 'Record',
      sortable: true,
      value: (r) => r.recordLabel,
      cell: (r) => <span className="truncate text-sm text-ink-800">{r.recordLabel}</span>,
    },
    {
      key: 'changes',
      header: 'Changed fields',
      value: (r) => formatChanges(r.changedFields),
      cell: (r) => {
        const entries = Object.entries(r.changedFields ?? {})
        if (entries.length === 0) {
          return <span className="text-xs text-ink-400">{r.action === 'INSERT' ? 'New record' : '—'}</span>
        }
        return (
          <span className="flex flex-col gap-0.5">
            {entries.slice(0, 3).map(([field, change]) => (
              <span key={field} className="text-2xs leading-snug text-ink-600">
                <span className="font-medium text-ink-700">{field}</span>: {display(change.old)}{' '}
                <span className="text-ink-400">→</span> {display(change.new)}
              </span>
            ))}
            {entries.length > 3 ? (
              <span className="text-2xs text-ink-400">and {entries.length - 3} more</span>
            ) : null}
          </span>
        )
      },
    },
  ]

  const securityColumns: Column<SecurityEntry>[] = [
    whenColumn<SecurityEntry>(),
    {
      key: 'event',
      header: 'Event',
      sortable: true,
      width: '11rem',
      value: (r) => r.eventType,
      cell: (r) => <Badge tone={EVENT_TONE[r.eventType]}>{EVENT_LABEL[r.eventType]}</Badge>,
    },
    {
      key: 'user',
      header: 'User',
      sortable: true,
      width: '10rem',
      value: (r) => userName(db, r.userId),
      cell: (r) => <span className="truncate text-xs text-ink-700">{userName(db, r.userId)}</span>,
    },
    {
      key: 'detail',
      header: 'Detail',
      value: (r) => r.detail,
      cell: (r) => <span className="text-sm leading-snug text-ink-800">{r.detail}</span>,
    },
    {
      key: 'rows',
      header: 'Rows',
      align: 'right',
      sortable: true,
      width: '6rem',
      value: (r) => r.rowCount,
      cell: (r) => (
        <span className="tabular text-xs text-ink-600">{r.rowCount == null ? '—' : fmtNumber(r.rowCount)}</span>
      ),
    },
  ]

  const userOptions = db.users.map((u) => ({ value: u.id, label: u.fullName }))
  const filtersOn = activeCount > 0

  return (
    <div className="space-y-4">
      <PageHeading
        title="Audit log"
        subtitle="What changed, who changed it, and which accountable reads happened."
        meta={
          <>
            <Badge tone="neutral">{pluralise(db.audit.length, 'data change')}</Badge>
            <Badge tone="neutral">{pluralise(db.security.length, 'security entry', 'security entries')}</Badge>
            <Badge tone="outline">Read-only for both roles</Badge>
          </>
        }
      />

      <Panel>
        <Tabs value={tab} onValueChange={(v) => setValue('tab', v)}>
          <TabList className="px-3 pt-1">
            <Tab value="data">Data changes</Tab>
            <Tab value="security">Security and access</Tab>
          </TabList>

          <div className="grid gap-2.5 border-b border-paper-200 p-3 sm:grid-cols-2 lg:grid-cols-4">
            <SearchInput
              value={search}
              onChange={setSearch}
              placeholder="Record, field or detail…"
              className="sm:col-span-2 lg:col-span-1"
            />
            <Select
              value={values.user}
              onChange={(v) => setValue('user', v)}
              allowEmpty
              emptyLabel="Any user"
              placeholder="Any user"
              options={userOptions}
            />
            {tab === 'data' ? (
              <>
                <Select
                  value={values.table}
                  onChange={(v) => setValue('table', v)}
                  allowEmpty
                  emptyLabel="Any table"
                  placeholder="Any table"
                  options={tables.map((t) => ({ value: t, label: t }))}
                />
                <Select
                  value={values.action}
                  onChange={(v) => setValue('action', v)}
                  allowEmpty
                  emptyLabel="Any action"
                  placeholder="Any action"
                  options={(Object.keys(ACTION_LABEL) as AuditEntry['action'][]).map((a) => ({
                    value: a,
                    label: ACTION_LABEL[a],
                  }))}
                />
              </>
            ) : (
              <Select
                value={values.event}
                onChange={(v) => setValue('event', v)}
                allowEmpty
                emptyLabel="Any event type"
                placeholder="Any event type"
                options={(Object.keys(EVENT_LABEL) as SecurityEntry['eventType'][]).map((e) => ({
                  value: e,
                  label: EVENT_LABEL[e],
                }))}
              />
            )}
            <div className="flex items-center gap-2">
              <DateInput
                value={values.from}
                aria-label="From date"
                onChange={(e) => setValue('from', e.target.value)}
              />
              <span className="text-xs text-ink-400">to</span>
              <DateInput value={values.to} aria-label="To date" onChange={(e) => setValue('to', e.target.value)} />
            </div>
            {filtersOn ? (
              <div className="flex items-center">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    clear()
                    setSearch('')
                  }}
                >
                  Clear filters
                </Button>
              </div>
            ) : null}
          </div>

          <TabPanel value="data">
            <DataTable
              rows={auditRows}
              columns={auditColumns}
              rowKey={(r) => r.id}
              pageSize={25}
              exportName="audit-data-changes"
              exportFilters={queryString}
              onExport={(count) => void logExport('audit log: data changes', queryString, count)}
              rowTone={(r) => (isRecent(r.occurredAt) ? 'bg-accent-50/40' : undefined)}
              toolbar={
                <span className="flex items-center gap-2 text-xs text-ink-500">
                  <History className="h-3.5 w-3.5" />
                  {pluralise(auditRows.length, 'entry', 'entries')}
                  <span className="text-ink-400">Immutable, retained for ten years</span>
                </span>
              }
              empty={
                <EmptyState
                  icon={<Search className="h-5 w-5" />}
                  title={filtersOn ? 'No change matches these filters' : 'No data changes recorded yet'}
                  description={
                    filtersOn
                      ? 'Try widening the date range, or clearing the table and action filters.'
                      : 'Every create, update and delete writes an entry here as soon as it happens.'
                  }
                  action={
                    filtersOn ? (
                      <Button
                        variant="secondary"
                        size="sm"
                        onClick={() => {
                          clear()
                          setSearch('')
                        }}
                      >
                        Clear filters
                      </Button>
                    ) : (
                      <LinkButton to="/products" variant="secondary" size="sm">
                        Go and change something
                      </LinkButton>
                    )
                  }
                />
              }
            />
          </TabPanel>

          <TabPanel value="security">
            <DataTable
              rows={securityRows}
              columns={securityColumns}
              rowKey={(r) => r.id}
              pageSize={25}
              exportName="audit-security"
              exportFilters={queryString}
              onExport={(count) => void logExport('audit log: security and access', queryString, count)}
              rowTone={(r) => (isRecent(r.occurredAt) ? 'bg-accent-50/40' : undefined)}
              toolbar={
                <span className="flex items-center gap-2 text-xs text-ink-500">
                  <ShieldAlert className="h-3.5 w-3.5" />
                  {pluralise(securityRows.length, 'entry', 'entries')}
                  <span className="text-ink-400">Retained for one year</span>
                </span>
              }
              empty={
                <EmptyState
                  icon={<ShieldAlert className="h-5 w-5" />}
                  title={filtersOn ? 'No event matches these filters' : 'No security events recorded yet'}
                  description={
                    filtersOn
                      ? 'Sign-ins, exports and cross-client views all land here, so widening the date range usually helps.'
                      : 'Signing in, exporting a list and opening the cross-client view each write an entry here.'
                  }
                  action={
                    filtersOn ? (
                      <Button
                        variant="secondary"
                        size="sm"
                        onClick={() => {
                          clear()
                          setSearch('')
                        }}
                      >
                        Clear filters
                      </Button>
                    ) : (
                      <LinkButton to="/products" variant="secondary" size="sm">
                        Export a list and come back
                      </LinkButton>
                    )
                  }
                />
              }
            />
          </TabPanel>
        </Tabs>
      </Panel>

      <div className="grid gap-3 lg:grid-cols-2">
        <Panel>
          <PanelHeader title="Why there are two logs" icon={<History className="h-4 w-4" />} />
          <div className="space-y-3 p-3.5">
            <FieldGrid cols={2}>
              <Field label="Data changes">Every insert, update and delete on a business record, field by field</Field>
              <Field label="Security and access">
                Sign-ins, failed sign-ins, refused requests, role changes, exports and cross-client views
              </Field>
              <Field label="Data changes kept for">Ten years</Field>
              <Field label="Security kept for">One year</Field>
            </FieldGrid>
            <p className="text-xs leading-relaxed text-ink-500">
              A read changes nothing, so it writes no data-change entry. The two reads that still have to be
              accountable, the cross-client view and every export, are written to the security log instead, with the
              filters used and the number of rows. Exporting either log is itself an export, so it appears in the
              security log a moment later.
            </p>
          </div>
        </Panel>

        <Panel>
          <PanelHeader title="Nobody can edit this" icon={<ShieldAlert className="h-4 w-4" />} />
          <div className="space-y-3 p-3.5 text-xs leading-relaxed text-ink-600">
            <p>
              There is no edit or delete action on either log, for Full Access as much as for View Only. An entry can be
              read, filtered and exported, and that is all the application offers.
            </p>
            <p>
              Both roles can open this page, which is deliberate: cross-client visibility is open across the business
              and is managed by this trail rather than by permissions, so the trail has to be as visible as the data it
              covers.
            </p>
          </div>
        </Panel>
      </div>
    </div>
  )
}

const display = (value: unknown): string => {
  if (value === null || value === undefined || value === '') return 'empty'
  if (typeof value === 'boolean') return value ? 'yes' : 'no'
  return String(value)
}

const formatChanges = (changed: AuditEntry['changedFields']): string =>
  Object.entries(changed ?? {})
    .map(([field, change]) => `${field}: ${display(change.old)} → ${display(change.new)}`)
    .join('; ')
