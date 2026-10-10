/**
 * F54 (Bloco E) — CONTRATO da fronteira da edge `multiplix-audience`.
 *
 * A edge sobe I/O (JWT + banco canônico + Singu externo) que um teste offline
 * não pode exercer; a fronteira provada aqui é ESTRUTURAL — lê o `index.ts`
 * como TEXTO e afirma sobre o que está escrito, a mesma técnica do
 * `multiplix-dispatch-domain-api.contract.test.ts`. Trava o que o plano F54
 * lista para a ponte do público:
 *   (a) as 5 RPCs do Singu são chamadas (list_ramos, list_ufs, search_audience,
 *       count_audience, resolve_recipients);
 *   (b) o escopo NÃO vem do body — os schemas zod do corpo são `z.object`
 *       (descartam chave desconhecida) e o escopo é montado do JWT validado;
 *   (c) cache de ramos/UFs na edge com header `x-cache: HIT|MISS` (F26);
 *   (d) rate limit com 429 + `Retry-After` (F53);
 *   (e) assinatura HMAC do escopo em CABEÇALHO (`x-multiplix-scope-hmac`/`-exp`,
 *       F22) — nunca em parâmetro (que daria 404 PGRST202);
 *   (f) nenhum segredo nem payload de cliente vaza no log estruturado.
 *
 * Roda nos DOIS runners da CI, sem rede:
 *   - `deno test --config scripts/ci/deno.json --frozen --allow-read tests/contracts/<este>`
 *   - `bun run test:contracts` (vitest, que varre tests/contracts/**\/*.test.ts)
 * Harness dual: `Deno.test` no Deno, `it()` no vitest; as asserções são únicas.
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
  // Specifier não-literal: o Deno não resolve 'vitest' no `deno check`.
  const spec = 'vit' + 'est';
  const mod = (await import(spec)) as { it: (name: string, fn: CaseFn) => void };
  registrar = (name, fn) => { mod.it(name, fn); };
}

function assert(cond: unknown, msg: string): void {
  if (!cond) throw new Error(`[contrato F54] ${msg}`);
}

/** Raiz do repo: `tests/contracts/<este>` sobe dois níveis. */
const ROOT = fileURLToPath(new URL('../../', import.meta.url));
const read = (rel: string): string => readFileSync(resolve(ROOT, rel), 'utf8');

const INDEX = 'supabase/functions/multiplix-audience/index.ts';

/** Remove comentários (as linhas de explicação citam nomes de propósito). */
const stripComments = (src: string): string =>
  src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/[^\n]*/g, '$1');

function count(haystack: string, needle: string): number {
  let n = 0;
  let idx = 0;
  while ((idx = haystack.indexOf(needle, idx)) !== -1) {
    n += 1;
    idx += needle.length;
  }
  return n;
}

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

/** Conteúdo de negócio/segredo proibido no log. `scope` (permissões) é permitido. */
const FORBIDDEN_IN_LOG =
  /(payload|\bbody\b|\btemplate\b|\bcontent\b|\bmessage\b|\bmensagem\b|\bphone\b|\btelefone\b|destino|scopeSecret|serviceKey|externalKey|externalUrl|requireEnv|Deno\.env|SERVICE_ROLE_KEY|HMAC_SECRET|p_scope)/;

registrar('(a) as 5 RPCs do Singu são chamadas pela edge', () => {
  const src = stripComments(read(INDEX));

  const rpcCalls = [
    "externalClient.rpc('multiplix_list_ramos')",
    "externalClient.rpc('multiplix_list_ufs')",
    "externalClient.rpc('multiplix_search_audience'",
    "externalClient.rpc('multiplix_count_audience'",
    "externalClient.rpc('multiplix_resolve_recipients'",
  ];
  for (const call of rpcCalls) {
    assert(src.includes(call), `RPC não chamada: ${call}`);
  }
  // resolve_recipients tem DOIS call sites: a ação `resolve` e a re-resolução
  // dentro de `create_draft` — os dois usam o mesmo caminho em lotes (F27).
  const resolveSites = count(src, "externalClient.rpc('multiplix_resolve_recipients'");
  assert(resolveSites === 2, `esperava 2 call sites de resolve_recipients, veio ${resolveSites}`);

  // As duas RPCs de lista passam pelo cache nomeado (F26).
  assert(src.includes("'ramos', 'multiplix_list_ramos'"), 'list_ramos deve passar pelo cache');
  assert(src.includes("'ufs', 'multiplix_list_ufs'"), 'list_ufs deve passar pelo cache');
});

registrar('(b) o escopo NÃO vem do body (schemas zod descartam chave desconhecida)', () => {
  const src = stripComments(read(INDEX));

  // O corpo aceita apenas `action` + `params` (record permissivo); não existe
  // campo de escopo no envelope.
  assert(
    /const RequestSchema = z\.object\(\{[\s\S]*?params: z\.record\(z\.unknown\(\)\)[\s\S]*?\}\)/.test(src),
    'RequestSchema deve aceitar params como z.record(z.unknown())',
  );

  // Cada ação revalida `params` por um schema `z.object` — que por padrão
  // STRIPA chave desconhecida (uma `p_scope_permissions` forjada no body não
  // chega a lugar nenhum).
  const safeParses = [
    'SearchParamsSchema.safeParse(params)',
    'FiltersSchema.safeParse(params)',
    'ResolveParamsSchema.safeParse(params)',
    'CreateDraftParamsSchema.safeParse(params)',
  ];
  for (const parse of safeParses) {
    assert(src.includes(parse), `faltou ${parse} (chave desconhecida não seria descartada)`);
  }

  // O escopo é montado NO SERVIDOR a partir do JWT já validado.
  assert(src.includes('const auth = await requireAuth(req)'), 'o escopo parte do JWT validado por requireAuth');
  assert(src.includes('const scopePermissions: string[] = []'), 'o escopo é montado no servidor');
  assert(src.includes("canonical.rpc('is_admin'"), 'o papel admin vem do banco canônico (is_admin)');
  assert(src.includes('user_has_permission'), 'as permissões vêm do banco canônico (user_has_permission)');

  // As 4 chamadas de escopo enviam a variável do servidor, nunca o corpo.
  const fromServer = count(src, 'p_scope_permissions: scopePermissions');
  assert(fromServer === 4, `as 4 chamadas de escopo devem usar scopePermissions do servidor, veio ${fromServer}`);
  assert(
    !/p_scope_permissions:\s*(f\.|params\.|p\.|body|rawBody)/.test(src),
    'p_scope_permissions nunca pode vir do corpo da requisição',
  );

  // O schema do corpo não declara nenhuma chave de escopo.
  const schemaRegion = src.slice(
    src.indexOf('const AudienceRole = z.enum'),
    src.indexOf('export interface MultiplixDraftRecipient'),
  );
  assert(schemaRegion.length > 0, 'região dos schemas do corpo não encontrada');
  assert(!/p_scope/.test(schemaRegion), 'o schema do corpo não pode declarar chave de escopo (p_scope*)');
});

registrar('(c) cache de ramos/UFs com header x-cache (F26)', () => {
  const src = stripComments(read(INDEX));

  assert(src.includes('export const AUDIENCE_CACHE_TTL_MS = 5 * 60_000'), 'TTL do cache deve ser 5 min');
  assert(src.includes('export async function fetchAudienceList('), 'fetchAudienceList deve existir');
  assert(src.includes('new Map()'), 'o cache por isolate é um Map');
  assert(/cacheStatus: 'HIT' \| 'MISS' \| null/.test(src), 'o status do cache é HIT|MISS|null');
  assert(src.includes("response.headers.set('x-cache', cacheStatus)"), 'o header x-cache é setado na resposta');
});

registrar('(d) rate limit responde 429 com Retry-After (F53)', () => {
  const src = stripComments(read(INDEX));

  assert(src.includes('enforceRateLimit('), 'a edge deve aplicar rate limit');
  assert(src.includes("errorResponse('Rate limit exceeded', 429, req)"), 'rate limit excedido deve responder 429');
  assert(src.includes("limited.headers.set('Retry-After', '60')"), '429 deve carregar Retry-After');
});

registrar('(e) assinatura HMAC do escopo em CABEÇALHO (F22)', () => {
  const src = stripComments(read(INDEX));

  assert(src.includes("Deno.env.get('MULTIPLIX_SCOPE_HMAC_SECRET')"), 'o secret do HMAC vem do ambiente');
  assert(src.includes('export async function signScope('), 'a edge assina o escopo (signScope)');
  assert(src.includes("{ name: 'HMAC', hash: 'SHA-256' }"), 'a assinatura é HMAC-SHA256');

  // A assinatura viaja em CABEÇALHO do cliente externo, nunca em parâmetro de rpc.
  assert(src.includes("'x-multiplix-scope-hmac': scopeHmac"), 'faltou o cabeçalho x-multiplix-scope-hmac');
  assert(src.includes("'x-multiplix-scope-exp': String(scopeExp)"), 'faltou o cabeçalho x-multiplix-scope-exp');
  assert(src.includes('const scopeHeaders = {'), 'os cabeçalhos de escopo são montados num objeto');
  assert(src.includes('global: {'), 'o cabeçalho de escopo é global do cliente externo');
  assert(src.includes('headers: scopeHeaders'), 'os cabeçalhos de escopo devem ir no cliente externo');
  assert(
    !/p_scope_hmac|p_scope_exp/.test(src),
    'a assinatura NÃO pode viajar como parâmetro (PostgREST devolveria 404 PGRST202)',
  );

  // Fail-closed: sem secret, a edge não segue.
  assert(
    /if \(!scopeSecret\)[\s\S]*?multiplix_scope_secret_ausente/.test(src),
    'sem MULTIPLIX_SCOPE_HMAC_SECRET a edge deve falhar (fail-closed)',
  );
});

registrar('(f) segredos e payload de cliente nunca vazam no log estruturado', () => {
  const src = stripComments(read(INDEX));

  // Só log ESTRUTURADO — nada de console.log.
  const methods = [...src.matchAll(/console\.(\w+)\s*\(/g)].map((m) => m[1]);
  for (const method of methods) {
    assert(method === 'warn' || method === 'error', `console.${method} não permitido (use warn/error estruturado)`);
  }
  const structured = [...src.matchAll(/console\.(?:warn|error)\(\s*JSON\.stringify\(\{/g)].length;
  assert(structured === methods.length, `todo log deve ser estruturado (${structured}/${methods.length})`);

  const blocks = logBlocks(src);
  assert(blocks.length >= 1, 'esperava ao menos um log estruturado');
  for (const block of blocks) {
    for (const name of SECRET_ENV_NAMES) {
      assert(!block.includes(name), `nome de segredo no log: ${name}`);
    }
    const bad = FORBIDDEN_IN_LOG.exec(block);
    assert(bad === null, `log carrega conteúdo/segredo proibido: "${bad?.[0]}"`);
  }

  // Os segredos continuam sendo LIDOS (removidos do log, não do código).
  assert(src.includes("requireEnv('SUPABASE_SERVICE_ROLE_KEY')"), 'deve ler SUPABASE_SERVICE_ROLE_KEY');
  assert(src.includes("requireEnv('EXTERNAL_SUPABASE_SERVICE_ROLE_KEY')"), 'deve ler EXTERNAL_SUPABASE_SERVICE_ROLE_KEY');
  assert(src.includes("Deno.env.get('MULTIPLIX_SCOPE_HMAC_SECRET')"), 'deve ler MULTIPLIX_SCOPE_HMAC_SECRET');

  // Nenhum VALOR de segredo literal no arquivo (JWT / token).
  assert(!/eyJ[A-Za-z0-9_-]{10,}/.test(src), 'nenhum JWT literal pode estar no arquivo');
  assert(!/Bearer\s/.test(src), 'nenhum token literal pode estar no arquivo');
});
