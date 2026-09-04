import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { ExternalLink, Download, File } from 'lucide-react';
import { MediaItem, notifyDownloadBlocked } from './mediaUtils';
import { useResolvedStorageUrl } from '@/hooks/storage/useResolvedStorageUrl';

interface MediaPreviewDialogProps {
  item: MediaItem | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function MediaPreviewDialog({ item, open, onOpenChange }: MediaPreviewDialogProps) {
  // O chamador (MediaGallery) so troca previewItem ao abrir outro item e nunca
  // o zera ao fechar, entao o conteudo continua disponivel durante a animacao de
  // saida do Dialog — nao ha por que guardar uma copia local aqui.
  const displayItem = item;

  const { url: resolvedUrl, isLoading, error, refresh } = useResolvedStorageUrl(displayItem?.url || '');

  if (!displayItem) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent aria-describedby={undefined} className="max-w-4xl max-h-[90vh] p-0 overflow-hidden">
        <DialogHeader className="p-4 border-b">
          <DialogTitle className="flex items-center justify-between">
            <span className="truncate">{displayItem.filename}</span>
            <div className="flex items-center gap-2">
              <Button variant="ghost" size="icon" asChild>
                <a href={resolvedUrl || undefined} target="_blank" rel="noopener noreferrer"><ExternalLink className="w-4 h-4" /></a>
              </Button>
              <Button variant="ghost" size="icon" aria-label="Download" onClick={() => { void notifyDownloadBlocked(); }}><Download className="w-4 h-4" /></Button>
            </div>
          </DialogTitle>
        </DialogHeader>
        <div className="flex items-center justify-center p-4 bg-background/90 min-h-[400px]">
          {isLoading && <span className="text-sm text-muted-foreground">Carregando mídia…</span>}
          {error && <Button variant="outline" onClick={() => { void refresh(); }}>Tentar novamente</Button>}
          {displayItem.type === 'image' && resolvedUrl && <img src={resolvedUrl} alt={displayItem.filename} onError={() => { void refresh(); }} className="max-w-full max-h-[70vh] object-contain" />}
          {displayItem.type === 'video' && resolvedUrl && <video src={resolvedUrl} controls controlsList="nodownload" onError={() => { void refresh(); }} onContextMenu={(e) => e.preventDefault()} className="max-w-full max-h-[70vh]" />}
          {displayItem.type === 'audio' && resolvedUrl && <div className="p-8"><audio src={resolvedUrl} controls onError={() => { void refresh(); }} className="w-full" /></div>}
          {displayItem.type === 'document' && (
            <div className="text-center p-8">
              <File className="w-16 h-16 mx-auto mb-4 text-muted-foreground" />
              <p className="text-foreground mb-4">{displayItem.filename}</p>
              <Button onClick={() => { void notifyDownloadBlocked(); }}><Download className="w-4 h-4 mr-2" />Download</Button>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
