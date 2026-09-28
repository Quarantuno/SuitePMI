import swc from 'unplugin-swc';
import { defineConfig } from 'vitest/config';

// SWC serve per i decoratori di NestJS (emitDecoratorMetadata), che esbuild non supporta.
export default defineConfig({
  plugins: [swc.vite({ module: { type: 'es6' } })],
  test: {
    globalSetup: ['./test/global-setup.ts'],
    env: {
      DATABASE_URL:
        process.env.TEST_DATABASE_URL ?? 'postgres://suite_app:suite_app_dev@localhost:5432/suite_test',
      DATABASE_ADMIN_URL:
        process.env.TEST_DATABASE_ADMIN_URL ?? 'postgres://postgres:postgres@localhost:5432/suite_test',
      JWT_SECRET: 'segreto-dei-test',
    },
    fileParallelism: false,
    testTimeout: 20_000,
    hookTimeout: 30_000,
  },
});
