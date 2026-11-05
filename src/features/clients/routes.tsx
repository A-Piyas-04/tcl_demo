import { Route } from 'react-router-dom'
import { RequireWrite } from '@/features/misc/Fallbacks'
import { ClientList } from './ClientList'
import { ClientDetail } from './ClientDetail'
import { ClientForm } from './ClientForm'
import { PeersView } from './PeersView'

export const clientsRoutes = (
  <>
    <Route path="clients">
      <Route index element={<ClientList />} />
      <Route
        path="new"
        element={
          <RequireWrite what="Registering a client">
            <ClientForm />
          </RequireWrite>
        }
      />
      <Route path=":id" element={<ClientDetail />} />
      <Route
        path=":id/edit"
        element={
          <RequireWrite what="Editing a client">
            <ClientForm />
          </RequireWrite>
        }
      />
    </Route>
    {/* UC-13: open to both roles, and logged on every visit */}
    <Route path="engagements/:id/peers" element={<PeersView />} />
  </>
)
