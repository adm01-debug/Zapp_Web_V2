import { useState } from 'react';
import { describe, it, expect } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { ReauthDialog } from '@/components/auth/ReauthDialog';
import type { ReauthOutcome } from '@/hooks/auth/useReauthentication';

/**
 * O diálogo permanece MONTADO no pai (o `open` é só uma prop), então o state
 * interno (`password`/`error`) sobrevive ao fechar. Fechar por Esc ou clique
 * fora precisa limpar o rascunho para a senha não voltar preenchida ao reabrir.
 */
function Harness({
  onConfirm = async () => ({ ok: true }) as ReauthOutcome,
}: {
  onConfirm?: (p: string) => Promise<ReauthOutcome>;
}) {
  const [open, setOpen] = useState(true);
  return (
    <div>
      <button type="button" onClick={() => setOpen(true)}>
        Reabrir
      </button>
      <ReauthDialog
        open={open}
        onOpenChange={setOpen}
        actionLabel="Alterar Senha"
        onConfirm={onConfirm}
        onCancel={() => setOpen(false)}
      />
    </div>
  );
}

describe('ReauthDialog — limpeza ao fechar', () => {
  it('Esc limpa a senha: reabrir não traz o valor digitado', async () => {
    render(<Harness />);

    const input = () => screen.getByLabelText('Senha Atual') as HTMLInputElement;
    fireEvent.change(input(), { target: { value: 'segredo-digitado' } });
    expect(input().value).toBe('segredo-digitado');

    fireEvent.keyDown(screen.getByRole('dialog'), { key: 'Escape' });
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());

    fireEvent.click(screen.getByRole('button', { name: 'Reabrir' }));
    await waitFor(() => expect(screen.getByRole('dialog')).toBeInTheDocument());
    expect(input().value).toBe('');
  });

  it('Esc limpa também a mensagem de erro', async () => {
    render(
      <Harness
        onConfirm={async () => ({
          ok: false,
          motivo: 'senha_incorreta',
          mensagem: 'Senha incorreta',
        })}
      />,
    );

    fireEvent.change(screen.getByLabelText('Senha Atual'), { target: { value: 'errada' } });
    fireEvent.click(screen.getByRole('button', { name: 'Confirmar' }));
    await waitFor(() => expect(screen.getByText('Senha incorreta')).toBeInTheDocument());

    fireEvent.keyDown(screen.getByRole('dialog'), { key: 'Escape' });
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());

    fireEvent.click(screen.getByRole('button', { name: 'Reabrir' }));
    await waitFor(() => expect(screen.getByRole('dialog')).toBeInTheDocument());
    expect(screen.queryByText('Senha incorreta')).not.toBeInTheDocument();
  });

  it('o motivo real da falha é anunciado como alerta', async () => {
    render(
      <Harness
        onConfirm={async () => ({
          ok: false,
          motivo: 'conta_bloqueada',
          mensagem: 'Conta temporariamente bloqueada. Tente novamente mais tarde.',
        })}
      />,
    );

    fireEvent.change(screen.getByLabelText('Senha Atual'), { target: { value: 'qualquer' } });
    fireEvent.click(screen.getByRole('button', { name: 'Confirmar' }));

    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('Conta temporariamente bloqueada. Tente novamente mais tarde.');
  });

  it('o olho de mostrar senha tem rótulo e estado acessíveis', () => {
    render(<Harness />);

    const olho = screen.getByRole('button', { name: 'Mostrar senha' });
    expect(olho).toHaveAttribute('aria-pressed', 'false');

    fireEvent.click(olho);
    expect(screen.getByRole('button', { name: 'Ocultar senha' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
  });

  it('o campo de senha declara autoComplete de senha atual', () => {
    render(<Harness />);
    expect(screen.getByLabelText('Senha Atual')).toHaveAttribute('autoComplete', 'current-password');
  });
});
