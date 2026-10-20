import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';

const shader = vi.hoisted(() => ({
  dispose: vi.fn(),
  setSpeed: vi.fn(),
}));

vi.mock('@paper-design/shaders', () => ({
  liquidMetalFragmentShader: 'void main() {}',
  ShaderMount: class {
    canvasElement = document.createElement('canvas');
    constructor(parent: HTMLElement) {
      parent.appendChild(this.canvasElement);
    }
    dispose = shader.dispose;
    setSpeed = shader.setSpeed;
  },
}));

import { LiquidMetalButton } from '@/components/ui/liquid-metal-button';

describe('LiquidMetalButton', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    Object.defineProperty(window, 'WebGL2RenderingContext', { configurable: true, value: class {} });
  });

  it('mantém rótulo, contador e clique disponíveis antes do shader', () => {
    const onClick = vi.fn();
    render(<LiquidMetalButton label="TALK ME" count={12} onClick={onClick} />);

    const button = screen.getByRole('button', { name: 'TALK ME: 12 aguardando' });
    expect(button).toHaveAttribute('type', 'button');
    expect(screen.getByText('12')).toBeInTheDocument();
    fireEvent.click(button);
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it('limita o badge visual e preserva a quantidade completa no nome acessível', () => {
    render(<LiquidMetalButton count={135} />);
    expect(screen.getByText('99+')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'TALK ME: 135 aguardando' })).toBeInTheDocument();
  });

  it('acelera no foco e libera o contexto gráfico ao desmontar', async () => {
    const { unmount } = render(<LiquidMetalButton />);
    const button = screen.getByRole('button', { name: 'TALK ME' });

    await waitFor(() => expect(button.querySelector('canvas')).toBeInTheDocument());
    fireEvent.focus(button);
    expect(shader.setSpeed).toHaveBeenCalledWith(0.85);
    unmount();
    expect(shader.dispose).toHaveBeenCalledTimes(1);
  });

  it('bloqueia ativações duplicadas enquanto está carregando', () => {
    const onClick = vi.fn();
    render(<LiquidMetalButton loading onClick={onClick} />);
    const button = screen.getByRole('button', { name: 'TALK ME' });
    expect(button).toBeDisabled();
    fireEvent.click(button);
    expect(onClick).not.toHaveBeenCalled();
    expect(button).toHaveAttribute('aria-busy', 'true');
  });

  it('preserva um nome acessível contextual com departamento', () => {
    render(<LiquidMetalButton label="TALK ME" count={12} aria-label="TALK ME: 12 atendimentos aguardando em Comercial" />);
    expect(screen.getByRole('button', { name: 'TALK ME: 12 atendimentos aguardando em Comercial' })).toBeInTheDocument();
  });
});
