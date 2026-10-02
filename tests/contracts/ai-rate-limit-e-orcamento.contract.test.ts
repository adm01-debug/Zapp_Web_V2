/**
 * Contrato de RATE LIMIT COMPARTILHADO (IA-043) e ORÇAMENTO RESERVADO (IA-044)
 * — Bloco 05 / PR-2. Território: ESTE único arquivo.
 *
 * Desenho congelado (conta Bloco 05 / PR-2):
 *
 *   IA-043 — `_shared/ai-guards.ts` exporta
 *     `sharedRateLimit({ key, limit, windowSeconds, now? }): Promise<{ allowed, hits, limit }>`
 *     que monta a chave final como `<escopo>:<janela ISO>` e chama a RPC atômica
 *     `ai_rate_limit_hit(p_key, p_window_start)`. A decisão é `allowed = hits <= limit`
 *     — o limite EXATO é permitido (inclusivo). Erro de infraestrutura NÃO derruba a IA:
 *     `checkSharedAiRateLimits` (e portanto `enforceAiGuards`) falha ABERTO, deixando o
 *     motivo distinguível em `source: "local"`; estouro do contador compartilhado vira
 *     HTTP 429.
 *
 *   IA-044 — `_shared/ai-budget.ts` exporta
 *     `reserveBudget` / `settleBudget` / `releaseBudget` / `reconcileBudget`.
 *     `reserveBudget` devolve `{ id, allowed, usedTokens, limitTokens }` por meio de
 *     `ai_budget_reserve` (idempotente por `idempotencyKey`); o valor ESTIMADO nunca é
 *     faturamento — só o `actualTokens` de `settleBudget` (via `ai_budget_settle`) é uso
 *     real. `limitTokens <= 0` ou `estimatedTokens <= 0` desliga a reserva SEM chamar a
 *     RPC (`{ id: null, allowed: true, reason: "invalid_budget" }`). Erro de
 *     infraestrutura também falha aberto, com motivo distinguível (`missing_env` /
 *     `infrastructure_error`) — nunca confundível com reserva real (id presente) nem com
 *     negação da RPC (`allowed: false`).
 *
 * Como o comportamento é exercitado de verdade (SEM rede, SEM banco):
 *   - o client Supabase (`https://esm.sh/@supabase/supabase-js@2.87.1`) é dublado por um
 *     `rpc`/`from` FALSOS que registram as chamadas (`H.calls`) e devolvem o corpo que cada
 *     caso precisa;
 *   - `Deno.env.get` é dublado, então os segredos nunca tocam o ambiente real.
 *
 * PROVA POR MUTAÇÃO (não enfraquecida para passar):
 *   (a) `hits <= limit` → `hits < limit`  ⇒ o caso do limite EXATO falha;
 *   (b) catch da falha de infraestrutura relançando ⇒ o caso de falha ABERTA falha;
 *   (c) orçamento degenerado (`limitTokens <= 0`) tratado como bloqueio ⇒ o caso falha.
 */

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const CAMINHO_GUARDS = '../../supabase/functions/_shared/ai-guards.ts';
const CAMINHO_BUDGET = '../../supabase/functions/_shared/ai-budget.ts';
const CAMINHO_DESPACHO = '../../supabase/functions/_shared/ai-generate.ts';

const ROOT = resolve(__dirname, '../..');
const ARQ_GUARDS = resolve(ROOT, 'supabase/functions/_shared/ai-guards.ts');
const ARQ_BUDGET = resolve(ROOT, 'supabase/functions/_shared/ai-budget.ts');

interface RpcCall {
  fn: string;
  args: Record<string, unknown>;
}
interface RpcError {
  message?: string;
}
interface RpcResult {
  data: unknown;
  error: RpcError | null;
}

/** Estado compartilhado entre o teste e a fábrica de mock (hoisted). */
const H = vi.hoisted(() => ({
  /** Toda chamada RPC observada, na ordem. */
  calls: [] as Array<{ fn: string; args: Record<string, unknown> }>,
  /** Resposta por chamada (o caso decide). */
  rpcImpl: (_fn: string, _args: Record<string, unknown>) =>
    ({ data: null, error: null }) as { data: unknown; error: { message?: string } | null },
  /** Resultado do `count()` da quota diária (`ai_usage_logs`). */
  quota: { count: 0, error: null as { message?: string } | null },
  /** Linhas que `from('ai_providers').select('*')` devolve no despacho central. */
  providers: [] as Array<Record<string, unknown>>,
}));

// Fronteira de banco: o client Supabase inteiro vira dublê. Nenhum socket é aberto.
// `from(table)` responde o que cada caminho pede: `ai_providers` (despacho central,
// `select('*')` aguardado direto) e a cadeia tolerante de `ai_usage_logs`/`profiles`
// (quota diária / log de uso), sem quebrar os casos já existentes do guard.
vi.mock('https://esm.sh/@supabase/supabase-js@2.87.1', () => ({
  createClient: () => ({
    rpc: (fn: string, args: Record<string, unknown>) => {
      H.calls.push({ fn, args });
      try {
        return Promise.resolve(H.rpcImpl(fn, args));
      } catch (err) {
        return Promise.reject(err);
      }
    },
    from: (table: string) => {
      if (table === 'ai_providers') {
        return { select: async () => ({ data: H.providers, error: null }) };
      }
      // Cadeia tolerante e aguardável: `select/eq/limit` se encadeiam até `gte`,
      // `maybeSingle` ou ao próprio `await` (usado por quota e log de uso).
      const chain: Record<string, unknown> = {
        select: () => chain,
        eq: () => chain,
        limit: () => chain,
        gte: async () => H.quota,
        maybeSingle: async () => ({ data: null, error: null }),
        insert: async () => ({ data: null, error: null }),
        then: (resolve: (value: unknown) => unknown) => resolve({ data: null, error: null }),
      };
      return chain;
    },
  }),
}));

/** `Deno.env.get` fictício; `comEnv = false` simula ambiente sem segredos. */
function stubDeno(comEnv = true): void {
  vi.stubGlobal('Deno', {
    env: {
      get: (key: string): string | undefined =>
        comEnv
          ? ({
              SUPABASE_URL: 'https://projeto.teste.supabase.co',
              SUPABASE_SERVICE_ROLE_KEY: 'service-role-ficticia',
              FAKE_PROVIDER_KEY: 'segredo-de-provedor-ficticio',
            }[key])
          : undefined,
    },
  });
}

interface GuardsModule {
  sharedRateLimit: (opts: {
    key: string;
    limit: number;
    windowSeconds: number;
    now?: Date;
  }) => Promise<{ allowed: boolean; hits: number; limit: number }>;
  checkSharedAiRateLimits: (opts: {
    targets: Array<{ key: string; limit: number }>;
    windowSeconds?: number;
    now?: Date;
  }) => Promise<{ allowed: boolean; source: 'shared' | 'local'; hits: number; limit: number }>;
  enforceAiGuards: (opts: Record<string, unknown>) => Promise<Response | null>;
}

interface BudgetModule {
  reserveBudget: (p: Record<string, unknown>) => Promise<{
    id: string | null;
    allowed: boolean;
    usedTokens: number;
    limitTokens: number;
    reason?: string;
    detail?: string | null;
  }>;
  settleBudget: (id: string, actualTokens: number) => Promise<void>;
  releaseBudget: (id: string, reason?: string) => Promise<void>;
  reconcileBudget: () => Promise<number>;
}

interface GenerateModule {
  generateWithRouting: (params: Record<string, unknown>) => Promise<{
    ok: boolean;
    response: Response;
    data: Record<string, unknown> | null;
    providerId: string | null;
    providerName: string | null;
    model: string | null;
    status: string;
    errorCode?: string | null;
  }>;
  estimateAiTokens: (messages: unknown, maxTokens: number | null | undefined) => number;
  deriveAiIdempotencyKey: (
    functionName: string,
    userId: string | null,
    model: string,
    messages: unknown,
    maxTokens: unknown,
  ) => string;
  AI_BUDGET_ERROR_CODE: string;
  DEFAULT_AI_BUDGET_TOKENS: number;
}

async function carregarGuards(): Promise<GuardsModule> {
  return (await import(CAMINHO_GUARDS)) as unknown as GuardsModule;
}
async function carregarBudget(): Promise<BudgetModule> {
  return (await import(CAMINHO_BUDGET)) as unknown as BudgetModule;
}
async function carregarDespacho(): Promise<GenerateModule> {
  return (await import(CAMINHO_DESPACHO)) as unknown as GenerateModule;
}

const REQ = new Request('https://projeto.teste.supabase.co/functions/v1/ai-contrato', {
  method: 'POST',
  headers: { origin: 'http://localhost:5173' },
});

beforeEach(() => {
  vi.resetModules();
  H.calls = [];
  H.rpcImpl = () => ({ data: null, error: null });
  H.quota = { count: 0, error: null };
  H.providers = [];
  stubDeno(true);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

/* ---------------------------------------------------------------------------------------- */
/* (1) sharedRateLimit — a decisão é `hits <= limit`, chave carrega a janela (IA-043)          */
/* ---------------------------------------------------------------------------------------- */

describe('(1) sharedRateLimit: contador atômico com decisão inclusiva (IA-043)', () => {
  it('dentro do limite → allowed', async () => {
    H.rpcImpl = () => ({ data: 1, error: null });
    const { sharedRateLimit } = await carregarGuards();

    const r = await sharedRateLimit({
      key: 'ai:user:ai-contrato:u-1',
      limit: 5,
      windowSeconds: 60,
      now: new Date('2026-10-01T23:13:10.000Z'),
    });

    expect(r).toEqual({ allowed: true, hits: 1, limit: 5 });

    // O caminho é a RPC atômica (nada de memória local como fonte de verdade).
    expect(H.calls).toHaveLength(1);
    expect(H.calls[0].fn).toBe('ai_rate_limit_hit');
    expect(H.calls[0].args).toMatchObject({ p_window_start: '2026-10-01T23:13:00.000Z' });
  });

  it('no limite EXATO → allowed (limite é inclusivo)', async () => {
    H.rpcImpl = () => ({ data: 5, error: null });
    const { sharedRateLimit } = await carregarGuards();

    const r = await sharedRateLimit({
      key: 'ai:user:ai-contrato:u-1',
      limit: 5,
      windowSeconds: 60,
    });

    expect(r.hits, 'o caso exercita exatamente hits == limit').toBe(5);
    expect(r.allowed, 'hits == limit DEVE ser permitido (<=)').toBe(true);
  });

  it('acima do limite → bloqueado', async () => {
    H.rpcImpl = () => ({ data: 6, error: null });
    const { sharedRateLimit } = await carregarGuards();

    const r = await sharedRateLimit({
      key: 'ai:user:ai-contrato:u-1',
      limit: 5,
      windowSeconds: 60,
    });

    expect(r.allowed).toBe(false);
    expect(r.hits).toBe(6);
  });

  it('a chave embute a JANELA: mesma janela → mesma chave; janela seguinte → chave diferente', async () => {
    H.rpcImpl = () => ({ data: 1, error: null });
    const { sharedRateLimit } = await carregarGuards();

    const base = { key: 'ai:user:ai-contrato:u-1', limit: 5, windowSeconds: 60 } as const;
    await sharedRateLimit({ ...base, now: new Date('2026-10-01T23:13:05.000Z') });
    await sharedRateLimit({ ...base, now: new Date('2026-10-01T23:13:59.999Z') });
    await sharedRateLimit({ ...base, now: new Date('2026-10-01T23:14:00.000Z') });

    const chaves = H.calls.map((c) => String(c.args.p_key));
    // Duas primeiras compartilham a janela 23:13; a terceira cai na 23:14.
    expect(chaves[0]).toBe(chaves[1]);
    expect(chaves[2]).not.toBe(chaves[0]);

    // Formato congelado: `<escopo>:<janela ISO>`.
    expect(chaves[0]).toMatch(/^ai:user:ai-contrato:u-1:\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/);
    expect(chaves[0]).toBe('ai:user:ai-contrato:u-1:2026-10-01T23:13:00.000Z');
    expect(chaves[2]).toBe('ai:user:ai-contrato:u-1:2026-10-01T23:14:00.000Z');
  });
});

/* ---------------------------------------------------------------------------------------- */
/* (2) Falha ABERTA — infraestrutura fora NÃO derruba a IA (IA-043)                            */
/* ---------------------------------------------------------------------------------------- */

describe('(2) falha aberta do contador compartilhado (IA-043)', () => {
  it('erro de RPC → decisão aberta, com source "local" (nunca a fonte de verdade)', async () => {
    H.rpcImpl = () => ({ data: null, error: { message: 'conexao recusada' } });
    const { checkSharedAiRateLimits } = await carregarGuards();

    const decisao = await checkSharedAiRateLimits({
      targets: [{ key: 'ai:user:ai-contrato:u-1', limit: 5 }],
    });

    expect(decisao.allowed, 'infra fora deve FALHAR ABERTO').toBe(true);
    expect(decisao.source).toBe('local');
    expect(H.calls[0].fn).toBe('ai_rate_limit_hit');
  });

  it('guard de IA com RPC indisponível → segue (null), NÃO 429', async () => {
    H.rpcImpl = () => ({ data: null, error: { message: 'timeout' } });
    const { enforceAiGuards } = await carregarGuards();

    const res = await enforceAiGuards({
      functionName: 'ai-contrato',
      userId: 'u-1',
      perUserPerMinute: 100,
      sharedPerMinute: 30,
      req: REQ,
    });

    expect(res, 'falha de infraestrutura não pode virar bloqueio').toBeNull();
    expect(H.calls.some((c) => c.fn === 'ai_rate_limit_hit'), 'o caminho compartilhado foi consultado').toBe(
      true,
    );
  });
});

/* ---------------------------------------------------------------------------------------- */
/* (3) enforceAiGuards — o contador compartilhado é AUTORITATIVO: estouro → 429 (IA-043)       */
/* ---------------------------------------------------------------------------------------- */

describe('(3) enforceAiGuards: estouro do contador compartilhado → HTTP 429 (IA-043)', () => {
  it('hits acima do limite compartilhado → 429, decidido pelo caminho atômico', async () => {
    H.rpcImpl = () => ({ data: 31, error: null });
    const { enforceAiGuards } = await carregarGuards();

    const res = await enforceAiGuards({
      functionName: 'ai-contrato',
      userId: 'u-1',
      perUserPerMinute: 100, // pré-filtro local folgado: quem barra é o compartilhado
      sharedPerMinute: 30,
      req: REQ,
    });

    expect(res, 'estouro compartilhado deveria bloquear').not.toBeNull();
    expect(res?.status).toBe(429);
    expect(
      H.calls.some((c) => c.fn === 'ai_rate_limit_hit'),
      'o bloqueio tem de vir do contador compartilhado, não do pré-filtro local',
    ).toBe(true);
  });

  it('dentro do limite compartilhado → segue (null)', async () => {
    H.rpcImpl = () => ({ data: 3, error: null });
    const { enforceAiGuards } = await carregarGuards();

    const res = await enforceAiGuards({
      functionName: 'ai-contrato',
      userId: 'u-2',
      perUserPerMinute: 100,
      sharedPerMinute: 30,
      req: REQ,
    });

    expect(res).toBeNull();
  });
});

/* ---------------------------------------------------------------------------------------- */
/* (4) reserveBudget — reserva atômica, idempotente e falha aberta (IA-044)                    */
/* ---------------------------------------------------------------------------------------- */

describe('(4) reserveBudget: reserva permitida, negada e idempotente (IA-044)', () => {
  it('reserva PERMITIDA quando cabe no limite (id presente)', async () => {
    H.rpcImpl = (fn) =>
      fn === 'ai_budget_reserve'
        ? { data: [{ id: 'res-1', allowed: true, used_tokens: 100, limit_tokens: 1000 }], error: null }
        : { data: null, error: null };
    const { reserveBudget } = await carregarBudget();

    const r = await reserveBudget({
      idempotencyKey: 'op-1',
      functionName: 'ai-contrato',
      estimatedTokens: 200,
      limitTokens: 1000,
    });

    expect(r.allowed).toBe(true);
    expect(r.id).toBe('res-1');
    expect(r.usedTokens).toBe(100);
    expect(r.limitTokens).toBe(1000);
    expect(r.reason).toBe('reserved');

    const reserva = H.calls.find((c) => c.fn === 'ai_budget_reserve');
    expect(reserva?.args).toMatchObject({
      p_idempotency_key: 'op-1',
      p_function_name: 'ai-contrato',
      p_estimated_tokens: 200,
      p_limit_tokens: 1000,
    });
    // Reservar NÃO liquida: nenhum settle/release disparado por `reserveBudget`.
    expect(H.calls.every((c) => c.fn === 'ai_budget_reserve')).toBe(true);
  });

  it('reserva NEGADA quando estoura o limite (falha fechada, sem id)', async () => {
    H.rpcImpl = () => ({
      data: [{ allowed: false, used_tokens: 950, limit_tokens: 1000 }],
      error: null,
    });
    const { reserveBudget } = await carregarBudget();

    const r = await reserveBudget({
      idempotencyKey: 'op-2',
      functionName: 'ai-contrato',
      estimatedTokens: 200,
      limitTokens: 1000,
    });

    expect(r.allowed, 'estouro deve NEGAR (não é falha aberta)').toBe(false);
    expect(r.id).toBeNull();
    expect(r.reason).toBe('denied');
  });

  it('idempotência: a MESMA `idempotencyKey` é reenviada e devolve a MESMA reserva', async () => {
    const reservas = new Map<string, string>();
    let n = 0;
    H.rpcImpl = (fn, args) => {
      if (fn !== 'ai_budget_reserve') return { data: null, error: null };
      const chave = String(args.p_idempotency_key);
      if (!reservas.has(chave)) reservas.set(chave, `res-${++n}`);
      return {
        data: [{ id: reservas.get(chave), allowed: true, used_tokens: 0, limit_tokens: 1000 }],
        error: null,
      };
    };
    const { reserveBudget } = await carregarBudget();

    const params = {
      idempotencyKey: 'op-idem',
      functionName: 'ai-contrato',
      estimatedTokens: 10,
      limitTokens: 1000,
    };
    const a = await reserveBudget(params);
    const b = await reserveBudget(params);

    expect(a.id).toBe('res-1');
    expect(b.id, 'repetir a chave precisa devolver a MESMA reserva').toBe(a.id);

    const chavesEnviadas = H.calls
      .filter((c) => c.fn === 'ai_budget_reserve')
      .map((c) => c.args.p_idempotency_key);
    expect(chavesEnviadas, 'a chave de idempotência tem de ser estável entre as chamadas').toEqual([
      'op-idem',
      'op-idem',
    ]);
  });
});

/* ---------------------------------------------------------------------------------------- */
/* (5) settle / release / reconcile — só o uso REAL fatura (IA-044)                            */
/* ---------------------------------------------------------------------------------------- */

describe('(5) liquidação, liberação e reconciliação (IA-044)', () => {
  it('settle grava o valor REAL (`actualTokens`) — a estimativa NUNCA é faturamento', async () => {
    H.rpcImpl = (fn) =>
      fn === 'ai_budget_reserve'
        ? { data: [{ id: 'res-9', allowed: true, used_tokens: 0, limit_tokens: 1000 }], error: null }
        : { data: null, error: null };
    const { reserveBudget, settleBudget } = await carregarBudget();

    // A reserva usa ESTIMATIVA de 200 tokens...
    await reserveBudget({
      idempotencyKey: 'op-9',
      functionName: 'ai-contrato',
      estimatedTokens: 200,
      limitTokens: 1000,
    });
    // ...mas o uso medido foi 321: só ELE é faturado.
    await settleBudget('res-9', 321);

    const settle = H.calls.find((c) => c.fn === 'ai_budget_settle');
    expect(settle?.args).toEqual({ p_id: 'res-9', p_actual_tokens: 321 });
    expect(
      H.calls.some((c) => c.fn === 'ai_budget_settle' && c.args.p_actual_tokens === 200),
      'a estimativa foi faturada por engano',
    ).toBe(false);
    // A estimativa continua registrada apenas na RESERVA.
    expect(H.calls.find((c) => c.fn === 'ai_budget_reserve')?.args.p_estimated_tokens).toBe(200);
  });

  it('release libera a reserva de uma execução que não gastou', async () => {
    H.rpcImpl = () => ({ data: null, error: null });
    const { releaseBudget } = await carregarBudget();

    await releaseBudget('res-9', 'cancelada');

    expect(H.calls).toContainEqual({
      fn: 'ai_budget_release',
      args: { p_id: 'res-9', p_reason: 'cancelada' },
    });
  });

  it('reconcile devolve a contagem de reservas reconciliadas', async () => {
    H.rpcImpl = (fn) => (fn === 'ai_budget_reconcile' ? { data: 7, error: null } : { data: null, error: null });
    const { reconcileBudget } = await carregarBudget();

    expect(await reconcileBudget()).toBe(7);
    expect(H.calls[0].fn).toBe('ai_budget_reconcile');
  });
});

/* ---------------------------------------------------------------------------------------- */
/* (6) Orçamento DEGENERADO — não há o que reservar; a IA segue (IA-044)                       */
/* ---------------------------------------------------------------------------------------- */

describe('(6) orçamento degenerado desliga a reserva SEM chamar a RPC (IA-044)', () => {
  it('`limitTokens <= 0` → allowed, id nulo e NENHUMA chamada à RPC', async () => {
    H.rpcImpl = () => {
      throw new Error('a RPC não deveria ser chamada com orçamento degenerado');
    };
    const { reserveBudget } = await carregarBudget();

    const r = await reserveBudget({
      idempotencyKey: 'op-3',
      functionName: 'ai-contrato',
      estimatedTokens: 100,
      limitTokens: 0,
    });

    expect(r.allowed, 'orçamento degenerado NÃO pode bloquear a IA').toBe(true);
    expect(r.id).toBeNull();
    expect(r.reason).toBe('invalid_budget');
    expect(H.calls, 'nada de round-trip ao banco para um orçamento inválido').toHaveLength(0);
  });

  it('`estimatedTokens <= 0` → mesma falha aberta, sem RPC', async () => {
    H.rpcImpl = () => {
      throw new Error('a RPC não deveria ser chamada com orçamento degenerado');
    };
    const { reserveBudget } = await carregarBudget();

    const r = await reserveBudget({
      idempotencyKey: 'op-4',
      functionName: 'ai-contrato',
      estimatedTokens: 0,
      limitTokens: 1000,
    });

    expect(r.allowed).toBe(true);
    expect(r.id).toBeNull();
    expect(r.reason).toBe('invalid_budget');
    expect(H.calls).toHaveLength(0);
  });
});

/* ---------------------------------------------------------------------------------------- */
/* (7) Falha ABERTA do orçamento — motivo distinguível (IA-044)                                */
/* ---------------------------------------------------------------------------------------- */

describe('(7) falha aberta do orçamento, com motivo distinguível (IA-044)', () => {
  it('erro de infraestrutura → allowed, id nulo e reason "infrastructure_error"', async () => {
    H.rpcImpl = () => ({ data: null, error: { message: 'db down' } });
    const { reserveBudget } = await carregarBudget();

    const r = await reserveBudget({
      idempotencyKey: 'op-5',
      functionName: 'ai-contrato',
      estimatedTokens: 100,
      limitTokens: 1000,
    });

    expect(r.allowed, 'infra fora deve FALHAR ABERTO').toBe(true);
    expect(r.id).toBeNull();
    expect(r.reason).toBe('infrastructure_error');
    // Distinguível de uma reserva real (`reserved`, com id) e de uma negação (`denied`).
    expect(r.reason).not.toBe('reserved');
    expect(r.reason).not.toBe('denied');
  });

  it('DECISÃO 0548-A — a RPC EXECUTOU e devolveu 0 linhas (`data: []`) → NEGADO (fechado)', async () => {
    H.rpcImpl = () => ({ data: [], error: null });
    const { reserveBudget } = await carregarBudget();

    const r = await reserveBudget({
      idempotencyKey: 'op-6',
      functionName: 'ai-contrato',
      estimatedTokens: 100,
      limitTokens: 1000,
    });

    // Decisão 0548 (Joaquim): LISTA VAZIA é o mesmo veredito de negação sem corpo. Ler
    // "sem veredito" como autorização liberaria consumo por engano → FECHADO (negado).
    expect(r.allowed, '0 linhas é NEGAÇÃO: não pode autorizar consumo').toBe(false);
    expect(r.id).toBeNull();
    expect(r.reason).toBe('denied');
    expect(r.usedTokens).toBe(0);
    expect(r.limitTokens).toBe(1000);
  });

  it('DECISÃO 0548-B — resposta INUTILIZÁVEL (`data: null`) e erro de infra → ABERTO', async () => {
    const { reserveBudget } = await carregarBudget();
    const params = {
      idempotencyKey: 'op-6b',
      functionName: 'ai-contrato',
      estimatedTokens: 100,
      limitTokens: 1000,
    };

    // (b1) erro da RPC (infra): ABERTO — infraestrutura fora nunca derruba a IA.
    H.rpcImpl = () => ({ data: null, error: { message: 'boom' } });
    const comErro = await reserveBudget(params);
    expect(comErro.allowed, 'erro de infra não pode bloquear a IA').toBe(true);
    expect(comErro.id).toBeNull();
    expect(comErro.reason).toBe('infrastructure_error');

    // (b2) resposta inutilizável (corpo inesperado): também ABERTO, com warn.
    H.rpcImpl = () => ({ data: null, error: null });
    const inutil = await reserveBudget(params);
    expect(inutil.allowed, 'corpo inutilizável é infraestrutura, não veredito').toBe(true);
    expect(inutil.id).toBeNull();
    expect(inutil.reason).toBe('infrastructure_error');
  });

  it('ambiente sem segredos → falha aberta com reason "missing_env", sem tocar o banco', async () => {
    stubDeno(false);
    const { reserveBudget } = await carregarBudget();

    const r = await reserveBudget({
      idempotencyKey: 'op-7',
      functionName: 'ai-contrato',
      estimatedTokens: 100,
      limitTokens: 1000,
    });

    expect(r.allowed).toBe(true);
    expect(r.id).toBeNull();
    expect(r.reason).toBe('missing_env');
    expect(H.calls).toHaveLength(0);
  });
});

/* ---------------------------------------------------------------------------------------- */
/* (8) O vocabulário congelado está no fonte (o que o runtime não prova)                       */
/* ---------------------------------------------------------------------------------------- */

describe('(8) vocabulário congelado das RPCs', () => {
  it('ai-guards.ts usa a RPC `ai_rate_limit_hit` com p_key/p_window_start', () => {
    const fonte = readFileSync(ARQ_GUARDS, 'utf8').replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '');
    expect(fonte).toMatch(/ai_rate_limit_hit/);
    expect(fonte).toMatch(/p_key/);
    expect(fonte).toMatch(/p_window_start/);
    expect(fonte).toMatch(/hits\s*<=\s*limit/);
  });

  it('ai-budget.ts usa as quatro RPCs do contrato', () => {
    const fonte = readFileSync(ARQ_BUDGET, 'utf8');
    for (const rpc of ['ai_budget_reserve', 'ai_budget_settle', 'ai_budget_release', 'ai_budget_reconcile']) {
      expect(fonte, `a RPC ${rpc} sumiu do módulo`).toContain(rpc);
    }
  });
});

/* ---------------------------------------------------------------------------------------- */
/* (9) Funções PURAS do despacho: estimativa de tokens e chave de idempotência (IA-044)        */
/* ---------------------------------------------------------------------------------------- */

describe('(9) estimateAiTokens: a estimativa cresce com a entrada e nunca é zero (IA-044)', () => {
  it('cresce com o tamanho das mensagens e tem piso 1', async () => {
    const { estimateAiTokens } = await carregarDespacho();

    const curto = estimateAiTokens([{ role: 'user', content: 'oi' }], 100);
    const longo = estimateAiTokens([{ role: 'user', content: 'x'.repeat(4000) }], 100);

    expect(curto, 'a estimativa nunca pode ser zero').toBeGreaterThan(0);
    expect(longo, 'mensagem maior tem de estimar mais entrada').toBeGreaterThan(curto);

    // Piso 1 mesmo sem mensagens e sem maxTokens.
    expect(estimateAiTokens([], null)).toBeGreaterThanOrEqual(1);
    expect(estimateAiTokens(undefined, undefined)).toBeGreaterThanOrEqual(1);
  });

  it('a SAÍDA usa `maxTokens` quando informado (senão 1024)', async () => {
    const { estimateAiTokens } = await carregarDespacho();
    // Sem entrada mensurável (undefined → ''), a parcela da saída domina a conta.
    expect(estimateAiTokens(undefined, 10)).toBe(10);
    expect(estimateAiTokens(undefined, undefined)).toBe(1024);
  });
});

describe('(10) deriveAiIdempotencyKey: mesma solicitação ⇒ mesma reserva (IA-044)', () => {
  const mensagens = [{ role: 'user', content: 'oi' }];

  it('mesma entrada → mesma chave; userId nulo vira `anon`', async () => {
    const { deriveAiIdempotencyKey } = await carregarDespacho();

    const a = deriveAiIdempotencyKey('ai-contrato', 'u-1', 'deepseek-chat', mensagens, 512);
    const b = deriveAiIdempotencyKey('ai-contrato', 'u-1', 'deepseek-chat', mensagens, 512);
    expect(b, 'repetir a mesma solicitação tem de dar a MESMA chave').toBe(a);
    expect(a).toMatch(/^ai-contrato:u-1:deepseek-chat:[0-9a-f]{8}$/);

    const anon = deriveAiIdempotencyKey('ai-contrato', null, 'deepseek-chat', mensagens, 512);
    expect(anon, 'dono ausente tem de virar `anon`').toMatch(/^ai-contrato:anon:deepseek-chat:[0-9a-f]{8}$/);
  });

  it('entradas diferentes → chaves diferentes', async () => {
    const { deriveAiIdempotencyKey } = await carregarDespacho();
    const base = deriveAiIdempotencyKey('ai-contrato', 'u-1', 'deepseek-chat', mensagens, 512);

    expect(deriveAiIdempotencyKey('outra-fn', 'u-1', 'deepseek-chat', mensagens, 512)).not.toBe(base);
    expect(deriveAiIdempotencyKey('ai-contrato', 'u-2', 'deepseek-chat', mensagens, 512)).not.toBe(base);
    expect(deriveAiIdempotencyKey('ai-contrato', 'u-1', 'outro-modelo', mensagens, 512)).not.toBe(base);
    expect(
      deriveAiIdempotencyKey('ai-contrato', 'u-1', 'deepseek-chat', [{ role: 'user', content: 'outra' }], 512),
    ).not.toBe(base);
    expect(deriveAiIdempotencyKey('ai-contrato', 'u-1', 'deepseek-chat', mensagens, 1024)).not.toBe(base);
  });

  it('a chave é estável à ORDEM das chaves do objeto (serialização canônica)', async () => {
    const { deriveAiIdempotencyKey } = await carregarDespacho();
    const a = deriveAiIdempotencyKey('ai-contrato', 'u-1', 'm', { a: 1, b: 2 }, 1);
    const b = deriveAiIdempotencyKey('ai-contrato', 'u-1', 'm', { b: 2, a: 1 }, 1);
    expect(b).toBe(a);
  });
});

/* ---------------------------------------------------------------------------------------- */
/* (11) Costura no despacho central: reserva → usar → liquidar/liberar (IA-044)                */
/* ---------------------------------------------------------------------------------------- */

/** Provedor único (padrão) do caminho de texto — espelha o retrato medido do banco. */
function provedorDoTeste(): Record<string, unknown> {
  return {
    id: 'p-deepseek',
    name: 'DeepSeek',
    provider_type: 'openai_compatible',
    api_endpoint: 'https://provedor.teste/v1/chat/completions',
    api_key_secret_name: 'FAKE_PROVIDER_KEY',
    model: 'deepseek-chat',
    system_prompt: null,
    config: null,
    is_active: true,
    is_default: true,
    use_for: ['copilot', 'analysis', 'summary', 'tagging', 'auto_reply'],
  };
}

function respostaProvedor(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

const PARAMS_BASE: Record<string, unknown> = {
  purpose: 'copilot',
  functionName: 'ai-contrato',
  userId: 'u-1',
  messages: [{ role: 'user', content: 'oi' }],
  budgetTokens: 200_000,
  idempotencyKey: 'op-despacho',
};

describe('(11) costura do orçamento no despacho: reserva → usar → liquidar/liberar (IA-044)', () => {
  it('orçamento NEGADO → HTTP 429 com BUDGET_EXCEEDED e o provedor NÃO é chamado', async () => {
    H.providers = [provedorDoTeste()];
    H.rpcImpl = (fn) =>
      fn === 'ai_budget_reserve'
        ? { data: [{ allowed: false, used_tokens: 999, limit_tokens: 1000 }], error: null }
        : { data: null, error: null };
    const fetchSpy = vi.fn(async () => respostaProvedor(200, { choices: [] }));
    vi.stubGlobal('fetch', fetchSpy);

    const { generateWithRouting, AI_BUDGET_ERROR_CODE } = await carregarDespacho();
    const r = await generateWithRouting({ ...PARAMS_BASE });

    expect(AI_BUDGET_ERROR_CODE).toBe('BUDGET_EXCEEDED');
    expect(H.calls.some((c) => c.fn === 'ai_budget_reserve'), 'a reserva foi tentada').toBe(true);
    expect(fetchSpy, 'com orçamento negado o provedor não pode ser chamado').not.toHaveBeenCalled();
    expect(r.ok).toBe(false);
    expect(r.response.status).toBe(429);
    expect(r.errorCode).toBe(AI_BUDGET_ERROR_CODE);
    const corpo = (await r.response.json()) as { error?: { code?: string } };
    expect(corpo.error?.code).toBe('BUDGET_EXCEEDED');
    // Nada foi gasto nem reservado de verdade: não liquida nem libera.
    expect(H.calls.some((c) => c.fn === 'ai_budget_settle' || c.fn === 'ai_budget_release')).toBe(false);
  });

  it('sucesso → `settleBudget` com a SOMA REAL (input+output medidos), nunca a estimativa', async () => {
    H.providers = [provedorDoTeste()];
    H.rpcImpl = (fn) =>
      fn === 'ai_budget_reserve'
        ? { data: [{ id: 'res-1', allowed: true, used_tokens: 0, limit_tokens: 200_000 }], error: null }
        : { data: null, error: null };
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        respostaProvedor(200, {
          model: 'deepseek-chat',
          choices: [{ message: { content: 'oi' } }],
          usage: { prompt_tokens: 120, completion_tokens: 30 },
        }),
      ),
    );

    const { generateWithRouting } = await carregarDespacho();
    const r = await generateWithRouting({ ...PARAMS_BASE });

    expect(r.ok).toBe(true);
    const settle = H.calls.find((c) => c.fn === 'ai_budget_settle');
    expect(settle?.args, 'a liquidação tem de gravar input+output REAIS (120+30)').toEqual({
      p_id: 'res-1',
      p_actual_tokens: 150,
    });
    // O faturamento NÃO pode ser a estimativa da reserva.
    const reserva = H.calls.find((c) => c.fn === 'ai_budget_reserve');
    expect(settle?.args.p_actual_tokens).not.toBe(reserva?.args.p_estimated_tokens);
  });

  it('falha do provedor (HTTP de erro) → `releaseBudget` antes do desfecho', async () => {
    H.providers = [provedorDoTeste()];
    H.rpcImpl = (fn) =>
      fn === 'ai_budget_reserve'
        ? { data: [{ id: 'res-2', allowed: true, used_tokens: 0, limit_tokens: 200_000 }], error: null }
        : { data: null, error: null };
    vi.stubGlobal('fetch', vi.fn(async () => respostaProvedor(400, { error: 'pedido invalido' })));

    const { generateWithRouting } = await carregarDespacho();
    const r = await generateWithRouting({ ...PARAMS_BASE });

    expect(r.ok).toBe(false);
    expect(r.response.status).toBe(400);
    const release = H.calls.find((c) => c.fn === 'ai_budget_release');
    expect(release?.args.p_id, 'a reserva da execução que não gastou tem de voltar').toBe('res-2');
    expect(H.calls.some((c) => c.fn === 'ai_budget_settle'), 'nada foi medido → nada a liquidar').toBe(false);
  });
});
