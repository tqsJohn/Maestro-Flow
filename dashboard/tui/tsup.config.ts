import { defineConfig } from 'tsup';

export default defineConfig({
  entry: ['src/index.tsx'],
  format: ['esm'],
  target: 'node20',
  dts: false,
  clean: true,
  external: ['react', 'ink', '@inkjs/ui'],
  alias: {
    '@shared': '../src/shared',
  },
});
