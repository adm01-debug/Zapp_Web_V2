import { SUPABASE_URL, SUPABASE_ANON_KEY } from '@/integrations/supabase/client';
import { useState, useRef, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Button } from '@/components/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';
import { AudioLines, Loader2, Play, Square, Send, Volume2 } from 'lucide-react';
import { toast } from 'sonner';
import { ELEVENLABS_VOICES, type ElevenLabsVoice } from './VoiceSelector';

interface TextToAudioButtonProps {
  inputValue: string;
  onAudioReady: (blob: Blob) => void;
  disabled?: boolean;
}

export function TextToAudioButton({ inputValue, onAudioReady, disabled }: TextToAudioButtonProps) {
  const [open, setOpen] = useState(false);
  const [selectedVoice, setSelectedVoice] = useState<ElevenLabsVoice | null>(null);
  const [isConverting, setIsConverting] = useState(false);
  const [convertedBlob, setConvertedBlob] = useState<Blob | null>(null);
  const [convertedUrl, setConvertedUrl] = useState<string | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  const cleanup = useCallback(() => {
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current.currentTime = 0;
    }
    setIsPlaying(false);
    if (convertedUrl) {
      URL.revokeObjectURL(convertedUrl);
    }
    setConvertedUrl(null);
    setConvertedBlob(null);
    setSelectedVoice(null);
  }, [convertedUrl]);

  const handleConvert = async (voice: ElevenLabsVoice) => {
    if (!inputValue.trim()) {
      toast.error('Digite uma mensagem primeiro');
      return;
    }

    // Cleanup previous
    if (audioRef.current) {
      audioRef.current.pause();
    }
    if (convertedUrl) URL.revokeObjectURL(convertedUrl);
    setConvertedUrl(null);
    setConvertedBlob(null);
    setSelectedVoice(voice);
    setIsConverting(true);

    try {
      const response = await fetch(
        `${SUPABASE_URL}/functions/v1/elevenlabs-tts`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'apikey': SUPABASE_ANON_KEY,
            'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
          },
          body: JSON.stringify({
            text: inputValue.trim(),
            voiceId: voice.id,
          }),
        }
      );

      if (!response.ok) {
        const err = await response.json().catch(() => ({ error: 'Erro desconhecido' }));
        throw new Error(err.error || `Erro ${response.status}`);
      }

      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      setConvertedBlob(blob);
      setConvertedUrl(url);

      // Auto-play preview
      const audio = new Audio(url);
      audioRef.current = audio;
      audio.onended = () => setIsPlaying(false);
      audio.onerror = () => {
        setIsPlaying(false);
        toast.error('Erro ao reproduzir preview');
      };
      await audio.play();
      setIsPlaying(true);

      toast.success(`Áudio gerado com a voz ${voice.name}!`);
    } catch (error) {
      const msg = error instanceof Error ? error.message : 'Erro desconhecido';
      toast.error(`Erro ao gerar áudio: ${msg}`);
      setSelectedVoice(null);
    } finally {
      setIsConverting(false);
    }
  };

  const handleSendAudio = () => {
    if (!convertedBlob) return;
    onAudioReady(convertedBlob);
    setOpen(false);
    cleanup();
    toast.success('Áudio enviado!');
  };

  const togglePlayback = () => {
    if (!audioRef.current || !convertedUrl) return;
    if (isPlaying) {
      audioRef.current.pause();
      setIsPlaying(false);
    } else {
      audioRef.current.play();
      setIsPlaying(true);
    }
  };

  const hasText = inputValue.trim().length > 0;

  return (
    <Tooltip>
      <Popover open={open} onOpenChange={(v) => { setOpen(v); if (!v) cleanup(); }}>
        <TooltipTrigger asChild>
          <PopoverTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              className={cn(
                "w-9 h-9 shrink-0 transition-colors",
                hasText
                  ? "text-primary hover:text-primary hover:bg-primary/10"
                  : "text-muted-foreground hover:text-foreground hover:bg-muted"
              )}
              disabled={disabled || !hasText}
              aria-label="Texto para Áudio (TTS)"
            >
              <AudioLines className="w-[18px] h-[18px]" />
            </Button>
          </PopoverTrigger>
        </TooltipTrigger>
        <TooltipContent side="top">Texto para Áudio (TTS)</TooltipContent>
      <PopoverContent
        className="w-[300px] p-0 bg-popover border-border"
        align="end"
        side="top"
        sideOffset={8}
      >
        {/* Header */}
        <div className="flex items-center gap-2 px-3 py-2.5 border-b border-border">
          <AudioLines className="w-4 h-4 text-primary" />
          <h4 className="text-sm font-semibold text-foreground">Enviar como Áudio</h4>
          <span className="text-[10px] text-muted-foreground ml-auto">ElevenLabs</span>
        </div>

        {/* Text preview */}
        <div className="px-3 py-2 border-b border-border bg-muted/30">
          <p className="text-xs text-muted-foreground line-clamp-2">
            "{inputValue.trim().substring(0, 120)}{inputValue.trim().length > 120 ? '...' : ''}"
          </p>
        </div>

        {/* Voice list */}
        <div className="max-h-[240px] overflow-y-auto p-1.5">
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
                <div className={cn(
                  'w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 transition-colors',
                  isSelected ? 'bg-primary/20' : 'bg-muted'
                )}>
                  {isLoading ? (
                    <Loader2 className="w-3.5 h-3.5 text-primary animate-spin" />
                  ) : (
                    <Volume2 className="w-3.5 h-3.5 text-muted-foreground" />
                  )}
                </div>
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

        {/* Footer */}
        <AnimatePresence>
          {convertedUrl && selectedVoice && (
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
                  className="h-7 text-xs bg-primary hover:bg-primary/90 gap-1"
                  onClick={handleSendAudio}
                >
                  <Send className="w-3 h-3" />
                  Enviar Áudio
                </Button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </PopoverContent>
      </Popover>
    </Tooltip>
  );
}
