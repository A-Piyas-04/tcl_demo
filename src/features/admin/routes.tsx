import { Route } from 'react-router-dom'
import { RequireWrite } from '@/features/misc/Fallbacks'
import { AdminHome } from './AdminHome'
import { UserAdmin } from './UserAdmin'
import { RoleAdmin } from './RoleAdmin'
import { ReferenceData } from './ReferenceData'
import { WorkflowConfig } from './WorkflowConfig'
import { NotificationConfig } from './NotificationConfig'
import { AuditLog } from './AuditLog'
import { DuplicateReview } from './DuplicateReview'
import { SystemHealth } from './SystemHealth'

/**
 * The audit log and the role matrix are readable by both roles. The screens
 * that administer something are wrapped, so a View Only session reaching one by
 * deep link gets the "not permitted" page rather than a silent redirect
 * (UC-17 4e).
 */
export const adminRoutes = (
  <Route path="admin">
    <Route index element={<AdminHome />} />
    <Route
      path="users"
      element={
        <RequireWrite what="Administering users">
          <UserAdmin />
        </RequireWrite>
      }
    />
    <Route path="roles" element={<RoleAdmin />} />
    <Route path="reference" element={<ReferenceData />} />
    <Route path="reference/:type" element={<ReferenceData />} />
    <Route path="workflow" element={<WorkflowConfig />} />
    <Route
      path="notifications"
      element={
        <RequireWrite what="Changing thresholds and notifications">
          <NotificationConfig />
        </RequireWrite>
      }
    />
    <Route path="audit" element={<AuditLog />} />
    <Route path="duplicates" element={<DuplicateReview />} />
    <Route path="health" element={<SystemHealth />} />
  </Route>
)
