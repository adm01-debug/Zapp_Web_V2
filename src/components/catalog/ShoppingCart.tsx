import React, { useState, useCallback } from 'react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
  SheetFooter,
} from '@/components/ui/sheet';
import {
  ShoppingCart as CartIcon,
  Plus,
  Minus,
  Trash2,
  Send,
  Package,
  CreditCard,
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { Product } from './ProductCard';
import { toast } from 'sonner';
import { createLogger } from '@/lib/logger';

const logger = createLogger('ShoppingCart');

export interface CartItem {
  product: Product;
  quantity: number;
}

interface ShoppingCartProps {
  items: CartItem[];
  onUpdateQuantity: (productId: string, quantity: number) => void;
  onRemoveItem: (productId: string) => void;
  onClearCart: () => void;
  onSendOrder: (items: CartItem[], total: number) => void;
  onRequestPayment?: (items: CartItem[], total: number) => void;
  trigger?: React.ReactNode;
}

export const ShoppingCart: React.FC<ShoppingCartProps> = ({
  items,
  onUpdateQuantity,
  onRemoveItem,
  onClearCart,
  onSendOrder,
  onRequestPayment,
  trigger,
}) => {
  const [isOpen, setIsOpen] = useState(false);

  const formatPrice = useCallback((price: number, currency: string) => {
    return new Intl.NumberFormat('pt-BR', {
      style: 'currency',
      currency,
    }).format(price);
  }, []);

  const totalItems = items.reduce((sum, item) => sum + item.quantity, 0);
  const subtotal = items.reduce(
    (sum, item) => sum + item.product.price * item.quantity,
    0
  );
  const currency = items.length > 0 ? items[0].product.currency : 'BRL';

  const handleSendOrder = () => {
    if (items.length === 0) return;
    logger.info('Sending order', { itemCount: items.length, total: subtotal });
    onSendOrder(items, subtotal);
    setIsOpen(false);
    toast.success('Pedido enviado com sucesso!');
  };

  const handleRequestPayment = () => {
    if (!onRequestPayment || items.length === 0) return;
    logger.info('Requesting payment', { total: subtotal });
    onRequestPayment(items, subtotal);
    setIsOpen(false);
    toast.success('Solicitação de pagamento enviada!');
  };

  return (
    <Sheet open={isOpen} onOpenChange={setIsOpen}>
      <SheetTrigger asChild>
        {trigger || (
          <Button variant="ghost" size="icon" className="relative" title="Carrinho">
            <CartIcon className="w-5 h-5" />
            {totalItems > 0 && (
              <Badge
                className="absolute -top-1 -right-1 h-5 w-5 p-0 flex items-center justify-center text-[10px] bg-primary text-primary-foreground"
              >
                {totalItems}
              </Badge>
            )}
          </Button>
        )}
      </SheetTrigger>
      <SheetContent className="w-full sm:max-w-md flex flex-col">
        <SheetHeader>
          <SheetTitle className="flex items-center gap-2">
            <CartIcon className="w-5 h-5 text-primary" />
            Carrinho
            {totalItems > 0 && (
              <Badge variant="secondary" className="ml-2">
                {totalItems} {totalItems === 1 ? 'item' : 'itens'}
              </Badge>
            )}
          </SheetTitle>
        </SheetHeader>

        {items.length === 0 ? (
          <div className="flex-1 flex flex-col items-center justify-center text-muted-foreground py-12">
            <Package className="w-16 h-16 mb-4 opacity-30" />
            <p className="font-medium text-lg">Carrinho vazio</p>
            <p className="text-sm mt-1">Adicione produtos do catálogo</p>
          </div>
        ) : (
          <>
            <ScrollArea className="flex-1 -mx-6 px-6">
              <AnimatePresence mode="popLayout">
                <div className="space-y-3 py-4">
                  {items.map((item) => (
                    <motion.div
                      key={item.product.id}
                      layout
                      initial={{ opacity: 0, x: 20 }}
                      animate={{ opacity: 1, x: 0 }}
                      exit={{ opacity: 0, x: -20 }}
                      className="flex gap-3 p-3 rounded-lg bg-muted/30 border border-border/30"
                    >
                      {/* Product Image */}
                      <div className="w-16 h-16 rounded-md overflow-hidden bg-muted flex-shrink-0">
                        {item.product.image_url ? (
                          <img
                            src={item.product.image_url}
                            alt={item.product.name}
                            className="w-full h-full object-cover"
                          />
                        ) : (
                          <div className="w-full h-full flex items-center justify-center">
                            <Package className="w-6 h-6 text-muted-foreground" />
                          </div>
                        )}
                      </div>

                      {/* Product Info */}
                      <div className="flex-1 min-w-0">
                        <h4 className="text-sm font-medium text-foreground truncate">
                          {item.product.name}
                        </h4>
                        <p className="text-sm text-primary font-semibold">
                          {formatPrice(item.product.price, item.product.currency)}
                        </p>

                        {/* Quantity Controls */}
                        <div className="flex items-center gap-2 mt-2">
                          <Button
                            size="icon"
                            variant="outline"
                            className="h-7 w-7"
                            onClick={() =>
                              onUpdateQuantity(
                                item.product.id,
                                Math.max(1, item.quantity - 1)
                              )
                            }
                            disabled={item.quantity <= 1}
                          >
                            <Minus className="w-3 h-3" />
                          </Button>
                          <span className="text-sm font-medium w-6 text-center">
                            {item.quantity}
                          </span>
                          <Button
                            size="icon"
                            variant="outline"
                            className="h-7 w-7"
                            onClick={() =>
                              onUpdateQuantity(
                                item.product.id,
                                Math.min(item.product.stock_quantity, item.quantity + 1)
                              )
                            }
                            disabled={item.quantity >= item.product.stock_quantity}
                          >
                            <Plus className="w-3 h-3" />
                          </Button>
                          <Button
                            size="icon"
                            variant="ghost"
                            className="h-7 w-7 ml-auto text-destructive hover:text-destructive"
                            onClick={() => onRemoveItem(item.product.id)}
                          >
                            <Trash2 className="w-3 h-3" />
                          </Button>
                        </div>
                      </div>

                      {/* Line Total */}
                      <div className="text-right flex-shrink-0">
                        <p className="text-sm font-bold text-foreground">
                          {formatPrice(
                            item.product.price * item.quantity,
                            item.product.currency
                          )}
                        </p>
                      </div>
                    </motion.div>
                  ))}
                </div>
              </AnimatePresence>
            </ScrollArea>

            <div className="space-y-4 pt-4 border-t border-border">
              {/* Summary */}
              <div className="space-y-2">
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Subtotal</span>
                  <span className="font-medium text-foreground">
                    {formatPrice(subtotal, currency)}
                  </span>
                </div>
                <Separator />
                <div className="flex justify-between">
                  <span className="font-semibold text-foreground">Total</span>
                  <span className="text-xl font-bold text-primary">
                    {formatPrice(subtotal, currency)}
                  </span>
                </div>
              </div>

              {/* Actions */}
              <SheetFooter className="flex-col gap-2 sm:flex-col">
                <Button className="w-full" onClick={handleSendOrder}>
                  <Send className="w-4 h-4 mr-2" />
                  Enviar Pedido
                </Button>
                {onRequestPayment && (
                  <Button
                    variant="outline"
                    className="w-full"
                    onClick={handleRequestPayment}
                  >
                    <CreditCard className="w-4 h-4 mr-2" />
                    Solicitar Pagamento
                  </Button>
                )}
                <Button
                  variant="ghost"
                  className="w-full text-destructive hover:text-destructive"
                  onClick={() => {
                    onClearCart();
                    toast.info('Carrinho limpo');
                  }}
                >
                  <Trash2 className="w-4 h-4 mr-2" />
                  Limpar Carrinho
                </Button>
              </SheetFooter>
            </div>
          </>
        )}
      </SheetContent>
    </Sheet>
  );
};
