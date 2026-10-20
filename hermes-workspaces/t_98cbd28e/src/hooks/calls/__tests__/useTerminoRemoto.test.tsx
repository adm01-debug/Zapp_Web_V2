/**
 * R2-CALL-008 (#283) — "Encerramento por Realtime compara o ID observado, mas
 * despacha sobre outra sessão e evento inválido em ringing".
 *
 * O defeito medido na auditoria R2: o alerta observa a chamada B
 * (`incomingCall.callId`) e o hook assinava o UPDATE de B, mas despachava
 * `HANGUP_REMOTE` no estado GLOBAL, sem comparar o id observado ao `sessionId`
 * da sessão em curso. Com a sessão A ativa, o fim de B encerrava A — sem
 * demonstrar o teardown do transporte de A. E, com a PRÓPRIA chamada ainda em
 * `ringing_in`, `HANGUP_REMOTE` é transição inválida (a tabela do reducer só
 * aceita REJECT/CANCEL_REMOTE/TIMEOUT ali): o evento terminal era ignorado
 * (warn) e a chamada ficava presa tocando.
 *
 * O contrato travado aqui:
 *  - o evento só encerra a sessão quando o id observado É o `sessionId` em
 *    curso (uma sessão não alvo fica intacta);
 *  - o evento terminal escolhido é VÁLIDO para o estado atual, pela MESMA regra
 *    do provider (`eventoDeFim`): `active` → HANGUP_REMOTE, `ringing_in` →
 *    CANCEL_REMOTE;
 *  - payload de outro id e repetição do desfecho não mudam nada;
 *  - sessão ociosa (sem `sessionId`) não ganha uma sessão fantasma.
 */

import { act, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';

/** O hook de SIP é o transporte — aqui é dublê, controlado pelo teste. */
const h = vi.hoisted(() => ({
  value: {} as Record<string, unknown>,
  onEnd: undefined as ((outcome: unknown) => void) | undefined,
}));

vi.mock('@/hooks/communication/useSipClient', () => ({
  useSipClient: (onEnd?: (outcome: unknown) => void) => {
    h.onEnd = onEnd;
    return h.value;
  },
}));

const mockChannel = vi.fn();
const mockRemoveChannel = vi.fn();

vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    channel: (...args: unknown[]) => mockChannel(...args),
    removeChannel: (...args: unknown[]) => mockRemoveChannel(...args),
  },
}));

let realtimeCallback: ((payload: unknown) => void) | undefined;

const { CallSessionProvider, useCallSession } = await import('@/providers/CallSessionProvider');
const { useTerminoRemoto } = await import('../useTerminoRemoto');
const { INVALID_TRANSITION_PREFIX } = await import('@/lib/calls/session');

function sipDuble(overrides: Record<string, unknown> = {}) {
  return {
    sipStatus: 'registered',
    callStatus: 'idle',
    callDuration: 0,
    isMuted: false,
    currentNumber: '',
    callDirection: null,
    currentCallId: null,
    connect: vi.fn(),
    connectWithStoredCredentials: vi.fn(),
    disconnect: vi.fn(),
    makeCall: vi.fn(),
    hangUp: vi.fn(),
    toggleMute: vi.fn(),
    sendDTMF: vi.fn(),
    acceptIncomingCall: vi.fn(async () => {}),
    rejectIncomingCall: vi.fn(async () => {}),
    garantirMicrofone: vi.fn(async () => true),
    ...overrides,
  };
}

function Sonda({ observado }: { observado: string | null }) {
  // O id OBSERVADO pelo alerta (a chamada da notificação), não o da sessão.
  useTerminoRemoto(observado);
  const api = useCallSession();
  return (
    <div>
      <span data-testid="status">{api.session.status}</span>
      <span data-testid="sessao">{api.sessionId ?? '-'}</span>
      <span data-testid="endedBy">{api.session.endedBy ?? '-'}</span>
      <span data-testid="endReason">{api.session.endReason ?? '-'}</span>
    </div>
  );
}

function Harness({ observado }: { observado: string | null }) {
  return (
    <MemoryRouter>
      <CallSessionProvider>
        <Sonda observado={observado} />
      </CallSessionProvider>
    </MemoryRouter>
  );
}

const texto = (id: string) => screen.getByTestId(id).textContent;

/** Leva o provider a `active` numa saída com o id dado (o motor é o dublê). */
function montarAtiva(callId: string, observado: string | null) {
  h.value = sipDuble({
    callStatus: 'calling',
    callDirection: 'outbound',
    currentCallId: callId,
    currentNumber: '11999992048',
  });
  const tela = render(<Harness observado={observado} />);
  h.value = sipDuble({ callStatus: 'active', callDirection: 'outbound', currentCallId: callId });
  tela.rerender(<Harness observado={observado} />);
  return tela;
}

/** Leva o provider a `ringing_in` com o id dado (entrada ainda tocando). */
function montarTocando(callId: string, observado: string | null) {
  h.value = sipDuble({
    callStatus: 'ringing',
    callDirection: 'inbound',
    currentCallId: callId,
    currentNumber: '+5511999999999',
  });
  return render(<Harness observado={observado} />);
}

/** Payload do Realtime como o `UPDATE public.calls` entrega. */
function emitir(linha: Record<string, unknown>) {
  act(() => {
    realtimeCallback?.({ new: linha });
  });
}

let warnSpy: ReturnType<typeof vi.spyOn>;

/** Transições inválidas registradas pelo reducer (o esperado é nenhuma). */
function transicoesInvalidas(): string[] {
  return warnSpy.mock.calls
    .filter((linha) => String(linha[0]).includes(INVALID_TRANSITION_PREFIX))
    .map((linha) => String(linha[0]));
}

beforeEach(() => {
  vi.clearAllMocks();
  realtimeCallback = undefined;
  warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
  const canal = { on: vi.fn(), subscribe: vi.fn() };
  canal.on.mockImplementation((_evento, _config, callback) => {
    realtimeCallback = callback as (payload: unknown) => void;
    return canal;
  });
  canal.subscribe.mockReturnValue(canal);
  mockChannel.mockReturnValue(canal);
  h.value = sipDuble();
});

describe('useTerminoRemoto — identidade da sessão e evento válido (R2-CALL-008)', () => {
  it('A ativa + B termina: não encerra a sessão em curso (A)', () => {
    montarAtiva('call-A', 'call-B');
    expect(texto('status')).toBe('active');

    emitir({ id: 'call-B', status: 'ended', end_reason: 'hangup_remote' });

    expect(texto('status')).toBe('active');
    expect(texto('sessao')).toBe('call-A');
    expect(texto('endedBy')).toBe('-');
    expect(transicoesInvalidas()).toHaveLength(0);
  });

  it('A tocando (ringing_in) + A termina: encerra com o evento válido do estado (CANCEL_REMOTE)', () => {
    montarTocando('call-A', 'call-A');
    expect(texto('status')).toBe('ringing_in');

    emitir({ id: 'call-A', status: 'ended', end_reason: 'hangup_remote' });

    expect(texto('status')).toBe('ended');
    expect(texto('sessao')).toBe('call-A');
    expect(texto('endedBy')).toBe('cancel_remote');
    expect(texto('endReason')).toBe('cancelled_remote');
    expect(transicoesInvalidas()).toHaveLength(0);
  });

  it('payload de outro ID não encerra a sessão em curso', () => {
    montarTocando('call-A', 'call-A');

    emitir({ id: 'call-B', status: 'ended' });

    expect(texto('status')).toBe('ringing_in');
    expect(texto('endedBy')).toBe('-');
    expect(transicoesInvalidas()).toHaveLength(0);
  });

  it('evento terminal repetido não reescreve o desfecho nem gera transição inválida', () => {
    montarAtiva('call-A', 'call-A');

    emitir({ id: 'call-A', status: 'ended', end_reason: 'hangup_remote' });
    expect(texto('status')).toBe('ended');
    expect(texto('endedBy')).toBe('hangup_remote');

    emitir({ id: 'call-A', status: 'ended', end_reason: 'hangup_remote' });

    expect(texto('status')).toBe('ended');
    expect(texto('endedBy')).toBe('hangup_remote');
    expect(texto('endReason')).toBe('hangup_remote');
    expect(transicoesInvalidas()).toHaveLength(0);
  });

  it('sessão ociosa não ganha sessão fantasma com o desfecho remoto', () => {
    render(<Harness observado="call-x" />);
    expect(texto('status')).toBe('idle');

    emitir({ id: 'call-x', status: 'ended' });

    expect(texto('status')).toBe('idle');
    expect(texto('sessao')).toBe('-');
    expect(transicoesInvalidas()).toHaveLength(0);
  });
});
