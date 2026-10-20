/**
 * Throttle de envio de mensagens (SL-070 · item 026 do inventário de paridade V1/V3).
 *
 * O que este módulo existe para impedir: uma rajada de envios sair toda de uma vez
 * quando a rede volta (drenagem da fila offline, item 025) ou quando o agente
 * martela o botão enviar. A regra é a do V3 (`features/inbox/hooks/useSendThrottle.ts`):
 * no mínimo 500 ms entre dois envios e nunca mais de 5 envios em 3 s.
 *
 * Módulo puro: sem React, sem DOM e sem timer global obrigatório. O relógio e o
 * agendador entram por `options.clock`, o que torna a espera determinística nos
 * testes (nenhum `vi.useFakeTimers` e nenhum `await sleep(500)` — que deixaria o
 * teste lento e instável).
 *
 * `wait()` NUNCA descarta envio: ele só adia. Quem desiste é o chamador.
 */

/** Intervalo mínimo entre dois envios. */
export const SEND_THROTTLE_MIN_INTERVAL_MS = 500;
/** Envios permitidos por janela. */
export const SEND_THROTTLE_BURST = 5;
/** Tamanho da janela do burst. */
export const SEND_THROTTLE_WINDOW_MS = 3_000;

export interface SendThrottleClock {
  now(): number;
  /** Agenda `callback` para daqui a `delayMs`; devolve o cancelador. */
  schedule(callback: () => void, delayMs: number): () => void;
}

export interface SendThrottleOptions {
  minIntervalMs?: number;
  burst?: number;
  windowMs?: number;
  clock?: SendThrottleClock;
}

export interface SendThrottle {
  /** Resolve quando o envio pode sair, respeitando intervalo mínimo e burst. */
  wait(): Promise<void>;
  /** Envios agendados que ainda não saíram. */
  pendingCount(): number;
  /** Envios reservados dentro da janela contada a partir de agora. */
  recentCount(): number;
  /** Zera o estado (usado por teste e por logout). */
  reset(): void;
}

const systemClock: SendThrottleClock = {
  now: () => Date.now(),
  schedule: (callback, delayMs) => {
    const timer = setTimeout(callback, delayMs);
    return () => clearTimeout(timer);
  },
};

/** Inteiro positivo saneado; valor inválido cai no padrão do módulo. */
function positiveInt(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isInteger(value) && value > 0 ? value : fallback;
}

export function createSendThrottle(options: SendThrottleOptions = {}): SendThrottle {
  const minIntervalMs = positiveInt(options.minIntervalMs, SEND_THROTTLE_MIN_INTERVAL_MS);
  const burst = positiveInt(options.burst, SEND_THROTTLE_BURST);
  const windowMs = positiveInt(options.windowMs, SEND_THROTTLE_WINDOW_MS);
  const clock = options.clock ?? systemClock;

  /** Horários (passados e futuros) já reservados, em ordem crescente. */
  let reservations: number[] = [];
  let pending = 0;

  function withinWindow(slot: number): number[] {
    return reservations.filter((at) => at > slot - windowMs && at <= slot);
  }

  /**
   * Reserva o próximo horário livre. Duas regras em sequência:
   * 1) nunca antes de `minIntervalMs` do último envio reservado;
   * 2) enquanto a janela `(slot - windowMs, slot]` já tiver `burst` envios, o
   *    horário anda para quando o mais antigo da janela sai dela — é isso que
   *    espaça a rajada em vez de derrubá-la.
   */
  function reserve(): number {
    let slot = Math.max(clock.now(), (reservations[reservations.length - 1] ?? -Infinity) + minIntervalMs);
    for (;;) {
      const inWindow = withinWindow(slot);
      if (inWindow.length < burst) break;
      // `inWindow[0] > slot - windowMs`, logo `inWindow[0] + windowMs > slot`: o
      // horário sempre anda para frente e o laço termina.
      slot = inWindow[0] + windowMs;
    }
    reservations = [...reservations.filter((at) => at > clock.now() - windowMs), slot];
    return slot;
  }

  function wait(): Promise<void> {
    const slot = reserve();
    const delay = Math.max(0, slot - clock.now());
    if (delay === 0) return Promise.resolve();
    pending += 1;
    return new Promise<void>((resolve) => {
      clock.schedule(() => {
        pending -= 1;
        resolve();
      }, delay);
    });
  }

  return {
    wait,
    pendingCount: () => pending,
    recentCount: () => withinWindow(clock.now()).length,
    reset: () => {
      reservations = [];
      pending = 0;
    },
  };
}

/** Throttle do envio do chat: um só por aba (as abas se coordenam pelo dedupe). */
export const sendThrottle: SendThrottle = createSendThrottle();
