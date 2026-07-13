import path from 'node:path'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

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
        manualChunks: {
          'vendor-react': ['react', 'react-dom', 'react-router-dom'],
          'vendor-data': ['@supabase/supabase-js', '@tanstack/react-query', 'zustand'],
          'vendor-forms': ['@hookform/resolvers', 'react-hook-form', 'zod'],
          'vendor-ui': ['@radix-ui/react-dialog', '@radix-ui/react-tabs', '@radix-ui/react-tooltip', 'lucide-react', 'sonner'],
        },
      },
    },
  },
})
