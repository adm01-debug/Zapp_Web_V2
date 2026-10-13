import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { AdvancedMessageMenu } from '../AdvancedMessageMenu';
import { sendOutboundMessage, sendRichOutboundMessage } from '@/services/outbound-message.service';
import { toast } from 'sonner';

vi.mock('@/hooks/integrations/useEvolutionApi', () => ({
  useEvolutionApi: () => ({ sendStatusMessage: vi.fn().mockResolvedValue({}), isLoading: false }),
}));
vi.mock('@/services/outbound-message.service', () => ({
  sendOutboundMessage: vi.fn().mockResolvedValue({}),
  sendRichOutboundMessage: vi.fn().mockResolvedValue({}),
}));
vi.mock('sonner', () => ({
  toast: { success: vi.fn(), error: vi.fn(), info: vi.fn() },
}));

function renderMenu(props = {}) {
  return render(
    <AdvancedMessageMenu contactId="c1" instanceName="inst" recipientNumber="5511" {...props} />,
  );
}

function abrirMenu() {
  // O gatilho é o único botão fechado; abrir o popover lista as 4 opções.
  fireEvent.click(screen.getByRole('button'));
}

describe('AdvancedMessageMenu — opções avançadas de mensagem', () => {
  beforeEach(() => vi.clearAllMocks());

  it('lista Figurinha, Enquete, Cartão de Contato e Status/Story ao abrir', () => {
    renderMenu();
    abrirMenu();
    expect(screen.getByText('Figurinha')).toBeInTheDocument();
    expect(screen.getByText('Enquete')).toBeInTheDocument();
    expect(screen.getByText('Cartão de Contato')).toBeInTheDocument();
    expect(screen.getByText('Status/Story')).toBeInTheDocument();
  });

  it('envia a enquete com as opções preenchidas e devolve o poll pelo callback', async () => {
    const onPollSent = vi.fn();
    renderMenu({ onPollSent });
    abrirMenu();
    fireEvent.click(screen.getByText('Enquete'));

    fireEvent.change(screen.getByPlaceholderText('Qual horário preferem?'), { target: { value: 'Qual?' } });
    fireEvent.change(screen.getByPlaceholderText('Opção 1'), { target: { value: 'A' } });
    fireEvent.change(screen.getByPlaceholderText('Opção 2'), { target: { value: 'B' } });
    fireEvent.click(screen.getByRole('button', { name: /Enviar Enquete/ }));

    await waitFor(() => expect(onPollSent).toHaveBeenCalledTimes(1));
    expect(sendRichOutboundMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        contactId: 'c1',
        messageType: 'poll',
        deliveryPayload: expect.objectContaining({ name: 'Qual?', values: ['A', 'B'] }),
      }),
    );
    expect(onPollSent).toHaveBeenCalledWith(expect.objectContaining({ name: 'Qual?', options: ['A', 'B'] }));
  });

  it('recusa enquete sem título ou com menos de 2 opções, sem enviar', () => {
    renderMenu();
    abrirMenu();
    fireEvent.click(screen.getByText('Enquete'));

    // Título e uma só opção preenchidos: ainda é inválido (mínimo 2 opções).
    fireEvent.change(screen.getByPlaceholderText('Qual horário preferem?'), { target: { value: 'Qual?' } });
    fireEvent.change(screen.getByPlaceholderText('Opção 1'), { target: { value: 'A' } });
    fireEvent.click(screen.getByRole('button', { name: /Enviar Enquete/ }));

    expect(toast.error).toHaveBeenCalledWith('Preencha o título e pelo menos 2 opções');
    expect(sendRichOutboundMessage).not.toHaveBeenCalled();
  });

  it('envia o cartão de contato só com nome e telefone', async () => {
    const onContactSent = vi.fn();
    renderMenu({ onContactSent });
    abrirMenu();
    fireEvent.click(screen.getByText('Cartão de Contato'));

    fireEvent.change(screen.getByPlaceholderText('João Silva'), { target: { value: 'Ana' } });
    fireEvent.change(screen.getByPlaceholderText('5511999999999'), { target: { value: '5511999' } });
    fireEvent.click(screen.getByRole('button', { name: /Enviar Contato/ }));

    await waitFor(() => expect(onContactSent).toHaveBeenCalledWith('Ana'));
    expect(sendRichOutboundMessage).toHaveBeenCalledWith(
      expect.objectContaining({ messageType: 'contact', deliveryPayload: expect.objectContaining({ fullName: 'Ana' }) }),
    );
  });

  it('mantém o botão Enviar da figurinha bloqueado sem URL', () => {
    renderMenu();
    abrirMenu();
    fireEvent.click(screen.getByText('Figurinha'));

    const enviar = screen.getByRole('button', { name: /Enviar$/ });
    expect(enviar).toBeDisabled();
    fireEvent.change(screen.getByPlaceholderText('https://exemplo.com/sticker.webp'), {
      target: { value: 'https://exemplo.com/s.webp' },
    });
    expect(enviar).toBeEnabled();
  });
});
