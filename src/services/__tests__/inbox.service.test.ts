import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * Inventário frontend 6 · Outros / Camada de serviços: o filtro de etiquetas da inbox
 * lia `contacts` chamando o Supabase DIRETO de dentro de `useInboxFilterTags`. Este
 * teste cobra a leitura da camada de serviços (`src/services/inbox.service.ts`), que
 * passa a ser quem fala com o banco.
 *
 * O mock reproduz o teto de página do PostgREST: sem `.range()` só vem a primeira
 * página (1000 linhas). A etiqueta `Raro` só existe do índice 1200 em diante — fora
 * da primeira página —, então uma leitura não paginada a perde em silêncio.
 */
const h = vi.hoisted(() => {
  const PAGE_CAP = 1000;
  const TOTAL = 1500;

  const contacts = Array.from({ length: TOTAL }, (_, i) => ({
    id: `c${String(i).padStart(5, '0')}`,
    tags: i >= 1200 ? ['Raro', 'Comum'] : ['Comum'],
  }));

  const state: { fail: { message: string } | null } = { fail: null };

  function makeQuery() {
    let from: number | null = null;
    let to: number | null = null;
    const q: Record<string, unknown> = {
      select: () => q,
      not: () => q,
      order: () => q,
      range: (f: number, t: number) => { from = f; to = t; return q; },
      then: (resolve: (v: unknown) => unknown) => {
        if (state.fail) return Promise.resolve(resolve({ data: null, error: state.fail }));
        const data = from === null
          ? contacts.slice(0, PAGE_CAP) // teto do PostgREST quando não há `range`
          : contacts.slice(from, (to ?? 0) + 1);
        return Promise.resolve(resolve({ data, error: null }));
      },
    };
    return q;
  }

  return { makeQuery, state, TOTAL };
});

vi.mock('@/integrations/supabase/client', () => ({
  supabase: { from: () => h.makeQuery() },
}));

import { fetchInboxFilterTags } from '../inbox.service';

describe('fetchInboxFilterTags — leitura da camada de serviços', () => {
  beforeEach(() => { h.state.fail = null; });

  it('paginando, cobre TODAS as etiquetas (inclusive as que só existem além da primeira página)', async () => {
    const tags = await fetchInboxFilterTags();
    const nomes = tags.map((t) => t.name);

    expect(h.TOTAL).toBeGreaterThan(1000); // o dataset passa do teto: o teste tem dente
    expect(nomes).toContain('Comum');
    expect(nomes).toContain('Raro');
  });

  it('deduplica, ordena e devolve id = nome com a cor do filtro', async () => {
    const tags = await fetchInboxFilterTags();

    expect(tags).toEqual([
      { id: 'Comum', name: 'Comum', color: '#6366f1' },
      { id: 'Raro', name: 'Raro', color: '#6366f1' },
    ]);
  });

  it('erro no meio da leitura sobe — não devolve lista parcial como se fosse o universo', async () => {
    h.state.fail = { message: 'permissão negada' };

    await expect(fetchInboxFilterTags()).rejects.toThrow('permissão negada');
  });
});
