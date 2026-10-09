import { beforeEach, describe, expect, it, vi } from 'vitest';

const { rpc, invoke } = vi.hoisted(() => ({ rpc: vi.fn(), invoke: vi.fn() }));

vi.mock('@/integrations/supabase/client', () => ({
  supabase: { rpc, functions: { invoke } },
}));

import { sendOutboundMessage, sendRichOutboundMessage } from '../outbound-message.service';
import { crossTabSendDedupe } from '@/lib/crossTabSendDedupe';
import { offlineSendQueue } from '@/lib/offlineQueue';
import { sendThrottle } from '@/lib/sendThrottle';

describe('sendOutboundMessage', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    vi.clearAllMocks();
    vi.stubGlobal('crypto', { randomUUID: () => '0c5d8df5-430d-4f46-8c0a-764be035116a' });
    // `sendThrottle` é um singleton do módulo: as reservas de um caso ficariam de
    // pé para o próximo e a drenagem do caso da fila offline sairia só depois do
    // prazo do `vi.waitFor`. Zerar por caso devolve a cada teste o mesmo throttle
    // que o app tem no boot — nenhuma expectativa deste arquivo muda.
    sendThrottle.reset();
  });

  it('enqueues first and only then asks the authenticated delivery gateway to dispatch', async () => {
    rpc.mockResolvedValue({
      data: { id: 'e23ca9d2-99a8-45d2-a3fe-df344fb9b2cc', status: 'sending', external_id: null },
      error: null,
    });
    invoke.mockResolvedValue({
      data: {
        messageId: 'e23ca9d2-99a8-45d2-a3fe-df344fb9b2cc', status: 'sent', externalId: 'provider-1', idempotent: false,
      },
      error: null,
    });

    await expect(sendOutboundMessage({
      contactId: 'a9aed371-fb0a-4a8a-ae12-4f61bf1169e0',
      content: 'Olá',
    })).resolves.toEqual({
      id: 'e23ca9d2-99a8-45d2-a3fe-df344fb9b2cc', status: 'sent', externalId: 'provider-1', idempotent: false,
    });

    expect(rpc).toHaveBeenCalledWith('enqueue_outbound_message', {
      p_contact_id: 'a9aed371-fb0a-4a8a-ae12-4f61bf1169e0',
      p_client_message_id: '0c5d8df5-430d-4f46-8c0a-764be035116a',
      p_content: 'Olá', p_message_type: 'text', p_media_url: undefined,
      p_reply_to_id: undefined, p_whatsapp_connection_id: undefined, p_caption: undefined,
    });
    expect(invoke).toHaveBeenCalledWith('message-delivery', {
      body: { messageId: 'e23ca9d2-99a8-45d2-a3fe-df344fb9b2cc' },
    });
  });

  it('does not dispatch when authorization or validation prevents enqueueing', async () => {
    rpc.mockResolvedValue({ data: null, error: new Error('message_contact_not_authorized') });

    await expect(sendOutboundMessage({ contactId: 'contact', content: 'Olá' }))
      .rejects.toThrow('message_contact_not_authorized');
    expect(invoke).not.toHaveBeenCalled();
  });

  // CT-11 / SL-005 — a falha INDUZIDA do envio de catálogo: a URL da foto vai
  // intacta como `p_media_url` e o enqueue a rejeita (a RPC só aceita URL
  // `^https://` com até 4096 caracteres, ver enqueue_outbound_message). É esta
  // rejeição que `useSendProduct` conta como falha da foto e transforma o
  // resultado em `partial`. Sem ela (envio "engolindo" o erro) o usuário veria
  // sucesso com uma foto que nunca chegou — por isso o dispatch é proibido.
  it('foto com URL inválida: o enqueue rejeitado impede o dispatch e propaga a falha', async () => {
    rpc.mockResolvedValue({ data: null, error: new Error('invalid_outbound_message') });

    await expect(sendOutboundMessage({
      contactId: 'a9aed371-fb0a-4a8a-ae12-4f61bf1169e0',
      content: 'Olha esse produto',
      messageType: 'image',
      mediaUrl: 'foto-invalida.jpg',
      caption: 'Olha esse produto',
    })).rejects.toThrow('invalid_outbound_message');

    expect(rpc).toHaveBeenCalledWith('enqueue_outbound_message', expect.objectContaining({
      p_message_type: 'image', p_media_url: 'foto-invalida.jpg',
    }));
    expect(invoke).not.toHaveBeenCalled();
  });

  it('reuses the same browser action id after an ambiguous dispatch failure', async () => {
    const queued = { id: 'e23ca9d2-99a8-45d2-a3fe-df344fb9b2dd', status: 'sending', external_id: null };
    rpc.mockResolvedValue({ data: queued, error: null });
    invoke
      .mockResolvedValueOnce({ data: null, error: new Error('network timeout') })
      .mockResolvedValueOnce({
        data: { messageId: queued.id, status: 'sent', externalId: 'provider-retry', idempotent: true },
        error: null,
      });

    const input = { contactId: 'retry-contact', content: 'retry-safe' };
    await expect(sendOutboundMessage(input)).rejects.toThrow('network timeout');
    await expect(sendOutboundMessage(input)).resolves.toMatchObject({ id: queued.id, idempotent: true });

    const ids = rpc.mock.calls.map(([, args]) => args.p_client_message_id);
    expect(ids).toEqual(['0c5d8df5-430d-4f46-8c0a-764be035116a', '0c5d8df5-430d-4f46-8c0a-764be035116a']);
  });

  it('persists a poll payload before asking the delivery gateway to dispatch it', async () => {
    rpc.mockResolvedValue({
      data: { id: '56bb3f25-ad35-40b9-adcd-d10f4a98752d', status: 'sending', external_id: null }, error: null,
    });
    invoke.mockResolvedValue({
      data: { messageId: '56bb3f25-ad35-40b9-adcd-d10f4a98752d', status: 'sent', externalId: 'provider-poll' }, error: null,
    });

    await expect(sendRichOutboundMessage({
      contactId: 'a9aed371-fb0a-4a8a-ae12-4f61bf1169e0',
      displayContent: '📊 *Enquete:* Cor',
      messageType: 'poll',
      deliveryPayload: { name: 'Cor', values: ['Azul', 'Carvão'], selectableCount: 1 },
      clientMessageId: '1c2da975-2d6f-4a5b-b54f-8acf098bd887',
    })).resolves.toMatchObject({ id: '56bb3f25-ad35-40b9-adcd-d10f4a98752d', status: 'sent' });

    expect(rpc).toHaveBeenCalledWith('enqueue_rich_outbound_message', expect.objectContaining({
      p_client_message_id: '1c2da975-2d6f-4a5b-b54f-8acf098bd887',
      p_message_type: 'poll',
      p_delivery_payload: { name: 'Cor', values: ['Azul', 'Carvão'], selectableCount: 1 },
    }));
    expect(invoke).toHaveBeenCalledWith('message-delivery', {
      body: { messageId: '56bb3f25-ad35-40b9-adcd-d10f4a98752d' },
    });
  });

  it('com a rede caída a mensagem espera na fila local e sai sozinha na reconexão (SL-070/025)', async () => {
    await offlineSendQueue.clear();
    Object.defineProperty(navigator, 'onLine', { configurable: true, value: false });
    try {
      await expect(sendOutboundMessage({ contactId: 'contato-fila', content: 'composta offline' })).resolves.toEqual({
        id: '0c5d8df5-430d-4f46-8c0a-764be035116a', status: 'pending', externalId: null, idempotent: false,
      });
      // Nada saiu da aba: nem enqueue no servidor, nem despacho.
      expect(rpc).not.toHaveBeenCalled();
      expect(invoke).not.toHaveBeenCalled();
      expect((await offlineSendQueue.list()).map((item) => item.content)).toEqual(['composta offline']);
    } finally {
      delete (navigator as unknown as Record<string, unknown>).onLine;
    }

    rpc.mockResolvedValue({
      data: { id: 'e23ca9d2-99a8-45d2-a3fe-df344fb9b2cc', status: 'sending', external_id: null }, error: null,
    });
    invoke.mockResolvedValue({
      data: { messageId: 'e23ca9d2-99a8-45d2-a3fe-df344fb9b2cc', status: 'sent', externalId: 'provider-fila', idempotent: false },
      error: null,
    });

    window.dispatchEvent(new Event('online'));

    await vi.waitFor(async () => expect(await offlineSendQueue.list()).toEqual([]));
    // Sai com a MESMA chave estável: sem duplicar (item 024).
    expect(rpc).toHaveBeenCalledWith('enqueue_outbound_message', expect.objectContaining({
      p_client_message_id: '0c5d8df5-430d-4f46-8c0a-764be035116a',
      p_content: 'composta offline',
    }));
    expect(invoke).toHaveBeenCalledWith('message-delivery', {
      body: { messageId: 'e23ca9d2-99a8-45d2-a3fe-df344fb9b2cc' },
    });
  });

  it('aba que perde a disputa de dedupe não dispara enqueue nem despacho (SL-070/026)', async () => {
    vi.spyOn(crossTabSendDedupe, 'claim').mockResolvedValue({
      owner: false,
      clientMessageId: 'id-da-aba-dona',
    });
    const waitSpy = vi.spyOn(sendThrottle, 'wait');

    await expect(sendOutboundMessage({ contactId: 'contato-dedupe', content: 'mesma ação em duas abas' }))
      .resolves.toEqual({
        id: 'id-da-aba-dona', status: 'pending', externalId: null, idempotent: true,
      });

    // A aba perdedora adota a chave da dona e daqui não sai request nenhum.
    expect(rpc).not.toHaveBeenCalled();
    expect(invoke).not.toHaveBeenCalled();
    expect(waitSpy).not.toHaveBeenCalled();
  });

  it('aba dona da ação espera o throttle antes de enfileirar no servidor', async () => {
    const claimSpy = vi.spyOn(crossTabSendDedupe, 'claim').mockResolvedValue({
      owner: true,
      clientMessageId: '0c5d8df5-430d-4f46-8c0a-764be035116a',
    });
    const ordem: string[] = [];
    vi.spyOn(sendThrottle, 'wait').mockImplementation(async () => {
      ordem.push('throttle');
    });
    rpc.mockImplementation(async () => {
      ordem.push('enqueue');
      return {
        data: { id: 'e23ca9d2-99a8-45d2-a3fe-df344fb9b2cc', status: 'sending', external_id: null },
        error: null,
      };
    });
    invoke.mockResolvedValue({
      data: {
        messageId: 'e23ca9d2-99a8-45d2-a3fe-df344fb9b2cc', status: 'sent', externalId: null, idempotent: false,
      },
      error: null,
    });

    await expect(sendOutboundMessage({ contactId: 'contato-online', content: 'envio online' }))
      .resolves.toMatchObject({ id: 'e23ca9d2-99a8-45d2-a3fe-df344fb9b2cc' });

    expect(claimSpy).toHaveBeenCalledTimes(1);
    expect(ordem.slice(0, 2)).toEqual(['throttle', 'enqueue']);
  });

  it('libera a reivindicação do dedupe quando o envio falha — senão a próxima ação igual fica presa', async () => {
    const claimSpy = vi.spyOn(crossTabSendDedupe, 'claim').mockResolvedValue({
      owner: true,
      clientMessageId: '0c5d8df5-430d-4f46-8c0a-764be035116a',
    });
    const releaseSpy = vi.spyOn(crossTabSendDedupe, 'release');
    rpc.mockResolvedValue({ data: null, error: new Error('enqueue indisponível') });

    await expect(sendOutboundMessage({ contactId: 'contato-release', content: 'vai falhar' }))
      .rejects.toThrow('enqueue indisponível');

    const dedupeKey = claimSpy.mock.calls[0][0];
    expect(releaseSpy).toHaveBeenCalledWith(dedupeKey);
  });

  it('libera a reivindicação do dedupe quando o próprio throttle falha', async () => {
    const claimSpy = vi.spyOn(crossTabSendDedupe, 'claim').mockResolvedValue({
      owner: true,
      clientMessageId: '0c5d8df5-430d-4f46-8c0a-764be035116a',
    });
    const releaseSpy = vi.spyOn(crossTabSendDedupe, 'release');
    vi.spyOn(sendThrottle, 'wait').mockRejectedValue(new Error('relógio do throttle quebrou'));

    await expect(sendOutboundMessage({ contactId: 'contato-throttle', content: 'throttle falha' }))
      .rejects.toThrow('relógio do throttle quebrou');

    expect(rpc).not.toHaveBeenCalled();
    const dedupeKey = claimSpy.mock.calls[0][0];
    expect(releaseSpy).toHaveBeenCalledWith(dedupeKey);
  });

  it('a drenagem da fila offline espaça cada entrega pelo throttle (SL-070/025+026)', async () => {
    await offlineSendQueue.clear();
    Object.defineProperty(navigator, 'onLine', { configurable: true, value: false });
    try {
      await sendOutboundMessage({ contactId: 'contato-fila', content: 'primeira', clientMessageId: 'fila-1' });
      await sendOutboundMessage({ contactId: 'contato-fila', content: 'segunda', clientMessageId: 'fila-2' });
    } finally {
      delete (navigator as unknown as Record<string, unknown>).onLine;
    }
    expect(await offlineSendQueue.list()).toHaveLength(2);

    const ordem: string[] = [];
    const waitSpy = vi.spyOn(sendThrottle, 'wait').mockImplementation(async () => {
      ordem.push('throttle');
    });
    rpc.mockImplementation(async (_name: string, args: { p_client_message_id: string }) => {
      ordem.push(`enqueue:${args.p_client_message_id}`);
      return {
        data: { id: `srv-${args.p_client_message_id}`, status: 'sending', external_id: null },
        error: null,
      };
    });
    invoke.mockImplementation(async (_name: string, options: { body: { messageId: string } }) => {
      ordem.push(`dispatch:${options.body.messageId}`);
      return {
        data: { messageId: options.body.messageId, status: 'sent', externalId: null },
        error: null,
      };
    });

    window.dispatchEvent(new Event('online'));

    await vi.waitFor(async () => expect(await offlineSendQueue.list()).toEqual([]));
    // Cada entrega da fila espera a vez no throttle — a reconexão não vira rajada.
    expect(ordem).toEqual([
      'throttle', 'enqueue:fila-1', 'dispatch:srv-fila-1',
      'throttle', 'enqueue:fila-2', 'dispatch:srv-fila-2',
    ]);
    expect(waitSpy).toHaveBeenCalledTimes(2);
  });
});
