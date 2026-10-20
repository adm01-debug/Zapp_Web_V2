/**
 * R2-J06 — ligações entram na jornada do contato (`calls` como fonte da timeline).
 *
 * Prova que o hook REAL monta um evento `kind: 'call'` a partir de uma linha de
 * `calls`, com resultado e duração no subtítulo, e que a leitura usa só colunas
 * que já existem na tabela.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';

const banco = vi.hoisted(() => ({
  chamadas: [] as Array<Record<string, unknown>>,
  mensagens: [] as Array<Record<string, unknown>>,
  notas: [] as Array<Record<string, unknown>>,
  colunasChamadas: [] as string[],
}));

vi.mock('@/integrations/supabase/client', () => {
  const cadeia = (tabela: string) => {
    const c: Record<string, unknown> = {};
    c.select = (cols: string) => {
      if (tabela === 'calls') banco.colunasChamadas.push(cols);
      return c;
    };
    c.eq = () => c;
    c.order = () => c;
    c.limit = () => c;
    c.gte = () => c;
    c.in = () => c;
    c.then = (resolve: (v: unknown) => unknown) =>
      resolve({
        data:
          tabela === 'calls'
            ? banco.chamadas
            : tabela === 'messages'
              ? banco.mensagens
              : tabela === 'contact_notes'
                ? banco.notas
                : [],
        error: null,
      });
    return c;
  };
  return { supabase: { from: (tabela: string) => cadeia(tabela) } };
});

import { useConversationHistoryTimeline, type TimelineTypeFilter } from '@/hooks/chat/useConversationHistoryTimeline';

const wrapper = ({ children }: { children: ReactNode }) => (
  <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>{children}</QueryClientProvider>
);

const montar = (tipo: TimelineTypeFilter = 'all') =>
  renderHook(() => useConversationHistoryTimeline('contato-1', 30, tipo, 50), { wrapper });

const eventosDe = (days: Array<{ events: Array<{ kind: string }> }>) => days.flatMap((d) => d.events);

describe('useConversationHistoryTimeline — ligações (R2-J06)', () => {
  beforeEach(() => {
    banco.chamadas = [];
    banco.mensagens = [];
    banco.notas = [];
    banco.colunasChamadas = [];
  });

  it('ligação atendida vira evento "Chamada realizada" com resultado e duração', async () => {
    banco.chamadas = [
      {
        id: 'call-1',
        direction: 'outbound',
        status: 'ended',
        started_at: '2026-09-29T14:00:00.000Z',
        duration_seconds: 125,
        answered_at: '2026-09-29T14:00:05.000Z',
        ended_at: '2026-09-29T14:02:05.000Z',
      },
    ];

    const { result } = montar();
    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    const chamada = eventosDe(result.current.data!.days as never).find((e) => e.kind === 'call');
    expect(chamada).toMatchObject({
      id: 'call-call-1',
      title: 'Chamada realizada',
      subtitle: 'Concluída · 2min 5s',
    });
    expect(result.current.data!.metrics.total).toBe(1);
  });

  it('ligação recebida não atendida mostra "Chamada recebida" / "Perdida" e nenhuma duração', async () => {
    banco.chamadas = [
      {
        id: 'call-2',
        direction: 'inbound',
        status: 'missed',
        started_at: '2026-09-30T09:15:00.000Z',
        duration_seconds: null,
        answered_at: null,
        ended_at: '2026-09-30T09:15:20.000Z',
      },
    ];

    const { result } = montar();
    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    const chamada = eventosDe(result.current.data!.days as never).find((e) => e.kind === 'call');
    expect(chamada).toMatchObject({ title: 'Chamada recebida', subtitle: 'Perdida' });
  });

  it('filtro de tipo "calls" traz só ligações', async () => {
    banco.chamadas = [
      {
        id: 'call-3',
        direction: 'outbound',
        status: 'missed',
        started_at: '2026-09-30T10:00:00.000Z',
        duration_seconds: 0,
        answered_at: null,
        ended_at: null,
      },
    ];
    banco.mensagens = [
      { id: 'msg-1', sender: 'contact', content: 'oi', media_url: null, media_filename: null, media_size: null, created_at: '2026-09-30T10:05:00.000Z' },
    ];

    const { result } = montar('calls');
    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    const tipos = new Set(eventosDe(result.current.data!.days as never).map((e) => e.kind));
    expect(tipos).toEqual(new Set(['call']));
  });

  it('mistura mensagem + chamada + nota e ordena por data (mais recente primeiro)', async () => {
    banco.mensagens = [
      { id: 'msg-1', sender: 'contact', content: 'oi', media_url: null, media_filename: null, media_size: null, created_at: '2026-09-28T10:00:00.000Z' },
    ];
    banco.notas = [{ id: 'nota-1', content: 'Nota interna', created_at: '2026-09-29T11:00:00.000Z' }];
    banco.chamadas = [
      {
        id: 'call-4',
        direction: 'outbound',
        status: 'ended',
        started_at: '2026-09-30T12:00:00.000Z',
        duration_seconds: 60,
        answered_at: '2026-09-30T12:00:05.000Z',
        ended_at: '2026-09-30T12:01:00.000Z',
      },
    ];

    const { result } = montar();
    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    const sequencia = eventosDe(result.current.data!.days as never).map((e) => e.kind);
    expect(sequencia).toEqual(['call', 'note', 'message_in']);
    expect(result.current.data!.metrics.total).toBe(3);
  });

  it('lê apenas colunas já existentes em calls', async () => {
    const { result } = montar();
    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(banco.colunasChamadas[0]).toBe(
      'id, direction, status, started_at, duration_seconds, answered_at, ended_at',
    );
  });
});
