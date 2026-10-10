import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ExternalProductCatalog } from '../src/components/catalog/ExternalProductCatalog';
import type { ExternalProduct } from '@/hooks/integrations/useExternalCatalog';

const reduceMotion = { value: false };

vi.mock('framer-motion', async (importOriginal) => {
  const actual = await importOriginal<typeof import('framer-motion')>();
  return { ...actual, useReducedMotion: () => reduceMotion.value };
});

const mockCatalog = vi.fn();
const mockFavorites = vi.fn();

vi.mock('@/hooks/integrations/useExternalCatalog', () => ({
  useExternalCatalog: (...args: unknown[]) => mockCatalog(...args),
  useCatalogFavorites: (...args: unknown[]) => mockFavorites(...args),
  useExternalProduct: () => ({ data: null, isFetching: false }),
}));

vi.mock('../src/components/catalog/CatalogProductCard', () => ({
  CatalogProductCard: ({ product }: { product: ExternalProduct }) => (
    <div data-testid={`card-${product.id}`}>{product.name}</div>
  ),
  CatalogProductCardSkeleton: () => <div data-testid="skeleton" />,
}));

vi.mock('../src/components/catalog/SendProductDialog', () => ({
  SendProductDialog: () => <div data-testid="send-dialog" />,
}));

const product = (id: string, name: string): ExternalProduct =>
  ({ id, name, sku: `SKU-${id}`, sale_price: 10, stock_quantity: 5, variants: [] } as unknown as ExternalProduct);

const renderCatalog = () => {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <ExternalProductCatalog open onOpenChange={vi.fn()} />
    </QueryClientProvider>
  );
};

const cardWrapper = (id: string) => screen.getByTestId(`card-${id}`).parentElement as HTMLElement;

describe('Debug CT70 pattern', () => {
  beforeEach(() => {
    reduceMotion.value = false;
    mockCatalog.mockReset();
    mockFavorites.mockReset();
    mockCatalog.mockReturnValue({
      products: [product('p1', 'Caneta Bambu')],
      totalProducts: 1,
      categories: [],
      suppliers: [],
      loading: false,
      error: null,
      errorCode: null,
      errorStatus: null,
      fetchProducts: vi.fn(),
      fetchCategories: vi.fn(),
      fetchSuppliers: vi.fn(),
    });
    mockFavorites.mockReturnValue({
      favorites: [],
      favoriteIds: new Set<string>(),
      isFavorite: () => false,
      isLoading: false,
      toggle: vi.fn(),
    });
  });

  it('debug CT70 pattern - reduced motion true', () => {
    reduceMotion.value = true;
    renderCatalog();
    const wrapper = cardWrapper('p1');
    console.log('CT70_REDUCED_TRUE - style.opacity:', JSON.stringify(wrapper.style.opacity));
    console.log('CT70_REDUCED_TRUE - style.cssText:', JSON.stringify(wrapper.style.cssText));
    console.log('CT70_REDUCED_TRUE - tagName:', wrapper.tagName);
    console.log('CT70_REDUCED_TRUE - children:', wrapper.children.length);
    if (wrapper.children.length > 0) {
      const child = wrapper.children[0] as HTMLElement;
      console.log('CT70_REDUCED_TRUE - child tag:', child.tagName);
      console.log('CT70_REDUCED_TRUE - child style.opacity:', JSON.stringify(child.style.opacity));
      console.log('CT70_REDUCED_TRUE - child style.cssText:', JSON.stringify(child.style.cssText));
      console.log('CT70_REDUCED_TRUE - child attributes:', Array.from(child.attributes).map((a: Attr) => `${a.name}="${a.value}"`).join(', '));
    }
  });
});
