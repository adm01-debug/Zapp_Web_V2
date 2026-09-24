import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { BorderRadiusControl } from '../BorderRadiusControl';

class MockResizeObserver {
  observe() {}
  unobserve() {}
  disconnect() {}
}
vi.stubGlobal('ResizeObserver', MockResizeObserver);

describe('BorderRadiusControl', () => {
  it('mostra os 5 presets rápidos', () => {
    render(<BorderRadiusControl value={14} onChange={vi.fn()} />);
    for (const label of ['Reto', 'Sutil', 'Médio', 'Suave', 'Redondo']) {
      expect(screen.getByText(new RegExp(label))).toBeInTheDocument();
    }
  });

  it('clicar em Redondo chama onChange(20)', () => {
    const onChange = vi.fn();
    render(<BorderRadiusControl value={14} onChange={onChange} />);
    fireEvent.click(screen.getByTestId('radius-preset-20'));
    expect(onChange).toHaveBeenCalledWith(20);
  });

  it('preset ativo reflete o valor atual', () => {
    render(<BorderRadiusControl value={0} onChange={vi.fn()} />);
    expect(screen.getByTestId('radius-preset-0').className).toMatch(/bg-primary/);
  });

  it('slider tem aria-label', () => {
    render(<BorderRadiusControl value={14} onChange={vi.fn()} />);
    expect(screen.getByRole('slider')).toHaveAttribute('aria-label', 'Raio da borda em pixels');
  });

  it('mostra o valor atual em px', () => {
    render(<BorderRadiusControl value={12} onChange={vi.fn()} />);
    expect(screen.getByText('12px')).toBeInTheDocument();
  });
});
