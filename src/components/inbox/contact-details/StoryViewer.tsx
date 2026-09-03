import { useState, useCallback, useEffect } from 'react';
import { useEvolutionApi } from '@/hooks/integrations/useEvolutionApi';
import type { WhatsAppStatusMessage } from '@/hooks/integrations/useWhatsAppStatus';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog';
import { Loader2, Image as ImageIcon, Video, ChevronLeft, ChevronRight, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import { motion, AnimatePresence } from 'framer-motion';
import { formatRelativeTime } from '@/lib/formatters';

// DEFAULT_INSTANCE_NAME removido: stories off (EVENT_IGNORE_STATUS=true).

const getMediaType = (msg: WhatsAppStatusMessage): 'image' | 'video' | 'text' => {
  if (msg.message?.imageMessage) return 'image';
  if (msg.message?.videoMessage) return 'video';
  return 'text';
};

const getTextContent = (msg: WhatsAppStatusMessage) => {
  if (msg.message?.imageMessage?.caption) return msg.message.imageMessage.caption;
  if (msg.message?.videoMessage?.caption) return msg.message.videoMessage.caption;
  if (msg.message?.extendedTextMessage?.text) return msg.message.extendedTextMessage.text;
  if (msg.message?.conversation) return msg.message.conversation;
  return null;
};

const getBgColor = (msg: WhatsAppStatusMessage) => {
  const bg = msg.message?.extendedTextMessage?.backgroundColor;
  if (typeof bg === 'number') {
    const hex = (bg >>> 0).toString(16).padStart(8, '0');
    return `#${hex.slice(2)}`;
  }
  return null;
};

const toDataUrl = (base64?: string | null, mimetype?: string | null) => {
  if (!base64 || !mimetype) return null;
  return `data:${mimetype};base64,${base64}`;
};

const getStatusTime = (msg: WhatsAppStatusMessage) => {
  const ts = msg.messageTimestamp;
  if (!ts) return null;
  const date = new Date(typeof ts === 'string' ? parseInt(ts, 10) * 1000 : ts * 1000);
  return formatRelativeTime(date);
};

interface StoryViewerProps {
  messages: WhatsAppStatusMessage[];
  initialIndex: number;
  open: boolean;
  onClose: () => void;
  pushName?: string;
}

interface ResolvedMedia {
  src: string | null;
  mimetype: string | null;
}

export function StoryViewer({ messages, initialIndex, open, onClose, pushName }: StoryViewerProps) {
  const { getMediaBase64 } = useEvolutionApi();
  const [index, setIndex] = useState(initialIndex);
  const [resolvedMedia, setResolvedMedia] = useState<ResolvedMedia>({ src: null, mimetype: null });
  const [mediaLoading, setMediaLoading] = useState(false);
  const [mediaError, setMediaError] = useState<string | null>(null);

  useEffect(() => { if (open) setIndex(initialIndex); }, [open, initialIndex]);

  const goNext = useCallback(() => setIndex((i) => Math.min(i + 1, messages.length - 1)), [messages.length]);
  const goPrev = useCallback(() => setIndex((i) => Math.max(i - 1, 0)), []);

  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'ArrowRight') goNext();
      else if (e.key === 'ArrowLeft') goPrev();
      else if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [open, goNext, goPrev, onClose]);

  useEffect(() => {
    if (!open || !messages.length) return;
    const current = messages[index];
    const mediaType = getMediaType(current);
    setResolvedMedia({ src: null, mimetype: null });
    setMediaError(null);
    if (mediaType === 'text') { setMediaLoading(false); return; }

    let cancelled = false;
    const loadMedia = async () => {
      setMediaLoading(true);
      try {
        const instanceName = (typeof window !== 'undefined' && (window as any).__activeInstance__) || '';
        if (!instanceName) return;
        const response = await getMediaBase64(instanceName, current, mediaType === 'video') as { base64?: string; mimetype?: string } | null;
        if (cancelled) return;
        const src = toDataUrl(response?.base64 ?? null, response?.mimetype ?? null);
        if (!src) { setMediaError('Não foi possível carregar a mídia deste status.'); setResolvedMedia({ src: null, mimetype: response?.mimetype ?? null }); return; }
        setResolvedMedia({ src, mimetype: response?.mimetype ?? null });
      } catch (error) {
        if (cancelled) return;
        setMediaError(error instanceof Error ? error.message : 'Erro ao carregar mídia');
      } finally { if (!cancelled) setMediaLoading(false); }
    };
    loadMedia();
    return () => { cancelled = true; };
  }, [open, index, messages, getMediaBase64]);

  if (!open || !messages.length) return null;

  const current = messages[index];
  const mediaType = getMediaType(current);
  const textContent = getTextContent(current);
  const bgColor = getBgColor(current);
  const time = getStatusTime(current);

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent aria-describedby={undefined} className="max-w-2xl w-[95vw] p-0 gap-0 bg-background/95 border-border/20 overflow-hidden [&>button]:hidden">
        <DialogTitle className="sr-only">Visualizador de status</DialogTitle>
        <div className="flex gap-0.5 px-3 pt-3">
          {messages.map((_, i) => (
            <div key={i} className="flex-1 h-[3px] rounded-full overflow-hidden bg-white/20">
              <div className={cn('h-full rounded-full transition-all duration-300', i < index ? 'bg-white w-full' : i === index ? 'bg-primary w-full' : 'w-0')} />
            </div>
          ))}
        </div>

        <div className="flex items-center justify-between px-4 py-3">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-full bg-primary/20 flex items-center justify-center text-xs font-bold text-primary">
              {(pushName || '?')[0]?.toUpperCase()}
            </div>
            <div>
              <p className="text-xs font-medium text-white/90">{pushName || 'Contato'}</p>
              {time && <p className="text-[10px] text-white/50">{time}</p>}
            </div>
          </div>
          <div className="flex items-center gap-1">
            <span className="text-[10px] text-white/40 mr-2">{index + 1}/{messages.length}</span>
            <Button variant="ghost" size="icon" onClick={onClose} className="w-8 h-8 text-white/70 hover:text-white hover:bg-white/10"><X className="w-4 h-4" /></Button>
          </div>
        </div>

        <div className="relative flex items-center justify-center min-h-[50vh] max-h-[70vh]">
          {index > 0 && (
            <button onClick={goPrev} className="absolute left-2 z-10 w-10 h-10 rounded-full bg-muted/60 backdrop-blur flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-muted/80 transition-all">
              <ChevronLeft className="w-5 h-5" />
            </button>
          )}
          {index < messages.length - 1 && (
            <button onClick={goNext} className="absolute right-2 z-10 w-10 h-10 rounded-full bg-muted/60 backdrop-blur flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-muted/80 transition-all">
              <ChevronRight className="w-5 h-5" />
            </button>
          )}

          <AnimatePresence mode="wait">
            <motion.div key={index} initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.95 }} transition={{ duration: 0.2 }} className="w-full h-full flex items-center justify-center px-14">
              {mediaType === 'image' ? (
                mediaLoading ? (
                  <div className="flex flex-col items-center gap-3 text-white/70"><Loader2 className="w-6 h-6 animate-spin" /><p className="text-sm">Carregando imagem...</p></div>
                ) : resolvedMedia.src ? (
                  <img src={resolvedMedia.src} alt="Status" className="max-w-full max-h-[65vh] object-contain rounded-lg" loading="eager" />
                ) : (
                  <div className="text-center text-white/70 space-y-2"><ImageIcon className="w-8 h-8 mx-auto" /><p className="text-sm">{mediaError || 'Imagem indisponível'}</p></div>
                )
              ) : mediaType === 'video' ? (
                mediaLoading ? (
                  <div className="flex flex-col items-center gap-3 text-white/70"><Loader2 className="w-6 h-6 animate-spin" /><p className="text-sm">Carregando vídeo...</p></div>
                ) : resolvedMedia.src ? (
                  <video src={resolvedMedia.src} controls autoPlay className="max-w-full max-h-[65vh] object-contain rounded-lg" />
                ) : (
                  <div className="text-center text-white/70 space-y-2"><Video className="w-8 h-8 mx-auto" /><p className="text-sm">{mediaError || 'Vídeo indisponível'}</p></div>
                )
              ) : (
                <div className="w-full max-w-md p-8 rounded-2xl flex items-center justify-center text-center" style={{ backgroundColor: bgColor || 'hsl(var(--primary) / 0.15)' }}>
                  <p className="text-lg font-medium text-white leading-relaxed whitespace-pre-wrap break-words">{textContent || 'Status'}</p>
                </div>
              )}
            </motion.div>
          </AnimatePresence>
        </div>

        {mediaType !== 'text' && textContent && (
          <div className="px-6 py-4 bg-gradient-to-t from-black/80 to-transparent">
            <p className="text-sm text-white/90 whitespace-pre-wrap break-words text-center">{textContent}</p>
          </div>
        )}
        {(mediaType === 'text' || !textContent) && <div className="h-4" />}
      </DialogContent>
    </Dialog>
  );
}
