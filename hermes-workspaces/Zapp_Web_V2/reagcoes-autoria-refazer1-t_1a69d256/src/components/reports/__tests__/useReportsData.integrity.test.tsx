import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import React from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

// R2-MOD-018 / R2-MOD-019 — Relatórios Avançados.
// O mock imita o PostgREST: SEM `range` ele devolve só a primeira página (o teto de linhas),
// COMO no baseline auditado; com `range` devolve a fatia pedida. Assim o teste mede de verdade
// se o hook pagina (ou apenas lê a primeira página e chama o resultado de "total").
const PAGE_CAP = 1000;
const TOTAL_MESSAGES = 1500; // acima do teto → o baseline mostrava 1000
const TOTAL_CONTACTS = 3;

const h = vi.hoisted(() => {
  const cap = 1000;
  const totalMessages = 1500;
  const totalContacts = 3;
  const state = { messagesFail: false };

  const messages = Array.from({ length: totalMessages }, (_, i) => ({
    id: `m${String(i).padStart(5, '0')}`,
    created_at: '2026-10-02T12:00:00.000Z',
    sender: i % 2 === 0 ? 'agent' : 'contact',
    agent_id: 'a1',
    contact_id: 'c1',
    is_read: true,
  }));
  const contacts = Array.from({ length: totalContacts }, (_, i) => ({
    id: `c${i}`,
    created_at: '2026-10-02T12:00:00.000Z',
    assigned_to: 'a1',
    tags: [],
    contact_type: 'lead',
  }));

  function makeQuery(table: string) {
    let from: number | null = null;
    let to: number | null = null;
    const rows = table === 'messages' ? messages : contacts;
    const q: Record<string, unknown> = {
      select: () => q,
      gte: () => q,
      lte: () => q,
      eq: () => q,
      order: () => q,
      range: (f: number, t: number) => { from = f; to = t; return q; },
      then: (resolve: (v: unknown) => unknown) => {
        if (table === 'messages' && state.messagesFail) {
          return Promise.resolve(resolve({ data: null, error: { message: 'boom' } }));
        }
        const slice = from === null
          ? rows.slice(0, cap) // sem paginação: só a primeira página (teto do PostgREST)
          : rows.slice(from, (to ?? 0) + 1).slice(0, cap);
        return Promise.resolve(resolve({ data: slice, error: null }));
      },
    };
    return q;
  }

  return { cap, totalMessages, totalContacts, state, makeQuery };
});

vi.mock('@/integrations/supabase/client', () => ({
  supabase: { from: (table: string) => h.makeQuery(table) },
}));

// useAgents fala com o banco por conta própria; aqui só precisamos que exista.
vi.mock('@/hooks/crm/useAgents', () => ({ useAgents: () => ({ agents: [] }) }));

import { useReportsData } from '../useReportsData';

function wrapper({ children }: { children: React.ReactNode }) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  return <QueryClientProvider client={qc}>{children}</QueryClientProvider>;
}

describe('useReportsData — totais e ausência de dados (R2-MOD-018/019)', () => {
  beforeEach(() => {
    h.state.messagesFail = false;
  });

  it('total do período acima do teto do PostgREST é contado por inteiro, não só a 1ª página', async () => {
    const { result } = renderHook(() => useReportsData(), { wrapper });

    await waitFor(() => expect(result.current.stats.totalMessages).toBe(h.totalMessages));

    expect(result.current.stats.totalMessages).toBe(1500); // baseline: 1000
    expect(result.current.stats.sentMessages).toBe(750);
    expect(result.current.stats.receivedMessages).toBe(750);
    expect(result.current.stats.totalContacts).toBe(h.totalContacts);
    expect(result.current.isIncomplete).toBe(false);
    expect(result.current.isError).toBe(false);
    // Orçamento POR TESTE com causa medida (não é retry nem asserção afrouxada: o
    // `waitFor` e os valores esperados continuam os mesmos). Este teste deixa o hook
    // fazer o trabalho REAL de agrupamento: `chartData` roda `dayKeysOf(30 dias)` ×
    // 1500 mensagens = 45.000 chamadas de `appDayKey()`, que cria um
    // `Intl.DateTimeFormat` novo a cada chamada — 6.119 ms medidos na máquina ociosa
    // (`vitest --reporter=json`). O orçamento padrão de 15 s é 2,5x o custo real:
    // nos logs do integrador este teste reprovou 7 vezes com "Test timed out in
    // 15000ms" e, no mesmo log, o vitest registrou testes de outros três arquivos
    // com 62,8 s / 61,3 s / 54,4 s — a máquina chega a ~4x o orçamento atual. 120 s é
    // o valor que o repositório já usa para teste pesado (singu-adapter.bundle).
  }, 120_000);

  it('falha de leitura é exposta como erro, não como métricas zero confirmadas', async () => {
    h.state.messagesFail = true;
    const { result } = renderHook(() => useReportsData(), { wrapper });

    await waitFor(() => expect(result.current.isError).toBe(true));

    expect(result.current.error).toBeTruthy();
    expect(result.current.isIncomplete).toBe(true); // o que não foi lido não vira total
  });
});
