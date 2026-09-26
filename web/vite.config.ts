/// <reference types="vitest/config" />
import { defineConfig } from 'vite';

export default defineConfig({
  base: process.env.BASE_PATH ?? '/',
  test: { environment: 'node', include: ['src/**/*.test.ts'] },
});
