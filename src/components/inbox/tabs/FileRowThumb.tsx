import { useState } from 'react';
import { File, Image, Play } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { ContactMediaItem } from '@/hooks/chat/useContactMedia';

/**
 * Miniatura das linhas de Lista (etapa 21) e Tabela (etapa 23). Stand-in enxuto do `FileThumb`
 * da etapa 26 (PR E): ate la, so a imagem com URL renderiza; o resto cai no icone do tipo.
 * A URL vem do lote assinado (etapa 10); o erro cai no icone em vez de imagem quebrada.
 */
export function FileRowThumb({ item, size }: { item: ContactMediaItem; size: 'row' | 'cell' }) {
  const [hasError, setHasError] = useState(false);
  const src = item.signedUrl ?? item.url;
  const box = size === 'row' ? 'w-12 h-12' : 'w-8 h-8';
  const icon = size === 'row' ? 'w-5 h-5' : 'w-4 h-4';

  return (
    <span className={cn('shrink-0 rounded-lg bg-muted flex items-center justify-center overflow-hidden', box)}>
      {item.type === 'image' && !hasError && src ? (
        <img
          src={src}
          alt=""
          loading="lazy"
          decoding="async"
          className="w-full h-full object-cover"
          onError={() => setHasError(true)}
        />
      ) : item.type === 'video' || item.type === 'audio' ? (
        <Play className={cn(icon, 'text-muted-foreground')} />
      ) : item.type === 'document' ? (
        <File className={cn(icon, 'text-muted-foreground')} />
      ) : (
        <Image className={cn(icon, 'text-muted-foreground')} />
      )}
    </span>
  );
}
