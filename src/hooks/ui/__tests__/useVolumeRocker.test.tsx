import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, createEvent, act } from '@testing-library/react';
import { useRef } from 'react';
import { useVolumeRocker } from '@/hooks/ui/useVolumeRocker';

/**
 * Teste DIRETO do hook de interação compartilhado pelos dois controles de volume.
 *
 * Os testes de componente (`SoundVolumeControl`, `MediaVolume`) cobrem o caminho
 * feliz; a MATRIZ DE OPÇÕES (`enabled`/`wheelEnabled`), o fechamento do painel
 * (clique fora, Esc, perda de foco com devolução do foco) e o comportamento no
 * TOQUE só aparecem aqui — sem eles, desligar a roda no controle das mídias, por
 * exemplo, passava despercebido.
 */
const onAdjust = vi.fn();
const onToggleMute = vi.fn();

interface Opcoes {
  enabled?: boolean;
  wheelEnabled?: boolean;
}

/**
 * Host mínimo: o `rootRef` precisa estar num elemento real para a roda ser ouvida.
 * O painel (`data-volume-panel`) é renderizado FORA do `rootRef`, como no app (o
 * Radix monta o conteúdo do popover num portal): é o que separa "dentro" de "fora".
 */
function Hoste({ enabled, wheelEnabled }: Opcoes) {
  const rootRef = useRef<HTMLSpanElement>(null);
  const rocker = useVolumeRocker({ step: 5, onAdjust, onToggleMute, rootRef, enabled, wheelEnabled });

  return (
    <div>
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
      {rocker.open && (
        <div data-volume-panel data-testid="painel">
          <button data-testid="controle-do-painel">ajustar</button>
        </div>
      )}
      <input data-testid="fora" aria-label="Campo de fora" />
    </div>
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

/** Abre o painel pelo caminho novo (clique), que é o do usuário. */
const abrir = () => {
  fireEvent.click(gatilho());
  expect(gatilho()).toHaveTextContent('aberto');
};

describe('useVolumeRocker — painel, matriz de opções e fechamento', () => {
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
    abrir();

    const evento = roda(-100);
    expect(onAdjust).not.toHaveBeenCalled();
    expect(evento.defaultPrevented).toBe(false);

    fireEvent.keyDown(gatilho(), { key: 'ArrowUp' });
    expect(onAdjust).toHaveBeenCalledWith(5);
  });

  it('a roda ajusta ±step (com o painel aberto) e impede a rolagem da página junto', () => {
    render(<Hoste />);
    abrir();

    expect(roda(-100).defaultPrevented).toBe(true);
    expect(onAdjust).toHaveBeenLastCalledWith(5);
    expect(roda(100).defaultPrevented).toBe(true);
    expect(onAdjust).toHaveBeenLastCalledWith(-5);
  });

  it('a roda NÃO ajusta com o painel fechado — rolar a sidebar não muda o volume (B5)', () => {
    render(<Hoste />);

    const evento = roda(-100);
    expect(onAdjust).not.toHaveBeenCalled();
    expect(evento.defaultPrevented).toBe(false);
  });

  it('o clique ABRE o painel e não alterna o mudo (D01)', () => {
    render(<Hoste />);

    fireEvent.click(gatilho());

    expect(gatilho()).toHaveTextContent('aberto');
    expect(onToggleMute).not.toHaveBeenCalled();
  });

  it('com o painel aberto o clique no gatilho mantém o painel aberto (não alterna o mudo)', () => {
    render(<Hoste />);
    abrir();

    fireEvent.click(gatilho());

    expect(gatilho()).toHaveTextContent('aberto');
    expect(onToggleMute).not.toHaveBeenCalled();
  });

  it('as setas e o M seguem o mesmo contrato, com o painel aberto', () => {
    render(<Hoste />);
    abrir();

    fireEvent.keyDown(gatilho(), { key: 'ArrowUp' });
    expect(onAdjust).toHaveBeenLastCalledWith(5);
    fireEvent.keyDown(gatilho(), { key: 'ArrowDown' });
    expect(onAdjust).toHaveBeenLastCalledWith(-5);

    fireEvent.keyDown(gatilho(), { key: 'M' });
    expect(onToggleMute).toHaveBeenCalledTimes(1);
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

  it('no TOQUE, soltar o dedo depois do clique longo NÃO fecha o painel (B2)', () => {
    render(<Hoste />);

    fireEvent.pointerDown(gatilho(), { pointerType: 'touch' });
    act(() => {
      vi.advanceTimersByTime(400);
    });
    expect(gatilho()).toHaveTextContent('aberto');

    // O navegador dispara o `pointerup` e, depois, o `click` sintético do toque.
    fireEvent.pointerUp(gatilho(), { pointerType: 'touch' });
    fireEvent.click(gatilho());

    expect(gatilho()).toHaveTextContent('aberto');
    expect(onToggleMute).not.toHaveBeenCalled();
  });

  it('no TOQUE, o toque curto também abre o painel — antes ele só mutava (B1)', () => {
    render(<Hoste />);

    fireEvent.pointerDown(gatilho(), { pointerType: 'touch' });
    fireEvent.pointerUp(gatilho(), { pointerType: 'touch' });
    fireEvent.click(gatilho());

    expect(gatilho()).toHaveTextContent('aberto');
    expect(onToggleMute).not.toHaveBeenCalled();
  });

  it('soltar o ponteiro antes dos 400 ms cancela o clique longo (e o clique seguinte abre o painel)', () => {
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
    expect(gatilho()).toHaveTextContent('aberto');
    expect(onToggleMute).not.toHaveBeenCalled();
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

  it('Esc fecha o painel e devolve o foco ao gatilho (S14/S15)', () => {
    render(<Hoste />);
    abrir();

    fireEvent.keyDown(document, { key: 'Escape' });

    expect(gatilho()).toHaveTextContent('fechado');
    expect(document.activeElement).toBe(gatilho());
  });

  it('clique FORA fecha o painel devolvendo o foco ao gatilho; clique no painel não fecha', () => {
    render(<Hoste />);
    abrir();

    fireEvent.pointerDown(screen.getByTestId('controle-do-painel'));
    expect(gatilho()).toHaveTextContent('aberto');

    fireEvent.pointerDown(screen.getByTestId('fora'));
    expect(gatilho()).toHaveTextContent('fechado');
    expect(document.activeElement).toBe(gatilho());
  });

  it('clique no body fecha o painel mesmo quando o portal está dentro do body', () => {
    render(<Hoste />);
    abrir();

    fireEvent.pointerDown(document.body);

    expect(gatilho()).toHaveTextContent('fechado');
    expect(document.activeElement).toBe(gatilho());
  });

  it('perda de foco fecha o painel (sem puxar o foco de volta de quem o moveu)', () => {
    render(<Hoste />);
    abrir();

    const fora = screen.getByTestId('fora');
    act(() => {
      fora.focus();
    });

    expect(gatilho()).toHaveTextContent('fechado');
    expect(document.activeElement).toBe(fora);
  });

  it('fechar o painel com o foco indo para fora NÃO alterna o mudo', () => {
    render(<Hoste />);
    abrir();

    fireEvent.keyDown(document, { key: 'Escape' });

    expect(onToggleMute).not.toHaveBeenCalled();
  });
});
