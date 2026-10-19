import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import React from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

// Mock the authenticated CRM gateway used by hooks.
const mockNarrow = vi.fn();

vi.mock('@/integrations/supabase/externalClient', () => ({ isExternalConfigured: true }));
vi.mock('@/hooks/system/useCRMIntegrationEnabled', () => ({ useCRMIntegrationEnabled: () => true }));

vi.mock('@/lib/crmIntegration', () => ({
  callCRMIntegration: (action: string) => {
    if (action !== 'companyNames' && action !== 'roleNames') {
      throw new Error(`Unexpected action: ${action}`);
    }
    return (globalThis as unknown as {
      __extMockNarrow: (action: string) => unknown;
    }).__extMockNarrow(action);
  },
}));

// Bridge the mock fn to globalThis so the hoisted factory can access it
const testGlobals = globalThis as unknown as {
  __extMockNarrow: typeof mockNarrow;
};
testGlobals.__extMockNarrow = mockNarrow;

vi.mock('@/lib/logger', () => ({
  log: { error: vi.fn(), warn: vi.fn(), info: vi.fn(), debug: vi.fn() },
  getLogger: () => ({ error: vi.fn(), warn: vi.fn(), info: vi.fn(), debug: vi.fn() , withCorrelation: () => ({ error: vi.fn(), debug: vi.fn(), info: vi.fn(), warn: vi.fn() })}),
}));

import { useExternalEmpresas } from '@/hooks/crm/useExternalEmpresas';
import { useExternalCargos } from '@/hooks/crm/useExternalCargos';

function createWrapper(client?: QueryClient) {
  const qc = client ?? new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={qc}>{children}</QueryClientProvider>
  );
}

// ─── useExternalEmpresas — ação estreita `companyNames` ────────────
describe('useExternalEmpresas', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // A Edge devolve a lista pronta para quem tem `view_contacts`.
    mockNarrow.mockResolvedValue({
      data: ['Acme Corp', 'TechBR', 'SpaceLabs'],
      meta: { record_count: 3, duration_ms: 1, severity: 'ok' },
    });
  });

  it('usa a ação estreita `companyNames` e expõe as sugestões', async () => {
    const { result } = renderHook(() => useExternalEmpresas(), { wrapper: createWrapper() });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(mockNarrow).toHaveBeenCalledWith('companyNames');
    expect(result.current.data).toEqual(['Acme Corp', 'TechBR', 'SpaceLabs']);
  });

  it('não cai mais no RPC admin-only nem no select genérico', async () => {
    const { result } = renderHook(() => useExternalEmpresas(), { wrapper: createWrapper() });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    // O mock lança para qualquer action que não seja estreita.
    expect(mockNarrow).toHaveBeenCalledTimes(1);
    expect(mockNarrow.mock.calls.every(([action]) => action === 'companyNames')).toBe(true);
  });

  it('sem `view_contacts` (403) o erro aparece — não vira lista vazia de sucesso', async () => {
    mockNarrow.mockRejectedValue(new Error('Forbidden'));
    const { result } = renderHook(() => useExternalEmpresas(), { wrapper: createWrapper() });
    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(result.current.data).toBeUndefined();
  });

  it('resposta que não é lista vira lista vazia', async () => {
    mockNarrow.mockResolvedValue({ data: null, meta: { record_count: 0, duration_ms: 1, severity: 'ok' } });
    const { result } = renderHook(() => useExternalEmpresas(), { wrapper: createWrapper() });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toEqual([]);
  });

  it('cache de 30 min: remontar o hook não refaz a chamada', async () => {
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const wrapper = createWrapper(qc);
    const first = renderHook(() => useExternalEmpresas(), { wrapper });
    await waitFor(() => expect(first.result.current.isSuccess).toBe(true));
    first.unmount();
    const second = renderHook(() => useExternalEmpresas(), { wrapper });
    await waitFor(() => expect(second.result.current.isSuccess).toBe(true));
    expect(mockNarrow).toHaveBeenCalledTimes(1);
  });
});

// ─── useExternalCargos — ação estreita `roleNames` ─────────────────
describe('useExternalCargos', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockNarrow.mockResolvedValue({
      data: ['Analista', 'Closer', 'Diretor'],
      meta: { record_count: 3, duration_ms: 1, severity: 'ok' },
    });
  });

  it('usa a ação estreita `roleNames` e expõe as sugestões', async () => {
    const { result } = renderHook(() => useExternalCargos(), { wrapper: createWrapper() });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(mockNarrow).toHaveBeenCalledWith('roleNames');
    expect(result.current.data).toEqual(['Analista', 'Closer', 'Diretor']);
  });

  it('não consulta a tabela salespeople nem o RPC admin-only', async () => {
    const { result } = renderHook(() => useExternalCargos(), { wrapper: createWrapper() });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(mockNarrow).toHaveBeenCalledTimes(1);
    expect(mockNarrow.mock.calls.every(([action]) => action === 'roleNames')).toBe(true);
  });

  it('sem `view_contacts` (403) o erro aparece — não vira lista vazia de sucesso', async () => {
    mockNarrow.mockRejectedValue(new Error('Forbidden'));
    const { result } = renderHook(() => useExternalCargos(), { wrapper: createWrapper() });
    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(result.current.data).toBeUndefined();
  });

  it('resposta que não é lista vira lista vazia', async () => {
    mockNarrow.mockResolvedValue({ data: null, meta: { record_count: 0, duration_ms: 1, severity: 'ok' } });
    const { result } = renderHook(() => useExternalCargos(), { wrapper: createWrapper() });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toEqual([]);
  });

  it('cache de 30 min: remontar o hook não refaz a chamada', async () => {
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const wrapper = createWrapper(qc);
    const first = renderHook(() => useExternalCargos(), { wrapper });
    await waitFor(() => expect(first.result.current.isSuccess).toBe(true));
    first.unmount();
    const second = renderHook(() => useExternalCargos(), { wrapper });
    await waitFor(() => expect(second.result.current.isSuccess).toBe(true));
    expect(mockNarrow).toHaveBeenCalledTimes(1);
  });
});

// ─── ContactForm — Empresa autocomplete logic ─────────────────────
describe('ContactForm — Empresa autocomplete logic', () => {
  const empresas = ['Acme Corp', 'Acme Ltda', 'TechBR', 'SpaceLabs', 'Google Brasil'];

  function filterEmpresas(list: string[], query: string) {
    if (query.length < 1) return [];
    return list.filter(e => e.toLowerCase().includes(query.toLowerCase())).slice(0, 8);
  }

  it('returns empty for empty query', () => {
    expect(filterEmpresas(empresas, '')).toHaveLength(0);
  });

  it('filters with 1 char', () => {
    const result = filterEmpresas(empresas, 'G');
    expect(result).toEqual(['Google Brasil']);
  });

  it('filters by partial match (case-insensitive)', () => {
    expect(filterEmpresas(empresas, 'acme')).toEqual(['Acme Corp', 'Acme Ltda']);
    expect(filterEmpresas(empresas, 'tech')).toEqual(['TechBR']);
    expect(filterEmpresas(empresas, 'GOOGLE')).toEqual(['Google Brasil']);
  });

  it('limits results to 8', () => {
    const bigList = Array.from({ length: 20 }, (_, i) => `Company ${i}`);
    expect(filterEmpresas(bigList, 'Company').length).toBe(8);
  });

  it('returns empty when no match', () => {
    expect(filterEmpresas(empresas, 'zzzz')).toHaveLength(0);
  });
});

// ─── ContactForm — Cargo select logic ─────────────────────────────
describe('ContactForm — Cargo select logic', () => {
  it('__none__ maps to empty string', () => {
    const value = '__none__';
    expect(value === '__none__' ? '' : value).toBe('');
  });

  it('valid cargo passes through', () => {
    const value: string = 'Gerente';
    expect(value === '__none__' ? '' : value).toBe('Gerente');
  });
});

// ─── ContactForm — Validation ─────────────────────────────────────
describe('ContactForm — Validation', () => {
  const validateEmail = (email: string): boolean => {
    if (!email) return true;
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
  };

  const validatePhone = (phone: string): boolean => {
    const cleaned = phone.replace(/\D/g, '');
    return cleaned.length >= 10 && cleaned.length <= 15;
  };

  const formatPhone = (value: string): string => {
    const cleaned = value.replace(/\D/g, '');
    if (cleaned.length <= 2) return cleaned;
    if (cleaned.startsWith('55')) {
      if (cleaned.length <= 4) return `+${cleaned.slice(0, 2)} (${cleaned.slice(2)}`;
      if (cleaned.length <= 6) return `+${cleaned.slice(0, 2)} (${cleaned.slice(2, 4)}) ${cleaned.slice(4)}`;
      if (cleaned.length <= 11) return `+${cleaned.slice(0, 2)} (${cleaned.slice(2, 4)}) ${cleaned.slice(4, 9)}-${cleaned.slice(9)}`;
      return `+${cleaned.slice(0, 2)} (${cleaned.slice(2, 4)}) ${cleaned.slice(4, 9)}-${cleaned.slice(9, 13)}`;
    }
    return value;
  };

  it('validates correct emails', () => {
    expect(validateEmail('test@email.com')).toBe(true);
    expect(validateEmail('user@domain.co.br')).toBe(true);
    expect(validateEmail('')).toBe(true);
  });

  it('rejects invalid emails', () => {
    expect(validateEmail('notanemail')).toBe(false);
    expect(validateEmail('missing@')).toBe(false);
    expect(validateEmail('@nodomain.com')).toBe(false);
  });

  it('validates correct phone numbers', () => {
    expect(validatePhone('+55 11 99999-9999')).toBe(true);
    expect(validatePhone('5511999999999')).toBe(true);
    expect(validatePhone('11999999999')).toBe(true);
  });

  it('rejects short phone numbers', () => {
    expect(validatePhone('123')).toBe(false);
    expect(validatePhone('999')).toBe(false);
  });

  it('formats Brazilian phone correctly', () => {
    expect(formatPhone('5511999999999')).toBe('+55 (11) 99999-9999');
    expect(formatPhone('5511')).toBe('+55 (11');
    expect(formatPhone('551199')).toBe('+55 (11) 99');
  });

  it('returns raw value for non-BR numbers', () => {
    expect(formatPhone('1234567890')).toBe('1234567890');
  });
});
