import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';

/**
 * N-216 — Dispositivos do usuário: select explícito em user_devices.
 *
 * Antes: `.select('*')` trazia para o navegador colunas que o DeviceCard não
 * mostra (city, country, device_fingerprint). Depois: só as colunas usadas —
 * inclusive ip_address, que a tela exibe, por isso continua na lista.
 */

const selects = vi.hoisted(() => [] as Array<{ table: string; cols: string }>);

function builder(table: string) {
  const b: Record<string, unknown> = {};
  b.select = (cols: string) => { selects.push({ table, cols }); return b; };
  for (const m of ['order', 'limit', 'eq', 'neq', 'gte', 'lt', 'lte', 'is', 'in', 'not', 'maybeSingle', 'single']) {
    b[m] = () => b;
  }
  b.then = (resolve: (v: unknown) => unknown) =>
    Promise.resolve({ data: [], error: null }).then(resolve);
  return b;
}

vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    from: (t: string) => builder(t),
    auth: { getSession: () => Promise.resolve({ data: { session: null } }) },
    functions: { invoke: () => Promise.resolve({ data: null, error: null }) },
  },
}));

vi.mock('@/lib/supabaseHelpers', () => ({
  fromTable: (t: string) => builder(t),
}));

vi.mock('@/hooks/auth/useAuth', () => ({ useAuth: () => ({ user: { id: 'u-1' } }) }));
vi.mock('@/lib/logger', () => ({
  log: { debug: vi.fn(), error: vi.fn(), info: vi.fn(), warn: vi.fn() },

  getLogger: vi.fn(() => ({ error: vi.fn(), warn: vi.fn(), info: vi.fn(), debug: vi.fn(), withCorrelation: vi.fn(() => ({ error: vi.fn(), warn: vi.fn(), info: vi.fn(), debug: vi.fn() })) })),
  createLogger: vi.fn(() => ({ error: vi.fn(), warn: vi.fn(), info: vi.fn(), debug: vi.fn(), withCorrelation: vi.fn(() => ({ error: vi.fn(), warn: vi.fn(), info: vi.fn(), debug: vi.fn() })) })),
}));

import { useDeviceDetection } from '@/hooks/ui/useDeviceDetection';

describe('useDeviceDetection — select explícito em user_devices', () => {
  beforeEach(() => { selects.length = 0; });

  it('.select() lista só as colunas usadas pelo DeviceCard', async () => {
    renderHook(() => useDeviceDetection());

    await waitFor(() => {
      expect(selects.some(s => s.table === 'user_devices')).toBe(true);
    });

    const ud = selects.filter(s => s.table === 'user_devices');
    for (const s of ud) expect(s.cols).not.toBe('*');

    const cols = ud[0].cols;
    expect(cols).toContain('id');
    expect(cols).toContain('device_name');
    expect(cols).toContain('is_trusted');
    expect(cols).toContain('last_seen_at');
    // ip_address é exibida no cartão — permanece.
    expect(cols).toContain('ip_address');
    // Sensíveis que a tela não usa — não podem voltar.
    expect(cols).not.toContain('device_fingerprint');
    expect(cols).not.toContain('city');
    expect(cols).not.toContain('country');
  });
});
