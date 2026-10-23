import { defineConfig } from 'vitest/config';

// Migration tests against a real Postgres (npm run test:migrations); the default config excludes them
export default defineConfig({
  test: {
    environment: 'node',
    include: ['tests/migrations/**/*.test.ts'],
    testTimeout: 60_000,
    hookTimeout: 60_000,
  },
});
