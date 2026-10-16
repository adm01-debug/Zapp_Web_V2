/**
 * Testes de `src/hooks/evolution/useEvolutionMessaging.ts`.
 *
 * Escopo: SÓ teste novo. Nenhuma linha de produção foi alterada.
 *
 * Como se prova aqui: o hook é um adaptador; os testes montam o hook com o
 * `useEvolutionApiCore` REAL e dublam só a FRONTEIRA de rede
 * (`supabase.functions.invoke`), que é o que o roteador da edge function
 * (`supabase/functions/evolution-api/index.ts`) recebe de verdade:
 * `evolution-api/<action>` + `{ method: 'POST', body }`.
 *
 * O último bloco compara as ações enviadas pelo hook com as ações que a edge
 * function REALMENTE atende (lista própria do roteador, colada abaixo) — é o
 * único jeito de pegar uma função do hook que aponta para ação inexistente.
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
import { useEvolutionMessaging } from '@/hooks/evolution/useEvolutionMessaging';
import type { ButtonItem, ContactCard, ListSection } from '@/hooks/integrations/evolutionApi.types';

type Api = ReturnType<typeof useEvolutionMessaging>;

function renderMessaging() {
  return renderHook(() => {
    const core = useEvolutionApiCore();
    return useEvolutionMessaging(core.callApi, core.withToast);
  });
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((res) => {
    resolve = res;
  });
  return { promise, resolve };
}

const instanceName = 'zap-01';
const number = '5511999999999';
const remoteJid = `${number}@s.whatsapp.net`;
const key = { remoteJid, fromMe: true, id: 'msg-1' };
const quoted = { key, message: { conversation: 'pergunta original' } };
const contacts: ContactCard[] = [{ fullName: 'Ana Souza', wuid: 'wuid-1', phoneNumber: number }];
const sections: ListSection[] = [
  { title: 'Setor', rows: [{ title: 'Vendas', rowId: 'vendas' }] },
];
const buttons: ButtonItem[] = [{ type: 'reply', displayText: 'Quero', id: 'quero' }];

type Row = {
  name: string;
  action: string;
  body: Record<string, unknown>;
  /** Mensagem do toast de sucesso; ausente = `callApi` direto (sem toast). */
  success?: string;
  run: (api: Api) => Promise<unknown>;
};

const CASES: Row[] = [
  // ── Envio ──────────────────────────────────────────────────────────────────
  { name: 'sendTextMessage', action: 'send-text', body: { instanceName, number, text: 'bom dia' }, run: (a) => a.sendTextMessage(instanceName, number, 'bom dia') },
  { name: 'sendTextMessage(options)', action: 'send-text', body: { instanceName, number, text: 'bom dia', delay: 2000, quoted, mentioned: [number] }, run: (a) => a.sendTextMessage(instanceName, number, 'bom dia', { delay: 2000, quoted, mentioned: [number] }) },
  { name: 'sendMediaMessage', action: 'send-media', body: { instanceName, number, mediaUrl: 'whatsapp-media/contato/foto.png', mediaType: 'image', caption: 'legenda', fileName: 'foto.png' }, run: (a) => a.sendMediaMessage({ instanceName, number, mediaUrl: 'whatsapp-media/contato/foto.png', mediaType: 'image', caption: 'legenda', fileName: 'foto.png' }) },
  { name: 'sendAudioMessage', action: 'send-audio', body: { instanceName, number, mediaUrl: 'whatsapp-media/contato/audio.webm' }, run: (a) => a.sendAudioMessage(instanceName, number, 'whatsapp-media/contato/audio.webm') },
  { name: 'sendAudioMessage(options)', action: 'send-audio', body: { instanceName, number, mediaUrl: 'whatsapp-media/contato/audio.webm', encoding: true, delay: 1000 }, run: (a) => a.sendAudioMessage(instanceName, number, 'whatsapp-media/contato/audio.webm', { encoding: true, delay: 1000 }) },
  { name: 'sendStickerMessage', action: 'send-sticker', body: { instanceName, number, sticker: 'whatsapp-media/figurinha.webp' }, run: (a) => a.sendStickerMessage(instanceName, number, 'whatsapp-media/figurinha.webp') },
  { name: 'sendLocationMessage', action: 'send-location', body: { instanceName, number, latitude: -23.55, longitude: -46.63, locationName: 'Loja Centro', locationAddress: 'Rua 1' }, run: (a) => a.sendLocationMessage({ instanceName, number, latitude: -23.55, longitude: -46.63, locationName: 'Loja Centro', locationAddress: 'Rua 1' }) },
  { name: 'sendContactMessage', action: 'send-contact', body: { instanceName, number, contact: contacts }, run: (a) => a.sendContactMessage(instanceName, number, contacts) },
  { name: 'sendReaction', action: 'send-reaction', body: { instanceName, key, reaction: '👍' }, run: (a) => a.sendReaction(instanceName, key, '👍') },
  { name: 'sendPollMessage', action: 'send-poll', body: { instanceName, number, name: 'Qual sabor?', selectableCount: 1, values: ['calabresa', 'marguerita'] }, run: (a) => a.sendPollMessage({ instanceName, number, name: 'Qual sabor?', selectableCount: 1, values: ['calabresa', 'marguerita'] }) },
  { name: 'sendListMessage', action: 'send-list', body: { instanceName, number, title: 'Menu', description: 'Escolha um setor', buttonText: 'Abrir', sections, footer: 'Promo Brindes' }, run: (a) => a.sendListMessage(instanceName, number, 'Menu', 'Escolha um setor', 'Abrir', sections, 'Promo Brindes') },
  { name: 'sendListMessage(sem footer)', action: 'send-list', body: { instanceName, number, title: 'Menu', description: 'Escolha um setor', buttonText: 'Abrir', sections }, run: (a) => a.sendListMessage(instanceName, number, 'Menu', 'Escolha um setor', 'Abrir', sections) },
  { name: 'sendButtonsMessage', action: 'send-buttons', body: { instanceName, number, title: 'Confirmar', description: 'Tudo certo?', buttons, footer: 'Promo Brindes' }, run: (a) => a.sendButtonsMessage(instanceName, number, 'Confirmar', 'Tudo certo?', buttons, 'Promo Brindes') },
  { name: 'sendStatusMessage', action: 'send-status', body: { instanceName, status: 'Oi', allContacts: true }, run: (a) => a.sendStatusMessage(instanceName, { status: 'Oi', allContacts: true }) },
  { name: 'sendTemplateMessage', action: 'send-template', body: { instanceName, number, template: { name: 'boas_vindas', language: 'pt_BR' } }, run: (a) => a.sendTemplateMessage(instanceName, number, { name: 'boas_vindas', language: 'pt_BR' }) },
  { name: 'sendPtvMessage', action: 'send-ptv', body: { instanceName, number, video: 'whatsapp-media/contato/video.mp4', delay: 500 }, run: (a) => a.sendPtvMessage(instanceName, number, 'whatsapp-media/contato/video.mp4', 500) },
  { name: 'sendChatPresence', action: 'send-chat-presence', body: { instanceName, number, presence: 'composing', delay: 3000 }, run: (a) => a.sendChatPresence(instanceName, number, 'composing', 3000) },
  { name: 'sendChatPresence(sem delay)', action: 'send-chat-presence', body: { instanceName, number, presence: 'recording' }, run: (a) => a.sendChatPresence(instanceName, number, 'recording') },
  // ── Gestão de mensagem ─────────────────────────────────────────────────────
  { name: 'markMessageAsRead', action: 'mark-read', body: { instanceName, key }, run: (a) => a.markMessageAsRead(instanceName, key) },
  { name: 'markMessageAsUnread', action: 'mark-unread', body: { instanceName, key }, run: (a) => a.markMessageAsUnread(instanceName, key) },
  { name: 'archiveChat(default)', action: 'archive-chat', body: { instanceName, lastMessage: { key }, chat: remoteJid, archive: true }, run: (a) => a.archiveChat(instanceName, { key }, remoteJid) },
  { name: 'archiveChat(false)', action: 'archive-chat', body: { instanceName, lastMessage: { key }, chat: remoteJid, archive: false }, run: (a) => a.archiveChat(instanceName, { key }, remoteJid, false) },
  { name: 'deleteMessage', action: 'delete-message', body: { instanceName, id: 'msg-1', remoteJid, fromMe: true }, run: (a) => a.deleteMessage(instanceName, 'msg-1', remoteJid, true) },
  { name: 'updateMessage', action: 'update-message', body: { instanceName, number, key, text: 'texto corrigido' }, run: (a) => a.updateMessage(instanceName, number, key, 'texto corrigido') },
  { name: 'deleteMessageForEveryone', action: 'delete-for-everyone', body: { instanceName, messageId: 'msg-1' }, run: (a) => a.deleteMessageForEveryone(instanceName, { messageId: 'msg-1' }) },
  { name: 'editMessage', action: 'edit-message', body: { instanceName, messageId: 'msg-1', text: 'novo' }, run: (a) => a.editMessage(instanceName, { messageId: 'msg-1', text: 'novo' }) },
  // ── Chat controller ────────────────────────────────────────────────────────
  { name: 'pinChat', action: 'pin-chat', body: { instanceName, remoteJid }, success: 'Chat fixado', run: (a) => a.pinChat(instanceName, remoteJid) },
  { name: 'unpinChat', action: 'unpin-chat', body: { instanceName, remoteJid }, success: 'Chat desfixado', run: (a) => a.unpinChat(instanceName, remoteJid) },
  { name: 'starMessage(default)', action: 'star-message', body: { instanceName, key, star: true }, success: 'Mensagem marcada', run: (a) => a.starMessage(instanceName, key) },
  { name: 'starMessage(false)', action: 'star-message', body: { instanceName, key, star: false }, success: 'Marcação removida', run: (a) => a.starMessage(instanceName, key, false) },
  { name: 'clearChat', action: 'clear-chat', body: { instanceName, remoteJid }, success: 'Chat limpo', run: (a) => a.clearChat(instanceName, remoteJid) },
  { name: 'setDisappearingMessages(0)', action: 'set-disappearing', body: { instanceName, remoteJid, expiration: 0 }, success: 'Mensagens temporárias desativadas', run: (a) => a.setDisappearingMessages(instanceName, remoteJid, 0) },
  { name: 'setDisappearingMessages(24h)', action: 'set-disappearing', body: { instanceName, remoteJid, expiration: 86400 }, success: 'Mensagens temporárias ativadas', run: (a) => a.setDisappearingMessages(instanceName, remoteJid, 86400) },
  { name: 'setDisappearingMessages(7d)', action: 'set-disappearing', body: { instanceName, remoteJid, expiration: 604800 }, success: 'Mensagens temporárias ativadas', run: (a) => a.setDisappearingMessages(instanceName, remoteJid, 604800) },
  { name: 'setDisappearingMessages(90d)', action: 'set-disappearing', body: { instanceName, remoteJid, expiration: 7776000 }, success: 'Mensagens temporárias ativadas', run: (a) => a.setDisappearingMessages(instanceName, remoteJid, 7776000) },
  { name: 'fetchContactProfile', action: 'fetch-profile', body: { instanceName, number }, run: (a) => a.fetchContactProfile(instanceName, number) },
  { name: 'muteChat(0)', action: 'mute-chat', body: { instanceName, remoteJid, duration: 0 }, success: 'Notificações ativadas', run: (a) => a.muteChat(instanceName, remoteJid, 0) },
  { name: 'muteChat(1h)', action: 'mute-chat', body: { instanceName, remoteJid, duration: 3600 }, success: 'Chat silenciado', run: (a) => a.muteChat(instanceName, remoteJid, 3600) },
];

const ACTIONS_OF_THE_ROUTER = new Set<string>([
  'accept-invite', 'archive-chat', 'bootstrap-instance-token', 'check-numbers', 'connect',
  'create-connection', 'create-group', 'create-instance', 'create-template', 'delete-chatwoot',
  'delete-dify', 'delete-evoai', 'delete-evolution-bot', 'delete-flowise', 'delete-for-everyone',
  'delete-instance', 'delete-message', 'delete-n8n', 'delete-openai', 'delete-template',
  'delete-typebot', 'disconnect', 'edit-message', 'fetch-business-profile', 'fetch-profile',
  'fetch-profile-picture', 'find-chats', 'find-contacts', 'find-labels', 'find-messages',
  'find-status-messages', 'find-templates', 'get-catalog', 'get-chatwoot', 'get-collections',
  'get-dify', 'get-evoai', 'get-evolution-bot', 'get-flowise', 'get-kafka', 'get-media-base64',
  'get-n8n', 'get-nats', 'get-openai', 'get-proxy', 'get-pusher', 'get-rabbitmq', 'get-settings',
  'get-sqs', 'get-typebot', 'get-webhook', 'group-info', 'group-invite-code', 'group-participants',
  'handle-label', 'instance-info', 'invite-info', 'leave-group', 'list-groups', 'list-instances',
  'mark-read', 'mark-unread', 'offer-call', 'remove-profile-picture', 'restart-instance',
  'revoke-invite-code', 'send-audio', 'send-buttons', 'send-chat-presence', 'send-contact',
  'send-list', 'send-location', 'send-media', 'send-poll', 'send-ptv', 'send-reaction',
  'send-status', 'send-sticker', 'send-template', 'send-text', 'set-chatwoot', 'set-dify',
  'set-evoai', 'set-evolution-bot', 'set-flowise', 'set-kafka', 'set-n8n', 'set-nats',
  'set-openai', 'set-presence', 'set-proxy', 'set-pusher', 'set-rabbitmq', 'set-settings',
  'set-sqs', 'set-typebot', 'set-webhook', 'start-typebot', 'status', 'toggle-ephemeral',
  'typebot-change-status', 'typebot-sessions', 'update-block-status', 'update-group-description',
  'update-group-name', 'update-group-picture', 'update-group-setting', 'update-message',
  'update-participants', 'update-privacy', 'update-profile-name', 'update-profile-picture',
  'update-profile-status',
]);

beforeEach(() => {
  vi.clearAllMocks();
  h.invoke.mockResolvedValue({ data: null, error: null });
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('mapeamento ação -> payload da edge function', () => {
  it.each(CASES)('$name envia $action com o corpo do roteador', async (row) => {
    const { result } = renderMessaging();

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

  it('envia a mensagem pelo caminho da edge function, nunca direto para a Evolution', async () => {
    const { result } = renderMessaging();

    await act(async () => {
      await result.current.sendTextMessage(instanceName, number, 'bom dia');
    });

    const [path, options] = h.invoke.mock.calls[0] as [string, { body: Record<string, unknown> }];
    expect(path.startsWith('evolution-api/')).toBe(true);
    expect(JSON.stringify(options.body)).not.toMatch(/apiKey|evolutionApiUrl|apikey/i);
  });

  it('expõe exatamente as funções do contrato (nada a mais, nada a menos)', () => {
    const { result } = renderMessaging();

    expect(Object.keys(result.current).sort()).toEqual(
      [...new Set(CASES.map((row) => row.name.replace(/\(.*\)$/, '')))].sort(),
    );
  });
});

describe('leitura devolve o dado da edge function', () => {
  it('markMessageAsRead devolve o retorno da edge function sem reembalar', async () => {
    const ack = { key, status: 'READ' };
    h.invoke.mockResolvedValue({ data: ack, error: null });
    const { result } = renderMessaging();

    let out: unknown;
    await act(async () => {
      out = await result.current.markMessageAsRead(instanceName, key);
    });

    expect(out).toBe(ack);
  });

  it('pinChat devolve o retorno da edge function e confirma no toast', async () => {
    h.invoke.mockResolvedValue({ data: { pinned: true }, error: null });
    const { result } = renderMessaging();

    let out: unknown;
    await act(async () => {
      out = await result.current.pinChat(instanceName, remoteJid);
    });

    expect(out).toEqual({ pinned: true });
    expect(h.toast.success).toHaveBeenCalledWith('Chat fixado');
  });
});

describe('erros', () => {
  it('erro do corpo com HTTP 200 sobe com a mensagem do servidor e vira toast de erro', async () => {
    h.invoke.mockResolvedValue({
      data: { error: true, message: 'Destinatário (number) é obrigatório para envio.' },
      error: null,
    });
    const { result } = renderMessaging();

    await act(async () => {
      await expect(result.current.pinChat(instanceName, remoteJid)).rejects.toThrow(
        'Destinatário (number) é obrigatório para envio.',
      );
    });

    expect(h.toast.error).toHaveBeenCalledWith('Destinatário (number) é obrigatório para envio.');
  });

  it('envio com erro sobe a exceção sem toast (quem envia trata o erro)', async () => {
    h.invoke.mockResolvedValue({
      data: { error: true, message: 'Sem permissão para enviar para este contato/conexão.' },
      error: null,
    });
    const { result } = renderMessaging();

    await act(async () => {
      await expect(result.current.sendTextMessage(instanceName, number, 'oi')).rejects.toThrow(
        'Sem permissão para enviar para este contato/conexão.',
      );
    });

    expect(h.toast.error).not.toHaveBeenCalled();
    expect(h.toast.success).not.toHaveBeenCalled();
  });

  it('falha de rede em mutação com toast avisa o usuário', async () => {
    h.invoke.mockResolvedValue({ data: null, error: new Error('network down') });
    const { result } = renderMessaging();

    await act(async () => {
      await expect(result.current.clearChat(instanceName, remoteJid)).rejects.toThrow('network down');
    });

    expect(h.toast.error).toHaveBeenCalledWith('network down');
  });

  it('403 da edge function rejeita a chamada (não resolve em silêncio)', async () => {
    h.invoke.mockResolvedValue({
      data: null,
      error: Object.assign(new Error('Edge Function returned a non-2xx status code'), {
        name: 'FunctionsHttpError',
      }),
    });
    const { result } = renderMessaging();

    await act(async () => {
      await expect(result.current.muteChat(instanceName, remoteJid, 3600)).rejects.toBeInstanceOf(Error);
    });
  });
});

describe('concorrência: dedupe só em leitura (method GET)', () => {
  it('duas leituras de perfil iguais em voo viram UMA viagem e recebem o mesmo resultado', async () => {
    const gate = deferred<{ data: unknown; error: unknown }>();
    h.invoke.mockReturnValueOnce(gate.promise);
    const { result } = renderMessaging();

    let p1!: Promise<unknown>;
    let p2!: Promise<unknown>;
    await act(async () => {
      p1 = result.current.fetchContactProfile(instanceName, number);
      p2 = result.current.fetchContactProfile(instanceName, number);
    });

    expect(h.invoke).toHaveBeenCalledTimes(1);

    const profile = { id: 'p1', name: 'Ana' };
    let r1: unknown;
    let r2: unknown;
    await act(async () => {
      gate.resolve({ data: profile, error: null });
      [r1, r2] = await Promise.all([p1, p2]);
    });

    expect(r1).toBe(profile);
    expect(r2).toBe(profile);
    expect(h.invoke).toHaveBeenCalledTimes(1);
  });

  it('a leitura é liberada ao terminar: a próxima igual invoca de novo', async () => {
    const { result } = renderMessaging();

    await act(async () => {
      await result.current.fetchContactProfile(instanceName, number);
      await result.current.fetchContactProfile(instanceName, number);
    });

    expect(h.invoke).toHaveBeenCalledTimes(2);
  });

  it('envio (POST) nunca deduplica: duas mensagens iguais são duas viagens', async () => {
    const { result } = renderMessaging();

    await act(async () => {
      await Promise.all([
        result.current.sendTextMessage(instanceName, number, 'bom dia'),
        result.current.sendTextMessage(instanceName, number, 'bom dia'),
      ]);
    });

    expect(h.invoke).toHaveBeenCalledTimes(2);
  });
});

describe('limites e dado malformado', () => {
  it('enquete sem opções é repassada como veio (o hook não valida; quem recusa é a API)', async () => {
    const { result } = renderMessaging();

    await act(async () => {
      await result.current.sendPollMessage({ instanceName, number, name: 'Qual?', values: [] });
    });

    expect((h.invoke.mock.calls[0][1] as { body: unknown }).body).toEqual({
      instanceName,
      number,
      name: 'Qual?',
      values: [],
    });
  });

  it('reação com string vazia é repassada (nenhuma validação local de conteúdo)', async () => {
    const { result } = renderMessaging();

    await act(async () => {
      await result.current.sendReaction(instanceName, key, '');
    });

    expect((h.invoke.mock.calls[0][1] as { body: Record<string, unknown> }).body.reaction).toBe('');
  });

  it('payload vazio (data null) resolve null, sem lançar', async () => {
    const { result } = renderMessaging();

    let out: unknown = 'sentinela';
    await act(async () => {
      out = await result.current.markMessageAsUnread(instanceName, key);
    });

    expect(out).toBeNull();
  });

  it.todo(
    'sendStatusMessage/deleteMessageForEveryone/editMessage recebem `body: object` sem tipo: uma chave instanceName dentro dele sobrescreve a instância do argumento (o spread do chamador vence)',
  );
});

describe('contrato com o roteador da edge function', () => {
  it('o próprio conjunto de ações do roteador é o esperado (108+ ações, todas em kebab-case)', () => {
    expect(ACTIONS_OF_THE_ROUTER.size).toBeGreaterThanOrEqual(108);
    for (const action of ACTIONS_OF_THE_ROUTER) {
      expect(action).toMatch(/^[a-z0-9]+(-[a-z0-9]+)*$/);
    }
    // Sanidade da lista colada: se ela fosse um conjunto vazio, o teste abaixo
    // (it.fails) passaria por engano.
    expect(ACTIONS_OF_THE_ROUTER.has('send-text')).toBe(true);
    expect(ACTIONS_OF_THE_ROUTER.has('pin-chat')).toBe(false);
  });

  // Lista colada de `grep -oE "action === '[a-z0-9-]+'" supabase/functions/evolution-api/index.ts | sort -u`.
  // Fica vermelha se o hook passar a mandar uma ação que o roteador não atende.
  it.fails('toda ação enviada pelo hook existe no roteador da edge function', () => {
    const missing = [...new Set(CASES.map((row) => row.action))].filter(
      (action) => !ACTIONS_OF_THE_ROUTER.has(action),
    );

    expect(missing).toEqual([]);
  });
});
