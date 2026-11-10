import { Route } from 'react-router-dom'
import { RequireWrite } from '@/features/misc/Fallbacks'
import { ClientOrderList } from './ClientOrderList'
import { ClientOrderForm } from './ClientOrderForm'
import { ClientOrderDetail } from './ClientOrderDetail'
import { IndentList } from './IndentList'
import { IndentDetail } from './IndentDetail'
import { ShipmentList } from './ShipmentList'
import { ShipmentDetail } from './ShipmentDetail'
import { BatchList } from './BatchList'
import { BatchDetail } from './BatchDetail'
import { CommissionTracker } from './CommissionTracker'
import { CommissionReport } from '@/features/insight/CommissionReport'

export const ordersRoutes = (
  <>
    <Route path="client-orders">
      <Route index element={<ClientOrderList />} />
      <Route
        path="new"
        element={
          <RequireWrite what="Recording a client order">
            <ClientOrderForm />
          </RequireWrite>
        }
      />
      <Route path=":id" element={<ClientOrderDetail />} />
    </Route>
    <Route path="indents">
      <Route index element={<IndentList />} />
      <Route path=":id" element={<IndentDetail />} />
    </Route>
    <Route path="shipments">
      <Route index element={<ShipmentList />} />
      <Route path=":id" element={<ShipmentDetail />} />
    </Route>
    <Route path="batches">
      <Route index element={<BatchList />} />
      <Route path=":id" element={<BatchDetail />} />
    </Route>
    <Route path="commissions">
      <Route index element={<CommissionTracker />} />
      <Route path="analysis" element={<CommissionReport />} />
    </Route>
  </>
)
