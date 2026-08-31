import { useState, useCallback, useRef, useEffect } from 'react';
import { useScribe, CommitStrategy } from '@elevenlabs/react';
import { motion, AnimatePresence } from 'framer-motion';
import { Mic, MicOff, Loader2, Radio } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { log } from '@/lib/logger';

interface RealtimeTranscriptionProps {
  onTranscript?: (text: string, isFinal: boolean) => void;
  onStatusChange?: (status: 'idle' | 'connecting' | 'connected' | 'error') => void;
  className?: string;
}

export function RealtimeTranscription({ 
  onTranscript, 
  onStatusChange,
  className 
}: RealtimeTranscriptionProps) {
  const [status, setStatus] = useState<'idle' | 'connecting' | 'connected' | 'error'>('idle');
  const tokenRef = useRef<string | null>(null); const connectingRef = useRef(false);

  const scribe = useScribe({
    modelId: 'scribe_v2_realtime',
    commitStrategy: CommitStrategy.VAD, // Use VAD for automatic speech detection
    onPartialTranscript: (data) => {
      log.debug('Partial transcript:', data.text);
      onTranscript?.(data.text, false);
    },
    onCommittedTranscript: (data) => {
      log.debug('Committed transcript:', data.text);
      onTranscript?.(data.text, true);
    },
    onCommittedTranscriptWithTimestamps: (data) => {
      log.debug('Committed with timestamps:', data.text, data.words);
    },
  });

  // Update status when connection state changes
  useEffect(() => {
    if (scribe.isConnected) {
      setStatus('connected');
      onStatusChange?.('connected');
    }
  }, [scribe.isConnected, onStatusChange]);

  const handleStart = useCallback(async () => {
    if (connectingRef.current || scribe.isConnected) return;
    connectingRef.current = true;
    setStatus('connecting');
    onStatusChange?.('connecting');

    try {
      // Get token from edge function
      const { data, error } = await supabase.functions.invoke('elevenlabs-scribe-token');

      if (error) {
        const errMsg = error?.message || String(error);
        const isAuthError = errMsg.includes('401') || errMsg.toLowerCase().includes('invalid');
        throw new Error(isAuthError 
          ? 'Chave da ElevenLabs inválida. Atualize nas configurações.' 
          : errMsg);
      }

      if (!data?.token) {
        throw new Error('Token de transcrição não recebido');
      }

      tokenRef.current = data.token;
      log.debug('Token received, connecting to ElevenLabs...');

      // Connect with microphone
      await scribe.connect({
        token: data.token,
        microphone: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        },
      });

      toast.success('Transcrição em tempo real ativada');
    } catch (error) {
      log.error('Failed to start realtime transcription:', error);
      setStatus('error');
      onStatusChange?.('error');
      toast.error('Erro ao iniciar transcrição em tempo real');
    } finally {
      connectingRef.current = false;
    }
  }, [scribe, onStatusChange]);

  const handleStop = useCallback(() => {
    scribe.disconnect();
    setStatus('idle');
    onStatusChange?.('idle');
    tokenRef.current = null;
    toast.info('Transcrição em tempo real desativada');
  }, [scribe, onStatusChange]);

  const isConnecting = status === 'connecting';
  const isConnected = scribe.isConnected;

  return (
    <div className={cn("flex flex-col gap-2", className)}>
      {/* Control Button */}
      <motion.div whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.95 }}>
        <Button
          variant={isConnected ? "default" : "outline"}
          size="sm"
          onClick={isConnected ? handleStop : handleStart}
          disabled={isConnecting}
          className={cn(
            "gap-2 transition-all",
            isConnected && "bg-destructive hover:bg-destructive text-primary-foreground"
          )}
        >
          {isConnecting ? (
            <>
              <Loader2 className="w-4 h-4 animate-spin" />
              Conectando...
            </>
          ) : isConnected ? (
            <>
              <MicOff className="w-4 h-4" />
              Parar STT
            </>
          ) : (
            <>
              <Mic className="w-4 h-4" />
              STT em Tempo Real
            </>
          )}
        </Button>
      </motion.div>

      {/* Live Indicator & Partial Transcript */}
      <AnimatePresence>
        {isConnected && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            className="flex flex-col gap-2"
          >
            {/* Live indicator */}
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <motion.div
                animate={{ scale: [1, 1.2, 1] }}
                transition={{ repeat: Infinity, duration: 1.5 }}
                className="w-2 h-2 rounded-full bg-destructive"
              />
              <span>Ouvindo...</span>
              <Radio className="w-3 h-3 text-destructive" />
            </div>

            {/* Partial transcript display */}
            {scribe.partialTranscript && (
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                className="p-2 rounded-lg bg-muted/50 border border-border/30 text-sm italic text-muted-foreground"
              >
                "{scribe.partialTranscript}"
              </motion.div>
            )}

            {/* Committed transcripts */}
            {scribe.committedTranscripts.length > 0 && (
              <div className="space-y-1 max-h-32 overflow-y-auto">
                {scribe.committedTranscripts.slice(-3).map((t) => (
                  <motion.div
                    key={t.id}
                    initial={{ opacity: 0, x: -10 }}
                    animate={{ opacity: 1, x: 0 }}
                    className="p-2 rounded-lg bg-primary/10 border border-primary/20 text-sm"
                  >
                    {t.text}
                  </motion.div>
                ))}
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
