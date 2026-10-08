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
      // SL-123 (08/10/2026): piso POR ARQUIVO ligado. Antes só existia piso agregado por
      // glob e o agregado escondia arquivo abaixo do piso do grupo — medido em 02/10:
      // ContactForm.tsx 58,27% de branches e mapboxLoader.ts 0% passavam. Com perFile,
      // TODO limiar vale arquivo a arquivo, inclusive os globais abaixo.
      thresholds: {
        perFile: true,
        // Piso global, agora por ARQUIVO: mínimo medido em 08/10/2026 nos 114 arquivos do
        // escopo — 0% nas quatro métricas, por causa de 11 arquivos que nenhuma suíte
        // importa (lista no relato do SL-123). Fica registrado em 0 e sobe conforme cada
        // arquivo ganhar teste; o piso de verdade de cada grupo está nos globs abaixo.
        lines: 0,
        statements: 0,
        functions: 0,
        branches: 0,
        // E79 + SL-123: piso do módulo do mapa, medido POR ARQUIVO em 08/10/2026 (menor
        // linha 93,93%, menor branch 84,00%). O piso de 85/75 continua, agora cobrado de
        // cada arquivo. É também o ratchet: só sobe, nunca desce.
        // mapboxLoader.ts fica fora deste glob de propósito — segue em 0% e tem item
        // próprio no inventário (Contatos/Testes mapa); entra aqui quando ganhar teste.
        "{src/lib/mapbox{CostGuard,Geocode,Session,Token}.ts,src/components/inbox/location-picker/**/*.{ts,tsx}}":
          { lines: 85, branches: 75 },
        // ContactForm.tsx ganhou piso PRÓPRIO por arquivo: o branches dele (70,70% medido
        // em 08/10/2026) fica abaixo dos 75% do grupo e o piso agregado escondia isso.
        // Subir o branches dele é trabalho da área de telas (ContactForm.tsx), não deste piso.
        "src/components/contacts/ContactForm.tsx": {
          lines: 85,
          statements: 78,
          functions: 68,
          branches: 70,
        },
      },
    },
  },
  resolve: {
    alias: { "@": path.resolve(rootDir, "./src") },
  },
});
