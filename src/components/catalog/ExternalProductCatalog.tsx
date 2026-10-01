import React, { useState, useEffect, useCallback, useRef } from 'react';
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
import { Search, Package, Grid3X3, List, X, Heart } from 'lucide-react';
import { motion, AnimatePresence, useReducedMotion } from 'framer-motion';
import {
  useExternalCatalog,
  useCatalogFavorites,
  type ExternalProduct,
} from '@/hooks/integrations/useExternalCatalog';
import { CatalogProductCard, CatalogProductCardSkeleton } from './CatalogProductCard';
import { SendProductDialog } from './SendProductDialog';
import { favoriteToProduct, CatalogErrorState, countLabel, useRateLimitCooldown } from './catalogShared';
import { TalkXPagination, TalkXEmptyState } from '@/components/talkx/talkxShared';
import type { ContactResult } from './useSendProduct';

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
  // CT-16 — chip "Meus favoritos" dentro do dialog do chat.
  const [favoritesOnly, setFavoritesOnly] = useState(false);
  const [sendProduct, setSendProduct] = useState<ExternalProduct | null>(null);

  const { favorites, isFavorite } = useCatalogFavorites();

  // CT-70 — com "reduzir movimento" ligado, os cards entram já no estado final.
  const prefersReducedMotion = useReducedMotion();

  // Build category tree for display
  const parentCategories = categories.filter((c) => !c.parent_id);
  const getSubcategories = (parentId: string) => categories.filter((c) => c.parent_id === parentId);

  const doFetch = useCallback(
    (overrides: Record<string, unknown> = {}) => {
      const params: Record<string, unknown> = {
        limit: PAGE_SIZE,
        offset: page * PAGE_SIZE,
        only_in_stock: onlyInStock,
        ...overrides,
      };
      if (search) params.search = search;
      if (categoryId !== 'all') params.category_id = categoryId;
      if (supplierId !== 'all') params.supplier_id = supplierId;
      fetchProducts(params);
    },
    [page, search, categoryId, supplierId, onlyInStock, fetchProducts]
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

  // CT-14 — o envio deixou de ser um callback do chat (que montava um texto
  // único, sem foto e sem log): agora o catálogo abre o mesmo
  // `SendProductDialog` da tela de catálogo, com o contato da conversa já
  // preenchido, e o envio passa a gravar `catalog_send_events`.
  const handleSend = (product: ExternalProduct) => {
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
                <Button variant={viewMode === 'grid' ? 'secondary' : 'ghost'} size="icon" className="rounded-r-none" onClick={() => setViewMode('grid')}>
                  <Grid3X3 className="w-4 h-4" />
                </Button>
                <Button variant={viewMode === 'list' ? 'secondary' : 'ghost'} size="icon" className="rounded-l-none" onClick={() => setViewMode('list')}>
                  <List className="w-4 h-4" />
                </Button>
              </div>
            </div>

            {/* Status bar */}
            <div className="flex items-center justify-between text-sm text-muted-foreground">
              <span>
                {favoritesOnly
                  ? `Mostrando ${favoriteProducts.length} produto(s) favorito(s)`
                  : `Mostrando ${Math.min(page * PAGE_SIZE + 1, totalProducts)}-${Math.min((page + 1) * PAGE_SIZE, totalProducts)} de ${totalProducts.toLocaleString('pt-BR')}`}
              </span>
              {hasFilters && !favoritesOnly && (
                <Button variant="link" size="sm" onClick={clearFilters} className="h-auto p-0">
                  Limpar filtros
                </Button>
              )}
            </div>

            {/* Products */}
            <div className="h-[50vh] overflow-y-auto pr-1">
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
                        mode={viewMode === 'list' ? 'list' : 'grade'}
                        onSend={handleSend}
                        isFavorite={isFavorite(product.id)}
                      />
                    ))}
                  </div>
                )
              ) : loading ? (
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
              ) : (
                <AnimatePresence mode="popLayout">
                  <motion.div layout={!prefersReducedMotion} className={gridClass}>
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
                          mode={viewMode === 'list' ? 'list' : 'grade'}
                          onSend={handleSend}
                          isFavorite={isFavorite(product.id)}
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
            {!favoritesOnly && totalProducts > PAGE_SIZE && (
              <TalkXPagination
                page={page + 1}
                pageSize={PAGE_SIZE}
                total={totalProducts}
                onPage={(p) => setPage(p - 1)}
                onPageSize={() => {}}
                noun="produtos"
              />
            )}
          </div>
        </DialogContent>
      </Dialog>

      {sendProduct && (
        <SendProductDialog
          key={sendProduct.id}
          product={sendProduct}
          open={!!sendProduct}
          onOpenChange={(v) => { if (!v) setSendProduct(null); }}
          presetContact={presetContact}
        />
      )}
    </>
  );
};
