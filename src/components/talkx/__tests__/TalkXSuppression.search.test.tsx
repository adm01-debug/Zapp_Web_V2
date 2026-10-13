import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import React from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

/**
 * TL-165 — busca, filtros de origem/motivo e ordenação da lista de supressão.
 *
 * O mock do cliente emula o servidor: aplica `.is('removed_at', null)` e as
 * chamadas `.order()` (na ordem em que chegam) sobre as linhas, e registra o que
 * a tela pediu. A lista de bloqueios é ordenada por `created_at desc` no
 * servidor — a tela não reordena; a trilha de atividade (hook real) ordena por
 * `created_at desc, id desc`, e o desempate por `id` é provado com eventos no
 * mesmo instante.
 *
 * Os filtros de origem e motivo são lidos do estado persistido em
 * `sessionStorage` (`talkx.suppression.filters`): o filtro de motivo não tem
 * controle na barra, só o estado.
 */

const FILTER_KEY = 'talkx.suppression.filters';

type Row = Record<string, unknown>;

const h = vi.hoisted(() => ({
  blacklist: [] as Record<string, unknown>[],
  events: [] as Record<string, unknown>[],
  blacklistCalls: [] as { method: string; args: unknown[] }[],
  queries: [] as Array<{ select: string; or: string[]; orTable: (string | undefined)[] }>,
}));

function sortBy(rows: Row[], orders: { col: string; asc: boolean }[]): Row[] {
  return [...rows].sort((a, b) => {
    for (const o of orders) {
      const av = String(a[o.col]);
      const bv = String(b[o.col]);
      if (av !== bv) return (av < bv ? -1 : 1) * (o.asc ? 1 : -1);
    }
    return 0;
  });
}

/** Extrai os pares (coluna, termo) de um filtro `.or()` do PostgREST. */
function parseOrFilter(filter: string): Array<{ col: string; term: string }> {
  const out: Array<{ col: string; term: string }> = [];
  const re = /(\w+)\.ilike\."((?:[^"\\]|\\.)*)"/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(filter)) !== null) {
    const term = m[2]
      .replace(/\\"/g, '"')
      .replace(/\\\\/g, '\\')
      .replace(/^%+|%+$/g, '')
      .toLowerCase();
    out.push({ col: m[1], term });
  }
  return out;
}

/** Aplica um grupo `.or()` sobre a linha (semântica OU entre as condições). */
function rowMatchesOr(
  row: Row,
  conds: Array<{ col: string; term: string }>,
  referencedTable?: string,
): boolean {
  const contacts = (row.contacts ?? null) as { name?: unknown; phone?: unknown } | null;
  return conds.some(({ col, term }) => {
    if (!term) return false;
    if (referencedTable === 'contacts') {
      if (col === 'name') return String(contacts?.name ?? '').toLowerCase().includes(term);
      if (col === 'phone') return String(contacts?.phone ?? '').includes(term);
      return false;
    }
    if (col === 'reason') return String(row.reason ?? '').toLowerCase().includes(term);
    if (col === 'phone') return String(row.phone ?? '').includes(term);
    return false;
  });
}

vi.mock('@/integrations/supabase/client', () => {
  const builder = (table: string) => {
    const isBlacklist = table === 'talkx_blacklist';
    const rec = { select: '', or: [] as string[], orTable: [] as (string | undefined)[] };
    if (isBlacklist) h.queries.push(rec);
    const filters: ((r: Row) => boolean)[] = [];
    const ors: Array<{ conds: Array<{ col: string; term: string }>; table?: string }> = [];
    const orders: { col: string; asc: boolean }[] = [];
    const record = (method: string, args: unknown[]) => { if (isBlacklist) h.blacklistCalls.push({ method, args }); };
    const run = () => {
      if (!isBlacklist) return { data: [], error: null };
      let rows = h.blacklist.filter((r) => filters.every((f) => f(r)));
      // Join interno: exclui supressões por telefone avulso (sem contato).
      if (rec.select.includes('!inner')) rows = rows.filter((r) => (r as Row).contacts);
      for (const o of ors) rows = rows.filter((r) => rowMatchesOr(r, o.conds, o.table));
      return { data: sortBy(rows, orders), error: null };
    };
    const self: Record<string, unknown> = {};
    self.select = (...a: unknown[]) => {
      record('select', a);
      if (typeof a[0] === 'string') rec.select = a[0];
      return self;
    };
    self.not = () => self;
    self.eq = () => self;
    self.or = (filter: string, opts?: { referencedTable?: string }) => {
      record('or', [filter, opts]);
      rec.or.push(filter);
      rec.orTable.push(opts?.referencedTable);
      ors.push({ conds: parseOrFilter(filter), table: opts?.referencedTable });
      return self;
    };
    self.limit = () => Promise.resolve({ data: [], error: null });
    self.is = (col: string, val: unknown) => { record('is', [col, val]); filters.push((r) => r[col] === val); return self; };
    self.order = (col: string, opts?: { ascending?: boolean }) => {
      record('order', [col, opts]);
      orders.push({ col, asc: opts?.ascending !== false });
      return self;
    };
    self.then = (res: (v: unknown) => unknown, rej: (e: unknown) => unknown) => Promise.resolve(run()).then(res, rej);
    return self;
  };
  return {
    supabase: {
      auth: { getUser: () => Promise.resolve({ data: { user: null }, error: null }) },
      from: (t: string) => builder(t),
      rpc: () => Promise.resolve({ data: null, error: null }),
    },
  };
});

vi.mock('@/lib/supabaseHelpers', () => ({
  fromTable: (table: string) => {
    const orders: { col: string; asc: boolean }[] = [];
    const self: Record<string, unknown> = {};
    self.select = () => self;
    self.in = () => self;
    self.eq = () => self;
    self.range = () => self;
    self.order = (col: string, opts?: { ascending?: boolean }) => { orders.push({ col, asc: opts?.ascending !== false }); return self; };
    self.insert = () => Promise.resolve({ error: null });
    self.then = (res: (v: unknown) => unknown, rej: (e: unknown) => unknown) => {
      const data = table === 'talkx_campaign_events' ? sortBy(h.events, orders) : [];
      return Promise.resolve({ data, error: null, count: data.length }).then(res, rej);
    };
    return self;
  },
}));

vi.mock('@/hooks/auth/useAuth', () => ({
  useAuth: () => ({ user: { id: 'auth-1' }, profile: { id: 'p1' }, session: null, loading: false }),
}));

vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn(), info: vi.fn() } }));

import { TalkXSuppression } from '../TalkXSuppression';

const row = (id: string, name: string, phone: string, origin: string, reason: string, created_at: string, over: Row = {}): Row => ({
  id, contact_id: `c-${id}`, phone: null, reason, blocked_by: 'p1', created_at, origin, campaign_id: null,
  removed_by: null, removed_at: null,
  contacts: { name, phone, company: null, avatar_url: null },
  ...over,
});

function renderView() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <TalkXSuppression />
    </QueryClientProvider>,
  );
}

const SEARCH = /Buscar por contato, telefone ou e-mail/;

/** Primeira linha de texto (nome) de cada linha da tabela, na ordem exibida. */
const names = () => screen.queryAllByRole('row').slice(1).map((tr) => tr.querySelector('p')?.textContent ?? '');

async function loaded() {
  await screen.findByPlaceholderText(SEARCH);
  await waitFor(() => expect(names().length).toBeGreaterThan(0));
}

function seedFilters(values: { origin?: string; motivo?: string }) {
  sessionStorage.setItem(FILTER_KEY, JSON.stringify({ values: { origin: 'all', motivo: 'all', ...values }, query: '', period: null }));
}

describe('TalkXSuppression · busca, filtros e ordenação (TL-165)', () => {
  beforeEach(() => {
    // O termo de busca persiste em storage (useTalkXFilterState): sem limpar, vaza entre testes.
    window.localStorage.clear();
    window.sessionStorage.clear();
    h.blacklistCalls.length = 0;
    h.queries.length = 0;
    h.events = [];
    h.blacklist = [
      row('bl-a', 'Ana Souza', '+5511999990001', 'manual', 'Bloqueio manual', '2026-09-01T10:00:00.000Z'),
      row('bl-b', 'Bruno Lima', '+5511999990002', 'optout', 'Opt-out solicitado', '2026-09-03T10:00:00.000Z'),
      row('bl-c', 'Carla Dias', '+5521988880003', 'lgpd', 'LGPD / revogação de consentimento', '2026-09-02T10:00:00.000Z'),
      row('bl-d', 'Davi Removido', '+5511900000004', 'manual', 'Bloqueio manual', '2026-09-04T10:00:00.000Z', { removed_at: '2026-09-05T00:00:00.000Z' }),
      row('bl-e', 'Elisa Telefone', '+5531977770005', 'manual', 'Outro', '2026-09-02T10:00:00.000Z'),
    ];
  });

  it('só traz entradas ativas: a consulta aplica removed_at is null', async () => {
    renderView();
    await loaded();

    expect(h.blacklistCalls).toContainEqual({ method: 'is', args: ['removed_at', null] });
    expect(screen.queryByText('Davi Removido')).toBeNull();
  });

  it('lista vazia sem busca mostra o vazio da lista (não "Nenhum resultado")', async () => {
    h.blacklist = [];
    renderView();
    expect(await screen.findByText('Nenhum contato na lista de supressão')).toBeTruthy();
    expect(screen.queryByText('Nenhum resultado')).toBeNull();
  });

  it('ordena por created_at desc: o servidor decide e a tela mantém a ordem recebida', async () => {
    renderView();
    await loaded();

    const orders = h.blacklistCalls.filter((c) => c.method === 'order');
    expect(orders[0].args).toEqual(['created_at', { ascending: false }]);
    const shown = names();
    expect(shown).toHaveLength(4);
    expect(shown[0]).toBe('Bruno Lima');
    expect(shown[3]).toBe('Ana Souza');
  });

  it('busca por nome, ignorando caixa', async () => {
    renderView();
    await loaded();
    fireEvent.change(screen.getByPlaceholderText(SEARCH), { target: { value: 'BRUNO' } });
    await waitFor(() => expect(names()).toEqual(['Bruno Lima']));
  });

  it('busca por telefone do contato', async () => {
    renderView();
    await loaded();
    fireEvent.change(screen.getByPlaceholderText(SEARCH), { target: { value: '+5521988880003' } });
    await waitFor(() => expect(names()).toEqual(['Carla Dias']));
  });

  it('busca por telefone avulso: o termo mascarado casa com os dígitos gravados', async () => {
    h.blacklist = [
      ...h.blacklist,
      row('bl-f', '', '', 'manual', 'Bloqueio manual', '2026-09-06T10:00:00.000Z', { contact_id: null, contacts: null, phone: '5531977770099' }),
    ];
    renderView();
    await screen.findByText('+5531977770099');

    fireEvent.change(screen.getByPlaceholderText(SEARCH), { target: { value: '(31) 97777-0099' } });
    await waitFor(() => expect(screen.getAllByRole('row').slice(1)).toHaveLength(1));
    expect(screen.getByText('+5531977770099')).toBeTruthy();
  });

  it('busca por motivo', async () => {
    renderView();
    await loaded();
    fireEvent.change(screen.getByPlaceholderText(SEARCH), { target: { value: 'lgpd' } });
    await waitFor(() => expect(names()).toEqual(['Carla Dias']));
  });

  it('sem correspondência mostra "Nenhum resultado"', async () => {
    renderView();
    await loaded();
    fireEvent.change(screen.getByPlaceholderText(SEARCH), { target: { value: 'zzz' } });
    expect(await screen.findByText('Nenhum resultado')).toBeTruthy();
  });

  it('filtro de origem mostra só a origem escolhida', async () => {
    seedFilters({ origin: 'manual' });
    renderView();
    await loaded();
    expect(names().sort()).toEqual(['Ana Souza', 'Elisa Telefone']);
  });

  it('filtro de motivo casa por trecho, sem diferenciar caixa', async () => {
    seedFilters({ motivo: 'OPT-OUT' });
    renderView();
    await loaded();
    expect(names()).toEqual(['Bruno Lima']);
  });

  it('origem e motivo combinam (E)', async () => {
    seedFilters({ origin: 'manual', motivo: 'bloqueio' });
    renderView();
    await loaded();
    expect(names()).toEqual(['Ana Souza']);
  });

  it('origem e motivo se combinam com a busca', async () => {
    seedFilters({ origin: 'manual' });
    renderView();
    await loaded();
    fireEvent.change(screen.getByPlaceholderText(SEARCH), { target: { value: 'elisa' } });
    await waitFor(() => expect(names()).toEqual(['Elisa Telefone']));
  });

  it('origem + motivo sem interseção mostram "Nenhum resultado"', async () => {
    seedFilters({ origin: 'optout', motivo: 'bloqueio' });
    renderView();
    expect(await screen.findByText('Nenhum resultado')).toBeTruthy();
  });

  it('busca server-side: a consulta do contato usa contacts!inner (join interno)', async () => {
    renderView();
    await loaded();
    h.queries.length = 0;

    fireEvent.change(screen.getByPlaceholderText(SEARCH), { target: { value: 'Ana' } });
    await waitFor(() => expect(h.queries.some((q) => q.select.includes('contacts!inner'))).toBe(true));
  });

  it('busca server-side: dois .or() separados — colunas próprias e contacts (referencedTable)', async () => {
    renderView();
    await loaded();
    h.queries.length = 0;

    fireEvent.change(screen.getByPlaceholderText(SEARCH), { target: { value: 'spam' } });

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
    });
  });

  it('busca server-side: limpar a busca restaura todas as linhas', async () => {
    renderView();
    await loaded();

    fireEvent.change(screen.getByPlaceholderText(SEARCH), { target: { value: 'Bruno' } });
    await waitFor(() => expect(names()).toEqual(['Bruno Lima']));

    fireEvent.change(screen.getByPlaceholderText(SEARCH), { target: { value: '' } });
    await waitFor(() => expect(names().sort()).toEqual(['Ana Souza', 'Bruno Lima', 'Carla Dias', 'Elisa Telefone']));
  });

  it('trilha de atividade: eventos no mesmo instante saem por id decrescente', async () => {
    const at = '2026-09-02T12:00:00.000Z';
    const ev = (id: string, event_type: string, created_at: string) => ({ id, event_type, message: null, entity_id: null, created_at, actor: null });
    h.events = [
      ev('ev-1', 'suppression_add', at),
      ev('ev-3', 'suppression_remove', at),
      ev('ev-2', 'suppression_update', at),
      ev('ev-0', 'suppression_export', '2026-09-03T12:00:00.000Z'),
    ];
    renderView();
    await loaded();

    const items = await screen.findAllByRole('listitem');
    const titles = items.map((li) => li.querySelector('p')?.textContent);
    expect(titles).toEqual(['Lista exportada', 'Contato removido da lista', 'Motivo atualizado', 'Contato adicionado à lista']);
  });
});
