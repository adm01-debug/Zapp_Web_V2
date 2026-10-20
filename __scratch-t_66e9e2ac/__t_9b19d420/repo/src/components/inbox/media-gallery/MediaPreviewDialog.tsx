import { useCallback, useEffect, useRef } from 'react';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { ChevronLeft, ChevronRight, File } from 'lucide-react';
import type { MediaItem } from './mediaUtils';
import { useResolvedStorageUrl } from '@/hooks/storage/useResolvedStorageUrl';
import { useMediaElementVolume } from '@/hooks/communication/useMediaElementVolume';

/** O documento ganha o nome legivel (o tecnico fica no `DialogDescription`, para o leitor de tela). */
type PreviewItem = MediaItem & { displayName?: string };

interface MediaPreviewDialogProps {
  item: PreviewItem | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Colecao filtrada atual (etapa 30): habilita Anterior/Proximo e as setas. Sem ela, o
   * visualizador abre um item so — e o uso do chat continua intacto. */
  items?: PreviewItem[];
  onNavigate?: (item: PreviewItem) => void;
}

/** Extensao do nome tecnico para decidir o caminho de leitura do documento (etapa 29). */
function documentExtension(filename: string): string {
  const match = /\.([a-z0-9]{1,8})$/i.exec(filename.split(/[?#]/)[0]);
  return match ? match[1].toLowerCase() : '';
}

export function MediaPreviewDialog({
  item,
  open,
  onOpenChange,
  items,
  onNavigate,
}: MediaPreviewDialogProps) {
  // O chamador (MediaGallery) so troca previewItem ao abrir outro item e nunca
  // o zera ao fechar, entao o conteudo continua disponivel durante a animacao de
  // saida do Dialog — nao ha por que guardar uma copia local aqui.
  const displayItem = item;

  const { url: resolvedUrl, isLoading, error, refresh } = useResolvedStorageUrl(displayItem?.url || '');
  // E23 — a galeria toca áudio e vídeo da conversa: ambos no volume global.
  const videoRef = useRef<HTMLVideoElement>(null);
  const audioRef = useRef<HTMLAudioElement>(null);
  useMediaElementVolume(videoRef);
  useMediaElementVolume(audioRef);

  // Etapa 30: foco devolvido ao gatilho ao fechar. Capturado no `onOpenAutoFocus` do Radix
  // (antes de o foco entrar no dialogo) e devolvido no `onCloseAutoFocus`; o Radix nem sempre
  // alcanca quando o pai desmonta o dialogo.
  const triggerRef = useRef<HTMLElement | null>(null);

  const index = items && displayItem ? items.findIndex((candidate) => candidate.id === displayItem.id) : -1;
  const hasPrev = items != null && index > 0;
  const hasNext = items != null && index >= 0 && index < items.length - 1;

  const navigate = useCallback((nextIndex: number) => {
    if (items && nextIndex >= 0 && nextIndex < items.length) onNavigate?.(items[nextIndex]);
  }, [items, onNavigate]);

  useEffect(() => {
    if (!open || !items || items.length < 2) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'ArrowLeft' && hasPrev) navigate(index - 1);
      else if (event.key === 'ArrowRight' && hasNext) navigate(index + 1);
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [open, items, hasPrev, hasNext, navigate, index]);

  const handleOpenChange = (next: boolean) => {
    if (next) {
      onOpenChange(true);
      return;
    }
    const target = triggerRef.current;
    onOpenChange(false);
    target?.focus();
  };

  if (!displayItem) return null;

  const displayName = displayItem.displayName ?? displayItem.filename;
  const isPdf = displayItem.type === 'document' && documentExtension(displayItem.filename) === 'pdf';

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      {/* V01: janela do arquivo 40% mais estreita (896 -> 538px) e 20% mais baixa (80vh -> 64vh).
          O `_-_` vira espaço no CSS: `calc(100vw-2rem)` sem os espaços é descartado pelo navegador
          (a largura cairia de volta ao `max-w-lg` da base). `min(...)` segura o teto no celular. */}
      <DialogContent
        className="max-w-[min(538px,calc(100vw_-_2rem))] max-h-[64vh] p-0 overflow-hidden"
        onOpenAutoFocus={() => {
          triggerRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
        }}
        onCloseAutoFocus={(event) => {
          event.preventDefault();
          triggerRef.current?.focus();
        }}
      >
        <DialogHeader className="p-4 border-b">
          <div className="flex items-center justify-between gap-3">
            {/* Etapa 30: titulo = displayName; o nome tecnico vai para o DialogDescription. */}
            <DialogTitle className="min-w-0 flex-1 truncate">{displayName}</DialogTitle>
            <DialogDescription className="sr-only">{displayItem.filename}</DialogDescription>
            <div className="flex shrink-0 items-center gap-1">
              <Button variant="ghost" size="icon-sm" aria-label="Anterior" disabled={!hasPrev} onClick={() => navigate(index - 1)}>
                <ChevronLeft className="w-4 h-4" />
              </Button>
              <Button variant="ghost" size="icon-sm" aria-label="Próximo" disabled={!hasNext} onClick={() => navigate(index + 1)}>
                <ChevronRight className="w-4 h-4" />
              </Button>
            </div>
          </div>
        </DialogHeader>
        <div className="flex items-center justify-center p-4 bg-background/90 min-h-[320px]">
          {isLoading && <span className="text-sm text-muted-foreground">Carregando mídia…</span>}
          {error && <Button variant="outline" onClick={() => { void refresh(); }}>Tentar novamente</Button>}
          {(displayItem.type === 'image' || displayItem.type === 'sticker') && resolvedUrl && <img src={resolvedUrl} alt={displayName} onError={() => { void refresh(); }} className="max-w-full max-h-[56vh] object-contain" />}
          {displayItem.type === 'video' && resolvedUrl && <video ref={videoRef} src={resolvedUrl} controls controlsList="nodownload" onError={() => { void refresh(); }} onContextMenu={(e) => e.preventDefault()} className="max-w-full max-h-[56vh]" crossOrigin="anonymous" playsInline />}
          {displayItem.type === 'audio' && resolvedUrl && <div className="p-8"><audio ref={audioRef} src={resolvedUrl} controls controlsList="nodownload" onError={() => { void refresh(); }} className="w-full" /></div>}
          {displayItem.type === 'document' && (
            isPdf ? (
              // Etapa 29 (D2a): PDF abre DENTRO do ZAPP no visualizador nativo do navegador.
              resolvedUrl
                ? <iframe src={`${resolvedUrl}#toolbar=0`} title={displayName} className="w-full h-[56vh] rounded-lg border border-border/60 bg-background" />
                : null
            ) : (
              // Documento sem visualizador interno: icone + nome + "Abrir" (unico caminho de
              // leitura de um orcamento em planilha), com `noopener` na URL assinada.
              <div className="text-center p-8">
                <File className="w-16 h-16 mx-auto mb-4 text-muted-foreground" />
                <p className="text-foreground mb-4">{displayName}</p>
                {resolvedUrl && (
                  <Button onClick={() => window.open(resolvedUrl, '_blank', 'noopener,noreferrer')}>Abrir</Button>
                )}
              </div>
            )
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
