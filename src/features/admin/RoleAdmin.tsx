/**
 * Roles and permissions (FR-M1-04, FR-M1-05, AC-17).
 *
 * Read-only in v1, because there is nothing to edit: the two roles are seeded
 * rows and the matrix below is the whole of the access model. The matrix is
 * built from the permission lists rather than typed out, so it cannot drift
 * away from what the application actually checks.
 */

import * as React from 'react'
import { Check, KeyRound, Minus, Search } from 'lucide-react'
import { READ_ONLY_PERMISSIONS, WRITE_PERMISSIONS } from '@/data/reference'
import { useDb } from '@/data/store'
import { pluralise } from '@/lib/utils'
import {
  Badge,
  Button,
  EmptyState,
  Panel,
  PanelHeader,
  PageHeading,
  SearchInput,
} from '@/components/ui'
import { MODULE_ORDER, permissionAction, permissionRows, PrototypeNote } from './shared'

export function RoleAdmin() {
  const db = useDb()
  const [query, setQuery] = React.useState('')

  const rows = React.useMemo(() => permissionRows(), [])

  const filtered = React.useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return rows
    return rows.filter((r) => r.code.toLowerCase().includes(q) || r.module.toLowerCase().includes(q))
  }, [rows, query])

  const grouped = React.useMemo(
    () =>
      MODULE_ORDER.map((module) => ({ module, items: filtered.filter((r) => r.module === module) })).filter(
        (g) => g.items.length > 0,
      ),
    [filtered],
  )

  const counts = {
    fullAccess: db.users.filter((u) => u.roleCode === 'FULL_ACCESS' && u.isActive).length,
    viewer: db.users.filter((u) => u.roleCode === 'VIEWER' && u.isActive).length,
  }

  return (
    <div className="space-y-4">
      <PageHeading
        title="Roles and permissions"
        subtitle="Two roles, and exactly what each one carries."
        meta={
          <>
            <Badge tone="accent">{pluralise(READ_ONLY_PERMISSIONS.length, 'read permission')}</Badge>
            <Badge tone="neutral">{pluralise(WRITE_PERMISSIONS.length, 'write permission')}</Badge>
          </>
        }
      />

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Panel className="p-3.5">
          <p className="text-2xs font-semibold uppercase tracking-wider text-ink-500">Full Access</p>
          <p className="mt-2 text-3xl font-semibold leading-none tracking-tight text-accent-800">
            {READ_ONLY_PERMISSIONS.length + WRITE_PERMISSIONS.length}
          </p>
          <p className="mt-2 text-xs leading-relaxed text-ink-500">
            Every permission code. Held by {pluralise(counts.fullAccess, 'active user')}.
          </p>
        </Panel>
        <Panel className="p-3.5">
          <p className="text-2xs font-semibold uppercase tracking-wider text-ink-500">View Only</p>
          <p className="mt-2 text-3xl font-semibold leading-none tracking-tight text-ink-900">
            {READ_ONLY_PERMISSIONS.length}
          </p>
          <p className="mt-2 text-xs leading-relaxed text-ink-500">
            The read and export codes, and nothing else. Held by {pluralise(counts.viewer, 'active user')}.
          </p>
        </Panel>
        <Panel className="p-3.5">
          <p className="text-2xs font-semibold uppercase tracking-wider text-ink-500">Modules covered</p>
          <p className="mt-2 text-3xl font-semibold leading-none tracking-tight text-ink-900">{MODULE_ORDER.length}</p>
          <p className="mt-2 text-xs leading-relaxed text-ink-500">
            The module is read from the code prefix, so a new permission groups itself.
          </p>
        </Panel>
        <Panel className="p-3.5">
          <p className="text-2xs font-semibold uppercase tracking-wider text-ink-500">Editable here</p>
          <p className="mt-2 text-3xl font-semibold leading-none tracking-tight text-ink-900">0</p>
          <p className="mt-2 text-xs leading-relaxed text-ink-500">
            Read-only in v1. Both roles can read this page.
          </p>
        </Panel>
      </div>

      <PrototypeNote title="Roles are data, not code">
        A third role would be seeded rows in the role and permission tables, not a schema change and not a code change.
        Each check in the application tests for the permission code the action needs, such as{' '}
        <span className="font-mono">engagement.approve</span>, rather than comparing the role name to FULL_ACCESS or
        VIEWER. Until someone decides to add one, there are two roles and no more.
      </PrototypeNote>

      <Panel>
        <PanelHeader
          title="Permission matrix"
          subtitle="A tick means the role holds that code."
          icon={<KeyRound className="h-4 w-4" />}
          actions={
            <div className="w-56">
              <SearchInput value={query} onChange={setQuery} placeholder="Filter by code or module…" />
            </div>
          }
        />

        {grouped.length === 0 ? (
          <div className="p-4">
            <EmptyState
              icon={<Search className="h-5 w-5" />}
              title={`No permission matches “${query}”`}
              description="Codes read as module.action, for example client.edit or report.export."
              action={
                <Button variant="secondary" size="sm" onClick={() => setQuery('')}>
                  Clear the filter
                </Button>
              }
            />
          </div>
        ) : (
          <div className="scroll-slim overflow-x-auto">
            <table className="w-full min-w-[34rem] border-collapse text-sm">
              <thead>
                <tr className="bg-paper-100/60 text-2xs uppercase tracking-wide text-ink-500">
                  <th className="px-3 py-2 text-left font-medium">Permission</th>
                  <th className="px-3 py-2 text-left font-medium">Code</th>
                  <th className="w-28 px-3 py-2 text-center font-medium">Full Access</th>
                  <th className="w-28 px-3 py-2 text-center font-medium">View Only</th>
                </tr>
              </thead>
              {grouped.map((group) => (
                <tbody key={group.module} className="divide-y divide-paper-200">
                  <tr>
                    <th
                      colSpan={4}
                      className="border-y border-paper-200 bg-paper-50 px-3 py-1.5 text-left text-2xs font-semibold uppercase tracking-wide text-ink-600"
                    >
                      {group.module}
                      <span className="ml-2 font-normal normal-case tracking-normal text-ink-400">
                        {pluralise(group.items.length, 'code')}
                      </span>
                    </th>
                  </tr>
                  {group.items.map((item) => (
                    <tr key={item.code} className="hover:bg-paper-50">
                      <td className="px-3 py-2 text-ink-800">{permissionAction(item.code)}</td>
                      <td className="px-3 py-2 font-mono text-xs text-ink-500">{item.code}</td>
                      <td className="px-3 py-2 text-center">
                        <Tick held />
                      </td>
                      <td className="px-3 py-2 text-center">
                        <Tick held={item.viewer} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              ))}
            </table>
          </div>
        )}
      </Panel>
    </div>
  )
}

/** A held code is a tick, a code the role does not hold is a dash, never a blank. */
function Tick({ held }: { held: boolean }) {
  return held ? (
    <span
      aria-label="Held"
      className="inline-grid h-5 w-5 place-items-center rounded-full border border-ok-200 bg-ok-50 text-ok-600"
    >
      <Check className="h-3 w-3" />
    </span>
  ) : (
    <span
      aria-label="Not held"
      className="inline-grid h-5 w-5 place-items-center rounded-full border border-paper-300 bg-paper-100 text-ink-400"
    >
      <Minus className="h-3 w-3" />
    </span>
  )
}
