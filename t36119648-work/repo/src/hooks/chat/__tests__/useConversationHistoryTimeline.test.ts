import { describe, it, expect, vi } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { createElement, type ReactNode } from 'react';
import { buildTimeline, type TimelineRawRows } from '@/hooks/chat/useConversationHistoryTimeline';
import { localDayKey } from '@/lib/localDay';

// --- dublê do Supabase: só para provar que a coluna da conclusão viaja na consulta ---
const capturas = vi.hoisted(() => ({ colunas: [] as Array<{ tabela: string; colunas: string }> }));

const LINHAS = vi.hoisted(() => ({
  conversation_tasks: [
    // modelo ATUAL: a conclusão vem no status `done` (workItem.types)
    { id: 't-done', title: 'Orçamento enviado', status: 'done', completed_at: '2026-09-08T12:00:00Z', created_at: '2026-09-08T10:00:00Z' },
    // linha legada: status diferente, mas com carimbo de conclusão
    { id: 't-carimbo', title: 'Retorno do cliente', status: 'pending', completed_at: '2026-09-08T13:00:00Z', created_at: '2026-09-08T11:00:00Z' },
    // sem conclusão nenhuma
    { id: 't-aberta', title: 'Ligar amanhã', status: 'pending', completed_at: null, created_at: '2026-09-08T14:00:00Z' },
  ],
}));

vi.mock('@/integrations/supabase/client', () => {
  const cadeia = (tabela: string) => {
    const c: Record<string, unknown> = {};
    const resultado = { data: (LINHAS as Record<string, unknown[]>)[tabela] ?? [], error: null };
    c.select = (colunas: string) => { capturas.colunas.push({ tabela, colunas }); return c; };
    c.eq = () => c;
    c.order = () => c;
    c.limit = () => c;
    c.gte = () => Promise.resolve(resultado);
    c.in = () => Promise.resolve({ data: [], error: null });
    // thenable: o hook aguarda a própria cadeia quando não há recorte de data
    c.then = (onFulfilled: (v: unknown) => unknown) => Promise.resolve(resultado).then(onFulfilled);
    return c;
  };
  return { supabase: { from: (tabela: string) => cadeia(tabela) } };
});

import { useConversationHistoryTimeline } from '@/hooks/chat/useConversationHistoryTimeline';

function emptyRows(overrides: Partial<TimelineRawRows> = {}): TimelineRawRows {
  return { messages: [], events: [], notes: [], tasks: [], deals: [], activities: [], ...overrides };
}

describe('buildTimeline', () => {
  it('agrupa mensagens consecutivas do mesmo remetente em <=10min numa unica rajada', () => {
    const rows = emptyRows({
      messages: [
        { id: 'm1', sender: 'contact', content: 'Oi', media_url: null, media_filename: null, media_size: null, created_at: '2026-09-08T10:00:00Z' },
        { id: 'm2', sender: 'contact', content: 'Tudo bem?', media_url: null, media_filename: null, media_size: null, created_at: '2026-09-08T10:05:00Z' },
        { id: 'm3', sender: 'agent', content: 'Oi! Tudo sim', media_url: null, media_filename: null, media_size: null, created_at: '2026-09-08T10:20:00Z' },
      ],
    });
    const { days } = buildTimeline(rows);
    const events = days.flatMap((d) => d.events);
    expect(events).toHaveLength(2);
    const burst = events.find((e) => e.count === 2);
    expect(burst?.title).toBe('2 mensagens recebidas');
    expect(burst?.kind).toBe('message_in');
  });

  it('nao agrupa mensagens do mesmo remetente além de 10 minutos', () => {
    const rows = emptyRows({
      messages: [
        { id: 'm1', sender: 'contact', content: 'Oi', media_url: null, media_filename: null, media_size: null, created_at: '2026-09-08T10:00:00Z' },
        { id: 'm2', sender: 'contact', content: 'Ainda aí?', media_url: null, media_filename: null, media_size: null, created_at: '2026-09-08T10:15:00Z' },
      ],
    });
    const { days } = buildTimeline(rows);
    const events = days.flatMap((d) => d.events);
    expect(events).toHaveLength(2);
    expect(events.every((e) => e.count === undefined)).toBe(true);
  });

  it('agrupa eventos por dia (yyyy-MM-dd)', () => {
    const rows = emptyRows({
      messages: [
        { id: 'm1', sender: 'contact', content: 'Dia 1', media_url: null, media_filename: null, media_size: null, created_at: '2026-09-07T10:00:00Z' },
        { id: 'm2', sender: 'contact', content: 'Dia 2', media_url: null, media_filename: null, media_size: null, created_at: '2026-09-08T10:00:00Z' },
      ],
    });
    const { days } = buildTimeline(rows);
    expect(days.map((d) => d.date).sort()).toEqual(['2026-09-07', '2026-09-08']);
  });

  it('agrupa pelo dia LOCAL: 22:30 no fuso do navegador nao cai no dia seguinte', () => {
    // Em UTC-3, 22:30 local ja e 01:30Z do dia seguinte — a fatia UTC do ISO daria o dia errado.
    const at = new Date(2026, 8, 30, 22, 30);
    const rows = emptyRows({
      notes: [{ id: 'n1', content: 'nota da noite', created_at: at.toISOString() }],
    });
    const { days } = buildTimeline(rows);

    expect(days).toHaveLength(1);
    expect(days[0].date).toBe(localDayKey(at));
    expect(days[0].events[0].id).toBe('note-n1');
  });

  it('o evento das 23:59 locais fica no dia local, junto do proprio cabecalho', () => {
    const at = new Date(2026, 8, 30, 23, 59, 30);
    const { days } = buildTimeline(emptyRows({
      messages: [{ id: 'm1', sender: 'contact', content: 'ultima do dia', media_url: null, media_filename: null, media_size: null, created_at: at.toISOString() }],
    }));
    expect(days).toHaveLength(1);
    expect(days[0].date).toBe('2026-09-30');
  });

  it('filtra por tipo — "notes" só retorna eventos de nota', () => {
    const rows = emptyRows({
      messages: [{ id: 'm1', sender: 'contact', content: 'oi', media_url: null, media_filename: null, media_size: null, created_at: '2026-09-08T10:00:00Z' }],
      notes: [{ id: 'n1', content: 'nota', created_at: '2026-09-08T11:00:00Z' }],
    });
    const { days } = buildTimeline(rows, { type: 'notes' });
    const events = days.flatMap((d) => d.events);
    expect(events).toHaveLength(1);
    expect(events[0].kind).toBe('note');
  });

  it('tempo médio de resposta: média dos deltas contact -> próxima mensagem do agente', () => {
    const rows = emptyRows({
      messages: [
        { id: 'm1', sender: 'contact', content: 'oi', media_url: null, media_filename: null, media_size: null, created_at: '2026-09-08T10:00:00Z' },
        { id: 'm2', sender: 'agent', content: 'oi!', media_url: null, media_filename: null, media_size: null, created_at: '2026-09-08T10:05:00Z' }, // 5min
        { id: 'm3', sender: 'contact', content: 'tudo bem?', media_url: null, media_filename: null, media_size: null, created_at: '2026-09-08T11:00:00Z' },
        { id: 'm4', sender: 'agent', content: 'sim', media_url: null, media_filename: null, media_size: null, created_at: '2026-09-08T11:15:00Z' }, // 15min
      ],
    });
    const { metrics } = buildTimeline(rows);
    expect(metrics.avgResponseMin).toBe(10); // (5+15)/2
  });

  it('resoluções conta event_type=close (nao existe resolve/resolved no schema real)', () => {
    const rows = emptyRows({
      events: [
        { id: 'e1', event_type: 'close', created_at: '2026-09-08T10:00:00Z' },
        { id: 'e2', event_type: 'reopen', created_at: '2026-09-08T11:00:00Z' },
        { id: 'e3', event_type: 'close', created_at: '2026-09-08T12:00:00Z' },
      ],
    });
    const { metrics } = buildTimeline(rows);
    expect(metrics.resolutions).toBe(2);
  });

  it('limite de 200 eventos define hasMore', () => {
    const messages = Array.from({ length: 250 }, (_, i) => ({
      id: `m${i}`, sender: i % 2 === 0 ? 'contact' : 'agent', content: `msg ${i}`,
      media_url: null, media_filename: null, media_size: null,
      created_at: new Date(Date.UTC(2026, 8, 1, 0, i)).toISOString(),
    }));
    const { hasMore, days } = buildTimeline(emptyRows({ messages }), { limit: 200 });
    expect(hasMore).toBe(true);
    expect(days.flatMap((d) => d.events).length).toBeLessThanOrEqual(200);
  });

  it('sem dados: dias vazios e métricas honestas (null, nao inventadas)', () => {
    const { days, metrics } = buildTimeline(emptyRows());
    expect(days).toEqual([]);
    expect(metrics).toEqual({ total: 0, lastContactAt: null, avgResponseMin: null, avgResponsePrevMin: null, resolutions: 0 });
  });
});

/**
 * P2 / Journey: a pílula da tarefa olhava só `status === 'completed'` (modelo legado).
 * O modelo atual grava `done` e carimba `completed_at`; sem normalizar, tarefa feita
 * aparecia como "Pendente" no histórico da conversa.
 */
describe('buildTimeline — pílula de tarefa concluída (modelo atual)', () => {
  const pilulaDaTarefa = (task: TimelineRawRows['tasks'][number]) => {
    const { days } = buildTimeline(emptyRows({ tasks: [task] }));
    const evento = days.flatMap((d) => d.events).find((e) => e.kind === 'task');
    expect(evento).toBeDefined();
    return evento!.pill;
  };

  it('status `done` (modelo atual) vira Concluída/success, não Pendente/warning', () => {
    expect(pilulaDaTarefa({ id: 't1', title: 'Orçamento enviado', status: 'done', created_at: '2026-09-08T10:00:00Z' }))
      .toEqual({ label: 'Concluída', tone: 'success' });
  });

  it('`completed_at` preenchido conclui a tarefa mesmo com status legado diferente', () => {
    expect(pilulaDaTarefa({ id: 't2', title: 'Retorno do cliente', status: 'in_progress', completed_at: '2026-09-08T12:00:00Z', created_at: '2026-09-08T10:00:00Z' }))
      .toEqual({ label: 'Concluída', tone: 'success' });
  });

  it('status `completed` (legado) continua Concluída/success — comportamento anterior preservado', () => {
    expect(pilulaDaTarefa({ id: 't3', title: 'Antiga', status: 'completed', created_at: '2026-09-08T10:00:00Z' }))
      .toEqual({ label: 'Concluída', tone: 'success' });
  });

  it('tarefa sem conclusão continua Pendente/warning', () => {
    expect(pilulaDaTarefa({ id: 't4', title: 'Ligar amanhã', status: 'pending', completed_at: null, created_at: '2026-09-08T10:00:00Z' }))
      .toEqual({ label: 'Pendente', tone: 'warning' });
    expect(pilulaDaTarefa({ id: 't5', title: 'Fazendo', status: 'doing', created_at: '2026-09-08T10:00:00Z' }))
      .toEqual({ label: 'Pendente', tone: 'warning' });
  });
});

const wrapper = ({ children }: { children: ReactNode }) =>
  createElement(
    QueryClientProvider,
    { client: new QueryClient({ defaultOptions: { queries: { retry: false } } }) },
    children,
  );

describe('useConversationHistoryTimeline — completed_at viaja na consulta', () => {
  it('a consulta de conversation_tasks pede a coluna completed_at', async () => {
    const { result } = renderHook(() => useConversationHistoryTimeline('contato-1', 0, 'tasks', 200), { wrapper });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    const consultas = capturas.colunas.filter((c) => c.tabela === 'conversation_tasks');
    expect(consultas).toHaveLength(1);
    expect(consultas[0].colunas).toContain('completed_at');
  });

  it('o hook real entrega Concluída para done/carimbo e Pendente para a tarefa aberta', async () => {
    const { result } = renderHook(() => useConversationHistoryTimeline('contato-1', 0, 'tasks', 200), { wrapper });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    const eventos = result.current.data!.days.flatMap((d) => d.events);
    const porId = new Map(eventos.map((e) => [e.id, e]));
    expect(porId.get('task-t-done')?.pill).toEqual({ label: 'Concluída', tone: 'success' });
    expect(porId.get('task-t-carimbo')?.pill).toEqual({ label: 'Concluída', tone: 'success' });
    expect(porId.get('task-t-aberta')?.pill).toEqual({ label: 'Pendente', tone: 'warning' });
  });
});
