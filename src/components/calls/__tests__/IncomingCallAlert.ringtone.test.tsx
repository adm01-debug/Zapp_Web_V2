import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, fireEvent } from '@testing-library/react';

/**
 * O toque da chamada é o único alerta que cria o `AudioContext` na mão. Como a chamada
 * chega pelo Realtime (e não por um clique), o navegador entrega o contexto **suspenso** —
 * e um contexto suspenso não emite som nenhum, sem erro nenhum.
 *
 * O fake abaixo imita o navegador de verdade, não a suposição: `resume()` só sai de
 * `suspended` se a aba já tiver recebido um gesto do usuário (`ativacaoDoUsuario`).
 * Com o fake antigo (que sempre virava `running`) o teste passava sem provar nada.
 */
const ctxs: FakeAudioContext[] = [];

const { mockAccept, mockReject, mockAnswerCall, mockMissCall } = vi.hoisted(() => ({
  mockAccept: vi.fn(),
  mockReject: vi.fn(),
  mockAnswerCall: vi.fn(),
  mockMissCall: vi.fn(),
}));

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
  /** Sem interação do usuário, o navegador ignora o `resume()`. */
  static ativacaoDoUsuario = false;
  estadoInicial = 'suspended';
  state = 'suspended';
  destination = {};
  resume = vi.fn(() => {
    if (FakeAudioContext.ativacaoDoUsuario) this.state = 'running';
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
    ctxs.push(this);
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
  useCalls: () => ({ answerCall: mockAnswerCall, missCall: mockMissCall }),
}));

// O alerta agora fala com a MÁQUINA da sessão: sem este mock o `useCallSession()`
// lança 'useCallSession deve ser usado dentro de CallSessionProvider' e o render cai.
vi.mock('@/providers/CallSessionProvider', () => ({
  useCallSession: () => ({ accept: mockAccept, reject: mockReject }),
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
    FakeAudioContext.ativacaoDoUsuario = false;
  });

  it('retoma o AudioContext suspenso — senão o toque de chamada é mudo', () => {
    FakeAudioContext.ativacaoDoUsuario = true; // aba já usada: o navegador atende o resume
    render(<IncomingCallAlert />);

    expect(ctxs).toHaveLength(1);
    expect(ctxs[0].estadoInicial).toBe('suspended');
    expect(ctxs[0].resume).toHaveBeenCalledTimes(1);
    expect(ctxs[0].state).toBe('running');
  });

  it('sem nenhuma interação na aba, o toque sai no primeiro gesto do usuário', () => {
    // Recém-carregada e sem clique: aqui o navegador IGNORA o resume do mount e o toque
    // ficaria mudo até o usuário encostar em algo. O primeiro gesto é a única janela.
    render(<IncomingCallAlert />);

    expect(ctxs).toHaveLength(1);
    expect(ctxs[0].state).toBe('suspended');

    FakeAudioContext.ativacaoDoUsuario = true; // o usuário encostou na tela
    fireEvent.pointerDown(document);

    expect(ctxs[0].state).toBe('running');
  });

  it('para de escutar o gesto quando o alerta sai de cena', () => {
    const { unmount } = render(<IncomingCallAlert />);
    const ctx = ctxs[0];
    const aposMontar = ctx.resume.mock.calls.length;

    unmount();
    FakeAudioContext.ativacaoDoUsuario = true;
    fireEvent.pointerDown(document);
    fireEvent.keyDown(document, { key: 'a' });

    expect(ctx.resume.mock.calls.length).toBe(aposMontar);
  });
});
