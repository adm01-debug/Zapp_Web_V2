import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import path from "path";

const root = path.resolve(__dirname, "..");

export default defineConfig({
  root,
  plugins: [react()],
  test: {
    environment: "jsdom",
    globals: true,
    setupFiles: ["./src/test/setup.ts"],
    include: [".tmp/a2-*.test.{ts,tsx}"],
    testTimeout: 60000,
    hookTimeout: 60000,
    pool: "forks",
    poolOptions: { forks: { singleFork: true } },
    fileParallelism: false,
  },
  resolve: { alias: { "@": path.resolve(root, "./src") } },
});
