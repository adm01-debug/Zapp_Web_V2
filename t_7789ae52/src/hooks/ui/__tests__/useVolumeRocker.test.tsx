import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, createEvent, act } from '@testing-library/react';
import { useRef } from 'react';
import { useVolumeRocker } from '@/hooks/ui/useVolumeRocker';

/**
 * Teste DIRETO do hook de interação compartilhado pelos dois controles de volume.
 *
 * Os testes de componente (`SoundVolumeControl`, `MediaVolume`) cobrem o caminho
 * feliz; a MATRIZ DE OPÇÕES (`enabled`/`wheelEnabled`) e o cancelamento do clique
 * longo só aparecem aqui — sem eles, desligar a roda no controle das mídias, por
 * exemplo, passava despercebido.
 */
const onAdjust = vi.fn();
const onToggleMute = vi.fn();

interface Opcoes {
  enabled?: boolean;
  wheelEnabled?: boolean;
}

/** Host mínimo: o `rootRef` precisa estar num elemento real para a roda ser ouvida. */
function Hoste({ enabled, wheelEnabled }: Opcoes) {
  const rootRef = useRef<HTMLSpanElement>(null);
  const rocker = useVolumeRocker({ step: 5, onAdjust, onToggleMute, rootRef, enabled, wheelEnabled });

  return (
    <span ref={rootRef} data-testid="root">
      <button
        data-testid="gatilho"
        onClick={rocker.handleTriggerClick}
        onPointerDown={rocker.handlePointerDown}
        onPointerUp={rocker.clearLongPress}
        onPointerLeave={rocker.clearLongPress}
        onKeyDown={rocker.handleTriggerKeyDown}
      >
        {rocker.open ? 'aberto' : 'fechado'}
      </button>
    </span>
  );
}

const gatilho = () => screen.getByTestId('gatilho');

const roda = (deltaY: number) => {
  const evento = new WheelEvent('wheel', { deltaY, bubbles: true, cancelable: true });
  act(() => {
    screen.getByTestId('root').dispatchEvent(evento);
  });
  return evento;
};

describe('useVolumeRocker — matriz de opções e dedup do clique longo', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('com enabled=false não muta, não ajusta, não abre e ignora a roda', () => {
    render(<Hoste enabled={false} />);

    fireEvent.click(gatilho());
    fireEvent.keyDown(gatilho(), { key: 'ArrowUp' });
    fireEvent.keyDown(gatilho(), { key: 'Enter' });
    fireEvent.keyDown(gatilho(), { key: 'm' });
    roda(-100);

    expect(onToggleMute).not.toHaveBeenCalled();
    expect(onAdjust).not.toHaveBeenCalled();
    expect(gatilho()).toHaveTextContent('fechado');
  });

  it('com wheelEnabled=false a roda não ajusta nada (e a página pode rolar), mas as setas continuam', () => {
    render(<Hoste wheelEnabled={false} />);

    const evento = roda(-100);
    expect(onAdjust).not.toHaveBeenCalled();
    expect(evento.defaultPrevented).toBe(false);

    fireEvent.keyDown(gatilho(), { key: 'ArrowUp' });
    expect(onAdjust).toHaveBeenCalledWith(5);
  });

  it('a roda ajusta ±step e impede a rolagem da página junto', () => {
    render(<Hoste />);

    expect(roda(-100).defaultPrevented).toBe(true);
    expect(onAdjust).toHaveBeenLastCalledWith(5);
    expect(roda(100).defaultPrevented).toBe(true);
    expect(onAdjust).toHaveBeenLastCalledWith(-5);
  });

  it('clique curto alterna o mudo; as setas e o M seguem o mesmo contrato', () => {
    render(<Hoste />);

    fireEvent.click(gatilho());
    expect(onToggleMute).toHaveBeenCalledTimes(1);

    fireEvent.keyDown(gatilho(), { key: 'ArrowUp' });
    expect(onAdjust).toHaveBeenLastCalledWith(5);
    fireEvent.keyDown(gatilho(), { key: 'ArrowDown' });
    expect(onAdjust).toHaveBeenLastCalledWith(-5);

    fireEvent.keyDown(gatilho(), { key: 'M' });
    expect(onToggleMute).toHaveBeenCalledTimes(2);
  });

  it('clique longo (400 ms) abre o slider', () => {
    render(<Hoste />);

    fireEvent.pointerDown(gatilho());
    act(() => {
      vi.advanceTimersByTime(399);
    });
    expect(gatilho()).toHaveTextContent('fechado');

    act(() => {
      vi.advanceTimersByTime(1);
    });
    expect(gatilho()).toHaveTextContent('aberto');
  });

  it('o clique que fecha o clique longo NÃO alterna o mudo (dedup)', () => {
    render(<Hoste />);

    fireEvent.pointerDown(gatilho());
    act(() => {
      vi.advanceTimersByTime(400);
    });
    fireEvent.click(gatilho());

    expect(onToggleMute).not.toHaveBeenCalled();
    expect(gatilho()).toHaveTextContent('aberto');
  });

  it('soltar o ponteiro antes dos 400 ms cancela o clique longo (e o próximo clique muta normal)', () => {
    render(<Hoste />);

    fireEvent.pointerDown(gatilho());
    act(() => {
      vi.advanceTimersByTime(399);
    });
    fireEvent.pointerUp(gatilho());
    act(() => {
      vi.advanceTimersByTime(1000);
    });

    expect(gatilho()).toHaveTextContent('fechado');

    fireEvent.click(gatilho());
    expect(onToggleMute).toHaveBeenCalledTimes(1);
  });

  it('Enter abre o slider e cancela o clique nativo do botão (não muta)', () => {
    render(<Hoste />);

    const evento = createEvent.keyDown(gatilho(), { key: 'Enter' });
    fireEvent(gatilho(), evento);

    expect(evento.defaultPrevented).toBe(true);
    expect(gatilho()).toHaveTextContent('aberto');
    expect(onToggleMute).not.toHaveBeenCalled();
  });

  it('as setas só agem com o foco no gatilho — não há captura global de teclado', () => {
    render(<Hoste />);

    fireEvent.keyDown(document.body, { key: 'ArrowUp' });
    expect(onAdjust).not.toHaveBeenCalled();
    expect(onToggleMute).not.toHaveBeenCalled();

    fireEvent.keyDown(gatilho(), { key: 'ArrowUp' });
    expect(onAdjust).toHaveBeenCalledWith(5);
  });
});
