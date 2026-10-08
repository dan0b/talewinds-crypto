import { defineConfig } from 'vitest/config';

/** Integration tests: `*.int.test.ts`, run serially against the `talewinds_test` database. */
export default defineConfig({
  test: {
    include: ['packages/*/src/**/*.int.test.ts', 'apps/*/src/**/*.int.test.ts'],
    globalSetup: ['tooling/test/int-global-setup.ts'],
    fileParallelism: false,
    testTimeout: 30_000,
  },
});
