/**
 * Contrato de RESILIÊNCIA da camada de IA — prazos (IA-041) e retentativas disciplinadas (IA-042).
 * Bloco 05 / PR-1. Território: ESTE único arquivo.
 *
 * O que fica provado aqui (desenho congelado, conta Bloco 05 / PR-1):
 *   IA-042 — `classifyFailure(status, err?)` separa falha TRANSIENTE (5xx, 408, 429, rede,
 *            timeout), PERMANENTE (4xx que não seja 408/429) e ESTADO DESCONHECIDO (efeito
 *            não idempotente já enviado, cujo desfecho não se sabe);
 *   IA-042 — `withRetry` mantém a assinatura `(fn, maxRetries=2, baseDelayMs=500)`, mas
 *            retenta SÓ o transitório, com backoff exponencial COM JITTER (atrasos não
 *            determinísticos) e teto de tentativas;
 *   IA-041 — `callCustomWebhook` aceita `options.timeoutMs` e estoura AbortError quando o
 *            prazo vence; SEM `timeoutMs` o comportamento antigo não muda (nenhum timer,
 *            nenhum signal novo);
 *   IA-041 — o despacho central (`ai-generate.ts`) manda um prazo por capacidade (30s para
 *            texto puro) e um `timeoutMs` explícito do chamador VENCE o padrão.
 *
 * Como cada camada é exercitada de verdade:
 *   - `ai-providers.ts` é um módulo PURO (sem esm.sh, sem Deno) — importado direto e
 *     exercitado com `vi.useFakeTimers` e spy de `fetch` (SEM rede);
 *   - `ai-generate.ts` importa `https://esm.sh/@supabase/supabase-js` e usa `Deno.env`,
 *     então é carregado com `vi.doMock` do client, do `ai-usage` e do próprio
 *     `ai-providers` (provedor mockado, SEM rede): o que se observa é o `timeoutMs` que o
 *     despacho MANDA ao provedor.
 *
 * RED-FIRST: os dois módulos de produção são escritos pelos outros agentes do PR. Até lá
 * estes casos ficam vermelhos de propósito — o teste NÃO foi enfraquecido para passar, e
 * nenhum arquivo de produção foi tocado.
 */

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';

type AiFailureClass = 'transient' | 'permanent' | 'state_unknown';

interface AiProvidersModule {
  classifyFailure?: (status: number | null, err?: unknown) => AiFailureClass | Promise<AiFailureClass>;
  withRetry: (
    fn: () => Promise<Response>,
    maxRetries?: number,
    baseDelayMs?: number,
    options?: { budgetMs?: number },
  ) => Promise<Response>;
  callCustomWebhook: (params: Record<string, unknown>) => Promise<Response>;
  callOpenAICompatible: (params: Record<string, unknown>) => Promise<Response>;
}

const ROOT = resolve(__dirname, '../..');
const CAMINHO_PROVIDERS = '../../supabase/functions/_shared/ai-providers.ts';
const CAMINHO_GENERATE = '../../supabase/functions/_shared/ai-generate.ts';
const CAMINHO_USAGE = '../../supabase/functions/_shared/ai-usage.ts';
const ESM_SUPABASE = 'https://esm.sh/@supabase/supabase-js@2.87.1';
// Caminhos de DISCO (relativos à raiz do repositório) — para leitura de fonte.
const ARQ_PROVIDERS = resolve(ROOT, 'supabase/functions/_shared/ai-providers.ts');
const ARQ_GENERATE = resolve(ROOT, 'supabase/functions/_shared/ai-generate.ts');

/** Módulo real de `ai-providers.ts`, carregado UMA vez (o teste do despacho o mocka). */
let cacheProviders: AiProvidersModule | null = null;

async function providers(): Promise<AiProvidersModule> {
  if (cacheProviders === null) {
    try {
      cacheProviders = (await import(CAMINHO_PROVIDERS)) as unknown as AiProvidersModule;
    } catch (erro) {
      throw new Error(
        `ai-providers.ts não importável (módulo puro do PR-1): ${
          erro instanceof Error ? erro.message : String(erro)
        }`,
      );
    }
  }
  return cacheProviders;
}

/** Chama `classifyFailure` com mensagem legível quando o export ainda não existe. */
async function classificar(status: number | null, err?: unknown): Promise<AiFailureClass> {
  const mod = await providers();
  if (typeof mod.classifyFailure !== 'function') {
    throw new Error(
      'ai-providers.ts não exporta classifyFailure (contrato IA-042: transient|permanent|state_unknown)',
    );
  }
  return await mod.classifyFailure(status, err);
}

/**
 * Sinais que um chamador de efeito NÃO idempotente já enviado pode usar para marcar
 * "desfecho desconhecido". O desenho congelado fixa o CLASSE ('state_unknown'), não a
 * forma exata do sinal; por isso o caso aceita qualquer uma destas codificações —
 * o que ele NÃO aceita é NENHUMA delas resultar em state_unknown.
 */
function sinaisDeEstadoDesconhecido(): unknown[] {
  const err = (extra: Record<string, unknown>) =>
    Object.assign(new Error('efeito nao idempotente ja enviado, desfecho desconhecido'), extra);
  return [
    err({ name: 'AiStateUnknownError' }),
    err({ name: 'StateUnknownError' }),
    err({ name: 'OutcomeUnknownError' }),
    err({ code: 'STATE_UNKNOWN' }),
    err({ code: 'OUTCOME_UNKNOWN' }),
    err({ code: 'UNKNOWN_STATE' }),
    err({ stateUnknown: true }),
    err({ unknownState: true }),
    err({ outcomeUnknown: true }),
    err({ effectSent: true }),
    err({ dispatched: true, idempotent: false }),
    err({ effect: 'unknown' }),
  ];
}

/** Resultado observável de uma corrida do `withRetry`. */
interface ResultadoRetry {
  status: number | null;
  tentativas: number;
  erro: unknown;
}

/**
 * Roda `withRetry` sob `vi.useFakeTimers` com uma resposta por tentativa (a lista cicla).
 * Os timers de backoff são drenados com `runAllTimersAsync`, então o caso é determinístico
 * e não espera tempo de relógio real.
 */
async function rodarWithRetry(opcoes: {
  respostas: number[];
  maxRetries?: number;
  baseDelayMs?: number;
}): Promise<ResultadoRetry> {
  const { withRetry } = await providers();
  let tentativas = 0;
  const fn = async (): Promise<Response> => {
    const status = opcoes.respostas[Math.min(tentativas, opcoes.respostas.length - 1)];
    tentativas += 1;
    return new Response('corpo', { status });
  };

  vi.useFakeTimers();
  let status: number | null = null;
  let erro: unknown = null;
  try {
    const pendente = withRetry(fn, opcoes.maxRetries ?? 2, opcoes.baseDelayMs ?? 500);
    await vi.runAllTimersAsync();
    try {
      status = (await pendente).status;
    } catch (capturado) {
      erro = capturado;
    }
  } finally {
    vi.useRealTimers();
  }
  return { status, tentativas, erro };
}

afterEach(() => {
  vi.restoreAllMocks();
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.doUnmock(ESM_SUPABASE);
  vi.doUnmock(CAMINHO_PROVIDERS);
  vi.doUnmock(CAMINHO_USAGE);
});

/* ---------------------------------------------------------------------------------------- */
/* (1) classifyFailure — a classificação é o que decide se pode reenviar                      */
/* ---------------------------------------------------------------------------------------- */

describe('(1) classifyFailure: transitório × permanente × estado desconhecido (IA-042)', () => {
  const TRANSITORIOS: ReadonlyArray<[string, number]> = [
    ['500', 500],
    ['502', 502],
    ['503', 503],
    ['504', 504],
    ['408 (request timeout)', 408],
    ['429 (rate limit)', 429],
  ];

  it.each(TRANSITORIOS)('%s → transient (pode reenviar)', async (_rotulo, status) => {
    expect(await classificar(status)).toBe('transient');
  });

  const PERMANENTES: ReadonlyArray<[string, number]> = [
    ['400', 400],
    ['401', 401],
    ['403', 403],
    ['404', 404],
    ['422', 422],
  ];

  it.each(PERMANENTES)('%s → permanent (NUNCA reenviar)', async (_rotulo, status) => {
    expect(await classificar(status)).toBe('permanent');
  });

  it('erro de REDE (sem resposta HTTP) → transient', async () => {
    // `null` é o sentinela do contrato para "a chamada morreu antes de responder".
    expect(await classificar(null, new TypeError('fetch failed'))).toBe('transient');
  });

  it('erro de TIMEOUT/abort (prazo vencido) → transient', async () => {
    const abort = new DOMException('The operation was aborted', 'AbortError');
    expect(await classificar(null, abort)).toBe('transient');
    expect(await classificar(408, abort)).toBe('transient');
  });

  it('efeito não idempotente já enviado → state_unknown (NÃO reenvia às cegas)', async () => {
    const sinais = sinaisDeEstadoDesconhecido();
    const classes = await Promise.all(sinais.map((sinal) => classificar(null, sinal)));
    const casados = classes.filter((classe) => classe === 'state_unknown');
    expect(
      casados.length,
      `nenhum sinal de estado desconhecido foi classificado como state_unknown ` +
        `(sinais=${JSON.stringify(sinais.map((s) => (s as Error).name || s))}, classes=${classes.join(', ')})`,
    ).toBeGreaterThan(0);

    // Um erro de rede comum NÃO pode virar state_unknown: isso bloquearia todo retry legítimo.
    expect(await classificar(null, new TypeError('fetch failed'))).not.toBe('state_unknown');
  });

  it('só devolve as três classes do contrato', async () => {
    const validas = new Set<AiFailureClass>(['transient', 'permanent', 'state_unknown']);
    const amostras = [500, 408, 429, 403, 404, 422, 200, 204, 0, 302];
    for (const status of amostras) {
      expect(validas.has(await classificar(status)), `status ${status} devolveu classe fora do contrato`).toBe(
        true,
      );
    }
  });
});

/* ---------------------------------------------------------------------------------------- */
/* (2) withRetry — retenta só o transitório, com jitter e teto de tentativas (IA-042)        */
/* ---------------------------------------------------------------------------------------- */

describe('(2) withRetry: retentativa disciplinada (IA-042)', () => {
  it('500 seguido de 200 → tenta de novo e devolve 200', async () => {
    const r = await rodarWithRetry({ respostas: [500, 200] });
    expect(r.tentativas, 'um 5xx transitório deve ser retentado').toBe(2);
    expect(r.status).toBe(200);
    expect(r.erro).toBeNull();
  });

  it('404 → NÃO retenta (uma única chamada)', async () => {
    const r = await rodarWithRetry({ respostas: [404] });
    expect(r.tentativas, 'erro permanente foi reenviado (não pode)').toBe(1);
    expect(r.status).toBe(404);
  });

  it('408 → retenta', async () => {
    const r = await rodarWithRetry({ respostas: [408, 200] });
    expect(r.tentativas, '408 é transitório e deve ser retentado').toBe(2);
    expect(r.status).toBe(200);
  });

  it('429 → retenta', async () => {
    const r = await rodarWithRetry({ respostas: [429, 200] });
    expect(r.tentativas, '429 é transitório e deve ser retentado').toBe(2);
    expect(r.status).toBe(200);
  });

  it('respeita o TETO de tentativas (maxRetries=2 → no máximo 3 chamadas)', async () => {
    const r = await rodarWithRetry({ respostas: [503], maxRetries: 2 });
    expect(r.tentativas, 'o teto de tentativas não foi respeitado').toBe(3);
  });

  it('maxRetries=0 → uma única chamada', async () => {
    const r = await rodarWithRetry({ respostas: [503], maxRetries: 0 });
    expect(r.tentativas).toBe(1);
  });

  it('backoff exponencial COM JITTER: o mesmo input não produz sempre o mesmo atraso', async () => {
    const { withRetry } = await providers();
    const RUNS = 12;
    const amostras: number[] = [];

    for (let corrida = 0; corrida < RUNS; corrida++) {
      vi.useFakeTimers();
      const atrasos: number[] = [];
      const timerFalso = globalThis.setTimeout;
      // O backoff é sempre um `setTimeout(handler, delay)`: capturar o delay pedido ao timer
      // observa o atraso SEM depender do relógio e SEM esperar tempo real.
      (globalThis as { setTimeout: unknown }).setTimeout = ((
        handler: unknown,
        ms?: number,
        ...extra: unknown[]
      ) => {
        if (typeof ms === 'number') atrasos.push(ms);
        return (timerFalso as (...args: unknown[]) => unknown)(handler, ms, ...extra);
      }) as unknown as typeof setTimeout;

      try {
        const fn = async () => new Response('x', { status: 503 });
        const pendente = withRetry(fn, 1, 500).catch(() => null);
        await vi.runAllTimersAsync();
        await pendente;
      } finally {
        (globalThis as { setTimeout: unknown }).setTimeout = timerFalso;
        vi.useRealTimers();
      }
      amostras.push(atrasos[0] ?? Number.NaN);
    }

    expect(
      amostras.filter((atraso) => Number.isFinite(atraso)),
      'withRetry não agendou atraso de backoff entre as tentativas',
    ).toHaveLength(RUNS);
    // SEM jitter, o primeiro backoff seria sempre `baseDelayMs` e o conjunto teria 1 valor.
    expect(
      new Set(amostras).size,
      `o backoff não tem jitter: todas as corridas tiveram o mesmo atraso (${amostras.join(', ')})`,
    ).toBeGreaterThan(1);
  });
});

/* ---------------------------------------------------------------------------------------- */
/* (3) callCustomWebhook — teto opcional de tempo (IA-041)                                    */
/* ---------------------------------------------------------------------------------------- */

describe('(3) callCustomWebhook: prazo opcional, sem quebrar o comportamento antigo (IA-041)', () => {
  it('com timeoutMs curto, o prazo vence e a chamada estoura AbortError (sem rede)', async () => {
    const { callCustomWebhook } = await providers();
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockImplementation(((
      _entrada: RequestInfo | URL,
      init?: RequestInit,
    ) =>
      new Promise<Response>((_resolver, rejeitar) => {
        const signal = init?.signal;
        if (signal) {
          signal.addEventListener('abort', () => rejeitar(new DOMException('Aborted', 'AbortError')), {
            once: true,
          });
        }
        // Nunca resolve sozinho: só o prazo pode encerrar esta chamada.
      })) as unknown as typeof fetch);

    try {
      const executada = callCustomWebhook({
        endpoint: 'https://exemplo.invalid/webhook',
        messages: [{ role: 'user', content: 'oi' }],
        options: { timeoutMs: 25 },
      }).then(
        () => ({ tipo: 'resolveu' as const, valor: null as unknown }),
        (erro: unknown) => ({ tipo: 'estourou' as const, valor: erro }),
      );

      const resultado = await Promise.race([
        executada,
        new Promise<{ tipo: 'nao_expirou'; valor: null }>((resolver) =>
          setTimeout(() => resolver({ tipo: 'nao_expirou', valor: null }), 3000),
        ),
      ]);

      expect(resultado.tipo, 'o prazo não venceu: callCustomWebhook continuou pendente').toBe('estourou');
      const erro = resultado.valor as { name?: string };
      expect(String(erro?.name ?? erro), 'deveria ser erro de abort/expirado').toMatch(
        /abort|timeout|expir/i,
      );

      // O cancelamento tem de CHEGAR ao provedor: o signal precisa ir no fetch.
      const init = fetchSpy.mock.calls[0]?.[1] as RequestInit | undefined;
      expect(init?.signal, 'o signal de abort não chegou ao fetch (cancelamento não propagou)').toBeDefined();
    } finally {
      fetchSpy.mockRestore();
    }
  });

  it('SEM timeoutMs o comportamento antigo não muda: nenhum timer e nenhum signal novo', async () => {
    const { callCustomWebhook } = await providers();
    vi.useFakeTimers();
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response('{}', { status: 200 }));
    try {
      const res = await callCustomWebhook({
        endpoint: 'https://exemplo.invalid/webhook',
        messages: [{ role: 'user', content: 'oi' }],
      });
      expect(res.status).toBe(200);
      expect(vi.getTimerCount(), 'sem timeoutMs nenhum timer pode ser criado').toBe(0);
      const init = fetchSpy.mock.calls[0]?.[1] as RequestInit | undefined;
      expect(init?.signal, 'sem timeoutMs nenhum signal novo pode chegar ao fetch').toBeUndefined();
    } finally {
      fetchSpy.mockRestore();
      vi.useRealTimers();
    }
  });

  it('timeoutMs: 0 (não positivo) também não cria timer', async () => {
    const { callCustomWebhook } = await providers();
    vi.useFakeTimers();
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response('{}', { status: 200 }));
    try {
      await callCustomWebhook({
        endpoint: 'https://exemplo.invalid/webhook',
        messages: [{ role: 'user', content: 'oi' }],
        options: { timeoutMs: 0 },
      });
      expect(vi.getTimerCount()).toBe(0);
    } finally {
      fetchSpy.mockRestore();
      vi.useRealTimers();
    }
  });

  it('o mecanismo de prazo dos outros adaptadores continua valendo (callOpenAICompatible)', async () => {
    const { callOpenAICompatible } = await providers();
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockImplementation(((
      _entrada: RequestInfo | URL,
      init?: RequestInit,
    ) =>
      new Promise<Response>((_resolver, rejeitar) => {
        const signal = init?.signal;
        if (signal) {
          signal.addEventListener('abort', () => rejeitar(new DOMException('Aborted', 'AbortError')), {
            once: true,
          });
        }
      })) as unknown as typeof fetch);
    try {
      const executada = callOpenAICompatible({
        endpoint: 'https://exemplo.invalid/v1/chat/completions',
        apiKey: 'sk-teste',
        messages: [{ role: 'user', content: 'oi' }],
        options: { timeoutMs: 25 },
      }).then(
        () => ({ tipo: 'resolveu' as const, valor: null as unknown }),
        (erro: unknown) => ({ tipo: 'estourou' as const, valor: erro }),
      );
      const resultado = await Promise.race([
        executada,
        new Promise<{ tipo: 'nao_expirou'; valor: null }>((resolver) =>
          setTimeout(() => resolver({ tipo: 'nao_expirou', valor: null }), 3000),
        ),
      ]);
      expect(resultado.tipo).toBe('estourou');
      const erro = resultado.valor as { name?: string };
      expect(String(erro?.name ?? erro)).toMatch(/abort|timeout|expir/i);
    } finally {
      fetchSpy.mockRestore();
    }
  });
});

/* ---------------------------------------------------------------------------------------- */
/* (4) Despacho central — o prazo POR CAPACIDADE chega ao provedor (IA-041)                   */
/* ---------------------------------------------------------------------------------------- */

const PROVEDOR_TEXTO = {
  id: 'p-contrato',
  name: 'Contrato',
  provider_type: 'openai_compatible',
  api_endpoint: 'https://exemplo.invalid/v1/chat/completions',
  api_key_secret_name: 'OPENAI_CONTRACT_KEY',
  model: 'gpt-4o',
  system_prompt: null,
  config: null,
  is_active: true,
  is_default: true,
  use_for: ['copilot', 'analysis', 'summary', 'tagging', 'auto_reply'],
};

interface DespachoCapturado {
  tipo: string;
  options?: { timeoutMs?: number };
}

/**
 * Carrega `ai-generate.ts` com o provedor MOCKADO (client Supabase, `ai-usage` e
 * `ai-providers` falsos): nenhuma rede, nenhum banco. Devolve o despacho e o que ele
 * mandou para o adaptador do provedor.
 */
async function carregarDespacho(rows: unknown[]): Promise<{
  generateWithRouting: (params: Record<string, unknown>) => Promise<{ ok: boolean }>;
  capturado: DespachoCapturado[];
}> {
  vi.resetModules();
  const capturado: DespachoCapturado[] = [];

  vi.stubGlobal('Deno', { env: { get: () => 'x' } });
  vi.doMock(ESM_SUPABASE, () => ({
    createClient: () => ({
      from: () => ({
        select: () => Promise.resolve({ data: rows, error: null }),
        insert: () => Promise.resolve({ error: null }),
      }),
    }),
  }));
  vi.doMock(CAMINHO_USAGE, () => ({
    logAiUsage: async () => {},
    extractTokenUsage: () => ({ inputTokens: 0, outputTokens: 0, model: null }),
  }));

  const responder = () =>
    new Response(JSON.stringify({ choices: [{ message: { content: 'ok' } }] }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  vi.doMock(CAMINHO_PROVIDERS, () => ({
    callLovableAI: async (p: { options?: { timeoutMs?: number } }) => {
      capturado.push({ tipo: 'lovable', options: p.options });
      return responder();
    },
    callOpenAICompatible: async (p: { options?: { timeoutMs?: number } }) => {
      capturado.push({ tipo: 'openai_compatible', options: p.options });
      return responder();
    },
    callCustomWebhook: async (p: { options?: { timeoutMs?: number } }) => {
      capturado.push({ tipo: 'custom_webhook', options: p.options });
      return responder();
    },
    withRetry: (fn: () => Promise<Response>) => fn(),
  }));

  const mod = (await import(CAMINHO_GENERATE)) as unknown as {
    generateWithRouting: (params: Record<string, unknown>) => Promise<{ ok: boolean }>;
  };
  return { generateWithRouting: mod.generateWithRouting, capturado };
}

describe('(4) ai-generate: prazo por capacidade com o chamador vencendo o padrão (IA-041)', () => {
  it('sem timeoutMs, o despacho manda o prazo padrão da capacidade (30s para texto puro)', async () => {
    const { generateWithRouting, capturado } = await carregarDespacho([PROVEDOR_TEXTO]);
    const resultado = await generateWithRouting({
      purpose: 'copilot',
      functionName: 'contrato-ia-resilience',
      messages: [{ role: 'user', content: 'oi' }],
    });

    expect(resultado.ok, 'o despacho deveria concluir com o provedor mockado').toBe(true);
    expect(capturado.length, 'o provedor mockado não foi chamado').toBeGreaterThan(0);
    expect(
      capturado[0].options?.timeoutMs,
      'o prazo padrão de texto (30s) não chegou ao adaptador do provedor',
    ).toBe(30_000);
  });

  it('um timeoutMs explícito do chamador vence o padrão', async () => {
    const { generateWithRouting, capturado } = await carregarDespacho([PROVEDOR_TEXTO]);
    await generateWithRouting({
      purpose: 'copilot',
      functionName: 'contrato-ia-resilience',
      messages: [{ role: 'user', content: 'oi' }],
      timeoutMs: 1234,
    });

    expect(capturado[0].options?.timeoutMs, 'o timeoutMs explícito foi ignorado').toBe(1234);
  });
});

/* ---------------------------------------------------------------------------------------- */
/* (5) Fonte: o VOCABULÁRIO do contrato existe (o que o runtime não pode provar)             */
/* ---------------------------------------------------------------------------------------- */

function semComentarios(fonte: string): string {
  return fonte.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '');
}

describe('(5) o vocabulário congelado está declarado no fonte', () => {
  it('ai-providers.ts declara AiFailureClass com as três classes', () => {
    const fonte = semComentarios(readFileSync(ARQ_PROVIDERS, 'utf8'));
    const match = /export\s+type\s+AiFailureClass\s*=([^;]+);/.exec(fonte);
    expect(match, 'AiFailureClass não está declarado em ai-providers.ts').not.toBeNull();
    const literais = match![1];
    for (const classe of ['transient', 'permanent', 'state_unknown']) {
      expect(literais, `AiFailureClass sem a classe ${classe}`).toContain(classe);
    }
  });

  it('ai-generate.ts tem o padrão de 30s e preserva a precedência do timeoutMs do chamador', () => {
    const fonte = semComentarios(readFileSync(ARQ_GENERATE, 'utf8'));
    expect(fonte, 'o padrão de 30s (texto puro) sumiu do despacho').toMatch(/30[_]?000/);
    expect(fonte, 'o despacho precisa respeitar o timeoutMs do chamador').toMatch(/\btimeoutMs\b/);
    // Precedência: o valor do CHAMADOR vem primeiro, o padrão só entra no fallback (??).
    expect(
      fonte,
      'o despacho deveria ser `params.timeoutMs ?? <padrão por capacidade>`',
    ).toMatch(/params\s*\.\s*timeoutMs\s*\?\?/);
  });
});

/* ---------------------------------------------------------------------------------------- */
/* (6) IA-041: orçamento TOTAL de tempo — um estouro de prazo não vira 3 estouros em fila     */
/* ---------------------------------------------------------------------------------------- */

describe('(6) withRetry: orçamento total de tempo por capacidade (IA-041)', () => {
  it('sem orçamento para o próximo atraso, NÃO retenta (uma única chamada)', async () => {
    vi.useFakeTimers();
    try {
      const { withRetry } = await providers();
      const fn = vi.fn(async () => new Response('erro', { status: 500 }));
      // budgetMs = 1: qualquer atraso (o piso do jitter é 1 ms) já estoura o orçamento.
      const promessa = withRetry(fn, 5, 60_000, { budgetMs: 1 });
      await vi.runAllTimersAsync();
      const resposta = await promessa;
      expect(resposta.status).toBe(500);
      expect(fn, 'orçamento estourado não pode gerar nova tentativa').toHaveBeenCalledTimes(1);
    } finally {
      vi.useRealTimers();
    }
  });

  it('com orçamento folgado, retenta normalmente até o sucesso', async () => {
    vi.useFakeTimers();
    try {
      const { withRetry } = await providers();
      let n = 0;
      const fn = vi.fn(async () =>
        ++n === 1 ? new Response('erro', { status: 500 }) : new Response('ok', { status: 200 }),
      );
      const promessa = withRetry(fn, 2, 1, { budgetMs: 600_000 });
      await vi.runAllTimersAsync();
      const resposta = await promessa;
      expect(resposta.status).toBe(200);
      expect(fn).toHaveBeenCalledTimes(2);
    } finally {
      vi.useRealTimers();
    }
  });

  it('o orçamento nunca é ultrapassado: com prazo curto, o tempo total fica sob o teto', async () => {
    vi.useFakeTimers();
    try {
      const { withRetry } = await providers();
      const fn = vi.fn(async () => new Response('erro', { status: 503 }));
      const inicio = Date.now();
      const promessa = withRetry(fn, 9, 30_000, { budgetMs: 30_000 });
      await vi.runAllTimersAsync();
      await promessa;
      const decorrido = Date.now() - inicio;
      expect(decorrido, 'o total não pode passar do orçamento declarado').toBeLessThan(60_000);
    } finally {
      vi.useRealTimers();
    }
  });
});
