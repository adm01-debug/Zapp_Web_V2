import { describe, it, expect, vi } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import React from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

/**
 * #179 (TRA-011) — a lista distinta de etiquetas da inbox derivava de uma consulta **não paginada**
 * a `contacts`. Sem `.range()`, o PostgREST devolve só a primeira página (teto do projeto: 1000
 * linhas); o `Set` de tags era montado em cima desse recorte e as etiquetas que só aparecem depois
 * da primeira página sumiam do filtro — em silêncio.
 *
 * Aqui o mock reproduz o teto do PostgREST: sem `.range()` só devolve 1000 linhas; com `.range()`
 * devolve a fatia pedida. O dataset tem 1500 contatos e a etiqueta `Raro` só existe a partir do
 * índice 1200 (fora da primeira página).
 */
const h = vi.hoisted(() => {
  const PAGE_CAP = 1000;
  const TOTAL = 1500;

  // `Raro` só aparece do índice 1200 em diante; `Comum` aparece já na primeira página.
  const contacts = Array.from({ length: TOTAL }, (_, i) => ({
    id: `c${String(i).padStart(5, '0')}`,
    tags: i >= 1200 ? ['Raro', 'Comum'] : ['Comum'],
  }));

  function makeQuery(_table: string) {
    let from: number | null = null;
    let to: number | null = null;
    const q: Record<string, unknown> = {
      select: () => q,
      not: () => q,
      order: () => q,
      range: (f: number, t: number) => { from = f; to = t; return q; },
      then: (resolve: (v: unknown) => unknown) => {
        const data = from === null
          ? contacts.slice(0, PAGE_CAP) // teto do PostgREST quando não há `range`
          : contacts.slice(from, (to ?? 0) + 1);
        return Promise.resolve(resolve({ data, error: null }));
      },
    };
    return q;
  }

  return { makeQuery, TOTAL };
});

vi.mock('@/integrations/supabase/client', () => ({
  supabase: { from: (table: string) => h.makeQuery(table) },
}));

import { useInboxFilterTags } from '../useInboxFilterTags';

function wrapper({ children }: { children: React.ReactNode }) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  return <QueryClientProvider client={qc}>{children}</QueryClientProvider>;
}

describe('useInboxFilterTags — lista distinta cobre TODOS os contatos (#179)', () => {
  it('inclui etiqueta que só existe além da primeira página do PostgREST', async () => {
    const { result } = renderHook(() => useInboxFilterTags(), { wrapper });

    await waitFor(() => expect(result.current.data).toBeDefined());

    const nomes = (result.current.data ?? []).map((t) => t.name);
    expect(nomes).toContain('Comum');
    // Defeito: sem paginação, `Raro` (índice 1200+) fica de fora da primeira página.
    expect(nomes).toContain('Raro');
  });
});
