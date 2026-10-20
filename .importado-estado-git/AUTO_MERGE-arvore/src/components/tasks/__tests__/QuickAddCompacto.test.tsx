/**
 * FASE D — lacuna encontrada pelo sweep de mutações: os atalhos no modo `compact`.
 * Nele os chips de contato e Lembrar só existem dentro do popover `⋯`, então o
 * atalho precisa abrir o `⋯` antes de acioná-los. As mutações que desligavam esse
 * passo sobreviviam sem estes casos — eles existem para morrer.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

import { QuickAdd } from '@/components/tasks/shared/QuickAdd';

vi.mock('@/hooks/crm/useContactsSearch', () => ({
  useContactsSearch: () => ({
    contacts: [{ id: 'c1', name: 'Ana Souza', phone: '+55 11 90000-0000' }],
    totalCount: 1,
    loading: false,
    hasMore: false,
    searchInput: '',
    handleSearchChange: vi.fn(),
    loadMore: vi.fn(),
  }),
}));

beforeEach(() => {
  cleanup();
  const proto = HTMLElement.prototype as unknown as Record<string, unknown>;
  proto.hasPointerCapture ??= () => false;
  proto.setPointerCapture ??= () => {};
  proto.releasePointerCapture ??= () => {};
  proto.scrollIntoView ??= () => {};
  (globalThis as unknown as Record<string, unknown>).ResizeObserver ??= class {
    observe() {}
    unobserve() {}
    disconnect() {}
  };
});

afterEach(() => cleanup());

/** O ContactCombobox usa react-query (useQuery do contato selecionado). */
function montar() {
  const onAdd = vi.fn(async () => {});
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={qc}>
      <QuickAdd onAdd={onAdd} compact />
    </QueryClientProvider>,
  );
  return { onAdd };
}

describe('FASE D — QuickAdd compacto (etapa 36 + 41)', () => {
  it('compact: Ctrl+@ abre o ⋯ e deixa o chip @ acessível', async () => {
    montar();
    expect(screen.queryByTestId('quick-add-chip-contact')).toBeNull();

    fireEvent.keyDown(screen.getByTestId('quick-add-input'), { key: '@', ctrlKey: true });

    await waitFor(() => expect(screen.getByTestId('quick-add-chip-contact')).toBeTruthy());
    expect(screen.getByTestId('quick-add-more')).toBeTruthy();
  });

  it('compact: Ctrl+L abre o ⋯ e o Lembrar fica acessível', async () => {
    montar();

    fireEvent.keyDown(screen.getByTestId('quick-add-input'), { key: 'l', ctrlKey: true });

    await waitFor(() => expect(screen.getByTestId('quick-add-chip-remind')).toBeTruthy());
  });
});
