import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * Contrato da RPC de configuracao de WhatsApp do departamento (familia TC-015, item 59).
 *
 * A RPC `get_department_whatsapp_config(p_department_id)` (migration 20261006213734, F10)
 * devolve a TABELA `(mode, instance_id, has_api_key)` e e exclusiva de admin/supervisor;
 * a chave nunca aparece no retorno. A RPC antiga `get_department_whatsapp_credentials`
 * (20260928550000) e service_role-only e devolvia `access_denied` para `authenticated` —
 * era ela que impedia a aba WhatsApp do departamento de carregar o modo salvo.
 *
 * O hook declara `DepartmentWhatsAppCredentials` com `mode`; devolver o payload cru sem
 * mapear deixaria `credentials.mode` indefinido. Estes testes pinam o contrato vivo
 * (nome da RPC, parametro e formato de retorno).
 */
const f = vi.hoisted(() => {
  const payload: unknown = [{ mode: 'evolution', instance_id: 'inst-1', has_api_key: true }];
  return {
    rpc: vi.fn(() => Promise.resolve({ data: payload, error: null as unknown })),
    captured: undefined as undefined | { queryFn: () => Promise<unknown> },
  };
});

vi.mock('@/integrations/supabase/client', () => ({
  supabase: { rpc: f.rpc },
}));

vi.mock('@tanstack/react-query', () => ({
  useQuery: (config: { queryFn: () => Promise<unknown> }) => {
    f.captured = config;
    return { data: undefined, isLoading: true };
  },
  useQueryClient: () => ({ invalidateQueries: vi.fn() }),
  useMutation: () => ({ mutate: vi.fn(), mutateAsync: vi.fn() }),
}));

import { useDepartmentWhatsAppCredentials } from '@/hooks/team-chat/useDepartmentManagement';

async function runQuery(): Promise<unknown> {
  renderHook(() => useDepartmentWhatsAppCredentials('dep-1'));
  let out: unknown;
  await act(async () => {
    out = await f.captured?.queryFn();
  });
  return out;
}

describe('useDepartmentWhatsAppCredentials — contrato da RPC de configuracao', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    f.captured = undefined;
  });

  it('chama get_department_whatsapp_config com p_department_id (assinatura real do banco)', async () => {
    await runQuery();
    expect(f.rpc).toHaveBeenCalledWith('get_department_whatsapp_config', {
      p_department_id: 'dep-1',
    });
  });

  it('nao chama mais a RPC antiga service_role-only', async () => {
    await runQuery();
    expect(f.rpc).not.toHaveBeenCalledWith('get_department_whatsapp_credentials', expect.anything());
  });

  it('mapeia a tabela real (mode) para o tipo declarado do hook', async () => {
    const out = await runQuery();
    expect(out).toEqual(expect.objectContaining({ mode: 'evolution', instance_id: 'inst-1', has_api_key: true }));
  });

  it('normaliza modo fora do enum para "none" (não vaza valor cru)', async () => {
    f.rpc.mockResolvedValueOnce({ data: [{ mode: 'inventado', instance_id: null, has_api_key: false }], error: null });
    const out = await runQuery();
    expect(out).toEqual(expect.objectContaining({ mode: 'none' }));
  });

  it('sem linha de departamento (null) devolve o default "none"', async () => {
    f.rpc.mockResolvedValueOnce({ data: null, error: null });
    const out = await runQuery();
    expect(out).toEqual({ mode: 'none', instance_id: null, has_api_key: false, evolution_url: null });
  });
});
