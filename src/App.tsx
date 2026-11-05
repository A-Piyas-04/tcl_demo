/**
 * Routes, and the gate between the login screen and the workspace.
 */

import * as React from 'react'
import { Route, Routes } from 'react-router-dom'
import { Toaster } from 'sonner'
import { useCurrentUser } from '@/data/store'
import { TooltipProvider } from '@/components/ui'
import { AppShell } from '@/layout/AppShell'
import { LoginScreen, SplashScreen } from '@/layout/Login'
import { NotFound, NotPermitted } from '@/features/misc/Fallbacks'
import { Dashboard } from '@/features/dashboard/Dashboard'
import { productRoutes } from '@/features/products/routes'
import { manufacturersRoutes } from '@/features/manufacturers/routes'
import { clientsRoutes } from '@/features/clients/routes'
import { pipelineRoutes } from '@/features/pipeline/routes'
import { ordersRoutes } from '@/features/orders/routes'
import { insightRoutes } from '@/features/insight/routes'
import { adminRoutes } from '@/features/admin/routes'

/** The splash is a first-impression, not something to sit through on every refresh. */
const SPLASH_KEY = 'tcl.splashSeen'
const splashAlreadySeen = () => {
  try {
    return window.sessionStorage.getItem(SPLASH_KEY) === '1'
  } catch {
    return false
  }
}

export function App() {
  const user = useCurrentUser()
  const [splashDone, setSplashDone] = React.useState(splashAlreadySeen)

  React.useEffect(() => {
    if (!user) {
      try {
        window.sessionStorage.removeItem(SPLASH_KEY)
      } catch {
        // storage can be unavailable; the splash simply shows again
      }
      setSplashDone(false)
    }
  }, [user])

  const finishSplash = React.useCallback(() => {
    try {
      window.sessionStorage.setItem(SPLASH_KEY, '1')
    } catch {
      // not important enough to fail over
    }
    setSplashDone(true)
  }, [])

  return (
    <TooltipProvider>
      <Toaster
        position="bottom-right"
        toastOptions={{
          className: 'font-sans text-sm',
          style: { borderRadius: '8px', border: '1px solid rgb(230 225 216)' },
        }}
      />
      {!user ? (
        <LoginScreen />
      ) : !splashDone ? (
        <SplashScreen onDone={finishSplash} />
      ) : (
        <Routes>
          <Route element={<AppShell />}>
            <Route index element={<Dashboard />} />
            {productRoutes}
            {manufacturersRoutes}
            {clientsRoutes}
            {pipelineRoutes}
            {ordersRoutes}
            {insightRoutes}
            {adminRoutes}
            <Route path="/not-permitted" element={<NotPermitted />} />
            <Route path="*" element={<NotFound />} />
          </Route>
        </Routes>
      )}
    </TooltipProvider>
  )
}
