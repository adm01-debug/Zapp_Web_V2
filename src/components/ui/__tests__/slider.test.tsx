import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { Slider } from '@/components/ui/slider';

// @radix-ui/react-slider mede o Thumb via ResizeObserver (useSize) —
// API que o jsdom não implementa e o setup global de testes não faz
// polyfill dela. Sem isso, montar o Slider real quebra o render.
if (typeof window.ResizeObserver === 'undefined') {
  window.ResizeObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  };
}

describe('Slider (E36 — regressão: 1 thumb por valor)', () => {
  it('value com 2 valores (range de preço) renderiza 2 thumbs, não 1', () => {
    render(<Slider min={0} max={100} value={[20, 80]} onValueChange={() => {}} />);
    expect(screen.getAllByRole('slider')).toHaveLength(2);
  });

  it('defaultValue com 1 valor (uso single-thumb, ex.: delay/intervalo) renderiza só 1 thumb', () => {
    render(<Slider min={0} max={100} defaultValue={[50]} />);
    expect(screen.getAllByRole('slider')).toHaveLength(1);
  });

  it('sem value nem defaultValue, ainda renderiza 1 thumb (fallback [0])', () => {
    render(<Slider min={0} max={100} />);
    expect(screen.getAllByRole('slider')).toHaveLength(1);
  });

  it('thumbLabel string única aplica o mesmo aria-label a todos os thumbs', () => {
    render(<Slider min={0} max={100} value={[10, 90]} onValueChange={() => {}} thumbLabel="Faixa" />);
    expect(screen.getAllByLabelText('Faixa')).toHaveLength(2);
  });

  it('thumbLabel em array dá um label distinto por índice (uso real: min/max do CatalogAdvancedFilters)', () => {
    render(
      <Slider min={0} max={100} value={[10, 90]} onValueChange={() => {}} thumbLabel={['Mínimo', 'Máximo']} />
    );
    expect(screen.getByLabelText('Mínimo')).toBeInTheDocument();
    expect(screen.getByLabelText('Máximo')).toBeInTheDocument();
  });
});
