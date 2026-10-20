import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import path from "path";

export default defineConfig({
  plugins: [react()],
  test: {
    environment: "jsdom",
    globals: true,
    setupFiles: ["./src/test/setup.ts"],
    include: ["src/**/*.{test,spec}.{ts,tsx}"],
    testTimeout: 15000,
    coverage: {
      provider: "v8",
      reporter: ["text-summary", "lcov"],
      reportsDirectory: "coverage",
      include: ["src/lib/**/*.{ts,tsx}", "src/services/**/*.{ts,tsx}"],
      exclude: ["**/*.{test,spec}.{ts,tsx}", "**/__tests__/**", "**/*.d.ts"],
      // Piso medido em 2026-09-05 (src/lib + src/services): lines 37.7, stmts 36.1,
      // funcs 44.9, branches 32.7. Ratchet: so sobe, nunca desce.
      thresholds: { lines: 36, statements: 35, functions: 43, branches: 31 },
    },
  },
  resolve: {
    alias: { "@": path.resolve(__dirname, "./src") },
  },
});
