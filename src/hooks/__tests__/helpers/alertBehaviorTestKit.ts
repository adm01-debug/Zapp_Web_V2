/**
 * Kit completo para testar alertas de comportamento.
 *
 * Exporta:
 *  - Estado mutável controlado pelos testes (callbacks, slaRulesQuery, etc.)
 *  - Spies reutilizáveis (playNotificationSound, sonnerToast, etc.)
 *  - resetAlertKit() para limpar entre testes
 *  - Fábricas de mock chamadas por alertMocks.ts e alertContactMock.ts via vi.mock()
 */
import { vi } from 'vitest';

// ──────────────────────────────────────────────────────────
// Estado mutável — controlado diretamente pelos testes
// ──────────────────────────────────────────────────────────

/** Callbacks do Realtime coletados quando .on() é chamado. */
export const callbacks: Array<(payload: unknown) => Promise<void> | void> = [];

/** Topics dos canais criados via supabase.channel(topic). */
export const channelTopics: string[] = [];

/** Controla a consulta sla_rules. */
export const slaRulesQuery: { rows: unknown[]; erro: Error | null } = { rows: [], erro: null };

/** Controla a consulta sla_configurations — suporta pausa (pendente). */
export const slaQuery: { pendente: boolean; liberar?: () => void } = { pendente: false };

/** Controla a consulta contacts. */
export const contactsQuery: { erro: Error | null } = { erro: null };

/** Registra chamadas a claimNotificationEvent. */
export const dedupeCalls: Array<{ key: string; ttlMs: number }> = [];

/** Controla o retorno de claimNotificationEvent. */
export const dedupeResult: { valor: boolean } = { valor: true };

// ──────────────────────────────────────────────────────────
// Spies — resetados por resetAlertKit()
// ──────────────────────────────────────────────────────────

export const playNotificationSound = vi.fn();
export const showBrowserNotification = vi.fn();
export const requestNotificationPermission = vi.fn().mockResolvedValue(true);
export const openContactChat = vi.fn();
export const removeChannel = vi.fn();
export const invoke = vi.fn();

export const sonnerToast = {
  error: vi.fn(),
  warning: vi.fn(),
  info: vi.fn(),
  success: vi.fn(),
  dismiss: vi.fn(),
};

export const loggerSpies = {
  error: vi.fn(),
  warn: vi.fn(),
  info: vi.fn(),
  debug: vi.fn(),
  withCorrelation: vi.fn(() => ({
    error: vi.fn(),
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
  })),
};

export const settingsCfg: {
  soundEnabled: boolean;
  mentionSound: boolean;
  browserNotifications: boolean;
  soundVolume: number;
  slaBreachSound: boolean;
  newMessageSound: boolean;
  sentimentAlertEnabled: boolean;
  messageSoundType: 'chime';
  mentionSoundType: 'bell';
  slaSoundType: 'alert';
  transcriptionSoundType: 'soft';
  quietHours?: boolean;
} = {
  soundEnabled: true,
  mentionSound: true,
  browserNotifications: false,
  soundVolume: 70,
  slaBreachSound: true,
  newMessageSound: true,
  sentimentAlertEnabled: true,
  messageSoundType: 'chime' as const,
  mentionSoundType: 'bell' as const,
  slaSoundType: 'alert' as const,
  transcriptionSoundType: 'soft' as const,
};

// ──────────────────────────────────────────────────────────
// Reset
// ──────────────────────────────────────────────────────────

export function resetAlertKit() {
  callbacks.length = 0;
  channelTopics.length = 0;
  dedupeCalls.length = 0;
  dedupeResult.valor = true;
  slaRulesQuery.rows = [];
  slaRulesQuery.erro = null;
  slaQuery.pendente = false;
  slaQuery.liberar = undefined;
  contactsQuery.erro = null;

  playNotificationSound.mockReset();
  showBrowserNotification.mockReset();
  requestNotificationPermission.mockReset().mockResolvedValue(true);
  openContactChat.mockReset();
  removeChannel.mockReset();
  invoke.mockReset();

  sonnerToast.error.mockReset();
  sonnerToast.warning.mockReset();
  sonnerToast.info.mockReset();
  sonnerToast.success.mockReset();
  sonnerToast.dismiss.mockReset();

  loggerSpies.error.mockReset();
  loggerSpies.warn.mockReset();
  loggerSpies.info.mockReset();
  loggerSpies.debug.mockReset();
  loggerSpies.withCorrelation.mockReset().mockReturnValue({
    error: vi.fn(),
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
  });

  Object.assign(settingsCfg, {
    soundEnabled: true,
    mentionSound: true,
    browserNotifications: false,
    soundVolume: 70,
    slaBreachSound: true,
    newMessageSound: true,
    sentimentAlertEnabled: true,
    messageSoundType: 'chime',
    mentionSoundType: 'bell',
    slaSoundType: 'alert',
    transcriptionSoundType: 'soft',
    quietHours: undefined,
  });
}

// ──────────────────────────────────────────────────────────
// Supabase query builder (PromiseLike + fluent chain)
// ──────────────────────────────────────────────────────────

function makeQueryBuilder(table: string) {
  let resolvePromise!: (r: { data: unknown; error: unknown }) => void;
  const promise = new Promise<{ data: unknown; error: unknown }>((res) => {
    resolvePromise = res;
  });

  // Schedule resolution on next microtask so hooks can set up the query first
  Promise.resolve().then(() => {
    if (table === 'sla_rules') {
      if (slaRulesQuery.erro) {
        resolvePromise({ data: null, error: { message: slaRulesQuery.erro.message } });
      } else {
        resolvePromise({ data: slaRulesQuery.rows, error: null });
      }
    } else if (table === 'sla_configurations') {
      if (slaQuery.pendente) {
        slaQuery.liberar = () =>
          resolvePromise({ data: [{ first_response_minutes: 30 }], error: null });
      } else {
        resolvePromise({ data: [{ first_response_minutes: 30 }], error: null });
      }
    } else if (table === 'contacts') {
      if (contactsQuery.erro) {
        resolvePromise({ data: null, error: { message: contactsQuery.erro.message } });
      } else {
        resolvePromise({
          data: [
            {
              name: 'Contato Teste',
              phone: '11999999999',
              company: null,
              job_title: null,
              contact_type: null,
              queue_id: null,
              assigned_to: null,
            },
          ],
          error: null,
        });
      }
    } else {
      resolvePromise({ data: [], error: null });
    }
  });

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const self: any = {
    select: () => self,
    eq: () => self,
    neq: () => self,
    in: () => self,
    is: () => self,
    not: () => self,
    filter: () => self,
    single: () => self,
    maybeSingle: () => self,
    order: () => self,
    limit: () => self,
    range: () => self,
    ilike: () => self,
    abortSignal: () => self,
    then: (
      onFulfilled?: (v: { data: unknown; error: unknown }) => unknown,
      onRejected?: (e: unknown) => unknown,
    ) => promise.then(onFulfilled, onRejected),
    catch: (onRejected?: (e: unknown) => unknown) => promise.catch(onRejected),
  };
  return self;
}

// ──────────────────────────────────────────────────────────
// Mock factories (chamadas por alertMocks.ts via vi.mock async)
// ──────────────────────────────────────────────────────────

export function notificationSoundsMock() {
  return {
    playNotificationSound,
    previewSound: vi.fn(),
    requestNotificationPermission,
    showBrowserNotification,
  };
}

const _mockChannel = {
  on: vi.fn(
    (_event: string, _filter: unknown, cb: (payload: unknown) => void) => {
      callbacks.push(cb);
      return _mockChannel;
    },
  ),
  subscribe: vi.fn(() => _mockChannel),
  unsubscribe: vi.fn(),
};

const _mockSupabase = {
  channel: vi.fn((topic: string) => {
    channelTopics.push(topic);
    return _mockChannel;
  }),
  removeChannel,
  auth: {
    getSession: vi.fn().mockResolvedValue({
      data: { session: { user: { id: 'test-user' } } },
      error: null,
    }),
  },
  functions: { invoke },
  from: vi.fn((table: string) => makeQueryBuilder(table)),
};

export function supabaseMock() {
  return {
    supabase: _mockSupabase,
    SUPABASE_URL: 'http://localhost:54321',
    SUPABASE_ANON_KEY: 'mock-anon-key',
    GOOGLE_OAUTH_ENABLED: false,
  };
}

export function authMock() {
  return {
    useAuth: () => ({
      user: { id: 'test-user', email: 'test@example.com' },
      session: null,
      signOut: vi.fn(),
      loading: false,
    }),
  };
}

export function loggerMock() {
  return {
    getLogger: () => loggerSpies,
    log: loggerSpies,
    createLogger: () => loggerSpies,
  };
}

export function dedupeMock() {
  return {
    claimNotificationEvent: (key: string, ttlMs = 120_000) => {
      dedupeCalls.push({ key, ttlMs });
      return dedupeResult.valor;
    },
  };
}

export function sonnerMock() {
  return {
    toast: sonnerToast,
    Toaster: () => null,
  };
}

export function toastMock() {
  return {
    useToast: () => ({ toast: vi.fn() }),
  };
}

export function settingsMock() {
  return {
    useNotificationSettings: () => ({
      settings: settingsCfg,
      isQuietHours: () => Boolean(settingsCfg.quietHours),
    }),
  };
}

export function sendProductMock() {
  return {
    openContactChat,
    useSendProduct: () => ({ send: vi.fn() }),
  };
}

// Backwards compat
export function createAlertBehaviorTestKit() {
  const mockSupabaseChannel = {
    on: vi.fn(() => mockSupabaseChannel),
    subscribe: vi.fn(() => mockSupabaseChannel),
    unsubscribe: vi.fn(),
  };
  const mockSupabase = {
    channel: vi.fn(() => mockSupabaseChannel),
    removeChannel: vi.fn(),
    auth: {
      getSession: vi.fn().mockResolvedValue({ data: { session: { user: { id: 'test-user' } } } }),
    },
  };
  return { mockSupabaseChannel, mockSupabase };
}
