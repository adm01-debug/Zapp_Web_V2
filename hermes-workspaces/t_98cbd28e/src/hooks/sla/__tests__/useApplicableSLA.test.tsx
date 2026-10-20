import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import React from 'react';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useApplicableSLA } from '@/hooks/sla/useApplicableSLA';

// Estado "vivo" que o mock lê na hora da query (mesmo padrão de
// src/hooks/__tests__/useCatalogFavorites.test.ts).
const h = vi.hoisted(() => ({
  rules: [] as Array<Record<string, unknown>>,
  configs: [] as Array<Record<string, unknown>>,
}));

vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    from: vi.fn((table: string) => {
      const builder: Record<string, unknown> = {};
      const chain = () => builder;
      builder.select = vi.fn(chain);
      builder.eq = vi.fn(chain);
      builder.order = vi.fn(chain);
      builder.limit = vi.fn(chain);
      builder.then = (
        onFulfilled?: (v: unknown) => unknown,
        onRejected?: (e: unknown) => unknown
      ) =>
        Promise.resolve(
          table === 'sla_rules' ? { data: h.rules, error: null } : { data: h.configs, error: null }
        ).then(onFulfilled, onRejected);
      return builder;
    }),
  },
}));

type Params = Parameters<typeof useApplicableSLA>[0];

const rule = (overrides: Partial<Record<string, unknown>> = {}): Record<string, unknown> => ({
  id: 'r',
  name: 'Regra',
  first_response_minutes: 2,
  resolution_minutes: 10,
  contact_id: null,
  company: null,
  job_title: null,
  contact_type: null,
  queue_id: null,
  agent_id: null,
  ...overrides,
});

let activeUnmount: (() => void) | null = null;
let activeQueryClient: QueryClient | null = null;

function render(params: Params) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: Infinity, staleTime: Infinity } },
  });
  activeQueryClient = queryClient;
  const wrapper = ({ children }: { children: React.ReactNode }) =>
    React.createElement(QueryClientProvider, { client: queryClient }, children);
  const rendered = renderHook(() => useApplicableSLA(params), { wrapper });
  activeUnmount = rendered.unmount;
  return rendered;
}

describe('useApplicableSLA — contrato da hierarquia de regras (R2-SLA-003)', () => {
  beforeEach(() => {
    h.rules = [];
    h.configs = [];
  });

  afterEach(() => {
    activeUnmount?.();
    activeUnmount = null;
    activeQueryClient?.clear();
    activeQueryClient = null;
  });

  it('regra de 2 min no nível job_title prevalece sobre contact_type de 30 min, mesmo sem contact_id/company/queue/agent', async () => {
    h.rules = [
      rule({
        id: 'r-title',
        name: 'Título 2 min',
        job_title: 'Gerente',
        first_response_minutes: 2,
        resolution_minutes: 10,
      }),
      rule({
        id: 'r-type',
        name: 'Tipo 30 min',
        contact_type: 'lead',
        first_response_minutes: 30,
        resolution_minutes: 120,
      }),
    ];

    const { result } = render({ jobTitle: 'Gerente', contactType: 'lead' });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toEqual({
      firstResponseMinutes: 2,
      resolutionMinutes: 10,
      ruleName: 'Título 2 min',
      ruleId: 'r-title',
    });
  });

  it('contact (2 min) prevalece sobre company (30 min) ainda que a regra de company tenha prioridade maior', async () => {
    h.rules = [
      rule({ id: 'r-comp', name: 'Empresa 30 min', company: 'Acme', first_response_minutes: 30 }),
      rule({ id: 'r-cont', name: 'Contato 2 min', contact_id: 'c1', first_response_minutes: 2 }),
    ];

    const { result } = render({ contactId: 'c1', company: 'Acme' });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toEqual({
      firstResponseMinutes: 2,
      resolutionMinutes: 10,
      ruleName: 'Contato 2 min',
      ruleId: 'r-cont',
    });
  });

  it('fallback: configuração default ativa governa quando nenhuma regra casa', async () => {
    h.configs = [
      { name: 'Padrão Comercial', first_response_minutes: 2, resolution_minutes: 45 },
    ];

    const { result } = render({ contactId: 'c1' });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toEqual({
      firstResponseMinutes: 2,
      resolutionMinutes: 45,
      ruleName: 'Padrão Comercial',
      ruleId: null,
    });
  });

  it('fallback: padrão do sistema quando não há regra nem configuração default', async () => {
    const { result } = render({ contactId: 'c1' });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toEqual({
      firstResponseMinutes: 5,
      resolutionMinutes: 60,
      ruleName: 'Padrão do Sistema',
      ruleId: null,
    });
  });
});
