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
  const actions = { onPreview: vi.fn(), onOpenDetails: vi.fn(), onForward: vi.fn(), onDeleted: vi.fn() };
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

  it('empty state honesto quando não há arquivos', () => {
    renderContent({ items: [] });
    expect(screen.getByText('Nenhum arquivo encontrado')).toBeInTheDocument();
  });
});
