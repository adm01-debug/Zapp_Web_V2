import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { ReactNode } from 'react';
import { renderHook, act } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import {
  useSendToContact, useContactSearch, openContactChat, PHOTO_MIN_INTERVAL_MS, PHOTO_INTERVAL_JITTER_MS,
} from '../useSendProduct';
import { CATALOG_SEND_EVENTS_KEY } from '@/hooks/integrations/useCatalogRecentSends';

const mockSendOutboundMessage = vi.hoisted(() => vi.fn());
vi.mock('@/services/outbound-message.service', () => ({
  sendOutboundMessage: (...args: unknown[]) => mockSendOutboundMessage(...args),
}));

const mockFetchCatalogContacts = vi.hoisted(() => vi.fn());
const mockLogCatalogSendEvent = vi.hoisted(() => vi.fn());
vi.mock('@/hooks/integrations/useCatalogContactSearch', () => ({
  fetchCatalogContactResults: (...args: unknown[]) => mockFetchCatalogContacts(...args),
  logCatalogSendEvent: (...args: unknown[]) => mockLogCatalogSendEvent(...args),
  // CT-43 — useSendProduct importa esta constante do módulo real: sem ela no
  // mock o gate de 2 caracteres vira `length >= undefined` (sempre falso).
  CONTACT_SEARCH_MIN_CHARS: 2,
}));

// CT-06 — o módulo usa `sonner` (não o hook antigo de toast) depois desta etapa.
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
  mockFetchCatalogContacts.mockReset();
  mockFetchCatalogContacts.mockResolvedValue([]);
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

describe('useSendToContact — CT-46: contador de progresso do envio', () => {
  beforeEach(resetSendMocks);

  afterEach(() => {
    vi.useRealTimers();
  });

  it('reporta "feitas/total" a cada mensagem enviada', async () => {
    vi.useFakeTimers();
    // Cada envio só resolve quando o teste mandar: assim cada passo do
    // contador é observado separadamente (com promises já resolvidas o React
    // agrupa os estados intermediários num único commit).
    const resolvers: Array<(value: { id: string }) => void> = [];
    mockSendOutboundMessage.mockImplementation(() => new Promise((resolve) => { resolvers.push(resolve); }));

    const { result } = renderHook(() => useSendToContact(vi.fn()), { wrapper });

    let sending!: Promise<void>;
    await act(async () => {
      sending = result.current.sendProductToContact(CONTACT, 'mensagem', ['u1', 'u2']);
    });
    expect(result.current.sendProgress).toEqual({ done: 0, total: 2 });

    await act(async () => {
      resolvers[0]({ id: 'msg-1' });
      for (let i = 0; i < 5; i++) await Promise.resolve();
    });
    expect(result.current.sendProgress).toEqual({ done: 1, total: 2 });

    // A 2ª mensagem só começa depois do intervalo humano (CT-05).
    await act(async () => { await vi.advanceTimersByTimeAsync(2000); });
    expect(mockSendOutboundMessage).toHaveBeenCalledTimes(2);

    await act(async () => {
      resolvers[1]({ id: 'msg-2' });
      await sending;
    });
    expect(result.current.sendProgress).toEqual({ done: 2, total: 2 });
  });

  it('sem foto o envio tem 1 mensagem no total', async () => {
    mockSendOutboundMessage.mockResolvedValue({ id: 'msg' });
    const { result } = renderHook(() => useSendToContact(vi.fn()), { wrapper });

    expect(result.current.sendProgress).toBeNull();

    await act(async () => {
      await result.current.sendProductToContact(CONTACT, 'mensagem', []);
    });

    expect(result.current.sendProgress).toEqual({ done: 1, total: 1 });
  });
});

describe('useContactSearch — CT-43: mínimo de 2 caracteres e debounce de 300 ms', () => {
  beforeEach(() => {
    resetSendMocks();
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('1 caractere não espera debounce; 2+ caracteres só buscam depois de 300 ms', async () => {
    const { result } = renderHook(() => useContactSearch('selectContact'), { wrapper });

    // Montagem: sem termo, a lista de recentes é carregada na hora.
    await act(async () => { await vi.advanceTimersByTimeAsync(0); });
    expect(mockFetchCatalogContacts).toHaveBeenCalledWith('');
    mockFetchCatalogContacts.mockClear();

    // 1 caractere: sem debounce (o próprio fetch trata como "sem busca").
    await act(async () => { result.current.setContactSearch('t'); });
    await act(async () => { await vi.advanceTimersByTimeAsync(0); });
    expect(mockFetchCatalogContacts).toHaveBeenCalledTimes(1);
    mockFetchCatalogContacts.mockClear();

    // 2 caracteres: nada em 299 ms, busca em 300 ms.
    await act(async () => { result.current.setContactSearch('tom'); });
    await act(async () => { await vi.advanceTimersByTimeAsync(299); });
    expect(mockFetchCatalogContacts).not.toHaveBeenCalled();

    await act(async () => { await vi.advanceTimersByTimeAsync(1); });
    expect(mockFetchCatalogContacts).toHaveBeenCalledWith('tom');
  });
});

describe('useSendToContact — CT-06/CT-07: toast de sucesso e cache do rail', () => {
  beforeEach(resetSendMocks);

  // `openContactChat` agenda uma cadeia de retry (150 ms + até 14×200 ms) e o
  // teste é dono do próprio tempo: com relógio real os timers sobrevivem ao
  // teardown do jsdom e o `window.dispatchEvent` do callback estoura
  // `ReferenceError: window is not defined` sob cobertura. `useRealTimers`
  // descarta o relógio falso no fim de cada teste.
  afterEach(() => {
    vi.useRealTimers();
  });

  it('sucesso traz a ação "Abrir conversa", que abre a conversa do contato no inbox', async () => {
    vi.useFakeTimers();
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

    // 200 ms: dispara o primeiro `tryDispatch` (150 ms) exatamente como antes,
    // mas agora no relógio do teste — a asserção abaixo segue a mesma.
    await act(async () => { await vi.advanceTimersByTimeAsync(200); });
    window.removeEventListener('open-contact-chat', listener);
    expect(received).toContain('c1');

    // Drena o resto da cadeia de retry dentro do teste: nenhum timer real fica
    // pendente para o teardown.
    await act(async () => { await vi.advanceTimersByTimeAsync(5000); });

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

  it('openContactChat navega para o inbox e marca o contato pendente', async () => {
    vi.useFakeTimers();
    openContactChat('c9');
    expect(mockNavigateToView).toHaveBeenCalledWith('inbox');
    expect((window as Window & { __pendingOpenContactId?: string }).__pendingOpenContactId).toBe('c9');

    // Drena a cadeia de retry (150 ms + 14×200 ms) no relógio do teste: sem
    // isso os timers ficavam pendentes e estouravam no teardown do jsdom.
    await act(async () => { await vi.advanceTimersByTimeAsync(5000); });

    delete (window as Window & { __pendingOpenContactId?: string }).__pendingOpenContactId;
  });
});

// CT-78 — a decisão de status (useSendProduct.ts, mesma fórmula em
// CatalogBulkSendDialog.tsx): 0 falhas = sent, todas falharam = failed, o resto
// = partial. Aqui os 3 casos são travados pelo status do evento logado.
describe('useSendToContact — CT-78: status do evento de envio (sent/partial/failed)', () => {
  beforeEach(resetSendMocks);

  const PRODUCT = { id: 'p1', name: 'Caneta Azul', sku: 'PO-13153' };

  const loggedStatus = (): string => {
    const calls = mockLogCatalogSendEvent.mock.calls;
    return (calls[calls.length - 1][0] as { status: string }).status;
  };

  it('todas as mensagens entregues → sent (todos os ids, nenhuma falha)', async () => {
    mockSendOutboundMessage.mockResolvedValue({ id: 'msg-1' });
    const { result } = renderHook(() => useSendToContact(vi.fn()), { wrapper });

    await act(async () => {
      await result.current.sendProductToContact(CONTACT, 'mensagem', ['u1'], PRODUCT, 'agent-1');
    });
    await act(async () => { await Promise.resolve(); });

    expect(mockLogCatalogSendEvent).toHaveBeenCalledTimes(1);
    expect(mockLogCatalogSendEvent).toHaveBeenCalledWith(expect.objectContaining({
      productId: 'p1', contactId: 'c1', agentId: 'agent-1',
      imagesCount: 1, messageLength: 'mensagem'.length,
      status: 'sent', messageIds: ['msg-1'],
    }));
  });

  it('parte das fotos falha → partial (só os ids entregues são logados)', async () => {
    mockSendOutboundMessage
      .mockResolvedValueOnce({ id: 'msg-1' })
      .mockRejectedValueOnce(new Error('foto falhou'))
      .mockResolvedValueOnce({ id: 'msg-3' });
    const { result } = renderHook(() => useSendToContact(vi.fn()), { wrapper });

    await act(async () => {
      await result.current.sendProductToContact(CONTACT, 'mensagem', ['u1', 'u2', 'u3'], PRODUCT, 'agent-1');
    });
    await act(async () => { await Promise.resolve(); });

    expect(loggedStatus()).toBe('partial');
    expect(mockLogCatalogSendEvent).toHaveBeenCalledWith(expect.objectContaining({
      status: 'partial', imagesCount: 3, messageIds: ['msg-1', 'msg-3'],
    }));
  });

  it('nenhuma mensagem entregue → failed, sem messageIds e sem onSuccess', async () => {
    mockSendOutboundMessage.mockRejectedValue(new Error('network down'));
    const onSuccess = vi.fn();
    const { result } = renderHook(() => useSendToContact(onSuccess), { wrapper });

    await act(async () => {
      await result.current.sendProductToContact(CONTACT, 'mensagem', ['u1'], PRODUCT, 'agent-1');
    });
    await act(async () => { await Promise.resolve(); });

    expect(loggedStatus()).toBe('failed');
    expect(mockLogCatalogSendEvent).toHaveBeenCalledWith(expect.objectContaining({
      status: 'failed', imagesCount: 1, messageIds: [],
    }));
    expect(onSuccess).not.toHaveBeenCalled();
  });
});
