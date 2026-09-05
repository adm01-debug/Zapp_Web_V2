import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "path";
import { componentTagger } from "lovable-tagger";

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => {
  const isProd = mode === "production";
  const buildId = process.env.VERCEL_GIT_COMMIT_SHA || process.env.GITHUB_SHA || `local-${Date.now()}`;

  return {
    server: {
      host: "::",
      port: 8080,
    },
    plugins: [
      react(),
      mode === "development" && componentTagger(),
      {
        name: "zapp-build-version",
        generateBundle() {
          this.emitFile({
            type: "asset",
            fileName: "version.json",
            source: JSON.stringify({ buildId }),
          });
        },
      },
      // PWA disabled to resolve preview issues
    ].filter(Boolean),
    define: {
      __ZAPP_BUILD_ID__: JSON.stringify(buildId),
    },
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
      rolldownOptions: {
        output: {
          // Vite 8 = rolldown. A compat de `manualChunks` aplica os grupos com
          // `includeDependenciesRecursively: true`: o grupo vendor-charts
          // arrastava o React (dependencia do recharts) e vendor-maps arrastava
          // o helper de preload do Vite — o entry passava a importar os dois
          // chunks estaticamente e o first paint carregava 1,8 MB de mapbox +
          // 450 KB de recharts (968 KB gzip vs budget de 350). Aqui os grupos
          // sao nativos, com prioridade explicita: vendor-core (React + helper
          // de preload) e reivindicado primeiro e nenhuma recursao o arrasta.
          codeSplitting: {
            includeDependenciesRecursively: true,
            groups: [
              // Core React (react, react-dom, react-router*, @remix-run/router) e o
              // helper virtual de preload do Vite (\0vite/preload-helper.js): sem
              // capturar aqui, a recursao de qualquer grupo com import() dinamico
              // (jspdf, mapbox) o arrasta e o entry passa a pre-carregar esse grupo.
              { name: "vendor-core", priority: 100,
                test: /(node_modules[\\/](react|react-dom|scheduler|react-router|react-router-dom|@remix-run)[\\/]|vite[\\/]preload-helper)/ },
              // Lucide icons - split into a separate chunk to avoid bloating other chunks
              { name: "vendor-icons", priority: 90, test: /node_modules[\\/]lucide-react[\\/]/ },
              // Data layer
              { name: "vendor-data", priority: 90,
                test: /node_modules[\\/](@tanstack[\\/]react-query|@supabase[\\/]supabase-js)[\\/]/ },
              // UI components from node_modules
              { name: "vendor-ui", priority: 80,
                test: /node_modules[\\/](@radix-ui|framer-motion|class-variance-authority|clsx|tailwind-merge)[\\/]/ },
              // Date utilities
              { name: "vendor-utils", priority: 70, test: /node_modules[\\/]date-fns[\\/]/ },
              // Charts (loaded only by dashboards/reports)
              { name: "vendor-charts", priority: 60,
                test: /node_modules[\\/](recharts|d3-[a-z-]+|victory-vendor)[\\/]/ },
              // PDF generation (loaded on-demand in reports, split out)
              { name: "vendor-pdf", priority: 60,
                test: /node_modules[\\/](jspdf|jspdf-autotable|html2canvas)[\\/]/ },
              // Maps (heavy, rarely used) — so entra via import dinamico em src/lib/mapboxLoader.ts
              { name: "vendor-maps", priority: 60, test: /node_modules[\\/]mapbox-gl[\\/]/ },
              // VoIP / SIP stack (heavy, loaded only on call views). Ancorado em
              // node_modules: "sip/" solto tambem casava com src/hooks/sip/.
              { name: "vendor-voip", priority: 60, test: /node_modules[\\/]sip\.js[\\/]/ },
              // Voice SDK — @elevenlabs/react embute LiveKit (~610KB min);
              // sem esta regra cai num chunk "dist-*" importado pelo ChatPanel.
              { name: "vendor-voice", priority: 60,
                test: /node_modules[\\/](@elevenlabs|livekit-client|@livekit)[\\/]/ },
            ],
          },
        },
      },
    },
  };
});
