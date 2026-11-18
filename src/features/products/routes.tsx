import { Navigate, Route } from 'react-router-dom'
import { RequireWrite } from '@/features/misc/Fallbacks'
import { ProductList } from './ProductList'
import { ProductDetail } from './ProductDetail'
import { ProductForm } from './ProductForm'

/**
 * Product 2.0 is the molecule register now, so `/products` lands there.
 *
 * Nothing is lost: the earlier catalogue keeps working at `/products/all`, and
 * `/products/:id` is still the molecule record the rest of the application
 * links to (orders, shipments, requirements, peers, duplicates). The two will
 * become one once the Product 2.0 and main seeds are reconciled — they already
 * agree on CAS numbers for five of the eight molecules Product 2.0 carries.
 */
export const productRoutes = (
  <Route path="products">
    <Route index element={<Navigate to="/product-2" replace />} />
    <Route path="all" element={<ProductList />} />
    <Route
      path="new"
      element={
        <RequireWrite what="Adding a product">
          <ProductForm />
        </RequireWrite>
      }
    />
    <Route path=":id" element={<ProductDetail />} />
    <Route
      path=":id/edit"
      element={
        <RequireWrite what="Editing a product">
          <ProductForm />
        </RequireWrite>
      }
    />
  </Route>
)
