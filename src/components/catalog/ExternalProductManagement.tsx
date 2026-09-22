import React, { useState, useEffect, useCallback, useRef } from 'react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Search,
  Package,
  Grid3X3,
  List,
  X,
  ExternalLink,
  RefreshCw,
  ChevronDown,
  SlidersHorizontal,
  CheckSquare,
} from 'lucide-react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { motion, AnimatePresence } from 'framer-motion';
import { useExternalCatalog, useCatalogStats, useCatalogFavorites, ExternalProduct, type CatalogStats } from '@/hooks/integrations/useExternalCatalog';
import { ExternalProductCard } from './ExternalProductCard';
import { CatalogProductCardSkeleton } from './CatalogProductCard';
import { SendProductDialog } from './SendProductDialog';
import { ModuleHeader, fmtAgo, AlertCard, TalkXPagination } from '@/components/talkx/talkxShared';
import { CatalogKpiStrip, CategoryChips, AdvancedFilterChips, countAdvancedFilters, type AdvancedFilters } from './catalogShared';
import { CatalogAdvancedFilters } from './CatalogAdvancedFilters';
import { parseCatalogCategoryRoute, replaceCatalogCategoryRoute } from './catalogCategoryRoute';
import { CatalogBulkBar } from './CatalogBulkBar';
import { cn } from '@/lib/utils';

function SyncStatusChip({ lastSyncAt }: { lastSyncAt: string | null | undefined }) {
  const [isFresh] = useState(() => {
    if (!lastSyncAt) return true;
    return Date.now() - new Date(lastSyncAt).getTime() < 24 * 60 * 60 * 1000;
  });
  if (!lastSyncAt) return null;
  const label = isFresh
    ? 'Sincronizado ' + fmtAgo(lastSyncAt)
    : 'Última sincronização em ' + new Date(lastSyncAt).toLocaleDateString('pt-BR') + ' ' + new Date(lastSyncAt).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
  return (
    <span className={cn(
      'flex items-center gap-1.5 text-[12px] font-medium px-2.5 py-1 rounded-full border',
      isFresh ? 'text-success border-success/30 bg-success/10' : 'text-muted-foreground border-border bg-muted/30'
    )}>
      <span className={cn('w-1.5 h-1.5 rounded-full', isFresh ? 'bg-success animate-pulse' : 'bg-muted-foreground')} />
      {label}
    </span>
  );
}

const PAGE_SIZE_OPTIONS = [24, 48, 96] as const;
type PageSizeOption = typeof PAGE_SIZE_OPTIONS[number];

function readPageParam(): number {
  try {
    const p = parseInt(new URLSearchParams(window.location.search).get('page') ?? '1', 10);
    return isNaN(p) || p < 1 ? 0 : p - 1;
  } catch { return 0; }
}

export const ExternalProductManagement: React.FC = () => {
  const { data: stats, isLoading: statsLoading, error: statsError } = useCatalogStats();
  const {
    products,
    totalProducts,
    categories,
    suppliers,
    loading,
    error,
    fetchProducts,
    fetchCategories,
    fetchSuppliers,
  } = useExternalCatalog();

  const [search, setSearch] = useState('');
  const [categoryId, setCategoryId] = useState<string>(
    () => parseCatalogCategoryRoute(window.location.search).categoryId ?? 'all'
  );

  const handleCategoryChange = useCallback((id: string) => {
    setCategoryId(id);
    replaceCatalogCategoryRoute(id === 'all' ? null : id);
  }, []);
  const [supplierId, setSupplierId] = useState<string>('all');
  const [onlyInStock, setOnlyInStock] = useState(false);
  const [isFeatured, setIsFeatured] = useState(false);
  const [isNew, setIsNew] = useState(false);
  const [viewMode, setViewMode] = useState<'grid' | 'list'>(
    () => (localStorage.getItem('catalog.view') as 'grid' | 'list') ?? 'grid'
  );
  const [page, setPageState] = useState(() => readPageParam());
  const [pageSize, setPageSizeState] = useState<PageSizeOption>(() => {
    const stored = parseInt(sessionStorage.getItem('catalog.page_size') ?? '24', 10);
    return (PAGE_SIZE_OPTIONS as readonly number[]).includes(stored) ? stored as PageSizeOption : 24;
  });
  const [orderBy, setOrderBy] = useState<string>(() => sessionStorage.getItem('catalog.order_by') ?? 'name');
  const [ascending, setAscending] = useState<boolean>(() => sessionStorage.getItem('catalog.ascending') !== 'false');

  const [advancedOpen, setAdvancedOpen] = useState(false);
  const [advFilters, setAdvFilters] = useState<AdvancedFilters>({ isBestseller: false, priceMin: '', priceMax: '' });
  const advCount = countAdvancedFilters(advFilters);

  // E43: favoritos Supabase
  const { isFavorite: isFav, toggle } = useCatalogFavorites();
  const handleToggleFavorite = useCallback((id: string) => {
    const p = products.find((x) => x.id === id);
    if (p) toggle({ id, name: p.name, sku: p.sku, primary_image_url: p.primary_image_url });
  }, [products, toggle]);

  // E47: seleção em massa
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const toggleSelectProduct = useCallback((id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) { next.delete(id); } else { next.add(id); }
      return next;
    });
  }, []);
  // clearSelection usa setSelectedIds (estável, vem do useState) — sem dep extra necessário.
  const clearSelection = useCallback(() => setSelectedIds(new Set()), []);
  const toggleSelectAll = useCallback(() => {
    const pageIds = products.map((p) => p.id);
    const allSelected = pageIds.every((id) => selectedIds.has(id));
    if (allSelected) {
      setSelectedIds((prev) => {
        const next = new Set(prev);
        pageIds.forEach((id) => next.delete(id));
        return next;
      });
    } else {
      setSelectedIds((prev) => {
        const next = new Set(prev);
        pageIds.forEach((id) => next.add(id));
        return next;
      });
    }
  }, [products, selectedIds]);
  const allPageSelected = products.length > 0 && products.every((p) => selectedIds.has(p.id));

  const [bulkSendProduct, setBulkSendProduct] = useState<ExternalProduct | null>(null);
  const handleBulkSend = useCallback(() => {
    const firstId = [...selectedIds][0];
    const p = products.find((x) => x.id === firstId);
    if (p) setBulkSendProduct(p);
  }, [selectedIds, products]);

  const gridRef = useRef<HTMLDivElement>(null);

  // setPage: usa setSelectedIds directamente (sem ref) — setSelectedIds é estável
  const setPage = useCallback((p: number | ((prev: number) => number)) => {
    setPageState((prev) => {
      const next = typeof p === 'function' ? p(prev) : p;
      try {
        const url = new URL(window.location.href);
        if (next === 0) { url.searchParams.delete('page'); } else { url.searchParams.set('page', String(next + 1)); }
        history.replaceState(null, '', url.toString());
      } catch { /* ignore */ }
      return next;
    });
    // limpa seleção ao trocar de página; setSelectedIds é estável e não exige dep
    setSelectedIds(new Set());
  }, []);

  const setPageSize = useCallback((ps: PageSizeOption) => {
    setPageSizeState(ps);
    sessionStorage.setItem('catalog.page_size', String(ps));
    setPage(0);
  }, [setPage]);

  const parentCategories = categories.filter((c) => !c.parent_id);
  const getSubcategories = (parentId: string) => categories.filter((c) => c.parent_id === parentId);

  const buildFilters = useCallback((pageOverride?: number, sizeOverride?: number): Record<string, unknown> => {
    const currentPage = pageOverride ?? page;
    const currentSize = sizeOverride ?? pageSize;
    const params: Record<string, unknown> = {
      limit: currentSize,
      offset: currentPage * currentSize,
      only_in_stock: onlyInStock,
    };
    if (search) params.search = search;
    if (categoryId !== 'all') params.category_id = categoryId;
    if (supplierId !== 'all') params.supplier_id = supplierId;
    if (isFeatured) params.is_featured = true;
    if (isNew) params.is_new = true;
    const effectiveOrder = search ? orderBy : (orderBy === 'name' ? 'name' : orderBy);
    params.order_by = effectiveOrder;
    params.ascending = ascending;
    if (advFilters.isBestseller) params.is_bestseller = true;
    if (advFilters.priceMin) params.price_min = parseFloat(advFilters.priceMin);
    if (advFilters.priceMax) params.price_max = parseFloat(advFilters.priceMax);
    return params;
  }, [page, pageSize, search, categoryId, supplierId, onlyInStock, isFeatured, isNew, orderBy, ascending, advFilters]);

  useEffect(() => {
    fetchCategories();
    fetchSuppliers();
    fetchProducts(buildFilters());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const parsed = parseCatalogCategoryRoute(window.location.search);
    if (parsed.needsNormalization) replaceCatalogCategoryRoute(null);
  }, []);

  useEffect(() => {
    const t = setTimeout(() => {
      setPage(0);
      fetchProducts(buildFilters(0));
    }, 300);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search, categoryId, supplierId, onlyInStock, isFeatured, isNew, orderBy, ascending, advFilters, pageSize]);

  useEffect(() => {
    if (page > 0) {
      fetchProducts(buildFilters());
      gridRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page]);

  const totalPages = Math.ceil(totalProducts / pageSize);
  const hasFilters = search || categoryId !== 'all' || supplierId !== 'all' || onlyInStock || isFeatured || isNew || advCount > 0;

  const clearFilters = () => {
    setSearch('');
    setCategoryId('all');
    setSupplierId('all');
    setOnlyInStock(false);
    setIsFeatured(false);
    setIsNew(false);
    setOrderBy('name');
    setAscending(true);
    setPage(0);
    sessionStorage.removeItem('catalog.order_by');
    sessionStorage.removeItem('catalog.ascending');
    setAdvFilters({ isBestseller: false, priceMin: '', priceMax: '' });
  };

  type SortOption = { label: string; order_by: string; ascending: boolean };
  const SORT_OPTIONS: SortOption[] = [
    { label: 'Nome A–Z', order_by: 'name', ascending: true },
    { label: 'Nome Z–A', order_by: 'name', ascending: false },
    { label: 'Menor preço', order_by: 'sale_price', ascending: true },
    { label: 'Maior preço', order_by: 'sale_price', ascending: false },
    { label: 'Maior estoque', order_by: 'stock_quantity', ascending: false },
    { label: 'Mais recentes', order_by: 'created_at', ascending: false },
    { label: 'Mais pedidos', order_by: 'order_count', ascending: false },
  ];
  const sortKey = orderBy + ':' + String(ascending);
  const currentSort = SORT_OPTIONS.find((o) => o.order_by === orderBy && o.ascending === ascending) ?? SORT_OPTIONS[0];

  const applySort = (key: string) => {
    const opt = SORT_OPTIONS.find((o) => o.order_by + ':' + String(o.ascending) === key);
    if (!opt) return;
    setOrderBy(opt.order_by);
    setAscending(opt.ascending);
    sessionStorage.setItem('catalog.order_by', opt.order_by);
    sessionStorage.setItem('catalog.ascending', String(opt.ascending));
    setPage(0);
  };

  const handleViewMode = (mode: 'grid' | 'list') => {
    setViewMode(mode);
    localStorage.setItem('catalog.view', mode);
  };

  const handleKpiSelect = (key: keyof CatalogStats) => {
    if (key === 'in_stock') setOnlyInStock(true);
    else if (key === 'featured') setIsFeatured(true);
    else if (key === 'new_30d') setIsNew(true);
  };

  const [sendProduct, setSendProduct] = useState<ExternalProduct | null>(null);
  const handleSendProduct = (product: ExternalProduct) => { setSendProduct(product); };

  return (
    <div className="w-full min-w-0 xl:grid xl:grid-cols-[1fr_300px] 2xl:grid-cols-[1fr_320px] xl:gap-6">
    <div className="space-y-6 min-w-0">
      <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }}>
        {statsLoading ? (
          <div className="flex items-center gap-3.5">
            <Skeleton className="w-14 h-14 rounded-2xl shrink-0" />
            <div className="space-y-2 flex-1">
              <Skeleton className="h-7 w-64" />
              <Skeleton className="h-4 w-96" />
            </div>
          </div>
        ) : (
          <ModuleHeader
            icon={Package}
            color="blue"
            title="Catálogo de Produtos"
            subtitle={(stats?.total ?? totalProducts).toLocaleString('pt-BR') + ' produtos sincronizados em tempo real com o PromoGifts. Gerencie, edite e compartilhe produtos.'}
            right={(
              <>
                <SyncStatusChip key={stats?.last_sync_at} lastSyncAt={stats?.last_sync_at} />
                <Button variant="outline" size="sm" onClick={() => fetchProducts(buildFilters())}>
                  <RefreshCw className="w-4 h-4 mr-1" />
                  Atualizar
                </Button>
                <Button variant="outline" size="sm" asChild>
                  <a href="https://promogifts.com.br" target="_blank" rel="noopener noreferrer">
                    <ExternalLink className="w-4 h-4 mr-1" />
                    Gerenciar no PromoGifts
                  </a>
                </Button>
              </>
            )}
          />
        )}
      </motion.div>

      {statsError ? (
        <AlertCard tone="warning">Não foi possível carregar os indicadores do catálogo agora.</AlertCard>
      ) : (
        <CatalogKpiStrip stats={stats} loading={statsLoading} onSelect={handleKpiSelect} />
      )}

      <AdvancedFilterChips
        filters={advFilters}
        onChange={(next) => { setAdvFilters(next); setPage(0); }}
      />

      {parentCategories.length > 0 && (
        <CategoryChips
          categories={parentCategories}
          activeId={categoryId === 'all' ? null : categoryId}
          onChange={(id) => handleCategoryChange(id ?? 'all')}
        />
      )}

      <div className="flex flex-wrap gap-3">
        <div className="flex-1 min-w-[250px] relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            placeholder="Buscar por nome, SKU ou marca..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
          />
          {search && (
            <Button variant="ghost" size="icon" className="absolute right-1 top-1/2 -translate-y-1/2 h-7 w-7" onClick={() => setSearch('')}>
              <X className="w-4 h-4" />
            </Button>
          )}
        </div>

        <Select value={categoryId} onValueChange={handleCategoryChange}>
          <SelectTrigger className="w-[200px]">
            <SelectValue placeholder="Categoria" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todas categorias</SelectItem>
            {parentCategories.map((cat) => {
              const subs = getSubcategories(cat.id);
              return (
                <React.Fragment key={cat.id}>
                  <SelectItem value={cat.id} className="font-semibold">{cat.name}</SelectItem>
                  {subs.map((sub) => (
                    <SelectItem key={sub.id} value={sub.id} className="pl-6 text-sm">
                      {sub.name}
                    </SelectItem>
                  ))}
                </React.Fragment>
              );
            })}
          </SelectContent>
        </Select>

        <Select value={supplierId} onValueChange={setSupplierId}>
          <SelectTrigger className="w-[170px]">
            <SelectValue placeholder="Fornecedor" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos fornecedores</SelectItem>
            {suppliers.map((s) => (
              <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>
            ))}
          </SelectContent>
        </Select>

        <div className="flex items-center gap-2">
          <Switch id="stock-mgmt" checked={onlyInStock} onCheckedChange={setOnlyInStock} />
          <Label htmlFor="stock-mgmt" className="text-sm cursor-pointer">Em estoque</Label>
        </div>

        <div className="flex border rounded-md">
          <Button variant={viewMode === 'grid' ? 'secondary' : 'ghost'} size="icon" className="rounded-r-none" onClick={() => handleViewMode('grid')} title="Grade">
            <Grid3X3 className="w-4 h-4" />
          </Button>
          <Button variant={viewMode === 'list' ? 'secondary' : 'ghost'} size="icon" className="rounded-l-none" onClick={() => handleViewMode('list')} title="Lista">
            <List className="w-4 h-4" />
          </Button>
        </div>

        <Button
          variant={selectedIds.size > 0 ? 'secondary' : 'outline'}
          size="sm"
          onClick={selectedIds.size > 0 ? clearSelection : toggleSelectAll}
          className="gap-1.5"
        >
          <CheckSquare className="w-4 h-4" />
          {selectedIds.size > 0 ? `${selectedIds.size} selecionado${selectedIds.size > 1 ? 's' : ''}` : 'Selecionar'}
        </Button>

        <Button variant="outline" size="sm" onClick={() => setAdvancedOpen(true)} className="relative">
          <SlidersHorizontal className="w-4 h-4 mr-1.5" />
          Filtros avançados
          {advCount > 0 && (
            <span className="absolute -top-1.5 -right-1.5 w-4 h-4 rounded-full bg-primary text-primary-foreground text-[9px] font-bold flex items-center justify-center">
              {advCount}
            </span>
          )}
        </Button>
      </div>

      <div className="flex items-center justify-between text-sm text-muted-foreground">
        <span className="tabular-nums">
          {loading
            ? 'Carregando...'
            : totalProducts === 0
              ? 'Nenhum produto'
              : <>Mostrando <span className="font-medium text-foreground">{Math.min(page * pageSize + 1, totalProducts).toLocaleString('pt-BR')}–{Math.min((page + 1) * pageSize, totalProducts).toLocaleString('pt-BR')}</span> de <span className="font-medium text-foreground">{totalProducts.toLocaleString('pt-BR')}</span></>
          }
        </span>
        <div className="flex items-center gap-3">
          {hasFilters && (
            <Button variant="link" size="sm" onClick={clearFilters} className="h-auto p-0">
              Limpar filtros
            </Button>
          )}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="sm" className="h-7 gap-1 text-muted-foreground hover:text-foreground">
                Ordenar: {currentSort.label}
                <ChevronDown className="w-3.5 h-3.5" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuRadioGroup value={sortKey} onValueChange={applySort}>
                {SORT_OPTIONS.map((opt) => (
                  <DropdownMenuRadioItem
                    key={opt.order_by + ':' + String(opt.ascending)}
                    value={opt.order_by + ':' + String(opt.ascending)}
                  >
                    {opt.label}
                  </DropdownMenuRadioItem>
                ))}
              </DropdownMenuRadioGroup>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      {error && (
        <AlertCard tone="danger">
          {error}
          <Button variant="link" size="sm" className="h-auto p-0 ml-2" onClick={() => fetchProducts(buildFilters())}>
            Tentar de novo
          </Button>
        </AlertCard>
      )}

      <div ref={gridRef}>
        {loading ? (
          <div className={viewMode === 'grid' ? 'grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4' : 'space-y-3'}>
            {[...Array(pageSize)].map((_, i) => (
              viewMode === 'grid'
                ? <CatalogProductCardSkeleton key={i} mode="grade" />
                : <CatalogProductCardSkeleton key={i} mode="list" />
            ))}
          </div>
        ) : products.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-muted-foreground gap-3">
            <Package className="w-16 h-16 opacity-40" />
            {hasFilters ? (
              <>
                <p className="font-medium text-lg text-foreground">Nenhum produto com esses filtros</p>
                <p className="text-sm">Tente remover ou ajustar os filtros de busca.</p>
                <Button variant="outline" size="sm" onClick={clearFilters}>Limpar filtros</Button>
              </>
            ) : (
              <>
                <p className="font-medium text-lg text-foreground">Catálogo vazio</p>
                <p className="text-sm">Nenhum produto sincronizado ainda.</p>
                <Button variant="outline" size="sm" asChild>
                  <a href="https://promogifts.com.br" target="_blank" rel="noopener noreferrer">
                    <ExternalLink className="w-4 h-4 mr-1" />Gerenciar no PromoGifts
                  </a>
                </Button>
              </>
            )}
          </div>
        ) : (
          <AnimatePresence mode="popLayout">
            <motion.div
              layout
              className={
                viewMode === 'grid'
                  ? 'grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4'
                  : 'space-y-2'
              }
            >
              {products.map((product) => (
                <motion.div
                  key={product.id}
                  layout
                  initial={{ opacity: 0, scale: 0.95 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.95 }}
                >
                  <ExternalProductCard
                    product={product}
                    onSend={handleSendProduct}
                    compact={viewMode === 'list'}
                    isFavorite={isFav(product.id)}
                    onToggleFavorite={handleToggleFavorite}
                    isSelected={selectedIds.has(product.id)}
                    onToggleSelect={toggleSelectProduct}
                  />
                </motion.div>
              ))}
            </motion.div>
          </AnimatePresence>
        )}
      </div>

      {totalPages > 1 && (
        <TalkXPagination
          page={page + 1}
          pageSize={pageSize}
          total={totalProducts}
          onPage={(p) => setPage(p - 1)}
          onPageSize={(ps) => setPageSize(ps as PageSizeOption)}
          noun="produto"
        />
      )}

      <CatalogAdvancedFilters
        key={String(advancedOpen)}
        open={advancedOpen}
        onOpenChange={setAdvancedOpen}
        filters={advFilters}
        onApply={(next) => { setAdvFilters(next); setPage(0); }}
        onClear={() => { setAdvFilters({ isBestseller: false, priceMin: '', priceMax: '' }); setPage(0); }}
      />

      {selectedIds.size > 0 && (
        <CatalogBulkBar
          count={selectedIds.size}
          pageTotal={products.length}
          allPageSelected={allPageSelected}
          onToggleSelectAll={toggleSelectAll}
          onClear={clearSelection}
          onSend={handleBulkSend}
        />
      )}

      {sendProduct && (
        <SendProductDialog
          product={sendProduct}
          open={!!sendProduct}
          onOpenChange={(open) => { if (!open) setSendProduct(null); }}
        />
      )}

      {bulkSendProduct && (
        <SendProductDialog
          product={bulkSendProduct}
          open={!!bulkSendProduct}
          onOpenChange={(open) => { if (!open) { setBulkSendProduct(null); clearSelection(); } }}
        />
      )}
    </div>

    <aside className="catalog-rail sticky top-4 hidden xl:block" />
    </div>
  );
};
