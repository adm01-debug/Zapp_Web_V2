/**
 * Kit compartilhado dos testes de COMPORTAMENTO dos alertas.
 *
 * Motivo de existir: os três arquivos repetiam o mesmo andaime de mocks e o portão de qualidade
 * do Sonar (duplicação em código novo) passou de 3% para 10,9%. Aqui fica o andaime; cada teste
 * guarda só o que é dele — o gatilho e a asserção.
 */
import { vi } from 'vitest';

export const playNotificationSound = vi.fn();
export const showBrowserNotification = vi.fn();
export const requestNotificationPermission = vi.fn();
export const toast = vi.fn();
export const sonnerToast = { error: vi.fn(), success: vi.fn(), info: vi.fn(), warning: vi.fn() };
export const invoke = vi.fn();
/** Ação "Abrir conversa" dos toasts — o clique precisa levar o CONTATO_ID, não só o rótulo. */
export const openContactChat = vi.fn();
/** `supabase.removeChannel`: prova que a assinatura NÃO é derrubada no re-render. */
export const removeChannel = vi.fn();
/** Tópicos pedidos a `supabase.channel`, na ordem — prova o canal único por montagem. */
export const channelTopics: string[] = [];
/** Spies estáveis do logger: o teste confere o que foi registrado (erro sem dado pessoal). */
export const loggerSpies = { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() };
/** Quando preenchido, a consulta a `contacts` rejeita — prova o try/catch do handler. */
export const contactsQuery: { erro: Error | null } = { erro: null };
/** Com `pendente`, a consulta a `sla_configurations` só responde quando o teste chamar `liberar()`. */
export const slaQuery: { pendente: boolean; liberar: (() => void) | null } = {
  pendente: false,
  liberar: null,
};
/** Regras devolvidas pela consulta a `sla_rules` (a política `notify_on_warning` vem delas). */
export const slaRulesQuery: { rows: unknown[]; erro: Error | null } = { rows: [], erro: null };

/** Resultado do dedupe de notificacoes; o teste pode desligar para cobrir o caminho silencioso. */
export const dedupeResult = { valor: true };

/** Chamadas do dedupe, com a chave e o TTL — é o que prova a janela de 24h. */
export const dedupeCalls: Array<{ key: string; ttlMs?: number }> = [];

/** Callbacks entregues pelos canais do Realtime, na ordem em que foram registrados. */
export const callbacks: Array<(payload: unknown) => unknown> = [];

/** Ajustes do painel lidos pelo `useNotificationSettings`; o teste mexe no que importa. */
export const settingsCfg: Record<string, unknown> = {
  soundEnabled: true,
  browserNotifications: false,
  messageSoundType: 'chime',
  newMessageSound: true,
  slaBreachSound: true,
  slaSoundType: 'alert',
  mentionSound: true,
  mentionSoundType: 'ping',
  soundVolume: 55,
  transcriptionNotificationEnabled: true,
  transcriptionSoundType: 'soft',
  /** Horário de silêncio: mutável, para o teste abrir a janela DEPOIS do mount. */
  quietHours: false,
};

/** Linha devolvida pelas consultas em `contacts`. */
export const contactRow: Record<string, unknown> = { name: 'Fulano', phone: '1199' };

export function notificationSoundsMock() {
  return {
    playNotificationSound: (...args: unknown[]) => playNotificationSound(...args),
    showBrowserNotification: (...args: unknown[]) => showBrowserNotification(...args),
    requestNotificationPermission: (...args: unknown[]) => requestNotificationPermission(...args),
  };
}

export function settingsMock() {
  return {
    // `isQuietHours` lê o flag a cada chamada (e não uma constante `false`): é assim que o
    // teste consegue abrir a janela de silêncio DEPOIS do mount e provar que o alerta não
    // fica congelado com o valor da montagem.
    useNotificationSettings: () => ({
      settings: settingsCfg,
      isQuietHours: () => settingsCfg.quietHours === true,
    }),
  };
}

export function supabaseMock() {
  const canal: Record<string, unknown> = {};
  canal.on = (_evt: string, _cfg: unknown, cb: (payload: unknown) => unknown) => {
    callbacks.push(cb);
    return canal;
  };
  canal.subscribe = () => ({ unsubscribe: vi.fn() });

  /** Resposta por tabela — o mesmo veredito serve para `maybeSingle()`, `single()` e o `await` da cadeia. */
  const responder = async (tabela: string) => {
    if (tabela === 'contacts' && contactsQuery.erro) throw contactsQuery.erro;
    if (tabela === 'sla_configurations' && slaQuery.pendente) {
      await new Promise<void>((resolve) => {
        slaQuery.liberar = resolve;
      });
    }
    if (tabela === 'sla_rules') {
      if (slaRulesQuery.erro) return { data: null, error: slaRulesQuery.erro };
      return { data: slaRulesQuery.rows, error: null };
    }
    return { data: contactRow, error: null };
  };

  /** Construtor encadeável: `.select().eq().order()` aguardado devolve a resposta da tabela. */
  const chain = (tabela: string): Record<string, unknown> => {
    const builder: Record<string, unknown> = {
      eq: () => builder,
      order: () => builder,
      maybeSingle: () => responder(tabela),
      single: () => responder(tabela),
      then: (resolve: (v: unknown) => unknown, reject: (e: unknown) => unknown) =>
        responder(tabela).then(resolve, reject),
    };
    return builder;
  };

  return {
    supabase: {
      channel: (topico: string) => {
        channelTopics.push(topico);
        return canal;
      },
      removeChannel,
      functions: { invoke: (...args: unknown[]) => invoke(...args) },
      from: (tabela: string) => ({
        select: () => chain(tabela),
        insert: async () => ({ error: null }),
        update: () => ({ eq: async () => ({ error: null }) }),
      }),
    },
  };
}

export function authMock() {
  return { useAuth: () => ({ user: { id: 'u1' } }) };
}

export function loggerMock() {
  return { getLogger: () => loggerSpies, log: loggerSpies, createLogger: () => loggerSpies };
}

export function toastMock() {
  return { toast };
}

/** Mock da ação "Abrir conversa"; registrado só pelos testes que a exercitam (o de sentimento usa a real). */
export function sendProductMock() {
  return { openContactChat: (...args: unknown[]) => openContactChat(...args) };
}

export function dedupeMock() {
  return {
    claimNotificationEvent: (key: string, ttlMs?: number) => {
      dedupeCalls.push({ key, ttlMs });
      return dedupeResult.valor;
    },
  };
}

export function sonnerMock() {
  return { toast: sonnerToast };
}

export function resetAlertKit() {
  playNotificationSound.mockClear();
  showBrowserNotification.mockClear();
  invoke.mockClear();
  openContactChat.mockClear();
  removeChannel.mockClear();
  loggerSpies.debug.mockClear();
  loggerSpies.info.mockClear();
  loggerSpies.warn.mockClear();
  loggerSpies.error.mockClear();
  channelTopics.length = 0;
  contactsQuery.erro = null;
  slaQuery.pendente = false;
  slaQuery.liberar = null;
  slaRulesQuery.rows = [];
  slaRulesQuery.erro = null;
  sonnerToast.error.mockClear();
  sonnerToast.info.mockClear();
  sonnerToast.warning.mockClear();
  dedupeResult.valor = true;
  dedupeCalls.length = 0;
  callbacks.length = 0;
  settingsCfg.soundEnabled = true;
  settingsCfg.newMessageSound = true;
  settingsCfg.slaBreachSound = true;
  settingsCfg.mentionSound = true;
  settingsCfg.soundVolume = 55;
  settingsCfg.quietHours = false;
}
