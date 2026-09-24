/// <reference types="vitest/config" />
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// PLAN §13.1: boot stays tiny; three.js and React get their own long-lived hashed chunks,
// and game systems load later through dynamic import().
export default defineConfig({
  base: './',
  plugins: [react()],
  build: {
    target: 'es2022',
    manifest: true,
    sourcemap: true,
    chunkSizeWarningLimit: 600, // size is enforced by tools/check-budgets.mjs instead
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes('node_modules/three/')) return 'vendor-three';
          if (/node_modules\/(react|react-dom|scheduler)\//.test(id)) return 'vendor-ui';
          return undefined;
        },
      },
    },
  },
  test: {
    include: ['src/**/*.test.ts'],
    environment: 'node',
  },
});
