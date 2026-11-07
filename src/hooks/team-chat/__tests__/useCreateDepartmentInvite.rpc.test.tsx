import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { TestQueryWrapper } from '@/test/mocks/queryClient';

/**
 * O convite nasce no banco: `create_department_invite` sorteia o codigo e grava em
 * `department_invitations`, a MESMA tabela que `accept_department_invite` le. O
 * front nao sorteia codigo, nao grava tabela de convite nem auditoria direto.
 */
const f = vi.hoisted(() => ({
  rpcs: [] as Array<{ nome: string; args: unknown }>,
  tabelas: [] as string[],
  resposta: { data: { ok: true, invite_id: 'inv-1', code: 'ABCD1234' } as unknown, error: null as unknown },
}));

vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    auth: { getUser: () => Promise.resolve({ data: { user: { id: 'u1' } } }) },
    rpc: (nome: string, args: unknown) => {
      f.rpcs.push({ nome, args });
      return Promise.resolve(f.resposta);
    },
    from: (table: string) => {
      f.tabelas.push(table);
      return { insert: () => Promise.resolve({ error: null }) };
    },
  },
}));

import { useCreateDepartmentInvite } from '@/hooks/team-chat/useDepartmentManagement';

function montar() {
  return renderHook(() => useCreateDepartmentInvite('dep-1'), { wrapper: TestQueryWrapper });
}

describe('useCreateDepartmentInvite — convite criado pela RPC do banco', () => {
  beforeEach(() => {
    f.rpcs.length = 0;
    f.tabelas.length = 0;
    f.resposta = { data: { ok: true, invite_id: 'inv-1', code: 'ABCD1234' }, error: null };
  });

  it('chama create_department_invite com o departamento, 1 uso e 7 dias', async () => {
    const { result } = montar();
    await act(async () => {
      await result.current.mutateAsync('Ana');
    });

    expect(f.rpcs).toEqual([
      { nome: 'create_department_invite', args: { p_department_id: 'dep-1', p_max_uses: 1, p_expires_hours: 168 } },
    ]);
  });

  it('nao grava convite nem auditoria direto em tabela', async () => {
    const { result } = montar();
    await act(async () => {
      await result.current.mutateAsync('Ana');
    });

    expect(f.tabelas).toEqual([]);
  });

  it('recusa da RPC ({ok:false}) vira erro na mutacao', async () => {
    f.resposta = { data: { ok: false, error: 'not_authorized' }, error: null };
    const { result } = montar();

    await expect(
      act(async () => {
        await result.current.mutateAsync('Ana');
      }),
    ).rejects.toThrow('not_authorized');
  });
});
