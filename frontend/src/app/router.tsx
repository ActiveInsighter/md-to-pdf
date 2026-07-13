import { Navigate, createBrowserRouter } from 'react-router-dom'
import { ProtectedLayout } from '@/components/layout/ProtectedLayout'
import { NotFoundPage } from '@/routes/NotFoundPage'
import { RouteErrorPage } from '@/routes/RouteErrorPage'

export const router = createBrowserRouter([
  {
    path: '/login',
    lazy: async () => {
      const { LoginPage } = await import('@/routes/LoginPage')
      return { Component: LoginPage }
    },
    errorElement: <RouteErrorPage />,
  },
  {
    element: <ProtectedLayout />,
    errorElement: <RouteErrorPage />,
    children: [
      { path: '/', element: <Navigate to="/workspace" replace /> },
      {
        path: '/workspace',
        lazy: async () => {
          const { WorkspacePage } = await import('@/routes/WorkspacePage')
          return { Component: WorkspacePage }
        },
      },
      {
        path: '/jobs',
        lazy: async () => {
          const { JobsPage } = await import('@/routes/JobsPage')
          return { Component: JobsPage }
        },
      },
      {
        path: '/jobs/:jobId',
        lazy: async () => {
          const { JobDetailPage } = await import('@/routes/JobDetailPage')
          return { Component: JobDetailPage }
        },
      },
      {
        path: '/settings',
        lazy: async () => {
          const { SettingsPage } = await import('@/routes/SettingsPage')
          return { Component: SettingsPage }
        },
      },
    ],
  },
  { path: '*', element: <NotFoundPage /> },
])
