import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { useFilesActions } from '@/hooks/chat/useFilesActions';
import { contactMediaKey, type ContactMediaItem } from '@/hooks/chat/useContactMedia';
import { conversationTabCountsKey } from '@/hooks/chat/useConversationTabCounts';
import { toast } from 'sonner';

const h = vi.hoisted(() => ({
  update: vi.fn(),
  eq: vi.fn(),
}));

vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

vi.mock('@/integrations/supabase/client', () => ({
  supabase: { from: () => ({ update: h.update }) },
}));

const ITEM: ContactMediaItem = {
  id: 'm2',
  url: 'https://x/contrato.pdf',
  type: 'document',
  filename: 'contrato.pdf',
  displayName: 'contrato.pdf',
  extension: 'pdf',
  senderLabel: 'Atendente',
  created_at: '2026-01-11T10:00:00.000Z',
  caption: null,
  mimetype: 'application/pdf',
  size: 2048,
  meta: null,
  sender: 'agent',
};

function renderActions(overrides: { onRemoved?: (id: string) => void } = {}) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const invalidateSpy = vi.spyOn(queryClient, 'invalidateQueries');
  const onRemoved = overrides.onRemoved ?? vi.fn();
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
  const rendered = renderHook(() => useFilesActions({ contactId: 'contact-1', onRemoved }), { wrapper });
  return { ...rendered, queryClient, invalidateSpy, onRemoved };
}

beforeEach(() => {
  vi.clearAllMocks();
  h.update.mockReturnValue({ eq: h.eq });
});

describe('useFilesActions.deleteMessage (etapa 35)', () => {
  it('sucesso: update fiel, sai da seleção e invalida as duas chaves', async () => {
    h.eq.mockResolvedValue({ error: null });
    const { result, invalidateSpy, onRemoved } = renderActions();

    let outcome = false;
    await act(async () => { outcome = await result.current.deleteMessage(ITEM); });

    expect(outcome).toBe(true);
    // efeito fiel: só marca como apagada no ZAPP; o media_url permanece (nada é apagado de verdade)
    expect(h.update).toHaveBeenCalledWith({ is_deleted: true, content: '[Mensagem apagada]' });
    expect(h.eq).toHaveBeenCalledWith('id', 'm2');
    expect(onRemoved).toHaveBeenCalledWith('m2');
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: contactMediaKey('contact-1') });
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: conversationTabCountsKey('contact-1') });
    expect(toast.success).toHaveBeenCalled();
    expect(toast.error).not.toHaveBeenCalled();
  });

  it('erro: toast de erro, NÃO sai da seleção e NÃO invalida', async () => {
    h.eq.mockResolvedValue({ error: { message: 'rls' } });
    const { result, invalidateSpy, onRemoved } = renderActions();

    let outcome = true;
    await act(async () => { outcome = await result.current.deleteMessage(ITEM); });

    expect(outcome).toBe(false);
    expect(toast.error).toHaveBeenCalledWith('Erro ao apagar mensagem');
    expect(onRemoved).not.toHaveBeenCalled();
    expect(invalidateSpy).not.toHaveBeenCalled();
    expect(toast.success).not.toHaveBeenCalled();
  });
});
