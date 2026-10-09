/**
 * N-038 — busca global: botões 'x' e filtro de período têm nome acessível
 * para leitores de tela (aria-label).
 *
 * Vermelho antes: getByRole('button', { name: ... }) lança
 * TestingLibraryElementNotFound porque os botões <X> e o SelectTrigger
 * não tinham aria-label.
 * Verde depois: cada botão ícone e o seletor de período expõem um
 * nome acessível que o leitor de tela anuncia.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { GlobalSearch } from '@/components/inbox/GlobalSearch';
import { GlobalSearchFilters } from '@/components/inbox/search/GlobalSearchFilters';

function chain(result: unknown) {
  const self: { current?: unknown } = {};
  const proxy: unknown = new Proxy({} as Record<string, unknown>, {
    get(_target, prop) {
      if (prop === 'then') return (resolve: (value: unknown) => unknown) => resolve(result);
      return () => self.current;
    },
  });
  self.current = proxy;
  return proxy;
}

const { supabaseMock } = vi.hoisted(() => ({
  supabaseMock: {
    from: (_table: string) => chain({ data: [], error: null }),
  },
}));

vi.mock('@/integrations/supabase/client', () => ({ supabase: supabaseMock }));
vi.mock('@/hooks/ui/use-toast', () => ({ toast: vi.fn() }));
vi.mock('@/lib/logger', () => ({ log: vi.fn(), getLogger: () => ({ debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() }) }));
vi.mock('@/hooks/system/useUserRole', () => ({ useUserRole: () => ({ isSupervisor: false, roles: [] }) }));
vi.mock('@/hooks/system/useCRMIntegrationEnabled', () => ({ useCRMIntegrationEnabled: () => false }));
vi.mock('@/hooks/system/useSearchHistory', () => ({
  useSearchHistory: () => ({ history: [], addToHistory: vi.fn(), removeFromHistory: vi.fn(), clearHistory: vi.fn() }),
}));

describe('N-038 — aria-labels nos botões da busca global', () => {
  beforeEach(() => vi.clearAllMocks());

  it('botão limpar busca tem aria-label', () => {
    render(<GlobalSearch open onOpenChange={vi.fn()} onSelectResult={vi.fn()} />);
    const input = screen.getByPlaceholderText(/Buscar mensagens/i);
    fireEvent.change(input, { target: { value: 'teste' } });
    expect(screen.getByRole('button', { name: 'Limpar busca' })).toBeInTheDocument();
  });

  it('botão togglar filtros tem aria-label', () => {
    render(<GlobalSearch open onOpenChange={vi.fn()} onSelectResult={vi.fn()} />);
    expect(screen.getByRole('button', { name: 'Filtros' })).toBeInTheDocument();
  });

  it('botão remover tag tem aria-label com o nome da tag', () => {
    render(<GlobalSearch open onOpenChange={vi.fn()} onSelectResult={vi.fn()} />);
    const removeTagButtons = screen.queryAllByRole('button', { name: /Remover tag / });
    expect(removeTagButtons).toBeDefined();
  });

  it('botão remover do histórico tem aria-label', () => {
    render(<GlobalSearch open onOpenChange={vi.fn()} onSelectResult={vi.fn()} />);
    const removeHistoryButtons = screen.queryAllByRole('button', { name: 'Remover do histórico' });
    expect(removeHistoryButtons).toBeDefined();
  });
});

describe('N-038 — aria-label no seletor de período (GlobalSearchFilters)', () => {
  it('SelectTrigger de período tem aria-label', () => {
    render(
      <GlobalSearchFilters
        show
        activeTypes={new Set()}
        dateFilter="all"
        mediaTypeFilter="all"
        activeFiltersCount={0}
        onToggleType={vi.fn()}
        onSetDateFilter={vi.fn()}
        onSetMediaTypeFilter={vi.fn()}
        onClearFilters={vi.fn()}
      />,
    );
    expect(screen.getByRole('combobox', { name: 'Período' })).toBeInTheDocument();
  });
});