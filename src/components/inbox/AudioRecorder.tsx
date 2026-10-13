import { useState, useRef, useEffect, useCallback } from 'react';
import { motion, useMotionValue, useTransform } from 'framer-motion';
import { Button } from '@/components/ui/button';
import { Mic, Square, X, Send, Pause, Play, Lock, Trash2, RotateCcw, AlertTriangle } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useAudioRecorder, levelBufferToHeights, sendWithBackoff } from '@/hooks/communication/useAudioRecorder';
import { useMediaElementVolume } from '@/hooks/communication/useMediaElementVolume';
import { VoiceChanger } from './VoiceChanger';
import { useIsMobile } from '@/hooks/ui/use-mobile';

interface AudioRecorderProps {
  onSend: (audioBlob: Blob) => void | Promise<unknown>;
  onCancel: () => void;
}

// Alturas do waveform de gravacao. Antes eram sorteadas com `Math.random()` dentro do render
// (regra react-hooks/purity): alem de impuro, o sorteio acontecia a cada re-render — e o timer da
// gravacao re-renderiza a cada segundo — entao as barras trocavam de tamanho no meio da gravacao.
// Os valores sao fixos por barra: o pulso (4 -> altura -> 4) continua, sem jitter e sem render impuro.
// Servem de reserva quando nao ha analisador de audio (jsdom, navegador sem AudioContext).
const ALTURAS_WAVEFORM = [
  8, 14, 22, 10, 26, 16, 6, 20, 12, 24,
  18, 9, 15, 27, 11, 19, 7, 23, 13, 21,
  17, 10, 25, 14, 8, 22, 16, 12, 20, 9,
];

/** Quantidade de barras do waveform. */
const BARS = ALTURAS_WAVEFORM.length;
/** Passo da amostragem do nível de áudio: 10 quadros por segundo de waveform. */
const LEVEL_SAMPLE_MS = 100;

export function AudioRecorder({ onSend, onCancel }: AudioRecorderProps) {
  const [audioBlob, setAudioBlob] = useState<Blob | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [voiceChanged, setVoiceChanged] = useState(false);
  const [isLocked, setIsLocked] = useState(false);
  const [playbackProgress, setPlaybackProgress] = useState(0);
  const [levels, setLevels] = useState<number[]>([]);
  const [sendState, setSendState] = useState<'idle' | 'sending' | 'failed'>('idle');
  const audioRef = useRef<HTMLAudioElement | null>(null);
  // E36 — a prévia do áudio gravado é "áudio enviado" (mídia de conversa).
  useMediaElementVolume(audioRef);
  const isMobile = useIsMobile();

  // Swipe-to-cancel
  const swipeX = useMotionValue(0);
  const cancelOpacity = useTransform(swipeX, [-120, -60, 0], [1, 0.5, 0]);
  const swipeRef = useRef({ startX: 0, isSwiping: false });

  const {
    isRecording,
    isPaused,
    duration,
    audioUrl,
    startRecording,
    stopRecording,
    pauseRecording,
    resumeRecording,
    cancelRecording,
    undoDiscard,
    discardedDraft,
    discardSecondsLeft,
    recoveredDraft,
    draftChecked,
    acceptRecoveredDraft,
    dismissRecoveredDraft,
    clearDraft,
    getLevel,
    formatDuration,
  } = useAudioRecorder({
    onRecordingComplete: (blob) => setAudioBlob(blob),
    onDiscardCommitted: () => onCancel(),
  });

  // Abre o microfone só depois de olhar o disco (uma gravação órfã não pode ser
  // atropelada por uma nova). O desmonte libera a captura pelo ref real do hook —
  // nada de `cd`/closure velha — e o trecho já gravado fica como rascunho.
  const startedRef = useRef(false);
  useEffect(() => {
    if (!draftChecked || startedRef.current || recoveredDraft) return;
    startedRef.current = true;
    startRecording();
  }, [draftChecked, recoveredDraft, startRecording]);

  // Nível real do microfone: 10 amostras por segundo viram as alturas das barras.
  // Sem analisador (`getLevel()` = -1) o waveform cai no pulso fixo — o jsdom e
  // qualquer navegador sem AudioContext continuam vendo as barras, sem erro.
  useEffect(() => {
    if (!isRecording || isPaused) return;
    const tick = () => {
      const level = getLevel();
      if (level < 0) return;
      setLevels((prev) => (prev.length >= BARS ? [...prev.slice(1), level] : [...prev, level]));
    };
    tick();
    const timer = setInterval(tick, LEVEL_SAMPLE_MS);
    return () => clearInterval(timer);
  }, [getLevel, isPaused, isRecording]);

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

  const handleSend = async () => {
    if (!audioBlob || sendState === 'sending') return;
    setSendState('sending');
    const delivered = await sendWithBackoff(() => Promise.resolve(onSend(audioBlob)));
    if (!delivered) {
      // Erro definitivo: a gravação continua na tela para nova tentativa manual.
      setSendState('failed');
      return;
    }
    setSendState('idle');
    clearDraft();
  };

  const handleCancel = useCallback(() => {
    // Com áudio em andamento ou concluído, descartar abre a janela de desfazer:
    // o gravador fica na tela por 5 s e só então o dono é avisado para fechar.
    if (isRecording || audioBlob) {
      cancelRecording();
      return;
    }
    onCancel();
  }, [audioBlob, cancelRecording, isRecording, onCancel]);

  // "Descartar" da gravação recuperada: some a oferta e abre o microfone para uma nova.
  const handleDismissRecovered = useCallback(() => {
    dismissRecoveredDraft();
    startedRef.current = true;
    startRecording();
  }, [dismissRecoveredDraft, startRecording]);

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

  // Apertei espaço: pausa/retoma sem soltar o botão. Esc cancela. Só vale durante
  // a gravação e nunca com o foco num campo de texto (o espaço é do campo lá).
  useEffect(() => {
    if (!isRecording) return;
    const onKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      if (target && (target.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName))) {
        return;
      }
      if (event.code === 'Space' || event.key === ' ') {
        event.preventDefault();
        if (isPaused) resumeRecording();
        else pauseRecording();
        return;
      }
      if (event.key === 'Escape') {
        event.preventDefault();
        handleCancel();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [handleCancel, isPaused, isRecording, pauseRecording, resumeRecording]);

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

  // Alturas medidas do microfone; sem medição, `null` (o pulso fixo assume).
  const measuredHeights = levels.length > 0 ? levelBufferToHeights(levels, BARS, 4, 28) : null;

  // Anúncio para leitor de tela: pausa, descarte (com a contagem) e falha de envio.
  const announcement = discardedDraft
    ? `Gravação descartada. Desfazer disponível por ${discardSecondsLeft} segundos.`
    : sendState === 'failed'
      ? 'Não foi possível enviar o áudio. A gravação continua disponível.'
      : isRecording && isPaused
        ? 'Gravação pausada.'
        : isRecording
          ? 'Gravando.'
          : '';

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: 10 }}
      className="flex items-center gap-3 p-3 bg-inbox-panel border border-border rounded-xl relative overflow-hidden"
      onTouchStart={isRecording && isMobile ? handleTouchStart : undefined}
      onTouchMove={isRecording && isMobile ? handleTouchMove : undefined}
      onTouchEnd={isRecording && isMobile ? handleTouchEnd : undefined}
    >
      <span role="status" aria-live="polite" className="sr-only">{announcement}</span>

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

      {/* Visão do descarte: a gravação volta enquanto a janela de 5 s correr. */}
      {discardedDraft ? (
        <div className="flex-1 flex items-center gap-3">
          <span className="text-sm text-muted-foreground">Gravação descartada</span>
          <Button
            variant="outline"
            size="sm"
            onClick={undoDiscard}
            aria-label="Desfazer descarte da gravação"
          >
            <RotateCcw className="w-4 h-4 mr-1" />
            Desfazer ({discardSecondsLeft}s)
          </Button>
        </div>
      ) : recoveredDraft ? (
        <div className="flex-1 flex items-center gap-3">
          <span className="text-sm text-muted-foreground">Gravação recuperada disponível</span>
          <Button variant="outline" size="sm" onClick={acceptRecoveredDraft}>
            Usar gravação
          </Button>
          <Button variant="ghost" size="sm" onClick={handleDismissRecovered}>
            Gravar nova
          </Button>
        </div>
      ) : (
        <>
          {/* Recording indicator or playback */}
          <div className="flex-1 flex items-center gap-3">
            {isRecording ? (
              <>
                <motion.div
                  animate={isPaused ? { scale: 1 } : { scale: [1, 1.2, 1] }}
                  transition={{ duration: 1, repeat: isPaused ? 0 : Infinity }}
                  className={cn('w-3 h-3 rounded-full shrink-0', isPaused ? 'bg-muted-foreground' : 'bg-destructive')}
                />
                <div className="flex-1 flex items-center gap-2">
                  {/* Waveform visualization */}
                  <div className="h-8 flex-1 flex items-center gap-0.5" aria-hidden="true">
                    {measuredHeights
                      ? measuredHeights.map((height, i) => (
                          <div
                            key={i}
                            className={cn('w-1 rounded-full', isPaused ? 'bg-muted-foreground' : 'bg-primary')}
                            style={{ height }}
                          />
                        ))
                      : ALTURAS_WAVEFORM.map((height, i) => (
                          <motion.div
                            key={i}
                            animate={{ height: isPaused ? 4 : [4, height, 4] }}
                            transition={{ duration: 0.5, repeat: isPaused ? 0 : Infinity, delay: i * 0.02 }}
                            className={cn('w-1 rounded-full', isPaused ? 'bg-muted-foreground' : 'bg-primary')}
                          />
                        ))}
                  </div>
                  {/* Timer */}
                  <span
                    className={cn(
                      'text-sm font-mono font-medium w-14 text-right tabular-nums',
                      isPaused ? 'text-muted-foreground' : 'text-destructive',
                    )}
                  >
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
                    className={cn("h-full rounded-full transition-all", "bg-primary")}
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
            <div className="flex items-center gap-1">
              <motion.div whileHover={{ scale: 1.1 }} whileTap={{ scale: 0.9 }}>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={isPaused ? resumeRecording : pauseRecording}
                  className="text-muted-foreground hover:text-primary"
                  aria-label={isPaused ? 'Retomar gravação' : 'Pausar gravação'}
                >
                  {isPaused ? <Play className="w-4 h-4" /> : <Pause className="w-4 h-4" />}
                </Button>
              </motion.div>
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
            </div>
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
                  disabled={sendState === 'sending'}
                  aria-label={sendState === 'failed' ? 'Tentar enviar o áudio novamente' : 'Enviar áudio'}
                >
                  {sendState === 'failed' ? <AlertTriangle className="w-4 h-4" /> : <Send className="w-4 h-4" />}
                </Button>
              </motion.div>
            </div>
          ) : null}
        </>
      )}
    </motion.div>
  );
}
