/**
 * Auditoria de exports do catálogo — caminho REAL do catálogo do chat
 * (`ExternalProductCatalog`): "Exportar seleção".
 *
 * O `logAudit` REAL roda (sem mock de `@/lib/audit`); a RPC do Supabase é
 * interceptada no client e o `triggerCsvDownload` é interceptado no módulo —
 * a prova é a ORDEM (auditoria ANTES do download) e o `p_action` enviado.
 * O `user_id` é anexado no SQL (`auth.uid()` em `log_audit_event`).
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ExternalProductCatalog } from '../ExternalProductCatalog';
import type { ExternalProduct } from '@/hooks/integrations/useExternalCatalog';

const toastSuccess = vi.fn();
const toastError = vi.fn();
vi.mock('sonner', () => ({
  toast: Object.assign(vi.fn(), {
    success: (...a: unknown[]) => toastSuccess(...a),
    error: (...a: unknown[]) => toastError(...a),
    info: vi.fn(), warning: vi.fn(), loading: vi.fn(), dismiss: vi.fn(),
  }),
}));

const reduceMotion = vi.hoisted(() => ({ value: false }));
vi.mock('framer-motion', async (importOriginal) => {
  const actual = await importOriginal<typeof import('framer-motion')>();
  return { ...actual, useReducedMotion: () => reduceMotion.value };
});

const mockUseAuth = vi.fn();
vi.mock('@/hooks/auth/useAuth', () => ({
  useAuth: (...args: unknown[]) => mockUseAuth(...args),
  useIsCatalogAdmin: () => ({ isAdmin: true }),
}));

const mockCatalog = vi.fn();
const mockFavorites = vi.fn();
vi.mock('@/hooks/integrations/useExternalCatalog', () => ({
  useExternalCatalog: () => mockCatalog(),
  useCatalogFavorites: (...args: unknown[]) => mockFavorites(...args),
  useExternalProduct: () => ({ data: null, isFetching: false }),
}));

// Permissão mutável por teste: liberada por padrão, bloqueada no teste do gate.
const permissao = vi.hoisted(() => ({ valor: true }));
vi.mock('@/hooks/system/useDownloadPermission', () => ({
  useDownloadPermission: () => ({ canDownload: permissao.valor, isLoading: false }),
}));

vi.mock('../CatalogProductCard', () => ({
  CatalogProductCard: ({ product, isSelected, onToggleSelect }: {
    product: ExternalProduct; isSelected?: boolean; onToggleSelect?: (id: string) => void;
  }) => (
    <div data-testid={`card-${product.id}`} data-selected={String(!!isSelected)}>
      <span>{product.name}</span>
      <button type="button" onClick={() => onToggleSelect?.(product.id)}>Selecionar item</button>
    </div>
  ),
  CatalogProductCardSkeleton: () => <div data-testid="skeleton" />,
}));

vi.mock('../SendProductDialog', () => ({ SendProductDialog: () => null }));
vi.mock('../CatalogBulkSendDialog', () => ({ CatalogBulkSendDialog: () => null }));

// O download do CSV é interceptado para provar a ORDEM (auditoria antes dele).
const triggerCsvDownload = vi.fn();
vi.mock('../catalogExport', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../catalogExport')>();
  return { ...actual, triggerCsvDownload: (...args: unknown[]) => triggerCsvDownload(...args) };
});

// RPC de auditoria interceptada no client (o logAudit REAL a chama). Este
// módulo não usa `supabase.from` em nenhum caminho renderizado aqui.
const { rpcMock } = vi.hoisted(() => ({ rpcMock: vi.fn(async () => ({ error: null })) }));
vi.mock('@/integrations/supabase/client', () => ({ supabase: { rpc: rpcMock } }));

const product = (id: string, name = `Produto ${id}`): ExternalProduct =>
  ({ id, name, sku: `SKU-${id}`, slug: `slug-${id}`, sale_price: 10, stock_quantity: 5, variants: [] } as unknown as ExternalProduct);

const baseCatalog = (products: ExternalProduct[]) => ({
  products,
  totalProducts: products.length,
  categories: [],
  suppliers: [],
  loading: false,
  isInitialLoading: false,
  isFetching: false,
  error: null,
  errorCode: null,
  errorStatus: null,
  fetchProducts: vi.fn(),
  fetchCategories: vi.fn(),
  fetchSuppliers: vi.fn(),
});

const renderCatalog = () => {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <ExternalProductCatalog open onOpenChange={vi.fn()} />
    </QueryClientProvider>,
  );
};

beforeEach(() => {
  reduceMotion.value = false;
  mockCatalog.mockReset();
  mockFavorites.mockReset();
  triggerCsvDownload.mockReset();
  rpcMock.mockClear();
  toastSuccess.mockReset();
  toastError.mockReset();
  permissao.valor = true;
  mockUseAuth.mockReset();
  mockUseAuth.mockReturnValue({ user: { id: 'u1' }, profile: null, loading: false });
  mockCatalog.mockReturnValue(baseCatalog([product('p1'), product('p2'), product('p3')]));
  mockFavorites.mockReturnValue({
    favorites: [],
    favoriteIds: new Set<string>(),
    isFavorite: () => false,
    isLoading: false,
    toggle: vi.fn(),
  });
});

describe('Auditoria — "Exportar seleção" do catálogo do chat (caminho real)', () => {
  it('audita ANTES de baixar: RPC com catalog_export precede o download', async () => {
    renderCatalog();

    fireEvent.click(screen.getByRole('button', { name: 'Selecionar' }));
    fireEvent.click(screen.getAllByRole('button', { name: 'Selecionar item' })[0]);
    fireEvent.click(screen.getByRole('button', { name: 'Exportar seleção' }));

    await waitFor(() => expect(rpcMock).toHaveBeenCalledTimes(1));
    expect(rpcMock).toHaveBeenCalledWith(
      'log_audit_event',
      expect.objectContaining({
        p_action: 'catalog_export',
        p_entity_type: 'catalog_export',
        p_entity_id: expect.stringContaining('selecao'),
        p_details: expect.objectContaining({ filter: 'selecao', rows: 1 }),
      }),
    );
    expect(triggerCsvDownload).toHaveBeenCalledTimes(1);
    expect(rpcMock.mock.invocationCallOrder[0]).toBeLessThan(
      triggerCsvDownload.mock.invocationCallOrder[0],
    );
  });

  it('sem permissão: não audita nem baixa', async () => {
    permissao.valor = false;
    renderCatalog();

    fireEvent.click(screen.getByRole('button', { name: 'Selecionar' }));
    fireEvent.click(screen.getAllByRole('button', { name: 'Selecionar item' })[0]);
    fireEvent.click(screen.getByRole('button', { name: 'Exportar seleção' }));

    await waitFor(() => expect(screen.getByRole('button', { name: 'Exportar seleção' })).toBeInTheDocument());
    expect(rpcMock).not.toHaveBeenCalled();
    expect(triggerCsvDownload).not.toHaveBeenCalled();
  });
});
