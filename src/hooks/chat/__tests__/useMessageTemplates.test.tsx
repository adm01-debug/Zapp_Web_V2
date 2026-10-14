import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactElement, ReactNode } from 'react';

// Defeitos cobertos (auditoria de paridade V3->V2, PH-10):
//  1. `fetchTemplates` gravava estado depois do unmount (resposta atrasada);
//  2. criar/editar/excluir template não invalidava o cache `['quick-replies']`
//     consumido pela tela de respostas rápidas;
//  3. o uso era contado por `update` do cliente; agora vai pela RPC do PH-10.

const mocks = vi.hoisted(() => ({
  user: { id: 'user-a' } as { id: string } | null,
  rpc: vi.fn(async () => ({ data: true, error: null })),
  toast: vi.fn(),
  from: vi.fn(),
}));

vi.mock('@/hooks/auth/useAuth', () => ({
  useAuth: () => ({ user: mocks.user }),
}));

vi.mock('@/hooks/ui/use-toast', () => ({
  useToast: () => ({ toast: mocks.toast }),
}));

vi.mock('@/lib/logger', () => ({
  log: { error: vi.fn(), warn: vi.fn(), info: vi.fn(), debug: vi.fn() },
}));

function chain(result: Record<string, unknown>) {
  const obj: Record<string, unknown> = {};
  obj.eq = vi.fn(() => obj);
  obj.order = vi.fn(() => obj);
  obj.select = vi.fn(() => obj);
  obj.insert = vi.fn(() => obj);
  obj.update = vi.fn(() => obj);
  obj.delete = vi.fn(() => obj);
  obj.then = (resolve: (v: unknown) => void, reject?: (e: unknown) => void) =>
    Promise.resolve(result).then(resolve, reject);
  return obj;
}

vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    from: mocks.from,
    rpc: mocks.rpc,
  },
}));

import { useMessageTemplates } from '@/hooks/chat/useMessageTemplates';

const DB_TEMPLATES = [
  { id: 't1', title: 'Saudação', content: 'Olá!', shortcut: '/ola', category: 'geral', use_count: 2 },
];

function createWrapper() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  const invalidate = vi.spyOn(queryClient, 'invalidateQueries');
  return {
    invalidate,
    wrapper: ({ children }: { children: ReactNode }): ReactElement => (
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    ),
  };
}

function renderHookWithWrapper() {
  const { invalidate, wrapper } = createWrapper();
  const view = renderHook(() => useMessageTemplates(), { wrapper });
  return { ...view, invalidate };
}

beforeEach(() => {
  mocks.user = { id: 'user-a' };
  mocks.rpc.mockReset();
  mocks.rpc.mockResolvedValue({ data: true, error: null });
  mocks.toast.mockReset();
  mocks.from.mockReset();
  mocks.from.mockImplementation(() => chain({ data: DB_TEMPLATES, error: null }));
});

describe('useMessageTemplates — guarda de montagem', () => {
  it('busca e guarda os templates enquanto montado', async () => {
    const { result } = renderHookWithWrapper();
    await act(async () => { await result.current.fetchTemplates(); });
    expect(result.current.templates).toHaveLength(1);
    expect(result.current.isLoading).toBe(false);
  });

  it('depois do unmount não vai à rede nem grava estado', async () => {
    const { result, unmount } = renderHookWithWrapper();
    await act(async () => { await result.current.fetchTemplates(); });
    expect(result.current.templates).toHaveLength(1);

    unmount();
    mocks.from.mockClear();

    await act(async () => { await result.current.fetchTemplates(); });

    expect(mocks.from).not.toHaveBeenCalled();
  });
});

describe('useMessageTemplates — invalidação do cache de respostas rápidas', () => {
  it('criar template invalida [quick-replies]', async () => {
    const { result, invalidate } = renderHookWithWrapper();
    await act(async () => {
      await result.current.addTemplate({ title: 'Novo', content: 'Texto', shortcut: '/n', category: 'geral' });
    });
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ['quick-replies'] });
  });

  it('editar template invalida [quick-replies]', async () => {
    const { result, invalidate } = renderHookWithWrapper();
    await act(async () => {
      await result.current.updateTemplate({ ...DB_TEMPLATES[0] });
    });
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ['quick-replies'] });
  });

  it('excluir template invalida [quick-replies]', async () => {
    const { result, invalidate } = renderHookWithWrapper();
    await act(async () => { await result.current.deleteTemplate('t1'); });
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ['quick-replies'] });
  });
});

describe('useMessageTemplates — uso contado pela RPC do PH-10', () => {
  it('chama a RPC com o id do template e invalida [quick-replies]', async () => {
    const { result, invalidate } = renderHookWithWrapper();

    await act(async () => {
      await result.current.incrementUseCount({ ...DB_TEMPLATES[0] });
    });

    expect(mocks.rpc).toHaveBeenCalledWith('increment_quick_reply_use', { p_id: 't1' });
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ['quick-replies'] });
  });

  it('erro da RPC vira aviso e não invalida o cache', async () => {
    const { result, invalidate } = renderHookWithWrapper();
    mocks.rpc.mockResolvedValueOnce({ data: null, error: { message: 'permission denied' } });

    await act(async () => {
      await result.current.incrementUseCount({ ...DB_TEMPLATES[0] });
    });

    expect(mocks.toast).toHaveBeenCalledWith(expect.objectContaining({ variant: 'destructive' }));
    expect(invalidate).not.toHaveBeenCalled();
  });
});
