import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';

const { fetchData, checkDisconnections } = vi.hoisted(() => ({
  fetchData: vi.fn(async () => {}),
  checkDisconnections: vi.fn(),
}));

vi.mock('../useMonitoringData', () => ({
  useMonitoringData: () => ({
    connections: [],
    instances: [],
    loading: false,
    error: null,
    fetchData,
    autoRefresh: false,
    setAutoRefresh: vi.fn(),
    countdown: 30,
    setCountdown: vi.fn(),
    lastUpdate: null,
  }),
}));

vi.mock('../useMonitoringActions', () => ({
  useMonitoringActions: () => ({
    syncingConnection: null,
    disconnectingInstance: null,
    reconnectingInstance: null,
    qrDialogOpen: false,
    setQrDialogOpen: vi.fn(),
    qrCode: null,
    qrLoading: false,
    handleReconnect: vi.fn(),
    handleDisconnect: vi.fn(),
    handleSync: vi.fn(),
    handleForceSync: vi.fn(),
  }),
}));

vi.mock('../useMonitoringNotifications', () => ({
  useMonitoringNotifications: () => ({
    notificationsEnabled: false,
    soundEnabled: false,
    setSoundEnabled: vi.fn(),
    requestNotifications: vi.fn(),
    checkDisconnections,
  }),
}));

import { useEvolutionMonitoring } from '@/components/monitoring/hooks/useEvolutionMonitoring';

describe('useEvolutionMonitoring — reconexão', () => {
  beforeEach(() => {
    fetchData.mockClear();
    checkDisconnections.mockClear();
  });

  it('revalida o monitoramento quando a rede volta, sem depender de um evento novo', async () => {
    const { unmount } = renderHook(() => useEvolutionMonitoring());

    // Montagem chama fetchData uma vez (autoRefresh desligado: sem intervalo).
    expect(fetchData).toHaveBeenCalledTimes(1);

    act(() => { window.dispatchEvent(new Event('online')); });

    // useRealtimeReconnect(fetchData): a chamada de rede volta a acontecer.
    // O unmount no fim evita que o intervalo de 30 s do hook vaze para outros testes.
    await vi.waitFor(() => expect(fetchData).toHaveBeenCalledTimes(2));
    unmount();
  });
});
