/**
 * A11Y: Descrição das Skins sem truncate cortando o texto (SHELL-16).
 * A classe `truncate` foi removida do `<p>` de descrição no PresetCard.
 */
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { PresetCard } from '../PresetCard';
import { getPresetById } from '../presets';

const preset = getPresetById('gx-classic')!;

describe('a11y: descrição da Skin sem truncate', () => {
  it('a descrição não tem a classe truncate (texto inteiro visível)', () => {
    render(<PresetCard preset={preset} isActive={false} onSelect={vi.fn()} />);
    const description = screen.getByText(preset.description);
    expect(description).not.toHaveClass('truncate');
  });
});