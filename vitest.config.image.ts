import { defineConfig } from 'vitest/config';

// Container image suite (spec 014): needs Docker; not part of `pnpm check`.
export default defineConfig({
  test: {
    globals: true,
    root: './',
    include: ['test/image/**/*.image-spec.ts'],
    fileParallelism: false,
    testTimeout: 60_000,
    hookTimeout: 600_000,
  },
});
