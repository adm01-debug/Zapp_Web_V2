import { useEffect, useRef, useState, type KeyboardEvent } from 'react';
import { createPortal } from 'react-dom';
import { motion, useReducedMotion } from 'framer-motion';
import { X, Download } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { detectVideoAudioTrack } from '@/lib/mediaVolumeElement';
import { useMediaElementVolume } from '@/hooks/communication/useMediaElementVolume';
import { MediaVolumeControl } from './MediaVolumeControl';

interface VideoFullscreenProps {
  url: string;
  onClose: () => void;
}

export function VideoFullscreen({ url, onClose }: VideoFullscreenProps) {
  const [playbackRate, setPlaybackRate] = useState(1.0);
  const [hasAudio, setHasAudio] = useState<boolean | null>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  // E16 — mesmo escopo de atalhos do player do balão, agora em tela cheia.
  const playerRef = useRef<HTMLDivElement>(null);
  // E21 — abre no volume global (não mais em `muted` fixo): aqui o mute e o volume são
  // os MESMOS do resto do app (D2). O botão de mute local que existia nesta barra foi
  // substituído pelo `MediaVolumeControl` (E22) para não haver dois controles do mesmo.
  const { muted } = useMediaElementVolume(videoRef);
  // U2 — a sobreposição é um diálogo: entra com o foco no "Fechar" e, ao sair,
  // devolve o foco a quem a abriu. O gesto de entrada respeita reduzir movimento.
  const reduzirMovimento = useReducedMotion();
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const gatilhoRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    gatilhoRef.current = document.activeElement as HTMLElement | null;
    closeButtonRef.current?.focus();
    return () => {
      gatilhoRef.current?.focus?.();
    };
  }, []);

  const handleKeyDown = (e: KeyboardEvent) => {
    if (e.key !== 'Escape') return;
    // Esc é do diálogo: não pode vazar para o painel de baixo (inbox fecha por baixo).
    e.stopPropagation();
    onClose();
  };

  const cycleSpeed = () => {
    const speeds = [1, 1.25, 1.5, 1.75, 2, 0.5, 0.75];
    const nextIndex = (speeds.indexOf(playbackRate) + 1) % speeds.length;
    const newRate = speeds[nextIndex];
    setPlaybackRate(newRate);
    if (videoRef.current) videoRef.current.playbackRate = newRate;
  };

  // E26 — vídeo sem faixa de áudio fica com o controle desabilitado (e a razão no
  // tooltip). A sondagem só responde quando o agente expõe API confiável.
  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    const probe = () => setHasAudio(detectVideoAudioTrack(video));
    probe();
    video.addEventListener('loadedmetadata', probe);
    video.addEventListener('loadeddata', probe);
    return () => {
      video.removeEventListener('loadedmetadata', probe);
      video.removeEventListener('loadeddata', probe);
    };
  }, [url]);

  const hasNoAudio = hasAudio === false;

  // Portal para document.body: ancestrais com transform (framer-motion whileHover/scale
  // nos bubbles) viram containing block de position:fixed e o fullscreen renderiza
  // dentro da própria mensagem em vez de cobrir a tela.
  return createPortal(
    <motion.div
      ref={playerRef}
      role="dialog"
      aria-modal="true"
      aria-label="Vídeo em tela cheia"
      initial={reduzirMovimento ? false : { opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={reduzirMovimento ? { opacity: 1 } : { opacity: 0 }}
      className="fixed inset-0 z-50 bg-background flex items-center justify-center"
      onClick={onClose}
      onKeyDown={handleKeyDown}
    >
      <div className="absolute top-4 right-4 flex items-center gap-2 z-10">
        <motion.div whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.95 }}>
          <MediaVolumeControl
            variant="overlay"
            playerRef={playerRef}
            disabled={hasNoAudio}
            disabledReason="Vídeo sem áudio"
          />
        </motion.div>
        <motion.div whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.95 }}>
          <Button
            variant="secondary" size="sm"
            aria-label={`Velocidade de reprodução: ${playbackRate}x`}
            className={cn("h-9 px-3 font-semibold text-xs", playbackRate < 1 && "bg-destructive/20 hover:bg-destructive/30 text-destructive")}
            onClick={(e) => { e.stopPropagation(); cycleSpeed(); }}
          >
            {playbackRate}x
          </Button>
        </motion.div>
        <motion.div whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.95 }}>
          <Button
            variant="secondary" size="icon" aria-label="Baixar" disabled className="opacity-50 cursor-not-allowed"
          >
            <Download className="w-4 h-4" />
          </Button>
        </motion.div>
        <motion.div whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.95 }}>
          <Button ref={closeButtonRef} variant="secondary" size="icon" aria-label="Fechar" onClick={onClose}>
            <X className="w-4 h-4" />
          </Button>
        </motion.div>
      </div>

      <video
        ref={videoRef} src={url} controls controlsList="nodownload" autoPlay muted={muted}
        onContextMenu={(e) => e.preventDefault()}
        onClick={(e) => e.stopPropagation()}
        onLoadedMetadata={() => { if (videoRef.current) videoRef.current.playbackRate = playbackRate; }}
        className="max-w-[90vw] max-h-[85vh] rounded-lg shadow-2xl"
        // VOL-04 — fallback do iOS. `crossOrigin="anonymous"` deixa o elemento CORS-limpo para o
        // `createMediaElementSource` do caminho WebAudio (no iOS `element.volume` é read-only e o
        // app cai no GainNode); sem ele a URL assinada cross-origin lança SecurityError, o catch de
        // mediaVolumeElement.ts o engole e o controle de volume vira um no-op silencioso.
        // `playsInline` impede o iOS de sequestrar o vídeo para o player nativo — é o que mantém o
        // `MediaVolumeControl` do app visível e operante.
        crossOrigin="anonymous"
        playsInline
      />
    </motion.div>,
    document.body,
  );
}
