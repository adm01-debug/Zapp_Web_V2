/**
 * Testes do adaptador de perfil/etiquetas/contatos/bloqueio da Evolution API.
 *
 * SL-075 E43: este contrato era de um hook de integrações que foi deletado; os
 * métodos que a Evolution GO suporta foram absorvidos por `useEvolutionApi`, e
 * é essa a superfície provada aqui.
 *
 * Como se prova aqui: o orquestrador é um adaptador — a interface que ele tem
 * com o resto do sistema é a FRONTEIRA de rede (`supabase.functions.invoke`),
 * que é o que o roteador da edge function
 * (`supabase/functions/evolution-api/index.ts`) recebe de verdade:
 * `evolution-api/<action>` + `{ method: 'POST', body }`.
 *
 * Os nomes de ação esperados são o contrato do roteador da edge function
 * (branch `action === '<nome>'`), não uma cópia do hook.
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
  createLogger: () => ({ error: vi.fn(), warn: vi.fn(), info: vi.fn(), debug: vi.fn() }),
}));

import { useEvolutionApi } from '@/hooks/integrations/useEvolutionApi';
import type { PrivacySettings } from '@/hooks/integrations/evolutionApi.types';

type Api = ReturnType<typeof useEvolutionApi>;

function renderApi() {
  return renderHook(() => useEvolutionApi());
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
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
const number = '5511999999999';

const privacy: PrivacySettings = { instanceName, readreceipts: 'all', online: 'match_last_seen' };

type Row = {
  name: string;
  action: string;
  body: Record<string, unknown>;
  /** Mensagem do toast de sucesso; ausente = função chamada por `callApi` direto (sem toast). */
  success?: string;
  run: (api: Api) => Promise<unknown>;
};

/**
 * Toda função exposta pelo hook, com o payload que ela TEM de mandar para a
 * edge function. `success` ausente = não passa por `withToast` (não avisa o
 * usuário) — a diferença é asserida, não presumida.
 *
 * SL-075 E43: os casos de integrações/infra sem equivalente na Evolution GO
 * (Chatwoot, Typebot, OpenAI, Dify, Flowise, Evolution Bot, RabbitMQ/SQS,
 * templates, offerCall, catálogo/coleções de negócio, proxy, EvoAI, N8N,
 * Kafka/Nats/Pusher, findChats/findMessages/findStatusMessages) saíram daqui
 * junto com o hook de integrações que foi deletado — não há
 * mais o que testar neles nesta função.
 */
const CASES: Row[] = [
  // Profile
  { name: 'fetchProfile', action: 'fetch-profile', body: { instanceName }, run: (a) => a.fetchProfile(instanceName) },
  { name: 'updateProfileName', action: 'update-profile-name', body: { instanceName, name: 'Loja Centro' }, success: 'Nome atualizado', run: (a) => a.updateProfileName(instanceName, 'Loja Centro') },
  { name: 'updateProfileStatus', action: 'update-profile-status', body: { instanceName, status: 'Vendendo hoje' }, success: 'Status atualizado', run: (a) => a.updateProfileStatus(instanceName, 'Vendendo hoje') },
  { name: 'updateProfilePicture', action: 'update-profile-picture', body: { instanceName, picture: 'https://cdn.exemplo/foto.png' }, success: 'Foto atualizada', run: (a) => a.updateProfilePicture(instanceName, 'https://cdn.exemplo/foto.png') },
  { name: 'removeProfilePicture', action: 'remove-profile-picture', body: { instanceName }, success: 'Foto removida', run: (a) => a.removeProfilePicture(instanceName) },
  { name: 'fetchProfilePicture', action: 'fetch-profile-picture', body: { instanceName, number }, run: (a) => a.fetchProfilePicture(instanceName, number) },
  { name: 'fetchBusinessProfile', action: 'fetch-business-profile', body: { instanceName, number }, run: (a) => a.fetchBusinessProfile(instanceName, number) },
  { name: 'updatePrivacySettings', action: 'update-privacy', body: { ...privacy }, success: 'Privacidade atualizada', run: (a) => a.updatePrivacySettings(privacy) },
  // Labels
  { name: 'findLabels', action: 'find-labels', body: { instanceName }, run: (a) => a.findLabels(instanceName) },
  { name: 'handleLabel', action: 'handle-label', body: { instanceName, number, labelId: 'lbl-1', action: 'add' }, run: (a) => a.handleLabel(instanceName, number, 'lbl-1', 'add') },
  // Chat management
  { name: 'findContacts', action: 'find-contacts', body: { instanceName, page: 1, offset: 0 }, run: (a) => a.findContacts(instanceName, 1, 0) },
  { name: 'checkWhatsAppNumbers', action: 'check-numbers', body: { instanceName, numbers: [number, '5511888888888'] }, run: (a) => a.checkWhatsAppNumbers(instanceName, [number, '5511888888888']) },
  { name: 'getMediaBase64', action: 'get-media-base64', body: { instanceName, message: { key: { id: 'msg-1' } }, convertToMp4: true }, run: (a) => a.getMediaBase64(instanceName, { key: { id: 'msg-1' } }, true) },
  // Block / unblock (duas mensagens distintas)
  { name: 'updateBlockStatus(block)', action: 'update-block-status', body: { instanceName, number, status: 'block' }, success: 'Contato bloqueado', run: (a) => a.updateBlockStatus(instanceName, number, 'block') },
  { name: 'updateBlockStatus(unblock)', action: 'update-block-status', body: { instanceName, number, status: 'unblock' }, success: 'Contato desbloqueado', run: (a) => a.updateBlockStatus(instanceName, number, 'unblock') },
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
    const { result } = renderApi();

    await act(async () => {
      await row.run(result.current);
    });

    expect(h.invoke).toHaveBeenCalledTimes(1);
    const [path, options] = h.invoke.mock.calls[0] as [string, { method: string; body: unknown }];
    expect(path).toBe(`evolution-api/${row.action}`);
    expect(options).toEqual({ method: 'POST', body: row.body });

    // Função de mutação avisa o usuário; leitura pura (`callApi` direto) não.
    if (row.success) {
      expect(h.toast.success).toHaveBeenCalledWith(row.success);
    } else {
      expect(h.toast.success).not.toHaveBeenCalled();
    }
    expect(h.toast.error).not.toHaveBeenCalled();
  });

  /**
   * Contrato do orquestrador (SL-075 E43): as funções absorvidas do antigo hook
   * de integrações — perfil, etiquetas, contatos e bloqueio — têm de estar
   * presentes e ser EXATAMENTE elas; e nada do que a Evolution GO não tem pode
   * ter sobrado exposto. O conjunto "recomposto" abaixo são as chaves que o
   * orquestrador apenas espalha dos sub-hooks (instância, mensagens, grupos) e
   * que, por isso, não fazem parte do contrato absorvido.
   */
  it('expõe exatamente as funções do contrato (nada a mais, nada a menos)', () => {
    const { result } = renderApi();
    const chaves = Object.keys(result.current);

    const contrato = Array.from(new Set(CASES.map((row) => row.name.replace(/\(.*\)$/, '')))).sort();

    const recompostas = [
      'isLoading',
      // useEvolutionInstance
      'createInstance', 'createConnection', 'listInstances', 'connectInstance', 'getInstanceStatus',
      'getInstanceInfo', 'restartInstance', 'disconnectInstance', 'deleteInstance', 'setPresence',
      'setSettings', 'getSettings', 'setWebhook', 'getWebhook',
      // useEvolutionMessaging
      'sendTextMessage', 'sendMediaMessage', 'sendAudioMessage', 'sendStickerMessage',
      'sendLocationMessage', 'sendContactMessage', 'sendReaction', 'sendPollMessage',
      'sendListMessage', 'sendButtonsMessage', 'sendStatusMessage', 'sendTemplateMessage',
      'sendPtvMessage', 'sendChatPresence', 'markMessageAsRead', 'markMessageAsUnread',
      'archiveChat', 'deleteMessage', 'updateMessage', 'deleteMessageForEveryone', 'editMessage',
      'fetchContactProfile',
      // useEvolutionGroups
      'createGroup', 'listGroups', 'getGroupInfo', 'getGroupParticipants', 'updateGroupName',
      'updateGroupDescription', 'updateGroupParticipants', 'updateGroupSetting',
      'getGroupInviteCode', 'revokeGroupInviteCode', 'getInviteInfo', 'acceptInvite',
      'leaveGroup', 'updateGroupPicture', 'toggleEphemeral',
    ];

    // Nada a mais, nada a menos: fora do que vem dos sub-hooks, só o contrato.
    const absorvidas = chaves.filter((k) => !recompostas.includes(k)).sort();
    expect(absorvidas).toEqual(contrato);
    for (const nome of contrato) {
      expect(typeof (result.current as Record<string, unknown>)[nome]).toBe('function');
    }

    // Nenhuma ação sem equivalente na Evolution GO pode ter sobrado exposta.
    const semEquivalenteNaGo = [
      'findChats', 'findMessages', 'findStatusMessages',
      'setChatwoot', 'getChatwoot', 'deleteChatwoot',
      'setTypebot', 'getTypebot', 'deleteTypebot', 'getTypebotSessions', 'changeTypebotStatus', 'startTypebot',
      'setOpenAI', 'getOpenAI', 'deleteOpenAI',
      'setDify', 'getDify', 'deleteDify',
      'setFlowise', 'getFlowise', 'deleteFlowise',
      'setEvolutionBot', 'getEvolutionBot', 'deleteEvolutionBot',
      'setRabbitMQ', 'getRabbitMQ', 'setSQS', 'getSQS',
      'createTemplate', 'findTemplates', 'deleteTemplate',
      'offerCall', 'getBusinessCatalog', 'getBusinessCollections',
      'setProxy', 'getProxy',
      'setEvoAI', 'getEvoAI', 'deleteEvoAI',
      'setN8N', 'getN8N', 'deleteN8N',
      'setKafka', 'getKafka', 'setNats', 'getNats', 'setPusher', 'getPusher',
    ];
    for (const fn of semEquivalenteNaGo) {
      expect((result.current as Record<string, unknown>)[fn]).toBeUndefined();
    }
  });
});

describe('leitura devolve o dado da edge function', () => {
  it('findLabels devolve a lista recebida (passthrough, sem reembalar)', async () => {
    const labels = [{ id: 'lbl-1', name: 'vip' }];
    h.invoke.mockResolvedValue({ data: labels, error: null });
    const { result } = renderApi();

    let out: unknown;
    await act(async () => {
      out = await result.current.findLabels(instanceName);
    });

    expect(out).toBe(labels);
  });

  it('getMediaBase64 devolve o objeto de mídia sem reembalar', async () => {
    const media = { base64: 'ZmFrZQ==', mimetype: 'image/png' };
    h.invoke.mockResolvedValue({ data: media, error: null });
    const { result } = renderApi();

    let out: unknown;
    await act(async () => {
      out = await result.current.getMediaBase64(instanceName, { key: { id: 'msg-1' } }, true);
    });

    expect(out).toBe(media);
  });

  it('updateBlockStatus devolve o retorno da edge function e confirma no toast', async () => {
    h.invoke.mockResolvedValue({ data: { ok: true }, error: null });
    const { result } = renderApi();

    let out: unknown;
    await act(async () => {
      out = await result.current.updateBlockStatus(instanceName, number, 'block');
    });

    expect(out).toEqual({ ok: true });
    expect(h.toast.success).toHaveBeenCalledWith('Contato bloqueado');
  });
});

describe('erros', () => {
  it('erro do corpo com HTTP 200 sobe com a mensagem do servidor e vira toast de erro', async () => {
    h.invoke.mockResolvedValue({
      data: { error: true, message: 'instance (instanceName) é obrigatório para esta ação.' },
      error: null,
    });
    const { result } = renderApi();

    await act(async () => {
      await expect(result.current.removeProfilePicture(instanceName)).rejects.toThrow(
        'instance (instanceName) é obrigatório para esta ação.',
      );
    });

    expect(h.toast.error).toHaveBeenCalledWith('instance (instanceName) é obrigatório para esta ação.');
  });

  it('leitura pura com erro sobe a exceção sem toast (quem lê trata o erro)', async () => {
    h.invoke.mockResolvedValue({
      data: { error: true, message: 'Sem permissão para listar contatos.' },
      error: null,
    });
    const { result } = renderApi();

    await act(async () => {
      await expect(result.current.findContacts(instanceName)).rejects.toThrow('Sem permissão para listar contatos.');
    });

    expect(h.toast.error).not.toHaveBeenCalled();
    expect(h.toast.success).not.toHaveBeenCalled();
  });

  it('data.error precisa ser true (booleano): payload com error false resolve normalmente', async () => {
    h.invoke.mockResolvedValue({ data: { error: false, data: [{ id: 'lbl-1' }] }, error: null });
    const { result } = renderApi();

    let out: unknown;
    await act(async () => {
      out = await result.current.findLabels(instanceName);
    });

    expect(out).toEqual({ error: false, data: [{ id: 'lbl-1' }] });
  });

  it('falha de rede sobe o erro e o item de mutação avisa no toast', async () => {
    h.invoke.mockResolvedValue({ data: null, error: new Error('network down') });
    const { result } = renderApi();

    await act(async () => {
      await expect(result.current.removeProfilePicture(instanceName)).rejects.toThrow('network down');
    });

    expect(h.toast.error).toHaveBeenCalledWith('network down');
  });

  it.fails('403 da edge function mostra no toast a mensagem pt-BR do servidor, não o texto técnico do supabase-js', async () => {
    h.invoke.mockResolvedValue({
      data: null,
      error: functionsHttpError('Sem permissão para atualizar o nome desta conexão.', 403),
    });
    const { result } = renderApi();

    await act(async () => {
      await result.current
        .updateProfileName(instanceName, 'Loja Centro')
        .catch(() => undefined);
    });

    expect(h.toast.error).toHaveBeenCalledWith('Sem permissão para atualizar o nome desta conexão.');
  });
});

describe('concorrência: dedupe só em leitura (method GET)', () => {
  it('duas leituras iguais em voo viram UMA viagem e as duas recebem o mesmo resultado', async () => {
    const gate = deferred<{ data: unknown; error: unknown }>();
    h.invoke.mockReturnValueOnce(gate.promise);
    const { result } = renderApi();

    let p1!: Promise<unknown>;
    let p2!: Promise<unknown>;
    await act(async () => {
      p1 = result.current.findContacts(instanceName, 1, 0);
      p2 = result.current.findContacts(instanceName, 1, 0);
    });

    expect(h.invoke).toHaveBeenCalledTimes(1);

    const contacts = [{ id: 'contact-1' }];
    let r1: unknown;
    let r2: unknown;
    await act(async () => {
      gate.resolve({ data: contacts, error: null });
      [r1, r2] = await Promise.all([p1, p2]);
    });

    expect(r1).toBe(contacts);
    expect(r2).toBe(contacts);
    expect(h.invoke).toHaveBeenCalledTimes(1);
  });

  it('leituras iguais com argumentos DIFERENTES não são confundidas (paginação/offset entram na chave)', async () => {
    const { result } = renderApi();

    await act(async () => {
      await Promise.all([
        result.current.findContacts(instanceName, 1, 0),
        result.current.findContacts(instanceName, 2, 100),
      ]);
    });

    expect(h.invoke).toHaveBeenCalledTimes(2);
    expect(h.invoke.mock.calls.map((c) => (c[1] as { body: { page: number } }).body.page)).toEqual([1, 2]);
  });

  it('mutação (POST) nunca deduplica: o mesmo handleLabel em voo vira duas viagens', async () => {
    const gate = deferred<{ data: unknown; error: unknown }>();
    h.invoke.mockReturnValueOnce(gate.promise).mockReturnValueOnce(gate.promise);
    const { result } = renderApi();

    let p1!: Promise<unknown>;
    let p2!: Promise<unknown>;
    await act(async () => {
      p1 = result.current.handleLabel(instanceName, number, 'lbl-1', 'add');
      p2 = result.current.handleLabel(instanceName, number, 'lbl-1', 'add');
    });

    expect(h.invoke).toHaveBeenCalledTimes(2);

    await act(async () => {
      gate.resolve({ data: null, error: null });
      await Promise.all([p1, p2]);
    });
  });

  it('a chave do dedupe é liberada ao terminar: a próxima leitura igual invoca de novo', async () => {
    const { result } = renderApi();

    await act(async () => {
      await result.current.findContacts(instanceName, 1, 0);
      await result.current.findContacts(instanceName, 1, 0);
    });

    expect(h.invoke).toHaveBeenCalledTimes(2);
  });

  it('leitura que FALHA também libera a chave: o retry em voo não recebe a promessa rejeitada antiga', async () => {
    h.invoke
      .mockResolvedValueOnce({ data: null, error: new Error('rede caiu') })
      .mockResolvedValueOnce({ data: [{ id: 'c1' }], error: null });
    const { result } = renderApi();

    await act(async () => {
      await expect(result.current.findLabels(instanceName)).rejects.toThrow('rede caiu');
      await expect(result.current.findLabels(instanceName)).resolves.toEqual([{ id: 'c1' }]);
    });

    expect(h.invoke).toHaveBeenCalledTimes(2);
  });
});

describe('limites e dado malformado', () => {
  it('paginação no limite inferior (page 0, offset 0) é enviada como veio, sem arredondar', async () => {
    const { result } = renderApi();

    await act(async () => {
      await result.current.findContacts(instanceName, 0, 0);
    });

    expect((h.invoke.mock.calls[0][1] as { body: unknown }).body).toEqual({
      instanceName,
      page: 0,
      offset: 0,
    });
  });

  it('checkWhatsAppNumbers com lista vazia ainda manda o corpo (sem filtrar no cliente)', async () => {
    const { result } = renderApi();

    await act(async () => {
      await result.current.checkWhatsAppNumbers(instanceName, []);
    });

    expect((h.invoke.mock.calls[0][1] as { body: unknown }).body).toEqual({
      instanceName,
      numbers: [],
    });
  });

  it('leitura com payload vazio (data null) resolve null, sem lançar', async () => {
    const { result } = renderApi();

    let out: unknown = 'sentinela';
    await act(async () => {
      out = await result.current.fetchProfile(instanceName);
    });

    expect(out).toBeNull();
  });
});
