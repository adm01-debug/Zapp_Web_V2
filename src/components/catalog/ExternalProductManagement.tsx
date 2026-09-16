import React, { useState, useEffect, useCallback } from 'react';
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
  ChevronLeft,
  ChevronRight,
  ExternalLink,
  RefreshCw,
  ChevronDown,
  SlidersHorizontal,
} from 'lucide-react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { motion, AnimatePresence } from 'framer-motion';
import { useExternalCatalog, useCatalogStats, ExternalProduct, type CatalogStats } from '@/hooks/integrations/useExternalCatalog';
import { ExternalProductCard } from './ExternalProductCard';
import { toast } from '@/hooks/ui/use-toast';
import { SendProductDialog } from './SendProductDialog';
import { ModuleHeader, fmtAgo, AlertCard } from '@/components/talkx/talkxShared';
import { CatalogKpiStrip, CategoryChips } from './catalogShared';
import { parseCatalogCategoryRoute, replaceCatalogCategoryRoute } from './catalogCategoryRoute';
import { cn } from '@/lib/utils';

/** Chip "Sincronizado ha X" - mesmo padrao ponto+texto ja usado em
 * TalkXSegments/TalkXCampaignRunning (nenhum componente StatusChip
 * generico existe no projeto pra reusar). >24h vira tom neutro com
 * data/hora em vez do relativo. Date.now() so roda no inicializador
 * preguicoso do useState (unica excecao sancionada pela regra
 * react-hooks/purity para leitura de valor impuro) - o caller usa
 * key={lastSyncAt} pra forcar recalculo quando o valor muda, sem
 * precisar de effect + setState (react-hooks/set-state-in-effect). */
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


const PAGE_SIZE = 24;

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
  // E34: deep link ?view=catalog&cat=<id> - inicializador preguicoso le
  // a URL 1x no mount (nao um effect - evita corrida com o 1o render).
  const [categoryId, setCategoryId] = useState<string>(
    () => parseCatalogCategoryRoute(window.location.search).categoryId ?? 'all'
  );

  /** Categoria muda por qualquer via (chip ou select) - mantem os dois
   * sincronizados no mesmo estado e reflete na URL (replaceState, sem
   * poluir o historico do navegador por clique de filtro). */
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
  const [page, setPage] = useState(0);
  // E37: sort
  const [orderBy, setOrderBy] = useState<string>(() => sessionStorage.getItem('catalog.order_by') ?? 'name');
  const [ascending, setAscending] = useState<boolean>(() => sessionStorage.getItem('catalog.ascending') !== 'false');

  const parentCategories = categories.filter((c) => !c.parent_id);
  const getSubcategories = (parentId: string) => categories.filter((c) => c.parent_id === parentId);

  const buildFilters = useCallback((pageOverride?: number): Record<string, unknown> => {
    const currentPage = pageOverride ?? page;
    const params: Record<string, unknown> = {
      limit: PAGE_SIZE,
      offset: currentPage * PAGE_SIZE,
      only_in_stock: onlyInStock,
    };
    if (search) params.search = search;
    if (categoryId !== 'all') params.category_id = categoryId;
    if (supplierId !== 'all') params.supplier_id = supplierId;
    if (isFeatured) params.is_featured = true;
    if (isNew) params.is_new = true;
    // E37 sort
    const effectiveOrder = search ? orderBy : (orderBy === 'name' ? 'name' : orderBy);
    params.order_by = effectiveOrder;
    params.ascending = ascending;
    return params;
  }, [page, search, categoryId, supplierId, onlyInStock, isFeatured, isNew, orderBy, ascending]);

  // Initial load. fetchCategories/fetchSuppliers/fetchProducts e buildFilters
  // sao recriados a cada render (nao vem de useCallback com deps estaveis) -
  // inclui-los faria este efeito rodar a cada digitacao/paginacao. Tela
  // inteira sera reescrita com useReducer na F3 (E31+ do plano do catalogo).
  useEffect(() => {
    fetchCategories();
    fetchSuppliers();
    fetchProducts(buildFilters());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // E34: URL malformada/duplicada (?cat repetido, view!=catalog) precisa
  // ser limpa uma vez no mount - o inicializador do useState ja rejeitou
  // o valor (categoryId ficou 'all'), so falta refletir isso na barra de
  // enderecos tambem.
  useEffect(() => {
    const parsed = parseCatalogCategoryRoute(window.location.search);
    if (parsed.needsNormalization) replaceCatalogCategoryRoute(null);
  }, []);

  // Filter changes - debounced (mesmo motivo acima para as deps omitidas)
  useEffect(() => {
    const t = setTimeout(() => {
      setPage(0);
      fetchProducts(buildFilters(0));
    }, 300);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search, categoryId, supplierId, onlyInStock, isFeatured, isNew, orderBy, ascending]);

  // Page changes (mesmo motivo)
  useEffect(() => {
    if (page > 0) fetchProducts(buildFilters());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page]);

  const totalPages = Math.ceil(totalProducts / PAGE_SIZE);
  const hasFilters = search || categoryId !== 'all' || supplierId !== 'all' || onlyInStock || isFeatured || isNew;

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
  };

  // E37: helpers de sort
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

  // E35: persistir viewMode em localStorage
  const handleViewMode = (mode: 'grid' | 'list') => {
    setViewMode(mode);
    localStorage.setItem('catalog.view', mode);
  };

  /** E33: clique no KPI aplica o filtro correspondente. Categorias/
   * Fornecedores/Total nao tem filtro booleano equivalente - so
   * mostram numero mesmo, sem acao no clique. */
  const handleKpiSelect = (key: keyof CatalogStats) => {
    if (key === 'in_stock') setOnlyInStock(true);
    else if (key === 'featured') setIsFeatured(true);
    else if (key === 'new_30d') setIsNew(true);
  };

  const [sendProduct, setSendProduct] = useState<ExternalProduct | null>(null);

  const handleSendProduct = (product: ExternalProduct) => {
    setSendProduct(product);
  };

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

      {/* KPIs (E33) */}
      {statsError ? (
        <AlertCard tone="warning">Não foi possível carregar os indicadores do catálogo agora.</AlertCard>
      ) : (
        <CatalogKpiStrip stats={stats} loading={statsLoading} onSelect={handleKpiSelect} />
      )}

{/* Chips de categoria (E34) - mesmo categoryId do select abaixo.
          Resolucao de conflito real (nao so metadado): o main ja tinha
          uma implementacao propria de E34, com CategoryChips LOCAL
          duplicado (nao reusava catalogShared.tsx, sem icone, sem deep
          link). Removida - o componente compartilhado (E18/F1, com
          51 testes proprios) + deep link (E34a) + icone (E34b) sao
          estritamente mais completos. setPage(0) ja e coberto pelo
          effect de debounce existente (categoryId esta nas deps). */}
      {parentCategories.length > 0 && (
        <CategoryChips
          categories={parentCategories}
          activeId={categoryId === 'all' ? null : categoryId}
          onChange={(id) => handleCategoryChange(id ?? 'all')}
        />
      )}

      {/* Filters */}
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
      </div>

      {/* E37: resultados + ordenar por */}
      <div className="flex items-center justify-between text-sm text-muted-foreground">
        <span className="tabular-nums">
          {loading
            ? 'Carregando...'
            : totalProducts === 0
              ? 'Nenhum produto'
              : <>Mostrando <span className="font-medium text-foreground">{Math.min(page * PAGE_SIZE + 1, totalProducts).toLocaleString('pt-BR')}–{Math.min((page + 1) * PAGE_SIZE, totalProducts).toLocaleString('pt-BR')}</span> de <span className="font-medium text-foreground">{totalProducts.toLocaleString('pt-BR')}</span></>
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

      {/* Products */}
      <div>
        {loading ? (
          <div className={viewMode === 'grid' ? 'grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4' : 'space-y-3'}>
            {[...Array(10)].map((_, i) => (
              <Skeleton key={i} className={viewMode === 'grid' ? 'h-72' : 'h-20'} />
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
                  />
                </motion.div>
              ))}
            </motion.div>
          </AnimatePresence>
        )}
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-center gap-3 pt-2">
          <Button variant="outline" size="sm" disabled={page === 0} onClick={() => setPage((p) => p - 1)}>
            <ChevronLeft className="w-4 h-4 mr-1" /> Anterior
          </Button>
          <span className="text-sm text-muted-foreground">
            Página {page + 1} de {totalPages}
          </span>
          <Button variant="outline" size="sm" disabled={page >= totalPages - 1} onClick={() => setPage((p) => p + 1)}>
            Próxima <ChevronRight className="w-4 h-4 ml-1" />
          </Button>
        </div>
      )}

      {/* Send Product Dialog */}
      {sendProduct && (
        <SendProductDialog
          product={sendProduct}
          open={!!sendProduct}
          onOpenChange={(open) => { if (!open) setSendProduct(null); }}
        />
      )}
    </div>

    {/* Rail (E31: só a estrutura — conteúdo real na F5) */}
    <aside className="catalog-rail sticky top-4 hidden xl:block" />
    </div>
  );
};
