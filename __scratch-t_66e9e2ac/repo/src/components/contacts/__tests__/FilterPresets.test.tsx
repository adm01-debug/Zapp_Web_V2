import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';

const toast = vi.hoisted(() => ({ info: vi.fn(), success: vi.fn() }));
vi.mock('sonner', () => ({ toast }));

import { FilterPresets, type FilterPreset } from '../FilterPresets';

const STORAGE_KEY = 'contact-filter-presets';
const preset = (id: string, filters: FilterPreset['filters']): FilterPreset => ({ id, name: `Preset ${id}`, filters });

function stored(): FilterPreset[] {
  return JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '[]') as FilterPreset[];
}

describe('FilterPresets — presets inválidos saem no load (etapas 33 e 83)', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.clearAllMocks();
  });

  it('remove preset com tipo extinto ou malformado, regrava e avisa', () => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify([
      preset('ok', { type: 'cliente' }),
      preset('extinto', { type: 'sicoob_gifts' }),
      { id: 'sem-filtros', name: 'x' },
      preset('sem-tipo', { company: 'ACME' }),
    ]));

    render(<FilterPresets onApplyPreset={vi.fn()} currentFilters={{}} />);

    expect(stored().map(p => p.id)).toEqual(['ok', 'sem-tipo']);
    expect(toast.info).toHaveBeenCalledWith('2 filtros salvos inválidos foram removidos');
    expect(screen.getByRole('button', { name: /Filtros Salvos/ })).toHaveTextContent('2');
  });

  it('não regrava nem avisa quando todos os presets são válidos', () => {
    const raw = JSON.stringify([preset('ok', { type: 'all', tag: 'vip' })]);
    localStorage.setItem(STORAGE_KEY, raw);

    render(<FilterPresets onApplyPreset={vi.fn()} currentFilters={{}} />);

    expect(localStorage.getItem(STORAGE_KEY)).toBe(raw);
    expect(toast.info).not.toHaveBeenCalled();
  });

  it('JSON corrompido não quebra a barra', () => {
    localStorage.setItem(STORAGE_KEY, '{nao-e-json');
    render(<FilterPresets onApplyPreset={vi.fn()} currentFilters={{}} />);
    expect(screen.getByRole('button', { name: /Filtros Salvos/ })).toBeInTheDocument();
  });

  it('aplica o preset salvo ao clicar nele', () => {
    const saved = preset('ok', { type: 'cliente' });
    localStorage.setItem(STORAGE_KEY, JSON.stringify([saved]));
    const onApplyPreset = vi.fn();

    render(<FilterPresets onApplyPreset={onApplyPreset} currentFilters={{}} />);
    fireEvent.click(screen.getByRole('button', { name: /Filtros Salvos/ }));
    fireEvent.click(screen.getByRole('button', { name: /Preset ok/ }));

    expect(onApplyPreset).toHaveBeenCalledWith(saved);
  });
});
