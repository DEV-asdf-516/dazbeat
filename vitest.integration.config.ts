import { defineConfig } from 'vitest/config';

// Runs against real PocketBase processes (npm run test:integration), so it is kept out of npm test.
export default defineConfig({
  test: {
    environment: 'node',
    include: ['tests/pocketbase/integration/**/*.test.ts'],
    globalSetup: ['tests/pocketbase/integration/globalSetup.ts'],
    passWithNoTests: false,
    clearMocks: true,
    restoreMocks: true,
    testTimeout: 30_000,
    hookTimeout: 120_000,
  },
});
