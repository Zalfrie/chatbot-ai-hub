import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    setupFiles: ['./tests/setup.ts'],
    env: {
      NODE_ENV: 'test',
      DB_HOST: 'localhost',
      DB_PORT: '5432',
      DB_USER: 'testuser',
      DB_PASSWORD: 'testpassword',
      DB_NAME: 'chatbot_test',
      JWT_SECRET: 'test-jwt-secret-for-vitest-at-least-32-chars',
      REDIS_HOST: '127.0.0.1',
      REDIS_PORT: '6379',
      WA_ENCRYPTION_KEY: '0000000000000000000000000000000000000000000000000000000000000000',
    },
    coverage: {
      provider: 'v8',
      reporter: ['text', 'lcov', 'html'],
      reportsDirectory: './coverage',
      include: ['src/**/*.ts'],
      exclude: [
        // Entry point & DB tooling — not unit testable
        'src/index.ts',
        'src/db/**',
        // Infrastructure adapters — always mocked in tests; no business logic
        'src/config/**',
        'src/socket/**',
        'src/utils/crypto.ts',
        // AI provider SDK wrappers — integration-test territory (real API keys needed)
        'src/providers/**',
        // Repository layer — thin Drizzle ORM wrappers; tested via integration tests
        'src/**/*.repository.ts',
        // WhatsApp — Baileys integration; requires live WA connection to test
        'src/modules/whatsapp/**',
      ],
      thresholds: {
        lines: 70,
        functions: 70,
        branches: 70,
        statements: 70,
      },
    },
  },
});
