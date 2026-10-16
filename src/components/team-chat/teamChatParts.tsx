/* eslint-disable react-refresh/only-export-components */
import { memo, useRef } from 'react';
import { format, isToday, isYesterday } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { FileText, Image as ImageIcon, Music, Video, Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { SUPABASE_URL } from '@/config/supabase';
import { TeamMessage } from '@/hooks/team-chat/teamChatTypes';
import { useResolvedStorageUrl } from '@/hooks/storage/useResolvedStorageUrl';
import { useMediaElementVolume } from '@/hooks/communication/useMediaElementVolume';

export function formatTime(dateStr: string): string {
  return format(new Date(dateStr), 'HH:mm');
}

export function formatDateSep(dateStr: string): string {
  const d = new Date(dateStr);
  if (isToday(d)) return 'Hoje';
  if (isYesterday(d)) return 'Ontem';
  return format(d, "d 'de' MMMM", { locale: ptBR });
}

export const DEFAULT_CAPTIONS: Record<string, string> = {
  sticker: '🎨 Figurinha',
  audio_meme: '🎵 Áudio meme',
  emoji: '😀 Emoji',
  audio: '🎤 Mensagem de áudio',
};

export const MediaTypeIcon = memo(function MediaTypeIcon({ type }: { type: string | null }) {
  switch (type) {
    case 'image': case 'sticker': case 'emoji': return <ImageIcon className="w-3 h-3" aria-hidden />;
    case 'video': return <Video className="w-3 h-3" aria-hidden />;
    case 'audio': case 'audio_meme': return <Music className="w-3 h-3" aria-hidden />;
    case 'document': return <FileText className="w-3 h-3" aria-hidden />;
    default: return null;
  }
});

export const MediaContent = memo(function MediaContent({ msg }: { msg: TeamMessage }) {
  // SEC-FE-01: a URL de storage vem de @/config/supabase (a mesma fonte do client.ts) —
  // a variável de ambiente é injetada apontando para outro projeto.
  const source = (msg.media_bucket && msg.media_path)
    ? `${SUPABASE_URL}/storage/v1/object/${msg.media_bucket}/${msg.media_path}`
    : (msg.media_url || '');
  const { url: resolvedUrl, isLoading, refresh } = useResolvedStorageUrl(source);
  // E33/E37 — áudio e vídeo do chat interno da equipe são mídia de conversa.
  const videoRef = useRef<HTMLVideoElement>(null);
  const audioRef = useRef<HTMLAudioElement>(null);
  useMediaElementVolume(videoRef);
  useMediaElementVolume(audioRef);

  if (!source) return null;
  if (isLoading || !resolvedUrl) {
    return isLoading
      ? <Loader2 className="w-4 h-4 animate-spin" aria-label="Carregando mídia" />
      : <span className="text-xs text-destructive" role="alert">Mídia indisponível</span>;
  }

  switch (msg.media_type) {
    case 'image':
      return (
        <img
          src={resolvedUrl}
          alt="Imagem enviada"
          className="rounded-lg max-h-48 max-w-full object-contain cursor-pointer"
          onError={() => { void refresh(); }}
          onClick={() => window.open(resolvedUrl, '_blank')}
        />
      );
    case 'sticker':
      return (
        <img
          src={resolvedUrl}
          alt="Figurinha"
          className="w-24 h-24 object-contain"
          onError={() => { void refresh(); }}
        />
      );
    case 'emoji':
      return (
        <img
          src={resolvedUrl}
          alt="Emoji personalizado"
          className="w-16 h-16 object-contain"
          onError={() => { void refresh(); }}
        />
      );
    case 'video':
      return (
        <video
          ref={videoRef}
          src={resolvedUrl}
          controls
          onError={() => { void refresh(); }}
          className="rounded-lg max-h-48 max-w-full"
          aria-label="Vídeo enviado"
        />
      );
    case 'audio':
    case 'audio_meme': {
      const isWebm = source.split(/[?#]/, 1)[0].endsWith('.webm');
      return (
        <div className="flex flex-col gap-1 w-full max-w-[240px]">
          <audio ref={audioRef} src={resolvedUrl} controls onError={() => { void refresh(); }} className="w-full" aria-label="Áudio enviado" />
          {isWebm && (
            <p className="text-[9px] opacity-60 italic px-1">
              Nota: Áudio WebM pode não ser compatível com Safari/iOS.
            </p>
          )}
        </div>
      );
    }
    case 'document':
      return (
        <a
          href={resolvedUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center gap-2 p-2 rounded-lg bg-muted/30 hover:bg-muted/50 transition-colors"
          aria-label={`Abrir documento: ${msg.content || 'Arquivo'}`}
        >
          <FileText className="w-5 h-5 text-muted-foreground shrink-0" aria-hidden />
          <span className="text-sm text-foreground underline truncate">{msg.content || 'Documento'}</span>
        </a>
      );
    default:
      return null;
  }
});
