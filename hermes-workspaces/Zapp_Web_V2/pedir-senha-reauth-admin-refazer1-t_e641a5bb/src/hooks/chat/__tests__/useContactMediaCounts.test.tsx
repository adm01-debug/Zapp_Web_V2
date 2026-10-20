import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import React from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

const { mockFrom, selectSpy, orMock, inMock } = vi.hoisted(() => ({
  mockFrom: vi.fn(),
  selectSpy: vi.fn(),
  orMock: vi.fn(),
  inMock: vi.fn(),
}));

vi.mock('@/integrations/supabase/client', () => ({
  supabase: { from: (...args: unknown[]) => mockFrom(...args) },
}));

import {
  contactMediaCountsKey,
  useContactMediaCounts,
} from '@/hooks/chat/useContactMediaCounts';

function createWrapper() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  return ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={qc}>{children}</QueryClientProvider>
  );
}

const COUNTS: Record<string, number> = { all: 56, image: 50, video: 2, audio: 3, document: 1, sticker: 4 };

/** Thenable no formato devolvido pelo supabase-js com `head: true` (so count). */
function countThenable(key: string) {
  return {
    then: (onFulfilled: (value: { count: number; error: null }) => unknown) =>
      Promise.resolve({ count: COUNTS[key], error: null }).then(onFulfilled),
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  const byMessageType: Record<string, string> = {
    image: 'image', video: 'video', document: 'document', sticker: 'sticker',
  };
  const orResult = {
    ...countThenable('all'),
    in: inMock.mockImplementation((_column: string, values: string[]) => {
      if (values.length > 1) return countThenable('audio');
      return countThenable(byMessageType[values[0]] ?? 'all');
    }),
  };
  orMock.mockReturnValue(orResult);
  selectSpy.mockReturnValue({
    eq: vi.fn().mockReturnValue({
      not: vi.fn().mockReturnValue({ or: orMock }),
    }),
  });
  mockFrom.mockImplementation(() => ({ select: selectSpy }));
});

describe('useContactMediaCounts — contagem exata por tipo (etapa 42)', () => {
  it('dispara 6 consultas `count: exact, head: true` em paralelo, uma por chip', async () => {
    const { result } = renderHook(() => useContactMediaCounts('c1'), { wrapper: createWrapper() });
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    expect(mockFrom).toHaveBeenCalledTimes(6);
    expect(mockFrom).toHaveBeenCalledWith('messages');
    expect(selectSpy).toHaveBeenCalledWith('id', { count: 'exact', head: true });
    expect(result.current.counts).toEqual({ all: 56, image: 50, video: 2, audio: 3, document: 1, sticker: 4 });
  });

  it('figurinha tem contagem própria por `message_type = sticker`', async () => {
    const { result } = renderHook(() => useContactMediaCounts('c1'), { wrapper: createWrapper() });
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(inMock).toHaveBeenCalledWith('message_type', ['sticker']);
    // "Imagens" conta só `message_type = image`: a figurinha não entra nesse chip.
    expect(inMock).toHaveBeenCalledWith('message_type', ['image']);
  });

  it('usa o mesmo filtro de apagadas da lista (etapa 09) — chip Todos bate com o badge', async () => {
    const { result } = renderHook(() => useContactMediaCounts('c1'), { wrapper: createWrapper() });
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(orMock).toHaveBeenCalledWith('is_deleted.is.null,is_deleted.eq.false');
  });

  it('conta audio incluindo ptt (voz do WhatsApp)', async () => {
    const { result } = renderHook(() => useContactMediaCounts('c1'), { wrapper: createWrapper() });
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(inMock).toHaveBeenCalledWith('message_type', ['audio', 'ptt']);
  });

  it('sem contactId nao consulta e devolve zero', () => {
    const { result } = renderHook(() => useContactMediaCounts(null), { wrapper: createWrapper() });
    expect(result.current.isLoading).toBe(false);
    expect(result.current.counts).toEqual({ all: 0, image: 0, video: 0, audio: 0, document: 0, sticker: 0 });
    expect(mockFrom).not.toHaveBeenCalled();
  });

  it('a chave de invalidacao e a mesma usada pela etapa 45', () => {
    expect(contactMediaCountsKey('c1')).toEqual(['media-gallery-counts', 'c1']);
  });
});
