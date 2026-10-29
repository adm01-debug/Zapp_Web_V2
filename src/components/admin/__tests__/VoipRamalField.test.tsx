import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';

/**
 * PE-104/105 (paridade V3) — bloco de ramal no cadastro de usuário.
 *
 * Prova o que o critério pede no nível da tela:
 *  - campo Ramal + Senha SIP existem, com nome acessível;
 *  - a senha nunca é exibida: input `type=password`, nasce vazio e é limpo após salvar;
 *  - o botão só habilita com ramal E senha preenchidos;
 *  - o `onSave` recebe o ramal sem espaços e a senha;
 *  - erro do provisionamento aparece sem anunciar sucesso.
 * O contrato do RPC (args + mensagens) é provado em useAdminDataRamal.test.ts.
 */
import { VoipRamalField } from '../VoipRamalField';

describe('VoipRamalField — ramal do atendente no cadastro de usuário', () => {
  it('rotula o Ramal e a Senha SIP, com a senha oculta e vazia (nunca exibe senha salva)', () => {
    render(<VoipRamalField onSave={vi.fn()} />);

    const ramal = screen.getByLabelText(/ramal/i) as HTMLInputElement;
    const senha = screen.getByLabelText(/senha sip/i) as HTMLInputElement;

    expect(ramal).toBeInTheDocument();
    expect(senha).toHaveAttribute('type', 'password');
    expect(senha.value).toBe('');
    expect(ramal.value).toBe('');
  });

  it('mantém "Salvar ramal" desabilitado até preencher ramal e senha', () => {
    render(<VoipRamalField onSave={vi.fn()} />);
    const botao = screen.getByRole('button', { name: /salvar ramal/i });

    expect(botao).toBeDisabled();

    fireEvent.change(screen.getByLabelText(/ramal/i), { target: { value: '2001' } });
    expect(botao).toBeDisabled(); // sem senha ainda

    fireEvent.change(screen.getByLabelText(/senha sip/i), { target: { value: 'segredo' } });
    expect(botao).toBeEnabled();
  });

  it('envia ramal sem espaços e a senha, limpa a senha e confirma o salvamento', async () => {
    const onSave = vi.fn().mockResolvedValue(true);
    render(<VoipRamalField onSave={onSave} />);

    fireEvent.change(screen.getByLabelText(/ramal/i), { target: { value: '  2001  ' } });
    fireEvent.change(screen.getByLabelText(/senha sip/i), { target: { value: 'segredo' } });
    fireEvent.click(screen.getByRole('button', { name: /salvar ramal/i }));

    await waitFor(() => expect(onSave).toHaveBeenCalledWith('2001', 'segredo'));
    await waitFor(() =>
      expect(screen.getByRole('status')).toHaveTextContent(/ramal salvo/i),
    );
    // a senha é limpa e não volta para a tela
    expect((screen.getByLabelText(/senha sip/i) as HTMLInputElement).value).toBe('');
  });

  it('mostra erro e preserva a senha digitada quando o provisionamento falha', async () => {
    const onSave = vi.fn().mockResolvedValue(false);
    render(<VoipRamalField onSave={onSave} />);

    fireEvent.change(screen.getByLabelText(/ramal/i), { target: { value: '2001' } });
    fireEvent.change(screen.getByLabelText(/senha sip/i), { target: { value: 'segredo' } });
    fireEvent.click(screen.getByRole('button', { name: /salvar ramal/i }));

    await waitFor(() =>
      expect(screen.getByRole('status')).toHaveTextContent(/não foi possível salvar o ramal/i),
    );
    expect((screen.getByLabelText(/senha sip/i) as HTMLInputElement).value).toBe('segredo');
  });

  it('não permite salvar novamente enquanto a gravação está em andamento', async () => {
    let resolver: (ok: boolean) => void;
    const onSave = vi.fn().mockImplementation(() => new Promise<boolean>((r) => { resolver = r; }));
    render(<VoipRamalField onSave={onSave} />);

    fireEvent.change(screen.getByLabelText(/ramal/i), { target: { value: '2001' } });
    fireEvent.change(screen.getByLabelText(/senha sip/i), { target: { value: 'segredo' } });
    fireEvent.click(screen.getByRole('button', { name: /salvar ramal/i }));

    // durante a gravação o botão e os campos ficam bloqueados (evita duplo provisionamento)
    await waitFor(() => expect(screen.getByRole('button', { name: /salvar ramal/i })).toBeDisabled());
    expect(screen.getByLabelText(/ramal/i)).toBeDisabled();

    resolver!(true);
    await waitFor(() => expect(onSave).toHaveBeenCalledTimes(1));
  });
});
