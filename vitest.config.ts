import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import path from "path";
import { fileURLToPath } from "node:url";

const rootDir = fileURLToPath(new URL(".", import.meta.url));

// Teto de workers. Sem ele o vitest abre um worker por nucleo (24 nesta maquina);
// com varios cartoes rodando `npx vitest run` juntos a carga estoura (medido
// 11/10/2026: carga 72 com 4 suites). Ordem: (1) VITEST_MAX_WORKERS manda — o
// integrador roda com 10 pelo systemd; (2) no CI do GitHub nao definimos, para
// continuar como hoje; (3) no resto (agentes e uso local) teto de 4.
const fromEnv = Number.parseInt(process.env.VITEST_MAX_WORKERS ?? "", 10);
const maxWorkers =
  Number.isFinite(fromEnv) && fromEnv > 0 ? fromEnv : process.env.CI ? undefined : 4;

export default defineConfig({
  plugins: [react()],
  test: {
    environment: "jsdom",
    globals: true,
    setupFiles: ["./src/test/setup.ts"],
    include: ["src/**/*.{test,spec}.{ts,tsx}"],
    testTimeout: 15000,
    // maxWorkers so entra quando definido: no CI a chave fica ausente e o
    // vitest segue no padrao dele.
    ...(maxWorkers === undefined ? {} : { maxWorkers }),
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
        // SL-154 (DEC-1): o módulo do Catálogo passa a entrar na cobertura (antes era medido
        // só por override de CLI: --coverage.include='src/components/catalog/**').
        "src/components/catalog/**/*.{ts,tsx}",
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
        // SL-123: piso POR ARQUIVO. Um glob com um único arquivo é medido só nesse
        // arquivo, então cada entrada abaixo é um piso por arquivo. O agregado acima é
        // puxado pelo `lib` (95,50 linhas) e escondia os dois arquivos deste cartão.
        // `perFile: true` não fecha isto: é chave GLOBAL do Vitest e passaria a exigir os
        // pisos globais (36/35/43/31) de cada arquivo do coverage.include — inclusive os
        // que não têm teste e entram a 0% na rodada completa.
        // ContactForm.tsx: medido 74,50 linhas / 58,27 branches (2026-10-02).
        // mapboxLoader.ts: era 0% (os testes de UI mockam o módulo inteiro); 100% com
        // src/lib/__tests__/mapboxLoader.test.ts (2026-10-08).
        "src/components/contacts/ContactForm.tsx": { lines: 70, branches: 55 },
        "src/lib/mapboxLoader.ts": { lines: 85, branches: 75 },
        // SL-154 (DEC-1): piso do módulo do Catálogo — a medição de 2026-10-08 é do PRÓPRIO
        // módulo src/components/catalog/** (não é agregado de outro escopo): lines 88.18 /
        // branches 83.21. Mesmo glob de coverage.include.
        "src/components/catalog/**/*.{ts,tsx}": { lines: 80, branches: 80 },
      },
    },
  },
  resolve: {
    alias: { "@": path.resolve(rootDir, "./src") },
  },
});
