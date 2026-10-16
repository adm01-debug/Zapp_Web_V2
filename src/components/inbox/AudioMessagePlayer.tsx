import { useState, useEffect, useRef, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Play, Pause, Loader2, FileText, Volume2, RefreshCw, Sparkles, CheckCircle2, AlertCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { supabase } from '@/integrations/supabase/client';
import { uniqueRealtimeTopic } from '@/lib/realtimeTopic';
import { toast } from '@/hooks/ui/use-toast';
import { cn } from '@/lib/utils';
import { log } from '@/lib/logger';
import { useAudioPlayer } from '@/hooks/communication/useAudioPlayer';
import { MediaVolumeControl } from './MediaVolumeControl';

/**
 * E17 — preferência de movimento do sistema (`prefers-reduced-motion`). Lida uma
 * vez por montagem, direto do navegador: o player não mantém estado para isso e
 * não precisa reagir a troca de preferência no meio da reprodução.
 */
function prefereReduzirMovimento(): boolean {
  return typeof window !== 'undefined' && typeof window.matchMedia === 'function'
    ? window.matchMedia('(prefers-reduced-motion: reduce)').matches
    : false;
}

interface AudioMessagePlayerProps {
  audioUrl: string;
  messageId: string;
  isSent: boolean;
  existingTranscription?: string | null;
  transcriptionStatus?: string | null;
}

export function AudioMessagePlayer({ audioUrl, messageId, isSent, existingTranscription, transcriptionStatus: initialStatus }: AudioMessagePlayerProps) {
  const [transcription, setTranscription] = useState<string | null>(existingTranscription || null);
  const [transcriptionStatus, setTranscriptionStatus] = useState<string>(initialStatus || 'pending');
  const [isTranscribing, setIsTranscribing] = useState(false);
  const [showTranscription, setShowTranscription] = useState(!!existingTranscription);
  const isMountedRef = useRef(true);
  // E16 — escopo dos atalhos: ↑/↓ e `M` valem com o foco em qualquer parte do player
  // (botão de play, barra de progresso, ...), não só no botão do volume.
  const playerRef = useRef<HTMLDivElement>(null);
  // E17 — quem pediu "reduzir movimento" no sistema não recebe animação contínua
  // (as 30 barras do waveform param de pulsar); o estado final é o mesmo.
  const reduzirMovimento = useMemo(() => prefereReduzirMovimento(), []);

  useEffect(() => {
    isMountedRef.current = true;
    return () => { isMountedRef.current = false; };
  }, []);

  // O `transcriptionStatus` chega do pai (MessageBubble repassa o da mensagem) e
  // pode mudar depois do mount (a lista atualiza); sem isto o rerender com um
  // status novo seria ignorado. Só reage à prop — o estado interno (realtime,
  // transcrição local) continua mandando enquanto a prop não muda.
  useEffect(() => {
    if (initialStatus) setTranscriptionStatus(initialStatus);
  }, [initialStatus]);

  const {
    audioRef, resolvedUrl, isPlaying, isLoading, hasError,
    playbackRate, progress, waveformHeights,
    currentTime, duration,
    togglePlay, handleSeek, cycleSpeed, formatTime, resolveAudioUrl,
  } = useAudioPlayer({ audioUrl, messageId });

  // Realtime subscription for transcription updates
  useEffect(() => {
    const channel = supabase
      .channel(uniqueRealtimeTopic(`transcription-${messageId}`))
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'messages', filter: `id=eq.${messageId}` },
        (payload) => {
          const newData = payload.new as { transcription_status?: string; transcription?: string };
          if (newData.transcription_status) setTranscriptionStatus(newData.transcription_status);
          if (newData.transcription) { setTranscription(newData.transcription); setShowTranscription(true); }
        }
      ).subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [messageId]);

  const handleTranscribe = async () => {
    if (isTranscribing || transcriptionStatus === 'processing') return;
    setIsTranscribing(true); setTranscriptionStatus('processing'); setShowTranscription(true);
    try {
      const freshUrl = await resolveAudioUrl(audioUrl);
      // PE-55/PD-64: o servidor é a ÚNICA fonte. A Edge `ai-transcribe-audio` grava
      // `transcription`/`transcription_status` com service_role (processing →
      // completed/failed) e reusa o texto em re-execução; o cliente só INVOCA e LÊ
      // (a linha da mensagem chega pelo realtime acima) — daqui não sai escrita.
      const { data, error } = await supabase.functions.invoke('ai-transcribe-audio', { body: { audioUrl: freshUrl, messageId } });
      if (error) throw error;
      if (!isMountedRef.current) return;
      if (data?.fallback) {
        setTranscriptionStatus('failed');
        toast({ title: 'Áudio não suportado', description: data.errorMessage || 'Não foi possível transcrever.', variant: 'destructive' });
        return;
      }
      const text = typeof data?.transcription === 'string' ? data.transcription.trim() : '';
      if (text) {
        setTranscription(text);
        setTranscriptionStatus('completed');
      } else {
        // Resposta sem erro e sem texto não é sucesso silencioso: sem isto o player
        // ficaria preso em "Transcrevendo..." para sempre. Falha visível.
        setTranscriptionStatus('failed');
        toast({ title: 'Erro na transcrição', description: 'Não foi possível transcrever o áudio.', variant: 'destructive' });
      }
    } catch (error) {
      log.error('Transcription error:', error);
      // Uma nova falha não apaga a transcrição já conhecida (estado verdadeiro).
      if (isMountedRef.current) setTranscriptionStatus('failed');
      toast({ title: 'Erro na transcrição', description: 'Não foi possível transcrever o áudio.', variant: 'destructive' });
    } finally { if (isMountedRef.current) setIsTranscribing(false); }
  };

  // E17 — a barra de posição é um slider de verdade: ←/→ andam 5 s (o clique já
  // existia), Home/End vão ao começo/fim. ↑/↓ NÃO entram aqui de propósito: o
  // atalho de volume do player (E16, `useVolumeRocker`) vale com o foco em
  // qualquer parte do player, inclusive neste slider, e o listener nativo dele
  // no container roda antes do `onKeyDown` do React — tratar ↑/↓ aqui também
  // moveria posição E volume na mesma tecla. O alvo é o MESMO elemento <audio>
  // que o clique move, então o tempo mostrado é o do áudio, não uma cópia do
  // componente.
  const SEEK_STEP_SECONDS = 5;
  const handleSeekKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    const audio = audioRef.current;
    if (!audio || !duration) return;
    let destino: number | null = null;
    switch (event.key) {
      case 'ArrowRight': destino = Math.min(duration, audio.currentTime + SEEK_STEP_SECONDS); break;
      case 'ArrowLeft': destino = Math.max(0, audio.currentTime - SEEK_STEP_SECONDS); break;
      case 'Home': destino = 0; break;
      case 'End': destino = duration; break;
      default: return;
    }
    event.preventDefault();
    audio.currentTime = destino;
  };

  const isProcessing = transcriptionStatus === 'processing' || isTranscribing;

  const getStatusIndicator = () => {
    switch (transcriptionStatus) {
      case 'processing':
        return (
          <motion.div initial={{ opacity: 0, scale: 0.8 }} animate={{ opacity: 1, scale: 1 }} className={cn('flex items-center gap-1.5 px-2 py-1 rounded-full text-3xs font-medium', isSent ? 'border border-primary/40 text-primary' : 'bg-primary/10 text-primary')}>
            <motion.div animate={{ rotate: 360 }} transition={{ duration: 1, repeat: Infinity, ease: 'linear' }}><Sparkles className="w-3 h-3" /></motion.div>
            <span>Transcrevendo...</span>
          </motion.div>
        );
      case 'completed':
        return transcription ? (
          <motion.div initial={{ opacity: 0, scale: 0.8 }} animate={{ opacity: 1, scale: 1 }} className={cn('flex items-center gap-1 px-2 py-1 rounded-full text-3xs font-medium', isSent ? 'bg-success/20 text-success' : 'bg-success/10 text-success')}>
            <CheckCircle2 className="w-3 h-3" /><span>Transcrito</span>
          </motion.div>
        ) : null;
      case 'failed':
        return (
          <button type="button" onClick={handleTranscribe} className={cn('flex items-center gap-1 px-2 py-1 rounded-full text-3xs font-medium cursor-pointer', isSent ? 'bg-destructive/20 text-destructive' : 'bg-destructive/10 text-destructive')}>
            <AlertCircle className="w-3 h-3" /><span>Falhou - Tentar novamente</span>
          </button>
        );
      default: return null;
    }
  };

  return (
    <div className="space-y-2" ref={playerRef}>
      <audio ref={audioRef} src={resolvedUrl || undefined} preload="metadata" crossOrigin="anonymous" />
      <div className={cn('flex items-center gap-3 p-2 rounded-lg min-w-[200px]', isSent ? 'bg-primary-foreground' : 'bg-muted/50')}>
        <motion.div whileHover={{ scale: 1.1 }} whileTap={{ scale: 0.9 }}>
          <Button variant="ghost" size="icon" aria-label={hasError ? 'Recarregar áudio' : isPlaying ? 'Pausar áudio' : 'Reproduzir áudio'} className={cn('w-10 h-10 rounded-full', hasError ? 'bg-destructive/10 hover:bg-destructive/20 text-destructive' : 'bg-primary/10 hover:bg-primary/20 text-primary')} onClick={togglePlay} disabled={isLoading}>
            {isLoading ? <Loader2 className="w-5 h-5 animate-spin" /> : hasError ? <RefreshCw className="w-5 h-5" /> : isPlaying ? <Pause className="w-5 h-5" /> : <Play className="w-5 h-5 ml-0.5" />}
          </Button>
        </motion.div>
        <div className="flex-1 space-y-1">
          <div
            role="slider"
            tabIndex={0}
            aria-label="Posição do áudio"
            aria-valuemin={0}
            aria-valuemax={Math.round(duration)}
            aria-valuenow={Math.round(currentTime)}
            aria-valuetext={`${formatTime(currentTime)} de ${duration ? formatTime(duration) : '--:--'}`}
            className="relative h-8 cursor-pointer rounded-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-1"
            onClick={handleSeek}
            onKeyDown={handleSeekKeyDown}
          >
            <div className="absolute inset-y-0 left-0 right-0 flex items-center gap-[2px]">
              {waveformHeights.map((height, i) => {
                const isActive = (i / 30) * 100 <= progress;
                return (
                  <motion.div key={i} initial={{ scaleY: 0.5 }} animate={{ scaleY: isPlaying && isActive && !reduzirMovimento ? [0.6, 1, 0.6] : 1 }}
                    transition={{ duration: 0.5, repeat: isPlaying && isActive && !reduzirMovimento ? Infinity : 0, delay: i * 0.02 }}
                    className={cn('flex-1 rounded-full transition-colors', hasError ? 'bg-destructive/30' : isActive ? 'bg-primary' : (isSent ? 'bg-primary/60' : 'bg-muted-foreground/30'))}
                    style={{ height: `${height}%` }} />
                );
              })}
            </div>
          </div>
          <div className={cn('flex justify-between text-3xs', hasError ? 'text-destructive' : isSent ? 'text-primary' : 'text-muted-foreground')}>
            {hasError ? <span>Erro ao carregar — toque para tentar</span> : <><span>{formatTime(currentTime)}</span><span>{duration ? formatTime(duration) : '--:--'}</span></>}
          </div>
        </div>
        <motion.div whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.95 }}>
          <button onClick={cycleSpeed} aria-label={`Velocidade de reprodução: ${playbackRate}x`} className={cn('h-6 px-1.5 rounded-full text-3xs font-semibold transition-colors', playbackRate < 1 ? 'bg-destructive/20 hover:bg-destructive/30 text-destructive' : 'bg-primary/10 hover:bg-primary/20 text-primary')} title="Velocidade">{playbackRate}x</button>
        </motion.div>
        <motion.div whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.95 }}>
          {/* E14 — volume das mídias entre a velocidade e a transcrição; as cores seguem
              as variantes do balão (enviado usa primary-foreground, recebido usa primary). */}
          <MediaVolumeControl
            variant="bubble"
            playerRef={playerRef}
            className={isSent ? 'text-primary hover:text-primary/80' : 'text-muted-foreground hover:text-primary'}
          />
        </motion.div>
        <motion.div whileHover={{ scale: 1.1 }} whileTap={{ scale: 0.9 }}>
          <Button variant="ghost" size="icon" aria-label={transcription ? (showTranscription ? 'Ocultar transcrição' : 'Mostrar transcrição') : 'Transcrever áudio'} className={cn('w-8 h-8 relative', showTranscription && transcription ? 'text-primary' : (isSent ? 'text-primary' : 'text-muted-foreground'))}
            onClick={() => { if (!transcription && !isProcessing) void handleTranscribe(); else setShowTranscription(!showTranscription); }} disabled={isProcessing} title={transcription ? 'Mostrar/ocultar transcrição' : 'Transcrever áudio'}>
            {isProcessing ? <Loader2 className="w-4 h-4 animate-spin" /> : <FileText className="w-4 h-4" />}
            {transcription && !showTranscription && <motion.div initial={{ scale: 0 }} animate={{ scale: 1 }} className="absolute -top-1 -right-1 w-2.5 h-2.5 rounded-full bg-success" />}
          </Button>
        </motion.div>
      </div>

      {/* E17 — a live region nasce junto com o player e fica sempre montada: uma
          região `role="status"` inserida já com o texto costuma não ser anunciada.
          O indicador entra e sai dentro dela. */}
      <div role="status">
        <AnimatePresence>
          {(transcriptionStatus === 'processing' || transcriptionStatus === 'failed') && (
            <motion.div initial={{ opacity: 0, y: -5 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -5 }}>{getStatusIndicator()}</motion.div>
          )}
        </AnimatePresence>
      </div>

      <AnimatePresence>
        {showTranscription && (
          <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }} transition={{ duration: 0.2 }}
            className={cn('rounded-lg p-3 text-xs border', isSent ? 'border-primary/30 text-primary' : 'bg-muted/50 border-border/30 text-foreground/80')}>
            {isProcessing ? (
              <div className="flex items-center gap-2">
                <motion.div animate={{ rotate: 360 }} transition={{ duration: 2, repeat: Infinity, ease: 'linear' }}><Sparkles className="w-4 h-4 text-primary" /></motion.div>
                <div className="flex-1"><p className="font-medium">Transcrevendo áudio...</p><p className="text-3xs opacity-60 mt-0.5">A IA está convertendo o áudio em texto</p></div>
                <motion.div className="flex gap-1" initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
                  {[0, 1, 2].map((i) => <motion.div key={i} className={cn('w-1.5 h-1.5 rounded-full', isSent ? 'bg-primary' : 'bg-primary/50')} animate={{ scale: [1, 1.5, 1], opacity: [0.5, 1, 0.5] }} transition={{ duration: 1, repeat: Infinity, delay: i * 0.2 }} />)}
                </motion.div>
              </div>
            ) : transcription ? (
              <div className="space-y-1">
                <div className="flex items-center gap-1.5 text-3xs opacity-60 mb-1"><Volume2 className="w-3 h-3" /><span>Transcrição</span><CheckCircle2 className="w-3 h-3 text-success ml-auto" /></div>
                <p className="leading-relaxed italic">"{transcription}"</p>
              </div>
            ) : (
              <div className="flex items-center justify-between">
                <span className="opacity-60">Transcrição não disponível</span>
                <Button variant="ghost" size="sm" className="h-6 text-xs" onClick={handleTranscribe}><RefreshCw className="w-3 h-3 mr-1" />Tentar novamente</Button>
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
