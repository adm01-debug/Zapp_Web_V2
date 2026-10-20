import { useVoiceAgent, type VoiceAgentAction } from '@/hooks/communication/useVoiceAgent';
import { VoiceSearchOverlay } from './VoiceSearchOverlay';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  onAction?: (action: VoiceAgentAction) => void;
  onError?: (msg: string) => void;
}

function VoiceSearchOverlayConnected({ isOpen, onClose, onAction, onError }: Props) {
  const voice = useVoiceAgent({ onAction, onError });

  return (
    <VoiceSearchOverlay
      isOpen={isOpen}
      phase={voice.phase}
      partialTranscript={voice.partialTranscript}
      finalTranscript={voice.finalTranscript}
      agentResponse={voice.agentResponse}
      error={voice.error}
      onClose={() => { onClose(); voice.reset(); }}
      onStartListening={voice.startListening}
      onStopListening={voice.stopListening}
      onStopSpeaking={voice.stopSpeaking}
    />
  );
}

export default VoiceSearchOverlayConnected;
