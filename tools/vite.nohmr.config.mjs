// A second dev server for scripted runs (playtest, devshot) with HMR off, so edits landing in the
// tree mid-run don't reload the page. Modules are still re-transformed on the next load.
import { fileURLToPath } from 'node:url';
import { defineConfig, mergeConfig } from 'vite';
import base from '../vite.config.ts';

export default mergeConfig(
  base,
  defineConfig({
    root: fileURLToPath(new URL('..', import.meta.url)),
    server: { hmr: false, port: 5301, strictPort: true },
    cacheDir: 'node_modules/.vite-nohmr',
  }),
);
