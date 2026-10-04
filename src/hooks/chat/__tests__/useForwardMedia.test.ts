import { describe, it, expect, vi, beforeEach } from 'vitest';
import { SUPABASE_URL } from '@/config/supabase';
import {
  createForwardRunState,
  forwardMediaMessages,
  type ForwardMediaItem,
  type ForwardTarget,
} from '../useForwardMedia';

const mocks = vi.hoisted(() => ({
  storageFrom: vi.fn(),
  copy: vi.fn(),
  getPublicUrl: vi.fn(),
  remove: vi.fn(),
  tableFrom: vi.fn(),
  sendOutboundMessage: vi.fn(),
}));

vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    storage: { from: mocks.storageFrom },
    from: mocks.tableFrom,
  },
}));

vi.mock('@/services/outbound-message.service', () => ({
  sendOutboundMessage: mocks.sendOutboundMessage,
}));

function locator(bucket: string, path: string): string {
  return `${SUPABASE_URL}/storage/v1/object/public/${bucket}/${path}`;
}

function reconcileChain(result: { data: unknown; error: unknown }) {
  const chain = {
    select: () => chain,
    eq: () => chain,
    limit: () => Promise.resolve(result),
  };
  return chain;
}

function item(overrides: Partial<ForwardMediaItem> & { id: string }): ForwardMediaItem {
  return {
    url: locator('whatsapp-media', `origem/${overrides.id}.jpg`),
    type: 'image',
    filename: `${overrides.id}.png`,
    caption: null,
    ...overrides,
  };
}

const TARGETS: ForwardTarget[] = [
  { id: 'target-1', type: 'contact' },
  { id: 'target-2', type: 'contact' },
];

beforeEach(() => {
  vi.clearAllMocks();
  mocks.storageFrom.mockImplementation((bucket: string) => ({
    copy: (from: string, to: string) => mocks.copy(from, to),
    getPublicUrl: (path: string) => mocks.getPublicUrl(bucket, path),
    remove: (paths: string[]) => mocks.remove(bucket, paths),
  }));
  mocks.copy.mockResolvedValue({ error: null });
  mocks.getPublicUrl.mockImplementation((bucket: string, path: string) => ({
    data: { publicUrl: locator(bucket, path) },
  }));
  mocks.remove.mockResolvedValue({ error: null });
  mocks.sendOutboundMessage.mockResolvedValue({ id: 'msg-1', status: 'sent', externalId: 'ext-1', idempotent: false });
  mocks.tableFrom.mockReturnValue(reconcileChain({ data: [], error: null }));
});

describe('forwardMediaMessages — etapa 36: copia por par e locator do path copiado', () => {
  it('2 arquivos x 2 destinos = 4 copias e 4 envios, mediaUrl = getPublicUrl do path copiado', async () => {
    const items = [item({ id: 'i1' }), item({ id: 'i2', type: 'document', filename: 'contrato.pdf' })];
    const result = await forwardMediaMessages(items, TARGETS);

    expect(result.attempted).toBe(4);
    expect(result.sent).toBe(4);
    expect(result.failed).toBe(0);
    expect(mocks.copy).toHaveBeenCalledTimes(4);
    expect(mocks.sendOutboundMessage).toHaveBeenCalledTimes(4);

    // Ordem arquivo x destino: i1->t1, i1->t2, i2->t1, i2->t2.
    const copyDestinations = mocks.copy.mock.calls.map(([, to]) => to as string);
    expect(copyDestinations[0].startsWith('target-1/')).toBe(true);
    expect(copyDestinations[1].startsWith('target-2/')).toBe(true);

    for (const [call] of mocks.sendOutboundMessage.mock.calls) {
      const index = mocks.sendOutboundMessage.mock.calls.findIndex((entry) => entry[0] === call);
      const destination = copyDestinations[index];
      expect(call.mediaUrl).toBe(locator('whatsapp-media', destination));
      expect(call.mediaUrl).not.toBe(items[0].url);
    }
    // servidor copia (copy), nunca baixa e reenvia (upload/download).
    for (const [bucket] of mocks.storageFrom.mock.calls) expect(bucket).toBe('whatsapp-media');
  });

  it('item de áudio copia e gera locator no bucket audio-messages', async () => {
    const audio = item({ id: 'a1', type: 'audio', filename: 'nota.ogg', url: locator('audio-messages', 'audio/a1.ogg') });
    await forwardMediaMessages([audio], [{ id: 'target-1', type: 'contact' }]);

    const buckets = mocks.storageFrom.mock.calls.map(([bucket]) => bucket as string);
    expect(buckets).toContain('audio-messages');
    expect(buckets).not.toContain('whatsapp-media');
    const [, destination] = mocks.copy.mock.calls[0];
    expect(String(destination).startsWith('target-1/')).toBe(true);
    expect(mocks.getPublicUrl).toHaveBeenCalledWith('audio-messages', destination);
    expect(mocks.sendOutboundMessage).toHaveBeenCalledWith(expect.objectContaining({
      mediaUrl: locator('audio-messages', destination as string),
      messageType: 'audio',
    }));
  });

  it('item não resolvível é marcado como não encaminhável e NÃO tenta copiar', async () => {
    const bad = item({ id: 'bad', url: 'https://example.com/nao-e-storage.jpg' });
    const good = item({ id: 'good' });
    const result = await forwardMediaMessages([bad, good], [{ id: 'target-1', type: 'contact' }]);

    expect(result.nonForwardable).toHaveLength(1);
    expect(result.nonForwardable[0].itemId).toBe('bad');
    expect(result.nonForwardable[0].reason).toMatch(/bucket privado/);
    expect(mocks.copy).toHaveBeenCalledTimes(1);
    expect(mocks.sendOutboundMessage).toHaveBeenCalledTimes(1);
    expect(result.attempted).toBe(1);
  });

  it('destino de grupo falha com motivo e não copia nem envia', async () => {
    const result = await forwardMediaMessages([item({ id: 'i1' })], [{ id: 'g1', type: 'group' }]);
    expect(result.failed).toBe(1);
    expect(result.pairOutcomes[0].error).toMatch(/grupos/);
    expect(mocks.copy).not.toHaveBeenCalled();
    expect(mocks.sendOutboundMessage).not.toHaveBeenCalled();
  });
});

describe('forwardMediaMessages — etapa 36: limpeza honesta do objeto copiado', () => {
  it('envio rejeitado e reconciliação com ZERO linhas → remove o path copiado daquele par e só ele', async () => {
    mocks.sendOutboundMessage.mockRejectedValueOnce(new Error('send_messages_permission_required'));
    mocks.tableFrom.mockReturnValue(reconcileChain({ data: [], error: null }));

    const result = await forwardMediaMessages([item({ id: 'i1' })], [{ id: 'target-1', type: 'contact' }]);

    expect(result.failed).toBe(1);
    const [, destination] = mocks.copy.mock.calls[0];
    expect(mocks.remove).toHaveBeenCalledTimes(1);
    expect(mocks.remove).toHaveBeenCalledWith('whatsapp-media', [destination]);
    expect(mocks.tableFrom).toHaveBeenCalledWith('messages');
  });

  it('reconciliação encontra a linha → o objeto FICA (nenhum remove)', async () => {
    mocks.sendOutboundMessage.mockRejectedValueOnce(new Error('delivery indisponível'));
    mocks.tableFrom.mockReturnValue(reconcileChain({ data: [{ id: 'msg-1' }], error: null }));

    await forwardMediaMessages([item({ id: 'i1' })], [{ id: 'target-1', type: 'contact' }]);
    expect(mocks.remove).not.toHaveBeenCalled();
  });

  it('reconciliação falhando (estado indeterminado) → o objeto FICA', async () => {
    mocks.sendOutboundMessage.mockRejectedValueOnce(new Error('delivery indisponível'));
    mocks.tableFrom.mockReturnValue(reconcileChain({ data: null, error: { message: 'rls' } }));

    await forwardMediaMessages([item({ id: 'i1' })], [{ id: 'target-1', type: 'contact' }]);
    expect(mocks.remove).not.toHaveBeenCalled();
  });

  it('falha de cópia → sem envio e sem remove (nada foi copiado)', async () => {
    mocks.copy.mockResolvedValueOnce({ error: { message: 'policy' } });
    const result = await forwardMediaMessages([item({ id: 'i1' })], [{ id: 'target-1', type: 'contact' }]);
    expect(result.failed).toBe(1);
    expect(mocks.sendOutboundMessage).not.toHaveBeenCalled();
    expect(mocks.remove).not.toHaveBeenCalled();
  });
});

describe('forwardMediaMessages — etapa 38: retry não repete o que já foi enviado', () => {
  it('7 envios com 2 falhas → retry dispara exatamente 2', async () => {
    const items = Array.from({ length: 7 }, (_, i) => item({ id: `i${i}`, filename: `f${i}.png` }));
    const target: ForwardTarget = { id: 'target-1', type: 'contact' };

    const failedOnce = new Set<string>();
    mocks.sendOutboundMessage.mockImplementation((input: { mediaUrl: string }) => {
      const filename = input.mediaUrl.split('/').pop() ?? '';
      const key = filename.includes('f2.png') ? 'f2' : filename.includes('f5.png') ? 'f5' : null;
      if (key && !failedOnce.has(key)) {
        failedOnce.add(key);
        return Promise.reject(new Error('boom'));
      }
      return Promise.resolve({ id: 'msg', status: 'sent', externalId: null, idempotent: false });
    });
    mocks.tableFrom.mockReturnValue(reconcileChain({ data: [], error: null }));

    const state = createForwardRunState();
    const progress: Array<{ done: number; total: number }> = [];
    const first = await forwardMediaMessages(items, [target], { state, onProgress: (done, total) => progress.push({ done, total }) });

    expect(first.sent).toBe(5);
    expect(first.failed).toBe(2);
    expect(mocks.sendOutboundMessage).toHaveBeenCalledTimes(7);
    expect(progress[0]).toEqual({ done: 0, total: 7 });
    expect(progress[progress.length - 1]).toEqual({ done: 7, total: 7 });

    // Retry: só os 2 pares que falharam voltam a ser tentados.
    const second = await forwardMediaMessages(items, [target], { state });
    expect(second.attempted).toBe(2);
    expect(second.sent).toBe(2);
    expect(mocks.sendOutboundMessage).toHaveBeenCalledTimes(9);
  });

  it('retry reaproveita o objeto copiado quando ele ficou no Storage (falha de entrega)', async () => {
    const target: ForwardTarget = { id: 'target-1', type: 'contact' };
    mocks.sendOutboundMessage
      .mockRejectedValueOnce(new Error('delivery indisponível'))
      .mockResolvedValueOnce({ id: 'msg', status: 'sent', externalId: null, idempotent: false });
    // Linha encontrada na reconciliação → objeto mantido.
    mocks.tableFrom.mockReturnValue(reconcileChain({ data: [{ id: 'msg-1' }], error: null }));

    const state = createForwardRunState();
    await forwardMediaMessages([item({ id: 'i1' })], [target], { state });
    expect(mocks.copy).toHaveBeenCalledTimes(1);
    expect(mocks.remove).not.toHaveBeenCalled();

    await forwardMediaMessages([item({ id: 'i1' })], [target], { state });
    // Não recopiou: o objeto do primeiro envio foi reaproveitado.
    expect(mocks.copy).toHaveBeenCalledTimes(1);
    expect(mocks.sendOutboundMessage).toHaveBeenCalledTimes(2);
  });
});
