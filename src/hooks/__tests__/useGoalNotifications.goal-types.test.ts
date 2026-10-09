import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';

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
  metadata: {
    goal_id: string;
    goal_type: string;
    period: string;
    current: number;
    target: number;
  };
}

// Estado compartilhado com o cliente Supabase mockado (vi.mock é hoisted).
const h = vi.hoisted(() => ({
  state: {
    goals: [] as GoalRow[],
    contactsCount: 0,
    analysesTotal: 0,
    analysesResolved: 0,
    inserts: [] as NotificationRow[][],
    progressQueries: 0,
  },
}));

vi.mock('@/integrations/supabase/client', () => {
  // Builder "thenable": encadeia eq/gte/lte/or/select e resolve por tabela,
  // permitindo devolver contagens distintas para cada filtro aplicado.
  class Builder {
    private filters: Array<[string, unknown]> = [];
    constructor(private table: string) {}

    select() { return this; }
    eq(col: string, val: unknown) { this.filters.push([col, val]); return this; }
    not() { return this; }
    gte() { return this; }
    lte() { return this; }
    or() { return this; }

    insert(rows: NotificationRow[]) { h.state.inserts.push(rows); return Promise.resolve({ error: null }); }
    maybeSingle() { return Promise.resolve(this.result()); }

    private result(): { data?: unknown; count?: number; error: unknown } {
      const s = h.state;
      switch (this.table) {
        case 'profiles':
          return { data: { id: 'p1' }, error: null };
        case 'goals_configurations':
          return { data: s.goals, error: null };
        case 'agent_stats':
          return { data: null, error: null };
        case 'contacts':
          s.progressQueries += 1;
          return { count: s.contactsCount, error: null };
        case 'conversation_analyses': {
          s.progressQueries += 1;
          const onlyResolved = this.filters.some(([c, v]) => c === 'status' && v === 'resolvido');
          return { count: onlyResolved ? s.analysesResolved : s.analysesTotal, error: null };
        }
        case 'notifications':
          return { data: null, error: null };
        default:
          return { data: [], error: null };
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
  useAuth: () => ({ user: { id: 'u1' } }),
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
  log: { error: vi.fn(), warn: vi.fn(), debug: vi.fn(), info: vi.fn() },
}));

import { useGoalNotifications } from '@/hooks/analytics/useGoalNotifications';
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

describe('useGoalNotifications — metas configuráveis da UI (contacts_handled / resolution_rate)', () => {
  beforeEach(() => {
    h.state.goals = [];
    h.state.contactsCount = 0;
    h.state.analysesTotal = 0;
    h.state.analysesResolved = 0;
    h.state.inserts = [];
    h.state.progressQueries = 0;
    vi.clearAllMocks();
  });

  it('cria notificação quando a meta de contatos atendidos é atingida (R2-MOD-063)', async () => {
    h.state.goals = [goal({ id: 'g-contacts', goal_type: 'contacts_handled', daily_target: 10 })];
    h.state.contactsCount = 12; // 12 >= 10

    const { unmount } = renderHook(() => useGoalNotifications());

    await waitFor(() => expect(h.state.inserts.length).toBe(1));
    unmount();

    const [payload] = h.state.inserts[0];
    expect(payload.type).toBe('goal');
    expect(payload.metadata.goal_type).toBe('contacts_handled');
    expect(payload.metadata.period).toBe('daily');
    expect(payload.metadata.current).toBe(12);
    expect(payload.metadata.target).toBe(10);
  });

  it('cria notificação quando a meta de taxa de resolução é atingida (R2-MOD-063)', async () => {
    h.state.goals = [goal({ id: 'g-resolution', goal_type: 'resolution_rate', daily_target: 80 })];
    h.state.analysesTotal = 10;
    h.state.analysesResolved = 8; // 80%

    const { unmount } = renderHook(() => useGoalNotifications());

    await waitFor(() => expect(h.state.inserts.length).toBe(1));
    unmount();

    const [payload] = h.state.inserts[0];
    expect(payload.metadata.goal_type).toBe('resolution_rate');
    expect(payload.metadata.current).toBe(80);
    expect(payload.metadata.target).toBe(80);
  });

  it('não cria notificação quando a meta de contatos não é atingida', async () => {
    h.state.goals = [goal({ id: 'g-contacts', goal_type: 'contacts_handled', daily_target: 10 })];
    h.state.contactsCount = 3; // 3 < 10

    const { unmount } = renderHook(() => useGoalNotifications());

    await waitFor(() => expect(h.state.progressQueries).toBeGreaterThan(0));
    expect(h.state.inserts.length).toBe(0);
    unmount();
  });

  it('não trata tipo desconhecido como progresso zero silencioso', async () => {
    h.state.goals = [goal({ id: 'g-unknown', goal_type: 'campaigns_created', daily_target: 1 })];

    const { unmount } = renderHook(() => useGoalNotifications());

    await waitFor(() => expect(log.warn).toHaveBeenCalled());
    unmount();
    expect(log.warn).toHaveBeenCalledWith(expect.stringContaining('campaigns_created'));
    expect(h.state.inserts.length).toBe(0);
  });
});
