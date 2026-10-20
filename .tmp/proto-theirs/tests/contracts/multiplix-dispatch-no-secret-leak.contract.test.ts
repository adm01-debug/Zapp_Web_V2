/**
 * F54 (Bloco E) — CONTRATO de NAO-LEAK de segredo e de payload nas edges do Multiplix.
 *
 * A edge `multiplix-dispatch` (index + actions) le segredos de ambiente
 * (`SUPABASE_SERVICE_ROLE_KEY`, `EXTERNAL_SUPABASE_SERVICE_ROLE_KEY`,
 * `MULTIPLIX_SCOPE_HMAC_SECRET`) e recebe payload de cliente (template, destinatarios,
 * telefone). NADA disso pode ir para o log. Este contrato prova:
 *   (a) nenhum arquivo da edge usa `console.log` nem log que nao seja o ESTRUTURADO
 *       (`console.warn/error(JSON.stringify({ ...campos escolhidos... }))`);
 *   (b) nenhum nome de segredo (nem `requireEnv`/`Deno.env`, nem o VALOR de env)
 *       aparece dentro de um log, e nenhum log leva payload inteiro;
 *   (c) os segredos continuam sendo LIDOS (foram removidos do codigo, nao do log).
 *
 * Sem rede: le os arquivos da edge como TEXTO. Roda nos DOIS runners da CI:
 *   - `deno test --config scripts/ci/deno.json --frozen --allow-read tests/contracts/<este>`
 *   - `bun run test:contracts` (vitest)
 * Harness dual: `Deno.test` no Deno, `it()` no vitest; as assercoes sao unicas.
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';

const IS_DENO = typeof Deno !== 'undefined' && typeof (Deno as { test?: unknown }).test === 'function';

type CaseFn = () => void | Promise<void>;
let registrar: (name: string, fn: CaseFn) => void;
if (IS_DENO) {
  registrar = (name, fn) => { Deno.test(name, fn); };
} else {
  const spec = 'vit' + 'est';
  const mod = (await import(spec)) as { it: (name: string, fn: CaseFn) => void };
  registrar = (name, fn) => { mod.it(name, fn); };
}

function assert(cond: unknown, msg: string): void {
  if (!cond) throw new Error(`[contrato F54] ${msg}`);
}

const ROOT = fileURLToPath(new URL('../../', import.meta.url));
const read = (rel: string): string => readFileSync(resolve(ROOT, rel), 'utf8');

const EDGE = 'supabase/functions/multiplix-dispatch';
const EDGE_FILES = [
  `${EDGE}/index.ts`,
  ...['blocks', 'audience', 'inspect', 'lifecycle'].map((n) => `${EDGE}/actions/${n}.ts`),
];

const stripComments = (src: string): string =>
  src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/[^\n]*/g, '$1');

/** Corpos dos objetos passados a `console.warn/error(JSON.stringify({ ... }))`. */
function logBlocks(src: string): string[] {
  return [...src.matchAll(/console\.(?:warn|error)\(\s*JSON\.stringify\(\{([\s\S]*?)\}\)\)/g)]
    .map((m) => m[1]);
}

/** Nomes de segredo que JAMAIS podem aparecer num log. */
const SECRET_ENV_NAMES = [
  'SUPABASE_SERVICE_ROLE_KEY',
  'EXTERNAL_SUPABASE_SERVICE_ROLE_KEY',
  'MULTIPLIX_SCOPE_HMAC_SECRET',
];

/**
 * Conteudo de NEGOCIO/segredo proibido no log: payload inteiro, corpo da requisicao,
 * template, destinatario/telefone, e o valor de qualquer env (requireEnv / Deno.env).
 * `recipients` NAO entra: no log ele e a CONTAGEM (`rows.length`), nao o array.
 */
const FORBIDDEN_IN_LOG =
  /(payload|req\.body|\.body\b|\btemplate\b|\bcontent\b|\bmessage\b|\bmensagem\b|\bphone\b|\btelefone\b|destino|serviceKey|externalKey|externalUrl|scopeSecret|requireEnv|Deno\.env|SERVICE_ROLE_KEY|HMAC_SECRET)/;

registrar('(a) as edges so logam ESTRUTURADO — nenhum console.log de payload inteiro', () => {
  for (const file of EDGE_FILES) {
    const src = stripComments(read(file));
    assert(!/console\.log\s*\(/.test(src), `${file}: proibido console.log (o contrato e o log estruturado)`);

    const methods = [...src.matchAll(/console\.(\w+)\s*\(/g)].map((m) => m[1]);
    for (const method of methods) {
      assert(
        method === 'warn' || method === 'error',
        `${file}: console.${method} nao permitido (use console.warn/error estruturado)`,
      );
    }
    const structured = [...src.matchAll(/console\.(?:warn|error)\(\s*JSON\.stringify\(\{/g)].length;
    assert(
      structured === methods.length,
      `${file}: todo log deve ser console.warn/error(JSON.stringify({...})) (${structured}/${methods.length})`,
    );
  }
});

registrar('(b) nenhum segredo nem conteudo de payload entra no log', () => {
  const counts: Record<string, number> = {};
  for (const file of EDGE_FILES) {
    const src = stripComments(read(file));
    const blocks = logBlocks(src);
    counts[file] = blocks.length;
    for (const block of blocks) {
      for (const name of SECRET_ENV_NAMES) {
        assert(!block.includes(name), `${file}: nome de segredo no log: ${name}`);
      }
      const bad = FORBIDDEN_IN_LOG.exec(block);
      assert(bad === null, `${file}: log carrega conteudo/env proibido: "${bad?.[0]}"`);
    }
  }
  // Ratchet: qualquer log NOVO tem de passar por revisao (e por este contrato).
  assert(counts[`${EDGE}/index.ts`] === 2, `index.ts deveria ter 2 logs, tem ${counts[`${EDGE}/index.ts`]}`);
  assert(
    counts[`${EDGE}/actions/audience.ts`] === 3,
    `audience.ts deveria ter 3 logs, tem ${counts[`${EDGE}/actions/audience.ts`]}`,
  );
  for (const file of [`${EDGE}/actions/blocks.ts`, `${EDGE}/actions/inspect.ts`, `${EDGE}/actions/lifecycle.ts`]) {
    assert(counts[file] === 0, `${file}: nao deveria ter log direto (achei ${counts[file]})`);
  }
});

registrar('(c) os segredos continuam sendo LIDOS (removidos do log, nao do codigo)', () => {
  const index = stripComments(read(`${EDGE}/index.ts`));
  assert(
    index.includes("requireEnv('SUPABASE_SERVICE_ROLE_KEY')"),
    'index.ts deve ler SUPABASE_SERVICE_ROLE_KEY (via requireEnv)',
  );
  const audience = stripComments(read(`${EDGE}/actions/audience.ts`));
  assert(
    audience.includes("requireEnv('EXTERNAL_SUPABASE_SERVICE_ROLE_KEY')"),
    'audience.ts deve ler EXTERNAL_SUPABASE_SERVICE_ROLE_KEY',
  );
  assert(
    audience.includes("Deno.env.get('MULTIPLIX_SCOPE_HMAC_SECRET')"),
    'audience.ts deve ler MULTIPLIX_SCOPE_HMAC_SECRET',
  );
});
