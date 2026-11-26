import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import React from 'react';

/**
 * E47 — envio de teste da campanha (edge `talkx-send`, `action: "test"`).
 *
 * Antes desta tela, o caminho de teste da Edge só era alcançável pelos templates:
 * a campanha ia para o público sem ninguém ver a mensagem chegar no WhatsApp.
 * Os casos cobrem o que o operador precisa ver: bloqueio sem conexão/mensagem,
 * número inválido, envio com o número normalizado + mídia da campanha, sucesso
 * com o id do provedor e o motivo real da recusa (ex.: limite X067 de 5 testes).
 */
import { TalkXTestSendCard } from '../tracking/TalkXTestSendCard';
import { validTestPhone, testSendErrorMessage } from '../tracking/talkxTestSend';

const message = 'Oi [nome], seu pedido chegou!';
const mediaUrl = 'https://cdn.example.com/banner.png';

function setup(overrides: Partial<React.ComponentProps<typeof TalkXTestSendCard>> = {}) {
  const sendTest = vi.fn().mockResolvedValue({ success: true, provider_message_id: 'wamid.ABCDEF123456' });
  render(
    <TalkXTestSendCard
      connectionId="conn-1"
      message={message}
      mediaUrl={null}
      mediaType={null}
      sendTest={sendTest}
      {...overrides}
    />,
  );
  return { sendTest };
}

const phoneInput = () => screen.getByTestId('talkx-test-phone');
const sendButton = () => screen.getByTestId('talkx-test-send') as HTMLButtonElement;

describe('validTestPhone', () => {
  it('normaliza o número para dígitos', () => {
    expect(validTestPhone('(41) 99900-1234')).toBe('41999001234');
    expect(validTestPhone('+55 41 99900-1234')).toBe('5541999001234');
  });

  it('recusa número curto, longo ou vazio', () => {
    expect(validTestPhone('')).toBeNull();
    expect(validTestPhone('123')).toBeNull();
    expect(validTestPhone('1234567890123456')).toBeNull();
  });
});

describe('testSendErrorMessage', () => {
  it('usa o motivo do corpo da Edge (429 do limite X067)', async () => {
    const error = { context: { text: async () => '{"error":"Limite de envios de teste atingido"}' } };
    await expect(testSendErrorMessage(error)).resolves.toBe('Limite de envios de teste atingido');
  });

  it('cai na mensagem do erro quando não há corpo legível', async () => {
    await expect(testSendErrorMessage(new Error('Falha de rede'))).resolves.toBe('Falha de rede');
    await expect(testSendErrorMessage({ context: { text: async () => 'não é json' } })).resolves.toBe('Erro desconhecido');
  });
});

describe('TalkXTestSendCard', () => {
  it('bloqueia o envio sem conexão de WhatsApp', () => {
    setup({ connectionId: null });
    expect(sendButton().disabled).toBe(true);
    expect(screen.getByText('Selecione uma conexão de WhatsApp ativa para testar.')).toBeTruthy();
  });

  it('bloqueia o envio sem mensagem na campanha', () => {
    setup({ message: '   ' });
    expect(sendButton().disabled).toBe(true);
    expect(screen.getByText('Escreva a mensagem da campanha para poder testar.')).toBeTruthy();
  });

  it('só habilita com número completo e avisa quando está inválido', () => {
    setup();
    fireEvent.change(phoneInput(), { target: { value: '4199' } });
    expect(screen.getByText(/Número inválido/)).toBeTruthy();
    expect(sendButton().disabled).toBe(true);

    fireEvent.change(phoneInput(), { target: { value: '(41) 99900-1234' } });
    expect(screen.queryByText(/Número inválido/)).toBeNull();
    expect(sendButton().disabled).toBe(false);
  });

  it('envia o número normalizado com a mídia da campanha e mostra o id do provedor', async () => {
    const { sendTest } = setup({ mediaUrl, mediaType: 'image' });
    fireEvent.change(phoneInput(), { target: { value: '(41) 99900-1234' } });
    fireEvent.click(sendButton());

    await waitFor(() => expect(sendTest).toHaveBeenCalledTimes(1));
    const args = sendTest.mock.calls[0];
    expect(args[0]).toBe('conn-1');
    expect(args[1]).toBe(message);
    expect(args[2]).toBe('41999001234');
    expect(args[3]).toBe(mediaUrl);
    expect(args[4]).toBe('image');
    expect(typeof args[5]).toBe('string');

    const status = await screen.findByTestId('talkx-test-result');
    expect(status.textContent).toContain('Teste enviado para 41999001234');
    expect(status.textContent).toContain('wamid.AB');
  });

  it('mostra o motivo real da recusa da Edge', async () => {
    const sendTest = vi.fn().mockRejectedValue({ context: { text: async () => '{"error":"Limite de envios de teste atingido"}' } });
    setup({ sendTest });
    fireEvent.change(phoneInput(), { target: { value: '5541999001234' } });
    fireEvent.click(sendButton());

    const status = await screen.findByTestId('talkx-test-result');
    expect(status.textContent).toContain('Limite de envios de teste atingido');
  });

  it('mostra "Enviando…" e não deixa disparar duas vezes enquanto envia', async () => {
    let release: (value: { success: boolean }) => void = () => {};
    const sendTest = vi.fn().mockReturnValue(new Promise((resolve) => { release = resolve; }));
    setup({ sendTest });
    fireEvent.change(phoneInput(), { target: { value: '5541999001234' } });
    fireEvent.click(sendButton());

    await waitFor(() => expect(sendButton().textContent).toContain('Enviando'));
    expect(sendButton().disabled).toBe(true);
    fireEvent.click(sendButton());
    expect(sendTest).toHaveBeenCalledTimes(1);

    release({ success: true });
    await waitFor(() => expect(sendButton().textContent).toContain('Enviar teste'));
  });
});