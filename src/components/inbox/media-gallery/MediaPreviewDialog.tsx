import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { ExternalLink, Download, File } from 'lucide-react';
import { MediaItem } from './mediaUtils';
import { useResolvedStorageUrl } from '@/hooks/storage/useResolvedStorageUrl';

interface MediaPreviewDialogProps {
  item: MediaItem | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function MediaPreviewDialog({ item, open, onOpenChange }: MediaPreviewDialogProps) {
  const { url: resolvedUrl, isLoading, error, refresh } = useResolvedStorageUrl(item?.url || '');
  if (!item) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent aria-describedby={undefined} className="max-w-4xl max-h-[90vh] p-0 overflow-hidden">
        <DialogHeader className="p-4 border-b">
          <DialogTitle className="flex items-center justify-between">
            <span className="truncate">{item.filename}</span>
            <div className="flex items-center gap-2">
              <Button variant="ghost" size="icon" asChild>
                <a href={resolvedUrl || undefined} target="_blank" rel="noopener noreferrer"><ExternalLink className="w-4 h-4" /></a>
              </Button>
              <Button variant="ghost" size="icon" asChild>
                <a href={resolvedUrl || undefined} download={item.filename}><Download className="w-4 h-4" /></a>
              </Button>
            </div>
          </DialogTitle>
        </DialogHeader>
        <div className="flex items-center justify-center p-4 bg-background/90 min-h-[400px]">
          {isLoading && <span className="text-sm text-muted-foreground">Carregando mídia…</span>}
          {error && <Button variant="outline" onClick={() => { void refresh(); }}>Tentar novamente</Button>}
          {item.type === 'image' && resolvedUrl && <img src={resolvedUrl} alt={item.filename} onError={() => { void refresh(); }} className="max-w-full max-h-[70vh] object-contain" />}
          {item.type === 'video' && resolvedUrl && <video src={resolvedUrl} controls controlsList="nodownload" onError={() => { void refresh(); }} onContextMenu={(e) => e.preventDefault()} className="max-w-full max-h-[70vh]" />}
          {item.type === 'audio' && resolvedUrl && <div className="p-8"><audio src={resolvedUrl} controls onError={() => { void refresh(); }} className="w-full" /></div>}
          {item.type === 'document' && (
            <div className="text-center p-8">
              <File className="w-16 h-16 mx-auto mb-4 text-muted-foreground" />
              <p className="text-primary-foreground mb-4">{item.filename}</p>
              <Button asChild><a href={resolvedUrl || undefined} download={item.filename}><Download className="w-4 h-4 mr-2" />Download</a></Button>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
