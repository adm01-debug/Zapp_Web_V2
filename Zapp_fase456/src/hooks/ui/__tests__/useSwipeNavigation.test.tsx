/**
 * Comportamento de `useSwipeNavigation` — gesto de borda para voltar/avançar. O gesto é
 * provado com eventos de toque despachados no `document` (a mesma superfície que o hook
 * registra), relógio congelado (o "flick" tem janela de 300 ms) e `window.innerWidth` fixo.
 */
import { renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi, type Mock } from 'vitest';
import { useSwipeNavigation } from '../useSwipeNavigation';

const LARGURA = 1024;

interface Ponto {
  clientX: number;
  clientY: number;
}

type EventoToque = Event & { touches: Ponto[]; changedTouches: Ponto[] };

function disparar(tipo: 'touchstart' | 'touchmove' | 'touchend', pontos: Ponto[]) {
  const evento = new Event(tipo, { bubbles: true, cancelable: true }) as EventoToque;
  evento.touches = pontos;
  evento.changedTouches = pontos;
  document.dispatchEvent(evento);
}

const indicadores = () => document.querySelectorAll('.swipe-nav-indicator');
const indicadorEsquerdo = () => document.querySelector('.swipe-nav-left');

/** Um arrasto completo: começa em `inicio`, passa por `meio` (opcional) e solta em `fim`. */
function arrastar(inicio: Ponto, fim: Ponto, meio?: Ponto) {
  disparar('touchstart', [inicio]);
  if (meio) disparar('touchmove', [meio]);
  disparar('touchmove', [fim]);
  disparar('touchend', [fim]);
}

let onSwipeBack: Mock<() => void>;
let onSwipeForward: Mock<() => void>;

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date(2026, 9, 7, 15, 0, 0));
  Object.defineProperty(window, 'innerWidth', { value: LARGURA, writable: true, configurable: true });
  onSwipeBack = vi.fn<() => void>();
  onSwipeForward = vi.fn<() => void>();
});

afterEach(() => {
  vi.useRealTimers();
  document.body.innerHTML = '';
});

describe('zona de borda', () => {
  it('arrasto que começa fora da borda não navega', () => {
    renderHook(() =>
      useSwipeNavigation({ onSwipeBack, canGoBack: true, onSwipeForward, canGoForward: true }),
    );
    arrastar({ clientX: 500, clientY: 300 }, { clientX: 700, clientY: 300 });
    expect(onSwipeBack).not.toHaveBeenCalled();
    expect(onSwipeForward).not.toHaveBeenCalled();
  });

  it('borda esquerda com histórico volta ao arrastar além do limite', () => {
    renderHook(() => useSwipeNavigation({ onSwipeBack, canGoBack: true }));
    arrastar({ clientX: 10, clientY: 300 }, { clientX: 100, clientY: 300 });
    expect(onSwipeBack).toHaveBeenCalledTimes(1);
  });

  it('borda direita com histórico avança ao arrastar para a esquerda', () => {
    renderHook(() => useSwipeNavigation({ onSwipeForward, canGoForward: true }));
    arrastar({ clientX: LARGURA - 10, clientY: 300 }, { clientX: LARGURA - 130, clientY: 300 });
    expect(onSwipeForward).toHaveBeenCalledTimes(1);
  });

  it('a borda esquerda não volta quando não há histórico', () => {
    renderHook(() =>
      useSwipeNavigation({ onSwipeBack, canGoBack: false, onSwipeForward, canGoForward: true }),
    );
    arrastar({ clientX: 10, clientY: 300 }, { clientX: 200, clientY: 300 });
    expect(onSwipeBack).not.toHaveBeenCalled();
  });

  it('respeita edgeWidth customizado', () => {
    renderHook(() => useSwipeNavigation({ onSwipeBack, canGoBack: true, edgeWidth: 100 }));
    arrastar({ clientX: 90, clientY: 300 }, { clientX: 190, clientY: 300 });
    expect(onSwipeBack).toHaveBeenCalledTimes(1);
  });
});

describe('limiar e flick', () => {
  it('arrasto curto que não é flick não navega', () => {
    renderHook(() => useSwipeNavigation({ onSwipeBack, canGoBack: true }));
    arrastar({ clientX: 10, clientY: 300 }, { clientX: 32, clientY: 300 });
    expect(onSwipeBack).not.toHaveBeenCalled();
  });

  it('flick curto e rápido (menos de 300 ms) navega antes do limiar', () => {
    renderHook(() => useSwipeNavigation({ onSwipeBack, canGoBack: true }));
    arrastar({ clientX: 10, clientY: 300 }, { clientX: 50, clientY: 300 }); // 40 px, ~0 ms
    expect(onSwipeBack).toHaveBeenCalledTimes(1);
  });

  it('flick lento abaixo do limiar não navega', () => {
    renderHook(() => useSwipeNavigation({ onSwipeBack, canGoBack: true }));
    disparar('touchstart', [{ clientX: 10, clientY: 300 }]);
    vi.advanceTimersByTime(400);
    // 40 px (> 30) porém depois da janela de 300 ms e abaixo do limiar de 80
    disparar('touchmove', [{ clientX: 50, clientY: 300 }]);
    disparar('touchend', [{ clientX: 50, clientY: 300 }]);
    expect(onSwipeBack).not.toHaveBeenCalled();
  });

  it('respeita threshold customizado', () => {
    renderHook(() => useSwipeNavigation({ onSwipeBack, canGoBack: true, threshold: 10 }));
    arrastar({ clientX: 10, clientY: 300 }, { clientX: 25, clientY: 300 });
    expect(onSwipeBack).toHaveBeenCalledTimes(1);
  });

  it('arrasto na direção contrária da borda não navega', () => {
    renderHook(() => useSwipeNavigation({ onSwipeBack, canGoBack: true }));
    arrastar({ clientX: 10, clientY: 300 }, { clientX: -100, clientY: 300 });
    expect(onSwipeBack).not.toHaveBeenCalled();
  });
});

describe('rolagem vertical', () => {
  it('cancela o gesto quando o movimento vertical domina', () => {
    renderHook(() => useSwipeNavigation({ onSwipeBack, canGoBack: true }));
    disparar('touchstart', [{ clientX: 10, clientY: 100 }]);
    disparar('touchmove', [{ clientX: 40, clientY: 400 }]); // |dy| 300 > |dx| 30 * 1.5
    disparar('touchend', [{ clientX: 300, clientY: 400 }]);
    expect(onSwipeBack).not.toHaveBeenCalled();
    expect(indicadores()).toHaveLength(0);
  });
});

describe('indicador visual', () => {
  it('cria o indicador durante o arrasto e o remove depois de soltar', () => {
    renderHook(() => useSwipeNavigation({ onSwipeBack, canGoBack: true }));
    disparar('touchstart', [{ clientX: 10, clientY: 300 }]);
    disparar('touchmove', [{ clientX: 60, clientY: 300 }]);

    expect(indicadores()).toHaveLength(1);
    const indicador = indicadorEsquerdo();
    expect(indicador).not.toBeNull();
    // dx = 50 px: acompanha o dedo, mas para em 16 px da borda.
    expect(indicador?.getAttribute('style')).toContain('left: 16px');
    expect(indicador?.getAttribute('style')).toContain('opacity: 0.625');

    disparar('touchend', [{ clientX: 60, clientY: 300 }]);
    expect(indicador?.getAttribute('style') ?? '').toContain('opacity: 0');
    vi.advanceTimersByTime(250);
    expect(indicadores()).toHaveLength(0);
  });

  it('não cria dois indicadores no mesmo gesto', () => {
    renderHook(() => useSwipeNavigation({ onSwipeBack, canGoBack: true }));
    disparar('touchstart', [{ clientX: 10, clientY: 300 }]);
    disparar('touchmove', [{ clientX: 40, clientY: 300 }]);
    disparar('touchmove', [{ clientX: 60, clientY: 300 }]);
    expect(indicadores()).toHaveLength(1);
  });

  it('remove o indicador no unmount', () => {
    const { unmount } = renderHook(() => useSwipeNavigation({ onSwipeBack, canGoBack: true }));
    disparar('touchstart', [{ clientX: 10, clientY: 300 }]);
    disparar('touchmove', [{ clientX: 40, clientY: 300 }]);
    expect(indicadores()).toHaveLength(1);

    unmount();
    vi.advanceTimersByTime(250);
    expect(indicadores()).toHaveLength(0);
  });
});

describe('enabled', () => {
  it('com enabled=false não registra listener nenhum', () => {
    renderHook(() => useSwipeNavigation({ onSwipeBack, canGoBack: true, enabled: false }));
    arrastar({ clientX: 10, clientY: 300 }, { clientX: 200, clientY: 300 });
    expect(onSwipeBack).not.toHaveBeenCalled();
    expect(indicadores()).toHaveLength(0);
  });

  it('desligar depois de ligado para de reagir ao gesto', () => {
    const { rerender } = renderHook(
      ({ enabled }: { enabled: boolean }) =>
        useSwipeNavigation({ onSwipeBack, canGoBack: true, enabled }),
      { initialProps: { enabled: true } },
    );
    arrastar({ clientX: 10, clientY: 300 }, { clientX: 200, clientY: 300 });
    expect(onSwipeBack).toHaveBeenCalledTimes(1);

    rerender({ enabled: false });
    arrastar({ clientX: 10, clientY: 300 }, { clientX: 200, clientY: 300 });
    expect(onSwipeBack).toHaveBeenCalledTimes(1);
  });

  it('não navega depois do unmount nem estoura sem callback', () => {
    const { unmount } = renderHook(() => useSwipeNavigation({ onSwipeBack, canGoBack: true }));
    unmount();
    arrastar({ clientX: 10, clientY: 300 }, { clientX: 200, clientY: 300 });
    expect(onSwipeBack).not.toHaveBeenCalled();

    renderHook(() => useSwipeNavigation({ canGoBack: true }));
    expect(() => {
      arrastar({ clientX: 10, clientY: 300 }, { clientX: 200, clientY: 300 });
    }).not.toThrow();
  });
});
