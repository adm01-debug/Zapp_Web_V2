/**
 * Y05 — testes NOVOS do hook/API do publico Multiplix.
 *
 * Exercita o modulo REAL (`useMultiplixAudience`) e dubla so a FRONTEIRA: o
 * cliente Supabase (sessao + invoke da Edge Function `multiplix-audience`).
 * Cobre cada acao publica (list_ramos, list_ufs, search, count, resolve,
 * create_draft), o envio do token da sessao e a traducao do corpo de erro da
 * Edge — inclusive o teto de destinatarios (F17) com os numeros reais.
 */
import { act, renderHook, waitFor } from '@testing-library/react';
import React from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { Mock } from 'vitest';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const authGetSession = vi.fn();
const functionsInvoke = vi.fn();
vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    auth: { getSession: (...args: unknown[]) => authGetSession(...args) },
    functions: { invoke: (...args: unknown[]) => functionsInvoke(...args) },
  },
}));

import {
  MultiplixOverLimitError,
  createMultiplixDraft,
  useMultiplixCount,
  useMultiplixRamos,
  useMultiplixResolve,
  useMultiplixSearch,
  useMultiplixUfs,
  type MultiplixAudienceRow,
  type MultiplixDraftInput,
} from '@/hooks/integrations/useMultiplixAudience';

const ROW: MultiplixAudienceRow = {
  company_id: 'c-1',
  company_name: 'Metal Co',
  ramo_atividade: 'Metalurgia',
  uf: 'SP',
  is_customer: true,
  is_supplier: false,
  is_carrier: false,
  destino_e164: '+5511999998888',
  destino_origem: 'contato',
  motivo_inclusao: 'cliente ativo',
};

const DRAFT: MultiplixDraftInput = {
  name: 'Convite feira',
  message_template: 'Ola {{empresa}}',
  company_ids: ['c-1'],
  client_request_id: 'req-1',
};

let qc: QueryClient;

function wrapper() {
  return ({ children }: { children: React.ReactNode }) =>
    React.createElement(QueryClientProvider, { client: qc }, children);
}

const calls = (fn: unknown) => (fn as Mock).mock.calls as unknown[][];

/** Corpo de erro da Edge: o SDK entrega a `Response` crua em `error.context`. */
function contextWith(body: unknown) {
  return { clone: () => ({ json: async () => body }) };
}

function contextWithInvalidJson() {
  return { clone: () => ({ json: async () => { throw new Error('corpo nao e JSON'); } }) };
}

function invocation(i = 0) {
  const [fn, options] = calls(functionsInvoke)[i] as [
    string,
    { body: { action: string; params?: unknown }; headers: Record<string, string> },
  ];
  return { fn, options };
}

beforeEach(() => {
  vi.clearAllMocks();
  authGetSession.mockResolvedValue({ data: { session: { access_token: 'tok-1' } } });
  functionsInvoke.mockResolvedValue({ data: { data: [] }, error: null });
  qc = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0, staleTime: 0 }, mutations: { retry: false } },
  });
});

describe('useMultiplixAudience — listagens de apoio', () => {
  it('busca os ramos com a acao list_ramos e o token da sessao', async () => {
    functionsInvoke.mockResolvedValue({ data: { data: [{ ramo_atividade: 'Metalurgia', total: 3 }] }, error: null });
    const { result } = renderHook(() => useMultiplixRamos(), { wrapper: wrapper() });

    await waitFor(() => expect(result.current.data).toHaveLength(1));

    const { fn, options } = invocation();
    expect(fn).toBe('multiplix-audience');
    expect(options.body).toEqual({ action: 'list_ramos', params: undefined });
    expect(options.headers.Authorization).toBe('Bearer tok-1');
    expect(result.current.data?.[0]).toEqual({ ramo_atividade: 'Metalurgia', total: 3 });
  });

  it('busca as UFs com a acao list_ufs', async () => {
    functionsInvoke.mockResolvedValue({ data: { data: [{ uf: 'SP', total: 9 }] }, error: null });
    const { result } = renderHook(() => useMultiplixUfs(), { wrapper: wrapper() });

    await waitFor(() => expect(result.current.data).toHaveLength(1));

    expect(invocation().options.body).toEqual({ action: 'list_ufs', params: undefined });
    expect(result.current.data?.[0]).toEqual({ uf: 'SP', total: 9 });
  });

  it('recusa sem sessao, sem chegar a chamar a Edge', async () => {
    authGetSession.mockResolvedValue({ data: { session: null } });
    const { result } = renderHook(() => useMultiplixRamos(), { wrapper: wrapper() });

    await waitFor(() => expect(result.current.isError).toBe(true));

    expect(result.current.error?.message).toBe('Not authenticated');
    expect(functionsInvoke).not.toHaveBeenCalled();
  });
});

describe('useMultiplixAudience — busca, contagem e resolucao', () => {
  it('search envia os filtros e a paginacao e devolve as linhas', async () => {
    functionsInvoke.mockResolvedValue({ data: { data: [ROW] }, error: null });
    const { result } = renderHook(() => useMultiplixSearch(), { wrapper: wrapper() });

    let rows: MultiplixAudienceRow[] | undefined;
    await act(async () => {
      rows = await result.current.mutateAsync({ roles: ['cliente'], uf: 'SP', ramo: 'Metalurgia', search: 'metal', page: 2, page_size: 50 });
    });

    expect(rows).toEqual([ROW]);
    expect(invocation().options.body).toEqual({
      action: 'search',
      params: { roles: ['cliente'], uf: 'SP', ramo: 'Metalurgia', search: 'metal', page: 2, page_size: 50 },
    });
  });

  it('count envia apenas os filtros e devolve o numero', async () => {
    functionsInvoke.mockResolvedValue({ data: { data: 128 }, error: null });
    const { result } = renderHook(() => useMultiplixCount(), { wrapper: wrapper() });

    let total: number | undefined;
    await act(async () => {
      total = await result.current.mutateAsync({ roles: ['fornecedor'] });
    });

    expect(total).toBe(128);
    expect(invocation().options.body).toEqual({ action: 'count', params: { roles: ['fornecedor'] } });
  });

  it('resolve envia os company_ids e devolve os destinatarios resolvidos', async () => {
    const resolvidos = [{ company_id: 'c-1', contact_id: 'ct-1', company_name: 'Metal Co', destino_e164: '+5511999998888', destino_origem: 'contato', elegibilidade: 'apto' }];
    functionsInvoke.mockResolvedValue({ data: { data: resolvidos }, error: null });
    const { result } = renderHook(() => useMultiplixResolve(), { wrapper: wrapper() });

    let out: unknown;
    await act(async () => {
      out = await result.current.mutateAsync(['c-1', 'c-2']);
    });

    expect(out).toEqual(resolvidos);
    expect(invocation().options.body).toEqual({ action: 'resolve', params: { company_ids: ['c-1', 'c-2'] } });
  });

  it('createMultiplixDraft chama a acao create_draft com o pedido completo', async () => {
    functionsInvoke.mockResolvedValue({ data: { data: { dispatch_id: 'd-1', recipient_count: 5, created: true } }, error: null });

    const out = await createMultiplixDraft(DRAFT);

    expect(out).toEqual({ dispatch_id: 'd-1', recipient_count: 5, created: true });
    expect(invocation().options.body).toEqual({ action: 'create_draft', params: DRAFT });
  });
});

describe('useMultiplixAudience — traducao do erro da Edge', () => {
  async function countError(error: unknown) {
    functionsInvoke.mockResolvedValue({ data: null, error });
    const { result } = renderHook(() => useMultiplixCount(), { wrapper: wrapper() });
    return result.current.mutateAsync({}).catch((e: unknown) => e);
  }

  it('converte o teto de destinatarios em MultiplixOverLimitError com count/limit/mensagem reais', async () => {
    const err = (await countError({
      message: 'Edge Function returned a non-2xx status code',
      context: contextWith({ error: 'multiplix_over_recipient_limit', count: 120, limit: 100, message: 'acima do teto do plano' }),
    })) as MultiplixOverLimitError;

    expect(err).toBeInstanceOf(MultiplixOverLimitError);
    expect(err.name).toBe('MultiplixOverLimitError');
    expect(err.count).toBe(120);
    expect(err.limit).toBe(100);
    expect(err.message).toBe('acima do teto do plano');
  });

  it('usa count 0, limit null e a mensagem padrao quando o corpo nao traz os numeros', async () => {
    const err = (await countError({
      message: 'Edge Function returned a non-2xx status code',
      context: contextWith({ error: 'multiplix_over_recipient_limit' }),
    })) as MultiplixOverLimitError;

    expect(err).toBeInstanceOf(MultiplixOverLimitError);
    expect(err.count).toBe(0);
    expect(err.limit).toBeNull();
    expect(err.message).toBe('Disparo acima do teto de destinatarios (0)');
  });

  it('usa o erro de dominio do corpo para os demais casos', async () => {
    const err = await countError({
      message: 'Edge Function returned a non-2xx status code',
      context: contextWith({ error: 'multiplix_nao_autenticado' }),
    });

    expect(err).toBeInstanceOf(Error);
    expect((err as Error).message).toBe('multiplix_nao_autenticado');
  });

  it('cai na mensagem do SDK quando o corpo nao tem erro de dominio', async () => {
    const err = await countError({
      message: 'Edge Function returned a non-2xx status code',
      context: contextWith({}),
    });

    expect((err as Error).message).toBe('Edge Function returned a non-2xx status code');
  });

  it('cai na mensagem do SDK quando o corpo nao e JSON (timeout/proxy)', async () => {
    const err = await countError({
      message: 'Failed to fetch',
      context: contextWithInvalidJson(),
    });

    expect((err as Error).message).toBe('Failed to fetch');
  });

  it('cai na mensagem do SDK quando nao ha context', async () => {
    const err = await countError({ message: 'Failed to fetch' });

    expect((err as Error).message).toBe('Failed to fetch');
  });

  it('cai na mensagem do SDK quando o context nao tem clone', async () => {
    const err = await countError({ message: 'Failed to fetch', context: {} });

    expect((err as Error).message).toBe('Failed to fetch');
  });

  it('usa o fallback quando o erro nem traz message', async () => {
    const err = await countError({});

    expect((err as Error).message).toBe('Falha ao chamar multiplix-audience');
  });
});
