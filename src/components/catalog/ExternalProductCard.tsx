import React, { useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Send, Eye, Palette } from 'lucide-react';
import { motion } from 'framer-motion';
import { ExternalProduct } from '@/hooks/integrations/useExternalCatalog';
import { ProductDetailDialog } from './ProductDetailDialog';
import { formatPrice, ProductImage } from './catalogShared';

interface ExternalProductCardProps {
  product: ExternalProduct;
  onSend?: (product: ExternalProduct) => void;
  compact?: boolean;
}

export const ExternalProductCard: React.FC<ExternalProductCardProps> = ({ product, onSend, compact = false }) => {
  const [showDetails, setShowDetails] = useState(false);

  if (compact) {
    return (
      <motion.div whileHover={{ scale: 1.01 }} className="flex items-center gap-3 p-3 rounded-lg bg-card border border-border/30 hover:border-primary/30 transition-colors">
        <div className="w-14 h-14 rounded-md overflow-hidden bg-muted flex-shrink-0"><ProductImage src={product.primary_image_url} alt={product.name} /></div>
        <div className="flex-1 min-w-0">
          <h4 className="font-medium text-sm truncate">{product.name}</h4>
          <div className="flex items-center gap-2 mt-0.5">
            <span className="text-sm font-semibold text-primary">{formatPrice(product.sale_price)}</span>
            {product.brand && <Badge variant="outline" className="text-[10px] px-1 py-0">{product.brand}</Badge>}
          </div>
          <div className="flex items-center gap-1.5 mt-0.5">
            {product.is_stockout ? (
              <Badge variant="destructive" className="text-[10px] px-1 py-0">Sem estoque</Badge>
            ) : (
              <span className="text-[10px] text-muted-foreground">{product.stock_quantity} un.</span>
            )}
            {product.colors && product.colors.length > 0 && <span className="text-[10px] text-muted-foreground">{product.colors.length} cores</span>}
          </div>
        </div>
        <div className="flex gap-1 flex-shrink-0">
          <Button size="icon" variant="ghost" className="h-8 w-8" onClick={() => setShowDetails(true)}><Eye className="w-4 h-4" /></Button>
          {onSend && <Button size="icon" variant="ghost" className="h-8 w-8" onClick={() => onSend(product)} disabled={product.is_stockout}><Send className="w-4 h-4" /></Button>}
        </div>
        <ProductDetailDialog product={product} open={showDetails} onOpenChange={setShowDetails} onSend={onSend} />
      </motion.div>
    );
  }

  return (
    <>
      <motion.div whileHover={{ y: -4 }} transition={{ type: 'spring', stiffness: 300 }}>
        <Card className="overflow-hidden border-border/30 hover:border-primary/30 transition-colors h-full flex flex-col">
          <div className="aspect-square relative bg-muted">
            <ProductImage src={product.primary_image_url} alt={product.name} iconSize="w-12 h-12" />
            {product.is_stockout && (
              <div className="absolute inset-0 bg-background/80 flex items-center justify-center"><Badge variant="destructive">Esgotado</Badge></div>
            )}
            {product.categories && <Badge variant="secondary" className="absolute top-2 left-2 text-[10px]">{product.categories.name}</Badge>}
            {product.is_kit && <Badge className="absolute top-2 right-2 text-[10px] bg-accent text-accent-foreground">Kit</Badge>}
          </div>
          <CardContent className="p-3 space-y-2 flex-1 flex flex-col">
            <div className="flex-1">
              <h3 className="font-semibold text-sm text-foreground line-clamp-2 leading-tight">{product.name}</h3>
              {product.brand && <p className="text-[11px] text-muted-foreground mt-0.5">{product.brand}</p>}
            </div>
            {product.colors && product.colors.length > 0 && (
              <div className="flex items-center gap-1 flex-wrap">
                <Palette className="w-3 h-3 text-muted-foreground" />
                {product.colors.slice(0, 4).map((c) => <Badge key={c} variant="outline" className="text-[9px] px-1 py-0">{c}</Badge>)}
                {product.colors.length > 4 && <span className="text-[9px] text-muted-foreground">+{product.colors.length - 4}</span>}
              </div>
            )}
            <div className="flex items-center justify-between">
              <span className="text-base font-bold text-primary">{formatPrice(product.sale_price)}</span>
              {!product.is_stockout && product.stock_quantity <= 10 && (
                <Badge variant="outline" className="text-[10px] text-warning border-warning/50">{product.stock_quantity} un.</Badge>
              )}
            </div>
            <div className="flex gap-1.5">
              <Button size="sm" variant="outline" className="flex-1 text-xs h-8" onClick={() => setShowDetails(true)}>
                <Eye className="w-3.5 h-3.5 mr-1" /> Detalhes
              </Button>
              {onSend && (
                <Button size="sm" className="flex-1 text-xs h-8" onClick={() => onSend(product)} disabled={product.is_stockout}>
                  <Send className="w-3.5 h-3.5 mr-1" /> Enviar
                </Button>
              )}
            </div>
          </CardContent>
        </Card>
      </motion.div>
      <ProductDetailDialog product={product} open={showDetails} onOpenChange={setShowDetails} onSend={onSend} />
    </>
  );
};
