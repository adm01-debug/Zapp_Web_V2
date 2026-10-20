import { beforeEach, describe, expect, it, vi } from 'vitest';

const { rpc, invoke } = vi.hoisted(() => ({ rpc: vi.fn(), invoke: vi.fn() }));

vi.mock('@/integrations/supabase/client', () => ({
  supabase: { rpc, functions: { invoke } },
}));

import { sendOutboundMessage, sendRichOutboundMessage } from '../outbound-message.service';

describe('sendOutboundMessage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubGlobal('crypto', { randomUUID: () => '0c5d8df5-430d-4f46-8c0a-764be035116a' });
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
});
