import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import React from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

const { mockFrom, createSignedUrls } = vi.hoisted(() => ({
  mockFrom: vi.fn(),
  createSignedUrls: vi.fn(),
}));

vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    from: (...args: unknown[]) => mockFrom(...args),
    storage: { from: () => ({ createSignedUrls }) },
  },
}));

vi.mock('@/config/supabase', () => ({ SUPABASE_URL: 'https://test.supabase.co' }));

import {
  AGENT_SENDER_LABEL,
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

const rows = [
  { id: '1', media_url: 'https://x/a.jpg', message_type: 'image', media_type: 'image/jpeg', media_mimetype: 'image/jpeg', media_filename: 'a.jpg', media_size: 1000, media_meta: null, caption: null, content: null, sender: 'contact', ptt: false, created_at: '2026-01-01T10:00:00Z' },
  { id: '2', media_url: 'https://x/b.mp4', message_type: 'video', media_type: 'video/mp4', media_mimetype: 'video/mp4', media_filename: 'b.mp4', media_size: 2000, media_meta: { duration: 12 }, caption: null, content: null, sender: 'agent', ptt: false, created_at: '2026-01-01T11:00:00Z' },
  { id: '3', media_url: PRIVATE_AUDIO, message_type: 'ptt', media_type: null, media_mimetype: null, media_filename: null, media_size: null, media_meta: null, caption: null, content: null, sender: 'contact', ptt: true, created_at: '2026-01-01T12:00:00Z' },
  { id: '4', media_url: 'https://x/d.pdf', message_type: 'document', media_type: 'application/pdf', media_mimetype: 'application/pdf', media_filename: 'contrato.pdf', media_size: 500, media_meta: null, caption: 'contrato', content: null, sender: 'agent', ptt: false, created_at: '2026-01-01T13:00:00Z' },
  // registro legado sem media_type/media_mimetype: cai no fallback por extensao
  { id: '5', media_url: PRIVATE_IMAGE, message_type: 'image', media_type: null, media_mimetype: null, media_filename: null, media_size: null, media_meta: null, caption: null, content: 'legenda antiga', sender: 'contact', ptt: false, created_at: '2026-01-01T09:00:00Z' },
];

const orMock = vi.fn();

beforeEach(() => {
  vi.clearAllMocks();
  createSignedUrls.mockImplementation((paths: string[]) =>
    Promise.resolve({
      data: paths.map((path) => ({ path, signedUrl: `https://signed.test/${path}`, error: null })),
      error: null,
    }),
  );
  mockFrom.mockImplementation(() => ({
    select: vi.fn().mockReturnValue({
      eq: vi.fn().mockReturnValue({
        not: vi.fn().mockReturnValue({
          or: orMock.mockReturnValue({
            order: vi.fn().mockReturnValue({
              limit: vi.fn().mockResolvedValue({ data: rows, error: null }),
            }),
          }),
        }),
      }),
    }),
  }));
});

describe('useContactMedia', () => {
  it('pede ao banco o filtro de apagadas (G3), contando NULL como nao apagada', async () => {
    const { result } = renderHook(() => useContactMedia('c1'), { wrapper: createWrapper() });
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(orMock).toHaveBeenCalledWith('is_deleted.is.null,is_deleted.eq.false');
  });

  it('classifica por media_type/media_mimetype e cai no fallback por extensao para registros legados', async () => {
    const { result } = renderHook(() => useContactMedia('c1'), { wrapper: createWrapper() });
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    const byId = Object.fromEntries(result.current.data!.items.map((i) => [i.id, i]));
    expect(byId['1'].type).toBe('image');
    expect(byId['2'].type).toBe('video');
    expect(byId['3'].type).toBe('audio'); // ptt=true, sem media_type
    expect(byId['4'].type).toBe('document');
    expect(byId['5'].type).toBe('image'); // fallback por extensao .png
  });

  it('conta itens por tipo', async () => {
    const { result } = renderHook(() => useContactMedia('c1'), { wrapper: createWrapper() });
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.data!.counts).toEqual({ all: 5, image: 2, video: 1, audio: 1, document: 1 });
  });

  it('usa caption com fallback para content (legenda gravada como conteudo)', async () => {
    const { result } = renderHook(() => useContactMedia('c1'), { wrapper: createWrapper() });
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    const item5 = result.current.data!.items.find((i) => i.id === '5');
    expect(item5?.caption).toBe('legenda antiga');
  });

  it('assina em lote: um request por bucket, nao um por arquivo (etapa 10)', async () => {
    const { result } = renderHook(() => useContactMedia('c1'), { wrapper: createWrapper() });
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    expect(createSignedUrls).toHaveBeenCalledTimes(2); // whatsapp-media + audio-messages
    const buckets = createSignedUrls.mock.calls.map((call) => call[0] as string[]);
    expect(buckets.flat().length).toBeGreaterThanOrEqual(2);

    const byId = Object.fromEntries(result.current.data!.items.map((i) => [i.id, i]));
    expect(byId['5'].signedUrl).toContain('image/3EB0E6947FC0A0ECAED14D_1790283276022.jpg');
    expect(byId['3'].signedUrl).toContain('audio/ptt-1.ogg');
    expect(typeof byId['5'].expiresAt).toBe('number');
    // objeto que nao e de bucket privado nao ganha URL assinada (o componente resolve sozinho)
    expect(byId['1'].signedUrl).toBeUndefined();
  });

  it('createSignedUrls falhando nao derruba a consulta: item fica sem signedUrl', async () => {
    createSignedUrls.mockImplementation(() => Promise.reject(new Error('storage fora')));
    const { result } = renderHook(() => useContactMedia('c1'), { wrapper: createWrapper() });
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.data!.items.every((i) => i.signedUrl === undefined)).toBe(true);
  });

  it('nao busca quando contactId e nulo', async () => {
    const { result } = renderHook(() => useContactMedia(null), { wrapper: createWrapper() });
    expect(result.current.isLoading).toBe(false);
    expect(result.current.data).toBeUndefined();
    expect(mockFrom).not.toHaveBeenCalled();
  });

  it('rotula o atendente sem dizer "Voce" (G15) e deixa o contato para a UI nomear', async () => {
    const { result } = renderHook(() => useContactMedia('c1'), { wrapper: createWrapper() });
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    const byId = Object.fromEntries(result.current.data!.items.map((i) => [i.id, i]));
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
