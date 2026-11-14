import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "path";

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
      {
        name: "zapp-build-version",
        generateBundle() {
          (this as unknown as import('vite').Rollup.PluginContext).emitFile({
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
        "@": path.resolve(import.meta.dirname, "./src"),
      },
      dedupe: ["react", "react-dom", "react/jsx-runtime", "framer-motion"],
    },
    optimizeDeps: {
      include: ["react", "react-dom", "framer-motion", "lucide-react"],
      force: true,
    },
    build: {
      target: "esnext",
      cssMinify: true,
      chunkSizeWarningLimit: 1200,
      // sourcemap: 'hidden' → source maps are generated but NOT linked in the
      // output HTML/JS. This allows Sentry to process them without exposing
      // the original source to end users. Use 'false' if Sentry is not set up.
      sourcemap: isProd ? false : true,
      // Skip gzip size reporting to speed up production builds by ~15-25%.
      reportCompressedSize: false,
      rolldownOptions: {
        output: {
          // Vite 8 uses Rolldown/Oxc. The former `esbuild` block was only a
          // compatibility shim and was ignored when Oxc options were present.
          // Keep `console.warn` and `console.error` for runtime diagnostics;
          // Oxc's `dropConsole` is intentionally not used because it removes
          // all console calls. `dropDebugger` has the desired narrow scope.
          minify: isProd
            ? {
                compress: {
                  dropDebugger: true,
                },
              }
            : undefined,
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
              // lucide-react NAO tem grupo proprio de proposito: um grupo unico
              // funde icones alcancados estaticamente (entry) com os alcancados
              // so por import() dinamico no MESMO chunk - qualquer icone estatico
              // torna o chunk inteiro inicial e import() de mapas de icones
              // (catalogCategoryIcons.ts) arrastaria tudo para o first paint
              // (152 KB gzip; estourou o budget de 350 KB no PR #415). Sem grupo,
              // cada icone segue a alcancabilidade do seu importador.
              // Data layer
              { name: "vendor-data", priority: 90,
                test: /node_modules[\\/](@tanstack[\\/]react-query|@supabase[\\/]supabase-js)[\\/]/ },
              // Utilitarios de classe usados pelo shell inteiro (cn, cva), o shim
              // use-sync-external-store e SO os primitivos Radix que o shell usa no
              // boot (Tooltip, Toast e o que eles importam). O grupo e alcancado
              // estaticamente pelo entry, entao TODO modulo dele vira peso de first
              // paint: por isso ele so leva o que o first paint usa de qualquer jeito.
              // - O resto do Radix (select, menu, dialog, slider...) fica no
              //   vendor-radix, abaixo (13/11/2026): com o Radix inteiro aqui ele
              //   ia junto para o first paint (66,8 KB gzip). Se o shell passar a
              //   importar um primitivo que nao esta nesta lista, o vendor-radix
              //   inteiro vira inicial (~33 KB gzip): inclua o primitivo aqui (o
              //   bundle-budget lista os chunks iniciais; vendor-radix nao pode
              //   aparecer nela).
              // - Os primitivos do shell e o @floating-ui PRECISAM de dono aqui, com
              //   prioridade maior que a do vendor-radix: sao deps de select/menu/
              //   popover; sem dono, a recursao (includeDependenciesRecursively) do
              //   vendor-radix os reivindica e o entry passa a importar o vendor-radix.
              // - clsx/use-sync-external-store PRECISAM de dono aqui pelo mesmo
              //   motivo: sao deps do recharts; sem este grupo a recursao do
              //   vendor-charts os reivindica e o entry passa a importar o
              //   vendor-charts inteiro (medido: 426 KB gzip iniciais).
              // - Radix sem grupo nenhum (cada primitivo seguindo o importador)
              //   tambem tira o peso do first paint, mas fragmenta em dezenas de
              //   chunks e soma +34 KB gzip no total-assets (estourou o teto de
              //   4100 KB na PR #3034); com os dois grupos o total fica em ~+4 KB.
              // - framer-motion tem grupo proprio (vendor-motion, abaixo), que
              //   segue a alcancabilidade dos importadores (SL-103A/SL-103C).
              { name: "vendor-ui", priority: 80,
                test: /node_modules[\\/](class-variance-authority|clsx|tailwind-merge|use-sync-external-store|@floating-ui[\\/][^\\/]+|@radix-ui[\\/](primitive|react-(collection|compose-refs|context|dismissable-layer|focus-scope|id|popper|portal|presence|primitive|slot|toast|tooltip|use-callback-ref|use-controllable-state|use-effect-event|use-layout-effect|use-size|visually-hidden)))[\\/]/ },
              // Radix usado so por telas lazy + as deps de scroll-lock/aria do
              // Dialog/Select/Menu. Nao e alcancado pelo entry: so baixa quando a
              // primeira tela com um desses primitivos abre (depois, cache).
              { name: "vendor-radix", priority: 75,
                test: /node_modules[\\/](@radix-ui|aria-hidden|react-remove-scroll|react-remove-scroll-bar|react-style-singleton|use-callback-ref|use-sidecar|detect-node-es|get-nonce)[\\/]/ },
              // Runtime de animacao (framer-motion + deps). Grupo separado de
              // proposito: junto do Radix ele era baixado no first paint sem
              // nenhuma animacao ter sido pedida (medido 107,5 KB gzip em
              // vendor-ui). Aqui ele vira chunk proprio e so e buscado quando um
              // componente que anima realmente carrega.
              { name: "vendor-motion", priority: 80,
                test: /node_modules[\\/](framer-motion|motion-dom|motion-utils)[\\/]/ },
              // Date utilities. Fica agrupado de proposito: sem grupo, cada funcao do
              // date-fns vira um chunk proprio (36 chunks, +13 KB gzip no total-assets)
              // para economizar ~3 KB do first paint. O shell ja usa format/locale.
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
