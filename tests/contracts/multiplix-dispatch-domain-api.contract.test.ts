/**
 * F54 (Bloco E) — CONTRATO da API de dominio do `multiplix-dispatch`.
 *
 * O que este contrato trava (a versao "de API publica" do roteador):
 *   (a) as 14 acoes do Bloco E estao em `HANDLERS` e NENHUMA esta em `PENDING_ACTIONS`;
 *   (b) toda acao desconhecida responde 400 NOMEADO (nunca 500) nem cai num 501 mudo;
 *   (c) o log estruturado do roteador NAO carrega conteudo de mensagem/telefone —
 *       so campos escolhidos (data de negocio proibida no log);
 *   (d) toda resposta de SUCESSO (a que sai do handler) carrega `x-correlation-id`.
 *
 * Sem rede: le os arquivos de origem como TEXTO e afirma sobre o que esta escrito.
 * E a mesma tecnica do contrato do F53 (`multiplix-dispatch/__tests__/f53-rate-limit.test.ts`):
 * o roteador sobe I/O (auth/JWT + banco) que um teste offline nao pode exercer, entao a
 * fronteira provada aqui e ESTRUTURAL — o que e exatamente o que o gate precisa: se alguem
 * tirar uma acao do mapa, afrouxar o 400 ou enfiar o payload no log, isto morre.
 *
 * Roda nos DOIS runners da CI, sem rede:
 *   - `deno test --config scripts/ci/deno.json --frozen --allow-read tests/contracts/<este>`
 *   - `bun run test:contracts` (vitest, que varre tests/contracts/**\/*.test.ts)
 * Por isso o harness dual abaixo: `Deno.test` quando o runtime e Deno, `it()` do vitest
 * sob Node. NAO ha logica duplicada — so o REGISTRO do caso muda; as assercoes sao unicas.
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
  // Specifier nao-literal: o Deno nao tenta resolver 'vitest' no `deno check` (que roda
  // com --frozen e sem essa dependencia); sob Node o vitest resolve normalmente.
  const spec = 'vit' + 'est';
  const mod = (await import(spec)) as { it: (name: string, fn: CaseFn) => void };
  registrar = (name, fn) => { mod.it(name, fn); };
}

function assert(cond: unknown, msg: string): void {
  if (!cond) throw new Error(`[contrato F54] ${msg}`);
}

/** Raiz do repo: `tests/contracts/<este>` sobe dois niveis. */
const ROOT = fileURLToPath(new URL('../../', import.meta.url));
const read = (rel: string): string => readFileSync(resolve(ROOT, rel), 'utf8');

const INDEX = 'supabase/functions/multiplix-dispatch/index.ts';

/** As 14 acoes do Bloco E ligadas no roteador (F44-F52). */
const EXPECTED_ACTIONS = [
  'draft.create',
  'draft.get',
  'draft.update',
  'draft.discard',
  'blocks.upsert',
  'blocks.delete',
  'blocks.reorder',
  'audience.select',
  'preview',
  'validate',
  'eligibility.summary',
  'estimate',
  'confirm',
  'status',
] as const;

/** Remove comentarios: as linhas de explicacao citam "500"/"mensagem" de proposito. */
const stripComments = (src: string): string =>
  src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/[^\n]*/g, '$1');

/** Chaves do objeto literal `HANDLERS`. */
function handlersKeys(src: string): string[] {
  const start = src.indexOf('const HANDLERS');
  assert(start >= 0, 'HANDLERS nao encontrado no index.ts');
  const end = src.indexOf('};', start);
  assert(end > start, 'fim do objeto HANDLERS nao encontrado');
  return [...src.slice(start, end).matchAll(/'([a-z][a-z0-9_.]*)'\s*:/g)].map((m) => m[1]);
}

/** Corpos dos objetos passados a `console.warn/error(JSON.stringify({ ... }))`. */
function logBlocks(src: string): string[] {
  return [...src.matchAll(/console\.(?:warn|error)\(\s*JSON\.stringify\(\{([\s\S]*?)\}\)\)/g)]
    .map((m) => m[1]);
}

const ALLOWED_LOG_KEYS = new Set([
  'event', 'action', 'user_id', 'correlation_id', 'duration_ms', 'status', 'ip', 'ok', 'code',
]);
/** Data de negocio PROIBIDA no log do roteador (conteudo de mensagem / telefone). */
const FORBIDDEN_LOG_TOKENS =
  /(payload|\bbody\b|\btemplate\b|\bcontent\b|\bmessage\b|\bmensagem\b|\bphone\b|\btelefone\b|destino|recipients)/i;

registrar('(a) as 14 acoes estao em HANDLERS e nenhuma esta em PENDING_ACTIONS', () => {
  const src = stripComments(read(INDEX));
  const keys = handlersKeys(src).sort();
  const expected = [...EXPECTED_ACTIONS].sort();

  assert(keys.length === 14, `esperava 14 acoes em HANDLERS, veio ${keys.length}: ${keys.join(', ')}`);
  assert(
    JSON.stringify(keys) === JSON.stringify(expected),
    `acoes divergentes do contrato.\n  veio:      ${keys.join(', ')}\n  esperado:  ${expected.join(', ')}`,
  );

  const pending = /PENDING_ACTIONS\s*=\s*\[([\s\S]*?)\]\s*as const/.exec(src);
  assert(pending !== null, 'PENDING_ACTIONS nao encontrado no index.ts');
  const pendentes = [...(pending as RegExpExecArray)[1].matchAll(/'([^']+)'/g)].map((m) => m[1]);
  assert(pendentes.length === 0, `PENDING_ACTIONS deveria estar VAZIO, tem: ${pendentes.join(', ')}`);
  for (const action of EXPECTED_ACTIONS) {
    assert(!pendentes.includes(action), `acao ${action} esta LIGADA: nao pode estar em PENDING_ACTIONS`);
  }
});

registrar('(b) acao desconhecida responde 400 nomeado e NUNCA 500', () => {
  const src = stripComments(read(INDEX));
  const start = src.indexOf('if (!handler)');
  assert(start >= 0, 'ramo de handler desconhecido (if (!handler)) nao encontrado');
  const end = src.indexOf('const response = await handler(', start);
  assert(end > start, 'a ligacao `const response = await handler(` nao foi encontrada apos o ramo');
  const region = src.slice(start, end);

  assert(
    /errorResponse\([^,]*,\s*400,\s*req\)/.test(region),
    'acao desconhecida deve responder 400 (errorResponse(..., 400, req))',
  );
  assert(/Action is not allowed/.test(region), 'o erro de acao desconhecida deve ser NOMEADO');
  assert(!/\b500\b/.test(src), 'index.ts NAO pode usar o status 500 (nem para acao desconhecida)');
});

registrar('(c) o log estruturado do index NAO carrega conteudo de mensagem/telefone', () => {
  const src = stripComments(read(INDEX));
  const blocks = logBlocks(src);
  assert(blocks.length === 2, `esperava 2 logs estruturados no index, veio ${blocks.length}`);

  for (const block of blocks) {
    for (const m of block.matchAll(/([A-Za-z_][A-Za-z0-9_]*)\s*:/g)) {
      assert(ALLOWED_LOG_KEYS.has(m[1]), `campo nao permitido no log estruturado: "${m[1]}"`);
    }
    const bad = FORBIDDEN_LOG_TOKENS.exec(block);
    assert(bad === null, `log carrega conteudo de negocio proibido: "${bad?.[0]}"`);
  }
});

registrar('(d) toda resposta de sucesso (do handler) carrega x-correlation-id', () => {
  const src = stripComments(read(INDEX));
  const handlerCall = src.indexOf('const response = await handler(');
  const headerSet = src.indexOf("response.headers.set('x-correlation-id', correlationId)");
  const returns = src.indexOf('return response;', Math.max(handlerCall, 0));

  assert(handlerCall >= 0, 'a resposta do handler nao e capturada em `response`');
  assert(headerSet > handlerCall, 'x-correlation-id deve ser setado na resposta do handler');
  assert(returns > headerSet, 'x-correlation-id precisa ser setado ANTES do `return response`');
});
