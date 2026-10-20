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
