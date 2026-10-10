import { defineConfig } from 'vitest/config';
export default defineConfig({ test: { include: ['tests/**/*.slow.test.ts'], testTimeout: 1_800_000, pool: 'forks' } });
