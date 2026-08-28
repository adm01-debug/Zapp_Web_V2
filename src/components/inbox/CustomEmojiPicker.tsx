import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';
import { motion, AnimatePresence } from 'framer-motion';
import { SmilePlus, Search, Plus, Star, Trash2, Loader2, X, Tag, Check, ChevronDown, Smile } from 'lucide-react';
import { CATEGORY_LABELS, ALL_CATEGORIES, NATIVE_EMOJI_CATEGORIES } from './emojiConstants';
import { useCustomEmojis, type CustomEmoji, type PendingEmojiUpload } from '@/hooks/integrations/useCustomEmojis';

interface CustomEmojiPickerProps {
  onSendEmoji: (emojiUrl: string) => void;
  disabled?: boolean;
}

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

function UploadPreview({ pending, onConfirm, onCancel }: { pending: PendingEmojiUpload; onConfirm: (p: PendingEmojiUpload) => void; onCancel: () => void }) {
  const [category, setCategory] = useState(pending.selectedCategory);
  const [name, setName] = useState(pending.name);
  return (
    <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="p-3 border border-border rounded-lg bg-card space-y-2.5">
      <div className="flex items-center gap-3">
        <div className="w-12 h-12 rounded-lg overflow-hidden bg-muted/30 shrink-0 flex items-center justify-center border border-border/30">
          <img src={pending.imageUrl} alt="Preview" className="w-full h-full object-contain p-0.5"  loading="lazy" decoding="async"/>
        </div>
        <Input value={name} onChange={(e) => setName(e.target.value)} className="h-7 text-xs flex-1" placeholder="Nome do emoji" />
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

export function CustomEmojiPicker({ onSendEmoji, disabled }: CustomEmojiPickerProps) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const [activeCategory, setActiveCategory] = useState<string | null>(null);
  const [showFavorites, setShowFavorites] = useState(false);
  const [activeTab, setActiveTab] = useState<'native' | 'custom'>('native');
  const [nativeCategoryId, setNativeCategoryId] = useState<string>('smileys');

  const {
    emojis, loading, uploading, pendingUpload, fileInputRef,
    handleFileSelect, handleConfirmUpload, handleCancelUpload,
    handleSend, toggleFavorite, handleCategoryChange, handleDelete, setPendingUpload,
  } = useCustomEmojis(open);

  const categories = [...new Set(emojis.map(e => e.category).filter(Boolean))].sort();
  const filtered = emojis.filter(em => {
    const matchSearch = !search || em.name?.toLowerCase().includes(search.toLowerCase()) || em.category?.toLowerCase().includes(search.toLowerCase());
    if (showFavorites) return matchSearch && em.is_favorite;
    if (activeCategory) return matchSearch && em.category === activeCategory;
    return matchSearch;
  });

  const activeNativeCategory = NATIVE_EMOJI_CATEGORIES.find(c => c.id === nativeCategoryId);
  const filteredNativeEmojis = activeNativeCategory?.emojis || [];

  return (
    <Tooltip>
      <Popover open={open} onOpenChange={(v) => { setOpen(v); if (!v) setPendingUpload(null); }}>
        <TooltipTrigger asChild>
          <PopoverTrigger asChild>
            <Button variant="ghost" size="icon" className="w-9 h-9 text-muted-foreground hover:text-foreground hover:bg-muted shrink-0" disabled={disabled} aria-label="Emojis Personalizados">
              <SmilePlus className="w-[18px] h-[18px]" />
            </Button>
          </PopoverTrigger>
        </TooltipTrigger>
        <TooltipContent side="top">Emojis Personalizados</TooltipContent>
        <PopoverContent className="w-[360px] p-0 bg-popover border-border" align="end" side="top" sideOffset={8}>
          <div className="flex items-center justify-between px-3 py-2 border-b border-border">
            <div className="flex items-center gap-1 bg-muted/50 rounded-lg p-0.5">
              <button onClick={() => setActiveTab('native')} className={cn('flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-all', activeTab === 'native' ? 'bg-background text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground')}>
                <Smile className="w-3.5 h-3.5" />Tradicionais
              </button>
              <button onClick={() => setActiveTab('custom')} className={cn('flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-all', activeTab === 'custom' ? 'bg-background text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground')}>
                <SmilePlus className="w-3.5 h-3.5" />Customizados
              </button>
            </div>
            {activeTab === 'custom' && (
              <div className="flex items-center gap-1">
                <input ref={fileInputRef} type="file" accept="image/png,image/webp,image/gif,image/jpeg,image/svg+xml" className="hidden" onChange={handleFileSelect} />
                <Button variant="ghost" size="icon" className="w-7 h-7 text-muted-foreground hover:text-primary" onClick={() => fileInputRef.current?.click()} disabled={uploading || !!pendingUpload} title="Adicionar emoji">
                  {uploading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Plus className="w-3.5 h-3.5" />}
                </Button>
              </div>
            )}
          </div>

          {activeTab === 'native' ? (
            <>
              <div className="px-1.5 py-1.5 border-b border-border/30">
                <ScrollArea className="w-full">
                  <div className="flex gap-0.5">
                    {NATIVE_EMOJI_CATEGORIES.map(cat => (
                      <button key={cat.id} onClick={() => setNativeCategoryId(cat.id)} className={cn('flex items-center justify-center w-8 h-8 rounded-md text-lg transition-all shrink-0', nativeCategoryId === cat.id ? 'bg-primary/15 scale-110' : 'hover:bg-muted/60')} title={cat.label}>{cat.icon}</button>
                    ))}
                  </div>
                </ScrollArea>
              </div>
              <div className="px-3 py-1.5 border-b border-border/20"><span className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">{activeNativeCategory?.label}</span></div>
              <ScrollArea className="h-[280px]">
                <div className="p-2">
                  <div className="grid grid-cols-8 gap-0.5">
                    {filteredNativeEmojis.map((emoji, i) => (
                      <motion.button key={`${nativeCategoryId}-${i}`} whileHover={{ scale: 1.3 }} whileTap={{ scale: 0.85 }} onClick={() => { onSendEmoji(emoji); setOpen(false); }}
                        className="flex items-center justify-center w-full aspect-square rounded-md hover:bg-muted/50 transition-colors text-2xl cursor-pointer">{emoji}</motion.button>
                    ))}
                  </div>
                </div>
              </ScrollArea>
              <div className="px-3 py-1.5 border-t border-border/30"><span className="text-[10px] text-muted-foreground">{filteredNativeEmojis.length} emojis · {activeNativeCategory?.label}</span></div>
            </>
          ) : (
            <>
              <AnimatePresence>{pendingUpload && (<div className="px-3 py-2 border-b border-border/50"><UploadPreview pending={pendingUpload} onConfirm={handleConfirmUpload} onCancel={handleCancelUpload} /></div>)}</AnimatePresence>
              <div className="px-3 py-2 border-b border-border/50">
                <div className="relative">
                  <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
                  <Input value={search} onChange={e => setSearch(e.target.value)} placeholder="Buscar emojis..." className="h-8 pl-8 text-xs bg-muted/50 border-border/50" />
                  {search && <button onClick={() => setSearch('')} className="absolute right-2 top-1/2 -translate-y-1/2"><X className="w-3 h-3 text-muted-foreground" /></button>}
                </div>
              </div>
              <div className="px-2 py-2 border-b border-border/30">
                <ScrollArea className="w-full">
                  <div className="flex gap-1.5 flex-wrap">
                    <button onClick={() => { setActiveCategory(null); setShowFavorites(false); }} className={cn('px-2.5 py-1 rounded-full text-[11px] font-medium transition-colors whitespace-nowrap', !activeCategory && !showFavorites ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground hover:bg-muted/80')}>Todos ({emojis.length})</button>
                    <button onClick={() => { setShowFavorites(!showFavorites); setActiveCategory(null); }} className={cn('px-2.5 py-1 rounded-full text-[11px] font-medium transition-colors whitespace-nowrap flex items-center gap-1', showFavorites ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground hover:bg-muted/80')}><Star className="w-3 h-3" /> Favoritos</button>
                    {categories.map(cat => { const info = CATEGORY_LABELS[cat]; const count = emojis.filter(em => em.category === cat).length; return (
                      <button key={cat} onClick={() => { setActiveCategory(activeCategory === cat ? null : cat); setShowFavorites(false); }} className={cn('px-2.5 py-1 rounded-full text-[11px] font-medium transition-colors whitespace-nowrap', activeCategory === cat ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground hover:bg-muted/80')}>{info?.emoji || '📦'} {info?.label || cat} ({count})</button>
                    ); })}
                  </div>
                </ScrollArea>
              </div>
              <ScrollArea className="h-[260px]">
                <div className="p-2">
                  {loading ? (
                    <div className="flex items-center justify-center py-12"><Loader2 className="w-6 h-6 text-muted-foreground animate-spin" /></div>
                  ) : filtered.length === 0 ? (
                    <div className="flex flex-col items-center justify-center py-10 text-center">
                      <SmilePlus className="w-10 h-10 text-muted-foreground/40 mb-3" />
                      <p className="text-sm text-muted-foreground font-medium">{search ? 'Nenhum emoji encontrado' : 'Nenhum emoji customizado'}</p>
                      <p className="text-xs text-muted-foreground mt-1">Clique em <Plus className="w-3 h-3 inline" /> para adicionar</p>
                    </div>
                  ) : (
                    <div className="grid grid-cols-5 gap-1.5">
                      <AnimatePresence>
                        {filtered.map((emoji) => (
                          <motion.button key={emoji.id} initial={{ opacity: 0, scale: 0.8 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.8 }} whileHover={{ scale: 1.15 }} whileTap={{ scale: 0.9 }}
                            onClick={() => handleSend(emoji, onSendEmoji, () => setOpen(false))}
                            className={cn('relative aspect-square rounded-lg overflow-hidden group', 'bg-muted/20 hover:bg-muted/50 transition-colors', 'border border-transparent hover:border-primary/30', 'cursor-pointer')}
                            title={`${emoji.name} • ${CATEGORY_LABELS[emoji.category]?.label || emoji.category}`}>
                            <img src={emoji.image_url} alt={emoji.name} className="w-full h-full object-contain p-1" loading="lazy" />
                            <div className="absolute inset-0 bg-background/70 opacity-0 group-hover:opacity-100 transition-opacity flex flex-col items-center justify-between p-0.5">
                              <div className="flex items-center justify-between w-full">
                                <button onClick={(e) => toggleFavorite(e, emoji)} className="p-0.5"><Star className={cn('w-3 h-3 transition-colors', emoji.is_favorite ? 'fill-primary text-primary' : 'text-muted-foreground')} /></button>
                                <button onClick={(e) => handleDelete(e, emoji)} className="p-0.5"><Trash2 className="w-3 h-3 text-destructive" /></button>
                              </div>
                              <div onClick={(e) => e.stopPropagation()}><CategorySelector value={emoji.category} onChange={(cat) => handleCategoryChange(emoji, cat)} size="xs" /></div>
                            </div>
                          </motion.button>
                        ))}
                      </AnimatePresence>
                    </div>
                  )}
                </div>
              </ScrollArea>
              <div className="px-3 py-2 border-t border-border/30 flex items-center justify-between">
                <span className="text-[10px] text-muted-foreground">{filtered.length}/{emojis.length} emojis · IA + edição manual</span>
              </div>
            </>
          )}
        </PopoverContent>
      </Popover>
    </Tooltip>
  );
}
