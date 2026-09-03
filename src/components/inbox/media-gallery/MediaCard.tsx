import { useState, memo } from 'react';
import { motion } from 'framer-motion';
import { Image, FileVideo, FileAudio, File, Play, Check } from 'lucide-react';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { MediaItem } from './mediaUtils';
import { useResolvedStorageUrl } from '@/hooks/storage/useResolvedStorageUrl';

interface MediaCardProps {
  item: MediaItem;
  isSelected: boolean;
  onSelect: () => void;
  onPreview: () => void;
}

export const MediaCard = memo(function MediaCard({ item, isSelected, onSelect, onPreview }: MediaCardProps) {
  const [isLoading, setIsLoading] = useState(true);
  const [hasError, setHasError] = useState(false);
  const { url: resolvedUrl, isLoading: isResolving, refresh } = useResolvedStorageUrl(item.url);

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.9 }}
      animate={{ opacity: 1, scale: 1 }}
      className={cn(
        'relative group rounded-lg overflow-hidden border-2 transition-all cursor-pointer',
        isSelected ? 'border-primary ring-2 ring-primary/30' : 'border-transparent hover:border-primary/50'
      )}
      onClick={onPreview}
    >
      <div
        className={cn(
          'absolute top-2 left-2 z-10 w-5 h-5 rounded border-2 flex items-center justify-center transition-all',
          isSelected
            ? 'bg-primary border-primary text-primary-foreground'
            : 'bg-background/80 border-muted-foreground/50 opacity-0 group-hover:opacity-100'
        )}
        onClick={(e) => { e.stopPropagation(); onSelect(); }}
      >
        {isSelected && <Check className="w-3 h-3" />}
      </div>

      <div className="aspect-square bg-muted relative">
        {item.type === 'image' && (
          <>
            {(isLoading || isResolving) && <div className="absolute inset-0 flex items-center justify-center"><Skeleton className="w-full h-full" /></div>}
            {!hasError && resolvedUrl ? (
              <img
                key={resolvedUrl}
                src={resolvedUrl}
                alt={item.filename}
                className={cn('w-full h-full object-cover', (isLoading || isResolving) && 'opacity-0')}
                onLoad={() => { setIsLoading(false); setHasError(false); }}
                onError={() => {
                  setIsLoading(false);
                  void refresh().then((freshUrl) => setHasError(freshUrl === null ? false : !freshUrl));
                }}
              />
            ) : (
              <div className="w-full h-full flex items-center justify-center"><Image className="w-8 h-8 text-muted-foreground" /></div>
            )}
          </>
        )}
        {item.type === 'video' && (
          <div className="w-full h-full flex items-center justify-center bg-background/80">
            <div className="absolute inset-0 flex items-center justify-center">
              <div className="w-12 h-12 rounded-full bg-background/20 backdrop-blur flex items-center justify-center">
                <Play className="w-6 h-6 text-primary-foreground" fill="white" />
              </div>
            </div>
            <FileVideo className="w-8 h-8 text-muted-foreground absolute bottom-2 right-2" />
          </div>
        )}
        {item.type === 'audio' && (
          <div className="w-full h-full flex flex-col items-center justify-center gap-2 p-4">
            <FileAudio className="w-10 h-10 text-primary" />
            <span className="text-xs text-muted-foreground text-center truncate w-full">{item.filename}</span>
          </div>
        )}
        {item.type === 'document' && (
          <div className="w-full h-full flex flex-col items-center justify-center gap-2 p-4">
            <File className="w-10 h-10 text-info" />
            <span className="text-xs text-muted-foreground text-center truncate w-full">{item.filename}</span>
          </div>
        )}
      </div>

      <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-background/60 to-transparent p-2 opacity-0 group-hover:opacity-100 transition-opacity">
        <p className="text-xs text-primary-foreground">
          {item.created_at ? format(new Date(item.created_at), 'dd/MM/yy HH:mm', { locale: ptBR }) : '—'}
        </p>
      </div>
    </motion.div>
  );
});
