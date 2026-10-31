import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { InteractiveMessageBuilder } from '@/components/inbox/InteractiveMessageBuilder';

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

function composeValidMessage() {
  fireEvent.change(screen.getByPlaceholderText('Digite o corpo da mensagem...'), {
    target: { value: 'Confirme seu pedido' },
  });
  fireEvent.click(screen.getByRole('button', { name: /resposta/i }));
  fireEvent.change(screen.getByPlaceholderText(/Título do botão/i), {
    target: { value: 'Confirmar' },
  });
}

describe('InteractiveMessageBuilder — ciclo de envio', () => {
  it('bloqueia Cancelar, Escape e clique externo durante o envio; fecha após sucesso', async () => {
    const send = deferred<void>();
    const onOpenChange = vi.fn();
    render(
      <InteractiveMessageBuilder
        open
        onOpenChange={onOpenChange}
        onSend={() => send.promise}
      />,
    );
    composeValidMessage();

    fireEvent.click(screen.getByRole('button', { name: 'Enviar Mensagem' }));
    const sendingButton = await screen.findByRole('button', { name: /Enviando/ });
    expect(sendingButton).toBeDisabled();

    const cancelButton = screen.getByRole('button', { name: 'Cancelar' });
    expect(cancelButton).toBeDisabled();
    fireEvent.click(cancelButton);
    fireEvent.keyDown(document, { key: 'Escape', code: 'Escape' });
    fireEvent.pointerDown(document.body, { pointerType: 'mouse' });
    expect(onOpenChange).not.toHaveBeenCalledWith(false);

    send.resolve();
    await waitFor(() => expect(onOpenChange).toHaveBeenCalledWith(false));
  });

  it('em falha mantém o diálogo e a composição, mas permite cancelar depois', async () => {
    const send = deferred<void>();
    const onOpenChange = vi.fn();
    render(
      <InteractiveMessageBuilder
        open
        onOpenChange={onOpenChange}
        onSend={() => send.promise}
      />,
    );
    composeValidMessage();

    fireEvent.click(screen.getByRole('button', { name: 'Enviar Mensagem' }));
    send.reject(new Error('Transporte indisponível'));

    expect(await screen.findByRole('alert')).toHaveTextContent('Transporte indisponível');
    expect(screen.getByPlaceholderText('Digite o corpo da mensagem...')).toHaveValue('Confirme seu pedido');
    expect(screen.getByPlaceholderText(/Título do botão/i)).toHaveValue('Confirmar');
    expect(onOpenChange).not.toHaveBeenCalledWith(false);

    fireEvent.click(screen.getByRole('button', { name: 'Cancelar' }));
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it('desabilita edição durante o transporte e envia o snapshot original sem perda silenciosa', async () => {
    const send = deferred<void>();
    const onSend = vi.fn(() => send.promise);
    render(
      <InteractiveMessageBuilder
        open
        onOpenChange={vi.fn()}
        onSend={onSend}
      />,
    );
    composeValidMessage();

    fireEvent.click(screen.getByRole('button', { name: 'Enviar Mensagem' }));
    await screen.findByRole('button', { name: /Enviando/ });

    const body = screen.getByPlaceholderText('Digite o corpo da mensagem...');
    const title = screen.getByPlaceholderText(/Título do botão/i);
    const addUrlButton = screen.getByRole('button', { name: 'URL' });
    expect(body).toBeDisabled();
    expect(title).toBeDisabled();
    expect(addUrlButton).toBeDisabled();

    // fireEvent.change dispara eventos sintéticos mesmo em controles disabled;
    // a validação relevante é que o navegador os expõe como indisponíveis.
    expect(screen.getAllByPlaceholderText(/Título do botão/i)).toHaveLength(1);
    expect(body).toHaveValue('Confirme seu pedido');
    expect(title).toHaveValue('Confirmar');
    expect(onSend).toHaveBeenCalledWith(expect.objectContaining({
      type: 'buttons',
      body: 'Confirme seu pedido',
      buttons: [expect.objectContaining({ type: 'reply', title: 'Confirmar' })],
    }));

    send.resolve();
    await waitFor(() => expect(onSend).toHaveBeenCalledOnce());
  });
});
