import { useCallback, useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { ChevronLeft, ChevronRight, Loader2 } from 'lucide-react';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog';
import { useEvolutionApi } from '@/hooks/integrations/useEvolutionApi';
import { useMediaElementVolume } from '@/hooks/communication/useMediaElementVolume';
import type { WhatsAppStatusMessage } from '@/hooks/integrations/useWhatsAppStatus';
import { zappTransition } from '@/lib/motion';
import { cn } from '@/lib/utils';
import { STORY_DURATION_MS, storyCaption, storyKeyOf, storyMediaKind } from './storyUtils';

const toDataUrl = (base64?: string | null, mimetype?: string | null) =>
  base64 && mimetype ? `data:${mimetype};base64,${base64}` : null;

const clampIndex = (index: number, length: number) =>
  length <= 0 ? 0 : Math.min(Math.max(index, 0), length - 1);

interface StoryViewerProps {
  messages: WhatsAppStatusMessage[];
  initialIndex: number;
  instanceName: string | null;
  onClose: () => void;
  onSeen: (key: string) => void;
}

interface StoryMediaState {
  src: string | null;
  loading: boolean;
  error: string | null;
}

function StoryMedia({ message, instanceName }: { message: WhatsAppStatusMessage; instanceName: string | null }) {
  const { getMediaBase64 } = useEvolutionApi();
  // o <video> do status obedece ao controle único de volume do app (mesmo
  // contrato das outras superfícies de mídia — ver media-volume-surfaces).
  const videoRef = useRef<HTMLVideoElement>(null);
  const { muted } = useMediaElementVolume(videoRef);
  const kind = storyMediaKind(message);
  const mediaKey = storyKeyOf(message);
  const [media, setMedia] = useState<StoryMediaState>({
    src: null,
    loading: kind !== 'text',
    error: null,
  });

  // A busca da mídia só pode depender da identidade do status e da instância:
  // `useEvolutionApi` devolve uma função nova a cada render, então guardamos as
  // referências e não as usamos como dependência (senão a mídia seria rebuscada).
  const getMediaRef = useRef(getMediaBase64);
  const messageRef = useRef(message);
  useEffect(() => {
    getMediaRef.current = getMediaBase64;
    messageRef.current = message;
  }, [getMediaBase64, message]);

  useEffect(() => {
    if (kind === 'text') return;
    let cancelled = false;

    const load = async () => {
      if (!instanceName) {
        setMedia({ src: null, loading: false, error: 'Sem conexão WhatsApp para carregar a mídia.' });
        return;
      }
      try {
        const response = (await getMediaRef.current(instanceName, messageRef.current, kind === 'video')) as
          | { base64?: string; mimetype?: string }
          | null;
        if (cancelled) return;
        const src = toDataUrl(response?.base64, response?.mimetype);
        setMedia({
          src,
          loading: false,
          error: src ? null : 'Não foi possível carregar a mídia deste status.',
        });
      } catch {
        if (!cancelled) {
          setMedia({ src: null, loading: false, error: 'Não foi possível carregar a mídia deste status.' });
        }
      }
    };

    void load();
    return () => {
      cancelled = true;
    };
  }, [instanceName, kind, mediaKey]);

  const caption = storyCaption(message);

  return (
    <div className="flex h-full w-full flex-col items-center justify-center">
      {media.loading && (
        <div className="flex flex-col items-center gap-3 text-muted-foreground" data-testid="story-media-loading">
          <Loader2 className="h-6 w-6 motion-safe:animate-spin" aria-hidden="true" />
          <span className="text-sm">Carregando status…</span>
        </div>
      )}

      {!media.loading && media.error && (
        <p className="px-6 text-center text-sm text-muted-foreground" role="status" data-testid="story-media-error">
          {media.error}
        </p>
      )}

      {!media.loading && !media.error && media.src && kind === 'image' && (
        <img
          src={media.src}
          alt={caption ?? 'Status do WhatsApp do contato'}
          className="max-h-full max-w-full object-contain"
          data-testid="story-image"
        />
      )}

      {!media.loading && !media.error && media.src && kind === 'video' && (
        <video
          ref={videoRef}
          muted={muted}
          src={media.src}
          controls
          playsInline
          aria-label={caption ?? 'Vídeo do status do contato'}
          className="max-h-full max-w-full"
          data-testid="story-video"
        />
      )}

      {!media.loading && !media.error && !media.src && kind === 'text' && (
        <p
          className="px-6 text-center text-lg font-medium text-foreground"
          data-testid="story-text"
        >
          {caption ?? 'Status sem texto.'}
        </p>
      )}

      {caption && kind !== 'text' && !media.error && (
        <p className="mt-3 max-w-full px-6 text-center text-sm text-foreground/90">{caption}</p>
      )}
    </div>
  );
}

function ProgressBar({
  state,
  durationMs,
  reduceMotion,
}: {
  state: 'done' | 'active' | 'idle';
  durationMs: number;
  reduceMotion: boolean;
}) {
  const animateTo = state === 'idle' ? 0 : 1;
  return (
    <div
      className="h-1 flex-1 overflow-hidden rounded-full bg-border"
      data-state={state}
      data-testid="story-progress-bar"
    >
      <motion.div
        className="h-full w-full origin-left rounded-full bg-foreground"
        initial={{ scaleX: state === 'done' ? 1 : 0 }}
        animate={{ scaleX: animateTo }}
        transition={
          state === 'active' && !reduceMotion ? { duration: durationMs / 1000, ease: 'linear' } : { duration: 0 }
        }
      />
    </div>
  );
}

/**
 * Visualizador de status do WhatsApp do contato.
 *
 * Abre sobre o painel de contato, carrega a mídia de cada status SOB DEMANDA pelo
 * hook `useEvolutionApi` (o caminho privado da V2 — a URL da Evolution nunca vai
 * para o `<img>`), avança sozinho a cada 5 s e aceita setas do teclado (Esc fecha
 * pelo Radix). Com movimento reduzido, a troca de status só muda a opacidade e a
 * barra de progresso não anima.
 */
export function StoryViewer({ messages, initialIndex, instanceName, onClose, onSeen }: StoryViewerProps) {
  const reduceMotion = useReducedMotion();
  const [index, setIndex] = useState(() => clampIndex(initialIndex, messages.length));
  const current = messages[index];

  const go = useCallback(
    (delta: number) => setIndex((i) => clampIndex(i + delta, messages.length)),
    [messages.length],
  );

  useEffect(() => {
    if (messages.length === 0 || index >= messages.length - 1) return;
    const timer = window.setTimeout(() => go(1), STORY_DURATION_MS);
    return () => window.clearTimeout(timer);
  }, [go, index, messages.length]);

  useEffect(() => {
    if (current) onSeen(storyKeyOf(current, index));
  }, [current, index, onSeen]);

  const handleKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (event.key === 'ArrowRight') {
      event.preventDefault();
      go(1);
    } else if (event.key === 'ArrowLeft') {
      event.preventDefault();
      go(-1);
    }
  };

  const slide = reduceMotion
    ? { initial: { opacity: 0 }, animate: { opacity: 1 }, exit: { opacity: 0 } }
    : { initial: { opacity: 0, x: 24 }, animate: { opacity: 1, x: 0 }, exit: { opacity: 0, x: -24 } };

  return (
    <Dialog open onOpenChange={(open) => { if (!open) onClose(); }}>
      <DialogContent
        showCloseButton
        aria-label="Status do WhatsApp"
        onKeyDown={handleKeyDown}
        data-testid="story-viewer"
        className="w-full max-w-md gap-0 overflow-hidden border-none bg-card-elevated p-0 text-foreground sm:max-w-md"
      >
        <DialogTitle className="sr-only">Status do WhatsApp</DialogTitle>
        <DialogDescription className="sr-only">
          Visualizador dos status do contato. Use as setas esquerda e direita para navegar; Esc fecha.
        </DialogDescription>

        <div className="flex gap-1 px-3 pt-3" data-testid="story-progress">
          {messages.map((message, i) => (
            <ProgressBar
              key={storyKeyOf(message, i)}
              state={i < index ? 'done' : i === index ? 'active' : 'idle'}
              durationMs={STORY_DURATION_MS}
              reduceMotion={reduceMotion ?? false}
            />
          ))}
        </div>

        <div className="relative flex h-80 items-center justify-center p-3">
          <AnimatePresence mode="wait" initial={false}>
            <motion.div
              key={index}
              data-motion={reduceMotion ? 'reduced' : 'full'}
              className="absolute inset-0 flex items-center justify-center p-3"
              initial={slide.initial}
              animate={slide.animate}
              exit={slide.exit}
              transition={reduceMotion ? { duration: 0 } : zappTransition.panel}
            >
              {current && <StoryMedia message={current} instanceName={instanceName} />}
            </motion.div>
          </AnimatePresence>

          <button
            type="button"
            onClick={() => go(-1)}
            disabled={index <= 0}
            aria-label="Status anterior"
            className={cn(
              'absolute left-1 top-1/2 flex h-10 w-10 -translate-y-1/2 items-center justify-center rounded-full',
              'bg-card/80 text-foreground motion-safe:transition-opacity hover:bg-card',
              'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
              'disabled:pointer-events-none disabled:opacity-30',
            )}
          >
            <ChevronLeft className="h-5 w-5" aria-hidden="true" />
          </button>
          <button
            type="button"
            onClick={() => go(1)}
            disabled={index >= messages.length - 1}
            aria-label="Próximo status"
            className={cn(
              'absolute right-1 top-1/2 flex h-10 w-10 -translate-y-1/2 items-center justify-center rounded-full',
              'bg-card/80 text-foreground motion-safe:transition-opacity hover:bg-card',
              'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
              'disabled:pointer-events-none disabled:opacity-30',
            )}
          >
            <ChevronRight className="h-5 w-5" aria-hidden="true" />
          </button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
