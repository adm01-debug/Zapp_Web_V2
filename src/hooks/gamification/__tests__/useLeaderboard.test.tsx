import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor, act } from '@testing-library/react';

/**
 * Y07 — ranking de gamificação (`useLeaderboard`). O stub de conquistas filtra
 * pelo `.in(profile_id)` que o hook envia (não devolve a lista inteira) e o
 * relógio não entra: o que importa é o período pedido, o descarte da resposta
 * superada (corrida) e o ciclo do canal de realtime.
 */

type Row = Record<string, unknown>;

const h = vi.hoisted(() => ({
  rpcRows: [] as Row[],
  rpcError: null as { message: string; code?: string } | null,
  rpcCalls: [] as Array<{ fn: string; args: Record<string, unknown> }>,
  manual: false,
  pendentes: [] as Array<{ fn: string; args: Record<string, unknown>; resolve: (v: unknown) => void }>,
  achievements: [] as Row[],
  achievementsError: null as { message: string } | null,
  freioConquistas: false,
  pendentesConquistas: [] as Array<() => void>,
  consultasConquistas: [] as Array<{ col: string; val: unknown[] }>,
  canais: [] as Array<{ topico: string; evento: string; filtro: unknown; cb: () => void }>,
  canaisRemovidos: 0,
}));

vi.mock('@/lib/logger', () => ({
  log: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() },
  logger: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() },
  createLogger: () => ({ debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() }),
  getLogger: () => ({ debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() }),
}));

vi.mock('@/integrations/supabase/client', () => {
  type Construtor = {
    select: () => Construtor;
    order: () => Construtor;
    in: (col: string, val: unknown[]) => Construtor;
    then: (resolve: (v: unknown) => unknown) => unknown;
  };

  const builder = () => {
    let perfilFiltro: unknown[] = [];
    const b: Construtor = {
      select: () => b,
      order: () => b,
      in: (col: string, val: unknown[]) => {
        perfilFiltro = val;
        h.consultasConquistas.push({ col, val });
        return b;
      },
      then: (resolve: (v: unknown) => unknown) => {
        if (h.achievementsError) return Promise.resolve({ data: null, error: h.achievementsError }).then(resolve);
        const rows = h.achievements.filter((a) => perfilFiltro.includes(a.profile_id));
        if (h.freioConquistas) {
          return new Promise<void>((r) => { h.pendentesConquistas.push(() => r()); })
            .then(() => ({ data: rows, error: null }))
            .then(resolve);
        }
        return Promise.resolve({ data: rows, error: null }).then(resolve);
      },
    };
    return b;
  };

  return {
    supabase: {
      rpc: (fn: string, args: Record<string, unknown>) => {
        h.rpcCalls.push({ fn, args });
        if (h.manual) {
          return new Promise((resolve) => h.pendentes.push({ fn, args, resolve }));
        }
        return Promise.resolve({ data: h.rpcRows, error: h.rpcError });
      },
      from: () => builder(),
      channel: (topico: string) => {
        type Canal = {
          on: (evento: string, filtro: unknown, cb: () => void) => Canal;
          subscribe: () => { unsubscribe: () => void };
        };
        const canal: Canal = {
          on: (evento: string, filtro: unknown, cb: () => void) => {
            h.canais.push({ topico, evento, filtro, cb });
            return canal;
          },
          subscribe: () => ({ unsubscribe: vi.fn() }),
        };
        return canal;
      },
      removeChannel: () => { h.canaisRemovidos += 1; },
    },
  };
});

import { log } from '@/lib/logger';
import { useLeaderboard } from '@/hooks/gamification/useLeaderboard';

const logError = log.error as ReturnType<typeof vi.fn>;

const ANA = 'perfil-ana';
const BRUNO = 'perfil-bruno';

function linha(over: Row = {}): Row {
  return {
    profile_id: ANA,
    name: 'Ana',
    avatar: 'https://exemplo/ana.png',
    is_online: true,
    level: 7,
    streak: 4,
    achievements_count: 3,
    xp: 1200,
    conversations_resolved: 30,
    messages_handled: 400,
    avg_response_time: 45,
    satisfaction: 92,
    rank: 1,
    ...over,
  };
}

function estado(rows: Row[] = [linha()], achievements: Row[] = []) {
  h.rpcRows = rows;
  h.rpcError = null;
  h.rpcCalls = [];
  h.manual = false;
  h.pendentes = [];
  h.achievements = achievements;
  h.achievementsError = null;
  h.freioConquistas = false;
  h.pendentesConquistas = [];
  h.consultasConquistas = [];
  h.canais = [];
  h.canaisRemovidos = 0;
  vi.clearAllMocks();
}

async function montar() {
  const hook = renderHook(() => useLeaderboard());
  await waitFor(() => expect(hook.result.current.isLoading).toBe(false));
  return hook;
}

async function responder(indice: number, rows: Row[]) {
  await act(async () => {
    h.pendentes[indice].resolve({ data: rows, error: null });
  });
}

describe('useLeaderboard — leitura do servidor', () => {
  beforeEach(() => estado());

  it('pede o ranking à RPC com o período corrente e limite 10', async () => {
    const { result } = await montar();

    expect(h.rpcCalls[0]).toEqual({ fn: 'dashboard_leaderboard', args: { p_period: 'week', p_limit: 10 } });
    expect(result.current.timeRange).toBe('week');
  });

  it('refaz a consulta com o período escolhido na tela', async () => {
    const { result } = await montar();

    await act(async () => result.current.setTimeRange('month'));
    await waitFor(() => expect(h.rpcCalls.length).toBeGreaterThan(1));

    expect(h.rpcCalls[h.rpcCalls.length - 1]?.args).toEqual({ p_period: 'month', p_limit: 10 });
    expect(result.current.timeRange).toBe('month');
  });

  it('mapeia a linha da RPC para o modelo da tela', async () => {
    const { result } = await montar();

    expect(result.current.agents[0]).toMatchObject({
      id: ANA,
      profile_id: ANA,
      name: 'Ana',
      avatar: 'https://exemplo/ana.png',
      xp: 1200,
      level: 7,
      streak: 4,
      messagesHandled: 400,
      conversationsResolved: 30,
      avgResponseTime: 45,
      satisfaction: 92,
      rank: 1,
      previousRank: 1,
      achievementsCount: 3,
      isOnline: true,
    });
  });

  it('sem nome/avatar/online assume os padrões da tela (nunca undefined solto)', async () => {
    estado([linha({ name: null, avatar: null, is_online: null })]);

    const { result } = await montar();
    expect(result.current.agents[0].name).toBe('Agente');
    expect(result.current.agents[0].avatar).toBeUndefined();
    expect(result.current.agents[0].isOnline).toBe(false);
  });

  it('ranking vazio zera a lista sem buscar conquistas', async () => {
    estado([]);

    const { result } = await montar();
    expect(result.current.agents).toEqual([]);
    expect(h.consultasConquistas).toEqual([]);
  });

  it('erro da RPC é registrado e não deixa a tela carregando para sempre', async () => {
    estado();
    h.rpcError = { message: 'permission denied', code: '42501' };

    const { result } = await montar();
    expect(logError).toHaveBeenCalled();
    expect(result.current.agents).toEqual([]);
    expect(result.current.isLoading).toBe(false);
  });
});

describe('useLeaderboard — conquistas', () => {
  beforeEach(() => estado());

  it('busca as conquistas apenas dos perfis do ranking', async () => {
    estado(
      [linha({ profile_id: ANA, rank: 1 }), linha({ profile_id: BRUNO, name: 'Bruno', rank: 2 })],
      [
        { profile_id: ANA, achievement_type: 'primeiro_atendimento', earned_at: '2026-10-01T10:00:00Z' },
        { profile_id: BRUNO, achievement_type: 'cem_conversas', earned_at: '2026-10-02T10:00:00Z' },
        { profile_id: 'perfil-fora', achievement_type: 'intruso', earned_at: '2026-10-03T10:00:00Z' },
      ],
    );

    const { result } = await montar();

    expect(h.consultasConquistas[0]).toEqual({ col: 'profile_id', val: [ANA, BRUNO] });
    expect(result.current.agents[0].achievements).toEqual(['primeiro_atendimento']);
    expect(result.current.agents[1].achievements).toEqual(['cem_conversas']);
  });

  it('deduplica o tipo e limita a cinco conquistas por agente', async () => {
    estado(
      [linha({ profile_id: ANA })],
      [
        'a',
        'b',
        'c',
        'd',
        'e',
        'f',
        'a',
      ].map((tipo) => ({ profile_id: ANA, achievement_type: tipo, earned_at: '2026-10-01T10:00:00Z' })),
    );

    const { result } = await montar();
    const conquistas = result.current.agents[0].achievements;

    expect(conquistas).toHaveLength(5);
    expect(new Set(conquistas).size).toBe(conquistas.length);
    expect(conquistas).toEqual(['a', 'b', 'c', 'd', 'e']);
  });

  it('agente sem conquistas fica com lista vazia (não com a lista do outro)', async () => {
    estado(
      [linha({ profile_id: ANA, rank: 1 }), linha({ profile_id: BRUNO, name: 'Bruno', rank: 2 })],
      [{ profile_id: ANA, achievement_type: 'a', earned_at: '2026-10-01T10:00:00Z' }],
    );

    const { result } = await montar();
    expect(result.current.agents[0].achievements).toEqual(['a']);
    expect(result.current.agents[1].achievements).toEqual([]);
  });

  it('falha ao ler conquistas não derruba o ranking', async () => {
    estado([linha()], []);
    h.achievementsError = { message: 'timeout' };

    const { result } = await montar();
    expect(result.current.agents).toHaveLength(1);
    expect(result.current.agents[0].achievements).toEqual([]);
  });
});

describe('useLeaderboard — resposta superada (corrida)', () => {
  beforeEach(() => {
    estado();
    h.manual = true;
  });

  it('a resposta do período anterior que chega depois é descartada', async () => {
    const hook = renderHook(() => useLeaderboard());
    await waitFor(() => expect(h.rpcCalls.length).toBe(1)); // semana, pendente

    // A tela troca para "mês" antes de a semana responder.
    await act(async () => hook.result.current.setTimeRange('month'));
    await waitFor(() => expect(h.rpcCalls.length).toBe(2));

    // Responde na ordem inversa: mês (atual) e depois semana (superada).
    await responder(1, [linha({ profile_id: ANA, name: 'Resultado do mês', rank: 1 })]);
    await responder(0, [linha({ profile_id: BRUNO, name: 'Resultado antigo da semana', rank: 1 })]);

    await waitFor(() => expect(hook.result.current.isLoading).toBe(false));
    expect(hook.result.current.agents).toHaveLength(1);
    expect(hook.result.current.agents[0].name).toBe('Resultado do mês');
  });

  it('ranking vazio de um período superado não apaga o ranking atual', async () => {
    const hook = renderHook(() => useLeaderboard());
    await waitFor(() => expect(h.rpcCalls.length).toBe(1));

    await act(async () => hook.result.current.setTimeRange('month'));
    await waitFor(() => expect(h.rpcCalls.length).toBe(2));

    await responder(1, [linha({ profile_id: ANA, name: 'Resultado do mês', rank: 1 })]);
    await waitFor(() => expect(hook.result.current.agents).toHaveLength(1));

    await responder(0, []);
    expect(hook.result.current.agents).toHaveLength(1);
    expect(hook.result.current.agents[0].name).toBe('Resultado do mês');
  });

  it('quem foi superado durante a leitura de conquistas não escreve na tela', async () => {
    h.freioConquistas = true;
    const hook = renderHook(() => useLeaderboard());
    await waitFor(() => expect(h.rpcCalls.length).toBe(1));

    // A requisição da semana era a atual quando leu o ranking e trava na leitura
    // de conquistas.
    await responder(0, [linha({ profile_id: ANA, name: 'semana', rank: 1 })]);
    await waitFor(() => expect(h.pendentesConquistas).toHaveLength(1));

    // Nesse meio-tempo a tela troca de período: a requisição de "hoje" sai.
    await act(async () => hook.result.current.setTimeRange('today'));
    await waitFor(() => expect(h.rpcCalls.length).toBe(2));
    await responder(1, [linha({ profile_id: BRUNO, name: 'hoje', rank: 1 })]);
    await waitFor(() => expect(h.pendentesConquistas).toHaveLength(2));

    // Libera a leitura de conquistas da requisição nova primeiro e a da superada
    // depois: a superada não pode sobrescrever a tela.
    await act(async () => { h.pendentesConquistas[1](); });
    await waitFor(() => expect(hook.result.current.agents[0]?.name).toBe('hoje'));
    await act(async () => { h.pendentesConquistas[0](); });

    expect(hook.result.current.agents[0].name).toBe('hoje');
  });

  it('a resposta superada não rebaixa o carregamento (a requisição atual manda)', async () => {
    const hook = renderHook(() => useLeaderboard());
    await waitFor(() => expect(h.rpcCalls.length).toBe(1));
    await act(async () => hook.result.current.setTimeRange('today'));
    await waitFor(() => expect(h.rpcCalls.length).toBe(2));

    await responder(0, [linha({ name: 'semana' })]);
    expect(hook.result.current.isLoading).toBe(true);

    await responder(1, [linha({ name: 'hoje' })]);
    await waitFor(() => expect(hook.result.current.isLoading).toBe(false));
    expect(hook.result.current.agents[0].name).toBe('hoje');
  });
});

describe('useLeaderboard — atualização manual e realtime', () => {
  beforeEach(() => estado());

  it('atualizar marca "atualizando" e refaz a consulta do período corrente', async () => {
    const { result } = await montar();

    // Segura a RPC do refresh: o estado intermediário tem de aparecer ENQUANTO
    // a consulta está em voo (não só o fim).
    h.manual = true;
    await act(async () => { void result.current.handleRefresh(); });

    expect(result.current.isRefreshing).toBe(true);
    await waitFor(() => expect(h.rpcCalls.length).toBe(2));
    expect(h.rpcCalls[1].args).toEqual({ p_period: 'week', p_limit: 10 });
    expect(h.pendentes).toHaveLength(1);

    await responder(0, [linha()]);
    await waitFor(() => expect(result.current.isRefreshing).toBe(false));
  });

  it('assina as mudanças de agent_stats e refaz o ranking quando elas chegam', async () => {
    await montar();

    expect(h.canais).toHaveLength(1);
    expect(h.canais[0].topico.startsWith('leaderboard-updates:')).toBe(true);
    expect(h.canais[0].filtro).toEqual({ event: '*', schema: 'public', table: 'agent_stats' });

    await act(async () => { h.canais[0].cb(); });
    await waitFor(() => expect(h.rpcCalls.length).toBe(2));
  });

  it('remove o canal ao desmontar', async () => {
    const hook = await montar();
    expect(h.canaisRemovidos).toBe(0);

    hook.unmount();
    expect(h.canaisRemovidos).toBe(1);
  });

  it('troca o canal ao trocar de período (um canal por recorte)', async () => {
    const { result } = await montar();
    expect(h.canais).toHaveLength(1);

    await act(async () => result.current.setTimeRange('today'));
    await waitFor(() => expect(h.canais.length).toBe(2));

    expect(h.canaisRemovidos).toBe(1);
    expect(h.canais[1].topico).not.toBe(h.canais[0].topico);
  });
});
