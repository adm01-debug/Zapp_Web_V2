import React, { useState, useEffect, useCallback, useRef, lazy, Suspense } from 'react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Search, Package, Grid3X3, List, X, Heart, CheckSquare } from 'lucide-react';
import { motion, AnimatePresence, useReducedMotion } from 'framer-motion';
import { useVirtualizer } from '@tanstack/react-virtual';
import { cn } from '@/lib/utils';
import {
  useExternalCatalog,
  useCatalogFavorites,
  type ExternalProduct,
} from '@/hooks/integrations/useExternalCatalog';
import { CatalogProductCard, CatalogProductCardSkeleton } from './CatalogProductCard';
// CT-71 — modais em `React.lazy` (chunk próprio, fora do bundle inicial).
// `lazy()` fica em ESCOPO DE MÓDULO: a regra `react-hooks/static-components`
// rejeita lazy dentro do corpo do render (documentado em catalogShared.tsx:399).
// Os dois dialogs abaixo só montam sob demanda (`{sendProduct && …}`), então o
// `<Suspense fallback>` discreto aparece só enquanto o chunk baixa.
const SendProductDialog = lazy(() =>
  import('./SendProductDialog').then((m) => ({ default: m.SendProductDialog }))
);
import { CatalogBulkBar, CATALOG_BULK_SEND_MAX } from './CatalogBulkBar';
const CatalogBulkSendDialog = lazy(() =>
  import('./CatalogBulkSendDialog').then((m) => ({ default: m.CatalogBulkSendDialog }))
);
// CT-28 — "Exportar seleção" reusa os builders puros do CSV (CT-20); nada é
// buscado na edge: as linhas são exatamente os produtos selecionados.
import { buildCatalogCsv, catalogExportFilename, triggerCsvDownload } from './catalogExport';
import { favoriteToProduct, CatalogErrorState, countLabel, useRateLimitCooldown, CatalogDialogFallback } from './catalogShared';
import { TalkXPagination, TalkXEmptyState } from '@/components/talkx/talkxShared';
import type { ContactResult } from './useSendProduct';
import { toast } from 'sonner';

interface ExternalProductCatalogProps {
  /**
   * CT-14 — contato da conversa aberta (chamada pelo chat). Quando vem
   * preenchido, o `SendProductDialog` já abre com o contato selecionado e
   * pula o passo "Selecionar contato"; CT-17 permite trocar dentro do dialog.
   */
  presetContact?: ContactResult | null;
  trigger?: React.ReactNode;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
}

const PAGE_SIZE = 24;
/** CT-26 — altura da linha do modo lista (56 px do thumb + 8 px de padding em cima/embaixo). */
const LIST_ROW_HEIGHT = 72;
/** CT-26 — colunas do cabeçalho sticky do modo lista (todas as linhas usam colSpan fixo). */
const LIST_COLUMNS = 5;
/**
 * CT-27 — a partir deste `pageSize` o modo lista virtualiza. 48 não é uma
 * opção do `TalkXPagination` (8/10/20/50): o limite existe para o corte não
 * acontecer numa página pequena, onde renderizar tudo é mais barato que medir.
 */
const VIRTUALIZE_MIN_PAGE_SIZE = 48;
/** CT-27 — linhas extras renderizadas fora da janela visível (scroll sem buracos). */
const LIST_OVERSCAN = 6;

export const ExternalProductCatalog: React.FC<ExternalProductCatalogProps> = ({
  presetContact = null,
  trigger,
  open: controlledOpen,
  onOpenChange: controlledOnOpenChange,
}) => {
  const {
    products,
    totalProducts,
    categories,
    suppliers,
    loading,
    isInitialLoading,
    isFetching,
    error,
    errorCode,
    fetchProducts,
    fetchCategories,
    fetchSuppliers,
  } = useExternalCatalog();

  // CT-59 — 429 da edge: toast + botões desabilitados por 10 s.
  const coolingDown = useRateLimitCooldown(errorCode === 'CATALOG_RATE_LIMITED');

  const [internalOpen, setInternalOpen] = useState(false);
  const isOpen = controlledOpen !== undefined ? controlledOpen : internalOpen;
  const setIsOpen = (v: boolean) => {
    setInternalOpen(v);
    controlledOnOpenChange?.(v);
  };
  const [search, setSearch] = useState('');
  const [categoryId, setCategoryId] = useState<string>('all');
  const [supplierId, setSupplierId] = useState<string>('all');
  const [onlyInStock, setOnlyInStock] = useState(false);
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid');
  const [page, setPage] = useState(0);
  // CT-27 — antes era o `PAGE_SIZE` fixo (24) e o select do TalkXPagination era
  // um no-op; agora o tamanho da página é estado, o fetch acompanha e o modo
  // lista virtualiza a partir de `VIRTUALIZE_MIN_PAGE_SIZE`.
  const [pageSize, setPageSize] = useState(PAGE_SIZE);
  // CT-16 — chip "Meus favoritos" dentro do dialog do chat.
  const [favoritesOnly, setFavoritesOnly] = useState(false);
  const [sendProduct, setSendProduct] = useState<ExternalProduct | null>(null);
  // CT-34 — cor escolhida no detalhe (2º argumento do onSend), repassada como
  // `initialVariantColor` ao SendProductDialog.
  const [sendVariantColor, setSendVariantColor] = useState<string | undefined>(undefined);
  // CT-28 — seleção em massa da lista exibida (grade ou lista).
  const [selectMode, setSelectMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [bulkSendOpen, setBulkSendOpen] = useState(false);

  const { favorites, isFavorite, toggle: toggleFavorite } = useCatalogFavorites();

  // CT-70 — com "reduzir movimento" ligado, os cards entram já no estado final.
  const prefersReducedMotion = useReducedMotion();

  // Build category tree for display
  const parentCategories = categories.filter((c) => !c.parent_id);
  const getSubcategories = (parentId: string) => categories.filter((c) => c.parent_id === parentId);

  const doFetch = useCallback(
    (overrides: Record<string, unknown> = {}) => {
      const params: Record<string, unknown> = {
        limit: pageSize,
        offset: page * pageSize,
        only_in_stock: onlyInStock,
        ...overrides,
      };
      if (search) params.search = search;
      if (categoryId !== 'all') params.category_id = categoryId;
      if (supplierId !== 'all') params.supplier_id = supplierId;
      fetchProducts(params);
    },
    [page, pageSize, search, categoryId, supplierId, onlyInStock, fetchProducts]
  );

  // `doFetch` muda de identidade a cada mudanca de filtro OU de `page` (o
  // useCallback acima lista os dois), e `isOpen` alterna ao abrir/fechar. Os
  // efeitos abaixo so podem reagir ao proprio gatilho (abrir / filtro /
  // pagina): se `doFetch` entrasse nas deps do efeito de filtros, paginar
  // resetaria `page` para 0 de novo; se `isOpen` entrasse ali, abrir o dialog
  // dispararia um fetch duplicado (o efeito de abertura ja buscou). Por isso
  // os dois valores sao lidos via ref (sempre o ultimo valor), o que mantem
  // os arrays de deps corretos sem eslint-disable.
  const doFetchRef = useRef(doFetch);
  const isOpenRef = useRef(isOpen);
  useEffect(() => {
    doFetchRef.current = doFetch;
    isOpenRef.current = isOpen;
  });

  useEffect(() => {
    if (isOpen) {
      fetchCategories();
      fetchSuppliers();
      doFetchRef.current();
    }
  }, [isOpen, fetchCategories, fetchSuppliers]);

  // Re-fetch on filter changes (debounced for search). O cleanup do proprio
  // effect ja cancela o timer anterior quando as deps mudam de novo -
  // guardar o id em state (como antes) era redundante e disparava
  // set-state-in-effect.
  useEffect(() => {
    if (!isOpenRef.current) return;
    const t = setTimeout(() => {
      setPage(0);
      doFetchRef.current({ offset: 0 });
    }, 300);
    return () => clearTimeout(t);
  }, [search, categoryId, supplierId, onlyInStock]);

  // Re-fetch on page change.
  useEffect(() => {
    if (isOpenRef.current && page > 0) doFetchRef.current();
  }, [page]);

  // CT-61 — mesmos atalhos da tela de Catálogo, válidos só com o dialog aberto
  // (o catálogo do chat fica montado mesmo fechado): `/` e Ctrl/Cmd+F focam a
  // busca, Esc limpa. O listener fica em CAPTURA no window por causa do
  // Ctrl/Cmd+F nativo do browser (ver comentário em ExternalProductManagement).
  const searchInputRef = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (!isOpen) return;
    const isEditable = (target: EventTarget | null): boolean => {
      const el = target as HTMLElement | null;
      if (!el) return false;
      return el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.isContentEditable;
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'f') {
        event.preventDefault();
        searchInputRef.current?.focus();
        return;
      }
      if (event.key === '/' && !isEditable(event.target)) {
        event.preventDefault();
        searchInputRef.current?.focus();
        return;
      }
      if (event.key === 'Escape') {
        setSearch('');
      }
    };
    window.addEventListener('keydown', onKeyDown, true);
    return () => window.removeEventListener('keydown', onKeyDown, true);
  }, [isOpen]);

  // CT-29 — o skeleton só pode aparecer na carga inicial. O `loading` do hook é
  // `isLoading || isFetching` (useExternalCatalog.ts:315), então durante a
  // paginação ele também ficava true e os cards davam lugar a 8 skeletons: era
  // esse o flash. `isInitialLoading` (isLoading puro) separa os dois casos;
  // o fallback em `loading` cobre consumidores/mocks que ainda não o expõem.
  const initialLoading = isInitialLoading === undefined ? loading : isInitialLoading;
  // CT-29 — com dado antigo na tela: cards esmaecem + barra fina de progresso.
  const refreshing = !!isFetching && !initialLoading;

  // CT-27 — virtualização só no modo lista (o card da grade não tem altura de
  // linha previsível). `enabled` desliga observação/medição enquanto a lista
  // está numa página pequena; a grade nunca virtualiza.
  const productsScrollRef = useRef<HTMLDivElement>(null);
  const getScrollElement = useCallback(() => productsScrollRef.current, []);
  const estimateListRow = useCallback(() => LIST_ROW_HEIGHT, []);
  const virtualizeList = viewMode === 'list' && !favoritesOnly && pageSize >= VIRTUALIZE_MIN_PAGE_SIZE;
  // TanStack Virtual devolve funcoes nao memoizaveis pelo React Compiler —
  // mesma limitacao ja aceita na baseline do ratchet em
  // inbox/VirtualizedRealtimeList.tsx para este mesmo hook.
  // eslint-disable-next-line react-hooks/incompatible-library
  const listVirtualizer = useVirtualizer({
    count: products.length,
    getScrollElement,
    estimateSize: estimateListRow,
    overscan: LIST_OVERSCAN,
    enabled: virtualizeList,
  });

  const virtualItems = virtualizeList ? listVirtualizer.getVirtualItems() : [];
  const listRows = virtualizeList
    ? virtualItems.flatMap((item) => {
        const product = products[item.index];
        return product ? [{ product, index: item.index }] : [];
      })
    : products.map((product, index) => ({ product, index }));
  // Espaçadores que preservam a altura total da lista quando só a janela
  // visível é renderizada — sem eles a barra de rolagem acharia que a lista
  // acabou no fim da janela.
  const listTotalSize = virtualizeList ? listVirtualizer.getTotalSize() : products.length * LIST_ROW_HEIGHT;
  const listTopSpacer = virtualItems.length > 0 ? virtualItems[0].start : 0;
  const lastVirtualItem = virtualItems[virtualItems.length - 1];
  const listBottomSpacer = lastVirtualItem
    ? Math.max(0, listTotalSize - (lastVirtualItem.start + lastVirtualItem.size))
    : 0;

  // CT-27 — trocar o tamanho da página volta para a 1ª e refaz o fetch com o
  // novo `limit` (o efeito de filtros não observa `pageSize` de propósito).
  const handlePageSize = (n: number) => {
    setPageSize(n);
    setPage(0);
    clearSelection();
    doFetchRef.current({ limit: n, offset: 0 });
  };

  // CT-14 — o envio deixou de ser um callback do chat (que montava um texto
  // único, sem foto e sem log): agora o catálogo abre o mesmo
  // `SendProductDialog` da tela de catálogo, com o contato da conversa já
  // preenchido, e o envio passa a gravar `catalog_send_events`.
  // CT-34 — `variantColor` é o 2º argumento do CTA "Enviar variação" do
  // ProductDetailDialog e vira o `initialVariantColor` do dialog de envio.
  const handleSend = (product: ExternalProduct, variantColor?: string) => {
    setSendVariantColor(variantColor);
    setSendProduct(product);
    setIsOpen(false);
  };

  const clearFilters = () => {
    setSearch('');
    setCategoryId('all');
    setSupplierId('all');
    setOnlyInStock(false);
    setPage(0);
  };

  const hasFilters = search || categoryId !== 'all' || supplierId !== 'all' || onlyInStock;

  const favoriteProducts = favorites.map(favoriteToProduct);
  const gridClass = viewMode === 'grid'
    ? 'grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4'
    : 'space-y-2';

  /**
   * CT-28/CT-36 — a lista exibida agora, na ordem da tela (favoritos ou
   * resultado paginado/filtrado). É ela que alimenta a seleção em massa e a
   * navegação ‹ › do detalhe.
   */
  const displayedProducts = favoritesOnly ? favoriteProducts : products;
  /**
   * CT-25 — o menu do card (e o coração da lista) só mostra "Favoritar/Remover"
   * quando o caller passa `onToggleFavorite`; o card entrega o id, então aqui a
   * busca do produto é feita na lista exibida (resultado paginado ou
   * favoritos). Reusa o mesmo `toggle` do hook de favoritos — sem duplicar a
   * escrita/otimismo do E27.
   */
  const handleToggleFavorite = useCallback((id: string) => {
    const p = displayedProducts.find((x) => x.id === id);
    if (p) void toggleFavorite({ id, name: p.name, sku: p.sku, primary_image_url: p.primary_image_url });
  }, [displayedProducts, toggleFavorite]);
  const toggleSelect = (id: string) =>
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  const clearSelection = () => setSelectedIds(new Set());
  const toggleSelectAll = () =>
    setSelectedIds((prev) => {
      const ids = displayedProducts.map((p) => p.id);
      const allSelected = ids.length > 0 && ids.every((id) => prev.has(id));
      const next = new Set(prev);
      ids.forEach((id) => (allSelected ? next.delete(id) : next.add(id)));
      return next;
    });
  const allPageSelected = displayedProducts.length > 0 && displayedProducts.every((p) => selectedIds.has(p.id));
  const selectedProducts = displayedProducts.filter((p) => selectedIds.has(p.id));

  /** CT-28 — "Exportar seleção": CSV com exatamente os produtos escolhidos. */
  const handleExportSelection = () => {
    if (selectedProducts.length === 0) return;
    triggerCsvDownload(buildCatalogCsv(selectedProducts), catalogExportFilename('selecao', new Date()));
    toast.success(`${selectedProducts.length} produto(s) exportado(s) em CSV`);
  };

  /** CT-28 — "Favoritar N": favorita só quem ainda não é favorito. */
  const handleFavoriteSelection = () => {
    const toFavorite = selectedProducts.filter((p) => !isFavorite(p.id));
    toFavorite.forEach((p) => {
      void toggleFavorite({ id: p.id, name: p.name, sku: p.sku, primary_image_url: p.primary_image_url });
    });
    if (toFavorite.length > 0) toast.success(`${toFavorite.length} produto(s) adicionado(s) aos favoritos`);
  };

  /** CT-28 — entra/sai do modo seleção (sair limpa a seleção). */
  const handleSelectMode = () => {
    if (selectMode) clearSelection();
    setSelectMode(!selectMode);
  };

  return (
    <>
      <Dialog open={isOpen} onOpenChange={setIsOpen}>
        <DialogTrigger asChild>
          {trigger || (
            <Button variant="ghost" size="icon" title="Catálogo de produtos">
              <Package className="w-5 h-5" />
            </Button>
          )}
        </DialogTrigger>
        <DialogContent aria-describedby={undefined} className="max-w-5xl max-h-[90vh] p-0">
          <DialogHeader className="p-6 pb-0">
            <DialogTitle className="flex items-center gap-2 text-xl">
              <Package className="w-5 h-5 text-primary" />
              Catálogo PromoGifts
              <Badge variant="secondary" className="text-xs">
                {favoritesOnly
                  ? `${favorites.length} favorito${favorites.length !== 1 ? 's' : ''}`
                  : `${totalProducts.toLocaleString('pt-BR')} produtos`}
              </Badge>
            </DialogTitle>
          </DialogHeader>

          <div className="p-6 pt-4 space-y-4">
            {/* Filters */}
            <div className="flex flex-wrap gap-3">
              <div className="flex-1 min-w-[200px] relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <Input
                  ref={searchInputRef}
                  placeholder="Buscar por nome, SKU ou marca..."
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="pl-9"
                  disabled={coolingDown}
                />
                {search && (
                  <Button variant="ghost" size="icon" className="absolute right-1 top-1/2 -translate-y-1/2 h-7 w-7" onClick={() => setSearch('')}>
                    <X className="w-4 h-4" />
                  </Button>
                )}
              </div>

              <Select value={categoryId} onValueChange={setCategoryId} disabled={coolingDown}>
                <SelectTrigger className="w-[200px]">
                  <SelectValue placeholder="Categoria" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todas categorias</SelectItem>
                  {parentCategories.map((cat) => {
                    const subs = getSubcategories(cat.id);
                    return (
                      <React.Fragment key={cat.id}>
                        <SelectItem value={cat.id} className="font-semibold">
                          {countLabel(cat.name, cat.products_count)}
                        </SelectItem>
                        {subs.map((sub) => (
                          <SelectItem key={sub.id} value={sub.id} className="pl-6 text-sm">
                            {countLabel(sub.name, sub.products_count)}
                          </SelectItem>
                        ))}
                      </React.Fragment>
                    );
                  })}
                </SelectContent>
              </Select>

              <Select value={supplierId} onValueChange={setSupplierId} disabled={coolingDown}>
                <SelectTrigger className="w-[170px]">
                  <SelectValue placeholder="Fornecedor" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todos fornecedores</SelectItem>
                  {/* CT-60 — fornecedor sem contagem: ExternalSupplier não tem
                      campo de contagem e a edge não devolve esse número
                      (SUPPLIER_FIELDS em promogifts-catalog/index.ts). Sem
                      fonte real, o número não é inventado (divergência
                      registrada no relatório do CT-60). */}
                  {suppliers.map((s) => (
                    <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>

              <div className="flex items-center gap-2">
                <Switch id="stock-filter" checked={onlyInStock} onCheckedChange={setOnlyInStock} disabled={coolingDown} />
                <Label htmlFor="stock-filter" className="text-sm cursor-pointer">Em estoque</Label>
              </div>

              {/* CT-16 — favoritos do agente, salvos em catalog_favorites. */}
              <Button
                variant={favoritesOnly ? 'secondary' : 'ghost'}
                size="sm"
                className="gap-1.5"
                aria-pressed={favoritesOnly}
                onClick={() => setFavoritesOnly((v) => !v)}
              >
                <Heart className={favoritesOnly ? 'w-4 h-4 fill-destructive text-destructive' : 'w-4 h-4'} />
                Meus favoritos
                {favorites.length > 0 && (
                  <span className="ml-0.5 text-xs tabular-nums text-muted-foreground">{favorites.length}</span>
                )}
              </Button>

              <div className="flex border rounded-md">
                <Button variant={viewMode === 'grid' ? 'secondary' : 'ghost'} size="icon" className="rounded-r-none" aria-label="Ver em grade" aria-pressed={viewMode === 'grid'} onClick={() => setViewMode('grid')}>
                  <Grid3X3 className="w-4 h-4" />
                </Button>
                <Button variant={viewMode === 'list' ? 'secondary' : 'ghost'} size="icon" className="rounded-l-none" aria-label="Ver em lista" aria-pressed={viewMode === 'list'} onClick={() => setViewMode('list')}>
                  <List className="w-4 h-4" />
                </Button>
              </div>

              {/* CT-28 — liga a seleção em massa (checkboxes + CatalogBulkBar)
                  nos dois modos; fora do modo seleção o card segue abrindo o
                  detalhe no clique, como antes. */}
              <Button
                variant={selectMode ? 'secondary' : 'ghost'}
                size="sm"
                className="gap-1.5"
                aria-pressed={selectMode}
                onClick={handleSelectMode}
              >
                <CheckSquare className="w-4 h-4" />
                Selecionar
              </Button>
            </div>

            {/* Status bar */}
            <div className="flex items-center justify-between text-sm text-muted-foreground">
              {/* CT-68 — role="status" + aria-live: o leitor de tela anuncia a
                  contagem quando ela muda. Sem debounce extra: a contagem só
                  muda quando `totalProducts` volta do fetch, que o efeito de
                  filtros já debounce em 300ms — digitar não gera um anúncio por
                  tecla, só o resultado final da busca. */}
              <span role="status" aria-live="polite" data-testid="catalog-result-count">
                {favoritesOnly
                  ? `Mostrando ${favoriteProducts.length} produto(s) favorito(s)`
                  : `Mostrando ${Math.min(page * pageSize + 1, totalProducts)}-${Math.min((page + 1) * pageSize, totalProducts)} de ${totalProducts.toLocaleString('pt-BR')}`}
              </span>
              {hasFilters && !favoritesOnly && (
                <Button variant="link" size="sm" onClick={clearFilters} className="h-auto p-0">
                  Limpar filtros
                </Button>
              )}
            </div>

            {/* CT-29 — refetch (paginação/filtro) com o dado anterior na tela:
                barra fina de progresso + cards com opacity-60, no lugar de
                trocar tudo por skeleton. */}
            {refreshing && (
              <div
                role="progressbar"
                aria-label="Atualizando produtos"
                data-testid="catalog-fetching-bar"
                className="h-0.5 w-full overflow-hidden rounded-full bg-muted"
              >
                <motion.div
                  className="h-full w-1/3 rounded-full bg-primary"
                  initial={prefersReducedMotion ? { width: '100%' } : { x: '-100%' }}
                  animate={prefersReducedMotion ? undefined : { x: '300%' }}
                  transition={prefersReducedMotion ? undefined : { repeat: Infinity, duration: 1.2, ease: 'linear' }}
                />
              </div>
            )}

            {/* Products */}
            <div ref={productsScrollRef} className="h-[50vh] overflow-y-auto pr-1">
              {favoritesOnly ? (
                favoriteProducts.length === 0 ? (
                  <TalkXEmptyState
                    icon={Heart}
                    title="Sem favoritos ainda"
                    description="Clique no coração de um produto na tela de Catálogo para salvá-lo aqui."
                  />
                ) : (
                  <div className={gridClass}>
                    {favoriteProducts.map((product) => (
                      <CatalogProductCard
                        key={product.id}
                        product={product}
                        products={displayedProducts}
                        mode={viewMode === 'list' ? 'list' : 'grade'}
                        onSend={handleSend}
                        isFavorite={isFavorite(product.id)}
                        onToggleFavorite={handleToggleFavorite}
                        isSelected={selectedIds.has(product.id)}
                        onToggleSelect={selectMode ? toggleSelect : undefined}
                      />
                    ))}
                  </div>
                )
              ) : initialLoading ? (
                <div className={gridClass}>
                  {[...Array(8)].map((_, i) => (
                    <CatalogProductCardSkeleton key={i} mode={viewMode === 'list' ? 'list' : 'grade'} />
                  ))}
                </div>
              ) : error ? (
                <CatalogErrorState
                  code={errorCode}
                  message={error}
                  onRetry={() => doFetch()}
                  retryDisabled={coolingDown}
                />
              ) : products.length === 0 ? (
                <TalkXEmptyState
                  icon={Package}
                  title="Nenhum produto encontrado"
                  description="Tente ajustar os filtros de busca."
                />
              ) : viewMode === 'list' ? (
                /* CT-26 — o modo lista usa a tabela densa do Talk X: cabeçalho de
                   colunas sticky dentro do container de scroll, linhas de 72px e
                   role="row" (mesmo padrão de talkxShared.TalkXTable).
                   CT-27 — com pageSize >= 48 só a janela visível entra no DOM; as
                   linhas de espaçador preservam a altura total da lista. */
                <div
                  className={cn(refreshing && 'opacity-60 transition-opacity')}
                  data-testid="catalog-products"
                >
                  <table className="talkx-table">
                    <thead className="sticky top-0 z-10 bg-card">
                      <tr role="row">
                        <th scope="col">Produto</th>
                        <th scope="col">Marca / Fornecedor</th>
                        <th scope="col" className="text-right">Preço</th>
                        <th scope="col" className="text-right">Estoque</th>
                        <th scope="col" className="text-right">Ações</th>
                      </tr>
                    </thead>
                    <tbody>
                      {listTopSpacer > 0 && (
                        <tr aria-hidden="true" data-testid="catalog-virtual-spacer-top">
                          <td colSpan={LIST_COLUMNS} style={{ height: listTopSpacer, padding: 0 }} />
                        </tr>
                      )}
                      {listRows.map(({ product, index }) => (
                        <tr key={product.id} role="row" style={{ height: LIST_ROW_HEIGHT }}>
                          {/* A linha é o próprio card no modo lista; o padding
                              vertical dele cai para 8px (56px do thumb + 16px =
                              72px exatos) e o resto do conteúdo fica com o card. */}
                          <td colSpan={LIST_COLUMNS} className="p-0 [&>div]:!py-2">
                            <CatalogProductCard
                              product={product}
                              products={displayedProducts}
                              mode="list"
                              onSend={handleSend}
                              isFavorite={isFavorite(product.id)}
                              onToggleFavorite={handleToggleFavorite}
                              isSelected={selectedIds.has(product.id)}
                              onToggleSelect={selectMode ? toggleSelect : undefined}
                              // CT-72 — as 4 capas acima da dobra saem eager + fetchpriority=high.
                              priority={index < 4}
                            />
                          </td>
                        </tr>
                      ))}
                      {listBottomSpacer > 0 && (
                        <tr aria-hidden="true" data-testid="catalog-virtual-spacer-bottom">
                          <td colSpan={LIST_COLUMNS} style={{ height: listBottomSpacer, padding: 0 }} />
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              ) : (
                <AnimatePresence mode="popLayout">
                  <motion.div
                    layout={!prefersReducedMotion}
                    className={cn(gridClass, refreshing && 'opacity-60 transition-opacity')}
                    data-testid="catalog-products"
                  >
                    {products.map((product, index) => (
                      <motion.div
                        key={product.id}
                        layout={!prefersReducedMotion}
                        initial={prefersReducedMotion ? false : { opacity: 0, scale: 0.95 }}
                        animate={prefersReducedMotion ? undefined : { opacity: 1, scale: 1 }}
                        exit={prefersReducedMotion ? undefined : { opacity: 0, scale: 0.95 }}
                      >
                        <CatalogProductCard
                          product={product}
                          products={displayedProducts}
                          mode="grade"
                          onSend={handleSend}
                          isFavorite={isFavorite(product.id)}
                          onToggleFavorite={handleToggleFavorite}
                          isSelected={selectedIds.has(product.id)}
                          onToggleSelect={selectMode ? toggleSelect : undefined}
                          // CT-72 — as 4 capas acima da dobra saem eager + fetchpriority=high.
                          priority={index < 4}
                        />
                      </motion.div>
                    ))}
                  </motion.div>
                </AnimatePresence>
              )}
            </div>

            {/* Pagination */}
            {!favoritesOnly && totalProducts > pageSize && (
              <TalkXPagination
                page={page + 1}
                pageSize={pageSize}
                total={totalProducts}
                // trocar de página limpa a seleção (os ids antigos saem da tela)
                onPage={(p) => { setPage(p - 1); clearSelection(); }}
                onPageSize={handlePageSize}
                noun="produtos"
              />
            )}

            {/* CT-28 — barra de seleção em massa (grade e lista): só existe
                enquanto há itens selecionados no modo seleção. */}
            {selectMode && selectedIds.size > 0 && (
              <CatalogBulkBar
                count={selectedIds.size}
                pageTotal={displayedProducts.length}
                allPageSelected={allPageSelected}
                onToggleSelectAll={toggleSelectAll}
                onClear={clearSelection}
                onSend={() => setBulkSendOpen(true)}
                onExport={handleExportSelection}
                onFavorite={handleFavoriteSelection}
                maxSend={CATALOG_BULK_SEND_MAX}
              />
            )}
          </div>
        </DialogContent>
      </Dialog>

      {/* CT-28 — envio em massa dos selecionados: mesmo fluxo da tela de
          Catálogo (revisar → escolher contato → enviar). Montado só quando
          aberto: ele depende do AuthProvider (useAuth) e o dialog do chat não
          precisa disso fechado. */}
      {bulkSendOpen && (
        <Suspense fallback={<CatalogDialogFallback />}>
          <CatalogBulkSendDialog
            products={selectedProducts}
            open
            onOpenChange={setBulkSendOpen}
            onSent={clearSelection}
          />
        </Suspense>
      )}

      {/* CT-34 — a cor escolhida no detalhe entra como `initialVariantColor`
          (preset que o SendProductDialog aplica na 1ª renderização). */}
      {sendProduct && (
        <Suspense fallback={<CatalogDialogFallback />}>
          <SendProductDialog
            key={sendProduct.id}
            product={sendProduct}
            open={!!sendProduct}
            onOpenChange={(v) => { if (!v) { setSendProduct(null); setSendVariantColor(undefined); } }}
            presetContact={presetContact}
            initialVariantColor={sendVariantColor}
          />
        </Suspense>
      )}
    </>
  );
};
