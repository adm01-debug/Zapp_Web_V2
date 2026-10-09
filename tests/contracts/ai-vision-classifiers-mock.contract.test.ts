/**
 * Contrato com MOCK DE PROVEDOR da rota de VISÃO — Bloco 04 / PR-4 (IA-033).
 *
 * Este arquivo substitui, para fins de CI, a prova de rede que ficou pendente de
 * credencial real: em vez de bater no OpenRouter, o `globalThis.fetch` é
 * INTERCEPTADO e o corpo enviado é inspecionado. O que se prova aqui é o ELO
 * INTEIRO, end-to-end, através dos consumidores REAIS:
 *
 *   classify-emoji / classify-sticker
 *     → toInlineImage (download AUTENTICADO do Storage privado)
 *     → generateWithRouting → fetch (espião do provedor)
 *
 * As fronteiras de I/O são trocadas por dublês (mesmo padrão de
 * `ai-vision-modality.contract.test.ts`), nunca a lógica:
 *   - o client Supabase vira FIXTURE de linhas de `ai_providers` (sem banco);
 *   - `Deno.env.get` devolve segredos fictícios;
 *   - `Deno.serve` captura o handler do consumidor (a função NÃO roda por I/O);
 *   - `logAiUsage` é um espião (prova do registro de consumo/erro sem tocar o banco);
 *   - `globalThis.fetch` é um espião duplo: serve o DOWNLOAD da imagem do Storage
 *     (GET no endpoint autenticado do próprio projeto) e o PROVEDOR (POST), com o
 *     desfecho de cada um controlado pelos casos.
 *
 * Aceites do PR-4 provados:
 *   1. a imagem do classificador chega ao provedor EMBUTIDA como DATA URL
 *      (`data:image/<mime>;base64,...`) — NUNCA a URL crua; o download usa o
 *      endpoint AUTENTICADO do Storage (`/storage/v1/object/<bucket>/<path>`),
 *      nunca a URL pública `/object/public/`. Se a URL crua voltar ao payload, o
 *      teste FALHA;
 *   2. o conteúdo MULTIPART segue íntegro (array, nunca string) e a chamada vai ao
 *      provedor que DECLARA visão, com o modelo decidido pelo SERVIDOR;
 *   3. imagem grande demais (> 4 MiB) e falha do Storage (404/403) degradam para
 *      `{ category: 'outros' }` (HTTP 200) SEM propagar exceção — e SEMPRE deixam
 *      trilha em `ai_usage_logs` (status de erro);
 *   4. asserção CENTRAL (decisão do Joaquim): NENHUM caminho que devolva 'outros'
 *      termina sem registro de uso/erro — o fallback silencioso acabou;
 *   5. erro HTTP do provedor de visão também degrada para `outros` (200) e é
 *      registrado; se nenhum provedor declarar visão, a resolução falha FECHADA
 *      (NO_PROVIDER) e NADA é enviado ao provedor de texto padrão;
 *   6. identidade do download (R2-INF-022): no fluxo de USUÁRIO o GET do Storage
 *      leva `apikey` = anon key e `Authorization` = Bearer <JWT do chamador> —
 *      NUNCA a service role; no fluxo de SERVIÇO (webhook) a service role é
 *      usada de forma EXPLÍCITA.
 *
 * Aceites do IA-132 provados aqui (seções 10 e 11):
 *   7. `classify-emoji` e `classify-sticker` devolvem, ao lado de `category`, o
 *      ESTADO (`state`) e o motivo técnico (`error_code`): 'ok' (categoria
 *      válida — inclusive quando o MODELO responde 'outros'), 'unknown' (sem
 *      entrada), 'input_error' (imagem recusada na preparação), 'low_confidence'
 *      (resposta sem categoria da lista OU resposta VAZIA — corpo 200 sem
 *      conteúdo utilizável, com `error_code: 'EMPTY_RESPONSE'`) e 'provider_error'
 *      (falha de provedor/roteamento). Sem a correção todos estes caminhos
 *      devolviam SOMENTE `{ category: 'outros' }` e eram indistinguíveis;
 *   8. no front (`useMediaLibrary.ts`, reclassificação em lote) a gravação da
 *      categoria fica atrás da checagem de estado: indisponibilidade do modelo
 *      não altera o arquivo para 'outros' como se fosse conclusão.
 */

import { readFileSync } from 'node:fs';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  generateWithRouting,
  type GenerateParams,
} from '../../supabase/functions/_shared/ai-generate.ts';

/**
 * Fonte SEM comentários: o que é garantia não mora em comentário (padrão dos
 * contratos que leem arquivo de app — o runner de contratos é Node e não resolve
 * os imports `@/…` do front).
 */
function semComentarios(codigo: string): string {
  return codigo
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/(^|[^:])\/\/.*$/gm, '$1');
}

// ---------------------------------------------------------------------------
// Constantes do cenário (espelham o desenho congelado do PR-4)
// ---------------------------------------------------------------------------

/** Origem do projeto fictício — casa com o `SUPABASE_URL` do `Deno.env` dublado. */
const SUPABASE_BASE = 'https://projeto.teste.supabase.co';
const BUCKET = 'whatsapp-media';

/** URLs CRUAS enviadas pelo app: objeto do Storage (bucket privado) deste projeto. */
const IMAGEM_EMOJI = `${SUPABASE_BASE}/storage/v1/object/public/${BUCKET}/emoji/feliz.png`;
const IMAGEM_STICKER = `${SUPABASE_BASE}/storage/v1/object/public/${BUCKET}/stickers/figurinha.webp`;

/** Endpoint AUTENTICADO de leitura do objeto (o download NUNCA usa `/object/public/`). */
const DOWNLOAD_EMOJI = `${SUPABASE_BASE}/storage/v1/object/${BUCKET}/emoji/feliz.png`;
const DOWNLOAD_STICKER = `${SUPABASE_BASE}/storage/v1/object/${BUCKET}/stickers/figurinha.webp`;

/**
 * Credenciais fictícias do cenário (R2-INF-022): o que distingue o caminho de
 * USUÁRIO do de SERVIÇO no GET do Storage é exatamente este trio.
 */
const JWT_USUARIO_TESTE = 'jwt-usuario-teste';
const ANON_KEY_FICTICIA = 'anon-key-ficticia';
const SERVICE_ROLE_FICTICIA = 'service-role-ficticia';

/** Teto de imagem embutida (a decisão do Joaquim): 4 MiB. */
const MAX_INLINE_IMAGE_BYTES = 4 * 1024 * 1024;

/** Provedor que DECLARA visão: o OpenRouter (Gemini Flash), is_default = false. */
const ENDPOINT_VISAO = 'https://openrouter.ai/api/v1/chat/completions';
const MODELO_VISAO = 'google/gemini-3.8-flash';

/** Provedor PADRÃO de texto (DeepSeek): jamais pode receber o pedido de visão. */
const ENDPOINT_TEXTO_PADRAO = 'https://api.deepseek.test/v1/chat/completions';
const MODELO_TEXTO_PADRAO = 'deepseek-v4-flash';

/** Modelo fixo do consumidor ANTIGO: não pode reaparecer no corpo da chamada. */
const MODELO_FIXO_ANTIGO = 'google/gemini-2.5-flash-lite';

/** Bytes da imagem servida pelo Storage espião (PNG mínimo, conteúdo irrelevante). */
const PNG_BYTES = new Uint8Array([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
  0x00, 0x00, 0x00, 0x0d, 0x49, 0x48, 0x44, 0x52,
]);
const DATA_URL_EMOJI = `data:image/png;base64,${Buffer.from(PNG_BYTES).toString('base64')}`;

/** Desfecho simulado do PROVEDOR no caso corrente. */
type FetchMode = 'ok' | 'http500' | 'throw';
/** Desfecho simulado do DOWNLOAD da imagem do Storage. */
type ImageMode = 'ok' | 'http404' | 'http403' | 'tooLarge' | 'badType';

interface CapturedCall {
  url: string;
  method: string;
  body: Record<string, unknown> | null;
  /** Headers do `init`, com as chaves em minúsculas (apikey, authorization, ...). */
  headers: Record<string, string>;
}

/** Estado compartilhado entre o teste e as fábricas de mock (hoisted). */
const H = vi.hoisted(() => ({
  /** Linhas de `ai_providers` que o client mockado devolve (FIXTURE de cada caso). */
  rows: [] as Array<Record<string, unknown>>,
  /** Chamadas capturadas do `fetch` espião (download GET e provedor POST). */
  fetchCalls: [] as Array<{
    url: string;
    method: string;
    body: Record<string, unknown> | null;
    headers: Record<string, string>;
  }>,
  /** Handlers registrados via `Deno.serve` (ordem: emoji, depois sticker). */
  servers: [] as Array<(req: Request) => Promise<Response>>,
  /** Desfecho simulado do provedor no caso corrente. */
  fetchMode: 'ok' as FetchMode,
  /** Desfecho simulado do download da imagem no caso corrente. */
  imageMode: 'ok' as ImageMode,
  /** Conteúdo que o provedor devolve (categoria); `null` usa o 200 padrão. */
  providerContent: 'riso' as string | null,
  /**
   * FORMA da resposta 200 do provedor (IA-132 — resposta vazia):
   *   - 'normal':         `choices[0].message.content` traz `providerContent`;
   *   - 'emptyChoices':   `choices: []`;
   *   - 'missingChoices': corpo SEM a chave `choices`;
   *   - 'noContent':      `choices[0].message` existe mas SEM `content`.
   */
  providerShape: 'normal' as 'normal' | 'emptyChoices' | 'missingChoices' | 'noContent',
  /**
   * Identidade que `requireAiIdentityOrService` devolve (R2-INF-022): 'user' é
   * o fluxo de usuário; 'service' é o fluxo interno do webhook do WhatsApp.
   */
  identityKind: 'user' as 'user' | 'service',
}));

type LogEntry = {
  functionName: string;
  userId?: string | null;
  model?: string | null;
  status?: string;
  errorMessage?: string | null;
  metadata?: Record<string, unknown>;
  /**
   * IA-052 — a rota efetiva é entregue ao registrador como CAMPO PRÓPRIO; é ele
   * que monta as chaves de `metadata` (`provider_id`, `purpose`, `modality`, ...)
   * num lugar só, para nenhum chamador ter de lembrar do formato. Este espião
   * observa o contrato de ENTRADA; que as chaves chegam ao insert é provado no
   * teste do registrador (`_shared/ai-usage.test.ts`), com o PostgREST espiado.
   */
  providerId?: string | null;
  providerType?: string | null;
  providerName?: string | null;
  purpose?: string | null;
  modality?: string | null;
  modelRequested?: string | null;
  fallbackUsed?: boolean | null;
};

/** Espião de auditoria: `logAiUsage` real é trocado para provar que é chamado. */
const logSpy = vi.hoisted(() =>
  vi.fn(async (_entry: LogEntry): Promise<void> => undefined),
);

// Fronteira de banco: qualquer URL esm.sh do client Supabase vira este dublê.
vi.mock('https://esm.sh/@supabase/supabase-js@2.87.1', () => ({
  createClient: () => ({
    from: (table: string) => ({
      select: async () => ({ data: table === 'ai_providers' ? H.rows : [], error: null }),
    }),
  }),
}));

// `extractTokenUsage` continua REAL; só o registro de consumo/erro é espiado.
vi.mock('../../supabase/functions/_shared/ai-usage.ts', async (importOriginal) => {
  const real = await importOriginal<Record<string, unknown>>();
  return { ...real, logAiUsage: logSpy };
});

// A identidade de IA é dublada, mas CONFIGURÁVEL (R2-INF-022): o caminho de
// serviço do classify-sticker precisa poder devolver kind:'service' para provar
// que a service role no download é explícita, não fallback.
vi.mock('../../supabase/functions/_shared/ai-auth.ts', () => ({
  requireAiIdentity: async () => ({ kind: 'user', userId: 'usuario-teste' }),
  requireAiIdentityOrService: async () =>
    H.identityKind === 'service'
      ? { kind: 'service', userId: null }
      : { kind: 'user', userId: 'usuario-teste' },
}));

// `Deno.serve` captura o handler do consumidor; `Deno.env.get` resolve segredos fictícios.
vi.stubGlobal('Deno', {
  env: {
    get: (key: string): string | undefined => {
      if (key === 'SUPABASE_URL') return SUPABASE_BASE;
      if (key === 'SUPABASE_SERVICE_ROLE_KEY') return SERVICE_ROLE_FICTICIA;
      if (key === 'SUPABASE_ANON_KEY') return ANON_KEY_FICTICIA;
      return 'segredo-ficticio';
    },
  },
  serve: (handler: (req: Request) => Promise<Response>): void => {
    H.servers.push(handler);
  },
});

/** Resposta do Storage espião para o GET de download, conforme `H.imageMode`. */
function respostaDeImagem(): Response {
  switch (H.imageMode) {
    case 'http404':
      return new Response('nao encontrado', { status: 404 });
    case 'http403':
      return new Response('proibido', { status: 403 });
    case 'tooLarge':
      // Corpo REAL maior que o teto: o limite é CONFIRMADO nos bytes, não só no cabeçalho.
      return new Response(new Uint8Array(MAX_INLINE_IMAGE_BYTES + 1), {
        status: 200,
        headers: { 'content-type': 'image/png' },
      });
    case 'badType':
      return new Response('<html>nao e imagem</html>', {
        status: 200,
        headers: { 'content-type': 'text/html' },
      });
    default:
      return new Response(PNG_BYTES, {
        status: 200,
        headers: { 'content-type': 'image/png' },
      });
  }
}

/**
 * Headers de `init` normalizados em registro com chaves minúsculas — o espião
 * aceita `Headers`, pares e objeto simples (o helper de imagem usa objeto).
 */
function extrairHeaders(init: unknown): Record<string, string> {
  const fonte = (init as { headers?: unknown } | undefined)?.headers;
  const out: Record<string, string> = {};
  if (!fonte) return out;
  if (fonte instanceof Headers) {
    fonte.forEach((valor, chave) => {
      out[chave.toLowerCase()] = valor;
    });
  } else if (Array.isArray(fonte)) {
    for (const [chave, valor] of fonte) out[String(chave).toLowerCase()] = String(valor);
  } else {
    for (const [chave, valor] of Object.entries(fonte as Record<string, unknown>)) {
      out[chave.toLowerCase()] = String(valor);
    }
  }
  return out;
}

beforeEach(() => {
  H.rows = [];
  H.fetchCalls = [];
  H.fetchMode = 'ok';
  H.imageMode = 'ok';
  H.providerContent = 'riso';
  H.providerShape = 'normal';
  H.identityKind = 'user';
  logSpy.mockClear();

  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: unknown, init?: { method?: string; body?: string; headers?: unknown }) => {
      const alvo = String(url);
      const method = String(init?.method ?? 'GET').toUpperCase();
      H.fetchCalls.push({
        url: alvo,
        method,
        body: init?.body === undefined ? null : (JSON.parse(String(init.body)) as Record<string, unknown>),
        headers: extrairHeaders(init),
      });

      // Download AUTENTICADO do Storage: qualquer URL do projeto que não seja o provedor.
      if (alvo.startsWith(`${SUPABASE_BASE}/storage/`)) return respostaDeImagem();

      // Provedor de IA: desfecho controlado por `fetchMode`.
      if (H.fetchMode === 'throw') throw new Error('rede indisponivel');
      if (H.fetchMode === 'http500') {
        return new Response(JSON.stringify({ error: 'provedor fora do ar' }), {
          status: 500,
          headers: { 'content-type': 'application/json' },
        });
      }
      const payload: Record<string, unknown> = {
        model: MODELO_VISAO,
        usage: { prompt_tokens: 7, completion_tokens: 2 },
      };
      // IA-132 — a FORMA da resposta 200 é controlada por `providerShape`: o caso
      // de resposta VAZIA (sem conteúdo utilizável) sai de um destes ramos.
      if (H.providerShape === 'emptyChoices') {
        payload.choices = [];
      } else if (H.providerShape === 'missingChoices') {
        // Corpo 200 SEM a chave `choices`.
      } else if (H.providerShape === 'noContent') {
        payload.choices = [{ message: {} }];
      } else {
        payload.choices = [{ message: { content: H.providerContent } }];
      }
      return new Response(JSON.stringify(payload), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      });
    }),
  );
});

// ---------------------------------------------------------------------------
// Fábricas de fixture e de chamada
// ---------------------------------------------------------------------------

/** Linha de `ai_providers` com defaults válidos; `over` sobrescreve o que importa. */
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

/** DeepSeek: o PADRÃO de TEXTO (is_default = true) — não deve receber visão. */
const deepseekTexto = () =>
  linha({
    id: 'deepseek',
    name: 'DeepSeek',
    model: MODELO_TEXTO_PADRAO,
    is_default: true,
    api_endpoint: ENDPOINT_TEXTO_PADRAO,
    api_key_secret_name: 'DEEPSEEK_API_KEY',
  });

/**
 * Gemini/OpenRouter: provedor de VISÃO. Deliberadamente `is_default = false` e
 * com a modalidade declarada no config — a resolução por modalidade NÃO depende
 * de ser o padrão de texto.
 */
const geminiVisao = () =>
  linha({
    id: 'openrouter-gemini',
    name: 'OpenRouter Gemini',
    model: MODELO_VISAO,
    api_endpoint: ENDPOINT_VISAO,
    api_key_secret_name: 'OPENROUTER_API_KEY',
    config: { capabilities: { modalities: ['vision'] } },
  });

/** Handlers dos dois consumidores reais (carregados UMA vez, em ordem fixa). */
async function handlers(): Promise<{
  emoji: (req: Request) => Promise<Response>;
  sticker: (req: Request) => Promise<Response>;
}> {
  if (H.servers.length === 0) {
    await import('../../supabase/functions/classify-emoji/index.ts');
    await import('../../supabase/functions/classify-sticker/index.ts');
  }
  return { emoji: H.servers[0], sticker: H.servers[1] };
}

/**
 * Headers de um pedido de USUÁRIO: o JWT do chamador é o que a função repassa
 * ao helper de imagem (R2-INF-022) — sem ele o download privado falha fechado.
 */
const HEADERS_USUARIO = {
  'content-type': 'application/json',
  authorization: `Bearer ${JWT_USUARIO_TESTE}`,
};

function pedidoEmoji(): Request {
  return new Request('https://funcao.teste/classify-emoji', {
    method: 'POST',
    headers: HEADERS_USUARIO,
    body: JSON.stringify({ image_url: IMAGEM_EMOJI, file_name: 'feliz.png' }),
  });
}

function pedidoEmojiSemEntrada(): Request {
  return new Request('https://funcao.teste/classify-emoji', {
    method: 'POST',
    headers: HEADERS_USUARIO,
    body: JSON.stringify({}),
  });
}

function pedidoSticker(): Request {
  return new Request('https://funcao.teste/classify-sticker', {
    method: 'POST',
    headers: HEADERS_USUARIO,
    body: JSON.stringify({ image_url: IMAGEM_STICKER }),
  });
}

/** Pedido do fluxo INTERNO: o webhook chama a função com a service role key. */
function pedidoStickerDeServico(): Request {
  return new Request('https://funcao.teste/classify-sticker', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      authorization: `Bearer ${SERVICE_ROLE_FICTICIA}`,
    },
    body: JSON.stringify({ image_url: IMAGEM_STICKER }),
  });
}

function pedidoStickerSemImagem(): Request {
  return new Request('https://funcao.teste/classify-sticker', {
    method: 'POST',
    headers: HEADERS_USUARIO,
    body: JSON.stringify({}),
  });
}

async function corpo(res: Response): Promise<Record<string, unknown>> {
  return (await res.json()) as Record<string, unknown>;
}

/** Chamadas ao PROVEDOR (POST) — separadas do download da imagem (GET). */
const chamadasDeProvedor = (): CapturedCall[] => H.fetchCalls.filter((c) => c.method === 'POST');

/** Downloads da imagem no servidor (GET autenticado no Storage). */
const chamadasDeImagem = (): CapturedCall[] => H.fetchCalls.filter((c) => c.method === 'GET');

/** Chamada direta ao despacho, com defaults de texto; `over` sobrescreve. */
async function despachar(over: Partial<GenerateParams> = {}) {
  return await generateWithRouting({
    purpose: 'tagging',
    functionName: 'classify-emoji',
    userId: 'usuario-teste',
    messages: [{ role: 'user', content: 'oi' }],
    ...over,
  });
}

/**
 * Partes multipart do payload entregue ao provedor. Devolve a parte de imagem
 * (`image_url`) e a de texto, já como ARRAY — se o conteúdo tiver virado string,
 * o teste falha ao indexar.
 */
function partesEnviadas(indice = 0): {
  partes: Array<Record<string, unknown>>;
  urlDeImagem: unknown;
} {
  const chamada = chamadasDeProvedor()[indice];
  expect(chamada, 'deveria existir chamada ao provedor').toBeDefined();
  const mensagens = chamada.body?.messages as Array<{ role: string; content: unknown }>;
  expect(Array.isArray(mensagens[0].content), 'o multipart deve ser ARRAY, nunca string').toBe(true);
  expect(typeof mensagens[0].content).not.toBe('string');
  const partes = mensagens[0].content as Array<Record<string, unknown>>;
  const parteImagem = partes[0] as { image_url?: { url?: unknown } };
  return { partes, urlDeImagem: parteImagem?.image_url?.url };
}

// ---------------------------------------------------------------------------
// (1) A imagem vai EMBUTIDA (data URL) e o download é AUTENTICADO — nunca a URL crua
// ---------------------------------------------------------------------------

describe('(1) visão: imagem embutida em DATA URL, download autenticado e modelo do servidor', () => {
  it('classify-emoji baixa no servidor e envia `data:image/...;base64,...` ao provedor de visão', async () => {
    H.rows = [deepseekTexto(), geminiVisao()];
    const { emoji } = await handlers();

    const res = await emoji(pedidoEmoji());

    expect(res.status).toBe(200);
    expect(await corpo(res)).toEqual({ category: 'riso', state: 'ok' });

    // O download aconteceu no SERVIDOR, no endpoint AUTENTICADO do Storage — e
    // NUNCA na URL pública crua (`/object/public/`).
    const downloads = chamadasDeImagem();
    expect(downloads).toHaveLength(1);
    expect(downloads[0].url).toBe(DOWNLOAD_EMOJI);
    expect(downloads[0].url).not.toBe(IMAGEM_EMOJI);
    expect(downloads[0].url).not.toContain('/object/public/');

    // A chamada ao provedor foi uma só, no provedor que DECLARA visão.
    const doProvedor = chamadasDeProvedor();
    expect(doProvedor).toHaveLength(1);
    expect(doProvedor[0].url).toBe(ENDPOINT_VISAO);
    expect(doProvedor[0].url).not.toBe(ENDPOINT_TEXTO_PADRAO);

    // O modelo é o decidido pelo SERVIDOR (o fixo antigo do consumidor não entra).
    expect(doProvedor[0].body?.model).toBe(MODELO_VISAO);
    expect(doProvedor[0].body?.model).not.toBe(MODELO_FIXO_ANTIGO);
    expect(doProvedor[0].body?.model).not.toBe(MODELO_TEXTO_PADRAO);

    // A parte `image_url` carrega uma DATA URL com EXATAMENTE os bytes baixados —
    // não a URL crua. Se a URL crua voltar ao payload, ESTE teste falha.
    const { partes, urlDeImagem } = partesEnviadas();
    expect(typeof urlDeImagem).toBe('string');
    expect(String(urlDeImagem).startsWith('data:image/')).toBe(true);
    expect(urlDeImagem).toBe(DATA_URL_EMOJI);
    expect(urlDeImagem).not.toBe(IMAGEM_EMOJI);
    expect(String(urlDeImagem)).not.toContain(IMAGEM_EMOJI);

    // As partes seguem íntegras: imagem (objeto) + texto (string).
    expect(partes[1]).toMatchObject({ type: 'text' });
    expect(typeof (partes[1] as { text: unknown }).text).toBe('string');
  });

  it('classify-sticker segue a MESMA rota: data URL embutida e endpoint de visão', async () => {
    H.rows = [deepseekTexto(), geminiVisao()];
    const { sticker } = await handlers();

    const res = await sticker(pedidoSticker());

    expect(res.status).toBe(200);
    expect(await corpo(res)).toEqual({ category: 'riso', state: 'ok' });

    const downloads = chamadasDeImagem();
    expect(downloads).toHaveLength(1);
    expect(downloads[0].url).toBe(DOWNLOAD_STICKER);
    expect(downloads[0].url).not.toContain('/object/public/');

    const doProvedor = chamadasDeProvedor();
    expect(doProvedor).toHaveLength(1);
    expect(doProvedor[0].url).toBe(ENDPOINT_VISAO);
    expect(doProvedor[0].body?.model).toBe(MODELO_VISAO);

    const { urlDeImagem } = partesEnviadas();
    expect(String(urlDeImagem).startsWith('data:image/')).toBe(true);
    expect(String(urlDeImagem)).not.toContain(IMAGEM_STICKER);
  });

  it('o endpoint do provedor de TEXTO padrão NUNCA é chamado quando a modalidade é visão', async () => {
    H.rows = [deepseekTexto(), geminiVisao()];
    const { emoji } = await handlers();

    await emoji(pedidoEmoji());

    expect(chamadasDeProvedor().some((call) => call.url === ENDPOINT_VISAO)).toBe(true);
    expect(chamadasDeProvedor().every((call) => call.url !== ENDPOINT_TEXTO_PADRAO)).toBe(true);
  });

  it('os dois consumidores de visão foram carregados como handlers (Deno.serve)', async () => {
    const { emoji, sticker } = await handlers();
    expect(typeof emoji).toBe('function');
    expect(typeof sticker).toBe('function');
    expect(H.servers).toHaveLength(2);
  });
});

// ---------------------------------------------------------------------------
// (2) Consumo registrado no SUCESSO e no ERRO (nenhuma chamada paga invisível)
// ---------------------------------------------------------------------------

describe('(2) consumo: logAiUsage cobre sucesso, HTTP 500 e exceção', () => {
  it('SUCESSO pelo consumidor: grava o consumo com provider/modelo/purpose do servidor', async () => {
    H.rows = [deepseekTexto(), geminiVisao()];
    const { emoji } = await handlers();

    const res = await emoji(pedidoEmoji());

    expect(res.status).toBe(200);
    expect(await corpo(res)).toEqual({ category: 'riso', state: 'ok' });
    expect(logSpy).toHaveBeenCalledTimes(1);

    const entrada = logSpy.mock.calls[0][0] as LogEntry;
    expect(entrada.functionName).toBe('classify-emoji');
    expect(entrada.status).toBe('success');
    expect(entrada.model).toBe(MODELO_VISAO);
    expect(entrada.providerId).toBe('openrouter-gemini');
    expect(entrada.purpose).toBe('tagging');
  });

  it('ERRO HTTP 500 do provedor: consumo registrado como error', async () => {
    H.rows = [deepseekTexto(), geminiVisao()];
    H.fetchMode = 'http500';
    const { emoji } = await handlers();

    await emoji(pedidoEmoji());

    expect(logSpy).toHaveBeenCalledTimes(1);
    const entrada = logSpy.mock.calls[0][0] as LogEntry;
    expect(entrada.status).toBe('error');
    expect(entrada.errorMessage).toContain('HTTP 500');
    expect(entrada.providerId).toBe('openrouter-gemini');
  });

  it('fetch que LANÇA: consumo registrado como error (a falha de rede também é auditada)', async () => {
    H.rows = [deepseekTexto(), geminiVisao()];
    H.fetchMode = 'throw';
    const { emoji } = await handlers();

    const res = await emoji(pedidoEmoji());

    expect(res.status).toBe(200);
    expect(logSpy).toHaveBeenCalledTimes(1);
    expect((logSpy.mock.calls[0][0] as LogEntry).status).toBe('error');
  });

  it('despacho direto: sucesso E erro (500 e exceção) SEMPRE chamam logAiUsage', async () => {
    H.rows = [deepseekTexto(), geminiVisao()];

    await despachar({ need: { modality: 'vision' } });
    expect(logSpy).toHaveBeenCalledTimes(1);
    expect((logSpy.mock.calls[0][0] as LogEntry).status).toBe('success');

    H.fetchMode = 'http500';
    const res500 = await despachar({ need: { modality: 'vision' } });
    expect(res500.ok).toBe(false);
    expect(res500.status).toBe('error');
    expect(logSpy).toHaveBeenCalledTimes(2);

    H.fetchMode = 'throw';
    let lancou = false;
    try {
      await despachar({ need: { modality: 'vision' } });
    } catch {
      lancou = true;
    }
    expect(lancou, 'falha de rede não pode propagar exceção').toBe(false);
    expect(logSpy).toHaveBeenCalledTimes(3);
    expect((logSpy.mock.calls[2][0] as LogEntry).status).toBe('error');
  });
});

// ---------------------------------------------------------------------------
// (3) Erro HTTP do provedor de visão NÃO estoura — o consumidor degrada
// ---------------------------------------------------------------------------

describe('(3) erro HTTP do provedor de visão: degradação para `outros` (não estoura)', () => {
  it('classify-emoji responde 200 {category: outros} quando o provedor de visão devolve 500', async () => {
    H.rows = [deepseekTexto(), geminiVisao()];
    H.fetchMode = 'http500';
    const { emoji } = await handlers();

    let res!: Response;
    let lancou = false;
    try {
      res = await emoji(pedidoEmoji());
    } catch {
      lancou = true;
    }

    expect(lancou, 'a degradação não pode propagar exceção').toBe(false);
    expect(res.status).toBe(200);
    expect(await corpo(res)).toEqual({ category: 'outros', state: 'provider_error', error_code: 'PROVIDER_ERROR' });
    // A tentativa foi ao provedor de VISÃO — e nunca ao de texto.
    expect(chamadasDeProvedor().some((call) => call.url === ENDPOINT_VISAO)).toBe(true);
    expect(chamadasDeProvedor().every((call) => call.url !== ENDPOINT_TEXTO_PADRAO)).toBe(true);
  });

  it('classify-sticker também degrada para outros no erro HTTP (mesma rota de visão)', async () => {
    H.rows = [deepseekTexto(), geminiVisao()];
    H.fetchMode = 'http500';
    const { sticker } = await handlers();

    const res = await sticker(pedidoSticker());

    expect(res.status).toBe(200);
    expect(await corpo(res)).toEqual({ category: 'outros', state: 'provider_error', error_code: 'PROVIDER_ERROR' });
    expect(chamadasDeProvedor().every((call) => call.url !== ENDPOINT_TEXTO_PADRAO)).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// (4) Sem provedor que declare visão: falha FECHADA e nada vai ao texto
// ---------------------------------------------------------------------------

describe('(4) visão sem candidato: NO_PROVIDER e nada enviado ao provedor de texto', () => {
  it('classify-emoji degrada para outros SEM chamar provedor (não vaza ao DeepSeek)', async () => {
    H.rows = [deepseekTexto()]; // nenhum provedor declara visão
    const { emoji } = await handlers();

    const res = await emoji(pedidoEmoji());

    expect(res.status).toBe(200);
    expect(await corpo(res)).toEqual({ category: 'outros', state: 'provider_error', error_code: 'NO_PROVIDER' });
    // NENHUMA chamada ao PROVEDOR (o download da imagem ainda pode ocorrer antes).
    expect(chamadasDeProvedor()).toHaveLength(0);
    expect(chamadasDeProvedor().every((call) => call.url !== ENDPOINT_TEXTO_PADRAO)).toBe(true);
  });

  it('despacho direto: visão sem candidato → errorCode NO_PROVIDER (503), sem fetch', async () => {
    H.rows = [deepseekTexto()];

    const res = await despachar({ need: { modality: 'vision' } });

    expect(res.ok).toBe(false);
    expect(res.errorCode).toBe('NO_PROVIDER');
    expect(res.response.status).toBe(503);
    expect(H.fetchCalls).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// (5) Imagem grande demais (> 4 MiB): degrada para `outros` COM registro
// ---------------------------------------------------------------------------

describe('(5) imagem acima do teto (4 MiB): 200 {outros} e registro do motivo', () => {
  it('classify-emoji recusa a imagem grande e registra IMAGE_TOO_LARGE', async () => {
    H.rows = [deepseekTexto(), geminiVisao()];
    H.imageMode = 'tooLarge';
    const { emoji } = await handlers();

    const res = await emoji(pedidoEmoji());

    expect(res.status).toBe(200);
    expect(await corpo(res)).toEqual({ category: 'outros', state: 'input_error', error_code: 'IMAGE_TOO_LARGE' });

    // A imagem é recusada ANTES de virar payload: nenhuma chamada ao provedor.
    expect(chamadasDeProvedor()).toHaveLength(0);

    // O motivo ficou registrado (fim do fallback silencioso).
    expect(logSpy).toHaveBeenCalledTimes(1);
    const entrada = logSpy.mock.calls[0][0] as LogEntry;
    expect(entrada.functionName).toBe('classify-emoji');
    expect(entrada.status).toBe('error');
    expect(entrada.metadata?.reason).toBe('image_input_failed');
    expect(entrada.metadata?.image_error_code).toBe('IMAGE_TOO_LARGE');
    expect(entrada.metadata?.image_limit_bytes).toBe(MAX_INLINE_IMAGE_BYTES);
    expect(entrada.metadata?.image_bytes).toBeGreaterThan(MAX_INLINE_IMAGE_BYTES);
  });

  it('classify-sticker também recusa a imagem grande e registra o motivo', async () => {
    H.rows = [deepseekTexto(), geminiVisao()];
    H.imageMode = 'tooLarge';
    const { sticker } = await handlers();

    const res = await sticker(pedidoSticker());

    expect(res.status).toBe(200);
    expect(await corpo(res)).toEqual({ category: 'outros', state: 'input_error', error_code: 'IMAGE_TOO_LARGE' });
    expect(chamadasDeProvedor()).toHaveLength(0);

    expect(logSpy).toHaveBeenCalledTimes(1);
    const entrada = logSpy.mock.calls[0][0] as LogEntry;
    expect(entrada.functionName).toBe('classify-sticker');
    expect(entrada.status).toBe('error');
    expect(entrada.metadata?.image_error_code).toBe('IMAGE_TOO_LARGE');
  });
});

// ---------------------------------------------------------------------------
// (6) Falha do Storage (404/403): degrada para `outros` COM registro
// ---------------------------------------------------------------------------

describe('(6) falha do Storage (404/403): 200 {outros} e registro do motivo', () => {
  for (const [status, modo] of [[404, 'http404'], [403, 'http403']] as const) {
    it(`Storage responde HTTP ${status}: degrada para outros e registra IMAGE_DOWNLOAD_FAILED`, async () => {
      H.rows = [deepseekTexto(), geminiVisao()];
      H.imageMode = modo;
      const { sticker } = await handlers();

      const res = await sticker(pedidoSticker());

      expect(res.status).toBe(200);
      expect(await corpo(res)).toEqual({ category: 'outros', state: 'input_error', error_code: 'IMAGE_DOWNLOAD_FAILED' });

      // Houve a TENTATIVA de baixar (GET) e nenhuma chamada ao provedor.
      expect(chamadasDeImagem()).toHaveLength(1);
      expect(chamadasDeProvedor()).toHaveLength(0);

      expect(logSpy).toHaveBeenCalledTimes(1);
      const entrada = logSpy.mock.calls[0][0] as LogEntry;
      expect(entrada.functionName).toBe('classify-sticker');
      expect(entrada.status).toBe('error');
      expect(entrada.metadata?.reason).toBe('image_input_failed');
      expect(entrada.metadata?.image_error_code).toBe('IMAGE_DOWNLOAD_FAILED');
    });
  }

  it('classify-emoji: mesma degradação registrada na falha do Storage', async () => {
    H.rows = [deepseekTexto(), geminiVisao()];
    H.imageMode = 'http404';
    const { emoji } = await handlers();

    const res = await emoji(pedidoEmoji());

    expect(res.status).toBe(200);
    expect(await corpo(res)).toEqual({ category: 'outros', state: 'input_error', error_code: 'IMAGE_DOWNLOAD_FAILED' });
    expect(logSpy).toHaveBeenCalledTimes(1);
    expect((logSpy.mock.calls[0][0] as LogEntry).metadata?.image_error_code).toBe('IMAGE_DOWNLOAD_FAILED');
  });

  it('content-type não-imagem também degrada e registra IMAGE_TYPE_INVALID', async () => {
    H.rows = [deepseekTexto(), geminiVisao()];
    H.imageMode = 'badType';
    const { emoji } = await handlers();

    const res = await emoji(pedidoEmoji());

    expect(res.status).toBe(200);
    expect(await corpo(res)).toEqual({ category: 'outros', state: 'input_error', error_code: 'IMAGE_TYPE_INVALID' });
    expect(logSpy).toHaveBeenCalledTimes(1);
    expect((logSpy.mock.calls[0][0] as LogEntry).metadata?.image_error_code).toBe('IMAGE_TYPE_INVALID');
  });
});

// ---------------------------------------------------------------------------
// (7) ASSERÇÃO CENTRAL: nenhum caminho que devolva 'outros' sem registro
// ---------------------------------------------------------------------------

describe('(7) central: NENHUM caminho que devolva `outros` termina sem registro de uso/erro', () => {
  /**
   * Cada cenário devolve `{ category: 'outros' }` (200). A decisão do Joaquim é
   * que TODOS deixem linha em `ai_usage_logs` — o fallback silencioso acabou.
   */
  const cenarios: Array<{
    nome: string;
    preparar: () => void;
    chamar: () => Promise<Response>;
    /** IA-132 — o ESTADO que aquele caminho precisa declarar. */
    estado: string;
    /** IA-132 — o motivo técnico que acompanha o estado. */
    codigo: string;
  }> = [
    {
      nome: "sticker sem image_url (entrada vazia)", estado: 'unknown', codigo: 'MISSING_INPUT',
      preparar: () => { H.rows = [deepseekTexto(), geminiVisao()]; },
      chamar: async () => (await handlers()).sticker(pedidoStickerSemImagem()),
    },
    {
      nome: "emoji sem image_url e sem file_name (entrada vazia)", estado: 'unknown', codigo: 'MISSING_INPUT',
      preparar: () => { H.rows = [deepseekTexto(), geminiVisao()]; },
      chamar: async () => (await handlers()).emoji(pedidoEmojiSemEntrada()),
    },
    {
      nome: 'imagem grande demais (> 4 MiB)', estado: 'input_error', codigo: 'IMAGE_TOO_LARGE',
      preparar: () => { H.rows = [deepseekTexto(), geminiVisao()]; H.imageMode = 'tooLarge'; },
      chamar: async () => (await handlers()).sticker(pedidoSticker()),
    },
    {
      nome: 'Storage responde 403', estado: 'input_error', codigo: 'IMAGE_DOWNLOAD_FAILED',
      preparar: () => { H.rows = [deepseekTexto(), geminiVisao()]; H.imageMode = 'http403'; },
      chamar: async () => (await handlers()).emoji(pedidoEmoji()),
    },
    {
      nome: 'provedor de visão responde HTTP 500', estado: 'provider_error', codigo: 'PROVIDER_ERROR',
      preparar: () => { H.rows = [deepseekTexto(), geminiVisao()]; H.fetchMode = 'http500'; },
      chamar: async () => (await handlers()).emoji(pedidoEmoji()),
    },
    {
      nome: 'provedor LANÇA na rede', estado: 'provider_error', codigo: 'PROVIDER_ERROR',
      preparar: () => { H.rows = [deepseekTexto(), geminiVisao()]; H.fetchMode = 'throw'; },
      chamar: async () => (await handlers()).sticker(pedidoSticker()),
    },
    {
      nome: 'nenhum provedor declara visão (NO_PROVIDER)', estado: 'provider_error', codigo: 'NO_PROVIDER',
      preparar: () => { H.rows = [deepseekTexto()]; },
      chamar: async () => (await handlers()).emoji(pedidoEmoji()),
    },
    {
      nome: 'provedor devolve categoria fora da lista', estado: 'low_confidence', codigo: 'INVALID_CATEGORY',
      preparar: () => { H.rows = [deepseekTexto(), geminiVisao()]; H.providerContent = 'categoria-inventada'; },
      chamar: async () => (await handlers()).emoji(pedidoEmoji()),
    },
    {
      nome: 'provedor responde conteudo VAZIO - sticker', estado: 'low_confidence', codigo: 'EMPTY_RESPONSE',
      preparar: () => { H.rows = [deepseekTexto(), geminiVisao()]; H.providerContent = ''; },
      chamar: async () => (await handlers()).sticker(pedidoSticker()),
    },
    {
      nome: 'provedor responde conteudo VAZIO - emoji (so espacos)', estado: 'low_confidence', codigo: 'EMPTY_RESPONSE',
      preparar: () => { H.rows = [deepseekTexto(), geminiVisao()]; H.providerContent = '   '; },
      chamar: async () => (await handlers()).emoji(pedidoEmoji()),
    },
    {
      nome: 'provedor responde choices vazio', estado: 'low_confidence', codigo: 'EMPTY_RESPONSE',
      preparar: () => { H.rows = [deepseekTexto(), geminiVisao()]; H.providerShape = 'emptyChoices'; },
      chamar: async () => (await handlers()).sticker(pedidoSticker()),
    },
    {
      nome: 'provedor responde sem choices', estado: 'low_confidence', codigo: 'EMPTY_RESPONSE',
      preparar: () => { H.rows = [deepseekTexto(), geminiVisao()]; H.providerShape = 'missingChoices'; },
      chamar: async () => (await handlers()).emoji(pedidoEmoji()),
    },
    {
      nome: 'provedor responde item sem message.content', estado: 'low_confidence', codigo: 'EMPTY_RESPONSE',
      preparar: () => { H.rows = [deepseekTexto(), geminiVisao()]; H.providerShape = 'noContent'; },
      chamar: async () => (await handlers()).sticker(pedidoSticker()),
    },
  ];

  for (const cenario of cenarios) {
    it(`registra uso/erro — ${cenario.nome}`, async () => {
      logSpy.mockClear();
      H.fetchCalls = [];
      H.fetchMode = 'ok';
      H.imageMode = 'ok';
      H.providerContent = 'riso';
      H.providerShape = 'normal';
      cenario.preparar();

      const res = await cenario.chamar();

      expect(res.status).toBe(200);
      // IA-132: o MESMO `category: 'outros'` sai com o estado do caminho — antes
      // da correção todos estes cenários devolviam só `{ category: 'outros' }`.
      expect(await corpo(res)).toEqual({
        category: 'outros',
        state: cenario.estado,
        error_code: cenario.codigo,
      });
      expect(
        logSpy.mock.calls.length,
        'devolver `outros` sem linha em ai_usage_logs é o fallback silencioso que a decisão proíbe',
      ).toBeGreaterThan(0);
    });
  }

  it('o caminho de SUCESSO do mesmo consumidor registra consumo (controle)', async () => {
    H.rows = [deepseekTexto(), geminiVisao()];
    const { emoji } = await handlers();

    const res = await emoji(pedidoEmoji());

    expect(await corpo(res)).toEqual({ category: 'riso', state: 'ok' });
    expect(logSpy).toHaveBeenCalledTimes(1);
    expect((logSpy.mock.calls[0][0] as LogEntry).status).toBe('success');
  });
});

// ---------------------------------------------------------------------------
// (8) Controle: texto puro segue no provedor padrão (a modalidade é o desvio)
// ---------------------------------------------------------------------------

describe('(8) controle: texto puro continua no provedor padrão (DeepSeek)', () => {
  it('sem `need`, o despacho vai ao DeepSeek — visão NÃO é o caminho padrão', async () => {
    H.rows = [deepseekTexto(), geminiVisao()];

    const res = await despachar();

    expect(res.providerId).toBe('deepseek');
    expect(chamadasDeProvedor()[0].url).toBe(ENDPOINT_TEXTO_PADRAO);
    expect(chamadasDeProvedor()[0].body?.model).toBe(MODELO_TEXTO_PADRAO);
    expect(chamadasDeProvedor().every((call) => call.url !== ENDPOINT_VISAO)).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// (9) Identidade do download do Storage (R2-INF-022): usuário nunca vaza service role
// ---------------------------------------------------------------------------

describe('(9) identidade do download: usuário → anon key + JWT; serviço → service role explícita', () => {
  it('classify-emoji (usuário): GET do Storage usa anon key + JWT do chamador — NUNCA service role', async () => {
    H.rows = [deepseekTexto(), geminiVisao()];
    const { emoji } = await handlers();

    const res = await emoji(pedidoEmoji());

    expect(res.status).toBe(200);
    const downloads = chamadasDeImagem();
    expect(downloads).toHaveLength(1);
    const headers = downloads[0].headers;
    // A identidade do CHAMADOR desce ao Storage: a policy de storage.objects decide.
    expect(headers['apikey']).toBe(ANON_KEY_FICTICIA);
    expect(headers['authorization']).toBe(`Bearer ${JWT_USUARIO_TESTE}`);
    // A service role NUNCA aparece no caminho de usuário.
    expect(headers['apikey']).not.toBe(SERVICE_ROLE_FICTICIA);
    expect(headers['authorization']).not.toBe(`Bearer ${SERVICE_ROLE_FICTICIA}`);
  });

  it('classify-sticker (usuário): idem — anon key + JWT, nunca service role', async () => {
    H.rows = [deepseekTexto(), geminiVisao()];
    const { sticker } = await handlers();

    const res = await sticker(pedidoSticker());

    expect(res.status).toBe(200);
    const downloads = chamadasDeImagem();
    expect(downloads).toHaveLength(1);
    const headers = downloads[0].headers;
    expect(headers['apikey']).toBe(ANON_KEY_FICTICIA);
    expect(headers['authorization']).toBe(`Bearer ${JWT_USUARIO_TESTE}`);
    expect(headers['apikey']).not.toBe(SERVICE_ROLE_FICTICIA);
    expect(headers['authorization']).not.toBe(`Bearer ${SERVICE_ROLE_FICTICIA}`);
  });

  it('classify-sticker (serviço, webhook): GET usa service role EXPLÍCITA — não fallback', async () => {
    H.identityKind = 'service';
    H.rows = [deepseekTexto(), geminiVisao()];
    const { sticker } = await handlers();

    const res = await sticker(pedidoStickerDeServico());

    expect(res.status).toBe(200);
    const downloads = chamadasDeImagem();
    expect(downloads).toHaveLength(1);
    const headers = downloads[0].headers;
    // O fluxo interno do webhook baixa com a service role do AMBIENTE — se o
    // chamador tivesse repassado o bearer do pedido como token de usuário, o
    // apikey seria a anon key e esta asserção falharia.
    expect(headers['apikey']).toBe(SERVICE_ROLE_FICTICIA);
    expect(headers['authorization']).toBe(`Bearer ${SERVICE_ROLE_FICTICIA}`);
  });
});

// ---------------------------------------------------------------------------
// (10) IA-132: categoria e falha técnica são ESTADOS distintos
// ---------------------------------------------------------------------------

describe('(10) IA-132: o estado separa conclusão, desconhecido, baixa confiança e falha técnica', () => {
  /**
   * Roda um caso com o estado do mock ZERADO (nenhum vazamento do caso anterior)
   * e devolve o corpo JSON que o consumidor REAL respondeu.
   */
  async function desfecho(caso: {
    preparar: () => void;
    chamar: (h: {
      emoji: (r: Request) => Promise<Response>;
      sticker: (r: Request) => Promise<Response>;
    }) => Promise<Response>;
  }): Promise<Record<string, unknown>> {
    logSpy.mockClear();
    H.fetchCalls = [];
    H.fetchMode = 'ok';
    H.imageMode = 'ok';
    H.providerContent = 'riso';
    H.providerShape = 'normal';
    H.identityKind = 'user';
    caso.preparar();
    const h = await handlers();
    return await corpo(await caso.chamar(h));
  }

  it('entrada ausente → `unknown` (não é falha de provedor)', async () => {
    const sticker = await desfecho({
      preparar: () => { H.rows = [deepseekTexto(), geminiVisao()]; },
      chamar: (h) => h.sticker(pedidoStickerSemImagem()),
    });
    expect(sticker).toEqual({ category: 'outros', state: 'unknown', error_code: 'MISSING_INPUT' });

    const emoji = await desfecho({
      preparar: () => { H.rows = [deepseekTexto(), geminiVisao()]; },
      chamar: (h) => h.emoji(pedidoEmojiSemEntrada()),
    });
    expect(emoji).toEqual({ category: 'outros', state: 'unknown', error_code: 'MISSING_INPUT' });
  });

  it('imagem recusada na preparação → `input_error` com o código TIPADO do motivo', async () => {
    const grande = await desfecho({
      preparar: () => { H.rows = [deepseekTexto(), geminiVisao()]; H.imageMode = 'tooLarge'; },
      chamar: (h) => h.sticker(pedidoSticker()),
    });
    expect(grande).toEqual({ category: 'outros', state: 'input_error', error_code: 'IMAGE_TOO_LARGE' });

    const negada = await desfecho({
      preparar: () => { H.rows = [deepseekTexto(), geminiVisao()]; H.imageMode = 'http403'; },
      chamar: (h) => h.emoji(pedidoEmoji()),
    });
    expect(negada).toEqual({ category: 'outros', state: 'input_error', error_code: 'IMAGE_DOWNLOAD_FAILED' });

    const tipoRuim = await desfecho({
      preparar: () => { H.rows = [deepseekTexto(), geminiVisao()]; H.imageMode = 'badType'; },
      chamar: (h) => h.sticker(pedidoSticker()),
    });
    expect(tipoRuim).toEqual({ category: 'outros', state: 'input_error', error_code: 'IMAGE_TYPE_INVALID' });
  });

  it('provedor/roteamento → `provider_error` (HTTP 500, rede e NO_PROVIDER)', async () => {
    const http500 = await desfecho({
      preparar: () => { H.rows = [deepseekTexto(), geminiVisao()]; H.fetchMode = 'http500'; },
      chamar: (h) => h.sticker(pedidoSticker()),
    });
    expect(http500).toEqual({ category: 'outros', state: 'provider_error', error_code: 'PROVIDER_ERROR' });

    const rede = await desfecho({
      preparar: () => { H.rows = [deepseekTexto(), geminiVisao()]; H.fetchMode = 'throw'; },
      chamar: (h) => h.emoji(pedidoEmoji()),
    });
    expect(rede).toEqual({ category: 'outros', state: 'provider_error', error_code: 'PROVIDER_ERROR' });

    const semCandidato = await desfecho({
      preparar: () => { H.rows = [deepseekTexto()]; },
      chamar: (h) => h.sticker(pedidoSticker()),
    });
    expect(semCandidato).toEqual({ category: 'outros', state: 'provider_error', error_code: 'NO_PROVIDER' });
  });

  it('resposta sem categoria da lista → `low_confidence` (não é o `outros` concluído)', async () => {
    const inventada = await desfecho({
      preparar: () => { H.rows = [deepseekTexto(), geminiVisao()]; H.providerContent = 'categoria-inventada'; },
      chamar: (h) => h.emoji(pedidoEmoji()),
    });
    expect(inventada).toEqual({ category: 'outros', state: 'low_confidence', error_code: 'INVALID_CATEGORY' });
  });

  it('resposta VAZIA do provedor → `low_confidence`/EMPTY_RESPONSE (nunca `outros` concluido)', async () => {
    // CENTRAL: provedor 200 sem conteudo utilizavel NAO pode virar `{ outros, ok }`.
    // Se o codigo voltar a `(content || 'outros')`, estes casos ficam VERMELHOS
    // (sairia `{ category: 'outros', state: 'ok' }`).
    const vazioSticker = await desfecho({
      preparar: () => { H.rows = [deepseekTexto(), geminiVisao()]; H.providerContent = ''; },
      chamar: (h) => h.sticker(pedidoSticker()),
    });
    expect(vazioSticker).toEqual({ category: 'outros', state: 'low_confidence', error_code: 'EMPTY_RESPONSE' });

    const brancoEmoji = await desfecho({
      preparar: () => { H.rows = [deepseekTexto(), geminiVisao()]; H.providerContent = '  \n  '; },
      chamar: (h) => h.emoji(pedidoEmoji()),
    });
    expect(brancoEmoji).toEqual({ category: 'outros', state: 'low_confidence', error_code: 'EMPTY_RESPONSE' });

    const semContent = await desfecho({
      preparar: () => { H.rows = [deepseekTexto(), geminiVisao()]; H.providerShape = 'noContent'; },
      chamar: (h) => h.sticker(pedidoSticker()),
    });
    expect(semContent).toEqual({ category: 'outros', state: 'low_confidence', error_code: 'EMPTY_RESPONSE' });

    const choicesVazio = await desfecho({
      preparar: () => { H.rows = [deepseekTexto(), geminiVisao()]; H.providerShape = 'emptyChoices'; },
      chamar: (h) => h.emoji(pedidoEmoji()),
    });
    expect(choicesVazio).toEqual({ category: 'outros', state: 'low_confidence', error_code: 'EMPTY_RESPONSE' });

    const semChoices = await desfecho({
      preparar: () => { H.rows = [deepseekTexto(), geminiVisao()]; H.providerShape = 'missingChoices'; },
      chamar: (h) => h.sticker(pedidoSticker()),
    });
    expect(semChoices).toEqual({ category: 'outros', state: 'low_confidence', error_code: 'EMPTY_RESPONSE' });
  });

  it('`outros` EXPLICITO do modelo continua sendo conclusao valida (`ok`) - controle', async () => {
    const explicitoSticker = await desfecho({
      preparar: () => { H.rows = [deepseekTexto(), geminiVisao()]; H.providerContent = 'outros'; },
      chamar: (h) => h.sticker(pedidoSticker()),
    });
    expect(explicitoSticker).toEqual({ category: 'outros', state: 'ok' });

    const explicitoEmoji = await desfecho({
      preparar: () => { H.rows = [deepseekTexto(), geminiVisao()]; H.providerContent = 'outros'; },
      chamar: (h) => h.emoji(pedidoEmoji()),
    });
    expect(explicitoEmoji).toEqual({ category: 'outros', state: 'ok' });
  });

  it("ACEITE IA-132: indisponibilidade do modelo não é 'outros' como conclusão", async () => {
    // O modelo RESPONDENDO 'outros' é conclusão válida…
    const concluido = await desfecho({
      preparar: () => { H.rows = [deepseekTexto(), geminiVisao()]; H.providerContent = 'outros'; },
      chamar: (h) => h.emoji(pedidoEmoji()),
    });
    expect(concluido).toEqual({ category: 'outros', state: 'ok' });

    // …e o modelo INDISPONÍVEL é falha técnica: MESMA categoria, estado diferente.
    const indisponivel = await desfecho({
      preparar: () => { H.rows = [deepseekTexto(), geminiVisao()]; H.fetchMode = 'http500'; },
      chamar: (h) => h.emoji(pedidoEmoji()),
    });
    expect(indisponivel.category).toBe('outros');
    expect(indisponivel.state).toBe('provider_error');
    expect(indisponivel.state).not.toBe(concluido.state);
  });
});

// ---------------------------------------------------------------------------
// (11) IA-132 no FRONT: reclassificação em lote só grava conclusão válida
// ---------------------------------------------------------------------------

describe('(11) IA-132 no front: `useMediaLibrary` não grava `outros` de falha técnica', () => {
  /**
   * O runner de contratos roda em Node e não resolve os imports de app (`@/…`),
   * então o hook não pode ser importado aqui; a garantia é conferida no FONTE
   * real — o mesmo padrão de `notification-sound-persistence.contract.test.ts`.
   */
  const CAMINHO_FRONT = 'src/components/settings/media-library/useMediaLibrary.ts';

  it('a checagem de estado vem ANTES da gravação e o caminho antigo não voltou', () => {
    const fonte = semComentarios(readFileSync(CAMINHO_FRONT, 'utf8'));
    const iChecaEstado = fonte.indexOf("resposta.state !== 'ok'");
    const iGrava = fonte.indexOf('await supabase.from(type).update({ category: categoria })');
    expect(iChecaEstado, 'o hook precisa checar o `state` da resposta do classificador').toBeGreaterThan(-1);
    expect(iGrava, 'o hook precisa continuar gravando a categoria válida').toBeGreaterThan(-1);
    expect(iChecaEstado, 'a checagem de estado precisa vir antes da gravação').toBeLessThan(iGrava);
    // O caminho antigo (gravar `data.category` sem olhar o estado) NÃO pode voltar.
    expect(fonte).not.toContain('data.category');
  });
});
