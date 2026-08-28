import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "path";
import { componentTagger } from "lovable-tagger";
import { VitePWA } from "vite-plugin-pwa";

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => {
  const isProd = mode === "production";

  return {
    server: {
      host: "::",
      port: 8080,
    },
    plugins: [
      react(),
      mode === "development" && componentTagger(),
      // PWA disabled to resolve preview issues
    ].filter(Boolean),
    resolve: {
      alias: {
        "@": path.resolve(__dirname, "./src"),
      },
      dedupe: ["react", "react-dom", "react/jsx-runtime", "framer-motion"],
    },
    optimizeDeps: {
      include: ["react", "react-dom", "framer-motion", "lucide-react"],
      force: true,
    },
    esbuild: {
      // In production: remove `debugger` statements entirely.
      // Do NOT drop 'console' globally — console.error and console.warn
      // must survive for ErrorBoundary, Sentry, and runtime error tracking.
      drop: isProd ? ["debugger"] : [],

      // Mark informational console methods as pure (no side effects).
      // esbuild will tree-shake these calls away during minification
      // since their return value (undefined) is never used.
      // console.error and console.warn are intentionally EXCLUDED so they
      // survive in production for error monitoring.
      pure: isProd
        ? [
            "console.log",
            "console.debug",
            "console.info",
            "console.trace",
            "console.group",
            "console.groupCollapsed",
            "console.groupEnd",
            "console.time",
            "console.timeEnd",
            "console.dir",
            "console.dirxml",
            "console.table",
          ]
        : [],
    },
    build: {
      target: "esnext",
      minify: "esbuild",
      cssMinify: true,
      chunkSizeWarningLimit: 1200,
      // sourcemap: 'hidden' → source maps are generated but NOT linked in the
      // output HTML/JS. This allows Sentry to process them without exposing
      // the original source to end users. Use 'false' if Sentry is not set up.
      sourcemap: isProd ? "hidden" : true,
      // Skip gzip size reporting to speed up production builds by ~15-25%.
      reportCompressedSize: false,
      rollupOptions: {
        output: {
          manualChunks(id) {
            // Core React
            if (
              id.includes("node_modules/react/") ||
              id.includes("node_modules/react-dom/") ||
              id.includes("node_modules/react-router")
            ) {
              return "vendor-core";
            }
            // Lucide icons - split into a separate chunk to avoid bloating other chunks
            if (id.includes("lucide-react")) {
              return "vendor-icons";
            }
            // Data layer
            if (
              id.includes("@tanstack/react-query") ||
              id.includes("@supabase/supabase-js")
            ) {
              return "vendor-data";
            }
            // UI components from node_modules
            if (
              id.includes("@radix-ui") ||
              id.includes("framer-motion") ||
              id.includes("class-variance-authority") ||
              id.includes("clsx") ||
              id.includes("tailwind-merge")
            ) {
              return "vendor-ui";
            }
            // Date utilities
            if (id.includes("date-fns")) {
              return "vendor-utils";
            }
            // Charts
            if (id.includes("recharts") || id.includes("d3-")) {
              return "vendor-charts";
            }
            // PDF generation (loaded on-demand in reports, split out)
            if (id.includes("jspdf") || id.includes("jspdf-autotable")) {
              return "vendor-pdf";
            }
            // Spreadsheet
            if (id.includes("xlsx") || id.includes("sheetjs")) {
              return "vendor-xlsx";
            }
            // Maps (heavy, rarely used)
            if (id.includes("mapbox-gl")) {
              return "vendor-maps";
            }
          },
        },
      },
    },
  };
});
