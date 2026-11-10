import { Navigate, Route } from 'react-router-dom'
import { RelationshipsHome } from './RelationshipsHome'
import { ConnectionTree } from './ConnectionTree'
import { RelationshipMatrix } from './RelationshipMatrix'
import { DocumentLibrary } from './DocumentLibrary'
import { ExpiringDocuments } from './ExpiringDocuments'
import { ReportsHome } from './ReportsHome'
import { DevelopmentRegister } from './DevelopmentRegister'
import { PipelineReport } from './PipelineReport'
import { ConversionFunnel } from './ConversionFunnel'
/**
 * Relationships, documents and reports. Everything here reads and exports, so
 * no route needs RequireWrite: the only write in the area is the document
 * upload, which lives in a dialog that is absent for a View Only session.
 */
export const insightRoutes = (
  <>
    <Route path="relationships">
      <Route index element={<RelationshipsHome />} />
      <Route path="tree" element={<ConnectionTree />} />
      <Route path="client-product" element={<RelationshipMatrix axis="client" />} />
      <Route path="manufacturer-product" element={<RelationshipMatrix axis="manufacturer" />} />
    </Route>
    <Route path="documents">
      <Route index element={<DocumentLibrary />} />
      <Route path="expiring" element={<ExpiringDocuments />} />
    </Route>
    <Route path="reports">
      <Route index element={<ReportsHome />} />
      <Route path="development-register" element={<DevelopmentRegister />} />
      <Route path="pipeline" element={<PipelineReport />} />
      <Route path="funnel" element={<ConversionFunnel />} />
      <Route path="commission" element={<Navigate to="/commissions/analysis" replace />} />
    </Route>
  </>
)
