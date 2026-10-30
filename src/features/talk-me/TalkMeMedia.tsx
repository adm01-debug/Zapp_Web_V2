import { useEffect, useRef, useState } from 'react';
import { FileText, Mic, Play } from 'lucide-react';
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog';
import { useResolvedStorageUrl } from '@/hooks/storage/useResolvedStorageUrl';
import { cn } from '@/lib/utils';

type TalkMeMediaKind = 'image' | 'video' | 'audio' | 'file';

interface TalkMeMediaProps {
  mediaUrl: string;
  messageType: string;
  caption?: string | null;
  senderName: string;
  fallbackText: string;
  active?: boolean;
  className?: string;
}

function mediaKind(messageType: string): TalkMeMediaKind {
  const type = messageType.toLowerCase();
  if (type.includes('image') || type.includes('photo') || type.includes('sticker')) return 'image';
  if (type.includes('video')) return 'video';
  if (type.includes('audio') || type.includes('ptt') || type.includes('voice')) return 'audio';
  return 'file';
}

function safeMediaUrl(value: string): string | null {
  try {
    const parsed = new URL(value);
    return parsed.protocol === 'https:' || parsed.protocol === 'http:' ? value : null;
  } catch {
    return null;
  }
}

function fileTypeLabel(url: string, messageType: string): string {
  try {
    const extension = new URL(url).pathname.match(/\.([a-z0-9]{1,8})$/i)?.[1];
    if (extension) return extension.toUpperCase();
  } catch {
    // O rótulo genérico continua seguro quando a URL não pode ser interpretada.
  }
  return messageType.toLowerCase().includes('document') ? 'Documento' : 'Arquivo';
}

export function TalkMeMedia({
  mediaUrl,
  messageType,
  caption,
  senderName,
  fallbackText,
  active = true,
  className,
}: TalkMeMediaProps) {
  const kind = mediaKind(messageType);
  const { url, isLoading, error, refresh } = useResolvedStorageUrl(mediaUrl);
  const resolvedUrl = safeMediaUrl(url);
  const [failedUrl, setFailedUrl] = useState<string | null>(null);
  const [controlsVisible, setControlsVisible] = useState(false);
  const [imageOpen, setImageOpen] = useState(false);
  const audioRef = useRef<HTMLAudioElement>(null);
  const unavailable = Boolean(error)
    || (!isLoading && !resolvedUrl)
    || (Boolean(resolvedUrl) && failedUrl === resolvedUrl);

  useEffect(() => {
    if (!active || kind !== 'audio' || !controlsVisible) return;
    const audio = audioRef.current;
    if (!audio) return;
    void audio.play().catch(() => undefined);
    return () => {
      audio.pause();
      audio.currentTime = 0;
    };
  }, [active, controlsVisible, kind, resolvedUrl]);

  const handleMediaError = () => {
    if (resolvedUrl) setFailedUrl(resolvedUrl);
    setImageOpen(false);
    void refresh();
  };

  const fallback = (
    <p
      data-testid="talk-me-media-fallback"
      className="flex min-h-16 min-w-0 items-center justify-center break-words rounded-xl border border-border/60 bg-muted/35 px-3 py-2 text-center text-xs leading-5 text-foreground"
    >
      {fallbackText}
    </p>
  );

  if (unavailable) return <div className={cn('talk-me-media min-w-0 max-w-full overflow-hidden', className)}>{fallback}</div>;

  if (isLoading || !resolvedUrl) {
    return (
      <div className={cn('talk-me-media min-w-0 max-w-full overflow-hidden', className)}>
        <div role="status" aria-label="Carregando mídia" className="min-h-16 rounded-xl bg-muted/35 motion-safe:animate-pulse" />
      </div>
    );
  }

  if (kind === 'image') {
    const accessibleName = `Imagem de ${senderName}`;
    return (
      <div className={cn('talk-me-media min-w-0 max-w-full overflow-hidden', className)}>
        <button
          type="button"
          aria-label={`Abrir imagem de ${senderName}`}
          onClick={() => setImageOpen(true)}
          className="block min-h-16 w-full overflow-hidden rounded-xl border border-border/60 bg-muted/35 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
        >
          <img
            src={resolvedUrl}
            alt={accessibleName}
            loading="lazy"
            decoding="async"
            onError={handleMediaError}
            className="h-16 w-full object-cover"
          />
        </button>
        {caption?.trim() && <p className="mt-1 truncate text-xs text-foreground">{caption.trim()}</p>}

        <Dialog open={imageOpen} onOpenChange={setImageOpen}>
          <DialogContent aria-describedby={undefined} className="w-[calc(100vw-32px)] max-w-3xl overflow-hidden p-4">
            <DialogTitle className="sr-only">{accessibleName}</DialogTitle>
            <img
              src={resolvedUrl}
              alt={accessibleName}
              loading="lazy"
              decoding="async"
              onError={handleMediaError}
              className="max-h-[75dvh] w-full object-contain"
            />
          </DialogContent>
        </Dialog>
      </div>
    );
  }

  if (kind === 'video') {
    return (
      <div className={cn('talk-me-media min-w-0 max-w-full overflow-hidden', className)}>
        {controlsVisible ? (
          <video
            src={resolvedUrl}
            controls
            preload="none"
            playsInline
            aria-label={`Vídeo de ${senderName}`}
            onError={handleMediaError}
            className="h-16 w-full rounded-xl border border-border/60 bg-black object-contain"
          />
        ) : (
          <button
            type="button"
            aria-label={`Reproduzir vídeo de ${senderName}`}
            onClick={() => setControlsVisible(true)}
            className="flex min-h-16 w-full items-center justify-center gap-2 rounded-xl border border-border/60 bg-muted/35 px-3 text-xs font-semibold text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
          >
            <Play className="h-4 w-4" aria-hidden="true" />
            Reproduzir vídeo
          </button>
        )}
        {caption?.trim() && <p className="mt-1 truncate text-xs text-foreground">{caption.trim()}</p>}
      </div>
    );
  }

  if (kind === 'audio') {
    return (
      <div className={cn('talk-me-media min-w-0 max-w-full overflow-hidden', className)}>
        {controlsVisible ? (
          <audio
            ref={audioRef}
            src={resolvedUrl}
            controls
            preload="none"
            aria-label={`Áudio de ${senderName}`}
            onError={handleMediaError}
            className="h-16 w-full max-w-full"
          />
        ) : (
          <button
            type="button"
            aria-label={`Reproduzir áudio de ${senderName}`}
            onClick={() => setControlsVisible(true)}
            className="flex min-h-16 w-full items-center justify-center gap-2 rounded-xl border border-border/60 bg-muted/35 px-3 text-xs font-semibold text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
          >
            <Mic className="h-4 w-4" aria-hidden="true" />
            Reproduzir áudio
          </button>
        )}
      </div>
    );
  }

  return (
    <div className={cn('talk-me-media min-w-0 max-w-full overflow-hidden', className)}>
      <div className="flex min-h-16 min-w-0 items-center gap-2 rounded-xl border border-border/60 bg-muted/35 px-3 py-2 text-xs text-foreground">
        <FileText className="h-4 w-4 shrink-0" aria-hidden="true" />
        <span className="min-w-0 flex-1 truncate">{fileTypeLabel(resolvedUrl, messageType)}</span>
        <a
          href={resolvedUrl}
          target="_blank"
          rel="noopener noreferrer"
          aria-label={`Abrir arquivo de ${senderName}`}
          className="shrink-0 rounded-md px-2 py-1 font-semibold underline underline-offset-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          Abrir
        </a>
      </div>
      {caption?.trim() && <p className="mt-1 truncate text-xs text-foreground">{caption.trim()}</p>}
    </div>
  );
}
