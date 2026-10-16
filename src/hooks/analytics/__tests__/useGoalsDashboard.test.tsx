import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor, act } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import React from 'react';
import { startOfDay, endOfDay, startOfWeek, endOfWeek, startOfMonth, endOfMonth } from 'date-fns';
import { ptBR } from 'date-fns/locale';

/**
 * Y07 — metas do Dashboard (`useGoalsDashboard`). O stub de cada tabela FILTRA
 * de verdade pelos filtros que o hook envia (`eq`/`gte`/`lte`): leitura com
 * agente/recorte errado ou contando a linha errada fica vermelha. Alvos,
 * `is_active` (E42) e resolução vêm de fixture, nunca somados no teste.
 */

type Row = Record<string, unknown>;
interface TableState { rows: Row[]; error: { message: string; code?: string } | null }

const h = vi.hoisted(() => ({
  user: { id: 'user-1' } as { id: string } | null,
  tables: {} as Record<string, TableState>,
  queries: [] as Array<{ table: string; filters: Array<{ op: string; col: string; val: unknown }> }>,
  held: {} as Record<string, { release: () => void } | undefined>,
}));

vi.mock('@/hooks/auth/useAuth', () => ({ useAuth: () => ({ user: h.user }) }));

type Construtor = {
  select: (...a: unknown[]) => Construtor;
  eq: (col: string, val: unknown) => Construtor;
  gte: (col: string, val: unknown) => Construtor;
  lte: (col: string, val: unknown) => Construtor;
  order: (...a: unknown[]) => Construtor;
  limit: (n: number) => Construtor;
  single: () => Promise<unknown>;
  then: (resolve: (v: unknown) => unknown) => unknown;
};

vi.mock('@/integrations/supabase/client', () => {
  const builder = (table: string) => {
    const cfg: TableState = h.tables[table] ?? { rows: [], error: null };
    const filters: Array<{ op: string; col: string; val: unknown }> = [];
    h.queries.push({ table, filters });

    const matching = () =>
      cfg.rows.filter((row) =>
        filters.every((f) => {
          const v = row[f.col];
          if (f.op === 'eq') return v === f.val;
          if (f.op === 'gte') return String(v) >= String(f.val);
          if (f.op === 'lte') return String(v) <= String(f.val);
          return true;
        }),
      );

    const result = () =>
      cfg.error ? { data: null, error: cfg.error } : { data: matching(), error: null };

    const b: Construtor = {
      select: () => b,
      eq: (col: string, val: unknown) => { filters.push({ op: 'eq', col, val }); return b; },
      gte: (col: string, val: unknown) => { filters.push({ op: 'gte', col, val }); return b; },
      lte: (col: string, val: unknown) => { filters.push({ op: 'lte', col, val }); return b; },
      order: () => b,
      limit: () => b,
      single: () => Promise.resolve(cfg.error ? { data: null, error: cfg.error } : { data: matching()[0] ?? null, error: null }),
      then: (resolve: (v: unknown) => unknown) => {
        const entrega = () => Promise.resolve(result());
        const freio = h.held[table];
        if (!freio) return entrega().then(resolve);
        return new Promise<void>((r) => { freio.release = r; }).then(entrega).then(resolve);
      },
    };
    return b;
  };

  return {
    supabase: {
      from: (table: string) => builder(table),
      channel: () => ({ on: () => ({ subscribe: () => ({ unsubscribe: vi.fn() }) }) }),
      removeChannel: vi.fn(),
      rpc: vi.fn().mockResolvedValue({ data: null, error: null }),
    },
  };
});

import {
  useGoalsDashboard,
  getProgressColor,
  getProgressBgColor,
  PERIOD_OPTIONS,
} from '@/hooks/analytics/useGoalsDashboard';

const PERFIL = 'perfil-1';

function renderGoals() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0, staleTime: 0 } } });
  const Wrapper = ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  );
  return renderHook(() => useGoalsDashboard(), { wrapper: Wrapper });
}

function tabelas(rows: Partial<Record<string, Row[]>> = {}) {
  h.user = { id: 'user-1' };
  h.tables = {
    profiles: { rows: [{ id: PERFIL, user_id: 'user-1', name: 'Ana' }], error: null },
    messages: { rows: rows.messages ?? [], error: null },
    contacts: { rows: rows.contacts ?? [], error: null },
    conversation_analyses: { rows: rows.conversation_analyses ?? [], error: null },
    goals_configurations: { rows: rows.goals_configurations ?? [], error: null },
  };
  h.queries = [];
  h.held = {};
}

const agora = () => new Date();
const horaAPartirDe = (d: Date) => d.toISOString();

async function esperarMetas() {
  const hook = renderGoals();
  await waitFor(() => expect(h.queries.some((q) => q.table === 'messages')).toBe(true));
  await waitFor(() => expect(hook.result.current.isLoading).toBe(false));
  return hook;
}

function metaPorId<T extends { id: string }>(goals: T[], id: string) {
  return goals.find((g) => g.id === id);
}

const meta = (goal_type: string, alvo: number, is_active: boolean | null = true) => ({
  id: `g-${goal_type}`, profile_id: PERFIL, goal_type,
  daily_target: alvo, weekly_target: alvo, monthly_target: alvo, is_active,
});

const metaPorPeriodo = (goal_type: string, diario: number, semanal: number, mensal: number) => ({
  id: `g-${goal_type}`, profile_id: PERFIL, goal_type,
  daily_target: diario, weekly_target: semanal, monthly_target: mensal, is_active: true,
});

const tresMetas = (alvo: number, is_active: boolean | null = true) =>
  ['messages_sent', 'contacts_handled', 'resolution_rate'].map((g) => meta(g, alvo, is_active));

describe('useGoalsDashboard — funções de cor (limites)', () => {
  it.each([
    [0, 'text-destructive'],
    [49, 'text-destructive'],
    [50, 'text-warning'],
    [74, 'text-warning'],
    [75, 'text-primary'],
    [99, 'text-primary'],
    [100, 'text-success'],
    [250, 'text-success'],
  ])('progresso %i%% usa %s', (pct, esperado) => {
    expect(getProgressColor(pct)).toBe(esperado);
  });

  it.each([
    [0, 'bg-destructive'],
    [49, 'bg-destructive'],
    [50, 'bg-warning'],
    [74, 'bg-warning'],
    [75, 'bg-primary'],
    [99, 'bg-primary'],
    [100, 'bg-success'],
  ])('fundo do progresso %i%% usa %s', (pct, esperado) => {
    expect(getProgressBgColor(pct)).toBe(esperado);
  });

  it('oferece exatamente os três períodos do produto', () => {
    expect(PERIOD_OPTIONS.map((o) => o.value)).toEqual(['today', 'week', 'month']);
    expect(PERIOD_OPTIONS.every((o) => o.label.length > 0)).toBe(true);
  });
});

describe('useGoalsDashboard — recorte e leituras', () => {
  beforeEach(() => tabelas());

  it('começa em "hoje" e o recorte cobre o dia local inteiro', async () => {
    const { result } = await esperarMetas();

    expect(result.current.period).toBe('today');
    const d = agora();
    expect(result.current.dateRange.from.toISOString()).toBe(startOfDay(d).toISOString());
    expect(result.current.dateRange.to.toISOString()).toBe(endOfDay(d).toISOString());
  });

  it('a leitura de mensagens filtra pelo agente do perfil e pelo recorte do período', async () => {
    await esperarMetas();

    const q = h.queries.find((x) => x.table === 'messages');
    expect(q).toBeDefined();
    expect(q?.filters).toEqual(
      expect.arrayContaining([
        { op: 'eq', col: 'agent_id', val: PERFIL },
        { op: 'gte', col: 'created_at', val: startOfDay(agora()).toISOString() },
        { op: 'lte', col: 'created_at', val: endOfDay(agora()).toISOString() },
      ]),
    );
  });

  it('troca o período e o recorte passa a ser a semana/mês', async () => {
    const { result } = await esperarMetas();

    await act(async () => result.current.setPeriod('week'));
    await waitFor(() => expect(h.queries.filter((x) => x.table === 'messages').length).toBeGreaterThan(1));

    const d = agora();
    expect(result.current.dateRange.from.toISOString()).toBe(startOfWeek(d, { locale: ptBR }).toISOString());
    expect(result.current.dateRange.to.toISOString()).toBe(endOfWeek(d, { locale: ptBR }).toISOString());

    await act(async () => result.current.setPeriod('month'));
    await waitFor(() => expect(result.current.dateRange.to.toISOString()).toBe(endOfMonth(agora()).toISOString()));
    expect(result.current.dateRange.from.toISOString()).toBe(startOfMonth(agora()).toISOString());
  });

  it('período desconhecido cai no recorte de hoje (não estoura nem devolve vazio)', async () => {
    const { result } = await esperarMetas();

    await act(async () => result.current.setPeriod('trimestre'));
    await waitFor(() => expect(result.current.period).toBe('trimestre'));

    const d = agora();
    expect(result.current.dateRange.from.toISOString()).toBe(startOfDay(d).toISOString());
    expect(result.current.dateRange.to.toISOString()).toBe(endOfDay(d).toISOString());
  });

  it('conta só as mensagens cujo remetente é o agente', async () => {
    const d = agora();
    tabelas({
      messages: [
        { id: 'm1', agent_id: PERFIL, sender: 'agent', created_at: horaAPartirDe(d) },
        { id: 'm2', agent_id: PERFIL, sender: 'contact', created_at: horaAPartirDe(d) },
        { id: 'm3', agent_id: PERFIL, sender: 'agent', created_at: horaAPartirDe(d) },
      ],
    });

    const { result } = await esperarMetas();
    expect(metaPorId(result.current.goals, 'messages-sent')?.current).toBe(2);
  });

  it('não conta mensagem de outro agente (o recorte é do perfil logado)', async () => {
    const d = agora();
    tabelas({
      messages: [
        { id: 'm1', agent_id: 'outro-perfil', sender: 'agent', created_at: horaAPartirDe(d) },
      ],
    });

    const { result } = await esperarMetas();
    expect(metaPorId(result.current.goals, 'messages-sent')?.current).toBe(0);
  });

  it('não conta mensagem fora do recorte do período', async () => {
    const d = agora();
    const ontem = new Date(d.getTime() - 24 * 60 * 60 * 1000);
    tabelas({
      messages: [{ id: 'm1', agent_id: PERFIL, sender: 'agent', created_at: horaAPartirDe(ontem) }],
    });

    const { result } = await esperarMetas();
    expect(metaPorId(result.current.goals, 'messages-sent')?.current).toBe(0);
  });

  it('conta os contatos atribuídos e arredonda a taxa de resolução só de "resolvido"', async () => {
    const d = agora();
    tabelas({
      contacts: [
        { id: 'c1', assigned_to: PERFIL, created_at: horaAPartirDe(d) },
        { id: 'c2', assigned_to: PERFIL, created_at: horaAPartirDe(d) },
      ],
      conversation_analyses: [
        { id: 'a1', analyzed_by: PERFIL, status: 'resolvido', created_at: horaAPartirDe(d) },
        { id: 'a2', analyzed_by: PERFIL, status: 'resolvido', created_at: horaAPartirDe(d) },
        { id: 'a3', analyzed_by: PERFIL, status: 'pendente', created_at: horaAPartirDe(d) },
      ],
    });

    const { result } = await esperarMetas();
    expect(metaPorId(result.current.goals, 'contacts-handled')?.current).toBe(2);
    expect(metaPorId(result.current.goals, 'resolution-rate')?.current).toBe(67);
  });

  it('sem nenhuma análise a taxa de resolução fica em 0 (não vira NaN)', async () => {
    const { result } = await esperarMetas();
    expect(metaPorId(result.current.goals, 'resolution-rate')?.current).toBe(0);
  });

  it('usuário deslogado: nenhuma leitura é disparada e as metas ficam zeradas', async () => {
    tabelas();
    h.user = null;

    const { result } = renderGoals();
    await act(async () => { await Promise.resolve(); });
    expect(h.queries).toHaveLength(0);
    expect(result.current.goals).toHaveLength(3);
    expect(result.current.goals.every((g) => g.current === 0)).toBe(true);
    expect(result.current.overallProgress).toBe(0);
  });

  it('leitura de mensagens pendente mantém isLoading ligado e solta quando responde', async () => {
    tabelas();
    h.held.messages = {} as { release: () => void };
    const hook = renderGoals();

    await waitFor(() => expect(h.queries.some((q) => q.table === 'messages')).toBe(true));
    expect(hook.result.current.isLoading).toBe(true);

    await act(async () => { (h.held.messages as { release: () => void }).release(); });
    await waitFor(() => expect(hook.result.current.isLoading).toBe(false));
    expect(hook.result.current.goals).toHaveLength(3);
  });

  it('erro de leitura não derruba o hook: as metas continuam, com o valor zerado', async () => {
    tabelas();
    h.tables.messages.error = { message: 'permission denied for table messages', code: '42501' };

    const { result } = await esperarMetas();
    expect(result.current.goals).toHaveLength(3);
    expect(metaPorId(result.current.goals, 'messages-sent')?.current).toBe(0);
  });

  it.todo(
    'a falha de leitura (RLS/rede) deveria ser exposta ao usuário em vez de aparecer como meta zerada — hoje o hook não devolve estado de erro (useGoalsDashboard.ts: plausível cartão de correção)',
  );
});

describe('useGoalsDashboard — alvos (padrão e customizados)', () => {
  beforeEach(() => tabelas());

  it('usa o alvo padrão do período escolhido', async () => {
    const { result } = await esperarMetas();
    expect(metaPorId(result.current.goals, 'messages-sent')?.target).toBe(50);
    expect(metaPorId(result.current.goals, 'contacts-handled')?.target).toBe(10);
    expect(metaPorId(result.current.goals, 'resolution-rate')?.target).toBe(80);

    await act(async () => result.current.setPeriod('week'));
    await waitFor(() => expect(result.current.period).toBe('week'));
    expect(metaPorId(result.current.goals, 'messages-sent')?.target).toBe(250);
    expect(metaPorId(result.current.goals, 'contacts-handled')?.target).toBe(50);
    expect(metaPorId(result.current.goals, 'resolution-rate')?.target).toBe(80);

    await act(async () => result.current.setPeriod('month'));
    await waitFor(() => expect(result.current.period).toBe('month'));
    expect(metaPorId(result.current.goals, 'messages-sent')?.target).toBe(1000);
    expect(metaPorId(result.current.goals, 'contacts-handled')?.target).toBe(200);
    expect(metaPorId(result.current.goals, 'resolution-rate')?.target).toBe(85);
  });

  it('a meta configurada pelo perfil substitui o alvo padrão, campo por período', async () => {
    tabelas({ goals_configurations: [metaPorPeriodo('messages_sent', 7, 9, 11)] });

    const { result } = await esperarMetas();
    expect(metaPorId(result.current.goals, 'messages-sent')?.target).toBe(7);

    await act(async () => result.current.setPeriod('week'));
    await waitFor(() => expect(result.current.period).toBe('week'));
    expect(metaPorId(result.current.goals, 'messages-sent')?.target).toBe(9);

    await act(async () => result.current.setPeriod('month'));
    await waitFor(() => expect(result.current.period).toBe('month'));
    expect(metaPorId(result.current.goals, 'messages-sent')?.target).toBe(11);
  });

  it('configuração do período que não existe cai no alvo diário da meta customizada', async () => {
    tabelas({ goals_configurations: [metaPorPeriodo('messages_sent', 7, 9, 11)] });

    const { result } = await esperarMetas();
    await act(async () => result.current.setPeriod('trimestre'));
    await waitFor(() => expect(result.current.period).toBe('trimestre'));
    expect(metaPorId(result.current.goals, 'messages-sent')?.target).toBe(7);
  });

  it('meta desativada sai da lista de metas do período', async () => {
    tabelas({ goals_configurations: [meta('messages_sent', 5, false), meta('contacts_handled', 5, true)] });

    const { result } = await esperarMetas();
    expect(result.current.goals.map((g) => g.id)).toEqual(['contacts-handled', 'resolution-rate']);
  });

  it('E42: config sem is_active (nulo) mantém a meta ATIVA com o alvo padrão', async () => {
    tabelas({ goals_configurations: [meta('messages_sent', 999, null)] });

    const { result } = await esperarMetas();
    const metaMensagens = metaPorId(result.current.goals, 'messages-sent');
    expect(metaMensagens).toBeDefined();
    expect(metaMensagens?.target).toBe(50);
    expect(result.current.goals).toHaveLength(3);
  });
});

describe('useGoalsDashboard — progresso e celebração', () => {
  beforeEach(() => tabelas());

  it('todas as metas desativadas: lista vazia, progresso 0 e nenhuma celebração', async () => {
    const d = agora();
    tabelas({
      messages: [{ id: 'm1', agent_id: PERFIL, sender: 'agent', created_at: horaAPartirDe(d) }],
      goals_configurations: tresMetas(1, false),
    });

    const { result } = await esperarMetas();
    expect(result.current.goals).toEqual([]);
    expect(result.current.overallProgress).toBe(0);
    expect(result.current.completedGoals).toBe(0);
    expect(result.current.showCelebration).toBe(false);
  });

  it('progresso geral limita cada meta a 100% e faz a média das metas ativas', async () => {
    const d = agora();
    tabelas({
      messages: [1, 2, 3, 4].map((n) => ({ id: `m${n}`, agent_id: PERFIL, sender: 'agent', created_at: horaAPartirDe(d) })),
      goals_configurations: [meta('messages_sent', 1), meta('contacts_handled', 1), meta('resolution_rate', 100, false)],
    });

    const { result } = await esperarMetas();
    // (100 + 0) / 2 = 50 — o teto impede que os 400% da primeira puxem a média.
    expect(result.current.overallProgress).toBe(50);
    expect(result.current.completedGoals).toBe(1);
  });

  it('celebra quando todas as metas do período são alcançadas', async () => {
    const d = agora();
    tabelas({
      messages: [{ id: 'm1', agent_id: PERFIL, sender: 'agent', created_at: horaAPartirDe(d) }],
      contacts: [{ id: 'c1', assigned_to: PERFIL, created_at: horaAPartirDe(d) }],
      conversation_analyses: [{ id: 'a1', analyzed_by: PERFIL, status: 'resolvido', created_at: horaAPartirDe(d) }],
      goals_configurations: [meta('messages_sent', 1), meta('contacts_handled', 1), meta('resolution_rate', 80)],
    });

    const { result } = await esperarMetas();
    await waitFor(() => expect(result.current.showCelebration).toBe(true));
    expect(result.current.overallProgress).toBe(100);
    expect(result.current.celebrationData.title).toBe('Todas as Metas Alcançadas! 🏆');
    expect(result.current.celebrationData.emoji).toBe('🎉');
  });

  it('celebra a meta individual com o rótulo, o número e o emoji do tipo de meta', async () => {
    const d = agora();
    tabelas({
      messages: [{ id: 'm1', agent_id: PERFIL, sender: 'agent', created_at: horaAPartirDe(d) }],
      goals_configurations: [meta('messages_sent', 1)],
    });

    const { result } = await esperarMetas();
    await waitFor(() => expect(result.current.showCelebration).toBe(true));
    expect(result.current.celebrationData.title).toBe('Meta Alcançada!');
    expect(result.current.celebrationData.subtitle).toBe('Mensagens Enviadas: 1/1 mensagens');
    expect(result.current.celebrationData.emoji).toBe('💬');
  });

  it('não repete a celebração da mesma meta enquanto ela continua concluída', async () => {
    const d = agora();
    tabelas({
      messages: [{ id: 'm1', agent_id: PERFIL, sender: 'agent', created_at: horaAPartirDe(d) }],
      goals_configurations: [meta('messages_sent', 1)],
    });

    const { result } = await esperarMetas();
    await waitFor(() => expect(result.current.showCelebration).toBe(true));
    const primeira = result.current.celebrationData.title;

    await act(async () => result.current.setShowCelebration(false));
    await act(async () => { await Promise.resolve(); });
    expect(result.current.showCelebration).toBe(false);
    expect(result.current.celebrationData.title).toBe(primeira);
  });

  it.fails('meta com alvo 0 não pode contar como cumprida nem zerar o progresso com NaN', async () => {
    // `daily_target` é DEFAULT 0 e sem CHECK > 0 (migration 20251224024453): com zero
    // mensagens, `(0/0)*100` = NaN e `current >= target` dá a meta por cumprida.
    tabelas({ goals_configurations: [meta('messages_sent', 0), meta('contacts_handled', 0, false), meta('resolution_rate', 0, false)] });

    const { result } = await esperarMetas();
    expect(Number.isNaN(result.current.overallProgress)).toBe(false);
    expect(result.current.completedGoals).toBe(0);
  });
});
