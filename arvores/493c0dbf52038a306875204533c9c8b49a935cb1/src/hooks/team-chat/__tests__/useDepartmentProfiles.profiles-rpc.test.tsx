import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * Regressão (cartão #240-B): `useDepartmentProfiles` lia a tabela `profiles`
 * diretamente porque a RPC segura `get_team_profiles` ainda não devolvia
 * `department_id`. Com o contrato ampliado, a listagem de colegas volta a
 * passar pela RPC (SECURITY DEFINER, email/telefone mascarados para não-admin)
 * — o caminho de leitura do hook não pode conter `.from('profiles')` — e a
 * ordenação por nome acontece no cliente, porque a RPC não aceita ORDER BY.
 *
 * Os spies ficam em `globalThis` (não em `vi.hoisted`) para o arquivo rodar
 * igual nos dois runners do projeto: `bun test` e `vitest run`.
 */

type RpcRow = Record<string, unknown>;
interface CapturedQuery {
  queryKey: unknown[];
  queryFn: () => Promise<unknown>;
}
type Spy = ReturnType<typeof vi.fn>;
const G = globalThis as Record<string, unknown>;

vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    rpc: (...args: unknown[]) => (G.__rpc as (...a: unknown[]) => unknown)(...args),
    from: (...args: unknown[]) => (G.__from as (...a: unknown[]) => unknown)(...args),
  },
}));

vi.mock('@tanstack/react-query', () => ({
  useQuery: (config: unknown) => {
    G.__captured = config;
    return { data: undefined, isLoading: true };
  },
  useQueryClient: () => ({ invalidateQueries: () => undefined }),
  useMutation: () => ({ mutate: () => undefined, mutateAsync: () => undefined }),
}));

import { useDepartmentProfiles, type DepartmentProfile } from '@/hooks/team-chat/useDepartmentManagement';

// Linhas fora de ordem alfabética: provam que a ordenação é do cliente.
const ROWS: RpcRow[] = [
  {
    id: 'p-2', user_id: 'u-2', name: 'Bruno', email: null, avatar_url: null,
    role: 'agent', is_active: true, department: 'Vendas', department_id: 'dep-2',
    job_title: null, phone: null, max_chats: 5, created_at: '2026-01-01',
  },
  {
    id: 'p-1', user_id: 'u-1', name: 'Ana', email: 'ana@empresa.test', avatar_url: 'a.png',
    role: 'admin', is_active: true, department: null, department_id: null,
    job_title: 'Gerente', phone: null, max_chats: 10, created_at: '2026-01-02',
  },
];

function useCapturedQuery(): CapturedQuery {
  useDepartmentProfiles();
  const captured = G.__captured as CapturedQuery | undefined;
  if (!captured) throw new Error('useQuery não foi chamado pelo hook');
  return captured;
}

describe('useDepartmentProfiles — leitura via RPC get_team_profiles', () => {
  beforeEach(() => {
    G.__captured = undefined;
    G.__rpc = vi.fn(() => Promise.resolve({ data: ROWS, error: null }));
    G.__from = vi.fn(() => {
      throw new Error('leitura direta de tabela é proibida neste caminho');
    });
  });

  it('chama get_team_profiles e nunca abre .from() na leitura', async () => {
    const rows = await useCapturedQuery().queryFn();
    expect(G.__rpc).toHaveBeenCalledTimes(1);
    expect(G.__rpc).toHaveBeenCalledWith('get_team_profiles');
    expect(G.__from).not.toHaveBeenCalled();
    expect(Array.isArray(rows)).toBe(true);
  });

  it('mantém a queryKey que as mutações de membros invalidam', () => {
    expect(useCapturedQuery().queryKey).toEqual(['departmentChat', 'profiles']);
  });

  it('entrega DepartmentProfile com is_active e department_id, ordenado por nome no cliente', async () => {
    const rows = (await useCapturedQuery().queryFn()) as DepartmentProfile[];
    expect(rows.map((r) => r.name)).toEqual(['Ana', 'Bruno']);
    const ana = rows.find((r) => r.name === 'Ana');
    const bruno = rows.find((r) => r.name === 'Bruno');
    expect(ana?.is_active).toBe(true);
    expect(ana?.department_id).toBeNull();
    expect(bruno?.department_id).toBe('dep-2');
    expect(bruno?.email).toBeNull();
  });

  it('propaga o erro da RPC', async () => {
    G.__rpc = vi.fn(() => Promise.resolve({ data: null, error: new Error('PGRST301') }));
    await expect(useCapturedQuery().queryFn()).rejects.toThrow('PGRST301');
  });
});
