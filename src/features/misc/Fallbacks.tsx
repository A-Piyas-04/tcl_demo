/**
 * Fallback pages.
 *
 * Doc 04 §4 rule 5: a deep link the session may not use returns a clear
 * "not permitted" page, never a silent redirect that hides the reason.
 */

import * as React from 'react'
import { useLocation } from 'react-router-dom'
import { Compass, ShieldAlert } from 'lucide-react'
import { Button, EmptyState, LinkButton, Panel } from '@/components/ui'
import { useStore } from '@/data/store'

export function NotFound() {
  const location = useLocation()
  return (
    <div className="mx-auto max-w-xl py-10">
      <Panel className="p-6">
        <EmptyState
          icon={<Compass className="h-5 w-5" />}
          title="That page does not exist"
          description={
            <>
              Nothing is served at <span className="font-mono text-[0.75rem]">{location.pathname}</span>. It may have
              been renamed, or the link may be from an older version.
            </>
          }
          action={<LinkButton to="/" variant="primary" size="sm">Back to the dashboard</LinkButton>}
        />
      </Panel>
    </div>
  )
}

export function NotPermitted({ what }: { what?: string }) {
  const setRole = useStore((s) => s.setRole)
  const location = useLocation()

  // the refusal is recorded once per visit, as the server would record its 403
  React.useEffect(() => {
    const { currentUserId, pushSecurity } = useStore.getState()
    pushSecurity({
      eventType: 'PERMISSION_DENIED',
      userId: currentUserId,
      detail: `View Only session refused at ${location.pathname}${what ? ` (${what.toLowerCase()})` : ''}`,
      rowCount: null,
    })
  }, [location.pathname, what])

  return (
    <div className="mx-auto max-w-xl py-10">
      <Panel className="p-6">
        <EmptyState
          icon={<ShieldAlert className="h-5 w-5 text-danger-600" />}
          title="Not permitted"
          description={
            <>
              {what ?? 'This screen'} needs <span className="font-semibold">Full Access</span>. This session is{' '}
              <span className="font-semibold">View Only</span>, which can read and export every module but change
              nothing. The attempt has been written to the security log.
            </>
          }
          action={<LinkButton to="/" variant="secondary" size="sm">Back to the dashboard</LinkButton>}
          secondary={
            <Button variant="ghost" size="sm" onClick={() => setRole('FULL_ACCESS')}>
              Switch this demonstration to Full Access
            </Button>
          }
        />
      </Panel>
    </div>
  )
}

/** Wrap a route element that writes data. */
export function RequireWrite({ children, what }: { children: React.ReactNode; what?: string }) {
  const canWrite = useStore((s) => s.effectiveRole === 'FULL_ACCESS')
  if (!canWrite) return <NotPermitted what={what} />
  return <>{children}</>
}
