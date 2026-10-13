/**
 * t_fa2f8515 / PD-63 — balão da mensagem que ficou na fila offline.
 *
 * Antes o ChatPanel dizia "Mensagem enviada" mesmo com a rede caída (o serviço enfileirava
 * local). Aqui se prova o balão REAL do componente: ele diz "Aguardando rede" (nunca
 * "enviado") e "Cancelar" tira o item da fila local.
 */
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';
import type { OfflineQueuedMessage, OfflineQueueInput } from '@/lib/offlineQueue';
import { offlineSendQueue } from '@/lib/offlineQueue';
import {
  MessageBubbleAguardandoRede,
  STATUS_AGUARDANDO_REDE,
  paraMensagemAguardandoRede,
} from '../MessageBubbleAguardandoRede';

const entrada: OfflineQueueInput = {
  clientMessageId: 'cm-1',
  userId: 'user-1',
  contactId: 'contato-1',
  content: 'oi, viu meu pedido?',
  messageType: 'text',
  mediaUrl: null,
  caption: null,
  replyToId: null,
  whatsappConnectionId: null,
};

const item: OfflineQueuedMessage = {
  ...entrada,
  enqueuedAt: 1,
  attempts: 0,
  status: 'pending',
};

beforeEach(async () => {
  await offlineSendQueue.clear();
});

describe('bolha aguardando rede', () => {
  it('mostra o conteúdo, o rótulo "Aguardando rede" e nenhum estado de enviado', () => {
    render(<MessageBubbleAguardandoRede message={paraMensagemAguardandoRede(item)} />);

    expect(screen.getByTestId('bolha-aguardando-rede')).toBeInTheDocument();
    expect(screen.getByText('oi, viu meu pedido?')).toBeInTheDocument();
    expect(screen.getByText('Aguardando rede')).toBeInTheDocument();
    // Nada de "enviada"/check: a mensagem NÃO saiu.
    expect(screen.queryByText(/enviad/i)).toBeNull();
  });

  it('mapeia o item para uma Message de status próprio (não confunde com linha do servidor)', () => {
    const mensagem = paraMensagemAguardandoRede(item);

    expect(mensagem.status).toBe(STATUS_AGUARDANDO_REDE);
    expect(mensagem.id).toBe(item.clientMessageId);
    // A linha real carrega o MESMO client_message_id: é por ele que a bolha não duplica.
    expect(mensagem.client_message_id).toBe(item.clientMessageId);
    expect(mensagem.sender).toBe('agent');
  });

  it('"Cancelar" tira o item da fila offline', async () => {
    await offlineSendQueue.enqueue(entrada);
    expect(await offlineSendQueue.list()).toHaveLength(1);

    render(<MessageBubbleAguardandoRede message={paraMensagemAguardandoRede(item)} />);
    fireEvent.click(screen.getByRole('button', { name: 'Cancelar envio desta mensagem' }));

    await waitFor(async () => {
      expect(await offlineSendQueue.list()).toHaveLength(0);
    });
  });
});
