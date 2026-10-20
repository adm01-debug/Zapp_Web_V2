/**
 * Contrato IA-131 — o classificador de áudio-meme passa a classificar pelo
 * CONTEÚDO SONORO (áudio autorizado do Storage), não só pelo nome/URL.
 *
 * Defeito provado aqui (finding IA-AUDIO-001): o handler montava o prompt apenas
 * com `file_name`/`audio_url` e chamava o provedor de TEXTO — a categoria
 * refletia metadados, e a resposta não dizia de onde veio a classificação. O
 * aceite do IA-131 exige o oposto:
 *   1. o som chega ao provedor EMBUTIDO (`input_audio.data` em base64) e o
 *      download é AUTENTICADO no Storage (`/storage/v1/object/<bucket>/<path>`),
 *      nunca a URL pública do objeto;
 *   2. quando só há metadados (sem `audio_url`), a resposta é ROTULADA como
 *      classificação por metadados (limitada) — o classificador não afirma ter
 *      ouvido um arquivo que só teve o nome;
 *   3. falha técnica NÃO vira categoria: fica registrada em `degraded`/
 *      `error_code`, e o mesmo nome com conteúdo diferente é distinguido quando
 *      o critério pede conteúdo (o payload carrega os bytes de cada áudio).
 *
 * Fronteiras de I/O são dubladas (mesmo padrão de
 * `ai-vision-classifiers-mock.contract.test.ts`), nunca a lógica: client Supabase
 * vira fixture de `ai_providers`, `Deno.env.get` devolve segredos fictícios,
 * `Deno.serve` captura o handler, `logAiUsage` é espião e `globalThis.fetch` é o
 * espião duplo (GET do Storage + POST do provedor).
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { generateWithRouting, type GenerateParams } from '../../supabase/functions/_shared/ai-generate.ts';
import {
  AiAudioInputError,
  ALLOWED_AUDIO_BUCKETS,
  MAX_INLINE_AUDIO_BYTES,
  toInlineAudio,
} from '../../supabase/functions/_shared/ai-audio-input.ts';

// ---------------------------------------------------------------------------
// Constantes do cenário
// ---------------------------------------------------------------------------

const SUPABASE_BASE = 'https://projeto.teste.supabase.co';
const BUCKET = 'audio-memes';

/** URL pública do objeto (o que o app manda hoje). */
const MEME_PUBLIC_URL = `${SUPABASE_BASE}/storage/v1/object/public/${BUCKET}/meme_1_risada.mp3`;
/** Endpoint AUTENTICADO de leitura do objeto (o download NUNCA usa `/object/public/`). */
const MEME_DOWNLOAD_URL = `${SUPABASE_BASE}/storage/v1/object/${BUCKET}/meme_1_risada.mp3`;
const MEME2_PUBLIC_URL = `${SUPABASE_BASE}/storage/v1/object/public/${BUCKET}/meme_2_risada.mp3`;
const MEME2_DOWNLOAD_URL = `${SUPABASE_BASE}/storage/v1/object/${BUCKET}/meme_2_risada.mp3`;

const JWT_USUARIO_TESTE = 'jwt-usuario-teste';
const ANON_KEY_FICTICIA = 'anon-key-ficticia';
const SERVICE_ROLE_FICTICIA = 'service-role-ficticia';

/** Provedor que DECLARA as modalidades de imagem e áudio (OpenRouter/Gemini). */
const ENDPOINT_AUDIO = 'https://openrouter.ai/api/v1/chat/completions';
const MODELO_AUDIO = 'google/gemini-3.8-flash';

/** Provedor PADRÃO de texto (DeepSeek): só pode receber o modo por metadados. */
const ENDPOINT_TEXTO_PADRAO = 'https://api.deepseek.test/v1/chat/completions';
const MODELO_TEXTO_PADRAO = 'deepseek-v4-flash';

/** Bytes servidos pelo Storage espião (cabeçalho ID3 — conteúdo irrelevante). */
const MP3_BYTES = new Uint8Array([0x49, 0x44, 0x33, 0x03, 0x00, 0x00, 0x00, 0x00, 0x21, 0x54, 0x49, 0x54]);
const MP3_BYTES_2 = new Uint8Array([0x49, 0x44, 0x33, 0x03, 0x00, 0x00, 0x00, 0x00, 0x21, 0x54, 0x49, 0x55]);
const BASE64_MEME_1 = Buffer.from(MP3_BYTES).toString('base64');
const BASE64_MEME_2 = Buffer.from(MP3_BYTES_2).toString('base64');

type FetchMode = 'ok' | 'http500' | 'throw';
type AudioMode = 'ok' | 'ok2' | 'http404' | 'badType' | 'ogg' | 'tooLarge';

interface CapturedCall {
  url: string;
  method: string;
  body: Record<string, unknown> | null;
  headers: Record<string, string>;
}

const H = vi.hoisted(() => ({
  rows: [] as Array<Record<string, unknown>>,
  fetchCalls: [] as Array<{
    url: string;
    method: string;
    body: Record<string, unknown> | null;
    headers: Record<string, string>;
  }>,
  servers: [] as Array<(req: Request) => Promise<Response>>,
  fetchMode: 'ok' as 'ok' | 'http500' | 'throw',
  audioMode: 'ok' as 'ok' | 'ok2' | 'http404' | 'badType' | 'ogg' | 'tooLarge',
  /** Respostas do provedor, consumidas em ordem (permite "mesmo nome, conteúdos diferentes"). */
  contents: ['risada'] as Array<string | null>,
}));

type LogEntry = {
  functionName: string;
  userId?: string | null;
  status?: string;
  errorMessage?: string | null;
  purpose?: string | null;
  modality?: string | null;
  metadata?: Record<string, unknown>;
};

const logSpy = vi.hoisted(() => vi.fn(async (_entry: LogEntry): Promise<void> => undefined));

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

// Identidade de IA dublada: o classificador é endpoint de USUÁRIO.
vi.mock('../../supabase/functions/_shared/ai-auth.ts', () => ({
  requireAiIdentity: async () => ({ kind: 'user', userId: 'usuario-teste' }),
  requireAiIdentityOrService: async () => ({ kind: 'user', userId: 'usuario-teste' }),
}));

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

/** Resposta do Storage espião para o GET de download, conforme `H.audioMode`. */
function respostaDeAudio(): Response {
  switch (H.audioMode) {
    case 'http404':
      return new Response('nao encontrado', { status: 404 });
    case 'badType':
      return new Response('<html>nao e audio</html>', {
        status: 200,
        headers: { 'content-type': 'text/html' },
      });
    case 'ogg':
      return new Response(MP3_BYTES, {
        status: 200,
        headers: { 'content-type': 'audio/ogg' },
      });
    case 'tooLarge':
      return new Response(new Uint8Array(MAX_INLINE_AUDIO_BYTES + 1), {
        status: 200,
        headers: { 'content-type': 'audio/mpeg' },
      });
    case 'ok2':
      return new Response(MP3_BYTES_2, {
        status: 200,
        headers: { 'content-type': 'audio/mpeg' },
      });
    default:
      return new Response(MP3_BYTES, {
        status: 200,
        headers: { 'content-type': 'audio/mpeg' },
      });
  }
}

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
  H.audioMode = 'ok';
  H.contents = ['risada'];
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

      // Download AUTENTICADO do Storage.
      if (alvo.startsWith(`${SUPABASE_BASE}/storage/`)) return respostaDeAudio();

      // Provedor de IA: desfecho controlado por `fetchMode`; conteúdo por ordem.
      if (H.fetchMode === 'throw') throw new Error('rede indisponivel');
      if (H.fetchMode === 'http500') {
        return new Response(JSON.stringify({ error: 'provedor fora do ar' }), {
          status: 500,
          headers: { 'content-type': 'application/json' },
        });
      }
      const conteudo = H.contents.length > 1 ? H.contents.shift() : H.contents[0];
      return new Response(
        JSON.stringify({
          model: MODELO_AUDIO,
          choices: [{ message: { content: conteudo } }],
          usage: { prompt_tokens: 9, completion_tokens: 2 },
        }),
        { status: 200, headers: { 'content-type': 'application/json' } },
      );
    }),
  );
});

// ---------------------------------------------------------------------------
// Fábricas
// ---------------------------------------------------------------------------

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

const deepseekTexto = () =>
  linha({
    id: 'deepseek',
    name: 'DeepSeek',
    model: MODELO_TEXTO_PADRAO,
    is_default: true,
    api_endpoint: ENDPOINT_TEXTO_PADRAO,
    api_key_secret_name: 'DEEPSEEK_API_KEY',
  });

/** Provedor que declara ÁUDIO (o mesmo que já declara visão). */
const openrouterAudio = () =>
  linha({
    id: 'openrouter-gemini',
    name: 'OpenRouter Gemini',
    model: MODELO_AUDIO,
    api_endpoint: ENDPOINT_AUDIO,
    api_key_secret_name: 'OPENROUTER_API_KEY',
    config: { capabilities: { modalities: ['vision', 'audio_stt'] } },
  });

const HEADERS_USUARIO = {
  'content-type': 'application/json',
  authorization: `Bearer ${JWT_USUARIO_TESTE}`,
};

function pedidoClassificar(body: Record<string, unknown>): Request {
  return new Request('https://funcao.teste/classify-audio-meme', {
    method: 'POST',
    headers: HEADERS_USUARIO,
    body: JSON.stringify(body),
  });
}

async function handler(): Promise<(req: Request) => Promise<Response>> {
  if (H.servers.length === 0) await import('../../supabase/functions/classify-audio-meme/index.ts');
  return H.servers[0];
}

async function corpo(res: Response): Promise<Record<string, unknown>> {
  return (await res.json()) as Record<string, unknown>;
}

const chamadasDeProvedor = (): CapturedCall[] => H.fetchCalls.filter((c) => c.method === 'POST');
const chamadasDeAudio = (): CapturedCall[] => H.fetchCalls.filter((c) => c.method === 'GET');

/** Parte de áudio entregue ao provedor na primeira mensagem do cliente. */
function partesEnviadas(indice = 0): {
  partes: Array<Record<string, unknown>>;
  dataDeAudio: unknown;
  formato: unknown;
} {
  const chamada = chamadasDeProvedor()[indice];
  expect(chamada, 'deveria existir chamada ao provedor').toBeDefined();
  const mensagens = chamada.body?.messages as Array<{ role: string; content: unknown }>;
  expect(Array.isArray(mensagens[0].content), 'o multipart deve ser ARRAY, nunca string').toBe(true);
  const partes = mensagens[0].content as Array<Record<string, unknown>>;
  const parte = partes[0] as { input_audio?: { data?: unknown; format?: unknown } };
  return { partes, dataDeAudio: parte?.input_audio?.data, formato: parte?.input_audio?.format };
}

async function despachar(over: Partial<GenerateParams> = {}) {
  return await generateWithRouting({
    purpose: 'tagging',
    functionName: 'classify-audio-meme',
    userId: 'usuario-teste',
    messages: [{ role: 'user', content: 'oi' }],
    ...over,
  });
}

// ---------------------------------------------------------------------------
// (1) Helper: áudio autorizado, baixado no servidor com identidade explícita
// ---------------------------------------------------------------------------

describe('(1) ai-audio-input: download AUTENTICADO e limites', () => {
  it('baixa o objeto no endpoint autenticado e devolve base64 + formato mp3', async () => {
    const audio = await toInlineAudio(MEME_PUBLIC_URL, {
      supabaseUrl: SUPABASE_BASE,
      storageIdentity: { kind: 'user', bearerToken: JWT_USUARIO_TESTE, anonKey: ANON_KEY_FICTICIA },
    });

    expect(audio.data).toBe(BASE64_MEME_1);
    expect(audio.format).toBe('mp3');
    expect(audio.mime).toBe('audio/mpeg');
    expect(audio.bytes).toBe(MP3_BYTES.byteLength);

    const downloads = chamadasDeAudio();
    expect(downloads).toHaveLength(1);
    expect(downloads[0].url).toBe(MEME_DOWNLOAD_URL);
    expect(downloads[0].url).not.toContain('/object/public/');
    expect(downloads[0].headers['apikey']).toBe(ANON_KEY_FICTICIA);
    expect(downloads[0].headers['authorization']).toBe(`Bearer ${JWT_USUARIO_TESTE}`);
  });

  it('identidade de serviço usa a service role EXPLÍCITA (fluxo interno)', async () => {
    await toInlineAudio(MEME_PUBLIC_URL, {
      supabaseUrl: SUPABASE_BASE,
      storageIdentity: { kind: 'service' },
      serviceRoleKey: SERVICE_ROLE_FICTICIA,
    });

    const downloads = chamadasDeAudio();
    expect(downloads[0].headers['apikey']).toBe(SERVICE_ROLE_FICTICIA);
    expect(downloads[0].headers['authorization']).toBe(`Bearer ${SERVICE_ROLE_FICTICIA}`);
  });

  it('sem storageIdentity falha FECHADO, sem nenhuma rede', async () => {
    await expect(
      toInlineAudio(MEME_PUBLIC_URL, { supabaseUrl: SUPABASE_BASE }),
    ).rejects.toMatchObject({ code: 'AUDIO_STORAGE_UNAVAILABLE' });
    expect(H.fetchCalls).toHaveLength(0);
  });

  it('recusa URL de outro projeto e bucket fora da allowlist', async () => {
    const outroProjeto = 'https://outro.supabase.co/storage/v1/object/public/audio-memes/x.mp3';
    const bucketProibido = `${SUPABASE_BASE}/storage/v1/object/public/avatars/x.mp3`;
    const identity = { kind: 'user' as const, bearerToken: JWT_USUARIO_TESTE, anonKey: ANON_KEY_FICTICIA };

    await expect(toInlineAudio(outroProjeto, { supabaseUrl: SUPABASE_BASE, storageIdentity: identity }))
      .rejects.toMatchObject({ code: 'AUDIO_URL_INVALID' });
    await expect(toInlineAudio(bucketProibido, { supabaseUrl: SUPABASE_BASE, storageIdentity: identity }))
      .rejects.toMatchObject({ code: 'AUDIO_URL_INVALID' });
    expect(H.fetchCalls).toHaveLength(0);
    expect(ALLOWED_AUDIO_BUCKETS).toContain(BUCKET);
  });

  it('tipo não-áudio, formato não suportado e tamanho acima do teto são erros TIPADOS', async () => {
    const identity = { kind: 'user' as const, bearerToken: JWT_USUARIO_TESTE, anonKey: ANON_KEY_FICTICIA };

    H.audioMode = 'badType';
    await expect(toInlineAudio(MEME_PUBLIC_URL, { supabaseUrl: SUPABASE_BASE, storageIdentity: identity }))
      .rejects.toMatchObject({ code: 'AUDIO_TYPE_INVALID' });

    H.audioMode = 'ogg';
    await expect(toInlineAudio(MEME_PUBLIC_URL, { supabaseUrl: SUPABASE_BASE, storageIdentity: identity }))
      .rejects.toMatchObject({ code: 'AUDIO_FORMAT_UNSUPPORTED' });

    H.audioMode = 'tooLarge';
    await expect(toInlineAudio(MEME_PUBLIC_URL, { supabaseUrl: SUPABASE_BASE, storageIdentity: identity }))
      .rejects.toBeInstanceOf(AiAudioInputError);
  });

  it('corpo chunked SEM content-length: para de puxar e cancela ao passar do teto', async () => {
    // Resposta de 8 MiB em pedaços de 1 MiB, sem cabeçalho content-length: o
    // limite só pode ser conferido DURANTE a leitura — e a leitura tem de parar
    // assim que o teto estoura, sem consumir o restante.
    const PEDACO_BYTES = 1024 * 1024;
    const TOTAL_PEDACOS = 8;
    let puxados = 0;
    let cancelado = false;
    const stream = new ReadableStream<Uint8Array>({
      pull(controller) {
        if (puxados >= TOTAL_PEDACOS) {
          controller.close();
          return;
        }
        puxados += 1;
        controller.enqueue(new Uint8Array(PEDACO_BYTES));
      },
      cancel() {
        cancelado = true;
      },
    });
    const fetchImpl: typeof fetch = async () =>
      new Response(stream, { status: 200, headers: { 'content-type': 'audio/mpeg' } });

    await expect(
      toInlineAudio(MEME_PUBLIC_URL, {
        supabaseUrl: SUPABASE_BASE,
        storageIdentity: { kind: 'user', bearerToken: JWT_USUARIO_TESTE, anonKey: ANON_KEY_FICTICIA },
        fetchImpl,
      }),
    ).rejects.toMatchObject({ code: 'AUDIO_TOO_LARGE', limitBytes: MAX_INLINE_AUDIO_BYTES });

    // Com `arrayBuffer()` o corpo inteiro era materializado antes da rejeição:
    // os 8 pedaços eram produzidos e `cancel` jamais era chamado. Com a leitura
    // por streaming, a produção para (no máximo 7 pedaços) e o reader é cancelado.
    expect(puxados).toBeLessThan(TOTAL_PEDACOS);
    expect(cancelado).toBe(true);
  });

  it('cancel() que devolve promessa PENDENTE não prende a rejeição por AUDIO_TOO_LARGE', async () => {
    // Defeito da entrega anterior: ao estourar o teto o código AGUARDAVA
    // `reader.cancel()` antes de lançar. Se a origem devolve uma promessa que
    // não resolve, a função ficava presa — e o timer do download já podia ter
    // sido limpo, então nada mais a destravava. O cancelamento tem de ser
    // DISPARADO, nunca aguardado.
    const PEDACO_BYTES = 1024 * 1024;
    const TOTAL_PEDACOS = 8;
    let puxados = 0;
    let cancelado = false;
    let liberarCancelamento: (() => void) | null = null;
    const stream = new ReadableStream<Uint8Array>({
      pull(controller) {
        if (puxados >= TOTAL_PEDACOS) {
          controller.close();
          return;
        }
        puxados += 1;
        controller.enqueue(new Uint8Array(PEDACO_BYTES));
      },
      cancel() {
        cancelado = true;
        // Promessa que ninguém resolve sozinha: quem a libera é o fim do teste.
        return new Promise<void>((resolve) => {
          liberarCancelamento = resolve;
        });
      },
    });
    const fetchImpl: typeof fetch = async () =>
      new Response(stream, { status: 200, headers: { 'content-type': 'audio/mpeg' } });

    const promessa = toInlineAudio(MEME_PUBLIC_URL, {
      supabaseUrl: SUPABASE_BASE,
      storageIdentity: { kind: 'user', bearerToken: JWT_USUARIO_TESTE, anonKey: ANON_KEY_FICTICIA },
      fetchImpl,
    });
    // Rejeição tardia (só no cenário defeituoso) não deve virar ruído de teste.
    void promessa.catch(() => undefined);

    // A prova é o DESFECHO: aguardando o cancelamento pendente, o race estoura a
    // janela e devolve 'pendurou' em vez do erro de tamanho.
    const desfecho = await Promise.race([
      promessa.then(
        () => ({ kind: 'resolveu' as const }),
        (err: unknown) => ({ kind: 'rejeitou' as const, err }),
      ),
      new Promise<{ kind: 'pendurou' }>((resolve) => {
        setTimeout(() => resolve({ kind: 'pendurou' }), 1000);
      }),
    ]);

    try {
      expect(desfecho.kind).toBe('rejeitou');
      if (desfecho.kind === 'rejeitou') {
        expect(desfecho.err).toBeInstanceOf(AiAudioInputError);
        expect(desfecho.err).toMatchObject({ code: 'AUDIO_TOO_LARGE', limitBytes: MAX_INLINE_AUDIO_BYTES });
      }
      // O cancelamento continua sendo PEDIDO (higiene preservada), só não é esperado...
      expect(liberarCancelamento).not.toBeNull();
      expect(cancelado).toBe(true);
      // ...e o restante do corpo segue intocado: os 6 pedaços que estouram o teto
      // mais, no máximo, o 1 que o ReadableStream puxa adiantado — o resto nunca
      // é produzido (com o cancelamento AGUARDADO o consumo chegava ao fim).
      expect(puxados).toBeGreaterThanOrEqual(6);
      expect(puxados).toBeLessThan(TOTAL_PEDACOS);
    } finally {
      liberarCancelamento?.();
    }
  });

  it('corpo bloqueado depois dos headers: o timeout aborta a leitura do corpo', async () => {
    // Os headers chegam dentro do prazo, mas o corpo nunca entrega nem fecha:
    // o timeout iniciado na requisição TEM de continuar valendo durante a
    // leitura — mesmo que o fetch injetado ignore o AbortSignal (ele ignora).
    const fetchImpl: typeof fetch = async () =>
      new Response(new ReadableStream<Uint8Array>({ start() {} }), {
        status: 200,
        headers: { 'content-type': 'audio/mpeg' },
      });

    const promessa = toInlineAudio(MEME_PUBLIC_URL, {
      supabaseUrl: SUPABASE_BASE,
      storageIdentity: { kind: 'user', bearerToken: JWT_USUARIO_TESTE, anonKey: ANON_KEY_FICTICIA },
      timeoutMs: 25,
      fetchImpl,
    });
    await expect(promessa).rejects.toMatchObject({ code: 'AUDIO_DOWNLOAD_FAILED' });
    await expect(promessa).rejects.toThrow(/timeout|abort/i);
  });

  it('o timer do download cobre a leitura do corpo e é limpo em sucesso e em erro', async () => {
    // O espião isola o timer DO MÓDULO pelo delay distintivo: mede se
    // `clearTimeout(id)` foi chamado, e quando.
    const TIMEOUT_DISTINTO = 61_337;
    const setSpy = vi.spyOn(globalThis, 'setTimeout');
    const clearSpy = vi.spyOn(globalThis, 'clearTimeout');
    const timerDoModulo = (): unknown => {
      const indice = setSpy.mock.calls.findIndex((c) => c[1] === TIMEOUT_DISTINTO);
      return indice < 0 ? undefined : setSpy.mock.results[indice]?.value;
    };
    const timerFoiLimpo = (): boolean => {
      const id = timerDoModulo();
      return id !== undefined && clearSpy.mock.calls.some((c) => c[0] === id);
    };

    try {
      // (a) SUCESSO: enquanto o corpo é produzido, o timer continua armado (o
      // código anterior o matava ao receber os headers). Ao resolver, limpo.
      // O 1º pull é o aquecimento interno do ReadableStream — dispara na
      // construção, dentro do fetch, com o timer armado nos DOIS códigos; os
      // pulls seguintes só disparam quando a leitura do corpo consome um pedaço,
      // e é neles que o timer se mede.
      let pullNum = 0;
      const limpoDuranteLeitura: boolean[] = [];
      const corpoOk = new ReadableStream<Uint8Array>({
        pull(controller) {
          pullNum += 1;
          if (pullNum === 1) {
            controller.enqueue(MP3_BYTES.subarray(0, 6));
            return;
          }
          limpoDuranteLeitura.push(timerFoiLimpo());
          controller.enqueue(MP3_BYTES.subarray(6));
          controller.close();
        },
      });
      const fetchOk: typeof fetch = async () =>
        new Response(corpoOk, { status: 200, headers: { 'content-type': 'audio/mpeg' } });

      const audio = await toInlineAudio(MEME_PUBLIC_URL, {
        supabaseUrl: SUPABASE_BASE,
        storageIdentity: { kind: 'user', bearerToken: JWT_USUARIO_TESTE, anonKey: ANON_KEY_FICTICIA },
        timeoutMs: TIMEOUT_DISTINTO,
        fetchImpl: fetchOk,
      });
      expect(audio.bytes).toBe(MP3_BYTES.byteLength);
      expect(limpoDuranteLeitura.length).toBeGreaterThan(0);
      expect(limpoDuranteLeitura).toContain(false);
      expect(timerFoiLimpo()).toBe(true);

      // (b) ERRO: a rejeição por AUDIO_TOO_LARGE também não deixa timer vivo.
      setSpy.mockClear();
      clearSpy.mockClear();
      const fetchGrande: typeof fetch = async () =>
        new Response(new Uint8Array(MAX_INLINE_AUDIO_BYTES + 1), {
          status: 200,
          headers: { 'content-type': 'audio/mpeg' },
        });
      await expect(
        toInlineAudio(MEME_PUBLIC_URL, {
          supabaseUrl: SUPABASE_BASE,
          storageIdentity: { kind: 'user', bearerToken: JWT_USUARIO_TESTE, anonKey: ANON_KEY_FICTICIA },
          timeoutMs: TIMEOUT_DISTINTO,
          fetchImpl: fetchGrande,
        }),
      ).rejects.toMatchObject({ code: 'AUDIO_TOO_LARGE' });
      expect(timerFoiLimpo()).toBe(true);
    } finally {
      setSpy.mockRestore();
      clearSpy.mockRestore();
    }
  });

  it('content-length acima do teto rejeita ANTES de ler o corpo (zero pedaços puxados)', async () => {
    // Cabeçalho honesto acima do limite: a decisão sai na validação dos headers,
    // dentro do prazo do download — a fonte não é puxada nenhuma vez e o corpo é
    // devolvido por cancel (releaseBody), ainda com o timer armado.
    const TIMEOUT_DISTINTO = 61_337;
    const setSpy = vi.spyOn(globalThis, 'setTimeout');
    const clearSpy = vi.spyOn(globalThis, 'clearTimeout');
    const timerFoiLimpo = (): boolean => {
      const indice = setSpy.mock.calls.findIndex((c) => c[1] === TIMEOUT_DISTINTO);
      const id = indice < 0 ? undefined : setSpy.mock.results[indice]?.value;
      return id !== undefined && clearSpy.mock.calls.some((c) => c[0] === id);
    };

    let puxados = 0;
    let cancelado = false;
    let timerArmadoNoRelease: boolean | null = null;
    const stream = new ReadableStream<Uint8Array>({
      pull(controller) {
        // Sempre entrega: qualquer LEITURA do corpo geraria um pull novo. O 1º
        // pull é o aquecimento interno do ReadableStream (não é leitura do
        // módulo), então `puxados <= 1` prova que nada foi consumido.
        puxados += 1;
        controller.enqueue(new Uint8Array(8));
      },
      cancel() {
        cancelado = true;
        timerArmadoNoRelease = !timerFoiLimpo();
      },
    });
    const fetchImpl: typeof fetch = async () =>
      new Response(stream, {
        status: 200,
        headers: {
          'content-type': 'audio/mpeg',
          'content-length': String(MAX_INLINE_AUDIO_BYTES + 1),
        },
      });

    try {
      await expect(
        toInlineAudio(MEME_PUBLIC_URL, {
          supabaseUrl: SUPABASE_BASE,
          storageIdentity: { kind: 'user', bearerToken: JWT_USUARIO_TESTE, anonKey: ANON_KEY_FICTICIA },
          timeoutMs: TIMEOUT_DISTINTO,
          fetchImpl,
        }),
      ).rejects.toMatchObject({ code: 'AUDIO_TOO_LARGE' });

      expect(puxados).toBeLessThanOrEqual(1);
      expect(cancelado).toBe(true);
      expect(timerArmadoNoRelease).toBe(true);
      expect(timerFoiLimpo()).toBe(true);
    } finally {
      setSpy.mockRestore();
      clearSpy.mockRestore();
    }
  });
});

// ---------------------------------------------------------------------------
// (2) O classificador ouve: `input_audio` embutido, provedor de áudio
// ---------------------------------------------------------------------------

describe('(2) classificação pelo CONTEÚDO SONORO', () => {
  it('baixa o áudio no servidor e envia `input_audio` em base64 ao provedor de áudio', async () => {
    H.rows = [deepseekTexto(), openrouterAudio()];
    const h = await handler();

    const res = await h(pedidoClassificar({ audio_url: MEME_PUBLIC_URL, file_name: 'risada.mp3' }));

    expect(res.status).toBe(200);
    expect(await corpo(res)).toMatchObject({ category: 'risada', basis: 'audio_content' });

    const downloads = chamadasDeAudio();
    expect(downloads).toHaveLength(1);
    expect(downloads[0].url).toBe(MEME_DOWNLOAD_URL);

    const doProvedor = chamadasDeProvedor();
    expect(doProvedor).toHaveLength(1);
    expect(doProvedor[0].url).toBe(ENDPOINT_AUDIO);
    expect(doProvedor[0].url).not.toBe(ENDPOINT_TEXTO_PADRAO);
    expect(doProvedor[0].body?.model).toBe(MODELO_AUDIO);

    // O som (base64 dos bytes baixados) viaja na parte `input_audio`.
    const { partes, dataDeAudio, formato } = partesEnviadas();
    expect(dataDeAudio).toBe(BASE64_MEME_1);
    expect(formato).toBe('mp3');
    expect(partes[1]).toMatchObject({ type: 'text' });
    expect(typeof (partes[1] as { text: unknown }).text).toBe('string');
  });

  it('o provedor de TEXTO padrão NUNCA recebe o pedido de áudio', async () => {
    H.rows = [deepseekTexto(), openrouterAudio()];
    const h = await handler();

    await h(pedidoClassificar({ audio_url: MEME_PUBLIC_URL, file_name: 'risada.mp3' }));

    expect(chamadasDeProvedor().every((call) => call.url !== ENDPOINT_TEXTO_PADRAO)).toBe(true);
  });

  it('ACEITE IA-131: mesmo nome com conteúdo diferente é distinguido (payloads distintos)', async () => {
    H.rows = [deepseekTexto(), openrouterAudio()];
    H.contents = ['risada', 'deboche'];
    const h = await handler();

    const primeiro = await h(pedidoClassificar({ audio_url: MEME_PUBLIC_URL, file_name: 'risada.mp3' }));
    H.audioMode = 'ok2';
    const segundo = await h(pedidoClassificar({ audio_url: MEME2_PUBLIC_URL, file_name: 'risada.mp3' }));

    expect(await corpo(primeiro)).toMatchObject({ category: 'risada', basis: 'audio_content' });
    expect(await corpo(segundo)).toMatchObject({ category: 'deboche', basis: 'audio_content' });

    expect(chamadasDeAudio().map((c) => c.url)).toEqual([MEME_DOWNLOAD_URL, MEME2_DOWNLOAD_URL]);
    expect(partesEnviadas(0).dataDeAudio).toBe(BASE64_MEME_1);
    expect(partesEnviadas(1).dataDeAudio).toBe(BASE64_MEME_2);
    expect(partesEnviadas(0).dataDeAudio).not.toBe(partesEnviadas(1).dataDeAudio);
  });

  it('o texto enviado junto ao som pede para OUVIR o conteúdo (não deriva do nome)', async () => {
    // O aceite do A8/IA-131 é uma promessa do TEXTO do prompt: se alguém reescrever
    // o pedido e ele voltar a ser "classifique pelo nome", a garantia cai em
    // silêncio. Aqui o prompt REAL (capturado da chamada ao provedor) é conferido.
    H.rows = [deepseekTexto(), openrouterAudio()];
    H.contents = ['risada'];
    const h = await handler();

    await h(pedidoClassificar({ audio_url: MEME_PUBLIC_URL, file_name: 'risada.mp3' }));

    const { partes } = partesEnviadas();
    const texto = String((partes[1] as { text?: unknown }).text);
    expect(texto).toContain('Ouça o CONTEÚDO SONORO');
    expect(texto).not.toContain('NÃO recebeu o som deste arquivo');
  });
});

// ---------------------------------------------------------------------------
// (3) Modo por METADADOS é rotulado (e não afirma ter ouvido)
// ---------------------------------------------------------------------------

describe('(3) só metadados: a resposta declara que a classificação é limitada', () => {
  it('sem `audio_url` classifica por metadados no provedor de texto e rotula `basis`', async () => {
    H.rows = [deepseekTexto(), openrouterAudio()];
    H.contents = ['deboche'];
    const h = await handler();

    const res = await h(pedidoClassificar({ file_name: 'risada_troll.mp3' }));

    expect(res.status).toBe(200);
    expect(await corpo(res)).toMatchObject({ category: 'deboche', basis: 'metadata' });

    // Não houve download nem parte de áudio: nada foi ouvido.
    expect(chamadasDeAudio()).toHaveLength(0);
    const doProvedor = chamadasDeProvedor();
    expect(doProvedor).toHaveLength(1);
    expect(doProvedor[0].url).toBe(ENDPOINT_TEXTO_PADRAO);
    const mensagens = doProvedor[0].body?.messages as Array<{ content: unknown }>;
    expect(typeof mensagens[0].content).toBe('string');
    expect(JSON.stringify(mensagens[0].content)).not.toContain('input_audio');
  });

  it('o prompt do modo limitado DIZ que o som não foi recebido e que a classificação é só pelo nome', async () => {
    // Este é o mecanismo que sustenta o aceite: sem a frase abaixo o modelo
    // passaria a responder "como se tivesse ouvido" um arquivo do qual só
    // recebeu o nome. O texto vem do provedor capturado, não de um literal solto.
    H.rows = [deepseekTexto(), openrouterAudio()];
    H.contents = ['deboche'];
    const h = await handler();

    await h(pedidoClassificar({ file_name: 'risada_troll.mp3' }));

    const mensagens = chamadasDeProvedor()[0].body?.messages as Array<{ content: unknown }>;
    const prompt = String(mensagens[0].content);
    expect(prompt).toContain('Você NÃO recebeu o som deste arquivo');
    expect(prompt).toContain('APENAS pelo nome');
    expect(prompt).not.toContain('Ouça o CONTEÚDO SONORO');
  });
});

// ---------------------------------------------------------------------------
// (4) Falha técnica continua separada da categoria
// ---------------------------------------------------------------------------

describe('(4) falha técnica: registrada como degradação, não como conclusão', () => {
  it('Storage 404 → cai no modo por metadados, com `degraded` e `error_code`', async () => {
    H.rows = [deepseekTexto(), openrouterAudio()];
    H.audioMode = 'http404';
    H.contents = ['deboche'];
    const h = await handler();

    const res = await h(pedidoClassificar({ audio_url: MEME_PUBLIC_URL, file_name: 'risada.mp3' }));

    expect(res.status).toBe(200);
    expect(await corpo(res)).toMatchObject({
      basis: 'metadata',
      degraded: true,
      error_code: 'AUDIO_DOWNLOAD_FAILED',
    });
    // O provedor de áudio não recebeu payload incompleto: só o texto foi ao provedor padrão.
    expect(chamadasDeProvedor()).toHaveLength(1);
    expect(chamadasDeProvedor()[0].url).toBe(ENDPOINT_TEXTO_PADRAO);
  });

  it('tipo não-áudio e formato não suportado degradam igual, com o código do motivo', async () => {
    H.rows = [deepseekTexto(), openrouterAudio()];
    H.contents = ['outros'];
    const h = await handler();

    H.audioMode = 'badType';
    expect(await corpo(await h(pedidoClassificar({ audio_url: MEME_PUBLIC_URL, file_name: 'x.mp3' }))))
      .toMatchObject({ degraded: true, error_code: 'AUDIO_TYPE_INVALID' });

    H.fetchCalls = [];
    H.audioMode = 'ogg';
    expect(await corpo(await h(pedidoClassificar({ audio_url: MEME_PUBLIC_URL, file_name: 'x.ogg' }))))
      .toMatchObject({ degraded: true, error_code: 'AUDIO_FORMAT_UNSUPPORTED' });
  });

  it('provedor de áudio indisponível NÃO vira categoria: `outros` com `basis: none`', async () => {
    H.rows = [deepseekTexto(), openrouterAudio()];
    H.fetchMode = 'http500';
    const h = await handler();

    let res!: Response;
    let lancou = false;
    try {
      res = await h(pedidoClassificar({ audio_url: MEME_PUBLIC_URL, file_name: 'risada.mp3' }));
    } catch {
      lancou = true;
    }

    expect(lancou, 'a degradação não pode propagar exceção').toBe(false);
    expect(res.status).toBe(200);
    expect(await corpo(res)).toMatchObject({ category: 'outros', basis: 'none', degraded: true });
  });

  it('sem provedor que declare áudio: nada é enviado ao provedor de áudio e a falha é rotulada', async () => {
    H.rows = [deepseekTexto()];
    H.contents = ['outros'];
    const h = await handler();

    const res = await h(pedidoClassificar({ audio_url: MEME_PUBLIC_URL, file_name: 'risada.mp3' }));

    expect(res.status).toBe(200);
    expect(await corpo(res)).toMatchObject({ degraded: true, error_code: 'NO_PROVIDER' });
    expect(chamadasDeProvedor().every((call) => call.url !== ENDPOINT_AUDIO)).toBe(true);
  });

  it('entrada vazia: `outros` sem afirmar nada sobre o som', async () => {
    H.rows = [deepseekTexto(), openrouterAudio()];
    const h = await handler();

    const res = await h(pedidoClassificar({}));

    expect(res.status).toBe(200);
    expect(await corpo(res)).toMatchObject({ category: 'outros', basis: 'none' });
    expect(chamadasDeProvedor()).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// (5) Controle: o despacho direto por modalidade de áudio exige o provedor certo
// ---------------------------------------------------------------------------

describe('(5) controle: modalidade `audio_stt` resolve no provedor que a declara', () => {
  it('despacho direto por áudio não cai no provedor padrão de texto', async () => {
    H.rows = [deepseekTexto(), openrouterAudio()];

    const res = await despachar({
      need: { modality: 'audio_stt' },
      messages: [{ role: 'user', content: [{ type: 'input_audio', input_audio: { data: BASE64_MEME_1, format: 'mp3' } }] }],
    });

    expect(res.ok).toBe(true);
    expect(res.providerId).toBe('openrouter-gemini');
    expect(chamadasDeProvedor()[0].url).toBe(ENDPOINT_AUDIO);
    expect(chamadasDeProvedor().every((call) => call.url !== ENDPOINT_TEXTO_PADRAO)).toBe(true);
  });

  it('sem candidato que declare áudio, o despacho falha FECHADO (NO_PROVIDER)', async () => {
    H.rows = [deepseekTexto()];

    const res = await despachar({ need: { modality: 'audio_stt' } });

    expect(res.ok).toBe(false);
    expect(res.errorCode).toBe('NO_PROVIDER');
    expect(H.fetchCalls).toHaveLength(0);
  });
});
