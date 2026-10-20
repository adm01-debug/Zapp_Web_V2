/**
 * R2-INB-058 (#350-A) — contrato de retorno dos handlers de envio de áudio do inbox.
 *
 * O componente chamador só fica sabendo que o envio falhou se o handler disser. Aqui os hooks são
 * os REAIS (`renderHook`) e só a fronteira externa é mockada: `sendOutboundMessage` (transporte) e
 * o `onSendAudio` recebido (a ponte que grava no bucket e chama o transporte).
 *
 *   `useChatMediaSending.handleSendAudioMeme` (consumido pelo `onSendAudio` do VoiceChangerPicker/
 *   AudioMemePicker no ChatPanel)
 *     - REJEITA quando a conexão WhatsApp não resolve (`ensureInstance` → null)      [vermelho antes]
 *     - REJEITA quando `sendOutboundMessage` rejeita                                 [vermelho antes]
 *     - RESOLVE quando o envio confirma                                              [regressão]
 *
 *   `useChatPanelHandlers.handleAudioSend` (ponte do `onAudioReady`/`onAudioSend` do composer)
 *     - devolve `true` quando o envio confirma
 *     - devolve `false` quando o `onSendAudio` recebido rejeita
 *     - devolve `false` quando não há `onSendAudio` configurado
 */
import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const h = vi.hoisted(() => ({
  from: vi.fn(),
  toast: vi.fn(),
  sendOutboundMessage: vi.fn(),
}));

vi.mock('@/lib/logger', () => ({ log: { debug: vi.fn(), warn: vi.fn(), error: vi.fn() } }));
vi.mock('@/integrations/supabase/client', () => ({ supabase: { from: h.from } }));
vi.mock('@/hooks/ui/use-toast', () => ({ toast: h.toast }));
vi.mock('@/services/outbound-message.service', () => ({ sendOutboundMessage: h.sendOutboundMessage }));
vi.mock('@/lib/undoToast', () => ({ undoToast: vi.fn() }));
vi.mock('@/lib/ai-vocabulary', () => ({ normalizeOperationalPriority: vi.fn() }));
vi.mock('@/hooks/chat/useConversationActions', () => ({
  useConversationActions: () => ({
    isFavorite: () => false,
    favoriteContact: vi.fn(),
    unfavoriteContact: vi.fn(),
    snoozeConversation: vi.fn(),
  }),
}));
vi.mock('@/hooks/tasks/useMyWorkItems', () => ({
  useMyWorkItems: () => ({ createAndGetId: vi.fn() }),
  tomorrowAtNine: () => new Date(),
}));
vi.mock('@/hooks/system/useNavigationHistory', () => ({ navigateToView: vi.fn() }));

import { useChatMediaSending } from '../../useChatMediaSending';
import { useChatPanelHandlers } from '../useChatPanelHandlers';

const AUDIO_URL = 'https://projeto.supabase.co/storage/v1/object/public/audio-memes/meme.mp3';
const PHONE = '+5511999999999';

/** Cadeia PostgREST mínima: `from(...).select(...).eq(...).limit(...).maybeSingle()`. */
function chainOf(...results: Array<{ data: unknown }>) {
  const maybeSingle = vi.fn();
  for (const result of results) maybeSingle.mockResolvedValueOnce(result);
  const chain = {
    select: vi.fn(() => chain),
    eq: vi.fn(() => chain),
    limit: vi.fn(() => chain),
    maybeSingle,
  };
  return chain;
}

/** Conexão resolvida: contato aponta para a conexão, que aponta para a instância. */
function chainComInstancia() {
  return chainOf(
    { data: { whatsapp_connection_id: 'conn-1' } },
    { data: { instance_id: 'inst-1' } },
  );
}

/** Roda a chamada e captura a rejeição sem deixar Promise solta. */
async function capturarErro(run: () => Promise<unknown>): Promise<unknown> {
  let capturado: unknown = null;
  await act(async () => {
    try {
      await run();
    } catch (err) {
      capturado = err;
    }
  });
  return capturado;
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('useChatMediaSending.handleSendAudioMeme — rejeita em falha, resolve só no envio confirmado', () => {
  it('rejeita quando a conexão WhatsApp não resolve (ensureInstance devolve null)', async () => {
    h.from.mockReturnValue(chainOf({ data: null }, { data: null }));
    const { result } = renderHook(() => useChatMediaSending('contact-1', PHONE));

    const erro = await capturarErro(() => result.current.handleSendAudioMeme(AUDIO_URL));

    expect(erro).toBeInstanceOf(Error);
    expect((erro as Error).message).toBe('Conexão WhatsApp não disponível.');
    expect(h.sendOutboundMessage).not.toHaveBeenCalled();
    expect(h.toast).toHaveBeenCalledWith(expect.objectContaining({ description: 'Conexão WhatsApp não disponível.' }));
  });

  it('rejeita quando o transporte rejeita, depois do toast de erro', async () => {
    h.from.mockReturnValue(chainComInstancia());
    h.sendOutboundMessage.mockRejectedValueOnce(new Error('transporte fora do ar'));
    const { result } = renderHook(() => useChatMediaSending('contact-1', PHONE));

    const erro = await capturarErro(() => result.current.handleSendAudioMeme(AUDIO_URL));

    expect(erro).toBeInstanceOf(Error);
    expect((erro as Error).message).toBe('transporte fora do ar');
    expect(h.toast).toHaveBeenCalledWith(
      expect.objectContaining({ title: 'Erro ao enviar áudio meme', variant: 'destructive' }),
    );
    expect(h.toast).not.toHaveBeenCalledWith(
      expect.objectContaining({ title: '🔊 Áudio meme enviado!' }),
    );
  });

  it('resolve quando o envio confirma e manda o áudio pelo transporte canônico', async () => {
    h.from.mockReturnValue(chainComInstancia());
    h.sendOutboundMessage.mockResolvedValueOnce({ ok: true });
    const { result } = renderHook(() => useChatMediaSending('contact-1', PHONE));

    const erro = await capturarErro(() => result.current.handleSendAudioMeme(`  ${AUDIO_URL}  `));

    expect(erro).toBeNull();
    expect(h.sendOutboundMessage).toHaveBeenCalledTimes(1);
    expect(h.sendOutboundMessage).toHaveBeenCalledWith({
      contactId: 'contact-1',
      content: '[Áudio Meme]',
      messageType: 'audio',
      mediaUrl: AUDIO_URL,
    });
    expect(h.toast).toHaveBeenCalledWith(expect.objectContaining({ title: '🔊 Áudio meme enviado!' }));
  });
});

describe('useChatPanelHandlers.handleAudioSend — devolve boolean, nunca sucesso silencioso', () => {
  const baseOpts = {
    conversationId: 'conv-1',
    contactId: 'contact-1',
    contactPhone: PHONE,
    instanceName: 'inst-1',
    onSendMessage: vi.fn(),
    editMessageApi: vi.fn(),
    applySignature: (t: string) => t,
    handleTypingStart: vi.fn(),
    handleTypingStop: vi.fn(),
    openDialog: vi.fn(),
    closeDialog: vi.fn(),
    handleSetActiveTool: vi.fn(),
  };

  const blob = new Blob(['audio'], { type: 'audio/webm' });

  it('devolve true quando o envio confirma', async () => {
    const { result } = renderHook(() => useChatPanelHandlers(baseOpts));

    let retorno: unknown;
    await act(async () => {
      retorno = await result.current.handleAudioSend(blob, vi.fn().mockResolvedValue(true));
    });

    expect(retorno).toBe(true);
  });

  it('devolve false quando o onSendAudio recebido rejeita', async () => {
    const { result } = renderHook(() => useChatPanelHandlers(baseOpts));

    let retorno: unknown;
    await act(async () => {
      retorno = await result.current.handleAudioSend(blob, vi.fn().mockRejectedValue(new Error('upload falhou')));
    });

    expect(retorno).toBe(false);
    expect(h.toast).toHaveBeenCalledWith(expect.objectContaining({ title: 'Erro ao enviar áudio' }));
  });

  it('devolve false quando não há onSendAudio configurado', async () => {
    const { result } = renderHook(() => useChatPanelHandlers(baseOpts));

    let retorno: unknown;
    await act(async () => {
      retorno = await result.current.handleAudioSend(blob);
    });

    expect(retorno).toBe(false);
    expect(h.toast).toHaveBeenCalledWith(expect.objectContaining({ description: 'Envio de áudio não configurado.' }));
  });
});
