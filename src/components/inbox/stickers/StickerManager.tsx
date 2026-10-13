import { useState, useCallback, useMemo, useRef } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Sticker, Upload, Star, Trash2, Search, Grid3X3, LayoutGrid, Loader2, Camera, Plus, AlertCircle } from 'lucide-react';
import { toast } from 'sonner';
import { log } from '@/lib/logger';
import { getFileExtensionWithDefault } from '@/utils/fileExtensions';
import { converterFigurinhaParaWebp, precisaConverterParaWebp } from '@/lib/stickerImage';
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
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const { data: stickers = [], isLoading, isError, refetch } = useQuery({
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
      // `select('id')` devolve as linhas afetadas: sem ele o RLS filtra em silêncio
      // (0 linhas, sem error) e a escrita negada passaria por sucesso.
      const { data, error } = await supabase
        .from('stickers')
        .update({ is_favorite: !sticker.is_favorite })
        .eq('id', sticker.id)
        .select('id');
      if (error) throw error;
      if (!data || data.length === 0) throw new Error('Nenhuma figurinha atualizada');
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['stickers-manager'] }),
    onError: (error) => {
      log.error('[StickerManager] Falha ao atualizar o favorito:', error);
      toast.error('Não foi possível atualizar o favorito');
    },
  });

  const deleteSticker = useMutation({
    mutationFn: async (sticker: StickerItem) => {
      const { data, error } = await supabase
        .from('stickers')
        .delete()
        .eq('id', sticker.id)
        .select('id');
      if (error) throw error;
      if (!data || data.length === 0) throw new Error('Nenhuma figurinha removida');
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['stickers-manager'] });
      toast.success('Figurinha removida');
    },
    onError: (error) => {
      log.error('[StickerManager] Falha ao remover a figurinha:', error);
      toast.error('Não foi possível remover a figurinha');
    },
  });

  const updateCategory = useMutation({
    mutationFn: async ({ id, category }: { id: string; category: string }) => {
      const { data, error } = await supabase
        .from('stickers')
        .update({ category })
        .eq('id', id)
        .select('id');
      if (error) throw error;
      if (!data || data.length === 0) throw new Error('Nenhuma figurinha atualizada');
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['stickers-manager'] }),
    onError: (error) => {
      log.error('[StickerManager] Falha ao atualizar a categoria:', error);
      toast.error('Não foi possível atualizar a categoria');
    },
  });

  const handleSend = useCallback(async (sticker: StickerItem) => {
    onSend?.(sticker.image_url);
    // O contador é aguardado e conferido: um update sem await nunca chegava ao banco
    // (fica "sent" sem contagem) e um `use_count` nulo virava NaN.
    const { data, error } = await supabase
      .from('stickers')
      .update({ use_count: (sticker.use_count ?? 0) + 1 })
      .eq('id', sticker.id)
      .select('id');
    if (error) { log.error('[StickerManager] Falha ao contar o uso:', error); return; }
    if (!data || data.length === 0) { log.warn('[StickerManager] Uso não contado: 0 linhas afetadas'); return; }
    queryClient.invalidateQueries({ queryKey: ['stickers-manager'] });
  }, [onSend, queryClient]);

  // O "+" envia a imagem (WebP) para o bucket e só então mostra a revisão. A linha
  // nasce no Salvar; cancelar devolve o objeto — nada de sucesso sem escrita.
  const handleFileSelect = async (files: FileList | null) => {
    const file = files?.[0];
    if (!file) return;
    if (!file.type.startsWith('image/')) { toast.error('Arquivo não é uma imagem válida'); return; }
    if (file.size > 500 * 1024) { toast.error('Arquivo excede 500KB.'); return; }
    setUploading(true);
    try {
      let arquivo = file;
      if (precisaConverterParaWebp(file)) {
        arquivo = await converterFigurinhaParaWebp(file);
        if (arquivo === file) log.warn('[StickerManager] Conversão para WebP não aplicada; subindo o arquivo original:', file.type);
      }
      const ext = getFileExtensionWithDefault(arquivo.name, 'webp');
      const storagePath = `sticker_${Date.now()}_${crypto.randomUUID()}.${ext}`;
      const { error: uploadError } = await supabase.storage
        .from('stickers')
        .upload(storagePath, arquivo, { contentType: arquivo.type, cacheControl: '31536000' });
      if (uploadError) {
        log.error('[StickerManager] Falha ao enviar a figurinha:', uploadError);
        toast.error('Erro ao enviar a figurinha');
        return;
      }
      const { data: urlData } = supabase.storage.from('stickers').getPublicUrl(storagePath);
      setPendingUpload({
        file: arquivo,
        imageUrl: urlData.publicUrl,
        storagePath,
        aiCategory: 'outros',
        selectedCategory: 'outros',
        name: file.name.replace(/\.[^.]+$/, ''),
      });
    } catch (error) {
      log.error('[StickerManager] Erro ao processar a figurinha:', error);
      toast.error('Erro ao processar a figurinha');
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const handleConfirmUpload = async (pending: PendingUpload) => {
    const { data: { user } } = await supabase.auth.getUser();
    const { data, error } = await supabase
      .from('stickers')
      .insert({
        name: pending.name,
        image_url: pending.imageUrl,
        category: pending.selectedCategory,
        is_favorite: false,
        use_count: 0,
        uploaded_by: user?.id || null,
      })
      .select('id');
    if (error || !data || data.length === 0) {
      log.error('[StickerManager] Falha ao salvar a figurinha:', error);
      toast.error('Erro ao salvar a figurinha');
      return;
    }
    setPendingUpload(null);
    queryClient.invalidateQueries({ queryKey: ['stickers-manager'] });
    toast.success(`Figurinha "${pending.name}" salva!`);
  };

  const handleCancelUpload = async () => {
    const pending = pendingUpload;
    setPendingUpload(null);
    if (!pending) return;
    const { error } = await supabase.storage.from('stickers').remove([pending.storagePath]);
    if (error) log.error('[StickerManager] Falha ao remover o upload cancelado:', error);
  };

  const filteredStickers = useMemo(() => {
    let filtered = stickers;
    if (showFavorites) filtered = filtered.filter(s => s.is_favorite);
    if (category) filtered = filtered.filter(s => s.category === category);
    if (search) filtered = filtered.filter(s => s.name?.toLowerCase().includes(search.toLowerCase()));
    // R2-INB-062: "Recentes" ordena pela recência real (`created_at`) em vez de
    // só acender o destaque da barra. Cópia antes do sort para não reordenar o
    // cache do react-query. Sem data vira a mais antiga.
    if (showRecent) {
      filtered = [...filtered].sort((a, b) => (b.created_at || '').localeCompare(a.created_at || ''));
    }
    return filtered;
  }, [stickers, search, category, showFavorites, showRecent]);

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
                aria-label="Grade pequena"
                className={cn('p-1.5 rounded-md transition-colors', gridSize === 'sm' ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-foreground')}
              >
                <Grid3X3 className="w-4 h-4" aria-hidden="true" />
              </button>
              <button
                onClick={() => setGridSize('md')}
                aria-label="Grade média"
                className={cn('p-1.5 rounded-md transition-colors', gridSize === 'md' ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-foreground')}
              >
                <LayoutGrid className="w-4 h-4" aria-hidden="true" />
              </button>
            </div>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/webp,image/png,image/gif,image/jpeg"
              className="hidden"
              aria-label="Selecionar arquivo de figurinha"
              onChange={(e) => handleFileSelect(e.target.files)}
            />
            <Button
              variant="outline"
              size="sm"
              className="h-9 gap-1.5"
              onClick={() => fileInputRef.current?.click()}
              disabled={uploading || !!pendingUpload}
              aria-label="Adicionar nova figurinha"
            >
              {uploading ? <Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" /> : <Plus className="w-4 h-4" aria-hidden="true" />}
              <span className="hidden sm:inline">Adicionar</span>
            </Button>
          </div>

          {/* Category Bar */}
          <StickerCategoryBar
            stickers={stickers}
            activeCategory={category}
            showFavorites={showFavorites}
            showRecent={showRecent}
            onCategoryChange={(cat) => { setCategory(cat); setShowRecent(false); }}
            onToggleFavorites={() => setShowFavorites(!showFavorites)}
            onToggleRecent={() => setShowRecent(!showRecent)}
          />

          {/* Upload Preview */}
          <AnimatePresence>
            {pendingUpload && (
              <StickerUploadPreview
                pending={pendingUpload}
                onConfirm={handleConfirmUpload}
                onCancel={handleCancelUpload}
              />
            )}
          </AnimatePresence>

          {/* Query Error */}
          {isError && (
            <div role="alert" className="flex flex-col items-center justify-center gap-2 py-8 px-4 rounded-xl border-2 border-destructive/40 bg-destructive/5 text-center">
              <AlertCircle className="w-6 h-6 text-destructive" aria-hidden="true" />
              <p className="text-sm font-medium text-foreground">Não foi possível carregar as figurinhas</p>
              <Button variant="outline" size="sm" onClick={() => refetch()}>Tentar de novo</Button>
            </div>
          )}

          {/* Sticker Grid */}
          {!isError && (
            <StickerGrid
              stickers={filteredStickers}
              loading={isLoading}
              search={search}
              gridSize={gridSize}
              onSend={handleSend}
              onToggleFavorite={(e, s) => { e.stopPropagation(); toggleFavorite.mutate(s); }}
              onDelete={(e, s) => { e.stopPropagation(); deleteSticker.mutate(s); }}
              onCategoryChange={(s, cat) => updateCategory.mutate({ id: s.id, category: cat })}
              onAddClick={() => fileInputRef.current?.click()}
            />
          )}
        </CardContent>
      </Card>
    </div>
  );
}
