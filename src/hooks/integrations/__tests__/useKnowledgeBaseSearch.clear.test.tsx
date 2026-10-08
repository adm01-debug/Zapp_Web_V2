import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';

/**
 * R2-API-052 (#484) — `clear()` da busca de conhecimento zerava `query` e
 * `debouncedQuery`, mas deixava de pé o `setTimeout` de 300 ms já agendado pelo
 * último `handleSearch`. Ao limpar logo depois de digitar, o temporizador antigo
 * disparava e repunha o termo apagado: a RPC `search_knowledge_base` era chamada
 * com a busca que o usuário acabou de descartar.
 */

const mocks = vi.hoisted(() => ({ rpc: vi.fn() }));

vi.mock('@/integrations/supabase/client', () => ({
  supabase: { rpc: mocks.rpc },
}));

import { useKnowledgeBaseSearch } from '../useKnowledgeBaseSearch';

function criarWrapper() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  );
}

/** Espera passar o debounce de 300 ms (mais a folga do microtask do react-query). */
const passarDebounce = () => act(async () => { await new Promise((r) => setTimeout(r, 400)); });

beforeEach(() => {
  vi.clearAllMocks();
  mocks.rpc.mockResolvedValue({ data: [], error: null });
});

describe('useKnowledgeBaseSearch — limpar cancela o debounce pendente', () => {
  it('limpar logo depois de digitar não deixa a busca descartada chegar na RPC', async () => {
    const { result } = renderHook(() => useKnowledgeBaseSearch(), { wrapper: criarWrapper() });

    act(() => { result.current.handleSearch('contrato'); });
    act(() => { result.current.clear(); });

    await passarDebounce();

    expect(result.current.query).toBe('');
    expect(mocks.rpc).not.toHaveBeenCalled();
  });

  it('regressão: digitar ainda dispara a busca depois do debounce', async () => {
    const { result } = renderHook(() => useKnowledgeBaseSearch(), { wrapper: criarWrapper() });

    act(() => { result.current.handleSearch('contrato'); });
    // Antes do debounce vencer nada é buscado.
    expect(mocks.rpc).not.toHaveBeenCalled();

    await passarDebounce();

    expect(mocks.rpc).toHaveBeenCalledTimes(1);
    expect(mocks.rpc).toHaveBeenCalledWith('search_knowledge_base', {
      search_query: 'contrato',
      max_results: 5,
    });
  });

  it('depois de limpar, uma busca nova volta a funcionar sem o termo antigo voltar', async () => {
    const { result } = renderHook(() => useKnowledgeBaseSearch(), { wrapper: criarWrapper() });

    act(() => { result.current.handleSearch('termo-antigo'); });
    act(() => { result.current.clear(); });
    await passarDebounce();

    act(() => { result.current.handleSearch('termo-novo'); });
    await passarDebounce();

    expect(mocks.rpc).toHaveBeenCalledTimes(1);
    expect(mocks.rpc).toHaveBeenCalledWith('search_knowledge_base', {
      search_query: 'termo-novo',
      max_results: 5,
    });
    expect(mocks.rpc).not.toHaveBeenCalledWith('search_knowledge_base', expect.objectContaining({ search_query: 'termo-antigo' }));
  });
});
