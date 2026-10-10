import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { Progress } from '../progress';

describe('Progress', () => {
  it.each([
    { label: 'vazio', value: 0, transform: 'translateX(-100%)' },
    { label: 'carregando', value: 42, transform: 'translateX(-58%)' },
    { label: 'cheio', value: 100, transform: 'translateX(-0%)' },
  ])('mantém o estado $label sincronizado entre a barra visual e o Root semântico', ({ value, transform }) => {
    const { container } = render(<Progress value={value} aria-label={`Progresso ${value}%`} />);

    const root = screen.getByRole('progressbar', { name: `Progresso ${value}%` });
    expect(root).toHaveAttribute('aria-valuenow', String(value));
    expect(root).toHaveAttribute('data-state', value === 100 ? 'complete' : 'loading');
    expect(container.firstElementChild?.firstElementChild).toHaveStyle({ transform });
  });

  it('preserva o estado indeterminado quando value não é informado', () => {
    render(<Progress aria-label="Progresso indeterminado" />);

    const root = screen.getByRole('progressbar', { name: 'Progresso indeterminado' });
    expect(root).not.toHaveAttribute('aria-valuenow');
    expect(root).toHaveAttribute('data-state', 'indeterminate');
  });
});
