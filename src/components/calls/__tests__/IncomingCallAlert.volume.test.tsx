import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { cleanup, render } from '@testing-library/react';
import { registrarGuardaDeWebSocket } from './websocketSpy';

// Mesma prova de regressão "zero WebSocket" dos outros testes do alerta: o realtime-js
// captura o construtor de `WebSocket` na avaliação de `@/integrations/supabase/client`,
// então o espião tem de entrar ANTES dos imports (daí `vi.hoisted`).
await vi.hoisted(async () => {
  (await import('./websocketSpy')).instalarEspiaoWebSocket();
});
registrarGuardaDeWebSocket();

/**
 * TETO DE GANHO DO TOQUE DA CHAMADA (achado B10 / etapa S45 do plano de volume).
 *
 * O toque soa em `soundVolume/100 * RING_GAIN_CAP` (`RING_GAIN_CAP = 0.2`): com o painel
 * no máximo o ganho aplicado é 0,2; com 50 é 0,1. O cartão Q10 NÃO muda esse valor —
 * documenta e prova o comportamento atual. Este teste existe para que qualquer mexida no
 * teto (para cima ou para baixo) apareça como falha, com o número na cara.
 *
 * O ganho é lido pelo caminho REAL do componente (o `gain` do WebAudio que ele cria), não
 * por uma cópia da fórmula. `ParametroDeGanhoFalso` guarda TODOS os valores aplicados,
 * porque o toque alterna `vol ↔ 0` a cada 500 ms: o primeiro valor é o nível audível do
 * toque e a varredura da lista prova que nada passa do teto.
 */

/** AudioContexts criados pelo componente (um por toque efetivamente iniciado). */
const ctxs: FakeAudioContext[] = [];

/** Todo parâmetro de ganho criado pelo componente, na ordem. */
const ganhos: ParametroDeGanhoFalso[] = [];

/** Parâmetro `gain.value` do WebAudio, com histórico de tudo que foi aplicado. */
class ParametroDeGanhoFalso {
  readonly valores: number[] = [];
  private atual = 0;

  get value(): number {
    return this.atual;
  }

  set value(novo: number) {
    this.atual = novo;
    this.valores.push(novo);
  }
}

class FakeGainNode {
  readonly gain = new ParametroDeGanhoFalso();
  connect = vi.fn();
  disconnect = vi.fn();

  constructor() {
    ganhos.push(this.gain);
  }
}

class FakeOscillatorNode {
  type = 'sine';
  frequency = { value: 0 };
  connect = vi.fn();
  start = vi.fn();
  stop = vi.fn();
}

class FakeAudioContext {
  /** A aba já recebeu gesto: o `resume()` é atendido (não é o assunto deste arquivo). */
  static ativacaoDoUsuario = true;
  state = 'running';
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

/** Preferências de alerta: mutável por cenário (o mock devolve a MESMA referência). */
const configAlerta = vi.hoisted(() => ({
  soundEnabled: true,
  soundVolume: 100,
}));

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

// O alerta fala com a MÁQUINA da sessão: sem este mock o `useCallSession()` lança.
vi.mock('@/providers/CallSessionProvider', () => ({
  useCallSession: () => ({
    accept: vi.fn(),
    reject: vi.fn(),
    session: { status: 'ringing_in', sessionId: 'k1', answeredAt: null },
  }),
}));

vi.mock('@/hooks/calls/useCallChannels', () => ({
  useCallChannels: () => ({
    voip: { channel: 'voip', canDial: true, canReceive: true, canRecord: false, canReject: true },
    whatsapp: {
      channel: 'whatsapp',
      canDial: false,
      canReceive: true,
      canRecord: false,
      canReject: false,
      reason: 'whatsapp_no_outbound',
    },
  }),
}));

vi.mock('@/hooks/system/useNotificationSettings', () => ({
  useNotificationSettings: () => ({
    settings: configAlerta,
    isQuietHours: () => false,
  }),
}));

vi.mock('@/lib/logger', () => ({
  getLogger: () => ({ error: vi.fn(), warn: vi.fn(), debug: vi.fn(), info: vi.fn() }),
}));

// `useTerminoRemoto` assina o realtime (`supabase.channel(...).on(...).subscribe()`);
// o transporte é dublado para nenhum byte sair para a rede.
vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    channel: vi.fn(() => ({ on: vi.fn().mockReturnThis(), subscribe: vi.fn().mockReturnThis() })),
    removeChannel: vi.fn(),
  },
}));

import { IncomingCallAlert, RING_GAIN_CAP } from '../IncomingCallAlert';
import { setMuted, setVolume } from '@/lib/mediaVolumeStore';

describe('IncomingCallAlert — teto de ganho do toque (B10/S45)', () => {
  beforeEach(() => {
    cleanup();
    ctxs.length = 0;
    ganhos.length = 0;
    configAlerta.soundEnabled = true;
    configAlerta.soundVolume = 100;
    // Canal das MÍDIAS (separado): volta ao padrão antes de cada cenário.
    setMuted(false);
    setVolume(80);
  });

  afterEach(() => {
    cleanup();
  });

  it('soundVolume 100 (máximo do painel) → ganho 0,2 — o teto de 20 %', () => {
    render(<IncomingCallAlert />);

    expect(ctxs).toHaveLength(1);
    expect(ganhos).toHaveLength(1);
    expect(ganhos[0].valores[0]).toBeCloseTo(0.2, 10);
    // O toque alterna 0 ↔ vol a cada 500 ms; nada pode passar do teto.
    expect(ganhos[0].valores.every((v) => v === 0 || v <= 0.2)).toBe(true);
  });

  it('soundVolume 50 → ganho 0,1: o volume escala por baixo do teto', () => {
    configAlerta.soundVolume = 50;
    render(<IncomingCallAlert />);

    expect(ganhos).toHaveLength(1);
    expect(ganhos[0].valores[0]).toBeCloseTo(0.1, 10);
  });

  it('mudo (soundEnabled = false) → ganho 0: o toque não soa', () => {
    configAlerta.soundEnabled = false;
    render(<IncomingCallAlert />);

    // Nenhum AudioContext é aberto e nenhum ganho é aplicado: silêncio absoluto,
    // em vez de um oscilador tocando com ganho zerado.
    expect(ctxs).toHaveLength(0);
    expect(ganhos).toEqual([]);
  });

  it('o volume das MÍDIAS não interfere no toque da chamada', () => {
    setVolume(0); // mídias zeradas
    setMuted(true); // e mudas

    render(<IncomingCallAlert />);

    expect(ganhos).toHaveLength(1);
    expect(ganhos[0].valores[0]).toBeCloseTo(0.2, 10);

    // Mexer nas mídias COM o toque em curso também não muda nada: o alerta tem o
    // próprio AudioContext e não obedece ao `mediaVolumeStore` (âncora do módulo).
    setVolume(15);
    setMuted(false);

    expect(ganhos).toHaveLength(1);
    expect(ganhos[0].valores[0]).toBeCloseTo(0.2, 10);
  });

  it('metade do volume = metade do ganho (os DOIS lados vêm do código, não do teste)', () => {
    render(<IncomingCallAlert />);
    const ganhoNoTeto = ganhos[0].valores[0];
    cleanup();

    configAlerta.soundVolume = 50;
    render(<IncomingCallAlert />);
    const ganhoNaMetade = ganhos[1].valores[0];

    // Nenhum dos dois números foi escrito no teste: saíram do ganho que o componente
    // aplicou em cada cenário. Se a fórmula de produção deixar de ser linear no volume,
    // isto falha — sem depender de nenhum literal.
    expect(ganhoNaMetade).toBeCloseTo(ganhoNoTeto / 2, 10);
  });

  it('o teto é uma constante nomeada e vale 0,2 (mudar exige decisão do dono)', () => {
    expect(RING_GAIN_CAP).toBe(0.2);
  });
});
