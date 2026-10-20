import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { axe } from 'vitest-axe';
import { ReauthDialog } from '@/components/auth/ReauthDialog';

// t_258e72a5 — no dialogo de reautenticacao o botao de mostrar senha era um
// icone sem nome acessivel e o erro ("Senha incorreta") aparecia sem
// role="alert"/aria-live: leitor de tela nao anunciava nem o controle nem a
// falha da confirmacao.
function montarDialogo(onConfirm = vi.fn().mockResolvedValue(false)) {
  render(
    <ReauthDialog
      open
      onOpenChange={() => undefined}
      actionLabel="excluir o contato"
      onConfirm={onConfirm}
      onCancel={() => undefined}
    />
  );
  return onConfirm;
}

describe('ReauthDialog — controle e erro anunciados', () => {
  it('o botao de mostrar senha tem nome acessivel e estado anunciado', () => {
    montarDialogo();

    const mostrar = screen.getByRole('button', { name: 'Mostrar senha' });
    expect(mostrar.getAttribute('tabindex')).toBeNull();
    expect(mostrar.getAttribute('aria-pressed')).toBe('false');

    fireEvent.click(mostrar);

    const campo = document.getElementById('reauth-password') as HTMLInputElement;
    expect(campo.type).toBe('text');
    expect(
      screen.getByRole('button', { name: 'Ocultar senha' }).getAttribute('aria-pressed')
    ).toBe('true');
  });

  it('a senha incorreta aparece em role=alert', async () => {
    montarDialogo();

    fireEvent.change(document.getElementById('reauth-password') as HTMLInputElement, {
      target: { value: 'senha-errada' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Confirmar' }));

    const alerta = await screen.findByRole('alert');
    expect(alerta.textContent).toBe('Senha incorreta');
    expect(alerta.getAttribute('aria-live')).toBe('polite');
  });

  it('nao tem violacao de acessibilidade (axe)', async () => {
    montarDialogo();
    expect(await axe(document.body)).toHaveNoViolations();
  });
});
