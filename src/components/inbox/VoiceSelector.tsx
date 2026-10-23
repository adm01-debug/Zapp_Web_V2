import { SUPABASE_URL } from '@/integrations/supabase/client';
import { edgeAuthHeaders } from '@/lib/edgeAuthHeaders';
import { useState, useRef } from 'react';
import { Button } from '@/components/ui/button';
import { log } from '@/lib/logger';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Volume2, Check, Play, Square, Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';
import { attachMediaVolume } from '@/lib/mediaVolumeElement';
import { guardarPreviaDeVoz, lerPreviaDeVoz } from '@/lib/voicePreviewCache';
import { LOCAL_VOICE_ID } from '@/hooks/communication/useTextToSpeech';

export interface ElevenLabsVoice {
  id: string;
  name: string;
  description: string;
  gender: 'male' | 'female';
  accent?: string;
  sampleText?: string;
}

// Top ElevenLabs voices with sample texts
export const ELEVENLABS_VOICES: ElevenLabsVoice[] = [
  { id: 'TY3h8ANhQUsJaa0Bga5F', name: 'Voz Principal', description: 'Voz padrão do sistema', gender: 'female', accent: 'Personalizada', sampleText: 'Olá! Eu sou a voz principal do sistema.' },
  { id: 'EXAVITQu4vr4xnSDxMaL', name: 'Sarah', description: 'Suave e natural', gender: 'female', accent: 'Americano', sampleText: 'Olá! Eu sou a Sarah, uma voz suave e natural.' },
  { id: 'CwhRBWXzGAHq8TQ4Fs17', name: 'Roger', description: 'Profissional e claro', gender: 'male', accent: 'Americano', sampleText: 'Olá! Eu sou o Roger, uma voz profissional e clara.' },
  { id: 'FGY2WhTYpPnrIDTdsKH5', name: 'Laura', description: 'Amigável e calorosa', gender: 'female', accent: 'Americano', sampleText: 'Olá! Eu sou a Laura, uma voz amigável e calorosa.' },
  { id: 'IKne3meq5aSn9XLyUdCD', name: 'Charlie', description: 'Casual e jovem', gender: 'male', accent: 'Australiano', sampleText: 'Olá! Eu sou o Charlie, uma voz casual e jovem.' },
  { id: 'JBFqnCBsd6RMkjVDRZzb', name: 'George', description: 'Autoritário e confiante', gender: 'male', accent: 'Britânico', sampleText: 'Olá! Eu sou o George, uma voz autoritária e confiante.' },
  { id: 'XrExE9yKIg1WjnnlVkGX', name: 'Matilda', description: 'Acolhedora e gentil', gender: 'female', accent: 'Americano', sampleText: 'Olá! Eu sou a Matilda, uma voz acolhedora e gentil.' },
  { id: 'pFZP5JQG7iQjIQuC4Bku', name: 'Lily', description: 'Elegante e sofisticada', gender: 'female', accent: 'Britânico', sampleText: 'Olá! Eu sou a Lily, uma voz elegante e sofisticada.' },
  { id: 'onwK4e9ZLuTAKqWW03F9', name: 'Daniel', description: 'Narrando e envolvente', gender: 'male', accent: 'Britânico', sampleText: 'Olá! Eu sou o Daniel, uma voz envolvente para narração.' },
  { id: 'nPczCjzI2devNBz1zQrb', name: 'Brian', description: 'Profundo e cativante', gender: 'male', accent: 'Americano', sampleText: 'Olá! Eu sou o Brian, uma voz profunda e cativante.' },
  { id: 'cgSgspJ2msm6clMCkdW9', name: 'Jessica', description: 'Expressiva e dinâmica', gender: 'female', accent: 'Americano', sampleText: 'Olá! Eu sou a Jessica, uma voz expressiva e dinâmica.' },
];

/**
 * HZ3-004-A — opção local (Web Speech do navegador). Fica FORA de `ELEVENLABS_VOICES`:
 * aquele array alimenta telas que geram áudio na Edge, e `local` não é voz do provedor.
 */
const LOCAL_VOICE_OPTION: ElevenLabsVoice = {
  id: LOCAL_VOICE_ID,
  name: 'Voz do dispositivo',
  description: 'Lê no navegador, sem enviar o texto',
  gender: 'female',
};

interface VoiceSelectorProps {
  selectedVoiceId: string;
  onVoiceChange: (voiceId: string) => void;
  className?: string;
}

export function VoiceSelector({ selectedVoiceId, onVoiceChange, className }: VoiceSelectorProps) {
  const selectedVoice =
    selectedVoiceId === LOCAL_VOICE_ID
      ? LOCAL_VOICE_OPTION
      : ELEVENLABS_VOICES.find(v => v.id === selectedVoiceId) || ELEVENLABS_VOICES[0];
  const [previewingVoiceId, setPreviewingVoiceId] = useState<string | null>(null);
  const [loadingVoiceId, setLoadingVoiceId] = useState<string | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const audioUrlRef = useRef<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  const stopPreview = () => {
    // G6: fechar o menu no meio da geração aborta o fetch — a resposta que chegar
    // depois não pode tocar por baixo da voz nova.
    abortRef.current?.abort();
    abortRef.current = null;
    setLoadingVoiceId(null);
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current.currentTime = 0;
    }
    if (audioUrlRef.current) {
      URL.revokeObjectURL(audioUrlRef.current);
      audioUrlRef.current = null;
    }
    setPreviewingVoiceId(null);
  };

  const playPreview = async (voice: ElevenLabsVoice, e: React.MouseEvent) => {
    e.stopPropagation();
    
    // If already playing this voice, stop it
    if (previewingVoiceId === voice.id) {
      stopPreview();
      return;
    }

    // Stop any current preview
    stopPreview();
    
    setLoadingVoiceId(voice.id);
    const controller = new AbortController();
    abortRef.current = controller;

    try {
      // G6: o texto de amostra é fixo, então o mesmo blob vale para a sessão
      // inteira — a MESMA voz tocada duas vezes paga uma só síntese.
      let audioBlob = lerPreviaDeVoz(voice.id);
      if (!audioBlob) {
        const response = await fetch(
          `${SUPABASE_URL}/functions/v1/elevenlabs-tts`,
          {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              ...(await edgeAuthHeaders()),
            },
            body: JSON.stringify({ 
              text: voice.sampleText || `Olá! Eu sou ${voice.name}.`,
              voiceId: voice.id
            }),
            signal: controller.signal,
          }
        );

        if (!response.ok) {
          throw new Error('Erro ao gerar preview');
        }

        audioBlob = await response.blob();
        guardarPreviaDeVoz(voice.id, audioBlob);
      }

      // O menu fechou durante a geração: o áudio atrasado não toca.
      if (controller.signal.aborted) return;

      const audioUrl = URL.createObjectURL(audioBlob);
      audioUrlRef.current = audioUrl;

      const audio = new Audio(audioUrl);
      audioRef.current = audio;
      // E36 — prévia da voz (TTS) é mídia de conversa: respeita o volume global.
      const detachMediaVolume = attachMediaVolume(audio);

      audio.onplay = () => setPreviewingVoiceId(voice.id);
      audio.onended = () => {
        detachMediaVolume();
        setPreviewingVoiceId(null);
        if (audioUrlRef.current) {
          URL.revokeObjectURL(audioUrlRef.current);
          audioUrlRef.current = null;
        }
      };
      audio.onerror = () => {
        detachMediaVolume();
        setPreviewingVoiceId(null);
        toast.error('Erro ao reproduzir preview');
      };

      await audio.play();
    } catch (error) {
      // Abortar por fechamento do menu não é erro para o usuário.
      if (controller.signal.aborted) return;
      log.error('Preview error:', error);
      toast.error('Erro ao carregar preview da voz');
    } finally {
      if (abortRef.current === controller) {
        abortRef.current = null;
        setLoadingVoiceId(null);
      }
    }
  };

  return (
    <DropdownMenu onOpenChange={(open) => { if (!open) stopPreview(); }}>
      <DropdownMenuTrigger asChild>
        <Button
          variant="outline"
          size="sm"
          className={cn("gap-2 h-8", className)}
        >
          <Volume2 className="w-3.5 h-3.5" />
          <span className="text-xs">{selectedVoice.name}</span>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-72">
        <DropdownMenuLabel className="text-xs text-muted-foreground">
          Voz da leitura
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem
          onClick={() => onVoiceChange(LOCAL_VOICE_ID)}
          className="flex items-center justify-between cursor-pointer py-2.5"
        >
          <div className="flex flex-col min-w-0">
            <span className="font-medium text-sm">{LOCAL_VOICE_OPTION.name}</span>
            <span className="text-xs text-muted-foreground truncate">{LOCAL_VOICE_OPTION.description}</span>
          </div>
          {selectedVoiceId === LOCAL_VOICE_ID && (
            <Check className="w-4 h-4 text-primary flex-shrink-0 ml-2" />
          )}
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuLabel className="text-xs text-muted-foreground flex items-center justify-between">
          <span>Vozes premium</span>
          <span className="text-3xs font-normal">Clique ▶ para ouvir</span>
        </DropdownMenuLabel>
        <p className="px-2 pb-2 text-3xs text-muted-foreground">
          Voz premium: o texto é enviado ao provedor de voz
        </p>
        <div className="max-h-[350px] overflow-y-auto">
          {ELEVENLABS_VOICES.map((voice) => {
            const isLoading = loadingVoiceId === voice.id;
            const isPlaying = previewingVoiceId === voice.id;
            
            return (
              <DropdownMenuItem
                key={voice.id}
                onClick={() => onVoiceChange(voice.id)}
                className="flex items-center justify-between cursor-pointer py-2.5"
              >
                <div className="flex items-center gap-2 flex-1 min-w-0">
                  {/* Preview button */}
                  <button
                    type="button"
                    aria-label={`Ouvir prévia da voz ${voice.name}`}
                    onClick={(e) => playPreview(voice, e)}
                    className={cn(
                      "flex-shrink-0 w-7 h-7 rounded-full flex items-center justify-center transition-colors",
                      isPlaying 
                        ? "bg-primary text-primary-foreground" 
                        : "bg-muted hover:bg-primary/20 text-muted-foreground hover:text-primary"
                    )}
                    disabled={isLoading}
                  >
                    {isLoading ? (
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    ) : isPlaying ? (
                      <Square className="w-3 h-3" />
                    ) : (
                      <Play className="w-3.5 h-3.5 ml-0.5" />
                    )}
                  </button>
                  
                  <div className="flex flex-col min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="font-medium text-sm">{voice.name}</span>
                      <span className={cn(
                        "text-3xs px-1.5 py-0.5 rounded flex-shrink-0",
                        voice.gender === 'female' 
                          ? "bg-destructive/10 text-destructive" 
                          : "bg-info/10 text-info"
                      )}>
                        {voice.gender === 'female' ? '♀' : '♂'}
                      </span>
                    </div>
                    <span className="text-xs text-muted-foreground truncate">
                      {voice.description} • {voice.accent}
                    </span>
                  </div>
                </div>
                
                {selectedVoiceId === voice.id && (
                  <Check className="w-4 h-4 text-primary flex-shrink-0 ml-2" />
                )}
              </DropdownMenuItem>
            );
          })}
        </div>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
