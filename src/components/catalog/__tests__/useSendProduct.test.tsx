import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { ReactNode } from 'react';
import { renderHook, act } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useSendToContact } from '../useSendProduct';

const mockSendOutboundMessage = vi.fn();
vi.mock('@/services/outbound-message.service', () => ({
  sendOutboundMessage: (...args: unknown[]) => mockSendOutboundMessage(...args),
}));

vi.mock('@/hooks/integrations/useCatalogContactSearch', () => ({
  fetchCatalogContactResults: vi.fn(),
  logCatalogSendEvent: vi.fn().mockResolvedValue(undefined),
}));

const mockToast = vi.fn();
vi.mock('@/hooks/ui/use-toast', () => ({
  toast: (...args: unknown[]) => mockToast(...args),
}));

function wrapper({ children }: { children: ReactNode }) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

const CONTACT = { id: 'c1', name: 'Cliente Teste', phone: '5511999999999', avatar_url: null };

describe('useSendToContact — audit 24/09 (CRÍTICO 1: falha total nao pode fechar o dialog)', () => {
  beforeEach(() => {
    mockSendOutboundMessage.mockReset();
    mockToast.mockReset();
  });

  it('NAO chama onSuccess quando 100% das mensagens falham (texto sozinho)', async () => {
    mockSendOutboundMessage.mockRejectedValue(new Error('network down'));
    const onSuccess = vi.fn();
    const { result } = renderHook(() => useSendToContact(onSuccess), { wrapper });

    await act(async () => {
      await result.current.sendProductToContact(CONTACT, 'mensagem de teste', []);
    });

    expect(onSuccess).not.toHaveBeenCalled();
    expect(mockToast).toHaveBeenCalledWith(expect.objectContaining({ title: 'Falha no envio' }));
  });

  it('chama onSuccess quando o envio e 100% bem sucedido', async () => {
    mockSendOutboundMessage.mockResolvedValue({ id: 'msg-1' });
    const onSuccess = vi.fn();
    const { result } = renderHook(() => useSendToContact(onSuccess), { wrapper });

    await act(async () => {
      await result.current.sendProductToContact(CONTACT, 'mensagem de teste', []);
    });

    expect(onSuccess).toHaveBeenCalledTimes(1);
    expect(mockToast).toHaveBeenCalledWith(expect.objectContaining({ title: '✅ Produto enviado!' }));
  });

  it('chama onSuccess em falha PARCIAL (1 foto falha, texto ok) com toast distinto de falha total', async () => {
    mockSendOutboundMessage
      .mockRejectedValueOnce(new Error('foto falhou'))
      .mockResolvedValueOnce({ id: 'msg-text' });
    const onSuccess = vi.fn();
    const { result } = renderHook(() => useSendToContact(onSuccess), { wrapper });

    await act(async () => {
      await result.current.sendProductToContact(CONTACT, 'mensagem de teste', ['https://x/foto.jpg']);
    });

    expect(onSuccess).toHaveBeenCalledTimes(1);
    expect(mockToast).toHaveBeenCalledWith(expect.objectContaining({ title: 'Envio parcial' }));
  });
});
