import { Route } from 'react-router-dom'
import { RequireWrite } from '@/features/misc/Fallbacks'
import { ManufacturerList } from './ManufacturerList'
import { ManufacturerDetail } from './ManufacturerDetail'
import { ManufacturerForm } from './ManufacturerForm'
import { SourceDetail } from './SourceDetail'
import { ManufacturerProductForm } from './ManufacturerProductForm'

export const manufacturersRoutes = (
  <>
    <Route path="manufacturers">
      <Route index element={<ManufacturerList />} />
      <Route
        path="new"
        element={
          <RequireWrite what="Registering a manufacturer">
            <ManufacturerForm />
          </RequireWrite>
        }
      />
      <Route path=":id" element={<ManufacturerDetail />} />
      <Route
        path=":id/edit"
        element={
          <RequireWrite what="Editing a manufacturer">
            <ManufacturerForm />
          </RequireWrite>
        }
      />
    </Route>
    <Route path="sources">
      <Route
        path="new"
        element={
          <RequireWrite what="Adding a source">
            <ManufacturerProductForm />
          </RequireWrite>
        }
      />
      <Route path=":id" element={<SourceDetail />} />
      <Route
        path=":id/edit"
        element={
          <RequireWrite what="Editing a source">
            <ManufacturerProductForm />
          </RequireWrite>
        }
      />
    </Route>
  </>
)
