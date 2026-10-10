/**
 * R2-INB-001 — o id da resposta precisa chegar ao RPC canônico.
 *
 * O contrato do banco (`enqueue_outbound_message(p_reply_to_id)`) já existia; o
 * que faltava era a fachada de envio ativo repassar o `replyToId`. Sem isso o
 * destinatário recebe texto sem vínculo de resposta, mesmo com o preview de
 * citação visível no Composer.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const { rpcMock, invokeMock } = vi.hoisted(() => ({
  rpcMock: vi.fn().mockResolvedValue({
    data: { id: 'msg-1', status: 'sending', external_id: null },
    error: null,
  }),
  invokeMock: vi.fn().mockResolvedValue({
    data: { messageId: 'msg-1', status: 'sent', externalId: 'ext-1' },
    error: null,
  }),
}));

vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    rpc: rpcMock,
    functions: { invoke: invokeMock },
  },
}));

import { sendMessageToContact } from '@/hooks/realtime/messageSender';

beforeEach(() => {
  vi.clearAllMocks();
  rpcMock.mockResolvedValue({ data: { id: 'msg-1', status: 'sending', external_id: null }, error: null });
  invokeMock.mockResolvedValue({ data: { messageId: 'msg-1', status: 'sent', externalId: 'ext-1' }, error: null });
});

describe('messageSender — resposta preserva o id citado até o RPC (R2-INB-001)', () => {
  it('encaminha replyToId como p_reply_to_id no enqueue_outbound_message', async () => {
    await sendMessageToContact('c1', 'texto', 'text', undefined, undefined, 'reply-uuid-1');

    expect(rpcMock).toHaveBeenCalledWith(
      'enqueue_outbound_message',
      expect.objectContaining({
        p_contact_id: 'c1',
        p_content: 'texto',
        p_reply_to_id: 'reply-uuid-1',
      })
    );
  });

  it('sem resposta, não envia p_reply_to_id (não inventa vínculo)', async () => {
    await sendMessageToContact('c1', 'texto');

    const args = rpcMock.mock.calls[0][1] as Record<string, unknown>;
    expect(args.p_reply_to_id).toBeUndefined();
  });
});
