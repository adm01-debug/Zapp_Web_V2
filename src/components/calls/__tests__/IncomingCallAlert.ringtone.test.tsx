import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render } from '@testing-library/react';

/**
 * O toque da chamada é o único alerta que cria o `AudioContext` na mão. Como a chamada
 * chega pelo Realtime (e não por um clique), o navegador entrega o contexto **suspenso** —
 * e um contexto suspenso não emite som nenhum, sem erro nenhum. Os outros dois caminhos
 * (`notificationSounds`, chat interno) já chamavam `resume()`; este não chamava.
 *
 * O fake abaixo imita o comportamento do navegador (nasce `suspended`) e conta os
 * `resume()`: sem a correção, o teste fica vermelho.
 */
const ctxs: Array<{ state: string; estadoInicial: string; resume: ReturnType<typeof vi.fn> }> = [];

class FakeGainNode {
  gain = { value: 0 };
  connect = vi.fn();
  disconnect = vi.fn();
}

class FakeOscillatorNode {
  type = 'sine';
  frequency = { value: 0 };
  connect = vi.fn();
  start = vi.fn();
  stop = vi.fn();
}

class FakeAudioContext {
  /** Como o navegador entrega o contexto quando não houve gesto do usuário. */
  estadoInicial = 'suspended';
  state = 'suspended';
  destination = {};
  resume = vi.fn(() => {
    this.state = 'running';
    return Promise.resolve();
  });
  close = vi.fn();
  createOscillator() {
    return new FakeOscillatorNode();
  }
  createGain() {
    return new FakeGainNode();
  }
  constructor() {
    ctxs.push(this as never);
  }
}

vi.stubGlobal('AudioContext', FakeAudioContext);

vi.mock('framer-motion', () => ({
  motion: {
    div: ({ children, ...rest }: { children?: unknown }) => <div {...rest}>{children as never}</div>,
  },
  AnimatePresence: ({ children }: { children?: unknown }) => <>{children as never}</>,
}));

vi.mock('../CallDialog', () => ({ CallDialog: () => null }));

vi.mock('@/hooks/communication/useIncomingCallListener', () => ({
  useIncomingCallListener: () => ({
    incomingCall: {
      id: 'n1',
      callId: 'k1',
      contact_id: 'c1',
      contact_name: 'Fulano de Tal',
      contact_phone: '+55 11 99999-0000',
      is_video: false,
      whatsapp_connection_id: 'w1',
      started_at: '2026-09-30T00:00:00Z',
    },
    dismissCall: vi.fn(),
  }),
}));

vi.mock('@/hooks/communication/useCalls', () => ({
  useCalls: () => ({ answerCall: vi.fn(), missCall: vi.fn() }),
}));

vi.mock('@/hooks/system/useNotificationSettings', () => ({
  useNotificationSettings: () => ({
    settings: { soundEnabled: true, soundVolume: 70 },
    isQuietHours: () => false,
  }),
}));

vi.mock('@/lib/logger', () => ({
  getLogger: () => ({ error: vi.fn(), warn: vi.fn(), debug: vi.fn(), info: vi.fn() }),
}));

import { IncomingCallAlert } from '../IncomingCallAlert';

describe('IncomingCallAlert — toque da chamada', () => {
  beforeEach(() => {
    ctxs.length = 0;
  });

  it('retoma o AudioContext suspenso — senão o toque de chamada é mudo', () => {
    render(<IncomingCallAlert />);

    expect(ctxs).toHaveLength(1);
    // o contexto nasce suspenso (sem gesto do usuário)…
    expect(ctxs[0].estadoInicial).toBe('suspended');
    // …e o componente precisa retomá-lo, senão o toque não sai
    expect(ctxs[0].resume).toHaveBeenCalledTimes(1);
    expect(ctxs[0].state).toBe('running');
  });
});
