import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { CatalogAdvancedFilters } from '../CatalogAdvancedFilters';
import { DEFAULT_ADVANCED_FILTERS, type AdvancedFilters } from '../catalogShared';
import type { CatalogStats } from '@/hooks/integrations/useExternalCatalog';

// E36: o Slider real (@radix-ui/react-slider) usa ResizeObserver (via
// @radix-ui/react-use-size, dentro do Thumb) pra medir o próprio tamanho —
// API que o jsdom não implementa e o setup global de testes (src/test/
// setup.ts) não faz polyfill dela (só de IntersectionObserver). Mockado
// aqui como o resto do repo já faz com primitivas Radix pesadas em teste
// (ex.: Dialog/Select em CloseConversationDialog.test.tsx): um par de
// botões — rotulados com o mesmo thumbLabel que o componente real passa —
// que disparam onValueChange com um valor fixo, simulando o arraste de
// cada thumb sem depender de pointer events reais.
vi.mock('@/components/ui/slider', () => ({
  Slider: ({
    value,
    min,
    max,
    onValueChange,
    thumbLabel,
  }: {
    value: [number, number];
    min: number;
    max: number;
    onValueChange: (v: number[]) => void;
    thumbLabel?: string[];
  }) => (
    <div data-testid="price-slider" data-min={min} data-max={max} data-value={JSON.stringify(value)}>
      <button type="button" aria-label={thumbLabel?.[0]} onClick={() => onValueChange([100, value[1]])}>
        arrastar mínimo
      </button>
      <button type="button" aria-label={thumbLabel?.[1]} onClick={() => onValueChange([value[0], 500])}>
        arrastar máximo
      </button>
    </div>
  ),
}));

const mockStats = (overrides: Partial<CatalogStats> = {}): CatalogStats => ({
  total: 100, in_stock: 80, featured: 10, new_30d: 5, bestseller: 20,
  kits: 3, low_stock: 4, categories_root: 5, suppliers_active: 2,
  last_sync_at: null, last_update_at: null, by_month: [],
  ...overrides,
});

function renderFilters(props: {
  filters?: AdvancedFilters;
  stats?: CatalogStats | null;
} = {}) {
  const onApply = vi.fn();
  const onClear = vi.fn();
  const onOpenChange = vi.fn();
  const utils = render(
    <CatalogAdvancedFilters
      open
      onOpenChange={onOpenChange}
      filters={props.filters ?? { ...DEFAULT_ADVANCED_FILTERS }}
      stats={props.stats}
      onApply={onApply}
      onClear={onClear}
    />
  );
  return { ...utils, onApply, onClear, onOpenChange };
}

describe('CatalogAdvancedFilters — faixa de preço (slider real, E36)', () => {
  it('sem stats, usa o teto de fallback (2000) — nunca hardcoded "999,99"', () => {
    renderFilters({ stats: undefined });
    const slider = screen.getByTestId('price-slider');
    expect(slider).toHaveAttribute('data-max', '2000');
    expect(screen.getByPlaceholderText('2000')).toBeInTheDocument();
    expect(screen.queryByPlaceholderText('999,99')).not.toBeInTheDocument();
    expect(screen.queryByText('999,99')).not.toBeInTheDocument();
  });

  it('com stats.price_max, o teto vem dele (arredondado para cima) — nunca um valor fixo', () => {
    renderFilters({ stats: mockStats({ price_max: 850.4 }) });
    const slider = screen.getByTestId('price-slider');
    expect(slider).toHaveAttribute('data-max', '851');
    expect(screen.getByPlaceholderText('851')).toBeInTheDocument();
  });

  it('inicializa o slider com priceMin/priceMax de filters, clampado ao teto real', () => {
    renderFilters({
      stats: mockStats({ price_max: 300 }),
      filters: { ...DEFAULT_ADVANCED_FILTERS, priceMin: '50', priceMax: '900' },
    });
    const slider = screen.getByTestId('price-slider');
    expect(slider).toHaveAttribute('data-value', JSON.stringify([50, 300]));
  });

  it('arrastar o thumb mínimo atualiza o campo "Mínimo (R$)"', () => {
    renderFilters({ stats: mockStats({ price_max: 1000 }) });
    fireEvent.click(screen.getByRole('button', { name: 'Preço mínimo' }));
    const minInput = screen.getByPlaceholderText('0,00') as HTMLInputElement;
    expect(minInput.value).toBe('100');
  });

  it('arrastar o thumb máximo atualiza o campo "Máximo (R$)"', () => {
    renderFilters({ stats: mockStats({ price_max: 1000 }) });
    fireEvent.click(screen.getByRole('button', { name: 'Preço máximo' }));
    const maxInput = screen.getByPlaceholderText('1000') as HTMLInputElement;
    expect(maxInput.value).toBe('500');
  });
});

describe('CatalogAdvancedFilters — cor e material (multi-select, E36)', () => {
  it('sem stats.top_colors/top_materials, as seções "Cor" e "Material" não aparecem', () => {
    renderFilters({ stats: mockStats() });
    expect(screen.queryByText('Cor')).not.toBeInTheDocument();
    expect(screen.queryByText('Material')).not.toBeInTheDocument();
  });

  it('com stats.top_colors, mostra a seção e os chips; selecionar e Aplicar propaga colors', () => {
    const stats = mockStats({ top_colors: [{ label: 'Azul', count: 40 }, { label: 'Preto', count: 12 }] });
    const { onApply } = renderFilters({ stats });
    expect(screen.getByText('Cor')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Azul' }));
    fireEvent.click(screen.getByText('Aplicar filtros'));
    expect(onApply).toHaveBeenCalledWith(expect.objectContaining({ colors: ['Azul'] }));
  });

  it('clicar de novo numa cor já selecionada desmarca ela (toggle)', () => {
    const stats = mockStats({ top_colors: [{ label: 'Azul', count: 40 }] });
    const { onApply } = renderFilters({
      stats,
      filters: { ...DEFAULT_ADVANCED_FILTERS, colors: ['Azul'] },
    });
    const chip = screen.getByRole('button', { name: 'Azul' });
    expect(chip).toHaveAttribute('aria-pressed', 'true');
    fireEvent.click(chip);
    fireEvent.click(screen.getByText('Aplicar filtros'));
    expect(onApply).toHaveBeenCalledWith(expect.objectContaining({ colors: [] }));
  });

  it('com stats.top_materials, mostra a seção e propaga a seleção separada de cor', () => {
    const stats = mockStats({
      top_colors: [{ label: 'Azul', count: 1 }],
      top_materials: [{ label: 'Metal', count: 1 }, { label: 'Plástico', count: 1 }],
    });
    const { onApply } = renderFilters({ stats });
    fireEvent.click(screen.getByRole('button', { name: 'Metal' }));
    fireEvent.click(screen.getByText('Aplicar filtros'));
    expect(onApply).toHaveBeenCalledWith(expect.objectContaining({ colors: [], materials: ['Metal'] }));
  });
});

describe('CatalogAdvancedFilters — contador de filtros ativos', () => {
  it('o badge do header reflete cores/materiais pré-selecionados', () => {
    renderFilters({
      filters: { ...DEFAULT_ADVANCED_FILTERS, colors: ['Azul', 'Preto'], materials: ['Metal'] },
    });
    expect(screen.getByText((_, node) => node?.textContent === '3 ativos')).toBeInTheDocument();
  });
});

describe('CatalogAdvancedFilters — Limpar', () => {
  it('reseta cor/material junto com os demais campos e chama onClear + onOpenChange(false)', () => {
    const stats = mockStats({ top_colors: [{ label: 'Azul', count: 1 }] });
    const { onClear, onOpenChange } = renderFilters({
      stats,
      filters: { ...DEFAULT_ADVANCED_FILTERS, colors: ['Azul'], isBestseller: true },
    });
    fireEvent.click(screen.getByText('Limpar'));
    expect(onClear).toHaveBeenCalledTimes(1);
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });
});
