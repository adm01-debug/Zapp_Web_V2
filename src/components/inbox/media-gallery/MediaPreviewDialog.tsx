import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { ExternalLink, Download, File } from 'lucide-react';
import { MediaItem } from './mediaUtils';

interface MediaPreviewDialogProps {
  item: MediaItem | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function MediaPreviewDialog({ item, open, onOpenChange }: MediaPreviewDialogProps) {
  if (!item) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent aria-describedby={undefined} className="max-w-4xl max-h-[90vh] p-0 overflow-hidden">
        <DialogHeader className="p-4 border-b">
          <DialogTitle className="flex items-center justify-between">
            <span className="truncate">{item.filename}</span>
            <div className="flex items-center gap-2">
              <Button variant="ghost" size="icon" asChild>
                <a href={item.url} target="_blank" rel="noopener noreferrer"><ExternalLink className="w-4 h-4" /></a>
              </Button>
              <Button variant="ghost" size="icon" asChild>
                <a href={item.url} download={item.filename}><Download className="w-4 h-4" /></a>
              </Button>
            </div>
          </DialogTitle>
        </DialogHeader>
        <div className="flex items-center justify-center p-4 bg-background/90 min-h-[400px]">
          {item.type === 'image' && <img src={item.url} alt={item.filename} className="max-w-full max-h-[70vh] object-contain" />}
          {item.type === 'video' && <video src={item.url} controls controlsList="nodownload" onContextMenu={(e) => e.preventDefault()} className="max-w-full max-h-[70vh]" />}
          {item.type === 'audio' && <div className="p-8"><audio src={item.url} controls className="w-full" /></div>}
          {item.type === 'document' && (
            <div className="text-center p-8">
              <File className="w-16 h-16 mx-auto mb-4 text-muted-foreground" />
              <p className="text-primary-foreground mb-4">{item.filename}</p>
              <Button asChild><a href={item.url} download={item.filename}><Download className="w-4 h-4 mr-2" />Download</a></Button>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
