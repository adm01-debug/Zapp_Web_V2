/**
 * TL-041B — o front passa a ter camada de hook para o PÚBLICO do Multiplix:
 * `audience.select`, `audience.save` e `audience.apply` na edge
 * `multiplix-dispatch` (contrato entregue em TL-041A, `actions/audience.ts`).
 *
 * O que este teste prova, com `supabase.functions.invoke` mockado:
 *  - a INTENÇÃO viaja inteira para a edge (`manual`, `publics`, `filters`,
 *    `exclude`, `primary_per_company`, `select_all`) e o navegador NÃO expande
 *    lista nenhuma — público salvo viaja por `audience_id` e "todos os N" por
 *    `select_all`;
 *  - a edge é chamada com `{ action, payload }` + header `Authorization`, e
 *    nenhuma outra edge/tabela é usada no caminho;
 *  - o retorno entrega à tela `eligible_count`, `dropped_out_of_filter` e
 *    `excluded_removed` exatamente como o SERVIDOR informou (nunca
 *    recalculados nem zerados aqui);
 *  - erro de payload (400) e falha interna (502) sobem como erro nomeado, nunca
 *    como sucesso com dado vazio.
 */
import { act, renderHook, waitFor } from '@testing-library/react';
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
// A camada de público NÃO pode voltar a chamar a edge antiga `multiplix-audience`.
vi.mock('../useMultiplixAudience', () => ({ createMultiplixDraft: vi.fn() }));

import {
  applyMultiplixAudience,
  buildMultiplixAudienceSavePayload,
  buildMultiplixAudienceSelectPayload,
  MultiplixDispatchEdgeError,
  saveMultiplixAudience,
  selectMultiplixAudience,
  useMultiplixAudienceApply,
  useMultiplixAudienceSave,
  useMultiplixAudienceSelect,
  type MultiplixAudienceRecipient,
} from '@/hooks/integrations/useMultiplixDispatches';

// Ids REAIS de UUID: é o que a edge aceita (`z.string().uuid()`), então o
// payload assertado aqui é um exemplo válido do contrato.
const EMPRESA_A = '11111111-1111-4111-8111-111111111111';
const EMPRESA_B = '22222222-2222-4222-8222-222222222222';
const CONTATO_A = '33333333-3333-4333-8333-333333333333';
const EXCLUIDA = '44444444-4444-4444-8444-444444444444';
const PUBLICO_1 = '55555555-5555-4555-8555-555555555555';
const PUBLICO_2 = '66666666-6666-4666-8666-666666666666';

function destinatario(companyId: string, nome: string): MultiplixAudienceRecipient {
  return {
    company_id: companyId,
    contact_id: CONTATO_A,
    company_name: nome,
    destino_e164: '+551****1111',
    destino_origem: 'contato',
    elegibilidade: 'eligible',
  };
}

const DEST_1 = destinatario(EMPRESA_A, 'Empresa A');
const DEST_2 = destinatario(EMPRESA_B, 'Empresa B');

function createWrapper() {
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 }, mutations: { retry: false } },
  });
  return ({ children }: { children?: React.ReactNode }) =>
    React.createElement(QueryClientProvider, { client: qc }, children);
}

/** Corpo de resposta da edge `multiplix-dispatch` (jsonResponse({ data, meta })). */
function edgeResponse(data: Record<string, unknown>) {
  return { data: { data, meta: { correlation_id: 'corr-1' } }, error: null };
}

/** Erro HTTP da edge, com o código nomeado dentro de `error.context`. */
function edgeError(status: number, body: Record<string, unknown>) {
  const context = new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
  return { data: null, error: { message: 'Edge Function returned a non-2xx status code', context } };
}

beforeEach(() => {
  vi.clearAllMocks();
  authGetSession.mockResolvedValue({ data: { session: { access_token: 'tok-123' } } });
});

describe('buildMultiplixAudienceSelectPayload — a intenção vai inteira e nada é expandido', () => {
  it('omite o que não foi informado e não inventa chave nenhuma', () => {
    expect(buildMultiplixAudienceSelectPayload()).toEqual({});
    expect(buildMultiplixAudienceSelectPayload({ selectAll: true, filters: { ramo: 'Informática' } }))
      .toEqual({ filters: { ramo: 'Informática' }, select_all: true });
  });

  it('público salvo viaja por referência (audience_id), nunca pelos membros', () => {
    expect(buildMultiplixAudienceSelectPayload({ publics: [{ audienceId: PUBLICO_1 }] }))
      .toEqual({ publics: [{ company_ids: [], contact_ids: [], audience_id: PUBLICO_1 }] });
  });

  it('manual e exclude viram company_ids/contact_ids completos', () => {
    expect(buildMultiplixAudienceSelectPayload({
      manual: { companyIds: [EMPRESA_A] },
      exclude: { contactIds: [CONTATO_A] },
      primaryPerCompany: true,
    })).toEqual({
      manual: { company_ids: [EMPRESA_A], contact_ids: [] },
      exclude: { company_ids: [], contact_ids: [CONTATO_A] },
      primary_per_company: true,
    });
  });

  it('audience.save envia só o contrato `.strict()` da edge', () => {
    expect(buildMultiplixAudienceSavePayload({ name: 'Clientes SP', kind: 'rule', definition: { uf: 'SP' } }))
      .toEqual({ name: 'Clientes SP', kind: 'rule', definition: { uf: 'SP' } });
    expect(buildMultiplixAudienceSavePayload({
      name: 'Lista fixa',
      kind: 'static_list',
      members: { companyIds: [EMPRESA_A, EMPRESA_B] },
    })).toEqual({
      name: 'Lista fixa',
      kind: 'static_list',
      members: { company_ids: [EMPRESA_A, EMPRESA_B], contact_ids: [] },
    });
  });
});

describe('useMultiplixAudienceSelect', () => {
  it('envia a intenção inteira e entrega as contagens que a tela mostra', async () => {
    functionsInvoke.mockResolvedValue(edgeResponse({
      recipients: [DEST_1],
      total: 1,
      eligible_count: 1,
      count: 812,
      policy_limit: 5000,
      primary_per_company: true,
      select_all: true,
      signals: [],
      dropped_out_of_filter: 40,
      excluded_removed: 3,
    }));

    const { result } = renderHook(() => useMultiplixAudienceSelect(), { wrapper: createWrapper() });

    result.current.mutate({
      manual: { companyIds: [EMPRESA_A] },
      publics: [{ audienceId: PUBLICO_1 }, { companyIds: [EMPRESA_B], filters: { roles: ['cliente'] } }],
      filters: { uf: 'SP' },
      exclude: { companyIds: [EXCLUIDA] },
      primaryPerCompany: true,
      selectAll: true,
    });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(functionsInvoke).toHaveBeenCalledTimes(1);
    expect(functionsInvoke).toHaveBeenCalledWith('multiplix-dispatch', {
      body: {
        action: 'audience.select',
        payload: {
          manual: { company_ids: [EMPRESA_A], contact_ids: [] },
          publics: [
            { company_ids: [], contact_ids: [], audience_id: PUBLICO_1 },
            { company_ids: [EMPRESA_B], contact_ids: [], filters: { roles: ['cliente'] } },
          ],
          filters: { uf: 'SP' },
          exclude: { company_ids: [EXCLUIDA], contact_ids: [] },
          primary_per_company: true,
          select_all: true,
        },
      },
      headers: { Authorization: 'Bearer tok-123' },
    });

    // As contagens são as do SERVIDOR — se o hook as recalculasse a partir de
    // `recipients` (1 linha) os dois números abaixo sairiam 0.
    expect(result.current.data).toEqual({
      recipients: [DEST_1],
      total: 1,
      eligible_count: 1,
      count: 812,
      policy_limit: 5000,
      primary_per_company: true,
      select_all: true,
      signals: [],
      dropped_out_of_filter: 40,
      excluded_removed: 3,
    });
  });

  it('expõe o erro da edge em vez de devolver tela vazia', async () => {
    functionsInvoke.mockResolvedValue(edgeError(502, {
      error: 'multiplix_audience_select_failed',
      message: 'audience.select falhou no servidor',
    }));

    const { result } = renderHook(() => useMultiplixAudienceSelect(), { wrapper: createWrapper() });

    await act(async () => {
      await expect(result.current.mutateAsync({ filters: { uf: 'SP' }, selectAll: true }))
        .rejects.toBeInstanceOf(MultiplixDispatchEdgeError);
    });

    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(result.current.data).toBeUndefined();
    expect((result.current.error as MultiplixDispatchEdgeError | null)?.code)
      .toBe('multiplix_audience_select_failed');
  });
});

describe('useMultiplixAudienceSave', () => {
  it('salva regra (`rule`) e lista (`static_list`) pela edge e devolve o público salvo', async () => {
    functionsInvoke.mockResolvedValue(edgeResponse({
      id: PUBLICO_1, name: 'Clientes SP', kind: 'rule', member_count: 0,
    }));

    const { result } = renderHook(() => useMultiplixAudienceSave(), { wrapper: createWrapper() });

    result.current.mutate({
      name: 'Clientes SP',
      kind: 'rule',
      definition: { roles: ['cliente'], uf: 'SP' },
    });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(functionsInvoke).toHaveBeenLastCalledWith('multiplix-dispatch', {
      body: {
        action: 'audience.save',
        payload: { name: 'Clientes SP', kind: 'rule', definition: { roles: ['cliente'], uf: 'SP' } },
      },
      headers: { Authorization: 'Bearer tok-123' },
    });
    expect(result.current.data).toEqual({
      id: PUBLICO_1, name: 'Clientes SP', kind: 'rule', member_count: 0,
    });

    functionsInvoke.mockResolvedValue(edgeResponse({
      id: PUBLICO_2, name: 'Lista fixa', kind: 'static_list', member_count: 2,
    }));

    await expect(saveMultiplixAudience({
      name: 'Lista fixa',
      kind: 'static_list',
      members: { companyIds: [EMPRESA_A, EMPRESA_B] },
    })).resolves.toEqual({ id: PUBLICO_2, name: 'Lista fixa', kind: 'static_list', member_count: 2 });

    expect(functionsInvoke).toHaveBeenLastCalledWith('multiplix-dispatch', {
      body: {
        action: 'audience.save',
        payload: {
          name: 'Lista fixa',
          kind: 'static_list',
          members: { company_ids: [EMPRESA_A, EMPRESA_B], contact_ids: [] },
        },
      },
      headers: { Authorization: 'Bearer tok-123' },
    });
  });

  it('erro de payload (400) sobe como erro nomeado, não como público salvo', async () => {
    const code = 'audience.save: payload inválido (definition: kind=rule exige definition com ao menos um filtro)';
    functionsInvoke.mockResolvedValue(edgeError(400, { error: code }));

    await expect(saveMultiplixAudience({ name: 'Regra vazia', kind: 'rule' }))
      .rejects.toMatchObject({ name: 'MultiplixDispatchEdgeError', code });
  });

  it('resposta sem o id do público falha alto em vez de devolver objeto vazio', async () => {
    functionsInvoke.mockResolvedValue(edgeResponse({ name: 'Clientes SP', kind: 'rule', member_count: 0 }));

    await expect(saveMultiplixAudience({ name: 'Clientes SP', kind: 'rule', definition: { uf: 'SP' } }))
      .rejects.toMatchObject({ name: 'MultiplixDispatchEdgeError', code: 'multiplix_audience_shape' });
  });
});

describe('useMultiplixAudienceApply', () => {
  it('aplica o público salvo por REFERÊNCIA e devolve as contagens e os avisos', async () => {
    functionsInvoke.mockResolvedValue(edgeResponse({
      audience_id: PUBLICO_1,
      recipients: [DEST_1, DEST_2],
      total: 2,
      eligible_count: 2,
      count: 300,
      policy_limit: 5000,
      primary_per_company: true,
      select_all: false,
      signals: [{
        code: 'primary_not_determinable',
        company_id: EMPRESA_A,
        candidates: 2,
        detail: '2 candidatos sem dado de primazia',
      }],
      dropped_out_of_filter: 12,
      excluded_removed: 1,
    }));

    const { result } = renderHook(() => useMultiplixAudienceApply(), { wrapper: createWrapper() });

    result.current.mutate({
      audienceId: PUBLICO_1,
      exclude: { companyIds: [EXCLUIDA] },
      primaryPerCompany: true,
    });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(functionsInvoke).toHaveBeenCalledWith('multiplix-dispatch', {
      body: {
        action: 'audience.apply',
        payload: {
          audience_id: PUBLICO_1,
          exclude: { company_ids: [EXCLUIDA], contact_ids: [] },
          primary_per_company: true,
        },
      },
      headers: { Authorization: 'Bearer tok-123' },
    });

    // O que viaja é a REFERÊNCIA: nenhum membro do público foi materializado no
    // navegador (a edge carrega os membros a partir de `audience_id`).
    const payload = (functionsInvoke.mock.calls[0][1] as {
      body: { payload: Record<string, unknown> };
    }).body.payload;
    expect(payload).not.toHaveProperty('company_ids');
    expect(payload).not.toHaveProperty('members');

    expect(result.current.data?.audience_id).toBe(PUBLICO_1);
    expect(result.current.data?.eligible_count).toBe(2);
    expect(result.current.data?.dropped_out_of_filter).toBe(12);
    expect(result.current.data?.excluded_removed).toBe(1);
    expect(result.current.data?.signals).toHaveLength(1);
  });

  it('público de outro dono/inexistente (404) vira erro nomeado', async () => {
    functionsInvoke.mockResolvedValue(edgeError(404, { error: 'multiplix_audience_not_found' }));

    await expect(applyMultiplixAudience({ audienceId: PUBLICO_1 }))
      .rejects.toMatchObject({ name: 'MultiplixDispatchEdgeError', code: 'multiplix_audience_not_found' });
  });
});

describe('selectMultiplixAudience — leitura da resposta', () => {
  it('não inventa contagem: sem os números da edge devolve null, nunca 0', async () => {
    functionsInvoke.mockResolvedValue(edgeResponse({ recipients: [DEST_1], total: 1 }));

    const select = await selectMultiplixAudience({ manual: { companyIds: [EMPRESA_A] } });

    expect(select.recipients).toEqual([DEST_1]);
    expect(select.eligible_count).toBeNull();
    expect(select.dropped_out_of_filter).toBeNull();
    expect(select.excluded_removed).toBeNull();
  });

  it('resposta sem a lista de destinatários falha alto em vez de virar tela vazia', async () => {
    functionsInvoke.mockResolvedValue(edgeResponse({ eligible_count: 3 }));

    await expect(selectMultiplixAudience({ filters: { uf: 'SP' }, selectAll: true }))
      .rejects.toMatchObject({ name: 'MultiplixDispatchEdgeError', code: 'multiplix_audience_shape' });
  });

  it('sem sessão não chama a edge', async () => {
    authGetSession.mockResolvedValue({ data: { session: null } });

    await expect(selectMultiplixAudience({ selectAll: true, filters: { uf: 'SP' } }))
      .rejects.toThrow(/Not authenticated/);
    expect(functionsInvoke).not.toHaveBeenCalled();
  });
});
