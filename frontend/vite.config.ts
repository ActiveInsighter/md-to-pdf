import path from 'node:path'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

function manualChunks(id: string) {
  if (!id.includes('node_modules')) return undefined
  if (/node_modules\/(react|react-dom|react-router|react-router-dom)\//.test(id)) return 'vendor-react'
  if (/node_modules\/(@supabase|@tanstack|zustand)\//.test(id)) return 'vendor-data'
  if (/node_modules\/(@hookform|react-hook-form|zod)\//.test(id)) return 'vendor-forms'
  if (/node_modules\/(@radix-ui|lucide-react|sonner)\//.test(id)) return 'vendor-ui'
  return undefined
}

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  build: {
    rollupOptions: {
      output: {
        manualChunks,
      },
    },
  },
})
