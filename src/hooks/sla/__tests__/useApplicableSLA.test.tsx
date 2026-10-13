/**
 * Prazo aplicável de 1ª resposta — `useApplicableSLA`.
 *
 * O sujeito é o hook REAL; a dublagem é a fronteira de rede (`supabase.rpc`, o
 * resolvedor do banco PB-39, e `supabase.from`, a leitura compartilhada que só
 * alimenta o prazo de resolução). Fica provado que: o prazo de 1ª resposta sai
 * de UMA chamada por contato (nunca da hierarquia montada no cliente), dois
 * consumidores do mesmo contato compartilham a leitura, sem contato não há
 * chamada, e o nível que decidiu o prazo (`matchedLevel`) chega ao chamador.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import React from 'react';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

const h = vi.hoisted(() => ({
  rpcRows: [] as Array<Record<string, unknown>>,
  rpcError: null as null | { message: string },
  calls: [] as Array<{ fn: string; contactId: string }>,
  rules: [] as Array<{ id: string; resolution_minutes: number }>,
  defaultConfig: null as null | { name: string; resolution_minutes: number },
}));

vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    rpc: (fn: string, args: { p_contact_id: string }) => {
      h.calls.push({ fn, contactId: args.p_contact_id });
      return Promise.resolve({ data: h.rpcRows, error: h.rpcError });
    },
    from: (table: string) => {
      const builder: Record<string, unknown> = {};
      const mesmo = () => builder;
      builder.select = mesmo;
      builder.eq = mesmo;
      builder.limit = mesmo;
      builder.then = (ok?: (v: unknown) => unknown, falhou?: (e: unknown) => unknown) =>
        Promise.resolve(
          table === 'sla_rules'
            ? { data: h.rules, error: null }
            : { data: h.defaultConfig ? [h.defaultConfig] : [], error: null },
        ).then(ok, falhou);
      return builder;
    },
  },
}));

import { useApplicableSLA } from '../useApplicableSLA';

const CONTATO = 'c1';

const linhaRpc = (over: Record<string, unknown> = {}) => ({
  first_response_minutes: 2,
  matched_level: 'contact',
  rule_id: 'rule-c1',
  rule_name: 'Ouro do contato',
  ...over,
});

function setup() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: Infinity } },
  });
  const wrapper = ({ children }: { children: React.ReactNode }) =>
    React.createElement(QueryClientProvider, { client: queryClient }, children);
  return { queryClient, wrapper };
}

beforeEach(() => {
  h.rpcRows = [];
  h.rpcError = null;
  h.calls = [];
  h.rules = [];
  h.defaultConfig = null;
  vi.clearAllMocks();
});

describe('useApplicableSLA — o prazo vem da RPC do banco', () => {
  it('resolve a 1ª resposta com UMA chamada por contato e devolve o nível casado', async () => {
    h.rpcRows = [linhaRpc()];
    const { wrapper } = setup();

    const { result } = renderHook(
      () => useApplicableSLA({ contactId: CONTATO, company: 'Acme' }),
      { wrapper },
    );

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(h.calls).toEqual([{ fn: 'resolve_applicable_sla', contactId: CONTATO }]);
    expect(result.current.data).toMatchObject({
      firstResponseMinutes: 2,
      ruleName: 'Ouro do contato',
      ruleId: 'rule-c1',
      matchedLevel: 'contact',
    });
  });

  it('dois consumidores do MESMO contato compartilham a leitura (sem N+1 por conversa)', async () => {
    h.rpcRows = [linhaRpc()];
    const { wrapper } = setup();

    const { result } = renderHook(
      () => ({
        badge: useApplicableSLA({ contactId: CONTATO }),
        header: useApplicableSLA({ contactId: CONTATO }),
      }),
      { wrapper },
    );

    await waitFor(() =>
      expect(result.current.badge.isSuccess && result.current.header.isSuccess).toBe(true),
    );

    expect(h.calls).toHaveLength(1);
    expect(result.current.header.data).toEqual(result.current.badge.data);
  });

  it('propaga o nível que decidiu o prazo (ex.: configuração global)', async () => {
    h.rpcRows = [
      linhaRpc({ matched_level: 'global_default', rule_id: null, rule_name: 'Padrão Comercial', first_response_minutes: 15 }),
    ];
    const { wrapper } = setup();

    const { result } = renderHook(() => useApplicableSLA({ contactId: CONTATO }), { wrapper });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(result.current.data).toMatchObject({
      firstResponseMinutes: 15,
      matchedLevel: 'global_default',
      ruleId: null,
    });
  });

  it('nível desconhecido não vaza: cai em system_default', async () => {
    h.rpcRows = [linhaRpc({ matched_level: 'qualquer_coisa' })];
    const { wrapper } = setup();

    const { result } = renderHook(() => useApplicableSLA({ contactId: CONTATO }), { wrapper });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(result.current.data?.matchedLevel).toBe('system_default');
  });

  it('sem contato não há chamada nenhuma (nada de leitura por linha vazia)', async () => {
    const { wrapper } = setup();

    const { result } = renderHook(
      () => useApplicableSLA({ company: 'Acme', queueId: 'q1' }),
      { wrapper },
    );

    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(h.calls).toHaveLength(0);
    expect(result.current.fetchStatus).toBe('idle');
    expect(result.current.data).toBeUndefined();
  });
});

describe('useApplicableSLA — prazo de resolução (linha do tempo)', () => {
  it('usa a resolução da regra que a RPC casou', async () => {
    h.rpcRows = [linhaRpc({ rule_id: 'rule-c1' })];
    h.rules = [{ id: 'rule-c1', resolution_minutes: 240 }];
    h.defaultConfig = { name: 'Padrão Comercial', resolution_minutes: 45 };
    const { wrapper } = setup();

    const { result } = renderHook(() => useApplicableSLA({ contactId: CONTATO }), { wrapper });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    await waitFor(() => expect(result.current.data?.resolutionMinutes).toBe(240));
  });

  it('agente sem ver as regras (RLS) cai na configuração padrão, não em zero', async () => {
    h.rpcRows = [linhaRpc({ rule_id: 'rule-fora-do-alcance', matched_level: 'company' })];
    h.rules = [];
    h.defaultConfig = { name: 'Padrão Comercial', resolution_minutes: 45 };
    const { wrapper } = setup();

    const { result } = renderHook(() => useApplicableSLA({ contactId: CONTATO }), { wrapper });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    await waitFor(() => expect(result.current.data?.resolutionMinutes).toBe(45));
  });

  it('sem regra visível e sem padrão, a resolução é a do sistema (60), nunca inventada', async () => {
    h.rpcRows = [];
    const { wrapper } = setup();

    const { result } = renderHook(() => useApplicableSLA({ contactId: CONTATO }), { wrapper });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(result.current.data).toMatchObject({
      firstResponseMinutes: 5,
      resolutionMinutes: 60,
      ruleId: null,
      matchedLevel: 'system_default',
    });
  });
});

describe('useApplicableSLA — falha da RPC não vira prazo inventado', () => {
  it('erro da RPC vira erro da consulta (o chamador cai no seu fallback)', async () => {
    h.rpcRows = [];
    h.rpcError = { message: 'permission denied for function resolve_applicable_sla' };
    const { wrapper } = setup();

    const { result } = renderHook(() => useApplicableSLA({ contactId: CONTATO }), { wrapper });

    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(result.current.data).toBeUndefined();
  });
});
