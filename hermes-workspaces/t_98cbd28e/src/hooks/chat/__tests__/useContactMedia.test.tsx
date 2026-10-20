import { describe, it, expect, vi, beforeEach } from 'vitest';
import { act, renderHook, waitFor } from '@testing-library/react';
import React from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

const { mockFrom, createSignedUrls, limitSpy, orMock, orderSpy, selectSpy } = vi.hoisted(() => ({
  mockFrom: vi.fn(),
  createSignedUrls: vi.fn(),
  limitSpy: vi.fn(),
  orMock: vi.fn(),
  orderSpy: vi.fn(),
  selectSpy: vi.fn(),
}));

vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    from: (...args: unknown[]) => mockFrom(...args),
    storage: {
      from: (bucket: string) => ({
        createSignedUrls: (paths: string[], ttl: number) => createSignedUrls(bucket, paths, ttl),
      }),
    },
  },
}));

vi.mock('@/config/supabase', () => ({ SUPABASE_URL: 'https://test.supabase.co' }));

import {
  AGENT_SENDER_LABEL,
  MEDIA_PAGE_SIZE,
  displayNameOf,
  extensionOf,
  isTechnicalFilename,
  shortDateTime,
  useContactMedia,
} from '@/hooks/chat/useContactMedia';

function createWrapper() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  return ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={qc}>{children}</QueryClientProvider>
  );
}

const PRIVATE_IMAGE = 'https://test.supabase.co/storage/v1/object/public/whatsapp-media/image/3EB0E6947FC0A0ECAED14D_1790283276022.jpg';
const PRIVATE_AUDIO = 'https://test.supabase.co/storage/v1/object/public/audio-messages/audio/ptt-1.ogg';

interface RowOverrides {
  id?: string;
  media_url?: string;
  created_at?: string;
}

function mediaRow({ id = 'r0', media_url = 'https://x/a.jpg', created_at = '2026-01-01T10:00:00Z' }: RowOverrides = {}) {
  return {
    id, media_url, message_type: 'image', media_type: 'image/jpeg', media_mimetype: 'image/jpeg',
    media_filename: 'a.jpg', media_size: 1000, media_meta: null, caption: null, content: null,
    sender: 'contact', ptt: false, created_at,
  };
}

const rows = [
  mediaRow({ id: '1', media_url: 'https://x/a.jpg', created_at: '2026-01-01T10:00:00Z' }),
  { ...mediaRow({ id: '2', created_at: '2026-01-01T11:00:00Z' }), media_url: 'https://x/b.mp4', message_type: 'video', media_type: 'video/mp4', media_mimetype: 'video/mp4', media_filename: 'b.mp4', media_size: 2000, sender: 'agent' },
  { ...mediaRow({ id: '3', created_at: '2026-01-01T12:00:00Z' }), media_url: PRIVATE_AUDIO, message_type: 'ptt', media_type: null, media_mimetype: null, media_filename: null, media_size: null, ptt: true },
  { ...mediaRow({ id: '4', created_at: '2026-01-01T13:00:00Z' }), media_url: 'https://x/d.pdf', message_type: 'document', media_type: 'application/pdf', media_mimetype: 'application/pdf', media_filename: 'contrato.pdf', media_size: 500, caption: 'contrato', sender: 'agent' },
  { ...mediaRow({ id: '5', created_at: '2026-01-01T09:00:00Z' }), media_url: PRIVATE_IMAGE, message_type: 'image', media_type: null, media_mimetype: null, media_filename: null, media_size: null, content: 'legenda antiga' },
];

// Cadeia real: select -> eq -> not -> or -> [or do cursor] -> order -> order -> limit.
const chain = {
  or: orMock,
  order: orderSpy,
  limit: (...args: unknown[]) => limitSpy(...args),
};

beforeEach(() => {
  vi.clearAllMocks();
  createSignedUrls.mockImplementation((_bucket: string, paths: string[]) =>
    Promise.resolve({
      data: paths.map((path) => ({ path, signedUrl: `https://signed.test/${path}`, error: null })),
      error: null,
    }),
  );
  limitSpy.mockResolvedValue({ data: rows, error: null });
  orMock.mockReturnValue(chain);
  orderSpy.mockReturnValue(chain);
  selectSpy.mockReturnValue({
    eq: vi.fn().mockReturnValue({
      not: vi.fn().mockReturnValue(chain),
    }),
  });
  mockFrom.mockImplementation(() => ({ select: selectSpy }));
});

describe('useContactMedia — paginacao por keyset (etapa 41)', () => {
  it('pede 60+1 por pagina e para no fim quando a pagina vem incompleta', async () => {
    const { result } = renderHook(() => useContactMedia('c1'), { wrapper: createWrapper() });
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    expect(limitSpy).toHaveBeenCalledWith(MEDIA_PAGE_SIZE + 1);
    expect(result.current.items).toHaveLength(5);
    expect(result.current.hasMore).toBe(false);
  });

  it('pagina cheia (61 linhas) tem proxima pagina e o cursor (created_at, id) entra no 2o .or()', async () => {
    const page1 = Array.from({ length: 61 }, (_, i) =>
      mediaRow({ id: `p${i}`, created_at: new Date(Date.UTC(2026, 0, 1) - i * 1000).toISOString() }));
    limitSpy.mockResolvedValueOnce({ data: page1, error: null });

    const { result } = renderHook(() => useContactMedia('c1'), { wrapper: createWrapper() });
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    expect(result.current.items).toHaveLength(60);
    expect(result.current.hasMore).toBe(true);
    // primeira pagina usa so o filtro de apagadas (mesmo `.or` da etapa 09)
    expect(orMock).toHaveBeenCalledTimes(1);
    expect(orMock).toHaveBeenLastCalledWith('is_deleted.is.null,is_deleted.eq.false');

    // segunda pagina: 1 linha → fim da lista
    limitSpy.mockResolvedValueOnce({ data: [mediaRow({ id: 'p60', created_at: '2025-12-31T23:59:59Z' })], error: null });
    await act(async () => { await result.current.fetchNextPage(); });

    await waitFor(() => expect(result.current.items).toHaveLength(61));
    expect(result.current.hasMore).toBe(false);

    // o cursor veio do ULTIMO item da 1a pagina (p59) e usa data E id como desempate.
    const cursorFilter = orMock.mock.calls.map((call) => String(call[0])).find((filter) => filter.includes('created_at.lt.'));
    const lastIso = new Date(Date.UTC(2026, 0, 1) - 59 * 1000).toISOString();
    expect(cursorFilter).toContain(`created_at.lt.${lastIso}`);
    expect(cursorFilter).toContain(`and(created_at.eq.${lastIso},id.lt.p59)`);
  });

  it('aceite etapa 41: 201 itens em 4 paginas de 60 e o 201o aparece no fim', async () => {
    const page = (start: number, count: number) => Array.from({ length: count }, (_, i) =>
      mediaRow({ id: `p${start + i}`, created_at: new Date(Date.UTC(2026, 0, 2) - (start + i) * 1000).toISOString() }));
    limitSpy
      .mockResolvedValueOnce({ data: page(0, 61), error: null })    // 60 carregados + sobra
      .mockResolvedValueOnce({ data: page(60, 61), error: null })
      .mockResolvedValueOnce({ data: page(120, 61), error: null })
      .mockResolvedValueOnce({ data: page(180, 21), error: null }); // ultima: 21, sem sobra

    const { result } = renderHook(() => useContactMedia('c1'), { wrapper: createWrapper() });
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.items).toHaveLength(60);

    await act(async () => { await result.current.fetchNextPage(); });
    await act(async () => { await result.current.fetchNextPage(); });
    await act(async () => { await result.current.fetchNextPage(); });

    await waitFor(() => expect(result.current.items).toHaveLength(201));
    expect(result.current.hasMore).toBe(false);
    // `filtered` e uma lista so: o 201o item esta no fim, sem duplicar ids
    expect(result.current.items[200].id).toBe('p200');
    expect(new Set(result.current.items.map((i) => i.id)).size).toBe(201);
    expect(limitSpy).toHaveBeenCalledTimes(4);
  });

  it('pede ao banco o filtro de apagadas (G3), contando NULL como nao apagada', async () => {
    const { result } = renderHook(() => useContactMedia('c1'), { wrapper: createWrapper() });
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(orMock).toHaveBeenCalledWith('is_deleted.is.null,is_deleted.eq.false');
  });

  it('classifica por media_type/media_mimetype e cai no fallback por extensao para registros legados', async () => {
    const { result } = renderHook(() => useContactMedia('c1'), { wrapper: createWrapper() });
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    const byId = Object.fromEntries(result.current.items.map((i) => [i.id, i]));
    expect(byId['1'].type).toBe('image');
    expect(byId['2'].type).toBe('video');
    expect(byId['3'].type).toBe('audio'); // ptt=true, sem media_type
    expect(byId['4'].type).toBe('document');
    expect(byId['5'].type).toBe('image'); // fallback por extensao .jpg
  });

  it('usa caption com fallback para content (legenda gravada como conteudo)', async () => {
    const { result } = renderHook(() => useContactMedia('c1'), { wrapper: createWrapper() });
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    const item5 = result.current.items.find((i) => i.id === '5');
    expect(item5?.caption).toBe('legenda antiga');
  });

  it('assina em lote: um request por bucket, nao um por arquivo (etapa 10)', async () => {
    const { result } = renderHook(() => useContactMedia('c1'), { wrapper: createWrapper() });
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    expect(createSignedUrls).toHaveBeenCalledTimes(2); // whatsapp-media + audio-messages
    const byId = Object.fromEntries(result.current.items.map((i) => [i.id, i]));
    expect(byId['5'].signedUrl).toContain('image/3EB0E6947FC0A0ECAED14D_1790283276022.jpg');
    expect(byId['3'].signedUrl).toContain('audio/ptt-1.ogg');
    expect(typeof byId['5'].expiresAt).toBe('number');
    expect(byId['1'].signedUrl).toBeUndefined();
  });

  it('createSignedUrls falhando nao derruba a consulta: item fica sem signedUrl', async () => {
    createSignedUrls.mockImplementation(() => Promise.reject(new Error('storage fora')));
    const { result } = renderHook(() => useContactMedia('c1'), { wrapper: createWrapper() });
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.items.every((i) => i.signedUrl === undefined)).toBe(true);
  });

  it('nao busca quando contactId e nulo', async () => {
    const { result } = renderHook(() => useContactMedia(null), { wrapper: createWrapper() });
    expect(result.current.isLoading).toBe(false);
    expect(result.current.items).toEqual([]);
    expect(mockFrom).not.toHaveBeenCalled();
  });

  it('erro de consulta fica exposto sem quebrar o hook (etapa 44)', async () => {
    limitSpy.mockReset();
    limitSpy.mockResolvedValue({ data: null, error: { message: 'rls' } });
    const { result } = renderHook(() => useContactMedia('c1'), { wrapper: createWrapper() });
    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(result.current.items).toEqual([]);
  });

  it('rotula o atendente sem dizer "Voce" (G15) e deixa o contato para a UI nomear', async () => {
    const { result } = renderHook(() => useContactMedia('c1'), { wrapper: createWrapper() });
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    const byId = Object.fromEntries(result.current.items.map((i) => [i.id, i]));
    expect(byId['2'].senderLabel).toBe(AGENT_SENDER_LABEL);
    expect(byId['1'].senderLabel).toBeNull();
  });
});

describe('classificador de nome (etapa 09)', () => {
  it('nome tecnico do WhatsApp vira "<Tipo> · dd/MM HH:mm"', () => {
    expect(isTechnicalFilename('3EB0E6947FC0A0ECAED14D_1790283276022.jpg', 'jpg')).toBe(true);
    const nome = displayNameOf('3EB0E6947FC0A0ECAED14D_1790283276022.jpg', 'image', '2026-09-24T20:54:00Z', PRIVATE_IMAGE);
    expect(nome).toMatch(/^Imagem · \d{2}\/\d{2} \d{2}:\d{2}$/);
  });

  it('nome humano e preservado', () => {
    expect(isTechnicalFilename('contrato.pdf', 'pdf')).toBe(false);
    expect(displayNameOf('contrato.pdf', 'document', '2026-09-24T20:54:00Z', 'https://x/contrato.pdf')).toBe('contrato.pdf');
    expect(displayNameOf('IMG-20231012-WA0001.jpg', 'image', null, 'https://x/IMG-20231012-WA0001.jpg')).toBe('IMG-20231012-WA0001.jpg');
  });

  it('sem nome nenhum, cai no rotulo de tipo + data (nunca vazio)', () => {
    expect(displayNameOf(null, 'audio', '2026-09-24T17:54:00Z', 'https://x/abc.ogg')).toMatch(/^Áudio · \d{2}\/\d{2} \d{2}:\d{2}$/);
    expect(displayNameOf(null, 'video', null, 'https://x/abc.mp4')).toBe('Vídeo');
  });

  it('extrai a extensao do nome ou do path', () => {
    expect(extensionOf('contrato.PDF', 'https://x/y')).toBe('pdf');
    expect(extensionOf(null, 'https://test.supabase.co/storage/v1/object/public/whatsapp-media/image/foto.JPG?x=1')).toBe('jpg');
    expect(extensionOf(null, 'https://x/sem-extensao')).toBeNull();
  });

  it('data invalida nao vira "Invalid Date"', () => {
    expect(shortDateTime('nao-e-data')).toBe('');
    expect(shortDateTime(null)).toBe('');
  });
});

describe('#309 / R2-INB-012 - galeria nao diverge do contador (audio WebM)', () => {
  it('audio WebM sem metadata nao vira video: listagem casa com o chip de Audio', async () => {
    // Regressao do defeito: message_type='audio' + URL .webm, sem media_type/mimetype e sem ptt
    // (o fallback por extensao classificava como video, enquanto o contador conta 'audio').
    limitSpy.mockResolvedValueOnce({
      data: [
        {
          ...mediaRow({ id: 'w1', media_url: 'https://x/storage/audio-messages/c1/voice.webm' }),
          message_type: 'audio', media_type: null, media_mimetype: null,
          media_filename: null, media_size: null, ptt: false,
        },
      ],
      error: null,
    });

    const { result } = renderHook(() => useContactMedia('c1'), { wrapper: createWrapper() });
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    expect(result.current.items).toHaveLength(1);
    expect(result.current.items[0].type).toBe('audio');
  });
});

describe('R2-DB-022 B2 — mídia privada só por assinatura do path canônico (pós ACL)', () => {
  const STORAGE = 'https://test.supabase.co';
  const privateLocator = (bucket: string, path: string) =>
    `${STORAGE}/storage/v1/object/public/${bucket}/${path}`;

  it('assina por bucket com o path canônico (nunca a URL inteira) e mantém o locator durável no item', async () => {
    const { result } = renderHook(() => useContactMedia('c1'), { wrapper: createWrapper() });
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    const calls = createSignedUrls.mock.calls.map(([bucket, paths, ttl]) => ({
      bucket: bucket as string,
      paths: paths as string[],
      ttl: ttl as number,
    }));
    // Sem createSignedUrls (ou com outro path) este teste fica vermelho: é a prova de que a
    // galeria só mostra mídia privada por assinatura.
    expect(calls).toEqual(expect.arrayContaining([
      { bucket: 'whatsapp-media', paths: ['image/3EB0E6947FC0A0ECAED14D_1790283276022.jpg'], ttl: 3600 },
      { bucket: 'audio-messages', paths: ['audio/ptt-1.ogg'], ttl: 3600 },
    ]));
    for (const { paths } of calls) {
      for (const path of paths) expect(path).not.toMatch(/^https?:/);
    }

    const byId = Object.fromEntries(result.current.items.map((i) => [i.id, i]));
    // `url` continua sendo o locator durável (é o que o encaminhamento copia); quem exibe usa `signedUrl`.
    expect(byId['5'].url).toBe(PRIVATE_IMAGE);
    expect(byId['5'].signedUrl).toContain('image/3EB0E6947FC0A0ECAED14D_1790283276022.jpg');
    expect(byId['5'].signedUrl).not.toBe(PRIVATE_IMAGE);
  });

  it('imagem, vídeo, áudio e documento privados saem todos com signedUrl do bucket certo', async () => {
    const row = (id: string, media_url: string, extra: Record<string, unknown>) => ({
      ...mediaRow({ id, media_url }), media_filename: null, media_size: null, ...extra,
    });
    limitSpy.mockResolvedValueOnce({
      data: [
        row('img', privateLocator('whatsapp-media', 'c1/imagem/foto.jpg'), { message_type: 'image', media_type: 'image/jpeg', media_mimetype: 'image/jpeg' }),
        row('vid', privateLocator('whatsapp-media', 'c1/video/clipe.mp4'), { message_type: 'video', media_type: 'video/mp4', media_mimetype: 'video/mp4' }),
        row('aud', privateLocator('audio-messages', 'c1/audio/voz.ogg'), { message_type: 'audio', media_type: 'audio/ogg', media_mimetype: 'audio/ogg' }),
        row('doc', privateLocator('whatsapp-media', 'c1/documento/contrato.pdf'), { message_type: 'document', media_type: 'application/pdf', media_mimetype: 'application/pdf' }),
      ],
      error: null,
    });

    const { result } = renderHook(() => useContactMedia('c1'), { wrapper: createWrapper() });
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    const byId = Object.fromEntries(result.current.items.map((i) => [i.id, i]));
    expect(byId['img'].type).toBe('image');
    expect(byId['img'].signedUrl).toContain('c1/imagem/foto.jpg');
    expect(byId['vid'].type).toBe('video');
    expect(byId['vid'].signedUrl).toContain('c1/video/clipe.mp4');
    expect(byId['aud'].type).toBe('audio');
    expect(byId['aud'].signedUrl).toContain('c1/audio/voz.ogg');
    expect(byId['doc'].type).toBe('document');
    expect(byId['doc'].signedUrl).toContain('c1/documento/contrato.pdf');

    // Dois pedidos no total: um por bucket privado (whatsapp-media com 3 paths, audio-messages com 1).
    expect(createSignedUrls).toHaveBeenCalledTimes(2);
    const whatsapp = createSignedUrls.mock.calls.find(([bucket]) => bucket === 'whatsapp-media');
    expect((whatsapp?.[1] as string[]).sort()).toEqual([
      'c1/documento/contrato.pdf', 'c1/imagem/foto.jpg', 'c1/video/clipe.mp4',
    ]);
  });

  it('bucket divergente (público) não é assinado: nenhum pedido de assinatura para outro bucket', async () => {
    limitSpy.mockResolvedValueOnce({
      data: [mediaRow({ id: 'pub', media_url: privateLocator('stickers', 's1.png') })],
      error: null,
    });

    const { result } = renderHook(() => useContactMedia('c1'), { wrapper: createWrapper() });
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    expect(createSignedUrls).not.toHaveBeenCalled();
    expect(result.current.items[0].signedUrl).toBeUndefined();
    expect(result.current.items[0].url).toBe(privateLocator('stickers', 's1.png'));
  });
});
