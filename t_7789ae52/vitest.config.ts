import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import path from "path";
import { fileURLToPath } from "node:url";

const rootDir = fileURLToPath(new URL(".", import.meta.url));

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
      include: [
        "src/lib/**/*.{ts,tsx}",
        "src/services/**/*.{ts,tsx}",
        // E79: escopo do módulo do mapa passa a entrar na cobertura (antes ficava de fora).
        "src/components/inbox/location-picker/**/*.{ts,tsx}",
        "src/components/contacts/ContactForm.tsx",
      ],
      exclude: ["**/*.{test,spec}.{ts,tsx}", "**/__tests__/**", "**/*.d.ts"],
      // Piso global medido em 2026-09-05 (src/lib + src/services): lines 37.7, stmts 36.1,
      // funcs 44.9, branches 32.7. Ratchet: so sobe, nunca desce.
      thresholds: {
        lines: 36,
        statements: 35,
        functions: 43,
        branches: 31,
        // E79: piso do módulo do mapa (medido 2026-10-02, agregado do escopo abaixo):
        // lines 91.97 / branches 79.13. Mesmo glob de coverage.include acima.
        "{src/lib/mapbox*.{ts,tsx},src/components/inbox/location-picker/**/*.{ts,tsx},src/components/contacts/ContactForm.tsx}":
          { lines: 85, branches: 75 },
      },
    },
  },
  resolve: {
    alias: { "@": path.resolve(rootDir, "./src") },
  },
});
