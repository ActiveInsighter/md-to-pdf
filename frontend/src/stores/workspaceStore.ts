import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type { JobFilters } from '@/features/pdf-jobs/types'
import type { PdfThemeId, WorkspaceMode } from '@/features/pdf-builder/types'

export type RealtimeConnection = 'connecting' | 'connected' | 'disconnected'

type WorkspaceState = {
  mode: WorkspaceMode
  selectedJobId: string | null
  theme: PdfThemeId
  autoDownload: boolean
  notifyOnComplete: boolean
  sidebarOpen: boolean
  filters: JobFilters
  realtimeConnection: RealtimeConnection
  setMode: (mode: WorkspaceMode) => void
  setSelectedJobId: (id: string | null) => void
  setTheme: (theme: PdfThemeId) => void
  setAutoDownload: (enabled: boolean) => void
  setNotifyOnComplete: (enabled: boolean) => void
  setSidebarOpen: (open: boolean) => void
  setFilters: (filters: JobFilters) => void
  setRealtimeConnection: (status: RealtimeConnection) => void
}

export const useWorkspaceStore = create<WorkspaceState>()(
  persist(
    (set) => ({
      mode: 'single',
      selectedJobId: null,
      theme: 'chatgpt-light',
      autoDownload: false,
      notifyOnComplete: false,
      sidebarOpen: false,
      filters: { status: 'all', search: '' },
      realtimeConnection: 'connecting',
      setMode: (mode) => set({ mode }),
      setSelectedJobId: (selectedJobId) => set({ selectedJobId }),
      setTheme: (theme) => set({ theme }),
      setAutoDownload: (autoDownload) => set({ autoDownload }),
      setNotifyOnComplete: (notifyOnComplete) => set({ notifyOnComplete }),
      setSidebarOpen: (sidebarOpen) => set({ sidebarOpen }),
      setFilters: (filters) => set({ filters }),
      setRealtimeConnection: (realtimeConnection) => set({ realtimeConnection }),
    }),
    {
      name: 'md-to-pdf-workspace',
      partialize: ({ selectedJobId, theme, autoDownload, notifyOnComplete, filters }) => ({
        selectedJobId,
        theme,
        autoDownload,
        notifyOnComplete,
        filters,
      }),
    },
  ),
)
