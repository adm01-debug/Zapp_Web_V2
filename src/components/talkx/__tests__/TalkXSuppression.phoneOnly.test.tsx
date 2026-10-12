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

  type Row = (typeof rows)[number];
  const like = (value: string | null | undefined, pattern: string) =>
    (value ?? '').toLowerCase().includes(pattern.replace(/%/g, '').replace(/^"|"$/g, '').toLowerCase());

  // Imita o PostgREST no que a busca usa: `.or()` do pai (phone/contact_id) e
  // `.or()` do embed com `!inner` (restringe o pai pelo contato).
  const blacklistChain = () => {
    const parentOrs: string[] = [];
    const embedOrs: string[] = [];
    const self: Record<string, unknown> = {};
    self.select = () => self;
    self.is = () => self;
    self.eq = () => self;
    self.ilike = () => self;
    self.or = (filter: string, opts?: { referencedTable?: string }) => {
      (opts?.referencedTable ? embedOrs : parentOrs).push(filter);
      return self;
    };
    self.order = () => self;
    self.range = () => {
      let out: Row[] = rows;
      for (const f of parentOrs) {
        out = out.filter((r) => f.split(/,(?=phone\.|contact_id\.)/).some((part) => {
          if (part.startsWith('phone.ilike.')) return like(r.phone, part.slice('phone.ilike.'.length));
          if (part.startsWith('contact_id.in.(')) return part.slice('contact_id.in.('.length, -1).split(',').includes(r.contact_id ?? '');
          return false;
        }));
      }
      for (const f of embedOrs) {
        out = out.filter((r) => f.split(',').some((part) => {
          const [field, , ...pattern] = part.split('.');
          const c = r.contacts as { name?: string; email?: string } | null;
          return like(c?.[field as 'name' | 'email'], pattern.join('.'));
        }));
      }
      return Promise.resolve({ data: out, error: null, count: out.length });
    };
    return self;
  };

  const contactsChain = () => {
    let pattern = '';
    const self: Record<string, unknown> = {};
    self.select = () => self;
    self.not = () => self;
    self.ilike = (_col: string, p: string) => { pattern = p; return self; };
    self.order = () => self;
    self.limit = () => Promise.resolve({
      data: like('+5511977776666', pattern) ? [{ id: 'c1' }] : [],
      error: null,
    });
    return self;
  };

  const emptyChain = () => {
    const self: Record<string, unknown> = {};
    for (const m of ['select', 'is', 'not', 'eq', 'in', 'gte', 'lte', 'order', 'ilike', 'or']) self[m] = () => self;
    self.range = () => Promise.resolve({ data: [], error: null, count: 0 });
    self.limit = () => Promise.resolve({ data: [], error: null });
    self.then = (res: (v: unknown) => unknown) => Promise.resolve({ data: [], error: null, count: 0 }).then(res);
    return self;
  };

  return {
    supabase: {
      from: (table: string) => {
        if (table === 'talkx_blacklist') return blacklistChain();
        if (table === 'contacts') return contactsChain();
        return emptyChain();
      },
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
    // (a tela formata o número e o mostra no bloco do contato e na coluna Telefone)
    expect((await screen.findAllByText('+55 11 98888-7777')).length).toBeGreaterThan(0);
    // E as duas linhas coexistem (a do contato continua com a dela).
    expect(screen.getByText('Ana Souza')).toBeTruthy();
    expect(screen.getAllByText('+55 11 97777-6666').length).toBeGreaterThan(0);
  });

  it('encontra pela busca: digitar o telefone filtra até a linha suprimida', async () => {
    wrap(<TalkXSuppression />);
    await buscar('988887777');

    await waitFor(() => {
      // A busca foi aplicada (a linha do outro telefone saiu)…
      expect(screen.queryByText('Ana Souza')).toBeNull();
      // …e a linha bloqueada só por telefone PERMANECE.
      expect(screen.getAllByText('+55 11 98888-7777').length).toBeGreaterThan(0);
    }, { timeout: 3000 });
    expect(screen.queryByText('Nenhum resultado')).toBeNull();
  });

  it('busca por nome continua funcionando: acha o contato e deixa o bloqueio por telefone fora', async () => {
    wrap(<TalkXSuppression />);
    await buscar('ana souza');

    await waitFor(() => {
      expect(screen.getByText('Ana Souza')).toBeTruthy();
      expect(screen.queryByText('+55 11 98888-7777')).toBeNull();
    }, { timeout: 3000 });
  });

  it('termo com dígito que não é busca de telefone não casa o número por acidente', async () => {
    wrap(<TalkXSuppression />);
    await buscar('ana 5');

    // 'ana 5' não casa nenhum dos dois registros; em especial NÃO pode revelar o
    // bloqueio por telefone só porque o dígito 5 aparece dentro do número.
    await waitFor(() => expect(screen.getByText('Nenhum resultado')).toBeTruthy(), { timeout: 3000 });
    expect(screen.queryByText('+55 11 98888-7777')).toBeNull();
  });
});
