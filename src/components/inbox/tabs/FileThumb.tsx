import { useEffect, useRef, useState } from 'react';
import {
  AudioLines, File, FileArchive, FileSpreadsheet, FileText, Image as ImageIcon, Play, Presentation,
  type LucideIcon,
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import { cfImagesSrcSet } from '@/lib/cfImages';
import { useResolvedStorageUrl } from '@/hooks/storage/useResolvedStorageUrl';
import type { ContactMediaItem } from '@/hooks/chat/useContactMedia';
import { documentBadge, documentFamily, formatDuration, type DocumentFamily } from './fileDisplay';

/**
 * Etapa 26: miniatura compartilhada pelos tres modos (cartao, linha e celula). Estados:
 * `loading` (skeleton enquanto a URL assinada resolve), `ready`, `no-preview` (icone do tipo)
 * e `error` (icone + `title="Prévia indisponível"`). Em erro de imagem faz UM `refresh`
 * automatico (o cooldown de 5 s mora no hook) e depois cai num placeholder estavel — sem loop
 * de `onError`. A imagem usa `object-contain` no cartao (print de planilha nao pode ser cortado),
 * `object-cover` nas miniaturas pequenas.
 */
export type FileThumbSize = 'card' | 'row' | 'cell';

const BOX: Record<FileThumbSize, string> = {
  card: 'h-full w-full',
  row: 'h-12 w-12 rounded-lg',
  cell: 'h-8 w-8 rounded-md',
};

const ICON: Record<FileThumbSize, string> = {
  card: 'h-8 w-8',
  row: 'h-5 w-5',
  cell: 'h-4 w-4',
};

const DOC_ICON: Record<DocumentFamily, LucideIcon> = {
  pdf: FileText,
  sheet: FileSpreadsheet,
  doc: FileText,
  ppt: Presentation,
  archive: FileArchive,
  generic: File,
};

/** Observa a entrada na zona de pre-carregamento; dispara uma vez e desconecta. */
function useInView(ref: { current: Element | null }, enabled: boolean): boolean {
  // Sem IntersectionObserver (ambiente sem API) nasce visivel: melhor montar o `<video>` do
  // que nunca mostrar imagem. Com a API presente, so a entrada na zona monta.
  const [inView, setInView] = useState(() => typeof IntersectionObserver === 'undefined');

  useEffect(() => {
    if (!enabled || inView) return;
    const node = ref.current;
    if (!node) return;
    // rootMargin 200px (etapa 27): monta o `<video>` ate 200 px antes de aparecer, para o
    // primeiro frame chegar sem salto; fora da zona nao existe `<video>` nenhum.
    const observer = new IntersectionObserver((entries) => {
      if (entries.some((entry) => entry.isIntersecting)) {
        setInView(true);
        observer.disconnect();
      }
    }, { rootMargin: '200px' });
    observer.observe(node);
    return () => observer.disconnect();
  }, [ref, enabled, inView]);

  return inView;
}

function ThumbSkeleton() {
  return <span data-testid="files-thumb-skeleton" className="h-full w-full animate-pulse bg-muted" />;
}

function ThumbFallback({ icon: Icon, size, error = false }: {
  icon: LucideIcon; size: FileThumbSize; error?: boolean;
}) {
  return (
    <span
      className="flex h-full w-full items-center justify-center"
      title={error ? 'Prévia indisponível' : undefined}
      data-testid={error ? 'files-thumb-error' : undefined}
    >
      <Icon className={cn(ICON[size], 'text-muted-foreground')} />
    </span>
  );
}

function ThumbImage({ item, size }: { item: ContactMediaItem; size: FileThumbSize }) {
  // Etapa 10 + R2-INB-059: o locator (`item.url`) fica SEMPRE com o resolver, para que uma
  // assinatura em lote que falhe possa ser renovada; a URL em lote entra como semente e evita
  // o pedido individual enquanto vale.
  const { url: resolvedUrl, isLoading, refresh } = useResolvedStorageUrl(item.url, undefined, {
    signedUrl: item.signedUrl,
    signedUrlExpiresAt: item.expiresAt,
  });
  const src = resolvedUrl || item.signedUrl || '';
  // Falha amarrada ao `src` que falhou: quando a URL muda (refresh bem-sucedido ou assinatura
  // em lote que chegou depois), o placeholder cai sozinho — sem efeito de reset.
  const [failedSrc, setFailedSrc] = useState<string | null>(null);
  const refreshedRef = useRef(false);
  const failed = failedSrc !== null && failedSrc === src;

  if (isLoading && !src) return <ThumbSkeleton />;
  if (failed || !src) return <ThumbFallback icon={ImageIcon} size={size} error={failed} />;

  return (
    <img
      src={src}
      srcSet={cfImagesSrcSet(src) ?? undefined}
      sizes={size === 'card' ? '(max-width: 768px) 50vw, 320px' : '96px'}
      alt={size === 'card' ? item.displayName : ''}
      loading="lazy"
      decoding="async"
      className={cn('h-full w-full', size === 'card' ? 'object-contain' : 'object-cover')}
      onError={() => {
        if (refreshedRef.current) {
          setFailedSrc(src);
          return;
        }
        refreshedRef.current = true;
        void refresh().then((next) => { if (!next) setFailedSrc(src); });
      }}
    />
  );
}

function MediaTile({ item, size }: { item: ContactMediaItem; size: FileThumbSize }) {
  const boxRef = useRef<HTMLSpanElement>(null);
  const isVideo = item.type === 'video';
  const inView = useInView(boxRef, isVideo && size === 'card');
  const [duration, setDuration] = useState<string | null>(null);
  const src = item.signedUrl ?? item.url;
  const showVideo = isVideo && size === 'card' && inView && Boolean(src);

  return (
    <span ref={boxRef} className="relative flex h-full w-full items-center justify-center">
      {showVideo ? (
        <>
          {/* Nenhuma URL de poster derivada de `media_meta` (G14): so o primeiro frame do
              proprio arquivo, quando ele entra na zona de pre-carregamento. */}
          <video
            src={src}
            preload="metadata"
            muted
            playsInline
            className="h-full w-full object-cover"
            onLoadedMetadata={(event) => {
              const seconds = event.currentTarget.duration;
              if (Number.isFinite(seconds) && seconds > 0) setDuration(formatDuration(seconds));
            }}
          />
          <span className="pointer-events-none absolute inset-0 flex items-center justify-center">
            <span className="flex h-10 w-10 items-center justify-center rounded-full bg-background/60">
              <Play className="h-5 w-5" />
            </span>
          </span>
          {duration && (
            <span className="absolute bottom-1.5 right-1.5 rounded bg-background/80 px-1.5 py-0.5 text-2xs tabular-nums text-foreground">
              {duration}
            </span>
          )}
        </>
      ) : item.type === 'audio' ? (
        <span className="flex flex-col items-center justify-center gap-1">
          {/* Etapa 28: `media_meta` nao tem contrato de chave no schema-catalog.json (so
              `jsonb`), entao nao ha campo de duracao confirmado — nada de duracao inventada.
              O icone AudioLines distingue audio de video sem depender de cor. */}
          <AudioLines className={cn(ICON[size], 'text-muted-foreground')} />
          {size === 'card' && <span className="text-2xs text-muted-foreground">Áudio</span>}
        </span>
      ) : (
        <span className="flex flex-col items-center justify-center gap-1">
          <Play className={cn(ICON[size], 'text-muted-foreground')} />
          {size === 'card' && <span className="text-2xs text-muted-foreground">Vídeo</span>}
        </span>
      )}
    </span>
  );
}

function DocumentTile({ item, size }: { item: ContactMediaItem; size: FileThumbSize }) {
  const family = documentFamily(item.extension);
  const Icon = DOC_ICON[family];
  const badge = size === 'card' ? documentBadge(item.extension) : null;

  return (
    <span className="flex flex-col items-center justify-center gap-1">
      <Icon className={cn(ICON[size], 'text-muted-foreground')} />
      {badge && (
        <Badge variant="subtle" className="h-4 px-1.5 text-3xs font-bold tracking-wide">{badge}</Badge>
      )}
    </span>
  );
}

function renderThumb(item: ContactMediaItem, size: FileThumbSize) {
  // Figurinha é imagem: usa a MESMA miniatura (`ThumbImage`), nunca o ícone de documento.
  if (item.type === 'image' || item.type === 'sticker') return <ThumbImage item={item} size={size} />;
  if (item.type === 'video' || item.type === 'audio') return <MediaTile item={item} size={size} />;
  return <DocumentTile item={item} size={size} />;
}

export function FileThumb({ item, size }: { item: ContactMediaItem; size: FileThumbSize }) {
  return (
    <span
      data-testid={`files-thumb-${item.id}`}
      className={cn('flex shrink-0 items-center justify-center overflow-hidden bg-muted', BOX[size])}
    >
      {renderThumb(item, size)}
    </span>
  );
}
