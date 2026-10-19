/**
 * Kit completo para testar alertas de comportamento
 * Usado pelos testes de useAlerts e useNotifications
 */
import { vi } from 'vitest';

// Spys do logger
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

/**
 * Retorna os mocks padrão para o modulo @lib/logger
 */
export function loggerMock() {
  return {
    getLogger: () => loggerSpies,
    log: loggerSpies,
    createLogger: () => loggerSpies,
  };
}

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
      getSession: vi.fn().resolvedValue({ data: { session: { user: { id: 'test-user' } } } }),
    },
  };

  return { mockSupabaseChannel, mockSupabase };
}
