import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';
import { AnimatePresence } from 'framer-motion';
import { Sticker, Search, Plus, Loader2, Upload, X, Grid3X3, LayoutGrid, Grid2X2 } from 'lucide-react';

import { CATEGORY_LABELS } from './stickers/StickerTypes';
import { StickerUploadPreview } from './stickers/StickerUploadPreview';
import { StickerGrid } from './stickers/StickerGrid';
import { StickerCategoryBar } from './stickers/StickerCategoryBar';
import { useStickerPicker } from '@/hooks/sticker-picker/useStickerPicker';

interface StickerPickerProps {
  onSendSticker: (stickerUrl: string) => void;
  disabled?: boolean;
}

export function StickerPicker({ onSendSticker, disabled }: StickerPickerProps) {
  const {
    open, setOpen, stickers, filtered, loading, search, setSearch, uploading,
    activeCategory, setActiveCategory, showFavorites, setShowFavorites, showRecent, setShowRecent,
    pendingUpload, setPendingUpload, gridSize, isDragOver, fileInputRef, searchInputRef,
    handleDragOver, handleDragLeave, handleDrop, handleFileSelect,
    handleConfirmUpload, handleCancelUpload, handleSend, toggleFavorite, handleCategoryChange, handleDelete, cycleGridSize,
  } = useStickerPicker(onSendSticker);

  const GridSizeIcon = gridSize === 'sm' ? Grid3X3 : gridSize === 'md' ? LayoutGrid : Grid2X2;

  return (
    <TooltipProvider delayDuration={300}>
      <Tooltip>
        <Popover open={open} onOpenChange={(v) => { setOpen(v); if (!v) { setPendingUpload(null); setSearch(''); } }}>
          <TooltipTrigger asChild>
            <PopoverTrigger asChild>
              <Button variant="ghost" size="icon" className="w-9 h-9 text-muted-foreground hover:text-foreground hover:bg-muted shrink-0" disabled={disabled} aria-label="Figurinhas">
                <Sticker className="w-[18px] h-[18px]" />
              </Button>
            </PopoverTrigger>
          </TooltipTrigger>
          <TooltipContent side="top">Figurinhas</TooltipContent>
          <PopoverContent className={cn('w-[min(380px,calc(100vw_-_1rem))] p-0 bg-popover border-border', isDragOver && 'ring-2 ring-primary ring-offset-2')} align="end" side="top" sideOffset={8} onDragOver={handleDragOver} onDragLeave={handleDragLeave} onDrop={handleDrop}>
            {isDragOver && (
              <div className="absolute inset-0 z-50 bg-primary/10 border-2 border-dashed border-primary rounded-lg flex items-center justify-center">
                <div className="text-center"><Upload className="w-8 h-8 text-primary mx-auto mb-2" /><p className="text-sm font-medium text-primary">Solte aqui para adicionar</p></div>
              </div>
            )}

            <div className="flex items-center justify-between px-3 py-2.5 border-b border-border">
              <h4 className="text-sm font-semibold text-foreground flex items-center gap-2"><Sticker className="w-4 h-4 text-primary" />Figurinhas</h4>
              <div className="flex items-center gap-1">
                <Button variant="ghost" size="icon" className="w-7 h-7 text-muted-foreground hover:text-foreground" onClick={cycleGridSize} aria-label="Alterar tamanho da grade"><GridSizeIcon className="w-3.5 h-3.5" /></Button>
                <input ref={fileInputRef} type="file" accept="image/webp,image/png,image/gif,image/jpeg" className="hidden" onChange={handleFileSelect} />
                <Button variant="ghost" size="icon" className="w-7 h-7 text-muted-foreground hover:text-primary" onClick={() => fileInputRef.current?.click()} disabled={uploading || !!pendingUpload} aria-label="Adicionar nova figurinha">
                  {uploading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Plus className="w-3.5 h-3.5" />}
                </Button>
              </div>
            </div>

            <AnimatePresence>
              {pendingUpload && (
                <div className="px-3 py-2 border-b border-border/50">
                  <StickerUploadPreview pending={pendingUpload} onConfirm={handleConfirmUpload} onCancel={handleCancelUpload} />
                </div>
              )}
            </AnimatePresence>

            <div className="px-3 py-2 border-b border-border/50">
              <div className="relative">
                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
                <Input ref={searchInputRef} value={search} onChange={e => setSearch(e.target.value)} placeholder="Buscar por nome ou categoria..." className="h-8 pl-8 text-xs bg-muted/50 border-border/50" aria-label="Buscar figurinhas" />
                {search && (
                  <button onClick={() => { setSearch(''); searchInputRef.current?.focus(); }} className="absolute right-2 top-1/2 -translate-y-1/2" aria-label="Limpar busca">
                    <X className="w-3 h-3 text-muted-foreground" />
                  </button>
                )}
              </div>
            </div>

            <StickerCategoryBar stickers={stickers} activeCategory={activeCategory} showFavorites={showFavorites} showRecent={showRecent}
              onCategoryChange={(cat) => { setActiveCategory(cat); setShowFavorites(false); setShowRecent(false); }}
              onToggleFavorites={() => { setShowFavorites(!showFavorites); setActiveCategory(null); setShowRecent(false); }}
              onToggleRecent={() => { setShowRecent(!showRecent); setActiveCategory(null); setShowFavorites(false); }}
            />

            <StickerGrid stickers={filtered} loading={loading} search={search} gridSize={gridSize}
              onSend={handleSend} onToggleFavorite={toggleFavorite} onDelete={handleDelete} onCategoryChange={handleCategoryChange} onAddClick={() => fileInputRef.current?.click()}
            />

            <div className="px-3 py-2 border-t border-border/30 flex items-center justify-between">
              <span className="text-[10px] text-muted-foreground">
                {filtered.length}/{stickers.length} figurinhas
                {showRecent && ' · Mais usadas'}{showFavorites && ' · Favoritas'}{activeCategory && ` · ${CATEGORY_LABELS[activeCategory]?.label}`}
              </span>
              <div className="flex items-center gap-2">
                <span className="text-[9px] text-muted-foreground/60">Arraste uma imagem ou</span>
                <Button variant="ghost" size="sm" className="h-6 text-[10px] text-muted-foreground hover:text-primary gap-1" onClick={() => fileInputRef.current?.click()} disabled={uploading || !!pendingUpload}>
                  <Upload className="w-3 h-3" />Upload
                </Button>
              </div>
            </div>
          </PopoverContent>
        </Popover>
      </Tooltip>
    </TooltipProvider>
  );
}
