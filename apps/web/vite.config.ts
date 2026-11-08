import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

const apiTarget = process.env.VITE_API_PROXY ?? 'http://localhost:3000';

export default defineConfig({
  plugins: [react()],
  resolve: { conditions: ['source'] },
  server: {
    port: 5173,
    proxy: {
      '/api': { target: apiTarget },
      '/ws': { target: apiTarget.replace(/^http/, 'ws'), ws: true },
    },
  },
  preview: { port: 4173 },
  build: { sourcemap: true, chunkSizeWarningLimit: 900 },
  test: {
    name: 'web',
    include: ['test/**/*.test.ts'],
    environment: 'node',
  },
});
