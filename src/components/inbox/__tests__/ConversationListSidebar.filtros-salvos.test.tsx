/**
 * Ligação ponta a ponta do menu "Filtros salvos" (cartão de presets do inbox):
 * a lista de conversas entrega ao InboxFilters o filtro que está na tela
 * (chip, tipo de contato, fila) e, ao aplicar um preset, chama os MESMOS setters
 * de useInboxFilters que o painel Filtros usa. A busca digitada nunca vai no preset.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render } from '@testing-library/react';
import type { ReactNode } from 'react';

const capturado = vi.hoisted(() => ({
  chamadas: [] as Array<Record<string, unknown>>,
}));

vi.mock('@/hooks/ui/use-mobile', () => ({ useIsMobile: () => false }));
vi.mock('@/components/mobile/MobilePullToRefresh', () => ({
  MobilePullToRefreshIndicator: () => null,
}));
vi.mock('@/components/errors/ErrorBoundary', () => ({
  ErrorBoundary: ({ children }: { children: ReactNode }) => <>{children}</>,
}));
vi.mock('@/components/inbox/BulkActionsToolbar', () => ({ BulkActionsToolbar: () => null }));
vi.mock('@/components/inbox/InboxFilters', () => ({
  InboxFilters: (props: Record<string, unknown>) => {
    capturado.chamadas.push(props);
    return null;
  },
}));
vi.mock('@/components/inbox/conversation-list/StatusChips', () => ({
  StatusChips: () => null,
}));
vi.mock('sonner', () => ({ toast: { error: vi.fn(), success: vi.fn(), info: vi.fn() } }));
vi.mock('@/components/inbox/VirtualizedRealtimeList', () => ({
  VirtualizedRealtimeList: () => null,
}));
vi.mock('@/components/inbox/CloseConversationDialog', () => ({
  CloseConversationDialog: () => null,
}));
vi.mock('@/components/inbox/TransferDialog', () => ({ TransferDialog: () => null }));

import { ConversationListSidebar } from '@/components/inbox/ConversationListSidebar';

function montar(overrides: Record<string, unknown> = {}) {
  const inboxFilters = {
    filteredConversations: [],
    search: 'texto digitado',
    setSearch: vi.fn(),
    filters: {},
    setFilters: vi.fn(),
    showAll: false,
    setShowAll: vi.fn(),
    selectedContactType: 'cliente',
    handleContactTypeChange: vi.fn(),
    selectedQueueId: 'q1',
    setSelectedQueueId: vi.fn(),
    chipTab: 'waiting',
    setChipTab: vi.fn(),
    ...overrides,
  };
  const props = {
    inbox: {
      selectedContactId: null,
      isOnline: true,
      cachedConversations: [],
      loading: false,
      refetch: vi.fn(),
      handleSelectConversation: vi.fn(),
    },
    inboxFilters,
    bulkActions: {
      selectedIds: new Set<string>(),
      bulkMarkAsRead: vi.fn(),
      bulkTransfer: vi.fn(),
      bulkArchive: vi.fn(),
      clearSelection: vi.fn(),
      bulkLoading: false,
    },
    pullToRefresh: {
      isRefreshing: false,
      pullProgress: 0,
      pullDistance: 0,
      containerRef: { current: null },
      handlers: {},
    },
    conversationActions: undefined,
  };
  render(<ConversationListSidebar {...props} />);
  return inboxFilters;
}

type Integracao = {
  current: { chipTab: string; contactType: string | null; queueId: string | null };
  onApply: (c: { chipTab: string; contactType: string | null; queueId: string | null }) => void;
};

const ultimaIntegracao = (): Integracao | undefined =>
  capturado.chamadas[capturado.chamadas.length - 1]?.savedFilters as Integracao | undefined;

describe('ConversationListSidebar — ligação do menu Filtros salvos', () => {
  beforeEach(() => {
    capturado.chamadas.length = 0;
  });

  it('entrega ao InboxFilters o filtro atual (chip, tipo, fila) e NUNCA a busca digitada', () => {
    montar();
    const integracao = ultimaIntegracao();

    expect(integracao).toBeDefined();
    expect(integracao?.current).toEqual({
      chipTab: 'waiting',
      contactType: 'cliente',
      queueId: 'q1',
    });
    expect(JSON.stringify(integracao?.current)).not.toContain('texto digitado');
  });

  it('aplicar um preset chama os setters de chip, tipo de contato e fila', () => {
    const filtros = montar();

    ultimaIntegracao()?.onApply({ chipTab: 'resolved', contactType: 'grupo', queueId: 'q9' });

    expect(filtros.setChipTab).toHaveBeenCalledWith('resolved');
    expect(filtros.handleContactTypeChange).toHaveBeenCalledWith('grupo');
    expect(filtros.setSelectedQueueId).toHaveBeenCalledWith('q9');
  });

  it('preset sem tipo e sem fila limpa os dois (null), não os deixa como estavam', () => {
    const filtros = montar();

    ultimaIntegracao()?.onApply({ chipTab: 'all', contactType: null, queueId: null });

    expect(filtros.handleContactTypeChange).toHaveBeenCalledWith(null);
    expect(filtros.setSelectedQueueId).toHaveBeenCalledWith(null);
  });

  it('tipo "todos" não vira filtro atual: entra como null', () => {
    montar({ selectedContactType: null, selectedQueueId: undefined });
    expect(ultimaIntegracao()?.current.contactType).toBeNull();
    expect(ultimaIntegracao()?.current.queueId).toBeNull();
  });

  it('sem os setters do hook (facade incompleto) o menu simplesmente não é ligado', () => {
    montar({ setChipTab: undefined });
    expect(ultimaIntegracao()).toBeUndefined();
  });
});
