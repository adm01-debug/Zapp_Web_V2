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
export const sonnerToast = { error: vi.fn(), success: vi.fn(), info: vi.fn() };
export const invoke = vi.fn();

/** Resultado do dedupe de notificacoes; o teste pode desligar para cobrir o caminho silencioso. */
export const dedupeResult = { valor: true };

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

  return {
    supabase: {
      channel: () => canal,
      removeChannel: vi.fn(),
      functions: { invoke: (...args: unknown[]) => invoke(...args) },
      from: () => ({
        select: () => ({
          eq: () => ({
            maybeSingle: async () => ({ data: contactRow, error: null }),
            single: async () => ({ data: contactRow, error: null }),
          }),
          order: () => ({ limit: async () => ({ data: [], error: null }) }),
        }),
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
  const logger = () => ({ debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() });
  return { getLogger: logger, log: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() } };
}

export function toastMock() {
  return { toast };
}

export function dedupeMock() {
  return { claimNotificationEvent: () => dedupeResult.valor };
}

export function sonnerMock() {
  return { toast: sonnerToast };
}

export function resetAlertKit() {
  playNotificationSound.mockClear();
  showBrowserNotification.mockClear();
  invoke.mockClear();
  sonnerToast.error.mockClear();
  sonnerToast.info.mockClear();
  dedupeResult.valor = true;
  callbacks.length = 0;
  settingsCfg.soundEnabled = true;
  settingsCfg.newMessageSound = true;
  settingsCfg.slaBreachSound = true;
  settingsCfg.mentionSound = true;
  settingsCfg.soundVolume = 55;
  settingsCfg.quietHours = false;
}
