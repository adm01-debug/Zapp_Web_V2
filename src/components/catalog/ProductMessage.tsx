import React from 'react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Package, ExternalLink, ShoppingCart } from 'lucide-react';
import { motion } from 'framer-motion';
import { Product } from './ProductCard';

interface ProductMessageProps {
  product: Product;
  isSent: boolean;
  onViewProduct?: () => void;
  onAddToCart?: () => void;
}

export const ProductMessage: React.FC<ProductMessageProps> = ({
  product,
  isSent,
  onViewProduct,
  onAddToCart,
}) => {
  const formatPrice = (price: number, currency: string) => {
    return new Intl.NumberFormat('pt-BR', {
      style: 'currency',
      currency: currency,
    }).format(price);
  };

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.95 }}
      animate={{ opacity: 1, scale: 1 }}
      className={cn(
        'rounded-xl overflow-hidden max-w-[280px] border shadow-sm',
        isSent
          ? 'bg-primary/10 border-primary/30'
          : 'bg-card border-border/30'
      )}
    >
      {/* Product Image */}
      <div className="aspect-video relative bg-muted">
        {product.image_url ? (
          <img
            src={product.image_url}
            alt={product.name}
            className="w-full h-full object-cover"
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center">
            <Package className="w-10 h-10 text-muted-foreground" />
          </div>
        )}
        {product.category && (
          <Badge
            variant="secondary"
            className="absolute top-2 left-2 text-xs bg-background/90"
          >
            {product.category}
          </Badge>
        )}
      </div>

      {/* Product Info */}
      <div className="p-3 space-y-2">
        <h4 className="font-semibold text-sm text-foreground truncate">
          {product.name}
        </h4>
        {product.description && (
          <p className="text-xs text-muted-foreground line-clamp-2">
            {product.description}
          </p>
        )}
        <div className="flex items-center justify-between pt-1">
          <span className="text-lg font-bold text-primary">
            {formatPrice(product.price, product.currency)}
          </span>
          {product.stock_quantity > 0 && product.stock_quantity <= 5 && (
            <span className="text-xs text-warning">
              Últimas {product.stock_quantity} un.
            </span>
          )}
        </div>

        {/* Action Buttons */}
        <div className="flex gap-2 pt-2">
          {onViewProduct && (
            <Button
              size="sm"
              variant="outline"
              className="flex-1 h-8 text-xs"
              onClick={onViewProduct}
            >
              <ExternalLink className="w-3 h-3 mr-1" />
              Ver mais
            </Button>
          )}
          {onAddToCart && (
            <Button
              size="sm"
              className="flex-1 h-8 text-xs"
              onClick={onAddToCart}
              disabled={product.stock_quantity <= 0}
            >
              <ShoppingCart className="w-3 h-3 mr-1" />
              Comprar
            </Button>
          )}
        </div>
      </div>
    </motion.div>
  );
};
