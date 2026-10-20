/**
 * Testes de `src/hooks/evolution/useEvolutionGroups.ts`.
 *
 * Escopo: SÓ teste novo. Nenhuma linha de produção foi alterada.
 *
 * Como se prova aqui: o hook é um adaptador; os testes montam o hook com o
 * `useEvolutionApiCore` REAL e dublam só a FRONTEIRA de rede
 * (`supabase.functions.invoke`), que é o que o roteador da edge function
 * (`supabase/functions/evolution-api/index.ts:883-897`) recebe de verdade:
 * `evolution-api/<action>` + `{ method: 'POST', body }` com `groupJid`,
 * `subject`, `description`, `participants`, `action`, `inviteCode`, `image`
 * e `expiration` — as chaves que o roteador lê em cada branch.
 */
import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const h = vi.hoisted(() => ({
  invoke: vi.fn(),
  toast: { success: vi.fn(), error: vi.fn(), info: vi.fn() },
}));

vi.mock('@/integrations/supabase/client', () => ({
  supabase: { functions: { invoke: h.invoke } },
}));
vi.mock('sonner', () => ({ toast: h.toast }));
vi.mock('@/lib/logger', () => ({
  log: { error: vi.fn(), warn: vi.fn(), info: vi.fn(), debug: vi.fn() },
}));

import { useEvolutionApiCore } from '@/hooks/evolution/useEvolutionApiCore';
import { useEvolutionGroups } from '@/hooks/evolution/useEvolutionGroups';

type Api = ReturnType<typeof useEvolutionGroups>;

function renderGroups() {
  return renderHook(() => {
    const core = useEvolutionApiCore();
    return useEvolutionGroups(core.callApi, core.withToast);
  });
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((res) => {
    resolve = res;
  });
  return { promise, resolve };
}

/** Erro devolvido pelo supabase-js quando a edge function responde não-2xx. */
function functionsHttpError(message: string, status: number) {
  return Object.assign(new Error('Edge Function returned a non-2xx status code'), {
    name: 'FunctionsHttpError',
    context: new Response(JSON.stringify({ error: true, message }), {
      status,
      headers: { 'Content-Type': 'application/json' },
    }),
  });
}

const instanceName = 'zap-01';
const groupJid = '120363000000000000@g.us';
const participants = ['5511999999999@s.whatsapp.net', '5511888888888@s.whatsapp.net'];
const inviteCode = 'ABC123Invite';

type Row = {
  name: string;
  action: string;
  body: Record<string, unknown>;
  /** Mensagem do toast de sucesso; ausente = `callApi` direto (sem toast). */
  success?: string;
  run: (api: Api) => Promise<unknown>;
};

const CASES: Row[] = [
  { name: 'createGroup', action: 'create-group', body: { instanceName, subject: 'Vendas', description: 'Equipe de vendas', participants }, success: 'Grupo criado', run: (a) => a.createGroup(instanceName, 'Vendas', 'Equipe de vendas', participants) },
  { name: 'listGroups', action: 'list-groups', body: { instanceName }, run: (a) => a.listGroups(instanceName) },
  { name: 'getGroupInfo', action: 'group-info', body: { instanceName, groupJid }, run: (a) => a.getGroupInfo(instanceName, groupJid) },
  { name: 'getGroupParticipants', action: 'group-participants', body: { instanceName, groupJid }, run: (a) => a.getGroupParticipants(instanceName, groupJid) },
  { name: 'updateGroupName', action: 'update-group-name', body: { instanceName, groupJid, subject: 'Vendas 2026' }, success: 'Nome do grupo atualizado', run: (a) => a.updateGroupName(instanceName, groupJid, 'Vendas 2026') },
  { name: 'updateGroupDescription', action: 'update-group-description', body: { instanceName, groupJid, description: 'Time comercial' }, success: 'Descrição atualizada', run: (a) => a.updateGroupDescription(instanceName, groupJid, 'Time comercial') },
  { name: 'updateGroupParticipants(add)', action: 'update-participants', body: { instanceName, groupJid, action: 'add', participants }, success: 'Participantes atualizados', run: (a) => a.updateGroupParticipants(instanceName, groupJid, 'add', participants) },
  { name: 'updateGroupParticipants(remove)', action: 'update-participants', body: { instanceName, groupJid, action: 'remove', participants: [participants[0]] }, success: 'Participantes atualizados', run: (a) => a.updateGroupParticipants(instanceName, groupJid, 'remove', [participants[0]]) },
  { name: 'updateGroupParticipants(promote)', action: 'update-participants', body: { instanceName, groupJid, action: 'promote', participants: [participants[1]] }, success: 'Participantes atualizados', run: (a) => a.updateGroupParticipants(instanceName, groupJid, 'promote', [participants[1]]) },
  { name: 'updateGroupParticipants(demote)', action: 'update-participants', body: { instanceName, groupJid, action: 'demote', participants: [participants[1]] }, success: 'Participantes atualizados', run: (a) => a.updateGroupParticipants(instanceName, groupJid, 'demote', [participants[1]]) },
  { name: 'updateGroupSetting(announcement)', action: 'update-group-setting', body: { instanceName, groupJid, action: 'announcement' }, success: 'Configuração atualizada', run: (a) => a.updateGroupSetting(instanceName, groupJid, 'announcement') },
  { name: 'updateGroupSetting(not_announcement)', action: 'update-group-setting', body: { instanceName, groupJid, action: 'not_announcement' }, success: 'Configuração atualizada', run: (a) => a.updateGroupSetting(instanceName, groupJid, 'not_announcement') },
  { name: 'updateGroupSetting(locked)', action: 'update-group-setting', body: { instanceName, groupJid, action: 'locked' }, success: 'Configuração atualizada', run: (a) => a.updateGroupSetting(instanceName, groupJid, 'locked') },
  { name: 'updateGroupSetting(unlocked)', action: 'update-group-setting', body: { instanceName, groupJid, action: 'unlocked' }, success: 'Configuração atualizada', run: (a) => a.updateGroupSetting(instanceName, groupJid, 'unlocked') },
  { name: 'getGroupInviteCode', action: 'group-invite-code', body: { instanceName, groupJid }, run: (a) => a.getGroupInviteCode(instanceName, groupJid) },
  { name: 'revokeGroupInviteCode', action: 'revoke-invite-code', body: { instanceName, groupJid }, success: 'Link revogado', run: (a) => a.revokeGroupInviteCode(instanceName, groupJid) },
  { name: 'getInviteInfo', action: 'invite-info', body: { instanceName, inviteCode }, run: (a) => a.getInviteInfo(instanceName, inviteCode) },
  { name: 'acceptInvite', action: 'accept-invite', body: { instanceName, inviteCode }, success: 'Entrou no grupo', run: (a) => a.acceptInvite(instanceName, inviteCode) },
  { name: 'leaveGroup', action: 'leave-group', body: { instanceName, groupJid }, success: 'Saiu do grupo', run: (a) => a.leaveGroup(instanceName, groupJid) },
  { name: 'updateGroupPicture', action: 'update-group-picture', body: { instanceName, groupJid, image: 'whatsapp-media/grupos/foto.png' }, success: 'Foto atualizada', run: (a) => a.updateGroupPicture(instanceName, groupJid, 'whatsapp-media/grupos/foto.png') },
  { name: 'toggleEphemeral(desligar)', action: 'toggle-ephemeral', body: { instanceName, groupJid, expiration: 0 }, run: (a) => a.toggleEphemeral(instanceName, groupJid, 0) },
  { name: 'toggleEphemeral(24h)', action: 'toggle-ephemeral', body: { instanceName, groupJid, expiration: 86400 }, run: (a) => a.toggleEphemeral(instanceName, groupJid, 86400) },
];

beforeEach(() => {
  vi.clearAllMocks();
  h.invoke.mockResolvedValue({ data: null, error: null });
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('mapeamento ação -> payload da edge function', () => {
  it.each(CASES)('$name envia $action com o corpo do roteador', async (row) => {
    const { result } = renderGroups();

    await act(async () => {
      await row.run(result.current);
    });

    expect(h.invoke).toHaveBeenCalledTimes(1);
    const [path, options] = h.invoke.mock.calls[0] as [string, { method: string; body: unknown }];
    expect(path).toBe(`evolution-api/${row.action}`);
    expect(options).toEqual({ method: 'POST', body: row.body });

    if (row.success) {
      expect(h.toast.success).toHaveBeenCalledWith(row.success);
    } else {
      expect(h.toast.success).not.toHaveBeenCalled();
    }
    expect(h.toast.error).not.toHaveBeenCalled();
  });

  it('expõe exatamente as funções do contrato (nada a mais, nada a menos)', () => {
    const { result } = renderGroups();

    expect(Object.keys(result.current).sort()).toEqual(
      [...new Set(CASES.map((row) => row.name.replace(/\(.*\)$/, '')))].sort(),
    );
  });
});

describe('leitura devolve o dado da edge function', () => {
  it('listGroups devolve a lista recebida sem reembalar', async () => {
    const groups = [{ id: groupJid, subject: 'Vendas' }];
    h.invoke.mockResolvedValue({ data: groups, error: null });
    const { result } = renderGroups();

    let out: unknown;
    await act(async () => {
      out = await result.current.listGroups(instanceName);
    });

    expect(out).toBe(groups);
  });

  it('getGroupInfo devolve o objeto do grupo', async () => {
    const info = { id: groupJid, subject: 'Vendas', size: 12 };
    h.invoke.mockResolvedValue({ data: info, error: null });
    const { result } = renderGroups();

    let out: unknown;
    await act(async () => {
      out = await result.current.getGroupInfo(instanceName, groupJid);
    });

    expect(out).toBe(info);
  });

  it('getGroupInviteCode devolve o código e NÃO avisa nada (leitura pura)', async () => {
    h.invoke.mockResolvedValue({ data: { inviteUrl: `https://chat.whatsapp.com/${inviteCode}` }, error: null });
    const { result } = renderGroups();

    let out: unknown;
    await act(async () => {
      out = await result.current.getGroupInviteCode(instanceName, groupJid);
    });

    expect(out).toEqual({ inviteUrl: `https://chat.whatsapp.com/${inviteCode}` });
    expect(h.toast.success).not.toHaveBeenCalled();
  });
});

describe('erros', () => {
  it('erro do corpo com HTTP 200 sobe com a mensagem do servidor e vira toast de erro', async () => {
    h.invoke.mockResolvedValue({
      data: { error: true, message: 'instance (instanceName) é obrigatório para esta ação.' },
      error: null,
    });
    const { result } = renderGroups();

    await act(async () => {
      await expect(result.current.createGroup(instanceName, 'Vendas', 'x', participants)).rejects.toThrow(
        'instance (instanceName) é obrigatório para esta ação.',
      );
    });

    expect(h.toast.error).toHaveBeenCalledWith('instance (instanceName) é obrigatório para esta ação.');
  });

  it('leitura com erro sobe a exceção sem toast (a tela mostra o estado de erro)', async () => {
    h.invoke.mockResolvedValue({
      data: { error: true, message: 'Sem permissão para listar grupos.' },
      error: null,
    });
    const { result } = renderGroups();

    await act(async () => {
      await expect(result.current.listGroups(instanceName)).rejects.toThrow('Sem permissão para listar grupos.');
    });

    expect(h.toast.error).not.toHaveBeenCalled();
    expect(h.toast.success).not.toHaveBeenCalled();
  });

  it('erro do corpo sem message cai no texto padrão da API Evolution (não sobe vazio)', async () => {
    h.invoke.mockResolvedValue({ data: { error: true }, error: null });
    const { result } = renderGroups();

    await act(async () => {
      await expect(result.current.getGroupInfo(instanceName, groupJid)).rejects.toThrow('Erro na API Evolution');
    });

    expect(h.toast.error).not.toHaveBeenCalled();
  });

  it('falha de rede em mutação com toast avisa o usuário e propaga', async () => {
    h.invoke.mockResolvedValue({ data: null, error: new Error('network down') });
    const { result } = renderGroups();

    await act(async () => {
      await expect(result.current.leaveGroup(instanceName, groupJid)).rejects.toThrow('network down');
    });

    expect(h.toast.error).toHaveBeenCalledWith('network down');
  });

  it.fails('403 da edge function mostra no toast a mensagem pt-BR do servidor, não o texto técnico do supabase-js', async () => {
    h.invoke.mockResolvedValue({
      data: null,
      error: functionsHttpError('Somente admin ou supervisor pode sair de um grupo.', 403),
    });
    const { result } = renderGroups();

    await act(async () => {
      await result.current.leaveGroup(instanceName, groupJid).catch(() => undefined);
    });

    expect(h.toast.error).toHaveBeenCalledWith('Somente admin ou supervisor pode sair de um grupo.');
  });
});

describe('concorrência: dedupe só em leitura (method GET)', () => {
  it('duas listagens iguais em voo viram UMA viagem e recebem o mesmo resultado', async () => {
    const gate = deferred<{ data: unknown; error: unknown }>();
    h.invoke.mockReturnValueOnce(gate.promise);
    const { result } = renderGroups();

    let p1!: Promise<unknown>;
    let p2!: Promise<unknown>;
    await act(async () => {
      p1 = result.current.listGroups(instanceName);
      p2 = result.current.listGroups(instanceName);
    });

    expect(h.invoke).toHaveBeenCalledTimes(1);

    const groups = [{ id: groupJid }];
    let r1: unknown;
    let r2: unknown;
    await act(async () => {
      gate.resolve({ data: groups, error: null });
      [r1, r2] = await Promise.all([p1, p2]);
    });

    expect(r1).toBe(groups);
    expect(r2).toBe(groups);
    expect(h.invoke).toHaveBeenCalledTimes(1);
  });

  it('a chave é liberada ao terminar: a próxima listagem igual invoca de novo', async () => {
    const { result } = renderGroups();

    await act(async () => {
      await result.current.listGroups(instanceName);
      await result.current.listGroups(instanceName);
    });

    expect(h.invoke).toHaveBeenCalledTimes(2);
  });

  it('leitura que FALHA libera a chave: o segundo pedido faz viagem nova', async () => {
    h.invoke
      .mockResolvedValueOnce({ data: null, error: new Error('rede caiu') })
      .mockResolvedValueOnce({ data: [{ id: groupJid }], error: null });
    const { result } = renderGroups();

    await act(async () => {
      await expect(result.current.listGroups(instanceName)).rejects.toThrow('rede caiu');
      await expect(result.current.listGroups(instanceName)).resolves.toEqual([{ id: groupJid }]);
    });

    expect(h.invoke).toHaveBeenCalledTimes(2);
  });

  it('mutação (POST) nunca deduplica: o mesmo acceptInvite em voo vira duas viagens', async () => {
    const gate = deferred<{ data: unknown; error: unknown }>();
    h.invoke.mockReturnValueOnce(gate.promise).mockReturnValueOnce(gate.promise);
    const { result } = renderGroups();

    let p1!: Promise<unknown>;
    let p2!: Promise<unknown>;
    await act(async () => {
      p1 = result.current.acceptInvite(instanceName, inviteCode);
      p2 = result.current.acceptInvite(instanceName, inviteCode);
    });

    expect(h.invoke).toHaveBeenCalledTimes(2);

    await act(async () => {
      gate.resolve({ data: null, error: null });
      await Promise.all([p1, p2]);
    });
  });
});

describe('limites e dado malformado', () => {
  it('grupo sem participantes é repassado como veio (o hook não valida a lista)', async () => {
    const { result } = renderGroups();

    await act(async () => {
      await result.current.createGroup(instanceName, 'Vazio', '', []);
    });

    expect((h.invoke.mock.calls[0][1] as { body: unknown }).body).toEqual({
      instanceName,
      subject: 'Vazio',
      description: '',
      participants: [],
    });
  });

  it('JID malformado é repassado sem validação local (quem recusa é a API)', async () => {
    const { result } = renderGroups();

    await act(async () => {
      await result.current.getGroupInfo(instanceName, 'sem-arroba');
    });

    expect((h.invoke.mock.calls[0][1] as { body: Record<string, unknown> }).body.groupJid).toBe('sem-arroba');
  });

  it('payload vazio (data null) resolve null, sem lançar', async () => {
    const { result } = renderGroups();

    let out: unknown = 'sentinela';
    await act(async () => {
      out = await result.current.getGroupParticipants(instanceName, groupJid);
    });

    expect(out).toBeNull();
  });
});
