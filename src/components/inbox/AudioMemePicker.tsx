import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';
import { motion, AnimatePresence } from 'framer-motion';
import { Music, Search, Plus, Star, Trash2, Loader2, Upload, X, Play, Pause, Volume2, Tag, Check, ChevronDown } from 'lucide-react';
import { useAudioMemes, formatDuration, type AudioMemeItem, type PendingUpload } from '@/hooks/communication/useAudioMemes';

interface AudioMemePickerProps {
  onSendAudio: (audioUrl: string) => void;
  disabled?: boolean;
}

const CATEGORY_LABELS: Record<string, { emoji: string; label: string }> = {
  'risada': { emoji: '😂', label: 'Risada' }, 'aplausos': { emoji: '👏', label: 'Aplausos' },
  'suspense': { emoji: '🎭', label: 'Suspense' }, 'vitória': { emoji: '🏆', label: 'Vitória' },
  'falha': { emoji: '💥', label: 'Falha' }, 'surpresa': { emoji: '😱', label: 'Surpresa' },
  'triste': { emoji: '😢', label: 'Triste' }, 'raiva': { emoji: '😡', label: 'Raiva' },
  'romântico': { emoji: '💕', label: 'Romântico' }, 'medo': { emoji: '👻', label: 'Medo' },
  'deboche': { emoji: '😏', label: 'Deboche' }, 'narração': { emoji: '🎙️', label: 'Narração' },
  'bordão': { emoji: '💬', label: 'Bordão' }, 'efeito sonoro': { emoji: '🔊', label: 'Efeito Sonoro' },
  'viral': { emoji: '🔥', label: 'Viral' }, 'cumprimento': { emoji: '👋', label: 'Cumprimento' },
  'despedida': { emoji: '👋', label: 'Despedida' }, 'animação': { emoji: '🤩', label: 'Animação' },
  'drama': { emoji: '🎬', label: 'Drama' }, 'gospel': { emoji: '⛪', label: 'Gospel' },
  'outros': { emoji: '📦', label: 'Outros' },
};
const ALL_CATEGORIES = Object.keys(CATEGORY_LABELS);

function CategorySelector({ value, onChange, size = 'sm' }: { value: string; onChange: (cat: string) => void; size?: 'sm' | 'xs' }) {
  const [open, setOpen] = useState(false);
  const info = CATEGORY_LABELS[value] || { emoji: '📦', label: value };
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button className={cn('flex items-center gap-1 rounded-md border border-border/50 transition-colors hover:bg-muted/60', size === 'xs' ? 'px-1.5 py-0.5 text-[10px]' : 'px-2 py-1 text-xs')} onClick={(e) => e.stopPropagation()}>
          <span>{info.emoji}</span><span className="text-muted-foreground">{info.label}</span>
          <ChevronDown className={cn(size === 'xs' ? 'w-2.5 h-2.5' : 'w-3 h-3', 'text-muted-foreground/60')} />
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-[200px] p-1.5 max-h-[240px] overflow-y-auto" align="start" side="bottom" sideOffset={4} onClick={(e) => e.stopPropagation()}>
        <div className="space-y-0.5">
          {ALL_CATEGORIES.map(cat => {
            const catInfo = CATEGORY_LABELS[cat];
            const isActive = cat === value;
            return (
              <button key={cat} onClick={(e) => { e.stopPropagation(); onChange(cat); setOpen(false); }}
                className={cn('w-full flex items-center gap-2 px-2 py-1.5 rounded text-xs transition-colors text-left', isActive ? 'bg-primary/10 text-primary font-medium' : 'hover:bg-muted text-foreground')}>
                <span>{catInfo.emoji}</span><span className="flex-1">{catInfo.label}</span>
                {isActive && <Check className="w-3 h-3 text-primary" />}
              </button>
            );
          })}
        </div>
      </PopoverContent>
    </Popover>
  );
}

function UploadPreview({ pending, onConfirm, onCancel }: { pending: PendingUpload; onConfirm: (p: PendingUpload) => void; onCancel: () => void }) {
  const [category, setCategory] = useState(pending.selectedCategory);
  const [name, setName] = useState(pending.name);
  return (
    <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="p-3 border border-border rounded-lg bg-card space-y-2.5">
      <div className="flex items-center gap-2">
        <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center shrink-0"><Music className="w-4 h-4 text-primary" /></div>
        <Input value={name} onChange={(e) => setName(e.target.value)} className="h-7 text-xs flex-1" placeholder="Nome do áudio" />
      </div>
      <div className="flex items-center gap-2">
        <Tag className="w-3 h-3 text-muted-foreground shrink-0" /><span className="text-[10px] text-muted-foreground shrink-0">Categoria:</span>
        <CategorySelector value={category} onChange={setCategory} size="sm" />
        {pending.aiCategory !== 'outros' && category !== pending.aiCategory && (
          <button onClick={() => setCategory(pending.aiCategory)} className="text-[9px] text-primary hover:underline shrink-0">IA sugere: {CATEGORY_LABELS[pending.aiCategory]?.label}</button>
        )}
      </div>
      <div className="flex items-center gap-2 justify-end">
        <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={onCancel}><X className="w-3 h-3 mr-1" /> Cancelar</Button>
        <Button size="sm" className="h-7 text-xs" onClick={() => onConfirm({ ...pending, selectedCategory: category, name })}><Check className="w-3 h-3 mr-1" /> Salvar</Button>
      </div>
    </motion.div>
  );
}

export function AudioMemePicker({ onSendAudio, disabled }: AudioMemePickerProps) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const [activeCategory, setActiveCategory] = useState<string | null>(null);
  const [showFavorites, setShowFavorites] = useState(false);

  const {
    memes, loading, uploading, playingId, pendingUpload, fileInputRef,
    handlePreview, handleFileSelect, handleConfirmUpload, handleCancelUpload,
    handleSend, toggleFavorite, handleCategoryChange, handleDelete, cleanup,
  } = useAudioMemes(open);

  const categories = [...new Set(memes.map(m => m.category).filter(Boolean))].sort();
  const filtered = memes.filter(m => {
    const matchSearch = !search || m.name?.toLowerCase().includes(search.toLowerCase()) || m.category?.toLowerCase().includes(search.toLowerCase());
    if (showFavorites) return matchSearch && m.is_favorite;
    if (activeCategory) return matchSearch && m.category === activeCategory;
    return matchSearch;
  });

  return (
    <Tooltip>
    <Popover open={open} onOpenChange={(v) => { setOpen(v); if (!v) cleanup(); }}>
      <TooltipTrigger asChild>
        <PopoverTrigger asChild>
          <Button variant="ghost" size="icon" className="w-9 h-9 text-muted-foreground hover:text-foreground hover:bg-muted shrink-0" disabled={disabled} aria-label="Áudio Memes">
            <Volume2 className="w-[18px] h-[18px]" />
          </Button>
        </PopoverTrigger>
      </TooltipTrigger>
      <TooltipContent side="top">Áudio Memes</TooltipContent>
      <PopoverContent className="w-[min(360px,calc(100vw-1rem))] p-0 bg-popover border-border" align="end" side="top" sideOffset={8}>
        <div className="flex items-center justify-between px-3 py-2.5 border-b border-border">
          <h4 className="text-sm font-semibold text-foreground flex items-center gap-2"><Music className="w-4 h-4 text-primary" />Áudios Meme</h4>
          <div className="flex items-center gap-1">
            <input ref={fileInputRef} type="file" accept="audio/*" className="hidden" onChange={handleFileSelect} />
            <Button variant="ghost" size="icon" className="w-7 h-7 text-muted-foreground hover:text-primary" onClick={() => fileInputRef.current?.click()} disabled={uploading || !!pendingUpload} title="Adicionar áudio meme">
              {uploading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Plus className="w-3.5 h-3.5" />}
            </Button>
          </div>
        </div>

        <AnimatePresence>{pendingUpload && (<div className="px-3 py-2 border-b border-border/50"><UploadPreview pending={pendingUpload} onConfirm={handleConfirmUpload} onCancel={handleCancelUpload} /></div>)}</AnimatePresence>

        <div className="px-3 py-2 border-b border-border/50">
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
            <Input value={search} onChange={e => setSearch(e.target.value)} placeholder="Buscar áudios meme..." className="h-8 pl-8 text-xs bg-muted/50 border-border/50" />
            {search && <button onClick={() => setSearch('')} className="absolute right-2 top-1/2 -translate-y-1/2"><X className="w-3 h-3 text-muted-foreground" /></button>}
          </div>
        </div>

        <div className="px-2 py-2 border-b border-border/30">
          <ScrollArea className="w-full">
            <div className="flex gap-1.5 flex-wrap">
              <button onClick={() => { setActiveCategory(null); setShowFavorites(false); }} className={cn('px-2.5 py-1 rounded-full text-[11px] font-medium transition-colors whitespace-nowrap', !activeCategory && !showFavorites ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground hover:bg-muted/80')}>Todos ({memes.length})</button>
              <button onClick={() => { setShowFavorites(!showFavorites); setActiveCategory(null); }} className={cn('px-2.5 py-1 rounded-full text-[11px] font-medium transition-colors whitespace-nowrap flex items-center gap-1', showFavorites ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground hover:bg-muted/80')}><Star className="w-3 h-3" /> Favoritos</button>
              {categories.map(cat => { const info = CATEGORY_LABELS[cat]; const count = memes.filter(m => m.category === cat).length; return (
                <button key={cat} onClick={() => { setActiveCategory(activeCategory === cat ? null : cat); setShowFavorites(false); }} className={cn('px-2.5 py-1 rounded-full text-[11px] font-medium transition-colors whitespace-nowrap', activeCategory === cat ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground hover:bg-muted/80')}>{info?.emoji || '📦'} {info?.label || cat} ({count})</button>
              ); })}
            </div>
          </ScrollArea>
        </div>

        <ScrollArea className="h-[280px]">
          <div className="p-1.5">
            {loading ? (
              <div className="flex items-center justify-center py-12"><Loader2 className="w-6 h-6 text-muted-foreground animate-spin" /></div>
            ) : filtered.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-10 text-center">
                <Music className="w-10 h-10 text-muted-foreground/40 mb-3" />
                <p className="text-sm text-muted-foreground font-medium">{search ? 'Nenhum áudio encontrado' : 'Nenhum áudio meme'}</p>
                <p className="text-xs text-muted-foreground mt-1">Clique em <Plus className="w-3 h-3 inline" /> para adicionar</p>
              </div>
            ) : (
              <div className="space-y-1">
                <AnimatePresence>
                  {filtered.map((meme) => (
                    <motion.div key={meme.id} initial={{ opacity: 0, y: 5 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -5 }}
                      className={cn('group flex items-center gap-2.5 px-2.5 py-2 rounded-lg cursor-pointer transition-colors hover:bg-muted/60 border border-transparent hover:border-border/40', playingId === meme.id && 'bg-primary/5 border-primary/20')}
                      onClick={() => handleSend(meme, onSendAudio, () => setOpen(false))}>
                      <button onClick={(e) => { e.stopPropagation(); handlePreview(meme); }} className={cn('w-8 h-8 rounded-full flex items-center justify-center shrink-0 transition-colors', playingId === meme.id ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground hover:bg-primary/20 hover:text-primary')}>
                        {playingId === meme.id ? <Pause className="w-3.5 h-3.5" /> : <Play className="w-3.5 h-3.5 ml-0.5" />}
                      </button>
                      <div className="flex-1 min-w-0">
                        <p className="text-xs font-medium text-foreground truncate">{meme.name}</p>
                        <div className="flex items-center gap-2 mt-0.5">
                          <CategorySelector value={meme.category} onChange={(cat) => handleCategoryChange(meme, cat)} size="xs" />
                          <span className="text-[10px] text-muted-foreground/60">{formatDuration(meme.duration_seconds)}</span>
                          {meme.use_count > 0 && <span className="text-[10px] text-muted-foreground/50">{meme.use_count}x</span>}
                        </div>
                      </div>
                      <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
                        <button onClick={(e) => toggleFavorite(e, meme)} className="p-1 rounded hover:bg-muted">
                          <Star className={cn('w-3.5 h-3.5 transition-colors', meme.is_favorite ? 'fill-primary text-primary' : 'text-muted-foreground')} />
                        </button>
                        <button onClick={(e) => handleDelete(e, meme)} className="p-1 rounded hover:bg-destructive/10"><Trash2 className="w-3.5 h-3.5 text-destructive" /></button>
                      </div>
                    </motion.div>
                  ))}
                </AnimatePresence>
              </div>
            )}
          </div>
        </ScrollArea>

        <div className="px-3 py-2 border-t border-border/30 flex items-center justify-between">
          <span className="text-[10px] text-muted-foreground">{filtered.length}/{memes.length} áudios · Clique para enviar · ▶ ouvir</span>
          <Button variant="ghost" size="sm" className="h-6 text-[10px] text-muted-foreground hover:text-primary gap-1" onClick={() => fileInputRef.current?.click()} disabled={uploading || !!pendingUpload}>
            <Upload className="w-3 h-3" />Upload
          </Button>
        </div>
      </PopoverContent>
    </Popover>
    </Tooltip>
  );
}
