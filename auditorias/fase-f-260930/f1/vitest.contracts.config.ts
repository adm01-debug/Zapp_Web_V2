import { defineConfig } from 'vitest/config';

// Suíte de contrato das Edge Functions (roda em Node).
// schemas.ts importa zod@3.23.8 via URL esm.sh (runtime Deno). O vite-node
// externaliza specifiers http:// antes do resolveId, então a reescrita é
// feita no hook `transform` do módulo pai: URL → bare specifier `zod3`
// (alias npm de zod@3.23.8). O import original NÃO muda no fonte — o Deno
// em produção continua resolvendo a URL. O zod v4 do app não é afetado.
export default defineConfig({
  plugins: [{
    name: 'rewrite-deno-url-imports',
    enforce: 'pre',
    transform(code: string, id: string) {
      if (id.includes('supabase/functions') && code.includes('https://esm.sh/zod@3.23.8')) {
        return code.split('"https://esm.sh/zod@3.23.8"').join('"zod3"')
                   .split("'https://esm.sh/zod@3.23.8'").join("'zod3'");
      }
      return null;
    },
  }],
  test: {
    environment: 'node',
    include: ['tests/contracts/**/*.test.ts'],
  },
});
