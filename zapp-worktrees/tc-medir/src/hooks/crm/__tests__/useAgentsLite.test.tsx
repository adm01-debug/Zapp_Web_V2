import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import React from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

const mockProfiles = [
  { id: 'p1', name: 'Agent Alpha', avatar_url: 'https://example.com/a.png' },
  { id: 'p2', name: 'Agent Beta', avatar_url: null },
];

let selectResult: { data: unknown; error: unknown } = { data: mockProfiles, error: null };

vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    from: vi.fn((table: string) => {
      if (table !== 'profiles') throw new Error(`tabela inesperada: ${table}`);
      return { select: vi.fn(() => Promise.resolve(selectResult)) };
    }),
  },
}));

import { useAgentsLite } from '@/hooks/crm/useAgentsLite';

let activeQueryClient: QueryClient | null = null;
let activeUnmount: (() => void) | null = null;

function renderAgentsLite() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  activeQueryClient = queryClient;
  const wrapper = ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
  const rendered = renderHook(() => useAgentsLite(), { wrapper });
  activeUnmount = rendered.unmount;
  return rendered;
}

describe('useAgentsLite', () => {
  beforeEach(() => {
    selectResult = { data: mockProfiles, error: null };
  });

  afterEach(() => {
    activeUnmount?.();
    activeUnmount = null;
    activeQueryClient?.clear();
    activeQueryClient = null;
  });

  it('retorna um Map vazio antes dos dados carregarem', () => {
    selectResult = { data: mockProfiles, error: null };
    const { result } = renderAgentsLite();
    expect(result.current.size).toBe(0);
  });

  it('indexa os profiles retornados por id', async () => {
    const { result } = renderAgentsLite();
    await waitFor(() => expect(result.current.size).toBe(2));

    expect(result.current.get('p1')).toEqual(mockProfiles[0]);
    expect(result.current.get('p2')).toEqual(mockProfiles[1]);
    expect(result.current.get('inexistente')).toBeUndefined();
  });

  it('em erro na query, mantém o Map vazio em vez de quebrar', async () => {
    selectResult = { data: null, error: { message: 'falhou' } };
    const { result } = renderAgentsLite();

    // Espera o estado real de erro do react-query (não um setTimeout(0), que
    // não distingue "ainda carregando" de "chegou no erro") — queryFn relança
    // o error do Supabase, então o status só vira 'error' depois disso.
    await waitFor(() =>
      expect(activeQueryClient?.getQueryState(['profiles-lite'])?.status).toBe('error')
    );
    expect(result.current.size).toBe(0);
  });
});
