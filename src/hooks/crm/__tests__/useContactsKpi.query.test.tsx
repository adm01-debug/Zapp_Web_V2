import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * Regressão (soft-delete): `fetchKpiRows` precisa aplicar `.is('deleted_at', null)`
 * em toda página da consulta, senão o KPI conta contatos soft-deletados e o card
 * "Total" (3104, da RPC `contacts_count_by_type`) diverge do delta/séries do hook
 * (3106). O fix do filtro entrou no main (PR #1364); este teste trava o contrato,
 * porque o teste de paginação daquele PR mocka `.is()` sem registrar a chamada.
 */

const h = vi.hoisted(() => ({
  isCalls: [] as unknown[][],
  rows: [] as unknown[],
}));

vi.mock('@/integrations/supabase/client', () => {
  const makeChain = () => {
    const chain = {
      is: (...args: unknown[]) => {
        h.isCalls.push(args);
        return chain;
      },
      eq: () => chain,
      filter: () => chain,
      order: () => chain,
      range: async () => ({ data: h.rows, error: null }),
    };
    return chain;
  };
  return {
    supabase: {
      from: vi.fn(() => ({ select: vi.fn(() => makeChain()) })),
    },
  };
});

import { fetchKpiRows } from '../useContactsKpi';

beforeEach(() => {
  h.isCalls = [];
  h.rows = [];
});

describe('fetchKpiRows — filtro de soft-delete', () => {
  it('aplica .is("deleted_at", null) em cada página da consulta', async () => {
    await fetchKpiRows(false);
    expect(h.isCalls.length).toBeGreaterThan(0);
    expect(h.isCalls[0]).toEqual(['deleted_at', null]);
  });

  it('mantém o filtro de deleted_at também quando includeLegacy=true', async () => {
    await fetchKpiRows(true);
    expect(h.isCalls.length).toBeGreaterThan(0);
    expect(h.isCalls[0]).toEqual(['deleted_at', null]);
  });
});
