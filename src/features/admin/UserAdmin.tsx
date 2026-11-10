/**
 * User administration (UC-17, AC-17, FR-M1-04 to FR-M1-08).
 *
 * The guard is the point of this screen. The installation must always keep one
 * active, activated Full Access user, so the last one can be neither demoted nor
 * deactivated, and a user who never set a password does not count towards that
 * one. Deactivating someone who owns open work requires naming a successor
 * first, while their historical records stay attributed to them.
 */

import * as React from 'react'
import { KeyRound, Mail, ShieldCheck, UserPlus, Users } from 'lucide-react'
import { useCurrentUser, useDb } from '@/data/store'
import { createUser, logExport, setUserActive, setUserRole } from '@/data/api'
import { checkLastFullAccess } from '@/data/rules'
import { runAction, useAsyncData } from '@/lib/hooks'
import { fmtDate, fmtDateTime, pluralise } from '@/lib/utils'
import type { RoleCode, User } from '@/data/types'
import {
  Avatar,
  Badge,
  Button,
  Column,
  DataTable,
  Dialog,
  DialogFooterActions,
  EmptyState,
  Field,
  FieldGrid,
  FormRow,
  HelpTip,
  InlineError,
  InlineWarning,
  Input,
  NameCell,
  NoteTip,
  PageHeading,
  Panel,
  PanelHeader,
  RadioCards,
  RuleHint,
  Select,
  WriteButton,
  WriteOnly,
} from '@/components/ui'
import { usePresenter } from '@/data/store'

const ROLE_LABEL: Record<RoleCode, string> = {
  FULL_ACCESS: 'Full Access',
  VIEWER: 'View Only',
}

const ROLE_OPTIONS: { value: RoleCode; label: string; description: string }[] = [
  {
    value: 'FULL_ACCESS',
    label: 'Full Access',
    description: 'Reads every module, and creates, edits, approves, exports and administers.',
  },
  {
    value: 'VIEWER',
    label: 'View Only',
    description: 'Reads and exports every module, changes nothing. For interns, auditors and finance reviewers.',
  },
]

interface Row {
  user: User
  clients: number
  requirements: number
  engagements: number
  openRecords: number
}

export function UserAdmin() {
  const db = useDb()
  const me = useCurrentUser()
  const presenter = usePresenter()

  const [adding, setAdding] = React.useState(false)
  const [roleTarget, setRoleTarget] = React.useState<Row | null>(null)
  const [activeTarget, setActiveTarget] = React.useState<Row | null>(null)

  const { data: rows, loading } = useAsyncData<Row[]>(
    () =>
      db.users
        .map((user) => {
          const clients = db.companies.filter((c) => c.client?.ownerUserId === user.id).length
          const requirements = db.requirements.filter((r) => r.ownerUserId === user.id)
          const engagements = db.engagements.filter((e) => e.ownerUserId === user.id)
          const openRecords =
            requirements.filter((r) => ['OPEN', 'SOURCING', 'ENGAGED'].includes(r.status)).length +
            engagements.filter((e) => !['REJECTED', 'DISCONTINUED'].includes(e.stage)).length
          return {
            user,
            clients,
            requirements: requirements.length,
            engagements: engagements.length,
            openRecords,
          }
        })
        .sort((a, b) => {
          if (a.user.isActive !== b.user.isActive) return a.user.isActive ? -1 : 1
          return a.user.fullName.localeCompare(b.user.fullName)
        }),
    [],
  )

  const columns: Column<Row>[] = [
    {
      key: 'name',
      header: 'User',
      pinned: true,
      sortable: true,
      value: (r) => r.user.fullName,
      cell: (r) => (
        <span className="flex min-w-0 items-center gap-2.5">
          <Avatar name={r.user.fullName} />
          <NameCell
            title={r.user.fullName}
            subtitle={r.user.id === me?.id ? 'This is you' : undefined}
            badge={!r.user.isActive ? <Badge tone="neutral">Deactivated</Badge> : undefined}
          />
        </span>
      ),
    },
    {
      key: 'email',
      header: 'Email',
      sortable: true,
      value: (r) => r.user.email,
      cell: (r) => <span className="truncate text-xs text-ink-600">{r.user.email}</span>,
    },
    {
      key: 'department',
      header: 'Department',
      sortable: true,
      optional: true,
      value: (r) => r.user.department,
      cell: (r) => <span className="truncate text-xs text-ink-600">{r.user.department ?? '—'}</span>,
    },
    {
      key: 'role',
      header: 'Role',
      sortable: true,
      width: '8rem',
      value: (r) => ROLE_LABEL[r.user.roleCode],
      cell: (r) => (
        <Badge tone={r.user.roleCode === 'FULL_ACCESS' ? 'accent' : 'neutral'}>{ROLE_LABEL[r.user.roleCode]}</Badge>
      ),
    },
    {
      key: 'active',
      header: 'Active',
      width: '6rem',
      sortable: true,
      value: (r) => (r.user.isActive ? 'Yes' : 'No'),
      cell: (r) =>
        r.user.isActive ? (
          <Badge tone="ok">Active</Badge>
        ) : (
          <Badge tone="neutral">Inactive</Badge>
        ),
    },
    {
      key: 'activated',
      header: 'Activated',
      width: '9rem',
      sortable: true,
      value: (r) => r.user.activatedAt,
      cell: (r) =>
        r.user.activatedAt ? (
          <span className="text-xs tabular text-ink-600">{fmtDate(r.user.activatedAt)}</span>
        ) : (
          <Badge tone="warn">Password not set</Badge>
        ),
    },
    {
      key: 'lastLogin',
      header: 'Last sign-in',
      width: '10rem',
      sortable: true,
      value: (r) => r.user.lastLoginAt,
      cell: (r) => <span className="text-xs tabular text-ink-600">{fmtDateTime(r.user.lastLoginAt)}</span>,
    },
    {
      key: 'owned',
      header: 'Records owned',
      align: 'right',
      sortable: true,
      width: '9rem',
      value: (r) => r.clients + r.requirements + r.engagements,
      cell: (r) => {
        const total = r.clients + r.requirements + r.engagements
        if (total === 0) return <span className="text-xs text-ink-400">—</span>
        return (
          <span className="text-xs tabular text-ink-700">
            {total}
            <span className="text-ink-400">
              {' '}
              ({r.clients}c / {r.requirements}r / {r.engagements}e)
            </span>
          </span>
        )
      },
    },
    {
      key: 'actions',
      header: '',
      width: '13rem',
      align: 'right',
      cell: (r) => (
        <WriteOnly>
          <span className="flex justify-end gap-1.5">
            <Button variant="ghost" size="sm" onClick={() => setRoleTarget(r)}>
              Change role
            </Button>
            <Button variant="ghost" size="sm" onClick={() => setActiveTarget(r)}>
              {r.user.isActive ? 'Deactivate' : 'Reactivate'}
            </Button>
          </span>
        </WriteOnly>
      ),
    },
  ]

  const fullAccessHolders = db.users.filter(
    (u) => u.roleCode === 'FULL_ACCESS' && u.isActive && u.activatedAt,
  )

  return (
    <div className="space-y-4">
      <PageHeading
        title="Users"
        subtitle="Who can sign in, which of the two roles they hold, and what they own."
        meta={
          <>
            <Badge tone="neutral">{pluralise(db.users.filter((u) => u.isActive).length, 'active user')}</Badge>
            <Badge tone="accent">{pluralise(fullAccessHolders.length, 'activated Full Access holder')}</Badge>
            {db.users.some((u) => u.isActive && !u.activatedAt) ? (
              <Badge tone="warn">
                {pluralise(db.users.filter((u) => u.isActive && !u.activatedAt).length, 'invitation')} outstanding
              </Badge>
            ) : null}
          </>
        }
        actions={
          <WriteButton
            variant="primary"
            size="md"
            icon={<UserPlus className="h-3.5 w-3.5" />}
            onClick={() => setAdding(true)}
          >
            Add user
          </WriteButton>
        }
      />

      {presenter.showRuleHints ? (
        <RuleHint>
          The system always keeps at least one active, activated Full Access user. Demoting or deactivating the last one
          is refused, because otherwise the installation becomes permanently read-only and cannot be recovered from
          inside the application.
        </RuleHint>
      ) : null}

      <Panel>
        <DataTable
          rows={rows ?? []}
          columns={columns}
          rowKey={(r) => r.user.id}
          loading={loading}
          exportName="users"
          onExport={(count) => void logExport('user list', '', count)}
          toolbar={
            <span className="flex items-center gap-2 text-xs text-ink-500">
              <Users className="h-3.5 w-3.5" />
              {rows ? pluralise(rows.length, 'user') : '…'}
            </span>
          }
          empty={
            <EmptyState
              icon={<Users className="h-5 w-5" />}
              title="No users yet"
              description="Somebody has to hold Full Access for the system to be administered at all."
              action={
                <WriteOnly>
                  <Button variant="primary" size="sm" onClick={() => setAdding(true)}>
                    Add the first user
                  </Button>
                </WriteOnly>
              }
            />
          }
        />
      </Panel>

      <div className="grid gap-3 lg:grid-cols-2">
        <Panel>
          <PanelHeader title="Why there are only two roles" icon={<ShieldCheck className="h-4 w-4" />} />
          <div className="space-y-3 p-3.5">
            <dl className="grid gap-x-5 gap-y-1 sm:grid-cols-2">
              <div className="flex items-center gap-1">
                <dt className="text-2xs font-medium uppercase tracking-wide text-ink-500">Full Access</dt>
                <HelpTip>Reads every module and may create, edit, delete, approve, export and administer.</HelpTip>
              </div>
              <div className="flex items-center gap-1">
                <dt className="text-2xs font-medium uppercase tracking-wide text-ink-500">View Only</dt>
                <HelpTip>Reads and exports every module, changes nothing.</HelpTip>
              </div>
            </dl>
            <div className="flex flex-wrap gap-1.5">
              <NoteTip label="Price and commission">
                Price, cost and commission are visible to every user, including View Only. There is no field-level
                restriction.
              </NoteTip>
              <NoteTip label="Cross-client views">
                Any user can see which other clients take a given molecule. That is managed by the audit trail, which
                records every cross-client view, rather than by permissions.
              </NoteTip>
              <NoteTip label="A third role">
                Would be seeded rows in the role and permission tables, not a schema or code change, because each check
                tests for a permission code such as engagement.approve.
              </NoteTip>
            </div>
          </div>
        </Panel>

        <Panel>
          <PanelHeader title="What a role change does and does not touch" icon={<KeyRound className="h-4 w-4" />} />
          <div className="space-y-3 p-3.5">
            <dl className="grid gap-x-5 gap-y-2.5 sm:grid-cols-2">
              {[
                ['Takes effect', "On the user's next request, not at their next sign-in"],
                ['Record ownership', 'Kept, so their clients and engagements stay theirs'],
                ['Written to', 'The audit log, with the identity of whoever made the change'],
                ['Deactivation', 'Blocks sign-in and keeps every historical record attributed'],
              ].map(([label, value]) => (
                <div key={label} className="min-w-0">
                  <dt className="text-2xs font-medium uppercase tracking-wide text-ink-500">{label}</dt>
                  <dd className="mt-0.5 text-xs leading-snug text-ink-700">{value}</dd>
                </div>
              ))}
            </dl>
            <NoteTip label="After a demotion">
              A demoted user still appears as the owner of their records and their "my engagements" filter still works.
              They can no longer edit any of it.
            </NoteTip>
          </div>
        </Panel>
      </div>

      <AddUserDialog open={adding} onClose={() => setAdding(false)} departments={departmentsOf(db.users)} />
      {roleTarget ? (
        <RoleDialog row={roleTarget} users={db.users} onClose={() => setRoleTarget(null)} />
      ) : null}
      {activeTarget ? (
        <ActiveDialog row={activeTarget} users={db.users} onClose={() => setActiveTarget(null)} />
      ) : null}
    </div>
  )
}

const departmentsOf = (users: User[]) =>
  Array.from(new Set(users.map((u) => u.department).filter((d): d is string => Boolean(d)))).sort()

// --------------------------------------------------------------- add a user

function AddUserDialog({
  open,
  onClose,
  departments,
}: {
  open: boolean
  onClose: () => void
  departments: string[]
}) {
  const [fullName, setFullName] = React.useState('')
  const [email, setEmail] = React.useState('')
  const [department, setDepartment] = React.useState('')
  const [roleCode, setRoleCode] = React.useState<RoleCode>('FULL_ACCESS')
  const [saving, setSaving] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)

  React.useEffect(() => {
    if (!open) {
      setFullName('')
      setEmail('')
      setDepartment('')
      setRoleCode('FULL_ACCESS')
      setError(null)
    }
  }, [open])

  const emailLooksValid = /^[^@\s]+@[^@\s.]+\.[^@\s]+$/.test(email.trim())
  const canSave = fullName.trim().length > 1 && emailLooksValid

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!canSave) return
    setError(null)
    setSaving(true)
    const result = await runAction(
      () =>
        createUser({
          fullName: fullName.trim(),
          email: email.trim(),
          department: department || null,
          phone: null,
          roleCode,
        }),
      {
        success: `${fullName.trim()} added. An activation link would be sent to ${email.trim()}.`,
        onError: setError,
      },
    )
    setSaving(false)
    if (result) onClose()
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => (o ? null : onClose())}
      title="Add a user"
      description="The account is created now and becomes usable once the person sets a password."
      icon={<UserPlus className="h-5 w-5 text-accent-600" />}
    >
      <form onSubmit={submit} className="space-y-3.5">
        <FormRow label="Full name" required htmlFor="user-name">
          <Input
            id="user-name"
            value={fullName}
            onChange={(e) => setFullName(e.target.value)}
            placeholder="Tahmina Akter"
            autoFocus
          />
        </FormRow>
        <FormRow
          label="Email"
          required
          htmlFor="user-email"
          hint="Used to sign in, and where the activation link goes."
          error={email.trim() && !emailLooksValid ? 'That does not look like an email address.' : null}
        >
          <Input
            id="user-email"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="name@techstream.com.bd"
            invalid={Boolean(email.trim()) && !emailLooksValid}
          />
        </FormRow>
        <FormRow label="Department" hint="For filtering and for knowing who to ask. It carries no permissions.">
          <Select
            value={department}
            onChange={setDepartment}
            allowEmpty
            emptyLabel="Not recorded"
            placeholder="Not recorded"
            options={departments.map((d) => ({ value: d, label: d }))}
          />
        </FormRow>
        <FormRow label="Role" required hint="A user holds exactly one role, so this is a single choice.">
          <RadioCards value={roleCode} onChange={setRoleCode} options={ROLE_OPTIONS} columns={1} />
        </FormRow>

        <div className="flex items-start gap-2 rounded border border-paper-300 bg-paper-50 p-2.5">
          <Mail className="mt-0.5 h-3.5 w-3.5 shrink-0 text-ink-400" />
          <p className="flex items-center gap-1 text-xs text-ink-500">
            On save, a single-use activation link is emailed; no email is sent in this prototype.
            <HelpTip>
              Until the person follows the link and sets a password meeting the policy, the account cannot sign in, and
              it does not count as a Full Access holder for the last-admin guard.
            </HelpTip>
          </p>
        </div>

        <InlineError>{error}</InlineError>

        <div className="flex items-center justify-end gap-2 pt-1">
          <DialogFooterActions onCancel={onClose} confirmLabel="Add user" loading={saving} disabled={!canSave} />
        </div>
      </form>
    </Dialog>
  )
}

// ------------------------------------------------------------- change a role

function RoleDialog({ row, users, onClose }: { row: Row; users: User[]; onClose: () => void }) {
  const current = row.user.roleCode
  const next: RoleCode = current === 'FULL_ACCESS' ? 'VIEWER' : 'FULL_ACCESS'
  const [saving, setSaving] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)

  // The same guard the write will apply, so the refusal is visible before the
  // button is pressed rather than only afterwards.
  const guard = checkLastFullAccess(users, { userId: row.user.id, toRole: next })

  const submit = async () => {
    setError(null)
    setSaving(true)
    const ok = await runAction(() => setUserRole(row.user.id, next), {
      success: `${row.user.fullName} now holds ${ROLE_LABEL[next]}.`,
      onError: setError,
    })
    setSaving(false)
    if (ok !== null) onClose()
  }

  return (
    <Dialog
      open
      onOpenChange={(o) => (o ? null : onClose())}
      width="sm"
      title={`Change ${row.user.fullName} to ${ROLE_LABEL[next]}`}
      description={`They hold ${ROLE_LABEL[current]} today.`}
      icon={<KeyRound className="h-5 w-5 text-accent-600" />}
    >
      <form
        onSubmit={(e) => {
          e.preventDefault()
          if (guard.ok) void submit()
        }}
        className="space-y-3"
      >
        {!guard.ok ? (
          <>
            <InlineError>{guard.error}</InlineError>
            <p className="text-xs leading-relaxed text-ink-500">
              Give another activated user Full Access first, then come back to this change. A user who has been invited
              but has never set a password cannot sign in, so they do not count towards the one holder the system keeps.
            </p>
          </>
        ) : (
          <ul className="ml-4 list-disc space-y-1.5 text-xs leading-relaxed text-ink-600">
            <li>The change takes effect on their next request, not at their next sign-in. They do not need to sign out.</li>
            <li>
              {next === 'VIEWER'
                ? `They keep their ${pluralise(row.clients + row.requirements + row.engagements, 'record')} as owner, and their "my engagements" filter still works. They can no longer edit any of it.`
                : 'They gain every write action across every module, including user administration.'}
            </li>
            <li>The change is written to the audit log against your user, and to the security log.</li>
          </ul>
        )}
        <InlineError>{error}</InlineError>

        <div className="flex items-center justify-end gap-2 pt-1">
          {guard.ok ? (
            <DialogFooterActions onCancel={onClose} confirmLabel={`Change to ${ROLE_LABEL[next]}`} loading={saving} />
          ) : (
            <Button variant="secondary" size="sm" type="button" onClick={onClose}>
              Close
            </Button>
          )}
        </div>
      </form>
    </Dialog>
  )
}

// ------------------------------------------------ deactivate and reactivate

function ActiveDialog({ row, users, onClose }: { row: Row; users: User[]; onClose: () => void }) {
  const deactivating = row.user.isActive
  const [successor, setSuccessor] = React.useState('')
  const [saving, setSaving] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)

  const guard = deactivating
    ? checkLastFullAccess(users, { userId: row.user.id, toActive: false })
    : { ok: true as const, error: undefined }

  const candidates = users.filter(
    (u) => u.id !== row.user.id && u.isActive && u.activatedAt,
  )
  const needsSuccessor = deactivating && row.openRecords > 0
  const canSave = guard.ok && (!needsSuccessor || Boolean(successor))

  const submit = async () => {
    setError(null)
    setSaving(true)
    const ok = await runAction(
      () => setUserActive(row.user.id, !deactivating, successor || undefined),
      {
        success: deactivating
          ? `${row.user.fullName} can no longer sign in.`
          : `${row.user.fullName} can sign in again.`,
        onError: setError,
      },
    )
    setSaving(false)
    if (ok !== null) onClose()
  }

  return (
    <Dialog
      open
      onOpenChange={(o) => (o ? null : onClose())}
      title={deactivating ? `Deactivate ${row.user.fullName}` : `Reactivate ${row.user.fullName}`}
      description={
        deactivating
          ? 'Their sessions end, sign-in is blocked, and every historical record stays attributed to them.'
          : 'They will be able to sign in again with their existing password.'
      }
      icon={<Users className="h-5 w-5 text-accent-600" />}
    >
      <form
        onSubmit={(e) => {
          e.preventDefault()
          if (canSave) void submit()
        }}
        className="space-y-3"
      >
        {!guard.ok ? (
          <>
            <InlineError>{guard.error}</InlineError>
            <p className="text-xs leading-relaxed text-ink-500">
              Give another activated user Full Access first, then deactivate this one.
            </p>
          </>
        ) : null}

        {guard.ok && deactivating ? (
          <FieldGrid cols={2}>
            <Field label="Clients owned">{row.clients}</Field>
            <Field label="Requirements owned">{row.requirements}</Field>
            <Field label="Engagements owned">{row.engagements}</Field>
            <Field label="Open records">{row.openRecords}</Field>
          </FieldGrid>
        ) : null}

        {needsSuccessor && guard.ok ? (
          <>
            <InlineWarning>
              {row.user.fullName} owns {pluralise(row.openRecords, 'open record')}. Choose who takes them over before
              this can complete, so nothing is left without an owner.
            </InlineWarning>
            <FormRow
              label="Hand open records to"
              required
              hint="Their open clients, requirements and engagements move to this user. Closed and historical records stay attributed to the original owner."
            >
              <Select
                value={successor}
                onChange={setSuccessor}
                placeholder="Choose a user"
                options={candidates.map((u) => ({
                  value: u.id,
                  label: u.fullName,
                  description: `${ROLE_LABEL[u.roleCode]}${u.department ? ` · ${u.department}` : ''}`,
                  disabled: u.roleCode !== 'FULL_ACCESS',
                }))}
              />
            </FormRow>
            {candidates.every((u) => u.roleCode !== 'FULL_ACCESS') ? (
              <InlineError>
                Nobody else holds Full Access, so there is no one who could work on these records. Give another
                activated user Full Access first.
              </InlineError>
            ) : null}
          </>
        ) : null}

        <InlineError>{error}</InlineError>

        <div className="flex items-center justify-end gap-2 pt-1">
          {guard.ok ? (
            <DialogFooterActions
              onCancel={onClose}
              confirmLabel={deactivating ? 'Deactivate' : 'Reactivate'}
              confirmTone={deactivating ? 'danger' : 'primary'}
              loading={saving}
              disabled={!canSave}
            />
          ) : (
            <Button variant="secondary" size="sm" type="button" onClick={onClose}>
              Close
            </Button>
          )}
        </div>
      </form>
    </Dialog>
  )
}
