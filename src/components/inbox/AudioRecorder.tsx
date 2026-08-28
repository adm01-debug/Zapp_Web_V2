import { useState, useRef, useEffect, useCallback } from 'react';
import { motion, useMotionValue, useTransform } from 'framer-motion';
import { Button } from '@/components/ui/button';
import { Mic, Square, X, Send, Pause, Play, Lock, Trash2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useAudioRecorder } from '@/hooks/communication/useAudioRecorder';
import { VoiceChanger } from './VoiceChanger';
import { useIsMobile } from '@/hooks/ui/use-mobile';

interface AudioRecorderProps {
  onSend: (audioBlob: Blob) => void;
  onCancel: () => void;
}

export function AudioRecorder({ onSend, onCancel }: AudioRecorderProps) {
  const [audioBlob, setAudioBlob] = useState<Blob | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [voiceChanged, setVoiceChanged] = useState(false);
  const [isLocked, setIsLocked] = useState(false);
  const [playbackProgress, setPlaybackProgress] = useState(0);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const isMobile = useIsMobile();
  
  // Swipe-to-cancel
  const swipeX = useMotionValue(0);
  const cancelOpacity = useTransform(swipeX, [-120, -60, 0], [1, 0.5, 0]);
  const swipeRef = useRef({ startX: 0, isSwiping: false });

  const {
    isRecording,
    duration,
    audioUrl,
    startRecording,
    stopRecording,
    cancelRecording,
    formatDuration,
  } = useAudioRecorder({
    onRecordingComplete: (blob) => setAudioBlob(blob),
  });

  useEffect(() => {
    startRecording();
    return () => cancelRecording();
  }, []);

  // Playback progress tracking
  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;
    
    const updateProgress = () => {
      if (audio.duration) {
        setPlaybackProgress((audio.currentTime / audio.duration) * 100);
      }
    };
    
    audio.addEventListener('timeupdate', updateProgress);
    return () => audio.removeEventListener('timeupdate', updateProgress);
  }, [audioUrl]);

  const handlePlayPause = () => {
    if (!audioRef.current || !audioUrl) return;
    if (isPlaying) {
      audioRef.current.pause();
    } else {
      audioRef.current.play();
    }
    setIsPlaying(!isPlaying);
  };

  const handleSend = () => {
    if (audioBlob) {
      onSend(audioBlob);
    }
  };

  const handleCancel = () => {
    cancelRecording();
    onCancel();
  };

  const handleVoiceChanged = (newBlob: Blob) => {
    setAudioBlob(newBlob);
    setVoiceChanged(true);
    if (audioRef.current) {
      const url = URL.createObjectURL(newBlob);
      audioRef.current.src = url;
    }
  };

  // Lock recording (stop holding, keep recording)
  const handleLock = useCallback(() => {
    setIsLocked(true);
  }, []);

  // Swipe-to-cancel handlers for mobile
  const handleTouchStart = (e: React.TouchEvent) => {
    swipeRef.current.startX = e.touches[0].clientX;
    swipeRef.current.isSwiping = true;
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    if (!swipeRef.current.isSwiping || !isRecording) return;
    const delta = e.touches[0].clientX - swipeRef.current.startX;
    if (delta < 0) {
      swipeX.set(delta);
    }
  };

  const handleTouchEnd = () => {
    if (swipeX.get() < -100) {
      handleCancel();
    }
    swipeX.set(0);
    swipeRef.current.isSwiping = false;
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: 10 }}
      className="flex items-center gap-3 p-3 bg-card border border-border rounded-xl relative overflow-hidden"
      onTouchStart={isRecording && isMobile ? handleTouchStart : undefined}
      onTouchMove={isRecording && isMobile ? handleTouchMove : undefined}
      onTouchEnd={isRecording && isMobile ? handleTouchEnd : undefined}
    >
      {/* Swipe-to-cancel overlay (mobile only) */}
      {isRecording && isMobile && (
        <motion.div
          style={{ opacity: cancelOpacity }}
          className="absolute inset-0 flex items-center justify-center bg-destructive/10 pointer-events-none z-10"
        >
          <div className="flex items-center gap-2 text-destructive text-sm font-medium">
            <Trash2 className="w-4 h-4" />
            Deslize para cancelar
          </div>
        </motion.div>
      )}

      {/* Cancel button */}
      <motion.div whileHover={{ scale: 1.1 }} whileTap={{ scale: 0.9 }}>
        <Button
          variant="ghost"
          size="icon"
          className="text-destructive hover:text-destructive"
          onClick={handleCancel}
          aria-label="Cancelar gravação"
        >
          <X className="w-5 h-5" />
        </Button>
      </motion.div>

      {/* Recording indicator or playback */}
      <div className="flex-1 flex items-center gap-3">
        {isRecording ? (
          <>
            <motion.div
              animate={{ scale: [1, 1.2, 1] }}
              transition={{ duration: 1, repeat: Infinity }}
              className="w-3 h-3 rounded-full bg-destructive shrink-0"
            />
            <div className="flex-1 flex items-center gap-2">
              {/* Waveform visualization */}
              <div className="h-8 flex-1 flex items-center gap-0.5">
                {Array.from({ length: 30 }).map((_, i) => (
                  <motion.div
                    key={i}
                    animate={{
                      height: [4, Math.random() * 24 + 4, 4],
                    }}
                    transition={{
                      duration: 0.5,
                      repeat: Infinity,
                      delay: i * 0.02,
                    }}
                    className="w-1 bg-primary rounded-full"
                  />
                ))}
              </div>
              {/* Timer */}
              <span className="text-sm font-mono text-destructive font-medium w-14 text-right tabular-nums">
                {formatDuration(duration)}
              </span>
            </div>
          </>
        ) : audioUrl ? (
          <>
            <Button
              variant="ghost"
              size="icon"
              onClick={handlePlayPause}
              className="text-primary shrink-0"
              aria-label={isPlaying ? 'Pausar' : 'Reproduzir'}
            >
              {isPlaying ? <Pause className="w-5 h-5" /> : <Play className="w-5 h-5" />}
            </Button>
            <audio
              ref={audioRef}
              src={audioUrl}
              onEnded={() => { setIsPlaying(false); setPlaybackProgress(0); }}
              className="hidden"
            />
            {/* Progress bar with actual playback tracking */}
            <div className="flex-1 h-2 bg-muted rounded-full overflow-hidden">
              <motion.div
                className={cn(
                  "h-full rounded-full transition-all",
                  voiceChanged ? "bg-primary" : "bg-primary"
                )}
                style={{ width: `${isPlaying ? playbackProgress : 100}%` }}
              />
            </div>
            <span className="text-sm font-mono text-muted-foreground w-14 text-right tabular-nums">
              {formatDuration(duration)}
            </span>
          </>
        ) : null}
      </div>

      {/* Lock button (during recording, mobile) */}
      {isRecording && !isLocked && isMobile && (
        <motion.div
          initial={{ opacity: 0, scale: 0.8 }}
          animate={{ opacity: 1, scale: 1 }}
          whileTap={{ scale: 0.9 }}
        >
          <Button
            variant="ghost"
            size="icon"
            className="text-muted-foreground hover:text-primary"
            onClick={handleLock}
            aria-label="Travar gravação"
          >
            <Lock className="w-4 h-4" />
          </Button>
        </motion.div>
      )}

      {/* Stop/Send controls */}
      {isRecording ? (
        <motion.div whileHover={{ scale: 1.1 }} whileTap={{ scale: 0.9 }}>
          <Button
            size="icon"
            className="bg-destructive hover:bg-destructive/90"
            onClick={stopRecording}
            aria-label="Parar gravação"
          >
            <Square className="w-4 h-4" />
          </Button>
        </motion.div>
      ) : audioBlob ? (
        <div className="flex items-center gap-1">
          <VoiceChanger
            audioBlob={audioBlob}
            onVoiceChanged={handleVoiceChanged}
          />
          <motion.div whileHover={{ scale: 1.1 }} whileTap={{ scale: 0.9 }}>
            <Button
              size="icon"
              className="bg-primary hover:bg-primary/90"
              onClick={handleSend}
              aria-label="Enviar áudio"
            >
              <Send className="w-4 h-4" />
            </Button>
          </motion.div>
        </div>
      ) : null}
    </motion.div>
  );
}
