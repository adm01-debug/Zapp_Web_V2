/**
 * Y05 — testes NOVOS do hook `useTalkXTemplates` (Talk X).
 *
 * Exercita o hook REAL e dubla so a FRONTEIRA: o cliente Supabase (rede/banco),
 * o toast e o auth. Cada caso prova comportamento observavel: a listagem com o
 * select/ordem exatos, o CRUD por mutacao, a atualizacao com snapshot (RPC) com
 * o mapa de mensagens de erro, o envio de teste (funcao de borda talkx-send),
 * o historico de versoes, as variantes A/B e a contagem de destinatarios.
 *
 * Achados desta rodada (comportamento correto marcado em `it.fails`, sem
 * corrigir producao): o historico de versoes e a contagem de destinatarios
 * ENGOLem o erro do banco (rede/RLS) e devolvem lista/zero — ver relato.
 */
import { act, renderHook, waitFor } from '@testing-library/react';
import React from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { Mock } from 'vitest';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

type QueryResult = { data: unknown; error: unknown };

const toastError = vi.fn();
const toastSuccess = vi.fn();
vi.mock('sonner', () => ({
  toast: {
    error: (...args: unknown[]) => toastError(...args),
    success: (...args: unknown[]) => toastSuccess(...args),
  },
}));

const fromTable = vi.fn();
vi.mock('@/lib/supabaseHelpers', () => ({
  fromTable: (...args: unknown[]) => fromTable(...args),
}));

const supabaseRpc = vi.fn();
const supabaseFrom = vi.fn();
const authGetSession = vi.fn();
vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    rpc: (...args: unknown[]) => supabaseRpc(...args),
    from: (...args: unknown[]) => supabaseFrom(...args),
    auth: { getSession: (...args: unknown[]) => authGetSession(...args) },
  },
}));

let authProfile: { id: string } | null = { id: 'profile-1' };
vi.mock('@/hooks/auth/useAuth', () => ({
  useAuth: () => ({ profile: authProfile }),
}));

import { useTalkXTemplates, type TalkXTemplate } from '@/hooks/integrations/useTalkXTemplates';

const TEMPLATE: TalkXTemplate = {
  id: 'tpl-1',
  name: 'Boas-vindas',
  description: 'd',
  category: 'geral',
  content: 'Ola {{nome}}',
  media_url: null,
  media_type: null,
  tags: ['a'],
  status: 'approved',
  use_count: 3,
  created_by: 'profile-1',
  custom_variables: ['nome'],
  created_at: '2026-09-01T00:00:00Z',
  updated_at: '2026-09-02T00:00:00Z',
  current_version_id: 'ver-1',
  creator: { name: 'Ana' },
};

const UPDATE_INPUT = {
  id: 'tpl-1',
  expectedUpdatedAt: '2026-09-02T00:00:00Z',
  name: 'Boas-vindas',
  content: 'Texto novo',
};

let listResult: QueryResult = { data: [], error: null };
let mutationResult: QueryResult = { data: [], error: null };
let directResult: QueryResult = { data: [], error: null };
let directMutationResult: QueryResult = { data: [], error: null };

let tableBuilders: Record<string, unknown>[] = [];

/** Builder encadeavel do PostgREST: qualquer passo volta no proprio thenable;
 * `.insert`/`.update`/`.delete` passam a resolver o resultado de MUTACAO. */
function makeBuilder(initial: QueryResult, onMutation: () => QueryResult) {
  let current = initial;
  const b: Record<string, unknown> = {};
  const self = () => b;
  b.select = vi.fn(self);
  b.order = vi.fn(self);
  b.limit = vi.fn(self);
  b.eq = vi.fn(self);
  b.insert = vi.fn((payload: unknown) => { current = onMutation(); b.insertPayload = payload; return b; });
  b.update = vi.fn((payload: unknown) => { current = onMutation(); b.updatePayload = payload; return b; });
  b.delete = vi.fn(() => { current = onMutation(); return b; });
  b.single = vi.fn(async () => current);
  b.maybeSingle = vi.fn(async () => current);
  b.then = (onFulfilled: (v: QueryResult) => unknown, onRejected?: (e: unknown) => unknown) =>
    Promise.resolve(current).then(onFulfilled, onRejected);
  return b;
}

const fetchMock = vi.fn();

function jsonResponse(body: unknown, ok = true, status = 200): Response {
  return { ok, status, json: async () => body } as unknown as Response;
}

let qc: QueryClient;

function wrapper() {
  return ({ children }: { children: React.ReactNode }) =>
    React.createElement(QueryClientProvider, { client: qc }, children);
}

const calls = (fn: unknown) => (fn as Mock).mock.calls as unknown[][];
const tableBuilder = (i: number) => tableBuilders[i];

beforeEach(() => {
  vi.clearAllMocks();
  listResult = { data: [], error: null };
  mutationResult = { data: [], error: null };
  directResult = { data: [], error: null };
  directMutationResult = { data: [], error: null };
  tableBuilders = [];
  authProfile = { id: 'profile-1' };
  authGetSession.mockResolvedValue({ data: { session: { access_token: 'tok-1' } } });
  supabaseRpc.mockResolvedValue({ data: [{ updated_at: '2026-10-07T12:00:00Z' }], error: null });
  fromTable.mockImplementation(() => {
    const b = makeBuilder(listResult, () => mutationResult);
    tableBuilders.push(b);
    return b;
  });
  supabaseFrom.mockImplementation(() => makeBuilder(directResult, () => directMutationResult));
  qc = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0, staleTime: 0 }, mutations: { retry: false } },
  });
  vi.stubEnv('VITE_SUPABASE_URL', 'https://zapp-test.local');
  vi.stubGlobal('fetch', fetchMock);
  fetchMock.mockReset();
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

describe('useTalkXTemplates — listagem', () => {
  it('carrega a lista com o select do criador e a ordem por uso/atualizacao', async () => {
    listResult = { data: [TEMPLATE], error: null };
    const { result } = renderHook(() => useTalkXTemplates(), { wrapper: wrapper() });

    await waitFor(() => expect(result.current.templates).toHaveLength(1));

    expect(fromTable).toHaveBeenCalledWith('talkx_templates');
    const b = tableBuilder(0);
    expect(calls(b.select)[0]).toEqual(['*, creator:created_by(name)']);
    expect(calls(b.order)).toEqual([
      ['use_count', { ascending: false }],
      ['updated_at', { ascending: false }],
    ]);
    expect(result.current.templates[0]).toEqual(TEMPLATE);
    expect(result.current.isLoading).toBe(false);
    expect(result.current.isError).toBe(false);
  });

  it('expoe lista vazia quando o banco responde null', async () => {
    listResult = { data: null, error: null };
    const { result } = renderHook(() => useTalkXTemplates(), { wrapper: wrapper() });

    await waitFor(() => expect(result.current.isLoading).toBe(false));

    expect(result.current.templates).toEqual([]);
  });

  it('propaga o erro de RLS/rede da listagem (nao engole)', async () => {
    listResult = { data: null, error: { message: 'permission denied for table talkx_templates', code: '42501' } };
    const { result } = renderHook(() => useTalkXTemplates(), { wrapper: wrapper() });

    await waitFor(() => expect(result.current.isError).toBe(true));

    expect(result.current.error?.message).toBe('permission denied for table talkx_templates');
    expect(result.current.templates).toEqual([]);
  });
});

describe('useTalkXTemplates — createTemplate', () => {
  it('insere com created_by do perfil e invalida a lista com aviso de sucesso', async () => {
    mutationResult = { data: { ...TEMPLATE, id: 'tpl-novo' }, error: null };
    const { result } = renderHook(() => useTalkXTemplates(), { wrapper: wrapper() });
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    await act(async () => {
      await result.current.createTemplate.mutateAsync({ name: 'Novo', content: 'Oi' });
    });

    const b = tableBuilder(1);
    expect(calls(b.insert)[0]).toEqual([{ name: 'Novo', content: 'Oi', created_by: 'profile-1' }]);
    expect(toastSuccess).toHaveBeenCalledWith('Template salvo');
    // invalidate() re-dispara a listagem: o builder da lista e criado de novo.
    await waitFor(() => expect(fromTable.mock.calls.length).toBeGreaterThanOrEqual(2));
  });

  it('grava created_by null quando nao ha perfil', async () => {
    authProfile = null;
    mutationResult = { data: { ...TEMPLATE }, error: null };
    const { result } = renderHook(() => useTalkXTemplates(), { wrapper: wrapper() });
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    await act(async () => {
      await result.current.createTemplate.mutateAsync({ name: 'Novo', content: 'Oi' });
    });

    const payload = calls(tableBuilder(1).insert)[0][0] as Record<string, unknown>;
    expect(payload.created_by).toBeNull();
  });

  it('mostra a mensagem de erro do banco ao falhar o insert', async () => {
    mutationResult = { data: null, error: { message: 'duplicate key value violates unique constraint' } };
    const { result } = renderHook(() => useTalkXTemplates(), { wrapper: wrapper() });
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    await act(async () => {
      await result.current.createTemplate.mutateAsync({ name: 'Novo', content: 'Oi' }).catch(() => undefined);
    });

    expect(toastError).toHaveBeenCalledWith('Erro ao salvar template: duplicate key value violates unique constraint');
  });
});

describe('useTalkXTemplates — updateTemplate (snapshot)', () => {
  it('chama a RPC com os campos do snapshot e devolve o updated_at persistido', async () => {
    listResult = { data: [TEMPLATE], error: null };
    const { result } = renderHook(() => useTalkXTemplates(), { wrapper: wrapper() });
    await waitFor(() => expect(result.current.templates).toHaveLength(1));

    let updated: TalkXTemplate | undefined;
    await act(async () => {
      updated = await result.current.updateTemplate.mutateAsync(UPDATE_INPUT);
    });

    const [fn, args] = calls(supabaseRpc)[0];
    expect(fn).toBe('update_talkx_template_with_snapshot');
    expect(args).toEqual({
      p_template_id: 'tpl-1',
      p_expected_updated_at: '2026-09-02T00:00:00Z',
      p_name: 'Boas-vindas',
      p_description: 'd',
      p_category: 'geral',
      p_content: 'Texto novo',
      p_media_url: null,
      p_media_type: null,
      p_tags: ['a'],
      p_status: 'approved',
      p_custom_variables: ['nome'],
    });
    expect(updated?.updated_at).toBe('2026-10-07T12:00:00Z');
    expect(updated?.content).toBe('Texto novo');
    expect(toastSuccess).toHaveBeenCalledWith('Template atualizado');
  });

  it('usa [] quando o template nao tem custom_variables', async () => {
    listResult = { data: [{ ...TEMPLATE, custom_variables: undefined } as unknown as TalkXTemplate], error: null };
    const { result } = renderHook(() => useTalkXTemplates(), { wrapper: wrapper() });
    await waitFor(() => expect(result.current.templates).toHaveLength(1));

    await act(async () => {
      await result.current.updateTemplate.mutateAsync(UPDATE_INPUT);
    });

    const args = calls(supabaseRpc)[0][1] as Record<string, unknown>;
    expect(args.p_custom_variables).toEqual([]);
  });

  it('recusa atualizar template que nao esta na lista carregada e nao chama a RPC', async () => {
    listResult = { data: [TEMPLATE], error: null };
    const { result } = renderHook(() => useTalkXTemplates(), { wrapper: wrapper() });
    await waitFor(() => expect(result.current.templates).toHaveLength(1));

    await expect(
      result.current.updateTemplate.mutateAsync({ ...UPDATE_INPUT, id: 'tpl-inexistente' }),
    ).rejects.toThrow('Template desatualizado; recarregue e tente novamente');
    expect(supabaseRpc).not.toHaveBeenCalled();
  });

  it('recusa quando a RPC nao confirma a atualizacao (data vazio)', async () => {
    listResult = { data: [TEMPLATE], error: null };
    supabaseRpc.mockResolvedValue({ data: [], error: null });
    const { result } = renderHook(() => useTalkXTemplates(), { wrapper: wrapper() });
    await waitFor(() => expect(result.current.templates).toHaveLength(1));

    await act(async () => {
      await result.current.updateTemplate.mutateAsync(UPDATE_INPUT).catch(() => undefined);
    });

    expect(toastError).toHaveBeenCalledWith('Não foi possível atualizar o template. Tente novamente.');
  });

  const CASOS: Array<[string, string, string]> = [
    ['stale', 'talkx_template_stale_version', 'Este template foi alterado por outra pessoa. Recarregue a lista antes de salvar novamente.'],
    ['sem permissao', 'talkx_template_not_authorized', 'Você não tem permissão para alterar este template.'],
    ['invalido', 'invalid_talkx_template', 'O template contém dados inválidos. Revise os campos e tente novamente.'],
    ['desconhecido', 'erro_interno_qualquer', 'Não foi possível atualizar o template. Tente novamente.'],
  ];

  it.each(CASOS)('mapeia o erro de objeto "%s" para a mensagem ao operador', async (_rotulo, codigo, esperado) => {
    listResult = { data: [TEMPLATE], error: null };
    supabaseRpc.mockResolvedValue({ data: null, error: { message: `erro ${codigo} do banco` } });
    const { result } = renderHook(() => useTalkXTemplates(), { wrapper: wrapper() });
    await waitFor(() => expect(result.current.templates).toHaveLength(1));

    await act(async () => {
      await result.current.updateTemplate.mutateAsync(UPDATE_INPUT).catch(() => undefined);
    });

    expect(toastError).toHaveBeenCalledWith(esperado);
  });

  it('mapeia uma instancia de Error com a mesma regra', async () => {
    listResult = { data: [TEMPLATE], error: null };
    supabaseRpc.mockResolvedValue({ data: null, error: new Error('talkx_template_stale_version (erro)') });
    const { result } = renderHook(() => useTalkXTemplates(), { wrapper: wrapper() });
    await waitFor(() => expect(result.current.templates).toHaveLength(1));

    await act(async () => {
      await result.current.updateTemplate.mutateAsync(UPDATE_INPUT).catch(() => undefined);
    });

    expect(toastError).toHaveBeenCalledWith('Este template foi alterado por outra pessoa. Recarregue a lista antes de salvar novamente.');
  });

  it('cai na mensagem generica quando o erro nao traz message', async () => {
    listResult = { data: [TEMPLATE], error: null };
    supabaseRpc.mockResolvedValue({ data: null, error: 'boom' });
    const { result } = renderHook(() => useTalkXTemplates(), { wrapper: wrapper() });
    await waitFor(() => expect(result.current.templates).toHaveLength(1));

    await act(async () => {
      await result.current.updateTemplate.mutateAsync(UPDATE_INPUT).catch(() => undefined);
    });

    expect(toastError).toHaveBeenCalledWith('Não foi possível atualizar o template. Tente novamente.');
  });
});

describe('useTalkXTemplates — deleteTemplate', () => {
  it('exclui pelo id e avisa o sucesso', async () => {
    mutationResult = { data: null, error: null };
    const { result } = renderHook(() => useTalkXTemplates(), { wrapper: wrapper() });
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    await act(async () => {
      await result.current.deleteTemplate.mutateAsync('tpl-1');
    });

    const b = tableBuilder(1);
    expect(calls(b.eq)[0]).toEqual(['id', 'tpl-1']);
    expect(toastSuccess).toHaveBeenCalledWith('Template excluído');
  });

  it('avisa o erro do banco ao excluir', async () => {
    mutationResult = { data: null, error: { message: 'permission denied' } };
    const { result } = renderHook(() => useTalkXTemplates(), { wrapper: wrapper() });
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    await act(async () => {
      await result.current.deleteTemplate.mutateAsync('tpl-1').catch(() => undefined);
    });

    expect(toastError).toHaveBeenCalledWith('Erro ao excluir: permission denied');
  });
});

describe('useTalkXTemplates — duplicateTemplate', () => {
  it('duplica como rascunho com o sufixo (copia), preservando o conteudo', async () => {
    mutationResult = { data: null, error: null };
    const { result } = renderHook(() => useTalkXTemplates(), { wrapper: wrapper() });
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    await act(async () => {
      await result.current.duplicateTemplate.mutateAsync(TEMPLATE);
    });

    expect(calls(tableBuilder(1).insert)[0][0]).toEqual({
      name: 'Boas-vindas (cópia)',
      description: 'd',
      category: 'geral',
      content: 'Ola {{nome}}',
      media_url: null,
      media_type: null,
      tags: ['a'],
      status: 'draft',
      created_by: 'profile-1',
      custom_variables: ['nome'],
    });
    expect(toastSuccess).toHaveBeenCalledWith('Template duplicado');
  });

  it('avisa o erro do banco ao duplicar', async () => {
    mutationResult = { data: null, error: { message: 'permission denied' } };
    const { result } = renderHook(() => useTalkXTemplates(), { wrapper: wrapper() });
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    await act(async () => {
      await result.current.duplicateTemplate.mutateAsync(TEMPLATE).catch(() => undefined);
    });

    expect(toastError).toHaveBeenCalledWith('Erro ao duplicar: permission denied');
  });
});

describe('useTalkXTemplates — testTemplate', () => {
  async function run(overrides?: { session?: unknown; response?: Response }) {
    if (overrides && 'session' in overrides) {
      authGetSession.mockResolvedValue({ data: { session: overrides.session } });
    }
    if (overrides?.response) fetchMock.mockResolvedValue(overrides.response);
    const { result } = renderHook(() => useTalkXTemplates(), { wrapper: wrapper() });
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    return result;
  }

  it('faz POST para talkx-send com o token da sessao e o corpo do template', async () => {
    const result = await run({ response: jsonResponse({ success: true, id: 'msg-1' }) });

    const json = await result.current.testTemplate({
      templateContent: 'Oi {{nome}}',
      mediaUrl: null,
      mediaType: null,
      phone: '5541999998888',
      customVariables: ['nome'],
    });

    expect(json).toEqual({ success: true, id: 'msg-1' });
    const [url, init] = fetchMock.mock.calls[0] as [string, { method: string; headers: Record<string, string>; body: string }];
    expect(url).toMatch(/\/functions\/v1\/talkx-send$/);
    expect(init.method).toBe('POST');
    expect(init.headers.Authorization).toBe('Bearer tok-1');
    expect(JSON.parse(init.body)).toEqual({
      action: 'test',
      templateContent: 'Oi {{nome}}',
      mediaUrl: null,
      mediaType: null,
      phone: '5541999998888',
      customVariables: ['nome'],
    });
  });

  it('usa o erro devolvido pela funcao quando a resposta nao e ok', async () => {
    const result = await run({ response: jsonResponse({ success: false, error: 'numero invalido' }, false, 400) });

    await expect(
      result.current.testTemplate({ templateContent: 'x', phone: '1' }),
    ).rejects.toThrow('numero invalido');
  });

  it('cai em "Erro <status>" quando a funcao responde ok=false sem corpo JSON', async () => {
    const result = await run({
      response: { ok: false, status: 502, json: async () => { throw new Error('nao e json'); } } as unknown as Response,
    });

    await expect(
      result.current.testTemplate({ templateContent: 'x', phone: '1' }),
    ).rejects.toThrow('Erro 502');
  });

  it('cai em "Erro <status>" quando a resposta e 200 mas o corpo nao confirma success', async () => {
    const result = await run({ response: jsonResponse({ success: false }) });

    await expect(
      result.current.testTemplate({ templateContent: 'x', phone: '1' }),
    ).rejects.toThrow('Erro 200');
  });
});

describe('useTalkXTemplates — fetchVersionHistory', () => {
  it('busca as 10 ultimas versoes do template em ordem decrescente', async () => {
    directResult = { data: [{ id: 'ver-2', version_number: 2 }], error: null };
    const { result } = renderHook(() => useTalkXTemplates(), { wrapper: wrapper() });
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    const versoes = await result.current.fetchVersionHistory('tpl-1');

    expect(versoes).toEqual([{ id: 'ver-2', version_number: 2 }]);
    const table = calls(supabaseFrom)[0][0];
    const b = (supabaseFrom.mock.results.find((r) => r.type === 'return')?.value ?? {}) as Record<string, unknown>;
    expect(table).toBe('talkx_template_versions');
    expect(calls(b.eq)[0]).toEqual(['template_id', 'tpl-1']);
    expect(calls(b.order)[0]).toEqual(['version_number', { ascending: false }]);
    expect(calls(b.limit)[0]).toEqual([10]);
  });

  it('devolve lista vazia quando nao ha versoes', async () => {
    directResult = { data: null, error: null };
    const { result } = renderHook(() => useTalkXTemplates(), { wrapper: wrapper() });
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    expect(await result.current.fetchVersionHistory('tpl-1')).toEqual([]);
  });

  it.fails('propaga erro de rede/RLS em fetchVersionHistory (hoje o erro e engolido: devolve [])', async () => {
    directResult = { data: null, error: { message: 'permission denied for table talkx_template_versions' } };
    const { result } = renderHook(() => useTalkXTemplates(), { wrapper: wrapper() });
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    await expect(result.current.fetchVersionHistory('tpl-1')).rejects.toThrow(/permission denied/);
  });
});

describe('useTalkXTemplates — variantes A/B', () => {
  it('fetchVariants ordena por label e devolve as variantes', async () => {
    directResult = { data: [{ id: 'v1', label: 'A' }], error: null };
    const { result } = renderHook(() => useTalkXTemplates(), { wrapper: wrapper() });
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    const variantes = await result.current.fetchVariants('tpl-1');

    expect(variantes).toEqual([{ id: 'v1', label: 'A' }]);
    expect(calls(supabaseFrom)[0][0]).toBe('talkx_template_variants');
    const b = (supabaseFrom.mock.results.find((r) => r.type === 'return')?.value ?? {}) as Record<string, unknown>;
    expect(calls(b.eq)[0]).toEqual(['template_id', 'tpl-1']);
    expect(calls(b.order)[0]).toEqual(['label', { ascending: true }]);
  });

  it('fetchVariants traduz o erro do banco', async () => {
    directResult = { data: null, error: { message: 'acesso negado' } };
    const { result } = renderHook(() => useTalkXTemplates(), { wrapper: wrapper() });
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    await expect(result.current.fetchVariants('tpl-1')).rejects.toThrow('Erro ao buscar variantes: acesso negado');
  });

  it('saveVariant com id atualiza pelo id', async () => {
    directMutationResult = { data: null, error: null };
    const { result } = renderHook(() => useTalkXTemplates(), { wrapper: wrapper() });
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    await result.current.saveVariant('tpl-1', {
      id: 'v1', template_id: 'tpl-1', label: 'A', content: 'novo',
      media_url: null, media_type: null, weight: 50,
    });

    const b = (supabaseFrom.mock.results.find((r) => r.type === 'return')?.value ?? {}) as Record<string, unknown>;
    expect(calls(b.eq)[0]).toEqual(['id', 'v1']);
    expect(calls(b.update)[0][0]).toEqual({
      template_id: 'tpl-1', label: 'A', content: 'novo', media_url: null, media_type: null, weight: 50,
    });
  });

  it('saveVariant sem id insere com o template_id informado', async () => {
    directMutationResult = { data: null, error: null };
    const { result } = renderHook(() => useTalkXTemplates(), { wrapper: wrapper() });
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    await result.current.saveVariant('tpl-1', {
      template_id: 'tpl-1', label: 'B', content: 'b',
      media_url: null, media_type: null, weight: 50,
    });

    const b = (supabaseFrom.mock.results.find((r) => r.type === 'return')?.value ?? {}) as Record<string, unknown>;
    expect(calls(b.insert)[0][0]).toEqual({
      template_id: 'tpl-1', label: 'B', content: 'b', media_url: null, media_type: null, weight: 50,
    });
  });

  it('saveVariant propaga o erro do banco', async () => {
    directMutationResult = { data: null, error: { message: 'violacao de check' } };
    const { result } = renderHook(() => useTalkXTemplates(), { wrapper: wrapper() });
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    await expect(result.current.saveVariant('tpl-1', {
      template_id: 'tpl-1', label: 'B', content: 'b',
      media_url: null, media_type: null, weight: 50,
    })).rejects.toThrow('violacao de check');
  });

  it('deleteVariant exclui pelo id', async () => {
    directMutationResult = { data: null, error: null };
    const { result } = renderHook(() => useTalkXTemplates(), { wrapper: wrapper() });
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    await result.current.deleteVariant('v1');

    const b = (supabaseFrom.mock.results.find((r) => r.type === 'return')?.value ?? {}) as Record<string, unknown>;
    expect(calls(b.eq)[0]).toEqual(['id', 'v1']);
  });

  it('deleteVariant propaga o erro do banco', async () => {
    directMutationResult = { data: null, error: { message: 'permissao negada' } };
    const { result } = renderHook(() => useTalkXTemplates(), { wrapper: wrapper() });
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    await expect(result.current.deleteVariant('v1')).rejects.toThrow('permissao negada');
  });

  it('countVariantRecipients pede a contagem exata sem trazer linhas', async () => {
    directResult = { data: null, error: null, count: 42 } as unknown as QueryResult;
    const { result } = renderHook(() => useTalkXTemplates(), { wrapper: wrapper() });
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    expect(await result.current.countVariantRecipients('v1')).toBe(42);
    expect(calls(supabaseFrom)[0][0]).toBe('talkx_recipients');
    const b = (supabaseFrom.mock.results.find((r) => r.type === 'return')?.value ?? {}) as Record<string, unknown>;
    expect(calls(b.select)[0]).toEqual(['id', { count: 'exact', head: true }]);
    expect(calls(b.eq)[0]).toEqual(['variant_id', 'v1']);
  });

  it('countVariantRecipients devolve 0 quando o banco nao informa a contagem', async () => {
    directResult = { data: null, error: null } as unknown as QueryResult;
    const { result } = renderHook(() => useTalkXTemplates(), { wrapper: wrapper() });
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    expect(await result.current.countVariantRecipients('v1')).toBe(0);
  });

  it.fails('propaga erro de rede/RLS em countVariantRecipients (hoje o erro e engolido: conta 0)', async () => {
    directResult = { data: null, error: { message: 'permission denied' }, count: null } as unknown as QueryResult;
    const { result } = renderHook(() => useTalkXTemplates(), { wrapper: wrapper() });
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    await expect(result.current.countVariantRecipients('v1')).rejects.toThrow(/permission denied/);
  });
});
