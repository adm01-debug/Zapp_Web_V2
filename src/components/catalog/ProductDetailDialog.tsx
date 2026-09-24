/**
 * ProductDetailDialog — E46 redesign: painel lateral (Sheet) em vez de modal.
 * Galeria de imagens no topo + secões colapsáveis de detalhes.
 * Mantido o mesmo contrato de props para não quebrar callers existentes.
 *
 * Fase 6 (E59-E68) — decisão do dono do produto: aproveitar este painel em
 * vez de reconstruir como modal de 2 colunas. Fechadas as lacunas funcionais:
 * contador "N / M" e navegação por teclado/swipe na galeria, zoom da imagem,
 * copiar SKU, "previsão de entrada" por variante e fornecedor no rodapé.
 */
import React, { useState, useEffect, useRef } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  Sheet, SheetContent, SheetHeader, SheetTitle,
} from '@/components/ui/sheet';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import {
  Send, Heart, Palette, Ruler, Weight, Globe, Clock, Layers, Tag, Box,
  ChevronLeft, ChevronRight, Sparkles, TrendingUp, Star, Copy, Store,
} from 'lucide-react';
import { ExternalProduct, useExternalProduct, useCatalogFavorites } from '@/hooks/integrations/useExternalCatalog';
import { formatPrice, ProductThumb, handleImageError } from './catalogShared';
import { toast } from '@/hooks/ui/use-toast';
import { cn } from '@/lib/utils';

/**
 * dd/MM para "Previsão de entrada" (E61) — null se data inválida/ausente.
 * next_entry_date e uma data de calendario (sem hora); le os componentes
 * direto da string em vez de instanciar Date + toLocaleDateString, que
 * converteria pra UTC-meia-noite e, em fuso negativo (-03, BR), voltaria
 * um dia.
 */
function fmtShortDate(iso?: string | null): string | null {
  if (!iso) return null;
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso);
  if (m) return m[3] + '/' + m[2];
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' });
}

interface ProductDetailDialogProps {
  product: ExternalProduct;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSend?: (product: ExternalProduct) => void;
}

// ── galeria de imagens ───────────────────────────────────────────────────────────────────────────────
function ImageGallery({ product }: { product: ExternalProduct }) {
  const images = [
    ...(product.primary_image_url ? [product.primary_image_url] : []),
    ...((product.images ?? []).filter((u) => u && u !== product.primary_image_url)),
  ].filter(Boolean) as string[];

  const [idx, setIdx] = useState(0);
  const [zoomOpen, setZoomOpen] = useState(false);
  const current = images[idx] ?? product.primary_image_url;
  const hasPrev = idx > 0;
  const hasNext = idx < images.length - 1;
  const touchStartX = useRef<number | null>(null);

  const goPrev = () => setIdx((i) => Math.max(0, i - 1));
  const goNext = () => setIdx((i) => Math.min(images.length - 1, i + 1));

  // navegacao por teclado esquerda/direita (E60) — so enquanto montado
  useEffect(() => {
    if (images.length < 2) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'ArrowLeft') goPrev();
      else if (e.key === 'ArrowRight') goNext();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [images.length]);

  const onTouchStart = (e: React.TouchEvent) => { touchStartX.current = e.touches[0]?.clientX ?? null; };
  const onTouchEnd = (e: React.TouchEvent) => {
    if (touchStartX.current == null) return;
    const delta = e.changedTouches[0].clientX - touchStartX.current;
    if (Math.abs(delta) > 40) { if (delta > 0) goPrev(); else goNext(); }
    touchStartX.current = null;
  };

  return (
    <div className="relative bg-muted select-none">
      {/* imagem principal */}
      <div
        className="relative aspect-square w-full overflow-hidden"
        onTouchStart={onTouchStart}
        onTouchEnd={onTouchEnd}
      >
        <button
          type="button"
          onClick={() => current && setZoomOpen(true)}
          className="w-full h-full block cursor-zoom-in"
          aria-label="Ampliar imagem"
        >
          <ProductThumb
            src={current}
            fallbackSrc={product.primary_image_fallback_url}
            alt={product.name}
            iconSize="w-16 h-16"
          />
        </button>
        {images.length > 1 && (
          <span className="absolute left-2 top-2 px-2 py-0.5 rounded-full bg-background/80 backdrop-blur-sm text-2xs font-medium tabular-nums pointer-events-none">
            {idx + 1} / {images.length}
          </span>
        )}
        {product.is_stockout && (
          <div className="absolute inset-0 bg-background/70 flex items-center justify-center pointer-events-none">
            <span className="px-3 py-1 rounded text-sm font-bold bg-destructive text-destructive-foreground">
              Esgotado
            </span>
          </div>
        )}
        {/* nav setas */}
        {hasPrev && (
          <button
            type="button"
            onClick={goPrev}
            className="absolute left-2 top-1/2 -translate-y-1/2 w-8 h-8 rounded-full bg-background/80 backdrop-blur-sm flex items-center justify-center hover:bg-background/95 transition-colors"
            aria-label="Imagem anterior"
          >
            <ChevronLeft className="w-4 h-4" />
          </button>
        )}
        {hasNext && (
          <button
            type="button"
            onClick={goNext}
            className="absolute right-2 top-1/2 -translate-y-1/2 w-8 h-8 rounded-full bg-background/80 backdrop-blur-sm flex items-center justify-center hover:bg-background/95 transition-colors"
            aria-label="Próxima imagem"
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
      {/* zoom (E60) */}
      <Dialog open={zoomOpen} onOpenChange={setZoomOpen}>
        <DialogContent className="max-w-3xl p-2 bg-background/95">
          {current && (
            <img src={current} alt={product.name} className="w-full h-auto rounded-md" onError={handleImageError} />
          )}
        </DialogContent>
      </Dialog>
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
                {dp.is_new && <Badge className="bg-emerald-500 text-white text-3xs"><Sparkles className="w-2.5 h-2.5 mr-0.5" />Novo</Badge>}
                {dp.is_bestseller && <Badge className="bg-orange-500 text-white text-3xs"><TrendingUp className="w-2.5 h-2.5 mr-0.5" />Top</Badge>}
                {dp.is_featured && <Badge variant="secondary" className="text-3xs"><Star className="w-2.5 h-2.5 mr-0.5" />Destaque</Badge>}
                {dp.categories && <Badge variant="secondary" className="text-3xs">{dp.categories.name}</Badge>}
                {dp.brand && <Badge variant="outline" className="text-3xs">{dp.brand}</Badge>}
                {dp.is_kit && <Badge className="bg-violet-500 text-white text-3xs">Kit</Badge>}
                {dp.allows_personalization && <Badge variant="outline" className="border-primary/50 text-primary text-3xs">Personalizável</Badge>}
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
              <button
                type="button"
                onClick={() => {
                  navigator.clipboard.writeText(dp.sku).then(
                    () => toast({ title: '✅ SKU copiado' }),
                    () => toast({ title: 'Erro ao copiar', variant: 'destructive' }),
                  );
                }}
                className="text-muted-foreground hover:text-foreground transition-colors"
                aria-label="Copiar SKU"
              >
                <Copy className="w-3 h-3" />
              </button>
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
                      <div><span className="text-3xs text-muted-foreground block">Dimensões</span><span className="text-xs">{dp.dimensions_display}</span></div>
                    </div>
                  )}
                  {dp.weight_g != null && dp.weight_g > 0 && (
                    <div className="flex items-start gap-1.5">
                      <Weight className="w-3.5 h-3.5 text-muted-foreground mt-0.5 shrink-0" />
                      <div><span className="text-3xs text-muted-foreground block">Peso</span><span className="text-xs">{dp.weight_g >= 1000 ? `${(dp.weight_g / 1000).toFixed(2)} kg` : `${dp.weight_g} g`}</span></div>
                    </div>
                  )}
                  {dp.origin_country && (
                    <div className="flex items-start gap-1.5">
                      <Globe className="w-3.5 h-3.5 text-muted-foreground mt-0.5 shrink-0" />
                      <div><span className="text-3xs text-muted-foreground block">Origem</span><span className="text-xs">{dp.origin_country}</span></div>
                    </div>
                  )}
                  {dp.lead_time_days != null && (
                    <div className="flex items-start gap-1.5">
                      <Clock className="w-3.5 h-3.5 text-muted-foreground mt-0.5 shrink-0" />
                      <div><span className="text-3xs text-muted-foreground block">Prazo</span><span className="text-xs">{dp.lead_time_days} dias úteis</span></div>
                    </div>
                  )}
                  {dp.min_quantity != null && (
                    <div className="flex items-start gap-1.5">
                      <Layers className="w-3.5 h-3.5 text-muted-foreground mt-0.5 shrink-0" />
                      <div><span className="text-3xs text-muted-foreground block">Qtd. mínima</span><span className="text-xs">{dp.min_quantity} un.</span></div>
                    </div>
                  )}
                  {dp.ncm_code && (
                    <div className="flex items-start gap-1.5">
                      <Box className="w-3.5 h-3.5 text-muted-foreground mt-0.5 shrink-0" />
                      <div><span className="text-3xs text-muted-foreground block">NCM</span><span className="text-xs">{dp.ncm_code}</span></div>
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
                        <p className="text-3xs text-muted-foreground">SKU: {v.sku}</p>
                        {v.stock_quantity <= 0 && fmtShortDate(v.next_entry_date) && (
                          <p className="text-3xs text-amber-600 dark:text-amber-500">
                            Previsão de entrada {fmtShortDate(v.next_entry_date)}
                          </p>
                        )}
                      </div>
                      <span className="text-3xs text-muted-foreground shrink-0">{v.stock_quantity} un.</span>
                    </div>
                  ))}
                </div>
              </div>
            ) : null}
          </div>
        </ScrollArea>

        {/* rodapé: fornecedor + envio (E66) */}
        {(onSend || dp.suppliers) && (
          <div className="border-t border-border/40 p-4 space-y-2">
            {dp.suppliers && (
              <p className="flex items-center gap-1.5 text-2xs text-muted-foreground">
                <Store className="w-3.5 h-3.5" />
                Fornecedor: <span className="text-foreground font-medium">{dp.suppliers.name}</span>
              </p>
            )}
            {onSend && (
              <Button
                className="w-full"
                onClick={() => { onSend(dp); onOpenChange(false); }}
                disabled={dp.is_stockout}
              >
                <Send className="w-4 h-4 mr-2" />
                Enviar produto no chat
              </Button>
            )}
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
}
