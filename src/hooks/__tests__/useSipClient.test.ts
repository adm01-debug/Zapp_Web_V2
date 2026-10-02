import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import type { Invitation } from 'sip.js';

// A classe mockada de Invitation (abaixo) não tem a mesma assinatura de
// construtor da real (que exige UserAgent + IncomingInviteRequest) — o cast
// é só para satisfazer o typecheck contra os tipos reais do sip.js.
async function createMockInvitation(): Promise<Invitation> {
  const mod = await import('sip.js');
  return new (mod.Invitation as unknown as new () => Invitation)();
}

// Mock sip.js
const mockBye = vi.fn();
const mockCancel = vi.fn();
const mockInviterReject = vi.fn().mockResolvedValue(undefined);
const mockInvite = vi.fn().mockResolvedValue(undefined);
type StateListener = (state: string) => void;
const mockStateChangeListeners: StateListener[] = [];
const mockRegisterStateListeners: StateListener[] = [];
let lastOnInvite: ((invitation: unknown) => void) | undefined;
// T15: o teste prova que host/usuário/porta PROVISIONADOS chegam ao SIP —
// não só que `connect` foi chamado. `makeURI` recebe `sip:user@server` e o
// construtor do UserAgent recebe `wss://server:porta/ws`.
const mockMakeURI = vi.fn((uri: string) => uri);
let lastUserAgentOptions: { transportOptions?: { server?: string } } | undefined;

const mockSessionDescriptionHandler = {
  peerConnection: {
    getReceivers: vi.fn().mockReturnValue([]),
    getSenders: vi.fn().mockReturnValue([]),
  },
};

vi.mock('sip.js', () => {
  const SessionState = {
    Establishing: 'Establishing',
    Established: 'Established',
    Terminated: 'Terminated',
  };

  return {
    SessionState,
    UserAgent: class {
      static makeURI(uri: string) {
        mockMakeURI(uri);
        if (uri.includes('invalid')) return null;
        return { host: 'test.server.com' };
      }
      configuration = { uri: { host: 'test.server.com' } };
      transport: { onDisconnect: (() => void) | null } = { onDisconnect: null };
      start = vi.fn().mockResolvedValue(undefined);
      stop = vi.fn().mockResolvedValue(undefined);
      constructor(options: { delegate?: { onInvite?: (invitation: unknown) => void }; transportOptions?: { server?: string } }) {
        lastUserAgentOptions = options;
        lastOnInvite = options.delegate?.onInvite;
      }
    },
    Registerer: class {
      stateChange = {
        addListener: (fn: StateListener) => { mockRegisterStateListeners.push(fn); },
      };
      register = vi.fn().mockResolvedValue(undefined);
      unregister = vi.fn().mockResolvedValue(undefined);
    },
    Inviter: class MockInviter {
      // `Session.id` é o Call-ID — o T11 grava em `provider_call_id`.
      id = 'sip-call-1';
      state = 'Initial';
      sessionDescriptionHandler = mockSessionDescriptionHandler;
      stateChange = {
        addListener: (fn: (state: string) => void) => {
          mockStateChangeListeners.push((state: string) => { this.state = state; fn(state); });
        },
      };
      invite = mockInvite;
      bye = mockBye;
      cancel = mockCancel;
    },
    Invitation: class MockInvitation {
      id = 'invite-1';
      state = 'Initial';
      sessionDescriptionHandler = mockSessionDescriptionHandler;
      stateChange = {
        addListener: (fn: (state: string) => void) => {
          mockStateChangeListeners.push((state: string) => { this.state = state; fn(state); });
        },
      };
      remoteIdentity = { uri: { user: '5511988887777' }, displayName: '' };
      accept = vi.fn().mockResolvedValue(undefined);
      reject = mockInviterReject;
    },
    Web: {
      SessionDescriptionHandler: class {},
    },
  };
});

// T11: a persistência sai de `useCalls` e passa a ser a RPC `upsert_my_call`.
const { mockRpc } = vi.hoisted(() => ({ mockRpc: vi.fn() }));

function makeQueryBuilder(result: { data: unknown; error: unknown } = { data: [], error: null }) {
  const builder = {
    select: vi.fn(() => builder),
    or: vi.fn(() => builder),
    ilike: vi.fn(() => builder),
    eq: vi.fn(() => builder),
    limit: vi.fn(() => Promise.resolve(result)),
  };
  return builder;
}

const { mockFunctionsInvoke } = vi.hoisted(() => ({
  mockFunctionsInvoke: vi.fn().mockResolvedValue({
    data: { server: 'sip.test.com', user: 'phone1', wsPort: 8089, password: 'test-pass', profileId: 'prof-1' },
    error: null,
  }),
}));

vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    from: vi.fn(() => makeQueryBuilder()),
    functions: { invoke: mockFunctionsInvoke },
    rpc: mockRpc,
  },
}));

// Polyfill MediaStream for jsdom
globalThis.MediaStream = class MediaStream {
  addTrack() {}
  getTracks() { return []; }
} as unknown as typeof globalThis.MediaStream;

vi.mock('sonner', () => ({
  toast: { success: vi.fn(), error: vi.fn(), info: vi.fn() },
}));

// T20: a eleição de aba vem do `tabLeaderStore`. Aqui ele é MOCKADO (snapshot
// trocável) para o teste dirigir a transição de papel sem os timers/heartbeat do
// store REAL — o eleitor de verdade tem teste próprio com `vi.resetModules()` em
// `src/lib/calls/__tests__/tabLeaderStore.test.ts`. `isLeader` deriva do MESMO
// snapshot que `getSnapshot`, então o portão do `connect` e o papel observado
// pelo hook nunca divergem.
const { tabStore } = vi.hoisted(() => ({
  tabStore: {
    snapshot: {
      role: 'leader' as 'leader' | 'follower',
      leaderId: 'tab-propria' as string | null,
      expiresAt: null as number | null,
      tabId: 'tab-propria',
    },
  },
}));

vi.mock('@/lib/calls/tabLeaderStore', () => ({
  CALL_SESSION_CHANNEL_NAME: 'zapp-call-session',
  getSnapshot: () => tabStore.snapshot,
  subscribe: () => () => {},
  claimLeadership: vi.fn(),
  releaseLeadership: vi.fn(),
  isLeader: () => tabStore.snapshot.role === 'leader',
}));

import { useSipClient } from '../communication/useSipClient';
import type { CallEndOutcome } from '@/lib/calls/callStatus';
import { toast } from 'sonner';

/** Deixa a cadeia assíncrona do sink (contato + RPC) rodar até o fim. */
async function escoar(voltas = 12): Promise<void> {
  for (let i = 0; i < voltas; i += 1) await Promise.resolve();
}

/** Argumentos das chamadas a `upsert_my_call`, na ordem em que aconteceram. */
function gravacoes(): Array<Record<string, unknown>> {
  return mockRpc.mock.calls.map(([, args]) => args as Record<string, unknown>);
}

/** Monta o hook JÁ conectado (preâmbulo repetido da maioria dos testes). */
async function montarConectado(onEnd?: (outcome: CallEndOutcome) => void) {
  const utils = renderHook(() => useSipClient(onEnd));
  await act(async () => {
    await utils.result.current.connect({ server: 'test.com', user: 'user1', password: 'pass' });
  });
  return utils;
}

/** Monta o hook conectado E registrado. */
async function montarRegistrado(onEnd?: (outcome: CallEndOutcome) => void) {
  const utils = await montarConectado(onEnd);
  act(() => mockRegisterStateListeners.forEach(fn => fn('Registered')));
  return utils;
}

type Resultado = Awaited<ReturnType<typeof montarRegistrado>>['result'];

/** Disca e assenta as microtarefas (o registro sai antes do `invite()` resolver). */
async function discar(result: Resultado, numero = '5511999999999', voltas = 12) {
  await act(async () => {
    await result.current.makeCall(numero);
    await escoar(voltas);
  });
}

/** Leva o motor a um estado do SIP e assenta. */
async function evento(nome: 'Establishing' | 'Established' | 'Terminated') {
  await act(async () => {
    mockStateChangeListeners.forEach(fn => fn(nome));
    await escoar();
  });
}

/** O registro da chamada foi esta RPC idempotente, com estes campos `p_*`. */
function esperaRegistro(campos: Record<string, unknown>) {
  expect(mockRpc).toHaveBeenCalledWith('upsert_my_call', expect.objectContaining(campos));
}

describe('useSipClient', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Snapshot novo a cada teste: um teste que deixou a aba como seguidora não
    // pode envenenar o seguinte (o mock guarda estado no escopo do módulo).
    tabStore.snapshot = { role: 'leader', leaderId: 'tab-propria', expiresAt: null, tabId: 'tab-propria' };
    mockStateChangeListeners.length = 0;
    mockRegisterStateListeners.length = 0;
    mockRpc.mockResolvedValue({ data: 'call-1', error: null });
    mockFunctionsInvoke.mockResolvedValue({ data: { password: 'test-pass' }, error: null });
    lastOnInvite = undefined;
  });

  afterEach(() => {
    vi.restoreAllMocks();
    // T17: o gate instala um `navigator.mediaDevices` falso em alguns testes;
    // sem isto o microfone (que falha) vazaria para os testes seguintes.
    delete (navigator as { mediaDevices?: unknown }).mediaDevices;
  });

  // === CONNECTION TESTS ===

  it('should start with disconnected status', () => {
    const { result } = renderHook(() => useSipClient());
    expect(result.current.sipStatus).toBe('idle');
    expect(result.current.callStatus).toBe('idle');
    expect(result.current.isMuted).toBe(false);
    expect(result.current.callDuration).toBe(0);
    expect(result.current.currentNumber).toBe('');
  });

  it('should set connecting status when connect is called', async () => {
    const { result } = await montarConectado();
    expect(result.current.sipStatus).toBe('connecting');
  });

  it('should become registered when registerer fires Registered', async () => {
    const { result } = await montarConectado();
    act(() => {
      mockRegisterStateListeners.forEach(fn => fn('Registered'));
    });
    expect(result.current.sipStatus).toBe('registered');
    expect(toast.success).toHaveBeenCalledWith('VoIP conectado!');
  });

  it('should set disconnected when registerer fires Unregistered', async () => {
    const { result } = await montarConectado();
    act(() => {
      mockRegisterStateListeners.forEach(fn => fn('Registered'));
    });
    act(() => {
      mockRegisterStateListeners.forEach(fn => fn('Unregistered'));
    });
    expect(result.current.sipStatus).toBe('idle');
  });

  it('should disconnect properly', async () => {
    const { result } = await montarConectado();
    act(() => {
      mockRegisterStateListeners.forEach(fn => fn('Registered'));
    });
    expect(result.current.sipStatus).toBe('registered');

    await act(async () => {
      await result.current.disconnect();
    });
    expect(result.current.sipStatus).toBe('idle');
  });

  // === CREDENTIAL FETCH (connectWithStoredCredentials) ===

  it('happy path: usa o provisionamento da função (host/usuário/porta vêm do servidor)', async () => {
    mockFunctionsInvoke.mockResolvedValueOnce({
      data: { server: 'sip.prov.com', user: 'phone9', wsPort: 5066, password: 'secret123', profileId: 'p1' },
      error: null,
    });
    const { result } = renderHook(() => useSipClient());
    await act(async () => {
      await result.current.connectWithStoredCredentials();
    });
    expect(result.current.sipStatus).toBe('connecting');
    // T15: prova que os valores PROVISIONADOS chegam ao SIP — não só que conectou.
    expect(mockMakeURI).toHaveBeenCalledWith('sip:phone9@sip.prov.com');
    expect(lastUserAgentOptions?.transportOptions?.server).toBe('wss://sip.prov.com:5066/ws');
  });

  it('T15: função antiga (sem host/porta) avisa em vez de conectar com valor velho', async () => {
    mockFunctionsInvoke.mockResolvedValueOnce({ data: { password: 'secret123', profileId: 'p1' }, error: null });
    const { result } = renderHook(() => useSipClient());
    await act(async () => {
      await result.current.connectWithStoredCredentials();
    });
    expect(toast.error).toHaveBeenCalledWith(expect.stringContaining('desatualizada'));
    expect(result.current.sipStatus).toBe('idle');
    expect(mockMakeURI).not.toHaveBeenCalled();
  });

  it('shows SIP_PASSWORD config toast when invoke returns 503', async () => {
    mockFunctionsInvoke.mockResolvedValueOnce({
      data: null,
      error: { context: { status: 503, code: 'SIP_NOT_CONFIGURED' } },
    });
    const { result } = renderHook(() => useSipClient());
    await act(async () => {
      await result.current.connectWithStoredCredentials();
    });
    expect(toast.error).toHaveBeenCalledWith(expect.stringContaining('SIP_PASSWORD'));
    expect(result.current.sipStatus).toBe('idle');
  });

  it('shows a generic session toast for non-config invoke errors (401)', async () => {
    mockFunctionsInvoke.mockResolvedValueOnce({
      data: null,
      error: { context: { status: 401, code: 'UNAUTHORIZED' } },
    });
    const { result } = renderHook(() => useSipClient());
    await act(async () => {
      await result.current.connectWithStoredCredentials();
    });
    expect(toast.error).toHaveBeenCalledWith(expect.stringContaining('sessão'));
    expect(result.current.sipStatus).toBe('idle');
  });

  it('shows SIP_PASSWORD config toast when invoke returns no error but no password', async () => {
    mockFunctionsInvoke.mockResolvedValueOnce({ data: null, error: null });
    const { result } = renderHook(() => useSipClient());
    await act(async () => {
      await result.current.connectWithStoredCredentials();
    });
    expect(toast.error).toHaveBeenCalledWith(expect.stringContaining('SIP_PASSWORD'));
    expect(result.current.sipStatus).toBe('idle');
  });

  // === OUTBOUND CALL TESTS ===

  it('recusa a discagem sem conexão nenhuma (uaRef nulo)', async () => {
    const { result } = renderHook(() => useSipClient());
    await act(async () => {
      await result.current.makeCall('123');
    });
    expect(toast.error).toHaveBeenCalledWith('VoIP não conectado.');
    expect(result.current.callStatus).toBe('idle');
    expect(mockInvite).not.toHaveBeenCalled();
  });

  it('recusa a discagem com o UA criado mas ainda NÃO registrado', async () => {
    // Falso verde apontado pela auditoria adversarial: o teste acima monta o
    // hook DESCONECTADO, então `uaRef.current` é `null` e o que ele exercita é
    // o ramo `!ua` — o guard `registered === false` nunca era testado. Aqui o
    // UA existe (conexão em curso) e o 'Registered' nunca chega: é ESTE guard
    // que tem de recusar a chamada.
    const { result } = await montarConectado();
    expect(result.current.sipStatus).toBe('connecting');

    await act(async () => {
      await result.current.makeCall('123');
    });

    expect(toast.error).toHaveBeenCalledWith('VoIP não conectado.');
    expect(result.current.callStatus).toBe('idle');
    expect(mockInvite).not.toHaveBeenCalled();
  });

  it('should set calling status and register the call before the invite resolves', async () => {
    const { result } = await montarRegistrado();

    await discar(result);
    expect(result.current.callStatus).toBe('calling');
    expect(result.current.callDirection).toBe('outbound');
    expect(result.current.currentNumber).toBe('5511999999999');
    // T11: o registro é a RPC idempotente, com o canal e o Call-ID do convite.
    esperaRegistro({ p_direction: 'outbound', p_status: 'ringing', p_channel: 'voip', p_peer_number: '5511999999999', p_provider_call_id: 'sip-call-1' });
  });

  it('should transition to ringing on Establishing', async () => {
    const { result } = await montarRegistrado();

    await act(async () => {
      await result.current.makeCall('123');
    });

    act(() => {
      mockStateChangeListeners.forEach(fn => fn('Establishing'));
    });
    expect(result.current.callStatus).toBe('ringing');
  });

  it('should transition to active on Established, start timer and mark the call answered', async () => {
    vi.useFakeTimers();
    const { result } = await montarRegistrado();

    await act(async () => {
      await result.current.makeCall('123');
    });

    await evento('Established');
    expect(result.current.callStatus).toBe('active');
    // T11: a 2ª gravação é o atendimento, com o MESMO p_id da 1ª.
    const chamadas = gravacoes();
    expect(chamadas.map(c => c.p_status)).toEqual(['ringing', 'answered']);
    expect(chamadas[1].p_id).toBe(chamadas[0].p_id);
    expect(chamadas[1].p_answered_at).toEqual(expect.any(String));

    act(() => { vi.advanceTimersByTime(3000); });
    expect(result.current.callDuration).toBe(3);

    vi.useRealTimers();
  });

  it('registra a saída encerrada sem atendimento como ended/no_answer', async () => {
    const { result } = await montarRegistrado();

    await act(async () => {
      await result.current.makeCall('123');
      await escoar();
    });

    await evento('Terminated');

    // Saída não atendida: `ended` (só a ENTRADA perdida vira `missed`).
    const chamadas = gravacoes();
    const fim = chamadas[chamadas.length - 1];
    expect(fim).toMatchObject({ p_status: 'ended', p_end_reason: 'no_answer' });
    expect(fim?.p_ended_at).toEqual(expect.any(String));
    expect(fim?.p_talk_seconds).toBeUndefined(); // null → omitido (coalesce)
  });

  it('records the call as ended (not missed) when terminated after being answered', async () => {
    const { result } = await montarRegistrado();

    await act(async () => {
      await result.current.makeCall('123');
      await escoar();
    });
    await evento('Established');
    await evento('Terminated');

    const chamadas = gravacoes();
    expect(chamadas.map(c => c.p_status)).toEqual(['ringing', 'answered', 'ended']);
    expect(chamadas[2].p_id).toBe(chamadas[0].p_id);
    // T12: ninguém clicou em desligar — quem encerrou foi o outro lado.
    expect(chamadas[2]).toMatchObject({ p_end_reason: 'hangup_remote' });
    expect(chamadas[2].p_talk_seconds).toBeGreaterThanOrEqual(0);
    expect(chamadas[2].p_ended_at).toEqual(expect.any(String));
  });

  it('should cancel a pending invite on hangUp without waiting for the invite promise', async () => {
    // O invite() nunca resolve neste teste — hangUp() precisa achar a sessão
    // mesmo assim, porque ela é atribuída antes do await (corrige a corrida
    // em que um cancelamento rápido não encontrava sessão nenhuma).
    mockInvite.mockReturnValueOnce(new Promise(() => {}));
    const { result } = await montarRegistrado();

    act(() => { result.current.makeCall('123'); });
    await act(async () => { await Promise.resolve(); });

    act(() => { result.current.hangUp(); });
    expect(mockCancel).toHaveBeenCalled();
  });

  it('should not force idle immediately on hangUp of an active call — waits for Terminated', async () => {
    const { result } = await montarRegistrado();
    await act(async () => { await result.current.makeCall('123'); });
    await act(async () => {
      mockStateChangeListeners.forEach(fn => fn('Established'));
      await Promise.resolve();
    });

    act(() => { result.current.hangUp(); });
    expect(mockBye).toHaveBeenCalled();
    // bye() foi pedido, mas o estado só reflete o fim quando Terminated chegar.
    expect(result.current.callStatus).toBe('active');

    await act(async () => {
      mockStateChangeListeners.forEach(fn => fn('Terminated'));
      await Promise.resolve();
    });
    expect(result.current.callStatus).toBe('ended');
  });

  it('should handle hangUp gracefully with no active session', () => {
    const { result } = renderHook(() => useSipClient());
    act(() => { result.current.hangUp(); });
    expect(result.current.callStatus).toBe('idle');
    expect(result.current.isMuted).toBe(false);
  });

  // === MUTE / DTMF ===

  it('should start unmuted', () => {
    const { result } = renderHook(() => useSipClient());
    expect(result.current.isMuted).toBe(false);
  });

  it('should not crash toggleMute without active session', () => {
    const { result } = renderHook(() => useSipClient());
    act(() => { result.current.toggleMute(); });
    expect(result.current.isMuted).toBe(false);
  });

  it('should not crash sendDTMF without active session', () => {
    const { result } = renderHook(() => useSipClient());
    act(() => { result.current.sendDTMF('1'); });
  });

  it('should reject a second makeCall while one is already in progress', async () => {
    const { result } = await montarRegistrado();

    await act(async () => { await result.current.makeCall('111'); });
    await act(async () => { await result.current.makeCall('222'); });

    expect(toast.error).toHaveBeenCalledWith('Já existe uma chamada em andamento.');
    expect(result.current.currentNumber).toBe('111');
  });

  it('should clean up the interval timer on unmount', () => {
    vi.useFakeTimers();
    const { unmount } = renderHook(() => useSipClient());
    unmount();
    vi.useRealTimers();
  });

  it('congela a duração quando a chamada termina (lacuna da auditoria de 29/09)', async () => {
    // O cronômetro tem de PARAR em Terminated. Sem isto, a duração continua
    // subindo depois de desligar e a linha gravada no banco sai errada.
    vi.useFakeTimers();
    const { result } = await montarRegistrado();
    await act(async () => { await result.current.makeCall('111'); });
    act(() => mockStateChangeListeners.forEach((fn) => fn('Established')));

    await act(async () => { vi.advanceTimersByTime(3000); });
    const aosTresSegundos = result.current.callDuration;
    expect(aosTresSegundos).toBe(3);

    act(() => mockStateChangeListeners.forEach((fn) => fn('Terminated')));
    await act(async () => { vi.advanceTimersByTime(5000); });

    expect(result.current.callDuration).toBe(aosTresSegundos);
    vi.useRealTimers();
  });

  // === INBOUND CALL TESTS ===

  it('surfaces an incoming SIP invitation as a ringing inbound call', async () => {
    const { result } = await montarConectado();
    expect(lastOnInvite).toBeInstanceOf(Function);

    await act(async () => {
      lastOnInvite?.(await createMockInvitation());
      await escoar();
    });

    expect(result.current.callStatus).toBe('ringing');
    expect(result.current.callDirection).toBe('inbound');
    expect(result.current.currentNumber).toBe('5511988887777');
    // Entrada: `ringing` + o Call-ID do CONVITE em `provider_call_id`.
    esperaRegistro({ p_direction: 'inbound', p_status: 'ringing', p_channel: 'voip', p_peer_number: '5511988887777', p_provider_call_id: 'invite-1' });
  });

  it('rejects a second incoming invitation as busy while a call is active', async () => {
    const { result } = await montarConectado();

    await act(async () => {
      lastOnInvite?.(await createMockInvitation());
      await Promise.resolve();
    });

    const secondInvitation = await createMockInvitation();
    await act(async () => {
      lastOnInvite?.(secondInvitation);
      await Promise.resolve();
    });

    expect((secondInvitation as unknown as { reject: ReturnType<typeof vi.fn> }).reject).toHaveBeenCalledWith({ statusCode: 486 });
  });

  it('answers the call once acceptIncomingCall is invoked', async () => {
    const { result } = await montarConectado();
    let invitation!: Invitation;

    await act(async () => {
      invitation = await createMockInvitation();
      lastOnInvite?.(invitation);
      await Promise.resolve();
    });

    await act(async () => {
      await result.current.acceptIncomingCall();
    });
    expect((invitation as unknown as { accept: ReturnType<typeof vi.fn> }).accept).toHaveBeenCalled();
  });

  it('marks the call declined when rejectIncomingCall is invoked', async () => {
    const { result } = await montarConectado();

    await act(async () => {
      lastOnInvite?.(await createMockInvitation());
      await escoar();
    });

    await act(async () => {
      await result.current.rejectIncomingCall();
    });
    await evento('Terminated');

    // T12: recusa é ação NOSSA antes de atender → `declined`/`declined` (antes
    // do T12 virava `missed`/`no_answer` e a recusa não se distinguia de uma
    // chamada perdida).
    const chamadas = gravacoes();
    expect(chamadas[chamadas.length - 1]).toMatchObject({
      p_status: 'declined', p_end_reason: 'declined', p_direction: 'inbound',
    });
  });

  // === T11: o ciclo completo grava 3 vezes com o MESMO id ===

  it('aceite T11: ciclo completo gera 3 RPCs com o mesmo p_id (o sessionId do provider)', async () => {
    const { result } = await montarRegistrado();

    await act(async () => {
      await result.current.makeCall('5511999999999', 'sessao-do-provider');
      await escoar();
    });
    await act(async () => {
      mockStateChangeListeners.forEach(fn => fn('Establishing'));
    });
    await evento('Established');
    await evento('Terminated');

    expect(mockRpc).toHaveBeenCalledTimes(3);
    expect(mockRpc.mock.calls.every(([nome]) => nome === 'upsert_my_call')).toBe(true);
    const chamadas = gravacoes();
    expect(chamadas.map(c => c.p_id)).toEqual(['sessao-do-provider', 'sessao-do-provider', 'sessao-do-provider']);
    expect(chamadas[0]).toMatchObject({
      p_direction: 'outbound', p_status: 'ringing', p_channel: 'voip',
      p_peer_number: '5511999999999', p_provider_call_id: 'sip-call-1',
    });
    expect(chamadas[1]).toMatchObject({ p_status: 'answered' });
    expect(chamadas[1].p_answered_at).toEqual(expect.any(String));
    // T12: o Terminated veio sem clique em desligar → quem encerrou foi o remoto.
    expect(chamadas[2]).toMatchObject({ p_status: 'ended', p_end_reason: 'hangup_remote' });
    expect(chamadas[2].p_ended_at).toEqual(expect.any(String));
    expect(chamadas[2].p_talk_seconds).toBeGreaterThanOrEqual(0);
  });

  it('sem sessionId do provider, o id da linha é um uuid local (mesmo nas 3)', async () => {
    const { result } = await montarRegistrado();

    await discar(result);
    await evento('Established');

    const chamadas = gravacoes();
    expect(chamadas.map(c => c.p_status)).toEqual(['ringing', 'answered']);
    expect(chamadas[0].p_id).toMatch(/^[0-9a-f-]{36}$/);
    expect(chamadas[1].p_id).toBe(chamadas[0].p_id);
  });

  it('falha da RPC: 3 tentativas com o mesmo p_id, log e toast (nada silencioso)', async () => {
    mockRpc.mockResolvedValue({ data: null, error: { message: 'sem rede' } });
    const erro = vi.spyOn(console, 'error').mockImplementation(() => {});
    const { result } = await montarRegistrado();

    await act(async () => {
      await result.current.makeCall('5511999999999', 'sessao-falha');
      await escoar(20);
    });

    expect(mockRpc).toHaveBeenCalledTimes(3);
    expect(gravacoes().map(c => c.p_id)).toEqual(['sessao-falha', 'sessao-falha', 'sessao-falha']);
    expect(toast.error).toHaveBeenCalledWith('Não foi possível salvar a ligação');
    erro.mockRestore();
  });

  // === T12: desfecho fino (quem encerrou + código SIP) ===

  it('entrega o desfecho ao `onEnd` e grava hangup_local no desligamento local', async () => {
    const desfechos: CallEndOutcome[] = [];
    const { result } = await montarRegistrado((outcome) => desfechos.push(outcome));

    await discar(result);
    await evento('Established');
    act(() => { result.current.hangUp(); });
    await evento('Terminated');

    expect(desfechos).toEqual([{ endedBy: 'hangup_local', sipCode: null }]);
    const chamadas = gravacoes();
    expect(chamadas[chamadas.length - 1]).toMatchObject({ p_status: 'ended', p_end_reason: 'hangup_local' });
  });

  it('sem clique em desligar, o fim sai hangup_remote', async () => {
    const desfechos: CallEndOutcome[] = [];
    const { result } = await montarRegistrado((outcome) => desfechos.push(outcome));

    await discar(result);
    await evento('Established');
    await evento('Terminated');

    expect(desfechos).toEqual([{ endedBy: 'hangup_remote', sipCode: null }]);
    const chamadas = gravacoes();
    expect(chamadas[chamadas.length - 1]).toMatchObject({ p_status: 'ended', p_end_reason: 'hangup_remote' });
  });

  it('cancelar antes de atender grava cancelled (nunca "Concluída")', async () => {
    const desfechos: CallEndOutcome[] = [];
    const { result } = await montarRegistrado((outcome) => desfechos.push(outcome));

    await discar(result);
    act(() => { result.current.hangUp(); });
    await evento('Terminated');

    expect(desfechos).toEqual([{ endedBy: 'hangup_local', sipCode: null }]);
    const chamadas = gravacoes();
    expect(chamadas[chamadas.length - 1]).toMatchObject({ p_status: 'cancelled', p_end_reason: 'cancelled' });
  });

  it('sem `onEnd` (consumidor que não passa o callback) o fim segue funcionando', async () => {
    const { result } = await montarRegistrado();

    await discar(result);
    await evento('Terminated');

    expect(result.current.callStatus).toBe('ended');
  });

  // === D1: INVITE sem resposta final não pode travar a linha ===

  it('watchdog: INVITE sem resposta final encerra em timeout e libera a linha', async () => {
    vi.useFakeTimers();
    const { result } = await montarRegistrado();

    await act(async () => {
      await result.current.makeCall('5511999999999', 'sessao-wd');
      await escoar();
    });
    act(() => mockStateChangeListeners.forEach(fn => fn('Establishing')));
    expect(result.current.callStatus).toBe('ringing');

    // Nenhum `Terminated` chega: só o watchdog pode encerrar.
    await act(async () => { vi.advanceTimersByTime(40000); await escoar(); });

    const chamadas = gravacoes();
    expect(chamadas[chamadas.length - 1]).toMatchObject({ p_status: 'missed', p_end_reason: 'timeout' });
    expect(result.current.callStatus).toBe('ended');

    await act(async () => { vi.advanceTimersByTime(2000); });
    expect(result.current.callStatus).toBe('idle'); // a linha aceita discar de novo
    vi.useRealTimers();
  });

  // === D3: a fila mantém a ordem de chegada ao banco ===

  it('D3: com o banco lento na 1ª gravação, o fim NÃO ultrapassa o ringing', async () => {
    // Controla a ordem de CONCLUSÃO das RPCs (é o que o banco coalesce vê):
    // a 1ª (`ringing`) é liberada sob comando e a 2ª (`answered`) só conclui
    // depois dela — cenário em que, sem fila, o `ended` passaria na frente.
    const concluidas: string[] = [];
    let liberarRinging!: () => void;
    let liberarAnswered!: () => void;
    mockRpc.mockImplementation((_nome, args) => {
      const status = (args as { p_status?: string }).p_status ?? '?';
      const pendente = status === 'ringing'
        ? new Promise((resolve) => { liberarRinging = () => resolve({ data: 'ok', error: null }); })
        : status === 'answered'
          ? new Promise((resolve) => { liberarAnswered = () => resolve({ data: 'ok', error: null }); })
          : Promise.resolve({ data: 'ok', error: null });
      return pendente.then((resultado) => { concluidas.push(status); return resultado; });
    });
    const { result } = await montarRegistrado();

    await act(async () => { await result.current.makeCall('123'); await escoar(); });
    expect(mockRpc).toHaveBeenCalledTimes(1); // só o `ringing` saiu (pendente)

    await evento('Established');
    await evento('Terminated');
    // Sem a fila, `answered` e `ended` sairiam juntos e o fim poderia concluir
    // primeiro — o `answered` atrasado regravaria status='answered'.
    expect(mockRpc).toHaveBeenCalledTimes(1);

    await act(async () => { liberarRinging(); await escoar(20); });
    await act(async () => { liberarAnswered(); await escoar(20); });
    expect(concluidas).toEqual(['ringing', 'answered', 'ended']);
    expect(gravacoes().map(c => c.p_status)).toEqual(['ringing', 'answered', 'ended']);
  });

  // === T17: gate de microfone ===
  // O gate roda ANTES de discar/atender: a negativa sai com o motivo
  // operacional, e não como o "Erro ao ligar" genérico do catch do adapter.

  /** Instala um `navigator.mediaDevices` cuja sondagem falha com este erro. */
  function microfoneQueFalha(name: string) {
    Object.defineProperty(navigator, 'mediaDevices', {
      configurable: true,
      value: { getUserMedia: vi.fn().mockRejectedValue(Object.assign(new Error('recusado'), { name })) },
    });
  }

  it("T17: NotAllowedError não disca e diz 'Microfone bloqueado'", async () => {
    microfoneQueFalha('NotAllowedError');
    const { result } = await montarRegistrado();

    await discar(result);

    expect(toast.error).toHaveBeenCalledWith('Microfone bloqueado');
    expect(result.current.micReason).toBe('mic_blocked');
    expect(result.current.callStatus).toBe('idle');
    expect(mockInvite).not.toHaveBeenCalled();
    expect(mockRpc).not.toHaveBeenCalled();
  });

  it("T17: NotFoundError não disca e diz 'Nenhum microfone encontrado'", async () => {
    microfoneQueFalha('NotFoundError');
    const { result } = await montarRegistrado();

    await discar(result);

    expect(toast.error).toHaveBeenCalledWith('Nenhum microfone encontrado');
    expect(result.current.micReason).toBe('mic_missing');
    expect(mockInvite).not.toHaveBeenCalled();
  });

  it("T17: NotReadableError no ATENDER diz 'Microfone em uso por outro programa' e não atende", async () => {
    // Este é o teste que pega um gate que só cobrisse a discagem: o microfone é
    // conferido nos DOIS caminhos, e o painel VoIP chama o SIP direto.
    const { result } = await montarConectado();
    let invitation!: Invitation;
    await act(async () => {
      invitation = await createMockInvitation();
      lastOnInvite?.(invitation);
      await escoar();
    });
    microfoneQueFalha('NotReadableError');

    await act(async () => {
      await result.current.acceptIncomingCall();
      await escoar();
    });

    expect(toast.error).toHaveBeenCalledWith('Microfone em uso por outro programa');
    expect(result.current.micReason).toBe('mic_busy');
    const accept = (invitation as unknown as { accept: ReturnType<typeof vi.fn> }).accept;
    expect(accept).not.toHaveBeenCalled();
  });

  it('T17: sondagem OK disca e devolve as tracks (o microfone não fica quente)', async () => {
    const stop = vi.fn();
    Object.defineProperty(navigator, 'mediaDevices', {
      configurable: true,
      value: { getUserMedia: vi.fn().mockResolvedValue({ getTracks: () => [{ stop }] }) },
    });
    const { result } = await montarRegistrado();

    await discar(result);

    // Sondar não é usar: sem o `stop()` a captura seguiria aberta (indicador do
    // navegador aceso) durante toda a ligação.
    expect(stop).toHaveBeenCalled();
    expect(mockInvite).toHaveBeenCalled();
    expect(result.current.micReason).toBeNull();
  });

  it('T17: sem mediaDevices o gate não bloqueia (jsdom/navegador antigo)', async () => {
    const { result } = await montarRegistrado();

    await discar(result);

    expect(mockInvite).toHaveBeenCalled();
    expect(result.current.micReason).toBeNull();
  });

  // === T20: eleição de aba + 2ª chamada na linha ocupada ===

  it('T20: virar aba SEGUIDORA solta o registro e expõe o motivo da linha', async () => {
    const { result, rerender } = await montarRegistrado();
    expect(result.current.sipStatus).toBe('registered');

    await act(async () => {
      tabStore.snapshot = { ...tabStore.snapshot, role: 'follower', leaderId: 'outra-aba' };
      rerender();
      await escoar(12);
    });

    expect(result.current.sipStatus).toBe('idle');
    expect(result.current.sipReason).toBe('line_in_use_other_tab');
  });

  it('T20: virar aba LÍDER conecta com as credenciais provisionadas', async () => {
    mockFunctionsInvoke.mockResolvedValue({
      data: { server: 'sip.prov.com', user: 'phone9', wsPort: 5066, password: 'secret123', profileId: 'p1' },
      error: null,
    });
    // Nasce seguidora (papel inicial do store real): o mount NÃO conecta.
    tabStore.snapshot = { ...tabStore.snapshot, role: 'follower', leaderId: 'outra-aba' };
    const { result, rerender } = renderHook(() => useSipClient());
    expect(result.current.sipStatus).toBe('idle');

    // A aba que segurava a linha saiu: esta assume.
    await act(async () => {
      tabStore.snapshot = { ...tabStore.snapshot, role: 'leader', leaderId: 'tab-propria' };
      rerender();
      await escoar(12);
    });

    expect(result.current.sipStatus).toBe('connecting');
    expect(mockMakeURI).toHaveBeenCalledWith('sip:phone9@sip.prov.com');
    expect(lastUserAgentOptions?.transportOptions?.server).toBe('wss://sip.prov.com:5066/ws');
  });

  it('T20: 2ª chamada com a linha ocupada vira missed/busy_here + toast, sem tocar a em curso', async () => {
    const { result } = await montarConectado();

    await act(async () => {
      lastOnInvite?.(await createMockInvitation());
      await escoar();
    });
    expect(result.current.callStatus).toBe('ringing');
    const idDaPrimeira = gravacoes()[0]?.p_id;

    // Segunda chamada chega com a linha ocupada: recusada (486) e registrada
    // como `missed`/`busy_here`, com id PRÓPRIO.
    await act(async () => {
      lastOnInvite?.(await createMockInvitation());
      await escoar();
    });

    const perdida = gravacoes().find((c) => c.p_status === 'missed');
    expect(perdida).toMatchObject({
      p_status: 'missed', p_end_reason: 'busy_here', p_direction: 'inbound', p_peer_number: '5511988887777',
    });
    expect(perdida?.p_id).not.toBe(idDaPrimeira);
    expect(toast.info).toHaveBeenCalledWith('Você já está em uma ligação');
    // A chamada em curso não foi afetada por nada disso.
    expect(result.current.callStatus).toBe('ringing');
    expect(result.current.currentNumber).toBe('5511988887777');
  });

  // === T22: fecho das 8 linhas da tabela cenario -> status/end_reason ===
  // `busy` e `failed` só tinham as METADES testadas (o outcome no motor, de um
  // lado; o mapa outcome -> persistência, do outro). Estes dois testes fecham o
  // elo que faltava: o evento SIP entra pelo duble e o que se asserta é a ÚLTIMA
  // gravação que chegou à RPC `upsert_my_call`.

  it('T22: saída com 486 grava busy/busy ponta a ponta (o elo que faltava)', async () => {
    // O INVITE de saída recebe resposta final 486 (ocupado). O código NÃO fica
    // no Inviter (sip.js 0.21 não expõe `lastResponse`): ele chega pelo
    // `requestDelegate.onReject` que o SipCallAdapter instala. É ESSE callback
    // que precisa marcar `sipCode` antes de o `Terminated` montar o desfecho —
    // é justamente esta ligação (evento -> gravação) que os testes de metade
    // nunca cobriram.
    mockInvite.mockImplementationOnce(
      async (options: { requestDelegate: { onReject: (response: { message: { statusCode: number } }) => void } }) => {
        options.requestDelegate.onReject({ message: { statusCode: 486 } });
      },
    );

    const { result } = await montarRegistrado();
    await discar(result);
    await evento('Terminated');

    const chamadas = gravacoes();
    const fim = chamadas[chamadas.length - 1];
    expect(fim).toMatchObject({ p_status: 'busy', p_end_reason: 'busy', p_direction: 'outbound' });
  });

  it('T22: falha ao discar (invite rejeita) grava failed/failed ponta a ponta (o elo que faltava)', async () => {
    // O `invite()` do adapter rejeita (transporte/URI): o motor cai no catch do
    // `makeCall` (CallEngine.ts:235-238), emite o desfecho `failure` pelo
    // `callIdPromise` e o Terminated pode nunca chegar. O fim tem de sair como
    // `failed`/`failed`, não como `no_answer` nem como `Erro ao ligar` silencioso.
    mockInvite.mockRejectedValueOnce(new Error('transporte caiu'));

    const { result } = await montarRegistrado();
    await discar(result, '5511999999999', 20);

    const chamadas = gravacoes();
    const fim = chamadas[chamadas.length - 1];
    expect(fim).toMatchObject({ p_status: 'failed', p_end_reason: 'failed', p_direction: 'outbound' });
  });
});
