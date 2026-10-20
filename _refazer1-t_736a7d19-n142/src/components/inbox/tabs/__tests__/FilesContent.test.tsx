import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { FilesContent } from '../FilesContent';
import type { ContactMediaItem } from '@/hooks/chat/useContactMedia';

vi.mock('@/hooks/storage/useResolvedStorageUrl', () => ({
  useResolvedStorageUrl: (source: string) => ({ url: source, isLoading: false, error: null, refresh: vi.fn() }),
}));

const ITEMS: ContactMediaItem[] = [
  { id: 'a', url: 'https://x/a.png', type: 'image', filename: 'a.png', displayName: 'a.png', extension: 'png', senderLabel: 'Atendente', created_at: '2026-01-10T10:00:00.000Z', caption: null, mimetype: 'image/png', size: 1024, meta: null, sender: 'agent' },
  { id: 'b', url: 'https://x/b.pdf', type: 'document', filename: 'b.pdf', displayName: 'b.pdf', extension: 'pdf', senderLabel: null, created_at: '2026-01-11T10:00:00.000Z', caption: null, mimetype: 'application/pdf', size: null, meta: null, sender: 'contact' },
  { id: 'c', url: 'https://x/c.mp4', type: 'video', filename: 'c.mp4', displayName: 'c.mp4', extension: 'mp4', senderLabel: null, created_at: '2026-01-12T10:00:00.000Z', caption: null, mimetype: 'video/mp4', size: 2048, meta: null, sender: 'contact' },
];

function renderContent(overrides: Partial<React.ComponentProps<typeof FilesContent>> = {}) {
  const actions = { onPreview: vi.fn(), onOpenDetails: vi.fn(), onForward: vi.fn(), onRequestDelete: vi.fn() };
  const selection = { mode: false, selectedIds: new Set<string>(), toggle: vi.fn() };
  const props: React.ComponentProps<typeof FilesContent> = {
    items: ITEMS,
    viewMode: 'grid',
    effectiveColumns: 4,
    containerWidth: 900,
    contactName: 'Ana Cliente',
    loading: false,
    selection,
    actions,
    sort: 'recent',
    onSortChange: vi.fn(),
    selectedId: null,
    ...overrides,
  };
  return { ...render(<FilesContent {...props} />), props, actions };
}

function itemIds(container: HTMLElement): (string | null)[] {
  return Array.from(container.querySelectorAll('[data-testid^="files-item-"]'))
    .map((el) => el.getAttribute('data-testid'));
}

describe('FilesContent (etapa 25)', () => {
  it('invariante: a sequência de ids é a mesma nos três modos', () => {
    const esperado = ['files-item-a', 'files-item-b', 'files-item-c'];
    (['grid', 'list', 'table'] as const).forEach((viewMode) => {
      const { container, unmount } = renderContent({ viewMode });
      expect(itemIds(container)).toEqual(esperado);
      unmount();
    });
  });

  it('skeleton por modo: 6 cartões, 6 linhas e 6 TableRow', () => {
    const grid = renderContent({ viewMode: 'grid', loading: true });
    expect(grid.container.querySelectorAll('.animate-pulse').length).toBe(6);
    grid.unmount();

    const list = renderContent({ viewMode: 'list', loading: true });
    expect(list.container.querySelectorAll('.animate-pulse').length).toBe(6);
    list.unmount();

    const table = renderContent({ viewMode: 'table', loading: true });
    expect(table.container.querySelectorAll('tr').length).toBe(6);
    expect(table.container.querySelectorAll('.animate-pulse').length).toBe(6);
    table.unmount();
  });

  it('paridade: a mesma ação chama o mesmo handler nos três modos', () => {
    (['grid', 'list', 'table'] as const).forEach((viewMode) => {
      const { actions, unmount } = renderContent({ viewMode });
      fireEvent.click(screen.getAllByRole('button', { name: 'Visualizar' })[0]);
      expect(actions.onPreview).toHaveBeenCalledTimes(1);
      unmount();
    });
  });
});

describe('FilesContent — estados distintos (etapa 44)', () => {
  it('1. carregando inicial: skeleton do modo, sem estado de vazio', () => {
    const { container } = renderContent({ viewMode: 'grid', loading: true, items: [] });
    expect(container.querySelectorAll('.animate-pulse').length).toBe(6);
    expect(screen.queryByText('Nenhum arquivo nesta conversa')).not.toBeInTheDocument();
  });

  it('2. vazio real: nenhuma mídia na conversa', () => {
    renderContent({ items: [] });
    expect(screen.getByText('Nenhum arquivo nesta conversa')).toBeInTheDocument();
  });

  it('3. busca sem resultado: cita o termo e oferece "Limpar busca"', () => {
    const onClearSearch = vi.fn();
    renderContent({ items: [], search: 'orçamento', onClearSearch });
    expect(screen.getByText('Nada corresponde a "orçamento"')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /Limpar busca/ }));
    expect(onClearSearch).toHaveBeenCalledTimes(1);
  });

  it('3b. filtro sem resultado: oferece "Ver todos"', () => {
    const onClearFilter = vi.fn();
    renderContent({ items: [], typeFilter: 'video', onClearFilter });
    expect(screen.getByText('Nenhum arquivo deste tipo')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /Ver todos/ }));
    expect(onClearFilter).toHaveBeenCalledTimes(1);
  });

  it('4. erro de consulta sem lista anterior: mensagem + "Tentar novamente"', () => {
    const onRetry = vi.fn();
    renderContent({ items: [], isError: true, onRetry });
    expect(screen.getByTestId('files-query-error')).toBeInTheDocument();
    expect(screen.getByText('Não foi possível carregar')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /Tentar novamente/ }));
    expect(onRetry).toHaveBeenCalledTimes(1);
  });

  it('4b. erro com lista já carregada: preserva os itens e mostra a faixa', () => {
    const { container } = renderContent({ isError: true, onRetry: vi.fn() });
    expect(screen.getByTestId('files-query-error')).toBeInTheDocument();
    expect(itemIds(container)).toEqual(['files-item-a', 'files-item-b', 'files-item-c']);
  });

  it('5. carregando mais: skeleton no fim e botão desabilitado', () => {
    renderContent({ isFetchingNextPage: true, hasMore: true, onLoadMore: vi.fn() });
    expect(screen.getByTestId('files-loading-more')).toBeInTheDocument();
    expect(screen.getByTestId('files-load-more')).toBeDisabled();
  });
});

describe('FilesContent — carregar mais (etapa 41)', () => {
  it('sem próxima página, não há rodapé de paginação', () => {
    renderContent({ hasMore: false });
    expect(screen.queryByTestId('files-load-more')).not.toBeInTheDocument();
    expect(screen.queryByTestId('files-load-more-sentinel')).not.toBeInTheDocument();
  });

  it('com próxima página, expõe "Carregar mais" e o sentinela', () => {
    const onLoadMore = vi.fn();
    renderContent({ hasMore: true, onLoadMore });
    expect(screen.getByTestId('files-load-more-sentinel')).toBeInTheDocument();
    fireEvent.click(screen.getByTestId('files-load-more'));
    expect(onLoadMore).toHaveBeenCalledTimes(1);
  });
});
