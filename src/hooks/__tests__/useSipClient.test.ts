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
        if (uri.includes('invalid')) return null;
        return { host: 'test.server.com' };
      }
      configuration = { uri: { host: 'test.server.com' } };
      transport: { onDisconnect: (() => void) | null } = { onDisconnect: null };
      start = vi.fn().mockResolvedValue(undefined);
      stop = vi.fn().mockResolvedValue(undefined);
      constructor(options: { delegate?: { onInvite?: (invitation: unknown) => void } }) {
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
  mockFunctionsInvoke: vi.fn().mockResolvedValue({ data: { password: 'test-pass' }, error: null }),
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

import { useSipClient } from '../communication/useSipClient';
import { toast } from 'sonner';

/** Deixa a cadeia assíncrona do sink (contato + RPC) rodar até o fim. */
async function escoar(voltas = 12): Promise<void> {
  for (let i = 0; i < voltas; i += 1) await Promise.resolve();
}

/** Argumentos das chamadas a `upsert_my_call`, na ordem em que aconteceram. */
function gravacoes(): Array<Record<string, unknown>> {
  return mockRpc.mock.calls.map(([, args]) => args as Record<string, unknown>);
}

describe('useSipClient', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockStateChangeListeners.length = 0;
    mockRegisterStateListeners.length = 0;
    mockRpc.mockResolvedValue({ data: 'call-1', error: null });
    mockFunctionsInvoke.mockResolvedValue({ data: { password: 'test-pass' }, error: null });
    lastOnInvite = undefined;
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  // === CONNECTION TESTS ===

  it('should start with disconnected status', () => {
    const { result } = renderHook(() => useSipClient());
    expect(result.current.sipStatus).toBe('disconnected');
    expect(result.current.callStatus).toBe('idle');
    expect(result.current.isMuted).toBe(false);
    expect(result.current.callDuration).toBe(0);
    expect(result.current.currentNumber).toBe('');
  });

  it('should set connecting status when connect is called', async () => {
    const { result } = renderHook(() => useSipClient());
    await act(async () => {
      await result.current.connect({ server: 'test.com', user: 'user1', password: 'pass' });
    });
    expect(result.current.sipStatus).toBe('connecting');
  });

  it('should become registered when registerer fires Registered', async () => {
    const { result } = renderHook(() => useSipClient());
    await act(async () => {
      await result.current.connect({ server: 'test.com', user: 'user1', password: 'pass' });
    });
    act(() => {
      mockRegisterStateListeners.forEach(fn => fn('Registered'));
    });
    expect(result.current.sipStatus).toBe('registered');
    expect(toast.success).toHaveBeenCalledWith('VoIP conectado!');
  });

  it('should set disconnected when registerer fires Unregistered', async () => {
    const { result } = renderHook(() => useSipClient());
    await act(async () => {
      await result.current.connect({ server: 'test.com', user: 'user1', password: 'pass' });
    });
    act(() => {
      mockRegisterStateListeners.forEach(fn => fn('Registered'));
    });
    act(() => {
      mockRegisterStateListeners.forEach(fn => fn('Unregistered'));
    });
    expect(result.current.sipStatus).toBe('disconnected');
  });

  it('should disconnect properly', async () => {
    const { result } = renderHook(() => useSipClient());
    await act(async () => {
      await result.current.connect({ server: 'test.com', user: 'user1', password: 'pass' });
    });
    act(() => {
      mockRegisterStateListeners.forEach(fn => fn('Registered'));
    });
    expect(result.current.sipStatus).toBe('registered');

    await act(async () => {
      await result.current.disconnect();
    });
    expect(result.current.sipStatus).toBe('disconnected');
  });

  // === CREDENTIAL FETCH (connectWithStoredCredentials) ===

  it('happy path: fetches the SIP password and connects when invoke succeeds', async () => {
    mockFunctionsInvoke.mockResolvedValueOnce({ data: { password: 'secret123' }, error: null });
    const { result } = renderHook(() => useSipClient());
    await act(async () => {
      await result.current.connectWithStoredCredentials();
    });
    expect(result.current.sipStatus).toBe('connecting');
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
    expect(result.current.sipStatus).toBe('disconnected');
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
    expect(result.current.sipStatus).toBe('disconnected');
  });

  it('shows SIP_PASSWORD config toast when invoke returns no error but no password', async () => {
    mockFunctionsInvoke.mockResolvedValueOnce({ data: null, error: null });
    const { result } = renderHook(() => useSipClient());
    await act(async () => {
      await result.current.connectWithStoredCredentials();
    });
    expect(toast.error).toHaveBeenCalledWith(expect.stringContaining('SIP_PASSWORD'));
    expect(result.current.sipStatus).toBe('disconnected');
  });

  // === OUTBOUND CALL TESTS ===

  it('should reject call when not registered', async () => {
    const { result } = renderHook(() => useSipClient());
    await act(async () => {
      await result.current.makeCall('123');
    });
    expect(toast.error).toHaveBeenCalledWith('VoIP não conectado.');
    expect(result.current.callStatus).toBe('idle');
  });

  it('should set calling status and register the call before the invite resolves', async () => {
    const { result } = renderHook(() => useSipClient());
    await act(async () => {
      await result.current.connect({ server: 'test.com', user: 'user1', password: 'pass' });
    });
    act(() => mockRegisterStateListeners.forEach(fn => fn('Registered')));

    await act(async () => {
      await result.current.makeCall('5511999999999');
      await escoar();
    });
    expect(result.current.callStatus).toBe('calling');
    expect(result.current.callDirection).toBe('outbound');
    expect(result.current.currentNumber).toBe('5511999999999');
    // T11: o registro é a RPC idempotente, com o canal e o Call-ID do convite.
    expect(mockRpc).toHaveBeenCalledWith('upsert_my_call', expect.objectContaining({
      p_direction: 'outbound', p_status: 'ringing', p_channel: 'voip',
      p_peer_number: '5511999999999', p_provider_call_id: 'sip-call-1',
    }));
  });

  it('should transition to ringing on Establishing', async () => {
    const { result } = renderHook(() => useSipClient());
    await act(async () => {
      await result.current.connect({ server: 'test.com', user: 'user1', password: 'pass' });
    });
    act(() => mockRegisterStateListeners.forEach(fn => fn('Registered')));

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
    const { result } = renderHook(() => useSipClient());
    await act(async () => {
      await result.current.connect({ server: 'test.com', user: 'user1', password: 'pass' });
    });
    act(() => mockRegisterStateListeners.forEach(fn => fn('Registered')));

    await act(async () => {
      await result.current.makeCall('123');
    });

    await act(async () => {
      mockStateChangeListeners.forEach(fn => fn('Established'));
      await escoar();
    });
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
    const { result } = renderHook(() => useSipClient());
    await act(async () => {
      await result.current.connect({ server: 'test.com', user: 'user1', password: 'pass' });
    });
    act(() => mockRegisterStateListeners.forEach(fn => fn('Registered')));

    await act(async () => {
      await result.current.makeCall('123');
      await escoar();
    });

    await act(async () => {
      mockStateChangeListeners.forEach(fn => fn('Terminated'));
      await escoar();
    });

    // Saída não atendida: `ended` (só a ENTRADA perdida vira `missed`).
    const chamadas = gravacoes();
    const fim = chamadas[chamadas.length - 1];
    expect(fim).toMatchObject({ p_status: 'ended', p_end_reason: 'no_answer' });
    expect(fim?.p_ended_at).toEqual(expect.any(String));
    expect(fim?.p_talk_seconds).toBeUndefined(); // null → omitido (coalesce)
  });

  it('records the call as ended (not missed) when terminated after being answered', async () => {
    const { result } = renderHook(() => useSipClient());
    await act(async () => {
      await result.current.connect({ server: 'test.com', user: 'user1', password: 'pass' });
    });
    act(() => mockRegisterStateListeners.forEach(fn => fn('Registered')));

    await act(async () => {
      await result.current.makeCall('123');
      await escoar();
    });
    await act(async () => {
      mockStateChangeListeners.forEach(fn => fn('Established'));
      await escoar();
    });
    await act(async () => {
      mockStateChangeListeners.forEach(fn => fn('Terminated'));
      await escoar();
    });

    const chamadas = gravacoes();
    expect(chamadas.map(c => c.p_status)).toEqual(['ringing', 'answered', 'ended']);
    expect(chamadas[2].p_id).toBe(chamadas[0].p_id);
    expect(chamadas[2]).toMatchObject({ p_end_reason: 'completed' });
    expect(chamadas[2].p_talk_seconds).toBeGreaterThanOrEqual(0);
    expect(chamadas[2].p_ended_at).toEqual(expect.any(String));
  });

  it('should cancel a pending invite on hangUp without waiting for the invite promise', async () => {
    // O invite() nunca resolve neste teste — hangUp() precisa achar a sessão
    // mesmo assim, porque ela é atribuída antes do await (corrige a corrida
    // em que um cancelamento rápido não encontrava sessão nenhuma).
    mockInvite.mockReturnValueOnce(new Promise(() => {}));
    const { result } = renderHook(() => useSipClient());
    await act(async () => {
      await result.current.connect({ server: 'test.com', user: 'user1', password: 'pass' });
    });
    act(() => mockRegisterStateListeners.forEach(fn => fn('Registered')));

    act(() => { result.current.makeCall('123'); });
    await act(async () => { await Promise.resolve(); });

    act(() => { result.current.hangUp(); });
    expect(mockCancel).toHaveBeenCalled();
  });

  it('should not force idle immediately on hangUp of an active call — waits for Terminated', async () => {
    const { result } = renderHook(() => useSipClient());
    await act(async () => {
      await result.current.connect({ server: 'test.com', user: 'user1', password: 'pass' });
    });
    act(() => mockRegisterStateListeners.forEach(fn => fn('Registered')));
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
    const { result } = renderHook(() => useSipClient());
    await act(async () => {
      await result.current.connect({ server: 'test.com', user: 'user1', password: 'pass' });
    });
    act(() => mockRegisterStateListeners.forEach(fn => fn('Registered')));

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
    const { result } = renderHook(() => useSipClient());
    await act(async () => {
      await result.current.connect({ server: 'test.com', user: 'user1', password: 'pass' });
    });
    act(() => mockRegisterStateListeners.forEach((fn) => fn('Registered')));
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
    const { result } = renderHook(() => useSipClient());
    await act(async () => {
      await result.current.connect({ server: 'test.com', user: 'user1', password: 'pass' });
    });
    expect(lastOnInvite).toBeInstanceOf(Function);

    await act(async () => {
      lastOnInvite?.(await createMockInvitation());
      await escoar();
    });

    expect(result.current.callStatus).toBe('ringing');
    expect(result.current.callDirection).toBe('inbound');
    expect(result.current.currentNumber).toBe('5511988887777');
    // Entrada: `ringing` + o Call-ID do CONVITE em `provider_call_id`.
    expect(mockRpc).toHaveBeenCalledWith('upsert_my_call', expect.objectContaining({
      p_direction: 'inbound', p_status: 'ringing', p_channel: 'voip',
      p_peer_number: '5511988887777', p_provider_call_id: 'invite-1',
    }));
  });

  it('rejects a second incoming invitation as busy while a call is active', async () => {
    const { result } = renderHook(() => useSipClient());
    await act(async () => {
      await result.current.connect({ server: 'test.com', user: 'user1', password: 'pass' });
    });

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
    const { result } = renderHook(() => useSipClient());
    await act(async () => {
      await result.current.connect({ server: 'test.com', user: 'user1', password: 'pass' });
    });
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

  it('marks the call missed when rejectIncomingCall is invoked', async () => {
    const { result } = renderHook(() => useSipClient());
    await act(async () => {
      await result.current.connect({ server: 'test.com', user: 'user1', password: 'pass' });
    });

    await act(async () => {
      lastOnInvite?.(await createMockInvitation());
      await escoar();
    });

    await act(async () => {
      await result.current.rejectIncomingCall();
    });
    await act(async () => {
      mockStateChangeListeners.forEach(fn => fn('Terminated'));
      await escoar();
    });

    // Recusada/entrada não atendida: `missed` + `no_answer` (regra do T11).
    const chamadas = gravacoes();
    expect(chamadas[chamadas.length - 1]).toMatchObject({
      p_status: 'missed', p_end_reason: 'no_answer', p_direction: 'inbound',
    });
  });

  // === T11: o ciclo completo grava 3 vezes com o MESMO id ===

  it('aceite T11: ciclo completo gera 3 RPCs com o mesmo p_id (o sessionId do provider)', async () => {
    const { result } = renderHook(() => useSipClient());
    await act(async () => {
      await result.current.connect({ server: 'test.com', user: 'user1', password: 'pass' });
    });
    act(() => mockRegisterStateListeners.forEach(fn => fn('Registered')));

    await act(async () => {
      await result.current.makeCall('5511999999999', 'sessao-do-provider');
      await escoar();
    });
    await act(async () => {
      mockStateChangeListeners.forEach(fn => fn('Establishing'));
    });
    await act(async () => {
      mockStateChangeListeners.forEach(fn => fn('Established'));
      await escoar();
    });
    await act(async () => {
      mockStateChangeListeners.forEach(fn => fn('Terminated'));
      await escoar();
    });

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
    expect(chamadas[2]).toMatchObject({ p_status: 'ended', p_end_reason: 'completed' });
    expect(chamadas[2].p_ended_at).toEqual(expect.any(String));
    expect(chamadas[2].p_talk_seconds).toBeGreaterThanOrEqual(0);
  });

  it('sem sessionId do provider, o id da linha é um uuid local (mesmo nas 3)', async () => {
    const { result } = renderHook(() => useSipClient());
    await act(async () => {
      await result.current.connect({ server: 'test.com', user: 'user1', password: 'pass' });
    });
    act(() => mockRegisterStateListeners.forEach(fn => fn('Registered')));

    await act(async () => {
      await result.current.makeCall('5511999999999');
      await escoar();
    });
    await act(async () => {
      mockStateChangeListeners.forEach(fn => fn('Established'));
      await escoar();
    });

    const chamadas = gravacoes();
    expect(chamadas.map(c => c.p_status)).toEqual(['ringing', 'answered']);
    expect(chamadas[0].p_id).toMatch(/^[0-9a-f-]{36}$/);
    expect(chamadas[1].p_id).toBe(chamadas[0].p_id);
  });

  it('falha da RPC: 3 tentativas com o mesmo p_id, log e toast (nada silencioso)', async () => {
    mockRpc.mockResolvedValue({ data: null, error: { message: 'sem rede' } });
    const erro = vi.spyOn(console, 'error').mockImplementation(() => {});
    const { result } = renderHook(() => useSipClient());
    await act(async () => {
      await result.current.connect({ server: 'test.com', user: 'user1', password: 'pass' });
    });
    act(() => mockRegisterStateListeners.forEach(fn => fn('Registered')));

    await act(async () => {
      await result.current.makeCall('5511999999999', 'sessao-falha');
      await escoar(20);
    });

    expect(mockRpc).toHaveBeenCalledTimes(3);
    expect(gravacoes().map(c => c.p_id)).toEqual(['sessao-falha', 'sessao-falha', 'sessao-falha']);
    expect(toast.error).toHaveBeenCalledWith('Não foi possível salvar a ligação');
    erro.mockRestore();
  });
});
