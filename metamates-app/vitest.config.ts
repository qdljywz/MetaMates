import { defineConfig } from 'vitest/config'
import path from 'path'

export default defineConfig({
  test: {
    environment: 'node',
    globals: true,
    setupFiles: ['src/test/setup.ts'],
    include: ['src/**/*.{test,spec}.{js,mjs,cjs,ts,mts,cts}'],
    exclude: ['**/node_modules/**', '**/dist/**'],
    environmentMatchGlobs: [
      ['src/test/settings.test.ts', 'jsdom'],
      ['src/test/templates.test.ts', 'jsdom'],
    ],
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
      '@acp-registry': path.resolve(__dirname, 'electron/shared/acpRegistry.ts'),
    },
  },
})
