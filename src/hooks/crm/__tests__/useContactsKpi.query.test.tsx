import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * Regressão (soft-delete + legado): as contagens de janela (`novosPrev30`,
 * `fornecedores30`, `fornecedoresPrev30`) precisam do MESMO recorte das RPCs
 * `contacts_stats`/`contacts_stats_series` — senão o delta do KPI diverge dos
 * cards. Sem `deleted_at IS NULL` o KPI contaria contato soft-deletado; sem o
 * recorte de legado, contaria o que a lista esconde.
 */
const h = vi.hoisted(() => ({
  filters: [] as unknown[],
}));

vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    rpc: async () => ({ data: {}, error: null }),
    from: () => ({
      select: () => {
        const chain = {
          is: (...a: unknown[]) => { h.filters.push(['is', ...a]); return chain; },
          eq: (...a: unknown[]) => { h.filters.push(['eq', ...a]); return chain; },
          filter: (...a: unknown[]) => { h.filters.push(['filter', ...a]); return chain; },
          gte: () => chain,
          lt: () => chain,
          order: () => chain,
          range: () => chain,
          then: (res: (v: unknown) => unknown) => res({ data: null, error: null, count: 0 }),
        };
        return chain;
      },
    }),
  },
}));

import { fetchContactsKpi } from '../useContactsKpi';
import { CONTACT_VISIBLE_PHONE_PATTERN } from '../contactsAggregates';

beforeEach(() => {
  h.filters = [];
});

describe('contagens de janela — recorte igual ao das RPCs', () => {
  it('aplica .is("deleted_at", null) com legados desligados', async () => {
    await fetchContactsKpi(false);
    expect(h.filters).toContainEqual(['is', 'deleted_at', null]);
  });

  it('aplica .is("deleted_at", null) com legados ligados', async () => {
    await fetchContactsKpi(true);
    expect(h.filters).toContainEqual(['is', 'deleted_at', null]);
  });

  it('esconde legado (is_lid_legacy = false + telefone visível) quando includeLegacy é falso', async () => {
    await fetchContactsKpi(false);
    expect(h.filters).toContainEqual(['eq', 'is_lid_legacy', false]);
    expect(h.filters).toContainEqual(['filter', 'phone', 'match', CONTACT_VISIBLE_PHONE_PATTERN]);
  });

  it('não aplica o recorte de legado quando includeLegacy é verdadeiro', async () => {
    await fetchContactsKpi(true);
    expect(h.filters).not.toContainEqual(['eq', 'is_lid_legacy', false]);
    expect(h.filters.some(f => Array.isArray(f) && f[0] === 'filter')).toBe(false);
  });
});
