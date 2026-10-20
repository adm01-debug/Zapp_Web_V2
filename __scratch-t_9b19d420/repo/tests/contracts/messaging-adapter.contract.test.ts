/**
 * F54 (Bloco E) — CONTRATO do adaptador de envio (`_shared/messaging/evolution-go.ts`)
 * e da classificação de erro (`_shared/messaging/errors.ts`) como FRONTEIRA.
 *
 * O que este contrato trava (o "adaptador de mensageria" do plano F54), SEM rede —
 * o `fetch` é injetado (`SendDeps.fetch`) e devolve `Response` montada:
 *   (1) SUCESSO: HTTP 200 com `{data:{Info:{ID}}}` -> `ok=true` + `messageId`
 *       (o mesmo shape que o unit test F41 exercita em
 *       `_shared/__tests__/messaging-evolution-go.test.ts`);
 *   (2) TRANSITÓRIO: 429 e 5xx -> classe `transient` com retry planejado
 *       (30s/2min/10min) e dead letter na 4ª tentativa;
 *   (3) PERMANENTE: opt-out e número inexistente -> `permanent`, NUNCA reententa
 *       (mesmo quando o status HTTP parece transitório);
 *   (4) TIMEOUT: `AbortError` propaga (não vira sucesso) e os sinais textuais
 *       ('timeout'/'timed out'/'connreset') + status 408/425 -> `transient`.
 *
 * O contrato reafirma a REGRA de negócio de `errors.ts` (famílias de sinal,
 * teto de backoff, dead letter) — não copia o teste unitário de lá; aqui a
 * fronteira é o par (status, corpo) atravessando o adaptador real.
 *
 * Roda nos DOIS runners da CI, sem rede:
 *   - `deno test --config scripts/ci/deno.json --frozen --allow-read tests/contracts/<este>`
 *   - `bun run test:contracts` (vitest, que varre tests/contracts/**\/*.test.ts)
 * Por isso o harness dual abaixo: `Deno.test` quando o runtime é Deno, `it()` do
 * vitest sob Node. NÃO há lógica duplicada — só o REGISTRO do caso muda.
 */
import { send } from '../../supabase/functions/_shared/messaging/evolution-go.ts';
import type { SendDeps, SendItem } from '../../supabase/functions/_shared/messaging/evolution-go.ts';
import {
  BACKOFF_CEILING_MS,
  MAX_ATTEMPTS,
  classifyProviderError,
  planRetry,
  providerErrorInfo,
} from '../../supabase/functions/_shared/messaging/errors.ts';

const IS_DENO = typeof Deno !== 'undefined' && typeof (Deno as { test?: unknown }).test === 'function';

type CaseFn = () => void | Promise<void>;
let registrar: (name: string, fn: CaseFn) => void;
if (IS_DENO) {
  registrar = (name, fn) => { Deno.test(name, fn); };
} else {
  // Specifier não-literal: o Deno não tenta resolver 'vitest' no `deno check`
  // (que roda com --frozen e sem essa dependência); sob Node o vitest resolve.
  const spec = 'vit' + 'est';
  const mod = (await import(spec)) as { it: (name: string, fn: CaseFn) => void };
  registrar = (name, fn) => { mod.it(name, fn); };
}

function assert(cond: unknown, msg: string): void {
  if (!cond) throw new Error(`[contrato F54] ${msg}`);
}

// ── stub de rede: nenhuma chamada real, tudo pelo fetcher injetado ──────────

type Fetcher = (url: string, options: RequestInit) => Promise<Response>;

interface FetchCall {
  url: string;
  method: string;
  body: unknown;
  signal: unknown;
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

/** Fetcher gravador: devolve as respostas enfileiradas (a última se repetir). */
function recordingFetcher(responses: Response[]): { calls: FetchCall[]; fetcher: Fetcher } {
  const calls: FetchCall[] = [];
  let i = 0;
  const fetcher: Fetcher = (url, options) => {
    calls.push({
      url,
      method: options.method ?? 'GET',
      body: typeof options.body === 'string' ? JSON.parse(options.body) : undefined,
      signal: options.signal,
    });
    const resp = responses[Math.min(i, responses.length - 1)] ?? jsonResponse(null, 500);
    i += 1;
    return Promise.resolve(resp);
  };
  return { calls, fetcher };
}

function depsFor(fetcher: Fetcher, signal?: AbortSignal): SendDeps {
  return {
    fetch: fetcher,
    evolutionUrl: 'https://go.exemplo.com',
    evolutionKey: 'admin-key',
    instanceToken: 'token-instancia',
    ...(signal ? { signal } : {}),
  };
}

async function assertRejects(fn: () => Promise<unknown>, msg: string): Promise<Error> {
  let threw: unknown;
  try {
    await fn();
  } catch (e) {
    threw = e;
  }
  if (!(threw instanceof Error)) throw new Error(`[contrato F54] ${msg}`);
  return threw;
}

const textItem: SendItem = { kind: 'text', to: '5511999999999', instanceId: 'inst-a', text: 'Olá {{nome}}' };

// ── (1) sucesso ─────────────────────────────────────────────────────────────

registrar('(1) sucesso: HTTP 200 com data.Info.ID devolve ok=true e messageId', async () => {
  const { calls, fetcher } = recordingFetcher([jsonResponse({ data: { Info: { ID: 'GO-MSG-1' } } })]);

  const result = await send(textItem, depsFor(fetcher));

  assert(result.ok === true, `esperava ok=true, veio ${result.ok} (${result.error})`);
  assert(result.status === 200, `esperava status 200, veio ${result.status}`);
  assert(result.messageId === 'GO-MSG-1', `esperava messageId, veio ${result.messageId}`);
  assert(result.goPath === '/send/text', `esperava /send/text, veio ${result.goPath}`);
  assert(calls.length === 2, `esperava 1 presença + 1 envio, veio ${calls.length}`);
  assert(
    calls.every((c) => c.url.startsWith('https://go.exemplo.com')),
    'todo I/O deve ir ao endpoint injetado (sem rede real)',
  );
});

// ── (2) transitório ─────────────────────────────────────────────────────────

registrar('(2) transitório: 429 e 5xx -> transient com retry 30s/2min/10min e dead letter na 4ª', async () => {
  // 429 atravessa o adaptador como falha e classifica como transient.
  const p429 = recordingFetcher([jsonResponse({ error: 'Too Many Requests' }, 429)]);
  const r429 = await send(textItem, depsFor(p429.fetcher));
  assert(r429.ok === false && r429.status === 429, `adaptador deve reportar 429 como falha (${r429.status})`);
  assert(classifyProviderError(r429.status, r429.body) === 'transient', '429 deve ser transient');
  const info429 = providerErrorInfo(429, { message: 'Too Many Requests' });
  assert(info429.code === 'rate_limited', `429 code esperado rate_limited, veio ${info429.code}`);

  // 5xx atravessa o adaptador e classifica como transient.
  for (const status of [500, 502, 503, 504]) {
    const info = providerErrorInfo(status, { message: 'Internal Server Error' });
    assert(info.class === 'transient', `${status} deve ser transient, veio ${info.class}`);
    assert(info.code === 'provider_unavailable', `${status} code ${info.code}`);
  }
  const p503 = recordingFetcher([jsonResponse({ error: 'unavailable' }, 503)]);
  const r503 = await send(textItem, depsFor(p503.fetcher));
  assert(r503.ok === false && r503.status === 503, 'adaptador deve reportar 5xx como falha');
  assert(classifyProviderError(r503.status, r503.body) === 'transient', '503 deve ser transient');

  // Backoff com teto: 30s / 2min / 10min; 4ª tentativa aposenta o item.
  assert(
    JSON.stringify([...BACKOFF_CEILING_MS]) === JSON.stringify([30_000, 120_000, 600_000]),
    `teto esperado 30s/2min/10min, veio ${JSON.stringify(BACKOFF_CEILING_MS)}`,
  );
  assert(MAX_ATTEMPTS === 4, `max attempts esperado 4, veio ${MAX_ATTEMPTS}`);
  const d1 = planRetry(info429, 1, 0);
  const d2 = planRetry(info429, 2, 0);
  const d3 = planRetry(info429, 3, 0);
  const d4 = planRetry(info429, 4, 0);
  assert([d1.action, d2.action, d3.action].join(',') === 'retry,retry,retry', 'tentativas 1-3 devem reentrar');
  assert(
    [d1.delayMs, d2.delayMs, d3.delayMs].join(',') === '30000,120000,600000',
    `delays esperados 30s/2min/10min, veio ${[d1.delayMs, d2.delayMs, d3.delayMs].join(',')}`,
  );
  assert(d4.action === 'dead_letter' && d4.delayMs === 0 && d4.retryAfter === undefined, '4ª tentativa vai a dead letter');
  assert(planRetry(info429, 99, 0).action === 'dead_letter', 'após a 4ª continua morto (não reinicia o ciclo)');
});

// ── (3) permanente ──────────────────────────────────────────────────────────

registrar('(3) permanente: opt-out e número inexistente nunca reententam', () => {
  const optOutBodies: unknown[] = [
    { message: 'recipient blocked you' },
    { error: 'User has opted out' },
    'Contato pediu descadastro (opt-out)',
    { message: 'blocklist' },
  ];
  for (const body of optOutBodies) {
    const info = providerErrorInfo(400, body);
    assert(info.class === 'permanent', `esperava permanent para ${JSON.stringify(body)}, veio ${info.class}`);
    assert(info.code === 'opt_out', `code esperado opt_out, veio ${info.code}`);
    const d = planRetry(info, 1, 0);
    assert(d.action === 'dead_letter' && d.delayMs === 0 && d.retryAfter === undefined, 'opt-out vai direto a dead letter');
  }

  const inexistente = providerErrorInfo(400, { message: 'Number is not registered on WhatsApp' });
  assert(
    inexistente.class === 'permanent' && inexistente.code === 'number_not_exists',
    `número inexistente esperado permanent/number_not_exists, veio ${inexistente.class}/${inexistente.code}`,
  );
  assert(planRetry(inexistente, 1, 0).action === 'dead_letter', 'número inexistente nunca reententa');
  assert(classifyProviderError(200, { exists: false }) === 'permanent', '{exists:false} deve ser permanent');
  assert(
    providerErrorInfo(200, { data: { Users: [{ IsInWhatsapp: false }] } }).class === 'permanent',
    'shape cru do GO (Users[].IsInWhatsapp=false) deve ser permanent',
  );

  // O sinal permanente VENCE o status: 5xx com opt-out/número inexistente não reententa.
  assert(providerErrorInfo(500, { message: 'recipient blocked you' }).class === 'permanent', '5xx com opt-out continua permanent');
  assert(classifyProviderError(500, { message: 'no such user' }) === 'permanent', '5xx com número inexistente continua permanent');

  for (const attempt of [1, 5, 99]) {
    assert(planRetry(inexistente, attempt, 0).action === 'dead_letter', `permanent não pode reentrar (tentativa ${attempt})`);
  }
});

// ── (4) timeout ─────────────────────────────────────────────────────────────

registrar('(4) timeout: AbortError propaga; sinais textuais e 408/425 são transient', async () => {
  const timeoutSignals: Array<[number, unknown]> = [
    [0, { message: 'request timeout' }],
    [0, { message: 'Request timed out' }],
    [0, 'ECONNRESET'],
    [0, { message: 'connection reset by peer' }],
    [0, { message: 'socket hang up' }],
    [0, { message: 'deadline exceeded' }],
  ];
  for (const [status, body] of timeoutSignals) {
    const info = providerErrorInfo(status, body);
    assert(info.class === 'transient', `timeout ${JSON.stringify(body)} deve ser transient, veio ${info.class}`);
    assert(info.code === 'provider_timeout', `timeout ${JSON.stringify(body)} code esperado provider_timeout, veio ${info.code}`);
  }

  for (const status of [408, 425]) {
    const info = providerErrorInfo(status, {});
    assert(
      info.class === 'transient' && info.code === 'provider_timeout',
      `${status} deve ser transient/provider_timeout, veio ${info.class}/${info.code}`,
    );
  }
  assert(planRetry(providerErrorInfo(0, { message: 'timeout' }), 1, 0).action === 'retry', 'timeout deve reentrar');

  // O AbortSignal injetado chega ao fetch de ENVIO (não só à presença)...
  const controller = new AbortController();
  const { calls, fetcher } = recordingFetcher([jsonResponse({ data: { Info: { ID: 'GO-MSG-1' } } })]);
  await send(textItem, depsFor(fetcher, controller.signal));
  const envio = calls[calls.length - 1];
  assert(envio.signal === controller.signal, 'o AbortSignal injetado deve ser repassado ao fetch de envio');

  // ...e a rejeição do fetch (AbortError) NÃO é engolida em ok=true.
  const abortErr = new Error('The operation was aborted');
  abortErr.name = 'AbortError';
  const abortFetcher: Fetcher = () => Promise.reject(abortErr);
  const err = await assertRejects(
    () => send(textItem, depsFor(abortFetcher)),
    'AbortError deve propagar, nunca virar ok=true',
  );
  assert(err.name === 'AbortError', `esperava AbortError, veio ${err.name}`);
});
