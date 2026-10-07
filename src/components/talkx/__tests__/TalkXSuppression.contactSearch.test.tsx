import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import React from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

/**
 * #407 (R2-MOD-035) — "Cadastro de supressão busca contato somente no primeiro
 * lote carregado" (TalkXSuppression.tsx:69-80).
 *
 * Defeito: o modal "Adicionar à Lista de Supressão" carregava UM lote de
 * contatos e filtrava no cliente. O PostgREST corta a resposta (teto de linhas),
 * então quem estava fora do primeiro lote não aparecia por mais que o usuário
 * digitasse o nome certo — a busca nunca ia ao servidor.
 *
 * O mock abaixo emula o corte do servidor (`maxRows`): sem filtro devolve o
 * primeiro lote; com `name.ilike`/`phone.ilike` no `.or()` devolve o resultado
 * do filtro sobre a base inteira. `orFilters` registra o que o componente
 * mandou ao servidor.
 *
 * Vermelho antes do fix: digitar "Zulmira" (fora do primeiro lote) não mostra
 * nada E nenhum filtro chega ao servidor.
 */

const h = vi.hoisted(() => {
  const contacts = [
    { id: 'c1', name: 'Ana Souza', phone: '+5511999990001', company: 'ACME' },
    { id: 'c2', name: 'Bruno Lima', phone: '+5511999990002', company: 'ACME' },
    { id: 'c3', name: 'Zulmira Prado', phone: '+5511777770003', company: 'Beta' },
  ];
  const blacklist = [
    {
      id: 'bl-1',
      contact_id: 'c9',
      reason: 'Bloqueio manual',
      blocked_by: 'profile-1',
      created_at: '2026-09-01T10:00:00.000Z',
      origin: 'manual',
      campaign_id: null,
      removed_by: null,
      removed_at: null,
      contacts: { name: 'Contato Antigo', phone: '+5511000000000', company: null, avatar_url: null },
    },
  ];
  return { contacts, blacklist, orFilters: [] as string[], maxRows: 2, inserts: [] as Record<string, unknown>[] };
});

/** Emula o `ilike` do PostgREST sobre o filtro `.or()` montado pelo componente. */
function matchesOrFilter(row: { name?: string; phone?: string }, orFilter: string): boolean {
  const terms = Array.from(orFilter.matchAll(/ilike\."%(.*?)%"/g)).map((m) => m[1].toLowerCase());
  return terms.some((t) => (row.name ?? '').toLowerCase().includes(t) || (row.phone ?? '').includes(t));
}

vi.mock('@/integrations/supabase/client', () => {
  const builder = (table: string) => {
    const state = { orFilter: '' };
    const run = () => {
      let data: unknown[] = table === 'contacts' ? h.contacts : h.blacklist;
      if (state.orFilter) data = data.filter((r) => matchesOrFilter(r as { name?: string; phone?: string }, state.orFilter));
      // teto de linhas por resposta, como o PostgREST aplica
      return { data: data.slice(0, h.maxRows), error: null };
    };
    const self: Record<string, unknown> = {};
    self.select = () => self;
    self.is = () => self;
    self.not = () => self;
    self.eq = () => self;
    self.order = () => self;
    self.limit = () => Promise.resolve(run());
    self.or = (filter: string) => {
      state.orFilter = filter;
      h.orFilters.push(filter);
      return self;
    };
    self.then = (resolve: unknown, reject: unknown) =>
      Promise.resolve(run()).then(resolve as (v: unknown) => unknown, reject as (e: unknown) => unknown);
    return self;
  };
  return {
    supabase: {
      auth: { getUser: () => Promise.resolve({ data: { user: null }, error: null }) },
      from: (table: string) => builder(table),
    },
  };
});

vi.mock('@/lib/supabaseHelpers', () => ({
  fromTable: () => ({
    insert: (payload: Record<string, unknown>) => {
      h.inserts.push(payload);
      return Promise.resolve({ error: null });
    },
  }),
}));

vi.mock('@/hooks/auth/useAuth', () => ({
  useAuth: () => ({ user: { id: 'auth-user-1' }, profile: { id: 'profile-1' }, session: {}, loading: false }),
}));

vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn(), info: vi.fn() } }));

import { TalkXSuppression } from '@/components/talkx/TalkXSuppression';

function renderView() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <TalkXSuppression />
    </QueryClientProvider>,
  );
}

async function openAddDialog() {
  renderView();
  fireEvent.click(await screen.findByRole('button', { name: /Adicionar contato/i }));
  fireEvent.click(await screen.findByPlaceholderText(/Nome ou telefone/));
}

describe('TalkXSuppression · busca de contato no servidor (#407/R2-MOD-035)', () => {
  beforeEach(() => {
    h.orFilters.length = 0;
    h.inserts.length = 0;
  });

  it('acha contato fora do primeiro lote carregado, mandando o termo ao servidor', async () => {
    await openAddDialog();

    // Primeiro lote: só o que o servidor devolveu (Ana e Bruno, teto de 2 linhas).
    expect(await screen.findByRole('button', { name: /Ana Souza/ })).toBeTruthy();
    expect(screen.getByRole('button', { name: /Bruno Lima/ })).toBeTruthy();
    expect(screen.queryByRole('button', { name: /Zulmira Prado/ })).toBeNull();
    expect(h.orFilters).toHaveLength(0);

    // "Zulmira" está na base, mas fora do primeiro lote.
    fireEvent.change(screen.getByPlaceholderText(/Nome ou telefone/), { target: { value: 'Zulmira' } });

    expect(await screen.findByRole('button', { name: /Zulmira Prado/ }, { timeout: 3000 })).toBeTruthy();
    expect(h.orFilters.some((f) => f.includes('Zulmira'))).toBe(true);
  });

  it('acha contato pelo telefone, também fora do primeiro lote', async () => {
    await openAddDialog();
    expect(await screen.findByRole('button', { name: /Ana Souza/ })).toBeTruthy();

    fireEvent.change(screen.getByPlaceholderText(/Nome ou telefone/), { target: { value: '77777' } });

    expect(await screen.findByRole('button', { name: /Zulmira Prado/ }, { timeout: 3000 })).toBeTruthy();
    expect(h.orFilters.some((f) => f.includes('77777'))).toBe(true);
  });

  it('sem termo de busca, mostra o primeiro lote e não manda filtro ao servidor', async () => {
    await openAddDialog();

    expect(await screen.findByRole('button', { name: /Ana Souza/ })).toBeTruthy();
    expect(screen.getByRole('button', { name: /Bruno Lima/ })).toBeTruthy();
    expect(h.orFilters).toHaveLength(0);
  });
});
