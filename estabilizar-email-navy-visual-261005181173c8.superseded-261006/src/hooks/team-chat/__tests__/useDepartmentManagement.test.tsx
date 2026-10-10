import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * Regressão: a RPC `get_department_whatsapp_credentials` declara o parâmetro como
 * `p_department_id` (migrations e157/20260928550000). Chamar com `_department_id`
 * faz o PostgREST responder PGRST202 (função inexistente com esses argumentos) e a
 * tela de WhatsApp do departamento nunca carrega as credenciais.
 */
const f = vi.hoisted(() => ({
  rpc: vi.fn(() => Promise.resolve({ data: { whatsapp_mode: 'none' }, error: null })),
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
    expect(f.rpc).toHaveBeenCalledWith('get_department_whatsapp_credentials', {
      p_department_id: 'dep-1',
    });
  });
});
