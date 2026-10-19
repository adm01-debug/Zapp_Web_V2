/**
 * Item 5 da rodada de robustez: as buscas que falhavam em silencio (catch so com
 * log) deixam o usuario com a lista vazia e nenhuma explicacao. Aqui as tres
 * telas citadas passam a avisar — e o aviso NAO repete quando ja existem dados
 * de uma busca anterior na tela.
 */
import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  tables: {} as Record<string, { data: unknown; error: unknown }>,
  toast: vi.fn(),
  sonnerError: vi.fn(),
  sonnerSuccess: vi.fn(),
  sonnerInfo: vi.fn(),
  onForward: vi.fn().mockResolvedValue({ pairOutcomes: [], nonForwardable: [], attempted: 0 }),
}));

function tableResult(table: string) {
  return mocks.tables[table] ?? { data: [], error: null };
}

/** Builder encadeavel E aguardavel, igual ao do supabase-js. */
function mediaChain(table: string): unknown {
  const chain: Record<string, unknown> = {
    select: () => chain,
    eq: () => chain,
    order: () => chain,
    limit: () => chain,
    maybeSingle: () => chain,
    update: () => chain,
    delete: () => chain,
    insert: () => chain,
    then: (onFulfilled: (value: unknown) => unknown) =>
      Promise.resolve(tableResult(table)).then(onFulfilled),
  };
  return chain;
}

vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    from: (table: string) => mediaChain(table),
    functions: { invoke: vi.fn() },
  },
}));

vi.mock('@/hooks/auth/useAuth', () => ({
  useAuth: () => ({ user: { id: 'user-1' } }),
}));

vi.mock('@/hooks/ui/use-toast', () => ({
  toast: mocks.toast,
  useToast: () => ({ toast: mocks.toast }),
}));

vi.mock('sonner', () => ({
  toast: { error: mocks.sonnerError, success: mocks.sonnerSuccess, info: mocks.sonnerInfo },
}));

vi.mock('@/lib/logger', () => ({
  log: { debug: vi.fn(), warn: vi.fn(), error: vi.fn(), withCorrelation: () => ({ error: vi.fn(), debug: vi.fn(), info: vi.fn(), warn: vi.fn() })},
  getLogger: () => ({ error: vi.fn(), debug: vi.fn(), info: vi.fn(), warn: vi.fn(), withCorrelation: () => ({ error: vi.fn(), debug: vi.fn(), info: vi.fn(), warn: vi.fn() }) }),
  createLogger: () => ({ error: vi.fn(), debug: vi.fn(), info: vi.fn(), warn: vi.fn(), withCorrelation: () => ({ error: vi.fn(), debug: vi.fn(), info: vi.fn(), warn: vi.fn() }) }),
}));

vi.mock('@/lib/forward-limits', () => ({
  forwardLimitError: () => null,
}));

import { useForwardMessage } from '@/hooks/chat/useForwardMessage';
import { useMessageTemplates } from '@/hooks/chat/useMessageTemplates';
import { useScheduledReports } from '@/hooks/chat/useScheduledReports';

beforeEach(() => {
  vi.clearAllMocks();
  for (const key of Object.keys(mocks.tables)) delete mocks.tables[key];
});

describe('useForwardMessage — busca de contatos que falha avisa', () => {
  it('avisa quando a busca falha e o usuario fica com a lista vazia', async () => {
    mocks.tables.contacts = { data: null, error: new Error('db fora') };

    renderHook(() => useForwardMessage({
      open: true, allowGroups: false, onForward: mocks.onForward, onOpenChange: vi.fn(),
    }));

    await waitFor(() => expect(mocks.toast).toHaveBeenCalled());
    expect(mocks.toast).toHaveBeenCalledWith({
      title: 'Nao foi possivel carregar os contatos',
      description: 'A lista ficou vazia. Tente novamente.',
      variant: 'destructive',
    });
  });

  it('nao repete o aviso quando ja existem contatos de uma busca anterior', async () => {
    mocks.tables.contacts = {
      data: [{ id: 'c1', name: 'Ana', phone: '5511' }],
      error: null,
    };

    const { rerender } = renderHook(
      ({ open }: { open: boolean }) => useForwardMessage({
        open, allowGroups: false, onForward: mocks.onForward, onOpenChange: vi.fn(),
      }),
      { initialProps: { open: true } },
    );

    await waitFor(() => expect(mocks.tables.contacts).toBeDefined());
    await act(async () => {
      await Promise.resolve();
    });
    mocks.toast.mockClear();

    // Nova abertura, agora com a busca quebrada: a lista anterior continua na tela.
    mocks.tables.contacts = { data: null, error: new Error('db fora') };
    rerender({ open: false });
    rerender({ open: true });
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(mocks.toast).not.toHaveBeenCalled();
  });
});

describe('useMessageTemplates — busca que falha avisa', () => {
  it('avisa quando a busca falha e a lista fica vazia', async () => {
    mocks.tables.message_templates = { data: null, error: new Error('db fora') };

    const { result } = renderHook(() => useMessageTemplates());

    await act(async () => {
      await result.current.fetchTemplates();
    });

    expect(mocks.toast).toHaveBeenCalledWith({
      title: 'Nao foi possivel carregar os templates',
      description: 'A lista ficou vazia. Tente novamente.',
      variant: 'destructive',
    });
  });
});

describe('useScheduledReports — falha silenciosa de toggle avisa', () => {
  it('avisa quando nao consegue ligar/desligar o relatorio', async () => {
    mocks.tables.scheduled_reports = { data: null, error: new Error('db fora') };

    const { result } = renderHook(() => useScheduledReports());

    await act(async () => {
      await result.current.toggleActive('relatorio-1', true);
    });

    expect(mocks.sonnerError).toHaveBeenCalledWith('Erro ao atualizar o relatorio');
  });
});
