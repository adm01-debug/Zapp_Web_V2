import React, { useState, useEffect } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import { Package, Send, Palette, Ruler, Weight, Globe, Clock, Layers, Tag, Box } from 'lucide-react';
import { ExternalProduct, useExternalCatalog } from '@/hooks/integrations/useExternalCatalog';

const formatPrice = (price: number) =>
  new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(price);

const handleImageError = (e: React.SyntheticEvent<HTMLImageElement>) => {
  e.currentTarget.style.display = 'none';
  const fallback = e.currentTarget.nextElementSibling as HTMLElement;
  if (fallback) fallback.style.display = 'flex';
};

const ProductImage: React.FC<{ src: string | null; alt: string; iconSize?: string }> = ({ src, alt, iconSize = 'w-6 h-6' }) => (
  <>
    {src ? (
      <>
        <img src={src} alt={alt} className="w-full h-full object-cover" loading="lazy" onError={handleImageError} />
        <div className="w-full h-full items-center justify-center hidden">
          <Package className={`${iconSize} text-muted-foreground`} />
        </div>
      </>
    ) : (
      <div className="w-full h-full flex items-center justify-center">
        <Package className={`${iconSize} text-muted-foreground`} />
      </div>
    )}
  </>
);

interface ProductDetailDialogProps {
  product: ExternalProduct;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSend?: (product: ExternalProduct) => void;
}

export function ProductDetailDialog({ product, open, onOpenChange, onSend }: ProductDetailDialogProps) {
  const { fetchProduct } = useExternalCatalog();
  const [fullProduct, setFullProduct] = useState<ExternalProduct>(product);
  const [loadingVariants, setLoadingVariants] = useState(false);

  useEffect(() => {
    if (open && !product.variants?.length) {
      setLoadingVariants(true);
      fetchProduct(product.id).then((p) => {
        if (p) setFullProduct(p);
      }).finally(() => setLoadingVariants(false));
    } else {
      setFullProduct(product);
    }
  }, [open, product.id]);

  const dp = fullProduct;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[85vh] p-0">
        <DialogHeader className="p-6 pb-0">
          <DialogTitle className="text-lg leading-tight">{dp.name}</DialogTitle>
        </DialogHeader>
        <ScrollArea className="max-h-[70vh]">
          <div className="p-6 pt-4 space-y-5">
            {/* Image + Basic Info */}
            <div className="flex gap-4">
              <div className="w-40 h-40 rounded-lg overflow-hidden bg-muted flex-shrink-0">
                <ProductImage src={dp.primary_image_url} alt={dp.name} iconSize="w-10 h-10" />
              </div>
              <div className="flex-1 space-y-2">
                <div className="flex flex-wrap gap-1.5">
                  {dp.categories && <Badge variant="secondary">{dp.categories.name}</Badge>}
                  {dp.brand && <Badge variant="outline">{dp.brand}</Badge>}
                  {dp.is_kit && <Badge className="bg-accent text-accent-foreground">Kit</Badge>}
                  {dp.allows_personalization && <Badge variant="outline" className="border-primary/50 text-primary">Personalização</Badge>}
                </div>
                <div className="grid grid-cols-2 gap-2 text-sm">
                  <div>
                    <span className="text-muted-foreground">Preço de venda:</span>
                    <p className="font-bold text-primary text-lg">{formatPrice(dp.sale_price)}</p>
                  </div>
                  {dp.suggested_price && dp.suggested_price !== dp.sale_price && (
                    <div>
                      <span className="text-muted-foreground">Preço sugerido:</span>
                      <p className="font-semibold">{formatPrice(dp.suggested_price)}</p>
                    </div>
                  )}
                </div>
                <div className="flex items-center gap-3 text-sm">
                  <Tag className="w-4 h-4 text-muted-foreground" />
                  <span>SKU: <strong>{dp.sku}</strong></span>
                </div>
                {dp.is_stockout ? (
                  <Badge variant="destructive">Sem estoque</Badge>
                ) : (
                  <Badge variant="outline" className="text-success border-success/50">{dp.stock_quantity} em estoque</Badge>
                )}
              </div>
            </div>

            {/* Description */}
            {(dp.description || dp.short_description) && (
              <>
                <Separator />
                <div>
                  <h4 className="font-semibold text-sm mb-1">Descrição</h4>
                  <p className="text-sm text-muted-foreground whitespace-pre-line">{dp.description || dp.short_description}</p>
                </div>
              </>
            )}

            {/* Technical Details */}
            <Separator />
            <div className="grid grid-cols-2 gap-3 text-sm">
              {dp.dimensions_display && (
                <div className="flex items-start gap-2">
                  <Ruler className="w-4 h-4 text-muted-foreground mt-0.5" />
                  <div><span className="text-muted-foreground block text-xs">Dimensões</span><span>{dp.dimensions_display}</span></div>
                </div>
              )}
              {dp.weight_g != null && dp.weight_g > 0 && (
                <div className="flex items-start gap-2">
                  <Weight className="w-4 h-4 text-muted-foreground mt-0.5" />
                  <div><span className="text-muted-foreground block text-xs">Peso</span><span>{dp.weight_g >= 1000 ? `${(dp.weight_g / 1000).toFixed(2)} kg` : `${dp.weight_g} g`}</span></div>
                </div>
              )}
              {dp.origin_country && (
                <div className="flex items-start gap-2">
                  <Globe className="w-4 h-4 text-muted-foreground mt-0.5" />
                  <div><span className="text-muted-foreground block text-xs">Origem</span><span>{dp.origin_country}</span></div>
                </div>
              )}
              {dp.lead_time_days != null && (
                <div className="flex items-start gap-2">
                  <Clock className="w-4 h-4 text-muted-foreground mt-0.5" />
                  <div><span className="text-muted-foreground block text-xs">Prazo</span><span>{dp.lead_time_days} dias úteis</span></div>
                </div>
              )}
              {dp.min_quantity != null && (
                <div className="flex items-start gap-2">
                  <Layers className="w-4 h-4 text-muted-foreground mt-0.5" />
                  <div><span className="text-muted-foreground block text-xs">Qtd. mínima</span><span>{dp.min_quantity} un.</span></div>
                </div>
              )}
              {dp.ncm_code && (
                <div className="flex items-start gap-2">
                  <Box className="w-4 h-4 text-muted-foreground mt-0.5" />
                  <div><span className="text-muted-foreground block text-xs">NCM</span><span>{dp.ncm_code}</span></div>
                </div>
              )}
            </div>

            {/* Colors */}
            {dp.colors && dp.colors.length > 0 && (
              <>
                <Separator />
                <div>
                  <h4 className="font-semibold text-sm mb-2 flex items-center gap-1.5"><Palette className="w-4 h-4" /> Cores disponíveis</h4>
                  <div className="flex flex-wrap gap-1.5">
                    {dp.colors.map((color) => (<Badge key={color} variant="outline" className="text-xs">{color}</Badge>))}
                  </div>
                </div>
              </>
            )}

            {/* Variants */}
            {loadingVariants ? (
              <div className="flex items-center gap-2 text-sm text-muted-foreground py-4">
                <div className="animate-spin rounded-full h-4 w-4 border-2 border-primary border-t-transparent" />
                Carregando variantes...
              </div>
            ) : dp.variants && dp.variants.length > 0 ? (
              <>
                <Separator />
                <div>
                  <h4 className="font-semibold text-sm mb-2">Variantes ({dp.variants.length})</h4>
                  <div className="space-y-2 max-h-48 overflow-y-auto">
                    {dp.variants.map((v) => (
                      <div key={v.id} className="flex items-center gap-3 p-2 rounded-md bg-muted/50 text-sm">
                        {v.selected_thumbnail && (
                          <img src={v.selected_thumbnail} alt={v.name} className="w-10 h-10 rounded object-cover" loading="lazy" onError={handleImageError} />
                        )}
                        {v.color_hex && <div className="w-5 h-5 rounded-full border" style={{ backgroundColor: v.color_hex }} />}
                        <div className="flex-1 min-w-0">
                          <p className="font-medium truncate">{v.name}</p>
                          <p className="text-xs text-muted-foreground">SKU: {v.sku}</p>
                        </div>
                        <span className="text-xs text-muted-foreground">{v.stock_quantity} un.</span>
                      </div>
                    ))}
                  </div>
                </div>
              </>
            ) : null}

            {/* Supplier */}
            {dp.suppliers && (
              <>
                <Separator />
                <div className="text-sm">
                  <span className="text-muted-foreground">Fornecedor: </span>
                  <strong>{dp.suppliers.name}</strong>
                </div>
              </>
            )}

            {/* Send button */}
            {onSend && (
              <Button className="w-full" onClick={() => { onSend(dp); onOpenChange(false); }} disabled={dp.is_stockout}>
                <Send className="w-4 h-4 mr-2" /> Enviar produto no chat
              </Button>
            )}
          </div>
        </ScrollArea>
      </DialogContent>
    </Dialog>
  );
}
