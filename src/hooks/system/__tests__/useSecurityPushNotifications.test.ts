/**
 * Testes de `src/hooks/system/useSecurityPushNotifications.ts`.
 *
 * Cobre os dois caminhos de aviso de alerta de segurança — notificação push
 * (permissão concedida + inscrito) e o fallback por toast —, o polling de 20 s
 * sobre `security_alerts` (cursor pelo `created_at`/`id` do ÚLTIMO alerta
 * recebido, relógio do servidor) e as mensagens vindas do service worker.
 *
 * HZ1-10: o cursor não usa mais o relógio do navegador — os testes de relógio
 * adiantado e atrasado provam que ele não pula nem repete alerta.
 *
 * A fronteira dublada é o cliente Supabase (rede/banco), o módulo de push, o
 * `useAuth`, o `sonner` e o `navigator.serviceWorker`. O hook é o código real.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';

type Filtro = [op: string, column: string, value: unknown];

/** Cursor composto do polling: `created_at` + `id` (desempate). */
type Cursor = { createdAt: string; id: string };

type Consulta = {
  table: string;
  select: string | null;
  filters: Filtro[];
  cursor: Cursor | null;
  orders: Array<[string, boolean]>;
  limit: number | null;
};

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
  createLogger: () => ({
    debug: (...args: unknown[]) => mocks.logDebug(...args),
    error: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
  }),
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

/** Filtros `eq`/`gt` e o `or` do cursor composto, aplicados sobre a fixture. */
function aplicarFiltros(rows: Array<Record<string, unknown>>, consulta: Consulta) {
  let out = rows.slice();
  for (const [op, col, val] of consulta.filters) {
    if (op === 'eq') out = out.filter((r) => r[col] === val);
    if (op === 'gt') out = out.filter((r) => String(r[col]) > String(val));
  }
  const c = consulta.cursor;
  if (c) {
    out = out.filter(
      (r) =>
        String(r.created_at) > c.createdAt ||
        (String(r.created_at) === c.createdAt && String(r.id) > c.id),
    );
  }
  for (let i = consulta.orders.length - 1; i >= 0; i -= 1) {
    const [col, ascending] = consulta.orders[i];
    out = out.slice().sort((a, b) => {
      if (String(a[col]) === String(b[col])) return 0;
      return (String(a[col]) < String(b[col]) ? -1 : 1) * (ascending ? 1 : -1);
    });
  }
  if (consulta.limit !== null) out = out.slice(0, consulta.limit);
  return out;
}

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

  // Mini-PostgREST: aplica eq/gt, o cursor composto, a ordenação e o limite.
  mocks.from.mockImplementation((table: string) => {
    const consulta: Consulta = {
      table,
      select: null,
      filters: [],
      cursor: null,
      orders: [],
      limit: null,
    };
    mocks.consultas.push(consulta);

    const resolver = () => {
      if (mocks.erroPoll) return Promise.resolve({ data: null, error: mocks.erroPoll });
      return Promise.resolve({ data: aplicarFiltros(mocks.alertas, consulta), error: null });
    };

    const builder: Record<string, unknown> = {};
    builder.select = vi.fn((cols: string) => {
      consulta.select = cols;
      return builder;
    });
    builder.eq = vi.fn((col: string, val: unknown) => {
      consulta.filters.push(['eq', col, val]);
      return builder;
    });
    builder.gt = vi.fn((col: string, val: unknown) => {
      consulta.filters.push(['gt', col, val]);
      return builder;
    });
    // `or('created_at.gt.<ts>,and(created_at.eq.<ts>,id.gt.<id>)')` — o cursor.
    builder.or = vi.fn((expr: string) => {
      const m = /^created_at\.gt\.([^,]+),and\(created_at\.eq\.([^,]+),id\.gt\.(.+)\)$/.exec(expr);
      if (!m) throw new Error(`expressão de cursor inesperada: ${expr}`);
      consulta.cursor = { createdAt: m[1], id: m[3] };
      return builder;
    });
    builder.order = vi.fn((col: string, opts?: { ascending?: boolean }) => {
      consulta.orders.push([col, opts?.ascending !== false]);
      return builder;
    });
    builder.limit = vi.fn((n: number) => {
      consulta.limit = n;
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

/** Deixa o ciclo do polling (mount imediato + timers) rodar. */
async function ciclo(ms = 0) {
  await act(async () => {
    if (ms > 0) await vi.advanceTimersByTimeAsync(ms);
    else await Promise.resolve();
  });
}

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

describe('useSecurityPushNotifications — cursor do polling (relógio do servidor)', () => {
  it('alerta anterior ao início do monitoramento não é notificado', async () => {
    // A linha de base é o alerta mais recente QUE JÁ EXISTE, lida no relógio do
    // servidor — é ela que impede o histórico de virar aviso na montagem.
    mocks.alertas = [
      alerta({ id: 'al-antigo', created_at: '2026-10-07T11:00:00.000Z' }),
      alerta({ id: 'al-recente', created_at: '2026-10-07T11:59:00.000Z' }),
    ];
    const { unmount } = renderHook(() => useSecurityPushNotifications());
    await ciclo();

    // Linha de base: o mais recente QUE JÁ EXISTE, pelo relógio do servidor.
    expect(mocks.consultas).toHaveLength(1);
    expect(mocks.consultas[0].table).toBe('security_alerts');
    expect(mocks.consultas[0].select).toBe('id, created_at');
    expect(mocks.consultas[0].filters).toEqual([
      ['eq', 'user_id', 'user-1'],
      ['eq', 'is_resolved', false],
    ]);
    expect(mocks.consultas[0].orders).toEqual([
      ['created_at', false],
      ['id', false],
    ]);
    expect(mocks.consultas[0].limit).toBe(1);
    // O histórico do usuário NÃO vira aviso: nada é notificado na montagem.
    expect(mocks.showNotification).not.toHaveBeenCalled();
    expect(mocks.toastInfo).not.toHaveBeenCalled();
    unmount();
  });

  it('consulta a cada 20 s filtrando o próprio usuário e os não resolvidos', async () => {
    mocks.alertas = [alerta({ id: 'al-base', created_at: T0 })];
    const { unmount } = renderHook(() => useSecurityPushNotifications());
    await ciclo();

    mocks.alertas = [
      ...mocks.alertas,
      alerta({ id: 'al-novo', created_at: '2026-10-07T12:00:10.000Z' }),
    ];
    await ciclo(20_000);

    // O escopo (dono + não resolvido) vale em TODAS as consultas do laço: na
    // linha de base e em cada ciclo. O que mudou foi o cursor, não o filtro.
    expect(mocks.consultas).toHaveLength(2);
    for (const consulta of mocks.consultas) {
      expect(consulta.table).toBe('security_alerts');
      expect(consulta.filters).toEqual([
        ['eq', 'user_id', 'user-1'],
        ['eq', 'is_resolved', false],
      ]);
    }
    unmount();
  });

  it('o ciclo seguinte consulta o que veio DEPOIS do último alerta recebido', async () => {
    mocks.alertas = [alerta({ id: 'al-base', created_at: '2026-10-07T12:00:00.000Z' })];
    const { unmount } = renderHook(() => useSecurityPushNotifications());
    await ciclo();

    mocks.alertas = [
      ...mocks.alertas,
      alerta({ id: 'al-novo', created_at: '2026-10-07T12:00:10.000Z' }),
    ];
    await ciclo(20_000);

    expect(mocks.consultas).toHaveLength(2);
    const janela = mocks.consultas[1];
    expect(janela.filters).toEqual([
      ['eq', 'user_id', 'user-1'],
      ['eq', 'is_resolved', false],
    ]);
    // Cursor composto: `created_at` do último recebido + `id` como desempate.
    expect(janela.cursor).toEqual({ createdAt: '2026-10-07T12:00:00.000Z', id: 'al-base' });
    expect(janela.orders).toEqual([
      ['created_at', true],
      ['id', true],
    ]);
    expect(mocks.showNotification).toHaveBeenCalledTimes(1);
    expect(mocks.showNotification).toHaveBeenCalledWith(
      expect.objectContaining({ tag: 'security-al-novo' }),
    );
    unmount();
  });

  it('notifica cada alerta novo da janela, na ordem cronológica', async () => {
    mocks.alertas = [alerta({ id: 'al-base', created_at: T0 })];
    const { unmount } = renderHook(() => useSecurityPushNotifications());
    await ciclo();

    mocks.alertas = [
      ...mocks.alertas,
      alerta({ id: 'al-10', severity: 'low', title: 'Segundo', created_at: '2026-10-07T12:00:15.000Z' }),
      alerta({ id: 'al-9', severity: 'critical', title: 'Primeiro', created_at: '2026-10-07T12:00:05.000Z' }),
    ];
    await ciclo(20_000);

    expect(mocks.showNotification.mock.calls.map((c) => (c[0] as { title: string }).title)).toEqual([
      '🔐 Primeiro',
      '🔐 Segundo',
    ]);
    unmount();
  });

  it('dois alertas no MESMO instante na fronteira: o desempate por id não perde o segundo', async () => {
    mocks.alertas = [alerta({ id: 'al-base', created_at: T0 })];
    const { unmount } = renderHook(() => useSecurityPushNotifications());
    await ciclo();

    // Mesmo `created_at` do cursor: só o `id` maior denuncia que é novo.
    mocks.alertas = [
      ...mocks.alertas,
      alerta({ id: 'zz-empate', title: 'Empatado', created_at: T0 }),
    ];
    await ciclo(20_000);

    expect(mocks.showNotification).toHaveBeenCalledTimes(1);
    expect(mocks.showNotification).toHaveBeenCalledWith(
      expect.objectContaining({ tag: 'security-zz-empate' }),
    );
    unmount();
  });

  it('relógio do navegador ADIANTADO 10 min não pula alerta (cursor é do servidor)', async () => {
    // O navegador acha que é 12:10; o servidor grava o alerta às 12:01.
    vi.setSystemTime(new Date('2026-10-07T12:10:00.000Z'));
    mocks.alertas = [alerta({ id: 'al-base', created_at: T0 })];
    const { unmount } = renderHook(() => useSecurityPushNotifications());
    await ciclo();

    mocks.alertas = [
      ...mocks.alertas,
      alerta({ id: 'al-servidor', title: 'Novo dispositivo', created_at: '2026-10-07T12:01:00.000Z' }),
    ];
    await ciclo(20_000);

    expect(mocks.showNotification).toHaveBeenCalledTimes(1);
    expect(mocks.showNotification).toHaveBeenCalledWith(
      expect.objectContaining({ tag: 'security-al-servidor' }),
    );
    unmount();
  });

  it('relógio do navegador ATRASADO 10 min não repete alerta já avisado', async () => {
    // O navegador acha que é 11:50; o alerta existe desde as 12:00 (servidor).
    vi.setSystemTime(new Date('2026-10-07T11:50:00.000Z'));
    mocks.alertas = [alerta({ id: 'al-existentes', title: 'Já existia', created_at: T0 })];
    const { unmount } = renderHook(() => useSecurityPushNotifications());
    await ciclo();

    mocks.alertas = [
      ...mocks.alertas,
      alerta({ id: 'al-depois', title: 'Depois do mount', created_at: '2026-10-07T12:00:30.000Z' }),
    ];
    await ciclo(20_000);

    const tags = mocks.showNotification.mock.calls.map((c) => (c[0] as { tag: string }).tag);
    expect(tags).toEqual(['security-al-depois']);
    unmount();
  });

  it('erro no polling não notifica e NÃO avança a janela (nada é pulado)', async () => {
    // A "janela" agora é o cursor do servidor: o erro não a move.
    mocks.alertas = [alerta({ id: 'al-base', created_at: T0 })];
    const { unmount } = renderHook(() => useSecurityPushNotifications());
    await ciclo();

    mocks.erroPoll = { code: '42501', message: 'permission denied for table security_alerts' };
    await ciclo(20_000);
    await ciclo(20_000);

    expect(mocks.showNotification).not.toHaveBeenCalled();
    expect(mocks.logDebug).toHaveBeenCalledWith(
      'Security alerts poll error:',
      expect.objectContaining({ code: '42501' }),
    );
    const janelas = mocks.consultas.slice(1);
    expect(janelas).toHaveLength(2);
    // As DUAS consultas usam o MESMO cursor: o erro não engole o intervalo.
    expect(janelas.map((c) => c.cursor)).toEqual([
      { createdAt: T0, id: 'al-base' },
      { createdAt: T0, id: 'al-base' },
    ]);
    unmount();
  });

  it('sem usuário logado nenhum polling é armado', async () => {
    mocks.user = null;
    const { unmount } = renderHook(() => useSecurityPushNotifications());
    await ciclo(60_000);

    expect(mocks.consultas).toHaveLength(0);
    expect(mocks.logDebug).not.toHaveBeenCalledWith(
      'Setting up security alerts polling for user:',
      expect.anything(),
    );
    unmount();
  });

  it('desmontar limpa o intervalo (nenhuma consulta depois)', async () => {
    mocks.alertas = [alerta({ id: 'al-base', created_at: T0 })];
    const { unmount } = renderHook(() => useSecurityPushNotifications());
    await ciclo();
    expect(mocks.consultas).toHaveLength(1);

    unmount();
    await ciclo(60_000);

    expect(mocks.consultas).toHaveLength(1);
  });

  it('dois pontos de montagem NÃO duplicam consulta nem aviso (um laço por usuário)', async () => {
    // O listener global (AppProviders) e a Central de Segurança montam o mesmo
    // hook: sem o laço compartilhado, o mesmo alerta viraria dois toasts.
    mocks.alertas = [alerta({ id: 'al-base', created_at: T0 })];
    const a = renderHook(() => useSecurityPushNotifications());
    const b = renderHook(() => useSecurityPushNotifications());
    await ciclo();
    expect(mocks.consultas).toHaveLength(1);

    mocks.alertas = [
      ...mocks.alertas,
      alerta({ id: 'al-unico', title: 'Uma vez só', created_at: '2026-10-07T12:00:09.000Z' }),
    ];
    await ciclo(20_000);

    expect(mocks.consultas).toHaveLength(2);
    expect(mocks.showNotification).toHaveBeenCalledTimes(1);
    expect(mocks.showNotification).toHaveBeenCalledWith(
      expect.objectContaining({ tag: 'security-al-unico' }),
    );
    b.unmount();
    // O segundo ponto de montagem saiu: o laço continua vivo pelo primeiro.
    mocks.alertas = [
      ...mocks.alertas,
      alerta({ id: 'al-depois', created_at: '2026-10-07T12:00:19.000Z' }),
    ];
    await ciclo(20_000);
    expect(mocks.consultas).toHaveLength(3);
    expect(mocks.showNotification).toHaveBeenCalledTimes(2);
    a.unmount();
    await ciclo(40_000);
    // Últimos consumidores fora: o laço para.
    expect(mocks.consultas).toHaveLength(3);
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

  it('com dois pontos de montagem o listener do service worker é registrado UMA vez', async () => {
    const a = renderHook(() => useSecurityPushNotifications());
    const b = renderHook(() => useSecurityPushNotifications());
    expect(swHandlers).toHaveLength(1);

    swHandlers[0]({ data: { type: 'SECURITY_ACTION' } } as MessageEvent);
    expect(mocks.toastInfo).toHaveBeenCalledTimes(1);

    b.unmount();
    expect(swHandlers).toHaveLength(1);
    a.unmount();
    expect(swHandlers).toHaveLength(0);
    expect(fakeServiceWorker.removeEventListener).toHaveBeenCalledWith('message', expect.any(Function));
  });
});
