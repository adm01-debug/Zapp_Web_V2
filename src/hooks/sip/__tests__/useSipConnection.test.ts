import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { toast } from 'sonner';

type StateListener = (state: string) => void;
const mockRegisterStateListeners: StateListener[] = [];
// T15: as opções passadas ao `register` (para exercitar o `onReject` do 403).
type RegisterOptions = { requestDelegate?: { onReject?: (response: { message: { statusCode: number } }) => void } };
const mockRegisterCalls: Array<RegisterOptions | undefined> = [];
const mockUaInstances: Array<{ start: ReturnType<typeof vi.fn>; stop: ReturnType<typeof vi.fn>; transport: { onDisconnect: (() => void) | null } }> = [];
// R2-CALL-004: as instâncias de Registerer ficam acessíveis para simular erro de teardown.
const mockRegistererInstances: Array<{ register: ReturnType<typeof vi.fn>; unregister: ReturnType<typeof vi.fn> }> = [];
let lastDelegate: { onInvite?: (invitation: unknown) => void } | undefined;

// Corrida connect/disconnect: os testes trocam estas impls para segurar
// `start()`/`register()` pendentes (deferred) e resolvê-los na hora certa.
function deferred<T = void>() {
  let resolve!: (value: T | PromiseLike<T>) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((res, rej) => { resolve = res; reject = rej; });
  return { promise, resolve, reject };
}
const defaultRegisterImpl = (options?: RegisterOptions) => {
  mockRegisterCalls.push(options);
  return Promise.resolve();
};
let startImpl: () => Promise<unknown> = () => Promise.resolve();
let registerImpl: (options?: RegisterOptions) => Promise<unknown> = defaultRegisterImpl;

vi.mock('sip.js', () => {
  return {
    UserAgent: class {
      static makeURI(uri: string) {
        if (uri.includes('invalid')) return null;
        return { host: 'test.server.com' };
      }
      configuration = { uri: { host: 'test.server.com' } };
      transport: { onDisconnect: (() => void) | null } = { onDisconnect: null };
      start = vi.fn(() => startImpl());
      stop = vi.fn().mockResolvedValue(undefined);
      constructor(options: { delegate?: { onInvite?: (invitation: unknown) => void } }) {
        lastDelegate = options.delegate;
        mockUaInstances.push(this);
      }
    },
    Registerer: class {
      stateChange = {
        addListener: (fn: StateListener) => { mockRegisterStateListeners.push(fn); },
      };
      register = vi.fn((options?: RegisterOptions) => registerImpl(options));
      unregister = vi.fn().mockResolvedValue(undefined);
      constructor() { mockRegistererInstances.push(this); }
    },
  };
});

vi.mock('sonner', () => ({
  toast: { success: vi.fn(), error: vi.fn(), info: vi.fn() },
}));

// T20: o hook consulta a eleição de aba (`tabLeaderStore`) no topo do `connect`.
// Aqui o store é MOCKADO para o teste poder alternar o papel de forma
// determinística (o store REAL é um singleton de módulo com timers — o teste
// dele, com `vi.resetModules()`, vive em `src/lib/calls/__tests__/tabLeaderStore.test.ts`).
// O gate é provado pelo PAR: com `isLeader()` falso nenhum UA nasce e, virando
// verdadeiro, o MESMO connect volta a registrar — logo o portão lê o valor vivo.
const { mockIsLeader } = vi.hoisted(() => ({ mockIsLeader: vi.fn(() => true) }));

vi.mock('@/lib/calls/tabLeaderStore', () => ({
  CALL_SESSION_CHANNEL_NAME: 'zapp-call-session',
  getSnapshot: () => ({ role: 'leader', leaderId: 'tab', expiresAt: null, tabId: 'tab' }),
  subscribe: () => () => {},
  claimLeadership: vi.fn(),
  releaseLeadership: vi.fn(),
  isLeader: mockIsLeader,
}));

import { useSipConnection } from '../useSipConnection';

describe('useSipConnection', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // `clearAllMocks` não devolve a implementação: um teste que deixou a aba
    // como seguidora envenenaria os seguintes.
    mockIsLeader.mockReturnValue(true);
    mockRegisterStateListeners.length = 0;
    mockRegisterCalls.length = 0;
    mockUaInstances.length = 0;
    mockRegistererInstances.length = 0;
    startImpl = () => Promise.resolve();
    registerImpl = defaultRegisterImpl;
    lastDelegate = undefined;
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('registers the incoming-invitation delegate on connect', async () => {
    const onIncomingInvitation = vi.fn();
    const { result } = renderHook(() => useSipConnection(onIncomingInvitation));
    await act(async () => {
      await result.current.connect({ server: 'test.com', user: 'user1', password: 'pass' });
    });
    expect(lastDelegate?.onInvite).toBeInstanceOf(Function);
    lastDelegate?.onInvite?.({ fake: 'invitation' });
    expect(onIncomingInvitation).toHaveBeenCalledWith({ fake: 'invitation' });
  });

  it('T15: 403 no REGISTER vira "linha em uso por outro usuário" (não erro genérico)', async () => {
    const { result } = renderHook(() => useSipConnection());
    await act(async () => {
      await result.current.connect({ server: 'test.com', user: 'user1', password: 'pass' });
    });
    const onReject = mockRegisterCalls[0]?.requestDelegate?.onReject;
    expect(onReject).toBeInstanceOf(Function);
    await act(async () => { onReject?.({ message: { statusCode: 403 } }); });
    expect(result.current.sipStatus).toBe('unavailable');
    expect(result.current.sipReason).toBe('line_in_use_other_user');
    expect(toast.error).toHaveBeenCalledWith('Linha em uso por outro usuário');
  });

  it('T15: resposta que não é 403 não vira "linha em uso"', async () => {
    const { result } = renderHook(() => useSipConnection());
    await act(async () => {
      await result.current.connect({ server: 'test.com', user: 'user1', password: 'pass' });
    });
    await act(async () => {
      mockRegisterCalls[0]?.requestDelegate?.onReject?.({ message: { statusCode: 500 } });
    });
    expect(result.current.sipReason).toBeNull();
    expect(toast.error).not.toHaveBeenCalledWith('Linha em uso por outro usuário');
  });

  it('does not attempt to reconnect after an intentional disconnect', async () => {
    vi.useFakeTimers();
    const { result } = renderHook(() => useSipConnection());
    await act(async () => {
      await result.current.connect({ server: 'test.com', user: 'user1', password: 'pass' });
    });

    await act(async () => {
      await result.current.disconnect();
    });

    const ua = mockUaInstances[0];
    // Um disconnect posterior do transporte (ex.: rede caiu após o stop já
    // ter sido chamado) não deve reagendar reconexão nem redisparar connect().
    act(() => { ua.transport.onDisconnect?.(); });
    const startCallsBefore = mockUaInstances.length;

    act(() => { vi.advanceTimersByTime(60000); });

    expect(mockUaInstances.length).toBe(startCallsBefore);
    vi.useRealTimers();
  });

  it('clears a pending reconnect timer when disconnect is called mid-backoff', async () => {
    vi.useFakeTimers();
    const { result } = renderHook(() => useSipConnection());
    await act(async () => {
      await result.current.connect({ server: 'test.com', user: 'user1', password: 'pass' });
    });

    const ua = mockUaInstances[0];
    act(() => { ua.transport.onDisconnect?.(); }); // agenda uma tentativa de reconexão
    expect(result.current.sipStatus).toBe('reconnecting');

    await act(async () => { await result.current.disconnect(); });
    const uaCountAfterDisconnect = mockUaInstances.length;

    // Se o timer de reconexão não tivesse sido limpo, isto criaria um novo UserAgent.
    act(() => { vi.advanceTimersByTime(60000); });
    expect(mockUaInstances.length).toBe(uaCountAfterDisconnect);

    vi.useRealTimers();
  });

  it('T16: connect() com um UA vivo não cria um segundo UserAgent', async () => {
    const { result } = renderHook(() => useSipConnection());
    await act(async () => {
      await result.current.connect({ server: 'test.com', user: 'user1', password: 'pass' });
    });
    const uaCount = mockUaInstances.length;

    await act(async () => {
      await result.current.connect({ server: 'test.com', user: 'user1', password: 'pass' });
    });

    expect(mockUaInstances.length).toBe(uaCount);
  });

  it('T16: unmount durante o backoff não cria UserAgent', async () => {
    vi.useFakeTimers();
    const { result, unmount } = renderHook(() => useSipConnection());
    await act(async () => {
      await result.current.connect({ server: 'test.com', user: 'user1', password: 'pass' });
    });

    act(() => { mockUaInstances[0].transport.onDisconnect?.(); });
    expect(result.current.sipStatus).toBe('reconnecting');
    const uaCount = mockUaInstances.length;

    // O painel saiu da tela com o retry agendado: ele NÃO pode criar um
    // UserAgent órfão (o servidor só aceita um ramal por vez).
    unmount();
    await act(async () => { vi.advanceTimersByTime(120000); });

    expect(mockUaInstances.length).toBe(uaCount);
    vi.useRealTimers();
  });

  it('T16: 6ª falha seguida vira "unavailable" e para de tentar', async () => {
    vi.useFakeTimers();
    const { result } = renderHook(() => useSipConnection());
    await act(async () => {
      await result.current.connect({ server: 'test.com', user: 'user1', password: 'pass' });
    });

    for (let i = 0; i < 6; i++) {
      const ua = mockUaInstances[mockUaInstances.length - 1];
      act(() => { ua.transport.onDisconnect?.(); });
      if (i < 5) {
        expect(result.current.sipStatus).toBe('reconnecting');
        await act(async () => { vi.advanceTimersByTime(31000); });
      }
    }

    expect(result.current.sipStatus).toBe('unavailable');
    expect(toast.error).toHaveBeenCalledWith('Não foi possível reconectar ao servidor VoIP.');
    const uaCount = mockUaInstances.length;
    await act(async () => { vi.advanceTimersByTime(120000); });
    expect(mockUaInstances.length).toBe(uaCount);
    vi.useRealTimers();
  });

  // === Corrida connect/disconnect: uma única tentativa em voo ===

  it('duas chamadas de connect() em paralelo criam um único UserAgent e um único Registerer', async () => {
    const start = deferred();
    startImpl = () => start.promise;
    const { result } = renderHook(() => useSipConnection());
    const config = { server: 'test.com', user: 'user1', password: 'pass' };

    let first!: Promise<void>;
    await act(async () => { first = result.current.connect(config); });
    expect(mockUaInstances.length).toBe(1);

    let second!: Promise<void>;
    await act(async () => { second = result.current.connect(config); });
    await act(async () => { start.resolve(); await Promise.all([first, second]); });

    expect(mockUaInstances.length).toBe(1);
    expect(mockRegistererInstances.length).toBe(1);
    expect(mockRegisterCalls.length).toBe(1);
  });

  it('disconnect() durante start() invalida a tentativa: refs nulos, estado idle e UA parado', async () => {
    const start = deferred();
    startImpl = () => start.promise;
    const { result } = renderHook(() => useSipConnection());
    const config = { server: 'test.com', user: 'user1', password: 'pass' };

    let pending!: Promise<void>;
    await act(async () => { pending = result.current.connect(config); });
    expect(mockUaInstances.length).toBe(1);

    await act(async () => { await result.current.disconnect(); });
    expect(result.current.sipStatus).toBe('idle');

    const ua = mockUaInstances[0];
    await act(async () => { start.resolve(); await pending; });

    expect(ua.stop).toHaveBeenCalled();
    expect(mockRegistererInstances.length).toBe(0);
    expect(result.current.uaRef.current).toBeNull();
    expect(result.current.sipStatus).toBe('idle');
  });

  it('disconnect() durante register() invalida a tentativa: refs nulos, estado idle e UA parado', async () => {
    const reg = deferred();
    registerImpl = (options) => { mockRegisterCalls.push(options); return reg.promise; };
    const { result } = renderHook(() => useSipConnection());
    const config = { server: 'test.com', user: 'user1', password: 'pass' };

    let pending!: Promise<void>;
    await act(async () => { pending = result.current.connect(config); });
    expect(mockRegistererInstances.length).toBe(1);

    await act(async () => { await result.current.disconnect(); });
    expect(result.current.sipStatus).toBe('idle');

    const ua = mockUaInstances[0];
    const registerer = mockRegistererInstances[0];
    await act(async () => { reg.resolve(); await pending; });

    expect(registerer.unregister).toHaveBeenCalled();
    expect(ua.stop).toHaveBeenCalled();
    expect(result.current.uaRef.current).toBeNull();
    expect(result.current.sipStatus).toBe('idle');
  });

  it('disconnect() durante register() rejeitado limpa Registerer e UA sem sair de idle', async () => {
    vi.useFakeTimers();
    const reg = deferred();
    registerImpl = (options) => { mockRegisterCalls.push(options); return reg.promise; };
    const { result } = renderHook(() => useSipConnection());
    const config = { server: 'test.com', user: 'user1', password: 'pass' };

    let pending!: Promise<void>;
    await act(async () => { pending = result.current.connect(config); });
    expect(mockRegistererInstances.length).toBe(1);

    await act(async () => { await result.current.disconnect(); });
    const ua = mockUaInstances[0];
    const registerer = mockRegistererInstances[0];
    await act(async () => { reg.reject(new Error('register tardio falhou')); await pending; });

    expect(registerer.unregister).toHaveBeenCalled();
    expect(ua.stop).toHaveBeenCalled();
    expect(result.current.uaRef.current).toBeNull();
    expect(result.current.sipStatus).toBe('idle');
    expect(toast.error).not.toHaveBeenCalled();

    act(() => { ua.transport.onDisconnect?.(); });
    expect(result.current.sipStatus).toBe('idle');
    expect(toast.info).not.toHaveBeenCalled();
    act(() => { vi.advanceTimersByTime(60000); });
    expect(mockUaInstances.length).toBe(1);
    vi.useRealTimers();
  });

  it('após um connect() invalidado por disconnect(), um novo connect() cria uma única tentativa válida', async () => {
    const start = deferred();
    startImpl = () => start.promise;
    const { result } = renderHook(() => useSipConnection());
    const config = { server: 'test.com', user: 'user1', password: 'pass' };

    let pending!: Promise<void>;
    await act(async () => { pending = result.current.connect(config); });
    await act(async () => { await result.current.disconnect(); });
    await act(async () => { start.resolve(); await pending; });
    expect(result.current.uaRef.current).toBeNull();

    await act(async () => { await result.current.connect(config); });

    expect(mockUaInstances.length).toBe(2);
    expect(mockRegistererInstances.length).toBe(1);
    expect(result.current.uaRef.current).toBe(mockUaInstances[1]);
    expect(result.current.sipStatus).toBe('connecting');
  });

  it('start() rejeitado de tentativa cancelada não apaga os refs do connect() novo', async () => {
    const start = deferred();
    startImpl = () => start.promise;
    const { result } = renderHook(() => useSipConnection());
    const config = { server: 'test.com', user: 'user1', password: 'pass' };

    let pending!: Promise<void>;
    await act(async () => { pending = result.current.connect(config); });
    expect(mockUaInstances.length).toBe(1);
    await act(async () => { await result.current.disconnect(); });

    startImpl = () => Promise.resolve();
    await act(async () => { await result.current.connect(config); });
    expect(result.current.uaRef.current).toBe(mockUaInstances[1]);

    await act(async () => { start.reject(new Error('start tardio falhou')); await pending; });

    expect(mockUaInstances[0].stop).toHaveBeenCalled();
    expect(result.current.uaRef.current).toBe(mockUaInstances[1]);
    expect(result.current.sipStatus).not.toBe('unavailable');
  });

  it('erro numa tentativa VÁLIDA continua virando "unavailable" (a guarda não engole o erro)', async () => {
    startImpl = () => Promise.reject(new Error('transporte caiu'));
    const { result } = renderHook(() => useSipConnection());
    const config = { server: 'test.com', user: 'user1', password: 'pass' };

    await act(async () => { await result.current.connect(config); });

    expect(result.current.uaRef.current).toBeNull();
    expect(result.current.sipStatus).toBe('unavailable');
    expect(toast.error).toHaveBeenCalledWith('Erro ao conectar VoIP: transporte caiu');
  });

  // === T20: eleição de aba — só a líder registra ===

  it('T20: aba SEGUIDORA não registra — nenhum UserAgent nasce e o motivo fica "outra aba"', async () => {
    mockIsLeader.mockReturnValue(false);
    const { result } = renderHook(() => useSipConnection());

    await act(async () => {
      await result.current.connect({ server: 'test.com', user: 'user1', password: 'pass' });
    });

    // Prova de que o portão CONSULTA o store (e não bloqueia por acaso).
    expect(mockIsLeader).toHaveBeenCalled();
    expect(mockUaInstances.length).toBe(0);
    expect(mockRegisterCalls.length).toBe(0);
    expect(result.current.sipStatus).toBe('idle');
    expect(result.current.sipReason).toBe('line_in_use_other_tab');
  });

  it('T20: o portão lê o valor VIVO — a mesma aba, virando líder, registra', async () => {
    mockIsLeader.mockReturnValue(false);
    const { result } = renderHook(() => useSipConnection());

    await act(async () => {
      await result.current.connect({ server: 'test.com', user: 'user1', password: 'pass' });
    });
    expect(mockUaInstances.length).toBe(0);

    // A eleição terminou nesta aba (a anterior saiu): agora é líder.
    mockIsLeader.mockReturnValue(true);
    await act(async () => {
      await result.current.connect({ server: 'test.com', user: 'user1', password: 'pass' });
    });

    expect(mockUaInstances.length).toBe(1);
    expect(result.current.sipStatus).toBe('connecting');
  });
  // === R2-CALL-004: o contrato desconectar -> reconectar nao pode reusar UA encerrado ===

  it('R2-CALL-004: connect -> disconnect -> connect cria um NOVO UserAgent', async () => {
    const { result } = renderHook(() => useSipConnection());

    await act(async () => {
      await result.current.connect({ server: 'test.com', user: 'user1', password: 'pass' });
    });
    expect(mockUaInstances.length).toBe(1);

    await act(async () => { await result.current.disconnect(); });

    // O UA parado tem de sair das refs: sem isso o `connect` abaixo morre na
    // guarda `if (uaRef.current) return` e a linha nunca volta.
    expect(result.current.uaRef.current).toBeNull();
    expect(result.current.sipStatus).toBe('idle');

    await act(async () => {
      await result.current.connect({ server: 'test.com', user: 'user1', password: 'pass' });
    });

    expect(mockUaInstances.length).toBe(2);
    expect(mockUaInstances[1].start).toHaveBeenCalledTimes(1);
    // O UA novo e o que fica retido (e nao o encerrado).
    expect(result.current.uaRef.current).toBe(mockUaInstances[1]);
  });

  it('R2-CALL-004: erro no teardown nao prende os refs (reconexao continua possivel)', async () => {
    const { result } = renderHook(() => useSipConnection());

    await act(async () => {
      await result.current.connect({ server: 'test.com', user: 'user1', password: 'pass' });
    });
    expect(mockUaInstances.length).toBe(1);
    const oldOnDisconnect = mockUaInstances[0].transport.onDisconnect;

    // unregister estoura durante a desconexao (ex.: transporte ja morto).
    mockRegistererInstances[0].unregister.mockRejectedValueOnce(new Error('teardown boom'));

    await act(async () => { await result.current.disconnect(); });

    expect(mockUaInstances[0].stop).toHaveBeenCalledTimes(1);
    expect(mockUaInstances[0].transport.onDisconnect).toEqual(expect.any(Function));
    expect(mockUaInstances[0].transport.onDisconnect).not.toBe(oldOnDisconnect);
    expect(result.current.uaRef.current).toBeNull();
    expect(result.current.sipStatus).toBe('idle');

    await act(async () => {
      await result.current.connect({ server: 'test.com', user: 'user1', password: 'pass' });
    });

    expect(mockUaInstances.length).toBe(2);
  });
});
