// Runs tools/course-pack/dump.test.ts on its own (it isn't part of `npm test`): the main config's
// setup and environment, with only the dump included.
import { defineConfig } from 'vite';
import base from '../../vite.config.ts';

export default defineConfig({
  ...base,
  test: { ...base.test, include: ['tools/course-pack/dump.test.ts'] },
});
