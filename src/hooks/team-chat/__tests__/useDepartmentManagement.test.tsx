import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { TestQueryWrapper } from '@/test/mocks/queryClient';

/**
 * Contrato ATUAL da gestao de departamento (F76/F77/F79 do plano Team Chat).
 *
 * O hook ainda falava o contrato antigo: lia/gravava/apagava `department_invites`
 * (tabela aposentada) e chamava `get_department_whatsapp_credentials`, que e
 * `service_role`-only — como `authenticated` a tela recebia `access_denied`.
 * As migrations ja expoem o contrato vivo:
 *   - `department_invitations` (status/use_count/max_uses) para ler e revogar;
 *   - RPC `create_department_invite(p_department_id, p_max_uses, p_expires_hours)`;
 *   - RPC `accept_department_invite(p_code)`, que devolve `ok:false` com motivo
 *     tipado (`invalid_or_expired_code`, `invite_exhausted`, `not_authenticated`);
 *   - RPC `get_department_whatsapp_config(p_department_id)` -> TABLE(mode,
 *     instance_id, has_api_key) e `set_department_whatsapp_config(...)`.
 *
 * Este teste chama os hooks REAIS (react-query real, fronteira Supabase dublada)
 * e falha com o contrato antigo: `useAcceptDepartmentInvite` nem existia.
 */

type Chamada = { alvo: string; op: string; args?: unknown };

const f = vi.hoisted(() => {
  const chamadas: Chamada[] = [];
  const respostas = new Map<string, { data: unknown; error: unknown }>();

  // Cadeia minima do PostgREST: registra a operacao e devolve a si mesma; ao ser
  // aguardada (`await`), resolve com a resposta registrada para a tabela.
  function tabela(nome: string) {
    const registra = (op: string, args?: unknown) => {
      chamadas.push({ alvo: nome, op, args });
    };
    const linha = () => respostas.get(nome) ?? { data: [{ id: 'inv-1' }], error: null };
    const no: Record<string, unknown> = {};
    no.select = (colunas?: unknown) => { registra('select', colunas); return no; };
    no.eq = (coluna: string, valor: unknown) => { registra('eq', { coluna, valor }); return no; };
    no.gt = (coluna: string, valor: unknown) => { registra('gt', { coluna, valor }); return no; };
    no.order = () => { registra('order'); return no; };
    no.limit = () => { registra('limit'); return no; };
    no.update = (payload: unknown) => { registra('update', payload); return no; };
    no.insert = (payload: unknown) => { registra('insert', payload); return no; };
    no.delete = () => { registra('delete'); return no; };
    no.then = (resolver: (valor: unknown) => unknown) => Promise.resolve(linha()).then(resolver);
    return no;
  }

  return { chamadas, respostas, tabela, rpc: vi.fn() };
});

vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    from: (nome: string) => f.tabela(nome),
    rpc: f.rpc,
    auth: { getUser: () => Promise.resolve({ data: { user: { id: 'user-1' } } }) },
  },
}));

import {
  useAcceptDepartmentInvite,
  useCreateDepartmentInvite,
  useDeleteDepartmentInvite,
  useDepartmentInvites,
  useDepartmentWhatsAppCredentials,
  useSaveDepartmentWhatsApp,
} from '@/hooks/team-chat/useDepartmentManagement';

function alvosTocados(): string[] {
  return f.chamadas.map((chamada) => chamada.alvo);
}

beforeEach(() => {
  f.chamadas.length = 0;
  f.respostas.clear();
  f.rpc.mockReset();
});

describe('useDepartmentInvites — leitura pela tabela atual', () => {
  it('consulta department_invitations (status pendente) e nunca department_invites', async () => {
    f.respostas.set('department_invitations', {
      data: [{ id: 'inv-1', department_id: 'dep-1', code: 'ABCD1234', expires_at: '2030-01-01T00:00:00Z', created_at: '2026-01-01T00:00:00Z', created_by: null, status: 'pending', use_count: 0, max_uses: 1 }],
      error: null,
    });

    const { result } = renderHook(() => useDepartmentInvites('dep-1'), { wrapper: TestQueryWrapper });

    await waitFor(() => expect(result.current.data).toHaveLength(1));

    expect(alvosTocados()).toContain('department_invitations');
    expect(alvosTocados()).not.toContain('department_invites');
    expect(f.chamadas).toContainEqual({ alvo: 'department_invitations', op: 'eq', args: { coluna: 'department_id', valor: 'dep-1' } });
    expect(f.chamadas).toContainEqual({ alvo: 'department_invitations', op: 'eq', args: { coluna: 'status', valor: 'pending' } });
  });
});

describe('useCreateDepartmentInvite — cria pela RPC, nao por INSERT direto', () => {
  it('chama create_department_invite e nao escreve em tabela nenhuma (auditoria e do banco)', async () => {
    f.rpc.mockResolvedValue({
      data: { ok: true, invite_id: 'inv-9', code: 'ZX9Y8W7V' },
      error: null,
    });

    const { result } = renderHook(() => useCreateDepartmentInvite('dep-1'), { wrapper: TestQueryWrapper });

    await act(async () => {
      await result.current.mutateAsync('Ana');
    });

    expect(f.rpc).toHaveBeenCalledWith('create_department_invite', {
      p_department_id: 'dep-1',
      p_max_uses: 1,
      p_expires_hours: 168,
    });
    expect(alvosTocados()).not.toContain('department_invites');
    expect(alvosTocados()).not.toContain('department_audit_logs');
  });

  it('ok:false da RPC vira erro (nao passa como convite criado)', async () => {
    f.rpc.mockResolvedValue({ data: { ok: false, error: 'not_authorized' }, error: null });

    const { result } = renderHook(() => useCreateDepartmentInvite('dep-1'), { wrapper: TestQueryWrapper });

    await act(async () => {
      await expect(result.current.mutateAsync('Ana')).rejects.toThrow('not_authorized');
    });
  });
});

describe('useDeleteDepartmentInvite — revoga, nao apaga a tabela aposentada', () => {
  it('marca status revoked em department_invitations', async () => {
    const { result } = renderHook(() => useDeleteDepartmentInvite('dep-1'), { wrapper: TestQueryWrapper });

    await act(async () => {
      await result.current.mutateAsync({ inviteId: 'inv-1', actorName: 'Ana' });
    });

    expect(f.chamadas).toContainEqual({ alvo: 'department_invitations', op: 'update', args: { status: 'revoked' } });
    expect(alvosTocados()).not.toContain('department_invites');
  });

  it('zero linhas afetadas (RLS filtrou) nao passa como sucesso', async () => {
    f.respostas.set('department_invitations', { data: [], error: null });

    const { result } = renderHook(() => useDeleteDepartmentInvite('dep-1'), { wrapper: TestQueryWrapper });

    await act(async () => {
      await expect(
        result.current.mutateAsync({ inviteId: 'inv-inexistente', actorName: 'Ana' }),
      ).rejects.toThrow();
    });
  });
});

describe('useAcceptDepartmentInvite — convite invalido, expirado ou esgotado', () => {
  it('codigo inexistente/expirado (invalid_or_expired_code) falha com o motivo tipado', async () => {
    f.rpc.mockResolvedValue({ data: { ok: false, error: 'invalid_or_expired_code' }, error: null });

    const { result } = renderHook(() => useAcceptDepartmentInvite(), { wrapper: TestQueryWrapper });

    await act(async () => {
      await expect(result.current.mutateAsync('NAOEXISTE')).rejects.toThrow('invalid_or_expired_code');
    });

    expect(f.rpc).toHaveBeenCalledWith('accept_department_invite', { p_code: 'NAOEXISTE' });
  });

  it('convite esgotado (use_count >= max_uses) falha com invite_exhausted', async () => {
    f.rpc.mockResolvedValue({ data: { ok: false, error: 'invite_exhausted' }, error: null });

    const { result } = renderHook(() => useAcceptDepartmentInvite(), { wrapper: TestQueryWrapper });

    await act(async () => {
      await expect(result.current.mutateAsync('USADO123')).rejects.toThrow('invite_exhausted');
    });
  });

  it('codigo valido entra no departamento e devolve o departamento da RPC', async () => {
    f.rpc.mockResolvedValue({ data: { ok: true, department_id: 'dep-7' }, error: null });

    const { result } = renderHook(() => useAcceptDepartmentInvite(), { wrapper: TestQueryWrapper });

    await act(async () => {
      await expect(result.current.mutateAsync('VALIDO12')).resolves.toEqual({
        ok: true,
        department_id: 'dep-7',
      });
    });
  });
});

describe('useDepartmentWhatsAppCredentials — RPC de leitura atual', () => {
  it('le por get_department_whatsapp_config (p_department_id) e mapeia mode/instance_id/has_api_key', async () => {
    f.rpc.mockResolvedValue({
      data: [{ mode: 'evolution', instance_id: 'inst-1', has_api_key: true }],
      error: null,
    });

    const { result } = renderHook(() => useDepartmentWhatsAppCredentials('dep-1'), { wrapper: TestQueryWrapper });

    await waitFor(() => expect(result.current.data).toBeTruthy());

    expect(f.rpc).toHaveBeenCalledWith('get_department_whatsapp_config', { p_department_id: 'dep-1' });
    expect(f.rpc).not.toHaveBeenCalledWith('get_department_whatsapp_credentials', expect.anything());
    // `evolution_url` e o campo legado do formulario atual: sem coluna de URL no banco,
    // ele espelha o `instance_id` que a RPC devolve (comentado no hook).
    expect(result.current.data).toEqual({
      mode: 'evolution',
      instance_id: 'inst-1',
      has_api_key: true,
      evolution_url: 'inst-1',
    });
  });
});


describe('useSaveDepartmentWhatsApp — RPC de gravação atual', () => {
  it('chama set_department_whatsapp_config com nulos presentes e nao escreve em tabelas legadas', async () => {
    f.rpc.mockResolvedValue({ data: { ok: true }, error: null });

    const { result } = renderHook(() => useSaveDepartmentWhatsApp('dep-1'), { wrapper: TestQueryWrapper });

    await act(async () => {
      await result.current.mutateAsync({
        mode: 'evolution',
        config: {},
        actorName: 'Ana',
      });
    });

    expect(f.rpc).toHaveBeenCalledWith('set_department_whatsapp_config', {
      p_department_id: 'dep-1',
      p_whatsapp_mode: 'evolution',
      p_api_key: null,
      p_instance_id: null,
    });
    expect(alvosTocados()).not.toContain('department_whatsapp_configs');
    expect(alvosTocados()).not.toContain('department_audit_logs');
  });

  it('ok:false da RPC vira erro (nao passa como configuracao salva)', async () => {
    f.rpc.mockResolvedValue({ data: { ok: false, error: 'not_authorized' }, error: null });

    const { result } = renderHook(() => useSaveDepartmentWhatsApp('dep-1'), { wrapper: TestQueryWrapper });

    await act(async () => {
      await expect(
        result.current.mutateAsync({
          mode: 'official',
          config: { official_token: 'token-1', instance_id: 'inst-1' },
          actorName: 'Ana',
        }),
      ).rejects.toThrow('not_authorized');
    });

    expect(f.rpc).toHaveBeenCalledWith('set_department_whatsapp_config', {
      p_department_id: 'dep-1',
      p_whatsapp_mode: 'official',
      p_api_key: 'token-1',
      p_instance_id: 'inst-1',
    });
    expect(alvosTocados()).not.toContain('department_whatsapp_configs');
    expect(alvosTocados()).not.toContain('department_audit_logs');
  });
});
