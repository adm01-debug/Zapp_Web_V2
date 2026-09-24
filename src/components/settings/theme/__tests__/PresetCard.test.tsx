import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { PresetCard } from '../PresetCard';
import { getPresetById } from '../presets';

const preset = getPresetById('gx-classic')!;

describe('PresetCard', () => {
  it('role radio, aria-checked e aria-label', () => {
    render(<PresetCard preset={preset} isActive={false} onSelect={vi.fn()} />);
    const radio = screen.getByRole('radio', { name: /Skin GX Classic/ });
    expect(radio).toHaveAttribute('aria-checked', 'false');
  });

  it('isActive=true reflete aria-checked', () => {
    render(<PresetCard preset={preset} isActive onSelect={vi.fn()} />);
    expect(screen.getByRole('radio')).toHaveAttribute('aria-checked', 'true');
  });

  it('clique chama onSelect com o id', () => {
    const onSelect = vi.fn();
    render(<PresetCard preset={preset} isActive={false} onSelect={onSelect} />);
    fireEvent.click(screen.getByRole('radio'));
    expect(onSelect).toHaveBeenCalledWith('gx-classic');
  });

  it('Enter e Space chamam onSelect', () => {
    const onSelect = vi.fn();
    render(<PresetCard preset={preset} isActive={false} onSelect={onSelect} />);
    const radio = screen.getByRole('radio');
    fireEvent.keyDown(radio, { key: 'Enter' });
    fireEvent.keyDown(radio, { key: ' ' });
    expect(onSelect).toHaveBeenCalledTimes(2);
  });

  it('tabIndex 0 para foco por teclado', () => {
    render(<PresetCard preset={preset} isActive={false} onSelect={vi.fn()} />);
    expect(screen.getByRole('radio')).toHaveAttribute('tabIndex', '0');
  });

  it('data-testid segue o padrão preset-card-{id}', () => {
    render(<PresetCard preset={preset} isActive={false} onSelect={vi.fn()} />);
    expect(screen.getByTestId('preset-card-gx-classic')).toBeInTheDocument();
  });
});
