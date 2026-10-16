import { beforeEach, describe, expect, it, vi } from 'vitest';

const { rpc, invoke, from, update, eq } = vi.hoisted(() => {
  const eq = vi.fn();
  const update = vi.fn(() => ({ eq }));
  const from = vi.fn(() => ({ update }));
  return { rpc: vi.fn(), invoke: vi.fn(), from, update, eq };
});

vi.mock('@/integrations/supabase/client', () => ({
  supabase: { rpc, functions: { invoke }, from },
}));

vi.mock('@/lib/logger', () => ({
  getLogger: () => ({ warn: vi.fn(), error: vi.fn() }),
}));

import { ChatService } from '../chat.service';
import { sendThrottle } from '@/lib/sendThrottle';
import type { MessageInsert } from '@/types/chat';

function mensagem(extra: Record<string, unknown> = {}): MessageInsert {
  return {
    sender: 'agent',
    contact_id: 'contato-previa',
    content: 'veja https://exemplo.com/materia',
    message_type: 'text',
    ...extra,
  } as unknown as MessageInsert;
}

function chamadasDePreview(): unknown[][] {
  return invoke.mock.calls.filter(([nome]) => nome === 'fetch-link-preview');
}

/**
 * PK-24 ([refazer 1] pontos 1 e 3) — o funil (`sendOutboundMessage`) é o ponto
 * ÚNICO do enriquecimento: `ChatService.sendMessage` só repassa. Passar pelo
 * caminho real prova que UM envio com link gera UMA chamada ao buscador.
 */
describe('ChatService.sendMessage com link pede a prévia uma única vez', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubGlobal('crypto', { randomUUID: () => 'chat-previa-1' });
    sendThrottle.reset();
    rpc.mockResolvedValue({
      data: { id: 'msg-chat-1', status: 'sending', external_id: null },
      error: null,
    });
    invoke.mockImplementation((nome: string) =>
      nome === 'message-delivery'
        ? Promise.resolve({
          data: { messageId: 'msg-chat-1', status: 'sent', externalId: null, idempotent: false },
          error: null,
        })
        : Promise.resolve({
          data: { preview: { url: 'https://exemplo.com/materia', title: 'Matéria' } },
          error: null,
        }),
    );
    eq.mockResolvedValue({ error: null });
    update.mockImplementation(() => ({ eq }));
    from.mockImplementation(() => ({ update }));
  });

  it('texto com link resulta em UMA ÚNICA chamada a fetch-link-preview', async () => {
    await expect(ChatService.sendMessage(mensagem())).resolves.toMatchObject({ id: 'msg-chat-1' });

    await vi.waitFor(() =>
      expect(update).toHaveBeenCalledWith({
        link_preview: { url: 'https://exemplo.com/materia', title: 'Matéria' },
      }),
    );
    expect(chamadasDePreview()).toHaveLength(1);
    expect(eq).toHaveBeenCalledWith('id', 'msg-chat-1');
  });

  it('prévia que o chamador já trouxe não é pedida de novo', async () => {
    const previa = { url: 'https://exemplo.com/materia', title: 'Matéria' };

    await expect(
      ChatService.sendMessage(mensagem({ link_preview: previa })),
    ).resolves.toMatchObject({ id: 'msg-chat-1' });

    // O enriquecimento é bônus assíncrono: espera o bastante para ele
    // aparecer se o código o disparar sem necessidade.
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(chamadasDePreview()).toEqual([]);
    expect(from).not.toHaveBeenCalled();
  });
});
