import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';

/**
 * R2-MOD-034 (#406) — bloqueio cadastrado SOMENTE por telefone.
 *
 * A tela só olhava a relação `contacts:contact_id(...)`. Uma supressão criada no
 * eixo do telefone (contact_id NULL, phone preenchido — eixo garantido pelo índice
 * talkx_blacklist_phone_active_unique) não aparecia: a célula Telefone ficava vazia
 * ("+") e a busca não a encontrava.
 *
 * Vermelho antes do fix: o telefone da linha não aparece na tabela e a busca por
 * telefone não deixa a linha no resultado.
 * Verde depois: a linha mostra o telefone da própria supressão e a busca a encontra.
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

  // A busca por termo passou a ser feita NA CONSULTA (`.or()` no servidor), então
  // o mock precisa emular o PostgREST: `contacts!inner` só deixa passar linha com
  // contato e cada `.or()` restringe as linhas pelo termo do seu grupo.
  const matches = (r: Record<string, unknown>, o: { filter: string; table?: string }): boolean => {
    const terms = [...o.filter.matchAll(/ilike\."%(.+?)%"/g)].map((m) => m[1].toLowerCase());
    const contact = r.contacts as { name?: string | null; phone?: string | null } | null;
    return terms.some((t) => (o.table === 'contacts'
      ? (contact?.name ?? '').toLowerCase().includes(t) || (contact?.phone ?? '').includes(t)
      : ((r.phone as string | null) ?? '').includes(t) || ((r.reason as string | null) ?? '').toLowerCase().includes(t)));
  };

  const chain = (data: unknown[]) => {
    let rows = data;
    let joinInner = false;
    const ors: { filter: string; table?: string }[] = [];
    const self: Record<string, unknown> = {};
    self.select = (fields?: string) => { if (String(fields ?? '').includes('contacts!inner')) joinInner = true; return self; };
    self.is = (col: string, val: unknown) => { rows = rows.filter((r) => (r as Record<string, unknown>)[col] === val); return self; };
    self.not = () => self;
    self.eq = () => self;
    self.or = (filter: string, opts?: { referencedTable?: string }) => { ors.push({ filter, table: opts?.referencedTable }); return self; };
    self.order = () => self;
    // HZ2-013: a lista fecha a consulta com `.range()`; sem isso a cadeia emulada
    // quebra e a tela fica sem linhas.
    self.range = () => self;
    self.limit = () => Promise.resolve({ data: [], error: null });
    self.then = (resolve: (v: unknown) => unknown, reject?: (e: unknown) => unknown) => {
      let out = rows;
      if (joinInner) out = out.filter((r) => (r as Record<string, unknown>).contacts);
      for (const o of ors) out = out.filter((r) => matches(r as Record<string, unknown>, o));
      return Promise.resolve({ data: out, error: null }).then(resolve, reject);
    };
    return self;
  };

  return {
    supabase: {
      from: (table: string) => (table === 'talkx_blacklist' ? chain(rows) : chain([])),
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
