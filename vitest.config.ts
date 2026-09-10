import { defineConfig } from 'vitest/config';

/**
 * Kept separate from vite.config.ts for the same reason the site does it:
 * vitest bundles its own copy of vite, and its plugin types do not line up with
 * the vite this app builds with, so a `test` block beside the plugins makes
 * `tsc -b` fail on the mismatch.
 */
export default defineConfig({
  esbuild: { jsx: 'automatic' },
  test: {
    environment: 'jsdom',
    setupFiles: ['./src/test/setup.ts'],
    include: ['src/**/*.test.{ts,tsx}'],
    css: false,
    restoreMocks: true
  }
});
