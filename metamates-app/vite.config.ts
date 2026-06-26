import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'

export default defineConfig({
  plugins: [react()],
  base: './',
  build: {
    outDir: 'dist',
    rollupOptions: {
      output: {
        manualChunks: {
          'react-vendor': ['react', 'react-dom', 'react-dom/client'],
          'antd-vendor': ['antd', '@ant-design/icons'],
          'utils': ['codemirror'],
          'services': ['@/services'],
        },
      },
    },
    chunkSizeWarningLimit: 800,
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
      '@acp-registry': path.resolve(__dirname, 'electron/shared/acpRegistry.ts'),
    },
  },
  server: {
    host: '127.0.0.1',
    port: 3000,
    strictPort: true,
    watch: {
      ignored: ['**/docs/**'],
    },
  },
  optimizeDeps: {
    include: ['react', 'react-dom', 'antd'],
  },
})
