/**
 * Cartão t_549f87e1 (PM-02, avisos de limite das metas de fila).
 *
 * O hook REAL `useQueueGoalAlerts` roda sobre um mock de `rpc_queue_goal_metrics` e prova:
 *  1. as faixas 50 → 75 → 100 % do limite avisam UMA vez cada, e a quarta varredura no mesmo dia
 *     não repete nada (a chave anunciada persiste em `sessionStorage`);
 *  2. `null` (não medido) não avisa e `0` (dado — fila vazia) não vira aviso nem derruba a métrica
 *     seguinte da mesma fila;
 *  3. taxa de atribuição é INVERTIDA: cai para 25 % do mínimo e avisa; 100 % do mínimo não avisa;
 *  4. as quatro métricas são avaliadas (todas as faixas que o cartão pede);
 *  5. a varredura roda a cada 5 min por `useVisiblePolling` (que já pausa em aba oculta) e o nome
 *     no aviso é o nome REAL da fila vindo da RPC.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';

interface MetricsRow {
  queue_id: string;
  queue_name: string;
  coverage: string;
  contacts_open: number | null;
  waiting_contacts: number | null;
  avg_wait_minutes: number | null;
  assignment_rate: number | null;
  received_contacts: number | null;
  assigned_contacts: number | null;
  messages_pending: number | null;
}

const h = vi.hoisted(() => ({
  state: {
    rows: [] as MetricsRow[],
    rpcError: null as { message: string } | null,
    rpcCalls: 0,
    polling: { task: null as null | ((signal?: AbortSignal) => Promise<void>), intervalMs: 0, enabled: true },
    toastWarning: vi.fn(),
    playSound: vi.fn(),
    browserNotification: vi.fn(),
    settings: {
      soundEnabled: true,
      soundVolume: 70,
      browserNotifications: true,
      goalSoundType: 'chime',
    },
    quiet: false,
  },
}));

vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    rpc: vi.fn(async () => {
      h.state.rpcCalls += 1;
      return h.state.rpcError
        ? { data: null, error: h.state.rpcError }
        : { data: h.state.rows, error: null };
    }),
  },
}));

vi.mock('@/hooks/auth/useAuth', () => ({
  useAuth: () => ({ user: { id: 'u1' } }),
}));

vi.mock('@/hooks/system/useNotificationSettings', () => ({
  useNotificationSettings: () => ({
    settings: h.state.settings,
    isQuietHours: () => h.state.quiet,
  }),
}));

vi.mock('@/hooks/business/useQueueGoals', async (importOriginal) => {
  const real = await importOriginal<typeof import('@/hooks/business/useQueueGoals')>();
  return {
    ...real,
    useQueueGoals: () => ({
      goals: {
        q1: {
          id: 'g1', queue_id: 'q1', max_waiting_contacts: 10, max_avg_wait_minutes: 15,
          min_assignment_rate: 80, max_messages_pending: 50, alerts_enabled: true,
        },
      },
    }),
  };
});

vi.mock('@/hooks/realtime/useVisiblePolling', () => ({
  useVisiblePolling: (task: (signal?: AbortSignal) => Promise<void>, intervalMs: number, enabled: boolean) => {
    h.state.polling = { task, intervalMs, enabled };
  },
}));

vi.mock('sonner', () => ({
  toast: {
    warning: (...args: unknown[]) => h.state.toastWarning(...args),
    success: vi.fn(),
    error: vi.fn(),
  },
}));

vi.mock('@/utils/notificationSounds', () => ({
  playNotificationSound: (...args: unknown[]) => h.state.playSound(...args),
  showBrowserNotification: (...args: unknown[]) => h.state.browserNotification(...args),
}));

vi.mock('@/lib/logger', () => ({
  log: { error: vi.fn(), debug: vi.fn(), info: vi.fn(), warn: vi.fn() },
  getLogger: () => ({ error: vi.fn(), debug: vi.fn(), info: vi.fn(), warn: vi.fn() , withCorrelation: () => ({ error: vi.fn(), debug: vi.fn(), info: vi.fn(), warn: vi.fn() })}),
}));

import { useQueueGoalAlerts, QUEUE_GOAL_ALERTS_INTERVAL_MS, QUEUE_GOAL_ALERTS_STORAGE_KEY } from '@/hooks/analytics/useQueueGoalAlerts';

function row(overrides: Partial<MetricsRow> = {}): MetricsRow {
  return {
    queue_id: 'q1',
    queue_name: 'Suporte Real',
    coverage: 'completa',
    contacts_open: 12,
    waiting_contacts: 0,
    avg_wait_minutes: 0,
    assignment_rate: 100,
    received_contacts: 20,
    assigned_contacts: 20,
    messages_pending: 0,
    ...overrides,
  };
}

async function varredura(signal?: AbortSignal) {
  await act(async () => {
    await h.state.polling.task!(signal);
  });
}

describe('useQueueGoalAlerts — avisos de limite das metas de fila', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    sessionStorage.clear();
    h.state.rows = [];
    h.state.rpcError = null;
    h.state.rpcCalls = 0;
    h.state.quiet = false;
  });

  it('avisa uma vez cada faixa (50, 75 e 100% do limite) e não repete na varredura seguinte', async () => {
    renderHook(() => useQueueGoalAlerts());

    h.state.rows = [row({ waiting_contacts: 5 })];   // 50 % de 10
    await varredura();
    h.state.rows = [row({ waiting_contacts: 8 })];   // 80 % -> cruza 75 (e já cruzou 50)
    await varredura();
    h.state.rows = [row({ waiting_contacts: 10 })];  // 100 %
    await varredura();

    expect(h.state.toastWarning).toHaveBeenCalledTimes(3);
    const titulos = h.state.toastWarning.mock.calls.map((c) => c[0] as string);
    expect(titulos).toEqual([
      'Fila Suporte Real: 50% do limite',
      'Fila Suporte Real: 75% do limite',
      'Fila Suporte Real: 100% do limite',
    ]);

    // Quarta varredura no mesmo nível: nada novo.
    await varredura();
    expect(h.state.toastWarning).toHaveBeenCalledTimes(3);
  });

  it('não repete a faixa já anunciada depois de REMONTAR (a chave fica na sessão)', async () => {
    const first = renderHook(() => useQueueGoalAlerts());
    h.state.rows = [row({ waiting_contacts: 6 })];
    await varredura();
    expect(h.state.toastWarning).toHaveBeenCalledTimes(1);
    first.unmount();

    renderHook(() => useQueueGoalAlerts());
    await varredura();
    expect(h.state.toastWarning).toHaveBeenCalledTimes(1);
    expect(sessionStorage.getItem(QUEUE_GOAL_ALERTS_STORAGE_KEY)).toContain('q1:waiting_contacts:50');
  });

  it('NULL (não medido) não avisa e 0 (dado) não derruba as outras métricas da mesma fila', async () => {
    renderHook(() => useQueueGoalAlerts());

    // Fila sem base: todas as métricas nulas.
    h.state.rows = [row({
      coverage: 'sem_base', waiting_contacts: null, avg_wait_minutes: null,
      assignment_rate: null, messages_pending: null,
    })];
    await varredura();
    expect(h.state.toastWarning).not.toHaveBeenCalled();

    // `waiting_contacts: 0` é dado (0 % de 10) e não avisa; `messages_pending: 60` estoura 50.
    h.state.rows = [row({ waiting_contacts: 0, messages_pending: 60, avg_wait_minutes: null })];
    await varredura();
    expect(h.state.toastWarning).toHaveBeenCalledTimes(1);
    expect(h.state.toastWarning.mock.calls[0][0]).toBe('Fila Suporte Real: 100% do limite');
    expect(h.state.toastWarning.mock.calls[0][1]).toEqual({
      description: 'Mensagens sem resposta: 60 (limite 50)',
    });
  });

  it('taxa de atribuição é invertida: avisa ao CAIR para 25% do mínimo e ignora quem está em 100%', async () => {
    renderHook(() => useQueueGoalAlerts());

    // 100 % do mínimo de 80 (meta cumprida) não avisa.
    h.state.rows = [row({ waiting_contacts: 0, assignment_rate: 100, messages_pending: 0 })];
    await varredura();
    expect(h.state.toastWarning).not.toHaveBeenCalled();

    // 20 de 80 = 25 % -> faixa invertida mais grave (25 %).
    h.state.rows = [row({ waiting_contacts: 0, assignment_rate: 20 })];
    await varredura();
    expect(h.state.toastWarning).toHaveBeenCalledTimes(1);
    expect(h.state.toastWarning.mock.calls[0][0]).toBe('Fila Suporte Real: 25% do mínimo');
    expect(h.state.toastWarning.mock.calls[0][1]).toEqual({
      description: 'Taxa de atribuição: 20% (mínimo 80%)',
    });
  });

  it('avalia as QUATRO métricas do cartão, cada uma na sua faixa', async () => {
    renderHook(() => useQueueGoalAlerts());

    h.state.rows = [row({
      waiting_contacts: 10,      // 100 % de 10  -> faixa 100
      avg_wait_minutes: 8,       // ~53 % de 15  -> faixa 50
      messages_pending: 40,      // 80 % de 50   -> faixa 75
      assignment_rate: 40,       // 50 % de 80   -> invertida: faixa 50
    })];
    await varredura();

    expect(h.state.toastWarning).toHaveBeenCalledTimes(4);
    const chamadas = h.state.toastWarning.mock.calls.map((c) => [c[0], (c[1] as { description: string }).description]);
    expect(chamadas).toEqual([
      ['Fila Suporte Real: 100% do limite', 'Contatos aguardando: 10 (limite 10)'],
      ['Fila Suporte Real: 50% do limite', 'Espera média: 8 (limite 15)'],
      ['Fila Suporte Real: 75% do limite', 'Mensagens sem resposta: 40 (limite 50)'],
      ['Fila Suporte Real: 50% do mínimo', 'Taxa de atribuição: 40% (mínimo 80%)'],
    ]);
  });

  it('varre a cada 5 min (useVisiblePolling pausa em aba oculta) e só com usuário logado', () => {
    const { unmount } = renderHook(() => useQueueGoalAlerts());
    expect(h.state.polling.intervalMs).toBe(5 * 60 * 1000);
    expect(h.state.polling.intervalMs).toBe(QUEUE_GOAL_ALERTS_INTERVAL_MS);
    expect(h.state.polling.enabled).toBe(true);
    expect(typeof h.state.polling.task).toBe('function');
    unmount();
  });

  it('RPC com erro fica MUDO: sem métrica real não se anuncia limite', async () => {
    renderHook(() => useQueueGoalAlerts());
    h.state.rpcError = { message: 'permission denied' };
    await varredura();
    expect(h.state.toastWarning).not.toHaveBeenCalled();
    expect(h.state.playSound).not.toHaveBeenCalled();
  });

  it('não anuncia varredura que termina depois da desmontagem (signal abortado)', async () => {
    const { unmount } = renderHook(() => useQueueGoalAlerts());
    h.state.rows = [row({ waiting_contacts: 10 })];
    unmount();

    const controller = new AbortController();
    controller.abort();
    await varredura(controller.signal);

    expect(h.state.toastWarning).not.toHaveBeenCalled();
  });

  it('som, notificação do navegador e horário silencioso seguem useNotificationSettings', async () => {
    renderHook(() => useQueueGoalAlerts());
    h.state.rows = [row({ waiting_contacts: 10 })];

    h.state.quiet = true;
    await varredura();
    expect(h.state.toastWarning).toHaveBeenCalledTimes(1);
    expect(h.state.playSound).not.toHaveBeenCalled();          // silêncio respeitado
    expect(h.state.browserNotification).toHaveBeenCalledTimes(1);

    // Faixa nova (mensagens pendentes) com som ligado -> toca com a preferência do usuário.
    h.state.quiet = false;
    h.state.rows = [row({ waiting_contacts: 10, messages_pending: 60 })];
    await varredura();
    expect(h.state.playSound).toHaveBeenCalledWith('goal_achieved', 'chime', 70);
    expect(h.state.toastWarning).toHaveBeenCalledTimes(2);
    expect(h.state.browserNotification).toHaveBeenCalledTimes(2);
  });
});
