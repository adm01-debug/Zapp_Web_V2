import { describe, it, expect, vi, beforeEach, beforeAll, afterAll, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';

// Mock controlável do cliente Supabase: cada tabela tem um resultado próprio e
// todos os métodos da cadeia são gravados, para conferir a consulta montada.
const h = vi.hoisted(() => {
  const toastError = vi.fn();
  const calls: { table: string; method: string; args: unknown[] }[] = [];
  const results: Record<string, { data: unknown; error: unknown; count?: number }> = {};
  const makeChain = (table: string) => {
    const chain: Record<string, unknown> = {};
    for (const method of ['select', 'order', 'in', 'eq', 'limit', 'range', 'gte', 'lte', 'single']) {
      chain[method] = vi.fn((...args: unknown[]) => {
        calls.push({ table, method, args });
        return chain;
      });
    }
    chain.then = (resolve: unknown, reject: unknown) =>
      Promise.resolve(results[table] ?? { data: [], error: null }).then(
        resolve as (v: unknown) => unknown,
        reject as (e: unknown) => unknown,
      );
    return chain;
  };
  return { toastError, calls, results, makeChain };
});

vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    from: (table: string) => h.makeChain(table),
    auth: { getSession: vi.fn().mockResolvedValue({ data: { session: { access_token: 'tok' } } }) },
    storage: {
      from: () => ({
        upload: vi.fn().mockResolvedValue({ error: null }),
        getPublicUrl: () => ({ data: { publicUrl: 'https://local.test/avatar.png' } }),
      }),
    },
    rpc: vi.fn(),
    functions: { invoke: vi.fn().mockResolvedValue({ data: {}, error: null }) },
  },
  SUPABASE_URL: 'https://local.test',
}));

vi.mock('sonner', () => ({
  toast: { error: h.toastError, success: vi.fn(), warning: vi.fn() },
}));

vi.mock('@/lib/invokeEdge', () => ({
  invokeEdge: vi.fn(async (name: string, opts?: { body?: unknown }) => {
    await fetch(name, { method: 'POST', body: JSON.stringify(opts?.body ?? {}) });
    return {};
  }),
  readEdgeError: vi.fn().mockResolvedValue({ message: '', status: 500 }),
}));

import {
  useAdminData,
  MIN_PASSWORD_LENGTH,
  AUDIT_PAGE_SIZE,
} from '@/components/admin/useAdminData';

function callsFor(table: string, method: string) {
  return h.calls.filter(c => c.table === table && c.method === method);
}

describe('useAdminData — erro nunca vira lista vazia silenciosa', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    h.calls.length = 0;
    for (const key of Object.keys(h.results)) delete h.results[key];
  });

  it('erro ao carregar profiles expõe estado de erro e avisa por toast', async () => {
    h.results.profiles = { data: null, error: { message: 'falha simulada' } };
    const { result } = renderHook(() => useAdminData('users'));

    await act(async () => {
      await result.current.fetchData();
    });

    expect(result.current.error).toBeTruthy();
    expect(h.toastError).toHaveBeenCalledTimes(1);
    expect(result.current.users).toEqual([]);
    expect(result.current.loading).toBe(false);
  });

  it('erro ao carregar user_roles expõe estado de erro e avisa por toast', async () => {
    h.results.profiles = { data: [{ id: 'p1', user_id: 'u1' }], error: null };
    h.results.user_roles = { data: null, error: { message: 'falha simulada' } };
    const { result } = renderHook(() => useAdminData('users'));

    await act(async () => {
      await result.current.fetchData();
    });

    expect(result.current.error).toBeTruthy();
    expect(h.toastError).toHaveBeenCalledTimes(1);
  });

  it('erro na auditoria expõe estado de erro em vez de lista vazia', async () => {
    h.results.audit_logs = { data: null, error: { message: 'falha simulada' }, count: 0 };
    const { result } = renderHook(() => useAdminData('audit'));

    await act(async () => {
      await result.current.fetchData();
    });

    expect(result.current.error).toBeTruthy();
    expect(h.toastError).toHaveBeenCalledTimes(1);
    expect(result.current.auditLogs).toEqual([]);
  });

  it('sucesso não deixa estado de erro ligado', async () => {
    h.results.profiles = { data: [], error: null };
    h.results.user_roles = { data: [], error: null };
    const { result } = renderHook(() => useAdminData('users'));

    await act(async () => {
      await result.current.fetchData();
    });

    expect(result.current.error).toBeNull();
    expect(h.toastError).not.toHaveBeenCalled();
  });
});

describe('useAdminData — auditoria com filtro de data e paginação', () => {
  // O dia escolhido no calendário é o dia do operador, não o dia UTC: com o
  // fuso fixado em São Paulo (UTC-3) o valor esperado deixa de ser meia-noite UTC.
  const tzOriginal = process.env.TZ;
  beforeAll(() => { process.env.TZ = 'America/Sao_Paulo'; });
  afterAll(() => {
    if (tzOriginal === undefined) delete process.env.TZ;
    else process.env.TZ = tzOriginal;
  });

  beforeEach(() => {
    vi.clearAllMocks();
    h.calls.length = 0;
    for (const key of Object.keys(h.results)) delete h.results[key];
  });

  it('aplica gte/lte com o dia inteiro no fuso local e range 1-based', async () => {
    h.results.audit_logs = { data: [], error: null, count: 137 };
    const { result } = renderHook(() =>
      useAdminData('audit', { from: '2026-10-01', to: '2026-10-12', page: 3, pageSize: 50 }),
    );

    await act(async () => {
      await result.current.fetchData();
    });

    expect(callsFor('audit_logs', 'gte')[0]?.args).toEqual([
      'created_at',
      '2026-10-01T03:00:00.000Z',
    ]);
    expect(callsFor('audit_logs', 'lte')[0]?.args).toEqual([
      'created_at',
      '2026-10-13T02:59:59.999Z',
    ]);
    expect(callsFor('audit_logs', 'range')[0]?.args).toEqual([100, 149]);
    expect(result.current.auditTotal).toBe(137);
  });

  it('sem filtro usa a primeira página e não manda gte/lte', async () => {
    h.results.audit_logs = { data: [], error: null, count: 0 };
    const { result } = renderHook(() => useAdminData('audit'));

    await act(async () => {
      await result.current.fetchData();
    });

    expect(callsFor('audit_logs', 'range')[0]?.args).toEqual([0, AUDIT_PAGE_SIZE - 1]);
    expect(callsFor('audit_logs', 'gte')).toHaveLength(0);
    expect(callsFor('audit_logs', 'lte')).toHaveLength(0);
  });
});

describe('useAdminData — senha mínima alinhada à Edge create-user', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    h.calls.length = 0;
    for (const key of Object.keys(h.results)) delete h.results[key];
  });

  // Um teste que não restaura o stub deixa o `fetch` falsificado para os
  // seguintes; a limpeza fica no afterEach em vez de no fim de cada teste.
  afterEach(() => { vi.unstubAllGlobals(); });

  it('expõe a régua de 8 caracteres da Edge', () => {
    expect(MIN_PASSWORD_LENGTH).toBe(8);
  });

  it('recusa 7 caracteres antes de chamar a Edge', async () => {
    const fetchSpy = vi.fn();
    vi.stubGlobal('fetch', fetchSpy);
    const { result } = renderHook(() => useAdminData('users'));

    let ok = true;
    await act(async () => {
      ok = await result.current.handleCreateUser({
        name: 'Ana',
        email: 'ana@example.test',
        password: '1234567',
        role: 'agent',
      });
    });

    expect(ok).toBe(false);
    expect(fetchSpy).not.toHaveBeenCalled();
    expect(h.toastError).toHaveBeenCalledWith(
      expect.stringContaining('8 caracteres'),
    );
  });

  it('aceita 8 caracteres e chama a Edge', async () => {
    const fetchSpy = vi.fn().mockResolvedValue({ ok: true, json: async () => ({}) });
    vi.stubGlobal('fetch', fetchSpy);
    const { result } = renderHook(() => useAdminData('users'));

    let ok = false;
    await act(async () => {
      ok = await result.current.handleCreateUser({
        name: 'Ana',
        email: 'ana@example.test',
        password: '12345678',
        role: 'agent',
      });
    });

    expect(ok).toBe(true);
    expect(fetchSpy).toHaveBeenCalledTimes(1);
  });
});
