/**
 * Item (2026-10-15): realtime do monitor disparava UMA consulta por evento e continuava
 * consultando com a aba em segundo plano.
 *
 * Antes: todo evento `postgres_changes` chamava `fetchData()` direto (5 eventos = 5 consultas
 * triplas) e o intervalo de auto-refresh seguia rodando com `document.hidden` (consulta que
 * ninguém lê). Agora: rajada vira UMA consulta (debounce de 500 ms), mudança de status dispara
 * na hora e aba oculta não consulta — ao voltar, uma consulta e o contador zerado.
 *
 * O hook REAL roda com o cliente Supabase mockado, contando as consultas por tabela.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useEvolutionMonitoring, REALTIME_DEBOUNCE_MS } from '@/components/monitoring/hooks/useEvolutionMonitoring';

type PayloadRealtime = { old?: { status?: string }; new?: { status?: string } };

const { mockFrom, handlersRealtime, contagem, settingsEstaveis, updateSettingsEstavel, isQuietHoursEstavel } = vi.hoisted(() => ({
  mockFrom: vi.fn(),
  handlersRealtime: [] as Array<(payload: PayloadRealtime) => void>,
  contagem: {} as Record<string, number>,
  settingsEstaveis: { soundEnabled: false, soundVolume: 40 },
  updateSettingsEstavel: vi.fn(),
  isQuietHoursEstavel: () => false,
}));

vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    from: mockFrom,
    channel: vi.fn(() => ({
      on: vi.fn((_evento: string, _filtro: unknown, cb: (payload: PayloadRealtime) => void) => {
        handlersRealtime.push(cb);
        return { subscribe: vi.fn() };
      }),
    })),
    removeChannel: vi.fn(),
  },
}));

// Referências ESTÁVEIS: se `isQuietHours`/`settings` mudam de identidade a cada render, o
// `checkDisconnections` muda, o `fetchData` muda e o efeito de leitura dispara em laço.
vi.mock('@/hooks/system/useNotificationSettings', () => ({
  useNotificationSettings: () => ({
    settings: settingsEstaveis,
    updateSettings: updateSettingsEstavel,
    isQuietHours: isQuietHoursEstavel,
  }),
}));

function query() {
  const p = Promise.resolve({ data: [], error: null }) as Promise<unknown> & Record<string, unknown>;
  for (const m of ['select', 'gte', 'lte', 'gt', 'lt', 'eq', 'in', 'is', 'order', 'limit']) {
    p[m] = vi.fn(() => p);
  }
  return p;
}

mockFrom.mockImplementation((table: string) => {
  contagem[table] = (contagem[table] ?? 0) + 1;
  return query();
});

async function montar() {
  const visto = renderHook(() => useEvolutionMonitoring());
  await act(async () => { await vi.advanceTimersByTimeAsync(0); });
  return visto;
}

beforeEach(() => {
  for (const k of Object.keys(contagem)) delete contagem[k];
  handlersRealtime.length = 0;
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
  Object.defineProperty(document, 'hidden', { configurable: true, value: false });
});

describe('useEvolutionMonitoring — realtime com debounce e pausa em segundo plano', () => {
  it('rajada de 5 eventos sem mudança de status gera UMA consulta', async () => {
    const { unmount } = await montar();
    const base = contagem.messages;
    expect(base).toBeGreaterThan(0);

    act(() => {
      for (let i = 0; i < 5; i++) {
        handlersRealtime.forEach(h => h({ old: { status: 'connected' }, new: { status: 'connected' } }));
      }
    });

    await act(async () => { await vi.advanceTimersByTimeAsync(REALTIME_DEBOUNCE_MS - 1); });
    expect(contagem.messages).toBe(base);

    await act(async () => { await vi.advanceTimersByTimeAsync(1); });
    expect(contagem.messages).toBe(base + 1);

    unmount();
  });

  it('mudança de status dispara consulta imediata, sem esperar o debounce', async () => {
    const { unmount } = await montar();
    const base = contagem.whatsapp_connections;
    expect(base).toBeGreaterThan(0);

    await act(async () => {
      handlersRealtime.forEach(h => h({ old: { status: 'connected' }, new: { status: 'disconnected' } }));
      await vi.advanceTimersByTimeAsync(0);
    });

    expect(contagem.whatsapp_connections).toBe(base + 1);
    unmount();
  });

  it('aba em segundo plano não consulta; ao voltar, consulta uma vez', async () => {
    const { unmount } = await montar();
    const base = contagem.messages;
    expect(base).toBeGreaterThan(0);

    Object.defineProperty(document, 'hidden', { configurable: true, value: true });
    await act(async () => { await vi.advanceTimersByTimeAsync(60_000); });
    expect(contagem.messages).toBe(base);

    Object.defineProperty(document, 'hidden', { configurable: true, value: false });
    await act(async () => {
      document.dispatchEvent(new Event('visibilitychange'));
      await vi.advanceTimersByTimeAsync(0);
    });
    expect(contagem.messages).toBe(base + 1);

    unmount();
  });
});
