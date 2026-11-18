import { Navigate, Route, useParams } from 'react-router-dom'
import { P2List } from './P2List'
import { P2Orders } from './P2Orders'
import { P2Commission } from './P2Commission'
import { P2Detail } from './P2Detail'
import { P2OrderDetail } from './P2OrderDetail'

/** "/product-2/:apiId/orders" is a breadcrumb step; it lands on the API's orders tab. */
function OrdersOfApi() {
  const { apiId = '' } = useParams()
  return <Navigate to={`/product-2/${apiId}?tab=trade`} replace />
}

export const product2Routes = (
  <Route path="product-2">
    <Route index element={<P2List />} />
    <Route path="orders" element={<P2Orders />} />
    <Route path="commission" element={<P2Commission />} />
    <Route path=":apiId" element={<P2Detail />} />
    <Route path=":apiId/orders" element={<OrdersOfApi />} />
    <Route path=":apiId/orders/:orderId" element={<P2OrderDetail />} />
  </Route>
)
