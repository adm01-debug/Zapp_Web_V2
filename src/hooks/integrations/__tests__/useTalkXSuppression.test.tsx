/**
 * TL-165 (refazer 1) — hook de supressão. Cada bloco é um ponto da recusa:
 * `removed_at` fora da listagem; busca resolvida em `contacts` e `or` do pai só
 * com coluna da própria linha; filtros/ordenação (desempate por `id`) na
 * consulta; `status` sem ser coluna; remover é `UPDATE`, nunca `DELETE`.
 *
 * Substitui `useTalkXSuppression.test.ts` (Y05), que exercitava a API antiga
 * deste hook (lista sem filtro de removido, `isSuppressed`, DELETE), extinta
 * pela unificação do X178. O resto da cobertura desta tela está em
 * `TalkXSuppression.*.test.tsx`.
 */
import { act, renderHook, waitFor } from '@testing-library/react';
import React from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { beforeEach, describe, expect, it, vi } from 'vitest';

type Chamada = { table: string; method: string; args: unknown[] };

const h = vi.hoisted(() => ({
  calls: [] as Chamada[],
  rows: [] as Record<string, unknown>[],
  contacts: [] as Record<string, unknown>[],
  updates: [] as Record<string, unknown>[],
  error: null as null | { code?: string; message: string },
  mutationError: null as null | { message: string },
}));

const toastError = vi.fn();
vi.mock('sonner', () => ({ toast: { error: (...a: unknown[]) => toastError(...a), success: vi.fn() } }));
vi.mock('@/hooks/auth/useAuth', () => ({
  useAuth: () => ({ profile: { id: 'profile-1' }, user: { id: 'auth-user-1' }, session: {}, loading: false }),
}));

/** Cliente Supabase falso que RESPEITA os filtros do hook — é ele que torna o
 * vermelho possível: sem o `.is('removed_at', null)` o registro removido volta. */
vi.mock('@/integrations/supabase/client', () => {
  const ilike = (valor: unknown, termo: string) => String(valor ?? '').toLowerCase().includes(termo.toLowerCase());
  const casa = (linha: Record<string, unknown>, filtro: string) =>
    filtro.split(',').some((clausula) => {
      const ilikeClausula = clausula.match(/^(\w+)\.ilike\."%(.*)%"$/);
      if (ilikeClausula) return ilike(linha[ilikeClausula[1]], ilikeClausula[2]);
      const inClausula = clausula.match(/^contact_id\.in\.\((.*)\)$/);
      return inClausula ? inClausula[1].split(',').filter(Boolean).includes(String(linha.contact_id)) : false;
    });
  const builder = (tabela: string) => {
    const st = { soAtivos: false, or: '', de: 0, ate: Number.POSITIVE_INFINITY, head: false };
    const registrar = (method: string, args: unknown[]) => { h.calls.push({ table: tabela, method, args }); };
    const rodar = () => {
      if (h.error) return { data: null, error: h.error, count: null };
      const base = tabela === 'contacts' ? h.contacts : h.rows.filter((linha) => !st.soAtivos || linha.removed_at === null);
      const data = st.or ? base.filter((linha) => casa(linha, st.or)) : base;
      return { data: st.head ? null : data.slice(st.de, st.ate + 1), error: null, count: data.length };
    };
    const self: Record<string, unknown> = {};
    const encadear = (m: string) => (...a: unknown[]) => { registrar(m, a); return self; };
    self.select = (cols: string, o?: { head?: boolean }) => { st.head = Boolean(o?.head); registrar('select', [cols, o]); return self; };
    self.is = (col: string, valor: unknown) => {
      if (col === 'removed_at' && valor === null) st.soAtivos = true;
      registrar('is', [col, valor]);
      return self;
    };
    self.not = encadear('not');
    self.eq = encadear('eq');
    self.in = encadear('in');
    self.gte = encadear('gte');
    self.ilike = (col: string, valor: string) => { registrar('ilike', [col, valor]); return self; };
    self.order = encadear('order');
    self.limit = encadear('limit');
    self.or = (filtro: string) => { st.or = filtro; registrar('or', [filtro]); return self; };
    self.range = (de: number, ate: number) => { st.de = de; st.ate = ate; registrar('range', [de, ate]); return self; };
    self.update = (payload: Record<string, unknown>) => {
      h.updates.push(payload);
      registrar('update', [payload]);
      return { eq: (col: string, valor: unknown) => { registrar('eq', [col, valor]); return Promise.resolve({ error: h.mutationError }); } };
    };
    self.delete = (...args: unknown[]) => { registrar('delete', args); return self; };
    self.then = (ok: unknown, err: unknown) =>
      Promise.resolve(rodar()).then(ok as (v: unknown) => unknown, err as (e: unknown) => unknown);
    return self;
  };
  return { supabase: { from: (tabela: string) => builder(tabela) } };
});

import {
  fetchSuppressionPage,
  suppressionOrderColumn,
  useTalkXSuppression,
  type SuppressionOrderKey,
} from '@/hooks/integrations/useTalkXSuppression';

const linha = (extra: Record<string, unknown> = {}): Record<string, unknown> => ({
  id: 'bl-1', contact_id: null, phone: null, reason: 'Opt-out solicitado', reason_code: 'opt_out',
  origin: 'manual', campaign_id: null, blocked_by: 'profile-1', removed_by: null, removed_at: null,
  expires_at: null, created_at: '2026-10-01T10:00:00.000Z', contacts: null, campaign: null, ...extra,
});

/** Argumentos de cada chamada a um método (opcionalmente de uma tabela só). */
const chamadas = (metodo: string, tabela?: string) =>
  h.calls.filter((c) => c.method === metodo && (!tabela || c.table === tabela)).map((c) => c.args);

let qc: QueryClient;
const wrapper = () => ({ children }: { children: React.ReactNode }) =>
  React.createElement(QueryClientProvider, { client: qc }, children);

beforeEach(() => {
  vi.clearAllMocks();
  h.calls.length = 0;
  h.updates.length = 0;
  h.rows = [];
  h.contacts = [];
  h.error = null;
  h.mutationError = null;
  qc = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0, staleTime: 0 }, mutations: { retry: false } } });
});

describe('fetchSuppressionPage', () => {
  it('não deixa registro removido na página nem no total (o mock o devolveria)', async () => {
    h.rows = [linha({ id: 'bl-ativo' }), linha({ id: 'bl-removido', removed_at: '2026-09-30T00:00:00.000Z' })];

    const page = await fetchSuppressionPage({ page: 1, pageSize: 10 });

    expect(chamadas('is', 'talkx_blacklist')).toContainEqual(['removed_at', null]);
    expect(page.rows.map((row) => row.id)).toEqual(['bl-ativo']);
    expect(page.total).toBe(1);
  });

  it('busca: resolve o contato em `contacts` e o `or` do pai só usa coluna da própria linha', async () => {
    h.contacts = [{ id: 'c1', name: 'Ana Souza', phone: '5511977776666', email: 'ana@acme.test' }];
    h.rows = [linha({ id: 'bl-ligado', contact_id: 'c1' }), linha({ id: 'bl-avulso', phone: '5511988887777' })];

    const page = await fetchSuppressionPage({ page: 1, pageSize: 10, search: 'ana souza' });

    // Colunas do PRÓPRIO contato, num recurso só.
    expect(chamadas('or', 'contacts')).toEqual([
      ['name.ilike."%ana souza%",email.ilike."%ana souza%",phone.ilike."%ana souza%"'],
    ]);
    const orDoPai = chamadas('or', 'talkx_blacklist')[0][0] as string;
    expect(orDoPai).toBe('phone.ilike."%ana souza%",reason.ilike."%ana souza%",contact_id.in.(c1)');
    expect(orDoPai).not.toContain('contacts.');
    expect(page.rows.map((row) => row.id)).toEqual(['bl-ligado']);
  });

  it('busca de telefone digitado com máscara casa os dígitos gravados', async () => {
    h.rows = [linha({ id: 'bl-avulso', phone: '5511988887777' }), linha({ id: 'bl-outro', phone: '5511300000000' })];

    const page = await fetchSuppressionPage({ page: 1, pageSize: 10, search: '(11) 98888-7777' });

    expect(chamadas('or', 'talkx_blacklist')[0][0]).toContain('phone.ilike."%11988887777%"');
    expect(page.rows.map((row) => row.id)).toEqual(['bl-avulso']);
  });

  it('filtros de origem e motivo vão ao servidor e a ordem desempata por id', async () => {
    await fetchSuppressionPage({ page: 1, pageSize: 10, origin: 'manual', reason: 'opt', order: 'reason', dir: 'asc' });

    expect(chamadas('eq', 'talkx_blacklist')).toContainEqual(['origin', 'manual']);
    expect(chamadas('ilike', 'talkx_blacklist')).toEqual([['reason', '%opt%']]);
    expect(chamadas('range')).toEqual([[0, 9]]);
    expect(chamadas('order', 'talkx_blacklist')).toEqual([
      ['reason', { ascending: true }],
      ['id', { ascending: true }],
    ]);
  });

  it('`status` não é coluna: a chave cai em created_at em vez de ir crua ao PostgREST', async () => {
    expect(suppressionOrderColumn('status')).toBe('created_at');
    expect(suppressionOrderColumn('reason')).toBe('reason');

    await fetchSuppressionPage({ page: 1, pageSize: 10, order: 'status' as SuppressionOrderKey });

    expect(chamadas('order', 'talkx_blacklist').map((args) => args[0])).toEqual(['created_at', 'id']);
  });

  it('erro do servidor sobe (não vira lista vazia)', async () => {
    h.error = { code: '42501', message: 'permission denied for table talkx_blacklist' };

    await expect(fetchSuppressionPage({ page: 1, pageSize: 10 })).rejects.toMatchObject({ code: '42501' });
  });
});

describe('useTalkXSuppression', () => {
  it('removeEntry grava removed_at/removed_by por UPDATE e nunca chama DELETE', async () => {
    const { result } = renderHook(() => useTalkXSuppression({ page: 1, pageSize: 10 }), { wrapper: wrapper() });
    await waitFor(() => expect(result.current.rows).toEqual([]));

    await act(async () => {
      await result.current.removeEntry.mutateAsync('bl-1');
    });

    expect(h.updates[0].removed_by).toBe('profile-1');
    expect(typeof h.updates[0].removed_at).toBe('string');
    expect(chamadas('delete', 'talkx_blacklist')).toEqual([]);
  });

  it('erro da mutação é avisado no toast (não engole a falha)', async () => {
    const { result } = renderHook(() => useTalkXSuppression({ page: 1, pageSize: 10 }), { wrapper: wrapper() });
    await waitFor(() => expect(result.current.rows).toEqual([]));
    h.mutationError = { message: 'permission denied' };

    await act(async () => {
      await result.current.removeEntry.mutateAsync('bl-1').catch(() => undefined);
    });

    expect(toastError).toHaveBeenCalledWith('Erro: permission denied');
  });
});
