import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { TooltipProvider } from '@/components/ui/tooltip';
import { BulkActionsToolbar } from '../BulkActionsToolbar';

// O TransferDialog precisa de AuthProvider/query; a toolbar é o alvo do teste,
// então o diálogo é neutralizado para os callbacks serem medidos isolados.
vi.mock('../TransferDialog', () => ({ TransferDialog: () => null }));

function renderToolbar(props: Partial<React.ComponentProps<typeof BulkActionsToolbar>> = {}) {
  const handlers = {
    onMarkAsRead: vi.fn(),
    onTransfer: vi.fn(),
    onArchive: vi.fn(),
    onClearSelection: vi.fn(),
  };
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const utils = render(
    <QueryClientProvider client={qc}>
      <TooltipProvider>
        <BulkActionsToolbar selectedCount={2} {...handlers} {...props} />
      </TooltipProvider>
    </QueryClientProvider>,
  );
  return { ...utils, handlers };
}

describe('BulkActionsToolbar — ações em massa', () => {
  it('não renderiza nada quando não há seleção', () => {
    const { container } = renderToolbar({ selectedCount: 0 });
    expect(container).toBeEmptyDOMElement();
  });

  it('mostra o plural correto do contador', () => {
    const { unmount } = renderToolbar({ selectedCount: 1 });
    expect(screen.getByText('1 selecionado')).toBeInTheDocument();
    unmount();
    renderToolbar({ selectedCount: 3 });
    expect(screen.getByText('3 selecionados')).toBeInTheDocument();
  });

  it('cada botão dispara o seu callback', () => {
    const { handlers } = renderToolbar();
    fireEvent.click(screen.getByRole('button', { name: 'Marcar como lido' }));
    fireEvent.click(screen.getByRole('button', { name: 'Arquivar' }));
    fireEvent.click(screen.getByRole('button', { name: 'Limpar seleção' }));
    expect(handlers.onMarkAsRead).toHaveBeenCalledTimes(1);
    expect(handlers.onArchive).toHaveBeenCalledTimes(1);
    expect(handlers.onClearSelection).toHaveBeenCalledTimes(1);
  });

  it('isLoading desabilita as ações', () => {
    renderToolbar({ isLoading: true });
    expect(screen.getByRole('button', { name: 'Marcar como lido' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Arquivar' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Transferir' })).toBeDisabled();
  });
});
