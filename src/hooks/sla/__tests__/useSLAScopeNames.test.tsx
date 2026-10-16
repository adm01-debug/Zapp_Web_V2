import { describe, it, expect, vi, beforeEach } from 'vitest';
import React from 'react';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useSLAScopeNames } from '@/hooks/sla/useSLAScopeNames';

const h = vi.hoisted(() => ({
  tables: [] as string[],
  inArgs: [] as Array<{ table: string; ids: string[] }>,
  rows: [] as Array<Record<string, unknown>>,
  error: null as { message: string } | null,
}));

vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    from: vi.fn((table: string) => {
      h.tables.push(table);
      const builder: Record<string, unknown> = {};
      builder.select = vi.fn(() => builder);
      builder.in = vi.fn((_col: string, ids: string[]) => {
        h.inArgs.push({ table, ids });
        return builder;
      });
      builder.then = (onFulfilled?: (v: unknown) => unknown, onRejected?: (e: unknown) => unknown) =>
        Promise.resolve({ data: h.rows, error: h.error }).then(onFulfilled, onRejected);
      return builder;
    }),
  },
}));

function wrapper({ children }: { children: React.ReactNode }) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: Infinity, staleTime: Infinity } },
  });
  return React.createElement(QueryClientProvider, { client: queryClient }, children);
}

const CONTACT_A = '11111111-1111-4111-8111-111111111111';
const CONTACT_B = '22222222-2222-4222-8222-222222222222';

function render(scope: 'contact' | 'queue' | 'agent', contactIds: string[], queueIds: string[], agentIds: string[]) {
  return renderHook(() => useSLAScopeNames(scope, contactIds, queueIds, agentIds), { wrapper });
}

describe('useSLAScopeNames — filtro de UUID antes do .in() (HZ1-09 / HZ5-01)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    h.tables = [];
    h.inArgs = [];
    h.rows = [];
    h.error = null;
  });

  it('id inválido não gera chamada ao PostgREST', async () => {
    const { result } = render('contact', ['nao-e-uuid', ''], [], []);

    await waitFor(() => expect(result.current.contactNames).toEqual({}));
    expect(h.tables).toEqual([]);
    expect(h.inArgs).toEqual([]);
  });

  it('com um id inválido junto de válidos, consulta só os válidos — ordem estável e sem repetição', async () => {
    h.rows = [{ id: CONTACT_B, name: 'Beta', phone: '11999999999' }];

    const { result } = render('contact', [CONTACT_B, 'lixo', CONTACT_A, CONTACT_B], [], []);

    await waitFor(() => expect(result.current.contactNames).toEqual({
      [CONTACT_B]: 'Beta (11999999999)',
    }));
    expect(h.tables).toEqual(['contacts']);
    expect(h.inArgs[0].ids).toEqual([CONTACT_A, CONTACT_B]);
  });

  it('consulta apenas o escopo ativo', async () => {
    h.rows = [{ id: CONTACT_A, name: 'Fila A' }];

    const { result } = render('queue', [CONTACT_A], [CONTACT_A], [CONTACT_B]);

    await waitFor(() => expect(result.current.queueNames).toEqual({ [CONTACT_A]: 'Fila A' }));
    expect(h.tables).toEqual(['queues']);
  });

  it('escopo sem ids não consulta', async () => {
    const { result } = render('agent', [], [], []);

    await waitFor(() => expect(result.current.agentNames).toEqual({}));
    expect(h.tables).toEqual([]);
  });
});
