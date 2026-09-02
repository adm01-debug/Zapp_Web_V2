import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import path from 'path';

export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./src/test/setup.ts'],
    include: ['src/**/*.{test,spec}.{ts,tsx}'],
    testTimeout: 15000,
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html', 'lcov'],
      // Piso deliberadamente ~8-10pp abaixo da cobertura real medida em
      // 2026-09-02 (stmts 48.56% / branch 36.65% / funcs 45.67% / lines
      // 52.42%), para pegar regressão sem quebrar o CI hoje. Suba os
      // números conforme a cobertura real crescer.
      thresholds: {
        statements: 40,
        branches: 28,
        functions: 37,
        lines: 44,
      },
    },
  },
  resolve: {
    alias: { '@': path.resolve(__dirname, './src') },
  },
});
