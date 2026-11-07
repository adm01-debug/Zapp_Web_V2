import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { TestQueryWrapper } from '@/test/mocks/queryClient';

/**
 * E83 — "Entrar via Código". O agente de fora do departamento resgata o
 * convite pela RPC canônica `accept_department_invite(p_code text)`: é a única
 * porta possível, porque `department_invitations` é admin-only por RLS
 * (`department_invitations_admin_all`) e um não-admin não lê o convite direto.
 *
 * A RPC responde `{ok:true, department_id}` ou `{ok:false, error}` com HTTP 200:
 * ler a recusa do CORPO é o que impede "código inválido" passar como sucesso. O
 * teste trava (a) o nome do parâmetro (`p_code`) e (b) a tradução de cada erro
 * tipado para a mensagem da tela — inclusive o código desconhecido, que não pode
 * virar sucesso silencioso nem `undefined`.
 */
const f = vi.hoisted(() => ({
  rpc: vi.fn((_name: string, _args?: Record<string, unknown>) =>
    Promise.resolve({ data: { ok: true, department_id: 'dep-1' } as unknown, error: null as unknown })),
  invalidateQueries: vi.fn(),
}));

vi.mock('@/integrations/supabase/client', () => ({
  supabase: { rpc: f.rpc },
}));

vi.mock('@tanstack/react-query', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@tanstack/react-query')>();
  return {
    ...actual,
    useQueryClient: () => ({ invalidateQueries: f.invalidateQueries }),
  };
});

import { useRedeemDepartmentInvite, REDEEM_INVITE_ERROR_MESSAGES } from '@/hooks/team-chat/useRedeemDepartmentInvite';

async function resgatar(code: string) {
  const { result } = renderHook(() => useRedeemDepartmentInvite(), { wrapper: TestQueryWrapper });
  return act(async () => result.current.mutateAsync({ code }));
}

describe('useRedeemDepartmentInvite — resgate do convite pela RPC canônica', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    f.rpc.mockResolvedValue({ data: { ok: true, department_id: 'dep-1' }, error: null });
  });

  it('chama accept_department_invite com p_code em maíusculas e sem espaços', async () => {
    await resgatar('  ab12cd34  ');

    expect(f.rpc).toHaveBeenCalledTimes(1);
    expect(f.rpc).toHaveBeenCalledWith('accept_department_invite', { p_code: 'AB12CD34' });
  });

  it('sucesso devolve o department_id e invalida o cache do inbox', async () => {
    const res = await resgatar('ab12cd34');

    expect(res).toEqual({ departmentId: 'dep-1' });
    expect(f.invalidateQueries).toHaveBeenCalledWith({ queryKey: ['team-conversations'] });
  });

  it('recusa da RPC ({ok:false}) NÃO passa como sucesso', async () => {
    f.rpc.mockResolvedValueOnce({ data: { ok: false, error: 'invalid_or_expired_code' }, error: null });

    await expect(resgatar('ab12cd34')).rejects.toThrow('Código inválido ou expirado');
  });

  it.each([
    ['invite_exhausted'],
    ['already_member'],
    ['not_authenticated'],
  ])('traduz o erro tipado %s para a mensagem da tela', async (erro) => {
    f.rpc.mockResolvedValueOnce({ data: { ok: false, error: erro }, error: null });

    await expect(resgatar('ab12cd34')).rejects.toThrow(REDEEM_INVITE_ERROR_MESSAGES[erro]);
  });

  it('erro desconhecido cai na mensagem genérica, não em sucesso nem undefined', async () => {
    f.rpc.mockResolvedValueOnce({ data: { ok: false, error: 'novo_erro_do_banco' }, error: null });

    await expect(resgatar('ab12cd34')).rejects.toThrow('Não foi possível entrar com este código');
  });

  it('erro de transporte do Supabase é propagado', async () => {
    f.rpc.mockResolvedValueOnce({ data: null, error: { message: 'boom' } });

    await expect(resgatar('ab12cd34')).rejects.toEqual({ message: 'boom' });
  });
});
