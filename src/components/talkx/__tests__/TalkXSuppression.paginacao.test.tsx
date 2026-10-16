import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';

/**
 * HZ2-013 — a lista de supressão lia `talkx_blacklist` sem `.range()`: o
 * PostgREST corta a resposta no teto de linhas do projeto (1000) SEM avisar.
 * Com 1500 supressões, o operador via 1000 e a tela dizia "de 1.000 contatos
 * suprimidos" — as outras 500 não existiam para ele (e as contagens por motivo
 * e a marcação em massa saíam sobre uma lista truncada).
 *
 * A prova é sobre a TELA: 1500 linhas na tabela do servidor ⇒ "de 1.500
 * contatos suprimidos" e duas idas ao servidor por `range` (0-999 e 1000-1999).
 */

const CAP = 1000; // teto por resposta do PostgREST (o mesmo do projeto)

const h = vi.hoisted(() => ({
  allRows: [] as unknown[],
  ranges: [] as Array<{ select: string; from: number; to: number }>,
}));

vi.mock('@/integrations/supabase/client', () => {
  function makeChain() {
    const rec = { select: '', from: -1, to: -1 };
    const chain: Record<string, unknown> = {};
    const keep = () => chain;
    chain.select = (fields?: string) => { rec.select = fields ?? ''; return chain; };
    chain.is = keep;
    chain.eq = keep;
    chain.in = keep;
    chain.not = keep;
    chain.order = keep;
    chain.or = keep;
    chain.range = (from: number, to: number) => { rec.from = from; rec.to = to; h.ranges.push({ select: rec.select, from, to }); return chain; };
    chain.then = (resolve: (v: unknown) => unknown, reject?: (e: unknown) => unknown) =>
      Promise.resolve(run(rec)).then(resolve, reject);
    return chain;
  }

  // Simula o PostgREST: a fatia é aplicada AQUI e a resposta nunca passa de CAP linhas.
  function run(rec: { select: string; from: number; to: number }) {
    const all = h.allRows;
    if (rec.from < 0) return { data: all.slice(0, CAP), error: null };
    const end = Math.min(rec.to + 1, rec.from + CAP, all.length);
    return { data: all.slice(rec.from, end), error: null };
  }

  return {
    supabase: {
      auth: { getUser: () => Promise.resolve({ data: { user: null }, error: null }) },
      from: () => makeChain(),
    },
  };
});

vi.mock('@/lib/supabaseHelpers', () => ({
  fromTable: () => ({
    insert: () => Promise.resolve({ error: null }),
    select: () => ({ in: () => Promise.resolve({ data: [], error: null }) }),
  }),
}));

vi.mock('@/hooks/auth/useAuth', () => ({
  useAuth: () => ({ profile: { id: 'profile-1' }, user: { id: 'profile-1' }, session: null, loading: false }),
}));

vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn(), info: vi.fn() } }));

import { TalkXSuppression } from '../TalkXSuppression';

const TOTAL = 1500;

// 1500 linhas: `created_at` estritamente decrescente e `id` único, para a
// fatia por `range` não repetir nem perder linha.
h.allRows = Array.from({ length: TOTAL }, (_, i) => ({
  id: `bl-${TOTAL - i}`,
  contact_id: null,
  phone: `55119${String(10000000 + i).slice(-8)}`,
  reason: 'Opt-out solicitado',
  blocked_by: 'profile-1',
  created_at: new Date(Date.UTC(2026, 8, 30) - i * 60_000).toISOString(),
  origin: 'optout',
  campaign_id: null,
  removed_by: null,
  removed_at: null,
  contacts: null,
}));

function wrap(ui: ReactNode) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={qc}>{ui}</QueryClientProvider>);
}

describe('TalkXSuppression · lista completa acima do teto do PostgREST (HZ2-013)', () => {
  beforeEach(() => {
    h.ranges.length = 0;
    window.localStorage.clear();
    window.sessionStorage.clear();
  });

  it('mostra as 1500 supressões (não só as 1000 da primeira resposta)', async () => {
    wrap(<TalkXSuppression />);

    await waitFor(
      () => expect(screen.getByText(/de 1\.500 contatos suprimidos/)).toBeTruthy(),
      { timeout: 5000 },
    );

    const paginas = h.ranges.filter((r) => r.select.includes('contacts('));
    expect(paginas.map((p) => [p.from, p.to])).toEqual([
      [0, CAP - 1],
      [CAP, CAP * 2 - 1],
    ]);
  });
});
