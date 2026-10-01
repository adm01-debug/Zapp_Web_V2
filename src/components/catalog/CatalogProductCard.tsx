import React, { useState } from 'react';
import { Send, Eye, Heart, Star, Sparkles, TrendingUp, Tag, Check, Copy, Link2, ExternalLink } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';
import type { ExternalProduct } from '@/hooks/integrations/useExternalCatalog';
import { formatPrice, ProductThumb } from './catalogShared';
import { ProductDetailDialog } from './ProductDetailDialog';
// CT-25 — menu de ações do card (menu real do Talk X, já usado no repo).
import { RowActionsMenu, type RowAction } from '@/components/talkx/talkxShared';
// CT-25 — "Copiar link"/"Abrir no PromoGifts" reusam o mesmo builder de URL
// do export CSV (CT-20), em vez de montar a URL de novo aqui.
import { promogiftsProductUrl } from './catalogExport';
import { toast } from 'sonner';

// ── tipos ─────────────────────────────────────────────────────
export interface CatalogProductCardProps {
  product: ExternalProduct;
  /**
   * CT-34 — o 2º argumento (cor selecionada) só existe no `onSend` vindo do
   * `ProductDetailDialog`; quem abre o `SendProductDialog` é o caller, que
   * repassa a cor como `initialVariantColor`.
   */
  onSend?: (p: ExternalProduct, variantColor?: string) => void;
  /** grade = card quadrado; list = linha densa */
  mode?: 'grade' | 'list';
  /** E43: favoritos via Supabase */
  isFavorite?: boolean;
  onToggleFavorite?: (id: string) => void;
  /** E47: seleção em massa */
  isSelected?: boolean;
  onToggleSelect?: (id: string) => void;
  /**
   * CT-36 — produtos do resultado atual, na ordem exibida, repassados ao
   * `ProductDetailDialog` para a navegação ‹ › dentro do Sheet.
   */
  products?: ExternalProduct[];
  /**
   * CT-72 — capa acima da dobra: sai com `loading="eager"` +
   * `fetchpriority="high"` (o `priority` do ProductThumb). Só as 4 primeiras
   * capas da grade recebem isso; o resto continua lazy.
   */
  priority?: boolean;
  /** CT-72 — largura real do card no breakpoint, para o srcSet do CF Images. */
  sizes?: string;
}

/**
 * CT-72 — largura do card em grade, medida no grid real (`grid-cols-2
 * md:grid-cols-3 lg:grid-cols-4` do catálogo do chat e `... xl:grid-cols-5`
 * com rail de 300px no de gestão):
 *   <768px  → 2 colunas  (~171px, 50vw)
 *   768px   → 3 colunas  (~235px, 33vw)
 *   1024px  → 4 colunas  (~236px, 25vw)  ← o default antigo caía no 33vw do `md`
 *   1280px+ → 4/5 colunas com rail (~172-283px, 220px)
 * Sem o degrau de 1024px o browser escolhia a variante de 400w onde a de
 * 300w bastava.
 */
export const CATALOG_GRADE_SIZES =
  '(min-width: 1280px) 220px, (min-width: 1024px) 25vw, (min-width: 768px) 33vw, 50vw';

// ── badge de destaque (top-left) ───────────────────────────────────────────
function ProductBadge({ product }: { product: ExternalProduct }) {
  if (product.is_new) return (
    <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[9px] font-bold bg-emerald-500 text-white">
      <Sparkles className="w-2.5 h-2.5" />Novo
    </span>
  );
  if (product.is_bestseller) return (
    <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[9px] font-bold bg-orange-500 text-white">
      <TrendingUp className="w-2.5 h-2.5" />Top
    </span>
  );
  if (product.is_on_sale) return (
    <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[9px] font-bold bg-rose-500 text-white">
      <Tag className="w-2.5 h-2.5" />Promo
    </span>
  );
  if (product.categories?.name) return (
    <span className="px-1.5 py-0.5 rounded text-[9px] font-medium bg-background/80 text-foreground/70 border border-border/40 backdrop-blur-sm">
      {product.categories.name.slice(0, 18)}
    </span>
  );
  return null;
}

// ── chips de cor ─────────────────────────────────────────────────────
function ColorChips({ product }: { product: ExternalProduct }) {
  const swatches = product.color_swatches;
  const colors   = product.colors;
  if (swatches && swatches.length > 0) {
    return (
      <div className="flex items-center gap-0.5 flex-wrap">
        {swatches.slice(0, 5).map((s, si) => (
          <span
            key={s.color_name ?? s.color_hex ?? si}
            title={s.color_name ?? undefined}
            className="w-3.5 h-3.5 rounded-full border border-border/30 shrink-0"
            style={{ backgroundColor: s.color_hex ?? '#ccc' }}
          />
        ))}
        {swatches.length > 5 && (
          <span className="text-[9px] text-muted-foreground">+{swatches.length - 5}</span>
        )}
      </div>
    );
  }
  if (colors && colors.length > 0) {
    return (
      <span className="text-3xs text-muted-foreground">
        {colors.length} cor{colors.length !== 1 ? 'es' : ''}
      </span>
    );
  }
  return null;
}

// ── pill de estoque baixo ────────────────────────────────────────────────
function LowStockPill({ qty }: { qty: number }) {
  if (qty > 10) return null;
  return (
    <span className="text-[9px] font-semibold text-amber-600 bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 px-1.5 py-0.5 rounded-full">
      {qty === 0 ? 'Esgotado' : qty + ' un.'}
    </span>
  );
}

// ── botão favorito ──────────────────────────────────────────────────────
function FavoriteButton({ active, onToggle, productId }: { active: boolean; onToggle?: (id: string) => void; productId: string }) {
  return (
    <button
      type="button"
      onClick={(e) => { e.stopPropagation(); onToggle?.(productId); }}
      className={cn(
        'absolute top-2 right-2 w-6 h-6 rounded-full flex items-center justify-center',
        'bg-background/70 backdrop-blur-sm border border-border/30 hover:scale-110 transition-transform',
        active ? 'text-rose-500' : 'text-muted-foreground'
      )}
      aria-label={active ? 'Remover dos favoritos' : 'Adicionar aos favoritos'}
    >
      <Heart className={cn('w-3.5 h-3.5', active && 'fill-current')} />
    </button>
  );
}

// ── checkbox de seleção (E47) ─────────────────────────────────────────────
function SelectCheckbox({ selected, onToggle, productId }: {
  selected: boolean;
  onToggle: (id: string) => void;
  productId: string;
}) {
  return (
    <button
      type="button"
      onClick={(e) => { e.stopPropagation(); onToggle(productId); }}
      className={cn(
        'w-5 h-5 rounded border-2 flex items-center justify-center shrink-0',
        'transition-all duration-150',
        selected
          ? 'border-primary bg-primary text-primary-foreground'
          : 'border-border/60 bg-background/80 backdrop-blur-sm text-transparent hover:border-primary/60'
      )}
      aria-label={selected ? 'Desselecionar produto' : 'Selecionar produto'}
      aria-pressed={selected}
    >
      <Check className="w-3 h-3" />
    </button>
  );
}

// ── skeleton ─────────────────────────────────────────────────────────
export function CatalogProductCardSkeleton({ mode = 'grade' }: { mode?: 'grade' | 'list' }) {
  if (mode === 'list') return (
    <div className="flex items-center gap-3 px-4 py-3 border-b border-border/30 animate-pulse">
      <div className="w-14 h-14 rounded-md bg-muted shrink-0" />
      <div className="flex-1 space-y-1.5">
        <div className="h-3.5 w-2/3 bg-muted rounded" />
        <div className="h-3 w-1/3 bg-muted rounded" />
      </div>
      <div className="h-5 w-16 bg-muted rounded" />
    </div>
  );
  return (
    <div className="rounded-xl border border-border/30 overflow-hidden animate-pulse">
      <div className="aspect-square bg-muted" />
      <div className="p-3 space-y-2">
        <div className="h-3.5 w-3/4 bg-muted rounded" />
        <div className="h-3 w-1/2 bg-muted rounded" />
        <div className="h-4 w-1/3 bg-muted rounded" />
        <div className="flex gap-1.5">
          <div className="flex-1 h-8 bg-muted rounded" />
          <div className="flex-1 h-8 bg-muted rounded" />
        </div>
      </div>
    </div>
  );
}

// ── card principal ───────────────────────────────────────────────────────
export function CatalogProductCard({
  product,
  onSend,
  mode = 'grade',
  isFavorite = false,
  onToggleFavorite,
  isSelected = false,
  onToggleSelect,
  products,
  priority = false,
  sizes,
}: CatalogProductCardProps) {
  const [showDetails, setShowDetails] = useState(false);
  const stockout = product.is_stockout || product.stock_quantity === 0;

  // ── CT-25: ações do card (RowActionsMenu) ────────────────────────────────
  const openDetails = () => setShowDetails(true);
  // "Copiar link"/"Abrir no PromoGifts" precisam do slug: sem ele a URL sai
  // vazia e as duas ações ficam desabilitadas (nada morto no menu).
  const promoUrl = promogiftsProductUrl(product.slug);
  const copyToClipboard = (value: string, okMessage: string) => {
    void navigator.clipboard.writeText(value).then(
      () => toast.success(okMessage),
      () => toast.error('Erro ao copiar'),
    );
  };
  const actions: RowAction[] = [
    { label: 'Ver detalhes', icon: Eye, onSelect: openDetails },
    { label: 'Enviar', icon: Send, onSelect: () => onSend?.(product), disabled: !onSend || stockout },
    { label: 'Copiar SKU', icon: Copy, onSelect: () => copyToClipboard(product.sku, '✅ SKU copiado'), disabled: !product.sku },
    { label: 'Copiar link', icon: Link2, onSelect: () => copyToClipboard(promoUrl, '✅ Link copiado'), disabled: !promoUrl },
    { label: 'Abrir no PromoGifts', icon: ExternalLink, onSelect: () => window.open(promoUrl, '_blank', 'noopener,noreferrer'), disabled: !promoUrl },
  ];
  if (onToggleFavorite) {
    actions.push({
      label: isFavorite ? 'Remover dos favoritos' : 'Favoritar',
      icon: Heart,
      onSelect: () => onToggleFavorite(product.id),
    });
  }

  /**
   * CT-25 — teclado no card: `Enter` abre o detalhe, `e` envia. Só reage ao
   * próprio card (eventos de inputs/botões internos sobem com outro target),
   * então digitar num campo de busca não dispara envio.
   */
  const handleCardKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    if (e.target !== e.currentTarget) return;
    if (e.key === 'Enter') {
      e.preventDefault();
      openDetails();
    } else if ((e.key === 'e' || e.key === 'E') && onSend && !stockout) {
      e.preventDefault();
      onSend(product);
    }
  };
  // CT-25 — menu fixo na lista, revelado no hover/focus na grade.
  const cardActionsMenu = (
    <RowActionsMenu actions={actions} label={`Ações do produto ${product.name}`} />
  );

  // ── modo lista ────────────────────────────────────────────────────────
  if (mode === 'list') {
    return (
      <>
        <div
          className={cn(
            'flex items-center gap-3 px-4 py-3 border-b border-border/30 hover:bg-muted/10 transition-colors cursor-pointer',
            isSelected && 'bg-primary/5 border-primary/20'
          )}
          onClick={() => !onToggleSelect && setShowDetails(true)}
          onKeyDown={handleCardKeyDown}
          tabIndex={0}
        >
          {/* E47: checkbox no modo lista */}
          {onToggleSelect && (
            <div onClick={(e) => e.stopPropagation()}>
              <SelectCheckbox selected={isSelected} onToggle={onToggleSelect} productId={product.id} />
            </div>
          )}

          {/* thumb 56px */}
          <div
            className="relative w-14 h-14 rounded-md overflow-hidden bg-muted shrink-0"
            onClick={() => setShowDetails(true)}
          >
            <ProductThumb src={product.primary_image_url} fallbackSrc={product.primary_image_fallback_url} alt={product.name} sizes="56px" />
            {stockout && <div className="absolute inset-0 bg-background/70" />}
          </div>

          {/* info */}
          <div className="flex-1 min-w-0" onClick={() => setShowDetails(true)}>
            <p className="text-[13px] font-semibold text-foreground truncate">{product.name}</p>
            <p className="text-2xs text-muted-foreground truncate">
              {[product.brand, product.suppliers?.name].filter(Boolean).join(' | ')}
            </p>
            <ColorChips product={product} />
          </div>

          {/* preço + estoque */}
          <div className="text-right shrink-0 space-y-0.5">
            <p className="text-[13px] font-bold text-foreground tabular-nums">{formatPrice(product.sale_price)}</p>
            <LowStockPill qty={product.stock_quantity} />
          </div>

          {/* ações */}
          <div className="flex items-center gap-1 shrink-0" onClick={(e) => e.stopPropagation()}>
            <Button size="icon" variant="ghost" className="h-8 w-8" onClick={() => setShowDetails(true)}>
              <Eye className="w-4 h-4" />
            </Button>
            {onSend && (
              stockout ? (
                <Tooltip>
                  <TooltipTrigger asChild>
                    <span className="inline-flex">
                      <Button size="icon" variant="ghost" className="h-8 w-8" disabled>
                        <Send className="w-4 h-4" />
                      </Button>
                    </span>
                  </TooltipTrigger>
                  <TooltipContent>Produto esgotado</TooltipContent>
                </Tooltip>
              ) : (
                <Button size="icon" variant="ghost" className="h-8 w-8" onClick={() => onSend(product)}>
                  <Send className="w-4 h-4" />
                </Button>
              )
            )}
            {onToggleFavorite && (
              <Button
                size="icon" variant="ghost"
                className={cn('h-8 w-8', isFavorite && 'text-rose-500')}
                onClick={() => onToggleFavorite(product.id)}
              >
                <Heart className={cn('w-4 h-4', isFavorite && 'fill-current')} />
              </Button>
            )}
            {/* CT-25 — na lista o menu de ações fica fixo (sem hover) */}
            {cardActionsMenu}
          </div>
        </div>
        <ProductDetailDialog product={product} products={products} open={showDetails} onOpenChange={setShowDetails} onSend={onSend} />
      </>
    );
  }

  // ── modo grade ─────────────────────────────────────────────────────
  return (
    <>
      <div
        className={cn(
          'catalog-card group rounded-xl border border-border/30 overflow-hidden bg-card hover:border-primary/30 hover:shadow-sm transition-all flex flex-col h-full',
          // CT-72 — as 4 capas acima da dobra são pintadas normalmente; nos
          // demais o browser adia layout/paint até o card se aproximar do
          // viewport (content-visibility: auto em components.css).
          !priority && 'catalog-card--offscreen',
          isSelected && 'border-primary/50 bg-primary/5 shadow-sm shadow-primary/10'
        )}
        onKeyDown={handleCardKeyDown}
        tabIndex={0}
      >
        {/* mídia */}
        <div
          className="catalog-media relative aspect-square bg-muted cursor-pointer"
          onClick={() => !onToggleSelect && setShowDetails(true)}
        >
          <ProductThumb
            src={product.primary_image_url}
            fallbackSrc={product.primary_image_fallback_url}
            alt={product.name}
            iconSize="w-12 h-12"
            priority={priority}
            sizes={sizes ?? CATALOG_GRADE_SIZES}
          />
          {/* overlay esgotado */}
          {stockout && (
            <div className="absolute inset-0 bg-background/70 flex items-center justify-center">
              <span className="px-2 py-1 rounded text-xs font-bold bg-destructive text-destructive-foreground">Esgotado</span>
            </div>
          )}

          {/* top-left: checkbox (E47) quando onToggleSelect ativo; badge caso contrário */}
          <div className="absolute top-2 left-2">
            {onToggleSelect ? (
              <div
                className={cn(
                  'transition-opacity',
                  isSelected ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'
                )}
              >
                <SelectCheckbox selected={isSelected} onToggle={onToggleSelect} productId={product.id} />
              </div>
            ) : (
              <ProductBadge product={product} />
            )}
          </div>

          {/* is_kit top-right (quando sem favorito) */}
          {product.is_kit && !onToggleFavorite && (
            <span className="absolute top-2 right-2 px-1.5 py-0.5 rounded text-[9px] font-bold bg-violet-500 text-white">
              Kit
            </span>
          )}
          {/* favorito */}
          {onToggleFavorite && (
            <FavoriteButton active={isFavorite} onToggle={onToggleFavorite} productId={product.id} />
          )}

          {/* CT-25 — menu de ações: revelado no hover (ou com foco do teclado)
              da grade. stopPropagation para o clique no menu não abrir o detalhe. */}
          <div
            className="absolute bottom-2 right-2 opacity-0 group-hover:opacity-100 focus-within:opacity-100 transition-opacity"
            onClick={(e) => e.stopPropagation()}
          >
            {cardActionsMenu}
          </div>
        </div>

        {/* corpo */}
        <div className="p-3 flex flex-col gap-1.5 flex-1">
          <div className="flex-1">
            <p
              className="text-[13px] font-semibold text-foreground line-clamp-2 leading-snug cursor-pointer hover:text-primary transition-colors"
              onClick={() => setShowDetails(true)}
            >
              {product.name}
            </p>
            <p className="text-3xs text-muted-foreground mt-0.5 truncate">
              {[product.brand, product.suppliers?.name].filter(Boolean).join(' · ')}
            </p>
          </div>

          <ColorChips product={product} />

          <div className="flex items-center gap-1.5 flex-wrap">
            <span className="text-sm font-bold text-foreground tabular-nums">{formatPrice(product.sale_price)}</span>
            <LowStockPill qty={product.stock_quantity} />
          </div>

          {/* rodapé */}
          <div className="flex gap-1.5 mt-auto pt-1">
            <Button
              size="sm" variant="outline"
              className="flex-1 h-8 text-xs"
              onClick={() => setShowDetails(true)}
            >
              <Eye className="w-3.5 h-3.5 mr-1" />Ver
            </Button>
            {onSend && (
              stockout ? (
                <Tooltip>
                  <TooltipTrigger asChild>
                    <span className="flex-1 inline-flex">
                      <Button size="sm" className="w-full h-8 text-xs" disabled>
                        <Send className="w-3.5 h-3.5 mr-1" />Enviar
                      </Button>
                    </span>
                  </TooltipTrigger>
                  <TooltipContent>Produto esgotado</TooltipContent>
                </Tooltip>
              ) : (
                <Button size="sm" className="flex-1 h-8 text-xs" onClick={() => onSend(product)}>
                  <Send className="w-3.5 h-3.5 mr-1" />Enviar
                </Button>
              )
            )}
          </div>
        </div>
      </div>
      <ProductDetailDialog product={product} products={products} open={showDetails} onOpenChange={setShowDetails} onSend={onSend} />
    </>
  );
}
