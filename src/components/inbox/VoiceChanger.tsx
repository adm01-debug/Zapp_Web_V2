import { SUPABASE_URL, SUPABASE_ANON_KEY } from '@/integrations/supabase/client';
import { useState, useRef, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Button } from '@/components/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { cn } from '@/lib/utils';
import { Wand2, Loader2, Play, Square, Check, Volume2 } from 'lucide-react';
import { toast } from 'sonner';
import { ELEVENLABS_VOICES, type ElevenLabsVoice } from './VoiceSelector';

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
  const audioRef = useRef<HTMLAudioElement | null>(null);

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
          headers: {
            'apikey': SUPABASE_ANON_KEY,
            'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
          },
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
      audio.onended = () => setIsPlaying(false);
      audio.onerror = () => {
        setIsPlaying(false);
        toast.error('Erro ao reproduzir áudio convertido');
      };
      await audio.play();
      setIsPlaying(true);

      toast.success(`Voz convertida para ${voice.name}!`);
    } catch (error) {
      const msg = error instanceof Error ? error.message : 'Erro desconhecido';
      toast.error(`Erro ao converter voz: ${msg}`);
      setSelectedVoice(null);
    } finally {
      setIsConverting(false);
    }
  };

  const handleConfirm = () => {
    if (!convertedAudioUrl) return;

    // Fetch the converted audio as blob and pass it up
    fetch(convertedAudioUrl)
      .then(r => r.blob())
      .then(blob => {
        onVoiceChanged(blob);
        setOpen(false);
        cleanup();
        toast.success('Áudio com voz alterada pronto para envio!');
      });
  };

  const togglePlayback = () => {
    if (!audioRef.current || !convertedAudioUrl) return;
    if (isPlaying) {
      audioRef.current.pause();
      setIsPlaying(false);
    } else {
      audioRef.current.play();
      setIsPlaying(true);
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
        className="w-[300px] p-0 bg-popover border-border"
        align="end"
        side="top"
        sideOffset={8}
      >
        {/* Header */}
        <div className="flex items-center gap-2 px-3 py-2.5 border-b border-border">
          <Wand2 className="w-4 h-4 text-primary" />
          <h4 className="text-sm font-semibold text-foreground">Alterar Voz</h4>
          <span className="text-[10px] text-muted-foreground ml-auto">ElevenLabs</span>
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
                  <span className="text-[11px] text-muted-foreground truncate block">
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
                  className="w-8 h-8 text-foreground"
                  onClick={togglePlayback}
                >
                  {isPlaying ? <Square className="w-3.5 h-3.5" /> : <Play className="w-3.5 h-3.5" />}
                </Button>
                <span className="text-xs text-muted-foreground flex-1">
                  Voz: <span className="font-medium text-foreground">{selectedVoice.name}</span>
                </span>
                <Button
                  size="sm"
                  className="h-7 text-xs bg-primary hover:bg-primary/90"
                  onClick={handleConfirm}
                >
                  Usar esta voz
                </Button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </PopoverContent>
    </Popover>
  );
}
