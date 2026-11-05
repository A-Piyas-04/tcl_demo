/**
 * Administration landing page (doc 01 module M1, UC-17).
 *
 * One bounded tile per admin area, each carrying a live figure so the state of
 * the installation is readable without opening anything. Below that, the short
 * housekeeping list: the three things an administrator is normally looking for.
 */

import * as React from 'react'
import {
  Activity,
  CopyCheck,
  Database,
  GitBranch,
  History,
  KeyRound,
  ShieldAlert,
  SlidersHorizontal,
  UserPlus,
  Users,
} from 'lucide-react'
import { useDb, useSettings } from '@/data/store'
import { READ_ONLY_PERMISSIONS, STAGE_CONFIG, WRITE_PERMISSIONS } from '@/data/reference'
import { STAGE_TRANSITIONS } from '@/data/rules'
import { fmtDateTime, pluralise } from '@/lib/utils'
import {
  Badge,
  EmptyState,
  KpiTile,
  LinkButton,
  Panel,
  PanelHeader,
  PageHeading,
  TileGrid,
} from '@/components/ui'
import { REFERENCE_SETS } from './ReferenceData'

export function AdminHome() {
  const db = useDb()
  const settings = useSettings()

  const figures = React.useMemo(() => {
    const activeUsers = db.users.filter((u) => u.isActive)
    const pendingActivation = db.users.filter((u) => u.isActive && !u.activatedAt)
    const duplicates =
      db.companies.filter((c) => c.possibleDuplicate && c.isActive).length +
      db.products.filter((p) => p.possibleDuplicate && p.isActive).length
    const failedSignIns = db.security.filter((s) => s.eventType === 'LOGIN_FAIL')
    const referenceRows = REFERENCE_SETS.reduce((sum, set) => sum + set.rows().length, 0)
    const collections = [
      db.companies, db.products, db.manufacturerProducts, db.portfolio, db.prices,
      db.requirements, db.engagements, db.offers, db.samples, db.clientOrders,
      db.indents, db.shipments, db.batches, db.documents, db.audit, db.security,
    ]
    return {
      activeUsers: activeUsers.length,
      totalUsers: db.users.length,
      fullAccess: activeUsers.filter((u) => u.roleCode === 'FULL_ACCESS' && u.activatedAt).length,
      pendingActivation,
      duplicates,
      failedSignIns,
      referenceRows,
      records: collections.reduce((sum, rows) => sum + rows.length, 0),
    }
  }, [db])

  const permissionCount = READ_ONLY_PERMISSIONS.length + WRITE_PERMISSIONS.length

  return (
    <div className="space-y-5">
      <PageHeading
        title="Administration"
        subtitle="Users, the two roles, the reference data every screen reads from, and the logs that record what happened."
        meta={
          <>
            <Badge tone="neutral">{pluralise(figures.activeUsers, 'active user')}</Badge>
            <Badge tone="accent">{pluralise(figures.fullAccess, 'Full Access holder')}</Badge>
          </>
        }
      />

      <TileGrid>
        <KpiTile
          label="Users"
          value={figures.activeUsers}
          unit={`of ${figures.totalUsers}`}
          icon={<Users className="h-4 w-4" />}
          to="/admin/users"
          hint="Add a user, change a role, hand over a leaver's records."
        />
        <KpiTile
          label="Roles and permissions"
          value={2}
          unit="roles"
          icon={<KeyRound className="h-4 w-4" />}
          to="/admin/roles"
          hint={`${permissionCount} permission codes, held as data rather than written into checks.`}
        />
        <KpiTile
          label="Reference data"
          value={figures.referenceRows}
          unit="rows"
          icon={<Database className="h-4 w-4" />}
          to="/admin/reference"
          hint={`${REFERENCE_SETS.length} sets the screens read from one place.`}
        />
        <KpiTile
          label="Stage configuration"
          value={STAGE_CONFIG.length}
          unit="stages"
          icon={<GitBranch className="h-4 w-4" />}
          to="/admin/workflow"
          hint={`${STAGE_TRANSITIONS.length} allowed transitions, with ageing thresholds.`}
        />
        <KpiTile
          label="Notification thresholds"
          value={Object.keys(settings).length}
          unit="settings"
          icon={<SlidersHorizontal className="h-4 w-4" />}
          to="/admin/notifications"
          hint={`Over-shipment tolerance is ${settings.overshipmentTolerancePct}%, minimum shelf life ${settings.minShelfLifeMonths} months.`}
        />
        <KpiTile
          label="Audit log"
          value={db.audit.length}
          unit="entries"
          icon={<History className="h-4 w-4" />}
          to="/admin/audit"
          hint={`And ${pluralise(db.security.length, 'security entry', 'security entries')} covering sign-ins and exports.`}
        />
        <KpiTile
          label="Duplicate review"
          value={figures.duplicates}
          unit="flagged"
          tone={figures.duplicates > 0 ? 'warn' : 'default'}
          icon={<CopyCheck className="h-4 w-4" />}
          to="/admin/duplicates"
          hint="Companies and products saved past a near-match warning."
        />
        <KpiTile
          label="System health"
          value={figures.records}
          unit="records"
          icon={<Activity className="h-4 w-4" />}
          to="/admin/health"
          hint="Collection counts, the demonstration seed, and a reset."
        />
      </TileGrid>

      <div className="grid gap-3 lg:grid-cols-3">
        <Panel>
          <PanelHeader
            title="Duplicates awaiting review"
            icon={<CopyCheck className="h-4 w-4" />}
            actions={
              figures.duplicates > 0 ? (
                <LinkButton to="/admin/duplicates" variant="secondary" size="sm">
                  Review
                </LinkButton>
              ) : null
            }
          />
          <div className="p-3">
            {figures.duplicates === 0 ? (
              <EmptyState
                compact
                title="Nothing flagged"
                description="A record is flagged when someone saves it past a near-match warning."
                action={
                  <LinkButton to="/admin/duplicates" variant="ghost" size="sm">
                    Open the review queue
                  </LinkButton>
                }
              />
            ) : (
              <p className="text-sm leading-relaxed text-ink-600">
                {pluralise(figures.duplicates, 'record')} carries a possible-duplicate flag. Each one is either a
                genuine second record or a near-miss spelling, and the queue shows the likely match beside it.
              </p>
            )}
          </div>
        </Panel>

        <Panel>
          <PanelHeader
            title="Users pending activation"
            icon={<UserPlus className="h-4 w-4" />}
            actions={
              <LinkButton to="/admin/users" variant="secondary" size="sm">
                Users
              </LinkButton>
            }
          />
          <div className="p-3">
            {figures.pendingActivation.length === 0 ? (
              <EmptyState
                compact
                title="Everyone has activated"
                description="An invited user cannot sign in until they set a password from the activation link."
                action={
                  <LinkButton to="/admin/users" variant="ghost" size="sm">
                    Add a user
                  </LinkButton>
                }
              />
            ) : (
              <ul className="space-y-2">
                {figures.pendingActivation.map((u) => (
                  <li key={u.id} className="flex items-baseline justify-between gap-2">
                    <span className="min-w-0 truncate text-sm text-ink-800">{u.fullName}</span>
                    <Badge tone="warn">Not activated</Badge>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </Panel>

        <Panel>
          <PanelHeader
            title="Recent failed sign-ins"
            icon={<ShieldAlert className="h-4 w-4" />}
            actions={
              <LinkButton to="/admin/audit?tab=security" variant="secondary" size="sm">
                Security log
              </LinkButton>
            }
          />
          <div className="p-3">
            {figures.failedSignIns.length === 0 ? (
              <EmptyState
                compact
                title="None recorded"
                description={`An account locks after ${settings.loginLockoutAttempts} consecutive failures, and every failure is written to the security log.`}
                action={
                  <LinkButton to="/admin/audit?tab=security" variant="ghost" size="sm">
                    Open the security log
                  </LinkButton>
                }
              />
            ) : (
              <ul className="space-y-2">
                {figures.failedSignIns.slice(0, 4).map((s) => (
                  <li key={s.id} className="min-w-0">
                    <p className="truncate text-sm text-ink-800">{s.detail}</p>
                    <p className="text-2xs text-ink-400">{fmtDateTime(s.occurredAt)}</p>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </Panel>
      </div>
    </div>
  )
}
