import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    environment: 'node',
    globals: true,
    include: ['tests/security/**/*.test.ts'],
    testTimeout: 15000,
    hookTimeout: 30000,
    // Run test files sequentially — both files share the same Firebase emulator,
    // so concurrent clearFirestore() calls from separate workers would race.
    maxWorkers: 1,
    minWorkers: 1,
  },
})
