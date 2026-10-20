import { describe, expect, it } from 'vitest';

import { createSendThrottle, SEND_THROTTLE_BURST, SEND_THROTTLE_MIN_INTERVAL_MS, SEND_THROTTLE_WINDOW_MS } from '../sendThrottle';

/**
 * Relógio manual: `wait()` é determinístico sem `vi.useFakeTimers` e sem
 * `await sleep(500)` — o teste não depende de tempo real e não fica lento.
 */
function criarRelogioManual() {
  let agora = 0;
  const timers: { at: number; fn: () => void; cancelado: boolean; disparado: boolean }[] = [];
  return {
    now: () => agora,
    schedule: (fn: () => void, delayMs: number) => {
      const timer = { at: agora + delayMs, fn, cancelado: false, disparado: false };
      timers.push(timer);
      return () => {
        timer.cancelado = true;
      };
    },
    async avancar(ms: number) {
      const alvo = agora + ms;
      for (;;) {
        const proximo = timers
          .filter((timer) => !timer.cancelado && !timer.disparado && timer.at <= alvo)
          .sort((a, b) => a.at - b.at)[0];
        if (!proximo) break;
        agora = proximo.at;
        proximo.disparado = true;
        proximo.fn();
        await Promise.resolve();
      }
      agora = alvo;
    },
  };
}

/** Dispara `n` envios e devolve o horário em que cada um foi liberado, na ordem. */
async function liberarEnvios(n: number) {
  const relogio = criarRelogioManual();
  const throttle = createSendThrottle({ clock: relogio });
  const liberados: number[] = [];
  for (let i = 0; i < n; i += 1) {
    void throttle.wait().then(() => liberados.push(relogio.now()));
  }
  // Deixa o envio de atraso zero registrar o horário ANTES de o relógio andar.
  await new Promise((resolve) => setTimeout(resolve, 0));
  await relogio.avancar(60_000);
  return liberados;
}

/** Maior quantidade de envios dentro de qualquer janela de `janelaMs`. */
function picoPorJanela(horarios: number[], janelaMs: number): number {
  return horarios.reduce((pico, inicio) => {
    const dentro = horarios.filter((at) => at >= inicio && at < inicio + janelaMs).length;
    return Math.max(pico, dentro);
  }, 0);
}

describe('createSendThrottle', () => {
  it('espaça envios consecutivos no intervalo mínimo de 500 ms', async () => {
    const liberados = await liberarEnvios(3);

    expect(liberados).toEqual([0, SEND_THROTTLE_MIN_INTERVAL_MS, SEND_THROTTLE_MIN_INTERVAL_MS * 2]);
  });

  it('empurra o 6º envio para fora da janela: no máximo 5 envios em 3 s', async () => {
    const liberados = await liberarEnvios(SEND_THROTTLE_BURST + 1);

    expect(liberados).toEqual([0, 500, 1000, 1500, 2000, SEND_THROTTLE_WINDOW_MS]);
    expect(picoPorJanela(liberados, SEND_THROTTLE_WINDOW_MS)).toBe(SEND_THROTTLE_BURST);
  });

  it('nunca descarta envio: uma rajada de 10 sai toda, só espaçada', async () => {
    const liberados = await liberarEnvios(10);

    expect(liberados).toHaveLength(10);
    expect(new Set(liberados).size).toBe(10);
    expect(picoPorJanela(liberados, SEND_THROTTLE_WINDOW_MS)).toBeLessThanOrEqual(SEND_THROTTLE_BURST);
  });

  it('conta como pendente o envio que ainda espera a vez', () => {
    const relogio = criarRelogioManual();
    const throttle = createSendThrottle({ clock: relogio });

    void throttle.wait();
    void throttle.wait();

    expect(throttle.pendingCount()).toBe(1);
  });
});
