import { lazy, Suspense, useCallback, useState } from 'react';
import { toast } from 'sonner';
import { VoiceCopilotFAB } from '@/components/layout/VoiceCopilotFAB';
import { useVoiceAgent } from '@/hooks/voice/useVoiceAgent';

const LazyVoiceOverlay = lazy(() => import('@/components/voice/VoiceSearchOverlayConnected'));

interface VoiceActionBridgeProps {
  /** Ativa a view pedida pelo comando de voz (o mesmo `setCurrentView` do shell). */
  onNavigate: (viewId: string) => void;
}

/**
 * Botão flutuante + overlay do assistente de voz (desktop).
 *
 * Existe separado do AppShell para ser testável: o overlay entrega cada comando
 * reconhecido a `handleVoiceAction`, e é essa ponte que precisa mudar o estado
 * da view — não apenas anunciar (R2-INB-046 / item 340).
 */
export function VoiceActionBridge({ onNavigate }: VoiceActionBridgeProps) {
  const [voiceOpen, setVoiceOpen] = useState(false);
  const { handleVoiceAction } = useVoiceAgent(onNavigate);

  const closeVoice = useCallback(() => setVoiceOpen(false), []);
  const reportError = useCallback((message: string) => {
    toast.error(message);
  }, []);

  return (
    <>
      <VoiceCopilotFAB onClick={() => setVoiceOpen(true)} />

      {voiceOpen && (
        <Suspense fallback={null}>
          <LazyVoiceOverlay
            isOpen={voiceOpen}
            onClose={closeVoice}
            onAction={handleVoiceAction}
            onError={reportError}
          />
        </Suspense>
      )}
    </>
  );
}
