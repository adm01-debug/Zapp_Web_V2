import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * Contrato atual da RPC de configuracao WhatsApp do departamento (F77/SL-069).
 *
 * A RPC viva para o front autenticado e `get_department_whatsapp_config(p_department_id)`.
 * Ela devolve uma tabela sem segredo: `{ mode, instance_id, has_api_key }`. O hook
 * mapeia esse formato para o contrato consumido pela tela, mantendo `evolution_url`
 * como espelho legado de `instance_id` ate o cartao de tela trocar o campo.
 */
const f = vi.hoisted(() => {
  const payload: unknown = [{
    mode: 'evolution',
    instance_id: 'inst-1',
    has_api_key: true,
  }];
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

  it('chama a RPC atual com p_department_id (assinatura real do banco)', async () => {
    await runQuery();
    expect(f.rpc).toHaveBeenCalledWith('get_department_whatsapp_config', {
      p_department_id: 'dep-1',
    });
  });

  it('mapeia a tabela atual para o tipo declarado do hook', async () => {
    const out = await runQuery();
    expect(out).toEqual({
      mode: 'evolution',
      instance_id: 'inst-1',
      has_api_key: true,
      evolution_url: 'inst-1',
    });
  });

  it('normaliza modo fora do enum para "none" (não vaza valor cru)', async () => {
    f.rpc.mockResolvedValueOnce({ data: [{ mode: 'inventado' }], error: null });
    const out = await runQuery();
    expect(out).toEqual(expect.objectContaining({ mode: 'none' }));
  });

  it('sem linha de departamento (null) devolve o default "none"', async () => {
    f.rpc.mockResolvedValueOnce({ data: null, error: null });
    const out = await runQuery();
    expect(out).toEqual({ mode: 'none', instance_id: null, has_api_key: false, evolution_url: null });
  });

  // Intencao de QA5-09 preservada no contrato atual: o hook entrega ao formulario
  // so campos conhecidos. Uma chave que (por engano ou ataque) venha no payload da RPC
  // nunca vira campo de credencial nem aparece na saida.
  it('uma chave devolvida no payload nunca vira campo de credencial', async () => {
    f.rpc.mockResolvedValueOnce({
      data: [{
        mode: 'evolution',
        instance_id: 'inst-1',
        has_api_key: true,
        api_key: 'chave-secreta',
        whatsapp_api_key: 'chave-secreta',
      }],
      error: null,
    });
    const out = (await runQuery()) as Record<string, unknown>;
    expect(Object.keys(out).sort()).toEqual(['evolution_url', 'has_api_key', 'instance_id', 'mode']);
    expect(JSON.stringify(out)).not.toContain('chave-secreta');
  });
});
