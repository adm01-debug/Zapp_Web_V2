import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor, act } from '@testing-library/react';
import React from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

const mockFrom = vi.fn();
const mockRpc = vi.fn();

vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    from: (...args: unknown[]) => mockFrom(...args),
    rpc: (...args: unknown[]) => mockRpc(...args),
  },
}));

vi.mock('@/hooks/ui/use-toast', () => ({
  toast: vi.fn(),
  useToast: () => ({ toast: vi.fn() }),
}));

vi.mock('@/lib/logger', () => ({
  log: { error: vi.fn(), debug: vi.fn(), info: vi.fn() },
}));

import { useBusinessHours } from '@/hooks/business/useBusinessHours';

function createWrapper() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  return ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={qc}>{children}</QueryClientProvider>
  );
}

const mockHours = [
  { id: 'bh1', whatsapp_connection_id: 'wc1', day_of_week: 1, is_open: true, open_time: '09:00', close_time: '18:00' },
  { id: 'bh2', whatsapp_connection_id: 'wc1', day_of_week: 0, is_open: false, open_time: null, close_time: null },
];

function makeMockChain(data: unknown[] | null, error: unknown = null) {
  return {
    select: vi.fn().mockReturnValue({
      eq: vi.fn().mockReturnValue({
        order: vi.fn().mockResolvedValue({ data, error }),
        maybeSingle: vi.fn().mockResolvedValue({ data: null, error }),
      }),
    }),
    upsert: vi.fn().mockResolvedValue({ error: null }),
  };
}

const week = [
  { whatsapp_connection_id: 'wc1', day_of_week: 1, is_open: true, open_time: '09:00', close_time: '18:00' },
  { whatsapp_connection_id: 'wc1', day_of_week: 2, is_open: false, open_time: '09:00', close_time: '18:00' },
];

describe('useBusinessHours', () => {
  let chain: ReturnType<typeof makeMockChain>;

  beforeEach(() => {
    vi.clearAllMocks();
    chain = makeMockChain(mockHours);
    mockFrom.mockReturnValue(chain);
    mockRpc.mockResolvedValue({ data: null, error: null });
  });

  it('fetches business hours for connection', async () => {
    const { result } = renderHook(() => useBusinessHours('wc1'), { wrapper: createWrapper() });
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.businessHours).toBeDefined();
  });

  it('generates default hours when DB returns empty', async () => {
    mockFrom.mockReturnValue(makeMockChain([]));
    const { result } = renderHook(() => useBusinessHours('wc1'), { wrapper: createWrapper() });
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    // Hook generates defaults for all 7 days when empty
    expect(result.current.businessHours?.length).toBe(7);
  });

  it('identifies closed days correctly', async () => {
    const { result } = renderHook(() => useBusinessHours('wc1'), { wrapper: createWrapper() });
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    const sunday = result.current.businessHours?.find((h) => h.day_of_week === 0);
    expect(sunday?.is_open).toBe(false);
  });

  // ---------------------------------------------------------------------------
  // Salvar horário é UMA chamada atômica da RPC `save_business_hours`. O laço de
  // upsert dia a dia saiu: uma falha no 5º dia deixava 4 gravados e 3 não.
  // ---------------------------------------------------------------------------
  it('salva a semana em UMA chamada da RPC save_business_hours (sem upsert dia a dia)', async () => {
    const { result } = renderHook(() => useBusinessHours('wc1'), { wrapper: createWrapper() });
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    await act(async () => {
      await result.current.saveSettings(week);
    });

    expect(mockRpc).toHaveBeenCalledTimes(1);
    expect(mockRpc).toHaveBeenCalledWith('save_business_hours', {
      p_connection_id: 'wc1',
      p_days: [
        { day_of_week: 1, is_open: true, open_time: '09:00', close_time: '18:00' },
        { day_of_week: 2, is_open: false, open_time: '09:00', close_time: '18:00' },
      ],
    });
    // Nada de upsert: nem `business_hours` (dia a dia), nem `away_messages`.
    expect(chain.upsert).not.toHaveBeenCalled();
  });

  it('sem `away`, não cria away_messages (a tela de horário não cria a ausência sozinha)', async () => {
    const { result } = renderHook(() => useBusinessHours('wc1'), { wrapper: createWrapper() });
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    await act(async () => {
      await result.current.saveSettings(week);
    });

    const tables = mockFrom.mock.calls.map((c) => c[0]);
    // `away_messages` só aparece na LEITURA do hook; nenhuma escrita e nenhum
    // upsert em `business_hours` (o horário foi pela RPC).
    expect(tables).toContain('away_messages');
    expect(chain.upsert).not.toHaveBeenCalled();
  });

  it('com `away` explícito, grava a mensagem de ausência em ação separada', async () => {
    const { result } = renderHook(() => useBusinessHours('wc1'), { wrapper: createWrapper() });
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    await act(async () => {
      await result.current.saveSettings([], {
        whatsapp_connection_id: 'wc1',
        content: 'Estamos fora do horário.',
        is_enabled: true,
      });
    });

    // Sem horários: nenhuma RPC. A ausência é a única escrita.
    expect(mockRpc).not.toHaveBeenCalled();
    expect(chain.upsert).toHaveBeenCalledWith(
      { whatsapp_connection_id: 'wc1', content: 'Estamos fora do horário.', is_enabled: true },
      { onConflict: 'whatsapp_connection_id' },
    );
  });

  it('falha da RPC não grava metade da semana (rejeita e não escreve nada)', async () => {
    mockRpc.mockResolvedValue({ data: null, error: { message: 'intervalo_invalido', code: '22023' } });
    const { result } = renderHook(() => useBusinessHours('wc1'), { wrapper: createWrapper() });
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    let erro: unknown;
    await act(async () => {
      erro = await result.current.saveSettings(week).catch((e) => e);
    });

    expect(erro).toBeTruthy();
    expect(mockRpc).toHaveBeenCalledTimes(1);
    expect(chain.upsert).not.toHaveBeenCalled();
  });
});
