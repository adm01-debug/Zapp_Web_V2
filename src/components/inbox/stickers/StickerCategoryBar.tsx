import { cn } from '@/lib/utils';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Star, Clock, TrendingUp } from 'lucide-react';
import { CATEGORY_LABELS, type StickerItem } from './StickerTypes';

interface StickerCategoryBarProps {
  stickers: StickerItem[];
  activeCategory: string | null;
  showFavorites: boolean;
  showRecent: boolean;
  /** Filtro "Mais usadas" (só o seletor usa; o administrador mantém a ordem padrão). */
  showMostUsed?: boolean;
  onCategoryChange: (cat: string | null) => void;
  onToggleFavorites: () => void;
  onToggleRecent: () => void;
  onToggleMostUsed?: () => void;
}

export function StickerCategoryBar({
  stickers,
  activeCategory,
  showFavorites,
  showRecent,
  showMostUsed = false,
  onCategoryChange,
  onToggleFavorites,
  onToggleRecent,
  onToggleMostUsed,
}: StickerCategoryBarProps) {
  const categories = [...new Set(stickers.map(s => s.category).filter(Boolean))].sort((a, b) => a.localeCompare(b));
  const favCount = stickers.filter(s => s.is_favorite).length;
  const showAll = !activeCategory && !showFavorites && !showRecent && !showMostUsed;

  return (
    <div className="px-2 py-2 border-b border-border/30" role="tablist" aria-label="Filtros de figurinhas">
      <ScrollArea className="w-full">
        <div className="flex gap-1.5 flex-wrap">
          <button
            role="tab"
            aria-selected={showAll}
            onClick={() => onCategoryChange(null)}
            className={cn(
              'px-2.5 py-1 rounded-full text-2xs font-medium transition-colors whitespace-nowrap focus:outline-none focus:ring-2 focus:ring-primary',
              showAll
                ? 'bg-primary text-primary-foreground'
                : 'bg-muted text-muted-foreground hover:bg-muted/80'
            )}
          >
            Todas ({stickers.length})
          </button>

          <button
            role="tab"
            aria-selected={showRecent}
            onClick={onToggleRecent}
            className={cn(
              'px-2.5 py-1 rounded-full text-2xs font-medium transition-colors whitespace-nowrap flex items-center gap-1 focus:outline-none focus:ring-2 focus:ring-primary',
              showRecent
                ? 'bg-primary text-primary-foreground'
                : 'bg-muted text-muted-foreground hover:bg-muted/80'
            )}
          >
            <Clock className="w-3 h-3" aria-hidden="true" /> Recentes
          </button>

          {onToggleMostUsed && (
            <button
              role="tab"
              aria-selected={showMostUsed}
              onClick={onToggleMostUsed}
              className={cn(
                'px-2.5 py-1 rounded-full text-2xs font-medium transition-colors whitespace-nowrap flex items-center gap-1 focus:outline-none focus:ring-2 focus:ring-primary',
                showMostUsed
                  ? 'bg-primary text-primary-foreground'
                  : 'bg-muted text-muted-foreground hover:bg-muted/80'
              )}
            >
              <TrendingUp className="w-3 h-3" aria-hidden="true" /> Mais usadas
            </button>
          )}

          <button
            role="tab"
            aria-selected={showFavorites}
            onClick={onToggleFavorites}
            className={cn(
              'px-2.5 py-1 rounded-full text-2xs font-medium transition-colors whitespace-nowrap flex items-center gap-1 focus:outline-none focus:ring-2 focus:ring-primary',
              showFavorites
                ? 'bg-primary text-primary-foreground'
                : 'bg-muted text-muted-foreground hover:bg-muted/80'
            )}
          >
            <Star className="w-3 h-3" aria-hidden="true" /> Favoritas {favCount > 0 && `(${favCount})`}
          </button>

          {categories.map(cat => {
            const info = CATEGORY_LABELS[cat];
            const count = stickers.filter(s => s.category === cat).length;
            return (
              <button
                key={cat}
                role="tab"
                aria-selected={activeCategory === cat}
                onClick={() => onCategoryChange(activeCategory === cat ? null : cat)}
                className={cn(
                  'px-2.5 py-1 rounded-full text-2xs font-medium transition-colors whitespace-nowrap focus:outline-none focus:ring-2 focus:ring-primary',
                  activeCategory === cat
                    ? 'bg-primary text-primary-foreground'
                    : 'bg-muted text-muted-foreground hover:bg-muted/80'
                )}
              >
                <span aria-hidden="true">{info?.emoji || '📦'}</span> {info?.label || cat} ({count})
              </button>
            );
          })}
        </div>
      </ScrollArea>
    </div>
  );
}
