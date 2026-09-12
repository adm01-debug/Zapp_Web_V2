import { useState, useCallback } from 'react';
import { getLogger } from '@/lib/logger';

const log = getLogger('ExternalCatalog');
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

// ─── Types ────────────────────────────────────────────────────
export interface ExternalCategory {
  id: string;
  name: string;
  slug: string;
  parent_id: string | null;
}

export interface ExternalSupplier {
  id: string;
  name: string;
}

export interface ExternalProductVariant {
  id: string;
  product_id: string;
  sku: string;
  name: string;
  attributes: Record<string, string> | null;
  stock_quantity: number;
  color_name: string | null;
  color_hex: string | null;
  size_code: string | null;
  capacity_ml: number | null;
  selected_thumbnail: string | null;
  is_active: boolean;
  // E21 — vêm de get_product (select *); ausentes na lista.
  images?: string[] | null;
  supplier_sku?: string | null;
  next_entry_date?: string | null;
  next_entry_quantity?: number | null;
}

/** Item de products.color_swatches (jsonb) no PromoGifts. */
export interface ExternalColorSwatch {
  sku?: string | null;
  color_id?: string | null;
  color_name?: string | null;
  color_hex?: string | null;
  image_url?: string | null;
  variant_id?: string | null;
  is_in_stock?: boolean | null;
  stock_quantity?: number | null;
}

export interface ExternalProduct {
  id: string;
  name: string;
  description: string | null;
  short_description: string | null;
  sku: string;
  sale_price: number;
  suggested_price: number | null;
  stock_quantity: number;
  primary_image_url: string | null;
  colors: string[] | null;
  brand: string | null;
  origin_country: string | null;
  min_quantity: number | null;
  dimensions_display: string | null;
  weight_g: number | null;
  combined_sizes: string | null;
  product_type: string | null;
  is_kit: boolean;
  is_active: boolean;
  is_stockout: boolean;
  allows_personalization: boolean;
  lead_time_days: number | null;
  supply_mode: string | null;
  category_id: string | null;
  supplier_id: string | null;
  slug: string | null;
  capacity_ml: number | null;
  ncm_code: string | null;
  categories: ExternalCategory | null;
  suppliers: ExternalSupplier | null;
  variants?: ExternalProductVariant[];
  // E21 — campos da edge v2. Opcionais: list_products com compact=true não os traz.
  primary_image_fallback_url?: string | null;
  images?: string[] | null;
  color_swatches?: ExternalColorSwatch[] | null;
  materials?: string[] | null;
  tags?: string[] | null;
  is_featured?: boolean | null;
  is_new?: boolean | null;
  is_bestseller?: boolean | null;
  is_on_sale?: boolean | null;
  is_closeout?: boolean | null;
  has_gift_box?: boolean | null;
  is_featured_expires_at?: string | null;
  is_new_expires_at?: string | null;
  is_bestseller_expires_at?: string | null;
  engraving_type?: string | null;
  engraving_description?: string | null;
  main_category_id?: string | null;
  order_count?: number | null;
  view_count?: number | null;
  created_at?: string | null;
  updated_at?: string | null;
  last_sync_at?: string | null;
}

export interface CatalogFilters {
  search?: string;
  category_id?: string;
  supplier_id?: string;
  only_active?: boolean;
  only_in_stock?: boolean;
  limit?: number;
  offset?: number;
  order_by?: string;
  ascending?: boolean;
  /** Payload enxuto do card; default false (comportamento anterior). */
  compact?: boolean;
}

// ─── API invoke ───────────────────────────────────────────────
async function invokeAction<T = unknown>(action: string, params: Record<string, unknown> = {}): Promise<T> {
  const { data, error } = await supabase.functions.invoke('promogifts-catalog', {
    body: { action, params },
  });
  if (error) throw new Error(error.message);
  if (data?.error) throw new Error(data.error);
  return data as T;
}

// ─── Hook ─────────────────────────────────────────────────────
export function useExternalCatalog() {
  const queryClient = useQueryClient();
  // null = ainda nao pedido (nenhuma query dispara). Vira {} ou os filtros
  // explicitos assim que fetchProducts/fetchCategories/fetchSuppliers e
  // chamado pela primeira vez - substitui o antigo par filters+ready por
  // um unico sinal, preservando o acoplamento atual: qualquer um dos 3
  // fetch* libera as 3 queries (useExternalCatalog.test.ts depende disso
  // em 'handles concurrent fetchProducts and fetchCategories').
  const [filters, setFilters] = useState<CatalogFilters | null>(null);
  const ready = filters !== null;
  const activeFilters = filters ?? {};

  // Products query - auto-fetches quando filters muda e ready=true
  const productsQuery = useQuery({
    queryKey: ['external-catalog', 'products', activeFilters],
    queryFn: async () => {
      log.debug('Fetching products with filters:', JSON.stringify(activeFilters));
      const result = await invokeAction<{ data: ExternalProduct[]; meta: { total: number; duration_ms: number } }>(
        'list_products',
        activeFilters as Record<string, unknown>
      );
      log.debug('Got', result.data?.length, 'products, total:', result.meta?.total);
      return result;
    },
    enabled: ready,
    staleTime: 5 * 60 * 1000,
    gcTime: 10 * 60 * 1000,
    retry: 2,
  });

  // Categories
  const categoriesQuery = useQuery({
    queryKey: ['external-catalog', 'categories'],
    queryFn: async () => {
      const result = await invokeAction<{ data: ExternalCategory[] }>('list_categories');
      return result.data || [];
    },
    enabled: ready,
    staleTime: 30 * 60 * 1000,
    gcTime: 60 * 60 * 1000,
  });

  // Suppliers
  const suppliersQuery = useQuery({
    queryKey: ['external-catalog', 'suppliers'],
    queryFn: async () => {
      const result = await invokeAction<{ data: ExternalSupplier[] }>('list_suppliers');
      return result.data || [];
    },
    enabled: ready,
    staleTime: 30 * 60 * 1000,
    gcTime: 60 * 60 * 1000,
  });

  // Called by component to set filters and trigger fetch
  const fetchProducts = useCallback((newFilters: CatalogFilters = {}) => {
    setFilters(newFilters);
  }, []);

  const fetchProduct = useCallback(async (productId: string): Promise<ExternalProduct | null> => {
    try {
      const result = await queryClient.fetchQuery({
        queryKey: ['external-catalog', 'product', productId],
        queryFn: async () => {
          const res = await invokeAction<{ data: ExternalProduct }>('get_product', { product_id: productId });
          return res.data || null;
        },
        staleTime: 5 * 60 * 1000,
      });
      return result;
    } catch (err) {
      log.error('Failed to fetch product', err);
      return null;
    }
  }, [queryClient]);

  // No-op de compatibilidade: so existem para marcar "ready" sem mudar os
  // filtros de produtos ja definidos (mesmo comportamento do ready
  // compartilhado anterior). Nao fazem fetch proprio - categories/suppliers
  // sao carregados por list_categories/list_suppliers, que a propria query
  // acima ja dispara quando ready vira true.
  const fetchCategories = useCallback(() => {
    setFilters((f) => f ?? {});
  }, []);

  const fetchSuppliers = useCallback(() => {
    setFilters((f) => f ?? {});
  }, []);

  const invalidate = useCallback(() => {
    return queryClient.invalidateQueries({ queryKey: ['external-catalog'] });
  }, [queryClient]);

  return {
    products: productsQuery.data?.data || [],
    totalProducts: productsQuery.data?.meta?.total ?? 0,
    categories: categoriesQuery.data || [],
    suppliers: suppliersQuery.data || [],
    loading: productsQuery.isLoading || productsQuery.isFetching,
    /** true so durante a carga inicial (sem dado ainda) - use para nao piscar skeleton na paginacao. */
    isInitialLoading: productsQuery.isLoading,
    /** true durante qualquer fetch, incl. paginacao/refetch - use para indicador discreto de progresso. */
    isFetching: productsQuery.isFetching,
    error: productsQuery.error?.message || null,
    fetchProducts,
    fetchProduct,
    fetchCategories,
    fetchSuppliers,
    invalidate,
  };
}
