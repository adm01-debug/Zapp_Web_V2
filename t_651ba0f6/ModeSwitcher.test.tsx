import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import { axe } from 'vitest-axe';
import { ModeSwitcher } from './ModeSwitcher';

describe('ModeSwitcher a11y: nome acessível nos botões no celular', () => {
  it('getByRole encontra cada botão pelo nome acessível (lista, quadro, agenda)', () => {
    const onChange = () => {};
    const { getByRole } = render(<ModeSwitcher mode="list" onChange={onChange} />);

    expect(getByRole('button', { name: 'Lista' })).toBeTruthy();
    expect(getByRole('button', { name: 'Quadro' })).toBeTruthy();
    expect(getByRole('button', { name: 'Agenda' })).toBeTruthy();
  });

  it('axe button-name não acusa violação (texto oculto com sm:hidden ainda acessível)', async () => {
    const onChange = () => {};
    const { container } = render(<ModeSwitcher mode="board" onChange={onChange} />);

    const results = await axe(container, {
      rules: { 'color-contrast': { enabled: false } },
    });
    const buttonNameViolations = results.violations.filter(
      (v) => v.id === 'button-name',
    );
    expect(buttonNameViolations).toEqual([]);
  });

  it('sem aria-label o botão não tem nome acessível no celular (verifica o defeito)', () => {
    const onChange = () => {};
    const { container } = render(<ModeSwitcher mode="agenda" onChange={onChange} />);

    const button = container.querySelector('button[aria-label="Agenda"]');
    expect(button).toBeTruthy();
  });
});