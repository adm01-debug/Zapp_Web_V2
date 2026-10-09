/**
 * Testes de `src/hooks/evolution/useEvolutionIntegrations.ts`.
 *
 * Escopo: SÓ teste novo. Nenhuma linha de produção foi alterada.
 *
 * Como se prova aqui: o hook é um adaptador — a interface que ele tem com o
 * resto do sistema são os DOIS parâmetros injetados (`callApi`/`withToast`), e
 * o que se prova é o payload que sai dele. Em vez de dublar esses parâmetros
 * (que seriam o próprio alvo), os testes montam o hook com o
 * `useEvolutionApiCore` REAL e dublam a FRONTEIRA de rede
 * (`supabase.functions.invoke`), que é o que o roteador da edge function
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
}));

import { useEvolutionApiCore } from '@/hooks/evolution/useEvolutionApiCore';
import { useEvolutionIntegrations } from '@/hooks/evolution/useEvolutionIntegrations';
import type {
  ChatwootConfig,
  DifyConfig,
  EvolutionBotConfig,
  FlowiseConfig,
  OpenAIConfig,
  PrivacySettings,
  TypebotConfig,
} from '@/hooks/integrations/evolutionApi.types';

type Api = ReturnType<typeof useEvolutionIntegrations>;

function renderIntegrations() {
  return renderHook(() => {
    const core = useEvolutionApiCore();
    return useEvolutionIntegrations(core.callApi, core.withToast);
  });
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
const chatwoot: ChatwootConfig = { instanceName, accountId: '7', token: 'tok-fake', url: 'https://chat.exemplo' };
const typebot: TypebotConfig = { instanceName, url: 'https://typebot.exemplo', typebot: 'bot-1' };
const openai: OpenAIConfig = { instanceName, openAiApiKey: 'sk-fake' };
const dify: DifyConfig = { instanceName, apiUrl: 'https://dify.exemplo', apiKey: 'dif-fake' };
const flowise: FlowiseConfig = { instanceName, apiUrl: 'https://flowise.exemplo', chatflowId: 'cf-1' };
const evolutionBot: EvolutionBotConfig = { instanceName, apiUrl: 'https://bot.exemplo' };

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
  { name: 'findChats', action: 'find-chats', body: { instanceName, page: 2, offset: 100 }, run: (a) => a.findChats(instanceName, 2, 100) },
  {
    name: 'findMessages',
    action: 'find-messages',
    body: {
      instanceName,
      remoteJid: `${number}@s.whatsapp.net`,
      page: 1,
      offset: 50,
      timestampStart: 1_760_000_000_000,
      timestampEnd: 1_760_003_600_000,
    },
    run: (a) =>
      a.findMessages(`${instanceName}`, `${number}@s.whatsapp.net`, 1, 50, 1_760_000_000_000, 1_760_003_600_000),
  },
  { name: 'findStatusMessages', action: 'find-status-messages', body: { instanceName }, run: (a) => a.findStatusMessages(instanceName) },
  { name: 'findContacts', action: 'find-contacts', body: { instanceName, page: 1, offset: 0 }, run: (a) => a.findContacts(instanceName, 1, 0) },
  { name: 'checkWhatsAppNumbers', action: 'check-numbers', body: { instanceName, numbers: [number, '5511888888888'] }, run: (a) => a.checkWhatsAppNumbers(instanceName, [number, '5511888888888']) },
  { name: 'getMediaBase64', action: 'get-media-base64', body: { instanceName, message: { key: { id: 'msg-1' } }, convertToMp4: true }, run: (a) => a.getMediaBase64(instanceName, { key: { id: 'msg-1' } }, true) },
  // Chatwoot
  { name: 'setChatwoot', action: 'set-chatwoot', body: { ...chatwoot }, success: 'Chatwoot configurado', run: (a) => a.setChatwoot(chatwoot) },
  { name: 'getChatwoot', action: 'get-chatwoot', body: { instanceName }, run: (a) => a.getChatwoot(instanceName) },
  { name: 'deleteChatwoot', action: 'delete-chatwoot', body: { instanceName }, success: 'Chatwoot removido', run: (a) => a.deleteChatwoot(instanceName) },
  // Typebot
  { name: 'setTypebot', action: 'set-typebot', body: { ...typebot }, success: 'Typebot configurado', run: (a) => a.setTypebot(typebot) },
  { name: 'getTypebot', action: 'get-typebot', body: { instanceName }, run: (a) => a.getTypebot(instanceName) },
  { name: 'deleteTypebot', action: 'delete-typebot', body: { instanceName }, success: 'Typebot removido', run: (a) => a.deleteTypebot(instanceName) },
  { name: 'getTypebotSessions', action: 'typebot-sessions', body: { instanceName, typebotId: 'bot-1' }, run: (a) => a.getTypebotSessions(instanceName, 'bot-1') },
  { name: 'changeTypebotStatus', action: 'typebot-change-status', body: { instanceName, remoteJid: `${number}@s.whatsapp.net`, status: 'paused' }, run: (a) => a.changeTypebotStatus(instanceName, `${number}@s.whatsapp.net`, 'paused') },
  { name: 'startTypebot', action: 'start-typebot', body: { instanceName, remoteJid: `${number}@s.whatsapp.net`, url: 'https://typebot.exemplo', typebot: 'bot-1', variables: { nome: 'Ana' } }, run: (a) => a.startTypebot(instanceName, `${number}@s.whatsapp.net`, 'https://typebot.exemplo', 'bot-1', { nome: 'Ana' }) },
  // OpenAI
  { name: 'setOpenAI', action: 'set-openai', body: { ...openai }, success: 'OpenAI configurado', run: (a) => a.setOpenAI(openai) },
  { name: 'getOpenAI', action: 'get-openai', body: { instanceName }, run: (a) => a.getOpenAI(instanceName) },
  { name: 'deleteOpenAI', action: 'delete-openai', body: { instanceName }, success: 'OpenAI removido', run: (a) => a.deleteOpenAI(instanceName) },
  // Dify
  { name: 'setDify', action: 'set-dify', body: { ...dify }, success: 'Dify configurado', run: (a) => a.setDify(dify) },
  { name: 'getDify', action: 'get-dify', body: { instanceName }, run: (a) => a.getDify(instanceName) },
  { name: 'deleteDify', action: 'delete-dify', body: { instanceName }, success: 'Dify removido', run: (a) => a.deleteDify(instanceName) },
  // Flowise
  { name: 'setFlowise', action: 'set-flowise', body: { ...flowise }, success: 'Flowise configurado', run: (a) => a.setFlowise(flowise) },
  { name: 'getFlowise', action: 'get-flowise', body: { instanceName }, run: (a) => a.getFlowise(instanceName) },
  { name: 'deleteFlowise', action: 'delete-flowise', body: { instanceName }, success: 'Flowise removido', run: (a) => a.deleteFlowise(instanceName) },
  // Evolution Bot
  { name: 'setEvolutionBot', action: 'set-evolution-bot', body: { ...evolutionBot }, success: 'Evolution Bot configurado', run: (a) => a.setEvolutionBot(evolutionBot) },
  { name: 'getEvolutionBot', action: 'get-evolution-bot', body: { instanceName }, run: (a) => a.getEvolutionBot(instanceName) },
  { name: 'deleteEvolutionBot', action: 'delete-evolution-bot', body: { instanceName }, success: 'Evolution Bot removido', run: (a) => a.deleteEvolutionBot(instanceName) },
  // RabbitMQ / SQS
  { name: 'setRabbitMQ', action: 'set-rabbitmq', body: { instanceName, enabled: true, events: ['MESSAGES_UPSERT'] }, run: (a) => a.setRabbitMQ(instanceName, true, ['MESSAGES_UPSERT']) },
  { name: 'getRabbitMQ', action: 'get-rabbitmq', body: { instanceName }, run: (a) => a.getRabbitMQ(instanceName) },
  { name: 'setSQS', action: 'set-sqs', body: { instanceName, enabled: false, events: [] }, run: (a) => a.setSQS(instanceName, false, []) },
  { name: 'getSQS', action: 'get-sqs', body: { instanceName }, run: (a) => a.getSQS(instanceName) },
  // Templates
  { name: 'createTemplate', action: 'create-template', body: { instanceName, name: 'boas-vindas', content: 'olá' }, success: 'Template criado', run: (a) => a.createTemplate(instanceName, { name: 'boas-vindas', content: 'olá' }) },
  { name: 'findTemplates', action: 'find-templates', body: { instanceName }, run: (a) => a.findTemplates(instanceName) },
  { name: 'deleteTemplate', action: 'delete-template', body: { instanceName, name: 'boas-vindas' }, success: 'Template excluído', run: (a) => a.deleteTemplate(instanceName, { name: 'boas-vindas' }) },
  // Block / unblock (duas mensagens distintas)
  { name: 'updateBlockStatus(block)', action: 'update-block-status', body: { instanceName, number, status: 'block' }, success: 'Contato bloqueado', run: (a) => a.updateBlockStatus(instanceName, number, 'block') },
  { name: 'updateBlockStatus(unblock)', action: 'update-block-status', body: { instanceName, number, status: 'unblock' }, success: 'Contato desbloqueado', run: (a) => a.updateBlockStatus(instanceName, number, 'unblock') },
  // Offer call
  { name: 'offerCall', action: 'offer-call', body: { instanceName, number, isVideo: true, callDuration: 30 }, run: (a) => a.offerCall(instanceName, number, true, 30) },
  // Business catalog
  { name: 'getBusinessCatalog', action: 'get-catalog', body: { instanceName, number, limit: 30, cursor: 'cur-1' }, run: (a) => a.getBusinessCatalog(instanceName, number, 30, 'cur-1') },
  { name: 'getBusinessCollections', action: 'get-collections', body: { instanceName, number, limit: 10, cursor: 'cur-2' }, run: (a) => a.getBusinessCollections(instanceName, number, 10, 'cur-2') },
  // Proxy
  { name: 'setProxy', action: 'set-proxy', body: { instanceName, host: 'proxy.exemplo', port: 8080, protocol: 'http' }, success: 'Proxy configurado', run: (a) => a.setProxy(instanceName, { host: 'proxy.exemplo', port: 8080, protocol: 'http' }) },
  { name: 'getProxy', action: 'get-proxy', body: { instanceName }, run: (a) => a.getProxy(instanceName) },
  // EvoAI
  { name: 'setEvoAI', action: 'set-evoai', body: { instanceName, apiUrl: 'https://evoai.exemplo', apiKey: 'evo-fake', agentId: 'agent-1' }, success: 'EvoAI configurado', run: (a) => a.setEvoAI(instanceName, { apiUrl: 'https://evoai.exemplo', apiKey: 'evo-fake', agentId: 'agent-1' }) },
  { name: 'getEvoAI', action: 'get-evoai', body: { instanceName }, run: (a) => a.getEvoAI(instanceName) },
  { name: 'deleteEvoAI', action: 'delete-evoai', body: { instanceName }, success: 'EvoAI removido', run: (a) => a.deleteEvoAI(instanceName) },
  // N8N
  { name: 'setN8N', action: 'set-n8n', body: { instanceName, webhookUrl: 'https://n8n.exemplo/webhook/1' }, success: 'N8N configurado', run: (a) => a.setN8N(instanceName, { webhookUrl: 'https://n8n.exemplo/webhook/1' }) },
  { name: 'getN8N', action: 'get-n8n', body: { instanceName }, run: (a) => a.getN8N(instanceName) },
  { name: 'deleteN8N', action: 'delete-n8n', body: { instanceName }, success: 'N8N removido', run: (a) => a.deleteN8N(instanceName) },
  // Event streaming
  { name: 'setKafka', action: 'set-kafka', body: { instanceName, enabled: true, events: ['MESSAGES_UPSERT'] }, run: (a) => a.setKafka(instanceName, true, ['MESSAGES_UPSERT']) },
  { name: 'getKafka', action: 'get-kafka', body: { instanceName }, run: (a) => a.getKafka(instanceName) },
  { name: 'setNats', action: 'set-nats', body: { instanceName, enabled: true, events: [] }, run: (a) => a.setNats(instanceName, true, []) },
  { name: 'getNats', action: 'get-nats', body: { instanceName }, run: (a) => a.getNats(instanceName) },
  { name: 'setPusher', action: 'set-pusher', body: { instanceName, appId: 'app-1', key: 'pub-fake', secret: 'sec-fake', cluster: 'sa1' }, run: (a) => a.setPusher(instanceName, { appId: 'app-1', key: 'pub-fake', secret: 'sec-fake', cluster: 'sa1' }) },
  { name: 'getPusher', action: 'get-pusher', body: { instanceName }, run: (a) => a.getPusher(instanceName) },
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
    const { result } = renderIntegrations();

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

  it('expõe exatamente as funções do contrato (nada a mais, nada a menos)', () => {
    const { result } = renderIntegrations();

    expect(Object.keys(result.current).sort()).toEqual(
      [...new Set(CASES.map((row) => row.name.replace(/\(.*\)$/, '')))].sort(),
    );
  });
});

describe('leitura devolve o dado da edge function', () => {
  it('findLabels devolve a lista recebida (passthrough, sem reembalar)', async () => {
    const labels = [{ id: 'lbl-1', name: 'vip' }];
    h.invoke.mockResolvedValue({ data: labels, error: null });
    const { result } = renderIntegrations();

    let out: unknown;
    await act(async () => {
      out = await result.current.findLabels(instanceName);
    });

    expect(out).toBe(labels);
  });

  it('getBusinessCatalog devolve o objeto com cursor de paginação', async () => {
    const page = { data: [{ id: 'p1' }], cursor: 'cur-2' };
    h.invoke.mockResolvedValue({ data: page, error: null });
    const { result } = renderIntegrations();

    let out: unknown;
    await act(async () => {
      out = await result.current.getBusinessCatalog(instanceName, number, 10, 'cur-1');
    });

    expect(out).toBe(page);
  });

  it('updateBlockStatus devolve o retorno da edge function e confirma no toast', async () => {
    h.invoke.mockResolvedValue({ data: { ok: true }, error: null });
    const { result } = renderIntegrations();

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
    const { result } = renderIntegrations();

    await act(async () => {
      await expect(result.current.deleteChatwoot(instanceName)).rejects.toThrow(
        'instance (instanceName) é obrigatório para esta ação.',
      );
    });

    expect(h.toast.error).toHaveBeenCalledWith('instance (instanceName) é obrigatório para esta ação.');
  });

  it('leitura pura com erro sobe a exceção sem toast (quem lê trata o erro)', async () => {
    h.invoke.mockResolvedValue({
      data: { error: true, message: 'Sem permissão para listar chats.' },
      error: null,
    });
    const { result } = renderIntegrations();

    await act(async () => {
      await expect(result.current.findChats(instanceName)).rejects.toThrow('Sem permissão para listar chats.');
    });

    expect(h.toast.error).not.toHaveBeenCalled();
    expect(h.toast.success).not.toHaveBeenCalled();
  });

  it('data.error precisa ser true (booleano): payload com error false resolve normalmente', async () => {
    h.invoke.mockResolvedValue({ data: { error: false, data: [{ id: 'lbl-1' }] }, error: null });
    const { result } = renderIntegrations();

    let out: unknown;
    await act(async () => {
      out = await result.current.findLabels(instanceName);
    });

    expect(out).toEqual({ error: false, data: [{ id: 'lbl-1' }] });
  });

  it('falha de rede sobe o erro e o item de mutação avisa no toast', async () => {
    h.invoke.mockResolvedValue({ data: null, error: new Error('network down') });
    const { result } = renderIntegrations();

    await act(async () => {
      await expect(result.current.removeProfilePicture(instanceName)).rejects.toThrow('network down');
    });

    expect(h.toast.error).toHaveBeenCalledWith('network down');
  });

  it.fails('403 da edge function mostra no toast a mensagem pt-BR do servidor, não o texto técnico do supabase-js', async () => {
    h.invoke.mockResolvedValue({
      data: null,
      error: functionsHttpError('Sem permissão para configurar o template desta conexão.', 403),
    });
    const { result } = renderIntegrations();

    await act(async () => {
      await result.current
        .createTemplate(instanceName, { name: 'boas-vindas' })
        .catch(() => undefined);
    });

    expect(h.toast.error).toHaveBeenCalledWith('Sem permissão para configurar o template desta conexão.');
  });
});

describe('concorrência: dedupe só em leitura (method GET)', () => {
  it('duas leituras iguais em voo viram UMA viagem e as duas recebem o mesmo resultado', async () => {
    const gate = deferred<{ data: unknown; error: unknown }>();
    h.invoke.mockReturnValueOnce(gate.promise);
    const { result } = renderIntegrations();

    let p1!: Promise<unknown>;
    let p2!: Promise<unknown>;
    await act(async () => {
      p1 = result.current.findChats(instanceName, 1, 0);
      p2 = result.current.findChats(instanceName, 1, 0);
    });

    expect(h.invoke).toHaveBeenCalledTimes(1);

    const chats = [{ id: 'chat-1' }];
    let r1: unknown;
    let r2: unknown;
    await act(async () => {
      gate.resolve({ data: chats, error: null });
      [r1, r2] = await Promise.all([p1, p2]);
    });

    expect(r1).toBe(chats);
    expect(r2).toBe(chats);
    expect(h.invoke).toHaveBeenCalledTimes(1);
  });

  it('leituras iguais com argumentos DIFERENTES não são confundidas (paginação/offset entram na chave)', async () => {
    const { result } = renderIntegrations();

    await act(async () => {
      await Promise.all([
        result.current.findChats(instanceName, 1, 0),
        result.current.findChats(instanceName, 2, 100),
      ]);
    });

    expect(h.invoke).toHaveBeenCalledTimes(2);
    expect(h.invoke.mock.calls.map((c) => (c[1] as { body: { page: number } }).body.page)).toEqual([1, 2]);
  });

  it('mutação (POST) nunca deduplica: o mesmo handleLabel em voo vira duas viagens', async () => {
    const gate = deferred<{ data: unknown; error: unknown }>();
    h.invoke.mockReturnValueOnce(gate.promise).mockReturnValueOnce(gate.promise);
    const { result } = renderIntegrations();

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
    const { result } = renderIntegrations();

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
    const { result } = renderIntegrations();

    await act(async () => {
      await expect(result.current.getChatwoot(instanceName)).rejects.toThrow('rede caiu');
      await expect(result.current.getChatwoot(instanceName)).resolves.toEqual([{ id: 'c1' }]);
    });

    expect(h.invoke).toHaveBeenCalledTimes(2);
  });
});

describe('limites e dado malformado', () => {
  it('paginação no limite inferior (page 0, offset 0) é enviada como veio, sem arredondar', async () => {
    const { result } = renderIntegrations();

    await act(async () => {
      await result.current.findMessages(instanceName, `${number}@s.whatsapp.net`, 0, 0, 0, 0);
    });

    expect((h.invoke.mock.calls[0][1] as { body: unknown }).body).toEqual({
      instanceName,
      remoteJid: `${number}@s.whatsapp.net`,
      page: 0,
      offset: 0,
      timestampStart: 0,
      timestampEnd: 0,
    });
  });

  it('oferta de chamada com duração e vídeo explícitos', async () => {
    const { result } = renderIntegrations();

    await act(async () => {
      await result.current.offerCall(instanceName, number, false, 0);
    });

    expect((h.invoke.mock.calls[0][1] as { body: unknown }).body).toEqual({
      instanceName,
      number,
      isVideo: false,
      callDuration: 0,
    });
  });

  it('leitura com payload vazio (data null) resolve null, sem lançar', async () => {
    const { result } = renderIntegrations();

    let out: unknown = 'sentinela';
    await act(async () => {
      out = await result.current.getTypebot(instanceName);
    });

    expect(out).toBeNull();
  });

  it.todo(
    'templateData/config com chave `instanceName` não deveria sobrescrever a instância do argumento (hoje o spread do chamador vence em createTemplate/setProxy/setEvoAI/setN8N/setPusher)',
  );
});
