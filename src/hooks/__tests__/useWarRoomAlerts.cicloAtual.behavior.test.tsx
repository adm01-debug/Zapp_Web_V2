import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import React from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

/**
 * O monitor de SLA da War Room lia `first_response_breached = true` de TODO o
 * histórico: conversa de ciclo antigo, já respondida, continuava contando e o
 * alerta nunca fechava sozinho (medido: 198 violações contra 103 do ciclo).
 *
 * Regra do ciclo ATUAL — a mesma do snapshot da Sala de Crise
 * (`crisis_room_snapshot`): violação ainda em aberto (sem 1ª resposta) OU
 * estourada nas últimas 24 h.
 */
const h = vi.hoisted(() => ({
  /** Filtro `.or(...)` que o hook mandou ao PostgREST: prova da janela. */
  filtroEnviado: null as string | null,
  insert: vi.fn(() => Promise.resolve({ error: null })),
}));

type Linha = {
  id: string;
  first_response_breached: boolean;
  first_response_at: string | null;
  created_at: string;
};

const agora = Date.now();
const HORA = 60 * 60 * 1000;

const linhas: Linha[] = [
  // Violação do ciclo, já respondida dentro da janela → CONTA.
  {
    id: 'sla-ciclo-1',
    first_response_breached: true,
    first_response_at: new Date(agora - 2 * HORA).toISOString(),
    created_at: new Date(agora - 3 * HORA).toISOString(),
  },
  // Estourada, SEM 1ª resposta (violação em aberto) → CONTA, mesmo antiga.
  {
    id: 'sla-ciclo-2',
    first_response_breached: true,
    first_response_at: null,
    created_at: new Date(agora - 72 * HORA).toISOString(),
  },
  // Ciclo antigo, já respondida → NÃO conta.
  {
    id: 'sla-antigo-1',
    first_response_breached: true,
    first_response_at: new Date(agora - 70 * HORA).toISOString(),
    created_at: new Date(agora - 72 * HORA).toISOString(),
  },
  {
    id: 'sla-antigo-2',
    first_response_breached: true,
    first_response_at: new Date(agora - 48 * HORA).toISOString(),
    created_at: new Date(agora - 50 * HORA).toISOString(),
  },
];

vi.mock('@/integrations/supabase/client', () => {
  const canal: Record<string, unknown> = {};
  canal.on = () => canal;
  canal.subscribe = vi.fn(() => ({ unsubscribe: vi.fn() }));

  function leitura(exprDoCiclo: string | null) {
    // O banco falso respeita o filtro que o hook manda — se o hook não restringe
    // o ciclo (código anterior), todas as linhas voltam.
    const limite = exprDoCiclo ? Date.parse(exprDoCiclo.split('created_at.gte.')[1] ?? '') : NaN;
    h.filtroEnviado = exprDoCiclo;
    const doCiclo = Number.isNaN(limite)
      ? linhas
      : linhas.filter(
          (linha) => linha.first_response_at === null || Date.parse(linha.created_at) >= limite,
        );
    return doCiclo.map((linha) => ({ id: linha.id }));
  }

  return {
    supabase: {
      from: vi.fn((tabela: string) => {
        if (tabela === 'conversation_sla') {
          return {
            select: () => ({
              eq: () => ({
                or: (expr: string) => ({
                  order: () => ({ range: () => Promise.resolve({ data: leitura(expr), error: null }) }),
                }),
                // Caminho do código ANTERIOR (sem filtro de ciclo): devolve tudo.
                order: () => ({ range: () => Promise.resolve({ data: leitura(null), error: null }) }),
              }),
            }),
          };
        }
        return {
          select: () => ({
            eq: () => ({ order: () => ({ limit: () => Promise.resolve({ data: [], error: null }) }) }),
          }),
          insert: h.insert,
          update: () => ({ eq: () => Promise.resolve({ error: null }) }),
        };
      }),
      channel: vi.fn(() => canal),
      removeChannel: vi.fn(),
    },
  };
});

vi.mock('@/hooks/system/useNotificationSettings', () => ({
  useNotificationSettings: () => ({
    settings: { soundVolume: 40, soundEnabled: false, browserNotifications: false },
    isQuietHours: () => false,
  }),
}));

import { useWarRoomAlerts } from '@/hooks/business/useWarRoomAlerts';

function wrapper() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  return ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={qc}>{children}</QueryClientProvider>
  );
}

describe('useWarRoomAlerts — monitor de SLA restrito ao ciclo atual', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    h.filtroEnviado = null;
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('consulta a janela do ciclo e alerta só as violações do ciclo (2), não o histórico (4)', async () => {
    renderHook(() => useWarRoomAlerts(), { wrapper: wrapper() });

    await waitFor(() => expect(h.insert).toHaveBeenCalledTimes(1));

    // A leitura pediu a janela: violação em aberto OU criada nas últimas 24 h.
    expect(h.filtroEnviado).toBeTruthy();
    expect(h.filtroEnviado).toContain('first_response_at.is.null');
    expect(h.filtroEnviado).toContain('created_at.gte.');

    const alerta = (h.insert.mock.calls[0] as unknown as [Record<string, unknown>])[0];
    expect(alerta.title).toBe('2 SLA(s) Violado(s)');
    expect(String(alerta.message)).toContain('2 conversas');
  });

  it('violação em aberto (sem 1ª resposta) continua contando mesmo fora da janela de 24 h', async () => {
    renderHook(() => useWarRoomAlerts(), { wrapper: wrapper() });

    await waitFor(() => expect(h.insert).toHaveBeenCalledTimes(1));

    // `sla-ciclo-2` nasceu há 72 h e não tem 1ª resposta: sem ele seriam 1, não 2.
    const alerta = (h.insert.mock.calls[0] as unknown as [Record<string, unknown>])[0];
    expect(alerta.title).toBe('2 SLA(s) Violado(s)');
  });
});
