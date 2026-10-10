import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor, act } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { createElement, type ReactNode } from 'react';

/**
 * Dublê do cliente Supabase: registra cada método E aplica os MESMOS filtros nas linhas (como o
 * PostgREST filtra no servidor), recortando pelo `.range()` — sem isso, um teste de escopo
 * provaria só que o filtro foi ENVIADO, nunca que a linha errada fica de fora. Só o módulo do
 * cliente é mockado; o hook é o de verdade.
 */
const estado = vi.hoisted(() => ({
  registros: [] as Array<{ tabela: string; metodo: string; args: unknown[] }>,
  linhas: {} as Record<string, unknown[]>,
  erro: {} as Record<string, string>,
}));

vi.mock('@/integrations/supabase/client', () => {
  const valorDe = (linha: Record<string, unknown>, caminho: string): unknown =>
    caminho.split('.').reduce<unknown>((atual, chave) => {
      if (atual === null || atual === undefined) return undefined;
      return (atual as Record<string, unknown>)[chave];
    }, linha);

  const criarCadeia = (tabela: string) => {
    let faixa: [number, number] | null = null;
    const iguais: Array<[string, unknown]> = [];
    const listas: Array<[string, unknown[]]> = [];
    const maiores: Array<[string, string]> = [];
    const menores: Array<[string, string]> = [];

    const registrar = (metodo: string, args: unknown[]) => {
      estado.registros.push({ tabela, metodo, args });
    };

    const combinam = (linha: Record<string, unknown>) =>
      iguais.every(([coluna, valor]) => valorDe(linha, coluna) === valor) &&
      listas.every(([coluna, valores]) => valores.includes(valorDe(linha, coluna))) &&
      maiores.every(([coluna, limite]) => {
        const atual = valorDe(linha, coluna);
        return typeof atual === 'string' && atual !== '' && atual >= limite;
      }) &&
      menores.every(([coluna, limite]) => {
        const atual = valorDe(linha, coluna);
        return typeof atual === 'string' && atual !== '' && atual <= limite;
      });

    const responder = () => {
      if (estado.erro[tabela]) return { data: null, error: { message: estado.erro[tabela] } };
      const linhas = ((estado.linhas[tabela] ?? []) as Record<string, unknown>[]).filter(combinam);
      return { data: faixa ? linhas.slice(faixa[0], faixa[1] + 1) : linhas, error: null };
    };

    const cadeia: Record<string, unknown> = {};
    cadeia.select = (colunas: string) => { registrar('select', [colunas]); return cadeia; };
    cadeia.eq = (coluna: string, valor: unknown) => { registrar('eq', [coluna, valor]); iguais.push([coluna, valor]); return cadeia; };
    cadeia.in = (coluna: string, valores: unknown[]) => { registrar('in', [coluna, valores]); listas.push([coluna, valores]); return cadeia; };
    cadeia.gte = (coluna: string, limite: string) => { registrar('gte', [coluna, limite]); maiores.push([coluna, limite]); return cadeia; };
    cadeia.lte = (coluna: string, limite: string) => { registrar('lte', [coluna, limite]); menores.push([coluna, limite]); return cadeia; };
    cadeia.order = (coluna: string, opcoes: unknown) => { registrar('order', [coluna, opcoes]); return cadeia; };
    cadeia.range = (from: number, to: number) => { registrar('range', [from, to]); faixa = [from, to]; return Promise.resolve(responder()); };
    // thenable: o hook aguarda a própria cadeia quando não há `.range()`
    cadeia.then = (ok: (v: unknown) => unknown, falha?: (e: unknown) => unknown) =>
      Promise.resolve(responder()).then(ok, falha);
    return cadeia;
  };

  return { supabase: { from: (tabela: string) => criarCadeia(tabela) } };
});

import { JOURNEY_TIMELINE_PAGE_SIZE, useJourneyTimeline } from '@/hooks/chat/journey/useJourneyTimeline';
import { resolveRange, toIsoRange } from '@/lib/journey/periodRange';

const wrapper = ({ children }: { children: ReactNode }) =>
  createElement(
    QueryClientProvider,
    { client: new QueryClient({ defaultOptions: { queries: { retry: false } } }) },
    children,
  );

const CONTATO = 'contato-1';
const NOW = new Date('2026-10-06T12:00:00.000Z');
const PERIODO = { preset: '30d' as const };
// Bordas do período EXATAMENTE como o hook as calcula (o dia começa no fuso do aparelho).
const RANGE = toIsoRange(resolveRange(PERIODO, NOW));
const SINCE = RANGE.sinceIso as string;
const UNTIL = RANGE.untilIso as string;

const filtrosDe = (tabela: string) => estado.registros.filter((r) => r.tabela === tabela);
const eventos = (dias: Array<{ events: Array<{ target: { id: string } }> }>) =>
  dias.flatMap((dia) => dia.events);
const alvos = (dias: Array<{ events: Array<{ target: { id: string } }> }>) =>
  eventos(dias).map((evento) => evento.target.id);

function linhaMensagem(over: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: 'msg-1',
    contact_id: CONTATO,
    sender: 'contact',
    agent_id: null,
    content: 'Oi',
    message_type: 'text',
    media_filename: null,
    media_size: null,
    media_type: null,
    created_at: '2026-10-05T15:00:00.000Z',
    ...over,
  };
}

function linhaEvento(over: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: 'ev-1',
    contact_id: CONTATO,
    event_type: 'close',
    from_agent_id: null,
    to_agent_id: null,
    from_queue_id: null,
    to_queue_id: null,
    performed_by: null,
    closure_id: null,
    created_at: '2026-10-05T16:00:00.000Z',
    ...over,
  };
}

function linhaNota(over: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: 'nt-1',
    contact_id: CONTATO,
    author_id: 'maria',
    content: 'nota',
    category: 'note',
    due_date: null,
    is_done: false,
    created_at: '2026-10-05T17:00:00.000Z',
    ...over,
  };
}

function linhaTarefa(over: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: 'tk-1',
    contact_id: CONTATO,
    title: 'tarefa',
    description: null,
    status: 'pending',
    created_by: 'maria',
    assigned_to: null,
    due_date: null,
    completed_at: null,
    started_at: null,
    created_at: '2026-10-04T10:00:00.000Z',
    ...over,
  };
}

function linhaProposta(over: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: 'dl-1',
    contact_id: CONTATO,
    title: 'proposta',
    value: 100,
    status: 'open',
    assigned_to: 'maria',
    created_at: '2026-10-03T10:00:00.000Z',
    won_at: null,
    lost_at: null,
    lost_reason: null,
    ...over,
  };
}

function linhaAtividade(over: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: 'at-1',
    deal_id: 'dl-1',
    activity_type: 'call',
    description: null,
    performed_by: 'maria',
    created_at: '2026-10-03T11:00:00.000Z',
    ...over,
  };
}

function linhaCall(over: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: 'liga-1',
    contact_id: CONTATO,
    direction: 'inbound',
    status: 'ended',
    started_at: '2026-10-05T12:00:00.000Z',
    answered_at: '2026-10-05T12:00:05.000Z',
    ended_at: '2026-10-05T12:01:00.000Z',
    duration_seconds: 60,
    talk_seconds: 55,
    agent_id: 'maria',
    answered_by: 'maria',
    end_reason: 'completed',
    recording_status: 'none',
    ...over,
  };
}

beforeEach(() => {
  estado.registros.length = 0;
  estado.linhas = {};
  estado.erro = {};
});

describe('useJourneyTimeline — timeline completa da aba Histórico', () => {
  it('recorta o período (gte/lte em created_at), no escopo do contato', async () => {
    estado.linhas.messages = [
      linhaMensagem({ id: 'dentro' }),
      linhaMensagem({ id: 'antes', created_at: '2026-09-01T15:00:00.000Z' }),
      linhaMensagem({ id: 'outro', contact_id: 'contato-2' }),
    ];
    const { result } = renderHook(() => useJourneyTimeline(CONTATO, { period: PERIODO, now: NOW }), { wrapper });
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    const filtros = filtrosDe('messages');
    expect(filtros).toContainEqual({ tabela: 'messages', metodo: 'eq', args: ['contact_id', CONTATO] });
    expect(filtros).toContainEqual({ tabela: 'messages', metodo: 'gte', args: ['created_at', SINCE] });
    expect(filtros).toContainEqual({ tabela: 'messages', metodo: 'lte', args: ['created_at', UNTIL] });
    // Ordem determinística + desempate por id dentro da página recortada (a 1ª consulta é a do
    // período atual; a do período anterior, da estatística, traz o mesmo par depois).
    expect(filtros.filter((f) => f.metodo === 'order').map((f) => f.args).slice(0, 2)).toEqual([
      ['created_at', { ascending: false }],
      ['id', { ascending: false }],
    ]);
    expect(filtros).toContainEqual({ tabela: 'messages', metodo: 'range', args: [0, JOURNEY_TIMELINE_PAGE_SIZE - 1] });

    expect(alvos(result.current.days)).toEqual(['dentro']);
  });

  it('filtra por categoria nos dias, mas a contagem de cada tipo não esconde a própria opção', async () => {
    estado.linhas.messages = [linhaMensagem({ id: 'm1' })];
    estado.linhas.conversation_events = [linhaEvento({ id: 'e1', event_type: 'close' })];
    const { result } = renderHook(
      () => useJourneyTimeline(CONTATO, { period: PERIODO, category: 'message', now: NOW }),
      { wrapper },
    );
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    // Dias: só a categoria marcada.
    expect(alvos(result.current.days)).toEqual(['m1']);
    // Contagem (facet): todas as categorias do período continuam contadas.
    expect(result.current.counts.message).toBe(1);
    expect(result.current.counts.case).toBe(1);
    expect(result.current.counts.call).toBe(0);
  });

  it('filtro de usuários: chaves contact/system/id; vários usuários combinam; vazio = todos', async () => {
    estado.linhas.messages = [
      linhaMensagem({ id: 'maria', sender: 'agent', agent_id: 'maria', created_at: '2026-10-05T15:00:00.000Z' }),
      linhaMensagem({ id: 'joao', sender: 'agent', agent_id: 'joao', created_at: '2026-10-05T16:00:00.000Z' }),
      linhaMensagem({ id: 'cliente', sender: 'contact', created_at: '2026-10-05T17:00:00.000Z' }),
    ];

    const soMaria = renderHook(
      () => useJourneyTimeline(CONTATO, { period: PERIODO, users: ['maria'], now: NOW }),
      { wrapper },
    );
    await waitFor(() => expect(soMaria.result.current.isLoading).toBe(false));
    expect(alvos(soMaria.result.current.days)).toEqual(['maria']);
    expect(soMaria.result.current.counts.message).toBe(1);

    const dois = renderHook(
      () => useJourneyTimeline(CONTATO, { period: PERIODO, users: ['maria', 'joao'], now: NOW }),
      { wrapper },
    );
    await waitFor(() => expect(dois.result.current.isLoading).toBe(false));
    expect(alvos(dois.result.current.days).sort()).toEqual(['joao', 'maria']);

    const todos = renderHook(
      () => useJourneyTimeline(CONTATO, { period: PERIODO, users: [], now: NOW }),
      { wrapper },
    );
    await waitFor(() => expect(todos.result.current.isLoading).toBe(false));
    expect(alvos(todos.result.current.days).sort()).toEqual(['cliente', 'joao', 'maria']);
    expect(todos.result.current.actorIds.sort()).toEqual(['joao', 'maria']);
  });

  it('falha de UMA fonte não derruba as outras (isError parcial, lista continua)', async () => {
    estado.erro.messages = 'sem permissão de leitura';
    estado.linhas.conversation_events = [linhaEvento({ id: 'e1', event_type: 'close' })];
    const { result } = renderHook(() => useJourneyTimeline(CONTATO, { period: PERIODO, now: NOW }), { wrapper });
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    expect(result.current.isError).toBe(true);
    expect(alvos(result.current.days)).toEqual(['event-e1']);
  });

  it('agrupa por dia LOCAL, do mais recente para o antigo, e ordena dentro do dia', async () => {
    estado.linhas.messages = [
      linhaMensagem({ id: 'dia5-manha', created_at: '2026-10-05T15:00:00.000Z' }),
      linhaMensagem({ id: 'dia4', created_at: '2026-10-04T15:00:00.000Z' }),
      linhaMensagem({ id: 'dia5-tarde', sender: 'agent', agent_id: 'maria', created_at: '2026-10-05T18:00:00.000Z' }),
    ];
    const { result } = renderHook(() => useJourneyTimeline(CONTATO, { period: PERIODO, now: NOW }), { wrapper });
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    expect(result.current.days.map((dia) => dia.date)).toEqual(['2026-10-05', '2026-10-04']);
    // Dentro do dia, o mais recente primeiro.
    expect(result.current.days[0]!.events.map((evento) => evento.at)).toEqual([
      '2026-10-05T18:00:00.000Z',
      '2026-10-05T15:00:00.000Z',
    ]);
  });

  it('paginação por rolagem: a segunda página entra no loadMore, sem repetir linha', async () => {
    const base = Date.parse('2026-10-06T00:00:00.000Z');
    estado.linhas.messages = Array.from({ length: 250 }, (_, i) =>
      linhaMensagem({
        id: `m-${String(i).padStart(3, '0')}`,
        sender: i % 2 === 0 ? 'agent' : 'contact',
        agent_id: i % 2 === 0 ? 'maria' : null,
        created_at: new Date(base - i * 12 * 60 * 1000).toISOString(),
      }),
    );

    const { result } = renderHook(() => useJourneyTimeline(CONTATO, { period: PERIODO, now: NOW }), { wrapper });
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    expect(result.current.hasMore).toBe(true);
    expect(eventos(result.current.days)).toHaveLength(JOURNEY_TIMELINE_PAGE_SIZE);

    act(() => result.current.loadMore());
    await waitFor(() => expect(eventos(result.current.days)).toHaveLength(250));
    expect(result.current.hasMore).toBe(false);

    const ids = new Set(alvos(result.current.days));
    expect(ids.size).toBe(250); // nenhuma linha repetida entre páginas
  });

  it('statsInput do período e previousStatsInput do período anterior, sem filtro de tela', async () => {
    estado.linhas.messages = [
      linhaMensagem({ id: 'atual' }),
      linhaMensagem({ id: 'arquivo', message_type: 'image', media_filename: 'foto.jpg', media_type: 'image' }),
      linhaMensagem({ id: 'anterior', created_at: '2026-09-01T15:00:00.000Z' }),
    ];
    estado.linhas.calls = [linhaCall({ id: 'liga-1' })];

    const { result } = renderHook(
      () => useJourneyTimeline(CONTATO, { period: PERIODO, category: 'note', now: NOW }),
      { wrapper },
    );
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    await waitFor(() => expect(result.current.previousStatsInput.messages.length).toBeGreaterThan(0));

    // O retrato do período ignora o filtro de categoria da tela.
    expect(result.current.statsInput.messages.map((m) => m.id)).toEqual(['atual']);
    expect(result.current.statsInput.files.map((f) => f.id)).toEqual(['arquivo']);
    expect(result.current.statsInput.calls.map((c) => c.id)).toEqual(['liga-1']);

    // O período anterior vai para a tendência.
    expect(result.current.previousStatsInput.messages.map((m) => m.id)).toEqual(['anterior']);
  });
});
