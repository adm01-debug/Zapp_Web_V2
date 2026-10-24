import { useEffect, useMemo, useRef, useState } from 'react';
import { Loader2, Pause, Play } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { SUPABASE_URL } from '@/config/supabase';
import { useMediaElementVolume } from '@/hooks/communication/useMediaElementVolume';
import { useResolvedStorageUrl } from '@/hooks/storage/useResolvedStorageUrl';
import { cn } from '@/lib/utils';

const BUCKET = 'audio-messages';
const ORIGEM_DO_STORAGE = new URL(SUPABASE_URL).origin;

/**
 * Converte o caminho salvo em `whisper_messages.audio_path` (`<uid>/<conversa>/<uuid>`)
 * no locator durável do objeto. A rota `/public/` aqui é só identificador: o bucket é
 * privado e a leitura continua exigindo a URL assinada emitida sob demanda.
 */
function locatorDoAudioDeSussurro(audioPath: string): string {
  const caminho = audioPath.trim().replace(/^\/+|\/+$/g, '');
  if (!caminho) return '';
  const segmentos = caminho.split('/');
  if (segmentos.some((segmento) => segmento === '' || segmento === '.' || segmento === '..')) return '';
  return `${ORIGEM_DO_STORAGE}/storage/v1/object/public/${BUCKET}/${segmentos.map(encodeURIComponent).join('/')}`;
}

/** Rótulo curto de tempo (`0:07`) para a nota; vazio enquanto o metadata não chega. */
function formatarTempo(segundos: number): string {
  if (!Number.isFinite(segundos) || segundos <= 0) return '';
  const total = Math.floor(segundos);
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, '0')}`;
}

interface WhisperAudioPlayerProps {
  /** Caminho do objeto no bucket `audio-messages` (`<uid>/<conversa>/<uuid>`). */
  audioPath: string;
  /** Nome do atendente que gravou a nota — entra no rótulo da audição. */
  autor?: string;
  className?: string;
}

/**
 * Player da nota de sussurro por voz. Assina a URL só quando o atendente pede para
 * ouvir — o painel lista até 20 notas e assinar todas no mount gastaria credencial —
 * e obedece ao volume único do app, como os outros áudios da conversa.
 */
export function WhisperAudioPlayer({ audioPath, autor, className }: WhisperAudioPlayerProps) {
  const [pediuParaOuvir, setPediuParaOuvir] = useState(false);
  // Reemissão da assinatura: o hook só reage a uma fonte nova, então a tentativa
  // entra na identidade da fonte (a parte depois de `#` não altera o caminho).
  const [tentativa, setTentativa] = useState(0);
  const [tocando, setTocando] = useState(false);
  const [progresso, setProgresso] = useState(0);
  const [tempoTotal, setTempoTotal] = useState(0);

  const audioRef = useRef<HTMLAudioElement | null>(null);
  useMediaElementVolume(audioRef);

  const locator = useMemo(() => locatorDoAudioDeSussurro(audioPath), [audioPath]);
  const fonte = pediuParaOuvir && locator ? `${locator}#t${tentativa}` : '';
  const { url, isLoading, error } = useResolvedStorageUrl(fonte);

  const tocarElemento = () => {
    const elemento = audioRef.current;
    if (!elemento) return;
    const resultado = elemento.play();
    if (resultado && typeof resultado.catch === 'function') void resultado.catch(() => undefined);
  };

  // A assinatura chega depois do clique: tocar então continua o gesto do usuário.
  useEffect(() => {
    if (!pediuParaOuvir || !url) return;
    tocarElemento();
  }, [pediuParaOuvir, url, tentativa]);

  const alternarAudio = () => {
    if (tocando) {
      audioRef.current?.pause();
      return;
    }
    if (url) {
      tocarElemento();
      return;
    }
    setPediuParaOuvir(true);
  };

  const tentarDeNovo = () => {
    setTentativa((atual) => atual + 1);
    setPediuParaOuvir(true);
  };

  const decorrido = tempoTotal > 0 ? formatarTempo((tempoTotal * progresso) / 100) : '';
  const rotuloAcao = tocando
    ? `Pausar nota de sussurro por voz${autor ? ` de ${autor}` : ''}`
    : `Tocar nota de sussurro por voz${autor ? ` de ${autor}` : ''}`;

  return (
    <div className={cn('flex items-center gap-2', className)}>
      <Button
        type="button"
        size="icon"
        variant="ghost"
        className="h-7 w-7 shrink-0"
        onClick={alternarAudio}
        aria-label={rotuloAcao}
      >
        {isLoading ? (
          <Loader2 className="h-3.5 w-3.5 motion-safe:animate-spin" aria-hidden="true" />
        ) : tocando ? (
          <Pause className="h-3.5 w-3.5" aria-hidden="true" />
        ) : (
          <Play className="h-3.5 w-3.5" aria-hidden="true" />
        )}
      </Button>

      <div
        role="progressbar"
        aria-label="Progresso da nota de sussurro por voz"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={Math.round(progresso)}
        className="h-1.5 flex-1 overflow-hidden rounded-full bg-muted"
      >
        <div
          className="h-full rounded-full bg-warning transition-[width] duration-150 motion-reduce:transition-none"
          style={{ width: `${progresso}%` }}
        />
      </div>

      <span className="w-8 shrink-0 text-right text-3xs tabular-nums text-muted-foreground">
        {decorrido || formatarTempo(tempoTotal)}
      </span>

      <audio
        ref={audioRef}
        src={url || undefined}
        preload="metadata"
        className="hidden"
        onPlay={() => setTocando(true)}
        onPause={() => setTocando(false)}
        onEnded={() => {
          setTocando(false);
          setProgresso(0);
        }}
        onLoadedMetadata={(evento) => setTempoTotal(evento.currentTarget.duration)}
        onTimeUpdate={(evento) => {
          const elemento = evento.currentTarget;
          if (Number.isFinite(elemento.duration) && elemento.duration > 0) {
            setProgresso((elemento.currentTime / elemento.duration) * 100);
          }
        }}
        onError={() => setTocando(false)}
      />

      {error && (
        <div role="alert" className="flex shrink-0 items-center gap-1 text-3xs text-destructive">
          <span>Não foi possível tocar a nota.</span>
          <button
            type="button"
            onClick={tentarDeNovo}
            className="font-medium underline-offset-2 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            Tentar de novo
          </button>
        </div>
      )}
    </div>
  );
}
