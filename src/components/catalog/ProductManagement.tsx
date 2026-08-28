import React from 'react';
import { EmptyState } from '@/components/ui/empty-state';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Skeleton } from '@/components/ui/skeleton';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Plus, Pencil, Trash2, Package, Search, X, ImageIcon } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { useProductManagement } from './useProductManagement';
import { ProductForm } from './ProductForm';

const formatPrice = (price: number, currency: string) =>
  new Intl.NumberFormat('pt-BR', { style: 'currency', currency }).format(price);

const LoadingSkeleton = () => (
  <>
    {[...Array(5)].map((_, i) => (
      <TableRow key={i}>
        <TableCell><Skeleton className="w-12 h-12 rounded" /></TableCell>
        <TableCell><Skeleton className="h-4 w-32" /></TableCell>
        <TableCell><Skeleton className="h-4 w-20" /></TableCell>
        <TableCell><Skeleton className="h-4 w-16" /></TableCell>
        <TableCell><Skeleton className="h-4 w-16 ml-auto" /></TableCell>
        <TableCell><Skeleton className="h-4 w-8 mx-auto" /></TableCell>
        <TableCell><Skeleton className="h-6 w-16 mx-auto" /></TableCell>
        <TableCell><Skeleton className="h-8 w-16" /></TableCell>
      </TableRow>
    ))}
  </>
);

export const ProductManagement: React.FC = () => {
  const {
    products, loading, saving, search, setSearch,
    editingProduct, showForm, deleteProduct, setDeleteProduct,
    filteredProducts, handleSave, handleDelete,
    openCreate, openEdit, closeForm,
  } = useProductManagement();

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Package className="w-6 h-6 text-primary" />
          <h1 className="text-2xl font-bold">Gerenciar Produtos</h1>
          <Badge variant="secondary">{products.length} produtos</Badge>
        </div>
        <Button onClick={openCreate}>
          <Plus className="w-4 h-4 mr-2" />
          Novo Produto
        </Button>
      </div>

      {/* Search */}
      <div className="relative max-w-md">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
        <Input placeholder="Buscar por nome, SKU ou categoria..." value={search} onChange={(e) => setSearch(e.target.value)} className="pl-9" />
        {search && (
          <Button variant="ghost" size="icon" className="absolute right-1 top-1/2 -translate-y-1/2 h-7 w-7" onClick={() => setSearch('')}>
            <X className="w-4 h-4" />
          </Button>
        )}
      </div>

      {/* Products Table */}
      <div className="border rounded-lg overflow-hidden">
        <ScrollArea className="h-[60vh]">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-[80px]">Imagem</TableHead>
                <TableHead>Produto</TableHead>
                <TableHead>Categoria</TableHead>
                <TableHead>SKU</TableHead>
                <TableHead className="text-right">Preço</TableHead>
                <TableHead className="text-center">Estoque</TableHead>
                <TableHead className="text-center">Status</TableHead>
                <TableHead className="w-[100px]">Ações</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? <LoadingSkeleton /> : filteredProducts.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={8} className="p-0">
                    <EmptyState
                      icon={Package}
                      title={search ? 'Nenhum produto encontrado' : 'Nenhum produto cadastrado'}
                      description={search ? 'Tente ajustar os termos da busca' : 'Adicione produtos ao catálogo para começar a vender'}
                      illustration="data" size="sm"
                      actionLabel={!search ? 'Adicionar Produto' : undefined}
                      onAction={!search ? openCreate : undefined}
                      secondaryActionLabel={search ? 'Limpar busca' : undefined}
                      onSecondaryAction={search ? () => setSearch('') : undefined}
                    />
                  </TableCell>
                </TableRow>
              ) : (
                <AnimatePresence>
                  {filteredProducts.map((product) => (
                    <motion.tr key={product.id} initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="group">
                      <TableCell>
                        <div className="w-12 h-12 rounded bg-muted overflow-hidden">
                          {product.image_url ? (
                            <img src={product.image_url} alt={product.name} className="w-full h-full object-cover"  loading="lazy" decoding="async"/>
                          ) : (
                            <div className="w-full h-full flex items-center justify-center"><ImageIcon className="w-5 h-5 text-muted-foreground" /></div>
                          )}
                        </div>
                      </TableCell>
                      <TableCell>
                        <div>
                          <p className="font-medium">{product.name}</p>
                          {product.description && <p className="text-xs text-muted-foreground line-clamp-1">{product.description}</p>}
                        </div>
                      </TableCell>
                      <TableCell>{product.category && <Badge variant="outline">{product.category}</Badge>}</TableCell>
                      <TableCell className="font-mono text-sm">{product.sku || '-'}</TableCell>
                      <TableCell className="text-right font-semibold">{formatPrice(product.price, product.currency)}</TableCell>
                      <TableCell className="text-center">
                        <Badge variant={product.stock_quantity <= 0 ? 'destructive' : product.stock_quantity <= 5 ? 'secondary' : 'outline'}>
                          {product.stock_quantity}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-center">
                        <Badge variant={product.is_active ? 'default' : 'secondary'}>{product.is_active ? 'Ativo' : 'Inativo'}</Badge>
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-1">
                          <Button variant="ghost" size="icon" onClick={() => openEdit(product)}><Pencil className="w-4 h-4" /></Button>
                          <Button variant="ghost" size="icon" className="text-destructive hover:text-destructive" onClick={() => setDeleteProduct(product)}><Trash2 className="w-4 h-4" /></Button>
                        </div>
                      </TableCell>
                    </motion.tr>
                  ))}
                </AnimatePresence>
              )}
            </TableBody>
          </Table>
        </ScrollArea>
      </div>

      {/* Product Form Dialog */}
      <Dialog open={showForm} onOpenChange={(open) => { if (!open) closeForm(); }}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>{editingProduct ? 'Editar Produto' : 'Novo Produto'}</DialogTitle>
            <DialogDescription>{editingProduct ? 'Atualize as informações do produto' : 'Preencha as informações para criar um novo produto'}</DialogDescription>
          </DialogHeader>
          <ProductForm product={editingProduct} onSave={handleSave} onCancel={closeForm} loading={saving} />
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation */}
      <AlertDialog open={!!deleteProduct} onOpenChange={(open) => !open && setDeleteProduct(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir Produto</AlertDialogTitle>
            <AlertDialogDescription>
              Tem certeza que deseja excluir o produto <strong>{deleteProduct?.name}</strong>? Esta ação não pode ser desfeita.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">Excluir</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};
