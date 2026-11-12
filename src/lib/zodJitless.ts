/**
 * Liga o modo `jitless` do Zod v4 — e SÓ isso. É o PRIMEIRO import de `main.tsx`.
 *
 * O Zod lê `jitless` ao DEFINIR cada `z.object` e guarda em cache o teste
 * `new Function("")` (`allowsEval`). A CSP do app não tem `'unsafe-eval'`: se um
 * único schema for definido antes desta configuração, o teste roda e a violação
 * vai para o console e para o report da CSP. Rodar aqui, antes de qualquer outro
 * módulo do app ser avaliado, garante a ordem para todo o bundle — inclusive
 * código que importe o Zod por outro caminho.
 *
 * Por que escrever direto em `globalThis.__zod_globalConfig` em vez de chamar
 * `config()` de `zod/v4/core`: importar o núcleo aqui arrastava o Zod inteiro
 * (core) para o chunk de entrada — +3,9 KB gzip no JS inicial, estourando o
 * budget de `performance-budget.json` (327,6 KB > 325 KB). O próprio Zod guarda
 * a configuração global nesse objeto (`globalThis.__zod_globalConfig ??= {}` em
 * `zod/v4/core/core.js`) e o reaproveita se já existir; preenchê-lo antes tem o
 * mesmo efeito, com custo zero de bundle. Se uma versão futura do Zod mudar esse
 * detalhe interno, `src/lib/__tests__/zod-jitless.test.ts` falha.
 */
type ZodGlobalConfigHolder = { __zod_globalConfig?: { jitless?: boolean } };

const holder = globalThis as typeof globalThis & ZodGlobalConfigHolder;
(holder.__zod_globalConfig ??= {}).jitless = true;

export {};
