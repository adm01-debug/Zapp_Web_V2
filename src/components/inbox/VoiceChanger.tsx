import { SUPABASE_URL, SUPABASE_ANON_KEY } from '@/integrations/supabase/client';
import { edgeAuthHeaders } from '@/lib/edgeAuthHeaders';
import { useState, useRef, useCallback } from 'react';
import { motion, AnimatePresence, useReducedMotion } from 'framer-motion';
import { Button } from '@/components/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';
import { Wand2, Loader2, Play, Square, Check, Volume2, AlertCircle } from 'lucide-react';
import { toast } from 'sonner';
import { zappTransition } from '@/lib/motion';
import { ELEVENLABS_VOICES, type ElevenLabsVoice } from './VoiceSelector';
import { attachMediaVolume } from '@/lib/mediaVolumeElement';

/** Aviso único quando o navegador recusa a reprodução automática do áudio. */
const PLAYBACK_BLOCKED = 'O navegador bloqueou a reprodução. Toque no botão de novo.';

interface VoiceChangerProps {
  audioBlob: Blob;
  onVoiceChanged: (newBlob: Blob) => void;
  disabled?: boolean;
}

export function VoiceChanger({ audioBlob, onVoiceChanged, disabled }: VoiceChangerProps) {
  const [open, setOpen] = useState(false);
  const [selectedVoice, setSelectedVoice] = useState<ElevenLabsVoice | null>(null);
  const [isConverting, setIsConverting] = useState(false);
  const [convertedAudioUrl, setConvertedAudioUrl] = useState<string | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [isPlayLoading, setIsPlayLoading] = useState(false);
  const [isConfirming, setIsConfirming] = useState(false);
  const [confirmError, setConfirmError] = useState<string | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const reduceMotion = useReducedMotion() ?? false;

  // Entrada do aviso inline: mola curta (180–260 ms) quando há movimento; com
  // movimento reduzido nada se desloca — só a opacidade muda.
  const entradaErro = reduceMotion
    ? { initial: { opacity: 0 }, animate: { opacity: 1 }, exit: { opacity: 0 }, transition: zappTransition.fast }
    : {
        initial: { opacity: 0, y: -6 },
        animate: { opacity: 1, y: 0 },
        exit: { opacity: 0, y: -6 },
        transition: { type: 'spring' as const, duration: 0.22, bounce: 0.2 },
      };

  const stopPlayback = useCallback(() => {
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current.currentTime = 0;
    }
    setIsPlaying(false);
  }, []);

  const cleanup = useCallback(() => {
    stopPlayback();
    if (convertedAudioUrl) {
      URL.revokeObjectURL(convertedAudioUrl);
      setConvertedAudioUrl(null);
    }
  }, [convertedAudioUrl, stopPlayback]);

  const handleConvert = async (voice: ElevenLabsVoice) => {
    cleanup();
    setSelectedVoice(voice);
    setIsConverting(true);

    try {
      const formData = new FormData();
      formData.append('audio', audioBlob, 'audio.webm');
      formData.append('voiceId', voice.id);

      const response = await fetch(
        `${SUPABASE_URL}/functions/v1/elevenlabs-sts`,
        {
          method: 'POST',
          headers: await edgeAuthHeaders(),
          body: formData,
        }
      );

      if (!response.ok) {
        const err = await response.json().catch(() => ({ error: 'Erro desconhecido' }));
        throw new Error(err.error || `Erro ${response.status}`);
      }

      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      setConvertedAudioUrl(url);

      // Auto-play preview
      const audio = new Audio(url);
      audioRef.current = audio;
      // E36 — prévia de voz convertida é mídia de conversa: respeita o volume global.
      const detachMediaVolume = attachMediaVolume(audio);
      audio.onended = () => { detachMediaVolume(); setIsPlaying(false); };
      audio.onerror = () => {
        detachMediaVolume();
        setIsPlaying(false);
        toast.error('Erro ao reproduzir áudio convertido');
      };
      setIsPlayLoading(true);
      try {
        await audio.play();
        setIsPlaying(true);
      } catch {
        // Reprodução recusada pelo navegador (autoplay bloqueado): desfaz o
        // estado "tocando" e avisa o usuário em vez de deixar a rejeição solta.
        detachMediaVolume();
        audioRef.current = null;
        setIsPlaying(false);
        toast.error(PLAYBACK_BLOCKED);
      } finally {
        setIsPlayLoading(false);
      }

      toast.success(`Voz convertida para ${voice.name}!`);
    } catch (error) {
      const msg = error instanceof Error ? error.message : 'Erro desconhecido';
      toast.error(`Erro ao converter voz: ${msg}`);
      setSelectedVoice(null);
    } finally {
      setIsConverting(false);
    }
  };

  const handleConfirm = async () => {
    if (!convertedAudioUrl || isConfirming) return;
    setIsConfirming(true);
    setConfirmError(null);

    try {
      // O fetch do blob e a leitura do binário podem falhar; o aviso fica na
      // própria prévia (com "Tentar de novo") e o popover continua utilizável.
      const response = await fetch(convertedAudioUrl);
      if (!response.ok) throw new Error(`Erro ${response.status}`);
      const blob = await response.blob();
      if (blob.size === 0) throw new Error('áudio convertido vazio');
      onVoiceChanged(blob);
      setOpen(false);
      cleanup();
      toast.success('Áudio com voz alterada pronto para envio!');
    } catch (error) {
      const msg = error instanceof Error ? error.message : 'Erro desconhecido';
      setConfirmError(msg);
      toast.error(`Erro ao preparar o áudio: ${msg}`);
    } finally {
      setIsConfirming(false);
    }
  };

  const togglePlayback = async () => {
    if (!audioRef.current || !convertedAudioUrl || isPlayLoading) return;
    if (isPlaying) {
      audioRef.current.pause();
      setIsPlaying(false);
      return;
    }
    setIsPlayLoading(true);
    try {
      await audioRef.current.play();
      setIsPlaying(true);
    } catch {
      setIsPlaying(false);
      toast.error(PLAYBACK_BLOCKED);
    } finally {
      setIsPlayLoading(false);
    }
  };

  return (
    <Popover open={open} onOpenChange={(v) => { setOpen(v); if (!v) cleanup(); }}>
      <PopoverTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className="w-8 h-8 text-muted-foreground hover:text-primary"
          disabled={disabled}
          title="Alterar voz com IA"
        >
          <Wand2 className="w-4 h-4" />
        </Button>
      </PopoverTrigger>
      <PopoverContent
        className="w-[min(300px,calc(100vw_-_1rem))] p-0 bg-popover border-border"
        align="end"
        side="top"
        sideOffset={8}
      >
        {/* Header */}
        <div className="flex items-center gap-2 px-3 py-2.5 border-b border-border">
          <Wand2 className="w-4 h-4 text-primary" />
          <h4 className="text-sm font-semibold text-foreground">Alterar Voz</h4>
          <span className="text-3xs text-muted-foreground ml-auto">ElevenLabs</span>
        </div>

        {/* Voice list */}
        <div className="max-h-[280px] overflow-y-auto p-1.5">
          {ELEVENLABS_VOICES.map((voice) => {
            const isSelected = selectedVoice?.id === voice.id;
            const isLoading = isConverting && isSelected;

            return (
              <motion.button
                key={voice.id}
                whileTap={{ scale: 0.98 }}
                onClick={() => !isConverting && handleConvert(voice)}
                disabled={isConverting}
                className={cn(
                  'w-full flex items-center gap-2.5 px-2.5 py-2 rounded-lg transition-colors text-left',
                  isSelected
                    ? 'bg-primary/10 border border-primary/20'
                    : 'hover:bg-muted/60 border border-transparent',
                  isConverting && !isSelected && 'opacity-50 cursor-not-allowed'
                )}
              >
                {/* Status indicator */}
                <div className={cn(
                  'w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 transition-colors',
                  isSelected ? 'bg-primary/20' : 'bg-muted'
                )}>
                  {isLoading ? (
                    <Loader2 className="w-3.5 h-3.5 text-primary animate-spin" />
                  ) : isSelected && convertedAudioUrl ? (
                    <Check className="w-3.5 h-3.5 text-primary" />
                  ) : (
                    <Volume2 className="w-3.5 h-3.5 text-muted-foreground" />
                  )}
                </div>

                {/* Voice info */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1.5">
                    <span className="text-sm font-medium text-foreground">{voice.name}</span>
                    <span className={cn(
                      'text-[9px] px-1 py-0.5 rounded',
                      voice.gender === 'female'
                        ? 'bg-destructive/10 text-destructive'
                        : 'bg-info/10 text-info'
                    )}>
                      {voice.gender === 'female' ? '♀' : '♂'}
                    </span>
                  </div>
                  <span className="text-2xs text-muted-foreground truncate block">
                    {voice.description}
                  </span>
                </div>
              </motion.button>
            );
          })}
        </div>

        {/* Footer with preview and confirm */}
        <AnimatePresence>
          {convertedAudioUrl && selectedVoice && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: 'auto', opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              className="border-t border-border overflow-hidden"
            >
              <div className="flex items-center gap-2 px-3 py-2.5">
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-10 w-10 text-foreground"
                  aria-label={isPlayLoading ? 'Carregando prévia' : isPlaying ? 'Pausar prévia' : 'Ouvir prévia'}
                  onClick={() => void togglePlayback()}
                  disabled={isPlayLoading}
                >
                  {isPlayLoading
                    ? <Loader2 className="w-3.5 h-3.5 motion-safe:animate-spin" />
                    : isPlaying
                      ? <Square className="w-3.5 h-3.5" />
                      : <Play className="w-3.5 h-3.5" />}
                </Button>
                <span className="text-xs text-muted-foreground flex-1">
                  Voz: <span className="font-medium text-foreground">{selectedVoice.name}</span>
                </span>
                <Button
                  size="sm"
                  className="h-10 text-xs bg-primary hover:bg-primary/90"
                  onClick={() => void handleConfirm()}
                  disabled={isConfirming}
                  isLoading={isConfirming}
                  loadingText="Preparando"
                >
                  Usar esta voz
                </Button>
              </div>

              {/* Erro de preparo inline: aviso curto + motivo detalhado no tooltip */}
              <AnimatePresence initial={false}>
                {confirmError && (
                  <motion.div
                    key="confirm-error"
                    data-testid="voz-erro-preparo"
                    role="alert"
                    {...entradaErro}
                    className="flex items-center gap-2 px-3 pb-2.5"
                  >
                    <AlertCircle className="w-4 h-4 text-destructive shrink-0" aria-hidden="true" />
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <span className="text-xs text-destructive flex-1 cursor-help truncate">
                          Falha ao preparar o áudio
                        </span>
                      </TooltipTrigger>
                      <TooltipContent side="top" variant="error">{confirmError}</TooltipContent>
                    </Tooltip>
                    <Button
                      size="sm"
                      variant="outline"
                      className="h-10 text-xs border-destructive/40 text-destructive hover:bg-destructive/10 hover:text-destructive"
                      onClick={() => void handleConfirm()}
                      disabled={isConfirming}
                    >
                      Tentar de novo
                    </Button>
                  </motion.div>
                )}
              </AnimatePresence>
            </motion.div>
          )}
        </AnimatePresence>
      </PopoverContent>
    </Popover>
  );
}
