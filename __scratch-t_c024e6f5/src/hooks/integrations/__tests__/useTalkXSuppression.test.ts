/**
 * Y05 — testes NOVOS do hook `useTalkXSuppression` (lista de supressao do Talk X).
 *
 * Exercita o hook REAL; dubla so a fronteira (cliente Supabase + toast).
 * Cobre: listagem (ordem/limite/erro), `isSuppressed` pelos dois caminhos
 * (telefone normalizado e contato), a janela de expiracao com o relogio atual,
 * e `addEntry`/`removeEntry` com a normalizacao e os padroes gravados.
 *
 * Achado desta rodada: `isSuppressed` FALHA ABERTO quando a consulta de
 * contatos erra (RLS/rede) — devolve `false`, ou seja "pode enviar". O
 * comportamento correto esta marcado em `it.fails` e listado no relato.
 */
import { act, renderHook, waitFor } from '@testing-library/react';
import React from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { Mock } from 'vitest';
import { beforeEach, describe, expect, it, vi } from 'vitest';

type QueryResult = { data: unknown; error: unknown };

const toastError = vi.fn();
const toastSuccess = vi.fn();
vi.mock('sonner', () => ({
  toast: {
    error: (...args: unknown[]) => toastError(...args),
    success: (...args: unknown[]) => toastSuccess(...args),
  },
}));

const supabaseFrom = vi.fn();
vi.mock('@/integrations/supabase/client', () => ({
  supabase: { from: (...args: unknown[]) => supabaseFrom(...args) },
}));

import { useTalkXSuppression, type BlacklistEntry } from '@/hooks/integrations/useTalkXSuppression';

const ENTRY: BlacklistEntry = {
  id: 'bl-1',
  contact_id: null,
  phone: '5541999998888',
  reason: 'pediu descadastro',
  reason_code: 'opt_out',
  origin: 'webhook',
  campaign_id: null,
  blocked_by: null,
  expires_at: null,
  source_message_id: null,
  created_at: '2026-10-01T10:00:00Z',
};

let listResult: QueryResult = { data: [], error: null };
let phoneResult: QueryResult = { data: [], error: null };
let contactBlacklistResult: QueryResult = { data: [], error: null };
let mutationResult: QueryResult = { data: null, error: null };
let contactsResult: QueryResult = { data: null, error: null };

let blacklistBuilders: Record<string, unknown>[] = [];
let contactsBuilders: Record<string, unknown>[] = [];

function finishBuilder(b: Record<string, unknown>, getResult: () => QueryResult) {
  b.single = vi.fn(async () => getResult());
  b.maybeSingle = vi.fn(async () => getResult());
  b.then = (onFulfilled: (v: QueryResult) => unknown, onRejected?: (e: unknown) => unknown) =>
    Promise.resolve(getResult()).then(onFulfilled, onRejected);
  return b;
}

/** Builder de `talkx_blacklist`: o resultado depende do filtro usado —
 * sem `eq` e a LISTAGEM; `eq('phone')`/`eq('contact_id')` sao as consultas de
 * supressao; `insert`/`delete` sao as mutacoes. */
function makeBlacklistBuilder() {
  let current = listResult;
  const b: Record<string, unknown> = {};
  const self = () => b;
  b.select = vi.fn(self);
  b.order = vi.fn(self);
  b.limit = vi.fn(self);
  b.or = vi.fn(self);
  b.insert = vi.fn((payload: unknown) => { current = mutationResult; b.insertPayload = payload; return b; });
  b.delete = vi.fn(() => { current = mutationResult; return b; });
  b.eq = vi.fn((column: string) => {
    if (column === 'phone') current = phoneResult;
    else if (column === 'contact_id') current = contactBlacklistResult;
    else current = mutationResult;
    return b;
  });
  return finishBuilder(b, () => current);
}

function makeContactsBuilder() {
  const b: Record<string, unknown> = {};
  const self = () => b;
  b.select = vi.fn(self);
  b.eq = vi.fn(self);
  return finishBuilder(b, () => contactsResult);
}

let qc: QueryClient;

function wrapper() {
  return ({ children }: { children: React.ReactNode }) =>
    React.createElement(QueryClientProvider, { client: qc }, children);
}

const calls = (fn: unknown) => (fn as Mock).mock.calls as unknown[][];

/** Filtro PostgREST usado pelas consultas de supressao (`.or(...)`). */
function orFilter(builder: Record<string, unknown>) {
  return calls(builder.or)[0][0] as string;
}

function expiryWindow(builder: Record<string, unknown>) {
  const filtro = orFilter(builder);
  const match = filtro.match(/expires_at\.gt\.(\S+)/);
  if (!match) throw new Error(`filtro sem janela de expiracao: ${filtro}`);
  return match[1];
}

function mount() {
  return renderHook(() => useTalkXSuppression(), { wrapper: wrapper() });
}

beforeEach(() => {
  vi.clearAllMocks();
  listResult = { data: [], error: null };
  phoneResult = { data: [], error: null };
  contactBlacklistResult = { data: [], error: null };
  mutationResult = { data: null, error: null };
  contactsResult = { data: null, error: null };
  blacklistBuilders = [];
  contactsBuilders = [];
  supabaseFrom.mockImplementation((table: string) => {
    if (table === 'contacts') {
      const b = makeContactsBuilder();
      contactsBuilders.push(b);
      return b;
    }
    const b = makeBlacklistBuilder();
    blacklistBuilders.push(b);
    return b;
  });
  qc = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0, staleTime: 0 }, mutations: { retry: false } },
  });
});

describe('useTalkXSuppression — listagem', () => {
  it('lista as 500 entradas mais recentes da supressao', async () => {
    listResult = { data: [ENTRY], error: null };
    const { result } = mount();

    await waitFor(() => expect(result.current.entries).toHaveLength(1));

    expect(supabaseFrom).toHaveBeenCalledWith('talkx_blacklist');
    const b = blacklistBuilders[0];
    expect(calls(b.order)[0]).toEqual(['created_at', { ascending: false }]);
    expect(calls(b.limit)[0]).toEqual([500]);
    expect(result.current.entries[0]).toEqual(ENTRY);
    expect(result.current.isLoading).toBe(false);
  });

  it('expoe lista vazia quando o banco responde null', async () => {
    listResult = { data: null, error: null };
    const { result } = mount();

    await waitFor(() => expect(result.current.isLoading).toBe(false));

    expect(result.current.entries).toEqual([]);
  });

  it('marca isError quando a listagem falha (RLS/rede)', async () => {
    listResult = { data: null, error: { message: 'permission denied for table talkx_blacklist' } };
    const { result } = mount();

    await waitFor(() => expect(result.current.isError).toBe(true));

    expect(result.current.entries).toEqual([]);
  });
});

describe('useTalkXSuppression — isSuppressed', () => {
  it('normaliza o telefone e devolve true quando ha bloqueio ativo pelo numero', async () => {
    phoneResult = { data: [{ id: 'bl-1' }], error: null };
    const { result } = mount();

    expect(await result.current.isSuppressed('+55 (41) 9 9999-8888')).toBe(true);

    const b = blacklistBuilders[1];
    expect(calls(b.eq)[0]).toEqual(['phone', '5541999998888']);
    expect(calls(b.limit)[0]).toEqual([1]);
    // Nao precisa consultar contato quando o telefone ja esta bloqueado.
    expect(contactsBuilders).toHaveLength(0);
  });

  it('usa a janela de expiracao com o relogio ATUAL em ISO (fuso UTC do banco)', async () => {
    phoneResult = { data: [], error: null };
    contactsResult = { data: null, error: null };
    const antes = Date.now();
    const { result } = mount();

    expect(await result.current.isSuppressed('5541999998888')).toBe(false);

    const filtro = orFilter(blacklistBuilders[1]);
    expect(filtro).toMatch(/^expires_at\.is\.null,expires_at\.gt\./);
    const iso = expiryWindow(blacklistBuilders[1]);
    const quando = Date.parse(iso);
    expect(quando).toBeGreaterThanOrEqual(antes);
    expect(quando).toBeLessThanOrEqual(Date.now());
    expect(new Date(iso).toISOString()).toBe(iso);
  });

  it('devolve false quando o telefone nao tem contato cadastrado', async () => {
    phoneResult = { data: [], error: null };
    contactsResult = { data: null, error: null };
    const { result } = mount();

    expect(await result.current.isSuppressed('5541999998888')).toBe(false);

    expect(calls(contactsBuilders[0].eq)[0]).toEqual(['phone', '5541999998888']);
    expect(contactsBuilders[0].maybeSingle).toHaveBeenCalled();
    // Sem contato nao existe a segunda consulta por contact_id.
    expect(blacklistBuilders).toHaveLength(2);
  });

  it('consulta o bloqueio pelo contact_id e devolve false quando nao ha entrada', async () => {
    phoneResult = { data: [], error: null };
    contactsResult = { data: { id: 'cont-1' }, error: null };
    contactBlacklistResult = { data: [], error: null };
    const { result } = mount();

    expect(await result.current.isSuppressed('5541999998888')).toBe(false);

    const b = blacklistBuilders[2];
    expect(calls(b.eq)[0]).toEqual(['contact_id', 'cont-1']);
    expect(orFilter(b)).toMatch(/expires_at\.is\.null,expires_at\.gt\./);
  });

  it('devolve true quando o CONTATO tem bloqueio ativo mesmo com telefone diferente', async () => {
    phoneResult = { data: [], error: null };
    contactsResult = { data: { id: 'cont-1' }, error: null };
    contactBlacklistResult = { data: [{ id: 'bl-9' }], error: null };
    const { result } = mount();

    expect(await result.current.isSuppressed('5541999998888')).toBe(true);
  });

  it.fails('falha FECHADO quando a consulta de contatos erra (hoje devolve false = libera o envio)', async () => {
    phoneResult = { data: [], error: null };
    contactsResult = { data: null, error: { message: 'permission denied for table contacts' } };
    const { result } = mount();

    await expect(result.current.isSuppressed('5541999998888')).rejects.toThrow(/permission denied/);
  });
});

describe('useTalkXSuppression — addEntry', () => {
  it('recusa entrada sem telefone e sem contato, sem gravar nada', async () => {
    const { result } = mount();
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    await act(async () => {
      await result.current.addEntry.mutateAsync({ reason: 'sem alvo' }).catch(() => undefined);
    });

    expect(toastError).toHaveBeenCalledWith('Erro: phone ou contact_id obrigatório');
    expect(blacklistBuilders.some((b) => calls(b.insert).length > 0)).toBe(false);
  });

  it('normaliza o telefone e grava origin/reason_code padrao com os demais campos nulos', async () => {
    mutationResult = { data: null, error: null };
    const { result } = mount();
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    await act(async () => {
      await result.current.addEntry.mutateAsync({ phone: '+55 (41) 9 9999-8888', contact_id: 'c1', reason: 'pediu descadastro' });
    });

    const b = blacklistBuilders.find((builder) => calls(builder.insert).length > 0)!;
    expect(calls(b.insert)[0][0]).toEqual({
      phone: '5541999998888',
      contact_id: 'c1',
      reason: 'pediu descadastro',
      reason_code: 'manual',
      origin: 'manual',
      campaign_id: null,
      expires_at: null,
      source_message_id: null,
    });
    expect(toastSuccess).toHaveBeenCalledWith('Número adicionado à supressão');
  });

  it('recusa telefone que fica vazio apos a normalizacao', async () => {
    const { result } = mount();
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    await act(async () => {
      await result.current.addEntry.mutateAsync({ phone: 'abc' }).catch(() => undefined);
    });

    expect(toastError).toHaveBeenCalledWith('Erro: phone invalido apos normalizacao');
    expect(blacklistBuilders.some((b) => calls(b.insert).length > 0)).toBe(false);
  });

  it('preserva reason_code, campanha, expiracao e mensagem de origem informados', async () => {
    mutationResult = { data: null, error: null };
    const { result } = mount();
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    await act(async () => {
      await result.current.addEntry.mutateAsync({
        contact_id: 'c1',
        reason_code: 'lgpd',
        campaign_id: 'camp-1',
        expires_at: '2027-01-01T00:00:00Z',
        source_message_id: 'msg-1',
      });
    });

    const b = blacklistBuilders.find((builder) => calls(builder.insert).length > 0)!;
    expect(calls(b.insert)[0][0]).toEqual({
      phone: null,
      contact_id: 'c1',
      reason: null,
      reason_code: 'lgpd',
      origin: 'manual',
      campaign_id: 'camp-1',
      expires_at: '2027-01-01T00:00:00Z',
      source_message_id: 'msg-1',
    });
  });

  it('avisa o erro do banco ao adicionar', async () => {
    mutationResult = { data: null, error: { message: 'permission denied' } };
    const { result } = mount();
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    await act(async () => {
      await result.current.addEntry.mutateAsync({ phone: '5541999998888' }).catch(() => undefined);
    });

    expect(toastError).toHaveBeenCalledWith('Erro: permission denied');
  });
});

describe('useTalkXSuppression — removeEntry', () => {
  it('remove pelo id e avisa o sucesso', async () => {
    mutationResult = { data: null, error: null };
    const { result } = mount();
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    await act(async () => {
      await result.current.removeEntry.mutateAsync('bl-1');
    });

    const b = blacklistBuilders.find((builder) => calls(builder.delete).length > 0)!;
    expect(calls(b.eq)[0]).toEqual(['id', 'bl-1']);
    expect(toastSuccess).toHaveBeenCalledWith('Entrada removida');
  });

  it('avisa o erro do banco ao remover', async () => {
    mutationResult = { data: null, error: { message: 'permission denied' } };
    const { result } = mount();
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    await act(async () => {
      await result.current.removeEntry.mutateAsync('bl-1').catch(() => undefined);
    });

    expect(toastError).toHaveBeenCalledWith('Erro: permission denied');
  });
});
