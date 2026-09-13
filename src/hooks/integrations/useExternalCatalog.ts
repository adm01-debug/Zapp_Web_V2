import { useState, useCallback } from 'react';
import { getLogger } from '@/lib/logger';

const log = getLogger('ExternalCatalog');
import { useQuery, useQueryClient, keepPreviousData } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

// ─── Types ────────────────────────────────────────────────────
export interface ExternalCategory {
  id: string;
  name: string;
  slug: string;
  parent_id: string | null;
  // E25 — enriquecidos; opcionais pq CategoryChips (E18) já usava o tipo
  // básico e algumas categorias legadas (ex.: "Outros") não têm icon/color_hex.
  level?: number;
  path?: string;
  full_path_readable?: string | null;
  icon?: string | null;
  color_hex?: string | null;
  image_url?: string | null;
  products_count?: number;
  display_order?: number;
}

export interface ExternalSupplier {
  id: string;
  name: string;
  // E25 — enriquecidos. logo_url hoje é sempre null (nenhum fornecedor
  // tem logo cadastrado no PromoGifts) — UI precisa de fallback sem logo.
  trading_name?: string | null;
  logo_url?: string | null;
  is_product_supplier?: boolean;
  low_stock_threshold?: number | null;
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
  // E22 — filtros avançados (edge promogifts-catalog)
  is_featured?: boolean;
  is_new?: boolean;
  is_bestseller?: boolean;
  is_kit?: boolean;
  allows_personalization?: boolean;
  /** 1 <= estoque <= 10 */
  low_stock?: boolean;
  price_min?: number;
  price_max?: number;
  color?: string;
  material?: string;
  has_engraving?: boolean;
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
    // E26 — mantém a página anterior visível durante a paginação/troca de
    // filtro, em vez de piscar o skeleton a cada refetch.
    placeholderData: keepPreviousData,
  });

  // Categories + suppliers (+ stats, usado por useCatalogStats) numa
  // única chamada de rede (ação bootstrap, E26) - react-query dedupe pela
  // mesma queryKey de useCatalogBootstrap() abaixo, então mesmo com esta
  // query e useCatalogStats() montados ao mesmo tempo, só 1 request sai.
  const bootstrapQuery = useCatalogBootstrapQuery(ready);
  const categoriesQuery = {
    data: bootstrapQuery.data?.categories,
    isLoading: bootstrapQuery.isLoading,
    error: bootstrapQuery.error,
  };
  const suppliersQuery = {
    data: bootstrapQuery.data?.suppliers,
    isLoading: bootstrapQuery.isLoading,
    error: bootstrapQuery.error,
  };

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

/**
 * Detalhe completo de um produto (com variantes) - usado por
 * ProductDetailDialog e SendProductDialog para carregar o produto
 * inteiro quando o resumido (da grade) ainda nao tem variants.
 * Substitui o antigo padrao useState+useEffect+fetchProduct: o
 * cache do react-query (por productId) elimina o efeito e o
 * set-state-in-effect associado.
 */
export function useExternalProduct(productId: string | undefined, options: { enabled: boolean }) {
  return useQuery({
    queryKey: ['external-catalog', 'product', productId],
    queryFn: async () => {
      const res = await invokeAction<{ data: ExternalProduct }>('get_product', { product_id: productId });
      return res.data ?? null;
    },
    enabled: options.enabled && !!productId,
    staleTime: 5 * 60 * 1000,
  });
}

/** Formato exato de public.zapp_catalog_stats() (E24), retornado pela ação catalog_stats/bootstrap. */
export interface CatalogStats {
  total: number;
  in_stock: number;
  featured: number;
  new_30d: number;
  bestseller: number;
  kits: number;
  low_stock: number;
  categories_root: number;
  suppliers_active: number;
  last_sync_at: string | null;
  last_update_at: string | null;
  by_month: { month: string; count: number }[];
}

interface CatalogBootstrap {
  categories: ExternalCategory[];
  suppliers: ExternalSupplier[];
  stats: CatalogStats;
}

/**
 * Query única e compartilhada (mesma queryKey em todo lugar que a chama)
 * para a ação bootstrap (E26): categorias + fornecedores + stats numa
 * chamada de rede só. useExternalCatalog() e useCatalogStats() leem desta
 * mesma query — o react-query dedupe pela queryKey, então montar os dois
 * hooks ao mesmo tempo ainda dispara só 1 request.
 */
function useCatalogBootstrapQuery(enabled: boolean) {
  return useQuery({
    queryKey: ['external-catalog', 'bootstrap'],
    queryFn: async () => {
      const res = await invokeAction<{ data: CatalogBootstrap }>('bootstrap');
      return res.data;
    },
    enabled,
    staleTime: 10 * 60 * 1000,
    gcTime: 30 * 60 * 1000,
  });
}

/** KPIs, sincronização e série mensal do rail/topo do Catálogo (E24). */
export function useCatalogStats() {
  const bootstrap = useCatalogBootstrapQuery(true);
  return {
    data: bootstrap.data?.stats,
    isLoading: bootstrap.isLoading,
    error: bootstrap.error,
  };
}

// ─── useCatalogFavorites (E27) ──────────────────────────────────
export interface CatalogFavorite {
  id: string;
  product_id: string;
  product_name: string;
  product_sku: string | null;
  primary_image_url: string | null;
  created_at: string;
}

/**
 * Favoritos do catálogo (tabela catalog_favorites no ZAPP, RLS por
 * usuário). Mesma convenção de auth de favorite_contacts
 * (useConversationActions.ts): supabase.auth.getUser() direto, sem
 * depender do AuthProvider — mantém o hook testável isolado.
 */
export function useCatalogFavorites() {
  const queryClient = useQueryClient();

  const favoritesQuery = useQuery({
    queryKey: ['catalog-favorites'],
    queryFn: async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return [];
      const { data, error } = await supabase
        .from('catalog_favorites')
        .select('id, product_id, product_name, product_sku, primary_image_url, created_at')
        .order('created_at', { ascending: false });
      if (error) throw error;
      return (data || []) as CatalogFavorite[];
    },
    staleTime: 60 * 1000,
  });

  const favoriteIds = new Set((favoritesQuery.data || []).map((f) => f.product_id));

  const toggle = useCallback(
    async (product: { id: string; name: string; sku?: string | null; primary_image_url?: string | null }) => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      const key = ['catalog-favorites'];
      const previous = queryClient.getQueryData<CatalogFavorite[]>(key) || [];
      const isFavorite = previous.some((f) => f.product_id === product.id);

      // Optimistic update; rollback se a escrita falhar.
      if (isFavorite) {
        queryClient.setQueryData<CatalogFavorite[]>(key, previous.filter((f) => f.product_id !== product.id));
        const { error } = await supabase
          .from('catalog_favorites')
          .delete()
          .eq('product_id', product.id)
          .eq('user_id', user.id);
        if (error) {
          queryClient.setQueryData(key, previous);
          log.error('Falha ao remover favorito:', error.message);
        }
      } else {
        const optimisticEntry: CatalogFavorite = {
          id: `optimistic-${product.id}`,
          product_id: product.id,
          product_name: product.name,
          product_sku: product.sku ?? null,
          primary_image_url: product.primary_image_url ?? null,
          created_at: new Date().toISOString(),
        };
        queryClient.setQueryData<CatalogFavorite[]>(key, [optimisticEntry, ...previous]);
        const { error } = await supabase.from('catalog_favorites').insert({
          user_id: user.id,
          product_id: product.id,
          product_name: product.name,
          product_sku: product.sku ?? null,
          primary_image_url: product.primary_image_url ?? null,
        });
        if (error) {
          queryClient.setQueryData(key, previous);
          log.error('Falha ao favoritar:', error.message);
        }
      }
      await queryClient.invalidateQueries({ queryKey: key });
    },
    [queryClient]
  );

  return {
    favorites: favoritesQuery.data || [],
    favoriteIds,
    isFavorite: (productId: string) => favoriteIds.has(productId),
    isLoading: favoritesQuery.isLoading,
    toggle,
  };
}
