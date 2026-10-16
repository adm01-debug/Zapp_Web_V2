/**
 * CV-070 — VoiceDictation
 *
 * Botão + feedback visual para o ditado por voz ao RADAR.
 * O vendedor fala uma instrução e o RADAR monta a mensagem,
 * colocando-a no rascunho (nunca envia automaticamente).
 */
import { Mic, MicOff, Loader2, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { AnimatePresence, motion } from 'framer-motion';
import type { DictationState } from '@/hooks/copilot/useVoiceDictation';

export interface VoiceDictationButtonProps {
  state: DictationState;
  durationSeconds: number;
  errorMessage: string | null;
  onStart: () => void;
  onStop: () => void;
  onCancel: () => void;
  className?: string;
  /** Exibe o botão inline (compacto) ou como bloco flutuante. */
  variant?: 'inline' | 'block';
}

const STATE_LABELS: Record<DictationState, string> = {
  idle: 'Ditar para o RADAR',
  recording: 'Gravando…',
  transcribing: 'Transcrevendo…',
  generating: 'Gerando mensagem…',
  error: 'Tente novamente',
};

export function VoiceDictationButton({
  state,
  durationSeconds,
  errorMessage,
  onStart,
  onStop,
  onCancel,
  className,
  variant = 'inline',
}: VoiceDictationButtonProps) {
  const isRecording = state === 'recording';
  const isBusy = state === 'transcribing' || state === 'generating';
  const isError = state === 'error';

  const handleClick = () => {
    if (isRecording) { onStop(); return; }
    if (isBusy) return;
    onStart();
  };

  if (variant === 'block') {
    return (
      <div className={cn('flex flex-col gap-1', className)}>
        <div className="flex items-center gap-2">
          <Button
            type="button"
            variant={isRecording ? 'destructive' : isError ? 'outline' : 'secondary'}
            size="sm"
            onClick={handleClick}
            disabled={isBusy}
            className={cn(
              'gap-1.5 transition-all',
              isRecording && 'animate-pulse',
            )}
            aria-label={STATE_LABELS[state]}
          >
            {isBusy ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
            ) : isRecording ? (
              <MicOff className="w-3.5 h-3.5" />
            ) : (
              <Mic className="w-3.5 h-3.5" />
            )}
            <span className="text-xs">{STATE_LABELS[state]}</span>
            {isRecording && (
              <span className="text-xs tabular-nums">
                {Math.floor(durationSeconds / 60)}:{String(durationSeconds % 60).padStart(2, '0')}
              </span>
            )}
          </Button>
          <AnimatePresence>
            {(isRecording || isBusy) && (
              <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="w-7 h-7 rounded-full"
                  onClick={onCancel}
                  aria-label="Cancelar ditado"
                >
                  <X className="w-3.5 h-3.5" />
                </Button>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
        {isError && errorMessage && (
          <p className="text-xs text-destructive">{errorMessage}</p>
        )}
      </div>
    );
  }

  // inline: botão compacto tipo ícone
  return (
    <Button
      type="button"
      variant="ghost"
      size="icon"
      className={cn(
        'w-8 h-8 rounded-full transition-all',
        isRecording && 'text-destructive bg-destructive/10 animate-pulse',
        isBusy && 'text-muted-foreground',
        isError && 'text-warning',
        className,
      )}
      onClick={handleClick}
      disabled={isBusy}
      aria-label={STATE_LABELS[state]}
      title={STATE_LABELS[state]}
    >
      {isBusy ? (
        <Loader2 className="w-4 h-4 animate-spin" />
      ) : isRecording ? (
        <MicOff className="w-4 h-4" />
      ) : (
        <Mic className="w-4 h-4" />
      )}
    </Button>
  );
}
