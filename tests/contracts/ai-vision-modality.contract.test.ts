/**
 * Contrato da resolução por MODALIDADE do despacho central — Bloco 04 / PR-4 (IA-033, visão).
 *
 * `generateWithRouting` NÃO é importável "puro" (fala `Deno.env`, `fetch` e o client
 * Supabase via URL `https://esm.sh/...`). Aqui ele é importado com as fronteiras de I/O
 * TROCADAS por dublês:
 *   - o client Supabase é mockado (a tabela `ai_providers` vira FIXTURE de linhas — sem banco);
 *   - `Deno.env.get` devolve segredos fictícios;
 *   - `globalThis.fetch` é um espião que captura URL/corpo e devolve um 200 JSON.
 *
 * Assim o COMPORTAMENTO do mecanismo é exercitado de verdade (não por leitura de fonte) e a
 * prova de mutação do relatório morde: mexer na seleção (ex.: exigir `is_default` para visão)
 * faz os casos abaixo falharem.
 *
 * Cobre o aceite do IA-033:
 *   1. texto puro resolve no provedor PADRÃO (DeepSeek segue dono do texto);
 *   2. visão com UM candidato ativo que declara 'vision' resolve NELE (mesmo sem `is_default`);
 *   3. visão SEM candidato → NO_PROVIDER (falha fechada, 503, sem chamar provedor);
 *   4. visão com DOIS candidatos → AMBIGUOUS_PROVIDER (nunca sortear);
 *   5. provedor INATIVO que declara 'vision' é IGNORADO;
 *   6. conteúdo MULTIPART atravessa `composeMessages` SEM ser coagido/destruído;
 *   7. `purpose` continua validada/usada e `logAiUsage` acontece em TODOS os desfechos.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { generateWithRouting, type GenerateParams } from '../../supabase/functions/_shared/ai-generate.ts';
import { logAiUsage } from '../../supabase/functions/_shared/ai-usage.ts';

/** Estado compartilhado entre o teste e as fábricas de mock (hoisted). */
const H = vi.hoisted(() => ({
  /** Linhas de `ai_providers` que o client mockado devolve (a FIXTURE de cada caso). */
  rows: [] as Array<Record<string, unknown>>,
  /** Chamadas capturadas do `fetch` espião. */
  fetchCalls: [] as Array<{ url: string; body: Record<string, unknown> }>,
}));

/** Espião de auditoria: `logAiUsage` real é trocado para provar que ele é chamado. */
const logSpy = vi.hoisted(() =>
  vi.fn(async (_entry: Record<string, unknown>): Promise<void> => undefined),
);

// Fronteira de banco: qualquer URL esm.sh do client Supabase (ai-generate e ai-usage) vira este dublê.
vi.mock('https://esm.sh/@supabase/supabase-js@2.87.1', () => ({
  createClient: () => ({
    from: (table: string) => ({
      select: async () => ({ data: table === 'ai_providers' ? H.rows : [], error: null }),
    }),
  }),
}));

// `extractTokenUsage` continua REAL; só o registro de consumo é espiado.
vi.mock('../../supabase/functions/_shared/ai-usage.ts', async (importOriginal) => {
  const real = await importOriginal<Record<string, unknown>>();
  return { ...real, logAiUsage: logSpy };
});

// `Deno.env.get` fictício: a configuração do provedor resolve os segredos sem ambiente real.
vi.stubGlobal('Deno', {
  env: {
    get: (key: string): string | undefined => {
      if (key === 'SUPABASE_URL') return 'https://projeto.teste.supabase.co';
      if (key === 'SUPABASE_SERVICE_ROLE_KEY') return 'service-role-ficticia';
      return 'segredo-ficticio';
    },
  },
});

beforeEach(() => {
  H.rows = [];
  H.fetchCalls = [];
  logSpy.mockClear();

  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: unknown, init?: { body?: string }) => {
      H.fetchCalls.push({
        url: String(url),
        body: JSON.parse(String(init?.body ?? '{}')) as Record<string, unknown>,
      });
      return new Response(
        JSON.stringify({
          model: 'modelo-de-resposta',
          choices: [{ message: { content: 'ok' } }],
          usage: { prompt_tokens: 3, completion_tokens: 5 },
        }),
        { status: 200, headers: { 'content-type': 'application/json' } },
      );
    }),
  );
});

/** Linha de `ai_providers` com defaults válidos; `over` sobrescreve o que o caso precisar. */
function linha(over: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: 'p-base',
    name: 'Base',
    provider_type: 'openai_compatible',
    api_endpoint: 'https://api.base.test/v1/chat/completions',
    api_key_secret_name: 'BASE_KEY',
    model: 'modelo-base',
    system_prompt: null,
    config: {},
    is_active: true,
    is_default: false,
    use_for: ['copilot', 'analysis', 'summary', 'tagging', 'auto_reply'],
    ...over,
  };
}

/** DeepSeek: o PADRÃO de texto (is_default = true). */
const deepseek = () =>
  linha({ id: 'deepseek', name: 'DeepSeek', model: 'deepseek-v4-flash', is_default: true });

/**
 * Gemini/OpenRouter: provedor de VISÃO. Deliberadamente `is_default = false` — a resolução
 * por modalidade NÃO pode depender de ser o padrão de texto.
 */
const geminiVision = (over: Record<string, unknown> = {}) =>
  linha({
    id: 'openrouter-gemini',
    name: 'OpenRouter Gemini',
    model: 'google/gemini-3.8-flash',
    api_endpoint: 'https://openrouter.ai/api/v1/chat/completions',
    api_key_secret_name: 'OPENROUTER_API_KEY',
    config: { capabilities: { modalities: ['vision'] } },
    ...over,
  });

const geminiVision2 = () => geminiVision({ id: 'openrouter-gemini-2', name: 'OpenRouter Gemini 2' });

/** Chama o despacho com defaults de texto e deixa o caso sobrescrever o que importa. */
async function gerar(over: Partial<GenerateParams> = {}) {
  return await generateWithRouting({
    purpose: 'tagging',
    functionName: 'classify-sticker',
    userId: 'usuario-1',
    messages: [{ role: 'user', content: 'oi' }],
    ...over,
  });
}

// ---------------------------------------------------------------------------
// 1. Texto puro: continua no provedor PADRÃO (DeepSeek)
// ---------------------------------------------------------------------------

describe('IA-033 — texto puro segue o caminho de hoje (padrão por finalidade)', () => {
  it('sem `need`, resolve no provedor padrão mesmo com um provedor de visão ativo', async () => {
    H.rows = [deepseek(), geminiVision()];

    const res = await gerar();

    expect(res.ok).toBe(true);
    expect(res.providerId).toBe('deepseek');
    expect(res.model).toBe('deepseek-v4-flash');
    expect(H.fetchCalls).toHaveLength(1);
    expect(H.fetchCalls[0].url).toBe('https://api.base.test/v1/chat/completions');
    expect(H.fetchCalls[0].body.model).toBe('deepseek-v4-flash');
  });

  it('`need.modality = "text"` também NÃO entra no caminho por modalidade', async () => {
    H.rows = [deepseek(), geminiVision()];

    const res = await gerar({ need: { modality: 'text' } });

    expect(res.providerId).toBe('deepseek');
    expect(H.fetchCalls[0].url).toBe('https://api.base.test/v1/chat/completions');
  });
});

// ---------------------------------------------------------------------------
// 2. Visão: resolve pelo provedor que DECLARA a modalidade (sem exigir is_default)
// ---------------------------------------------------------------------------

describe('IA-033 — visão resolve no provedor que declara a modalidade', () => {
  it('um candidato ativo declarando vision resolve NELE, mesmo sem is_default', async () => {
    H.rows = [deepseek(), geminiVision()];

    const res = await gerar({ need: { modality: 'vision' } });

    expect(res.ok).toBe(true);
    expect(res.providerId).toBe('openrouter-gemini');
    expect(res.model).toBe('google/gemini-3.8-flash');
    expect(H.fetchCalls).toHaveLength(1);
    expect(H.fetchCalls[0].url).toBe('https://openrouter.ai/api/v1/chat/completions');
    expect(H.fetchCalls[0].body.model).toBe('google/gemini-3.8-flash');
  });
});

// ---------------------------------------------------------------------------
// 3. Falha fechada: sem candidato → NO_PROVIDER
// ---------------------------------------------------------------------------

describe('IA-033 — visão sem candidato falha FECHADO', () => {
  it('nenhum provedor declara vision → NO_PROVIDER (503), sem chamar provedor', async () => {
    H.rows = [deepseek()];

    const res = await gerar({ need: { modality: 'vision' } });

    expect(res.ok).toBe(false);
    expect(res.errorCode).toBe('NO_PROVIDER');
    expect(res.response.status).toBe(503);
    expect(H.fetchCalls).toHaveLength(0);
    expect(logSpy, 'desfecho de roteamento precisa ser auditado').toHaveBeenCalledTimes(1);
  });
});

// ---------------------------------------------------------------------------
// 4. Ambiguidade: dois candidatos → AMBIGUOUS_PROVIDER (nunca sortear)
// ---------------------------------------------------------------------------

describe('IA-033 — visão com dois candidatos é AMBÍGUA', () => {
  it('dois provedores ativos declaram vision → AMBIGUOUS_PROVIDER (503), sem chamar provedor', async () => {
    H.rows = [deepseek(), geminiVision(), geminiVision2()];

    const res = await gerar({ need: { modality: 'vision' } });

    expect(res.ok).toBe(false);
    expect(res.errorCode).toBe('AMBIGUOUS_PROVIDER');
    expect(res.response.status).toBe(503);
    expect(H.fetchCalls).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// 5. Provedor INATIVO que declara vision é ignorado
// ---------------------------------------------------------------------------

describe('IA-033 — provedor inativo é ignorado na resolução por modalidade', () => {
  it('o único provedor que declara vision está inativo → NO_PROVIDER', async () => {
    H.rows = [deepseek(), geminiVision({ is_active: false })];

    const res = await gerar({ need: { modality: 'vision' } });

    expect(res.errorCode).toBe('NO_PROVIDER');
    expect(H.fetchCalls).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// 6. Conteúdo multipart atravessa composeMessages SEM ser coagido/destruído
// ---------------------------------------------------------------------------

describe('IA-033 — conteúdo multipart (imagem + texto) atravessa intacto', () => {
  it('as partes da imagem chegam ao provedor como array, não como string', async () => {
    H.rows = [deepseek(), geminiVision()];

    const partes = [
      { type: 'image_url', image_url: { url: 'https://img.teste/sticker.png' } },
      { type: 'text', text: 'classifique a figurinha' },
    ];

    const res = await gerar({
      need: { modality: 'vision' },
      system: 'POLITICA DO SERVIDOR',
      messages: [{ role: 'user', content: partes }],
    });

    expect(res.ok).toBe(true);
    const enviadas = H.fetchCalls[0].body.messages as Array<{ role: string; content: unknown }>;

    // A política do servidor entra na posição 0; a mensagem do cliente segue na 1.
    expect(enviadas).toHaveLength(2);
    expect(enviadas[0]).toEqual({ role: 'system', content: 'POLITICA DO SERVIDOR' });

    // O conteúdo multipart NÃO foi coagido nem destruído.
    expect(Array.isArray(enviadas[1].content)).toBe(true);
    expect(enviadas[1].content).toEqual(partes);
    expect(typeof enviadas[1].content).not.toBe('string');

    // As mensagens de entrada não são mutadas.
    expect(partes).toHaveLength(2);
  });
});

// ---------------------------------------------------------------------------
// 7. `purpose` validada/usada e auditoria em TODOS os desfechos
// ---------------------------------------------------------------------------

describe('IA-033 — purpose segue obrigatória e logAiUsage cobre os desfechos', () => {
  it('a finalidade viaja no metadata do log (segue usada)', async () => {
    H.rows = [deepseek(), geminiVision()];

    await gerar({ need: { modality: 'vision' } });

    const entrada = logSpy.mock.calls[0][0] as { purpose?: string | null };
    // IA-052: a finalidade vai ao registrador como campo próprio, e é ele quem a
    // deposita em `metadata.purpose` (prova no insert em `ai-usage.test.ts`).
    expect(entrada.purpose).toBe('tagging');
  });

  it('finalidade inválida no caminho de visão → BAD_PURPOSE (400), sem chamar provedor', async () => {
    H.rows = [deepseek(), geminiVision()];

    const res = await gerar({
      purpose: 'finalidade-invalida' as unknown as GenerateParams['purpose'],
      need: { modality: 'vision' },
    });

    expect(res.ok).toBe(false);
    expect(res.errorCode).toBe('BAD_PURPOSE');
    expect(res.response.status).toBe(400);
    expect(H.fetchCalls).toHaveLength(0);
  });

  it('logAiUsage é chamado no sucesso E nos desfechos de roteamento', async () => {
    // Sucesso (visão resolvida).
    H.rows = [deepseek(), geminiVision()];
    await gerar({ need: { modality: 'vision' } });
    expect(logSpy).toHaveBeenCalledTimes(1);

    // NO_PROVIDER.
    H.rows = [deepseek()];
    await gerar({ need: { modality: 'vision' } });
    expect(logSpy).toHaveBeenCalledTimes(2);

    // AMBIGUOUS_PROVIDER.
    H.rows = [deepseek(), geminiVision(), geminiVision2()];
    await gerar({ need: { modality: 'vision' } });
    expect(logSpy).toHaveBeenCalledTimes(3);
  });

  it('a implementação está exportada e é o despacho congelado', () => {
    expect(typeof generateWithRouting).toBe('function');
    expect(typeof logAiUsage).toBe('function');
  });
});
