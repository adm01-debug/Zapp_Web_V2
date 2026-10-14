import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactElement, ReactNode } from 'react';

// Defeitos cobertos (auditoria de paridade V3->V2, PH-10):
//  1. a busca não normalizava acento: 'saudacao' não achava 'Saudação';
//  2. os favoritos viviam numa chave única do navegador (sem o usuário), então
//     uma conta herdava a lista da outra na mesma máquina;
//  3. o uso era contado por um `update` do cliente — resposta GLOBAL de outro
//     dono era alcançada por 0 linhas sem erro. Agora vai pela RPC do PH-10.

const mocks = vi.hoisted(() => ({
  user: { id: 'user-a' } as { id: string } | null,
  templates: [] as Array<Record<string, unknown>>,
  rpc: vi.fn<(name: string, args?: Record<string, unknown>) => Promise<{ data: unknown; error: { message: string } | null }>>(
    async () => ({ data: true, error: null }),
  ),
  toastError: vi.fn(),
  toastSuccess: vi.fn(),
}));

vi.mock('@/hooks/auth/useAuth', () => ({
  useAuth: () => ({ user: mocks.user }),
}));

vi.mock('sonner', () => ({
  toast: { success: mocks.toastSuccess, error: mocks.toastError },
}));

vi.mock('@/lib/logger', () => ({
  log: { error: vi.fn(), warn: vi.fn(), info: vi.fn(), debug: vi.fn() },
}));

function chain(result: Record<string, unknown>) {
  const obj: Record<string, unknown> = {};
  obj.eq = vi.fn(() => obj);
  obj.or = vi.fn(() => obj);
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
    from: vi.fn(() => chain({ data: mocks.templates, error: null })),
    rpc: mocks.rpc,
  },
}));

import { useQuickReplies, quickReplyFavoritesKey } from '@/hooks/chat/useQuickReplies';

const LEGACY_KEY = 'quick-reply-favorites';

const TEMPLATES = [
  { id: 't-saudacao', title: 'Saudação', content: 'Olá! Como posso ajudar?', shortcut: '/ola', category: 'geral', is_global: false, use_count: 3, user_id: 'user-a', created_at: '', updated_at: '' },
  { id: 't-orcamento', title: 'Orçamento de brindes', content: 'Segue o orçamento.', shortcut: '/orc', category: 'vendas', is_global: false, use_count: 1, user_id: 'user-a', created_at: '', updated_at: '' },
  { id: 't-global', title: 'Tabela de preços', content: 'Confira a tabela.', shortcut: '/precos', category: 'vendas', is_global: true, use_count: 9, user_id: 'user-b', created_at: '', updated_at: '' },
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

async function renderReady() {
  const { invalidate, wrapper } = createWrapper();
  const view = renderHook(() => useQuickReplies(), { wrapper });
  await waitFor(() => expect(view.result.current.templates?.length).toBe(TEMPLATES.length));
  return { ...view, invalidate };
}

beforeEach(() => {
  localStorage.clear();
  mocks.user = { id: 'user-a' };
  mocks.templates = TEMPLATES;
  mocks.rpc.mockReset();
  mocks.rpc.mockResolvedValue({ data: true, error: null });
  mocks.toastError.mockReset();
  mocks.toastSuccess.mockReset();
});

describe('useQuickReplies — busca sem acento', () => {
  it("'saudacao' acha 'Saudação'", async () => {
    const { result } = await renderReady();
    const found = result.current.searchTemplates('saudacao');
    expect(found.map((t) => t.id)).toEqual(['t-saudacao']);
  });

  it("'orcamento' acha 'Orçamento de brindes' (título) e continua achando o texto sem acento", async () => {
    const { result } = await renderReady();
    expect(result.current.searchTemplates('orcamento').map((t) => t.id)).toContain('t-orcamento');
    expect(result.current.searchTemplates('olá').map((t) => t.id)).toEqual(['t-saudacao']);
  });
});

describe('useQuickReplies — favoritos por usuário', () => {
  it('não herda a lista legada sem escopo de usuário', async () => {
    localStorage.setItem(LEGACY_KEY, JSON.stringify([{ id: 'f-legado', templateId: 't-global', order: 0 }]));
    const { result } = await renderReady();

    expect(localStorage.getItem(LEGACY_KEY)).toBeNull();
    expect(result.current.isFavorite('t-global')).toBe(false);
  });

  it('a conta B não vê o favorito marcado pela conta A, e a conta A reencontra o seu', async () => {
    const first = await renderReady();
    act(() => { first.result.current.toggleFavorite('t-saudacao'); });
    expect(first.result.current.isFavorite('t-saudacao')).toBe(true);
    expect(localStorage.getItem(quickReplyFavoritesKey('user-a'))).toContain('t-saudacao');
    first.unmount();

    // troca de conta no MESMO navegador
    mocks.user = { id: 'user-b' };
    const second = await renderReady();
    expect(second.result.current.isFavorite('t-saudacao')).toBe(false);
    expect(localStorage.getItem(quickReplyFavoritesKey('user-b'))).toBeNull();
    second.unmount();

    // volta a conta A: o favorito dela continua
    mocks.user = { id: 'user-a' };
    const third = await renderReady();
    expect(third.result.current.isFavorite('t-saudacao')).toBe(true);
  });
});

describe('useQuickReplies — uso contado pela RPC do PH-10', () => {
  it('chama a RPC com o id e invalida [quick-replies]', async () => {
    const { result, invalidate } = await renderReady();

    await act(async () => {
      await result.current.incrementUseCount('t-global');
    });

    expect(mocks.rpc).toHaveBeenCalledWith('increment_quick_reply_use', { p_id: 't-global' });
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ['quick-replies'] });
  });

  it('id fora da lista local não chama a RPC', async () => {
    const { result } = await renderReady();

    await act(async () => {
      await result.current.incrementUseCount('id-que-nao-existe');
    });

    expect(mocks.rpc).not.toHaveBeenCalled();
  });

  it('erro da RPC vira aviso e não invalida o cache', async () => {
    const { result, invalidate } = await renderReady();
    mocks.rpc.mockResolvedValueOnce({ data: null, error: { message: 'permission denied' } });

    await act(async () => {
      await result.current.incrementUseCount('t-global');
    });

    expect(mocks.toastError).toHaveBeenCalledWith('Erro ao registrar o uso da resposta rápida');
    expect(invalidate).not.toHaveBeenCalled();
  });
});
