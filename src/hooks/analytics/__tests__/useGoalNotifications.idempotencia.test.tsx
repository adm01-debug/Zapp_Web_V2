/**
 * PB-15 (t_34b2c7da) — aviso de meta idempotente e comparação por tipo.
 *
 * 1) **Recarga não duplica**: a chave estável (`dedupe_key`, formato
 *    `goal:v1:<meta>:<período>:<dia>`) vai para o banco e o índice único por
 *    usuário (`ux_notifications_user_dedupe_key`, IA-047) devolve 23505 na
 *    segunda gravação. O hook trata o conflito como sucesso silencioso: UMA
 *    linha no banco e UM anúncio (toast), não dois.
 * 2) **`response_time` é meta em que MENOR é melhor**: cumpre ABAIXO do alvo,
 *    não acima; e 0 (`agent_stats` nulo = sem medição) não conta como cumprida.
 *
 * O mock de `notifications` implementa o índice único de verdade (guardando as
 * linhas por `user_id` + `dedupe_key`) para que o 23505 não seja inventado pelo
 * teste. O hook é o REAL.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor, act } from '@testing-library/react';

interface GoalRow {
  id: string;
  goal_type: string;
  daily_target: number;
  weekly_target: number;
  monthly_target: number;
  profile_id: string | null;
  queue_id: string | null;
  is_active: boolean;
}

interface NotificationRow {
  user_id: string;
  title: string;
  message: string;
  type: string;
  metadata: { goal_id: string; goal_type: string; period: string; current: number; target: number };
  dedupe_key: string;
}

const h = vi.hoisted(() => ({
  state: {
    goals: [] as GoalRow[],
    contatos: 0,
    agentStats: null as { avg_response_time_seconds: number } | null,
    /** A "tabela" notifications, com o índice único de `user_id` + `dedupe_key`. */
    rows: [] as NotificationRow[],
    insertAttempts: 0,
  },
}));

vi.mock('@/integrations/supabase/client', () => {
  const UNIQUE_VIOLATION = {
    code: '23505',
    message: 'duplicate key value violates unique constraint "ux_notifications_user_dedupe_key"',
  };

  class Builder {
    private filters: Array<[string, unknown]> = [];
    constructor(private table: string) {}

    select() { return this; }
    eq(col: string, val: unknown) { this.filters.push([col, val]); return this; }
    not() { return this; }
    gte() { return this; }
    lte() { return this; }
    or() { return this; }

    maybeSingle() { return Promise.resolve(this.result()); }

    insert(linhas: NotificationRow[]) {
      const s = h.state;
      s.insertAttempts += 1;
      const linha = linhas[0];
      const jaExiste = s.rows.some(
        (r) => r.user_id === linha.user_id && r.dedupe_key === linha.dedupe_key
      );
      if (jaExiste) return Promise.resolve({ error: UNIQUE_VIOLATION });
      s.rows.push(linha);
      return Promise.resolve({ error: null });
    }

    private result(): { data?: unknown; count?: number; error: unknown } {
      const s = h.state;
      switch (this.table) {
        case 'profiles':
          return { data: { id: 'p1' }, error: null };
        case 'goals_configurations':
          return { data: s.goals, error: null };
        case 'agent_stats':
          return { data: s.agentStats, error: null };
        case 'contacts':
          return { count: s.contatos, data: null, error: null };
        default:
          return { count: 0, data: null, error: null };
      }
    }

    then(resolve: (v: unknown) => unknown, reject?: (e: unknown) => unknown) {
      return Promise.resolve(this.result()).then(resolve, reject);
    }
  }

  return {
    supabase: {
      from: (table: string) => new Builder(table),
      auth: {
        onAuthStateChange: vi.fn().mockReturnValue({ data: { subscription: { unsubscribe: vi.fn() } } }),
        getSession: vi.fn().mockResolvedValue({ data: { session: null } }),
      },
    },
  };
});

vi.mock('@/hooks/auth/useAuth', () => ({
  useAuth: () => ({ user: { id: 'u1' }, loading: false }),
}));

vi.mock('@/hooks/system/useNotificationSettings', () => ({
  useNotificationSettings: () => ({
    settings: { soundEnabled: false, browserNotifications: false },
    isQuietHours: () => false,
  }),
}));

vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

vi.mock('@/utils/notificationSounds', () => ({
  playNotificationSound: vi.fn(),
  showBrowserNotification: vi.fn(),
}));

vi.mock('@/lib/logger', () => ({
  log: { error: vi.fn(), debug: vi.fn(), info: vi.fn(), warn: vi.fn() },
}));

import { useGoalNotifications } from '@/hooks/analytics/useGoalNotifications';
import { toast } from 'sonner';
import { log } from '@/lib/logger';

function goal(overrides: Partial<GoalRow>): GoalRow {
  return {
    id: 'g1',
    goal_type: 'contacts_handled',
    daily_target: 0,
    weekly_target: 0,
    monthly_target: 0,
    profile_id: 'p1',
    queue_id: null,
    is_active: true,
    ...overrides,
  };
}

describe('useGoalNotifications — aviso de meta idempotente (PB-15)', () => {
  beforeEach(() => {
    h.state.goals = [];
    h.state.contatos = 0;
    h.state.agentStats = null;
    h.state.rows = [];
    h.state.insertAttempts = 0;
    vi.clearAllMocks();
  });

  it('a recarga grava a chave estável e o 23505 não repete o anúncio', async () => {
    h.state.goals = [goal({ id: 'g-contatos', goal_type: 'contacts_handled', daily_target: 5 })];
    h.state.contatos = 7; // 7 >= 5

    const primeira = renderHook(() => useGoalNotifications());
    await waitFor(() => expect(h.state.rows).toHaveLength(1));
    expect(toast.success).toHaveBeenCalledTimes(1);

    const chave = h.state.rows[0].dedupe_key;
    expect(chave).toMatch(/^goal:v1:g-contatos:daily:\d{4}-\d{2}-\d{2}$/);
    primeira.unmount();

    // "Recarga": hook novo (useRef vazio), mesma conquista e mesmo dia.
    renderHook(() => useGoalNotifications());
    await waitFor(() => expect(h.state.insertAttempts).toBeGreaterThanOrEqual(2));
    await act(async () => { await Promise.resolve(); });

    // O banco continua com UMA linha e o toast NÃO foi repetido.
    expect(h.state.rows).toHaveLength(1);
    expect(toast.success).toHaveBeenCalledTimes(1);
    // Duplicata é sucesso silencioso: nada de log de erro.
    expect(log.error).not.toHaveBeenCalled();
  });

  it('meta de tempo de resposta cumpre ABAIXO do alvo', async () => {
    h.state.goals = [goal({ id: 'g-tempo', goal_type: 'response_time', daily_target: 120 })];
    h.state.agentStats = { avg_response_time_seconds: 90 }; // 90 <= 120

    const { result } = renderHook(() => useGoalNotifications());
    await act(async () => { await result.current.checkGoalProgress(); });

    expect(h.state.insertAttempts).toBe(1);
    expect(h.state.rows[0].metadata).toMatchObject({
      goal_type: 'response_time',
      current: 90,
      target: 120,
    });
    expect(toast.success).toHaveBeenCalledTimes(1);
  });

  it('meta de tempo de resposta ACIMA do alvo não anuncia', async () => {
    h.state.goals = [goal({ id: 'g-tempo', goal_type: 'response_time', daily_target: 120 })];
    h.state.agentStats = { avg_response_time_seconds: 150 }; // 150 > 120

    const { result } = renderHook(() => useGoalNotifications());
    await act(async () => { await result.current.checkGoalProgress(); });

    expect(h.state.insertAttempts).toBe(0);
    expect(toast.success).not.toHaveBeenCalled();
  });

  it('tempo de resposta sem medição (agent_stats nulo) não conta como cumprida', async () => {
    h.state.goals = [goal({ id: 'g-tempo', goal_type: 'response_time', daily_target: 120 })];
    h.state.agentStats = null; // current = 0

    const { result } = renderHook(() => useGoalNotifications());
    await act(async () => { await result.current.checkGoalProgress(); });

    expect(h.state.insertAttempts).toBe(0);
    expect(toast.success).not.toHaveBeenCalled();
  });
});
