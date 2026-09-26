import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor, act } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';

type MockRealtimePayload = {
  eventType: 'INSERT' | 'UPDATE' | 'DELETE';
  new: Record<string, unknown> | null;
  old: Record<string, unknown> | null;
};

// Mesmo padrão já corrigido em useRealtimeMessages.test.tsx: um canal real
// por tópico físico (indexado por `:tabela:` no nome do tópico) — o canal
// mockado é cacheado no módulo real (acquireSharedChannel) entre testes, e
// o dispatcher capturado em .on() sempre lê os listeners atuais no momento
// da chamada, então segue válido entre testes.
const realtimeHandlersByTopic: Record<string, (payload: MockRealtimePayload) => void> = {};

const mockChannel = vi.fn((topic: string) => {
  const instance = {
    on: vi.fn((_: string, __: { event: string }, handler: (payload: MockRealtimePayload) => void) => {
      realtimeHandlersByTopic[topic] = handler;
      return instance;
    }),
    subscribe: vi.fn((callback?: (status: string) => void) => {
      callback?.('SUBSCRIBED');
      return instance;
    }),
  };
  return instance;
});

function emitRealtimeEvent(tableSuffix: string, payload: MockRealtimePayload) {
  const topic = Object.keys(realtimeHandlersByTopic).find((t) => t.includes(`:${tableSuffix}:`));
  if (!topic) throw new Error(`Nenhum canal realtime assinado para a tabela "${tableSuffix}"`);
  realtimeHandlersByTopic[topic](payload);
}

let enrichedRow: Record<string, unknown> | null = null;

const mockFrom = vi.fn((table: string) => {
  if (table === 'contacts') {
    return {
      select: vi.fn(() => ({
        eq: vi.fn(() => ({
          single: vi.fn(() => Promise.resolve({ data: enrichedRow, error: null })),
        })),
      })),
    };
  }
  if (table === 'ai_conversation_tags') {
    return {
      select: vi.fn(() => ({
        eq: vi.fn(() => ({
          order: vi.fn(() => Promise.resolve({ data: [], error: null })),
        })),
      })),
    };
  }
  if (table === 'conversation_sla') {
    return {
      select: vi.fn(() => ({
        eq: vi.fn(() => ({
          order: vi.fn(() => ({
            limit: vi.fn(() => ({
              maybeSingle: vi.fn(() => Promise.resolve({ data: null, error: null })),
            })),
          })),
        })),
      })),
    };
  }
  return { select: vi.fn(() => ({ eq: vi.fn(() => Promise.resolve({ data: [], error: null })) })) };
});

vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    from: (...args: Parameters<typeof mockFrom>) => mockFrom(...args),
    channel: (...args: Parameters<typeof mockChannel>) => mockChannel(...args),
    removeChannel: vi.fn(),
  },
}));

vi.mock('@/lib/logger', () => ({
  log: { error: vi.fn(), debug: vi.fn(), info: vi.fn(), warn: vi.fn() },
}));

import { log } from '@/lib/logger';
import { useContactEnrichedData } from '../useContactEnrichedData';

function wrapper({ children }: { children: ReactNode }) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return <QueryClientProvider client={qc}>{children}</QueryClientProvider>;
}

describe('useContactEnrichedData — sincronização ao vivo via Realtime', () => {
  beforeEach(() => {
    enrichedRow = { company: 'Acme', job_title: 'CTO', nickname: null, surname: null, contact_type: 'customer', ai_sentiment: null, ai_priority: null, channel_type: 'whatsapp' };
  });

  it('reflete um UPDATE realtime em contacts (ex: apelido editado pela tela de Contatos) sem precisar do EditContactDialog', async () => {
    const { result } = renderHook(() => useContactEnrichedData('contact-1'), { wrapper });

    await waitFor(() => expect(result.current.enrichedData?.company).toBe('Acme'));
    expect(result.current.enrichedData?.nickname).toBeNull();

    // Simula edição feita por outro caminho (Contatos/merge/import), que
    // grava no banco mas não sabe invalidar o cache deste painel — só o
    // UPDATE realtime chega.
    enrichedRow = { ...enrichedRow!, nickname: 'Mari' };
    act(() => {
      emitRealtimeEvent('contacts', {
        eventType: 'UPDATE',
        new: { id: 'contact-1', nickname: 'Mari' },
        old: { id: 'contact-1', nickname: null },
      });
    });

    await waitFor(() => expect(result.current.enrichedData?.nickname).toBe('Mari'));
  });

  it('lança em vez de esconder erro transitório como sucesso (evita cache "success:null" travado sem retry)', async () => {
    const originalImpl = mockFrom.getMockImplementation()!;
    mockFrom.mockImplementation(((table: string) => {
      if (table === 'contacts') {
        return {
          select: vi.fn(() => ({
            eq: vi.fn(() => ({
              single: vi.fn(() => Promise.resolve({ data: null, error: { message: 'falha transitória' } })),
            })),
          })),
        };
      }
      return originalImpl(table);
    }) as typeof originalImpl);

    const { result } = renderHook(() => useContactEnrichedData('contact-1'), { wrapper });

    await waitFor(() => expect(log.error).toHaveBeenCalled());
    // Não pode virar `null`: isso é tratado como sucesso pelo React Query e
    // trava em cache até o staleTime (5min), sem nova tentativa.
    expect(result.current.enrichedData).toBeUndefined();

    mockFrom.mockImplementation(originalImpl);
  });

  it('não quebra quando contactId muda (assina o canal do novo id)', async () => {
    const { result, rerender } = renderHook(
      ({ contactId }: { contactId: string }) => useContactEnrichedData(contactId),
      { wrapper, initialProps: { contactId: 'contact-1' } }
    );
    await waitFor(() => expect(result.current.enrichedData?.company).toBe('Acme'));

    enrichedRow = { ...enrichedRow!, company: 'OutraEmpresa' };
    rerender({ contactId: 'contact-2' });
    await waitFor(() => expect(result.current.enrichedData?.company).toBe('OutraEmpresa'));
  });
});
