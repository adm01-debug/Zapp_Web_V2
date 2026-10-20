import { describe, it, expect } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { axe } from 'vitest-axe';
import { PasswordInput } from '@/components/auth/PasswordInput';

// t_258e72a5 — o botao de mostrar/ocultar senha tinha `tabIndex={-1}`: nao
// entrava na ordem de tabulacao, entao quem navega por teclado nao alcancava o
// controle. Enter/Space num <button> nativo so existem se ele for focavel.
describe('PasswordInput — mostrar/ocultar alcancavel por teclado', () => {
  it('o botao de mostrar senha fica na ordem de tabulacao', () => {
    render(<PasswordInput id="senha-teste" />);

    const botao = screen.getByRole('button', { name: 'Mostrar senha' });

    expect(botao.getAttribute('tabindex')).toBeNull();
    expect(botao.getAttribute('tabindex')).not.toBe('-1');
  });

  it('alterna o tipo do campo e anuncia o estado em aria-pressed', () => {
    render(<PasswordInput id="senha-teste" value="" onChange={() => undefined} />);

    const campo = document.getElementById('senha-teste') as HTMLInputElement;
    expect(campo.type).toBe('password');

    const mostrar = screen.getByRole('button', { name: 'Mostrar senha' });
    expect(mostrar.getAttribute('aria-pressed')).toBe('false');

    fireEvent.click(mostrar);

    expect(campo.type).toBe('text');
    const ocultar = screen.getByRole('button', { name: 'Ocultar senha' });
    expect(ocultar.getAttribute('aria-pressed')).toBe('true');
  });

  it('nao tem violacao de acessibilidade (axe)', async () => {
    const { container } = render(
      <PasswordInput id="senha-teste" aria-label="Senha" />
    );

    expect(await axe(container)).toHaveNoViolations();
  });
});
