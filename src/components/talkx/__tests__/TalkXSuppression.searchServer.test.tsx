import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';

/**
 * Integração — busca server-side com join interno e filtro separado
 * pai/embed (TL-165).
 *
 * Provas:
 * 1. A consulta usa `contacts!inner` (join interno).
 * 2. A busca vai ao servidor em duas consultas: um `.or()` só nas colunas da
 *    supressão e outro só nas colunas de `contacts` (referencedTable) —
 *    nenhum `.or()` mistura os dois.
 * 3. A busca NÃO é aplicada client-side no `filtered` — o dado já vem
 *    filtrado do servidor.
 */

const h = vi.hoisted(() => ({
  allRows: [
    {
      id: 'bl-1',
      contact_id: 'c1',
      phone: null,
      reason: 'Opt-out solicitado',
      blocked_by: 'profile-1',
      created_at: '2026-09-01T10:00:00.000Z',
      origin: 'optout',
      campaign_id: null,
      removed_by: null,
      removed_at: null,
      contacts: { name: 'Ana Souza', phone: '+5511999990001', company: 'ACME', avatar_url: null },
    },
    {
      id: 'bl-2',
      contact_id: null,
      phone: '5511988887777',
      reason: 'Bloqueio manual',
      blocked_by: 'profile-1',
      created_at: '2026-09-02T10:00:00.000Z',
      origin: 'manual',
      campaign_id: null,
      removed_by: null,
      removed_at: null,
      contacts: null,
    },
    {
      id: 'bl-3',
      contact_id: 'c3',
      phone: null,
      reason: 'Reclamação de spam',
      blocked_by: 'profile-1',
      created_at: '2026-09-03T10:00:00.000Z',
      origin: 'manual',
      campaign_id: null,
      removed_by: null,
      removed_at: null,
      contacts: { name: 'Carlos Dias', phone: '+5511999990003', company: null, avatar_url: null },
    },
  ],
  queries: [] as Array<{ select: string; or: string[]; orTable: (string | undefined)[] }>,
}));

type QueryRec = { select: string; or: string[]; orTable: (string | undefined)[] };

vi.mock('@/integrations/supabase/client', () => {
  function makeChain() {
    const rec: QueryRec = { select: '', or: [], orTable: [] };
    h.queries.push(rec);
    const chain: Record<string, unknown> = {};
    chain.select = (fields?: string) => { rec.select = fields ?? ''; return chain; };
    chain.is = () => chain;
    chain.order = () => chain;
    chain.or = (filter: string, opts?: { referencedTable?: string }) => {
      rec.or.push(filter);
      rec.orTable.push(opts?.referencedTable);
      return chain;
    };
    chain.then = (resolve: (v: unknown) => unknown, reject?: (e: unknown) => unknown) =>
      Promise.resolve(run(rec)).then(resolve, reject);
    return chain;
  }
  return {
    supabase: {
      auth: { getUser: () => Promise.resolve({ data: { user: null }, error: null }) },
      from: () => makeChain(),
    },
  };

  // Simula o PostgREST: o filtro é aplicado AQUI (servidor), nunca no componente.
  function run(rec: QueryRec) {
    type Row = { contacts: { name: string; phone: string } | null; phone: string | null; reason: string | null };
    let data = h.allRows as unknown as Row[];
    if (rec.select.includes('contacts!inner')) data = data.filter((r) => r.contacts);
    rec.or.forEach((filter, i) => {
      const terms = filter.split(',').map((t) => t.match(/ilike\."%(.+?)%"/)?.[1].toLowerCase()).filter(Boolean) as string[];
      data = data.filter((r) => terms.some((term) => (rec.orTable[i] === 'contacts'
        ? r.contacts?.name.toLowerCase().includes(term) || r.contacts?.phone.includes(term)
        : r.phone?.includes(term) || (r.reason ?? '').toLowerCase().includes(term))));
    });
    return { data, error: null };
  }
});

vi.mock('@/lib/supabaseHelpers', () => ({
  fromTable: () => ({
    insert: () => Promise.resolve({ error: null }),
  }),
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

describe('TalkXSuppression · busca server-side com join interno (TL-165)', () => {
  beforeEach(() => {
    h.queries.length = 0;
    // O termo de busca persiste em storage (useTalkXFilterState): sem limpar, vaza entre testes.
    window.localStorage.clear();
    window.sessionStorage.clear();
  });

  it('a busca por contato usa contacts!inner (join interno) no servidor', async () => {
    wrap(<TalkXSuppression />);
    await waitFor(() => expect(screen.getByText('Ana Souza')).toBeTruthy(), { timeout: 3000 });
    fireEvent.change(screen.getByPlaceholderText(/Buscar por contato, telefone/i), { target: { value: 'Ana' } });
    await waitFor(() => expect(h.queries.some((q) => q.select.includes('contacts!inner'))).toBe(true), { timeout: 3000 });
  });

  it('a busca envia dois .or() separados: contatos (referencedTable) e colunas da supressão', async () => {
    wrap(<TalkXSuppression />);
    await waitFor(() => expect(screen.getByText('Ana Souza')).toBeTruthy(), { timeout: 3000 });
    h.queries.length = 0;

    fireEvent.change(screen.getByPlaceholderText(/Buscar por contato, telefone/i), { target: { value: 'spam' } });

    await waitFor(() => {
      const ors = h.queries.filter((q) => q.or.length > 0);
      expect(ors).toHaveLength(2);
      const contactQuery = ors.find((q) => q.select.includes('contacts!inner'));
      const ownQuery = ors.find((q) => !q.select.includes('!inner'));
      expect(contactQuery?.orTable).toEqual(['contacts']);
      expect(contactQuery?.or[0]).toContain('name.ilike');
      expect(contactQuery?.or[0]).toContain('phone.ilike');
      expect(contactQuery?.or[0]).not.toContain('reason');
      expect(ownQuery?.or[0]).toContain('reason.ilike');
      expect(ownQuery?.or[0]).not.toContain('contacts.');
    }, { timeout: 3000 });
  });

  it('busca por nome de contato retorna apenas a linha correspondente (server-side)', async () => {
    wrap(<TalkXSuppression />);
    await waitFor(() => expect(screen.getByText('Ana Souza')).toBeTruthy(), { timeout: 3000 });

    const input = screen.getByPlaceholderText(/Buscar por contato, telefone/i);
    fireEvent.change(input, { target: { value: 'Ana' } });

    await waitFor(() => {
      expect(screen.getByText('Ana Souza')).toBeTruthy();
      expect(screen.queryByText('Carlos Dias')).toBeNull();
      expect(screen.queryByText('Bloqueio manual')).toBeNull();
    }, { timeout: 3000 });
  });

  it('busca por motivo (embed) retorna apenas a linha correspondente (server-side)', async () => {
    wrap(<TalkXSuppression />);
    await waitFor(() => expect(screen.getByText('Ana Souza')).toBeTruthy(), { timeout: 3000 });

    const input = screen.getByPlaceholderText(/Buscar por contato, telefone/i);
    fireEvent.change(input, { target: { value: 'spam' } });

    await waitFor(() => {
      expect(screen.getByText('Reclamação de spam')).toBeTruthy();
      expect(screen.queryByText('Ana Souza')).toBeNull();
      // "Bloqueio manual" também é o rótulo da origem da linha de spam; a linha excluída é a do telefone avulso.
      expect(screen.queryByText('+5511988887777')).toBeNull();
    }, { timeout: 3000 });
  });

  it('busca por telefone retorna apenas a linha correspondente (server-side)', async () => {
    wrap(<TalkXSuppression />);
    await waitFor(() => expect(screen.getByText('Ana Souza')).toBeTruthy(), { timeout: 3000 });

    const input = screen.getByPlaceholderText(/Buscar por contato, telefone/i);
    fireEvent.change(input, { target: { value: '988887777' } });

    await waitFor(() => {
      expect(screen.getByText('+5511988887777')).toBeTruthy();
      expect(screen.queryByText('Ana Souza')).toBeNull();
      expect(screen.queryByText('Carlos Dias')).toBeNull();
    }, { timeout: 3000 });
  });

  it('limpar a busca restaura todas as linhas (sem filtro server-side)', async () => {
    wrap(<TalkXSuppression />);
    await waitFor(() => expect(screen.getByText('Ana Souza')).toBeTruthy(), { timeout: 3000 });

    const input = screen.getByPlaceholderText(/Buscar por contato, telefone/i);
    fireEvent.change(input, { target: { value: 'Ana' } });

    await waitFor(() => expect(screen.queryByText('Carlos Dias')).toBeNull(), { timeout: 3000 });

    fireEvent.change(input, { target: { value: '' } });

    await waitFor(() => {
      expect(screen.getByText('Ana Souza')).toBeTruthy();
      expect(screen.getByText('Carlos Dias')).toBeTruthy();
      expect(screen.getByText('+5511988887777')).toBeTruthy();
    }, { timeout: 3000 });
  });
});