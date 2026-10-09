/**
 * ProductDetailDialog — E46 redesign: painel lateral (Sheet) em vez de modal.
 * Galeria de imagens no topo + secões colapsáveis de detalhes.
 * Mantido o mesmo contrato de props para não quebrar callers existentes.
 *
 * Fase 6 (E59-E68) — decisão do dono do produto: aproveitar este painel em
 * vez de reconstruir como modal de 2 colunas. Fechadas as lacunas funcionais:
 * contador "N / M" e navegação por teclado/swipe na galeria, zoom da imagem,
 * copiar SKU, "previsão de entrada" por variante e fornecedor no rodapé.
 *
 * Fase 3 (CT-31–CT-36) — liga os órfãos da F1 no detalhe, sem reabrir o
 * layout: MetaTile (Qtd. mínima / Prazo / Origem), SectionCard (Descrição /
 * Ficha técnica), ColorSwatch (cores com estoque por cor), variantes
 * agrupadas por cor (`groupVariantsByColor`) com CTA "Enviar variação",
 * pills de categoria/tags e navegação ‹ › entre os produtos do resultado.
 */
import React, { useState, useEffect, useMemo, useRef } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  Sheet, SheetContent, SheetHeader, SheetTitle,
} from '@/components/ui/sheet';
import { Drawer, DrawerContent } from '@/components/ui/drawer';
import { useIsMobile } from '@/hooks/ui/use-mobile';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import {
  Send, Heart, Palette, Ruler, Weight, Globe, Clock, Layers, Tag, Box,
  ChevronLeft, ChevronRight, Sparkles, TrendingUp, Star, Copy, Store,
} from 'lucide-react';
import { ExternalProduct, useExternalProduct, useCatalogFavorites } from '@/hooks/integrations/useExternalCatalog';
import { formatPrice, ProductThumb, handleImageError, MetaTile, SectionCard, ColorSwatch, CATALOG_FOCUS_VISIBLE, productImageAlt, isSnapshotProduct, UNKNOWN_PRICE_LABEL, UNKNOWN_STOCK_LABEL } from './catalogShared';
import { groupVariantsByColor } from './sendProductUtils';
import { toast } from 'sonner';
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

/** Peso em g com o mesmo corte kg/g que a ficha técnica sempre usou. */
function fmtWeight(grams: number): string {
  return grams >= 1000 ? `${(grams / 1000).toFixed(2)} kg` : `${grams} g`;
}

interface ProductDetailDialogProps {
  product: ExternalProduct;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /**
   * CT-34 — 2º argumento opcional: a cor selecionada no detalhe, que o
   * caller repassa como `initialVariantColor` do `SendProductDialog` (preset
   * já existente lá). Opcional para não quebrar os callers atuais.
   */
  onSend?: (product: ExternalProduct, variantColor?: string) => void;
  /**
   * CT-36 — produtos do resultado atual, na ordem exibida, para a navegação
   * ‹ › dentro do Sheet. Sem esta prop os botões não aparecem e o
   * comportamento anterior fica intacto.
   */
  products?: ExternalProduct[];
}

// ── galeria de imagens ───────────────────────────────────────────────────────────────────────────────
function ImageGallery({
  product, focusUrl, focusToken, colorLabel,
}: {
  product: ExternalProduct;
  /** CT-33 — 1ª imagem da cor clicada; rola a galeria até ela. */
  focusUrl?: string | null;
  /** Muda a cada clique em cor (mesmo alvo) para o efeito rodar de novo. */
  focusToken?: number;
  /** CT-69 — cor selecionada, para o alt descritivo "Nome — Cor" da foto. */
  colorLabel?: string | null;
}) {
  const images = [
    ...(product.primary_image_url ? [product.primary_image_url] : []),
    ...((product.images ?? []).filter((u) => u && u !== product.primary_image_url)),
  ].filter(Boolean) as string[];

  const [idx, setIdx] = useState(0);
  const [zoomOpen, setZoomOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  /**
   * R2-MOD-047 — o índice pertence ao produto/conjunto de imagens atual. Ao
   * navegar ‹ › para um produto com menos imagens (ou quando o produto completo
   * chega com menos fotos que a listagem), o `idx` herdado ficava fora do
   * intervalo: contador "3 / 2", seta "Próxima" escondida mesmo havendo mais
   * imagens e nenhuma miniatura ativa. Reinicia ao trocar de produto e limita
   * ao conjunto atual quando ele encolhe — mesmo ajuste durante o render já
   * usado no `focusToken`.
   */
  const [galleryId, setGalleryId] = useState(product.id);
  if (galleryId !== product.id) {
    setGalleryId(product.id);
    setIdx(0);
  } else if (images.length > 0 && idx > images.length - 1) {
    setIdx(images.length - 1);
  }
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

  // CT-33 — clique numa cor: mostra a 1ª imagem dela. Ajuste de estado
  // durante o render (mesmo padrão já usado no SendProductDialog) em vez de
  // setState dentro de efeito, que dispararia renders em cascata.
  const [focusApplied, setFocusApplied] = useState<number | null>(null);
  if (focusToken != null && focusToken !== focusApplied) {
    setFocusApplied(focusToken);
    const target = focusUrl ? images.indexOf(focusUrl) : -1;
    if (target >= 0) setIdx(target);
  }

  // CT-33 — e rola a galeria até o topo (só DOM, sem estado).
  useEffect(() => {
    if (!focusUrl) return;
    rootRef.current?.scrollIntoView?.({ behavior: 'smooth', block: 'start' });
  }, [focusToken, focusUrl]);

  const onTouchStart = (e: React.TouchEvent) => { touchStartX.current = e.touches[0]?.clientX ?? null; };
  const onTouchEnd = (e: React.TouchEvent) => {
    if (touchStartX.current == null) return;
    const delta = e.changedTouches[0].clientX - touchStartX.current;
    if (Math.abs(delta) > 40) { if (delta > 0) goPrev(); else goNext(); }
    touchStartX.current = null;
  };

  return (
    <div ref={rootRef} className="relative bg-muted select-none">
      {/* imagem principal */}
      <div
        className="relative aspect-square w-full overflow-hidden"
        onTouchStart={onTouchStart}
        onTouchEnd={onTouchEnd}
      >
        <button
          type="button"
          onClick={() => current && setZoomOpen(true)}
          className={cn('w-full h-full block cursor-zoom-in', CATALOG_FOCUS_VISIBLE)}
          aria-label="Ampliar imagem"
        >
          <ProductThumb
            src={current}
            fallbackSrc={product.primary_image_fallback_url}
            alt={productImageAlt(product.name, colorLabel)}
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
            className={cn("absolute left-2 top-1/2 -translate-y-1/2 w-8 h-8 rounded-full bg-background/80 backdrop-blur-sm flex items-center justify-center hover:bg-background/95 transition-colors", CATALOG_FOCUS_VISIBLE)}
            aria-label="Imagem anterior"
          >
            <ChevronLeft className="w-4 h-4" />
          </button>
        )}
        {hasNext && (
          <button
            type="button"
            onClick={goNext}
            className={cn("absolute right-2 top-1/2 -translate-y-1/2 w-8 h-8 rounded-full bg-background/80 backdrop-blur-sm flex items-center justify-center hover:bg-background/95 transition-colors", CATALOG_FOCUS_VISIBLE)}
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
              /* CT-68 — o <img alt=""> é decorativo; o nome acessível vai no
                 botão (axe `button-name`). */
              aria-label={`Ver imagem ${i + 1} de ${images.length}`}
              className={cn(
                'flex-shrink-0 w-12 h-12 rounded-md overflow-hidden border-2 transition-all',
                i === idx ? 'border-primary' : 'border-transparent opacity-60 hover:opacity-90',
                CATALOG_FOCUS_VISIBLE
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
            <img src={current} alt={productImageAlt(product.name, colorLabel)} className="w-full h-auto rounded-md" onError={handleImageError} />
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
export function ProductDetailDialog({ product, open, onOpenChange, onSend, products }: ProductDetailDialogProps) {
  /**
   * CT-36 — índice do produto mostrado dentro do Sheet. Vive aqui (override
   * sobre a ordem de `products`) para a navegação ‹ › trocar de produto sem
   * fechar o painel; abrir outro card muda `product.id` e descarta o override.
   */
  const [nav, setNav] = useState<{ baseId: string; idx: number } | null>(null);
  /**
   * R2-MOD-046 — o override de navegação ‹ › não pode sobreviver ao
   * fechamento do painel: o dialog fica montado (o caller só alterna `open`),
   * então reabrir o MESMO cartão A mantinha `nav.baseId === 'A'` e o painel
   * voltava no produto B navegado na visita anterior. Ajuste de estado no
   * render (mesmo padrão do `focusApplied` da galeria) zera o override quando
   * `open` muda: cada abertura começa pelo produto do cartão clicado.
   */
  const [prevOpen, setPrevOpen] = useState(open);
  if (open !== prevOpen) {
    setPrevOpen(open);
    setNav(null);
  }
  const baseIdx = products ? products.findIndex((p) => p.id === product.id) : -1;
  const activeIdx = nav && nav.baseId === product.id ? nav.idx : baseIdx;
  const shown = products && activeIdx >= 0 && activeIdx < products.length ? products[activeIdx] : product;

  const needsFullProduct = !shown.variants?.length;
  const { data: fetchedProduct, isFetching: loadingVariants } = useExternalProduct(shown.id, {
    enabled: open && needsFullProduct,
  });
  const dp: ExternalProduct = fetchedProduct ?? shown;
  /**
   * R2-MOD-048 — enquanto `dp` é a snapshot de favorito (sem preço/estoque) o
   * painel mostra que o dado é desconhecido, em vez de "R$ 0,00" e "0 em
   * estoque"; assim que o produto completo chega, volta aos valores reais.
   */
  const snapshotOnly = isSnapshotProduct(shown) && !fetchedProduct;

  // E46: favorito via hook Supabase (useCatalogFavorites já existe em useExternalCatalog.ts)
  const { isFavorite, toggle: toggleFavorite } = useCatalogFavorites();
  const isFav = isFavorite(dp.id);

  /**
   * CT-33/CT-34 — cor selecionada (swatch de cor ou grupo de variações) e
   * imagem alvo do scroll da galeria. Chaveado pelo id do produto mostrado
   * para a seleção não vazar de um produto para outro na navegação ‹ ›.
   */
  const [pick, setPick] = useState<{ forId: string; color: string | null; image: string | null; token: number }>({
    forId: product.id, color: null, image: null, token: 0,
  });
  const activePick = pick.forId === dp.id ? pick : { forId: dp.id, color: null, image: null, token: 0 };
  const selectedColor = activePick.color;
  const selectColor = (color: string | null, image: string | null) =>
    setPick({ forId: dp.id, color, image, token: activePick.token + 1 });

  // CT-34 — variantes agrupadas por cor (mesmo helper do SendProductDialog).
  const groups = useMemo(() => groupVariantsByColor(dp.variants ?? []), [dp.variants]);
  const groupStock = useMemo(() => {
    const map = new Map<string, number>();
    groups.forEach((g) => map.set(g.colorName, g.variants.reduce((s, v) => s + v.stock_quantity, 0)));
    return map;
  }, [groups]);
  const activeGroup = selectedColor ? groups.find((g) => g.colorName === selectedColor) ?? null : null;

  /**
   * CT-33 — cores do detalhe. Fonte preferida é `color_swatches` (hex +
   * image_url + estoque da própria cor); sem ela, cai para as cores das
   * variantes e, por último, para `colors` (só nomes, sem hex).
   */
  const colors: { name: string; hex: string | null; image: string | null; stock: number | null }[] =
    dp.color_swatches && dp.color_swatches.length > 0
      ? dp.color_swatches.map((s) => {
        const name = s.color_name || 'Padrão';
        const group = groups.find((g) => g.colorName === name);
        return {
          name,
          hex: s.color_hex ?? null,
          image: s.image_url ?? group?.images[0] ?? null,
          stock: groupStock.get(name) ?? s.stock_quantity ?? null,
        };
      })
      : groups.length > 0
        ? groups.map((g) => ({ name: g.colorName, hex: g.colorHex, image: g.images[0] ?? null, stock: groupStock.get(g.colorName) ?? null }))
        : (dp.colors ?? []).map((c) => ({ name: c, hex: null, image: null, stock: null }));

  // CT-36 — troca o produto mostrado e mantém o deep link (?product=) em dia.
  const goToProduct = (nextIdx: number) => {
    if (!products || nextIdx < 0 || nextIdx >= products.length) return;
    const target = products[nextIdx];
    setNav({ baseId: product.id, idx: nextIdx });
    const url = new URL(window.location.href);
    url.searchParams.set('product', target.id);
    window.history.replaceState(null, '', url.toString());
  };
  const hasProducts = !!products && products.length > 1;
  const hasPrevProduct = hasProducts && activeIdx > 0;
  const hasNextProduct = hasProducts && activeIdx >= 0 && activeIdx < (products?.length ?? 0) - 1;

  const navButtonClass = (enabled: boolean) => cn(
    'w-8 h-8 rounded-full border border-border/40 flex items-center justify-center transition-colors',
    enabled ? 'text-muted-foreground hover:text-foreground hover:bg-muted' : 'text-muted-foreground/40 cursor-not-allowed',
    CATALOG_FOCUS_VISIBLE
  );

  /**
   * CT-35 — rótulo da pill de categoria: prefere o caminho completo
   * (`categories.full_path_readable`, ex. "Brindes > Canecas") e cai para o
   * nome simples quando ele não vem (a edge pode omiti-lo). `trim()` evita
   * pill vazia/quebrada quando o campo chega em branco. `null` esconde a pill.
   */
  const categoryLabel = dp.categories?.full_path_readable?.trim() || dp.categories?.name?.trim() || null;

  const isMobile = useIsMobile();

  // CT-30 — o conteúdo (galeria + detalhes + rodapé) é único para os dois
  // invólucros: o Sheet lateral em >= md e o Drawer (vaul) abaixo de 768px.
  const panel = (
    <>
      <ScrollArea className="flex-1 overflow-y-auto">
          {/* galeria */}
          <ImageGallery product={dp} focusUrl={activePick.image} focusToken={activePick.token} colorLabel={selectedColor} />

          <div className="p-5 space-y-4">
            {/* header: nome + navegação ‹ › + ações */}
            <SheetHeader className="space-y-0">
              <div className="flex items-start gap-2">
                <SheetTitle className="flex-1 text-base leading-snug font-bold pr-2">
                  {dp.name}
                </SheetTitle>
                {hasProducts && (
                  <div className="mt-0.5 flex items-center gap-0.5 shrink-0">
                    <button
                      type="button"
                      onClick={() => goToProduct(activeIdx - 1)}
                      disabled={!hasPrevProduct}
                      className={navButtonClass(hasPrevProduct)}
                      aria-label="Produto anterior"
                    >
                      <ChevronLeft className="w-4 h-4" />
                    </button>
                    <button
                      type="button"
                      onClick={() => goToProduct(activeIdx + 1)}
                      disabled={!hasNextProduct}
                      className={navButtonClass(hasNextProduct)}
                      aria-label="Próximo produto"
                    >
                      <ChevronRight className="w-4 h-4" />
                    </button>
                  </div>
                )}
                <button
                  type="button"
                  onClick={() => toggleFavorite({ id: dp.id, name: dp.name, sku: dp.sku, primary_image_url: dp.primary_image_url })}
                  className={cn(
                    'mt-0.5 flex-shrink-0 w-8 h-8 rounded-full border border-border/40 flex items-center justify-center transition-all',
                    isFav ? 'text-rose-500 bg-rose-50 dark:bg-rose-950/30 border-rose-200' : 'text-muted-foreground hover:text-rose-500',
                    CATALOG_FOCUS_VISIBLE
                  )}
                  aria-label={isFav ? 'Remover dos favoritos' : 'Adicionar aos favoritos'}
                >
                  <Heart className={cn('w-4 h-4', isFav && 'fill-current')} />
                </button>
              </div>
              {/* meta: badges */}
              <div className="flex flex-wrap gap-1 pt-1">
                {dp.is_new && <Badge className="bg-emerald-500 text-primary-foreground text-3xs"><Sparkles className="w-2.5 h-2.5 mr-0.5" />Novo</Badge>}
                {dp.is_bestseller && <Badge className="bg-orange-500 text-primary-foreground text-3xs"><TrendingUp className="w-2.5 h-2.5 mr-0.5" />Top</Badge>}
                {dp.is_featured && <Badge variant="secondary" className="text-3xs"><Star className="w-2.5 h-2.5 mr-0.5" />Destaque</Badge>}
                {dp.brand && <Badge variant="outline" className="text-3xs">{dp.brand}</Badge>}
                {dp.is_kit && <Badge className="bg-[hsl(var(--badge-new))] text-primary-foreground text-3xs">Kit</Badge>}
                {dp.allows_personalization && <Badge variant="outline" className="border-primary/50 text-primary text-3xs">Personalizável</Badge>}
              </div>
              {/* CT-35 — pills de categoria + tags. A pill usa o caminho
                  completo da categoria (`full_path_readable`, ex. "Brindes >
                  Canecas") quando a edge o envia; sem ele cai para o nome
                  simples — nunca renderiza pill vazia nem "undefined". */}
              {(categoryLabel || (dp.tags && dp.tags.length > 0)) && (
                <div className="flex flex-wrap gap-1 pt-1">
                  {categoryLabel && (
                    <span className="catalog-chip" title={categoryLabel}>
                      <Layers className="w-2.5 h-2.5 mr-0.5" />
                      {categoryLabel}
                    </span>
                  )}
                  {(dp.tags ?? []).map((t) => (
                    <span key={t} className="catalog-chip" title={t}>
                      <Tag className="w-2.5 h-2.5 mr-0.5" />
                      {t}
                    </span>
                  ))}
                </div>
              )}
            </SheetHeader>

            {/* preço + estoque */}
            <div className="flex items-end justify-between">
              <div>
                <p className="text-2xl font-bold text-foreground tabular-nums">{snapshotOnly ? UNKNOWN_PRICE_LABEL : formatPrice(dp.sale_price)}</p>
                {!snapshotOnly && dp.suggested_price && dp.suggested_price !== dp.sale_price && (
                  <p className="text-xs text-muted-foreground">Sugerido: {formatPrice(dp.suggested_price)}</p>
                )}
              </div>
              {snapshotOnly
                ? <Badge variant="outline" className="text-muted-foreground text-xs">{UNKNOWN_STOCK_LABEL}</Badge>
                : dp.is_stockout
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
                    () => toast.success('✅ SKU copiado'),
                    () => toast.error('Erro ao copiar'),
                  );
                }}
                className={cn('text-muted-foreground hover:text-foreground transition-colors', CATALOG_FOCUS_VISIBLE)}
                aria-label="Copiar SKU"
              >
                <Copy className="w-3 h-3" />
              </button>
            </div>

            {/* CT-31 — Qtd. mínima / Prazo / Origem em grade de 3 colunas (MetaTile) */}
            {(dp.min_quantity != null || dp.lead_time_days != null || dp.origin_country) && (
              <div className="grid grid-cols-3 gap-2">
                {dp.min_quantity != null && <MetaTile icon={Layers} label="Qtd. mínima" value={`${dp.min_quantity} un.`} />}
                {dp.lead_time_days != null && <MetaTile icon={Clock} label="Prazo" value={`${dp.lead_time_days} dias úteis`} />}
                {dp.origin_country && <MetaTile icon={Globe} label="Origem" value={dp.origin_country} />}
              </div>
            )}

            <Separator />

            {/* CT-32 — descrição */}
            {(dp.description || dp.short_description) && (
              <SectionCard title="Descrição">
                <p className="text-sm text-foreground/80 whitespace-pre-line leading-relaxed">
                  {dp.description || dp.short_description}
                </p>
              </SectionCard>
            )}

            {/* CT-32 — ficha técnica (dimensões, peso, capacidade, material,
                gravação, NCM e embalagem — todos campos do payload da E21) */}
            {(dp.dimensions_display || (dp.weight_g != null && dp.weight_g > 0) || dp.capacity_ml != null
              || (dp.materials && dp.materials.length > 0) || dp.ncm_code || dp.engraving_type
              || dp.engraving_description || dp.has_gift_box) && (
              <SectionCard title="Ficha técnica">
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
                      <div><span className="text-3xs text-muted-foreground block">Peso</span><span className="text-xs">{fmtWeight(dp.weight_g)}</span></div>
                    </div>
                  )}
                  {dp.capacity_ml != null && (
                    <div className="flex items-start gap-1.5">
                      <Box className="w-3.5 h-3.5 text-muted-foreground mt-0.5 shrink-0" />
                      <div><span className="text-3xs text-muted-foreground block">Capacidade</span><span className="text-xs">{dp.capacity_ml} ml</span></div>
                    </div>
                  )}
                  {dp.materials && dp.materials.length > 0 && (
                    <div className="flex items-start gap-1.5">
                      <Palette className="w-3.5 h-3.5 text-muted-foreground mt-0.5 shrink-0" />
                      <div><span className="text-3xs text-muted-foreground block">Material</span><span className="text-xs">{dp.materials.join(', ')}</span></div>
                    </div>
                  )}
                  {dp.engraving_type && (
                    <div className="flex items-start gap-1.5">
                      <Tag className="w-3.5 h-3.5 text-muted-foreground mt-0.5 shrink-0" />
                      <div><span className="text-3xs text-muted-foreground block">Gravação</span><span className="text-xs">{dp.engraving_type}</span></div>
                    </div>
                  )}
                  {dp.ncm_code && (
                    <div className="flex items-start gap-1.5">
                      <Box className="w-3.5 h-3.5 text-muted-foreground mt-0.5 shrink-0" />
                      <div><span className="text-3xs text-muted-foreground block">NCM</span><span className="text-xs">{dp.ncm_code}</span></div>
                    </div>
                  )}
                </div>
                {dp.engraving_description && (
                  <p className="text-xs text-muted-foreground mt-2">{dp.engraving_description}</p>
                )}
                {dp.has_gift_box && (
                  <p className="text-xs text-muted-foreground mt-2 flex items-center gap-1.5">
                    <Store className="w-3.5 h-3.5 shrink-0" />
                    Inclui embalagem de presente
                  </p>
                )}
              </SectionCard>
            )}

            {/* CT-33 — cores (ColorSwatch): estoque por cor e clique que rola a
                galeria até a 1ª imagem da cor */}
            {colors.length > 0 && (
              <div>
                <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2 flex items-center gap-1.5">
                  <Palette className="w-3.5 h-3.5" /> Cores
                </h4>
                <div className="flex flex-wrap gap-1.5">
                  {colors.map((c) => {
                    const isActive = selectedColor === c.name;
                    return (
                      <button
                        key={c.name}
                        type="button"
                        onClick={() => selectColor(c.name, c.image)}
                        aria-pressed={isActive}
                        aria-label={c.stock != null ? `Cor ${c.name}: ${c.stock} em estoque` : `Cor ${c.name}`}
                        title={c.name}
                        className={cn(
                          'rounded-full p-0.5 transition-all',
                          isActive ? 'ring-2 ring-primary/60' : 'hover:opacity-80',
                          CATALOG_FOCUS_VISIBLE
                        )}
                      >
                        <ColorSwatch hex={c.hex} name={c.name} size={24} />
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            {/* CT-34 — variantes agrupadas por cor (groupVariantsByColor) */}
            {loadingVariants ? (
              <div className="flex items-center gap-2 text-sm text-muted-foreground py-2">
                <div className="animate-spin rounded-full h-4 w-4 border-2 border-primary border-t-transparent" />
                Carregando variantes...
              </div>
            ) : groups.length > 0 ? (
              <div>
                <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">
                  Variantes ({groups.length})
                </h4>
                <div className="space-y-1.5 max-h-52 overflow-y-auto">
                  {groups.map((g) => {
                    const isActive = selectedColor === g.colorName;
                    const stock = groupStock.get(g.colorName) ?? 0;
                    const forecast = stock <= 0
                      ? g.variants.map((v) => fmtShortDate(v.next_entry_date)).find((d): d is string => !!d) ?? null
                      : null;
                    return (
                      <button
                        key={g.colorName}
                        type="button"
                        onClick={() => selectColor(isActive ? null : g.colorName, isActive ? null : g.images[0] ?? null)}
                        aria-pressed={isActive}
                        className={cn(
                          'w-full flex items-center gap-2.5 p-2 rounded-lg text-sm text-left transition-colors',
                          isActive ? 'bg-primary/10 ring-1 ring-primary/40' : 'bg-muted/40 hover:bg-muted/60',
                          CATALOG_FOCUS_VISIBLE
                        )}
                      >
                        {g.images[0] ? (
                          <span className={cn('catalog-gallery-thumb block w-9 h-9 shrink-0', isActive && 'catalog-gallery-thumb--active')}>
                            <img src={g.images[0]} alt={productImageAlt(dp.name, g.colorName)} className="w-full h-full object-cover" loading="lazy" onError={handleImageError} />
                          </span>
                        ) : (
                          <ColorSwatch hex={g.colorHex} name={g.colorName} size={20} />
                        )}
                        <span className="flex-1 min-w-0">
                          <span className="block text-xs font-medium truncate">{g.colorName}</span>
                          {forecast && (
                            <span className="block text-3xs text-amber-600 dark:text-amber-500">
                              Previsão de entrada {forecast}
                            </span>
                          )}
                        </span>
                        <span className="text-3xs text-muted-foreground shrink-0">{stock} un.</span>
                      </button>
                    );
                  })}
                </div>
                {activeGroup && (
                  <ul className="mt-1.5 space-y-1">
                    {activeGroup.variants.map((v) => (
                      <li key={v.id} className="flex items-center justify-between gap-2 text-3xs text-muted-foreground">
                        <span className="truncate">SKU: {v.sku}</span>
                        <span className="shrink-0 tabular-nums">{v.stock_quantity} un.</span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            ) : null}
          </div>
        </ScrollArea>

        {/* rodapé: fornecedor + envio (E66 / CT-34) */}
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
                onClick={() => { onSend(dp, selectedColor ?? undefined); onOpenChange(false); }}
                disabled={dp.is_stockout}
              >
                <Send className="w-4 h-4 mr-2" />
                {selectedColor ? `Enviar variação (${selectedColor})` : 'Enviar produto no chat'}
              </Button>
            )}
          </div>
        )}
    </>
  );

  // CT-30 — abaixo de md (768px) o detalhe vira Drawer (vaul); em telas
  // maiores continua o Sheet lateral de sempre.
  if (isMobile) {
    return (
      <Drawer open={open} onOpenChange={onOpenChange}>
        <DrawerContent
          data-testid="product-detail-drawer"
          className="max-h-[92vh] p-0 overflow-hidden"
        >
          {panel}
        </DrawerContent>
      </Drawer>
    );
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      {/* largura: sobreescrita via className pq sheetVariants fixa sm:max-w-sm */}
      <SheetContent side="right" data-testid="product-detail-sheet" className="w-full sm:max-w-xl p-0 flex flex-col overflow-hidden">
        {panel}
      </SheetContent>
    </Sheet>
  );
}
