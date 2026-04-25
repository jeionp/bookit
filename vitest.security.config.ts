import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    environment: 'node',
    globals: true,
    include: ['tests/security/**/*.test.ts'],
    testTimeout: 15000,
    hookTimeout: 30000,
  },
})
