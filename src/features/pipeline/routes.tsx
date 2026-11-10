/**
 * Pipeline routes: requirements, engagements and samples.
 *
 * The write-only screens are wrapped in RequireWrite so a deep link from a View
 * Only session returns a clear "not permitted" page rather than a silent
 * redirect (doc 04 §4 rule 5).
 *
 * `engagements/:id/peers` is deliberately not defined here: the cross-client
 * view belongs to the discovery module.
 */

import { Navigate, Route } from 'react-router-dom'
import { RequireWrite } from '@/features/misc/Fallbacks'
import { RequirementList } from './RequirementList'
import { RequirementDetail } from './RequirementDetail'
import { RequirementForm } from './RequirementForm'
import { UnsourcedDemand } from './UnsourcedDemand'
import { EngagementBoard } from './EngagementBoard'
import { EngagementDetail } from './EngagementDetail'
import { SampleTracker } from './SampleTracker'

export const pipelineRoutes = (
  <>
    <Route path="requirements">
      <Route index element={<RequirementList />} />
      <Route
        path="new"
        element={
          <RequireWrite what="Recording a requirement">
            <RequirementForm />
          </RequireWrite>
        }
      />
      <Route path="unsourced" element={<UnsourcedDemand />} />
      <Route path=":id" element={<RequirementDetail />} />
      <Route
        path=":id/edit"
        element={
          <RequireWrite what="Editing a requirement">
            <RequirementForm />
          </RequireWrite>
        }
      />
    </Route>

    <Route path="engagements">
      <Route index element={<EngagementBoard />} />
      <Route path=":id" element={<EngagementDetail />} />
    </Route>

    <Route path="samples">
      <Route index element={<SampleTracker />} />
      <Route path=":id" element={<Navigate to="/samples" replace />} />
    </Route>
  </>
)
