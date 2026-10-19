import { configDefaults, defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['tests/**/*.test.ts'],
    // Integration tests need a real PocketBase binary; npm test stays offline.
    exclude: [...configDefaults.exclude, 'tests/pocketbase/integration/**'],
    passWithNoTests: false,
    clearMocks: true,
    restoreMocks: true,
  },
});
