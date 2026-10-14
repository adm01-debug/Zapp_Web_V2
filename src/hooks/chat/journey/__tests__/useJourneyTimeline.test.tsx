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
  // Escopo opcional do erro: falha SÓ a consulta cuja cláusula `gte` usa este limite
  // (permite simular "falhou só no período anterior", já que o atual usa outro `since`).
  erroApenasSeGte: {} as Record<string, string>,
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
      if (estado.erro[tabela]) {
        const escopo = estado.erroApenasSeGte[tabela];
        const noEscopo = !escopo || maiores.some(([, limite]) => limite === escopo);
        if (noEscopo) return { data: null, error: { message: estado.erro[tabela] } };
      }
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
import { previousRange, resolveRange, toIsoRange } from '@/lib/journey/periodRange';

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
  estado.erroApenasSeGte = {};
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

describe('useJourneyTimeline — refazer 1 (recusa do revisor)', () => {
  it('atividade do período aparece mesmo quando a proposta foi criada antes dele', async () => {
    estado.linhas.sales_deals = [
      linhaProposta({ id: 'dl-antiga', created_at: '2026-08-01T10:00:00.000Z' }),
    ];
    estado.linhas.deal_activities = [
      linhaAtividade({ id: 'at-1', deal_id: 'dl-antiga', created_at: '2026-10-05T17:00:00.000Z' }),
    ];

    const { result } = renderHook(() => useJourneyTimeline(CONTATO, { period: PERIODO, now: NOW }), {
      wrapper,
    });
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    // A proposta antiga NÃO vira evento (fora do período), mas a atividade dela, sim.
    const lancados = result.current.days.flatMap((dia) => dia.events);
    expect(lancados.map((evento) => evento.category)).toEqual(['deal']);
    expect(alvos(result.current.days)).toEqual(['dl-antiga']);

    // Os ids usados no `in` vêm de TODAS as propostas do contato, sem recorte de período.
    const usosIn = filtrosDe('deal_activities').filter((r) => r.metodo === 'in');
    expect(usosIn).toContainEqual({ tabela: 'deal_activities', metodo: 'in', args: ['deal_id', ['dl-antiga']] });
  });

  it('mapeia notas, tarefas e propostas do período e recorta as de fora', async () => {
    estado.linhas.contact_notes = [
      linhaNota({ id: 'nt-1' }),
      linhaNota({ id: 'nt-velha', created_at: '2026-01-05T10:00:00.000Z' }),
    ];
    estado.linhas.conversation_tasks = [
      linhaTarefa({ id: 'tf-1' }),
      linhaTarefa({ id: 'tf-velha', created_at: '2026-01-05T10:00:00.000Z', created_by: null }),
    ];
    estado.linhas.sales_deals = [
      linhaProposta({ id: 'dl-1' }),
      linhaProposta({ id: 'dl-velha', created_at: '2026-01-05T10:00:00.000Z' }),
    ];

    const { result } = renderHook(() => useJourneyTimeline(CONTATO, { period: PERIODO, now: NOW }), {
      wrapper,
    });
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    const lancados = result.current.days.flatMap((dia) => dia.events);
    const categorias = lancados.map((evento) => evento.category);
    expect(categorias).toContain('note');
    expect(categorias).toContain('task');
    expect(categorias).toContain('deal');
    const ids = alvos(result.current.days);
    expect(ids).toEqual(expect.arrayContaining(['nt-1', 'tf-1', 'dl-1']));
    expect(ids).not.toContain('nt-velha');
    expect(ids).not.toContain('tf-velha');
    expect(ids).not.toContain('dl-velha');
  });

  it('actorCounts conta só os atores da categoria ativa', async () => {
    estado.linhas.messages = [
      linhaMensagem({ id: 'm1', sender: 'agent', agent_id: 'ag-maria', created_at: '2026-10-05T10:00:00.000Z' }),
      linhaMensagem({ id: 'm2', sender: 'agent', agent_id: 'ag-joao', created_at: '2026-10-05T11:00:00.000Z' }),
      linhaMensagem({ id: 'm3', created_at: '2026-10-05T12:00:00.000Z' }),
    ];
    estado.linhas.contact_notes = [linhaNota({ id: 'nt-maria', author_id: 'ag-maria' })];

    const { result } = renderHook(
      () => useJourneyTimeline(CONTATO, { period: PERIODO, category: 'message', now: NOW }),
      { wrapper },
    );
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    // A nota da maria não entra: a categoria ativa é mensagem.
    expect(result.current.actorCounts).toEqual({ 'ag-maria': 1, 'ag-joao': 1, contact: 1 });
  });

  it('statsInput cobre o período inteiro independente da rolagem', async () => {
    const base = Date.parse('2026-10-06T00:00:00.000Z');
    estado.linhas.messages = Array.from({ length: 250 }, (_, i) =>
      linhaMensagem({
        id: `m-${String(i).padStart(3, '0')}`,
        // Remetente alternado como no teste de paginação: sem agrupamento D06 no meio.
        sender: i % 2 === 0 ? 'agent' : 'contact',
        agent_id: i % 2 === 0 ? 'maria' : null,
        created_at: new Date(base - i * 60 * 1000).toISOString(),
      }),
    );

    const { result } = renderHook(() => useJourneyTimeline(CONTATO, { period: PERIODO, now: NOW }), {
      wrapper,
    });
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    // Sem nenhum loadMore: a lista mostra a 1ª página, mas o retrato já cobre tudo.
    expect(eventos(result.current.days)).toHaveLength(JOURNEY_TIMELINE_PAGE_SIZE);
    expect(result.current.statsInput.messages).toHaveLength(250);
  });

  it('período anterior com mais de 200 linhas não trunca o previousStatsInput', async () => {
    const anterior = toIsoRange(previousRange(resolveRange(PERIODO, NOW)));
    const inicio = Date.parse(anterior.sinceIso as string);
    const fim = Date.parse((anterior.untilIso ?? anterior.sinceIso) as string);
    estado.linhas.messages = Array.from({ length: 250 }, (_, i) =>
      linhaMensagem({
        id: `ant-${String(i).padStart(3, '0')}`,
        created_at: new Date(inicio + 3_600_000 + Math.floor(((fim - inicio - 7_200_000) * i) / 250)).toISOString(),
      }),
    );

    const { result } = renderHook(() => useJourneyTimeline(CONTATO, { period: PERIODO, now: NOW }), {
      wrapper,
    });
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    await waitFor(() => expect(result.current.previousStatsInput.messages).toHaveLength(250));
  });

  it('falha só no período anterior marca isError parcial e mantém a lista', async () => {
    const anterior = toIsoRange(previousRange(resolveRange(PERIODO, NOW)));
    estado.linhas.messages = [linhaMensagem({ id: 'dentro' })];
    estado.erro.messages = 'boom-anterior';
    estado.erroApenasSeGte.messages = anterior.sinceIso as string;

    const { result } = renderHook(() => useJourneyTimeline(CONTATO, { period: PERIODO, now: NOW }), {
      wrapper,
    });
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    await waitFor(() => expect(result.current.isError).toBe(true));

    // A lista do período atual continua de pé; só o retrato anterior zera.
    expect(alvos(result.current.days)).toEqual(['dentro']);
    expect(result.current.previousStatsInput.messages).toHaveLength(0);
  });
});
