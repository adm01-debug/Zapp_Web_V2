import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import React from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

const mockFrom = vi.fn();

vi.mock('@/integrations/supabase/client', () => ({
  supabase: { from: (...args: unknown[]) => mockFrom(...args) },
}));

import { useContactMedia } from '@/hooks/chat/useContactMedia';

function createWrapper() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  return ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={qc}>{children}</QueryClientProvider>
  );
}

const rows = [
  { id: '1', media_url: 'https://x/a.jpg', message_type: 'image', media_type: 'image/jpeg', media_mimetype: 'image/jpeg', media_filename: 'a.jpg', media_size: 1000, media_meta: null, caption: null, content: null, sender: 'contact', ptt: false, created_at: '2026-01-01T10:00:00Z' },
  { id: '2', media_url: 'https://x/b.mp4', message_type: 'video', media_type: 'video/mp4', media_mimetype: 'video/mp4', media_filename: 'b.mp4', media_size: 2000, media_meta: { duration: 12 }, caption: null, content: null, sender: 'agent', ptt: false, created_at: '2026-01-01T11:00:00Z' },
  { id: '3', media_url: 'https://x/c.ogg', message_type: 'ptt', media_type: null, media_mimetype: null, media_filename: null, media_size: null, media_meta: null, caption: null, content: null, sender: 'contact', ptt: true, created_at: '2026-01-01T12:00:00Z' },
  { id: '4', media_url: 'https://x/d.pdf', message_type: 'document', media_type: 'application/pdf', media_mimetype: 'application/pdf', media_filename: 'd.pdf', media_size: 500, media_meta: null, caption: 'contrato', content: null, sender: 'agent', ptt: false, created_at: '2026-01-01T13:00:00Z' },
  // registro legado sem media_type/media_mimetype: cai no fallback por extensao
  { id: '5', media_url: 'https://x/e.png', message_type: 'image', media_type: null, media_mimetype: null, media_filename: null, media_size: null, media_meta: null, caption: null, content: 'legenda antiga', sender: 'contact', ptt: false, created_at: '2026-01-01T09:00:00Z' },
];

describe('useContactMedia', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockFrom.mockImplementation(() => ({
      select: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          not: vi.fn().mockReturnValue({
            order: vi.fn().mockReturnValue({
              limit: vi.fn().mockResolvedValue({ data: rows, error: null }),
            }),
          }),
        }),
      }),
    }));
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

  it('nao busca quando contactId e nulo', async () => {
    const { result } = renderHook(() => useContactMedia(null), { wrapper: createWrapper() });
    expect(result.current.isLoading).toBe(false);
    expect(result.current.data).toBeUndefined();
    expect(mockFrom).not.toHaveBeenCalled();
  });
});
