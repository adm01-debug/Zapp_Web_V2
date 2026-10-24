import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * Contrato da RPC de segredos do departamento (familia TC-015, item 59).
 *
 * A RPC `get_department_whatsapp_credentials(p_department_id)` devolve jsonb com as
 * chaves REAIS do banco: `whatsapp_mode`, `whatsapp_api_key` e `whatsapp_instance_id`
 * (migration 20260928550000 + 20261003272707, confirmado na funcao viva da producao).
 * O hook declara `DepartmentWhatsAppCredentials` com `mode`; devolver o payload cru
 * sem mapear deixa `credentials.mode` indefinido, entao a tela de WhatsApp do
 * departamento nunca carrega o modo salvo — implementacao que NAO corresponde ao
 * contrato atual.
 *
 * As implementacoes exclusivas da branch em quarentena (claude/confident-babbage-ivgmmn)
 * chamavam a RPC com `_department_id` (assinatura errada) e declaravam
 * `{mode, instance_id, has_api_key}`; importar os arquivos em bloco reintroduziria o
 * defeito. Estes testes pinam o contrato vivo (parametro + formato de retorno).
 */
const f = vi.hoisted(() => {
  const payload: unknown = {
    whatsapp_mode: 'evolution',
    whatsapp_api_key: 'chave',
    whatsapp_instance_id: 'inst-1',
  };
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

describe('useDepartmentWhatsAppCredentials — contrato da RPC de segredos', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    f.captured = undefined;
  });

  it('chama a RPC com p_department_id (assinatura real do banco)', async () => {
    await runQuery();
    expect(f.rpc).toHaveBeenCalledWith('get_department_whatsapp_credentials', {
      p_department_id: 'dep-1',
    });
  });

  it('mapeia o jsonb real (whatsapp_mode) para o tipo declarado do hook', async () => {
    const out = await runQuery();
    expect(out).toEqual(expect.objectContaining({ mode: 'evolution' }));
  });

  it('normaliza modo fora do enum para "none" (não vaza valor cru)', async () => {
    f.rpc.mockResolvedValueOnce({ data: { whatsapp_mode: 'inventado' }, error: null });
    const out = await runQuery();
    expect(out).toEqual(expect.objectContaining({ mode: 'none' }));
  });

  it('sem linha de departamento (null) devolve o default "none"', async () => {
    f.rpc.mockResolvedValueOnce({ data: null, error: null });
    const out = await runQuery();
    expect(out).toEqual({ mode: 'none', evolution_url: null });
  });
});
