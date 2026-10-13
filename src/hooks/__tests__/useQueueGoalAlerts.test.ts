import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';

const mockRpc = vi.fn();

vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    rpc: (...args: unknown[]) => mockRpc(...args),
  },
}));

const mockUseAuth = vi.fn();
vi.mock('@/hooks/auth/useAuth', () => ({
  useAuth: () => mockUseAuth(),
}));

const mockUseUserRole = vi.fn();
vi.mock('@/hooks/system/useUserRole', () => ({
  useUserRole: () => mockUseUserRole(),
}));

let quietHours = false;
const mockSettings = {
  soundEnabled: false,
  browserNotifications: false,
  goalSoundType: 'chime' as const,
  soundVolume: 70,
};
vi.mock('@/hooks/system/useNotificationSettings', () => ({
  useNotificationSettings: () => ({
    settings: mockSettings,
    isQuietHours: () => quietHours,
  }),
}));

const toastInfo = vi.hoisted(() => vi.fn());
vi.mock('sonner', () => ({
  toast: { info: toastInfo, success: vi.fn(), error: vi.fn() },
}));

vi.mock('@/utils/notificationSounds', () => ({
  playNotificationSound: vi.fn(),
  showBrowserNotification: vi.fn(),
}));

vi.mock('@/lib/logger', () => ({
  log: { error: vi.fn(), warn: vi.fn(), info: vi.fn(), debug: vi.fn() },
}));

import {
  useQueueGoalAlerts,
  QUEUE_GOAL_ALERTS_INTERVAL_MS,
  type QueueGoalMetricRow,
} from '@/hooks/business/useQueueGoalAlerts';

function row(overrides: Partial<QueueGoalMetricRow> = {}): QueueGoalMetricRow {
  return {
    queue_id: 'q1',
    queue_name: 'Suporte',
    waiting_contacts: 0,
    avg_wait_minutes: null,
    assignment_rate: null,
    messages_pending: 0,
    max_waiting_contacts: 100,
    max_avg_wait_minutes: null,
    min_assignment_rate: null,
    max_messages_pending: null,
    alerts_enabled: true,
    ...overrides,
  };
}

let rows: QueueGoalMetricRow[] = [];

describe('useQueueGoalAlerts', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
    quietHours = false;
    rows = [];
    mockUseAuth.mockReturnValue({ user: { id: 'u1' } });
    mockUseUserRole.mockReturnValue({ isSupervisor: true, loading: false });
    mockRpc.mockImplementation(() => Promise.resolve({ data: rows, error: null }));
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('emite 1 toast ao passar de 49% para 51% da meta e nao repete na checagem seguinte', async () => {
    rows = [row({ waiting_contacts: 49 })];
    const { result } = renderHook(() => useQueueGoalAlerts());
    await waitFor(() => expect(mockRpc).toHaveBeenCalled());
    expect(toastInfo).not.toHaveBeenCalled();

    rows = [row({ waiting_contacts: 51 })];
    await result.current.checkQueueGoalAlerts();
    expect(toastInfo).toHaveBeenCalledTimes(1);
    expect(toastInfo).toHaveBeenCalledWith(
      expect.stringContaining('Meta da fila'),
      expect.objectContaining({ description: expect.stringContaining('51/100') })
    );

    // Mesma medicao, nova checagem: nenhum aviso novo.
    await result.current.checkQueueGoalAlerts();
    expect(toastInfo).toHaveBeenCalledTimes(1);
  });

  it('nao repete o aviso depois de recarregar a pagina no mesmo dia', async () => {
    rows = [row({ waiting_contacts: 51 })];
    const first = renderHook(() => useQueueGoalAlerts());
    await waitFor(() => expect(toastInfo).toHaveBeenCalledTimes(1));
    first.unmount();

    // Recarrega: nova instancia do hook, sem memoria de sessao — so o localStorage.
    renderHook(() => useQueueGoalAlerts());
    await waitFor(() => expect(mockRpc).toHaveBeenCalledTimes(2));
    expect(toastInfo).toHaveBeenCalledTimes(1);
  });

  it('volta para baixo e cruza a mesma faixa de novo: sem aviso duplicado no mesmo dia', async () => {
    rows = [row({ waiting_contacts: 51 })];
    const { result } = renderHook(() => useQueueGoalAlerts());
    await waitFor(() => expect(toastInfo).toHaveBeenCalledTimes(1));

    rows = [row({ waiting_contacts: 49 })];
    await result.current.checkQueueGoalAlerts();
    rows = [row({ waiting_contacts: 51 })];
    await result.current.checkQueueGoalAlerts();

    expect(toastInfo).toHaveBeenCalledTimes(1);
  });

  it('avisa de novo ao cruzar a faixa seguinte (75%)', async () => {
    rows = [row({ waiting_contacts: 51 })];
    const { result } = renderHook(() => useQueueGoalAlerts());
    await waitFor(() => expect(toastInfo).toHaveBeenCalledTimes(1));

    rows = [row({ waiting_contacts: 76 })];
    await result.current.checkQueueGoalAlerts();

    expect(toastInfo).toHaveBeenCalledTimes(2);
    expect(toastInfo).toHaveBeenLastCalledWith(
      expect.stringContaining('Meta da fila'),
      expect.objectContaining({ description: expect.stringContaining('76/100') })
    );
  });

  it('alerta ao CAIR na metrica invertida (taxa de atribuicao)', async () => {
    rows = [row({ assignment_rate: 80, min_assignment_rate: 80, waiting_contacts: 0 })];
    const { result } = renderHook(() => useQueueGoalAlerts());
    await waitFor(() => expect(mockRpc).toHaveBeenCalled());
    expect(toastInfo).not.toHaveBeenCalled();

    // limite 80: faixa 50 = <= 40.
    rows = [row({ assignment_rate: 39, min_assignment_rate: 80, waiting_contacts: 0 })];
    await result.current.checkQueueGoalAlerts();

    expect(toastInfo).toHaveBeenCalledTimes(1);
    expect(toastInfo).toHaveBeenCalledWith(
      expect.stringContaining('Meta da fila'),
      expect.objectContaining({ description: expect.stringContaining('taxa de atribuição') })
    );
  });

  it('agente comum (nao staff) nao consulta a RPC nem avisa', async () => {
    mockUseUserRole.mockReturnValue({ isSupervisor: false, loading: false });
    rows = [row({ waiting_contacts: 90 })];
    const { result } = renderHook(() => useQueueGoalAlerts());

    await result.current.checkQueueGoalAlerts();

    expect(mockRpc).not.toHaveBeenCalled();
    expect(toastInfo).not.toHaveBeenCalled();
  });

  it('respeita horario silencioso: adia o aviso e o emite depois', async () => {
    quietHours = true;
    rows = [row({ waiting_contacts: 60 })];
    const { result } = renderHook(() => useQueueGoalAlerts());
    await waitFor(() => expect(mockRpc).toHaveBeenCalled());

    await result.current.checkQueueGoalAlerts();
    expect(toastInfo).not.toHaveBeenCalled();

    quietHours = false;
    await result.current.checkQueueGoalAlerts();
    expect(toastInfo).toHaveBeenCalledTimes(1);
  });

  it('metrica sem base (NULL) nao dispara aviso', async () => {
    rows = [row({ assignment_rate: null, min_assignment_rate: 80, waiting_contacts: 10 })];
    const { result } = renderHook(() => useQueueGoalAlerts());
    await waitFor(() => expect(mockRpc).toHaveBeenCalled());

    await result.current.checkQueueGoalAlerts();
    expect(toastInfo).not.toHaveBeenCalled();
  });

  it('fila com alertas desligados nao avisa', async () => {
    rows = [row({ waiting_contacts: 90, alerts_enabled: false })];
    const { result } = renderHook(() => useQueueGoalAlerts());
    await waitFor(() => expect(mockRpc).toHaveBeenCalled());

    await result.current.checkQueueGoalAlerts();
    expect(toastInfo).not.toHaveBeenCalled();
  });

  it('localStorage indisponivel nao quebra nem duplica o aviso na sessao', async () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('storage bloqueado');
    });
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('storage bloqueado');
    });

    rows = [row({ waiting_contacts: 51 })];
    const { result } = renderHook(() => useQueueGoalAlerts());
    await waitFor(() => expect(toastInfo).toHaveBeenCalledTimes(1));

    await result.current.checkQueueGoalAlerts();
    expect(toastInfo).toHaveBeenCalledTimes(1);
  });

  it('consulta em intervalo configuravel', async () => {
    const setIntervalSpy = vi.spyOn(global, 'setInterval');
    renderHook(() => useQueueGoalAlerts({ intervalMs: 60000 }));
    await waitFor(() =>
      expect(setIntervalSpy).toHaveBeenCalledWith(expect.any(Function), 60000)
    );
    expect(QUEUE_GOAL_ALERTS_INTERVAL_MS).toBe(300000);
  });

  it('limpa o intervalo ao desmontar', async () => {
    const clearIntervalSpy = vi.spyOn(global, 'clearInterval');
    const { unmount } = renderHook(() => useQueueGoalAlerts());
    await waitFor(() => expect(mockRpc).toHaveBeenCalled());
    unmount();
    expect(clearIntervalSpy).toHaveBeenCalled();
  });
});
