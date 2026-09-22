/**
 * ProductDetailDialog — E46 redesign: painel lateral (Sheet) em vez de modal.
 * Galeria de imagens no topo + secões colapsáveis de detalhes.
 * Mantido o mesmo contrato de props para não quebrar callers existentes.
 */
import React, { useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  Sheet, SheetContent, SheetHeader, SheetTitle,
} from '@/components/ui/sheet';
import {
  Send, Heart, Palette, Ruler, Weight, Globe, Clock, Layers, Tag, Box,
  ChevronLeft, ChevronRight, Sparkles, TrendingUp, Star,
} from 'lucide-react';
import { ExternalProduct, useExternalProduct, useCatalogFavorites } from '@/hooks/integrations/useExternalCatalog';
import { formatPrice, ProductThumb, handleImageError } from './catalogShared';
import { cn } from '@/lib/utils';

interface ProductDetailDialogProps {
  product: ExternalProduct;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSend?: (product: ExternalProduct) => void;
}

// ── galeria de imagens ─────────────────────────────────────────────────────
function ImageGallery({ product }: { product: ExternalProduct }) {
  const images = [
    ...(product.primary_image_url ? [product.primary_image_url] : []),
    ...((product.images ?? []).filter((u) => u && u !== product.primary_image_url)),
  ].filter(Boolean) as string[];

  const [idx, setIdx] = useState(0);
  const current = images[idx] ?? product.primary_image_url;
  const hasPrev = idx > 0;
  const hasNext = idx < images.length - 1;

  return (
    <div className="relative bg-muted select-none">
      {/* imagem principal */}
      <div className="relative aspect-square w-full overflow-hidden">
        <ProductThumb
          src={current}
          fallbackSrc={product.primary_image_fallback_url}
          alt={product.name}
          iconSize="w-16 h-16"
        />
        {product.is_stockout && (
          <div className="absolute inset-0 bg-background/70 flex items-center justify-center">
            <span className="px-3 py-1 rounded text-sm font-bold bg-destructive text-destructive-foreground">
              Esgotado
            </span>
          </div>
        )}
        {/* nav setas */}
        {hasPrev && (
          <button
            type="button"
            onClick={() => setIdx((i) => i - 1)}
            className="absolute left-2 top-1/2 -translate-y-1/2 w-8 h-8 rounded-full bg-background/80 backdrop-blur-sm flex items-center justify-center hover:bg-background/95 transition-colors"
          >
            <ChevronLeft className="w-4 h-4" />
          </button>
        )}
        {hasNext && (
          <button
            type="button"
            onClick={() => setIdx((i) => i + 1)}
            className="absolute right-2 top-1/2 -translate-y-1/2 w-8 h-8 rounded-full bg-background/80 backdrop-blur-sm flex items-center justify-center hover:bg-background/95 transition-colors"
          >
            <ChevronRight className="w-4 h-4" />
          </button>
        )}
      </div>
      {/* strip de miniaturas */}
      {images.length > 1 && (
        <div className="flex gap-1.5 overflow-x-auto px-3 py-2 scrollbar-hide">
          {images.map((url, i) => (
            <button
              type="button"
              key={url + i}
              onClick={() => setIdx(i)}
              className={cn(
                'flex-shrink-0 w-12 h-12 rounded-md overflow-hidden border-2 transition-all',
                i === idx ? 'border-primary' : 'border-transparent opacity-60 hover:opacity-90'
              )}
            >
              <img src={url} alt="" className="w-full h-full object-cover" onError={handleImageError} loading="lazy" />
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

export function ProductDetailDialog({ product, open, onOpenChange, onSend }: ProductDetailDialogProps) {
  const needsFullProduct = !product.variants?.length;
  const { data: fetchedProduct, isFetching: loadingVariants } = useExternalProduct(product.id, {
    enabled: open && needsFullProduct,
  });
  const dp: ExternalProduct = fetchedProduct ?? product;

  // E46: favorito via hook Supabase (useCatalogFavorites já existe em useExternalCatalog.ts)
  const { isFavorite, toggle: toggleFavorite } = useCatalogFavorites();
  const isFav = isFavorite(dp.id);

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      {/* largura: sobreescrita via className pq sheetVariants fixa sm:max-w-sm */}
      <SheetContent side="right" className="w-full sm:max-w-xl p-0 flex flex-col overflow-hidden">
        <ScrollArea className="flex-1 overflow-y-auto">
          {/* galeria */}
          <ImageGallery product={dp} />

          <div className="p-5 space-y-4">
            {/* header: nome + ações */}
            <SheetHeader className="space-y-0">
              <div className="flex items-start gap-2">
                <SheetTitle className="flex-1 text-base leading-snug font-bold pr-2">
                  {dp.name}
                </SheetTitle>
                <button
                  type="button"
                  onClick={() => toggleFavorite({ id: dp.id, name: dp.name, sku: dp.sku, primary_image_url: dp.primary_image_url })}
                  className={cn(
                    'mt-0.5 flex-shrink-0 w-8 h-8 rounded-full border border-border/40 flex items-center justify-center transition-all',
                    isFav ? 'text-rose-500 bg-rose-50 dark:bg-rose-950/30 border-rose-200' : 'text-muted-foreground hover:text-rose-500'
                  )}
                  aria-label={isFav ? 'Remover dos favoritos' : 'Adicionar aos favoritos'}
                >
                  <Heart className={cn('w-4 h-4', isFav && 'fill-current')} />
                </button>
              </div>
              {/* meta: badges */}
              <div className="flex flex-wrap gap-1 pt-1">
                {dp.is_new && <Badge className="bg-emerald-500 text-white text-[10px]"><Sparkles className="w-2.5 h-2.5 mr-0.5" />Novo</Badge>}
                {dp.is_bestseller && <Badge className="bg-orange-500 text-white text-[10px]"><TrendingUp className="w-2.5 h-2.5 mr-0.5" />Top</Badge>}
                {dp.is_featured && <Badge variant="secondary" className="text-[10px]"><Star className="w-2.5 h-2.5 mr-0.5" />Destaque</Badge>}
                {dp.categories && <Badge variant="secondary" className="text-[10px]">{dp.categories.name}</Badge>}
                {dp.brand && <Badge variant="outline" className="text-[10px]">{dp.brand}</Badge>}
                {dp.is_kit && <Badge className="bg-violet-500 text-white text-[10px]">Kit</Badge>}
                {dp.allows_personalization && <Badge variant="outline" className="border-primary/50 text-primary text-[10px]">Personalizável</Badge>}
              </div>
            </SheetHeader>

            {/* preço + estoque */}
            <div className="flex items-end justify-between">
              <div>
                <p className="text-2xl font-bold text-foreground tabular-nums">{formatPrice(dp.sale_price)}</p>
                {dp.suggested_price && dp.suggested_price !== dp.sale_price && (
                  <p className="text-xs text-muted-foreground">Sugerido: {formatPrice(dp.suggested_price)}</p>
                )}
              </div>
              {dp.is_stockout
                ? <Badge variant="destructive">Sem estoque</Badge>
                : <Badge variant="outline" className="text-success border-success/50 text-xs">{dp.stock_quantity.toLocaleString('pt-BR')} em estoque</Badge>
              }
            </div>

            {/* SKU */}
            <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <Tag className="w-3.5 h-3.5" />
              <span>SKU: <strong className="text-foreground">{dp.sku}</strong></span>
              {dp.suppliers && <span>· {dp.suppliers.name}</span>}
            </div>

            <Separator />

            {/* descrição */}
            {(dp.description || dp.short_description) && (
              <div>
                <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1.5">Descrição</h4>
                <p className="text-sm text-foreground/80 whitespace-pre-line leading-relaxed">
                  {dp.description || dp.short_description}
                </p>
              </div>
            )}

            {/* cores */}
            {(dp.color_swatches?.length || dp.colors?.length) ? (
              <div>
                <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2 flex items-center gap-1.5">
                  <Palette className="w-3.5 h-3.5" /> Cores
                </h4>
                {dp.color_swatches && dp.color_swatches.length > 0 ? (
                  <div className="flex flex-wrap gap-1.5">
                    {dp.color_swatches.map((s, si) => (
                      <div
                        key={s.color_name ?? s.color_hex ?? si}
                        title={s.color_name ?? undefined}
                        className="w-6 h-6 rounded-full border-2 border-border/30"
                        style={{ backgroundColor: s.color_hex ?? '#ccc' }}
                      />
                    ))}
                  </div>
                ) : (
                  <div className="flex flex-wrap gap-1">
                    {(dp.colors ?? []).map((c) => <Badge key={c} variant="outline" className="text-xs">{c}</Badge>)}
                  </div>
                )}
              </div>
            ) : null}

            {/* dados técnicos */}
            {(dp.dimensions_display || dp.weight_g || dp.origin_country || dp.lead_time_days != null || dp.min_quantity != null || dp.ncm_code) && (
              <div>
                <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">Especificações</h4>
                <div className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
                  {dp.dimensions_display && (
                    <div className="flex items-start gap-1.5">
                      <Ruler className="w-3.5 h-3.5 text-muted-foreground mt-0.5 shrink-0" />
                      <div><span className="text-[10px] text-muted-foreground block">Dimensões</span><span className="text-xs">{dp.dimensions_display}</span></div>
                    </div>
                  )}
                  {dp.weight_g != null && dp.weight_g > 0 && (
                    <div className="flex items-start gap-1.5">
                      <Weight className="w-3.5 h-3.5 text-muted-foreground mt-0.5 shrink-0" />
                      <div><span className="text-[10px] text-muted-foreground block">Peso</span><span className="text-xs">{dp.weight_g >= 1000 ? `${(dp.weight_g / 1000).toFixed(2)} kg` : `${dp.weight_g} g`}</span></div>
                    </div>
                  )}
                  {dp.origin_country && (
                    <div className="flex items-start gap-1.5">
                      <Globe className="w-3.5 h-3.5 text-muted-foreground mt-0.5 shrink-0" />
                      <div><span className="text-[10px] text-muted-foreground block">Origem</span><span className="text-xs">{dp.origin_country}</span></div>
                    </div>
                  )}
                  {dp.lead_time_days != null && (
                    <div className="flex items-start gap-1.5">
                      <Clock className="w-3.5 h-3.5 text-muted-foreground mt-0.5 shrink-0" />
                      <div><span className="text-[10px] text-muted-foreground block">Prazo</span><span className="text-xs">{dp.lead_time_days} dias úteis</span></div>
                    </div>
                  )}
                  {dp.min_quantity != null && (
                    <div className="flex items-start gap-1.5">
                      <Layers className="w-3.5 h-3.5 text-muted-foreground mt-0.5 shrink-0" />
                      <div><span className="text-[10px] text-muted-foreground block">Qtd. mínima</span><span className="text-xs">{dp.min_quantity} un.</span></div>
                    </div>
                  )}
                  {dp.ncm_code && (
                    <div className="flex items-start gap-1.5">
                      <Box className="w-3.5 h-3.5 text-muted-foreground mt-0.5 shrink-0" />
                      <div><span className="text-[10px] text-muted-foreground block">NCM</span><span className="text-xs">{dp.ncm_code}</span></div>
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* variantes */}
            {loadingVariants ? (
              <div className="flex items-center gap-2 text-sm text-muted-foreground py-2">
                <div className="animate-spin rounded-full h-4 w-4 border-2 border-primary border-t-transparent" />
                Carregando variantes...
              </div>
            ) : dp.variants && dp.variants.length > 0 ? (
              <div>
                <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">Variantes ({dp.variants.length})</h4>
                <div className="space-y-1.5 max-h-52 overflow-y-auto">
                  {dp.variants.map((v) => (
                    <div key={v.id} className="flex items-center gap-2.5 p-2 rounded-lg bg-muted/40 text-sm">
                      {v.selected_thumbnail && (
                        <img src={v.selected_thumbnail} alt={v.name} className="w-9 h-9 rounded object-cover border border-border/20" loading="lazy" onError={handleImageError} />
                      )}
                      {!v.selected_thumbnail && v.color_hex && (
                        <div className="w-5 h-5 rounded-full border-2 border-border/30 shrink-0" style={{ backgroundColor: v.color_hex }} />
                      )}
                      <div className="flex-1 min-w-0">
                        <p className="text-xs font-medium truncate">{v.name}</p>
                        <p className="text-[10px] text-muted-foreground">SKU: {v.sku}</p>
                      </div>
                      <span className="text-[10px] text-muted-foreground shrink-0">{v.stock_quantity} un.</span>
                    </div>
                  ))}
                </div>
              </div>
            ) : null}
          </div>
        </ScrollArea>

        {/* rodapé fixo com botão de envio */}
        {onSend && (
          <div className="border-t border-border/40 p-4">
            <Button
              className="w-full"
              onClick={() => { onSend(dp); onOpenChange(false); }}
              disabled={dp.is_stockout}
            >
              <Send className="w-4 h-4 mr-2" />
              Enviar produto no chat
            </Button>
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
}
