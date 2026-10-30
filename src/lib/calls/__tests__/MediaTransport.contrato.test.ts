/**
 * Contrato de `MediaTransport` — etapa E005 do plano das ligações.
 *
 * Testa a **forma** do contrato, não um transporte real (o cartão proíbe
 * implementar motor/transporte de verdade). O `transporteFake` abaixo é a
 * implementação mínima que obedece ao documento em `../MediaTransport.ts`; o que
 * se prova é o comportamento exigido de **qualquer** implementação — inclusive a
 * de WebRTC que substituirá o WebSocket.
 */
import { describe, it, expect } from 'vitest';
import {
  PCM16_CHANNELS,
  PCM16_FRAME_SAMPLES,
  PCM16_SAMPLE_RATE_HZ,
  type AudioFrame,
  type MediaTransport,
  type MediaTransportFrameListener,
  type MediaTransportStats,
} from '../MediaTransport';

/** Transporte fake mínimo, conforme o contrato (só para o teste). */
function transporteFake(): { engine: MediaTransport; receber: (frame: AudioFrame) => void } {
  let aberto = false;
  let framesSent = 0;
  let framesReceived = 0;
  const framesDropped = 0;
  const listeners = new Set<MediaTransportFrameListener>();

  const engine: MediaTransport = {
    async open() {
      aberto = true;
    },
    async close() {
      aberto = false;
    },
    sendFrame(frame) {
      if (!aberto || frame.data.length === 0) return false;
      framesSent += 1;
      return true;
    },
    onFrame(listener) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    stats(): MediaTransportStats {
      return { rttMs: null, framesSent, framesReceived, framesDropped };
    },
  };

  // Só o teste empurra quadros de entrada (o fio real os traz sozinho).
  function receber(frame: AudioFrame): void {
    framesReceived += 1;
    for (const listener of [...listeners]) listener(frame);
  }

  return { engine, receber };
}

/** Quadro PCM16 válido conforme o formato de referência. */
function quadro(): AudioFrame {
  return {
    data: new Int16Array(PCM16_FRAME_SAMPLES),
    sampleRate: PCM16_SAMPLE_RATE_HZ,
    channels: PCM16_CHANNELS,
  };
}

describe('contrato MediaTransport', () => {
  it('sendFrame antes de open não envia (false) e não conta quadro', async () => {
    const { engine } = transporteFake();
    expect(engine.sendFrame(quadro())).toBe(false);
    expect(engine.stats().framesSent).toBe(0);

    await engine.open();
    expect(engine.sendFrame(quadro())).toBe(true);
    expect(engine.stats().framesSent).toBe(1);
  });

  it('open é idempotente e sendFrame após close volta a falhar', async () => {
    const { engine } = transporteFake();
    await engine.open();
    await engine.open(); // não lança
    expect(engine.sendFrame(quadro())).toBe(true);

    await engine.close();
    await engine.close(); // fechar duas vezes não lança
    expect(engine.sendFrame(quadro())).toBe(false);
  });

  it('onFrame entrega ao assinante e cancelar interrompe a entrega', async () => {
    const { engine, receber } = transporteFake();
    const recebidos: AudioFrame[] = [];
    const cancelar = engine.onFrame((f) => recebidos.push(f));

    receber(quadro());
    expect(recebidos).toHaveLength(1);
    expect(engine.stats().framesReceived).toBe(1);

    cancelar();
    receber(quadro());
    expect(recebidos).toHaveLength(1); // nada novo depois de cancelar
    expect(() => cancelar()).not.toThrow(); // cancelar duas vezes não lança
  });

  it('stats começa zerado (rttMs null) e devolve um objeto novo a cada chamada', () => {
    const { engine } = transporteFake();
    const primeira = engine.stats();
    expect(primeira).toEqual({ rttMs: null, framesSent: 0, framesReceived: 0, framesDropped: 0 });
    expect(engine.stats()).not.toBe(primeira);
  });

  it('pina o formato de referência do primeiro motor (PCM16LE 16 kHz mono, 960 amostras)', () => {
    expect(PCM16_SAMPLE_RATE_HZ).toBe(16000);
    expect(PCM16_FRAME_SAMPLES).toBe(960);
    expect(PCM16_CHANNELS).toBe(1);
  });
});
