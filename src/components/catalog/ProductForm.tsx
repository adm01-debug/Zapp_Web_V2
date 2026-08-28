import React, { useState } from 'react';
import { Product } from './ProductCard';
import { productSchema, ProductFormData } from './useProductManagement';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { DialogFooter } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Save, Loader2 } from 'lucide-react';

interface ProductFormProps {
  product?: Product | null;
  onSave: (data: ProductFormData) => Promise<void>;
  onCancel: () => void;
  loading?: boolean;
}

export const ProductForm: React.FC<ProductFormProps> = ({ product, onSave, onCancel, loading }) => {
  const [formData, setFormData] = useState<ProductFormData>({
    name: product?.name || '',
    description: product?.description || '',
    price: product?.price || 0,
    currency: product?.currency || 'BRL',
    image_url: product?.image_url || '',
    category: product?.category || '',
    sku: product?.sku || '',
    stock_quantity: product?.stock_quantity || 0,
    is_active: product?.is_active ?? true,
  });
  const [errors, setErrors] = useState<Record<string, string>>({});

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrors({});
    const result = productSchema.safeParse(formData);
    if (!result.success) {
      const fieldErrors: Record<string, string> = {};
      result.error.issues.forEach((issue) => {
        if (issue.path[0]) fieldErrors[issue.path[0] as string] = issue.message;
      });
      setErrors(fieldErrors);
      return;
    }
    await onSave(result.data);
  };

  const update = (field: keyof ProductFormData, value: ProductFormData[keyof ProductFormData]) =>
    setFormData((prev) => ({ ...prev, [field]: value }));

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="grid grid-cols-2 gap-4">
        <div className="col-span-2">
          <Label htmlFor="name">Nome do Produto *</Label>
          <Input id="name" value={formData.name} onChange={(e) => update('name', e.target.value)} placeholder="Nome do produto" className={errors.name ? 'border-destructive' : ''} />
          {errors.name && <p className="text-xs text-destructive mt-1">{errors.name}</p>}
        </div>

        <div className="col-span-2">
          <Label htmlFor="description">Descrição</Label>
          <Textarea id="description" value={formData.description || ''} onChange={(e) => update('description', e.target.value)} placeholder="Descrição do produto" rows={3} />
        </div>

        <div>
          <Label htmlFor="price">Preço *</Label>
          <Input id="price" type="number" step="0.01" min="0" value={formData.price} onChange={(e) => update('price', parseFloat(e.target.value) || 0)} placeholder="0.00" className={errors.price ? 'border-destructive' : ''} />
          {errors.price && <p className="text-xs text-destructive mt-1">{errors.price}</p>}
        </div>

        <div>
          <Label htmlFor="currency">Moeda</Label>
          <Select value={formData.currency} onValueChange={(v) => update('currency', v)}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="BRL">BRL (R$)</SelectItem>
              <SelectItem value="USD">USD ($)</SelectItem>
              <SelectItem value="EUR">EUR (€)</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div>
          <Label htmlFor="category">Categoria</Label>
          <Input id="category" value={formData.category || ''} onChange={(e) => update('category', e.target.value)} placeholder="Ex: Eletrônicos" />
        </div>

        <div>
          <Label htmlFor="sku">SKU</Label>
          <Input id="sku" value={formData.sku || ''} onChange={(e) => update('sku', e.target.value)} placeholder="Código único" />
        </div>

        <div>
          <Label htmlFor="stock">Estoque</Label>
          <Input id="stock" type="number" min="0" value={formData.stock_quantity} onChange={(e) => update('stock_quantity', parseInt(e.target.value) || 0)} placeholder="0" />
        </div>

        <div className="flex items-center gap-2 pt-6">
          <Switch id="is_active" checked={formData.is_active} onCheckedChange={(checked) => update('is_active', checked)} />
          <Label htmlFor="is_active">Produto ativo</Label>
        </div>

        <div className="col-span-2">
          <Label htmlFor="image_url">URL da Imagem</Label>
          <Input id="image_url" value={formData.image_url || ''} onChange={(e) => update('image_url', e.target.value)} placeholder="https://exemplo.com/imagem.jpg" className={errors.image_url ? 'border-destructive' : ''} />
          {errors.image_url && <p className="text-xs text-destructive mt-1">{errors.image_url}</p>}
          {formData.image_url && (
            <div className="mt-2 w-24 h-24 rounded-lg overflow-hidden bg-muted">
              <img src={formData.image_url} alt="Preview" className="w-full h-full object-cover" onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }} />
            </div>
          )}
        </div>
      </div>

      <DialogFooter>
        <Button type="button" variant="outline" onClick={onCancel}>Cancelar</Button>
        <Button type="submit" disabled={loading}>
          {loading && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
          <Save className="w-4 h-4 mr-2" />
          Salvar
        </Button>
      </DialogFooter>
    </form>
  );
};
