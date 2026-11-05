import { Route } from 'react-router-dom'
import { RequireWrite } from '@/features/misc/Fallbacks'
import { ProductList } from './ProductList'
import { ProductDetail } from './ProductDetail'
import { ProductForm } from './ProductForm'

export const productRoutes = (
  <Route path="products">
    <Route index element={<ProductList />} />
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
