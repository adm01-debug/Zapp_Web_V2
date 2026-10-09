import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * Contrato da RPC de MODO do WhatsApp do departamento (QA5-09).
 *
 * A tela chamava `get_department_whatsapp_credentials` — service_role-only no
 * banco (REVOKE de PUBLIC/anon/authenticated), entao o usuario logado levava
 * 42501 e o modo salvo nunca carregava. Alem disso essa RPC devolve a chave da
 * API. A RPC nova, `get_department_whatsapp_mode(p_department_id)`, devolve
 * TEXTO puro ('none' | 'evolution' | 'official'): o tipo de retorno nao tem
 * campo de chave, entao nem um payload malicioso vira credencial no hook.
 * `evolution_url` segue sempre null (a RPC nao expoe URL).
 */
const f = vi.hoisted(() => ({
  rpc: vi.fn(() => Promise.resolve({ data: 'evolution' as unknown, error: null as unknown })),
  captured: undefined as undefined | { queryFn: () => Promise<unknown> },
}));

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

describe('useDepartmentWhatsAppCredentials — contrato da RPC de modo', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    f.captured = undefined;
  });

  it('chama a RPC nova com p_department_id (assinatura real do banco)', async () => {
    await runQuery();
    expect(f.rpc).toHaveBeenCalledWith('get_department_whatsapp_mode', {
      p_department_id: 'dep-1',
    });
  });

  it('mapeia o texto da RPC para o modo declarado do hook', async () => {
    const out = await runQuery();
    expect(out).toEqual({ mode: 'evolution', evolution_url: null });
  });

  it('normaliza modo fora do enum para "none" (não vaza valor cru)', async () => {
    f.rpc.mockResolvedValueOnce({ data: 'inventado', error: null });
    const out = await runQuery();
    expect(out).toEqual({ mode: 'none', evolution_url: null });
  });

  it('departamento inexistente (null) devolve o default "none"', async () => {
    f.rpc.mockResolvedValueOnce({ data: null, error: null });
    const out = await runQuery();
    expect(out).toEqual({ mode: 'none', evolution_url: null });
  });

  it('um texto de chave devolvido nunca vira campo de credencial', async () => {
    f.rpc.mockResolvedValueOnce({ data: 'chave-secreta', error: null });
    const out = (await runQuery()) as Record<string, unknown>;
    expect(Object.keys(out).sort()).toEqual(['evolution_url', 'mode']);
    expect(out).toEqual({ mode: 'none', evolution_url: null });
    expect(JSON.stringify(out)).not.toContain('chave-secreta');
  });
});
