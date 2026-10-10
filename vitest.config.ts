import { defineConfig } from 'vitest/config';
export default defineConfig({ test: { include: ['tests/**/*.test.ts'], exclude: ['tests/**/*.slow.test.ts', 'node_modules/**'], testTimeout: 120000, hookTimeout: 60000, pool: 'forks' } });
