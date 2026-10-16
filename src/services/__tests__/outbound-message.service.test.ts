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

  it('zera o singleton de throttle entre casos do serviço para não depender da ordem do lote', () => {
    expect(sendThrottle.pendingCount()).toBe(0);
    expect(sendThrottle.recentCount()).toBe(0);
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

  // SL-070/025 — o MESMO texto de uma ação offline não pode ser engolido depois.
  // A fila já guarda o próprio id no item, então a chave da ação morre quando o
  // envio vai para a fila (e quando a drenagem conclui). Sem isso, o segundo
  // envio — já online — reaproveitava o id da linha entregue, a Edge respondia
  // `idempotent: true` e NENHUM WhatsApp saía, com o chat dizendo "enviada".
  it('offline "ok" -> drena -> online "ok" gera DUAS mensagens: id novo e um despacho por envio', async () => {
    await offlineSendQueue.clear();
    sendThrottle.reset();
    let seq = 0;
    vi.stubGlobal('crypto', { randomUUID: () => `acao-${++seq}` });

    Object.defineProperty(navigator, 'onLine', { configurable: true, value: false });
    try {
      await expect(sendOutboundMessage({ contactId: 'contato-repetido', content: 'ok' }))
        .resolves.toMatchObject({ id: 'acao-1', status: 'pending' });
    } finally {
      delete (navigator as unknown as Record<string, unknown>).onLine;
    }

    rpc.mockResolvedValue({ data: { id: 'srv-fila', status: 'sending', external_id: null }, error: null });
    invoke.mockResolvedValue({
      data: { messageId: 'srv-fila', status: 'sent', externalId: 'provider-fila', idempotent: false }, error: null,
    });

    window.dispatchEvent(new Event('online'));
    await vi.waitFor(async () => expect(await offlineSendQueue.list()).toEqual([]));
    // A drenagem sai com o id que o item da fila guardou.
    expect(rpc).toHaveBeenCalledWith('enqueue_outbound_message', expect.objectContaining({
      p_client_message_id: 'acao-1', p_content: 'ok',
    }));

    rpc.mockClear();
    invoke.mockClear();
    rpc.mockResolvedValue({ data: { id: 'srv-online', status: 'sending', external_id: null }, error: null });
    invoke.mockResolvedValue({
      data: { messageId: 'srv-online', status: 'sent', externalId: 'provider-online', idempotent: false }, error: null,
    });

    await expect(sendOutboundMessage({ contactId: 'contato-repetido', content: 'ok' }))
      .resolves.toMatchObject({ id: 'srv-online', status: 'sent' });

    // Ação NOVA: id novo no enqueue e um despacho de verdade (nada de idempotent).
    const ids = rpc.mock.calls.map(([, args]) => args.p_client_message_id);
    expect(ids).toEqual(['acao-2']);
    expect(invoke).toHaveBeenCalledWith('message-delivery', { body: { messageId: 'srv-online' } });
  });

  // Critério de pronto 2 — o duplo clique online continua sendo UMA ação: as
  // duas chamadas carregam o MESMO `client_message_id`, então o servidor grava
  // uma linha só (`ON CONFLICT (contact_id, client_message_id)`).
  it('duplo clique online usa o MESMO id da ação: o servidor vê uma linha só', async () => {
    sendThrottle.reset();
    let seq = 0;
    vi.stubGlobal('crypto', { randomUUID: () => `duplo-${++seq}` });
    rpc.mockResolvedValue({ data: { id: 'srv-duplo', status: 'sending', external_id: null }, error: null });
    invoke.mockResolvedValue({
      data: { messageId: 'srv-duplo', status: 'sent', externalId: null, idempotent: false }, error: null,
    });

    const input = { contactId: 'contato-duplo', content: 'clique duplo' };
    await Promise.all([sendOutboundMessage(input), sendOutboundMessage(input)]);

    const ids = rpc.mock.calls.map(([, args]) => args.p_client_message_id);
    expect(ids).toEqual(['duplo-1', 'duplo-1']);
  });

  // Critério de pronto 2 (cenário PD-77) — depois de uma falha a chave continua
  // viva, então o reenvio da MESMA ação segue idempotente: mesmo id, uma linha.
  it('retry depois de falha do despacho continua idempotente (mesmo id da ação)', async () => {
    sendThrottle.reset();
    let seq = 0;
    vi.stubGlobal('crypto', { randomUUID: () => `retry-${++seq}` });
    rpc.mockResolvedValue({ data: { id: 'srv-retry', status: 'sending', external_id: null }, error: null });
    invoke
      .mockRejectedValueOnce(new Error('gateway fora do ar'))
      .mockResolvedValueOnce({
        data: { messageId: 'srv-retry', status: 'sent', externalId: 'provider-retry', idempotent: true }, error: null,
      });

    const input = { contactId: 'contato-retry', content: 'tenta de novo' };
    await expect(sendOutboundMessage(input)).rejects.toThrow('gateway fora do ar');
    await expect(sendOutboundMessage(input)).resolves.toMatchObject({ id: 'srv-retry', idempotent: true });

    const ids = rpc.mock.calls.map(([, args]) => args.p_client_message_id);
    expect(ids).toEqual(['retry-1', 'retry-1']);
  });

  // A chave tem vida CURTA de verdade: passado o prazo, o mesmo texto é mensagem nova.
  it('a chave da ação expira sozinha: depois do prazo o mesmo texto vira id novo', async () => {
    sendThrottle.reset();
    let seq = 0;
    vi.stubGlobal('crypto', { randomUUID: () => `ttl-${++seq}` });
    const base = Date.now();
    const nowSpy = vi.spyOn(Date, 'now').mockReturnValue(base);
    // Mesmo prazo de PENDING_ACTION_TTL_MS no serviço (2 min).
    const ttl = 2 * 60 * 1000;
    rpc.mockResolvedValue({ data: { id: 'srv-ttl', status: 'sending', external_id: null }, error: null });
    invoke.mockRejectedValue(new Error('gateway indisponível'));

    const input = { contactId: 'contato-ttl', content: 'bom dia' };
    await expect(sendOutboundMessage(input)).rejects.toThrow('gateway indisponível');
    // Ainda dentro do prazo: a falha mantém a chave e o id é reaproveitado.
    nowSpy.mockReturnValue(base + ttl - 1);
    await expect(sendOutboundMessage(input)).rejects.toThrow('gateway indisponível');
    // Passado o prazo: a chave expirou e a mesma ação virou mensagem nova.
    nowSpy.mockReturnValue(base + ttl + 1);
    invoke.mockResolvedValue({
      data: { messageId: 'srv-ttl', status: 'sent', externalId: null, idempotent: false }, error: null,
    });
    await expect(sendOutboundMessage(input)).resolves.toMatchObject({ id: 'srv-ttl' });

    const ids = rpc.mock.calls.map(([, args]) => args.p_client_message_id);
    expect(ids).toEqual(['ttl-1', 'ttl-1', 'ttl-2']);
  });

  /**
   * O "Enviar de novo" do chat (SendErrorBanner) reenvia o MESMO texto do mesmo
   * contato: a ação é a mesma, logo o id em memória também. Se a linha anterior
   * terminou em `failed` (falha definitiva), o enqueue devolve ELA de volta e o
   * `claim` do dispatch só aceita `sending` — o gateway responde 409 e o botão
   * nunca mais enviava. O reenvio precisa ser mensagem NOVA: id novo, linha nova,
   * com a falha anterior preservada no histórico.
   */
  it('reenvio depois de falha DEFINITIVA vira mensagem nova, com id novo (chat)', async () => {
    let sequencia = 0;
    vi.stubGlobal('crypto', { randomUUID: () => `id-novo-${++sequencia}` });

    const falhada = { id: 'e23ca9d2-99a8-45d2-a3fe-df344fb9b2dd', status: 'failed', external_id: null };
    const nova = { id: 'e23ca9d2-99a8-45d2-a3fe-df344fb9b2ee', status: 'sending', external_id: null };
    const fila = [falhada];
    rpc.mockImplementation(async () => ({ data: fila.shift() ?? nova, error: null }));
    // A linha falhada não pode mais ser reivindicada: o gateway responde 409, que
    // era exatamente o que prendia o botão "Enviar de novo".
    invoke.mockImplementation(async (_name: string, options: { body: { messageId: string } }) =>
      options.body.messageId === falhada.id
        ? { data: null, error: new Error('Message delivery is already in progress or cannot be sent') }
        : {
          data: { messageId: nova.id, status: 'sent', externalId: 'provider-novo', idempotent: false },
          error: null,
        });

    const input = { contactId: 'contato-falha-definitiva', content: 'mensagem que falhou de vez' };
    await expect(sendOutboundMessage(input)).resolves.toMatchObject({
      id: nova.id, status: 'sent', externalId: 'provider-novo',
    });

    const ids = rpc.mock.calls.map(([, args]) => args.p_client_message_id);
    expect(ids).toHaveLength(2);
    expect(ids[1]).not.toBe(ids[0]);
    expect(invoke).toHaveBeenCalledTimes(1);
    expect(invoke).toHaveBeenCalledWith('message-delivery', { body: { messageId: nova.id } });
  });

  it('resposta perdida do reenvio continua idempotente: a chave da ação passa para o id novo', async () => {
    let sequencia = 0;
    vi.stubGlobal('crypto', { randomUUID: () => `id-reenvio-${++sequencia}` });

    const falhada = { id: 'a1b2c3d4-99a8-45d2-a3fe-df344fb9b2dd', status: 'failed', external_id: null };
    const nova = { id: 'a1b2c3d4-99a8-45d2-a3fe-df344fb9b2ee', status: 'sending', external_id: null };
    const fila = [falhada];
    rpc.mockImplementation(async () => ({ data: fila.shift() ?? nova, error: null }));
    let entregas = 0;
    invoke.mockImplementation(async (_name: string, options: { body: { messageId: string } }) => {
      entregas += 1;
      if (entregas === 1) return { data: null, error: new Error('network timeout') };
      return {
        data: { messageId: options.body.messageId, status: 'sent', externalId: 'provider-reenvio', idempotent: true },
        error: null,
      };
    });

    const input = { contactId: 'contato-reenvio-perdido', content: 'reenvio sem resposta' };
    await expect(sendOutboundMessage(input)).rejects.toThrow('network timeout');
    await expect(sendOutboundMessage(input)).resolves.toMatchObject({ id: nova.id, idempotent: true });

    const ids = rpc.mock.calls.map(([, args]) => args.p_client_message_id);
    expect(ids).toHaveLength(3);
    expect(ids[1]).not.toBe(ids[0]);
    expect(ids[2]).toBe(ids[1]);
  });

  it('mensagem estruturada também reenvia com id novo depois de falha definitiva', async () => {
    let sequencia = 0;
    vi.stubGlobal('crypto', { randomUUID: () => `id-rich-${++sequencia}` });

    const falhada = { id: 'b1b2c3d4-99a8-45d2-a3fe-df344fb9b2dd', status: 'failed', external_id: null };
    const nova = { id: 'b1b2c3d4-99a8-45d2-a3fe-df344fb9b2ee', status: 'sending', external_id: null };
    const fila = [falhada];
    rpc.mockImplementation(async () => ({ data: fila.shift() ?? nova, error: null }));
    invoke.mockImplementation(async (_name: string, options: { body: { messageId: string } }) => ({
      data: { messageId: options.body.messageId, status: 'sent', externalId: 'provider-enquete', idempotent: false },
      error: null,
    }));

    await expect(sendRichOutboundMessage({
      contactId: 'contato-falha-definitiva',
      displayContent: '📊 *Enquete:* Cor',
      messageType: 'poll',
      deliveryPayload: { name: 'Cor', values: ['Azul'], selectableCount: 1 },
    })).resolves.toMatchObject({ id: nova.id, status: 'sent' });

    expect(rpc.mock.calls.map(([nome]) => nome)).toEqual([
      'enqueue_rich_outbound_message', 'enqueue_rich_outbound_message',
    ]);
    const ids = rpc.mock.calls.map(([, args]) => args.p_client_message_id);
    expect(ids[1]).not.toBe(ids[0]);
  });

  // Ponto 1+2 da recusa — o duplo clique concorrente depois de falha definitiva
  // gerava 2 ids novos (cada chamada girava o seu) e 2 WhatsApps. Quem chega
  // segundo agora adota o voo do dono: um id novo só e um dispatch só.
  it('duplo clique concorrente depois de falha definitiva: 1 id novo só e 1 dispatch', async () => {
    sendThrottle.reset();
    let sequencia = 0;
    vi.stubGlobal('crypto', { randomUUID: () => `concorrente-${++sequencia}` });
    const vistos: string[] = [];
    rpc.mockImplementation(async (_name: string, args: { p_client_message_id: string }) => {
      const id = args.p_client_message_id;
      if (!vistos.includes(id)) vistos.push(id);
      if (vistos.indexOf(id) === 0) {
        return { data: { id: `srv-${id}`, status: 'failed', external_id: null }, error: null };
      }
      return { data: { id: `srv-${id}`, status: 'sending', external_id: null }, error: null };
    });
    invoke.mockImplementation(async (_name: string, options: { body: { messageId: string } }) => ({
      data: { messageId: options.body.messageId, status: 'sent', externalId: 'provider-concorrente', idempotent: false },
      error: null,
    }));

    const input = { contactId: 'contato-concorrente', content: 'duplo enviar de novo' };
    const [primeiro, segundo] = await Promise.all([sendOutboundMessage(input), sendOutboundMessage(input)]);

    // Um id novo só além do antigo (o segundo não gera o seu).
    expect(vistos).toEqual(['concorrente-1', 'concorrente-2']);
    // Um dispatch só, para a linha nova — as duas chamadas resolvem nela.
    expect(invoke).toHaveBeenCalledTimes(1);
    expect(invoke).toHaveBeenCalledWith('message-delivery', { body: { messageId: 'srv-concorrente-2' } });
    expect(primeiro).toMatchObject({ id: 'srv-concorrente-2', status: 'sent' });
    expect(segundo).toMatchObject({ id: 'srv-concorrente-2', status: 'sent' });
  });

  // Ponto 4 da recusa — a drenagem offline de um item cuja linha já está
  // `failed` mantém o comportamento antigo: uma tentativa com o id original,
  // sem criar mensagem nova sozinha (a rotação offline é de cartão próprio).
  it('drenagem offline de linha já failed NÃO cria mensagem nova (comportamento antigo)', async () => {
    await offlineSendQueue.clear();
    sendThrottle.reset();
    vi.stubGlobal('crypto', { randomUUID: () => 'off-falha-1' });
    Object.defineProperty(navigator, 'onLine', { configurable: true, value: false });
    try {
      await expect(sendOutboundMessage({ contactId: 'contato-off-falha', content: 'caiu e falhou' }))
        .resolves.toMatchObject({ id: 'off-falha-1', status: 'pending' });
    } finally {
      delete (navigator as unknown as Record<string, unknown>).onLine;
    }

    rpc.mockClear();
    invoke.mockClear();
    rpc.mockResolvedValue({ data: { id: 'srv-off-falha', status: 'failed', external_id: null }, error: null });
    invoke.mockRejectedValue(new Error('Message delivery is already in progress or cannot be sent'));

    window.dispatchEvent(new Event('online'));
    await vi.waitFor(() => expect(rpc).toHaveBeenCalled());

    // Uma tentativa só, com o id original: sem rotação, sem linha nova.
    const ids = rpc.mock.calls.map(([, args]) => args.p_client_message_id);
    expect(ids).toEqual(['off-falha-1']);
    // A entrega falhou e o item continua na fila; limpa para os próximos casos.
    await offlineSendQueue.clear();
  });

  // Ponto 3 da recusa — o helper devolve o id efetivamente usado e a limpeza
  // confere a guarda: depois do reenvio com sucesso, o mesmo texto é ação nova
  // (se a limpeza usasse o id antigo, a chave vazaria e o id do reenvio seria
  // reaproveitado aqui).
  it('reenvio com sucesso limpa a chave com o id novo: o próximo texto igual é ação nova', async () => {
    sendThrottle.reset();
    let sequencia = 0;
    vi.stubGlobal('crypto', { randomUUID: () => `guarda-${++sequencia}` });
    const falhada = { id: 'srv-guarda-falha', status: 'failed', external_id: null };
    const nova = { id: 'srv-guarda-nova', status: 'sending', external_id: null };
    const fila = [falhada];
    rpc.mockImplementation(async () => ({ data: fila.shift() ?? nova, error: null }));
    invoke.mockImplementation(async (_name: string, options: { body: { messageId: string } }) => ({
      data: { messageId: options.body.messageId, status: 'sent', externalId: 'provider-guarda', idempotent: false },
      error: null,
    }));

    const input = { contactId: 'contato-guarda', content: 'texto repetido' };
    await expect(sendOutboundMessage(input)).resolves.toMatchObject({ id: nova.id });

    rpc.mockImplementation(async (_name: string, args: { p_client_message_id: string }) => ({
      data: { id: `srv-${args.p_client_message_id}`, status: 'sending', external_id: null }, error: null,
    }));
    await expect(sendOutboundMessage(input)).resolves.toMatchObject({ id: 'srv-guarda-3' });

    const ids = rpc.mock.calls.map(([, args]) => args.p_client_message_id);
    expect(ids).toEqual(['guarda-1', 'guarda-2', 'guarda-3']);
  });
});
