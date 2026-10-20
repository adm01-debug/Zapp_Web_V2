import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { motion } from 'framer-motion';
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
  // E21 — abre no volume global (não mais em `muted` fixo): aqui o mute e o volume são
  // os MESMOS do resto do app (D2). O botão de mute local que existia nesta barra foi
  // substituído pelo `MediaVolumeControl` (E22) para não haver dois controles do mesmo.
  const { muted } = useMediaElementVolume(videoRef);

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
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-50 bg-background flex items-center justify-center"
      onClick={onClose}
    >
      <div className="absolute top-4 right-4 flex items-center gap-2 z-10">
        <motion.div whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.95 }}>
          <MediaVolumeControl
            variant="overlay"
            disabled={hasNoAudio}
            disabledReason="Vídeo sem áudio"
          />
        </motion.div>
        <motion.div whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.95 }}>
          <Button
            variant="secondary" size="sm"
            className={cn("h-9 px-3 font-semibold text-xs", playbackRate < 1 && "bg-destructive/20 hover:bg-destructive/30 text-destructive")}
            onClick={(e) => { e.stopPropagation(); cycleSpeed(); }}
          >
            {playbackRate}x
          </Button>
        </motion.div>
        <motion.div whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.95 }}>
          <Button
            variant="secondary" size="icon" disabled className="opacity-50 cursor-not-allowed"
            onClick={(e) => { e.stopPropagation(); import('sonner').then(({ toast }) => toast.error('🔒 Download bloqueado por política de segurança')); }}
          >
            <Download className="w-4 h-4" />
          </Button>
        </motion.div>
        <motion.div whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.95 }}>
          <Button variant="secondary" size="icon" onClick={onClose}>
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
      />
    </motion.div>,
    document.body,
  );
}
