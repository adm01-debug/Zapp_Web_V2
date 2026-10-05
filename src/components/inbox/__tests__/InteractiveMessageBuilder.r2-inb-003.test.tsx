/**
 * R2-INB-003 / item 82 — o construtor de mensagens interativas confirmava o envio
 * sem transporte: `onSend` era chamado sem contrato assíncrono, o formulário era
 * limpo e o diálogo fechado na mesma batida, mesmo sem nenhum aceite de transporte.
 *
 * Prova (vermelho antes / verde depois): com um transporte que REJEITA, a composição
 * precisa continuar no formulário e o diálogo NÃO pode ser fechado; e o envio
 * indisponível precisa ser apresentado como tal.
 */
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { InteractiveMessageBuilder } from '@/components/inbox/InteractiveMessageBuilder';

/** Compõe uma mensagem de botões válida (corpo + 1 botão com título). */
function comporMensagem() {
  fireEvent.change(screen.getByPlaceholderText(/digite o corpo da mensagem/i), {
    target: { value: 'Escolha uma opção do menu' },
  });
  fireEvent.click(screen.getByRole('button', { name: /^resposta$/i }));
  fireEvent.change(screen.getByPlaceholderText(/título do botão/i), {
    target: { value: 'Atendimento' },
  });
}

describe('InteractiveMessageBuilder — envio só é confirmado com aceite do transporte', () => {
  it('preserva a composição e não fecha quando o transporte rejeita', async () => {
    const onSend = vi.fn().mockRejectedValue(new Error('transporte indisponível'));
    const onOpenChange = vi.fn();
    render(<InteractiveMessageBuilder open onOpenChange={onOpenChange} onSend={onSend} />);

    comporMensagem();
    fireEvent.click(screen.getByRole('button', { name: /enviar mensagem/i }));

    await waitFor(() => expect(onSend).toHaveBeenCalledTimes(1));
    // A composição inteira vai para o transporte (contrato explícito).
    expect(onSend.mock.calls[0][0]).toMatchObject({
      type: 'buttons',
      body: 'Escolha uma opção do menu',
      buttons: [{ title: 'Atendimento' }],
    });

    // Sem aceite: nada de fechar nem limpar.
    expect(onOpenChange).not.toHaveBeenCalledWith(false);
    expect(screen.getByPlaceholderText(/digite o corpo da mensagem/i)).toHaveValue('Escolha uma opção do menu');

    // E o motivo do envio indisponível é apresentado (anunciado por role=alert).
    const alerta = await screen.findByText(/transporte indisponível/i);
    expect(alerta).toHaveAttribute('role', 'alert');
  });

  it('fecha e limpa somente depois do aceite do transporte', async () => {
    const onSend = vi.fn().mockResolvedValue(undefined);
    const onOpenChange = vi.fn();
    render(<InteractiveMessageBuilder open onOpenChange={onOpenChange} onSend={onSend} />);

    comporMensagem();
    fireEvent.click(screen.getByRole('button', { name: /enviar mensagem/i }));

    await waitFor(() => expect(onOpenChange).toHaveBeenCalledWith(false));
    expect(screen.getByPlaceholderText(/digite o corpo da mensagem/i)).toHaveValue('');
  });

  it('apresenta o envio como indisponível e não deixa confirmar', () => {
    const onSend = vi.fn();
    const onOpenChange = vi.fn();
    render(
      <InteractiveMessageBuilder
        open
        onOpenChange={onOpenChange}
        onSend={onSend}
        sendUnavailableReason="Envio de mensagens interativas indisponível: o transporte de botões e listas ainda não está publicado. Sua composição foi mantida."
      />,
    );

    const alerta = screen.getByText(/transporte de botões e listas ainda não está publicado/i);
    expect(alerta).toHaveAttribute('role', 'alert');
    expect(screen.getByRole('button', { name: /enviar mensagem/i })).toBeDisabled();
    expect(onSend).not.toHaveBeenCalled();
  });
});
