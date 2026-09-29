import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { ReactNode } from 'react';
import { renderHook, act } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import {
  useSendToContact, openContactChat, PHOTO_MIN_INTERVAL_MS, PHOTO_INTERVAL_JITTER_MS,
} from '../useSendProduct';
import { CATALOG_SEND_EVENTS_KEY } from '@/hooks/integrations/useCatalogRecentSends';

const mockSendOutboundMessage = vi.hoisted(() => vi.fn());
vi.mock('@/services/outbound-message.service', () => ({
  sendOutboundMessage: (...args: unknown[]) => mockSendOutboundMessage(...args),
}));

const mockLogCatalogSendEvent = vi.hoisted(() => vi.fn());
vi.mock('@/hooks/integrations/useCatalogContactSearch', () => ({
  fetchCatalogContactResults: vi.fn(),
  logCatalogSendEvent: (...args: unknown[]) => mockLogCatalogSendEvent(...args),
}));

// CT-06 — o módulo usa `sonner` (não `use-toast`) depois desta etapa.
const sonnerToast = vi.hoisted(() => ({ success: vi.fn(), warning: vi.fn(), error: vi.fn() }));
vi.mock('sonner', () => ({ toast: sonnerToast }));

const mockNavigateToView = vi.hoisted(() => vi.fn());
vi.mock('@/hooks/system/useNavigationHistory', () => ({
  navigateToView: (...args: unknown[]) => mockNavigateToView(...args),
}));

let queryClient: QueryClient;

function wrapper({ children }: { children: ReactNode }) {
  return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
}

const resetSendMocks = () => {
  queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  mockSendOutboundMessage.mockReset();
  mockLogCatalogSendEvent.mockReset();
  mockLogCatalogSendEvent.mockResolvedValue(undefined);
  sonnerToast.success.mockReset();
  sonnerToast.warning.mockReset();
  sonnerToast.error.mockReset();
  mockNavigateToView.mockReset();
};

const CONTACT = { id: 'c1', name: 'Cliente Teste', phone: '5511999999999', avatar_url: null };

describe('useSendToContact — CT-04: caption na primeira foto, texto só sem foto', () => {
  beforeEach(resetSendMocks);

  it('3 fotos viram 3 mensagens (não 4), só a primeira com o texto como caption', async () => {
    mockSendOutboundMessage.mockImplementation(async () => ({ id: `msg-${mockSendOutboundMessage.mock.calls.length}` }));
    const onSuccess = vi.fn();
    const { result } = renderHook(() => useSendToContact(onSuccess), { wrapper });

    await act(async () => {
      await result.current.sendProductToContact(CONTACT, 'Olha esse produto', ['u1', 'u2', 'u3']);
    });

    expect(mockSendOutboundMessage).toHaveBeenCalledTimes(3);
    const calls = mockSendOutboundMessage.mock.calls.map((c) => c[0] as Record<string, unknown>);
    expect(calls.every((c) => c.messageType === 'image')).toBe(true);
    expect(calls.some((c) => c.messageType === 'text')).toBe(false);

    expect(calls[0]).toMatchObject({ content: 'Olha esse produto', caption: 'Olha esse produto', mediaUrl: 'u1' });
    expect(calls[1]).toMatchObject({ content: '', caption: null, mediaUrl: 'u2' });
    expect(calls[2]).toMatchObject({ content: '', caption: null, mediaUrl: 'u3' });
    expect(onSuccess).toHaveBeenCalledTimes(1);
  });

  it('sem foto, o texto vai como mensagem de texto (1 mensagem)', async () => {
    mockSendOutboundMessage.mockResolvedValue({ id: 'msg-text' });
    const { result } = renderHook(() => useSendToContact(vi.fn()), { wrapper });

    await act(async () => {
      await result.current.sendProductToContact(CONTACT, 'Olha esse produto', []);
    });

    expect(mockSendOutboundMessage).toHaveBeenCalledTimes(1);
    expect(mockSendOutboundMessage.mock.calls[0][0]).toMatchObject({
      content: 'Olha esse produto', messageType: 'text',
    });
  });

  it('1 foto usa o mesmo caminho de 1 mensagem (sem texto solto)', async () => {
    mockSendOutboundMessage.mockResolvedValue({ id: 'msg-1' });
    const { result } = renderHook(() => useSendToContact(vi.fn()), { wrapper });

    await act(async () => {
      await result.current.sendProductToContact(CONTACT, 'mensagem', ['u1']);
    });

    expect(mockSendOutboundMessage).toHaveBeenCalledTimes(1);
    expect(mockSendOutboundMessage.mock.calls[0][0]).toMatchObject({ messageType: 'image', caption: 'mensagem' });
  });
});

describe('useSendToContact — CT-05: throttle e falha parcial', () => {
  beforeEach(resetSendMocks);

  afterEach(() => {
    vi.useRealTimers();
  });

  it('espera entre 800 ms e 1500 ms entre as fotos (nunca antes da primeira)', async () => {
    vi.useFakeTimers();
    const setTimeoutSpy = vi.spyOn(globalThis, 'setTimeout');
    mockSendOutboundMessage.mockResolvedValue({ id: 'msg' });

    const { result } = renderHook(() => useSendToContact(vi.fn()), { wrapper });
    await act(async () => {
      const sending = result.current.sendProductToContact(CONTACT, 'mensagem', ['u1', 'u2', 'u3']);
      await vi.advanceTimersByTimeAsync(10_000);
      await sending;
    });

    const photoDelays = setTimeoutSpy.mock.calls
      .map((call) => call[1])
      .filter((delay): delay is number => typeof delay === 'number' && delay >= PHOTO_MIN_INTERVAL_MS);

    expect(photoDelays).toHaveLength(2);
    for (const delay of photoDelays) {
      expect(delay).toBeGreaterThanOrEqual(PHOTO_MIN_INTERVAL_MS);
      expect(delay).toBeLessThanOrEqual(PHOTO_MIN_INTERVAL_MS + PHOTO_INTERVAL_JITTER_MS);
    }
    expect(mockSendOutboundMessage).toHaveBeenCalledTimes(3);
    setTimeoutSpy.mockRestore();
  });

  it('falha em 1 foto não aborta as demais e o resultado é parcial (âmbar)', async () => {
    mockSendOutboundMessage
      .mockResolvedValueOnce({ id: 'msg-1' })
      .mockRejectedValueOnce(new Error('foto falhou'))
      .mockResolvedValueOnce({ id: 'msg-3' });
    const onSuccess = vi.fn();
    const { result } = renderHook(() => useSendToContact(onSuccess), { wrapper });

    await act(async () => {
      await result.current.sendProductToContact(CONTACT, 'mensagem', ['u1', 'u2', 'u3']);
    });

    expect(mockSendOutboundMessage).toHaveBeenCalledTimes(3);
    expect(onSuccess).toHaveBeenCalledTimes(1);
    expect(sonnerToast.warning).toHaveBeenCalledWith(
      'Envio parcial',
      expect.objectContaining({ description: expect.stringContaining('1 de 3') }),
    );
    expect(sonnerToast.success).not.toHaveBeenCalled();
  });

  it('falha total não chama onSuccess e oferece "Tentar de novo" (regressão audit 24/09 + CT-06)', async () => {
    mockSendOutboundMessage.mockRejectedValue(new Error('network down'));
    const onSuccess = vi.fn();
    const onRetry = vi.fn();
    const { result } = renderHook(() => useSendToContact(onSuccess, onRetry), { wrapper });

    await act(async () => {
      await result.current.sendProductToContact(CONTACT, 'mensagem', []);
    });

    expect(onSuccess).not.toHaveBeenCalled();
    expect(sonnerToast.error).toHaveBeenCalledWith(
      'Falha no envio',
      expect.objectContaining({ action: expect.objectContaining({ label: 'Tentar de novo' }) }),
    );

    const action = sonnerToast.error.mock.calls[0][1].action as { onClick: () => void };
    act(() => { action.onClick(); });
    expect(onRetry).toHaveBeenCalledTimes(1);
  });
});

describe('useSendToContact — CT-06/CT-07: toast de sucesso e cache do rail', () => {
  beforeEach(resetSendMocks);

  it('sucesso traz a ação "Abrir conversa", que abre a conversa do contato no inbox', async () => {
    mockSendOutboundMessage.mockResolvedValue({ id: 'msg-1' });
    const { result } = renderHook(() => useSendToContact(vi.fn()), { wrapper });

    await act(async () => {
      await result.current.sendProductToContact(CONTACT, 'mensagem', ['u1']);
    });

    expect(sonnerToast.success).toHaveBeenCalledWith(
      '✅ Produto enviado!',
      expect.objectContaining({ action: expect.objectContaining({ label: 'Abrir conversa' }) }),
    );

    const received: string[] = [];
    const listener = (event: Event) => received.push((event as CustomEvent<{ contactId: string }>).detail.contactId);
    window.addEventListener('open-contact-chat', listener);

    const action = sonnerToast.success.mock.calls[0][1].action as { onClick: () => void };
    action.onClick();

    expect(mockNavigateToView).toHaveBeenCalledWith('inbox');
    expect((window as Window & { __pendingOpenContactId?: string }).__pendingOpenContactId).toBe('c1');

    await new Promise((resolve) => { setTimeout(resolve, 200); });
    window.removeEventListener('open-contact-chat', listener);
    expect(received).toContain('c1');

    delete (window as Window & { __pendingOpenContactId?: string }).__pendingOpenContactId;
  });

  it('registra o evento e invalida o rail "Enviados recentemente" (CT-07)', async () => {
    mockSendOutboundMessage.mockResolvedValue({ id: 'msg-1' });
    const invalidateSpy = vi.spyOn(queryClient, 'invalidateQueries');
    const { result } = renderHook(() => useSendToContact(vi.fn()), { wrapper });

    await act(async () => {
      await result.current.sendProductToContact(
        CONTACT, 'mensagem', ['u1'], { id: 'p1', name: 'Caneta' }, 'agent-1',
      );
    });
    await act(async () => { await Promise.resolve(); });

    expect(mockLogCatalogSendEvent).toHaveBeenCalledWith(expect.objectContaining({
      productId: 'p1', contactId: 'c1', agentId: 'agent-1', status: 'sent', imagesCount: 1, messageIds: ['msg-1'],
    }));
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: CATALOG_SEND_EVENTS_KEY });
  });

  it('openContactChat navega para o inbox e marca o contato pendente', () => {
    openContactChat('c9');
    expect(mockNavigateToView).toHaveBeenCalledWith('inbox');
    expect((window as Window & { __pendingOpenContactId?: string }).__pendingOpenContactId).toBe('c9');
    delete (window as Window & { __pendingOpenContactId?: string }).__pendingOpenContactId;
  });
});
