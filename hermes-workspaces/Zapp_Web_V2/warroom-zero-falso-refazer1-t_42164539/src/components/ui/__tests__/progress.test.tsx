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

  // Travamento de regressão do achado R2-INF-035 (cartão #491): o wrapper desestrutura `value`,
  // usa-o no transform do Indicator e precisa repassá-lo ao Root. Sem a linha `value={value}` do
  // Root, o Radix perde a medida e `aria-valuenow` some. Os dois casos abaixo ficam VERMELHOS
  // se essa linha for removida de src/components/ui/progress.tsx.
  it('encaminha value ao Root quando o consumidor espalha outras props', () => {
    const extras = { 'aria-describedby': 'ajuda-progresso' };
    render(<Progress value={73} {...extras} aria-label="Progresso 73%" />);

    const root = screen.getByRole('progressbar', { name: 'Progresso 73%' });
    expect(root).toHaveAttribute('aria-describedby', 'ajuda-progresso');
    expect(root).toHaveAttribute('aria-valuenow', '73');
    expect(root).toHaveAttribute('aria-valuemax', '100');
  });

  it('prende a barra visual à mesma medida que o Root anuncia', () => {
    const { container } = render(<Progress value={25} aria-label="Progresso 25%" />);

    const root = screen.getByRole('progressbar', { name: 'Progresso 25%' });
    const anunciado = root.getAttribute('aria-valuenow');
    expect(anunciado).toBe('25');
    // O deslocamento esperado sai da medida ANUNCIADA pelo Root, não do literal do teste: se o
    // Root perder o valor, a barra (transform real) e o contrato semântico divergem e o caso falha.
    expect(container.firstElementChild?.firstElementChild).toHaveStyle({
      transform: `translateX(-${100 - Number(anunciado)}%)`,
    });
  });
});
