import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { TestQueryWrapper } from '@/test/mocks/queryClient';

/**
 * O codigo do convite de departamento e uma credencial: quem digita o codigo
 * entra no departamento. Sorteado com `Math.random()` (PRNG previsivel) ele e
 * adivinhavel (#1528 trocou por `crypto.getRandomValues` no cliente).
 *
 * Contrato ATUAL (F76, migration 20260928520000): o codigo nasce no SERVIDOR.
 * A RPC `create_department_invite` gera o codigo com `gen_random_bytes` e grava
 * `department_invitations` + auditoria na mesma transacao; o cliente nao escolhe
 * nem sorteia o codigo e nao escreve mais em `department_invites` (tabela
 * aposentada, que a RPC `accept_department_invite` nem le). A propriedade que o
 * teste antigo protegia — codigo nao adivinhavel — passa a valer assim: o hook
 * nao tem fonte de aleatoriedade propria e devolve o codigo que a RPC criou.
 */
const f = vi.hoisted(() => ({
  inserts: [] as Array<{ table: string; payload: Record<string, unknown> }>,
  rpc: vi.fn(),
}));

vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    auth: { getUser: () => Promise.resolve({ data: { user: { id: 'u1' } } }) },
    rpc: f.rpc,
    from: (table: string) => ({
      insert: (payload: Record<string, unknown>) => {
        f.inserts.push({ table, payload });
        return Promise.resolve({ error: null });
      },
    }),
  },
}));

import { useCreateDepartmentInvite } from '@/hooks/team-chat/useDepartmentManagement';

async function criarConvite(departmentId = 'dep-1') {
  const { result } = renderHook(() => useCreateDepartmentInvite(departmentId), {
    wrapper: TestQueryWrapper,
  });

  let criado: Awaited<ReturnType<typeof result.current.mutateAsync>> | undefined;
  await act(async () => {
    criado = await result.current.mutateAsync('Ana');
  });
  return criado;
}

describe('useCreateDepartmentInvite — codigo do convite', () => {
  beforeEach(() => {
    f.inserts.length = 0;
    vi.clearAllMocks();
    f.rpc.mockResolvedValue({
      data: { ok: true, invite_id: 'inv-1', code: 'ZX9Y8W7VQ2AB' },
      error: null,
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('o codigo vem da RPC create_department_invite (gerado no servidor), sem sorteio no cliente', async () => {
    // O primeiro `act` do React consome um `Math.random()` proprio (nome de modulo do
    // enqueueTask): aquece antes de espiar, para o espiao enxergar so o que o hook faz.
    await act(async () => {});
    const aleatorioPrevisivel = vi.spyOn(Math, 'random');
    const aleatorioDoCliente = vi.spyOn(globalThis.crypto, 'getRandomValues');

    const criado = await criarConvite();

    expect(f.rpc).toHaveBeenCalledWith('create_department_invite', expect.objectContaining({ p_department_id: 'dep-1' }));
    expect(criado).toEqual({ ok: true, invite_id: 'inv-1', code: 'ZX9Y8W7VQ2AB' });
    // Nem o PRNG previsivel nem um sorteio proprio do hook: o codigo nao nasce aqui.
    expect(aleatorioPrevisivel).not.toHaveBeenCalled();
    expect(aleatorioDoCliente).not.toHaveBeenCalled();
  });

  it('nao grava em department_invites (aposentada) nem faz INSERT direto de convite', async () => {
    await criarConvite();

    expect(f.inserts.filter((insert) => insert.table === 'department_invites')).toEqual([]);
    expect(f.inserts.filter((insert) => insert.table === 'department_invitations')).toEqual([]);
  });

  it('dois convites seguidos devolvem cada um o seu codigo da RPC (nada e reaproveitado no cliente)', async () => {
    f.rpc
      .mockResolvedValueOnce({ data: { ok: true, invite_id: 'inv-1', code: 'AAAAAAAAAAAA' }, error: null })
      .mockResolvedValueOnce({ data: { ok: true, invite_id: 'inv-2', code: 'BBBBBBBBBBBB' }, error: null });

    const primeiro = await criarConvite();
    const segundo = await criarConvite();

    expect(primeiro?.code).toBe('AAAAAAAAAAAA');
    expect(segundo?.code).toBe('BBBBBBBBBBBB');
    expect(primeiro?.code).not.toBe(segundo?.code);
  });
});
