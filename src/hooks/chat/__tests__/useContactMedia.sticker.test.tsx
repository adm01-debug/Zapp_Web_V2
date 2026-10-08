import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import React from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

/**
 * M05 — figurinhas separadas das imagens (classificação).
 *
 * O webhook grava `message_type = 'sticker'` e a figurinha chega como `image/webp` ou SEM MIME
 * nenhum (484 figurinhas com MIME nulo no banco real). O classificador precisa decidir pelo
 * `message_type` ANTES de qualquer heurística de MIME/extensão — senão a figurinha cai em
 * "Imagens". Estes testes provam os três formatos e a contraprova (imagem de verdade continua
 * imagem, inclusive a legada sem MIME, que cai na extensão).
 */

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

import { useContactMedia } from '@/hooks/chat/useContactMedia';

function createWrapper() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  return ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={qc}>{children}</QueryClientProvider>
  );
}

interface RowOverrides {
  id: string;
  media_url?: string;
  message_type?: string;
  media_type?: string | null;
  media_mimetype?: string | null;
  media_filename?: string | null;
}

/** Linha de `messages` com o mesmo formato que a consulta da aba pede. */
function row(overrides: RowOverrides) {
  return {
    id: overrides.id,
    media_url: overrides.media_url ?? `https://x/${overrides.id}.jpg`,
    message_type: overrides.message_type ?? 'image',
    media_type: overrides.media_type ?? null,
    media_mimetype: overrides.media_mimetype ?? null,
    media_filename: overrides.media_filename ?? null,
    media_size: 2048,
    media_meta: null,
    caption: null,
    content: null,
    sender: 'contact',
    ptt: false,
    created_at: '2026-01-10T10:00:00Z',
  };
}

const ROWS = [
  // O caso do banco real: figurinha sem MIME nenhum, extensão .webp.
  row({ id: 'fig-sem-mime', media_url: 'https://x/stickers/abc.webp', message_type: 'sticker' }),
  // Figurinha que o WhatsApp entrega já como webp.
  row({ id: 'fig-webp', message_type: 'sticker', media_mimetype: 'image/webp' }),
  // Figurinha com o tipo de mídia de imagem preenchido (ainda é figurinha).
  row({ id: 'fig-tipo-imagem', message_type: 'sticker', media_type: 'image', media_mimetype: 'image/jpeg' }),
  // Contraprova: imagem de verdade continua imagem.
  row({ id: 'img', message_type: 'image', media_type: 'image/jpeg', media_mimetype: 'image/jpeg', media_filename: 'foto.jpg' }),
  // Contraprova: imagem legada sem MIME, decidida pela extensão, continua imagem.
  row({ id: 'img-legado', media_url: 'https://x/foto.jpg', message_type: 'image' }),
];

const chain = {
  or: orMock,
  order: orderSpy,
  limit: (...args: unknown[]) => limitSpy(...args),
};

beforeEach(() => {
  vi.clearAllMocks();
  createSignedUrls.mockResolvedValue({ data: [], error: null });
  limitSpy.mockResolvedValue({ data: ROWS, error: null });
  orMock.mockReturnValue(chain);
  orderSpy.mockReturnValue(chain);
  selectSpy.mockReturnValue({
    eq: vi.fn().mockReturnValue({
      not: vi.fn().mockReturnValue(chain),
    }),
  });
  mockFrom.mockImplementation(() => ({ select: selectSpy }));
});

async function classified() {
  const { result } = renderHook(() => useContactMedia('c1'), { wrapper: createWrapper() });
  await waitFor(() => expect(result.current.isLoading).toBe(false));
  return Object.fromEntries(result.current.items.map((item) => [item.id, item]));
}

describe('M05 — classify de figurinha (message_type = sticker)', () => {
  it('devolve `sticker` com MIME nulo, com image/webp e com tipo de imagem', async () => {
    const byId = await classified();
    expect(byId['fig-sem-mime'].type).toBe('sticker');
    expect(byId['fig-webp'].type).toBe('sticker');
    expect(byId['fig-tipo-imagem'].type).toBe('sticker');
  });

  it('não engole o chip Imagens: imagem (com e sem MIME) continua `image`', async () => {
    const byId = await classified();
    expect(byId['img'].type).toBe('image');
    expect(byId['img-legado'].type).toBe('image');
  });

  it('figurinha sem nome humano é rotulada "Figurinha · dd/MM HH:mm"', async () => {
    const byId = await classified();
    expect(byId['fig-sem-mime'].displayName).toMatch(/^Figurinha · \d{2}\/\d{2} \d{2}:\d{2}$/);
  });
});
