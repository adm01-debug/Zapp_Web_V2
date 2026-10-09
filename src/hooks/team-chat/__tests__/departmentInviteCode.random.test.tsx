import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { TestQueryWrapper } from '@/test/mocks/queryClient';

/**
 * O codigo do convite de departamento e uma credencial: quem digita o codigo entra
 * no departamento. No contrato APOSENTADO ele era sorteado no CLIENTE com
 * `Math.random()` (PRNG previsivel) e gravado por INSERT direto em
 * `department_invites`, com a auditoria escrita pelo proprio cliente.
 *
 * No contrato ATUAL quem gera o codigo e o SERVIDOR: a RPC
 * `create_department_invite(p_department_id, p_max_uses, p_expires_hours)`
 * (migration 20260928520000) sorteia com `gen_random_bytes(9)`, grava
 * `department_invitations` e a auditoria `create_invite` na MESMA transacao
 * (SECURITY DEFINER) e devolve `{ok, invite_id, code}`. O INSERT direto em
 * `department_audit_logs` e REVOGADO para `authenticated` (20260928530000), entao
 * nao ha mais nada para o cliente gravar.
 *
 * Estes testes pinam esse contrato: o codigo que o hook devolve e EXATAMENTE o que a
 * RPC devolveu (nao existe sorteio local), o cliente nao escreve em tabela nenhuma e
 * o parametros da chamada sao os da assinatura real do banco.
 */
const f = vi.hoisted(() => ({
  rpc: vi.fn(),
  tabelas: [] as string[],
  inserts: [] as Array<{ table: string; payload: Record<string, unknown> }>,
}));

vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    auth: { getUser: () => Promise.resolve({ data: { user: { id: 'u1' } } }) },
    rpc: f.rpc,
    from: (table: string) => {
      f.tabelas.push(table);
      return {
        insert: (payload: Record<string, unknown>) => {
          f.inserts.push({ table, payload });
          return Promise.resolve({ error: null });
        },
        update: () => ({ eq: () => ({ select: () => Promise.resolve({ data: [], error: null }) }) }),
        delete: () => ({ eq: () => Promise.resolve({ error: null }) }),
      };
    },
  },
}));

import { useCreateDepartmentInvite } from '@/hooks/team-chat/useDepartmentManagement';

/** Codigo que so pode ter vindo da RPC: nenhum PRNG local o produziria. */
const CODIGO_DO_SERVIDOR = 'ZX9Y8W7V';

function criarConvite() {
  const { result } = renderHook(() => useCreateDepartmentInvite('dep-1'), {
    wrapper: TestQueryWrapper,
  });
  return result;
}

describe('useCreateDepartmentInvite — codigo do convite vem da RPC (nao do cliente)', () => {
  beforeEach(() => {
    f.rpc.mockReset();
    f.tabelas.length = 0;
    f.inserts.length = 0;
    vi.restoreAllMocks();
  });

  it('devolve o codigo que a RPC gerou, sem sortear nada no cliente', async () => {
    f.rpc.mockResolvedValue({
      data: { ok: true, invite_id: 'inv-9', code: CODIGO_DO_SERVIDOR },
      error: null,
    });
    const sorteioNoCliente = vi.spyOn(globalThis.crypto, 'getRandomValues');

    const result = criarConvite();
    await act(async () => {
      await expect(result.current.mutateAsync('Ana')).resolves.toEqual({
        ok: true,
        invite_id: 'inv-9',
        code: CODIGO_DO_SERVIDOR,
      });
    });

    // A RPC e a fonte do codigo, e e chamada com a assinatura real do banco.
    expect(f.rpc).toHaveBeenCalledTimes(1);
    expect(f.rpc).toHaveBeenCalledWith('create_department_invite', {
      p_department_id: 'dep-1',
      p_max_uses: 1,
      p_expires_hours: 168,
    });
    // Um codigo sorteado no cliente nunca seria este; o gerador local nao foi usado.
    expect(sorteioNoCliente).not.toHaveBeenCalled();
  });

  it('nao escreve em tabela nenhuma: nem department_invites nem a auditoria do cliente', async () => {
    f.rpc.mockResolvedValue({
      data: { ok: true, invite_id: 'inv-9', code: CODIGO_DO_SERVIDOR },
      error: null,
    });

    const result = criarConvite();
    await act(async () => {
      await result.current.mutateAsync('Ana');
    });

    // `department_invitations` e a auditoria `create_invite` sao gravadas pela RPC
    // (SECURITY DEFINER) na mesma transacao: o cliente nao toca tabela alguma.
    expect(f.tabelas).toEqual([]);
    expect(f.inserts).toEqual([]);
    expect(f.tabelas).not.toContain('department_invites');
    expect(f.tabelas).not.toContain('department_audit_logs');
  });

  it('RPC sem codigo no retorno e erro: o cliente nunca inventa o codigo', async () => {
    // `ok: true` com `invite_id`, mas sem `code` — a RPC respondeu "criado" e o
    // codigo nao veio. Sem credencial nao ha convite: nao pode virar sucesso.
    f.rpc.mockResolvedValue({ data: { ok: true, invite_id: 'inv-9' }, error: null });

    const result = criarConvite();
    await act(async () => {
      await expect(result.current.mutateAsync('Ana')).rejects.toThrow(
        'create_department_invite_failed',
      );
    });

    expect(f.rpc).toHaveBeenCalledTimes(1);
  });
});
