import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import path from "path";

// Sonda descartavel de auditoria (A1). Nao faz parte do projeto.
export default defineConfig({
  plugins: [react()],
  test: {
    root: path.resolve(__dirname, ".."),
    environment: "jsdom",
    globals: true,
    setupFiles: ["./src/test/setup.ts"],
    include: [".tmp/**/*.{test,spec}.{ts,tsx}"],
    testTimeout: 20000,
  },
  resolve: {
    alias: { "@": path.resolve(__dirname, "../src") },
  },
});
