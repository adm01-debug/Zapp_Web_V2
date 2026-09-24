/**
 * CatalogFavoritesTab — E49: lista de produtos favoritados.
 * Consome useCatalogFavorites() diretamente; sem chamada à API do catálogo.
 * O preço/estoque não está na snapshot — exibe só o que foi salvo.
 */
import React, { useState } from 'react';
import { Heart, Send, Trash2, Package } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';
import { useCatalogFavorites, type CatalogFavorite } from '@/hooks/integrations/useExternalCatalog';
import { SendProductDialog } from './SendProductDialog';
import type { ExternalProduct } from '@/hooks/integrations/useExternalCatalog';

/** Constrói um ExternalProduct mínimo a partir do CatalogFavorite.
 * useExternalProduct irá buscar o produto completo quando o dialog abrir. */
function favoriteToProduct(fav: CatalogFavorite): ExternalProduct {
  return {
    id: fav.product_id,
    name: fav.product_name,
    sku: fav.product_sku,
    sale_price: 0,
    stock_quantity: 0,
    is_stockout: false,
    primary_image_url: fav.primary_image_url,
    primary_image_fallback_url: null,
    is_featured: false,
    is_new: false,
    is_bestseller: false,
    is_on_sale: false,
    is_kit: false,
    allows_personalization: false,
    categories: null,
    suppliers: null,
    brand: null,
    colors: null,
    color_swatches: null,
    images: null,
    variants: null,
    description: null,
    short_description: null,
    dimensions_display: null,
    weight_g: null,
    origin_country: null,
    lead_time_days: null,
    min_quantity: null,
    ncm_code: null,
    suggested_price: null,
  } as unknown as ExternalProduct;
}

function FavoriteCard({ fav, onRemove, onSend }: {
  fav: CatalogFavorite;
  onRemove: () => void;
  onSend: (product: ExternalProduct) => void;
}) {
  return (
    <div className="flex items-center gap-3 px-4 py-3 border-b border-border/30 hover:bg-muted/10 transition-colors">
      {/* thumb */}
      <div className="w-14 h-14 rounded-md overflow-hidden bg-muted shrink-0">
        {fav.primary_image_url ? (
          <img
            src={fav.primary_image_url}
            alt={fav.product_name}
            className="w-full h-full object-cover"
            loading="lazy"
            onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = 'none'; }}
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center">
            <Package className="w-6 h-6 text-muted-foreground/40" />
          </div>
        )}
      </div>

      {/* info */}
      <div className="flex-1 min-w-0">
        <p className="text-[13px] font-semibold text-foreground truncate">{fav.product_name}</p>
        {fav.product_sku && (
          <p className="text-2xs text-muted-foreground">SKU: {fav.product_sku}</p>
        )}
        <p className="text-3xs text-muted-foreground">
          Favoritado {new Date(fav.created_at).toLocaleDateString('pt-BR')}
        </p>
      </div>

      {/* ações */}
      <div className="flex items-center gap-1 shrink-0">
        <Button
          size="icon" variant="ghost"
          className="h-8 w-8"
          onClick={() => onSend(favoriteToProduct(fav))}
          title="Enviar produto"
        >
          <Send className="w-4 h-4" />
        </Button>
        <Button
          size="icon" variant="ghost"
          className="h-8 w-8 text-rose-500 hover:text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/30"
          onClick={onRemove}
          title="Remover dos favoritos"
        >
          <Trash2 className="w-4 h-4" />
        </Button>
      </div>
    </div>
  );
}

export function CatalogFavoritesTab() {
  const { favorites, isLoading, toggle } = useCatalogFavorites();
  const [sendProduct, setSendProduct] = useState<ExternalProduct | null>(null);

  if (isLoading) {
    return (
      <div className="space-y-1">
        {[1, 2, 3].map((i) => (
          <div key={i} className="flex items-center gap-3 px-4 py-3 border-b border-border/30">
            <Skeleton className="w-14 h-14 rounded-md shrink-0" />
            <div className="flex-1 space-y-1.5">
              <Skeleton className="h-3.5 w-2/3" />
              <Skeleton className="h-3 w-1/3" />
            </div>
          </div>
        ))}
      </div>
    );
  }

  if (favorites.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-muted-foreground gap-3">
        <Heart className="w-14 h-14 opacity-30" />
        <p className="font-medium text-lg text-foreground">Sem favoritos ainda</p>
        <p className="text-sm text-center max-w-xs">
          Clique no coração em qualquer produto para salvá-lo aqui.
        </p>
      </div>
    );
  }

  return (
    <>
      <div className="text-sm text-muted-foreground px-4 py-2 border-b border-border/20 bg-muted/20">
        {favorites.length} produto{favorites.length !== 1 ? 's' : ''} favorito{favorites.length !== 1 ? 's' : ''}
      </div>
      {favorites.map((fav) => (
        <FavoriteCard
          key={fav.id}
          fav={fav}
          onRemove={() => toggle({ id: fav.product_id, name: fav.product_name, sku: fav.product_sku, primary_image_url: fav.primary_image_url })}
          onSend={setSendProduct}
        />
      ))}
      {sendProduct && (
        <SendProductDialog
          product={sendProduct}
          open={!!sendProduct}
          onOpenChange={(open) => { if (!open) setSendProduct(null); }}
        />
      )}
    </>
  );
}
