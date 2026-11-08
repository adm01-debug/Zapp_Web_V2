import { defineConfig } from 'vitest/config';

// Suíte de contrato das Edge Functions (roda em Node).
// As Edge Functions usam specifiers `npm:` do Deno. O vite-node externaliza
// esses imports antes do resolveId, então o módulo pai é reescrito para aliases
// npm pinados nas mesmas versões. O fonte de produção não muda e o zod v4 do
// app não é afetado.
const DENO_IMPORT_ALIASES = [
  ['https://esm.sh/zod@3.23.8', 'zod3'],
  ['npm:zod@3.23.8', 'zod3'],
  ['https://esm.sh/@supabase/supabase-js@2.87.1', 'supabase-edge'],
  ['npm:@supabase/supabase-js@2.87.1', 'supabase-edge'],
] as const;

export default defineConfig({
  plugins: [{
    name: 'rewrite-deno-imports',
    enforce: 'pre',
    transform(code: string, id: string) {
      if (!id.includes('supabase/functions') && !id.includes('tests/contracts')) return null;
      const transformed = DENO_IMPORT_ALIASES.reduce(
        (source, [specifier, alias]) => source.split(specifier).join(alias),
        code,
      );
      return transformed === code ? null : transformed;
    },
  }],
  test: {
    environment: 'node',
    include: ['tests/contracts/**/*.test.ts'],
    // Teto explicito. O padrao do vitest (5000 ms) e teto de teste de UNIDADE, e esta suite
    // inclui contrato que varre `src/**` inteiro (1416 arquivos) com o compilador TypeScript.
    // Medido em 08/10/2026, contrato pdfjs-sob-demanda: 2,8 s com a maquina ociosa, 4,1 s com
    // carga 33 e mais de 5 s com a maquina em carga 46-51 — ou seja, reprovava por PRAZO e nao
    // por violacao (por isso o CI espelho atribuia a falha ao ultimo cartao integrado).
    // Subir o teto NAO afrouxa assercao nenhuma: a condicao exigida continua a mesma (a lista de
    // violacoes tem de ser vazia), muda so o orcamento de tempo para ela aparecer — mesma decisao
    // ja tomada no vitest.config.ts (`testTimeout: 15000`) e em src/test/setup.ts
    // (`asyncUtilTimeout`), pelo mesmo motivo.
    testTimeout: 30000,
  },
});
