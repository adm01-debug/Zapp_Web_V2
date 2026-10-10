import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';

const mocks = vi.hoisted(() => ({
  sendOutboundMessage: vi.fn(),
  forwardMediaMessages: vi.fn(),
  toast: vi.fn(),
  openDialog: vi.fn(),
  closeDialog: vi.fn(),
  onOpenChange: vi.fn(),
}));

// Cliente Supabase: cadeia genérica que devolve listas vazias (contatos/grupos do diálogo).
vi.mock('@/integrations/supabase/client', () => {
  const chain: Record<string, unknown> = {};
  chain.select = vi.fn(() => chain);
  chain.eq = vi.fn(() => chain);
  chain.update = vi.fn(() => chain);
  chain.order = vi.fn(() => Promise.resolve({ data: [], error: null }));
  chain.maybeSingle = vi.fn(() => Promise.resolve({ data: null, error: null }));
  chain.single = vi.fn(() => Promise.resolve({ data: null, error: null }));
  chain.then = (resolve: (value: unknown) => void, reject?: (e: unknown) => void) =>
    Promise.resolve({ data: [], error: null }).then(resolve, reject);
  return {
    supabase: {
      from: vi.fn(() => chain),
      auth: { getUser: vi.fn(async () => ({ data: { user: null } })) },
    },
  };
});

vi.mock('@/services/outbound-message.service', () => ({
  sendOutboundMessage: mocks.sendOutboundMessage,
}));

// Só o transporte de mídia é substituído: o resto (createForwardRunState etc.) fica real.
vi.mock('@/hooks/chat/useForwardMedia', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/hooks/chat/useForwardMedia')>();
  return { ...actual, forwardMediaMessages: mocks.forwardMediaMessages };
});

vi.mock('@/hooks/chat/useConversationActions', () => ({
  useConversationActions: () => ({
    isFavorite: () => false,
    favoriteContact: vi.fn(),
    unfavoriteContact: vi.fn(),
    snoozeConversation: vi.fn(),
  }),
}));

vi.mock('@/hooks/tasks/useMyWorkItems', () => ({
  useMyWorkItems: () => ({ createAndGetId: vi.fn(async () => null) }),
  tomorrowAtNine: () => new Date(),
}));

vi.mock('@/hooks/system/useNavigationHistory', () => ({ navigateToView: vi.fn() }));
vi.mock('@/hooks/ui/use-toast', () => ({ toast: mocks.toast }));
vi.mock('@/lib/logger', () => ({
  log: { debug: vi.fn(), error: vi.fn(), warn: vi.fn(), info: vi.fn() },
}));

import { useChatPanelHandlers } from '@/components/inbox/chat/useChatPanelHandlers';
import { useForwardMessage, type ForwardCallback } from '@/hooks/chat/useForwardMessage';
import type { ForwardResult } from '@/hooks/chat/useForwardMedia';
import type { Message } from '@/types/chat';

function chatMessage(overrides: Partial<Message> = {}): Message {
  return {
    id: 'msg-1',
    content: 'Promoção de outubro',
    sender: 'contact',
    timestamp: new Date('2026-10-05T12:00:00Z'),
    type: 'text',
    ...overrides,
  } as Message;
}

function forwardResult(ids: string[], okIds: string[] = ids, itemId = 'chat-msg'): ForwardResult {
  const pairOutcomes = ids.map((targetId) => ({
    itemId,
    targetId,
    targetType: 'contact' as const,
    ok: okIds.includes(targetId),
    ...(okIds.includes(targetId) ? {} : { error: 'falhou' }),
  }));
  const sent = pairOutcomes.filter((outcome) => outcome.ok).length;
  return { pairOutcomes, nonForwardable: [], attempted: pairOutcomes.length, sent, failed: pairOutcomes.length - sent };
}

function renderChatHandlers() {
  return renderHook(() => useChatPanelHandlers({
    conversationId: 'conv-1',
    contactId: 'conv-contact',
    contactPhone: '5511999999999',
    instanceName: 'inst-1',
    onSendMessage: vi.fn(),
    editMessageApi: vi.fn(),
    applySignature: (text: string) => text,
    handleTypingStart: vi.fn(),
    handleTypingStop: vi.fn(),
    openDialog: mocks.openDialog,
    closeDialog: mocks.closeDialog,
    handleSetActiveTool: vi.fn(),
  }));
}

describe('handleForwardToTargets (caminho do chat) — transporte real', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.sendOutboundMessage.mockResolvedValue({ id: 'sent-1', status: 'sent', externalId: 'ext-1', idempotent: false });
  });

  it('texto: sendOutboundMessage uma vez por contato, com o conteúdo original e o destino certo', async () => {
    const { result } = renderChatHandlers();
    act(() => { result.current.handleForwardMessage(chatMessage({ id: 'msg-text' })); });

    let forwarded: ForwardResult | undefined;
    await act(async () => {
      forwarded = await result.current.handleForwardToTargets(['dest-1', 'dest-2'], 'contact');
    });

    expect(mocks.sendOutboundMessage).toHaveBeenCalledTimes(2);
    expect(mocks.sendOutboundMessage).toHaveBeenNthCalledWith(1, expect.objectContaining({
      contactId: 'dest-1', content: 'Promoção de outubro', messageType: 'text',
    }));
    expect(mocks.sendOutboundMessage).toHaveBeenNthCalledWith(2, expect.objectContaining({
      contactId: 'dest-2', content: 'Promoção de outubro', messageType: 'text',
    }));
    expect(forwarded?.attempted).toBe(2);
    expect(forwarded?.sent).toBe(2);
    expect(forwarded?.failed).toBe(0);
  });

  it('texto: falha parcial preserva o destino que falhou, sem marcar sucesso total', async () => {
    mocks.sendOutboundMessage
      .mockResolvedValueOnce({ id: 'ok', status: 'sent', externalId: 'e', idempotent: false })
      .mockRejectedValueOnce(new Error('sem conexão'));
    const { result } = renderChatHandlers();
    act(() => { result.current.handleForwardMessage(chatMessage({ id: 'msg-text' })); });

    let forwarded: ForwardResult | undefined;
    await act(async () => {
      forwarded = await result.current.handleForwardToTargets(['dest-1', 'dest-2'], 'contact');
    });

    expect(forwarded?.sent).toBe(1);
    expect(forwarded?.failed).toBe(1);
    expect(forwarded?.pairOutcomes[1]).toMatchObject({ targetId: 'dest-2', ok: false, error: 'sem conexão' });
  });

  it('grupo: falha explícita por destino e nenhum transporte', async () => {
    const { result } = renderChatHandlers();
    act(() => { result.current.handleForwardMessage(chatMessage()); });

    let forwarded: ForwardResult | undefined;
    await act(async () => {
      forwarded = await result.current.handleForwardToTargets(['grp-1', 'grp-2'], 'group');
    });

    expect(mocks.sendOutboundMessage).not.toHaveBeenCalled();
    expect(mocks.forwardMediaMessages).not.toHaveBeenCalled();
    expect(forwarded?.failed).toBe(2);
    expect(forwarded?.sent).toBe(0);
    for (const outcome of forwarded!.pairOutcomes) expect(outcome.error).toMatch(/grupos/);
  });

  it('forma sem representação segura (sticker): falha por destino, sem transporte', async () => {
    const { result } = renderChatHandlers();
    act(() => { result.current.handleForwardMessage(chatMessage({ id: 'msg-sticker', type: 'sticker' })); });

    let forwarded: ForwardResult | undefined;
    await act(async () => {
      forwarded = await result.current.handleForwardToTargets(['dest-1'], 'contact');
    });

    expect(mocks.sendOutboundMessage).not.toHaveBeenCalled();
    expect(forwarded?.failed).toBe(1);
    expect(forwarded?.pairOutcomes[0].error).toMatch(/não podem ser encaminhadas/);
  });

  it('mídia sem arquivo de origem: falha por destino, sem transporte', async () => {
    const { result } = renderChatHandlers();
    act(() => { result.current.handleForwardMessage(chatMessage({ id: 'msg-img', type: 'image', mediaUrl: undefined })); });

    let forwarded: ForwardResult | undefined;
    await act(async () => {
      forwarded = await result.current.handleForwardToTargets(['dest-1'], 'contact');
    });

    expect(mocks.sendOutboundMessage).not.toHaveBeenCalled();
    expect(mocks.forwardMediaMessages).not.toHaveBeenCalled();
    expect(forwarded?.failed).toBe(1);
    expect(forwarded?.pairOutcomes[0].error).toMatch(/sem arquivo de origem/);
  });

  it('mídia com mediaUrl: delega para forwardMediaMessages com o item e os destinos corretos', async () => {
    const mediaResult = forwardResult(['dest-1'], ['dest-1'], 'msg-img');
    mocks.forwardMediaMessages.mockResolvedValue(mediaResult);
    const { result } = renderChatHandlers();
    act(() => {
      result.current.handleForwardMessage(chatMessage({
        id: 'msg-img',
        type: 'image',
        mediaUrl: 'https://proj.supabase.co/storage/v1/object/public/whatsapp-media/contato/origem.png',
        media_filename: 'foto.png',
        caption: 'legenda',
      }));
    });

    const progress = vi.fn();
    let forwarded: ForwardResult | undefined;
    await act(async () => {
      forwarded = await result.current.handleForwardToTargets(['dest-1', 'dest-2'], 'contact', progress);
    });

    expect(mocks.sendOutboundMessage).not.toHaveBeenCalled();
    expect(mocks.forwardMediaMessages).toHaveBeenCalledTimes(1);
    const [items, targets, options] = mocks.forwardMediaMessages.mock.calls[0];
    expect(items).toEqual([{
      id: 'msg-img',
      url: 'https://proj.supabase.co/storage/v1/object/public/whatsapp-media/contato/origem.png',
      type: 'image',
      filename: 'foto.png',
      caption: 'legenda',
    }]);
    expect(targets).toEqual([{ id: 'dest-1', type: 'contact' }, { id: 'dest-2', type: 'contact' }]);
    expect(options.onProgress).toBe(progress);
    expect(options.state).toBeDefined();
    expect(forwarded).toBe(mediaResult);
  });
});

describe('useForwardMessage — fechamento só com sucesso e retry idempotente', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.forwardMediaMessages.mockReset();
  });

  async function renderForward(onForward: ForwardCallback) {
    const rendered = renderHook(() => useForwardMessage({
      open: true,
      allowGroups: true,
      onForward,
      onOpenChange: mocks.onOpenChange,
    }));
    // fetch de contatos/grupos do diálogo assenta antes das asserções.
    await act(async () => { await Promise.resolve(); });
    return rendered;
  }

  it('callback que não devolve resultado (void) não fecha como sucesso nem anuncia entrega', async () => {
    const legacy = vi.fn(async () => undefined) as unknown as ForwardCallback;
    const { result } = await renderForward(legacy);
    act(() => { result.current.toggleContact('c1'); });

    await act(async () => { await result.current.handleForward(); });

    expect(legacy).toHaveBeenCalledTimes(1);
    expect(mocks.onOpenChange).not.toHaveBeenCalled();
    expect(mocks.toast).not.toHaveBeenCalledWith(expect.objectContaining({ title: 'Mensagem encaminhada!' }));
  });

  it('sucesso total fecha o diálogo; parcial mantém aberto e preserva o que falhou', async () => {
    const onForward = vi.fn(async (ids: string[]) => forwardResult(ids, ['c1']));
    const { result } = await renderForward(onForward);
    act(() => { result.current.toggleContact('c1'); result.current.toggleContact('c2'); });

    await act(async () => { await result.current.handleForward(); });

    expect(mocks.onOpenChange).not.toHaveBeenCalled();
    expect(result.current.failedTargets.map((target) => target.id)).toEqual(['c2']);
    expect(mocks.toast).toHaveBeenCalledWith(expect.objectContaining({ title: 'Encaminhamento parcial' }));

    // Retry: só o destino que falhou volta ao transporte; o concluído (c1) não é reenviado.
    onForward.mockImplementation(async (ids: string[]) => forwardResult(ids, ids));
    await act(async () => { await result.current.retryFailed(); });

    expect(onForward).toHaveBeenCalledTimes(2);
    expect(onForward.mock.calls[0][0]).toEqual(['c1', 'c2']);
    expect(onForward.mock.calls[1][0]).toEqual(['c2']);
    expect(mocks.onOpenChange).toHaveBeenCalledWith(false);
  });
});
