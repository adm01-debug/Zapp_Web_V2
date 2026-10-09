import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * Regressão: a RPC do modo do WhatsApp declara o parâmetro como `p_department_id`
 * (migration 20261005111312). Chamar com `_department_id` faz o PostgREST responder
 * PGRST202 (função inexistente com esses argumentos) e a tela de WhatsApp do
 * departamento nunca carrega o modo salvo.
 *
 * Antes de QA5-09 o alvo era `get_department_whatsapp_credentials`; essa RPC e
 * service_role-only no banco (o usuario logado levava 42501) e devolve a chave da
 * API, entao o alvo passou a ser `get_department_whatsapp_mode` (texto puro).
 */
const f = vi.hoisted(() => {
  const builder = {
    upsert: vi.fn(() => Promise.resolve({ data: null, error: null })),
    insert: vi.fn(() => Promise.resolve({ data: null, error: null })),
  };
  return {
    // get_department_whatsapp_mode devolve TEXTO puro (QA5-09); o default fica no formato real.
    rpc: vi.fn((_name: string, _args?: Record<string, unknown>) =>
      Promise.resolve({ data: 'none' as unknown, error: null as unknown })),
    from: vi.fn(() => builder),
    builder,
    auth: { getUser: vi.fn(() => Promise.resolve({ data: { user: { id: 'auth-uid' } }, error: null })) },
    captured: undefined as undefined | { queryFn: () => Promise<unknown> },
    mutation: undefined as undefined | { mutationFn: (vars: unknown) => Promise<unknown> },
  };
});

vi.mock('@/integrations/supabase/client', () => ({
  supabase: { rpc: f.rpc, from: f.from, auth: f.auth },
}));

vi.mock('@tanstack/react-query', () => ({
  useQuery: (config: { queryFn: () => Promise<unknown> }) => {
    f.captured = config;
    return { data: undefined, isLoading: true };
  },
  useQueryClient: () => ({ invalidateQueries: vi.fn() }),
  useMutation: (config: { mutationFn: (vars: unknown) => Promise<unknown> }) => {
    f.mutation = config;
    return { mutate: vi.fn(), mutateAsync: vi.fn() };
  },
}));

import {
  useDepartmentWhatsAppCredentials,
  useSaveDepartmentWhatsApp,
} from '@/hooks/team-chat/useDepartmentManagement';

describe('useDepartmentWhatsAppCredentials — nome do parâmetro da RPC', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    f.captured = undefined;
  });

  it('chama a RPC com p_department_id (assinatura real do banco)', async () => {
    renderHook(() => useDepartmentWhatsAppCredentials('dep-1'));

    await act(async () => {
      await f.captured?.queryFn();
    });

    expect(f.rpc).toHaveBeenCalledTimes(1);
    expect(f.rpc).toHaveBeenCalledWith('get_department_whatsapp_mode', {
      p_department_id: 'dep-1',
    });
  });
});

/**
 * SL-144 — a gravação do WhatsApp de departamento acessava a tabela
 * `department_whatsapp_configs`, que NÃO existe: não está em supabase/schema-catalog.json
 * nem em nenhuma migration, e o upsert responde "relation does not exist" em runtime.
 * Era a única entrada do baseline do supabase-usage-guard
 * (scripts/db-audit/known-violations.json). O contrato de banco vigente (migration
 * 20261006213734, provado em scripts/db-audit/team-chat-department-whatsapp-safe-config.test.sh)
 * expõe `set_department_whatsapp_config(p_department_id, p_whatsapp_mode, p_api_key,
 * p_instance_id)`: grava as colunas de `departments`, autoriza por is_admin_or_supervisor e
 * audita `whatsapp_updated`. O hook tem de gravar por ela, nunca pela tabela.
 */
describe('useSaveDepartmentWhatsApp — gravação pela RPC canônica, sem acesso direto à tabela', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    f.mutation = undefined;
    f.rpc.mockResolvedValue({ data: { ok: true }, error: null });
  });

  async function runSave(vars: unknown): Promise<void> {
    renderHook(() => useSaveDepartmentWhatsApp('dep-1'));
    await act(async () => {
      await f.mutation?.mutationFn(vars);
    });
  }

  it('chama set_department_whatsapp_config e NAO toca department_whatsapp_configs', async () => {
    await runSave({ mode: 'official', config: { official_token: 'tok-1' }, actorName: 'Ana' });

    expect(f.from).not.toHaveBeenCalled();
    expect(f.rpc).toHaveBeenCalledWith('set_department_whatsapp_config', {
      p_department_id: 'dep-1',
      p_whatsapp_mode: 'official',
      p_api_key: 'tok-1',
    });
  });

  it('chave em branco nao envia p_api_key (a RPC mantem a chave ja gravada)', async () => {
    await runSave({ mode: 'evolution', config: { evolution_url: 'https://evo.exemplo.com' }, actorName: 'Ana' });

    expect(f.from).not.toHaveBeenCalled();
    const [name, args] = f.rpc.mock.calls[0] as [string, Record<string, unknown>];
    expect(name).toBe('set_department_whatsapp_config');
    expect(args.p_whatsapp_mode).toBe('evolution');
    expect(args.p_api_key).toBeUndefined();
  });

  it('evolution_api_key como string vazia nao envia p_api_key', async () => {
    await runSave({ mode: 'evolution', config: { evolution_api_key: '' }, actorName: 'Ana' });

    const [name, args] = f.rpc.mock.calls[0] as [string, Record<string, unknown>];
    expect(name).toBe('set_department_whatsapp_config');
    expect(args.p_api_key).toBeUndefined();
  });

  it('evolution_api_key com espacos em branco nao envia p_api_key', async () => {
    await runSave({ mode: 'evolution', config: { evolution_api_key: '  ' }, actorName: 'Ana' });

    const [name, args] = f.rpc.mock.calls[0] as [string, Record<string, unknown>];
    expect(name).toBe('set_department_whatsapp_config');
    expect(args.p_api_key).toBeUndefined();
  });

  it('official_token como string vazia nao envia p_api_key', async () => {
    await runSave({ mode: 'official', config: { official_token: '' }, actorName: 'Ana' });

    const [name, args] = f.rpc.mock.calls[0] as [string, Record<string, unknown>];
    expect(name).toBe('set_department_whatsapp_config');
    expect(args.p_api_key).toBeUndefined();
  });

  it('official_token com espacos em branco nao envia p_api_key', async () => {
    await runSave({ mode: 'official', config: { official_token: '  ' }, actorName: 'Ana' });

    const [name, args] = f.rpc.mock.calls[0] as [string, Record<string, unknown>];
    expect(name).toBe('set_department_whatsapp_config');
    expect(args.p_api_key).toBeUndefined();
  });

  it('recusa da RPC ({ok:false,error}) nao passa como sucesso', async () => {
    f.rpc.mockResolvedValueOnce({ data: { ok: false, error: 'not_authorized' }, error: null });

    await expect(runSave({ mode: 'none', config: {}, actorName: 'Ana' })).rejects.toThrow('not_authorized');
  });

  it('erro do Supabase e propagado', async () => {
    f.rpc.mockResolvedValueOnce({ data: null, error: { message: 'boom' } });

    await expect(runSave({ mode: 'none', config: {}, actorName: 'Ana' })).rejects.toEqual({ message: 'boom' });
  });
});
