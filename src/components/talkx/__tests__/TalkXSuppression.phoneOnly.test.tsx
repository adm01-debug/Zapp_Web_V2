import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';

/**
 * R2-MOD-034 (#406) — bloqueio cadastrado SOMENTE por telefone (contact_id NULL,
 * phone preenchido): a linha mostra o telefone da própria supressão e a busca a
 * encontra. Vermelho antes do fix: célula Telefone vazia e busca sem a linha.
 */

vi.mock('@/integrations/supabase/client', () => {
  const rows = [
    {
      id: 'bl-phone',
      contact_id: null,
      phone: '5511988887777',
      reason: 'Bloqueio manual',
      blocked_by: null,
      created_at: '2026-09-20T10:00:00.000Z',
      origin: 'manual',
      campaign_id: null,
      removed_by: null,
      removed_at: null,
      contacts: null,
    },
    {
      id: 'bl-contact',
      contact_id: 'c1',
      phone: null,
      reason: 'Opt-out solicitado',
      blocked_by: null,
      created_at: '2026-09-19T10:00:00.000Z',
      origin: 'optout',
      campaign_id: null,
      removed_by: null,
      removed_at: null,
      contacts: { name: 'Ana Souza', phone: '+5511977776666', company: 'ACME', avatar_url: null },
    },
  ];

  /**
   * Emula o servidor no contrato da listagem nova (X178): `range` fatia a
   * página, `count` é o total do filtro, o `or` casa colunas da PRÓPRIA linha
   * (`phone.ilike`, `reason.ilike`, `contact_id.in.(…)`) e o contato vinculado é
   * resolvido numa consulta anterior a `contacts`. As asserções deste arquivo
   * NÃO mudaram; só o mock passou a emular o que a tela manda ao servidor (a
   * listagem deixou de filtrar em memória).
   */
  const contactRows = rows
    .filter((row) => row.contacts && row.contact_id)
    .map((row) => ({ id: row.contact_id as string, ...(row.contacts as Record<string, unknown>) }));

  const ilike = (value: unknown, term: string) => String(value ?? '').toLowerCase().includes(term.toLowerCase());

  /** Só colunas do próprio recurso: `col.ilike."%termo%"` e `contact_id.in.(a,b)`. */
  const matchesOr = (row: Record<string, unknown>, filter: string) =>
    filter.split(',').some((clause) => {
      const ilikeClause = clause.match(/^(\w+)\.ilike\."%(.*)%"$/);
      if (ilikeClause) return ilike(row[ilikeClause[1]], ilikeClause[2]);
      const inClause = clause.match(/^contact_id\.in\.\((.*)\)$/);
      if (inClause) return inClause[1].split(',').filter(Boolean).includes(String(row.contact_id));
      return false;
    });

  const builder = (table: string) => {
    const state = { or: '', from: 0, to: Number.POSITIVE_INFINITY };
    const run = () => {
      const base = (table === 'contacts' ? contactRows : rows.filter((row) => row.removed_at === null)) as unknown as Record<string, unknown>[];
      const data = state.or ? base.filter((row) => matchesOr(row, state.or)) : base;
      return {
        data: table === 'contacts' ? data : data.slice(state.from, state.to + 1),
        error: null,
        count: data.length,
      };
    };
    const self: Record<string, unknown> = {};
    const chain = () => self;
    self.select = chain;
    self.is = chain;
    self.not = chain;
    self.eq = chain;
    self.in = chain;
    self.gte = chain;
    self.order = chain;
    self.limit = chain;
    self.or = (filter: string) => { state.or = filter; return self; };
    self.range = (from: number, to: number) => { state.from = from; state.to = to; return self; };
    self.then = (resolve: unknown, reject: unknown) =>
      Promise.resolve(run()).then(resolve as (v: unknown) => unknown, reject as (e: unknown) => unknown);
    return self;
  };

  return {
    supabase: {
      from: (table: string) => builder(table),
    },
  };
});

vi.mock('@/lib/supabaseHelpers', () => ({
  fromTable: () => {
    const self: Record<string, unknown> = {};
    self.insert = () => Promise.resolve({ error: null });
    return self;
  },
}));

vi.mock('@/hooks/auth/useAuth', () => ({
  useAuth: () => ({ profile: { id: 'profile-1' }, user: { id: 'profile-1' }, session: null, loading: false }),
}));

vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn(), info: vi.fn() } }));

import { TalkXSuppression } from '../TalkXSuppression';

function wrap(ui: ReactNode) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={qc}>{ui}</QueryClientProvider>);
}

/** Digita na busca e espera o debounce de 250ms da barra aplicar o termo. */
async function buscar(value: string) {
  const input = await screen.findByPlaceholderText(/Buscar por contato, telefone/i);
  fireEvent.change(input, { target: { value } });
  return input;
}

describe('TalkXSuppression — supressão só por telefone (#406)', () => {
  beforeEach(() => { sessionStorage.clear(); });

  it('identifica a linha: o telefone da supressão aparece na tabela', async () => {
    wrap(<TalkXSuppression />);

    // A linha do bloqueio por telefone (sem contato vinculado) tem de identificar o número.
    expect(await screen.findByText('+5511988887777')).toBeTruthy();
    // E as duas linhas coexistem (a do contato continua com a dela).
    expect(screen.getByText('Ana Souza')).toBeTruthy();
    expect(screen.getByText('+5511977776666')).toBeTruthy();
  });

  it('encontra pela busca: digitar o telefone filtra até a linha suprimida', async () => {
    wrap(<TalkXSuppression />);
    await buscar('988887777');

    await waitFor(() => {
      // A busca foi aplicada (a linha do outro telefone saiu)…
      expect(screen.queryByText('Ana Souza')).toBeNull();
      // …e a linha bloqueada só por telefone PERMANECE.
      expect(screen.getByText('+5511988887777')).toBeTruthy();
    }, { timeout: 3000 });
    expect(screen.queryByText('Nenhum resultado')).toBeNull();
  });

  it('busca por nome continua funcionando: acha o contato e deixa o bloqueio por telefone fora', async () => {
    wrap(<TalkXSuppression />);
    await buscar('ana souza');

    await waitFor(() => {
      expect(screen.getByText('Ana Souza')).toBeTruthy();
      expect(screen.queryByText('+5511988887777')).toBeNull();
    }, { timeout: 3000 });
  });

  it('termo com dígito que não é busca de telefone não casa o número por acidente', async () => {
    wrap(<TalkXSuppression />);
    await buscar('ana 5');

    // 'ana 5' não casa nenhum dos dois registros; em especial NÃO pode revelar o
    // bloqueio por telefone só porque o dígito 5 aparece dentro do número.
    await waitFor(() => expect(screen.getByText('Nenhum resultado')).toBeTruthy(), { timeout: 3000 });
    expect(screen.queryByText('+5511988887777')).toBeNull();
  });
});
