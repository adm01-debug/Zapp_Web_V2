/**
 * Robustez do envio de midia no inbox (itens 4 da rodada de robustez).
 *
 * 1) `resolveInstance` engolia o erro de leitura e devolvia '' — a mesma resposta
 *    de "sem conexao". Falha de rede virava ausencia de instancia.
 * 2) O auto-save de figurinha rodava num `.then(async ...)` sem catch: uma falha
 *    ali virava rejeicao nao tratada (o envio ja tinha acontecido).
 */
import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  contactsMaybeSingle: vi.fn(),
  connectionsMaybeSingle: vi.fn(),
  stickersMaybeSingle: vi.fn(),
  insertedStickers: [] as unknown[],
  getUser: vi.fn(),
  sendOutboundMessage: vi.fn(),
  toast: vi.fn(),
  logWarn: vi.fn(),
  logError: vi.fn(),
}));

function mediaChain(table: string) {
  const chain: Record<string, unknown> = {};
  chain.select = () => chain;
  chain.eq = () => chain;
  chain.limit = () => chain;
  chain.maybeSingle = () => {
    if (table === 'contacts') return mocks.contactsMaybeSingle();
    if (table === 'whatsapp_connections') return mocks.connectionsMaybeSingle();
    return mocks.stickersMaybeSingle();
  };
  chain.insert = (payload: unknown) => {
    mocks.insertedStickers.push(payload);
    return Promise.resolve({ error: null });
  };
  return chain;
}

vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    from: (table: string) => mediaChain(table),
    auth: { getUser: mocks.getUser },
  },
}));

vi.mock('@/lib/logger', () => ({
  log: { debug: vi.fn(), warn: mocks.logWarn, error: mocks.logError },

  getLogger: vi.fn(() => ({ error: vi.fn(), warn: vi.fn(), info: vi.fn(), debug: vi.fn(), withCorrelation: vi.fn(() => ({ error: vi.fn(), warn: vi.fn(), info: vi.fn(), debug: vi.fn() })) })),
  createLogger: vi.fn(() => ({ error: vi.fn(), warn: vi.fn(), info: vi.fn(), debug: vi.fn(), withCorrelation: vi.fn(() => ({ error: vi.fn(), warn: vi.fn(), info: vi.fn(), debug: vi.fn() })) })),
}));

vi.mock('@/hooks/ui/use-toast', () => ({ toast: mocks.toast }));

vi.mock('@/utils/normalizeMediaUrl', () => ({
  normalizeMediaUrl: (url: string) => url,
}));

vi.mock('@/services/outbound-message.service', () => ({
  sendOutboundMessage: mocks.sendOutboundMessage,
}));

import { useChatMediaSending } from '@/components/inbox/useChatMediaSending';

function render() {
  return renderHook(() => useChatMediaSending('contato-1', '+5511999999999'));
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.insertedStickers.length = 0;
  mocks.contactsMaybeSingle.mockResolvedValue({
    data: { whatsapp_connection_id: 'conn-1' },
    error: null,
  });
  mocks.connectionsMaybeSingle.mockResolvedValue({
    data: { instance_id: 'instancia-1' },
    error: null,
  });
  mocks.stickersMaybeSingle.mockResolvedValue({ data: { id: 'sticker-existente' }, error: null });
  mocks.sendOutboundMessage.mockResolvedValue(undefined);
  mocks.getUser.mockResolvedValue({ data: { user: { id: 'user-1' } } });
});

describe('useChatMediaSending — resolveInstance propaga o erro', () => {
  it('rejeita quando a leitura do contato falha (antes: devolvia "")', async () => {
    mocks.contactsMaybeSingle.mockRejectedValue(new Error('rede fora'));

    const { result } = render();

    await expect(result.current.resolveInstance()).rejects.toThrow('rede fora');
    expect(mocks.logError).toHaveBeenCalledWith(
      'Failed to resolve WhatsApp instance:',
      expect.any(Error),
    );
  });
});

describe('useChatMediaSending — auto-save de figurinha', () => {
  it('falha no auto-save nao vira rejeicao nao tratada e o envio segue confirmado', async () => {
    mocks.stickersMaybeSingle.mockRejectedValue(new Error('auto-save caiu'));

    const { result } = render();

    await act(async () => {
      await result.current.handleSendSticker('https://cdn.test/figurinha.webp');
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(mocks.sendOutboundMessage).toHaveBeenCalledTimes(1);
    expect(mocks.toast).toHaveBeenCalledWith({ title: 'Figurinha enviada!' });
    expect(mocks.logWarn).toHaveBeenCalledWith(
      'Nao foi possivel salvar a figurinha enviada:',
      expect.any(Error),
    );
  });

  it('erro de leitura no auto-save e registrado sem tentar inserir', async () => {
    mocks.stickersMaybeSingle.mockResolvedValue({
      data: null,
      error: new Error('select negado'),
    });

    const { result } = render();

    await act(async () => {
      await result.current.handleSendSticker('https://cdn.test/figurinha.webp');
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(mocks.insertedStickers).toHaveLength(0);
    expect(mocks.logWarn).toHaveBeenCalledWith(
      'Nao foi possivel verificar a figurinha enviada:',
      expect.any(Error),
    );
  });
});
