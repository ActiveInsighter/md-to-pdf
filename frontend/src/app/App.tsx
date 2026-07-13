import { RouterProvider } from 'react-router-dom'
import { RouteLoading } from '@/components/layout/RouteLoading'
import { AppProviders } from './providers'
import { router } from './router'

export default function App() {
  return (
    <AppProviders>
      <RouterProvider router={router} fallbackElement={<RouteLoading />} />
    </AppProviders>
  )
}
