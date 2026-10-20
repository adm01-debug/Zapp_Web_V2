/**
 * R2-MOD-029 (#404) — a leitura dos agendamentos não pode ser engolida pelo histórico.
 *
 * O hook é a única fonte da Agenda (`ScheduleCalendarView`). Antes ele pedia TODOS
 * os status, sem faixa e sem páginas, ordenados por `scheduled_at` crescente: o
 * PostgREST devolve só a primeira página (teto de 1000 linhas), o histórico
 * (enviado/cancelado antigo) ocupava essa página inteira e os pendentes futuros
 * nunca chegavam à tela. O erro de leitura também não era exposto.
 *
 * O servidor falso (`@/test/mocks/scheduledMessagesServer`) reproduz o teto de
 * linhas do PostgREST e registra o que foi pedido.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import React from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import {
  createScheduledMessagesServer,
  fakeScheduledMessage,
  POSTGREST_PAGE,
  type FakeScheduledMessageRow,
  type ScheduledMessagesServer,
} from '@/test/mocks/scheduledMessagesServer';

const held = vi.hoisted(() => ({ server: null as ScheduledMessagesServer | null }));

vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    from: (table: string) => held.server?.from(table),
    auth: {
      onAuthStateChange: vi.fn().mockReturnValue({ data: { subscription: { unsubscribe: vi.fn() } } }),
      getSession: vi.fn().mockResolvedValue({ data: { session: null } }),
    },
  },
}));

const mockUseAuth = vi.fn();
vi.mock('@/hooks/auth/useAuth', () => ({
  useAuth: () => mockUseAuth(),
  AuthProvider: ({ children }: { children?: import("react").ReactNode }) => children,
}));

vi.mock('@/hooks/ui/use-toast', () => ({
  toast: vi.fn(),
  useToast: () => ({ toast: vi.fn() }),
}));

vi.mock('@/lib/logger', () => ({
  log: { error: vi.fn(), debug: vi.fn(), info: vi.fn() },
}));

import { useScheduledMessages } from '@/hooks/chat/useScheduledMessages';

function createWrapper() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  return ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={qc}>{children}</QueryClientProvider>
  );
}

/** Faixa que a Agenda pede (um mês, como o calendário monta). */
const JANELA = { from: '2026-10-01T00:00:00.000Z', to: '2026-10-31T23:59:59.999Z' };

function pendente(id: string, scheduledAt: string, contactId = 'c1'): FakeScheduledMessageRow {
  return fakeScheduledMessage({ id, content: `Pendente ${id}`, contact_id: contactId, scheduled_at: scheduledAt });
}

/** Histórico antigo (enviado) — o que ocupava a primeira página do PostgREST. */
function historico(n: number): FakeScheduledMessageRow[] {
  const base = Date.UTC(2024, 0, 1, 8, 0, 0);
  return Array.from({ length: n }, (_, i) =>
    fakeScheduledMessage({
      id: `hist-${i}`,
      status: 'sent',
      scheduled_at: new Date(base + i * 60_000).toISOString(),
    }),
  );
}

describe('useScheduledMessages', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUseAuth.mockReturnValue({ user: { id: 'u1' } });
    held.server = createScheduledMessagesServer([
      pendente('sm1', '2026-10-02T10:00:00.000Z', 'c1'),
    ]);
  });

  it('fetches scheduled messages', async () => {
    const { result } = renderHook(() => useScheduledMessages('c1', JANELA), { wrapper: createWrapper() });

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    expect(result.current.messages).toBeDefined();
    expect(result.current.messages.map((m) => m.id)).toEqual(['sm1']);
  });

  it('handles fetch error', async () => {
    held.server = createScheduledMessagesServer([], { error: { message: 'Network error' } });

    const { result } = renderHook(() => useScheduledMessages('c1', JANELA), { wrapper: createWrapper() });

    await waitFor(() => {
      expect(result.current.isError).toBe(true);
    });
    expect(result.current.messages).toHaveLength(0);
  });

  it('returns empty messages without contactId', async () => {
    held.server = createScheduledMessagesServer(historico(10));

    const { result } = renderHook(() => useScheduledMessages(), { wrapper: createWrapper() });

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });
    // Só pendentes entram na lista: histórico enviado não é agendamento da Agenda.
    expect(result.current.messages).toHaveLength(0);
  });

  it('põe a leitura só nos pendentes e dentro da faixa pedida', async () => {
    held.server = createScheduledMessagesServer([
      pendente('dentro', '2026-10-10T10:00:00.000Z'),
      pendente('fora', '2026-11-10T10:00:00.000Z'),
    ]);

    const { result } = renderHook(() => useScheduledMessages(undefined, JANELA), { wrapper: createWrapper() });

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    expect(result.current.messages.map((m) => m.id)).toEqual(['dentro']);
    const [pedido] = held.server.queries;
    expect(pedido.eq).toContainEqual(['status', 'pending']);
    expect(pedido.gte).toContainEqual(['scheduled_at', JANELA.from]);
    expect(pedido.lte).toContainEqual(['scheduled_at', JANELA.to]);
    expect(pedido.order).toEqual(['scheduled_at:asc', 'id:asc']);
  });

  it('histórico acima do teto do PostgREST não esconde os pendentes da faixa', async () => {
    held.server = createScheduledMessagesServer([
      ...historico(POSTGREST_PAGE + 500),
      pendente('futuro-1', '2026-10-10T14:30:00.000Z'),
      pendente('futuro-2', '2026-10-12T09:15:00.000Z'),
    ]);

    const { result } = renderHook(() => useScheduledMessages(undefined, JANELA), { wrapper: createWrapper() });

    await waitFor(() => {
      expect(result.current.messages).toHaveLength(2);
    });
    expect(result.current.messages.map((m) => m.id)).toEqual(['futuro-1', 'futuro-2']);
  });

  it('pagina até o fim quando os pendentes passam de uma página', async () => {
    const base = Date.UTC(2026, 9, 1, 0, 0, 0);
    const muitos = Array.from({ length: POSTGREST_PAGE + 5 }, (_, i) =>
      pendente(`p-${i}`, new Date(base + i * 1000).toISOString()),
    );
    held.server = createScheduledMessagesServer(muitos);

    const { result } = renderHook(() => useScheduledMessages(undefined, JANELA), { wrapper: createWrapper() });

    await waitFor(() => {
      expect(result.current.messages).toHaveLength(POSTGREST_PAGE + 5);
    });
    expect(held.server.queries.some((q) => q.range?.[0] === POSTGREST_PAGE)).toBe(true);
  });
});
