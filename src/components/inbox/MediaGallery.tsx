import { useState, useMemo } from 'react';
import { GenericEmptyState } from '@/components/ui/GenericEmptyState';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Skeleton } from '@/components/ui/skeleton';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import { Image, FileVideo, FileAudio, File, Download, Search, Grid3X3, List, X, Check } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { cn } from '@/lib/utils';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { MediaItem, getMediaType, getFilename } from './media-gallery/mediaUtils';
import { MediaCard } from './media-gallery/MediaCard';
import { MediaPreviewDialog } from './media-gallery/MediaPreviewDialog';

interface MediaGalleryProps {
  contactId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

interface MediaGalleryContentProps {
  contactId: string;
}

export function MediaGallery({ contactId, open, onOpenChange }: MediaGalleryProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent aria-describedby={undefined} aria-label="Galeria de Mídia" className="max-w-4xl max-h-[90vh] flex flex-col">
        <MediaGalleryContent contactId={contactId} />
      </DialogContent>
    </Dialog>
  );
}

/**
 * Corpo da galeria para renderização INLINE (ex.: seção "Mídia Compartilhada"
 * dos detalhes do contato). NÃO renderiza Dialog/overlay — correção do bug
 * "abrir Detalhes do Contato abria a Galeria de Mídia por cima da tela"
 * (run h528ce06a). Para uso como diálogo, preferir o wrapper MediaGallery.
 */
export function MediaGalleryContent({ contactId }: MediaGalleryContentProps) {
  const [filter, setFilter] = useState<'all' | 'image' | 'video' | 'audio' | 'document'>('all');
  const [search, setSearch] = useState('');
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid');
  const [selectedItems, setSelectedItems] = useState<Set<string>>(new Set());
  const [previewItem, setPreviewItem] = useState<MediaItem | null>(null);
  const [previewOpen, setPreviewOpen] = useState(false);

  const { data: messages, isLoading } = useQuery({
    queryKey: ['media-gallery', contactId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('messages')
        .select('id, media_url, message_type, media_filename, caption, created_at')
        .eq('contact_id', contactId)
        .not('media_url', 'is', null)
        .order('created_at', { ascending: false })
        .limit(200);
      if (error) throw error;
      return data || [];
    },
    enabled: !!contactId,
    staleTime: 5 * 60 * 1000,
  });

  const mediaItems = useMemo((): MediaItem[] => {
    if (!messages) return [];
    return messages.filter(m => m.media_url).map(m => ({
      id: m.id,
      url: m.media_url!,
      type: getMediaType(m.media_url!, m.message_type),
      filename: m.media_filename || getFilename(m.media_url!),
      created_at: m.created_at,
      caption: m.caption ?? null,
    }));
  }, [messages]);

  const filteredItems = useMemo(() => mediaItems.filter(item => {
    const matchesFilter = filter === 'all' || item.type === filter;
    const matchesSearch = !search
      || item.filename.toLowerCase().includes(search.toLowerCase())
      || (item.caption ?? '').toLowerCase().includes(search.toLowerCase());
    return matchesFilter && matchesSearch;
  }), [mediaItems, filter, search]);

  const counts = useMemo(() => ({
    all: mediaItems.length,
    image: mediaItems.filter(i => i.type === 'image').length,
    video: mediaItems.filter(i => i.type === 'video').length,
    audio: mediaItems.filter(i => i.type === 'audio').length,
    document: mediaItems.filter(i => i.type === 'document').length,
  }), [mediaItems]);

  const toggleSelect = (id: string) => {
    const newSelected = new Set(selectedItems);
    if (newSelected.has(id)) newSelected.delete(id); else newSelected.add(id);
    setSelectedItems(newSelected);
  };

  const openPreview = (item: MediaItem) => {
    setPreviewItem(item);
    setPreviewOpen(true);
  };

  const handleDownloadSelected = async () => {
    const { toast } = await import('sonner');
    toast.error('🔒 Download bloqueado por política de segurança', { description: 'O download de arquivos está desabilitado para proteção de dados.' });
  };

  return (
    <>
      <div className="flex items-center gap-2 px-1 pb-1" role="heading" aria-level={3}>
        <Grid3X3 className="w-5 h-5" />Galeria de Mídia<Badge variant="secondary">{counts.all} itens</Badge>
      </div>

      <div className="flex items-center gap-4 py-2">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input placeholder="Buscar mídia..." value={search} onChange={(e) => setSearch(e.target.value)} className="pl-10" />
        </div>
        <div className="flex items-center gap-1 border rounded-md p-1">
          <Button variant={viewMode === 'grid' ? 'secondary' : 'ghost'} size="icon" className="h-8 w-8" onClick={() => setViewMode('grid')}><Grid3X3 className="w-4 h-4" /></Button>
          <Button variant={viewMode === 'list' ? 'secondary' : 'ghost'} size="icon" className="h-8 w-8" onClick={() => setViewMode('list')}><List className="w-4 h-4" /></Button>
        </div>
      </div>

      <Tabs value={filter} onValueChange={(v) => setFilter(v as typeof filter)}>
        <TabsList className="grid grid-cols-5">
          <TabsTrigger value="all" className="gap-1 text-xs">Todos <Badge variant="outline" className="ml-1">{counts.all}</Badge></TabsTrigger>
          <TabsTrigger value="image" className="gap-1" aria-label="Imagens"><Image className="w-3 h-3" /><Badge variant="outline" className="ml-1">{counts.image}</Badge></TabsTrigger>
          <TabsTrigger value="video" className="gap-1" aria-label="Vídeos"><FileVideo className="w-3 h-3" /><Badge variant="outline" className="ml-1">{counts.video}</Badge></TabsTrigger>
          <TabsTrigger value="audio" className="gap-1" aria-label="Áudios"><FileAudio className="w-3 h-3" /><Badge variant="outline" className="ml-1">{counts.audio}</Badge></TabsTrigger>
          <TabsTrigger value="document" className="gap-1" aria-label="Documentos"><File className="w-3 h-3" /><Badge variant="outline" className="ml-1">{counts.document}</Badge></TabsTrigger>
        </TabsList>
      </Tabs>

      <AnimatePresence>
        {selectedItems.size > 0 && (
          <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }} className="flex items-center justify-between p-2 bg-primary/10 rounded-lg">
            <span className="text-sm">{selectedItems.size} item(s) selecionado(s)</span>
            <div className="flex items-center gap-2">
              <Button variant="ghost" size="sm" onClick={() => setSelectedItems(new Set())}><X className="w-4 h-4 mr-1" />Limpar</Button>
              <Button size="sm" onClick={handleDownloadSelected}>
                <Download className="w-4 h-4 mr-1" />Download
              </Button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <ScrollArea className="h-[360px]">
        {isLoading ? (
          <div className="grid grid-cols-3 gap-2 p-2">{[...Array(8)].map((_, i) => <Skeleton key={i} className="aspect-square rounded-lg" />)}</div>
        ) : filteredItems.length === 0 ? (
          <GenericEmptyState icon={Image} title="Sem mídias" description="Nenhuma mídia encontrada nesta conversa" className="py-8" />
        ) : viewMode === 'grid' ? (
          <div className="grid grid-cols-3 gap-2 p-2">
            {filteredItems.map((item) => (
              <MediaCard key={item.id} item={item} isSelected={selectedItems.has(item.id)} onSelect={() => toggleSelect(item.id)} onPreview={() => openPreview(item)} />
            ))}
          </div>
        ) : (
          <div className="space-y-2 p-2">
            {filteredItems.map((item) => (
              <div key={item.id} className={cn('flex items-center gap-3 p-2 rounded-lg border transition-colors cursor-pointer', selectedItems.has(item.id) ? 'border-primary bg-primary/5' : 'hover:bg-muted/50')} onClick={() => openPreview(item)}>
                <div className={cn('w-5 h-5 rounded border-2 flex items-center justify-center shrink-0', selectedItems.has(item.id) ? 'bg-primary border-primary text-primary-foreground' : 'border-muted-foreground/50')} onClick={(e) => { e.stopPropagation(); toggleSelect(item.id); }}>
                  {selectedItems.has(item.id) && <Check className="w-3 h-3" />}
                </div>
                <div className="w-10 h-10 rounded bg-muted flex items-center justify-center shrink-0">
                  {item.type === 'image' && <Image className="w-5 h-5 text-muted-foreground" />}
                  {item.type === 'video' && <FileVideo className="w-5 h-5 text-muted-foreground" />}
                  {item.type === 'audio' && <FileAudio className="w-5 h-5 text-muted-foreground" />}
                  {item.type === 'document' && <File className="w-5 h-5 text-muted-foreground" />}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium truncate">{item.filename}</p>
                  <p className="text-xs text-muted-foreground">{item.created_at ? format(new Date(item.created_at), 'dd/MM/yyyy HH:mm', { locale: ptBR }) : '—'}</p>
                </div>
              </div>
            ))}
          </div>
        )}
      </ScrollArea>

      <MediaPreviewDialog
        item={previewItem}
        open={previewOpen}
        onOpenChange={setPreviewOpen}
      />
    </>
  );
}
