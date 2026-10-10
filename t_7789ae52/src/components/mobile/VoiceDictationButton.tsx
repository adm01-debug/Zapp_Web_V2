import { Mic, MicOff } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { cn } from '@/lib/utils';
import { useSpeechToText } from '@/hooks/communication/useSpeechToText';
import { Button } from '@/components/ui/button';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';

interface VoiceDictationButtonProps {
  onTranscript: (text: string) => void;
  className?: string;
  disabled?: boolean;
}

export function VoiceDictationButton({ onTranscript, className, disabled }: VoiceDictationButtonProps) {
  const { isListening, isSupported, transcript, toggleListening } = useSpeechToText({
    language: 'pt-BR',
    continuous: false,
    onResult: (text) => {
      onTranscript(text);
    },
  });

  if (!isSupported) return null;

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          onClick={toggleListening}
          disabled={disabled}
          className={cn(
            'relative w-8 h-8 rounded-full transition-all',
            isListening && 'bg-destructive/15 text-destructive hover:bg-destructive/25',
            className
          )}
          aria-label={isListening ? 'Parar ditado' : 'Ditar mensagem'}
        >
          <AnimatePresence mode="wait">
            {isListening ? (
              <motion.div
                key="listening"
                initial={{ scale: 0.8, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                exit={{ scale: 0.8, opacity: 0 }}
                transition={{ duration: 0.15 }}
              >
                <MicOff className="w-4 h-4" />
              </motion.div>
            ) : (
              <motion.div
                key="idle"
                initial={{ scale: 0.8, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                exit={{ scale: 0.8, opacity: 0 }}
                transition={{ duration: 0.15 }}
              >
                <Mic className="w-4 h-4" />
              </motion.div>
            )}
          </AnimatePresence>

          {/* Pulse ring when listening */}
          {isListening && (
            <motion.span
              className="absolute inset-0 rounded-full border-2 border-destructive/40"
              animate={{ scale: [1, 1.4, 1], opacity: [0.6, 0, 0.6] }}
              transition={{ duration: 1.5, repeat: Infinity, ease: 'easeInOut' }}
            />
          )}
        </Button>
      </TooltipTrigger>
      <TooltipContent side="top">
        {isListening ? 'Parar ditado por voz' : 'Ditar por voz'}
      </TooltipContent>
    </Tooltip>
  );
}
