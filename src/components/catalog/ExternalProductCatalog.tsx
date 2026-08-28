import React, { useState, useEffect, useCallback } from 'react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Skeleton } from '@/components/ui/skeleton';
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
import { Search, Package, Grid3X3, List, X, ChevronLeft, ChevronRight } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { toast } from '@/hooks/ui/use-toast';
import { useExternalCatalog, ExternalProduct, ExternalCategory } from '@/hooks/integrations/useExternalCatalog';
import { ExternalProductCard } from './ExternalProductCard';

interface ExternalProductCatalogProps {
  onSendProduct: (product: ExternalProduct) => void;
  trigger?: React.ReactNode;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
}

const PAGE_SIZE = 24;

export const ExternalProductCatalog: React.FC<ExternalProductCatalogProps> = ({
  onSendProduct,
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
  const [searchTimeout, setSearchTimeout] = useState<ReturnType<typeof setTimeout> | null>(null);

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

  // Re-fetch on filter changes (debounced for search)
  useEffect(() => {
    if (!isOpen) return;
    if (searchTimeout) clearTimeout(searchTimeout);
    const t = setTimeout(() => {
      setPage(0);
      doFetch({ offset: 0 });
    }, 300);
    setSearchTimeout(t);
    return () => clearTimeout(t);
  }, [search, categoryId, supplierId, onlyInStock]);

  // Re-fetch on page change
  useEffect(() => {
    if (isOpen && page > 0) doFetch();
  }, [page]);

  const handleSend = (product: ExternalProduct) => {
    onSendProduct(product);
    setIsOpen(false);
    toast({ title: 'Produto enviado!', description: `${product.name} foi enviado para o chat.` });
  };

  const totalPages = Math.ceil(totalProducts / PAGE_SIZE);

  const clearFilters = () => {
    setSearch('');
    setCategoryId('all');
    setSupplierId('all');
    setOnlyInStock(false);
    setPage(0);
  };

  const hasFilters = search || categoryId !== 'all' || supplierId !== 'all' || onlyInStock;

  return (
    <Dialog open={isOpen} onOpenChange={setIsOpen}>
      <DialogTrigger asChild>
        {trigger || (
          <Button variant="ghost" size="icon" title="Catálogo de produtos">
            <Package className="w-5 h-5" />
          </Button>
        )}
      </DialogTrigger>
      <DialogContent className="max-w-5xl max-h-[90vh] p-0">
        <DialogHeader className="p-6 pb-0">
          <DialogTitle className="flex items-center gap-2 text-xl">
            <Package className="w-5 h-5 text-primary" />
            Catálogo PromoGifts
            <Badge variant="secondary" className="text-xs">{totalProducts.toLocaleString('pt-BR')} produtos</Badge>
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
              Mostrando {Math.min(page * PAGE_SIZE + 1, totalProducts)}-{Math.min((page + 1) * PAGE_SIZE, totalProducts)} de {totalProducts.toLocaleString('pt-BR')}
            </span>
            {hasFilters && (
              <Button variant="link" size="sm" onClick={clearFilters} className="h-auto p-0">
                Limpar filtros
              </Button>
            )}
          </div>

          {error && (
            <div className="bg-destructive/10 text-destructive rounded-lg p-3 text-sm">
              {error}
            </div>
          )}

          {/* Products */}
          <ScrollArea className="h-[50vh]">
            {loading ? (
              <div className={viewMode === 'grid' ? 'grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4' : 'space-y-3'}>
                {[...Array(8)].map((_, i) => (
                  <Skeleton key={i} className={viewMode === 'grid' ? 'h-72' : 'h-20'} />
                ))}
              </div>
            ) : products.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
                <Package className="w-12 h-12 mb-4 opacity-50" />
                <p className="font-medium">Nenhum produto encontrado</p>
                <p className="text-sm">Tente ajustar os filtros de busca.</p>
              </div>
            ) : (
              <AnimatePresence mode="popLayout">
                <motion.div
                  layout
                  className={
                    viewMode === 'grid'
                      ? 'grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4'
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
                        onSend={handleSend}
                        compact={viewMode === 'list'}
                      />
                    </motion.div>
                  ))}
                </motion.div>
              </AnimatePresence>
            )}
          </ScrollArea>

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="flex items-center justify-center gap-2 pt-2">
              <Button variant="outline" size="sm" disabled={page === 0} onClick={() => setPage((p) => p - 1)}>
                <ChevronLeft className="w-4 h-4" />
              </Button>
              <span className="text-sm text-muted-foreground">
                Página {page + 1} de {totalPages}
              </span>
              <Button variant="outline" size="sm" disabled={page >= totalPages - 1} onClick={() => setPage((p) => p + 1)}>
                <ChevronRight className="w-4 h-4" />
              </Button>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
};
