import { create } from 'zustand'
import { createJSONStorage, devtools, persist } from 'zustand/middleware'
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
}

type WorkspaceActions = {
  setMode: (mode: WorkspaceMode) => void
  setSelectedJobId: (id: string | null) => void
  setTheme: (theme: PdfThemeId) => void
  setAutoDownload: (enabled: boolean) => void
  setNotifyOnComplete: (enabled: boolean) => void
  setSidebarOpen: (open: boolean) => void
  setFilters: (filters: JobFilters) => void
  setRealtimeConnection: (status: RealtimeConnection) => void
  resetSession: () => void
  resetPreferences: () => void
}

export type WorkspaceStore = WorkspaceState & WorkspaceActions

const defaultPreferences = {
  theme: 'chatgpt-light' as PdfThemeId,
  autoDownload: false,
  notifyOnComplete: false,
  filters: { status: 'all', search: '' } satisfies JobFilters,
}

const initialSessionState = {
  mode: 'single' as WorkspaceMode,
  selectedJobId: null,
  sidebarOpen: false,
  realtimeConnection: 'connecting' as RealtimeConnection,
}

export const workspaceSelectors = {
  mode: (state: WorkspaceStore) => state.mode,
  selectedJobId: (state: WorkspaceStore) => state.selectedJobId,
  theme: (state: WorkspaceStore) => state.theme,
  filters: (state: WorkspaceStore) => state.filters,
  realtimeConnection: (state: WorkspaceStore) => state.realtimeConnection,
  preferences: (state: WorkspaceStore) => ({
    theme: state.theme,
    autoDownload: state.autoDownload,
    notifyOnComplete: state.notifyOnComplete,
  }),
}

export const useWorkspaceStore = create<WorkspaceStore>()(
  devtools(
    persist(
      (set) => ({
        ...initialSessionState,
        ...defaultPreferences,
        setMode: (mode) => set({ mode }),
        setSelectedJobId: (selectedJobId) => set({ selectedJobId }),
        setTheme: (theme) => set({ theme }),
        setAutoDownload: (autoDownload) => set({ autoDownload }),
        setNotifyOnComplete: (notifyOnComplete) => set({ notifyOnComplete }),
        setSidebarOpen: (sidebarOpen) => set({ sidebarOpen }),
        setFilters: (filters) => set({ filters }),
        setRealtimeConnection: (realtimeConnection) => set({ realtimeConnection }),
        resetSession: () => set(initialSessionState),
        resetPreferences: () => set(defaultPreferences),
      }),
      {
        name: 'md-to-pdf-workspace',
        version: 2,
        storage: createJSONStorage(() => localStorage),
        partialize: ({ theme, autoDownload, notifyOnComplete, filters }) => ({
          theme,
          autoDownload,
          notifyOnComplete,
          filters,
        }),
      },
    ),
    { name: 'md-to-pdf/workspace' },
  ),
)
