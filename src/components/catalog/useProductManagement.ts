import { useState, useEffect, useCallback, useMemo } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { log } from '@/lib/logger';
import { Product } from './ProductCard';
import { toast } from '@/hooks/ui/use-toast';
import { z } from 'zod';

export const productSchema = z.object({
  name: z.string().trim().min(1, 'Nome é obrigatório').max(200, 'Nome muito longo'),
  description: z.string().max(1000, 'Descrição muito longa').optional(),
  price: z.number().min(0, 'Preço deve ser positivo'),
  currency: z.string().default('BRL'),
  image_url: z.string().url('URL inválida').optional().or(z.literal('')),
  category: z.string().max(100).optional(),
  sku: z.string().max(50).optional(),
  stock_quantity: z.number().int().min(0, 'Estoque deve ser positivo'),
  is_active: z.boolean(),
});

export type ProductFormData = z.infer<typeof productSchema>;

export function useProductManagement() {
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [search, setSearch] = useState('');
  const [editingProduct, setEditingProduct] = useState<Product | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [deleteProduct, setDeleteProduct] = useState<Product | null>(null);

  const fetchProducts = useCallback(async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('products')
        .select('*')
        .order('created_at', { ascending: false });

      if (error) throw error;

      setProducts((data || []).map((p) => ({
        id: p.id,
        name: p.name,
        description: p.description,
        price: Number(p.price),
        currency: p.currency,
        image_url: p.image_url,
        category: p.category,
        sku: p.sku,
        stock_quantity: p.stock_quantity ?? 0,
        is_active: p.is_active ?? true,
      })));
    } catch (error) {
      log.error('Error fetching products:', error);
      toast({ title: 'Erro ao carregar produtos', variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchProducts(); }, [fetchProducts]);

  const handleSave = useCallback(async (data: ProductFormData) => {
    setSaving(true);
    try {
      const payload = {
        name: data.name,
        description: data.description || null,
        price: data.price,
        currency: data.currency,
        image_url: data.image_url || null,
        category: data.category || null,
        sku: data.sku || null,
        stock_quantity: data.stock_quantity,
        is_active: data.is_active,
      };

      if (editingProduct) {
        const { error } = await supabase.from('products').update(payload).eq('id', editingProduct.id);
        if (error) throw error;
        toast({ title: 'Produto atualizado com sucesso!' });
      } else {
        const { error } = await supabase.from('products').insert(payload);
        if (error) throw error;
        toast({ title: 'Produto criado com sucesso!' });
      }

      setShowForm(false);
      setEditingProduct(null);
      fetchProducts();
    } catch (error: unknown) {
      log.error('Error saving product:', error);
      toast({
        title: 'Erro ao salvar produto',
        description: error instanceof Error ? error.message : 'Erro desconhecido',
        variant: 'destructive',
      });
    } finally {
      setSaving(false);
    }
  }, [editingProduct, fetchProducts]);

  const handleDelete = useCallback(async () => {
    if (!deleteProduct) return;
    try {
      const { error } = await supabase.from('products').delete().eq('id', deleteProduct.id);
      if (error) throw error;
      toast({ title: 'Produto excluído com sucesso!' });
      setDeleteProduct(null);
      fetchProducts();
    } catch (error) {
      log.error('Error deleting product:', error);
      toast({ title: 'Erro ao excluir produto', variant: 'destructive' });
    }
  }, [deleteProduct, fetchProducts]);

  const filteredProducts = useMemo(() =>
    products.filter((p) =>
      p.name.toLowerCase().includes(search.toLowerCase()) ||
      p.sku?.toLowerCase().includes(search.toLowerCase()) ||
      p.category?.toLowerCase().includes(search.toLowerCase())
    ), [products, search]);

  const openCreate = useCallback(() => {
    setEditingProduct(null);
    setShowForm(true);
  }, []);

  const openEdit = useCallback((product: Product) => {
    setEditingProduct(product);
    setShowForm(true);
  }, []);

  const closeForm = useCallback(() => {
    setShowForm(false);
    setEditingProduct(null);
  }, []);

  return {
    products, loading, saving, search, setSearch,
    editingProduct, showForm, deleteProduct, setDeleteProduct,
    filteredProducts, handleSave, handleDelete,
    openCreate, openEdit, closeForm,
  };
}
