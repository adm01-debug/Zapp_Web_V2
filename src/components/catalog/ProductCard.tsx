import React from 'react';
import { cn } from '@/lib/utils';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Package, Send, ShoppingCart } from 'lucide-react';
import { motion } from 'framer-motion';

export interface Product {
  id: string;
  name: string;
  description: string | null;
  price: number;
  currency: string;
  image_url: string | null;
  category: string | null;
  sku: string | null;
  stock_quantity: number;
  is_active: boolean;
}

interface ProductCardProps {
  product: Product;
  onSend?: (product: Product) => void;
  onAddToCart?: (product: Product) => void;
  compact?: boolean;
}

export const ProductCard: React.FC<ProductCardProps> = ({
  product,
  onSend,
  onAddToCart,
  compact = false,
}) => {
  const formatPrice = (price: number, currency: string) => {
    return new Intl.NumberFormat('pt-BR', {
      style: 'currency',
      currency: currency,
    }).format(price);
  };

  const isOutOfStock = product.stock_quantity <= 0;

  if (compact) {
    return (
      <motion.div
        whileHover={{ scale: 1.02 }}
        className="flex items-center gap-3 p-3 rounded-lg bg-card border border-border/30 hover:border-primary/30 transition-colors"
      >
        <div className="w-12 h-12 rounded-md overflow-hidden bg-muted flex-shrink-0">
          {product.image_url ? (
            <img
              src={product.image_url}
              alt={product.name}
              className="w-full h-full object-cover"
            />
          ) : (
            <div className="w-full h-full flex items-center justify-center">
              <Package className="w-6 h-6 text-muted-foreground" />
            </div>
          )}
        </div>
        <div className="flex-1 min-w-0">
          <h4 className="font-medium text-sm truncate">{product.name}</h4>
          <p className="text-sm font-semibold text-primary">
            {formatPrice(product.price, product.currency)}
          </p>
        </div>
        {onSend && (
          <Button
            size="sm"
            variant="ghost"
            onClick={() => onSend(product)}
            disabled={isOutOfStock}
            className="flex-shrink-0"
          >
            <Send className="w-4 h-4" />
          </Button>
        )}
      </motion.div>
    );
  }

  return (
    <motion.div
      whileHover={{ y: -4 }}
      transition={{ type: 'spring', stiffness: 300 }}
    >
      <Card className="overflow-hidden border-border/30 hover:border-primary/30 transition-colors">
        <div className="aspect-square relative bg-muted">
          {product.image_url ? (
            <img
              src={product.image_url}
              alt={product.name}
              className="w-full h-full object-cover"
            />
          ) : (
            <div className="w-full h-full flex items-center justify-center">
              <Package className="w-12 h-12 text-muted-foreground" />
            </div>
          )}
          {isOutOfStock && (
            <div className="absolute inset-0 bg-background/80 flex items-center justify-center">
              <Badge variant="destructive">Esgotado</Badge>
            </div>
          )}
          {product.category && (
            <Badge
              variant="secondary"
              className="absolute top-2 left-2 text-xs"
            >
              {product.category}
            </Badge>
          )}
        </div>
        <CardContent className="p-4 space-y-3">
          <div>
            <h3 className="font-semibold text-foreground truncate">
              {product.name}
            </h3>
            {product.description && (
              <p className="text-sm text-muted-foreground line-clamp-2 mt-1">
                {product.description}
              </p>
            )}
          </div>
          <div className="flex items-center justify-between">
            <span className="text-lg font-bold text-primary">
              {formatPrice(product.price, product.currency)}
            </span>
            {product.stock_quantity > 0 && product.stock_quantity <= 5 && (
              <Badge variant="outline" className="text-warning border-warning/50">
                {product.stock_quantity} restantes
              </Badge>
            )}
          </div>
          <div className="flex gap-2">
            {onAddToCart && (
              <Button
                size="sm"
                variant="outline"
                className="flex-1"
                onClick={() => onAddToCart(product)}
                disabled={isOutOfStock}
              >
                <ShoppingCart className="w-4 h-4 mr-1" />
                Carrinho
              </Button>
            )}
            {onSend && (
              <Button
                size="sm"
                className="flex-1"
                onClick={() => onSend(product)}
                disabled={isOutOfStock}
              >
                <Send className="w-4 h-4 mr-1" />
                Enviar
              </Button>
            )}
          </div>
        </CardContent>
      </Card>
    </motion.div>
  );
};
