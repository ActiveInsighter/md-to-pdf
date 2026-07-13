import { Navigate, createBrowserRouter } from 'react-router-dom'
import { ProtectedLayout } from '@/components/layout/ProtectedLayout'
import { JobDetailPage } from '@/routes/JobDetailPage'
import { JobsPage } from '@/routes/JobsPage'
import { LoginPage } from '@/routes/LoginPage'
import { NotFoundPage } from '@/routes/NotFoundPage'
import { SettingsPage } from '@/routes/SettingsPage'
import { WorkspacePage } from '@/routes/WorkspacePage'

export const router = createBrowserRouter([
  { path: '/login', element: <LoginPage /> },
  {
    element: <ProtectedLayout />,
    children: [
      { path: '/', element: <Navigate to="/workspace" replace /> },
      { path: '/workspace', element: <WorkspacePage /> },
      { path: '/jobs', element: <JobsPage /> },
      { path: '/jobs/:jobId', element: <JobDetailPage /> },
      { path: '/settings', element: <SettingsPage /> },
    ],
  },
  { path: '*', element: <NotFoundPage /> },
])
