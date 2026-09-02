import { useState, useRef } from 'react';
import { createPortal } from 'react-dom';
import { motion } from 'framer-motion';
import { X, Download, Volume2, VolumeX } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

interface VideoFullscreenProps {
  url: string;
  onClose: () => void;
}

export function VideoFullscreen({ url, onClose }: VideoFullscreenProps) {
  const [isMuted, setIsMuted] = useState(false);
  const [playbackRate, setPlaybackRate] = useState(1.0);
  const videoRef = useRef<HTMLVideoElement>(null);

  const cycleSpeed = () => {
    const speeds = [1, 1.25, 1.5, 1.75, 2, 0.5, 0.75];
    const nextIndex = (speeds.indexOf(playbackRate) + 1) % speeds.length;
    const newRate = speeds[nextIndex];
    setPlaybackRate(newRate);
    if (videoRef.current) videoRef.current.playbackRate = newRate;
  };

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
          <Button variant="secondary" size="icon" onClick={(e) => { e.stopPropagation(); setIsMuted(!isMuted); }}>
            {isMuted ? <VolumeX className="w-4 h-4" /> : <Volume2 className="w-4 h-4" />}
          </Button>
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
        ref={videoRef} src={url} controls controlsList="nodownload" autoPlay muted={isMuted}
        onContextMenu={(e) => e.preventDefault()}
        onClick={(e) => e.stopPropagation()}
        onLoadedMetadata={() => { if (videoRef.current) videoRef.current.playbackRate = playbackRate; }}
        className="max-w-[90vw] max-h-[85vh] rounded-lg shadow-2xl"
      />
    </motion.div>,
    document.body,
  );
}
