/**
 * Testes de `src/hooks/system/useSecurityPushNotifications.ts`.
 *
 * Cobre os dois caminhos de aviso de alerta de segurança — notificação push
 * (permissão concedida + inscrito) e o fallback por toast —, o polling de 20 s
 * sobre `security_alerts` (com o filtro por `created_at` do último check) e as
 * mensagens vindas do service worker.
 *
 * A fronteira dublada é o cliente Supabase (rede/banco), o módulo de push, o
 * `useAuth`, o `sonner` e o `navigator.serviceWorker`. O hook é o código real.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';

type Filtro = [op: string, column: string, value: unknown];
type Consulta = { table: string; filters: Filtro[]; order: string | null; ascending: boolean };

const mocks = vi.hoisted(() => ({
  user: { id: 'user-1' } as { id: string } | null,
  permission: 'granted' as string,
  isSubscribed: true,
  showNotification: vi.fn(),
  from: vi.fn(),
  consultas: [] as Consulta[],
  alertas: [] as Array<Record<string, unknown>>,
  erroPoll: null as unknown,
  toastError: vi.fn(),
  toastWarning: vi.fn(),
  toastInfo: vi.fn(),
  logDebug: vi.fn(),
}));

vi.mock('@/integrations/supabase/client', () => ({
  supabase: { from: (...args: unknown[]) => mocks.from(...args) },
}));

vi.mock('@/hooks/auth/useAuth', () => ({
  useAuth: () => ({ user: mocks.user }),
}));

vi.mock('@/hooks/system/usePushNotifications', () => ({
  usePushNotifications: () => ({
    isSubscribed: mocks.isSubscribed,
    permission: mocks.permission,
    showNotification: mocks.showNotification,
  }),
}));

vi.mock('sonner', () => ({
  toast: {
    error: (...args: unknown[]) => mocks.toastError(...args),
    warning: (...args: unknown[]) => mocks.toastWarning(...args),
    info: (...args: unknown[]) => mocks.toastInfo(...args),
    success: vi.fn(),
  },
}));

vi.mock('@/lib/logger', () => ({
  log: {
    debug: (...args: unknown[]) => mocks.logDebug(...args),
    error: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
  },
}));

import { useSecurityPushNotifications } from '@/hooks/system/useSecurityPushNotifications';

const T0 = '2026-10-07T12:00:00.000Z';

interface AlertaFixture {
  [chave: string]: unknown;
  id: string;
  user_id: string;
  alert_type: string;
  severity: string;
  title: string;
  description: string | null;
  ip_address: string | null;
  created_at: string;
  is_resolved: boolean;
}

const ALERTA_CRITICO: AlertaFixture = {
  id: 'al-1',
  user_id: 'user-1',
  alert_type: 'brute_force',
  severity: 'critical',
  title: 'Tentativa de acesso em massa',
  description: 'Várias tentativas de login',
  ip_address: '203.0.113.9',
  created_at: T0,
  is_resolved: false,
};

function alerta(over: Partial<AlertaFixture>): AlertaFixture {
  return { ...ALERTA_CRITICO, ...over };
}

/** Handlers registrados pelo hook no `navigator.serviceWorker`. */
const swHandlers: Array<(event: MessageEvent) => void> = [];
const fakeServiceWorker = {
  addEventListener: vi.fn((type: string, handler: (event: MessageEvent) => void) => {
    if (type === 'message') swHandlers.push(handler);
  }),
  removeEventListener: vi.fn((type: string, handler: (event: MessageEvent) => void) => {
    const i = swHandlers.indexOf(handler);
    if (i >= 0) swHandlers.splice(i, 1);
  }),
};

beforeEach(() => {
  vi.clearAllMocks();
  vi.useFakeTimers();
  vi.setSystemTime(new Date(T0));
  mocks.user = { id: 'user-1' };
  mocks.permission = 'granted';
  mocks.isSubscribed = true;
  mocks.alertas = [];
  mocks.erroPoll = null;
  mocks.consultas = [];
  swHandlers.length = 0;
  Object.defineProperty(navigator, 'serviceWorker', {
    value: fakeServiceWorker,
    configurable: true,
  });

  // Mini-PostgREST: aplica eq/gt e a ordenação sobre os alertas do teste.
  mocks.from.mockImplementation((table: string) => {
    const consulta: Consulta = { table, filters: [], order: null, ascending: true };
    mocks.consultas.push(consulta);

    const resolver = () => {
      if (mocks.erroPoll) return Promise.resolve({ data: null, error: mocks.erroPoll });
      let rows = mocks.alertas.slice();
      for (const [op, col, val] of consulta.filters) {
        if (op === 'eq') rows = rows.filter((r) => r[col] === val);
        if (op === 'gt') rows = rows.filter((r) => String(r[col]) > String(val));
      }
      if (consulta.order) {
        const col = consulta.order;
        rows.sort((a, b) => {
          if (String(a[col]) === String(b[col])) return 0;
          return (String(a[col]) < String(b[col]) ? -1 : 1) * (consulta.ascending ? 1 : -1);
        });
      }
      return Promise.resolve({ data: rows, error: null });
    };

    const builder: Record<string, unknown> = {};
    builder.select = vi.fn(() => builder);
    builder.eq = vi.fn((col: string, val: unknown) => {
      consulta.filters.push(['eq', col, val]);
      return builder;
    });
    builder.gt = vi.fn((col: string, val: unknown) => {
      consulta.filters.push(['gt', col, val]);
      return builder;
    });
    builder.order = vi.fn((col: string, opts?: { ascending?: boolean }) => {
      consulta.order = col;
      consulta.ascending = opts?.ascending !== false;
      return builder;
    });
    builder.then = (res: (v: unknown) => unknown, rej: (e: unknown) => unknown) =>
      resolver().then(res, rej);
    return builder;
  });
});

afterEach(() => {
  vi.useRealTimers();
});

describe('useSecurityPushNotifications — envio do alerta', () => {
  it('com push disponível envia notificação com IP, urgência e vibração longa', async () => {
    const { result } = renderHook(() => useSecurityPushNotifications());

    await act(async () => {
      await result.current.sendSecurityNotification(ALERTA_CRITICO);
    });

    expect(mocks.showNotification).toHaveBeenCalledTimes(1);
    expect(mocks.showNotification).toHaveBeenCalledWith({
      title: '🔐 Tentativa de acesso em massa',
      body: 'Várias tentativas de login (IP: 203.0.113.9)',
      tag: 'security-al-1',
      requireInteraction: true,
      data: {
        alertId: 'al-1',
        alertType: 'brute_force',
        severity: 'critical',
        category: 'security',
      },
      vibrate: [300, 100, 300, 100, 300],
    });
    expect(mocks.toastError).not.toHaveBeenCalled();
    expect(result.current.isEnabled).toBe(true);
  });

  it('severidade baixa não exige interação e usa vibração curta', async () => {
    const { result } = renderHook(() => useSecurityPushNotifications());

    await act(async () => {
      await result.current.sendSecurityNotification(
        alerta({ id: 'al-2', severity: 'low', title: 'Login novo', ip_address: null }),
      );
    });

    expect(mocks.showNotification).toHaveBeenCalledWith(
      expect.objectContaining({
        title: '🔐 Login novo',
        body: 'Várias tentativas de login',
        requireInteraction: false,
        vibrate: [200, 100, 200],
        tag: 'security-al-2',
      }),
    );
  });

  it('descrição ausente cai no texto padrão', async () => {
    const { result } = renderHook(() => useSecurityPushNotifications());

    await act(async () => {
      await result.current.sendSecurityNotification(
        alerta({ id: 'al-3', description: null, severity: 'medium' }),
      );
    });

    expect(mocks.showNotification).toHaveBeenCalledWith(
      expect.objectContaining({
        body: 'Alerta de segurança detectado (IP: 203.0.113.9)',
        requireInteraction: false,
      }),
    );
  });

  it('permissão negada cai no toast de erro, sem tentar push', async () => {
    mocks.permission = 'denied';
    const { result } = renderHook(() => useSecurityPushNotifications());

    await act(async () => {
      await result.current.sendSecurityNotification(ALERTA_CRITICO);
    });

    expect(mocks.showNotification).not.toHaveBeenCalled();
    expect(mocks.toastError).toHaveBeenCalledWith('Tentativa de acesso em massa', {
      description: 'Várias tentativas de login',
    });
    expect(result.current.isEnabled).toBe(false);
  });

  it('sem inscrição no push (mesmo com permissão) cai no toast: medium vira warning', async () => {
    mocks.isSubscribed = false;
    const { result } = renderHook(() => useSecurityPushNotifications());

    await act(async () => {
      await result.current.sendSecurityNotification(alerta({ severity: 'medium' }));
    });

    expect(mocks.showNotification).not.toHaveBeenCalled();
    expect(mocks.toastWarning).toHaveBeenCalledWith('Tentativa de acesso em massa', {
      description: 'Várias tentativas de login',
    });
    expect(mocks.toastError).not.toHaveBeenCalled();
  });

  it('severidade informativa vira toast de informação', async () => {
    mocks.isSubscribed = false;
    const { result } = renderHook(() => useSecurityPushNotifications());

    await act(async () => {
      await result.current.sendSecurityNotification(
        alerta({ severity: 'low', description: null }),
      );
    });

    expect(mocks.toastInfo).toHaveBeenCalledWith('Tentativa de acesso em massa', {
      description: undefined,
    });
    expect(mocks.toastWarning).not.toHaveBeenCalled();
  });
});

describe('useSecurityPushNotifications — polling de security_alerts', () => {
  it('consulta a cada 20 s filtrando o próprio usuário e os não resolvidos', async () => {
    const { unmount } = renderHook(() => useSecurityPushNotifications());

    await act(async () => {
      await vi.advanceTimersByTimeAsync(20_000);
    });

    expect(mocks.consultas).toHaveLength(1);
    expect(mocks.consultas[0].table).toBe('security_alerts');
    expect(mocks.consultas[0].filters).toEqual([
      ['eq', 'user_id', 'user-1'],
      ['eq', 'is_resolved', false],
      ['gt', 'created_at', T0],
    ]);
    expect(mocks.consultas[0].order).toBe('created_at');
    expect(mocks.consultas[0].ascending).toBe(true);
    unmount();
  });

  it('notifica cada alerta novo da janela, na ordem cronológica', async () => {
    mocks.alertas = [
      alerta({ id: 'al-10', severity: 'low', title: 'Segundo', created_at: '2026-10-07T12:00:15.000Z' }),
      alerta({ id: 'al-9', severity: 'critical', title: 'Primeiro', created_at: '2026-10-07T12:00:05.000Z' }),
    ];
    const { unmount } = renderHook(() => useSecurityPushNotifications());

    await act(async () => {
      await vi.advanceTimersByTimeAsync(20_000);
    });

    expect(mocks.showNotification.mock.calls.map((c) => (c[0] as { title: string }).title)).toEqual([
      '🔐 Primeiro',
      '🔐 Segundo',
    ]);
    unmount();
  });

  it('alerta anterior ao início do monitoramento não é notificado', async () => {
    mocks.alertas = [
      alerta({ id: 'al-antigo', created_at: '2026-10-07T11:59:00.000Z' }),
      alerta({ id: 'al-novo', created_at: '2026-10-07T12:00:10.000Z' }),
    ];
    const { unmount } = renderHook(() => useSecurityPushNotifications());

    await act(async () => {
      await vi.advanceTimersByTimeAsync(20_000);
    });

    const tags = mocks.showNotification.mock.calls.map((c) => (c[0] as { tag: string }).tag);
    expect(tags).toEqual(['security-al-novo']);
    unmount();
  });

  it('erro no polling não notifica e NÃO avança a janela (nada é pulado)', async () => {
    mocks.erroPoll = { code: '42501', message: 'permission denied for table security_alerts' };
    const { unmount } = renderHook(() => useSecurityPushNotifications());

    await act(async () => {
      await vi.advanceTimersByTimeAsync(20_000);
    });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(20_000);
    });

    expect(mocks.showNotification).not.toHaveBeenCalled();
    expect(mocks.logDebug).toHaveBeenCalledWith(
      'Security alerts poll error:',
      expect.objectContaining({ code: '42501' }),
    );
    expect(mocks.consultas).toHaveLength(2);
    // As DUAS consultas usam a mesma janela: o erro não engole o intervalo.
    expect(mocks.consultas.map((c) => c.filters[2])).toEqual([
      ['gt', 'created_at', T0],
      ['gt', 'created_at', T0],
    ]);
    unmount();
  });

  it('polling bem-sucedido avança a janela para o instante da resposta', async () => {
    const { unmount } = renderHook(() => useSecurityPushNotifications());

    await act(async () => {
      await vi.advanceTimersByTimeAsync(20_000);
    });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(20_000);
    });

    expect(mocks.consultas).toHaveLength(2);
    expect(mocks.consultas[0].filters[2]).toEqual(['gt', 'created_at', T0]);
    // 20 s de relógio falso: a segunda janela começa onde a primeira terminou.
    expect(mocks.consultas[1].filters[2]).toEqual(['gt', 'created_at', '2026-10-07T12:00:20.000Z']);
    unmount();
  });

  it('sem usuário logado nenhum polling é armado', async () => {
    mocks.user = null;
    const { unmount } = renderHook(() => useSecurityPushNotifications());

    await act(async () => {
      await vi.advanceTimersByTimeAsync(60_000);
    });

    expect(mocks.consultas).toHaveLength(0);
    expect(mocks.logDebug).not.toHaveBeenCalledWith(
      'Setting up security alerts polling for user:',
      expect.anything(),
    );
    unmount();
  });

  it('desmontar limpa o intervalo (nenhuma consulta depois)', async () => {
    const { unmount } = renderHook(() => useSecurityPushNotifications());

    await act(async () => {
      await vi.advanceTimersByTimeAsync(20_000);
    });
    expect(mocks.consultas).toHaveLength(1);

    unmount();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(60_000);
    });

    expect(mocks.consultas).toHaveLength(1);
  });
});

describe('useSecurityPushNotifications — mensagens do service worker', () => {
  it('SECURITY_ACTION leva o usuário para a Central de Segurança', async () => {
    const { unmount } = renderHook(() => useSecurityPushNotifications());
    expect(swHandlers).toHaveLength(1);

    swHandlers[0]({ data: { type: 'SECURITY_ACTION' } } as MessageEvent);

    expect(mocks.toastInfo).toHaveBeenCalledWith('Redirecionando para Central de Segurança...');
    expect(mocks.toastError).not.toHaveBeenCalled();
    unmount();
  });

  it('clique em notificação de segurança abre os detalhes; outro tipo é ignorado', async () => {
    const { unmount } = renderHook(() => useSecurityPushNotifications());

    swHandlers[0]({
      data: { type: 'NOTIFICATION_CLICK', data: { category: 'security' } },
    } as MessageEvent);
    expect(mocks.toastInfo).toHaveBeenCalledWith('Abrindo detalhes do alerta...');

    mocks.toastInfo.mockClear();
    swHandlers[0]({
      data: { type: 'NOTIFICATION_CLICK', data: { category: 'marketing' } },
    } as MessageEvent);
    expect(mocks.toastInfo).not.toHaveBeenCalled();
    unmount();
  });

  it('desmontar remove o listener do service worker', async () => {
    const { unmount } = renderHook(() => useSecurityPushNotifications());
    expect(swHandlers).toHaveLength(1);

    unmount();

    expect(swHandlers).toHaveLength(0);
    expect(fakeServiceWorker.removeEventListener).toHaveBeenCalledWith('message', expect.any(Function));
  });
});

describe('useSecurityPushNotifications — defeitos encontrados (não corrigidos neste cartão)', () => {
  // BUG: o handler lê `event.data.type` direto. `postMessage(null)` (ou um
  // worker sem payload) entrega `event.data === null` e o handler estoura com
  // TypeError — a exceção sobe como erro não tratado dentro do listener.
  it.fails('mensagem do service worker sem payload não deveria derrubar o handler', () => {
    renderHook(() => useSecurityPushNotifications());
    expect(swHandlers).toHaveLength(1);

    expect(() => swHandlers[0]({ data: null } as unknown as MessageEvent)).not.toThrow();
  });
});
