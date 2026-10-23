import { describe, it, expect, beforeAll, beforeEach, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { axe } from 'vitest-axe';
import { useState } from 'react';
import { VolumeDial, type VolumeDialProps } from '@/components/ui/VolumeDial';

// O setup global (src/test/setup.ts) define getBoundingClientRect com width=800/height=600,
// o que desloca o centro do elemento para (400,300). O VolumeDial usa o centro para calcular
// o ângulo do ponteiro — com o centro errado todos os testes de ponteiro falham.
// Este beforeAll sobrescreve o mock global para este arquivo, zerando as dimensões do
// elemento, de modo que cx=0/cy=0 coincida com as coordenadas esperadas pelos testes.
beforeAll(() => {
  vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockReturnValue({
    width: 0, height: 0, top: 0, left: 0, right: 0, bottom: 0, x: 0, y: 0, toJSON: () => ({}),
  } as DOMRect);
});

// `useReducedMotion` é controlado pelo teste: o ambiente jsdom não tem mídia de verdade.
const estado = vi.hoisted(() => ({ reduzido: false }));
vi.mock('framer-motion', async (importOriginal) => {
  const real = await importOriginal<typeof import('framer-motion')>();
  return { ...real, useReducedMotion: () => estado.reduzido };
});

type HarnessProps = Partial<VolumeDialProps> & { inicial?: number; onNovo?: (v: number) => void };

/** Envolve o dial controlado, como os consumidores reais fazem. */
function Harness({ inicial = 50, onNovo, ...props }: HarnessProps) {
  const [valor, setValor] = useState(inicial);
  return (
    <VolumeDial
      ariaLabel="Volume"
      {...props}
      value={valor}
      onChange={(v) => {
        onNovo?.(v);
        setValor(v);
      }}
    />
  );
}

const dial = () => screen.getByRole('slider');
const knob = () => screen.getByTestId('volume-dial-knob');

/** jsdom não implementa captura de ponteiro; a captura é espiada no elemento real. */
function espiaCaptura(el: HTMLElement) {
  const capturar = vi.fn();
  const soltar = vi.fn();
  Object.assign(el, { setPointerCapture: capturar, releasePointerCapture: soltar });
  return { capturar, soltar };
}

beforeEach(() => {
  estado.reduzido = false;
});

describe('VolumeDial — papel, nome e valores acessíveis', () => {
  it('expõe role=slider focável com min/max/now/valuetext', () => {
    render(<Harness inicial={40} />);
    expect(dial()).toHaveAttribute('aria-valuemin', '0');
    expect(dial()).toHaveAttribute('aria-valuemax', '100');
    expect(dial()).toHaveAttribute('aria-valuenow', '40');
    expect(dial()).toHaveAttribute('aria-valuetext', '40 por cento');
    expect(dial()).toHaveAttribute('tabindex', '0');
  });

  it('usa valueLabel no centro e no texto falado quando informado', () => {
    render(<Harness inicial={70} valueLabel="70%" />);
    expect(screen.getByTestId('volume-dial-value')).toHaveTextContent('70%');
    expect(dial()).toHaveAttribute('aria-valuetext', '70%');
  });

  it('não tem violação de acessibilidade', async () => {
    const { container } = render(<Harness inicial={50} />);
    expect(await axe(container)).toHaveNoViolations();
  });
});

describe('VolumeDial — teclado', () => {
  it('setas ±step, PageUp/PageDown ±5 passos, Home/End nos extremos e limites', () => {
    render(<Harness inicial={50} step={5} />);
    const el = dial();
    el.focus();

    fireEvent.keyDown(el, { key: 'ArrowRight' });
    expect(el).toHaveAttribute('aria-valuenow', '55');

    fireEvent.keyDown(el, { key: 'PageUp' });
    expect(el).toHaveAttribute('aria-valuenow', '80');

    fireEvent.keyDown(el, { key: 'ArrowDown' });
    expect(el).toHaveAttribute('aria-valuenow', '75');

    fireEvent.keyDown(el, { key: 'PageDown' });
    expect(el).toHaveAttribute('aria-valuenow', '50');

    fireEvent.keyDown(el, { key: 'Home' });
    expect(el).toHaveAttribute('aria-valuenow', '0');

    fireEvent.keyDown(el, { key: 'End' });
    expect(el).toHaveAttribute('aria-valuenow', '100');

    // Já no teto: a seta para cima não passa de 100.
    fireEvent.keyDown(el, { key: 'ArrowUp' });
    expect(el).toHaveAttribute('aria-valuenow', '100');
  });
});

describe('VolumeDial — ponteiro', () => {
  it('converte o ângulo em valor (clique no trilho salta para aquele valor)', () => {
    render(<Harness inicial={0} />);
    const el = dial();
    // Topo do anel (90° acima do centro) = meio do arco → 50%.
    fireEvent.pointerDown(el, { clientX: 0, clientY: -100, pointerId: 1 });
    expect(el).toHaveAttribute('aria-valuenow', '50');
    fireEvent.pointerUp(el, { pointerId: 1 });
  });

  it('arrasta com o ponteiro (pointermove) e captura o ponteiro', () => {
    render(<Harness inicial={0} />);
    const el = dial();
    const { capturar } = espiaCaptura(el);

    fireEvent.pointerDown(el, { clientX: 0, clientY: -100, pointerId: 7 }); // topo → 50%
    expect(capturar).toHaveBeenCalledWith(7);
    expect(el).toHaveAttribute('aria-valuenow', '50');

    fireEvent.pointerMove(el, { clientX: 100, clientY: 0, pointerId: 7 }); // direita → 83%
    expect(el).toHaveAttribute('aria-valuenow', '83');

    fireEvent.pointerUp(el, { pointerId: 7 });
  });

  it('não salta de 100 para 0 ao cruzar a abertura inferior do arco', () => {
    render(<Harness inicial={0} />);
    const el = dial();
    // Base direita do arco (45°) = ponta → 100%.
    fireEvent.pointerDown(el, { clientX: 71, clientY: 71, pointerId: 1 });
    expect(el).toHaveAttribute('aria-valuenow', '100');

    // Passa pela abertura (base, 90°): o valor fica na ponta.
    fireEvent.pointerMove(el, { clientX: 0, clientY: 100, pointerId: 1 });
    expect(el).toHaveAttribute('aria-valuenow', '100');

    // Sai do outro lado (135°) e continua na ponta — não volta a 0.
    fireEvent.pointerMove(el, { clientX: -71, clientY: 71, pointerId: 1 });
    expect(el).toHaveAttribute('aria-valuenow', '100');
    fireEvent.pointerUp(el, { pointerId: 1 });
  });

  it('não salta de 0 para 100 ao cruzar a abertura no sentido inverso', () => {
    render(<Harness inicial={0} />);
    const el = dial();
    // Base esquerda do arco (135°) = início → 0%.
    fireEvent.pointerDown(el, { clientX: -71, clientY: 71, pointerId: 1 });
    expect(el).toHaveAttribute('aria-valuenow', '0');

    fireEvent.pointerMove(el, { clientX: 0, clientY: 100, pointerId: 1 }); // abertura
    expect(el).toHaveAttribute('aria-valuenow', '0');

    // Sai do outro lado (45°) e continua na ponta — não salta para 100.
    fireEvent.pointerMove(el, { clientX: 71, clientY: 71, pointerId: 1 });
    expect(el).toHaveAttribute('aria-valuenow', '0');
    fireEvent.pointerUp(el, { pointerId: 1 });
  });

  it('fica preso em 100 quando o ponteiro continua para o lado oposto depois do vão', () => {
    render(<Harness inicial={0} />);
    const el = dial();
    // Base direita do arco (45°) = ponta → 100%.
    fireEvent.pointerDown(el, { clientX: 71, clientY: 71, pointerId: 1 });
    expect(el).toHaveAttribute('aria-valuenow', '100');

    // Entra no vão (90°, base) vindo da ponta: valor preso em 100.
    fireEvent.pointerMove(el, { clientX: 0, clientY: 100, pointerId: 1 });
    expect(el).toHaveAttribute('aria-valuenow', '100');

    // Já do outro lado do arco (150° e 160°, t≈15 e 25 → ~6% e ~9%): continua preso em 100.
    fireEvent.pointerMove(el, { clientX: -87, clientY: 50, pointerId: 1 });
    expect(el).toHaveAttribute('aria-valuenow', '100');
    fireEvent.pointerMove(el, { clientX: -94, clientY: 34, pointerId: 1 });
    expect(el).toHaveAttribute('aria-valuenow', '100');
    fireEvent.pointerUp(el, { pointerId: 1 });
  });

  it('fica preso em 0 quando o ponteiro continua para o lado oposto depois do vão', () => {
    render(<Harness inicial={0} />);
    const el = dial();
    // Base esquerda do arco (135°) = início → 0%.
    fireEvent.pointerDown(el, { clientX: -71, clientY: 71, pointerId: 1 });
    expect(el).toHaveAttribute('aria-valuenow', '0');

    // Entra no vão (90°, base) vindo do início: valor preso em 0.
    fireEvent.pointerMove(el, { clientX: 0, clientY: 100, pointerId: 1 });
    expect(el).toHaveAttribute('aria-valuenow', '0');

    // Já do outro lado do arco (30° e 20°, t≈255 e 245 → ~94% e ~91%): continua preso em 0.
    fireEvent.pointerMove(el, { clientX: 87, clientY: 50, pointerId: 1 });
    expect(el).toHaveAttribute('aria-valuenow', '0');
    fireEvent.pointerMove(el, { clientX: 94, clientY: 34, pointerId: 1 });
    expect(el).toHaveAttribute('aria-valuenow', '0');
    fireEvent.pointerUp(el, { pointerId: 1 });
  });

  it('ignora o pointerdown no centro (raio abaixo de 60% do raio do anel)', () => {
    render(<Harness inicial={50} />);
    const el = dial();
    // (10,10) → raio ~14px, menos de 60% dos ~40px do anel: nada muda.
    fireEvent.pointerDown(el, { clientX: 10, clientY: 10, pointerId: 1 });
    expect(el).toHaveAttribute('aria-valuenow', '50');
    fireEvent.pointerUp(el, { pointerId: 1 });
  });

  it('respeita min/max/step na conversão do ângulo', () => {
    render(<Harness inicial={0} min={0} max={50} step={10} />);
    const el = dial();
    // Base esquerda do arco (135°) = início → min.
    fireEvent.pointerDown(el, { clientX: -71, clientY: 71, pointerId: 1 });
    expect(el).toHaveAttribute('aria-valuenow', '0');

    // Topo (meio do arco) → 25, ajustado à grade de 10 → 20 ou 30 (múltiplo de 10).
    fireEvent.pointerMove(el, { clientX: 0, clientY: -100, pointerId: 1 });
    const agora = Number(el.getAttribute('aria-valuenow'));
    expect(agora).toBeGreaterThanOrEqual(20);
    expect(agora).toBeLessThanOrEqual(30);
    expect(agora % 10).toBe(0);
    fireEvent.pointerUp(el, { pointerId: 1 });
  });

  it('a roda do mouse não muda o valor', () => {
    const onNovo = vi.fn();
    render(<Harness inicial={50} onNovo={onNovo} />);
    fireEvent.wheel(dial(), { deltaY: -120 });
    fireEvent.wheel(dial(), { deltaY: 120 });
    expect(onNovo).not.toHaveBeenCalled();
    expect(dial()).toHaveAttribute('aria-valuenow', '50');
  });

  it('disabled não muda por teclado nem por ponteiro', () => {
    const onNovo = vi.fn();
    render(<Harness inicial={50} disabled onNovo={onNovo} />);
    const el = dial();
    expect(el).toHaveAttribute('tabindex', '-1');

    fireEvent.keyDown(el, { key: 'ArrowUp' });
    fireEvent.pointerDown(el, { clientX: 0, clientY: -100, pointerId: 1 });

    expect(onNovo).not.toHaveBeenCalled();
    expect(el).toHaveAttribute('aria-valuenow', '50');
  });
});

describe('VolumeDial — gradiente', () => {
  it('deriva as duas paradas do próprio primary (acompanha as skins)', () => {
    const { container } = render(<Harness inicial={50} />);
    const paradas = Array.from(container.querySelectorAll('stop'));
    expect(paradas).toHaveLength(2);
    // As duas paradas são o token que o componente usa; a segunda é mais clara (opacidade).
    for (const parada of paradas) {
      expect(parada.getAttribute('stop-color')).toBe('hsl(var(--primary))');
    }
    expect(paradas[1].getAttribute('stop-opacity')).toBe('0.55');
  });
});

describe('VolumeDial — tamanho proporcional', () => {
  it('no size padrão (96) mantém knob de 14px e número de 24px', () => {
    render(<Harness inicial={50} />);
    expect(knob().style.width).toBe('14px');
    expect(knob().style.height).toBe('14px');
    expect(dial().style.getPropertyValue('--volume-dial-fonte')).toBe('24px');
  });

  it('escala knob e número junto com o prop size (192 → 28px / 48px)', () => {
    render(<Harness inicial={50} size={192} />);
    expect(knob().style.width).toBe('28px');
    expect(knob().style.height).toBe('28px');
    expect(dial().style.getPropertyValue('--volume-dial-fonte')).toBe('48px');
    // O número do centro é o elemento que usa o var — a medida chega ao alvo real.
    expect(screen.getByTestId('volume-dial-value')).toHaveClass(
      'text-[length:var(--volume-dial-fonte)]',
    );
  });
});

describe('VolumeDial — estados', () => {
  it('muted mostra "Mudo" no centro e no texto falado', () => {
    render(<Harness inicial={70} muted />);
    expect(screen.getByTestId('volume-dial-value')).toHaveTextContent('Mudo');
    expect(dial()).toHaveAttribute('aria-valuetext', 'Mudo');
  });
});

describe('VolumeDial — movimento', () => {
  it('com movimento reduzido o número troca direto, sem animação', () => {
    estado.reduzido = true;
    const { rerender } = render(<VolumeDial ariaLabel="Volume" value={20} onChange={() => {}} />);
    expect(screen.getByTestId('volume-dial-value')).toHaveTextContent('20%');

    rerender(<VolumeDial ariaLabel="Volume" value={90} onChange={() => {}} />);
    expect(screen.getByTestId('volume-dial-value')).toHaveTextContent('90%');
  });

  it('com movimento reduzido o knob não tem transição CSS e vai direto à posição', () => {
    estado.reduzido = true;
    render(<Harness inicial={50} />);
    const el = knob();
    expect(el.className).not.toMatch(/transition/);
    expect(el.style.transform).toContain('translate');
  });

  it('com movimento ligado o número conta até o novo valor', async () => {
    estado.reduzido = false;
    const { rerender } = render(<VolumeDial ariaLabel="Volume" value={20} onChange={() => {}} />);

    rerender(<VolumeDial ariaLabel="Volume" value={90} onChange={() => {}} />);
    await waitFor(() =>
      expect(screen.getByTestId('volume-dial-value')).toHaveTextContent('90%'),
    );
  });
});
