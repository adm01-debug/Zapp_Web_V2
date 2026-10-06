/**
 * R2-INB-034 (#328) — "Carregar mais" na Jornada precisa ultrapassar as janelas fixas das consultas.
 *
 * O hook pedia sempre no máximo 500 mensagens e 200 conversation_events, sem cursor, e o `limit`
 * da UI só chegava em buildTimeline — que fatiava a amostra já carregada. Resultado: com 201
 * transferências a tela mostrava 200 e já dizia hasMore=false; com 501 mensagens o "Carregar
 * mais" terminava em 500.
 *
 * Aqui o cliente Supabase é dublado como um servidor paginado de verdade: cada `.limit(n)`
 * devolve no máximo n linhas do conjunto, então a janela de transporte fica observável.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';

const servidor = vi.hoisted(() => ({
  tabelas: {} as Record<string, Array<Record<string, unknown>>>,
  chamadas: [] as Array<{ tabela: string; limite: number | null }>,
}));

vi.mock('@/integrations/supabase/client', () => {
  const construir = (tabela: string) => {
    const estado: { tabela: string; limite: number | null } = { tabela, limite: null };
    servidor.chamadas.push(estado);
    const pagina = () => {
      const linhas = servidor.tabelas[tabela] ?? [];
      const n = estado.limite ?? linhas.length;
      return { data: linhas.slice(0, n), error: null };
    };
    const c: Record<string, unknown> = {};
    c.select = () => c;
    c.eq = () => c;
    c.order = () => c;
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
});
