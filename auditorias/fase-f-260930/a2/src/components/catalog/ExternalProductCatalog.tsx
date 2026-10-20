import React, { useState, useEffect, useCallback } from 'react';
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
import { motion, AnimatePresence } from 'framer-motion';
import {
  useExternalCatalog,
  useCatalogFavorites,
  type ExternalProduct,
} from '@/hooks/integrations/useExternalCatalog';
import { CatalogProductCard, CatalogProductCardSkeleton } from './CatalogProductCard';
import { SendProductDialog } from './SendProductDialog';
import { favoriteToProduct } from './catalogShared';
import { TalkXPagination, TalkXEmptyState, TalkXDataUnavailableState } from '@/components/talkx/talkxShared';
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
    fetchProducts,
    fetchCategories,
    fetchSuppliers,
  } = useExternalCatalog();

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

  useEffect(() => {
    if (isOpen) {
      fetchCategories();
      fetchSuppliers();
      doFetch();
    }
  }, [isOpen]);

  // Re-fetch on filter changes (debounced for search). O cleanup do proprio
  // effect ja cancela o timer anterior quando as deps mudam de novo -
  // guardar o id em state (como antes) era redundante e disparava
  // set-state-in-effect.
  //
  // doFetch nao entra nas deps de proposito: ele muda a cada mudanca de
  // 'page' (esta na propria lista de deps do seu useCallback), e inclui-lo
  // aqui faria este efeito de busca reagir a paginacao e resetar page para
  // 0 a cada troca de pagina. Reescrito com useReducer na E35
  // (CatalogFilterBar), quando essa UI for substituida.
  useEffect(() => {
    if (!isOpen) return;
    const t = setTimeout(() => {
      setPage(0);
      doFetch({ offset: 0 });
    }, 300);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search, categoryId, supplierId, onlyInStock]);

  // Re-fetch on page change. `doFetch` muda junto com `page` (useCallback) e
  // `isOpen` só chega aqui já verdadeiro — incluir os dois faria o efeito
  // disparar duas vezes por troca de página (mesmo motivo documentado no
  // efeito de filtros acima).
  useEffect(() => {
    if (isOpen && page > 0) doFetch();
    // eslint-disable-next-line react-hooks/exhaustive-deps
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
                />
                {search && (
                  <Button variant="ghost" size="icon" className="absolute right-1 top-1/2 -translate-y-1/2 h-7 w-7" onClick={() => setSearch('')}>
                    <X className="w-4 h-4" />
                  </Button>
                )}
              </div>

              <Select value={categoryId} onValueChange={setCategoryId}>
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
                <Switch id="stock-filter" checked={onlyInStock} onCheckedChange={setOnlyInStock} />
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
                <TalkXDataUnavailableState what="Os produtos do catálogo PromoGifts" />
              ) : products.length === 0 ? (
                <TalkXEmptyState
                  icon={Package}
                  title="Nenhum produto encontrado"
                  description="Tente ajustar os filtros de busca."
                />
              ) : (
                <AnimatePresence mode="popLayout">
                  <motion.div layout className={gridClass}>
                    {products.map((product) => (
                      <motion.div
                        key={product.id}
                        layout
                        initial={{ opacity: 0, scale: 0.95 }}
                        animate={{ opacity: 1, scale: 1 }}
                        exit={{ opacity: 0, scale: 0.95 }}
                      >
                        <CatalogProductCard
                          product={product}
                          mode={viewMode === 'list' ? 'list' : 'grade'}
                          onSend={handleSend}
                          isFavorite={isFavorite(product.id)}
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
