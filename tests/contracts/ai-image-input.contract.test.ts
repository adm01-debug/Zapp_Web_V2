/**
 * Contrato de COMPORTAMENTO do helper de imagem para visão —
 * `supabase/functions/_shared/ai-image-input.ts` (Bloco 04 / PR-4 — IA-033).
 *
 * Decisão do Joaquim `20261001-195235-aa8c`: o bucket `whatsapp-media` é PRIVADO e a
 * URL `/object/public/whatsapp-media/...` devolve HTTP 400 para terceiros; como tornar o
 * bucket público foi DESCARTADO, o servidor baixa o objeto com service role e embute a
 * imagem como data URL base64.
 *
 * Aqui o módulo é importado DE VERDADE (não há asserção de fonte): o download é `fetch`
 * cru, então `globalThis.fetch` é substituído por um mock — nenhuma rede, nenhum banco.
 * `Deno` também é injetado (o módulo lê o ambiente do escopo global) para provar a
 * credencial de serviço usada na chamada autenticada do Storage.
 *
 * Casos: (a) sucesso com base64 batendo byte a byte; (b) limite de 4 MiB (cabeçalho,
 * corpo real e cabeçalho MENTINDO); (c) 404/403; (d) content-type não-imagem; (e) data URL
 * já pronta, sem nenhuma chamada de rede.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  AiImageInputError,
  MAX_INLINE_IMAGE_BYTES,
  toInlineImage,
  type AiImageInputErrorCode,
} from '../../supabase/functions/_shared/ai-image-input.ts';

const ORIGIN = 'https://tnnnlkbymytvtqngbbqh.supabase.co';
const BUCKET = 'whatsapp-media';
const PATH = 'stickers/figurinha.webp';
const PUBLIC_URL = `${ORIGIN}/storage/v1/object/public/${BUCKET}/${PATH}`;
const SERVICE_KEY = 'service-role-de-teste';
const ENDPOINT = `${ORIGIN}/storage/v1/object/${BUCKET}/${PATH}`;

/** Bytes "de imagem" (assinatura RIFF/WEBP + resto) para conferir o base64. */
const IMAGE_BYTES = new Uint8Array([0x52, 0x49, 0x46, 0x46, 0x00, 0x01, 0x02, 0xff, 0xfe, 0x7f]);
const IMAGE_BASE64 = Buffer.from(IMAGE_BYTES).toString('base64');

const MIB = 1024 * 1024;
const HUGE_BYTES = 5 * MIB;

const env: Record<string, string | undefined> = {};
let fetchMock: ReturnType<typeof vi.fn>;

/** Resposta do Storage com corpo e cabeçalhos explícitos. */
function storageResponse(
  body: BodyInit | null,
  init: { status?: number; contentType?: string | null; contentLength?: number | string } = {},
): Response {
  const headers = new Headers();
  if (init.contentType !== undefined && init.contentType !== null) {
    headers.set('content-type', init.contentType);
  }
  if (init.contentLength !== undefined) {
    headers.set('content-length', String(init.contentLength));
  }
  return new Response(body, { status: init.status ?? 200, headers });
}

/** Erro lançado por uma chamada (para inspecionar `code`/tamanhos sem duplicar a chamada). */
async function errorFrom(promise: Promise<unknown>): Promise<AiImageInputError> {
  try {
    await promise;
  } catch (err) {
    if (err instanceof AiImageInputError) return err;
    throw err;
  }
  throw new Error('esperava AiImageInputError, mas a chamada resolveu');
}

beforeEach(() => {
  env.SUPABASE_URL = ORIGIN;
  env.SUPABASE_SERVICE_ROLE_KEY = SERVICE_KEY;
  fetchMock = vi.fn();
  vi.stubGlobal('fetch', fetchMock);
  // O runtime Edge tem `Deno` global; no vitest ele é injetado (nada de rede/segredo real).
  vi.stubGlobal('Deno', { env: { get: (name: string) => env[name] } });
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});

describe('toInlineImage — caminho autenticado do Storage', () => {
  it.each(['public', 'sign' as const])(
    'baixa o objeto %s com service role e monta a data URL byte a byte',
    async (access) => {
      fetchMock.mockResolvedValue(storageResponse(IMAGE_BYTES, { contentType: 'image/webp' }));
      const url = `${ORIGIN}/storage/v1/object/${access}/${BUCKET}/${PATH}` +
        (access === 'sign' ? '?token=assinatura-expirada' : '');

      const result = await toInlineImage(url);

      expect(result.dataUrl).toBe(`data:image/webp;base64,${IMAGE_BASE64}`);
      expect(result.mime).toBe('image/webp');
      expect(result.bytes).toBe(IMAGE_BYTES.byteLength);
      expect(result.bucket).toBe(BUCKET);
      expect(result.path).toBe(PATH);

      expect(fetchMock).toHaveBeenCalledTimes(1);
      const [calledUrl, init] = fetchMock.mock.calls[0] as [string, RequestInit];
      // A URL pública crua NUNCA é usada: o download vai no endpoint autenticado.
      expect(calledUrl).toBe(ENDPOINT);
      expect(calledUrl).not.toContain('/object/public/');
      expect(calledUrl).not.toContain('/object/sign/');
      expect(init.headers).toMatchObject({
        apikey: SERVICE_KEY,
        Authorization: `Bearer ${SERVICE_KEY}`,
      });
    },
  );

  it('normaliza o mime com parâmetros do content-type', async () => {
    fetchMock.mockResolvedValue(
      storageResponse(IMAGE_BYTES, { contentType: 'IMAGE/PNG; charset=binary' }),
    );

    const result = await toInlineImage(PUBLIC_URL);

    expect(result.mime).toBe('image/png');
    expect(result.dataUrl.startsWith('data:image/png;base64,')).toBe(true);
  });

  it('codifica cada segmento do caminho sem quebrar a URL do objeto', async () => {
    fetchMock.mockResolvedValue(storageResponse(IMAGE_BYTES, { contentType: 'image/webp' }));
    const trickyPath = 'stickers/foto com espaço.webp';
    const url = `${ORIGIN}/storage/v1/object/public/${BUCKET}/stickers/foto%20com%20espa%C3%A7o.webp`;

    const result = await toInlineImage(url);

    expect(result.path).toBe(trickyPath);
    expect(fetchMock.mock.calls[0][0]).toBe(
      `${ORIGIN}/storage/v1/object/${BUCKET}/stickers/foto%20com%20espa%C3%A7o.webp`,
    );
  });

  it('traduz falha de socket em erro tipado (nunca vaza a exceção crua)', async () => {
    fetchMock.mockRejectedValue(new Error('ECONNRESET'));

    const error = await errorFrom(toInlineImage(PUBLIC_URL));

    expect(error.code).toBe('IMAGE_DOWNLOAD_FAILED');
    expect(error.message).toContain('ECONNRESET');
    expect(error.bucket).toBe(BUCKET);
  });
});

describe('toInlineImage — limite de 4 MiB (obrigatório pela decisão)', () => {
  it('recusa pelo content-length ANTES de ler o corpo', async () => {
    const readBody = vi.fn(async () => {
      throw new Error('o corpo nao deveria ser lido');
    });
    fetchMock.mockResolvedValue({
      ok: true,
      status: 200,
      headers: new Headers({
        'content-type': 'image/webp',
        'content-length': String(HUGE_BYTES),
      }),
      arrayBuffer: readBody,
      body: null,
    } as unknown as Response);

    const error = await errorFrom(toInlineImage(PUBLIC_URL));

    expect(error).toBeInstanceOf(AiImageInputError);
    expect(error.code).toBe('IMAGE_TOO_LARGE');
    expect(error.bytes).toBe(HUGE_BYTES);
    expect(error.limitBytes).toBe(MAX_INLINE_IMAGE_BYTES);
    expect(error.message).toContain(String(HUGE_BYTES));
    expect(error.message).toContain(String(MAX_INLINE_IMAGE_BYTES));
    expect(readBody).not.toHaveBeenCalled();
  });

  it('confirma o tamanho nos bytes REAIS quando não há content-length', async () => {
    fetchMock.mockResolvedValue(
      storageResponse(new Uint8Array(HUGE_BYTES), { contentType: 'image/webp' }),
    );

    const error = await errorFrom(toInlineImage(PUBLIC_URL));

    expect(error.code).toBe('IMAGE_TOO_LARGE');
    expect(error.bytes).toBe(HUGE_BYTES);
    expect(error.limitBytes).toBe(MAX_INLINE_IMAGE_BYTES);
  });

  it('não confia no cabeçalho que MENTE para baixo: os bytes reais decidem', async () => {
    fetchMock.mockResolvedValue(
      storageResponse(new Uint8Array(HUGE_BYTES), {
        contentType: 'image/webp',
        contentLength: 1024,
      }),
    );

    const error = await errorFrom(toInlineImage(PUBLIC_URL));

    expect(error.code).toBe('IMAGE_TOO_LARGE');
    expect(error.bytes).toBe(HUGE_BYTES);
  });

  it('recusa data URL acima do limite sem chamar a rede', async () => {
    // Base64 de 5592408 chars = 4194306 bytes > 4194304 (4 MiB).
    const oversized = `data:image/webp;base64,${'A'.repeat(5_592_408)}`;

    const error = await errorFrom(toInlineImage(oversized));

    expect(error.code).toBe('IMAGE_TOO_LARGE');
    expect(error.bytes).toBe(4_194_306);
    expect(error.limitBytes).toBe(MAX_INLINE_IMAGE_BYTES);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('aceita exatamente o limite (4 MiB) e devolve os bytes medidos', async () => {
    fetchMock.mockResolvedValue(
      storageResponse(new Uint8Array(MAX_INLINE_IMAGE_BYTES), { contentType: 'image/webp' }),
    );

    const result = await toInlineImage(PUBLIC_URL);

    expect(result.bytes).toBe(MAX_INLINE_IMAGE_BYTES);
    expect(result.dataUrl.startsWith('data:image/webp;base64,')).toBe(true);
  });

  it('respeita um maxBytes menor passado pelo chamador', async () => {
    fetchMock.mockResolvedValue(storageResponse(IMAGE_BYTES, { contentType: 'image/webp' }));

    const error = await errorFrom(toInlineImage(PUBLIC_URL, { maxBytes: 4 }));

    expect(error.code).toBe('IMAGE_TOO_LARGE');
    expect(error.bytes).toBe(IMAGE_BYTES.byteLength);
    expect(error.limitBytes).toBe(4);
  });
});

describe('toInlineImage — erros tipados do Storage', () => {
  it.each([404, 403])('HTTP %i vira IMAGE_DOWNLOAD_FAILED com o status', async (status) => {
    fetchMock.mockResolvedValue(storageResponse(null, { status }));

    const error = await errorFrom(toInlineImage(PUBLIC_URL));

    expect(error).toBeInstanceOf(AiImageInputError);
    expect(error.code).toBe('IMAGE_DOWNLOAD_FAILED');
    expect(error.status_http).toBe(status);
    expect(error.bucket).toBe(BUCKET);
    expect(error.path).toBe(PATH);
  });

  it.each(['text/html; charset=utf-8', 'application/octet-stream'])(
    'content-type %s não é imagem: erro tipado',
    async (contentType) => {
      fetchMock.mockResolvedValue(storageResponse('<html>nao e imagem</html>', { contentType }));

      const error = await errorFrom(toInlineImage(PUBLIC_URL));

      expect(error.code).toBe('IMAGE_TYPE_INVALID');
      expect(error.contentType).toBe(contentType);
    },
  );

  it('content-type ausente é erro tipado', async () => {
    fetchMock.mockResolvedValue(storageResponse(IMAGE_BYTES));

    const error = await errorFrom(toInlineImage(PUBLIC_URL));

    expect(error.code).toBe('IMAGE_TYPE_INVALID');
    expect(error.contentType).toBeNull();
  });

  it('objeto vazio é erro tipado (não vira data URL vazia)', async () => {
    fetchMock.mockResolvedValue(storageResponse(new Uint8Array(0), { contentType: 'image/webp' }));

    const error = await errorFrom(toInlineImage(PUBLIC_URL));

    expect(error.code).toBe('IMAGE_DOWNLOAD_FAILED');
    expect(error.bytes).toBe(0);
  });

  it('origem de OUTRO projeto não é baixada com service role', async () => {
    const error = await errorFrom(
      toInlineImage('https://attacker.example/storage/v1/object/public/whatsapp-media/x.webp'),
    );

    expect(error.code).toBe('IMAGE_URL_INVALID');
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('bucket fora da allowlist não é baixado com service role', async () => {
    const error = await errorFrom(
      toInlineImage(`${ORIGIN}/storage/v1/object/public/private-documents/contrato.pdf`),
    );

    expect(error.code).toBe('IMAGE_URL_INVALID');
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('travessia de caminho é recusada antes de qualquer fetch', async () => {
    const error = await errorFrom(
      toInlineImage(`${ORIGIN}/storage/v1/object/public/${BUCKET}/stickers/../segredo.webp`),
    );

    expect(error.code).toBe('IMAGE_URL_INVALID');
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('URL vazia é erro tipado', async () => {
    const error = await errorFrom(toInlineImage('   '));

    expect(error.code).toBe('IMAGE_URL_INVALID');
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('sem credencial de serviço no ambiente: IMAGE_STORAGE_UNAVAILABLE', async () => {
    delete env.SUPABASE_SERVICE_ROLE_KEY;

    const error = await errorFrom(toInlineImage(PUBLIC_URL));

    expect(error.code).toBe('IMAGE_STORAGE_UNAVAILABLE');
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('exporta o status HTTP sugerido por código (o endpoint mapeia sem tabela própria)', async () => {
    const codes: AiImageInputErrorCode[] = [
      'IMAGE_URL_INVALID',
      'IMAGE_STORAGE_UNAVAILABLE',
      'IMAGE_DOWNLOAD_FAILED',
      'IMAGE_TOO_LARGE',
      'IMAGE_TYPE_INVALID',
    ];
    const status = codes.map((code) => new AiImageInputError(code, 'x').status);

    expect(status).toEqual([400, 500, 502, 413, 415]);
  });

  it('toJSON() entrega o corpo do erro com code, bytes e limite', async () => {
    const error = new AiImageInputError('IMAGE_TOO_LARGE', 'grande', {
      bytes: 9,
      limitBytes: 4,
      contentType: 'image/webp',
    });

    expect(error.toJSON()).toMatchObject({
      code: 'IMAGE_TOO_LARGE',
      status: 413,
      bytes: 9,
      limitBytes: 4,
      contentType: 'image/webp',
    });
  });
});

describe('toInlineImage — data URL já pronta (sem rede)', () => {
  it('devolve a data URL como está, sem nenhuma chamada de fetch', async () => {
    const dataUrl = `data:image/png;base64,${Buffer.from([1, 2, 3, 4, 5]).toString('base64')}`;

    const result = await toInlineImage(dataUrl);

    expect(result.dataUrl).toBe(dataUrl);
    expect(result.mime).toBe('image/png');
    expect(result.bytes).toBe(5);
    expect(result.bucket).toBeNull();
    expect(result.path).toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('data URL que não é imagem é recusada sem rede', async () => {
    const error = await errorFrom(toInlineImage('data:text/plain;base64,SGk='));

    expect(error.code).toBe('IMAGE_TYPE_INVALID');
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
