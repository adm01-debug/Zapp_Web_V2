import { useState, useRef, useCallback } from 'react';
import { cn } from '@/lib/utils';
import { motion, AnimatePresence } from 'framer-motion';
import { Star, Trash2, Sticker, Plus, Loader2, Clock } from 'lucide-react';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { CategorySelector } from './CategorySelector';
import { CATEGORY_LABELS, type StickerItem } from './StickerTypes';

interface StickerGridProps {
  stickers: StickerItem[];
  loading: boolean;
  search: string;
  gridSize: 'sm' | 'md' | 'lg';
  onSend: (sticker: StickerItem) => void;
  onToggleFavorite: (e: React.MouseEvent, sticker: StickerItem) => void;
  onDelete: (e: React.MouseEvent, sticker: StickerItem) => void;
  onCategoryChange: (sticker: StickerItem, cat: string) => void;
  onAddClick: () => void;
}

const gridColsMap = {
  sm: 'grid-cols-5',
  md: 'grid-cols-4',
  lg: 'grid-cols-3',
};

export function StickerGrid({
  stickers,
  loading,
  search,
  gridSize,
  onSend,
  onToggleFavorite,
  onDelete,
  onCategoryChange,
  onAddClick,
}: StickerGridProps) {
  const [deleteTarget, setDeleteTarget] = useState<StickerItem | null>(null);
  const [hoveredId, setHoveredId] = useState<string | null>(null);
  const gridRef = useRef<HTMLDivElement>(null);

  const handleKeyDown = useCallback((e: React.KeyboardEvent, sticker: StickerItem) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      onSend(sticker);
    } else if (e.key === 'f') {
      e.preventDefault();
      onToggleFavorite(e as unknown as React.MouseEvent, sticker);
    } else if (e.key === 'Delete' || e.key === 'Backspace') {
      e.preventDefault();
      setDeleteTarget(sticker);
    }
  }, [onSend, onToggleFavorite]);

  const confirmDelete = (e: React.MouseEvent) => {
    if (deleteTarget) {
      onDelete(e, deleteTarget);
      setDeleteTarget(null);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12" role="status" aria-label="Carregando figurinhas">
        <Loader2 className="w-6 h-6 text-muted-foreground animate-spin" />
        <span className="sr-only">Carregando figurinhas...</span>
      </div>
    );
  }

  if (stickers.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-10 text-center" role="status">
        <Sticker className="w-10 h-10 text-muted-foreground/40 mb-3" aria-hidden="true" />
        <p className="text-sm text-muted-foreground font-medium">
          {search ? 'Nenhuma figurinha encontrada' : 'Nenhuma figurinha'}
        </p>
        <p className="text-xs text-muted-foreground mt-1">
          Clique em <Plus className="w-3 h-3 inline" aria-hidden="true" /> para adicionar
        </p>
        {!search && (
          <button
            onClick={onAddClick}
            className="mt-3 text-xs text-primary hover:underline focus:outline-none focus:ring-2 focus:ring-primary rounded px-2 py-1"
          >
            Adicionar primeira figurinha
          </button>
        )}
      </div>
    );
  }

  return (
    <>
      <ScrollArea className="h-[260px]">
        <div className="p-2" ref={gridRef} role="grid" aria-label="Grade de figurinhas">
          <div className={cn('grid gap-1.5', gridColsMap[gridSize])}>
            <AnimatePresence>
              {stickers.map((sticker, idx) => (
                <Tooltip key={sticker.id}>
                  <TooltipTrigger asChild>
                    <motion.button
                      initial={{ opacity: 0, scale: 0.8 }}
                      animate={{ opacity: 1, scale: 1 }}
                      exit={{ opacity: 0, scale: 0.8 }}
                      whileHover={{ scale: 1.08 }}
                      whileTap={{ scale: 0.92 }}
                      onClick={() => onSend(sticker)}
                      onKeyDown={(e) => handleKeyDown(e, sticker)}
                      onMouseEnter={() => setHoveredId(sticker.id)}
                      onMouseLeave={() => setHoveredId(null)}
                      tabIndex={0}
                      role="gridcell"
                      aria-label={`${sticker.name || 'Figurinha'} - ${CATEGORY_LABELS[sticker.category]?.label || sticker.category}${sticker.is_favorite ? ' (favorita)' : ''} - usada ${sticker.use_count || 0}x`}
                      className={cn(
                        'relative aspect-square rounded-lg overflow-hidden group',
                        'bg-muted/30 hover:bg-muted/60 transition-all duration-200',
                        'border border-transparent hover:border-primary/30',
                        'cursor-pointer focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-1',
                        sticker.is_favorite && 'ring-1 ring-primary/20'
                      )}
                    >
                      <img
                        src={sticker.image_url}
                        alt={sticker.name || 'Figurinha'}
                        className="w-full h-full object-contain p-1"
                        loading="lazy"
                        decoding="async"
                      />
                      
                      {/* Category badge */}
                      <span className="absolute top-0.5 left-0.5 text-[9px] leading-none" aria-hidden="true">
                        {CATEGORY_LABELS[sticker.category]?.emoji || '📦'}
                      </span>

                      {/* Favorite indicator */}
                      {sticker.is_favorite && (
                        <span className="absolute top-0.5 right-0.5" aria-hidden="true">
                          <Star className="w-2.5 h-2.5 fill-primary text-primary" />
                        </span>
                      )}

                      {/* Usage badge */}
                      {sticker.use_count > 0 && (
                        <span className="absolute bottom-0.5 right-0.5 text-[8px] bg-background/80 text-muted-foreground rounded px-1 leading-tight" aria-hidden="true">
                          {sticker.use_count}×
                        </span>
                      )}

                      {/* Overlay actions */}
                      <div className={cn(
                        'absolute inset-0 bg-background/70 transition-opacity flex flex-col items-center justify-between p-1',
                        hoveredId === sticker.id ? 'opacity-100' : 'opacity-0'
                      )}>
                        <div className="flex items-center justify-between w-full">
                          <button
                            onClick={(e) => onToggleFavorite(e, sticker)}
                            className="p-0.5 hover:scale-110 transition-transform"
                            aria-label={sticker.is_favorite ? 'Remover dos favoritos' : 'Adicionar aos favoritos'}
                          >
                            <Star className={cn(
                              'w-3.5 h-3.5 transition-colors',
                              sticker.is_favorite ? 'fill-primary text-primary' : 'text-muted-foreground hover:text-primary'
                            )} />
                          </button>
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              setDeleteTarget(sticker);
                            }}
                            className="p-0.5 hover:scale-110 transition-transform"
                            aria-label="Excluir figurinha"
                          >
                            <Trash2 className="w-3.5 h-3.5 text-destructive" />
                          </button>
                        </div>
                        <div onClick={(e) => e.stopPropagation()}>
                          <CategorySelector
                            value={sticker.category}
                            onChange={(cat) => onCategoryChange(sticker, cat)}
                            size="xs"
                          />
                        </div>
                      </div>
                    </motion.button>
                  </TooltipTrigger>
                  <TooltipContent side="top" className="text-xs max-w-[180px]">
                    <p className="font-medium">{sticker.name || 'Figurinha'}</p>
                    <p className="text-muted-foreground text-[10px]">
                      {CATEGORY_LABELS[sticker.category]?.emoji} {CATEGORY_LABELS[sticker.category]?.label} · {sticker.use_count || 0}× usada
                    </p>
                    <p className="text-muted-foreground text-[10px] mt-0.5">
                      Enter: enviar · F: favorito · Del: excluir
                    </p>
                  </TooltipContent>
                </Tooltip>
              ))}
            </AnimatePresence>
          </div>
        </div>
      </ScrollArea>

      {/* Delete confirmation dialog */}
      <AlertDialog open={!!deleteTarget} onOpenChange={(open) => !open && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir figurinha?</AlertDialogTitle>
            <AlertDialogDescription>
              {deleteTarget && (
                <span className="flex items-center gap-3 mt-2">
                  <img src={deleteTarget.image_url} alt="" className="w-12 h-12 object-contain rounded bg-muted p-1"  loading="lazy" decoding="async"/>
                  <span>
                    "{deleteTarget.name || 'Figurinha'}" será removida permanentemente. 
                    Esta ação não pode ser desfeita.
                  </span>
                </span>
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={confirmDelete} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              Excluir
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
