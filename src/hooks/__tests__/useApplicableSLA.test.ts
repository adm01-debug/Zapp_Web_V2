import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { createElement, type ReactNode } from 'react';

// Testes do hook REAL useApplicableSLA (sem espelho da hierarquia):
// o supabase é mockado e a resolução vem do código de produção.
const { mockFrom, calls } = vi.hoisted(() => ({
  mockFrom: vi.fn(),
  calls: [] as string[],
}));

vi.mock('@/integrations/supabase/client', () => ({
  supabase: { from: mockFrom },
}));

import { useApplicableSLA } from '@/hooks/sla/useApplicableSLA';

let rulesData: unknown[] = [];
let configsData: unknown[] = [];

function makeChain(table: string) {
  const result = table === 'sla_rules'
    ? { data: rulesData, error: null }
    : { data: configsData, error: null };

  const chain: Record<string, (...args: unknown[]) => unknown> = {};
  const record = (method: string, args: unknown[]) => {
    calls.push(`${table}.${method}:${JSON.stringify(args)}`);
    return chain;
  };
  chain.select = (...args: unknown[]) => record('select', args);
  chain.eq = (...args: unknown[]) => record('eq', args);
  chain.order = (...args: unknown[]) => { record('order', args); return Promise.resolve(result); };
  chain.limit = (...args: unknown[]) => { record('limit', args); return Promise.resolve(result); };
  return chain;
}

const rule = (overrides: Record<string, unknown> = {}) => ({
  id: crypto.randomUUID(),
  name: 'Regra',
  first_response_minutes: 10,
  resolution_minutes: 120,
  contact_id: null,
  company: null,
  job_title: null,
  contact_type: null,
  queue_id: null,
  agent_id: null,
  ...overrides,
});

let queryClient: QueryClient;

const wrapper = ({ children }: { children: ReactNode }) =>
  createElement(QueryClientProvider, { client: queryClient }, children);

async function run(params: Record<string, unknown>) {
  const { result } = renderHook(() => useApplicableSLA(params), { wrapper });
  await waitFor(() => expect(result.current.isSuccess).toBe(true));
  return result;
}

beforeEach(() => {
  rulesData = [];
  configsData = [];
  calls.length = 0;
  queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  mockFrom.mockClear();
  mockFrom.mockImplementation((table: string) => makeChain(table));
});

describe('useApplicableSLA — hierarquia de resolução', () => {
  it('contato vence empresa', async () => {
    rulesData = [
      rule({ company: 'Acme', first_response_minutes: 8, name: 'Empresa' }),
      rule({ contact_id: 'c1', first_response_minutes: 2, name: 'Contato' }),
    ];
    const result = await run({ contactId: 'c1', company: 'Acme' });
    expect(result.current.data?.ruleName).toBe('Contato');
    expect(result.current.data?.firstResponseMinutes).toBe(2);
  });

  it('empresa vence cargo', async () => {
    rulesData = [
      rule({ company: 'Acme', first_response_minutes: 5, name: 'Empresa' }),
      rule({ job_title: 'Diretor', first_response_minutes: 15, name: 'Cargo' }),
    ];
    const result = await run({ company: 'Acme', jobTitle: 'Diretor' });
    expect(result.current.data?.ruleName).toBe('Empresa');
  });

  it('cargo vence tipo de contato', async () => {
    rulesData = [
      rule({ job_title: 'Diretor', first_response_minutes: 7, name: 'Cargo' }),
      rule({ contact_type: 'vip', first_response_minutes: 12, name: 'Tipo' }),
    ];
    const result = await run({ jobTitle: 'Diretor', contactType: 'vip' });
    expect(result.current.data?.ruleName).toBe('Cargo');
  });

  it('tipo de contato vence fila', async () => {
    rulesData = [
      rule({ contact_type: 'vip', first_response_minutes: 3, name: 'Tipo' }),
      rule({ queue_id: 'q1', first_response_minutes: 9, name: 'Fila' }),
    ];
    const result = await run({ contactType: 'vip', queueId: 'q1' });
    expect(result.current.data?.ruleName).toBe('Tipo');
  });

  it('fila vence agente', async () => {
    rulesData = [
      rule({ queue_id: 'q1', first_response_minutes: 6, name: 'Fila' }),
      rule({ agent_id: 'a1', first_response_minutes: 20, name: 'Agente' }),
    ];
    const result = await run({ queueId: 'q1', agentId: 'a1' });
    expect(result.current.data?.ruleName).toBe('Fila');
  });

  it('agente é o último nível granular', async () => {
    rulesData = [rule({ agent_id: 'a1', first_response_minutes: 25, name: 'Agente' })];
    const result = await run({ agentId: 'a1', contactId: 'sem-match' });
    expect(result.current.data?.ruleName).toBe('Agente');
    expect(result.current.data?.resolutionMinutes).toBe(120);
  });

  it('não casa regra mista (contact_id + empresa) no nível de empresa', async () => {
    rulesData = [rule({ contact_id: 'outro', company: 'Acme', name: 'Mista' })];
    const result = await run({ company: 'Acme', contactId: 'sem-match' });
    expect(result.current.data?.ruleName).toBe('Padrão do Sistema');
  });
});

describe('useApplicableSLA — fallback final', () => {
  it('sem regra granular, cai no padrão de sla_configurations', async () => {
    rulesData = [rule({ contact_id: 'outro', name: 'Outra' })];
    configsData = [{ name: 'Global', first_response_minutes: 30, resolution_minutes: 300 }];
    const result = await run({ contactId: 'c1' });
    expect(result.current.data?.ruleName).toBe('Global');
    expect(result.current.data?.firstResponseMinutes).toBe(30);
    expect(result.current.data?.ruleId).toBeNull();
  });

  it('sem regra e sem configuração, usa o padrão do sistema', async () => {
    const result = await run({ contactId: 'c1' });
    expect(result.current.data).toEqual({
      firstResponseMinutes: 5,
      resolutionMinutes: 60,
      ruleName: 'Padrão do Sistema',
      ruleId: null,
    });
  });
});

describe('useApplicableSLA — consulta', () => {
  it('filtra regras ativas e ordena por prioridade decrescente', async () => {
    await run({ contactId: 'c1' });
    expect(calls).toContain('sla_rules.eq:["is_active",true]');
    expect(calls).toContain('sla_rules.order:["priority",{"ascending":false}]');
  });

  it('não consulta quando nenhum nível é informado', async () => {
    const { result } = renderHook(() => useApplicableSLA({}), { wrapper });
    expect(result.current.fetchStatus).toBe('idle');
    expect(mockFrom).not.toHaveBeenCalled();
  });
});
