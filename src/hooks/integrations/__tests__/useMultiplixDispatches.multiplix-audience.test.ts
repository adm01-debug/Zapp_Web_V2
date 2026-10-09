/**
 * TL-041B — camada de hook para as acoes de publico da edge `multiplix-dispatch`
 * (entregues em TL-041A): `audience.select`, `audience.save` e `audience.apply`.
 *
 * Prova, com `supabase.functions.invoke` mockado (mesmo padrao de
 * `useMultiplixDispatches.edge.test.tsx`):
 *  - o payload vai para a edge COMO VEIO: a intencao inteira (`manual`,
 *    `publics`, `filters`, `exclude`, `primary_per_company`, `select_all`),
 *    sem uniao montada, sem filtro resolvido em ids, sem chave descartada e
 *    sem default injetado — `publics[i].filters` continua filtro e
 *    `company_ids` continua vazio;
 *  - os contadores (`eligible_count`, `dropped_out_of_filter`,
 *    `excluded_removed`) vem DA RESPOSTA — nunca `recipients.length` nem `0`
 *    inventado; resposta sem contador rejeita com `multiplix_audience_shape`;
 *  - `audience.apply` envia EXATAMENTE as chaves do input (o schema da edge e
 *    `.strict()`: chave extra = 400) e devolve o `audience_id` no resultado;
 *  - `audience.save` manda `kind: 'rule'` com `definition` e SEM `members`, e
 *    `static_list` com `members` e SEM `definition`;
 *  - erro de negocio em `error.context` vira `MultiplixDispatchEdgeError` com o
 *    `.code` do corpo.
 */
import { renderHook, waitFor } from '@testing-library/react';
import React from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const authGetSession = vi.fn();
const functionsInvoke = vi.fn();

vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    auth: { getSession: (...args: unknown[]) => authGetSession(...args) },
    functions: { invoke: (...args: unknown[]) => functionsInvoke(...args) },
    // Sem `from`: qualquer leitura direta de tabela falharia aqui.
  },
}));

vi.mock('sonner', () => ({ toast: { error: vi.fn(), success: vi.fn() } }));
vi.mock('../useMultiplixAudience', () => ({ createMultiplixDraft: vi.fn() }));

import {
  selectMultiplixAudience,
  saveMultiplixAudience,
  applyMultiplixAudience,
  readMultiplixAudienceSelection,
  readMultiplixAudienceSaved,
  useMultiplixAudienceSelect,
  useMultiplixAudienceSave,
  useMultiplixAudienceApply,
  MultiplixDispatchEdgeError,
  type MultiplixAudienceIntent,
  type MultiplixAudienceApplyInput,
} from '@/hooks/integrations/useMultiplixDispatches';

function createWrapper() {
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 }, mutations: { retry: false } },
  });
  return ({ children }: { children: React.ReactNode }) =>
    React.createElement(QueryClientProvider, { client: qc }, children);
}

/** Resposta de sucesso real da edge (TL-041A): envelope `{ data, meta }`. */
const SELECTION_DATA = {
  recipients: [],
  total: 9,
  eligible_count: 7,
  count: 9,
  policy_limit: 500,
  primary_per_company: true,
  select_all: true,
  signals: [
    {
      code: 'primary_not_determinable',
      company_id: 'comp-1',
      candidates: 2,
      detail: '2 contatos ativos sem principal',
    },
  ],
  dropped_out_of_filter: 2,
  excluded_removed: 1,
};

function selectionResponse(overrides: Record<string, unknown> = {}) {
  return {
    data: {
      data: { ...SELECTION_DATA, ...overrides },
      meta: { correlation_id: 'corr-1', duration_ms: 3 },
    },
    error: null,
  };
}

function lastInvokePayload() {
  const call = functionsInvoke.mock.calls[functionsInvoke.mock.calls.length - 1];
  return (call?.[1] as { body: { payload: Record<string, unknown> } }).body.payload;
}

const FULL_INTENT: MultiplixAudienceIntent = {
  manual: { company_ids: ['comp-manual'], contact_ids: ['cont-manual'] },
  publics: [
    // publico POR FILTRO: a edge resolve; se o hook expandisse em ids,
    // `filters` sumiria e `company_ids` viria preenchido.
    { filters: { roles: ['cliente'], uf: 'SP' }, company_ids: [] },
    // publico por referencia a outro publico salvo.
    { audience_id: '11111111-1111-4111-8111-111111111111', company_ids: ['comp-x'] },
  ],
  filters: { roles: ['cliente', 'fornecedor'], ramo: 'alimentos', uf: 'SP', search: 'padaria' },
  exclude: { company_ids: ['comp-excl'], contact_ids: ['cont-excl'] },
  primary_per_company: true,
  select_all: true,
};

beforeEach(() => {
  vi.clearAllMocks();
  authGetSession.mockResolvedValue({ data: { session: { access_token: 'tok-123' } } });
});

describe('multiplix audience — select/save/apply via edge `multiplix-dispatch`', () => {
  // (a) a intencao vai INTEIRA para `audience.select`: payload identico (deep
  // equal) e header Authorization. `publics[i].filters` continua filtro e
  // `company_ids` continua vazio — nada foi expandido no navegador.
  it('selectMultiplixAudience envia a intencao inteira, sem expandir listas', async () => {
    functionsInvoke.mockResolvedValue(selectionResponse());

    const result = await selectMultiplixAudience(FULL_INTENT);

    expect(functionsInvoke).toHaveBeenCalledTimes(1);
    expect(functionsInvoke).toHaveBeenCalledWith('multiplix-dispatch', {
      body: { action: 'audience.select', payload: FULL_INTENT },
      headers: { Authorization: 'Bearer tok-123' },
    });
    const sent = lastInvokePayload();
    expect(sent.publics).toEqual(FULL_INTENT.publics);
    const sentPublics = sent.publics as Array<Record<string, unknown>>;
    expect(sentPublics[0].filters).toEqual({ roles: ['cliente'], uf: 'SP' });
    expect(sentPublics[0].company_ids).toEqual([]);
    expect(result.eligible_count).toBe(7);
  });

  // (b) os contadores vem DA RESPOSTA: `recipients: []` com `eligible_count: 7`
  // entrega 7 — se o hook usasse `recipients.length` daria 0.
  it('contadores vem da resposta, nao de recipients.length', async () => {
    functionsInvoke.mockResolvedValue(
      selectionResponse({ recipients: [], eligible_count: 7, dropped_out_of_filter: 2, excluded_removed: 1 }),
    );

    const result = await selectMultiplixAudience({ manual: { company_ids: ['c1'] } });

    expect(result.eligible_count).toBe(7);
    expect(result.dropped_out_of_filter).toBe(2);
    expect(result.excluded_removed).toBe(1);
    expect(result.recipients).toEqual([]);
  });

  // (c) resposta sem os contadores => rejeita com `multiplix_audience_shape`
  // (NUNCA devolve 0 inventado).
  it('resposta sem contador rejeita com multiplix_audience_shape', async () => {
    const { eligible_count: _omit, ...semContador } = SELECTION_DATA;
    functionsInvoke.mockResolvedValue({
      data: { data: semContador, meta: { correlation_id: 'c', duration_ms: 1 } },
      error: null,
    });

    await expect(selectMultiplixAudience({ select_all: true })).rejects.toMatchObject({
      name: 'MultiplixDispatchEdgeError',
      code: 'multiplix_audience_shape',
    });
  });

  it('readMultiplixAudienceSelection rejeita contador nao numerico e aceita count null', () => {
    expect(() =>
      readMultiplixAudienceSelection({ data: { ...SELECTION_DATA, excluded_removed: '1' } }),
    ).toThrow(MultiplixDispatchEdgeError);
    // `count` pode ser null quando nao havia filtro ativo — isso NAO e erro.
    expect(readMultiplixAudienceSelection({ data: { ...SELECTION_DATA, count: null } }).count).toBeNull();
  });

  // (d) `audience.apply` envia EXATAMENTE as chaves do input (o schema da edge
  // e `.strict()`: uma chave a mais, como `publics`, derruba com 400) e o
  // `audience_id` da resposta volta junto do resultado.
  it('applyMultiplixAudience envia so as chaves do input e devolve audience_id', async () => {
    const applyInput: MultiplixAudienceApplyInput = {
      audience_id: '22222222-2222-4222-8222-222222222222',
      manual: { company_ids: ['comp-manual'] },
      exclude: { contact_ids: ['cont-excl'] },
      primary_per_company: true,
    };
    functionsInvoke.mockResolvedValue(selectionResponse({ audience_id: applyInput.audience_id }));

    const result = await applyMultiplixAudience(applyInput);

    expect(functionsInvoke).toHaveBeenCalledWith('multiplix-dispatch', {
      body: { action: 'audience.apply', payload: applyInput },
      headers: { Authorization: 'Bearer tok-123' },
    });
    // Prova da chave extra: o payload tem EXATAMENTE as chaves do input
    // (sem `publics`, sem `select_all` injetado, sem `filters` default).
    expect(Object.keys(lastInvokePayload()).sort()).toEqual(
      ['audience_id', 'exclude', 'manual', 'primary_per_company'].sort(),
    );
    expect(result.audience_id).toBe(applyInput.audience_id);
    expect(result.eligible_count).toBe(7);
  });

  // (e) `audience.save` (schema `.strict()`): `rule` com `definition` e SEM
  // `members`; `static_list` com `members` e SEM `definition`.
  it('saveMultiplixAudience manda rule com definition e SEM members', async () => {
    functionsInvoke.mockResolvedValue({
      data: { data: { id: 'aud-1', name: 'Clientes SP', kind: 'rule', member_count: 12 }, meta: {} },
      error: null,
    });

    const saved = await saveMultiplixAudience({
      name: 'Clientes SP',
      kind: 'rule',
      definition: { roles: ['cliente'], uf: 'SP' },
    });

    expect(functionsInvoke).toHaveBeenCalledWith('multiplix-dispatch', {
      body: {
        action: 'audience.save',
        payload: { name: 'Clientes SP', kind: 'rule', definition: { roles: ['cliente'], uf: 'SP' } },
      },
      headers: { Authorization: 'Bearer tok-123' },
    });
    expect('members' in lastInvokePayload()).toBe(false);
    expect(saved).toEqual({ id: 'aud-1', name: 'Clientes SP', kind: 'rule', member_count: 12 });
  });

  it('saveMultiplixAudience manda static_list com members e SEM definition', async () => {
    functionsInvoke.mockResolvedValue({
      data: { data: { id: 'aud-2', name: 'Lista fixa', kind: 'static_list', member_count: 2 }, meta: {} },
      error: null,
    });

    await saveMultiplixAudience({
      name: 'Lista fixa',
      kind: 'static_list',
      members: { company_ids: ['comp-1'], contact_ids: ['cont-1'] },
    });

    const sent = lastInvokePayload();
    expect(sent).toEqual({
      name: 'Lista fixa',
      kind: 'static_list',
      members: { company_ids: ['comp-1'], contact_ids: ['cont-1'] },
    });
    expect('definition' in sent).toBe(false);
    // resposta de save sem `member_count` numerico tambem falha alto
    expect(() =>
      readMultiplixAudienceSaved({ data: { id: 'x', name: 'n', kind: 'rule' } }),
    ).toThrow(MultiplixDispatchEdgeError);
  });

  // (f) erro de negocio da edge (400) com `{ error: <codigo> }` em
  // `error.context` vira `MultiplixDispatchEdgeError` com o codigo do corpo.
  it('erro 400 da edge em error.context vira MultiplixDispatchEdgeError com o code do corpo', async () => {
    const context = new Response(
      JSON.stringify({ error: 'audience.apply: payload inválido (audience_id)' }),
      { status: 400, headers: { 'Content-Type': 'application/json' } },
    );
    functionsInvoke.mockResolvedValue({
      data: null,
      error: { message: 'Edge Function returned a non-2xx status code', context },
    });

    await expect(
      applyMultiplixAudience({ audience_id: 'nao-e-uuid' }),
    ).rejects.toMatchObject({
      name: 'MultiplixDispatchEdgeError',
      code: 'audience.apply: payload inválido (audience_id)',
    });
  });

  // (g) caminho verde pelo HOOK: `useMultiplixAudienceSelect().mutateAsync`
  // devolve o resultado (contadores) da edge.
  it('useMultiplixAudienceSelect().mutateAsync devolve o resultado da edge', async () => {
    functionsInvoke.mockResolvedValue(selectionResponse());

    const { result } = renderHook(() => useMultiplixAudienceSelect(), { wrapper: createWrapper() });
    const selection = await result.current.mutateAsync(FULL_INTENT);

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(selection.eligible_count).toBe(7);
    expect(selection.dropped_out_of_filter).toBe(2);
    expect(selection.signals).toEqual(SELECTION_DATA.signals);
    expect(functionsInvoke).toHaveBeenCalledWith('multiplix-dispatch', {
      body: { action: 'audience.select', payload: FULL_INTENT },
      headers: { Authorization: 'Bearer tok-123' },
    });
  });

  it('useMultiplixAudienceSave e useMultiplixAudienceApply chamam a edge pelos hooks', async () => {
    functionsInvoke.mockResolvedValue({
      data: { data: { id: 'aud-3', name: 'N', kind: 'rule', member_count: 0 }, meta: {} },
      error: null,
    });
    const { result: saveResult } = renderHook(() => useMultiplixAudienceSave(), { wrapper: createWrapper() });
    const saved = await saveResult.current.mutateAsync({
      name: 'N', kind: 'rule', definition: { uf: 'SP' },
    });
    expect(saved.id).toBe('aud-3');
    expect(functionsInvoke).toHaveBeenLastCalledWith('multiplix-dispatch', expect.objectContaining({
      body: { action: 'audience.save', payload: { name: 'N', kind: 'rule', definition: { uf: 'SP' } } },
    }));

    functionsInvoke.mockResolvedValue(selectionResponse({ audience_id: 'aud-3' }));
    const { result: applyResult } = renderHook(() => useMultiplixAudienceApply(), { wrapper: createWrapper() });
    const applied = await applyResult.current.mutateAsync({ audience_id: 'aud-3' });
    expect(applied.audience_id).toBe('aud-3');
    expect(functionsInvoke).toHaveBeenLastCalledWith('multiplix-dispatch', expect.objectContaining({
      body: { action: 'audience.apply', payload: { audience_id: 'aud-3' } },
    }));
  });
});
