import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['src/**/*.test.ts'],
    exclude: ['src/server/execution/execution-scheduler.test.ts'],
    environment: 'node',
  },
});
