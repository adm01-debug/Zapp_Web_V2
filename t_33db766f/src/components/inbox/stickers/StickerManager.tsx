import { useState, useCallback, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Sticker, Upload, Star, Trash2, Search, Grid3X3, LayoutGrid, Loader2, Camera } from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { StickerGrid } from './StickerGrid';
import { StickerUploadPreview } from './StickerUploadPreview';
import { StickerCategoryBar } from './StickerCategoryBar';
import { PersonalStickers } from './PersonalStickers';
import { CATEGORY_LABELS, ALL_CATEGORIES, type StickerItem, type PendingUpload } from './StickerTypes';
import { motion, AnimatePresence } from 'framer-motion';

interface StickerManagerProps {
  onSend?: (stickerUrl: string) => void;
  mode?: 'picker' | 'manager';
}

export function StickerManager({ onSend, mode = 'manager' }: StickerManagerProps) {
  const queryClient = useQueryClient();
  const [search, setSearch] = useState('');
  const [category, setCategory] = useState<string | null>(null);
  const [showFavorites, setShowFavorites] = useState(false);
  const [showRecent, setShowRecent] = useState(false);
  const [gridSize, setGridSize] = useState<'sm' | 'md' | 'lg'>('md');
  const [pendingUpload, setPendingUpload] = useState<PendingUpload | null>(null);

  const { data: stickers = [], isLoading } = useQuery({
    queryKey: ['stickers-manager'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('stickers')
        .select('*')
        .order('use_count', { ascending: false });
      if (error) throw error;
      return (data || []) as StickerItem[];
    },
  });

  const toggleFavorite = useMutation({
    mutationFn: async (sticker: StickerItem) => {
      const { error } = await supabase
        .from('stickers')
        .update({ is_favorite: !sticker.is_favorite })
        .eq('id', sticker.id);
      if (error) throw error;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['stickers-manager'] }),
  });

  const deleteSticker = useMutation({
    mutationFn: async (sticker: StickerItem) => {
      const { error } = await supabase.from('stickers').delete().eq('id', sticker.id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['stickers-manager'] });
      toast.success('Figurinha removida');
    },
  });

  const updateCategory = useMutation({
    mutationFn: async ({ id, category }: { id: string; category: string }) => {
      const { error } = await supabase.from('stickers').update({ category }).eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['stickers-manager'] }),
  });

  const handleSend = useCallback((sticker: StickerItem) => {
    onSend?.(sticker.image_url);
    supabase.from('stickers').update({ use_count: sticker.use_count + 1 }).eq('id', sticker.id);
  }, [onSend]);

  const filteredStickers = useMemo(() => {
    let filtered = stickers;
    if (showFavorites) filtered = filtered.filter(s => s.is_favorite);
    if (category) filtered = filtered.filter(s => s.category === category);
    if (search) filtered = filtered.filter(s => s.name?.toLowerCase().includes(search.toLowerCase()));
    return filtered;
  }, [stickers, search, category, showFavorites]);

  const favoriteCount = useMemo(() => stickers.filter(s => s.is_favorite).length, [stickers]);

  const stats = useMemo(() => ({
    total: stickers.length,
    favorites: favoriteCount,
    categories: new Set(stickers.map(s => s.category)).size,
  }), [stickers, favoriteCount]);

  return (
    <div className="space-y-4">
      {/* Personal Stickers - always on top */}
      <PersonalStickers onSend={onSend} />

      {/* Shared Stickers */}
      <Card className="border border-border/60 bg-card">
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="flex items-center gap-2">
                <Sticker className="w-5 h-5 text-primary" />
                Figurinhas Compartilhadas
              </CardTitle>
              <CardDescription>
                Figurinhas disponíveis para toda a equipe
              </CardDescription>
            </div>
            <div className="flex items-center gap-2">
              <Badge variant="secondary" className="text-xs">{stats.total} figurinhas</Badge>
              <Badge variant="outline" className="text-xs">⭐ {stats.favorites}</Badge>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Search + Grid Size Controls */}
          <div className="flex items-center gap-2">
            <div className="relative flex-1">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Buscar figurinhas..."
                className="pl-9 h-9"
              />
            </div>
            <div className="flex items-center border border-border/50 rounded-lg p-0.5">
              <button
                onClick={() => setGridSize('sm')}
                className={cn('p-1.5 rounded-md transition-colors', gridSize === 'sm' ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-foreground')}
              >
                <Grid3X3 className="w-4 h-4" />
              </button>
              <button
                onClick={() => setGridSize('md')}
                className={cn('p-1.5 rounded-md transition-colors', gridSize === 'md' ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-foreground')}
              >
                <LayoutGrid className="w-4 h-4" />
              </button>
            </div>
          </div>

          {/* Category Bar */}
          <StickerCategoryBar
            stickers={stickers}
            activeCategory={category}
            showFavorites={showFavorites}
            showRecent={showRecent}
            onCategoryChange={setCategory}
            onToggleFavorites={() => setShowFavorites(!showFavorites)}
            onToggleRecent={() => setShowRecent(!showRecent)}
          />

          {/* Upload Preview */}
          <AnimatePresence>
            {pendingUpload && (
              <StickerUploadPreview
                pending={pendingUpload}
                onConfirm={(p) => {
                  toast.success(`Figurinha "${p.name}" salva!`);
                  setPendingUpload(null);
                  queryClient.invalidateQueries({ queryKey: ['stickers-manager'] });
                }}
                onCancel={() => setPendingUpload(null)}
              />
            )}
          </AnimatePresence>

          {/* Sticker Grid */}
          <StickerGrid
            stickers={filteredStickers}
            loading={isLoading}
            search={search}
            gridSize={gridSize}
            onSend={handleSend}
            onToggleFavorite={(e, s) => { e.stopPropagation(); toggleFavorite.mutate(s); }}
            onDelete={(e, s) => { e.stopPropagation(); deleteSticker.mutate(s); }}
            onCategoryChange={(s, cat) => updateCategory.mutate({ id: s.id, category: cat })}
            onAddClick={() => toast.info('Use o botão de upload na barra de ferramentas')}
          />
        </CardContent>
      </Card>
    </div>
  );
}
