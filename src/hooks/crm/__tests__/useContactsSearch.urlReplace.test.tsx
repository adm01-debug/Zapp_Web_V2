/**
 * `useContactsSearch` — o espelho na URL usa `replace`.
 *
 * O outro arquivo de testes roda o hook dentro de um `MemoryRouter` real, onde não dá
 * para ver o segundo argumento do `setSearchParams`. Aqui o `react-router-dom` é
 * dublado só para observar a chamada: se alguém trocar `replace` por `push`, filtrar
 * passa a empilhar uma entrada de histórico por clique e este caso cai.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';

const h = vi.hoisted(() => ({
  params: new URLSearchParams(),
  definirParametros: vi.fn(),
}));

vi.mock('react-router-dom', () => ({
  useSearchParams: () => [h.params, h.definirParametros],
}));

vi.mock('@/integrations/supabase/client', () => ({
  supabase: { rpc: () => Promise.resolve({ data: [], error: null }) },
}));

import { useContactsSearch } from '../useContactsSearch';

const queryClient = new QueryClient({
  defaultOptions: { queries: { retry: false, gcTime: 0 } },
});

function wrapper({ children }: { children: ReactNode }) {
  return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
}

const ultimaChamada = () => h.definirParametros.mock.calls[h.definirParametros.mock.calls.length - 1];

describe('useContactsSearch — escrita na URL com replace', () => {
  beforeEach(() => {
    h.params = new URLSearchParams();
    h.definirParametros.mockClear();
  });

  it('escreve com { replace: true } e só o que mudou', async () => {
    const { result } = renderHook(() => useContactsSearch(), { wrapper });

    // URL vazia e estado default: não há nada para reescrever.
    expect(h.definirParametros).not.toHaveBeenCalled();

    act(() => result.current.setFilterCompany('ACME'));

    await waitFor(() => expect(h.definirParametros).toHaveBeenCalled());
    const [params, opcoes] = ultimaChamada() as [URLSearchParams, { replace: boolean }];
    expect(opcoes).toEqual({ replace: true });
    expect(params.get('company')).toBe('ACME');
    // A tag nunca entra na URL, mesmo quando o filtro existe em memória.
    expect(params.get('tag')).toBeNull();
    expect(params.get('q')).toBeNull();
  });

  it('busca, aba e página chegam à URL; a tag não', async () => {
    const { result } = renderHook(() => useContactsSearch(), { wrapper });

    act(() => result.current.setActiveTab('lead'));
    act(() => result.current.setPage(2));

    await waitFor(() => {
      const [params] = ultimaChamada() as [URLSearchParams];
      expect(params.get('tab')).toBe('lead');
      expect(params.get('p')).toBe('3');
    });

    // A tag entra em memória (e volta para a página 0), mas não é espelhada.
    act(() => result.current.setFilterTag('vip'));

    await waitFor(() => {
      const [params, opcoes] = ultimaChamada() as [URLSearchParams, { replace: boolean }];
      expect(opcoes).toEqual({ replace: true });
      expect(params.get('tag')).toBeNull();
      expect(params.get('tab')).toBe('lead');
    });
    expect(result.current.filterTag).toBe('vip');
    expect(result.current.page).toBe(0);
  });
});
