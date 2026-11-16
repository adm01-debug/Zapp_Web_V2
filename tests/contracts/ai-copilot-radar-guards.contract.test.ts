/**
 * Contrato das duas guardas do Copiloto RADAR (resgate da #2460).
 *
 * 1. KILL SWITCH — as 7 edges de análise contextual do RADAR (CV-081-102)
 *    consomem a capacidade `copilot_live`. Quem não está em
 *    `AI_CAPABILITY_BY_FUNCTION` sai do gate com `null`
 *    (`ai-feature-flags.ts`, `capabilityFlagKeyForFunction`), ou seja: a chave
 *    `ai.capability.copilot_live` DESLIGADA não barrava o provedor pago. O teste
 *    prova o veredito do gate, não só o conteúdo do mapa.
 *
 * 2. IMAGEM DE VISÃO — o bucket `whatsapp-media` é PRIVADO (`public=false`) e a
 *    URL `/object/public/...` devolve HTTP 400 para terceiros: o modelo NÃO
 *    alcança a imagem. `ai-multimodal-analysis` tem de baixar o objeto no
 *    servidor sob a identidade do CHAMADOR e mandar a imagem EMBUTIDA
 *    (data URL), como `classify-emoji`/`classify-sticker` já fazem.
 *
 * Aqui o `toInlineImage` roda DE VERDADE: só as fronteiras de I/O são dubladas
 * (`globalThis.fetch` serve o Storage; `Deno.env` devolve segredos fictícios; o
 * provedor entra por `deps.generate`). Nenhuma rede, nenhum banco.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { GenerateParams, GenerateResult } from '../../supabase/functions/_shared/ai-generate.ts';

/** Origem do projeto fictício — casa com o `SUPABASE_URL` do `Deno.env` dublado. */
const SUPABASE_BASE = 'https://projeto.teste.supabase.co';
const BUCKET = 'whatsapp-media';
const CAMINHO = 'midia/logo.png';

/** URL CRUA que o app manda (bucket privado) e o endpoint AUTENTICADO do download. */
const URL_CRUA = `${SUPABASE_BASE}/storage/v1/object/public/${BUCKET}/${CAMINHO}`;
const URL_DOWNLOAD = `${SUPABASE_BASE}/storage/v1/object/${BUCKET}/${CAMINHO}`;

const JWT_USUARIO = 'jwt-do-chamador-teste';
const ANON_KEY = 'anon-key-ficticia';

/** PNG mínimo servido pelo Storage espião. */
const PNG_BYTES = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
const PNG_BASE64 = Buffer.from(PNG_BYTES).toString('base64');

/** Saída de modelo que satisfaz o `MultimodalAnalysisEnvelope`. */
const SAIDA_VALIDA = {
  description: 'Logo azul com a palavra ACME',
  extractedText: ['ACME'],
  dominantColors: ['azul'],
  keyElements: ['logo'],
  brandingOpportunity: 'Gravação a laser em caneta metálica',
  suggestedReply: 'Podemos gravar esse logo nas canetas.',
  confidence: 0.9,
};

/** Desfecho do GET do Storage no caso corrente. */
type ModoDaImagem = 'ok' | 'http403';

const H = vi.hoisted(() => ({
  modoDaImagem: 'ok' as 'ok' | 'http403',
  chamadas: [] as Array<{ url: string; headers: Record<string, string> }>,
}));

// `Deno.env` dublado: o helper de imagem lê o ambiente do escopo global.
vi.stubGlobal('Deno', {
  env: {
    get: (chave: string): string | undefined => {
      if (chave === 'SUPABASE_URL') return SUPABASE_BASE;
      if (chave === 'SUPABASE_ANON_KEY') return ANON_KEY;
      return 'segredo-ficticio';
    },
  },
  serve: (): void => undefined,
});

function cabecalhos(init: unknown): Record<string, string> {
  const fonte = (init as { headers?: unknown } | undefined)?.headers;
  const saida: Record<string, string> = {};
  if (!fonte) return saida;
  if (fonte instanceof Headers) {
    fonte.forEach((valor, chave) => {
      saida[chave.toLowerCase()] = valor;
    });
  } else {
    for (const [chave, valor] of Object.entries(fonte as Record<string, unknown>)) {
      saida[chave.toLowerCase()] = String(valor);
    }
  }
  return saida;
}

beforeEach(() => {
  H.modoDaImagem = 'ok';
  H.chamadas = [];
  vi.stubGlobal(
    'fetch',
    vi.fn((url: unknown, init?: unknown) => {
      H.chamadas.push({ url: String(url), headers: cabecalhos(init) });
      if (H.modoDaImagem === 'http403') {
        return Promise.resolve(new Response('proibido', { status: 403 }));
      }
      return Promise.resolve(
        new Response(PNG_BYTES, { status: 200, headers: { 'content-type': 'image/png' } }),
      );
    }),
  );
});

// ---------------------------------------------------------------------------
// 1. Kill switch `copilot_live` cobre as 7 edges do RADAR
// ---------------------------------------------------------------------------

/** As 7 edges de análise contextual do RADAR (fases 8-11). */
const EDGES_DO_RADAR = [
  'ai-objection-handler',
  'ai-price-anchor',
  'ai-loss-risk',
  'ai-product-recommendation',
  'ai-deadline-calculator',
  'ai-lead-temperature',
  'ai-multimodal-analysis',
] as const;

describe('CV-081-102: kill switch copilot_live cobre as edges do RADAR', () => {
  it('cada edge do RADAR resolve para a chave ai.capability.copilot_live', async () => {
    const { AI_CAPABILITY_BY_FUNCTION, capabilityFlagKeyForFunction } = await import(
      '../../supabase/functions/_shared/ai-feature-flags.ts'
    );
    for (const fn of EDGES_DO_RADAR) {
      expect(AI_CAPABILITY_BY_FUNCTION[fn], fn).toBe('copilot_live');
      expect(capabilityFlagKeyForFunction(fn), fn).toBe('ai.capability.copilot_live');
    }
  });

  it('com a flag DESLIGADA o gate recusa cada edge do RADAR com 503 (sem entrada no mapa ele liberava)', async () => {
    const { enforceAiCapability } = await import(
      '../../supabase/functions/_shared/ai-feature-flags.ts'
    );
    for (const fn of EDGES_DO_RADAR) {
      const resp = await enforceAiCapability({
        functionName: fn,
        req: new Request(`https://funcao.teste/${fn}`, { method: 'POST' }),
        readFlag: () => Promise.resolve(false),
      });
      expect(resp, fn).not.toBeNull();
      expect(resp!.status, fn).toBe(503);
      expect((await resp!.json()).code, fn).toBe('AI_CAPABILITY_DISABLED');
    }
  });
});

// ---------------------------------------------------------------------------
// 2. `ai-multimodal-analysis` manda a imagem EMBUTIDA, nunca a URL privada
// ---------------------------------------------------------------------------

interface ParteDeImagem {
  type?: string;
  image_url?: { url?: string };
}

/** URL que foi de fato enviada ao provedor na parte `image_url` da mensagem. */
function urlEnviadaAoProvedor(messages: unknown): string {
  const conteudo = (messages as Array<{ content?: unknown }> | undefined)?.[0]?.content;
  const partes = Array.isArray(conteudo) ? (conteudo as ParteDeImagem[]) : [];
  for (const parte of partes) {
    if (parte?.type === 'image_url') return parte.image_url?.url ?? '';
  }
  return '';
}

describe('IA-033/CV-102: ai-multimodal-analysis embute a imagem do bucket privado', () => {
  async function chamar(modoDaImagem: ModoDaImagem) {
    H.modoDaImagem = modoDaImagem;
    const { handleAiMultimodalAnalysis } = await import(
      '../../supabase/functions/ai-multimodal-analysis/index.ts'
    );
    const enviados: GenerateParams['messages'][] = [];
    const respostaDoProvedor = {
      ok: true,
      response: new Response(null, { status: 200 }),
      data: {
        model: 'modelo-visao',
        choices: [{ message: { content: JSON.stringify(SAIDA_VALIDA) } }],
      },
    } as unknown as GenerateResult;
    const res = await handleAiMultimodalAnalysis(
      new Request('https://funcao.teste/ai-multimodal-analysis', {
        method: 'POST',
        headers: { 'content-type': 'application/json', authorization: `Bearer ${JWT_USUARIO}` },
        body: JSON.stringify({ imageUrl: URL_CRUA, conversationContext: 'cliente mandou o logo' }),
      }),
      {
        authorize: () => Promise.resolve({ userId: 'usuario-teste' }),
        enforceGuards: () => Promise.resolve(null),
        generate: (params: GenerateParams) => {
          enviados.push(params.messages);
          return Promise.resolve(respostaDoProvedor);
        },
      },
    );
    return { res, enviados };
  }

  it('baixa o objeto no endpoint AUTENTICADO sob a identidade do chamador e manda data URL ao provedor', async () => {
    const { res, enviados } = await chamar('ok');
    expect(res.status).toBe(200);

    // O download usou o endpoint autenticado, nunca `/object/public/`.
    const download = H.chamadas.find((c) => c.url.startsWith(`${SUPABASE_BASE}/storage/`));
    expect(download?.url).toBe(URL_DOWNLOAD);
    expect(download?.url).not.toContain('/object/public/');
    // Identidade do USUÁRIO (R2-INF-022): anon key + JWT do pedido, nunca service role.
    expect(download?.headers.apikey).toBe(ANON_KEY);
    expect(download?.headers.authorization).toBe(`Bearer ${JWT_USUARIO}`);

    // E o provedor recebeu a imagem EMBUTIDA — a URL crua não aparece no payload.
    expect(enviados).toHaveLength(1);
    expect(urlEnviadaAoProvedor(enviados[0])).toBe(`data:image/png;base64,${PNG_BASE64}`);
    expect(JSON.stringify(enviados[0])).not.toContain(URL_CRUA);
  });

  it('Storage recusando (403) recusa sem chamar o provedor e sem vazar bucket/path', async () => {
    const { res, enviados } = await chamar('http403');
    // 502 (nao 422): o status vem do mapa ERROR_STATUS de _shared/ai-image-input.ts
    // (IMAGE_DOWNLOAD_FAILED -> 502), que e o contrato vigente na main. O que importa
    // para o guard e nao gastar provedor e nao vazar o locator do objeto privado.
    expect(res.status).toBe(502);
    expect(enviados).toHaveLength(0);
    expect(await res.text()).not.toContain(BUCKET);
  });
});
