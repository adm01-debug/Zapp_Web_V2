/**
 * R2-INB-034 (#328) — "Carregar mais" na Jornada precisa ultrapassar as janelas fixas das consultas.
 *
 * O hook pedia sempre no máximo 500 mensagens e 200 conversation_events, sem cursor, e o `limit`
 * da UI só chegava em buildTimeline — que fatiava a amostra já carregada. Resultado: com 201
 * transferências a tela mostrava 200 e já dizia hasMore=false; com 501 mensagens o "Carregar
 * mais" terminava em 500.
 *
 * Aqui o cliente Supabase é dublado como um servidor paginado de verdade: cada `.order(col, {ascending})`
 * ordena o conjunto como o PostgREST faria (sem `order` a ordem é arbitrária = a crua do array) e cada
 * `.limit(n)` devolve no máximo n linhas depois da ordenação, então a janela de transporte fica observável.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';

type ChamadaServidor = {
  tabela: string;
  limite: number | null;
  ordem: { coluna: string; ascending: boolean } | null;
};

const servidor = vi.hoisted(() => ({
  tabelas: {} as Record<string, Array<Record<string, unknown>>>,
  chamadas: [] as Array<{ tabela: string; limite: number | null; ordem: { coluna: string; ascending: boolean } | null }>,
}));

vi.mock('@/integrations/supabase/client', () => {
  const construir = (tabela: string) => {
    const estado: ChamadaServidor = { tabela, limite: null, ordem: null };
    servidor.chamadas.push(estado);
    const pagina = () => {
      const linhas = servidor.tabelas[tabela] ?? [];
      const ordem = estado.ordem;
      const ordenadas = ordem
        ? [...linhas].sort((a, b) => {
            const va = String(a[ordem.coluna] ?? '');
            const vb = String(b[ordem.coluna] ?? '');
            return ordem.ascending ? va.localeCompare(vb) : vb.localeCompare(va);
          })
        : linhas;
      const n = estado.limite ?? ordenadas.length;
      return { data: ordenadas.slice(0, n), error: null };
    };
    const c: Record<string, unknown> = {};
    c.select = () => c;
    c.eq = () => c;
    c.order = (coluna: string, opcoes?: { ascending?: boolean }) => {
      estado.ordem = { coluna, ascending: opcoes?.ascending !== false };
      return c;
    };
    c.in = () => c;
    c.gte = () => c;
    c.limit = (n: number) => {
      estado.limite = n;
      return c;
    };
    c.then = (resolve: (v: unknown) => unknown) => Promise.resolve(pagina()).then(resolve);
    return c;
  };
  return { supabase: { from: (tabela: string) => construir(tabela) } };
});

import { useConversationHistoryTimeline } from '@/hooks/chat/useConversationHistoryTimeline';

const wrapper = ({ children }: { children: ReactNode }) => (
  <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>{children}</QueryClientProvider>
);

const ultimoLimite = (tabela: string) => {
  const limites = servidor.chamadas.filter((c) => c.tabela === tabela).map((c) => c.limite);
  return limites[limites.length - 1];
};

const ultimaOrdem = (tabela: string) => {
  const ordens = servidor.chamadas.filter((c) => c.tabela === tabela).map((c) => c.ordem);
  return ordens[ordens.length - 1];
};

const eventoDeConversa = (i: number) => ({
  id: `e${i}`,
  event_type: 'transfer',
  created_at: new Date(Date.UTC(2026, 8, 2, 0, 0, 0) - i * 60_000).toISOString(),
});

const mensagem = (i: number, sender: string) => ({
  id: `m${i}`,
  sender,
  content: `msg ${i}`,
  media_url: null,
  media_filename: null,
  media_size: null,
  created_at: new Date(Date.UTC(2026, 8, 1, 0, 0, 0) - i * 60_000).toISOString(),
});

describe('useConversationHistoryTimeline — paginação além das janelas fixas (#328)', () => {
  beforeEach(() => {
    servidor.tabelas = {};
    servidor.chamadas = [];
  });

  it('com 501 mensagens, "Carregar mais" ultrapassa a janela de 500', async () => {
    // Alterna remetente a cada minuto: sem rajada, cada mensagem vira um evento próprio.
    servidor.tabelas.messages = Array.from({ length: 501 }, (_, i) =>
      mensagem(i, i % 2 === 0 ? 'contact' : 'agent'),
    );

    let limite = 200;
    const { result, rerender } = renderHook(
      () => useConversationHistoryTimeline('c1', 0, 'all', limite),
      { wrapper },
    );
    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    // A consulta acompanha o limit da tela (200 + 1 de sonda), não um teto fixo de 500.
    expect(ultimoLimite('messages')).toBe(201);
    expect(result.current.data?.hasMore).toBe(true);

    // "Carregar mais" na Jornada: limit sobe para 600 e a janela de transporte acompanha.
    limite = 600;
    rerender();
    await waitFor(() => expect(result.current.data?.hasMore).toBe(false));

    expect(ultimoLimite('messages')).toBe(601);
    expect(result.current.data!.days.flatMap((d) => d.events)).toHaveLength(501);
  });

  it('com 201 eventos de conversa, hasMore vem do servidor e não da amostra', async () => {
    servidor.tabelas.conversation_events = Array.from({ length: 201 }, (_, i) => eventoDeConversa(i));

    let limite = 200;
    const { result, rerender } = renderHook(
      () => useConversationHistoryTimeline('c1', 0, 'all', limite),
      { wrapper },
    );
    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(ultimoLimite('conversation_events')).toBe(201);
    expect(result.current.data?.hasMore).toBe(true);
    expect(result.current.data!.days.flatMap((d) => d.events)).toHaveLength(200);

    limite = 400;
    rerender();
    await waitFor(() =>
      expect(result.current.data?.days.flatMap((d) => d.events)).toHaveLength(201),
    );
    expect(result.current.data?.hasMore).toBe(false);
  });

  it('hasMore reflete registro no servidor mesmo quando a amostra agrupa tudo em 1 evento', async () => {
    // 250 mensagens do mesmo remetente em ≤10 min viram UMA rajada: a amostra exibida é 1 evento.
    // Ainda assim existem linhas no servidor além da página — hasMore tem de ser true.
    servidor.tabelas.messages = Array.from({ length: 250 }, (_, i) => mensagem(i, 'contact'));

    const { result } = renderHook(() => useConversationHistoryTimeline('c1', 0, 'all', 200), { wrapper });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(result.current.data!.days.flatMap((d) => d.events)).toHaveLength(1);
    expect(result.current.data?.hasMore).toBe(true);
  });

  it('com 250 atividades de negócio, a página traz as mais recentes (ordem do servidor)', async () => {
    // A consulta de deal_activities só roda quando existe negócio para a conversa.
    servidor.tabelas.sales_deals = [
      { id: 'd1', title: 'Negócio 1', value: null, status: 'open', created_at: '2026-09-01T00:00:00.000Z' },
    ];
    // Ordem CRUA antiga->nova: a atividade mais recente (a249) é a ÚLTIMA do array, então um
    // slice sem ORDER BY devolve a0..a200 e a249 fica de fora da Jornada — o defeito do cartão.
    servidor.tabelas.deal_activities = Array.from({ length: 250 }, (_, i) => ({
      id: `a${i}`,
      deal_id: 'd1',
      description: `atividade ${i}`,
      activity_type: 'note',
      created_at: new Date(Date.UTC(2026, 8, 1, 0, 0, 0) + i * 60_000).toISOString(),
    }));

    const { result } = renderHook(() => useConversationHistoryTimeline('c1', 0, 'all', 200), { wrapper });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(ultimaOrdem('deal_activities')).toEqual({ coluna: 'created_at', ascending: false });

    const ids = result.current.data!.days.flatMap((d) => d.events.map((e) => e.id));
    expect(ids).toContain('activity-a249');
    expect(ids).not.toContain('activity-a0');
    expect(result.current.data?.hasMore).toBe(true);
  });
});
